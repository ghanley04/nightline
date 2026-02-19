const {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  GetItemCommand
} = require("@aws-sdk/client-dynamodb");
const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const dynamo = new DynamoDBClient({});

// ✅ Helper: Only update if record exists
async function updateIfExists({ table, key, update, values }) {
  const exists = await dynamo.send(
    new GetItemCommand({ TableName: table, Key: key })
  );

  if (!exists.Item) {
    console.log("ℹ️ Skipping update — record does not exist:", key);
    return false;
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: table,
      Key: key,
      UpdateExpression: update,
      ExpressionAttributeValues: values
    })
  );

  console.log("✅ Updated record:", key);
  return true;
}

// ✅ NEW: Helper to cancel Stripe subscriptions for a customer
async function cancelStripeSubscriptions(customerId) {
  try {
    console.log(`🔍 Looking for active Stripe subscriptions for customer: ${customerId}`);
    
    // Don't try to cancel for guest customers
    if (customerId.startsWith('guest_')) {
      console.log('ℹ️ Guest customer, skipping Stripe subscription cancellation');
      return [];
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10,
    });

    const canceledSubscriptionIds = [];

    for (const sub of subscriptions.data) {
      await stripe.subscriptions.cancel(sub.id);
      canceledSubscriptionIds.push(sub.id);
      console.log(`✅ Canceled Stripe subscription: ${sub.id}`);
    }

    return canceledSubscriptionIds;
  } catch (err) {
    console.error('❌ Error canceling Stripe subscriptions:', err);
    return [];
  }
}

// Helper: Get plan tier for comparison
function getPlanTier(groupId) {
  const id = groupId.toLowerCase();
  if (id.includes("individual")) return { type: "individual", tier: 1 };
  if (id.includes("group")) return { type: "group", tier: 2 };
  if (id.includes("greek")) return { type: "greek", tier: 3 };
  return { type: "unknown", tier: 0 };
}

