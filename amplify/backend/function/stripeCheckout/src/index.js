/**
 * LAMBDA: stripeWebhook
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * This is the ONLY place Stripe tells us "a payment actually succeeded."
 * Every membership write must flow through here — never trust the client.
 *
 * KEY SAFETY CHANGES FROM ORIGINAL
 * ---------------------------------
 * 1. IDEMPOTENCY GUARD (top of handler)
 *    Stripe retries webhooks on any non-2xx or timeout.
 *    Without a guard, a retry after a partial write leaves the user with
 *    duplicate memberships or, worse, a canceled old plan and no new one.
 *    We write the Stripe event ID to ProcessedStripeEvents ATOMICALLY
 *    (ConditionExpression: attribute_not_exists) before touching anything else.
 *    If two Lambda instances race on the same event, only one wins.
 *
 * 2. WRITE NEW RECORDS BEFORE CANCELING OLD SUBSCRIPTION
 *    Original order:  cancel Stripe → deactivate old DB row → write new DB row
 *    Safe order:      write new DB row → deactivate old DB row → cancel Stripe
 *    If any DB write fails in the safe order, the user still has their old plan.
 *    Stripe is only touched last, after all DB work is confirmed.
 *
 * 3. line_items EXPANSION
 *    Stripe does NOT include line_items in the webhook payload by default.
 *    We retrieve the session with expand=['line_items'] to get the real priceId
 *    and therefore the real max_members from price metadata.
 *    Without this, max_users was ALWAYS "1" regardless of the plan purchased.
 */

