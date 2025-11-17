const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const MEMBERS_TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";
const USER_INDEX = "user_id-index"; // GSI with userId as PK

exports.handler = async (event) => {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId" }) };
  }

  try {
    // 1️⃣ Check membership
    const membershipResult = await dynamo.send(
      new GetCommand({
        TableName: MEMBERS_TABLE,
        Key: {
          group_id: `USER#${userId}`, // adjust if your PK is groupId instead
          group_data_members: `MEMBER#USER#${userId}`,
        },
      })
    );

    if (!membershipResult.Item) {
      return { statusCode: 200, body: JSON.stringify({ hasMembership: false }) };
    }

    // 2️⃣ Query all tokens for this user from GSI
    const tokenResult = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: USER_INDEX,
        KeyConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ScanIndexForward: false, // latest tokens first
      })
    );

    const tokens = tokenResult.Items || [];

    const response = {
      hasMembership: true,
      tokenCount: tokens.length,
      tokens,
    };

    return { statusCode: 200, body: JSON.stringify(response) };
  } catch (err) {
    console.error("❌ Error checking membership or tokens:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Server error" }) };
  }
};
