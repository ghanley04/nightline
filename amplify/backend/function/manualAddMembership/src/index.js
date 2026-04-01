const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const crypto = require("crypto");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

function generateGroupId(type = "greek") {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 6);
  return `${type}_${timestamp}${random}`;
}

function getPlanTier(groupId) {
  const id = (groupId || "").toLowerCase();
  if (id.includes("individual")) return { type: "individual", tier: 1 };
  if (id.includes("group")) return { type: "group", tier: 2 };
  if (id.includes("greek")) return { type: "greek", tier: 3 };
  if (id.includes("night")) return { type: "night", tier: 0 };
  if (id.includes("bus")) return { type: "bus", tier: 0 };
  return { type: "unknown", tier: 0 };
}

async function updateIfExists({ table, key, update, values }) {
  console.log("🔎 updateIfExists called with:", JSON.stringify({ table, key, update, values }, null, 2));

  const exists = await dynamo.send(
    new GetCommand({
      TableName: table,
      Key: key,
    })
  );

  console.log("🔎 updateIfExists existing record:", JSON.stringify(exists.Item || null, null, 2));

  if (!exists.Item) {
    console.log("ℹ️ Skipping update — record does not exist:", JSON.stringify(key));
    return false;
  }

  const updateResult = await dynamo.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: update,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );

  console.log("✅ Updated record result:", JSON.stringify(updateResult.Attributes || {}, null, 2));
  return true;
}

