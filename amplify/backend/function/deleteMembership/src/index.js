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

    const tableName = 'GroupData-dev'; // Updated table name

    console.log('🔍 Looking for membership with keys:', {
      group_id: groupId, // Changed from GROUP#${groupId}
      group_data_members: `MEMBER#USER#${userId}`,
      userId,
      groupId
    });

    // 1️⃣ Fetch membership record to get stripeCustomerId
    const membershipResponse = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { 
        group_id: groupId, // Changed from PK: GROUP#${groupId}
        group_data_members: `MEMBER#USER#${userId}` // Changed from SK
      },
    }));

    console.log('📦 Membership response:', membershipResponse);

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

    const stripeCustomerId = membershipResponse.Item.stripe_customer_id; // Changed from stripeCustomerId

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
      Key: { 
        group_id: groupId,
        group_data_members: `MEMBER#USER#${userId}`
      },
      UpdateExpression: 'SET active = :inactive, isCancelled = :cancelled, canceledAt = :timestamp, canceledSubscriptions = :subs',
      ExpressionAttributeValues: {
        ':inactive': false, // Changed from 'INACTIVE' to false to match your schema
        ':cancelled': true,
        ':timestamp': new Date().toISOString(),
        ':subs': canceledSubscriptionIds,
      },
    }));

    // 5️⃣ Query for other records if needed (invites, etc.)
    // Note: You'll need to update these queries based on your actual GSI structure
    
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