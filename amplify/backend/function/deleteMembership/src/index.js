const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log('📥 Event received:', JSON.stringify(event, null, 2));

  try {
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

    const membersTable = 'GroupData-dev';
    const tokensTable = 'Tokens';

    console.log('🔍 Looking for membership with keys:', {
      group_id: groupId,
      group_data_members: `MEMBER#USER#${userId}`,
      userId,
      groupId
    });

    // 1️⃣ Fetch membership record to get stripeCustomerId
    const membershipResponse = await dynamo.send(new GetCommand({
      TableName: membersTable,
      Key: {
        group_id: groupId,
        group_data_members: `MEMBER#USER#${userId}`
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

    const stripeCustomerId = membershipResponse.Item.stripe_customer_id;

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

    // 4️⃣ Update GroupData-dev table - member record
    await dynamo.send(new UpdateCommand({
      TableName: membersTable,
      Key: {
        group_id: groupId,
        group_data_members: `MEMBER#USER#${userId}`
      },
      UpdateExpression: 'SET active = :inactive, isCancelled = :cancelled, canceledAt = :timestamp, canceledSubscriptions = :subs',
      ExpressionAttributeValues: {
        ':inactive': false,
        ':cancelled': true,
        ':timestamp': new Date().toISOString(),
        ':subs': canceledSubscriptionIds,
      },
    }));

    console.log('✅ Updated member record to inactive');

    // 5️⃣ Update GroupData-dev table - METADATA record
    try {
      await dynamo.send(new UpdateCommand({
        TableName: membersTable,
        Key: {
          group_id: groupId,
          group_data_members: 'METADATA'
        },
        UpdateExpression: 'SET active = :inactive',
        ExpressionAttributeValues: {
          ':inactive': false,
        },
      }));
      console.log('✅ Updated METADATA record to inactive');
    } catch (metadataError) {
      console.warn('⚠️ Could not update METADATA record:', metadataError.message);
    }

    // 6️⃣ Query and update ALL tokens in Tokens table for this user and groupId
    // 6️⃣ Deactivate ACTIVE tokens for this user in this group
    try {
      console.log('🔍 Token deactivation started', {
        table: tokensTable,
        userId,
        groupId,
        pk: 'token_id',
        sk: 'user_id',
        gsi: 'user_id-index',
      });

      const tokenQuery = await dynamo.send(
        new QueryCommand({
          TableName: tokensTable,
          IndexName: 'user_id-index', // GSI PK = user_id
          KeyConditionExpression: 'user_id = :uid',
          FilterExpression: 'group_id = :gid AND active = :active',
          ExpressionAttributeValues: {
            ':uid': userId,
            ':gid': groupId,
            ':active': true,
          },
        })
      );

      console.log('📊 Token query result', {
        Count: tokenQuery.Count,
        ScannedCount: tokenQuery.ScannedCount,
      });

      console.log(
        '📦 Tokens matched:',
        JSON.stringify(tokenQuery.Items ?? [], null, 2)
      );

      if (!tokenQuery.Items || tokenQuery.Items.length === 0) {
        console.warn('⚠️ No ACTIVE tokens found for this user/group');
      }

      for (const token of tokenQuery.Items ?? []) {
        console.log('🧩 Updating token', {
          token_id: token.token_id,
          user_id: token.user_id,
          group_id: token.group_id,
          active_before: token.active,
        });

        await dynamo.send(
          new UpdateCommand({
            TableName: tokensTable,
            Key: {
              token_id: token.token_id, // PK
              user_id: token.user_id,   // SK
            },
            UpdateExpression: `
          SET active = :inactive,
              ended_at = :endedAt
        `,
            ConditionExpression: 'active = :active',
            ExpressionAttributeValues: {
              ':inactive': false,
              ':active': true,
              ':endedAt': new Date().toISOString(),
            },
          })
        );

        console.log(`✅ Token ${token.token_id} deactivated`);
      }
    } catch (err) {
      console.error('❌ Token deactivation failed', err);
    }
    
    console.log(`✅ Successfully deactivated membership and canceled Stripe subscription for user ${userId} in group ${groupId} `);

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