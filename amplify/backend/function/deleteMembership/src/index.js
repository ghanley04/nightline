/**
 * LAMBDA: delete-membership
 *
 * Handles three cancellation flows:
 *
 *   1. Non-Greek "cancel" (mode omitted, or mode === 'cancel'):
 *      Immediate cancel for Individual / Group / Night / Bus plans.
 *      DB → inactive. Stripe → subscription.cancel() right now.
 *      (Unchanged from the original.)
 *
 *   2. Greek "leave" (mode === 'leave'):
 *      A non-owner Greek member walks out of the group.
 *      - Their MEMBER row is marked inactive + isCancelled.
 *      - Their tokens for THIS group are deactivated.
 *      - METADATA, other members, and Stripe are NOT touched.
 *      - Owners cannot leave — they must use 'owner_delete' instead.
 *
 *   3. Greek "owner_delete" (mode === 'owner_delete'):
 *      The billing owner of a Greek group cancels the subscription.
 *      - Stripe sub(s) are flipped to `cancel_at_period_end: true` so the
 *        owner pays through the term they already bought and Stripe stops
 *        renewing at the period boundary.
 *      - METADATA is stamped with cancel_at_period_end + cancel_scheduled_at
 *        so the UI can show "ending on <date>" and downstream lambdas can
 *        see the intent.
 *      - METADATA.status is left as 'active' on purpose: members keep full
 *        access (read + write) until the natural expires_at lifecycle in
 *        sendExpiryReminder takes the group through read_only → suspended →
 *        deleted. That guarantees the year of service the owner paid for.
 *      - No MEMBER or TOKEN rows are deactivated here — that all happens
 *        downstream when expires_at / suspended_at pass.
 *
 * KEY SAFETY GUARANTEES
 * ---------------------
 * - For modes 'cancel' and 'leave' we still UPDATE DB FIRST, then Stripe.
 *   If a Stripe call fails after we've cleaned up the DB, the user is
 *   correctly locked out and we have a retryable Stripe error in logs.
 * - For 'owner_delete' we update Stripe FIRST (it's the operation the user
 *   cares about — they want billing to stop renewing). If Stripe fails the
 *   request fails and we never write `cancel_at_period_end` to METADATA, so
 *   the user can retry without phantom state. If Stripe succeeds and the
 *   DB write fails we log loudly; the next sendExpiryReminder pass will
 *   still cycle the workspace down at expires_at, so members aren't stuck.
 * - ConditionExpression on the MEMBER update prevents double-deactivation
 *   across concurrent calls.
 */

const Stripe = require("stripe");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const MEMBERS_TABLE = "GroupData-dev";
const TOKENS_TABLE = "Tokens";

const cors = { "Access-Control-Allow-Origin": "*" };

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: cors,
    body: JSON.stringify(payload),
  };
}

// Fetch a single MEMBER row.
async function getMember(groupId, userId) {
  const resp = await dynamo.send(
    new GetCommand({
      TableName: MEMBERS_TABLE,
      Key: {
        group_id: groupId,
        group_data_members: `MEMBER#USER#${userId}`,
      },
    })
  );
  return resp.Item || null;
}

// Fetch the METADATA row.
async function getMetadata(groupId) {
  const resp = await dynamo.send(
    new GetCommand({
      TableName: MEMBERS_TABLE,
      Key: { group_id: groupId, group_data_members: "METADATA" },
    })
  );
  return resp.Item || null;
}

