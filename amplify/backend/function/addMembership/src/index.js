const { DynamoDBClient, PutItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const Stripe = require("stripe");
const crypto = require("crypto");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const dynamo = new DynamoDBClient({});

exports.handler = async (event) => {
  const sig = event.headers["stripe-signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
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

  if (!userId || !groupId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing metadata" }) };
  }

  try {
    const tableName = "GroupData";
    const createdAt = new Date().toISOString();
    const inviteCode = crypto.randomBytes(6).toString("hex");
    const inviteLink = `https://nightline.app/invite/${inviteCode}`;

    // 1️⃣ Add membership record
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          PK: { S: `GROUP#${groupId}` },
          SK: { S: `MEMBER#USER#${userId}` },
          userId: { S: userId },
          groupId: { S: groupId },
          createdAt: { S: createdAt },
        },
      })
    );

    // 2️⃣ Increment group member count
    await dynamo.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: "METADATA" } },
        UpdateExpression: "ADD memberCount :inc",
        ExpressionAttributeValues: { ":inc": { N: "1" } },
      })
    );

    // 3️⃣ Create invite record
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          PK: { S: `GROUP#${groupId}` },
          SK: { S: `INVITE#${inviteCode}` },
          inviteCode: { S: inviteCode },
          groupId: { S: groupId },
          createdBy: { S: userId },
          createdAt: { S: createdAt },
          used: { BOOL: false },
          inviteLink: { S: inviteLink },
        },
      })
    );

    console.log(`✅ Added ${userId} to ${groupId} and created invite link: ${inviteLink}`);

    return { statusCode: 200, body: JSON.stringify({ success: true, inviteLink }) };
  } catch (err) {
    console.error("❌ DynamoDB error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Error adding membership" }) };
  }
};
