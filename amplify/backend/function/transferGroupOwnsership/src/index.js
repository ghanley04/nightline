/**
 * LAMBDA: transferGroupOwnership
 *
 * Transfers ownership of a greek/group subscription to another user.
 *
 * SAFETY NOTES:
 * - Verifies requesting user IS the current owner before doing anything
 * - Verifies new owner exists in Cognito and is an active member of the group
 * - Grants ownership to new owner BEFORE removing from old owner
 * - Never deletes anything — only sets is_owner flags
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

const TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";

exports.handler = async (event) => {
  console.log("📥 transfer-group-ownership event received");

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    const { currentOwnerId, newOwnerUsername, groupId } = body || {};

    if (!currentOwnerId || !newOwnerUsername || !groupId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Missing required fields: currentOwnerId, newOwnerUsername, groupId",
        }),
      };
    }

    const now = new Date().toISOString();

    // ── Step 1: Verify the requesting user is the current owner ───────────
    const ownerRecord = await dynamo.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${currentOwnerId}`,
        },
      })
    );

    if (!ownerRecord.Item) {
      return {
        statusCode: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Requesting user is not a member of this group",
        }),
      };
    }

    if (!ownerRecord.Item.is_owner) {
      return {
        statusCode: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Requesting user is not the owner of this group",
        }),
      };
    }

    // ── Step 2: Look up the new owner in Cognito ──────────────────────────
    let newOwnerId;
    try {
      const newOwnerCognitoUser = await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: process.env.USER_POOL_ID,
          Username: newOwnerUsername,
        })
      );
      newOwnerId = newOwnerCognitoUser.UserAttributes?.find(
        (a) => a.Name === "sub"
      )?.Value;
    } catch {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: `No Cognito user found for username: ${newOwnerUsername}`,
        }),
      };
    }

    if (!newOwnerId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "New owner Cognito user has no sub/user_id",
        }),
      };
    }

    if (newOwnerId === currentOwnerId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "New owner is the same as the current owner",
        }),
      };
    }

    // ── Step 3: Verify the new owner is an active member of this group ────
    const newOwnerMembership = await dynamo.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${newOwnerId}`,
        },
      })
    );

    if (!newOwnerMembership.Item || !newOwnerMembership.Item.active) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "New owner must be an active member of the group",
        }),
      };
    }

    // ── Step 4: Grant ownership to new owner BEFORE removing from old owner
    // WHY: If we remove first and the grant write fails, nobody owns the group.
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${newOwnerId}`,
        },
        UpdateExpression:
          "SET is_owner = :true, ownership_transferred_at = :now, update_at = :now",
        ExpressionAttributeValues: {
          ":true": true,
          ":now": now,
        },
      })
    );
    console.log(`✅ Ownership granted to ${newOwnerUsername} (${newOwnerId})`);

    // ── Step 5: Remove ownership from current owner ───────────────────────
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${currentOwnerId}`,
        },
        UpdateExpression:
          "SET is_owner = :false, ownership_transferred_at = :now, update_at = :now",
        ExpressionAttributeValues: {
          ":false": false,
          ":now": now,
        },
      })
    );
    console.log(`✅ Ownership removed from ${currentOwnerId}`);

    // ── Step 6: Update METADATA to reflect new owner ──────────────────────
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { group_id: groupId, group_data_members: "METADATA" },
        UpdateExpression:
          "SET owner_user_id = :newOwner, owner_username = :username, update_at = :now",
        ExpressionAttributeValues: {
          ":newOwner": newOwnerId,
          ":username": newOwnerUsername,
          ":now": now,
        },
      })
    );
    console.log("✅ METADATA updated with new owner");

    // ── Step 7: Update token is_owner flags ───────────────────────────────
    // Remove is_owner from old owner's tokens for this group
    const oldOwnerTokens = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "group_id = :gid AND active = :true",
        ExpressionAttributeValues: {
          ":uid": currentOwnerId,
          ":gid": groupId,
          ":true": true,
        },
      })
    );

    for (const token of oldOwnerTokens.Items || []) {
      await dynamo.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: token.token_id, user_id: token.user_id },
          UpdateExpression: "SET is_owner = :false, update_at = :now",
          ExpressionAttributeValues: { ":false": false, ":now": now },
        })
      );
    }

    // Grant is_owner on new owner's tokens for this group
    const newOwnerTokens = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "group_id = :gid AND active = :true",
        ExpressionAttributeValues: {
          ":uid": newOwnerId,
          ":gid": groupId,
          ":true": true,
        },
      })
    );

    for (const token of newOwnerTokens.Items || []) {
      await dynamo.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: token.token_id, user_id: token.user_id },
          UpdateExpression: "SET is_owner = :true, update_at = :now",
          ExpressionAttributeValues: { ":true": true, ":now": now },
        })
      );
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        message: `Ownership of group ${groupId} transferred to ${newOwnerUsername}`,
        newOwnerId,
        newOwnerUsername,
        groupId,
        timestamp: now,
      }),
    };
  } catch (err) {
    console.error("❌ Error in transfer-group-ownership:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: false, error: err.message, stack: undefined }),
    };
  }
};