// Deactivate one user's MEMBER row + tokens for a given group.
// Used by both the 'leave' and 'cancel' paths. Returns true if the MEMBER
// row was actually flipped, false if it was already inactive.
async function deactivateMemberAndTokens(groupId, userId, now) {
  let memberFlipped = false;
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: MEMBERS_TABLE,
        Key: {
          group_id: groupId,
          group_data_members: `MEMBER#USER#${userId}`,
        },
        UpdateExpression:
          "SET active = :inactive, isCancelled = :cancelled, canceledAt = :timestamp",
        ConditionExpression: "active = :currentlyActive",
        ExpressionAttributeValues: {
          ":inactive": false,
          ":cancelled": true,
          ":timestamp": now,
          ":currentlyActive": true,
        },
      })
    );
    memberFlipped = true;
    console.log("✅ MEMBER record marked inactive");
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      console.log("ℹ️ Membership already inactive — continuing");
    } else {
      throw err;
    }
  }

  // Deactivate this user's active tokens for this group
  try {
    const tokenQuery = await dynamo.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :uid",
        FilterExpression: "group_id = :gid AND active = :active",
        ExpressionAttributeValues: {
          ":uid": userId,
          ":gid": groupId,
          ":active": true,
        },
      })
    );
    console.log(
      `🔍 Found ${tokenQuery.Items?.length || 0} active token(s) to deactivate for user ${userId}`
    );
    for (const token of tokenQuery.Items || []) {
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: TOKENS_TABLE,
            Key: { token_id: token.token_id, user_id: token.user_id },
            UpdateExpression: "SET active = :inactive, ended_at = :endedAt",
            ConditionExpression: "active = :active",
            ExpressionAttributeValues: {
              ":inactive": false,
              ":active": true,
              ":endedAt": now,
            },
          })
        );
      } catch (tokenErr) {
        if (tokenErr.name !== "ConditionalCheckFailedException") {
          console.warn(
            `⚠️ Could not deactivate token ${token.token_id}:`,
            tokenErr.message
          );
        }
      }
    }
  } catch (qErr) {
    console.error("❌ Token deactivation query failed:", qErr.message);
  }

  return memberFlipped;
}

// Pull all active Stripe subscriptions for a customer. Used only as a
// LAST-RESORT lookup when we don't have a stored stripe_subscription_id
// AND the caller has provided a groupId so we can filter by metadata.
// Never call this without filtering — the customer may own multiple subs
// (e.g. a Greek plan and an Individual plan) and acting on all of them
// would silently cancel unrelated memberships.
async function listActiveStripeSubs(stripeCustomerId) {
  if (!stripeCustomerId || stripeCustomerId.startsWith("guest_")) return [];
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "active",
    limit: 10,
  });
  return subs.data || [];
}

// Find THE one Stripe subscription that belongs to a specific membership.
//
// Priority order:
//   1. metadata.stripe_subscription_id        — canonical group→sub mapping
//      written by addMembership (Stripe webhook) on the METADATA row.
//   2. membership.stripe_subscription_id      — same value, mirrored onto
//      the billing-owner MEMBER row, used as a fallback.
//   3. Filter customer's active subs by sub.metadata.groupId === groupId —
//      a defensive lookup for legacy data created before we started
//      capturing the subscription ID at creation time.
//
// Returns the Stripe Subscription object (with id + cancel_at_period_end +
// current_period_end), or null if no matching subscription could be found.
// Returning null means "do nothing in Stripe" — better than acting on the
// wrong subscription.
async function findGroupSubscription({
  stripeCustomerId,
  groupId,
  storedSubscriptionId,
}) {
  if (!stripeCustomerId || stripeCustomerId.startsWith("guest_")) {
    return null;
  }
  // 1. Stored ID path — preferred and exact.
  if (storedSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(storedSubscriptionId);
      // Don't act on subs that are already canceled / incomplete_expired etc.
      if (sub && sub.status !== "canceled" && sub.status !== "incomplete_expired") {
        return sub;
      }
      console.log(
        `ℹ️ Stored subscription ${storedSubscriptionId} is ${sub?.status} — nothing to update`
      );
      return null;
    } catch (e) {
      console.warn(
        `⚠️ Could not retrieve stored subscription ${storedSubscriptionId}:`,
        e.message
      );
      // Fall through to metadata-filter fallback.
    }
  }
  // 2. Metadata-filter fallback — for memberships created before we started
  // storing the subscription ID. We pull the customer's active subs and
  // keep only those whose metadata.groupId matches this group.
  try {
    const all = await listActiveStripeSubs(stripeCustomerId);
    const matches = all.filter(
      (s) => s?.metadata?.groupId === groupId
    );
    if (matches.length === 1) {
      console.log(
        `ℹ️ Found subscription ${matches[0].id} via metadata.groupId fallback`
      );
      return matches[0];
    }
    if (matches.length > 1) {
      console.warn(
        `⚠️ Multiple subs matched groupId=${groupId} via metadata fallback — refusing to guess. Subs: ${matches
          .map((s) => s.id)
          .join(", ")}`
      );
      return null;
    }
    console.log(
      `ℹ️ No subscription matched groupId=${groupId} via metadata fallback (customer has ${all.length} active sub(s))`
    );
    return null;
  } catch (e) {
    console.warn("⚠️ Metadata fallback lookup failed:", e.message);
    return null;
  }
}

