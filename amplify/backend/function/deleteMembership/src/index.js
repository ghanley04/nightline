const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

async function cancelMembership(userId, groupId, stripeCustomerId) {
  if (!userId || !groupId || !stripeCustomerId) {
    throw new Error('Missing userId, groupId, or Stripe customer ID');
  }

  const tableName = 'GroupsData';

  try {
    // 1️⃣ Find active Stripe subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
      limit: 10, // adjust if necessary
    });

    // 2️⃣ Cancel each active subscription
    for (const sub of subscriptions.data) {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      console.log(`🔔 Subscription ${sub.id} for user ${userId} will be canceled at period end.`);
    }

    // 3️⃣ Delete main membership record
    await dynamo.send(new DeleteCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#USER#${userId}` },
    }));

    // 4️⃣ Delete secondary user-indexed memberships (GSI)
    const userMemberships = await dynamo.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'UserMembershipsIndex',
      KeyConditionExpression: 'PK = :userPk AND SK = :groupSk',
      ExpressionAttributeValues: {
        ':userPk': `USER#${userId}`,
        ':groupSk': `GROUP#${groupId}`,
      },
    }));

    for (const item of userMemberships.Items || []) {
      await dynamo.send(new DeleteCommand({
        TableName: tableName,
        Key: { PK: item.PK, SK: item.SK },
      }));
    }

    // 5️⃣ Delete any invites created by this user
    const invites = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :groupPk AND begins_with(SK, :invitePrefix)',
      ExpressionAttributeValues: {
        ':groupPk': `GROUP#${groupId}`,
        ':invitePrefix': 'INVITE#',
      },
    }));

    for (const invite of invites.Items || []) {
      if (invite.createdBy === userId) {
        await dynamo.send(new DeleteCommand({
          TableName: tableName,
          Key: { PK: invite.PK, SK: invite.SK },
        }));
      }
    }

    // 6️⃣ Decrement member count
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${groupId}`, SK: 'METADATA' },
      UpdateExpression: 'ADD memberCount :dec',
      ExpressionAttributeValues: { ':dec': -1 },
    }));

    console.log(`✅ Successfully canceled membership and Stripe subscription for user ${userId} in group ${groupId}`);
    return { success: true };

  } catch (err) {
    console.error('❌ Error canceling membership:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { cancelMembership };
