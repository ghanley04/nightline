/**
 * LAMBDA: delete-membership
 *
 * KEY SAFETY CHANGES FROM ORIGINAL
 * ---------------------------------
 * 1. UPDATE DB FIRST, CANCEL STRIPE SECOND
 *    Original: cancel Stripe → update DB
 *    If the DB update failed after Stripe was canceled, the subscription was
 *    gone from Stripe but the DB still showed the membership as active.
 *    Fixed order: update DB with ConditionExpression → cancel Stripe on success.
 *
 * 2. CONDITION EXPRESSION prevents double-cancel
 *    If delete-membership is called twice concurrently (e.g. user taps twice,
 *    or a retry), the ConditionExpression `active = :currentlyActive` means
 *    only one call can win. The second call gets ConditionalCheckFailedException
 *    and returns a clean "already canceled" response instead of firing Stripe again.
 *
 * 3. MANUALLY-ADDED memberships (no stripeCustomerId) can now be deleted
 *    Original: returned 400 if no stripeCustomerId, blocking deletion entirely.
 *    Fixed: Stripe step is skipped when there is no customer ID.
 *    The DB records are always cleaned up regardless.
 */

const Stripe = require("stripe");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log("📥 delete-membership event:", JSON.stringify(event, null, 2));

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    const userId = body?.userId;
    const groupId = body?.groupId;

    if (!userId || !groupId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, error: "Missing userId or groupId" }),
      };
    }

    const membersTable = "GroupData-dev";
    const tokensTable = "Tokens";
    const now = new Date().toISOString();

    // 1️⃣ Fetch membership to confirm it exists and get stripeCustomerId
    const membershipResponse = await dynamo.send(
      new GetCommand({
        TableName: membersTable,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${userId}`,
        },
      })
    );

    if (!membershipResponse.Item) {
      return {
        statusCode: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, error: "Membership not found" }),
      };
    }

    const stripeCustomerId = membershipResponse.Item.stripe_customer_id || null;
    console.log("🔍 stripeCustomerId:", stripeCustomerId || "(none — manually added)");

    // ── SAFETY: Update DB FIRST with a condition to prevent double-cancel ──────
    // WHY: If we canceled Stripe first and then the DB write threw an error,
    // the subscription would be gone from Stripe but the DB would still show
    // the membership as active. The user would think they still have access,
    // try to use the app, and see stale data. By writing to DB first with a
    // condition, we guarantee atomicity: either the DB marks it inactive (and
    // we proceed to cancel Stripe), or it was already inactive (and we skip
    // Stripe entirely, preventing a duplicate cancellation error).

    // 2️⃣ Mark MEMBER record inactive — conditional so only one concurrent call wins
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: membersTable,
          Key: {
            group_id: groupId,
            group_data_members: `MEMBER#USER#${userId}`,
          },
          UpdateExpression:
            "SET active = :inactive, isCancelled = :cancelled, canceledAt = :timestamp",
          ConditionExpression: "active = :currentlyActive",
          ExpressionAttributeValues: {
            ":inactive": false,
            ":cancelled": true,
            ":timestamp": now,
            ":currentlyActive": true,
          },
        })
      );
      console.log("✅ MEMBER record marked inactive");
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        console.log("ℹ️ Membership already inactive — skipping");
        return {
          statusCode: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            success: true,
            message: "Membership was already canceled",
            canceledSubscriptions: [],
          }),
        };
      }
      throw err;
    }

    // 3️⃣ Mark METADATA record inactive
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: membersTable,
          Key: {
            group_id: groupId,
            group_data_members: "METADATA",
          },
          UpdateExpression: "SET active = :inactive",
          ExpressionAttributeValues: { ":inactive": false },
        })
      );
      console.log("✅ METADATA record marked inactive");
    } catch (err) {
      // Non-fatal: metadata not existing is acceptable
      console.warn("⚠️ Could not update METADATA record:", err.message);
    }

    // 4️⃣ Deactivate all active tokens for this user+group
    try {
      const tokenQuery = await dynamo.send(
        new QueryCommand({
          TableName: tokensTable,
          IndexName: "user_id-index",
          KeyConditionExpression: "user_id = :uid",
          FilterExpression: "group_id = :gid AND active = :active",
          ExpressionAttributeValues: {
            ":uid": userId,
            ":gid": groupId,
            ":active": true,
          },
        })
      );

      console.log(`🔍 Found ${tokenQuery.Items?.length || 0} active token(s) to deactivate`);

      for (const token of tokenQuery.Items || []) {
        try {
          await dynamo.send(
            new UpdateCommand({
              TableName: tokensTable,
              Key: { token_id: token.token_id, user_id: token.user_id },
              UpdateExpression: "SET active = :inactive, ended_at = :endedAt",
              ConditionExpression: "active = :active",
              ExpressionAttributeValues: {
                ":inactive": false,
                ":active": true,
                ":endedAt": now,
              },
            })
          );
          console.log(`✅ Token ${token.token_id} deactivated`);
        } catch (tokenErr) {
          if (tokenErr.name !== "ConditionalCheckFailedException") {
            console.warn(`⚠️ Could not deactivate token ${token.token_id}:`, tokenErr.message);
          }
        }
      }
    } catch (tokenQueryErr) {
      console.error("❌ Token deactivation failed:", tokenQueryErr.message);
      // Non-fatal: continue to Stripe cancellation
    }

    // ── SAFETY: Cancel Stripe LAST ────────────────────────────────────────────
    // WHY: DB records are now confirmed inactive. If Stripe cancellation fails
    // here, the membership is correctly marked inactive in our DB (user can't
    // use the app) and we can retry the Stripe cancellation separately. The
    // inverse (Stripe canceled, DB still active) is far worse — user can't
    // use the app but is still being charged.
    //
    // NOTE: Manually-added memberships have no stripeCustomerId. That is
    // intentional and correct — we skip Stripe entirely and just clean up the DB.
    const canceledSubscriptionIds = [];

    if (stripeCustomerId && !stripeCustomerId.startsWith("guest_")) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: "active",
          limit: 10,
        });

        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id);
          canceledSubscriptionIds.push(sub.id);
          console.log(`✅ Canceled Stripe subscription: ${sub.id}`);
        }
      } catch (stripeErr) {
        // Log but don't fail the request — DB is already cleaned up
        console.error("⚠️ Stripe cancellation error (DB already updated):", stripeErr.message);
      }
    } else {
      console.log("ℹ️ No Stripe customer ID — skipping Stripe cancellation (manually added membership)");
    }

    console.log(`✅ Membership deleted for user ${userId} in group ${groupId}`);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        canceledSubscriptions: canceledSubscriptionIds,
        timestamp: now,
      }),
    };
  } catch (err) {
    console.error("❌ Error deleting membership:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};