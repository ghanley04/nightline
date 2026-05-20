/**
 * LAMBDA: sendExpiryReminder
 *
 * Runs daily (EventBridge schedule — wire it up in Amplify / CloudFormation).
 *
 * For every Greek METADATA row with status ∈ { active, read_only, suspended }:
 *
 *   1. EMAIL — if today falls in a reminder window (60/30/14/7/1 days before
 *      expiry or day-of) and we haven't already sent that window's email, send
 *      it and record the window in metadata.reminders_sent.
 *
 *   2. STATE TRANSITIONS — flip the METADATA.status field as the timestamps
 *      pass:
 *         active      → read_only   when now >= read_only_at
 *         read_only   → suspended   when now >= suspended_at  (also email)
 *         suspended   → deleted + hard-delete the group when now >= purge_at
 *
 * The state transitions also update MEMBER/TOKEN records for the affected group
 * so downstream write-auth checks can fail closed.
 *
 * IDEMPOTENCY
 * -----------
 * Every reminder write is guarded by "window ∈ reminders_sent" — so running
 * the lambda twice in one day sends at most one copy. State transitions are
 * guarded by the status field itself (only write when the current status is
 * the expected previous value).
 *
 * MANUAL INVOCATION
 * -----------------
 * The lambda accepts an optional event.dryRun=true and event.forceGroupId=...
 * for testing. In normal daily operation it's invoked by EventBridge with an
 * empty event.
 *
 * OPT-OUT
 * -------
 * If METADATA.opt_out_reminders === true, emails are suppressed, but state
 * transitions still happen (you can't opt out of your subscription expiring).
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");

// Co-located copies under src/shared/ — Amplify Gen 1 only uploads the
// lambda's own src/, so sibling _shared paths fail at runtime.
const { sendEmail } = require("./shared/email");
const templates = require("./shared/templates");
const {
  daysUntil,
  isGreekPlanType,
} = require("./shared/greek");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const GROUPS_TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";

// Days-before-expiry at which we send a reminder. 0 = day-of. Order matters
// only for logs; the code checks membership in this list.
const REMINDER_WINDOWS = [60, 30, 14, 7, 1, 0];

// Map each window to its template function.
const WINDOW_TEMPLATES = {
  60: templates.expiryReminder60Day,
  30: templates.expiryReminder30Day,
  14: templates.expiryReminder14Day,
  7: templates.expiryReminder7Day,
  1: templates.expiryReminder1Day,
  0: templates.expiryReminderDayOf,
};

exports.handler = async (event = {}) => {
  console.log("⏰ send-expiry-reminder run starting", JSON.stringify(event));
  const dryRun = !!event.dryRun;
  const forceGroupId = event.forceGroupId || null;

  const now = new Date();
  const nowIso = now.toISOString();

  // ── Step 1: Find all Greek METADATA rows ─────────────────────────────────
  // Ideally this is a GSI scan; we do a full table scan filtered server-side
  // for plan_type='greek' AND SK='METADATA'. The Greek population is small
  // (hundreds of chapters at most) so a daily scan is fine.
  const metadataRows = await scanGreekMetadata();
  console.log(`📋 Found ${metadataRows.length} Greek METADATA row(s)`);

  const summary = {
    scanned: metadataRows.length,
    emailsSent: 0,
    transitionedToReadOnly: 0,
    transitionedToSuspended: 0,
    purged: 0,
    errors: [],
  };

  for (const meta of metadataRows) {
    if (forceGroupId && meta.group_id !== forceGroupId) continue;

    try {
      // REMINDERS ───────────────────────────────────────────────────────────
      if (meta.expires_at && meta.status !== "deleted") {
        const window = reminderWindowFor(meta.expires_at, now);
        if (window !== null) {
          const alreadySent = (meta.reminders_sent || []).includes(window);
          if (!alreadySent && !meta.opt_out_reminders) {
            const tmplFn = WINDOW_TEMPLATES[window];
            const tmpl = tmplFn({
              chapterName: meta.chapter_name || meta.owner_username,
              expiresAt: meta.expires_at,
            });
            if (!dryRun && meta.billing_owner_email) {
              const res = await sendEmail({ to: meta.billing_owner_email, ...tmpl });
              if (res.ok) {
                summary.emailsSent += 1;
                await recordReminderSent(meta, window, nowIso);
              } else {
                summary.errors.push({
                  groupId: meta.group_id,
                  stage: "reminder-send",
                  window,
                  error: res.error,
                });
              }
            } else if (!meta.billing_owner_email) {
              console.warn(
                `⚠️ Group ${meta.group_id} has no billing_owner_email — skipping reminder`
              );
            } else {
              console.log(`🧪 [dryRun] would send ${window}-day reminder to ${meta.billing_owner_email}`);
            }
          }
        }
      }

      // STATE TRANSITIONS ───────────────────────────────────────────────────
      // Re-read status in case reminders_sent write above raced with this
      // lambda; not strictly necessary because we only use the old value for
      // the ConditionExpression.
      if (
        meta.status === "active" &&
        meta.read_only_at &&
        Date.parse(meta.read_only_at) <= now.getTime()
      ) {
        const transitioned = await transitionStatus({
          meta,
          from: "active",
          to: "read_only",
          nowIso,
          dryRun,
        });
        if (transitioned) summary.transitionedToReadOnly += 1;
      }

      if (
        (meta.status === "active" || meta.status === "read_only") &&
        meta.suspended_at &&
        Date.parse(meta.suspended_at) <= now.getTime()
      ) {
        const transitioned = await transitionStatus({
          meta,
          from: meta.status,
          to: "suspended",
          nowIso,
          dryRun,
        });
        if (transitioned) {
          summary.transitionedToSuspended += 1;
          // Email the billing owner when suspension kicks in (separate from
          // the reminder cadence so it never gets missed).
          if (!dryRun && meta.billing_owner_email && !meta.opt_out_reminders) {
            const tmpl = templates.suspensionStarted({
              chapterName: meta.chapter_name || meta.owner_username,
              purgeAt: meta.purge_at,
            });
            await sendEmail({ to: meta.billing_owner_email, ...tmpl });
            summary.emailsSent += 1;
          }
        }
      }

      if (
        meta.status !== "deleted" &&
        meta.purge_at &&
        Date.parse(meta.purge_at) <= now.getTime()
      ) {
        if (!dryRun) {
          await hardDeleteGroup(meta.group_id);
          summary.purged += 1;
        } else {
          console.log(`🧪 [dryRun] would purge ${meta.group_id}`);
        }
      }
    } catch (e) {
      console.error(`❌ Error processing group ${meta.group_id}:`, e);
      summary.errors.push({ groupId: meta.group_id, error: e.message });
    }
  }

  console.log("✅ send-expiry-reminder run complete", JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function scanGreekMetadata() {
  const items = [];
  let lastKey;
  do {
    const resp = await dynamo.send(
      new ScanCommand({
        TableName: GROUPS_TABLE,
        FilterExpression: "group_data_members = :md AND plan_type = :greek",
        ExpressionAttributeValues: {
          ":md": "METADATA",
          ":greek": "greek",
        },
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...(resp.Items || []));
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);

  // Defensive: only keep rows that look well-formed.
  return items.filter(
    (it) => it.group_id && isGreekPlanType(it.plan_type)
  );
}

function reminderWindowFor(expiresAtIso, now) {
  const days = daysUntil(expiresAtIso, now.toISOString());
  // Match if `days` exactly equals one of our windows. The day-of window (0)
  // fires on the day expires_at falls (days === 0). After that, we stop
  // sending reminders — further comms come from the suspension email.
  if (REMINDER_WINDOWS.includes(days)) return days;
  return null;
}

async function recordReminderSent(meta, window, nowIso) {
  const current = meta.reminders_sent || [];
  if (current.includes(window)) return;
  await dynamo.send(
    new UpdateCommand({
      TableName: GROUPS_TABLE,
      Key: { group_id: meta.group_id, group_data_members: "METADATA" },
      UpdateExpression:
        "SET reminders_sent = list_append(if_not_exists(reminders_sent, :empty), :w), " +
        "last_reminder_at = :now, update_at = :now",
      ExpressionAttributeValues: {
        ":empty": [],
        ":w": [window],
        ":now": nowIso,
      },
    })
  );
  // Also keep the in-memory copy in sync so the same call in a single run
  // doesn't re-send.
  meta.reminders_sent = [...current, window];
}

async function transitionStatus({ meta, from, to, nowIso, dryRun }) {
  if (meta.status === to) return false;
  if (dryRun) {
    console.log(`🧪 [dryRun] ${meta.group_id}: ${from} → ${to}`);
    meta.status = to;
    return true;
  }
  try {
    // When the group is being suspended we ALSO flip METADATA.active=false
    // in the same update. That way every consumer (UI, write-guard, ad-hoc
    // queries) gets a consistent "this group is dead" signal from a single
    // boolean read regardless of which field they look at. status is still
    // the source of truth for the lifecycle stage; active is a convenience
    // mirror that goes false the moment members lose access.
    const updateExpression =
      to === "suspended"
        ? "SET #s = :to, status_changed_at = :now, update_at = :now, active = :false"
        : "SET #s = :to, status_changed_at = :now, update_at = :now";
    const expressionValues = {
      ":from": from,
      ":to": to,
      ":now": nowIso,
    };
    if (to === "suspended") expressionValues[":false"] = false;

    await dynamo.send(
      new UpdateCommand({
        TableName: GROUPS_TABLE,
        Key: { group_id: meta.group_id, group_data_members: "METADATA" },
        UpdateExpression: updateExpression,
        ConditionExpression: "#s = :from OR attribute_not_exists(#s)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: expressionValues,
      })
    );
    meta.status = to;
    if (to === "suspended") meta.active = false;
    console.log(`🔄 ${meta.group_id}: ${from} → ${to}`);

    // When suspending, deactivate all MEMBER + TOKEN records so write-auth
    // checks that consult `active` also fail closed.
    if (to === "suspended") {
      await deactivateGroupMembersAndTokens(meta.group_id, nowIso);
    }

    return true;
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") {
      // Another run beat us to it — fine.
      return false;
    }
    throw e;
  }
}

async function deactivateGroupMembersAndTokens(groupId, nowIso) {
  // MEMBER rows
  const members = await dynamo.send(
    new QueryCommand({
      TableName: GROUPS_TABLE,
      KeyConditionExpression:
        "group_id = :gid AND begins_with(group_data_members, :prefix)",
      FilterExpression: "active = :true",
      ExpressionAttributeValues: {
        ":gid": groupId,
        ":prefix": "MEMBER#USER#",
        ":true": true,
      },
    })
  );
  const userIds = [];
  for (const m of members.Items || []) {
    userIds.push(m.user_id);
    await dynamo.send(
      new UpdateCommand({
        TableName: GROUPS_TABLE,
        Key: {
          group_id: m.group_id,
          group_data_members: m.group_data_members,
        },
        UpdateExpression: "SET active = :false, update_at = :now, suspended_at = :now",
        ExpressionAttributeValues: { ":false": false, ":now": nowIso },
      })
    );
  }
  // TOKEN rows
  for (const uid of userIds) {
    const toks = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "group_id = :gid AND active = :true",
        ExpressionAttributeValues: {
          ":uid": uid,
          ":gid": groupId,
          ":true": true,
        },
      })
    );
    for (const t of toks.Items || []) {
      await dynamo.send(
        new UpdateCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: t.token_id, user_id: t.user_id },
          UpdateExpression: "SET active = :false, ended_at = :now, update_at = :now",
          ExpressionAttributeValues: { ":false": false, ":now": nowIso },
        })
      );
    }
  }
}

/**
 * Hard-delete every row belonging to a group. Runs at +37d past expiry.
 *
 * This is irreversible — we're past the retention window. If the chapter
 * comes back after this, they start with a fresh workspace.
 */
