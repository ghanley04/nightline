/* Amplify Params - DO NOT EDIT
	API_APINIGHTLINE_APIID
	API_APINIGHTLINE_APINAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const MEMBERS_TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";
const USER_INDEX = "user_id-index";

exports.handler = async (event) => {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing userId" }) };
  }

  try {
    // 1️⃣ Check membership via GSI
    const membershipResult = await dynamo.send(
      new QueryCommand({
        TableName: MEMBERS_TABLE,
        IndexName: USER_INDEX,
        KeyConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        Limit: 1,
      })
    );

    if (!membershipResult.Items || membershipResult.Items.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ hasMembership: false }) };
    }

    const groupId = membershipResult.Items[0].group_id;

    // 2️⃣ Query all tokens for this user
    const tokenResult = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: USER_INDEX,
        KeyConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ScanIndexForward: false,
      })
    );

    const tokens = tokenResult.Items || [];

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