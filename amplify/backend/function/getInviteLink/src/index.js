const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  const { groupId } = JSON.parse(event.body || "{}");
  const tableName = "GroupData-dev";

  if (!groupId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing groupId" }),
    };
  }

  try {
    // Query for invite records
    const result = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "group_id = :groupId AND begins_with(group_data_members, :invite)",
        ExpressionAttributeValues: {
          ":groupId": groupId,
          ":invite": "INVITE#",
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Invite link not found" }),
      };
    }

    const inviteLink = result.Items[0].invite_link;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, inviteLink }),
    };
  } catch (err) {
    console.error("❌ Error fetching invite link:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};