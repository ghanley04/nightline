const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

/**
 * acceptInvite Lambda Function
 * Handles users accepting group invites and adds their info to DynamoDB
 * This is called when a user clicks an invite link and is authenticated
 */
exports.handler = async (event) => {
  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  const { groupId, userId, userName, email, phoneNumber } = body;

  // Validate inputs
  if (!groupId || !userId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Missing groupId or userId' }),
    };
  }

  // TODO: Verify JWT token from Authorization header to ensure userId matches authenticated user
  // const token = event.headers.Authorization?.replace('Bearer ', '');

  const tableName = 'GroupsData';

  try {
    // 1️⃣ Check if group exists and get group details
    const groupMetadata = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${groupId}`, SK: 'METADATA' },
    }));

    if (!groupMetadata.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Group not found' }),
      };
    }

    // 2️⃣ Check if user is already a member
    const existingMembership = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: {
        PK: `GROUP#${groupId}`,
        SK: `MEMBER#USER#${userId}`,
      },
    }));

    if (existingMembership.Item) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          message: 'User is already a member of this group',
          alreadyMember: true,
          groupId,
        }),
      };
    }

    // 3️⃣ Add user as a member with their complete info
    await dynamo.send(new PutCommand({
      TableName: tableName,
      Item: {
        PK: `GROUP#${groupId}`,
        SK: `MEMBER#USER#${userId}`,
        userId,
        groupId,
        userName: userName || 'Unknown User',
        email: email || null,
        phoneNumber: phoneNumber || null,
        joinedAt: new Date().toISOString(),
        membershipType: 'free', // vs 'paid' from Stripe webhook
        status: 'active',
      },
    }));

    // 4️⃣ Increment member count
    await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${groupId}`, SK: 'METADATA' },
      UpdateExpression: 'ADD memberCount :inc',
      ExpressionAttributeValues: { ':inc': 1 },
    }));

    console.log(`✅ User ${userId} successfully joined group ${groupId}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: `Successfully joined ${groupMetadata.Item.groupName || 'the group'}`,
        groupId,
        userId,
      }),
    };
  } catch (err) {
    console.error('❌ Error joining group:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to join group' }),
    };
  }
};
