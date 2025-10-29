const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  const sig = event.headers?.['stripe-signature'];

  let stripeEvent;
  try {
    // 1️⃣ Verify webhook signature
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid signature' }),
    };
  }

  // 2️⃣ Handle checkout.session.completed events
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    const userId = session.metadata?.userId;
    const groupId = session.metadata?.groupId;

    if (!userId || !groupId) {
      console.error('❌ Missing userId or groupId in metadata');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing metadata' }),
      };
    }

    try {
      const tableName = 'GroupsData';

      // 3️⃣ Add user membership
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: `GROUP#${groupId}`,
          SK: `MEMBER#USER#${userId}`,
          userId,
          groupId,
          createdAt: new Date().toISOString(),
        },
      }));

      // 4️⃣ Increment member count
      await dynamo.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: `GROUP#${groupId}`, SK: 'METADATA' },
        UpdateExpression: 'ADD memberCount :inc',
        ExpressionAttributeValues: { ':inc': 1 },
      }));

      // 5️⃣ Ensure invite link exists
      const inviteLink = `https://nightline.app/invite/${groupId}`;

      const existingInvite = await dynamo.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `GROUP#${groupId}`, SK: `INVITE#${groupId}` },
      }));

      if (!existingInvite.Item) {
        await dynamo.send(new PutCommand({
          TableName: tableName,
          Item: {
            PK: `GROUP#${groupId}`,
            SK: `INVITE#${groupId}`,
            inviteCode: groupId,
            inviteLink,
            groupId,
            createdAt: new Date().toISOString(),
          },
        }));
        console.log(`🔗 Created group invite link: ${inviteLink}`);
      } else {
        console.log(`ℹ️ Invite link already exists: ${inviteLink}`);
      }

      console.log(`✅ Added ${userId} as member of ${groupId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: `User ${userId} added to group ${groupId}`,
          inviteLink,
        }),
      };
    } catch (err) {
      console.error('❌ DynamoDB error:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Error adding membership' }),
      };
    }
  }

  // 6️⃣ Ignore other events
  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