// Deactivate every active INVITE# row for a group. Used by the Greek
// owner_delete path so new members can't join a winding-down workspace,
// even though existing members keep access through expires_at.
async function deactivateGroupInvites(groupId, now) {
  try {
    const resp = await dynamo.send(
      new QueryCommand({
        TableName: MEMBERS_TABLE,
        KeyConditionExpression:
          "group_id = :gid AND begins_with(group_data_members, :prefix)",
        FilterExpression: "active = :true",
        ExpressionAttributeValues: {
          ":gid": groupId,
          ":prefix": "INVITE#",
          ":true": true,
        },
      })
    );
    const invites = resp.Items || [];
    for (const inv of invites) {
      try {
        await dynamo.send(
          new UpdateCommand({
            TableName: MEMBERS_TABLE,
            Key: {
              group_id: inv.group_id,
              group_data_members: inv.group_data_members,
            },
            UpdateExpression:
              "SET active = :false, update_at = :now, deactivated_reason = :reason",
            ExpressionAttributeValues: {
              ":false": false,
              ":now": now,
              ":reason": "owner_delete",
            },
          })
        );
      } catch (e) {
        console.warn(
          `⚠️ Could not deactivate invite ${inv.group_data_members}:`,
          e.message
        );
      }
    }
    console.log(
      `✅ Deactivated ${invites.length} INVITE row(s) on group ${groupId}`
    );
    return invites.length;
  } catch (e) {
    console.warn("⚠️ deactivateGroupInvites query failed:", e.message);
    return 0;
  }
}