async function hardDeleteGroup(groupId) {
  console.log(`🗑️  HARD-DELETE starting for group ${groupId}`);

  // All group rows
  const rows = await dynamo.send(
    new QueryCommand({
      TableName: GROUPS_TABLE,
      KeyConditionExpression: "group_id = :gid",
      ExpressionAttributeValues: { ":gid": groupId },
    })
  );
  const userIds = new Set();
  for (const r of rows.Items || []) {
    if ((r.group_data_members || "").startsWith("MEMBER#USER#") && r.user_id) {
      userIds.add(r.user_id);
    }
    await dynamo.send(
      new DeleteCommand({
        TableName: GROUPS_TABLE,
        Key: {
          group_id: r.group_id,
          group_data_members: r.group_data_members,
        },
      })
    );
  }

  // Tokens for all members
  for (const uid of userIds) {
    const toks = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "group_id = :gid",
        ExpressionAttributeValues: { ":uid": uid, ":gid": groupId },
      })
    );
    for (const t of toks.Items || []) {
      await dynamo.send(
        new DeleteCommand({
          TableName: TOKENS_TABLE,
          Key: { token_id: t.token_id, user_id: t.user_id },
        })
      );
    }
  }

  console.log(`✅ Hard-deleted group ${groupId} (${rows.Items?.length || 0} rows)`);
}
