/**
 * LAMBDA: manual-add-membership
 *
 * CHANGES FROM ORIGINAL
 * ---------------------
 * 1. WRITE NEW RECORDS BEFORE DEACTIVATING OLD ONES
 *    Same ordering fix as the webhook. Original code deactivated the old
 *    membership mid-loop before writing the new one. If the new PutCommand
 *    threw an error, the user had no membership at all.
 *    Fixed: collect memberships to deactivate, write all new records first,
 *    then deactivate old ones.
 *
 * 2. PutCommand FOR METADATA IS NOW CONDITIONAL
 *    Original used a plain PutCommand which silently overwrites any existing
 *    METADATA record. If you manually add the same user twice, the second
 *    call would reset max_users to whatever was passed in, losing the
 *    accumulated count from the first call.
 *    Fixed: check if METADATA exists first, then either Update (increment)
 *    or Put (create fresh).
 *
 * 3. INVITE RECORD DEACTIVATION ON OLD MEMBERSHIPS
 *    When deactivating an old membership, all INVITE# records for that group
 *    are also set to active = false. Prevents old invite links from remaining
 *    usable after a plan change.
 *
 * 4. GREEK MEMBERSHIP EXCLUSIVITY
 *    When manually adding a user to a greek group, any existing greek
 *    membership is unconditionally deactivated regardless of tier comparison.
 *    A user may only belong to one greek group at a time.
 *
 * 5. CONSISTENT FALSE DEFAULTS
 *    All new records now explicitly write isCancelled = false and
 *    is_owner = true on member/token records so no field is left undefined.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const crypto = require("crypto");
// Co-located copy — see addMembership for the deploy-time rationale.
const { computeGreekTermDates } = require("./shared/greek");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

function generateGroupId(type = "greek") {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 6);
  return `${type}_${timestamp}${random}`;
}

function getPlanTier(groupId) {
  const id = (groupId || "").toLowerCase();
  if (id.includes("individual")) return { type: "individual", tier: 1 };
  if (id.includes("group")) return { type: "group", tier: 2 };
  if (id.includes("greek")) return { type: "greek", tier: 3 };
  if (id.includes("night")) return { type: "night", tier: 0 };
  if (id.includes("bus")) return { type: "bus", tier: 0 };
  return { type: "unknown", tier: 0 };
}

async function updateIfExists({ table, key, update, values }) {
  const exists = await dynamo.send(new GetCommand({ TableName: table, Key: key }));
  if (!exists.Item) {
    console.log("ℹ️ Skipping update — record does not exist:", JSON.stringify(key));
    return false;
  }
  await dynamo.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: update,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );
  console.log("✅ Updated record:", JSON.stringify(key));
  return true;
}

// Deactivate all INVITE# records for a given group
async function deactivateGroupInvites(tableName, groupId, createdAt) {
  try {
    const inviteQuery = await dynamo.send(
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

    for (const invite of inviteQuery.Items || []) {
      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            group_id: invite.group_id,
            group_data_members: invite.group_data_members,
          },
          UpdateExpression: "SET active = :false, update_at = :now",
          ExpressionAttributeValues: { ":false": false, ":now": createdAt },
        })
      );
    }
    console.log(
      `✅ Deactivated ${inviteQuery.Items?.length || 0} invite record(s) for group: ${groupId}`
    );
  } catch (err) {
    console.warn("⚠️ Could not deactivate invite records:", err.message);
  }
}

exports.handler = async (event) => {
  console.log("📢 manual-add-membership event:", JSON.stringify(event, null, 2));

  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body || "{}");
  } catch (parseErr) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body", details: parseErr.message }),
    };
  }

  const {
    username,
    email,
    firstName,
    lastName,
    phoneNumber,
    groupType = "greek",
    maxUsers = "200",
    stripeCustomerId: inputStripeCustomerId,
  } = parsedBody;

  if (!username || !email || !firstName || !lastName || !inputStripeCustomerId) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Missing required fields: username, email, firstName, lastName, stripeCustomerId",
      }),
    };
  }

  const stripeCustomerId =
    typeof inputStripeCustomerId === "string" ? inputStripeCustomerId.trim() : "";
  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const createdAt = new Date().toISOString();

  // ── Step 1: Look up Cognito user ──────────────────────────────────────────
  let cognitoUser, cognitoAttrs, actualUserId;

  try {
    cognitoUser = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
      })
    );
    cognitoAttrs = cognitoUser.UserAttributes || [];
    actualUserId = cognitoAttrs.find((a) => a.Name === "sub")?.Value || null;

    if (!actualUserId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Cognito user found but no sub/user_id present" }),
      };
    }
    console.log("✅ Cognito user found, userId:", actualUserId);
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "No Cognito user found for the provided username",
        details: err.message,
      }),
    };
  }

  // ── Step 2: Verify / save Stripe customer ID ──────────────────────────────
  try {
    const cognitoStripeId =
      cognitoAttrs.find((a) => a.Name === "custom:stripe_customer_id")?.Value?.trim() || "";

    if (stripeCustomerId) {
      if (cognitoStripeId && cognitoStripeId !== stripeCustomerId) {
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: "stripeCustomerId does not match the user's Cognito record",
            cognitoStripeCustomerId: cognitoStripeId,
            providedStripeCustomerId: stripeCustomerId,
          }),
        };
      }
      if (!cognitoStripeId) {
        await cognito.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: username,
            UserAttributes: [{ Name: "custom:stripe_customer_id", Value: stripeCustomerId }],
          })
        );
        console.log("✅ Saved stripe_customer_id to Cognito");
      }
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Cognito stripe verification/update failed",
        details: err.message,
      }),
    };
  }

  const groupId = generateGroupId(groupType);
  const newPlan = getPlanTier(groupId);
  const isNewGreek = newPlan.type === "greek";

  console.log("🆕 Generated groupId:", groupId, "plan:", newPlan.type);

  try {
    // ── Step 3: Find existing active memberships ──────────────────────────
    const membershipsQuery = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :userId",
        FilterExpression: "active = :true",
        ExpressionAttributeValues: { ":userId": actualUserId, ":true": true },
      })
    );
    const activeMemberships = membershipsQuery.Items || [];
    console.log(`📋 Found ${activeMemberships.length} active membership(s)`);

    // Collect what needs to be deactivated — don't act yet
    const membershipsToDeactivate = [];

    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id;
      const existingPlan = getPlanTier(existingGroupId);
      const existingGroupIdLower = (existingGroupId || "").toLowerCase();
      const isExistingOneTimePass =
        existingGroupIdLower.includes("night") || existingGroupIdLower.includes("bus");
      const isExistingGreek = existingGroupIdLower.startsWith("greek");

      if (existingGroupId === groupId) continue;
      if (isExistingOneTimePass) continue;

      // Greek exclusivity: new greek plan removes all existing greek memberships
      if (isNewGreek && isExistingGreek) {
        membershipsToDeactivate.push({ existingGroupId, existingPlan });
        continue;
      }

      if (
        existingPlan.type === "individual" ||
        existingPlan.type === "group" ||
        existingPlan.type === "greek"
      ) {
        if (newPlan.tier >= existingPlan.tier) {
          membershipsToDeactivate.push({ existingGroupId, existingPlan });
        } else {
          // Downgrade: reduce max_users on the higher plan
          const metadataResponse = await dynamo.send(
            new GetCommand({
              TableName: tableName,
              Key: { group_id: existingGroupId, group_data_members: "METADATA" },
            })
          );
          if (metadataResponse.Item) {
            const currentMaxUsers = parseInt(metadataResponse.Item.max_users || "1", 10);
            const newMaxUsers = Math.max(0, currentMaxUsers - 1);
            await updateIfExists({
              table: tableName,
              key: { group_id: existingGroupId, group_data_members: "METADATA" },
              update: "SET max_users = :newMax, update_at = :now",
              values: { ":newMax": newMaxUsers, ":now": createdAt },
            });
            console.log(
              `📉 Downgrade: ${existingGroupId} max_users ${currentMaxUsers} → ${newMaxUsers}`
            );
          }
        }
      }
    }

    // ── SAFETY: Write ALL new records BEFORE deactivating old ones ──────────
    // WHY: If we deactivated the old membership first and then a DB write
    // failed here, the user would have no active membership. By writing the
    // new records first, the worst case on failure is the user temporarily
    // has two memberships — far better than having none.

    // Write new MEMBER record
    // NOTE on ownership: the purchaser is both the billing owner AND the admin
    // owner at creation. These can diverge later via a Path A transfer (see
    // transferGroupOwnsership lambda). We set is_billing_owner on the member
    // record so the sendExpiryReminder lambda can find the billing owner
    // without re-reading METADATA, and is_owner is kept as the admin flag for
    // backward compatibility with existing queries.
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${actualUserId}`,
          user_id: actualUserId,
          username,
          stripe_customer_id: stripeCustomerId,
          email,
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber || null,
          created_at: createdAt,
          update_at: createdAt,
          active: true,
          isCancelled: false,
          manually_added: true,
          is_owner: true,
          is_billing_owner: true,
        },
      })
    );
    console.log("✅ New MEMBER record written");

    // Write METADATA — update if exists, create if not
    const metadataKey = { group_id: groupId, group_data_members: "METADATA" };
    const metadataCheck = await dynamo.send(
      new GetCommand({ TableName: tableName, Key: metadataKey })
    );

    if (metadataCheck.Item) {
      // Already exists — increment max_users rather than overwriting
      if (newPlan.type === "group" || newPlan.type === "greek") {
        const currentMax = parseInt(metadataCheck.Item.max_users || "0", 10);
        const newMax = currentMax + parseInt(maxUsers, 10);
        await dynamo.send(
          new UpdateCommand({
            TableName: tableName,
            Key: metadataKey,
            UpdateExpression:
              "SET max_users = :newMax, update_at = :now, active = :true, stripe_customer_id = :cid",
            ExpressionAttributeValues: {
              ":newMax": newMax,
              ":now": createdAt,
              ":true": true,
              ":cid": stripeCustomerId ,
            },
          })
        );
        console.log(`✅ METADATA updated: max_users → ${newMax}`);
      }
    } else {
      // Does not exist — create fresh.
      //
      // For Greek plans we ALSO stamp the subscription lifecycle fields:
      //   expires_at     — createdAt + 1 year (Greek is a fixed-term product)
      //   read_only_at   — same as expires_at
      //   suspended_at   — expires_at + 7 days
      //   purge_at       — suspended_at + 30 days
      //   status         — 'active'
      //   opt_out_reminders — false
      // And we track BOTH owner roles. owner_user_id / owner_username are
      // kept as the admin-owner fields for backward compatibility with existing
      // queries; billing_owner_user_id / billing_owner_username are the new
      // fields used by reminder/delete flows. On creation they point to the
      // same user; a Path A transfer diverges them.
      const metadataItem = {
        group_id: groupId,
        group_data_members: "METADATA",
        created_at: createdAt,
        update_at: createdAt,
        active: true,
        status: "active",
        max_users: parseInt(maxUsers, 10),
        plan_type: newPlan.type,
        stripe_customer_id: stripeCustomerId,
        owner_user_id: actualUserId,
        owner_username: username,
        admin_owner_user_id: actualUserId,
        admin_owner_username: username,
        billing_owner_user_id: actualUserId,
        billing_owner_username: username,
        billing_owner_email: email,
        opt_out_reminders: false,
      };

      if (newPlan.type === "greek") {
        const term = computeGreekTermDates(createdAt);
        metadataItem.expires_at = term.expiresAt;
        metadataItem.read_only_at = term.readOnlyAt;
        metadataItem.suspended_at = term.suspendedAt;
        metadataItem.purge_at = term.purgeAt;
        // Reminder bookkeeping: which windows have we already emailed the
        // billing owner about? Used by sendExpiryReminder to guarantee
        // at-most-once delivery per window even if the scheduler runs twice.
        metadataItem.reminders_sent = [];
      }

      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: metadataItem,
        })
      );
      console.log(
        "✅ METADATA record created",
        newPlan.type === "greek" ? `(Greek, expires ${metadataItem.expires_at})` : ""
      );
    }

    // Write TOKEN record
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(
      new PutCommand({
        TableName: tokenTableName,
        Item: {
          token_id: tokenId,
          user_id: actualUserId,
          username,
          group_id: groupId,
          stripe_customer_id: stripeCustomerId,
          email,
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber || null,
          plan_type: newPlan.type,
          created_at: createdAt,
          update_at: createdAt,
          active: true,
          isCancelled: false,
          manually_added: true,
          is_owner: true,
        },
      })
    );
    console.log("✅ TOKEN record written");

    // Write INVITE record for group/greek
    let inviteLink = null;
    let inviteCode = null;

    if (newPlan.type === "group" || newPlan.type === "greek") {
      inviteCode = crypto.randomBytes(6).toString("hex");
      inviteLink = `https://nightline.app/invite/${inviteCode}`;
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            group_id: groupId,
            group_data_members: `INVITE#${inviteCode}`,
            invite_code: inviteCode,
            created_by: actualUserId,
            created_by_username: username,
            created_at: createdAt,
            update_at: createdAt,
            used: false,
            invite_link: inviteLink,
            active: true,
            max_uses: parseInt(maxUsers, 10),
            current_uses: 1,
            email,
            first_name: firstName,
            last_name: lastName,
            stripe_customer_id: stripeCustomerId,
          },
        })
      );
      console.log("✅ INVITE record written:", inviteLink);
    }

    // NOW deactivate old memberships (after all new records are safely written)
    for (const { existingGroupId } of membershipsToDeactivate) {
      console.log(`🔄 Deactivating old membership: ${existingGroupId}`);

      await updateIfExists({
        table: tableName,
        key: {
          group_id: existingGroupId,
          group_data_members: `MEMBER#USER#${actualUserId}`,
        },
        update: "SET active = :false, isCancelled = :true, update_at = :now",
        values: { ":false": false, ":true": true, ":now": createdAt },
      });

      await updateIfExists({
        table: tableName,
        key: { group_id: existingGroupId, group_data_members: "METADATA" },
        update: "SET active = :false, update_at = :now",
        values: { ":false": false, ":now": createdAt },
      });

      // Deactivate all INVITE# records for the old group
      await deactivateGroupInvites(tableName, existingGroupId, createdAt);

      // Deactivate old tokens
      const oldTokensQuery = await dynamo.send(
        new QueryCommand({
          TableName: tokenTableName,
          IndexName: "user_id-index",
          KeyConditionExpression: "user_id = :userId",
          FilterExpression:
            "group_id = :oldGroup AND NOT contains(group_id, :nightStr) AND NOT contains(group_id, :busStr) AND active = :true",
          ExpressionAttributeValues: {
            ":userId": actualUserId,
            ":oldGroup": existingGroupId,
            ":nightStr": "night",
            ":busStr": "bus",
            ":true": true,
          },
        })
      );

      for (const token of oldTokensQuery.Items || []) {
        await updateIfExists({
          table: tokenTableName,
          key: { token_id: token.token_id, user_id: token.user_id },
          update: "SET active = :false, ended_at = :now",
          values: { ":false": false, ":now": createdAt },
        });
      }
    }

    console.log("✅ manual-add-membership complete");

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        inviteLink,
        inviteCode,
        stripeCustomerId: stripeCustomerId || null,
        groupId,
        message: inviteLink
          ? `Membership created with invite link for ${maxUsers} user(s)`
          : "Membership created successfully",
        planType: newPlan.type,
        username,
        userId: actualUserId,
      }),
    };
  } catch (err) {
    console.error("❌ Error in manual-add-membership:", err.message);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Internal server error", details: err.message }),
    };
  }
};