// Give one seat back to a group's counters when a member leaves / switches
// out / cancels. This is the mirror image of the increment acceptInvite does
// on join, so the displayed "X of Y seats used" stays accurate.
//
//   - INVITE#<code>.current_uses → decremented by 1 (floored at 0). If the
//     invite had been marked used=true because it filled up, dropping back
//     below max_uses reopens it (used=false) so the freed seat is claimable.
//   - METADATA.current_uses      → decremented by 1 (floored at 0).
//
// Only ONE invite seat is released per call — a single member leaving frees
// exactly one seat. We floor at 0 everywhere so concurrent/duplicate calls
// can never drive a counter negative.
//
// IMPORTANT: do NOT call this from the owner_delete path. There, members keep
// their seats through the term the owner already paid for, so the counts must
// stay put until the natural expires_at lifecycle tears the group down.
async function releaseSeat(groupId, now) {
  // 1. INVITE row
  try {
    const resp = await dynamo.send(
      new QueryCommand({
        TableName: MEMBERS_TABLE,
        KeyConditionExpression:
          "group_id = :gid AND begins_with(group_data_members, :prefix)",
        FilterExpression: "active = :true",
        ExpressionAttributeValues: {
          ":gid": groupId,
          ":prefix": "INVITE#",
          ":true": true,
        },
      })
    );
    const invites = resp.Items || [];
    // Prefer an invite that actually has a seat to give back.
    const target =
      invites.find((inv) => Number(inv.current_uses || 0) > 0) || invites[0];
    if (target) {
      const curr = Number(target.current_uses || 0);
      const max = Number(target.max_uses || 0);
      const next = Math.max(0, curr - 1);
      // Reopen the invite if a seat opened back up under the cap.
      const reopen = max > 0 && next < max;
      await dynamo.send(
        new UpdateCommand({
          TableName: MEMBERS_TABLE,
          Key: {
            group_id: target.group_id,
            group_data_members: target.group_data_members,
          },
          UpdateExpression:
            "SET current_uses = :next, used = :used, update_at = :now",
          ExpressionAttributeValues: {
            ":next": next,
            ":used": reopen ? false : target.used === true,
            ":now": now,
          },
        })
      );
      console.log(
        `↩️ INVITE ${target.group_data_members} current_uses ${curr} → ${next}${
          reopen ? " (reopened)" : ""
        }`
      );
    } else {
      console.log(`ℹ️ No active INVITE to release a seat on for ${groupId}`);
    }
  } catch (e) {
    console.warn("⚠️ releaseSeat INVITE update failed:", e.message);
  }

  // 2. METADATA.current_uses
  try {
    const meta = await getMetadata(groupId);
    const curr = Number(meta?.current_uses || 0);
    const next = Math.max(0, curr - 1);
    await dynamo.send(
      new UpdateCommand({
        TableName: MEMBERS_TABLE,
        Key: { group_id: groupId, group_data_members: "METADATA" },
        UpdateExpression: "SET current_uses = :next, update_at = :now",
        ExpressionAttributeValues: { ":next": next, ":now": now },
      })
    );
    console.log(`↩️ METADATA current_uses ${curr} → ${next} for ${groupId}`);
  } catch (e) {
    console.warn("⚠️ releaseSeat METADATA update failed:", e.message);
  }
}

