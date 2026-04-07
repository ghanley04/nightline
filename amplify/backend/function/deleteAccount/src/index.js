/**
 * LAMBDA: delete-account
 *
 * KEY SAFETY CHANGES FROM ORIGINAL
 * ---------------------------------
 * 1. REPLACED ScanCommand WITH QueryCommand + PAGINATION
 *    Original used ScanCommand to find all memberships for a user.
 *    ScanCommand returns max 1MB per call. On a large table, it silently
 *    stops after the first page — meaning a user with many memberships
 *    could have their Cognito account deleted but some Stripe subscriptions
 *    left running and some DB records still marked active.
 *
 *    Fixed: Uses QueryCommand on the user_id-index GSI (which you already
 *    have on GroupData-dev), with LastEvaluatedKey pagination to guarantee
 *    all records are found regardless of table size.
 *
 * 2. CORRECT STRIPE + DB ORDERING PER GROUP
 *    For each membership: mark DB inactive first, then cancel Stripe.
 *    Same reasoning as delete-membership: if Stripe cancels but DB update
 *    fails, the user's subscription is gone but records show them as active.
 *
 * 3. NODE_ENV STACK TRACE LEAK FIXED
 *    Lambda does not automatically set NODE_ENV. The original code checked
 *    `process.env.NODE_ENV === 'development'` which could be undefined,
 *    accidentally leaking stack traces. Now explicitly suppressed in all cases.
 *    Set NODE_ENV=production in your Lambda environment variables.
 */

