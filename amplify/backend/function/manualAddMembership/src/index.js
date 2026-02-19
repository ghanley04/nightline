const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

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
    groupId,
    maxSubscribers = "200", // For group/greek plans
  } = JSON.parse(event.body || "{}");
  
  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";

  // Validation
  if (!userId || !email || !firstName || !lastName || !groupId) {
    return { 
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: "Missing required fields: userId, email, firstName, lastName, groupId" }) 
    };
  }

  const createdAt = new Date().toISOString();
  const newPlan = getPlanTier(groupId);
  
  // Generate placeholder Stripe customer ID for manual additions
  const stripeCustomerId = `manual_${crypto.randomBytes(8).toString("hex")}`;

  console.log(`📋 Manual membership type: ${newPlan.type}`);

  try {
    // ✅ 1. Query existing active memberships for this user (same as Stripe webhook)
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

    // ✅ 2. Handle existing memberships (upgrade/downgrade/replace logic)
    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id;
      const existingPlan = getPlanTier(existingGroupId);
      const existingGroupIdLower = existingGroupId.toLowerCase();
      const isExistingNightPass = existingGroupIdLower.includes('night');
      const isExistingBusPass = existingGroupIdLower.includes('bus');
      const isExistingOneTimePass = isExistingNightPass || isExistingBusPass;

      // Skip if it's the exact same group
      if (existingGroupId === groupId) {
        console.log(`ℹ️ User already has membership to ${groupId}, skipping duplicate`);
        continue;
      }

      // 🎫 If existing membership is a ONE-TIME PASS: don't touch it
      if (isExistingOneTimePass) {
        console.log(`🎫 Keeping existing ${isExistingNightPass ? 'night' : 'bus'} pass: ${existingGroupId}`);
        continue;
      }

      // 💼 Handle subscription-to-subscription changes (individual/group/greek only)
      if (existingPlan.type === "individual" || existingPlan.type === "group" || existingPlan.type === "greek") {

        // UPGRADING OR SAME-TIER REPLACEMENT: Deactivate old membership
        if (newPlan.tier >= existingPlan.tier) {
          console.log(`⬆️ ${newPlan.tier > existingPlan.tier ? 'UPGRADING' : 'REPLACING'} from ${existingPlan.type} to ${newPlan.type}`);

          // Deactivate member record
          await updateIfExists({
            table: tableName,
            key: { group_id: existingGroupId, group_data_members: `MEMBER#USER#${userId}` },
            update: "SET active = :false, update_at = :now",
            values: { ":false": false, ":now": createdAt },
          });

          // Deactivate METADATA item
          await updateIfExists({
            table: tableName,
            key: { group_id: existingGroupId, group_data_members: `METADATA` },
            update: "SET active = :false, update_at = :now",
            values: { ":false": false, ":now": createdAt },
          });

          // Deactivate tokens for old membership (but NOT one-time passes)
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
        }
        // DOWNGRADING: Update METADATA to decrease subscriber count
        else if (newPlan.tier < existingPlan.tier) {
          console.log(`⬇️ DOWNGRADING from ${existingPlan.type} to ${newPlan.type}`);

          // Get current metadata
          const metadataResponse = await dynamo.send(
            new GetCommand({
              TableName: tableName,
              Key: { group_id: existingGroupId, group_data_members: "METADATA" },
            })
          );

          if (metadataResponse.Item) {
            const currentMaxSubscribers = parseInt(metadataResponse.Item.max_subscribers || "1");
            const newMaxSubscribers = Math.max(0, currentMaxSubscribers - 1);

            // Update metadata with decreased subscriber count
            await updateIfExists({
              table: tableName,
              key: { group_id: existingGroupId, group_data_members: `METADATA` },
              update: "SET max_subscribers = :newMax, update_at = :now",
              values: {
                ":newMax": newMaxSubscribers,
                ":now": createdAt
              },
            });

            console.log(`📉 Updated ${existingGroupId} max_subscribers: ${currentMaxSubscribers} → ${newMaxSubscribers}`);
          }
        }
      }
    }

    // ✅ 3. Add new membership (MEMBER#USER# item)
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
        manually_added: true, // Flag to indicate this was manually added by admin
      },
    }));

    console.log(`✅ Added membership for user ${userId} to group ${groupId}`);

    // ✅ 4. Check if METADATA already exists, create or update it
    const metadataCheck = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { 
        group_id: groupId, 
        group_data_members: "METADATA" 
      }
    }));

    if (metadataCheck.Item) {
      // METADATA exists, increment max_subscribers for group/greek
      if (newPlan.type === "group" || newPlan.type === "greek") {
        const currentMax = parseInt(metadataCheck.Item.max_subscribers || "0");
        const newMax = currentMax + parseInt(maxSubscribers);

        await dynamo.send(new UpdateCommand({
          TableName: tableName,
          Key: { 
            group_id: groupId, 
            group_data_members: "METADATA" 
          },
          UpdateExpression: "SET max_subscribers = :newMax, update_at = :now, active = :true",
          ExpressionAttributeValues: { 
            ":newMax": newMax,
            ":now": createdAt,
            ":true": true
          },
        }));

        console.log(`✅ Updated METADATA max_subscribers: ${currentMax} → ${newMax}`);
      }
    } else {
      // METADATA doesn't exist, create it
      await dynamo.send(new PutCommand({
        TableName: tableName,
        Item: {
          group_id: groupId,
          group_data_members: `METADATA`,
          created_at: createdAt,
          update_at: createdAt,
          active: true,
          max_subscribers: parseInt(maxSubscribers),
          plan_type: newPlan.type
        },
      }));

      console.log(`✅ Created METADATA for ${groupId} with max_subscribers: ${maxSubscribers}`);
    }

    // ✅ 5. Add new token for the user
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

    // ✅ 6. Generate invite link ONLY for group/greek memberships
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
          max_uses: parseInt(maxSubscribers), // How many people can use this invite
          current_uses: 0,
          email: email, // Associate invite with the person it was created for
          first_name: firstName,
          last_name: lastName,
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
        inviteLink: inviteLink,
        inviteCode: inviteCode,
        message: inviteLink 
          ? `Membership created with invite link for ${maxSubscribers} subscriber(s)`
          : "Membership created successfully",
        planType: newPlan.type,
        userId: userId,
        groupId: groupId,
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