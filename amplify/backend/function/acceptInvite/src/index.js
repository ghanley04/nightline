/**
 * LAMBDA: accept-invite
 *
 * FIX INCLUDED:
 * - Users with an inactive/cancelled membership can rejoin
 * - "already a member" only triggers if membership.active === true
 * - If prior membership exists but is inactive, it is reactivated
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

// Give one seat back to a group's counters when a member switches OUT of it
// (i.e. leaves the old Greek group to join a new one). This is the inverse of
// the join increment below, keeping the old group's "X of Y seats used"
// accurate after a switch.
//
//   - INVITE#<code>.current_uses → -1 (floored at 0); reopens the invite
//     (used=false) if it drops back below max_uses.
//   - METADATA.current_uses      → -1 (floored at 0).
//
// Floored everywhere so a double-fire can never push a counter negative.
async function releaseSeat(tableName, groupId, now) {
  // 1. INVITE row
  try {
    const resp = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression:
          "group_id = :gid AND begins_with(group_data_members, :prefix)",
        FilterExpression: "active = :true",
        ExpressionAttributeValues: {
          ":gid": groupId,
          ":prefix": "INVITE#",
          ":true": true,
        },
      })
    );
    const invites = resp.Items || [];
    const target =
      invites.find((inv) => Number(inv.current_uses || 0) > 0) || invites[0];
    if (target) {
      const curr = Number(target.current_uses || 0);
      const max = Number(target.max_uses || 0);
      const next = Math.max(0, curr - 1);
      const reopen = max > 0 && next < max;
      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            group_id: target.group_id,
            group_data_members: target.group_data_members,
          },
          UpdateExpression:
            "SET current_uses = :next, used = :used, update_at = :now",
          ExpressionAttributeValues: {
            ":next": next,
            ":used": reopen ? false : target.used === true,
            ":now": now,
          },
        })
      );
      console.log(
        `↩️ [ACCEPT_INVITE] INVITE ${target.group_data_members} current_uses ${curr} → ${next}${
          reopen ? " (reopened)" : ""
        }`
      );
    }
  } catch (e) {
    console.warn("⚠️ [ACCEPT_INVITE] releaseSeat INVITE update failed:", e.message);
  }

  // 2. METADATA.current_uses
  try {
    const meta = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { group_id: groupId, group_data_members: "METADATA" },
      })
    );
    const curr = Number(meta.Item?.current_uses || 0);
    const next = Math.max(0, curr - 1);
    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { group_id: groupId, group_data_members: "METADATA" },
        UpdateExpression: "SET current_uses = :next, update_at = :now",
        ExpressionAttributeValues: { ":next": next, ":now": now },
      })
    );
    console.log(
      `↩️ [ACCEPT_INVITE] METADATA current_uses ${curr} → ${next} for ${groupId}`
    );
  } catch (e) {
    console.warn("⚠️ [ACCEPT_INVITE] releaseSeat METADATA update failed:", e.message);
  }
}

exports.handler = async (event) => {
  console.log("📥 [ACCEPT_INVITE] raw event:", JSON.stringify(event, null, 2));

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }

  const {
    inviteCode,
    userId,
    userName,
    email,
    phoneNumber,
    // When the caller already saw the "you're switching Greek groups" warning
    // and the user tapped "Yes, switch", the frontend re-POSTs with this flag
    // set to true. Without it, we return 409 GREEK_MEMBERSHIP_EXISTS so the
    // frontend can show the warning dialog first.
    confirmSwitch,
  } = body;

  if (!inviteCode || !userId) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Missing inviteCode or userId" }),
    };
  }

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const now = new Date().toISOString();
  const inviteRowKey = `INVITE#${inviteCode}`;
  const memberKey = `MEMBER#USER#${userId}`;

  try {
    // 1️⃣ Find invite record
    let inviteItem = null;
    let lastKey = undefined;

    do {
      const scanResult = await dynamo.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "group_data_members = :inviteKey AND active = :active",
          ExpressionAttributeValues: {
            ":inviteKey": inviteRowKey,
            ":active": true,
          },
          ExclusiveStartKey: lastKey,
        })
      );
      inviteItem = scanResult.Items?.[0];
      lastKey = scanResult.LastEvaluatedKey;
    } while (!inviteItem && lastKey);

    console.log(
      "📦 [ACCEPT_INVITE] invite item found:",
      JSON.stringify(inviteItem || null, null, 2)
    );

    if (!inviteItem) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Invite code not found or no longer active",
        }),
      };
    }

    const groupId = inviteItem.group_id;
    if (!groupId) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "Invite record missing group_id" }),
      };
    }

    // ── SUBSCRIPTION LIFECYCLE GATE ──────────────────────────────────────────
    // Reject invite acceptance if the group's subscription is no longer
    // active (read_only / suspended / deleted). The group might look alive
    // via the invite, but we don't want new members joining a workspace
    // that's effectively dead. Legacy groups without a status field are
    // treated as active (see writeGuard).
    // Co-located copy under src/shared/ (was: ../../_shared/src/writeGuard).
    const { assertGroupWritable } = require("./shared/writeGuard");
    const guard = await assertGroupWritable(groupId);
    if (!guard.ok) {
      return guard.response;
    }

    // 2️⃣ Fetch group metadata
    const metadataResp = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { group_id: groupId, group_data_members: "METADATA" },
      })
    );

    if (!metadataResp.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Group metadata not found" }),
      };
    }

    // ✅ ADD THIS HERE
    if (!metadataResp.Item.active) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: "This group is no longer active",
        }),
      };
    }

    const planType = metadataResp.Item.plan_type || "group";
    const stripeCustomerId =
      metadataResp.Item.stripe_customer_id || inviteItem.stripe_customer_id || null;

    // 3️⃣ Check if already a member of THIS group
    const existingMembership = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          group_id: groupId,
          group_data_members: memberKey,
        },
      })
    );

    const membershipItem = existingMembership.Item || null;

    // Only block if the membership is ACTIVE
    if (membershipItem && membershipItem.active === true) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: true,
          alreadyMember: true,
          message: "User is already an active member of this group",
          groupId,
        }),
      };
    }

    // 3.5️⃣ Greek exclusivity — one active Greek membership per user.
    //
    // If the user is already in another Greek group we do NOT silently switch.
    // Instead we return 409 GREEK_MEMBERSHIP_EXISTS so the frontend can show
    // a confirmation dialog ("you'll be removed from <old group> if you
    // accept this invite"). The frontend then re-POSTs with confirmSwitch=
    // true to actually perform the switch.
    //
    // Special case: if the user is the OWNER of the existing Greek group,
    // we refuse outright — leaving would orphan the admin seat on the old
    // group. They have to transfer ownership or contact billing first.
    const isGreekGroup = groupId.toLowerCase().startsWith("greek");

    if (isGreekGroup) {
      console.log(
        "🏛️ [ACCEPT_INVITE] Greek group detected — checking for existing greek memberships"
      );

      const existingMembershipsResp = await dynamo.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "user_id-index",
          KeyConditionExpression: "user_id = :uid",
          FilterExpression: "active = :true",
          ExpressionAttributeValues: {
            ":uid": userId,
            ":true": true,
          },
        })
      );

      // Filter down to *other* active Greek memberships.
      const existingGreek = (existingMembershipsResp.Items || []).filter((m) => {
        const gid = m.group_id || "";
        return (
          gid.toLowerCase().startsWith("greek") &&
          gid !== groupId &&
          m.active === true
        );
      });

      if (existingGreek.length > 0) {
        // If any of the existing memberships is owned by this user, refuse.
        const ownedMembership = existingGreek.find((m) => m.is_owner === true);
        if (ownedMembership) {
          return {
            statusCode: 409,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
              success: false,
              code: "OWNER_MUST_TRANSFER_FIRST",
              error:
                "You're the owner of another Greek group. Transfer ownership or contact billing@nightlinecomo.com before joining a new group.",
              existingGroupId: ownedMembership.group_id,
            }),
          };
        }

        // Not owner — allowed to switch, but only after explicit confirmation.
        if (!confirmSwitch) {
          // Fetch group name / chapter_name for each existing group so the
          // frontend can show a meaningful warning. Non-fatal if lookup fails.
          const existingGroups = [];
          for (const m of existingGreek) {
            let label = m.group_id;
            try {
              const gResp = await dynamo.send(
                new GetCommand({
                  TableName: tableName,
                  Key: {
                    group_id: m.group_id,
                    group_data_members: "METADATA",
                  },
                })
              );
              label =
                gResp.Item?.chapter_name ||
                gResp.Item?.group_name ||
                gResp.Item?.name ||
                m.group_id;
            } catch (e) {
              console.warn(
                `⚠️ [ACCEPT_INVITE] Could not fetch metadata for ${m.group_id}: ${e.message}`
              );
            }
            existingGroups.push({ groupId: m.group_id, groupName: label });
          }

          console.log(
            "🛑 [ACCEPT_INVITE] User already in Greek group — awaiting confirmation to switch"
          );

          return {
            statusCode: 409,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
              success: false,
              code: "GREEK_MEMBERSHIP_EXISTS",
              error:
                "You are already a member of another Greek group. Accepting this invite will remove you from your current group.",
              requiresConfirmation: true,
              existingGroups,
              newGroupId: groupId,
            }),
          };
        }

        // confirmSwitch === true → perform the switch by deactivating every
        // existing active Greek membership (member row + tokens) before the
        // rest of this lambda creates the new one.
        for (const membership of existingGreek) {
          const existingGid = membership.group_id;
          console.log(
            `🔄 [ACCEPT_INVITE] Confirmed switch — leaving existing greek group: ${existingGid}`
          );

          await dynamo.send(
            new UpdateCommand({
              TableName: tableName,
              Key: {
                group_id: existingGid,
                group_data_members: `MEMBER#USER#${userId}`,
              },
              UpdateExpression:
                "SET active = :false, isCancelled = :true, update_at = :now, switched_out_at = :now",
              ExpressionAttributeValues: {
                ":false": false,
                ":true": true,
                ":now": now,
              },
            })
          );

          const oldTokens = await dynamo.send(
            new QueryCommand({
              TableName: tokenTableName,
              IndexName: "user_id-index",
              KeyConditionExpression: "user_id = :uid",
              FilterExpression: "group_id = :gid AND active = :true",
              ExpressionAttributeValues: {
                ":uid": userId,
                ":gid": existingGid,
                ":true": true,
              },
            })
          );

          for (const token of oldTokens.Items || []) {
            await dynamo.send(
              new UpdateCommand({
                TableName: tokenTableName,
                Key: {
                  token_id: token.token_id,
                  user_id: token.user_id,
                },
                UpdateExpression:
                  "SET active = :false, ended_at = :now",
                ExpressionAttributeValues: {
                  ":false": false,
                  ":now": now,
                },
              })
            );
          }

          // Hand the seat back to the old group's counters now that this
          // user has switched out of it.
          await releaseSeat(tableName, existingGid, now);

          console.log(
            `✅ [ACCEPT_INVITE] Deactivated member + ${
              oldTokens.Items?.length || 0
            } token(s) for old Greek group ${existingGid}`
          );
        }
      }
    }

    // 4️⃣ Atomically claim a slot on the invite
    const currentUses = Number(inviteItem.current_uses || 0);
    const maxUses = Number(inviteItem.max_uses || 0);
    const newCurrentUses = currentUses + 1;
    const willBeFull = maxUses > 0 && newCurrentUses >= maxUses;

    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { group_id: groupId, group_data_members: inviteRowKey },
          UpdateExpression:
            "SET current_uses = :newUses, update_at = :now, used = :used",
          ConditionExpression:
            "active = :active AND (attribute_not_exists(max_uses) OR current_uses < max_uses)",
          ExpressionAttributeValues: {
            ":newUses": newCurrentUses,
            ":now": now,
            ":used": willBeFull,
            ":active": true,
          },
        })
      );
      console.log(`✅ [ACCEPT_INVITE] Invite slot claimed: ${newCurrentUses}/${maxUses}`);
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        console.log("⚠️ [ACCEPT_INVITE] Invite is full or inactive — race condition caught");
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            error: "This invite has reached its usage limit or is no longer active",
          }),
        };
      }
      throw err;
    }

    // 5️⃣ Write or reactivate member record
    if (membershipItem && membershipItem.active === false) {
      console.log("🔄 [ACCEPT_INVITE] Reactivating previously inactive membership");

      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            group_id: groupId,
            group_data_members: memberKey,
          },
          UpdateExpression: `
            SET active = :true,
                isCancelled = :false,
                username = :username,
                email = :email,
                phone_number = :phone,
                manually_added = :manuallyAdded,
                stripe_customer_id = :stripeCustomerId,
                update_at = :now
          `,
          ExpressionAttributeValues: {
            ":true": true,
            ":false": false,
            ":username": userName || membershipItem.username || "Unknown User",
            ":email": email || membershipItem.email || null,
            ":phone": phoneNumber || membershipItem.phone_number || null,
            ":manuallyAdded": false,
            ":stripeCustomerId": stripeCustomerId,
            ":now": now,
          },
        })
      );
    } else {
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            group_id: groupId,
            group_data_members: memberKey,
            user_id: userId,
            username: userName || "Unknown User",
            email: email || null,
            phone_number: phoneNumber || null,
            active: true,
            is_owner: false,
            isCancelled: false,
            manually_added: false,
            created_at: now,
            update_at: now,
            stripe_customer_id: stripeCustomerId,
          },
        })
      );
    }

    console.log("✅ [ACCEPT_INVITE] Member record written/reactivated");

    // 6️⃣ Write token record
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(
      new PutCommand({
        TableName: tokenTableName,
        Item: {
          token_id: tokenId,
          user_id: userId,
          group_id: groupId,
          stripe_customer_id: stripeCustomerId,
          email: email || null,
          phone_number: phoneNumber || null,
          plan_type: planType,
          is_owner: false,
          active: true,
          manually_added: false,
          created_at: now,
          update_at: now,
          username: userName || "Unknown User",
        },
      })
    );
    console.log("✅ [ACCEPT_INVITE] Token record written");

    // 7️⃣ Update group metadata member count
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { group_id: groupId, group_data_members: "METADATA" },
          UpdateExpression:
            "SET current_uses = if_not_exists(current_uses, :zero) + :inc, update_at = :now",
          ExpressionAttributeValues: {
            ":inc": 1,
            ":zero": 0,
            ":now": now,
          },
        })
      );
      console.log("✅ [ACCEPT_INVITE] Metadata current_uses incremented");
    } catch (err) {
      console.warn("⚠️ [ACCEPT_INVITE] Could not update metadata count:", err.message);
    }

    console.log(`✅ [ACCEPT_INVITE] User ${userId} joined group ${groupId}`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: "Successfully joined the group",
        groupId,
        userId,
        tokenId,
        rejoined: !!membershipItem,
        // True only for Greek joins where the caller had confirmed the switch
        // — lets the frontend render a different success toast ("Switched to
        // <group>") vs. a fresh-join toast.
        switched: !!(isGreekGroup && confirmSwitch),
      }),
    };
  } catch (err) {
    console.error("❌ [ACCEPT_INVITE] Error:", err);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to join group",
        details: err?.message,
      }),
    };
  }
};