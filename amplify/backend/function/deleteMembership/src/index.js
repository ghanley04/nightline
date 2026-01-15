const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log('📥 Event received:', JSON.stringify(event, null, 2));

  try {
    // Parse body from POST request
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    const userId = body?.userId;
    const groupId = body?.groupId;

    if (!userId || !groupId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing userId or groupId' 
        })
      };
    }

    const tableName = 'GroupsData';

    // 1️⃣ Fetch membership record to get stripeCustomerId
    const membershipResponse = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#USER#${userId}` },
    }));

    if (!membershipResponse.Item) {
      return {
        statusCode: 404,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Membership not found' 
        })
      };
    }

    const stripeCustomerId = membershipResponse.Item.stripeCustomerId;

    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: false, 
          error: 'No Stripe customer ID found for this membership' 
        })
      };
    }

    // 2️⃣ Find active Stripe subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
      limit: 10,
    });

    let canceledSubscriptionIds = [];

    // 3️⃣ Cancel each active subscription immediately
    for (const sub of subscriptions.data) {
      await stripe.subscriptions.cancel(sub.id);
      canceledSubscriptionIds.push(sub.id);
      console.log(`🔔 Subscription ${sub.id} for user ${userId} has been canceled.`);
    }

    // 4️⃣ Update main membership record to inactive
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${groupId}`, SK: `MEMBER#USER#${userId}` },
      UpdateExpression: 'SET #status = :inactive, isCancelled = :cancelled, canceledAt = :timestamp, canceledSubscriptions = :subs',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':inactive': 'INACTIVE',
        ':cancelled': true,
        ':timestamp': new Date().toISOString(),
        ':subs': canceledSubscriptionIds,
      },
    }));

    // 5️⃣ Update secondary user-indexed memberships (GSI) to inactive
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
      await dynamo.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET #status = :inactive, isCancelled = :cancelled, canceledAt = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':inactive': 'INACTIVE',
          ':cancelled': true,
          ':timestamp': new Date().toISOString(),
        },
      }));
    }

    // 6️⃣ Mark invites created by this user as inactive
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
        await dynamo.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: invite.PK, SK: invite.SK },
          UpdateExpression: 'SET #status = :inactive, deactivatedAt = :timestamp',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':inactive': 'INACTIVE',
            ':timestamp': new Date().toISOString(),
          },
        }));
      }
    }

    // 7️⃣ Decrement active member count
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${groupId}`, SK: 'METADATA' },
      UpdateExpression: 'ADD activeMemberCount :dec, inactiveMemberCount :inc',
      ExpressionAttributeValues: { 
        ':dec': -1,
        ':inc': 1,
      },
    }));

    console.log(`✅ Successfully deactivated membership and canceled Stripe subscription for user ${userId} in group ${groupId}`);
    
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: true, 
        canceledSubscriptions: canceledSubscriptionIds,
        timestamp: new Date().toISOString(),
      })
    };

  } catch (err) {
    console.error('❌ Error canceling membership:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: false, 
        error: err.message 
      })
    };
  }
};