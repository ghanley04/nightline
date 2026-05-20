/**
 * LAMBDA: acceptTransfer
 *
 * Finalizes a Path B ownership transfer. The transferrer calls
 * transferGroupOwnership with path=B, which writes an INVITE_TRANSFER#<token>
 * record and emails the invited user. When the invitee opens the app (or
 * replies) they hit this lambda with the token + their authenticated user id.
 *
 * Effect: BOTH admin_owner and billing_owner move to the new user. Nothing
 * mid-term actually moves — the current term was already paid by the
 * previous owner. But from now on, any reminders go to the new billing
 * owner's email, and when this term expires the new billing owner is
 * responsible for arranging the next year.
 *
 * REQUIRED INPUTS
 * ---------------
 *   token             The token from INVITE_TRANSFER#<token>
 *   acceptingUserId   The sub of the user accepting (from authenticated JWT)
 *   warningTextShown  The exact copy the new owner saw + agreed to (logged)
 *
 * FAILURE MODES
 * -------------
 *   - Token not found or already used: 404
 *   - Token expired (>7d since created): 410 Gone
 *   - Accepting user's email doesn't match the invite's to_user_email: 403
 *   - Group suspended or deleted by the time accept comes in: 409
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

const TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";

const cors = { "Access-Control-Allow-Origin": "*" };
const ok = (body) => ({ statusCode: 200, headers: cors, body: JSON.stringify(body) });
const err = (code, message, extra = {}) => ({
  statusCode: code,
  headers: cors,
  body: JSON.stringify({ success: false, error: message, ...extra }),
});

exports.handler = async (event) => {
  console.log("📥 accept-transfer event received");

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { token, acceptingUserId, warningTextShown } = body || {};

    if (!token || !acceptingUserId) {
      return err(400, "Missing required fields: token, acceptingUserId");
    }
    if (!warningTextShown || typeof warningTextShown !== "string") {
      return err(400, "warningTextShown is required");
    }
    if (!process.env.USER_POOL_ID) {
      return err(500, "Lambda environment variable USER_POOL_ID is missing");
    }

    const now = new Date().toISOString();

    // ── Step 1: Find the pending invite ───────────────────────────────────────
    // Preferred path: caller passes groupId from the invite URL/email link. If
    // they don't, fall back to a Scan filtered by the INVITE_TRANSFER# SK +
    // token. Scans are tolerable here because these records are rare and
    // short-lived (7-day TTL). If this becomes hot, add a GSI on token.
    let groupId = body.groupId;
    let invite = null;

    if (groupId) {
      const direct = await dynamo.send(
        new GetCommand({
          TableName: TABLE,
          Key: {
            group_id: groupId,
            group_data_members: `INVITE_TRANSFER#${token}`,
          },
        })
      );
      invite = direct.Item || null;
    } else {
      const scanned = await dynamo.send(
        new ScanCommand({
          TableName: TABLE,
          FilterExpression:
            "begins_with(group_data_members, :prefix) AND #t = :tok AND active = :true",
          ExpressionAttributeNames: { "#t": "token" },
          ExpressionAttributeValues: {
            ":prefix": "INVITE_TRANSFER#",
            ":tok": token,
            ":true": true,
          },
        })
      );
      invite = scanned.Items?.[0] || null;
      groupId = invite?.group_id;
    }

    if (!invite) {
      return err(404, "Transfer invitation not found or already used");
    }
    if (!invite.active) {
      return err(410, "Transfer invitation has already been used or cancelled");
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      // Mark inactive so a later retry returns a clean error
      await dynamo.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: {
            group_id: groupId,
            group_data_members: `INVITE_TRANSFER#${token}`,
          },
          UpdateExpression: "SET active = :false, expired_at = :now",
          ExpressionAttributeValues: { ":false": false, ":now": now },
        })
      );
      return err(410, "Transfer invitation has expired");
    }

    // ── Step 2: Confirm the accepting user matches the invited email ──────────
    let cognitoUser;
    let acceptingEmail;
    let acceptingUsername;
    try {
      // Look up the accepting user's attributes. We list by sub to get the
      // canonical Cognito username (needed later), using the same pattern as
      // addMembership#getCognitoUsernameBySub.
      const listed = await cognito.send(
        new ListUsersCommand({
          UserPoolId: process.env.USER_POOL_ID,
          Filter: `sub = "${acceptingUserId}"`,
          Limit: 1,
        })
      );
      cognitoUser = listed.Users?.[0];
      acceptingUsername = cognitoUser?.Username || null;
      acceptingEmail =
        cognitoUser?.Attributes?.find((a) => a.Name === "email")?.Value || null;
    } catch (e) {
      return err(400, "Could not verify accepting user in Cognito", {
        details: e.message,
      });
    }
    if (!acceptingEmail) {
      return err(400, "Accepting user has no email on file in Cognito");
    }
    if (
      acceptingEmail.toLowerCase().trim() !==
      (invite.to_user_email || "").toLowerCase().trim()
    ) {
      return err(
        403,
        "Accepting user's email does not match the invited email"
      );
    }

    // ── Step 3: Load METADATA + sanity-check group status ─────────────────────
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
    if (["suspended", "deleted"].includes(metadata.status)) {
      return err(409, `Group is ${metadata.status}; transfers can no longer be accepted`);
    }

    const fromUserId = invite.from_user_id;

    // ── Step 4: Ensure the accepting user has a MEMBER record ─────────────────
    // They might not be a member yet (Path B lets you invite someone outside
    // the group). If so, create a minimal MEMBER row so promotion works.
    const existingMember = await dynamo.send(
      new GetCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${acceptingUserId}`,
        },
      })
    );
    if (!existingMember.Item) {
      await dynamo.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            group_id: groupId,
            group_data_members: `MEMBER#USER#${acceptingUserId}`,
            user_id: acceptingUserId,
            username: acceptingUsername,
            email: acceptingEmail,
            created_at: now,
            update_at: now,
            active: true,
            isCancelled: false,
            manually_added: false,
            is_owner: false,
            is_billing_owner: false,
          },
        })
      );
      console.log("✅ Created MEMBER record for new Path B owner");
    }

    // ── Step 5: Flip admin + billing owner flags on MEMBER records ────────────
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${acceptingUserId}`,
        },
        UpdateExpression:
          "SET is_owner = :true, is_billing_owner = :true, " +
          "ownership_transferred_at = :now, update_at = :now, active = :true",
        ExpressionAttributeValues: { ":true": true, ":now": now },
      })
    );
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${fromUserId}`,
        },
        UpdateExpression:
          "SET is_owner = :false, is_billing_owner = :false, " +
          "ownership_transferred_at = :now, update_at = :now",
        ExpressionAttributeValues: { ":false": false, ":now": now },
      })
    );

    // ── Step 6: Update METADATA (admin + billing move together on Path B) ─────
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { group_id: groupId, group_data_members: "METADATA" },
        UpdateExpression:
          "SET admin_owner_user_id = :nid, admin_owner_username = :nuser, " +
          "billing_owner_user_id = :nid, billing_owner_username = :nuser, " +
          "billing_owner_email = :nemail, " +
          "owner_user_id = :nid, owner_username = :nuser, update_at = :now",
        ExpressionAttributeValues: {
          ":nid": acceptingUserId,
          ":nuser": acceptingUsername,
          ":nemail": acceptingEmail,
          ":now": now,
        },
      })
    );

    // ── Step 7: Flip token is_owner flags (admin-ownership) ───────────────────
    await flipTokensIsOwner(fromUserId, groupId, false, now);
    await flipTokensIsOwner(acceptingUserId, groupId, true, now);

    // ── Step 8: Retire the invite + write TRANSFER_LOG entry ──────────────────
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `INVITE_TRANSFER#${token}`,
        },
        UpdateExpression: "SET active = :false, accepted_at = :now",
        ExpressionAttributeValues: { ":false": false, ":now": now },
      })
    );
    await dynamo.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          group_id: groupId,
          group_data_members: `TRANSFER_LOG#${now}#${acceptingUserId}`,
          path: "B",
          initiated_by_user_id: fromUserId,
          accepted_by_user_id: acceptingUserId,
          warning_text_shown: warningTextShown,
          accepted_at: now,
          target_email: invite.to_user_email,
          created_at: now,
        },
      })
    );

    return ok({
      success: true,
      path: "B",
      message: "Ownership transfer accepted. Admin and billing ownership moved.",
      groupId,
      newOwnerUserId: acceptingUserId,
      newOwnerUsername: acceptingUsername,
      timestamp: now,
    });
  } catch (e) {
    console.error("❌ Error in accept-transfer:", e);
    return err(500, e.message);
  }
};

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
  for (const t of tokens.Items || []) {
    await dynamo.send(
      new UpdateCommand({
        TableName: TOKENS_TABLE,
        Key: { token_id: t.token_id, user_id: t.user_id },
        UpdateExpression: "SET is_owner = :v, update_at = :now",
        ExpressionAttributeValues: { ":v": value, ":now": now },
      })
    );
  }
}