exports.handler = async (event) => {
  console.log("📢 Received manual add membership event:");
  console.log(JSON.stringify(event, null, 2));

  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body || "{}");
    console.log("📦 Parsed request body:", JSON.stringify(parsedBody, null, 2));
  } catch (parseErr) {
    console.error("❌ Failed to parse event.body:", parseErr);
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Invalid JSON body",
        details: parseErr.message,
      }),
    };
  }

  const {
    username,
    email,
    firstName,
    lastName,
    phoneNumber,
    groupType = "greek",
    maxUsers = "200",
    stripeCustomerId: inputStripeCustomerId,
  } = parsedBody;

  console.log("🧾 Normalized incoming fields:", JSON.stringify({
    username,
    email,
    firstName,
    lastName,
    phoneNumber,
    groupType,
    maxUsers: maxUsers,
    stripeCustomerId: inputStripeCustomerId || null,
  }, null, 2));

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";

  if (!username || !email || !firstName || !lastName) {
    console.error("❌ Validation failed: missing required fields");
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Missing required fields: username, email, firstName, lastName",
      }),
    };
  }

  const stripeCustomerId =
    typeof inputStripeCustomerId === "string" ? inputStripeCustomerId.trim() : "";

  const createdAt = new Date().toISOString();

  console.log("🕒 Timestamp:", createdAt);
  console.log("🏷 groupType:", groupType);
  console.log("👤 username:", username);
  console.log("💳 stripeCustomerId provided:", !!stripeCustomerId);

  let cognitoUser;
  let cognitoAttrs = [];
  let actualUserId = null;

  try {
    console.log("🔐 Looking up Cognito user with AdminGetUser using username...");
    cognitoUser = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
      })
    );

    console.log("✅ Cognito user found");
    console.log("🔐 Cognito user response:", JSON.stringify(cognitoUser, null, 2));

    cognitoAttrs = cognitoUser.UserAttributes || [];
    actualUserId = cognitoAttrs.find((a) => a.Name === "sub")?.Value || null;

    console.log("🔐 Extracted Cognito sub / actual user_id:", actualUserId);

    if (!actualUserId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: "Cognito user found, but no sub/user_id was present",
        }),
      };
    }
  } catch (err) {
    console.error("❌ Cognito lookup failed");
    console.error("❌ Error object:", err);
    console.error("❌ Error message:", err.message);
    console.error("❌ Error stack:", err.stack);

    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "No Cognito user found for the provided username",
        details: err.message,
      }),
    };
  }

  try {
    const cognitoStripeId =
      cognitoAttrs.find((a) => a.Name === "custom:stripe_customer_id")?.Value?.trim() || "";

    console.log("🔐 Cognito stripe ID:", cognitoStripeId || "(empty)");

    if (stripeCustomerId) {
      if (cognitoStripeId && cognitoStripeId !== stripeCustomerId) {
        console.warn(`⚠️ Stripe ID mismatch — Cognito: ${cognitoStripeId}, Input: ${stripeCustomerId}`);
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: "stripeCustomerId does not match the user's Cognito record",
            cognitoStripeCustomerId: cognitoStripeId,
            providedStripeCustomerId: stripeCustomerId,
          }),
        };
      }

      if (!cognitoStripeId) {
        console.log("📝 No Cognito stripe ID found. Writing provided stripeCustomerId...");
        const updateResp = await cognito.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: username,
            UserAttributes: [
              { Name: "custom:stripe_customer_id", Value: stripeCustomerId },
            ],
          })
        );
        console.log("✅ AdminUpdateUserAttributes response:", JSON.stringify(updateResp, null, 2));
      } else {
        console.log("✅ Stripe customer ID verified");
      }
    } else {
      console.log("ℹ️ No stripeCustomerId provided; skipping Stripe verification/write");
    }
  } catch (err) {
    console.error("❌ Cognito stripe verification/update failed");
    console.error("❌ Error object:", err);
    console.error("❌ Error message:", err.message);
    console.error("❌ Error stack:", err.stack);

    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Cognito stripe verification/update failed",
        details: err.message,
      }),
    };
  }

  const groupId = generateGroupId(groupType);
  const newPlan = getPlanTier(groupId);

  console.log("🆕 Generated groupId:", groupId);
  console.log("🆕 Plan tier object:", JSON.stringify(newPlan, null, 2));
  console.log("🆔 Will write actual user_id to DB:", actualUserId);

  try {
    console.log("🔎 Querying active memberships for actual user_id...");
    const membershipsQueryInput = {
      TableName: tableName,
      IndexName: "user_id-index",
      KeyConditionExpression: "user_id = :userId",
      FilterExpression: "active = :true",
      ExpressionAttributeValues: {
        ":userId": actualUserId,
        ":true": true,
      },
    };
    console.log("🔎 membershipsQuery input:", JSON.stringify(membershipsQueryInput, null, 2));

    const membershipsQuery = await dynamo.send(new QueryCommand(membershipsQueryInput));
    const activeMemberships = membershipsQuery.Items || [];

    console.log(`📋 Found ${activeMemberships.length} active membership(s) for user ${actualUserId}`);
    console.log("📋 Active memberships:", JSON.stringify(activeMemberships, null, 2));

    for (const membership of activeMemberships) {
      console.log("🔁 Evaluating existing membership:", JSON.stringify(membership, null, 2));

      const existingGroupId = membership.group_id;
      const existingPlan = getPlanTier(existingGroupId);
      const existingGroupIdLower = (existingGroupId || "").toLowerCase();
      const isExistingNightPass = existingGroupIdLower.includes("night");
      const isExistingBusPass = existingGroupIdLower.includes("bus");
      const isExistingOneTimePass = isExistingNightPass || isExistingBusPass;

      console.log("🔁 Existing group analysis:", JSON.stringify({
        existingGroupId,
        existingPlan,
        isExistingNightPass,
        isExistingBusPass,
        isExistingOneTimePass,
      }, null, 2));

      if (existingGroupId === groupId) {
        console.log(`ℹ️ User already has membership to ${groupId}, skipping duplicate`);
        continue;
      }

      if (isExistingOneTimePass) {
        console.log(`🎫 Keeping existing ${isExistingNightPass ? "night" : "bus"} pass: ${existingGroupId}`);
        continue;
      }

      if (
        existingPlan.type === "individual" ||
        existingPlan.type === "group" ||
        existingPlan.type === "greek"
      ) {
        if (newPlan.tier >= existingPlan.tier) {
          console.log(`⬆️ ${newPlan.tier > existingPlan.tier ? "UPGRADING" : "REPLACING"} from ${existingPlan.type} to ${newPlan.type}`);

          await updateIfExists({
            table: tableName,
            key: {
              group_id: existingGroupId,
              group_data_members: `MEMBER#USER#${actualUserId}`,
            },
            update: "SET active = :false, update_at = :now",
            values: {
              ":false": false,
              ":now": createdAt,
            },
          });

          await updateIfExists({
            table: tableName,
            key: {
              group_id: existingGroupId,
              group_data_members: "METADATA",
            },
            update: "SET active = :false, update_at = :now",
            values: {
              ":false": false,
              ":now": createdAt,
            },
          });

          const oldTokensQueryInput = {
            TableName: tokenTableName,
            IndexName: "user_id-index",
            KeyConditionExpression: "user_id = :userId",
            FilterExpression:
              "group_id = :oldGroup AND NOT contains(group_id, :nightStr) AND NOT contains(group_id, :busStr) AND active = :true",
            ExpressionAttributeValues: {
              ":userId": actualUserId,
              ":oldGroup": existingGroupId,
              ":nightStr": "night",
              ":busStr": "bus",
              ":true": true,
            },
          };

          console.log("🔎 oldTokensQuery input:", JSON.stringify(oldTokensQueryInput, null, 2));

          const oldTokensQuery = await dynamo.send(new QueryCommand(oldTokensQueryInput));
          console.log("🔎 oldTokensQuery result:", JSON.stringify(oldTokensQuery.Items || [], null, 2));

          for (const token of oldTokensQuery.Items || []) {
            console.log("🪙 Deactivating old token:", JSON.stringify(token, null, 2));
            await updateIfExists({
              table: tokenTableName,
              key: {
                token_id: token.token_id,
                user_id: token.user_id,
              },
              update: "SET active = :false, ended_at = :now",
              values: {
                ":false": false,
                ":now": createdAt,
              },
            });
          }
        } else if (newPlan.tier < existingPlan.tier) {
          console.log(`⬇️ DOWNGRADING from ${existingPlan.type} to ${newPlan.type}`);

          const metadataKey = {
            group_id: existingGroupId,
            group_data_members: "METADATA",
          };

          console.log("🔎 Fetching existing metadata:", JSON.stringify(metadataKey, null, 2));

          const metadataResponse = await dynamo.send(
            new GetCommand({
              TableName: tableName,
              Key: metadataKey,
            })
          );

          console.log("🔎 Existing metadata response:", JSON.stringify(metadataResponse.Item || null, null, 2));

          if (metadataResponse.Item) {
            const currentMaxUsers = parseInt(
              metadataResponse.Item.max_users || "1",
              10
            );
            const newMaxUsers = Math.max(0, currentMaxUsers - 1);

            await updateIfExists({
              table: tableName,
              key: metadataKey,
              update: "SET max_users = :newMax, update_at = :now",
              values: {
                ":newMax": newMaxUsers,
                ":now": createdAt,
              },
            });

            console.log(`📉 Updated ${existingGroupId} max_users: ${currentMaxUsers} → ${newMaxUsers}`);
          }
        }
      }
    }

    const memberItem = {
      group_id: groupId,
      group_data_members: `MEMBER#USER#${actualUserId}`,
      user_id: actualUserId,
      username,
      stripe_customer_id: stripeCustomerId || null,
      email,
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber || null,
      created_at: createdAt,
      update_at: createdAt,
      active: true,
      manually_added: true,
    };

    console.log("📝 Writing MEMBER item:", JSON.stringify(memberItem, null, 2));
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: memberItem,
      })
    );
    console.log(`✅ Added membership for actual user_id ${actualUserId} to group ${groupId}`);

    const metadataKey = {
      group_id: groupId,
      group_data_members: "METADATA",
    };

    console.log("🔎 Checking METADATA item:", JSON.stringify(metadataKey, null, 2));
    const metadataCheck = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: metadataKey,
      })
    );
    console.log("🔎 metadataCheck result:", JSON.stringify(metadataCheck.Item || null, null, 2));

    if (metadataCheck.Item) {
      if (newPlan.type === "group" || newPlan.type === "greek") {
        const currentMax = parseInt(metadataCheck.Item.max_users || "0", 10);
        const newMax = currentMax + parseInt(maxUsers, 10);

        const metadataUpdateInput = {
          TableName: tableName,
          Key: metadataKey,
          UpdateExpression:
            "SET max_users = :newMax, update_at = :now, active = :true, stripe_customer_id = :cid",
          ExpressionAttributeValues: {
            ":newMax": newMax,
            ":now": createdAt,
            ":true": true,
            ":cid": stripeCustomerId || null,
          },
          ReturnValues: "ALL_NEW",
        };

        console.log("📝 Updating METADATA item:", JSON.stringify(metadataUpdateInput, null, 2));
        const metadataUpdateResp = await dynamo.send(new UpdateCommand(metadataUpdateInput));
        console.log("✅ METADATA update result:", JSON.stringify(metadataUpdateResp.Attributes || {}, null, 2));
      }
    } else {
      const metadataItem = {
        group_id: groupId,
        group_data_members: "METADATA",
        created_at: createdAt,
        update_at: createdAt,
        active: true,
        max_users: parseInt(maxUsers, 10),
        plan_type: newPlan.type,
        stripe_customer_id: stripeCustomerId || null,
      };

      console.log("📝 Creating METADATA item:", JSON.stringify(metadataItem, null, 2));
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: metadataItem,
        })
      );
      console.log(`✅ Created METADATA for ${groupId} with max_users: ${maxUsers}`);
    }

    const tokenId = crypto.randomBytes(16).toString("hex");
    const tokenItem = {
      token_id: tokenId,
      user_id: actualUserId,
      username,
      group_id: groupId,
      stripe_customer_id: stripeCustomerId || null,
      email,
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber || null,
      plan_type: newPlan.type,
      created_at: createdAt,
      active: true,
      manually_added: true,
    };

    console.log("📝 Creating token item:", JSON.stringify(tokenItem, null, 2));
    await dynamo.send(
      new PutCommand({
        TableName: tokenTableName,
        Item: tokenItem,
      })
    );
    console.log(`✅ Created token ${tokenId} for actual user_id ${actualUserId}`);

    let inviteLink = null;
    let inviteCode = null;

    if (newPlan.type === "group" || newPlan.type === "greek") {
      inviteCode = crypto.randomBytes(6).toString("hex");
      inviteLink = `https://nightline.app/invite/${inviteCode}`;

      const inviteItem = {
        group_id: groupId,
        group_data_members: `INVITE#${inviteCode}`,
        invite_code: inviteCode,
        created_by: actualUserId,
        created_by_username: username,
        created_at: createdAt,
        used: false,
        invite_link: inviteLink,
        active: true,
        max_uses: parseInt(maxUsers, 10),
        current_uses: 1, // Start at 1 since the creator is effectively the first user
        email,
        first_name: firstName,
        last_name: lastName,
        stripe_customer_id: stripeCustomerId || null,
      };

      console.log("📝 Creating invite item:", JSON.stringify(inviteItem, null, 2));
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: inviteItem,
        })
      );

      console.log(`✅ Created invite link for group ${groupId}: ${inviteLink}`);
    }

    const successBody = {
      success: true,
      inviteLink,
      inviteCode,
      stripeCustomerId: stripeCustomerId || null,
      groupId,
      message: inviteLink
        ? `Membership created with invite link for ${maxUsers} user(s)`
        : "Membership created successfully",
      planType: newPlan.type,
      username,
      userId: actualUserId,
    };

    console.log("✅ Returning success response:", JSON.stringify(successBody, null, 2));

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(successBody),
    };
  } catch (err) {
    console.error("❌ Error manually adding membership");
    console.error("❌ Full error object:", err);
    console.error("❌ Error message:", err.message);
    console.error("❌ Error stack:", err.stack);

    const errorBody = {
      error: "Internal server error",
      details: err.message,
    };

    console.error("❌ Returning error response:", JSON.stringify(errorBody, null, 2));

    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(errorBody),
    };
  }
};