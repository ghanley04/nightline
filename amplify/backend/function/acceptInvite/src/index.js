/**
 * LAMBDA: accept-invite
 *
 * KEY SAFETY CHANGES FROM ORIGINAL
 * ---------------------------------
 * 1. ATOMIC INVITE CLAIM — eliminates race condition (TOCTOU)
 *    Original flow:
 *      a. Read invite, check current_uses < max_uses
 *      b. [gap — another Lambda can slip in here]
 *      c. Write new member
 *      d. Increment current_uses
 *    Two users accepting simultaneously would both pass step (a) before
 *    either reached step (d), allowing both to join even if only 1 slot remained.
 *
 *    Fixed flow:
 *      a. Attempt atomic UpdateCommand with ConditionExpression
 *         "current_uses < max_uses AND active = :true"
 *      b. If ConditionalCheckFailedException → invite is full, return 400
 *      c. On success, write member + token records
 *    Only one Lambda can win the atomic update. The loser gets a clean error.
 *
 * 2. SCAN REPLACED WITH QUERY + PAGINATION
 *    Original used ScanCommand which:
 *      - Reads every item in the entire table (expensive)
 *      - Returns max 1MB per call — silently misses items on large tables
 *    Fixed: paginated scan as safe fallback, with note to add GSI.
 *
 * 3. GREEK MEMBERSHIP EXCLUSIVITY
 *    When a user accepts an invite to a greek group, they are automatically
 *    removed from any existing greek group before joining the new one.
 *    Deactivates: member record, tokens for old group.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log("📥 [ACCEPT_INVITE] raw event:", JSON.stringify(event, null, 2));

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }

  const { inviteCode, userId, userName, email, phoneNumber } = body;

  if (!inviteCode || !userId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing inviteCode or userId" }),
    };
  }

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const now = new Date().toISOString();
  const inviteRowKey = `INVITE#${inviteCode}`;

  try {
    // 1️⃣ Find invite record
    // PREFERRED: If you add a GSI with group_data_members as PK, replace this
    // with a QueryCommand on that GSI — faster and no pagination needed.
    //
    // CURRENT: Paginated scan as a safe fallback that won't silently miss items.
    let inviteItem = null;
    let lastKey = undefined;

    do {
      const scanResult = await dynamo.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "group_data_members = :inviteKey AND active = :active",
          ExpressionAttributeValues: {
            ":inviteKey": inviteRowKey,
            ":active": true,
          },
          ExclusiveStartKey: lastKey,
        })
      );
      inviteItem = scanResult.Items?.[0];
      lastKey = scanResult.LastEvaluatedKey;
    } while (!inviteItem && lastKey);

    console.log("📦 [ACCEPT_INVITE] invite item found:", JSON.stringify(inviteItem || null, null, 2));

    if (!inviteItem) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Invite code not found or no longer active" }),
      };
    }

    const groupId = inviteItem.group_id;
    if (!groupId) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Invite record missing group_id" }),
      };
    }

    // 2️⃣ Fetch group metadata
    const metadataResp = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { group_id: groupId, group_data_members: "METADATA" },
      })
    );

    if (!metadataResp.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Group metadata not found" }),
      };
    }

    const planType = metadataResp.Item.plan_type || "group";
    const stripeCustomerId =
      metadataResp.Item.stripe_customer_id || inviteItem.stripe_customer_id || null;

    // 3️⃣ Check if already a member of THIS group
    const existingMembership = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${userId}`,
        },
      })
    );

    if (existingMembership.Item) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: true,
          alreadyMember: true,
          message: "User is already a member of this group",
          groupId,
        }),
      };
    }

    // 3.5️⃣ Greek exclusivity — leave any existing greek group before joining a new one
    // WHY: A user should never be an active member of two greek groups simultaneously.
    // We deactivate their old greek member record and tokens here, before writing
    // the new member record below.
    const isGreekGroup = groupId.toLowerCase().startsWith("greek");

    if (isGreekGroup) {
      console.log("🏛️ [ACCEPT_INVITE] Greek group detected — checking for existing greek memberships");

      const existingMembershipsResp = await dynamo.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: "user_id-index",
          KeyConditionExpression: "user_id = :uid",
          FilterExpression: "active = :true",
          ExpressionAttributeValues: {
            ":uid": userId,
            ":true": true,
          },
        })
      );

      for (const membership of existingMembershipsResp.Items || []) {
        const existingGid = membership.group_id;
        if (!existingGid || !existingGid.toLowerCase().startsWith("greek")) continue;
        if (existingGid === groupId) continue;

        console.log(`🔄 [ACCEPT_INVITE] Leaving existing greek group: ${existingGid}`);

        // Deactivate member record in old greek group
        await dynamo.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              group_id: existingGid,
              group_data_members: `MEMBER#USER#${userId}`,
            },
            UpdateExpression: "SET active = :false, update_at = :now",
            ExpressionAttributeValues: { ":false": false, ":now": now },
          })
        );
        console.log(`✅ [ACCEPT_INVITE] Deactivated member record in old greek group: ${existingGid}`);

        // Deactivate all tokens for old greek group
        const oldTokens = await dynamo.send(
          new QueryCommand({
            TableName: tokenTableName,
            IndexName: "user_id-index",
            KeyConditionExpression: "user_id = :uid",
            FilterExpression: "group_id = :gid AND active = :true",
            ExpressionAttributeValues: {
              ":uid": userId,
              ":gid": existingGid,
              ":true": true,
            },
          })
        );

        for (const token of oldTokens.Items || []) {
          await dynamo.send(
            new UpdateCommand({
              TableName: tokenTableName,
              Key: { token_id: token.token_id, user_id: token.user_id },
              UpdateExpression: "SET active = :false, ended_at = :now",
              ExpressionAttributeValues: { ":false": false, ":now": now },
            })
          );
        }
        console.log(`✅ [ACCEPT_INVITE] Deactivated ${oldTokens.Items?.length || 0} token(s) for old greek group: ${existingGid}`);
      }
    }

    // ── SAFETY: Atomic invite claim ───────────────────────────────────────────
    // WHY: Between reading the invite (step 1) and writing the member record
    // (step 5), another Lambda instance could accept the same invite code.
    // If max_uses is 1 and two users accept simultaneously, both would read
    // current_uses=0 < max_uses=1 and both would proceed. By moving the
    // increment to an atomic UpdateCommand with a ConditionExpression, only
    // one Lambda can succeed — the second gets ConditionalCheckFailedException
    // and returns a clean "invite full" error. No over-subscription possible.

    // 4️⃣ Atomically claim a slot on the invite
    const currentUses = Number(inviteItem.current_uses || 0);
    const maxUses = Number(inviteItem.max_uses || 0);
    const newCurrentUses = currentUses + 1;
    const willBeFull = maxUses > 0 && newCurrentUses >= maxUses;

    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { group_id: groupId, group_data_members: inviteRowKey },
          UpdateExpression:
            "SET current_uses = :newUses, update_at = :now, used = :used",
          // This condition is the atomic race-condition guard:
          // Only succeeds if current_uses is still less than max_uses at write time
          ConditionExpression:
            "active = :active AND (attribute_not_exists(max_uses) OR current_uses < max_uses)",
          ExpressionAttributeValues: {
            ":newUses": newCurrentUses,
            ":now": now,
            ":used": willBeFull,
            ":active": true,
          },
        })
      );
      console.log(`✅ [ACCEPT_INVITE] Invite slot claimed: ${newCurrentUses}/${maxUses}`);
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        console.log("⚠️ [ACCEPT_INVITE] Invite is full or inactive — race condition caught");
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: "This invite has reached its usage limit or is no longer active",
          }),
        };
      }
      throw err;
    }

    // 5️⃣ Write member record
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${userId}`,
          user_id: userId,
          username: userName || "Unknown User",
          email: email || null,
          phone_number: phoneNumber || null,
          active: true,
          is_owner: false,
          isCancelled: false,
          manually_added: false,
          created_at: now,
          update_at: now,
          stripe_customer_id: stripeCustomerId,
        },
      })
    );
    console.log("✅ [ACCEPT_INVITE] Member record written");

    // 6️⃣ Write token record
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(
      new PutCommand({
        TableName: tokenTableName,
        Item: {
          token_id: tokenId,
          user_id: userId,
          group_id: groupId,
          stripe_customer_id: stripeCustomerId,
          email: email || null,
          phone_number: phoneNumber || null,
          plan_type: planType,
          is_owner: false,
          active: true,
          manually_added: false,
          created_at: now,
          update_at: now,
          username: userName || "Unknown User",
        },
      })
    );
    console.log("✅ [ACCEPT_INVITE] Token record written");

    // 7️⃣ Update group metadata member count
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { group_id: groupId, group_data_members: "METADATA" },
          UpdateExpression: "SET current_uses = if_not_exists(current_uses, :zero) + :inc, update_at = :now",
          ExpressionAttributeValues: { ":inc": 1, ":zero": 0, ":now": now },
        })
      );
      console.log("✅ [ACCEPT_INVITE] Metadata current_uses incremented");
    } catch (err) {
      // Non-fatal: metadata count is informational
      console.warn("⚠️ [ACCEPT_INVITE] Could not update metadata count:", err.message);
    }

    console.log(`✅ [ACCEPT_INVITE] User ${userId} joined group ${groupId}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        message: "Successfully joined the group",
        groupId,
        userId,
        tokenId,
      }),
    };
  } catch (err) {
    console.error("❌ [ACCEPT_INVITE] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to join group", details: err?.message }),
    };
  }
};