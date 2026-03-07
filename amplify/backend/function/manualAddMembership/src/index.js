const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

// Helper: Generate a unique group ID matching stripeCheckout format
function generateGroupId(type = 'group') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 6);
  return `${type}_${timestamp}${random}`;
}

// Helper: Get plan tier for comparison
function getPlanTier(groupId) {
  const id = groupId.toLowerCase();
  if (id.includes("individual")) return { type: "individual", tier: 1 };
  if (id.includes("group")) return { type: "group", tier: 2 };
  if (id.includes("greek")) return { type: "greek", tier: 3 };
  if (id.includes("night")) return { type: "night", tier: 0 };
  if (id.includes("bus")) return { type: "bus", tier: 0 };
  return { type: "unknown", tier: 0 };
}

// Helper: Only update if record exists
async function updateIfExists({ table, key, update, values }) {
  const exists = await dynamo.send(
    new GetCommand({ TableName: table, Key: key })
  );

  if (!exists.Item) {
    console.log("ℹ️ Skipping update — record does not exist:", key);
    return false;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: update,
      ExpressionAttributeValues: values
    })
  );

  console.log("✅ Updated record:", key);
  return true;
}

exports.handler = async (event) => {
  console.log("📢 Received manual add membership event:", JSON.stringify(event, null, 2));

  const {
    userId,
    email,
    firstName,
    lastName,
    phoneNumber,
    groupType,           // ✅ now accepts groupType instead of groupId
    maxSubscribers = "200",
    stripeCustomerId: inputStripeCustomerId,
  } = JSON.parse(event.body || "{}");

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";

  // Validation
  if (!userId || !email || !firstName || !lastName || !groupType) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: "Missing required fields: userId, email, firstName, lastName, groupType" })
    };
  }

  const createdAt = new Date().toISOString();

  // ✅ Generate group ID the same way stripeCheckout does
  const groupId = generateGroupId(groupType);
  const newPlan = getPlanTier(groupId);

  // ✅ Use provided Stripe customer ID or generate a manual placeholder
  const stripeCustomerId = inputStripeCustomerId
    ? inputStripeCustomerId.trim()
    : `manual_${crypto.randomBytes(8).toString("hex")}`;

  console.log(`📋 Manual membership type: ${newPlan.type}`);
  console.log(`🆔 Generated group ID: ${groupId}`);
  console.log(`💳 Stripe customer ID: ${stripeCustomerId}`);

  try {
    // 1. Query existing active memberships for this user
    const membershipsQuery = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :userId",
        FilterExpression: "active = :true",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":true": true,
        },
      })
    );

    const activeMemberships = membershipsQuery.Items || [];
    console.log(`📋 Found ${activeMemberships.length} active membership(s) for user ${userId}`);

    // 2. Handle existing memberships
    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id;
      const existingPlan = getPlanTier(existingGroupId);
      const existingGroupIdLower = existingGroupId.toLowerCase();
      const isExistingNightPass = existingGroupIdLower.includes('night');
      const isExistingBusPass = existingGroupIdLower.includes('bus');
      const isExistingOneTimePass = isExistingNightPass || isExistingBusPass;

      if (existingGroupId === groupId) {
        console.log(`ℹ️ User already has membership to ${groupId}, skipping duplicate`);
        continue;
      }

      if (isExistingOneTimePass) {
        console.log(`🎫 Keeping existing ${isExistingNightPass ? 'night' : 'bus'} pass: ${existingGroupId}`);
        continue;
      }

      if (existingPlan.type === "individual" || existingPlan.type === "group" || existingPlan.type === "greek") {
        if (newPlan.tier >= existingPlan.tier) {
          console.log(`⬆️ ${newPlan.tier > existingPlan.tier ? 'UPGRADING' : 'REPLACING'} from ${existingPlan.type} to ${newPlan.type}`);

          await updateIfExists({
            table: tableName,
            key: { group_id: existingGroupId, group_data_members: `MEMBER#USER#${userId}` },
            update: "SET active = :false, update_at = :now",
            values: { ":false": false, ":now": createdAt },
          });

          await updateIfExists({
            table: tableName,
            key: { group_id: existingGroupId, group_data_members: `METADATA` },
            update: "SET active = :false, update_at = :now",
            values: { ":false": false, ":now": createdAt },
          });

          const oldTokensQuery = await dynamo.send(
            new QueryCommand({
              TableName: tokenTableName,
              IndexName: "user_id-index",
              KeyConditionExpression: "user_id = :userId",
              FilterExpression: "group_id = :oldGroup AND NOT contains(group_id, :nightStr) AND NOT contains(group_id, :busStr) AND active = :true",
              ExpressionAttributeValues: {
                ":userId": userId,
                ":oldGroup": existingGroupId,
                ":nightStr": "night",
                ":busStr": "bus",
                ":true": true,
              },
            })
          );

          for (const token of oldTokensQuery.Items || []) {
            await updateIfExists({
              table: tokenTableName,
              key: { token_id: token.token_id, user_id: token.user_id },
              update: "SET active = :false, ended_at = :now",
              values: { ":false": false, ":now": createdAt },
            });
          }
        } else if (newPlan.tier < existingPlan.tier) {
          console.log(`⬇️ DOWNGRADING from ${existingPlan.type} to ${newPlan.type}`);

          const metadataResponse = await dynamo.send(
            new GetCommand({
              TableName: tableName,
              Key: { group_id: existingGroupId, group_data_members: "METADATA" },
            })
          );

          if (metadataResponse.Item) {
            const currentMaxSubscribers = parseInt(metadataResponse.Item.max_subscribers || "1");
            const newMaxSubscribers = Math.max(0, currentMaxSubscribers - 1);

            await updateIfExists({
              table: tableName,
              key: { group_id: existingGroupId, group_data_members: `METADATA` },
              update: "SET max_subscribers = :newMax, update_at = :now",
              values: { ":newMax": newMaxSubscribers, ":now": createdAt },
            });

            console.log(`📉 Updated ${existingGroupId} max_subscribers: ${currentMaxSubscribers} → ${newMaxSubscribers}`);
          }
        }
      }
    }

    // 3. Add new membership (MEMBER#USER# item)
    await dynamo.send(new PutCommand({
      TableName: tableName,
      Item: {
        group_id: groupId,
        group_data_members: `MEMBER#USER#${userId}`,
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        email: email,
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber || null,
        created_at: createdAt,
        update_at: createdAt,
        active: true,
        manually_added: true,
      },
    }));

    console.log(`✅ Added membership for user ${userId} to group ${groupId}`);

    // 4. Check if METADATA already exists, create or update it
    const metadataCheck = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { group_id: groupId, group_data_members: "METADATA" }
    }));

    if (metadataCheck.Item) {
      if (newPlan.type === "group" || newPlan.type === "greek") {
        const currentMax = parseInt(metadataCheck.Item.max_subscribers || "0");
        const newMax = currentMax + parseInt(maxSubscribers);

        await dynamo.send(new UpdateCommand({
          TableName: tableName,
          Key: { group_id: groupId, group_data_members: "METADATA" },
          UpdateExpression: "SET max_subscribers = :newMax, update_at = :now, active = :true, stripe_customer_id = :cid",
          ExpressionAttributeValues: {
            ":newMax": newMax,
            ":now": createdAt,
            ":true": true,
            ":cid": stripeCustomerId,
          },
        }));

        console.log(`✅ Updated METADATA max_subscribers: ${currentMax} → ${newMax}`);
      }
    } else {
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: {
          group_id: groupId,
          group_data_members: `METADATA`,
          created_at: createdAt,
          update_at: createdAt,
          active: true,
          max_subscribers: parseInt(maxSubscribers),
          plan_type: newPlan.type,
          stripe_customer_id: stripeCustomerId,
        },
      }));

      console.log(`✅ Created METADATA for ${groupId} with max_subscribers: ${maxSubscribers}`);
    }

    // 5. Add new token for the user
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(new PutCommand({
      TableName: tokenTableName,
      Item: {
        token_id: tokenId,
        user_id: userId,
        group_id: groupId,
        stripe_customer_id: stripeCustomerId,
        created_at: createdAt,
        active: true,
      },
    }));

    console.log(`✅ Created token ${tokenId} for user ${userId}`);

    // 6. Generate invite link ONLY for group/greek memberships
    let inviteLink = null;
    let inviteCode = null;

    if (newPlan.type === "group" || newPlan.type === "greek") {
      inviteCode = crypto.randomBytes(6).toString("hex");
      inviteLink = `https://nightline.app/invite/${inviteCode}`;

      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: {
          group_id: groupId,
          group_data_members: `INVITE#${inviteCode}`,
          invite_code: inviteCode,
          created_by: userId,
          created_at: createdAt,
          used: false,
          invite_link: inviteLink,
          active: true,
          max_uses: parseInt(maxSubscribers),
          current_uses: 0,
          email: email,
          first_name: firstName,
          last_name: lastName,
          stripe_customer_id: stripeCustomerId,
        },
      }));

      console.log(`✅ Created invite link for group ${groupId}: ${inviteLink}`);
    }

    console.log("✅ Successfully processed manual membership addition");

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        inviteLink,
        inviteCode,
        stripeCustomerId,
        groupId, // ✅ return generated groupId to caller
        message: inviteLink
          ? `Membership created with invite link for ${maxSubscribers} subscriber(s)`
          : "Membership created successfully",
        planType: newPlan.type,
        userId,
      })
    };

  } catch (err) {
    console.error("❌ Error manually adding membership:", err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: "Internal server error",
        details: err.message
      })
    };
  }
};