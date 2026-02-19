const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TOKENS_TABLE = "Tokens";
const GROUPS_TABLE = "GroupsData";
const USER_INDEX = "user_id-index";

/**
 * validateToken Lambda Function
 * Validates a scanned QR code token and returns user/pass information
 * Uses the same logic as fetchMembership to verify active tokens
 */
exports.handler = async (event) => {
  console.log('🎫 [VALIDATE_TOKEN] Request received:', JSON.stringify(event));

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

  const { tokenId, timestamp } = body;

  if (!tokenId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Missing tokenId' }),
    };
  }

  try {
    // 1️⃣ Look up the token to get the user_id
    console.log('🔍 [VALIDATE_TOKEN] Looking up token:', tokenId);
    
    const tokenResult = await dynamo.send(
      new GetCommand({
        TableName: TOKENS_TABLE,
        Key: {
          token_id: tokenId,
        },
      })
    );

    const token = tokenResult.Item;

    if (!token) {
      console.log('❌ [VALIDATE_TOKEN] Token not found');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          valid: false,
          message: 'Token not found',
        }),
      };
    }

    const userId = token.user_id;
    const scannedTokenGroupId = token.group_id;

    // 2️⃣ Use fetchMembership logic to get all ACTIVE tokens for this user
    console.log('📋 [VALIDATE_TOKEN] Fetching membership for user:', userId);
    
    const membershipResult = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: USER_INDEX,
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "active = :active",
        ExpressionAttributeValues: { 
          ":uid": userId,
          ":active": true
        },
        ScanIndexForward: false,
      })
    );

    const activeTokens = membershipResult.Items || [];

    // 3️⃣ Check if the scanned token is in the list of active tokens
    const isTokenActive = activeTokens.some(t => t.token_id === tokenId);

    if (!isTokenActive) {
      console.log('❌ [VALIDATE_TOKEN] Token is not active');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          valid: false,
          message: 'This pass is no longer active',
        }),
      };
    }

    // 4️⃣ Check if user has any active membership at all
    if (activeTokens.length === 0) {
      console.log('❌ [VALIDATE_TOKEN] User has no active membership');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          valid: false,
          message: 'No active membership found',
        }),
      };
    }

    // 5️⃣ Validate QR code timestamp (optional - prevent replay attacks)
    // QR codes rotate hourly, so reject codes older than 2 hours
    if (timestamp) {
      const qrTimestamp = parseInt(timestamp);
      const now = Date.now();
      const twoHours = 2 * 60 * 60 * 1000;
      
      if (now - qrTimestamp > twoHours) {
        console.log('⚠️ [VALIDATE_TOKEN] QR code is too old');
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            valid: false,
            message: 'QR code has expired, please refresh pass',
          }),
        };
      }
    }

    // 6️⃣ Get user information from the membership record
    const groupId = scannedTokenGroupId;
    let userName = 'Guest';
    
    try {
      const memberResult = await dynamo.send(
        new GetCommand({
          TableName: GROUPS_TABLE,
          Key: {
            PK: `GROUP#${groupId}`,
            SK: `MEMBER#USER#${userId}`,
          },
        })
      );

      if (memberResult.Item) {
        userName = memberResult.Item.userName || 'Guest';
      }
    } catch (err) {
      console.warn('⚠️ [VALIDATE_TOKEN] Could not fetch user name:', err);
      // Continue with validation even if we can't get the name
    }

    // 7️⃣ Determine pass type from groupId
    const passType = getPassType(groupId);

    // 8️⃣ Return success
    console.log('✅ [VALIDATE_TOKEN] Token is valid');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        valid: true,
        userName,
        passType,
        groupId,
        userId,
        tokenId,
        activeTokenCount: activeTokens.length,
        message: 'Valid pass',
      }),
    };
  } catch (err) {
    console.error('❌ [VALIDATE_TOKEN] Error:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        valid: false,
        error: 'Failed to validate token',
      }),
    };
  }
};

/**
 * Helper function to determine pass type from groupId prefix
 */
function getPassType(groupId) {
  if (!groupId) return 'Unknown Pass';

  const prefix = groupId.slice(0, 3).toLowerCase();

  switch (prefix) {
    case 'ind':
      return 'Individual Pass';
    case 'nig':
      return 'Night Pass';
    case 'gre':
      return 'Greek Pass';
    case 'gro':
      return 'Group Pass';
    default:
      return 'Pass';
  }
}
