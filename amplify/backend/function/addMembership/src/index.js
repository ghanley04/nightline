const { DynamoDBClient, PutItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const dynamo = new DynamoDBClient({});

exports.handler = async (event) => {
  console.log("Headers:", event.headers);
  console.log("Body (first 200 chars):", event.body.slice(0, 200));
  console.log("Is Base64 encoded?", event.isBase64Encoded);
  console.log("Header keys:", Object.keys(event.headers));

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  // 1️⃣ Handle Base64-encoded body from API Gateway
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8"); // Keep as Buffer

  console.log("Raw body as string:", body.toString("utf8"));

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

  try {
    const tableName = "GroupData-dev";
    const createdAt = new Date().toISOString();
    const inviteCode = crypto.randomBytes(6).toString("hex");
    const inviteLink = `https://nightline.app/invite/${inviteCode}`;

    // 1️⃣ Add membership record
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          group_id: { S: groupId },
          group_data_members: { S: `MEMBER#USER#${userId}` },
          userId: { S: userId },
          stripeCustomerId: { S: customerId },
          groupId: { S: groupId },
          createdAt: { S: createdAt },
          active: { BOOL: true },
        },
      })
    );

    // 2️⃣ Increment group member count
    await dynamo.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: {
          group_id: { S: groupId },
          group_data_members: { S: "METADATA" }
        },
        UpdateExpression: "SET memberCount = if_not_exists(memberCount, :zero) + :inc, updatedAt = :now, active = :true",
        ExpressionAttributeValues: {
          ":inc": { N: "1" },
          ":zero": { N: "0" },
          ":now": { S: createdAt },
          ":true": { BOOL: true },
        },
      })
    );

    // 3️⃣ Create invite record
    const lowerGroupId = groupId.toLowerCase();
    if (lowerGroupId.includes("greek") || lowerGroupId.includes("group")) {
      await dynamo.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            group_id: { S: groupId },
            group_data_members: { S: `INVITE#${inviteCode}` },
            inviteCode: { S: inviteCode },
            groupId: { S: groupId },
            createdBy: { S: userId },
            createdAt: { S: createdAt },
            used: { BOOL: false },
            inviteLink: { S: inviteLink },
            active: { BOOL: true },
          },
        })
      );
      console.log(`✅ Created invite link for ${groupId}: ${inviteLink}`);
    } else {
      console.log(`ℹ️ No invite link created for group type: ${groupId}`);
    }

    console.log(`✅ Added ${userId} to ${groupId}`);

    return { statusCode: 200, body: JSON.stringify({ success: true, inviteLink }) };
  } catch (err) {
    console.error("❌ DynamoDB error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Error adding membership" }) };
  }
};
