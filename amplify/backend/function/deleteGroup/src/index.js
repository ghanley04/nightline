/**
 * LAMBDA: deactivate-group
 *
 * PURPOSE
 * -------
 * Deactivates an entire group by:
 * - setting all MEMBER#USER# records inactive
 * - setting all INVITE# records inactive
 * - setting METADATA inactive
 * - setting all Tokens for users in this group inactive
 *
 * NOTES
 * -----
 * - This does NOT hard delete records from DynamoDB.
 * - It performs soft-delete / deactivation using active = false.
 * - It assumes:
 *    Group table PK = group_id
 *    Group table SK = group_data_members
 *    Tokens table has PK = token_id, SK = user_id
 *    Tokens table has GSI: user_id-index
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

// Co-located copies under src/shared/ — sibling _shared path fails at
// runtime in deployed lambdas (Amplify Gen 1 only uploads src/).
const { sendEmail } = require("./shared/email");
const { adminDeletedWorkspace } = require("./shared/templates");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const GROUPS_TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";

exports.handler = async (event) => {
  console.log("📥 deactivate-group event:", JSON.stringify(event, null, 2));

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    // deletingUserId is the sub of the caller performing the delete. Optional
    // for backward compatibility with older callers, but required to trigger
    // the billing-owner notification — without it we can't tell whether the
    // deleter IS the billing owner.
    const { groupId, deletingUserId } = body || {};

    if (!groupId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Missing groupId",
        }),
      };
    }

    const now = new Date().toISOString();

    // 1️⃣ Get all records for this group
    const groupItemsResp = await dynamo.send(
      new QueryCommand({
        TableName: GROUPS_TABLE,
        KeyConditionExpression: "group_id = :gid",
        ExpressionAttributeValues: {
          ":gid": groupId,
        },
      })
    );

    const groupItems = groupItemsResp.Items || [];
    console.log(`📦 Found ${groupItems.length} item(s) for group ${groupId}`);

    if (groupItems.length === 0) {
      return {
        statusCode: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          success: false,
          error: "Group not found",
        }),
      };
    }

    const memberItems = groupItems.filter((item) =>
      String(item.group_data_members || "").startsWith("MEMBER#USER#")
    );

    const inviteItems = groupItems.filter((item) =>
      String(item.group_data_members || "").startsWith("INVITE#")
    );

    const metadataItem = groupItems.find(
      (item) => item.group_data_members === "METADATA"
    );

    // collect unique user ids from member records
    const userIds = [...new Set(memberItems.map((m) => m.user_id).filter(Boolean))];

    // 2️⃣ Deactivate all member records
    for (const member of memberItems) {
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: GROUPS_TABLE,
            Key: {
              group_id: member.group_id,
              group_data_members: member.group_data_members,
            },
            UpdateExpression:
              "SET active = :false, isCancelled = :true, update_at = :now, canceledAt = :now",
            ExpressionAttributeValues: {
              ":false": false,
              ":true": true,
              ":now": now,
            },
          })
        );
        console.log(`✅ Member deactivated: ${member.group_data_members}`);
      } catch (err) {
        console.warn(
          `⚠️ Failed to deactivate member ${member.group_data_members}:`,
          err.message
        );
      }
    }

    // 3️⃣ Deactivate all invite records
    for (const invite of inviteItems) {
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: GROUPS_TABLE,
            Key: {
              group_id: invite.group_id,
              group_data_members: invite.group_data_members,
            },
            UpdateExpression: "SET active = :false, update_at = :now",
            ExpressionAttributeValues: {
              ":false": false,
              ":now": now,
            },
          })
        );
        console.log(`✅ Invite deactivated: ${invite.group_data_members}`);
      } catch (err) {
        console.warn(
          `⚠️ Failed to deactivate invite ${invite.group_data_members}:`,
          err.message
        );
      }
    }

    // 4️⃣ Deactivate METADATA last
    if (metadataItem) {
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: GROUPS_TABLE,
            Key: {
              group_id: metadataItem.group_id,
              group_data_members: "METADATA",
            },
            UpdateExpression: "SET active = :false, update_at = :now",
            ExpressionAttributeValues: {
              ":false": false,
              ":now": now,
            },
          })
        );
        console.log("✅ METADATA deactivated");
      } catch (err) {
        console.warn("⚠️ Failed to deactivate METADATA:", err.message);
      }
    }

    // 5️⃣ Deactivate all tokens for every user in this group
    let totalTokensDeactivated = 0;

    for (const userId of userIds) {
      try {
        const tokenQuery = await dynamo.send(
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

        const tokens = tokenQuery.Items || [];
        console.log(`🔍 Found ${tokens.length} active token(s) for user ${userId}`);

        for (const token of tokens) {
          try {
            await dynamo.send(
              new UpdateCommand({
                TableName: TOKENS_TABLE,
                Key: {
                  token_id: token.token_id,
                  user_id: token.user_id,
                },
                UpdateExpression: "SET active = :false, ended_at = :now, update_at = :now",
                ExpressionAttributeValues: {
                  ":false": false,
                  ":now": now,
                },
              })
            );
            totalTokensDeactivated += 1;
            console.log(`✅ Token deactivated: ${token.token_id}`);
          } catch (err) {
            console.warn(`⚠️ Failed to deactivate token ${token.token_id}:`, err.message);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Failed token lookup for user ${userId}:`, err.message);
      }
    }

    // ── Notify the billing owner if the deleter wasn't them ────────────────
    // WHY: admin-ownership and billing-ownership are separate post-split. A
    // Path A transfer leaves someone paying while someone else can delete. If
    // the admin decides to nuke the workspace, the person paying deserves a
    // heads-up — they're still on the hook for the current term and any
    // retained-data window.
    //
    // This notification is deliberately best-effort (non-fatal on failure);
    // the deletion has already succeeded at this point.
    try {
      const billingOwnerUserId = metadataItem?.billing_owner_user_id;
      const billingOwnerEmail = metadataItem?.billing_owner_email;

      const deleterIsBillingOwner =
        !!deletingUserId &&
        !!billingOwnerUserId &&
        deletingUserId === billingOwnerUserId;

      if (billingOwnerEmail && !deleterIsBillingOwner) {
        // Try to get a display name for the deleting admin to include in the email.
        let deletedByDisplayName = "the workspace admin";
        if (deletingUserId) {
          const deleterMember = memberItems.find((m) => m.user_id === deletingUserId);
          if (deleterMember) {
            deletedByDisplayName =
              deleterMember.username ||
              [deleterMember.first_name, deleterMember.last_name].filter(Boolean).join(" ") ||
              deletedByDisplayName;
          }
        }
        const tmpl = adminDeletedWorkspace({
          chapterName: metadataItem?.chapter_name || metadataItem?.owner_username,
          deletedByDisplayName,
        });
        await sendEmail({ to: billingOwnerEmail, ...tmpl });
      } else if (deleterIsBillingOwner) {
        console.log("ℹ️ Billing owner performed the delete — skipping notification.");
      } else {
        console.log(
          "ℹ️ No billing_owner_email on METADATA — skipping notification. " +
            "(Older groups created before the ownership split won't have this field.)"
        );
      }
    } catch (notifyErr) {
      console.warn("⚠️ Billing-owner notification failed:", notifyErr.message);
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        message: "Group deactivated successfully",
        groupId,
        membersDeactivated: memberItems.length,
        invitesDeactivated: inviteItems.length,
        tokensDeactivated: totalTokensDeactivated,
        usersAffected: userIds.length,
        timestamp: now,
      }),
    };
  } catch (err) {
    console.error("❌ Error deactivating group:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: false,
        error: err.message,
      }),
    };
  }
};