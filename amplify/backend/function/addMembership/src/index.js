const { DynamoDBClient, PutItemCommand, UpdateItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const dynamo = new DynamoDBClient({});

exports.handler = async (event) => {
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  // Handle Base64-encoded body
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8");

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("⚠️ Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid signature" }) };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const session = stripeEvent.data.object;
  const userId = session.metadata?.userId;
  const groupId = session.metadata?.groupId;
  const customerId = session.customer;

  if (!userId || !groupId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing metadata" }) };
  }

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const createdAt = new Date().toISOString();
  const inviteCode = crypto.randomBytes(6).toString("hex");
  const inviteLink = `https://nightline.app/invite/${inviteCode}`;

  try {
    // 1️⃣ Deactivate previous membership records for this user & group
    await dynamo.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { group_id: { S: groupId }, group_data_members: { S: `MEMBER#USER#${userId}` } },
      UpdateExpression: "SET active = :false, update_at = :now",
      ExpressionAttributeValues: {
        ":false": { BOOL: false },
        ":now": { S: createdAt },
      },
    }));

    // 2️⃣ Deactivate previous tokens
    const tokenQuery = await dynamo.send(new QueryCommand({
      TableName: tokenTableName,
      KeyConditionExpression: "user_id = :userId AND group_id = :groupId",
      ExpressionAttributeValues: {
        ":userId": { S: userId },
        ":groupId": { S: groupId },
      },
    }));
    for (const token of tokenQuery.Items || []) {
      await dynamo.send(new UpdateItemCommand({
        TableName: tokenTableName,
        Key: { token_id: token.token_id, user_id: token.user_id },
        UpdateExpression: "SET active = :false, ended_at = :now",
        ExpressionAttributeValues: {
          ":false": { BOOL: false },
          ":now": { S: createdAt },
        },
      }));
    }

    // 3️⃣ Deactivate previous invite codes
    const inviteQuery = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "group_id = :groupId AND begins_with(group_data_members, :invitePrefix)",
      ExpressionAttributeValues: {
        ":groupId": { S: groupId },
        ":invitePrefix": { S: "INVITE#" },
      },
    }));
    for (const invite of inviteQuery.Items || []) {
      await dynamo.send(new UpdateItemCommand({
        TableName: tableName,
        Key: { group_id: invite.group_id, group_data_members: invite.group_data_members },
        UpdateExpression: "SET active = :false, ended_at = :now",
        ExpressionAttributeValues: {
          ":false": { BOOL: false },
          ":now": { S: createdAt },
        },
      }));
    }

    // 4️⃣ Add new membership
    await dynamo.send(new PutItemCommand({
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
    }));

    // 5️⃣ Add new token
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(new PutItemCommand({
      TableName: tokenTableName,
      Item: {
        token_id: { S: tokenId },
        user_id: { S: userId },
        group_id: { S: groupId },
        stripe_customer_id: { S: customerId },
        created_at: { S: createdAt },
        active: { BOOL: true },
      },
    }));

    // 6️⃣ Add invite code if group/greek
    if (groupId.toLowerCase().includes("greek") || groupId.toLowerCase().includes("group")) {
      await dynamo.send(new PutItemCommand({
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
      }));
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, inviteLink }) };

  } catch (err) {
    console.error("❌ DynamoDB error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Error processing subscription upgrade" }) };
  }
};