exports.handler = async (event) => {
  console.log("📥 delete-membership event:", JSON.stringify(event, null, 2));

  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;

    const userId = body?.userId;
    const groupId = body?.groupId;
    const rawMode = body?.mode;
    const mode = typeof rawMode === "string" ? rawMode.toLowerCase() : null;

    if (!userId || !groupId) {
      return respond(400, {
        success: false,
        error: "Missing userId or groupId",
      });
    }

    const now = new Date().toISOString();

    // ── Step 1: load membership + metadata ────────────────────────────────
    const membership = await getMember(groupId, userId);
    if (!membership) {
      return respond(404, { success: false, error: "Membership not found" });
    }
    const metadata = await getMetadata(groupId);

    // Greek detection: prefer authoritative plan_type, fall back to groupId
    // prefix for legacy rows that pre-date plan_type.
    const planType = (metadata?.plan_type || "").toLowerCase();
    const greekByPrefix = (groupId || "").toLowerCase().startsWith("greek");
    const isGreek = planType === "greek" || greekByPrefix;

    // Convenience: the member's own ownership flags
    const memberIsAdminOwner =
      membership.is_owner === true || membership.is_owner?.BOOL === true;
    const memberIsBillingOwner =
      membership.is_billing_owner === true ||
      membership.is_billing_owner?.BOOL === true ||
      // Legacy rows didn't have is_billing_owner. If they're flagged as
      // admin owner AND the metadata billing_owner_user_id matches, treat
      // them as billing owner so legacy groups still work.
      (memberIsAdminOwner && metadata?.billing_owner_user_id === userId);

    // ── Step 2: Greek branches ────────────────────────────────────────────
    if (isGreek) {
      if (mode === "leave") {
        // Owners can't quietly walk away — they're still the billing owner.
        // Force them through owner_delete (which handles Stripe) or transfer.
        if (memberIsBillingOwner) {
          return respond(403, {
            success: false,
            error:
              "You're the billing owner of this Greek subscription. Use \"Delete subscription\" to cancel future renewals, or contact billing@nightlinecomo.com to transfer ownership first.",
            code: "OWNER_CANNOT_LEAVE",
          });
        }
        await deactivateMemberAndTokens(groupId, userId, now);
        // Hand the seat back so the group's counts reflect the departure.
        await releaseSeat(groupId, now);
        console.log(
          `🚪 User ${userId} left Greek group ${groupId} (no Stripe action)`
        );
        return respond(200, {
          success: true,
          mode: "leave",
          message: "You've left the group.",
          timestamp: now,
        });
      }

      if (mode === "owner_delete") {
        if (!memberIsBillingOwner) {
          return respond(403, {
            success: false,
            error:
              "Only the billing owner can delete this subscription. If you just want to leave the group, tap Leave.",
            code: "NOT_BILLING_OWNER",
          });
        }

        // Stripe FIRST: flip cancel_at_period_end=true on THIS group's
        // subscription only. We never call list-and-update-all because the
        // customer may also be paying for unrelated plans (Individual,
        // Group, another Greek) and we'd cancel them all.
        const stripeCustomerId =
          metadata?.stripe_customer_id ||
          membership.stripe_customer_id ||
          null;
        const storedSubscriptionId =
          metadata?.stripe_subscription_id ||
          membership.stripe_subscription_id ||
          null;

        const updatedSubs = [];
        if (stripeCustomerId && !stripeCustomerId.startsWith("guest_")) {
          try {
            const targetSub = await findGroupSubscription({
              stripeCustomerId,
              groupId,
              storedSubscriptionId,
            });
            if (targetSub) {
              const updated = await stripe.subscriptions.update(targetSub.id, {
                cancel_at_period_end: true,
              });
              updatedSubs.push({
                id: updated.id,
                cancel_at: updated.cancel_at,
                current_period_end: updated.current_period_end,
              });
              console.log(
                `✅ Stripe sub ${updated.id} set to cancel_at_period_end (period_end=${updated.current_period_end})`
              );
            } else {
              console.log(
                `ℹ️ No matching Stripe subscription for group ${groupId} — manually added or already canceled. Skipping Stripe.`
              );
            }
          } catch (stripeErr) {
            console.error(
              "❌ Stripe cancel_at_period_end failed:",
              stripeErr.message
            );
            return respond(502, {
              success: false,
              error:
                "We couldn't reach Stripe to schedule the cancellation. Please try again in a minute — your subscription is unchanged.",
              code: "STRIPE_UPDATE_FAILED",
              detail: stripeErr.message,
            });
          }
        } else {
          console.log(
            "ℹ️ Greek group has no Stripe customer ID — manually added. Recording cancel intent in DB only."
          );
        }

        // Stamp METADATA with the cancel intent. Status stays 'active' —
        // sendExpiryReminder will transition it naturally at expires_at.
        try {
          await dynamo.send(
            new UpdateCommand({
              TableName: MEMBERS_TABLE,
              Key: {
                group_id: groupId,
                group_data_members: "METADATA",
              },
              UpdateExpression:
                "SET cancel_at_period_end = :true, cancel_scheduled_at = :now, cancel_initiated_by = :uid, update_at = :now",
              ExpressionAttributeValues: {
                ":true": true,
                ":now": now,
                ":uid": userId,
              },
            })
          );
          console.log("✅ METADATA stamped with cancel_at_period_end");
        } catch (metaErr) {
          // Stripe is already on cancel_at_period_end. Log loudly but don't
          // fail the request — the natural expiry lifecycle will still wind
          // the group down on schedule.
          console.error(
            "⚠️ Stripe was updated but METADATA stamp failed:",
            metaErr.message
          );
        }

        // Deactivate any outstanding INVITE# rows for this group so nobody
        // new can join while the workspace is winding down. Existing members
        // are unaffected — they keep their MEMBER row + tokens until the
        // natural expires_at lifecycle suspends the group.
        const invitesDeactivated = await deactivateGroupInvites(groupId, now);

        return respond(200, {
          success: true,
          mode: "owner_delete",
          message:
            "Your subscription is scheduled to end at the end of the current term. You and your members keep access until then.",
          stripeSubscriptions: updatedSubs,
          invitesDeactivated,
          expiresAt: metadata?.expires_at || null,
          timestamp: now,
        });
      }

      // Greek + no recognized mode → block (legacy behavior)
      return respond(403, {
        success: false,
        error:
          "Greek subscriptions need an explicit action — pass mode='leave' (member) or mode='owner_delete' (billing owner).",
        code: "GREEK_MODE_REQUIRED",
      });
    }

    // ── Step 3: non-Greek path — immediate cancel (unchanged behavior) ─────
    // Anything other than 'leave' on a non-Greek plan falls through to the
    // original immediate-cancel flow.
    const stripeCustomerId = membership.stripe_customer_id || null;
    console.log(
      "🔍 stripeCustomerId:",
      stripeCustomerId || "(none — manually added)"
    );

    // 2️⃣ Mark MEMBER record inactive — conditional so only one concurrent call wins
    const flipped = await deactivateMemberAndTokens(groupId, userId, now);
    if (!flipped) {
      return respond(200, {
        success: true,
        message: "Membership was already canceled",
        canceledSubscriptions: [],
      });
    }

    // 3️⃣ Mark METADATA record inactive (non-Greek only — Greek has lifecycle)
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: MEMBERS_TABLE,
          Key: {
            group_id: groupId,
            group_data_members: "METADATA",
          },
          UpdateExpression: "SET active = :inactive",
          ExpressionAttributeValues: { ":inactive": false },
        })
      );
      console.log("✅ METADATA record marked inactive");
    } catch (err) {
      console.warn("⚠️ Could not update METADATA record:", err.message);
    }

    // 3.5️⃣ Give the seat back on the counters too (mirrors acceptInvite's
    // join increment). Floored at 0, so even though we just deactivated the
    // group this can't drive counts negative.
    await releaseSeat(groupId, now);

    // 4️⃣ Cancel Stripe LAST — DB is already clean. Only target the ONE
    // subscription that belongs to this membership. If we can't identify
    // it (no stored ID + no metadata match) we skip Stripe instead of
    // canceling unrelated subs the customer also pays for.
    const canceledSubscriptionIds = [];
    const storedSubId =
      metadata?.stripe_subscription_id ||
      membership.stripe_subscription_id ||
      null;
    if (stripeCustomerId && !stripeCustomerId.startsWith("guest_")) {
      try {
        const targetSub = await findGroupSubscription({
          stripeCustomerId,
          groupId,
          storedSubscriptionId: storedSubId,
        });
        if (targetSub) {
          await stripe.subscriptions.cancel(targetSub.id);
          canceledSubscriptionIds.push(targetSub.id);
          console.log(`✅ Canceled Stripe subscription: ${targetSub.id}`);
        } else {
          console.log(
            `ℹ️ No matching Stripe subscription for group ${groupId} — skipping Stripe cancellation`
          );
        }
      } catch (stripeErr) {
        // DB is already clean; log but don't fail the request.
        console.error(
          "⚠️ Stripe cancellation error (DB already updated):",
          stripeErr.message
        );
      }
    } else {
      console.log(
        "ℹ️ No Stripe customer ID — skipping Stripe cancellation (manually added membership)"
      );
    }

    console.log(`✅ Membership deleted for user ${userId} in group ${groupId}`);
    return respond(200, {
      success: true,
      canceledSubscriptions: canceledSubscriptionIds,
      timestamp: now,
    });
  } catch (err) {
    console.error("❌ Error deleting membership:", err);
    return respond(500, { success: false, error: err.message });
  }
};
