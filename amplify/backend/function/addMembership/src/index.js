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

  console.log("🔸 Extracted metadata:", { userId, groupId, customerId });

  if (!userId || !groupId) {
    console.error("❌ Missing userId or groupId in metadata");
    return { statusCode: 400, body: JSON.stringify({ error: "Missing metadata" }) };
  }

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const createdAt = new Date().toISOString();
  const inviteCode = crypto.randomBytes(6).toString("hex");
  const inviteLink = `https://nightline.app/invite/${inviteCode}`;

  try {
    // ✅ Check existing active memberships for this user (exclude "night" groups)
    const membershipsQuery = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :userId",
        FilterExpression: "active = :true AND NOT contains(group_id, :nightStr)",
        ExpressionAttributeValues: {
          ":userId": { S: userId },
          ":true": { BOOL: true },
          ":nightStr": { S: "night" },
        },
      })
    );
//PROBLEM: add METADATA back
    const activeMemberships = membershipsQuery.Items || [];

    // Prevent duplicate individual purchase
    const isDuplicate = activeMemberships.some(m => {
      const existingGroupId = m.group_id.S.toLowerCase();
      const newGroupId = groupId.toLowerCase();
      return (
        (existingGroupId.startsWith("individual") && newGroupId.startsWith("individual")) ||
        (existingGroupId.startsWith("group") && newGroupId.startsWith("group")) ||
        (existingGroupId.startsWith("greek") && newGroupId.startsWith("greek"))
      );
    });

    if (isDuplicate) { //PROBLEM: if this is a duplicate, they already paid for it so it won't be in teh database
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "User already has an active membership for this plan type" }),
      };
    }

    // 🔹 Deactivate old memberships/tokens if the group differs (exclude night)
    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id.S;
      if (existingGroupId !== groupId) {
        // Deactivate membership
        await updateIfExists({
          table: tableName,
          key: { group_id: { S: existingGroupId }, group_data_members: { S: `MEMBER#USER#${userId}` } },
          update: "SET active = :false, update_at = :now",
          values: { ":false": { BOOL: false }, ":now": { S: createdAt } },
        });

        // Deactivate tokens for that membership
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
    }

    // 🔹 Add new membership
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

    console.log("✅ Successfully processed subscription upgrade");
    return { statusCode: 200, body: JSON.stringify({ success: true, inviteLink }) };
  } catch (err) {
    console.error("❌ DynamoDB error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Error processing subscription upgrade" }) };
  }
};
