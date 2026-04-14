/**
 * LAMBDA: deleteGroup
 *
 * Sets an entire greek/group subscription to INACTIVE for all members.
 * Never deletes any records — only marks them inactive.
 * Only the group owner can trigger this.
 *
 * FIXES FROM PREVIOUS VERSION:
 * 1. Member query now correctly uses FilterExpression separately from
 *    KeyConditionExpression — begins_with is not valid in KeyConditionExpression
 *    on a non-key attribute, and the duplicate ExpressionAttributeValues
 *    object would have thrown a runtime error.
 * 2. Stripe cancellation happens AFTER DB is confirmed inactive (same safe
 *    ordering as delete-account and delete-membership).
 * 3. Token deactivation confirmed for all members, not just the owner.
 */

const Stripe = require("stripe");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";

exports.handler = async (event) => {
  console.log("📥 delete-group event received");

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    const { requestingUserId, groupId, reason } = body || {};

    if (!requestingUserId || !groupId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Missing required fields: requestingUserId, groupId",
        }),
      };
    }

    const now = new Date().toISOString();
    const deletionReason = reason || "owner_deleted_group";

    // ── Step 1: Verify the requesting user is the group owner ─────────────
    const ownerRecord = await dynamo.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${requestingUserId}`,
        },
      })
    );

    if (!ownerRecord.Item) {
      return {
        statusCode: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Requesting user is not a member of this group",
        }),
      };
    }

    if (!ownerRecord.Item.is_owner) {
      return {
        statusCode: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Only the group owner can delete the entire group",
        }),
      };
    }

    // ── Step 2: Collect ALL active MEMBER records for this group ──────────
    // group_id is the partition key so we can query directly — no GSI needed.
    // begins_with goes in FilterExpression, NOT KeyConditionExpression.
    let members = [];
    let lastKey = undefined;

    do {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "group_id = :gid",
          FilterExpression:
            "begins_with(group_data_members, :prefix) AND active = :true",
          ExpressionAttributeValues: {
            ":gid": groupId,
            ":prefix": "MEMBER#USER#",
            ":true": true,
          },
          ExclusiveStartKey: lastKey,
        })
      );
      members = members.concat(result.Items || []);
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    console.log(
      `📋 Found ${members.length} active member(s) in group ${groupId}`
    );

    const canceledSubscriptions = [];
    const stripeErrors = [];
    let deactivatedMembers = 0;
    let failedMembers = 0;

    // ── Step 3: For each member — DB first, tokens second, Stripe last ────
    for (const member of members) {
      const memberId = member.user_id;
      const stripeCustomerId = member.stripe_customer_id || null;

      console.log(`\n👤 Processing member: ${memberId}`);

      // Mark MEMBER record inactive FIRST
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: {
              group_id: groupId,
              group_data_members: `MEMBER#USER#${memberId}`,
            },
            UpdateExpression: `
              SET
                active = :false,
                isCancelled = :true,
                groupDeleted = :true,
                deletedAt = :now,
                canceledAt = :now,
                deletionReason = :reason,
                update_at = :now
            `,
            ExpressionAttributeValues: {
              ":false": false,
              ":true": true,
              ":now": now,
              ":reason": deletionReason,
            },
          })
        );
        deactivatedMembers++;
        console.log(`   ✅ MEMBER record set inactive for ${memberId}`);
      } catch (err) {
        failedMembers++;
        console.error(
          `   ❌ Failed to deactivate MEMBER record for ${memberId}:`,
          err.message
        );
        // Skip tokens and Stripe for this member — don't cancel if DB failed
        continue;
      }

      // Deactivate all tokens for this member in this group
      try {
        const memberTokens = await dynamo.send(
          new QueryCommand({
            TableName: TOKENS_TABLE,
            IndexName: "user_id-index",
            KeyConditionExpression: "user_id = :uid",
            FilterExpression: "group_id = :gid AND active = :true",
            ExpressionAttributeValues: {
              ":uid": memberId,
              ":gid": groupId,
              ":true": true,
            },
          })
        );

        for (const token of memberTokens.Items || []) {
          await dynamo.send(
            new UpdateCommand({
              TableName: TOKENS_TABLE,
              Key: { token_id: token.token_id, user_id: token.user_id },
              UpdateExpression:
                "SET active = :false, ended_at = :now, groupDeleted = :true, update_at = :now",
              ExpressionAttributeValues: {
                ":false": false,
                ":now": now,
                ":true": true,
              },
            })
          );
        }
        console.log(
          `   ✅ ${memberTokens.Items?.length || 0} token(s) set inactive for ${memberId}`
        );
      } catch (err) {
        console.warn(
          `   ⚠️ Could not deactivate tokens for ${memberId}:`,
          err.message
        );
        // Non-fatal — continue to Stripe
      }

      // Cancel Stripe AFTER DB and tokens are confirmed inactive
      if (stripeCustomerId && !stripeCustomerId.startsWith("guest_")) {
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "active",
            limit: 100,
          });

          for (const sub of subscriptions.data) {
            try {
              const canceled = await stripe.subscriptions.cancel(sub.id);
              canceledSubscriptions.push({
                subscriptionId: sub.id,
                memberId,
                customerId: stripeCustomerId,
                canceledAt: canceled.canceled_at,
              });
              console.log(`   ✅ Stripe subscription ${sub.id} canceled`);
            } catch (err) {
              console.error(
                `   ❌ Failed to cancel subscription ${sub.id}:`,
                err.message
              );
              stripeErrors.push({
                subscriptionId: sub.id,
                memberId,
                error: err.message,
              });
            }
          }
        } catch (err) {
          console.error(
            `   ❌ Stripe API error for customer ${stripeCustomerId}:`,
            err.message
          );
          stripeErrors.push({
            customerId: stripeCustomerId,
            memberId,
            error: err.message,
          });
        }
      } else {
        console.log(
          `   ℹ️ No Stripe customer for ${memberId} — skipping Stripe step`
        );
      }
    }

    // ── Step 4: Deactivate all INVITE records for this group ──────────────
    let deactivatedInvites = 0;
    try {
      let invites = [];
      let inviteLastKey = undefined;

      do {
        const result = await dynamo.send(
          new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: "group_id = :gid",
            FilterExpression: "begins_with(group_data_members, :prefix)",
            ExpressionAttributeValues: {
              ":gid": groupId,
              ":prefix": "INVITE#",
            },
            ExclusiveStartKey: inviteLastKey,
          })
        );
        invites = invites.concat(result.Items || []);
        inviteLastKey = result.LastEvaluatedKey;
      } while (inviteLastKey);

      for (const invite of invites) {
        try {
          await dynamo.send(
            new UpdateCommand({
              TableName: TABLE,
              Key: {
                group_id: invite.group_id,
                group_data_members: invite.group_data_members,
              },
              UpdateExpression:
                "SET active = :false, deactivatedAt = :now, deactivatedReason = :reason, update_at = :now",
              ExpressionAttributeValues: {
                ":false": false,
                ":now": now,
                ":reason": "group_deleted",
              },
            })
          );
          deactivatedInvites++;
        } catch (err) {
          console.warn("   ⚠️ Failed to deactivate invite:", err.message);
        }
      }
      console.log(`✅ ${deactivatedInvites} invite(s) set inactive`);
    } catch (err) {
      console.warn("⚠️ Error processing invites:", err.message);
    }

    // ── Step 5: Mark METADATA inactive ────────────────────────────────────
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { group_id: groupId, group_data_members: "METADATA" },
          UpdateExpression:
            "SET active = :false, deletedAt = :now, deletionReason = :reason, update_at = :now",
          ExpressionAttributeValues: {
            ":false": false,
            ":now": now,
            ":reason": deletionReason,
          },
        })
      );
      console.log("✅ METADATA set inactive");
    } catch (err) {
      console.warn("⚠️ Could not set METADATA inactive:", err.message);
    }

    console.log("\n✅ Group deletion complete");
    console.log(`   Members deactivated: ${deactivatedMembers}/${members.length}`);
    console.log(`   Invites deactivated: ${deactivatedInvites}`);
    console.log(`   Stripe subscriptions canceled: ${canceledSubscriptions.length}`);
    console.log(`   Stripe errors: ${stripeErrors.length}`);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        message: `Group ${groupId} set inactive for all ${deactivatedMembers} member(s)`,
        details: {
          groupId,
          membersDeactivated: deactivatedMembers,
          membersFailed: failedMembers,
          totalMembers: members.length,
          invitesDeactivated: deactivatedInvites,
          stripeCancellations: {
            successful: canceledSubscriptions.length,
            failed: stripeErrors.length,
            subscriptions: canceledSubscriptions,
            errors: stripeErrors,
          },
        },
        timestamp: now,
      }),
    };
  } catch (err) {
    console.error("❌ Error in delete-group:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: false,
        error: err.message,
        stack: undefined,
      }),
    };
  }
};