const {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  GetItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const Stripe = require("stripe");
const crypto = require("crypto");
const {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const rawClient = new DynamoDBClient({});
const dynamo = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(rawClient);
const cognito = new CognitoIdentityProviderClient({ region: "us-east-2" });

const USER_POOL_ID = process.env.USER_POOL_ID;
const PROCESSED_EVENTS_TABLE = "ProcessedStripeEvents"; // NEW TABLE — see explanation below

// ─── Helpers ────────────────────────────────────────────────────────────────

async function updateIfExists({ table, key, update, values }) {
  const exists = await dynamo.send(
    new GetItemCommand({ TableName: table, Key: key })
  );
  if (!exists.Item) {
    console.log("ℹ️ Skipping update — record does not exist:", key);
    return false;
  }
  await dynamo.send(
    new UpdateItemCommand({
      TableName: table,
      Key: key,
      UpdateExpression: update,
      ExpressionAttributeValues: values,
    })
  );
  console.log("✅ Updated record:", key);
  return true;
}

async function cancelStripeSubscriptions(customerId) {
  try {
    if (!customerId || customerId.startsWith("guest_")) {
      console.log("ℹ️ Skipping Stripe cancellation — guest or missing customer");
      return [];
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });
    const canceled = [];
    for (const sub of subscriptions.data) {
      await stripe.subscriptions.cancel(sub.id);
      canceled.push(sub.id);
      console.log(`✅ Canceled Stripe subscription: ${sub.id}`);
    }
    return canceled;
  } catch (err) {
    console.error("❌ Error canceling Stripe subscriptions:", err);
    return [];
  }
}

function getPlanTier(groupId) {
  const id = (groupId || "").toLowerCase();
  if (id.includes("individual")) return { type: "individual", tier: 1 };
  if (id.includes("group")) return { type: "group", tier: 2 };
  if (id.includes("greek")) return { type: "greek", tier: 3 };
  return { type: "unknown", tier: 0 };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  console.log("📢 Received event:", JSON.stringify(event, null, 2));

  if (!event.headers) {
    return { statusCode: 400, body: JSON.stringify({ error: "No headers received" }) };
  }

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  let bodyRaw = event.body;
  if (event.isBase64Encoded) {
    bodyRaw = Buffer.from(bodyRaw, "base64").toString("utf8");
  }

  // Verify Stripe webhook signature
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      bodyRaw,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log("🟢 Stripe webhook verified:", stripeEvent.type);
  } catch (err) {
    console.error("❌ Invalid Stripe signature:", err.message);
    return { statusCode: 400, body: "Webhook Error" };
  }

  // Only handle checkout completions
  if (stripeEvent.type !== "checkout.session.completed") {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  // ── SAFETY STEP 1: Idempotency guard ─────────────────────────────────────
  // WHY: Stripe will retry this webhook if we return non-2xx or time out.
  // Without this, a retry after a partial write can double-create memberships
  // or cancel a subscription twice. The ConditionExpression makes the write
  // atomic — two Lambda instances racing on the same eventId can't both win.
  try {
    await docClient.send(
      new PutCommand({
        TableName: PROCESSED_EVENTS_TABLE,
        Item: {
          event_id: stripeEvent.id,
          processed_at: new Date().toISOString(),
          // TTL: auto-delete after 48 hours (DynamoDB TTL must be enabled on this attribute)
          ttl: Math.floor(Date.now() / 1000) + 172800,
        },
        ConditionExpression: "attribute_not_exists(event_id)",
      })
    );
    console.log("✅ Idempotency record written for event:", stripeEvent.id);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      console.log("⚠️ Duplicate webhook event — already processed:", stripeEvent.id);
      return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
    }
    // Any other error writing the idempotency record: fail loudly so Stripe retries
    console.error("❌ Failed to write idempotency record:", err);
    return { statusCode: 500, body: "Internal error" };
  }

  const session = stripeEvent.data.object;
  const userId = session.metadata?.userId;
  const groupId = session.metadata?.groupId;
  const customerId = session.customer;

  if (!userId || !groupId) {
    console.error("❌ Missing userId or groupId in metadata");
    return { statusCode: 400, body: JSON.stringify({ error: "Missing metadata" }) };
  }

  // ── SAFETY STEP 2: Expand line_items to get real priceId ─────────────────
  // WHY: Stripe webhooks do NOT include line_items by default.
  // session.line_items is always undefined in the raw payload.
  // Without this, max_users was silently defaulting to "1" for every plan,
  // meaning group/greek plans were misconfigured from the moment of purchase.
  let maxUsers = "1";
  try {
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items"],
    });
    const priceId = fullSession.line_items?.data?.[0]?.price?.id;
    if (priceId) {
      const price = await stripe.prices.retrieve(priceId);
      maxUsers = price.metadata?.max_members || "1";
      console.log(`🔸 max_members from price ${priceId}:`, maxUsers);
    }
  } catch (err) {
    console.error("⚠️ Could not fetch line_items — defaulting max_users to 1:", err.message);
  }

  const groupIdLower = groupId.toLowerCase();
  const isNightPass = groupIdLower.includes("night");
  const isBusPass = groupIdLower.includes("bus");
  const isOneTimePass = isNightPass || isBusPass;

  // Resolve final customer ID
  let finalCustomerId = customerId;
  if (!finalCustomerId && session.payment_intent) {
    try {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
      finalCustomerId = pi.customer;
    } catch (err) {
      console.warn("⚠️ Could not retrieve customer from payment_intent:", err.message);
    }
  }
  if (!finalCustomerId) {
    finalCustomerId = `guest_${crypto.randomBytes(8).toString("hex")}`;
    console.log("⚠️ Using guest placeholder:", finalCustomerId);
  }

  // Save stripe_customer_id to Cognito
  if (userId && finalCustomerId && !finalCustomerId.startsWith("guest_")) {
    try {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: userId,
          UserAttributes: [{ Name: "custom:stripe_customer_id", Value: finalCustomerId }],
        })
      );
      console.log("✅ Saved stripe_customer_id to Cognito");
    } catch (err) {
      console.error("⚠️ Failed to save stripe_customer_id to Cognito:", err.message);
    }
  }

  const tableName = "GroupData-dev";
  const tokenTableName = "Tokens";
  const createdAt = new Date().toISOString();
  const inviteCode = crypto.randomBytes(6).toString("hex");
  const inviteLink = `https://nightline.app/invite/${inviteCode}`;
  const newPlan = getPlanTier(groupId);

  try {
    // Query existing active memberships
    const membershipsQuery = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :userId",
        FilterExpression: "active = :true",
        ExpressionAttributeValues: {
          ":userId": { S: userId },
          ":true": { BOOL: true },
        },
      })
    );

    const activeMemberships = membershipsQuery.Items || [];
    const membershipsToDeactivate = []; // collect, don't act yet

    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id.S;
      const existingPlan = getPlanTier(existingGroupId);
      const existingGroupIdLower = existingGroupId.toLowerCase();
      const isExistingOneTimePass =
        existingGroupIdLower.includes("night") || existingGroupIdLower.includes("bus");
      const existingStripeCustomerId = membership.stripe_customer_id?.S;

      if (existingGroupId === groupId) continue;
      if (isOneTimePass) continue;
      if (isExistingOneTimePass) continue;

      if (newPlan.tier >= existingPlan.tier) {
        // Queue for deactivation AFTER new records are written
        membershipsToDeactivate.push({ existingGroupId, existingPlan, existingStripeCustomerId });
      } else if (newPlan.tier < existingPlan.tier) {
        // Downgrade: reduce max_users on existing plan
        const currentMetadata = membership.metadata?.M || {};
        const currentMaxUsers = currentMetadata.max_users?.S || "1";
        const newMaxUsers = String(Math.max(1, parseInt(currentMaxUsers) - 1));
        await updateIfExists({
          table: tableName,
          key: { group_id: { S: existingGroupId }, group_data_members: { S: "METADATA" } },
          update: "SET metadata.max_users = :newMax, update_at = :now",
          values: { ":newMax": { S: newMaxUsers }, ":now": { S: createdAt } },
        });
      }
    }

    // ── SAFETY STEP 3: Write NEW records BEFORE touching old ones ────────────
    // WHY: If we canceled the old subscription first and then a DB write failed,
    // the user would have no active membership but already paid for the new one.
    // By writing the new membership first, the user always has at least one
    // valid plan. The worst case on failure is they temporarily have two plans,
    // which is far better than having none.

    // Write new MEMBER record
    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          group_id: { S: groupId },
          group_data_members: { S: `MEMBER#USER#${userId}` },
          user_id: { S: userId },
          stripe_customer_id: { S: finalCustomerId },
          created_at: { S: createdAt },
          update_at: { S: createdAt },
          active: { BOOL: true },
        },
      })
    );
    console.log("✅ New MEMBER record written");

    // Write new METADATA record
    let planType = newPlan.type;
    if (isNightPass) planType = "night";
    if (isBusPass) planType = "bus";

    await dynamo.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          group_id: { S: groupId },
          group_data_members: { S: "METADATA" },
          created_at: { S: createdAt },
          update_at: { S: createdAt },
          active: { BOOL: true },
          max_users: { S: isOneTimePass ? "1" : maxUsers },
          plan_type: { S: planType },
          stripe_customer_id: { S: finalCustomerId },
        },
      })
    );
    console.log("✅ New METADATA record written");

    // Write new TOKEN record
    const tokenId = crypto.randomBytes(16).toString("hex");
    await dynamo.send(
      new PutItemCommand({
        TableName: tokenTableName,
        Item: {
          token_id: { S: tokenId },
          user_id: { S: userId },
          group_id: { S: groupId },
          stripe_customer_id: { S: finalCustomerId },
          created_at: { S: createdAt },
          active: { BOOL: true },
        },
      })
    );
    console.log("✅ New TOKEN record written");

    // Write invite code for group/greek plans
    if (
      !isOneTimePass &&
      (groupId.toLowerCase().includes("greek") || groupId.toLowerCase().includes("group"))
    ) {
      await dynamo.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            group_id: { S: groupId },
            group_data_members: { S: `INVITE#${inviteCode}` },
            invite_code: { S: inviteCode },
            created_by: { S: userId },
            created_at: { S: createdAt },
            used: { BOOL: false },
            invite_link: { S: inviteLink },
            active: { BOOL: true },
            stripe_customer_id: { S: finalCustomerId },
          },
        })
      );
      console.log("✅ Invite record written");
    }

    // NOW deactivate old memberships and cancel old Stripe subscriptions
    for (const { existingGroupId, existingStripeCustomerId } of membershipsToDeactivate) {
      console.log(`🔄 Deactivating old membership: ${existingGroupId}`);

      await updateIfExists({
        table: tableName,
        key: { group_id: { S: existingGroupId }, group_data_members: { S: `MEMBER#USER#${userId}` } },
        update: "SET active = :false, update_at = :now",
        values: { ":false": { BOOL: false }, ":now": { S: createdAt } },
      });

      await updateIfExists({
        table: tableName,
        key: { group_id: { S: existingGroupId }, group_data_members: { S: "METADATA" } },
        update: "SET active = :false, update_at = :now",
        values: { ":false": { BOOL: false }, ":now": { S: createdAt } },
      });

      const oldTokensQuery = await dynamo.send(
        new QueryCommand({
          TableName: tokenTableName,
          IndexName: "user_id-index",
          KeyConditionExpression: "user_id = :userId",
          FilterExpression:
            "group_id = :oldGroup AND NOT contains(group_id, :nightStr) AND NOT contains(group_id, :busStr) AND active = :true",
          ExpressionAttributeValues: {
            ":userId": { S: userId },
            ":oldGroup": { S: existingGroupId },
            ":nightStr": { S: "night" },
            ":busStr": { S: "bus" },
            ":true": { BOOL: true },
          },
        })
      );

      for (const token of oldTokensQuery.Items || []) {
        await updateIfExists({
          table: tokenTableName,
          key: { token_id: token.token_id, user_id: token.user_id },
          update: "SET active = :false, ended_at = :now",
          values: { ":false": { BOOL: false }, ":now": { S: createdAt } },
        });
      }

      // Cancel Stripe LAST — only after all DB work succeeded
      if (existingStripeCustomerId) {
        const canceled = await cancelStripeSubscriptions(existingStripeCustomerId);
        console.log(`✅ Canceled ${canceled.length} Stripe subscription(s)`);
      }
    }

    console.log("✅ Successfully processed subscription change");
    return { statusCode: 200, body: JSON.stringify({ success: true, inviteLink }) };
  } catch (err) {
    console.error("❌ Error processing subscription:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Error processing subscription change" }) };
  }
};