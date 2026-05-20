/**
 * SHARED: Greek subscription helpers
 *
 * Small utilities used by multiple lambdas so the "what counts as Greek"
 * definition and the expiry math stay in one place.
 */

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Grace period (post-expiry read-only) in days.
const READ_ONLY_GRACE_DAYS = 7;
// Retention after suspension (before hard delete) in days.
const RETENTION_DAYS = 30;

function isGreekGroupId(groupId) {
  return (groupId || "").toLowerCase().startsWith("greek");
}

function isGreekPlanType(planType) {
  return (planType || "").toLowerCase() === "greek";
}

function computeGreekTermDates(startIso) {
  const start = startIso ? new Date(startIso) : new Date();
  const expiresAt = new Date(start.getTime() + ONE_YEAR_MS);
  const readOnlyAt = expiresAt; // grace starts immediately at expiry
  const suspendedAt = new Date(expiresAt.getTime() + READ_ONLY_GRACE_DAYS * ONE_DAY_MS);
  const purgeAt = new Date(suspendedAt.getTime() + RETENTION_DAYS * ONE_DAY_MS);
  return {
    expiresAt: expiresAt.toISOString(),
    readOnlyAt: readOnlyAt.toISOString(),
    suspendedAt: suspendedAt.toISOString(),
    purgeAt: purgeAt.toISOString(),
  };
}

/**
 * Compares two ISO timestamps and returns the whole number of days `target`
 * is AFTER `now` (negative if target is in the past).
 */
function daysUntil(targetIso, nowIso) {
  const target = new Date(targetIso).getTime();
  const now = (nowIso ? new Date(nowIso) : new Date()).getTime();
  return Math.floor((target - now) / ONE_DAY_MS);
}

module.exports = {
  ONE_DAY_MS,
  READ_ONLY_GRACE_DAYS,
  RETENTION_DAYS,
  isGreekGroupId,
  isGreekPlanType,
  computeGreekTermDates,
  daysUntil,
};
