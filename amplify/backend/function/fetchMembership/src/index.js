const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TOKENS_TABLE = "Tokens";
const USER_INDEX = "user_id-index";

exports.handler = async (event) => {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId" }) };
  }

  try {
    // Query all ACTIVE tokens for this user
    const tokenResult = await dynamo.send(
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

    const tokens = tokenResult.Items || [];

    if (tokens.length === 0) {
      return { 
        statusCode: 200, 
        body: JSON.stringify({ 
          hasMembership: false,
          tokenCount: 0,
          tokens: []
        }) 
      };
    }

    // Use the first token's group_id as the primary groupId
    const groupId = tokens[0].group_id;

    return {
      statusCode: 200,
      body: JSON.stringify({
        hasMembership: true,
        groupId,
        tokenCount: tokens.length,
        tokens,
      }),
    };
  } catch (err) {
    console.error("Error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};