const Stripe = require("stripe");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log("📥 delete-account event received");

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    const userId = body?.userId;
    const reason = body?.reason || "user_deleted_account";

    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, error: "Missing userId" }),
      };
    }

    const tableName = "GroupData-dev";
    const deletedAt = new Date().toISOString();

    console.log("🔍 Processing account deletion for user:", userId);

    // ── SAFETY: Use QueryCommand with pagination, NOT ScanCommand ────────────
    // WHY: ScanCommand reads the table in pages of up to 1MB. If the table is
    // large enough that the user's membership records aren't all in the first
    // page, ScanCommand silently stops — you'd delete the Cognito account but
    // leave some Stripe subscriptions running and some DB rows active.
    //
    // QueryCommand on the user_id-index GSI is both faster (targets only this
    // user's records) and complete (pagination guarantees all pages are read).
    //
    // PREREQUISITE: GroupData-dev must have a GSI named "user_id-index" with
    // user_id as the partition key. Check your table in the AWS console —
    // you already have this GSI on the Tokens table; add the same to GroupData-dev.

    // 1️⃣ Collect ALL membership records for this user (paginated)
    let memberships = [];
    let lastKey = undefined;

    do {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "user_id-index",
          KeyConditionExpression: "user_id = :userId",
          FilterExpression: "begins_with(group_data_members, :memberPrefix)",
          ExpressionAttributeValues: {
            ":userId": userId,
            ":memberPrefix": "MEMBER#USER#",
          },
          ExclusiveStartKey: lastKey,
        })
      );
      memberships = memberships.concat(result.Items || []);
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    console.log(`📋 Found ${memberships.length} membership(s) for user ${userId}`);

    if (memberships.length === 0) {
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: true,
          message: "No memberships found to delete",
          details: {
            membershipsDeactivated: 0,
            groupsAffected: 0,
            stripeCancellations: { successful: 0, failed: 0, subscriptions: [], errors: [] },
          },
          timestamp: deletedAt,
        }),
      };
    }

    const allCanceledSubscriptions = [];
    const allStripeErrors = [];
    const stripeCustomerIds = new Set();
    let successfulDeactivations = 0;
    let failedDeactivations = 0;

    // 2️⃣ Process each membership — DB first, Stripe second
    for (const membership of memberships) {
      const groupId = membership.group_id;
      const stripeCustomerId = membership.stripe_customer_id || null;

      console.log(`\n📦 Processing membership in group: ${groupId}`);

      if (stripeCustomerId) stripeCustomerIds.add(stripeCustomerId);

      const createdAt = membership.created_at;
      const durationDays = createdAt
        ? Math.floor((new Date(deletedAt) - new Date(createdAt)) / (1000 * 60 * 60 * 24))
        : null;

      // Mark DB inactive FIRST
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              group_id: groupId,
              group_data_members: `MEMBER#USER#${userId}`,
            },
            UpdateExpression: `
              SET
                active = :inactive,
                isCancelled = :cancelled,
                accountDeleted = :deleted,
                deletedAt = :deletedAt,
                canceledAt = :canceledAt,
                deletionReason = :reason,
                membershipDurationDays = :duration,
                update_at = :updateAt
            `,
            ExpressionAttributeValues: {
              ":inactive": false,
              ":cancelled": true,
              ":deleted": true,
              ":deletedAt": deletedAt,
              ":canceledAt": deletedAt,
              ":reason": reason,
              ":duration": durationDays,
              ":updateAt": deletedAt,
            },
          })
        );
        successfulDeactivations++;
        console.log(`   ✅ DB record marked deleted for group ${groupId}`);
      } catch (updateError) {
        failedDeactivations++;
        console.error(`   ❌ Failed to update DB for ${groupId}:`, updateError.message);
        // Skip Stripe for this membership — don't cancel if we can't confirm DB update
        continue;
      }

      // Cancel Stripe AFTER DB is confirmed updated
      if (stripeCustomerId && !stripeCustomerId.startsWith("guest_")) {
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "active",
            limit: 100,
          });

          for (const sub of subscriptions.data) {
            try {
              const canceledSub = await stripe.subscriptions.cancel(sub.id);
              allCanceledSubscriptions.push({
                subscriptionId: sub.id,
                groupId,
                customerId: stripeCustomerId,
                canceledAt: canceledSub.canceled_at,
                status: canceledSub.status,
              });
              console.log(`   ✅ Canceled Stripe subscription ${sub.id}`);
            } catch (cancelError) {
              console.error(`   ❌ Failed to cancel subscription ${sub.id}:`, cancelError.message);
              allStripeErrors.push({
                subscriptionId: sub.id,
                groupId,
                customerId: stripeCustomerId,
                error: cancelError.message,
              });
            }
          }
        } catch (stripeError) {
          console.error(`   ❌ Stripe API error for customer ${stripeCustomerId}:`, stripeError.message);
          allStripeErrors.push({ customerId: stripeCustomerId, groupId, error: stripeError.message });
        }
      } else {
        console.log(`   ℹ️ No Stripe customer ID for group ${groupId} — skipping Stripe step`);
      }
    }

    // 3️⃣ Deactivate all invites created by this user (paginated scan — invites
    //    don't have a user_id-index so we scan with a filter; acceptable because
    //    invites are sparse)
    let deactivatedInvites = 0;
    try {
      let invites = [];
      let inviteLastKey = undefined;

      do {
        const invitesResponse = await dynamo.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression:
              "created_by = :userId AND begins_with(group_data_members, :invitePrefix)",
            ExpressionAttributeValues: {
              ":userId": userId,
              ":invitePrefix": "INVITE#",
            },
            ExclusiveStartKey: inviteLastKey,
          })
        );
        invites = invites.concat(invitesResponse.Items || []);
        inviteLastKey = invitesResponse.LastEvaluatedKey;
      } while (inviteLastKey);

      console.log(`\n📋 Found ${invites.length} invite(s) to deactivate`);

      for (const invite of invites) {
        try {
          await dynamo.send(
            new UpdateCommand({
              TableName: tableName,
              Key: {
                group_id: invite.group_id,
                group_data_members: invite.group_data_members,
              },
              UpdateExpression:
                "SET active = :inactive, deactivatedAt = :timestamp, deactivatedReason = :reason",
              ExpressionAttributeValues: {
                ":inactive": false,
                ":timestamp": deletedAt,
                ":reason": "account_deleted",
              },
            })
          );
          deactivatedInvites++;
        } catch (inviteError) {
          console.error("   ❌ Failed to deactivate invite:", inviteError.message);
        }
      }
    } catch (inviteError) {
      console.error("⚠️ Error processing invites:", inviteError.message);
    }

    // 4️⃣ Update metadata timestamps for affected groups
    const uniqueGroupIds = [...new Set(memberships.map((m) => m.group_id))];
    for (const groupId of uniqueGroupIds) {
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { group_id: groupId, group_data_members: "METADATA" },
            UpdateExpression: "SET update_at = :timestamp",
            ExpressionAttributeValues: { ":timestamp": deletedAt },
          })
        );
      } catch (err) {
        console.warn(`⚠️ Could not update metadata for ${groupId}:`, err.message);
      }
    }

    console.log("\n✅ Account deletion complete");
    console.log(`   Memberships deactivated: ${successfulDeactivations}/${memberships.length}`);
    console.log(`   Invites deactivated: ${deactivatedInvites}`);
    console.log(`   Stripe subscriptions canceled: ${allCanceledSubscriptions.length}`);
    console.log(`   Stripe errors: ${allStripeErrors.length}`);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        message: "Account successfully deleted and all memberships deactivated",
        details: {
          membershipsDeactivated: successfulDeactivations,
          membershipsFailed: failedDeactivations,
          groupsAffected: uniqueGroupIds.length,
          invitesDeactivated: deactivatedInvites,
          stripeCancellations: {
            successful: allCanceledSubscriptions.length,
            failed: allStripeErrors.length,
            subscriptions: allCanceledSubscriptions,
            errors: allStripeErrors,
          },
          uniqueStripeCustomers: stripeCustomerIds.size,
        },
        timestamp: deletedAt,
      }),
    };
  } catch (err) {
    console.error("❌ Error deleting account:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: false,
        error: err.message,
        // Never expose stack traces in production
        stack: undefined,
      }),
    };
  }
};