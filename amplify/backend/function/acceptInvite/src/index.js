const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log('📥 [ACCEPT_INVITE] raw event:', JSON.stringify(event, null, 2));

  let body;
  try {
    body = JSON.parse(event.body || '{}');
    console.log('📥 [ACCEPT_INVITE] parsed body:', JSON.stringify(body, null, 2));
  } catch (err) {
    console.error('❌ [ACCEPT_INVITE] invalid JSON body:', err);
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  const { inviteCode, userId, userName, email, phoneNumber } = body;

  console.log('🔍 [ACCEPT_INVITE] extracted fields:', {
    inviteCode,
    userId,
    userName,
    email,
    phoneNumber,
  });

  if (!inviteCode || !userId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Missing inviteCode or userId' }),
    };
  }

  const tableName = 'GroupData-dev';
  const tokenTableName = 'Tokens';
  const now = new Date().toISOString();

  try {
    // 1. Find invite row from invite code
    const inviteRowKey = `INVITE#${inviteCode}`;

    console.log('🔎 [ACCEPT_INVITE] scanning for invite row:', inviteRowKey);

    const inviteScan = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'group_data_members = :inviteKey AND active = :active',
        ExpressionAttributeValues: {
          ':inviteKey': inviteRowKey,
          ':active': true,
        },
      })
    );

    console.log('📦 [ACCEPT_INVITE] invite scan result:', JSON.stringify(inviteScan.Items || [], null, 2));

    const inviteItem = inviteScan.Items?.[0];
    if (!inviteItem) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invite code not found' }),
      };
    }

    const groupId = inviteItem.group_id;
    if (!groupId) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invite record missing group_id' }),
      };
    }

    console.log('✅ [ACCEPT_INVITE] resolved groupId:', groupId);

    if (inviteItem.used === true) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invite code has already been used' }),
      };
    }

    const currentUses = Number(inviteItem.current_uses || 0);
    const maxUses = Number(inviteItem.max_uses || 0);

    if (maxUses > 0 && currentUses >= maxUses) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invite has reached its usage limit' }),
      };
    }

    // 2. Fetch metadata row
    const metadataKey = {
      group_id: groupId,
      group_data_members: 'METADATA',
    };

    console.log('🔎 [ACCEPT_INVITE] fetching metadata:', metadataKey);

    const metadataResp = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: metadataKey,
      })
    );

    console.log('📦 [ACCEPT_INVITE] metadata result:', JSON.stringify(metadataResp.Item || null, null, 2));

    const metadataItem = metadataResp.Item;
    if (!metadataItem) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Group metadata not found' }),
      };
    }

    const planType = metadataItem.plan_type || 'group';
    const stripeCustomerId = metadataItem.stripe_customer_id || inviteItem.stripe_customer_id || null;

    // 3. Check if already a member
    const membershipKey = {
      group_id: groupId,
      group_data_members: `MEMBER#USER#${userId}`,
    };

    console.log('🔎 [ACCEPT_INVITE] checking existing membership:', membershipKey);

    const existingMembership = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: membershipKey,
      })
    );

    console.log('📦 [ACCEPT_INVITE] existing membership result:', JSON.stringify(existingMembership.Item || null, null, 2));

    if (existingMembership.Item) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          alreadyMember: true,
          message: 'User is already a member of this group',
          groupId,
        }),
      };
    }

    // 4. Add member row
    const memberItem = {
      group_id: groupId,
      group_data_members: `MEMBER#USER#${userId}`,
      user_id: userId,
      username: userName || 'Unknown User',
      email: email || null,
      phone_number: phoneNumber || null,
      active: true,
      created_at: now,
      update_at: now,
      manually_added: false,
      stripe_customer_id: stripeCustomerId,
    };

    console.log('📝 [ACCEPT_INVITE] writing member item:', JSON.stringify(memberItem, null, 2));

    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: memberItem,
      })
    );

    // 5. Add token row like subscription flow
    const tokenId = crypto.randomBytes(16).toString('hex');

    const tokenItem = {
      token_id: tokenId,
      user_id: userId,
      group_id: groupId,
      stripe_customer_id: stripeCustomerId,
      email: email || null,
      first_name: inviteItem.first_name || null,
      last_name: inviteItem.last_name || null,
      phone_number: phoneNumber || null,
      plan_type: planType,
      created_at: now,
      active: true,
      manually_added: false,
      username: userName || 'Unknown User',
    };

    console.log('📝 [ACCEPT_INVITE] writing token item:', JSON.stringify(tokenItem, null, 2));

    await dynamo.send(
      new PutCommand({
        TableName: tokenTableName,
        Item: tokenItem,
      })
    );

    // 6. Update invite usage count
    const newCurrentUses = currentUses + 1;
    const markUsed = maxUses > 0 && newCurrentUses >= maxUses;

    console.log('📈 [ACCEPT_INVITE] updating invite usage:', {
      currentUses,
      newCurrentUses,
      maxUses,
      markUsed,
    });

    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          group_id: groupId,
          group_data_members: inviteRowKey,
        },
        UpdateExpression: 'SET current_uses = :newUses, update_at = :now, used = :used',
        ExpressionAttributeValues: {
          ':newUses': newCurrentUses,
          ':now': now,
          ':used': markUsed,
        },
      })
    );

    // 7. Update metadata member/subscriber count
    const existingMaxUsers = Number(metadataItem.max_users || 0);
    const newMaxUsers = existingMaxUsers + 1;

    console.log('📈 [ACCEPT_INVITE] updating metadata max_users:', {
      existingMaxUsers,
      newMaxUsers,
    });

    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: metadataKey,
        UpdateExpression: 'SET max_users = :newMax, update_at = :now',
        ExpressionAttributeValues: {
          ':newMax': newMaxUsers,
          ':now': now,
        },
      })
    );

    console.log(`✅ [ACCEPT_INVITE] User ${userId} successfully joined group ${groupId}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: 'Successfully joined the group',
        groupId,
        userId,
        tokenId,
      }),
    };
  } catch (err) {
    console.error('❌ [ACCEPT_INVITE] Error joining group:', err);
    console.error('❌ [ACCEPT_INVITE] message:', err?.message);
    console.error('❌ [ACCEPT_INVITE] stack:', err?.stack);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to join group',
        details: err?.message || 'Unknown error',
      }),
    };
  }
};