exports.handler = async (event) => {
  console.log("📢 Received event:", JSON.stringify(event, null, 2));
  console.log("Is base64 encoded:", event.isBase64Encoded);

  if (!event.headers) {
    console.error("❌ No headers received:", event);
    return { statusCode: 400, body: JSON.stringify({ error: "No headers received" }) };
  }

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  // Decode body if needed
  let bodyRaw = event.body;
  if (event.isBase64Encoded) {
    bodyRaw = Buffer.from(bodyRaw, "base64").toString("utf8");
  }

  // Verify Stripe webhook
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      bodyRaw,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log("🟢 Stripe webhook verified successfully");
  } catch (err) {
    console.error("❌ Invalid Stripe signature or malformed body:", err);
    return { statusCode: 400, body: "Webhook Error" };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    console.log("ℹ️ Stripe event type not handled:", stripeEvent.type);
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  console.log("✅ Handling checkout.session.completed event");
  const session = stripeEvent.data.object;

  const userId = session.metadata?.userId;
  const groupId = session.metadata?.groupId;
  const customerId = session.customer;

  // Fetch the price details from Stripe to get max_members from metadata
  let maxSubscribers = "1";
  try {
    if (session.line_items?.data?.[0]?.price?.id) {
      const priceId = session.line_items.data[0].price.id;
      const price = await stripe.prices.retrieve(priceId);
      maxSubscribers = price.metadata?.max_members || "1";
      console.log(`🔸 Retrieved max_members from price ${priceId}:`, maxSubscribers);
    } else {
      console.log("⚠️ No line items found, defaulting max_subscribers to 1");
    }
  } catch (err) {
    console.error("⚠️ Error fetching price metadata, defaulting to 1:", err);
  }

  console.log("🔸 Extracted metadata:", { userId, groupId, customerId, maxSubscribers });

  if (!userId || !groupId) {
    console.error("❌ Missing userId or groupId in metadata");
    return { statusCode: 400, body: JSON.stringify({ error: "Missing metadata" }) };
  }

  // 🔹 Determine if this is a one-time pass purchase (night or bus)
  const groupIdLower = groupId.toLowerCase();
  const isNightPass = groupIdLower.includes('night');
  const isBusPass = groupIdLower.includes('bus');
  const isOneTimePass = isNightPass || isBusPass;

  // 🔹 For one-time payments, we need to retrieve the customer from payment_intent
  let finalCustomerId = customerId;
  if (!finalCustomerId && session.payment_intent) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
      finalCustomerId = paymentIntent.customer;
      console.log("🔸 Retrieved customer from payment_intent:", finalCustomerId);
    } catch (err) {
      console.warn("⚠️ Could not retrieve customer from payment_intent:", err);
    }
  }

  // 🔹 If still no customer, generate a placeholder (for one-time purchases without customer)
  if (!finalCustomerId) {
    finalCustomerId = `guest_${crypto.randomBytes(8).toString("hex")}`;
    console.log("⚠️ No Stripe customer found, using placeholder:", finalCustomerId);
  }

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const createdAt = new Date().toISOString();
  const inviteCode = crypto.randomBytes(6).toString("hex");
  const inviteLink = `https://nightline.app/invite/${inviteCode}`;

  const newPlan = getPlanTier(groupId);

  // Determine pass type for logging
  let passType = newPlan.type + ' (subscription)';
  if (isNightPass) passType = 'Night Pass (one-time)';
  if (isBusPass) passType = 'Bus Pass (one-time)';

  try {
    // ✅ Query existing active memberships for this user (get ALL active memberships)
    const membershipsQuery = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :userId",
        FilterExpression: "active = :true",
        ExpressionAttributeValues: {
          ":userId": { S: userId },
          ":true": { BOOL: true },
        },
      })
    );

    const activeMemberships = membershipsQuery.Items || [];

    console.log(`📋 Purchase type: ${passType}`);

    // 🔹 Handle existing memberships
    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id.S;
      const existingPlan = getPlanTier(existingGroupId);
      const existingGroupIdLower = existingGroupId.toLowerCase();
      const isExistingNightPass = existingGroupIdLower.includes('night');
      const isExistingBusPass = existingGroupIdLower.includes('bus');
      const isExistingOneTimePass = isExistingNightPass || isExistingBusPass;
      const existingStripeCustomerId = membership.stripe_customer_id?.S;

      // Skip if it's the exact same group
      if (existingGroupId === groupId) {
        continue;
      }

      // 🎫 If purchasing a ONE-TIME PASS (night or bus): don't touch any existing memberships
      if (isOneTimePass) {
        console.log(`🎫 Purchasing ${isNightPass ? 'night' : 'bus'} pass - keeping existing membership: ${existingGroupId}`);
        continue; // One-time passes coexist with everything
      }

      // 🎫 If existing membership is a ONE-TIME PASS: don't touch it when buying subscriptions
      if (isExistingOneTimePass) {
        console.log(`🎫 Keeping existing ${isExistingNightPass ? 'night' : 'bus'} pass: ${existingGroupId}`);
        continue; // One-time passes are independent
      }

      // 💼 Handle subscription-to-subscription changes (individual/group/greek only)
      if (existingPlan.type === "individual" || existingPlan.type === "group" || existingPlan.type === "greek") {

        // UPGRADING OR SAME-TIER REPLACEMENT: Deactivate old membership and cancel Stripe subscription
        if (newPlan.tier >= existingPlan.tier) {
          console.log(`⬆️ ${newPlan.tier > existingPlan.tier ? 'UPGRADING' : 'REPLACING'} from ${existingPlan.type} to ${newPlan.type}`);

          // ✅ NEW: Cancel old Stripe subscriptions
          if (existingStripeCustomerId) {
            const canceledSubs = await cancelStripeSubscriptions(existingStripeCustomerId);
            console.log(`🔔 Canceled ${canceledSubs.length} Stripe subscription(s) for customer: ${existingStripeCustomerId}`);
          }

          await updateIfExists({
            table: tableName,
            key: { group_id: { S: existingGroupId }, group_data_members: { S: `MEMBER#USER#${userId}` } },
            update: "SET active = :false, update_at = :now",
            values: { ":false": { BOOL: false }, ":now": { S: createdAt } },
          });

          // Deactivate METADATA item
          await updateIfExists({
            table: tableName,
            key: { group_id: { S: existingGroupId }, group_data_members: { S: `METADATA` } },
            update: "SET active = :false, update_at = :now",
            values: { ":false": { BOOL: false }, ":now": { S: createdAt } },
          });

          // Deactivate tokens for old membership (but NOT one-time passes)
          const oldTokensQuery = await dynamo.send(
            new QueryCommand({
              TableName: tokenTableName,
              IndexName: "user_id-index",
              KeyConditionExpression: "user_id = :userId",
              FilterExpression: "group_id = :oldGroup AND NOT contains(group_id, :nightStr) AND NOT contains(group_id, :busStr) AND active = :true",
              ExpressionAttributeValues: {
                ":userId": { S: userId },
                ":oldGroup": { S: existingGroupId },
                ":nightStr": { S: "night" },
                ":busStr": { S: "bus" },
                ":true": { BOOL: true },
              },
            })
          );

          for (const token of oldTokensQuery.Items || []) {
            await updateIfExists({
              table: tokenTableName,
              key: { token_id: token.token_id, user_id: token.user_id },
              update: "SET active = :false, ended_at = :now",
              values: { ":false": { BOOL: false }, ":now": { S: createdAt } },
            });
          }
        }
        // DOWNGRADING: Update METADATA to decrease subscriber count
        else if (newPlan.tier < existingPlan.tier) {
          console.log(`⬇️ DOWNGRADING from ${existingPlan.type} to ${newPlan.type}`);

          // ✅ NEW: Cancel old Stripe subscriptions on downgrade too
          if (existingStripeCustomerId) {
            const canceledSubs = await cancelStripeSubscriptions(existingStripeCustomerId);
            console.log(`🔔 Canceled ${canceledSubs.length} Stripe subscription(s) for customer: ${existingStripeCustomerId}`);
          }

          // Get current metadata
          const currentMetadata = membership.metadata?.M || {};
          const currentMaxSubscribers = currentMetadata.max_subscribers?.S || "1";
          const newMaxSubscribers = String(Math.max(1, parseInt(currentMaxSubscribers) - 1));

          // Update metadata with decreased subscriber count
          await updateIfExists({
            table: tableName,
            key: { group_id: { S: existingGroupId }, group_data_members: { S: `METADATA` } },
            update: "SET metadata.max_subscribers = :newMax, update_at = :now",
            values: {
              ":newMax": { S: newMaxSubscribers },
              ":now": { S: createdAt }
            },
          });

          console.log(`📉 Updated ${existingGroupId} max_subscribers: ${currentMaxSubscribers} → ${newMaxSubscribers}`);
        }
      }
    }

    // 🔹 Add new membership (MEMBER#USER# item) - works for subscriptions and one-time passes
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          group_id: { S: groupId },
          group_data_members: { S: `MEMBER#USER#${userId}` },
          user_id: { S: userId },
          stripe_customer_id: { S: finalCustomerId },
          created_at: { S: createdAt },
          update_at: { S: createdAt },
          active: { BOOL: true },
        },
      })
    );

    // 🔹 Determine plan type for metadata
    let planType = newPlan.type;
    if (isNightPass) planType = "night";
    if (isBusPass) planType = "bus";

    // 🔹 Add/Update METADATA item (for subscriptions and one-time passes)
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          group_id: { S: groupId },
          group_data_members: { S: `METADATA` },
          created_at: { S: createdAt },
          update_at: { S: createdAt },
          active: { BOOL: true },
          max_subscribers: { S: isOneTimePass ? "1" : maxSubscribers },
          plan_type: { S: planType }
        },
      })
    );

    // 🔹 Add new token (for subscriptions and one-time passes)
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(
      new PutItemCommand({
        TableName: tokenTableName,
        Item: {
          token_id: { S: tokenId },
          user_id: { S: userId },
          group_id: { S: groupId },
          stripe_customer_id: { S: finalCustomerId },
          created_at: { S: createdAt },
          active: { BOOL: true },
        },
      })
    );

    // 🔹 Add invite code ONLY for group/greek membership (NOT for one-time passes or individual)
    if (!isOneTimePass && (groupId.toLowerCase().includes("greek") || groupId.toLowerCase().includes("group"))) {
      await dynamo.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            group_id: { S: groupId },
            group_data_members: { S: `INVITE#${inviteCode}` },
            invite_code: { S: inviteCode },
            created_by: { S: userId },
            created_at: { S: createdAt },
            used: { BOOL: false },
            invite_link: { S: inviteLink },
            active: { BOOL: true },
          },
        })
      );
    }

    console.log("✅ Successfully processed subscription change");
    return { statusCode: 200, body: JSON.stringify({ success: true, inviteLink }) };
  } catch (err) {
    console.error("❌ DynamoDB error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Error processing subscription change" }) };
  }
};