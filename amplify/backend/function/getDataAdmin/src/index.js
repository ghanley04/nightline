const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({ region: "us-east-2" });

const membersTable = 'GroupData-dev';
const USER_POOL_ID = 'us-east-2_C36N1izcw';

async function getCognitoUser(userId) {
  try {
    const result = await cognito.send(new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: userId,
    }));
    const attrs = {};
    result.UserAttributes.forEach(a => attrs[a.Name] = a.Value);
    return {
      username: result.Username,
      email: attrs.email,
      phone: attrs.phone_number,
      name: attrs.name,
      created_at: result.UserCreateDate,
      status: result.UserStatus,
    };
  } catch (err) {
    console.error(`Failed to fetch Cognito user ${userId}:`, err.message);
    return null;
  }
}

exports.handler = async (event) => {
  try {
    const result = await dynamo.send(
      new ScanCommand({
        TableName: membersTable,
        FilterExpression: "begins_with(group_id, :greek)",
        ExpressionAttributeValues: { ":greek": "greek" },
      })
    );

    const items = result.Items || [];

    // Count members per group_id
    const memberCounts = {};
    items.forEach(item => {
      if (item.group_data_members?.startsWith('MEMBER#')) {
        memberCounts[item.group_id] = (memberCounts[item.group_id] || 0) + 1;
      }
    });

    // One card per INVITE# row
    const inviteRows = items.filter(item => item.group_data_members?.startsWith('INVITE#'));

    const greekGroups = await Promise.all(
      inviteRows.map(async (inv) => {
        const cognitoUser = inv.created_by
          ? await getCognitoUser(inv.created_by)
          : null;

        return {
          group_id: inv.group_id,
          invite_code: inv.invite_code,
          invite_link: inv.invite_link,
          email: inv.email,
          first_name: inv.first_name,
          last_name: inv.last_name,
          max_uses: inv.max_uses,
          current_uses: inv.current_uses,
          used: inv.used,
          active: inv.active,
          created_at: inv.created_at,
          created_by: inv.created_by,
          member_count: memberCounts[inv.group_id] || 0,
          stripe_customer_id: inv.stripe_customer_id || null, // ✅ added
          cognito_user: cognitoUser,
        };
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ greekGroups }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error", detail: err.message }),
    };
  }
};