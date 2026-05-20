/**
 * LAMBDA: transferGroupOwnership
 *
 * Transfers ownership of a Greek/group subscription to another user along one
 * of two paths (see the spec conversation):
 *
 *   Path A — "keep paying"
 *     Original owner remains the billing owner for the rest of the current
 *     term. New owner takes admin/delete rights immediately. Billing does NOT
 *     move. Original owner must agree to a warning + checkbox; we log the
 *     exact warning text and timestamp to GroupData under the key
 *     TRANSFER_LOG#<timestamp>#<fromUserId> for audit.
 *
 *   Path B — "new owner takes over future billing"
 *     Nothing moves mid-term. We write a pending INVITE_TRANSFER#<token>
 *     record on GroupData with a 7-day expiry and email the new owner an
 *     acceptance link. The actual role swap happens in the acceptTransfer
 *     lambda once they accept. At that point both admin_owner and
 *     billing_owner move; the NEW owner becomes responsible for arranging the
 *     NEXT year's subscription (via billing@nightlinecomo.com — there is no
 *     self-serve renewal).
 *
 * Path A is synchronous and completes here.
 * Path B writes a pending record and returns; it completes in acceptTransfer.
 *
 * REQUIRED INPUTS
 * ---------------
 *   path                  "A" | "B"
 *   currentOwnerId        sub of the caller (admin_owner)
 *   groupId               group_id being transferred
 *   warningAccepted       true — required for both paths, caller must have
 *                         seen and agreed to the warning
 *   warningTextShown      string — the exact copy the user saw (logged)
 *
 * Path A additionally requires:
 *   newOwnerUsername      Cognito username of an EXISTING active member
 *
 * Path B additionally requires:
 *   newOwnerEmail         Email to send the invitation to. The recipient does
 *                         not need to be an existing member; they'll be
 *                         onboarded when they accept.
 *
 * REQUIRED ENV
 * ------------
 *   USER_POOL_ID          for Cognito lookups
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const crypto = require("crypto");

// Co-located copies under src/shared/ — sibling _shared path fails at
// runtime in deployed lambdas (Amplify Gen 1 only uploads src/).
const { sendEmail } = require("./shared/email");
const {
  transferPathAConfirmation,
  transferPathBInvite,
} = require("./shared/templates");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

const TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";

// Path B invitation lifetime.
const PATH_B_INVITE_DAYS = 7;

const cors = { "Access-Control-Allow-Origin": "*" };
const ok = (body) => ({ statusCode: 200, headers: cors, body: JSON.stringify(body) });
const err = (code, message, extra = {}) => ({
  statusCode: code,
  headers: cors,
  body: JSON.stringify({ success: false, error: message, ...extra }),
});

exports.handler = async (event) => {
  console.log("📥 transfer-group-ownership event received");
  console.log("🔍 USER_POOL_ID:", process.env.USER_POOL_ID || "(undefined)");

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    const {
      path,
      currentOwnerId,
      groupId,
      warningAccepted,
      warningTextShown,
      newOwnerUsername,
      newOwnerEmail,
    } = body || {};

    if (!path || !["A", "B"].includes(path)) {
      return err(400, "Missing or invalid 'path' (expected 'A' or 'B')");
    }
    if (!currentOwnerId || !groupId) {
      return err(400, "Missing required fields: currentOwnerId, groupId");
    }
    if (warningAccepted !== true) {
      return err(400, "warningAccepted must be true — the user must confirm the warning checkbox");
    }
    if (!warningTextShown || typeof warningTextShown !== "string") {
      return err(400, "warningTextShown is required (the exact copy the user saw)");
    }
    if (!process.env.USER_POOL_ID) {
      return err(500, "Lambda environment variable USER_POOL_ID is missing");
    }

    const now = new Date().toISOString();

    // ── Step 1: Verify caller is the current active admin-owner ───────────────
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
      return err(403, "Requesting user is not a member of this group");
    }
    if (!ownerRecord.Item.active) {
      return err(403, "Requesting user is not an active member of this group");
    }
    if (!ownerRecord.Item.is_owner) {
      return err(403, "Requesting user is not the admin owner of this group");
    }

    // ── Step 2: Load METADATA — needed for status, plan_type, chapter display ─
    const metaResp = await dynamo.send(
      new GetCommand({
        TableName: TABLE,
        Key: { group_id: groupId, group_data_members: "METADATA" },
      })
    );
    if (!metaResp.Item) {
      return err(404, "Group metadata not found");
    }
    const metadata = metaResp.Item;

    // Transfers on a suspended/deleted group should not proceed. A read-only
    // grace-period group is still transferrable (useful for passing admin to
    // someone who can arrange next year's purchase).
    if (["suspended", "deleted"].includes(metadata.status)) {
      return err(409, `Group is ${metadata.status}; transfers are disabled`);
    }

    // ── Step 3: Always log the acceptance (audit trail) ───────────────────────
    const transferLogSk = `TRANSFER_LOG#${now}#${currentOwnerId}`;
    await dynamo.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          group_id: groupId,
          group_data_members: transferLogSk,
          path,
          initiated_by_user_id: currentOwnerId,
          accepted_by_user_id: currentOwnerId, // the initiator accepted the warning
          warning_text_shown: warningTextShown,
          accepted_at: now,
          target_username: newOwnerUsername || null,
          target_email: newOwnerEmail || null,
          created_at: now,
        },
      })
    );
    console.log(`✅ Transfer warning acceptance logged (path ${path})`);

    if (path === "A") {
      return await handlePathA({
        body,
        metadata,
        currentOwnerId,
        groupId,
        newOwnerUsername,
        now,
      });
    }
    return await handlePathB({
      metadata,
      currentOwnerId,
      groupId,
      newOwnerEmail,
      now,
    });
  } catch (e) {
    console.error("❌ Error in transfer-group-ownership:", e);
    return err(500, e.message);
  }
};

// ─── Path A ──────────────────────────────────────────────────────────────────
// Synchronous: move only admin ownership. Billing owner stays.
async function handlePathA({
  metadata,
  currentOwnerId,
  groupId,
  newOwnerUsername,
  now,
}) {
  if (!newOwnerUsername) {
    return err(400, "Path A requires newOwnerUsername");
  }

  // Look up new owner in Cognito (same pattern as manualAddMembership).
  let cognitoUser;
  let newOwnerId;
  let newOwnerEmail;
  try {
    cognitoUser = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: newOwnerUsername,
      })
    );
    newOwnerId =
      cognitoUser.UserAttributes?.find((a) => a.Name === "sub")?.Value || null;
    newOwnerEmail =
      cognitoUser.UserAttributes?.find((a) => a.Name === "email")?.Value || null;
  } catch (e) {
    return err(400, "No Cognito user found for the provided username", {
      details: e.message,
    });
  }
  if (!newOwnerId) {
    return err(400, "Cognito user found but no sub/user_id present");
  }
  if (newOwnerId === currentOwnerId) {
    return err(400, "New owner is the same as the current owner");
  }

  // New admin-owner must already be an active member.
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
    return err(400, "New owner must be an active member of the group");
  }

  // Promote new admin-owner. DO NOT touch is_billing_owner on either side.
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: {
        group_id: groupId,
        group_data_members: `MEMBER#USER#${newOwnerId}`,
      },
      UpdateExpression:
        "SET is_owner = :true, ownership_transferred_at = :now, update_at = :now",
      ExpressionAttributeValues: { ":true": true, ":now": now },
    })
  );

  // Demote previous admin-owner (remains an active member and KEEPS
  // is_billing_owner). This is the core of Path A.
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: {
        group_id: groupId,
        group_data_members: `MEMBER#USER#${currentOwnerId}`,
      },
      UpdateExpression:
        "SET is_owner = :false, ownership_transferred_at = :now, update_at = :now",
      ExpressionAttributeValues: { ":false": false, ":now": now },
    })
  );

  // METADATA: move ONLY the admin fields. Leave billing_owner_* and the legacy
  // owner_* untouched. (owner_* is kept aligned with admin_owner for backward
  // compatibility with pre-split queries.)
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { group_id: groupId, group_data_members: "METADATA" },
      UpdateExpression:
        "SET admin_owner_user_id = :nid, admin_owner_username = :nuser, " +
        "owner_user_id = :nid, owner_username = :nuser, update_at = :now",
      ExpressionAttributeValues: {
        ":nid": newOwnerId,
        ":nuser": newOwnerUsername,
        ":now": now,
      },
    })
  );

  // Demote/promote token is_owner flags — same as the original lambda, but
  // tokens track admin-ownership, not billing.
  await flipTokensIsOwner(currentOwnerId, groupId, false, now);
  await flipTokensIsOwner(newOwnerId, groupId, true, now);

  // Confirmation email to the original owner (still the billing owner).
  const billingOwnerEmail = metadata.billing_owner_email;
  if (billingOwnerEmail) {
    const tmpl = transferPathAConfirmation({
      chapterName: metadata.chapter_name || metadata.owner_username,
      newOwnerDisplayName: newOwnerUsername,
      expiresAt: metadata.expires_at,
    });
    await sendEmail({ to: billingOwnerEmail, ...tmpl });
  }

  return ok({
    success: true,
    path: "A",
    message: `Admin ownership transferred to ${newOwnerUsername}. Billing owner unchanged.`,
    groupId,
    newAdminOwnerId: newOwnerId,
    newAdminOwnerUsername: newOwnerUsername,
    billingOwnerUserId: metadata.billing_owner_user_id,
    timestamp: now,
  });
}

async function flipTokensIsOwner(userId, groupId, value, now) {
  const tokens = await dynamo.send(
    new QueryCommand({
      TableName: TOKENS_TABLE,
      IndexName: "user_id-index",
      KeyConditionExpression: "user_id = :uid",
      FilterExpression: "group_id = :gid AND active = :true",
      ExpressionAttributeValues: {
        ":uid": userId,
        ":gid": groupId,
        ":true": true,
      },
    })
  );
  for (const token of tokens.Items || []) {
    await dynamo.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_id: token.token_id, user_id: token.user_id },
        UpdateExpression: "SET is_owner = :v, update_at = :now",
        ExpressionAttributeValues: { ":v": value, ":now": now },
      })
    );
  }
  console.log(
    `✅ ${value ? "Promoted" : "Demoted"} ${tokens.Items?.length || 0} token(s) for ${userId}`
  );
}

// ─── Path B ──────────────────────────────────────────────────────────────────
// Asynchronous: write a pending invitation and email the prospective new owner.
// Nothing in the group changes until acceptTransfer finalizes it.
async function handlePathB({
  metadata,
  currentOwnerId,
  groupId,
  newOwnerEmail,
  now,
}) {
  if (!newOwnerEmail || !/.+@.+\..+/.test(newOwnerEmail)) {
    return err(400, "Path B requires a valid newOwnerEmail");
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(
    Date.now() + PATH_B_INVITE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        group_id: groupId,
        group_data_members: `INVITE_TRANSFER#${token}`,
        token,
        from_user_id: currentOwnerId,
        to_user_email: newOwnerEmail.toLowerCase().trim(),
        path: "B",
        active: true,
        created_at: now,
        expires_at: expires,
      },
    })
  );
  console.log(`✅ Pending Path B transfer written (token ${token.slice(0, 8)}…)`);

  // Need the current owner's display name / username for the email.
  const fromMember = await dynamo.send(
    new GetCommand({
      TableName: TABLE,
      Key: {
        group_id: groupId,
        group_data_members: `MEMBER#USER#${currentOwnerId}`,
      },
    })
  );
  const fromDisplayName =
    fromMember.Item?.username ||
    [fromMember.Item?.first_name, fromMember.Item?.last_name].filter(Boolean).join(" ") ||
    "A Nightline user";

  const tmpl = transferPathBInvite({
    chapterName: metadata.chapter_name || metadata.owner_username,
    fromDisplayName,
    token,
    expiresAt: expires,
  });
  await sendEmail({ to: newOwnerEmail, ...tmpl });

  return ok({
    success: true,
    path: "B",
    message:
      "Transfer invitation sent. The new owner must accept within 7 days. Nothing changes until they accept.",
    groupId,
    inviteToken: token,
    inviteExpiresAt: expires,
  });
}
