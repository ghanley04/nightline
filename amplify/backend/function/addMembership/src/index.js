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

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const createdAt = new Date().toISOString();
  const inviteCode = crypto.randomBytes(6).toString("hex");
  const inviteLink = `https://nightline.app/invite/${inviteCode}`;

  const newPlan = getPlanTier(groupId);

  try {
    // ✅ Query existing active memberships for this user (include "group" and "greek" and "individual" groups)
    const membershipsQuery = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :userId",
        FilterExpression: "active = :true AND (contains(group_id, :groupStr) OR contains(group_id, :greekStr) OR contains(group_id, :individualStr))",
        ExpressionAttributeValues: {
          ":userId": { S: userId },
          ":true": { BOOL: true },
          ":groupStr": { S: "group" },
          ":greekStr": { S: "greek" },
          ":individualStr": { S: "individual" },
        },
      })
    );

    const activeMemberships = membershipsQuery.Items || [];

    // 🔹 Handle existing memberships
    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id.S;
      const existingPlan = getPlanTier(existingGroupId);

      // Skip if it's the exact same group
      if (existingGroupId === groupId) {
        continue;
      }

      // Check if switching between individual/group/greek plans
      if (existingPlan.type === "individual" || existingPlan.type === "group" || existingPlan.type === "greek") {

        // UPGRADING: Deactivate old membership completely
        if (newPlan.tier > existingPlan.tier) {
          console.log(`⬆️ UPGRADING from ${existingPlan.type} to ${newPlan.type}`);

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

          // Deactivate tokens for old membership
          const oldTokensQuery = await dynamo.send(
            new QueryCommand({
              TableName: tokenTableName,
              IndexName: "user_id-index",
              KeyConditionExpression: "user_id = :userId",
              FilterExpression: "group_id = :oldGroup AND NOT contains(group_id, :nightStr) AND active = :true",
              ExpressionAttributeValues: {
                ":userId": { S: userId },
                ":oldGroup": { S: existingGroupId },
                ":nightStr": { S: "night" },
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

    // 🔹 Add new membership (MEMBER#USER# item)
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          group_id: { S: groupId },
          group_data_members: { S: `MEMBER#USER#${userId}` },
          user_id: { S: userId },
          stripe_customer_id: { S: customerId },
          created_at: { S: createdAt },
          update_at: { S: createdAt },
          active: { BOOL: true },
        },
      })
    );

    // 🔹 Add/Update METADATA item separately
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          group_id: { S: groupId },
          group_data_members: { S: `METADATA` },
          created_at: { S: createdAt },
          update_at: { S: createdAt },
          active: { BOOL: true },
          max_subscribers: { S: maxSubscribers },
          plan_type: { S: newPlan.type }
        },
      })
    );

    // 🔹 Add new token
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(
      new PutItemCommand({
        TableName: tokenTableName,
        Item: {
          token_id: { S: tokenId },
          user_id: { S: userId },
          group_id: { S: groupId },
          stripe_customer_id: { S: customerId },
          created_at: { S: createdAt },
          active: { BOOL: true },
        },
      })
    );

    // 🔹 Add invite code for group/greek membership
    if (groupId.toLowerCase().includes("greek") || groupId.toLowerCase().includes("group")) {
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