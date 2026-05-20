/**
 * SHARED: write-authorization guard
 *
 * Call this at the top of any lambda that MUTATES data inside a group. It
 * reads METADATA.status and returns a structured result:
 *
 *   status === 'active'      → writes allowed
 *   status === 'read_only'   → writes REJECTED (grace period)
 *   status === 'suspended'   → writes REJECTED
 *   status === 'deleted'     → writes REJECTED
 *
 * Legacy groups created before the ownership-split migration won't have a
 * status field. Treat those as 'active' for backward compatibility so we
 * don't break existing workspaces.
 *
 * USAGE
 * -----
 *   const { assertGroupWritable } = require('../../_shared/src/writeGuard');
 *
 *   const guard = await assertGroupWritable(groupId);
 *   if (!guard.ok) return guard.response;   // 403 with a clear message
 *   // … proceed with mutation …
 *
 * EXAMPLE CALLERS THAT SHOULD ADOPT THIS
 * --------------------------------------
 *   - acceptInvite          (adding a new member to a group)
 *   - manualAddMembership   (when adding to an existing Greek group)
 *   - getInviteLink         (refreshing invite links)
 *   - nightlineLane         (any writes it performs)
 *
 * The grace-period UX is: users can sign in, read everything, but any attempt
 * to change data is rejected with a friendly "subscription expired — contact
 * billing" message. This helper centralizes that rejection so every write
 * path gives the same answer.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const GROUPS_TABLE = "GroupData-dev";

const WRITABLE_STATES = new Set(["active"]);

const cors = { "Access-Control-Allow-Origin": "*" };

function reject(status, message, code) {
  return {
    ok: false,
    response: {
      statusCode: 403,
      headers: cors,
      body: JSON.stringify({
        success: false,
        error: message,
        code,
        groupStatus: status,
      }),
    },
  };
}

async function assertGroupWritable(groupId) {
  if (!groupId) {
    return reject("missing", "groupId is required", "MISSING_GROUP");
  }

  const meta = await dynamo.send(
    new GetCommand({
      TableName: GROUPS_TABLE,
      Key: { group_id: groupId, group_data_members: "METADATA" },
    })
  );

  if (!meta.Item) {
    return reject("missing", "Group not found", "GROUP_NOT_FOUND");
  }

  // Legacy groups: no status field → treat as active.
  const status = meta.Item.status || "active";
  if (WRITABLE_STATES.has(status)) {
    return { ok: true, metadata: meta.Item };
  }

  const friendly = {
    read_only:
      "This subscription has expired and is in its 7-day read-only grace period. Contact billing@nightlinecomo.com to arrange a new subscription.",
    suspended:
      "This subscription has been suspended. Data is retained for a limited time — contact billing@nightlinecomo.com to restore access.",
    deleted:
      "This workspace has been permanently deleted.",
  }[status] || `Group is in '${status}' state and cannot accept changes.`;

  return reject(status, friendly, `GROUP_${status.toUpperCase()}`);
}

module.exports = { assertGroupWritable };
