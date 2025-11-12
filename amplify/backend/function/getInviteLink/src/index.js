const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

// Create a DynamoDB client
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  // Parse body
  const { userId, groupId } = JSON.parse(event.body || "{}");
  const tableName = "GroupData-dev";

  if (!userId || !groupId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing userId or groupId" }),
    };
  }

  try {
    // Add user membership
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `GROUP#${groupId}`,
          SK: `MEMBER#USER#${userId}`,
          userId,
          groupId,
          createdAt: new Date().toISOString(),
        },
      })
    );

    // Increment group member count
    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: `GROUP#${groupId}`, SK: "METADATA" },
        UpdateExpression: "ADD memberCount :inc",
        ExpressionAttributeValues: { ":inc": 1 },
      })
    );

    // Create invite link record
    const inviteLink = `https://nightline.app/invite/${groupId}`;
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `GROUP#${groupId}`,
          SK: `INVITE#${groupId}`,
          inviteLink,
          groupId,
          createdAt: new Date().toISOString(),
        },
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, inviteLink }),
    };
  } catch (err) {
    console.error("❌ Error manually adding membership:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
