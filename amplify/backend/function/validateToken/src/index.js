const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TOKENS_TABLE = "Tokens";
// Was: "GroupsData". The actual table is "GroupData-dev" (no trailing 's',
// '-dev' suffix). Every other lambda points at the right name; this one was
// typo'd, which is why the username lookup below was silently failing and
// every scan rendered as "Guest" in the bus driver app.
const GROUPS_TABLE = "GroupData-dev";
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
    // 1️⃣ Look up the token to get the user_id.
    //
    // The Tokens table has a COMPOSITE primary key: (token_id, user_id).
    // The old code did a GetCommand with only { token_id: tokenId }, which
    // DynamoDB rejects with ValidationException ("The provided key element
    // does not match the schema") because a Get requires the full primary
    // key. That exception was being caught by the outer try/catch and turned
    // into `{ valid: false, error: 'Failed to validate token' }`, so every
    // single scan rendered as a red X in the bus-driver app — regardless of
    // plan type. We don't have the user_id at this point (the QR carries only
    // token_id), so we switch to a QueryCommand, which is allowed to use the
    // partition key alone.
    console.log('🔍 [VALIDATE_TOKEN] Looking up token:', tokenId);

    const tokenResult = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        KeyConditionExpression: "token_id = :tid",
        ExpressionAttributeValues: { ":tid": tokenId },
        Limit: 1,
      })
    );

    const token = tokenResult.Items?.[0];

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

    // 6️⃣ Get user information from the membership record.
    //
    // The GroupData-dev table is keyed by (group_id, group_data_members) with
    // values like "MEMBER#USER#<userId>" — not the "PK/SK" + "GROUP#" prefix
    // shape the old code was using. The old shape silently missed every
    // lookup, so userName always fell back to "Guest" even when validation
    // succeeded. Also note: the field stored on the row is `username` (and
    // first_name/last_name from manualAddMembership), not the camelCase
    // `userName` the old code read.
    const groupId = scannedTokenGroupId;
    let userName = 'Guest';

    try {
      const memberResult = await dynamo.send(
        new GetCommand({
          TableName: GROUPS_TABLE,
          Key: {
            group_id: groupId,
            group_data_members: `MEMBER#USER#${userId}`,
          },
        })
      );

      if (memberResult.Item) {
        const fullName = [memberResult.Item.first_name, memberResult.Item.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        userName =
          memberResult.Item.username ||
          fullName ||
          memberResult.Item.email ||
          'Guest';
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
