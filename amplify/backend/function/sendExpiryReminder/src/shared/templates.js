/**
 * SHARED: email templates
 *
 * Every template returns { subject, html }. Plain-text is generated from html by
 * the email helper.
 *
 * Expiry reminders: 6 distinct templates keyed by days-before-expiry. The 1-day
 * and day-of copy is deliberately louder than the 60/30 copy (alarming subject
 * line + urgency in the body) because there is no auto-renew safety net.
 *
 * All expiry templates direct the recipient to billing@nightlinecomo.com to
 * arrange a new year's subscription. There is no self-serve renewal.
 */

const BILLING_EMAIL = "billing@nightlinecomo.com";

function wrap(innerHtml) {
  // Shared shell so every email has consistent branding and contact info.
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#111; line-height:1.5; max-width:560px; margin:0 auto; padding:24px;">
  ${innerHtml}
  <hr style="border:none; border-top:1px solid #ddd; margin:32px 0 16px 0;" />
  <p style="color:#888; font-size:12px;">
    Nightline — to arrange a new subscription, reply to this email or write to
    <a href="mailto:${BILLING_EMAIL}" style="color:#555;">${BILLING_EMAIL}</a>.
  </p>
</body></html>`;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Expiry reminder templates ────────────────────────────────────────────────

function expiryReminder60Day({ chapterName, expiresAt }) {
  return {
    subject: `Your Nightline Greek subscription expires on ${fmtDate(expiresAt)}`,
    html: wrap(`
      <p>Hi ${chapterName || "there"},</p>
      <p>Your chapter's Nightline subscription is set to expire on
        <strong>${fmtDate(expiresAt)}</strong> — about 60 days from now.</p>
      <p>Nightline Greek subscriptions do not renew automatically. To continue
        service into next year, please reach out to
        <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a> when you're ready.
        Starting the conversation early gives us lead time to get your new term
        set up without a gap.</p>
      <p>If you'd rather not continue, no action is needed — your subscription
        will simply end on the date above.</p>
    `),
  };
}

function expiryReminder30Day({ chapterName, expiresAt }) {
  return {
    subject: `Reminder: Nightline subscription expires ${fmtDate(expiresAt)}`,
    html: wrap(`
      <p>Hi ${chapterName || "there"},</p>
      <p>This is a 30-day reminder that your Nightline subscription is set to
        expire on <strong>${fmtDate(expiresAt)}</strong>.</p>
      <p>To avoid any interruption in service, please contact
        <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a> now so we have
        time to provision your new term before the current one ends.</p>
      <p>Greek subscriptions do not renew automatically.</p>
    `),
  };
}

function expiryReminder14Day({ chapterName, expiresAt }) {
  return {
    subject: `14 days until your Nightline subscription expires`,
    html: wrap(`
      <p>Hi ${chapterName || "there"},</p>
      <p>Your Nightline subscription expires on
        <strong>${fmtDate(expiresAt)}</strong> — 14 days from today.</p>
      <p>If you plan to continue next year, please email
        <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a> now. After the
        expiry date, your workspace will move to read-only for a brief grace
        period before being suspended.</p>
    `),
  };
}

function expiryReminder7Day({ chapterName, expiresAt }) {
  return {
    subject: `1 week until your Nightline subscription expires`,
    html: wrap(`
      <p>Hi ${chapterName || "there"},</p>
      <p><strong>Your Nightline subscription expires in 7 days</strong> — on
        ${fmtDate(expiresAt)}.</p>
      <p>If you want to continue, contact
        <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a> today. After
        expiry your chapter will lose the ability to make changes, and shortly
        after that the workspace will be suspended.</p>
    `),
  };
}

// Louder tone starts here.
function expiryReminder1Day({ chapterName, expiresAt }) {
  return {
    subject: `Your Nightline subscription expires tomorrow`,
    html: wrap(`
      <p>Hi ${chapterName || "there"},</p>
      <p><strong style="color:#b00;">Your Nightline subscription expires
        tomorrow (${fmtDate(expiresAt)}).</strong></p>
      <p>If you plan to continue, please email
        <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a> immediately.
        Tomorrow your workspace will become read-only; seven days after that
        it will be suspended; and thirty days after that the data will be
        permanently deleted.</p>
      <p>If you don't plan to continue, no action is needed.</p>
    `),
  };
}

function expiryReminderDayOf({ chapterName }) {
  return {
    subject: `Your Nightline subscription expired today — read-only mode started`,
    html: wrap(`
      <p>Hi ${chapterName || "there"},</p>
      <p><strong style="color:#b00;">Your Nightline subscription expired today.</strong>
        Your workspace is now in <strong>read-only mode</strong>. You can still
        view data, but changes can't be saved.</p>
      <p>You have a 7-day read-only grace period. After that, the workspace
        will be suspended (no access). 30 days after suspension, the data is
        permanently deleted.</p>
      <p>To restore access, email
        <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a> to arrange a new
        subscription. If you purchase within the 30-day retention window, we
        can reconnect your existing data.</p>
    `),
  };
}

function suspensionStarted({ chapterName, purgeAt }) {
  return {
    subject: `Your Nightline workspace has been suspended`,
    html: wrap(`
      <p>Hi ${chapterName || "there"},</p>
      <p>The 7-day grace period on your expired subscription has ended. Your
        workspace is now <strong>suspended</strong> — no one can sign in.</p>
      <p>Data will be retained until <strong>${fmtDate(purgeAt)}</strong>, after
        which it will be permanently deleted.</p>
      <p>If you purchase a new subscription before then by emailing
        <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a>, we can reconnect
        your existing data.</p>
    `),
  };
}

// ── Admin-delete notification ────────────────────────────────────────────────

function adminDeletedWorkspace({ chapterName, deletedByDisplayName }) {
  return {
    subject: `A workspace you pay for has been deleted`,
    html: wrap(`
      <p>Hi,</p>
      <p>The Nightline workspace <strong>${chapterName || "your workspace"}</strong>
        has just been deleted by <strong>${deletedByDisplayName || "the workspace admin"}</strong>.</p>
      <p>You are listed as the <em>billing owner</em> for this workspace. Admin
        rights and billing rights are tracked separately in Nightline, so the
        admin who deleted the workspace is not necessarily the same person who
        paid.</p>
      <p>Your subscription runs through its original expiry date regardless.
        No refund is issued for unused time. If this deletion was a mistake,
        contact <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a> as soon
        as possible — the data is retained briefly before permanent deletion.</p>
    `),
  };
}

// ── Ownership-transfer notifications ─────────────────────────────────────────

function transferPathAConfirmation({ chapterName, newOwnerDisplayName, expiresAt }) {
  return {
    subject: `You transferred admin rights for ${chapterName || "your workspace"}`,
    html: wrap(`
      <p>Hi,</p>
      <p>You just transferred admin rights for
        <strong>${chapterName || "your workspace"}</strong> to
        <strong>${newOwnerDisplayName || "another user"}</strong>.</p>
      <p>You chose <strong>Path A</strong>: you remain the billing owner for the
        current term. Your subscription continues through
        <strong>${fmtDate(expiresAt)}</strong>. No refund is issued if the new
        admin deletes the workspace before then.</p>
      <p>You will continue to receive expiry reminders unless you opt out.</p>
    `),
  };
}

function transferPathBInvite({ chapterName, fromDisplayName, token, expiresAt }) {
  // No renewal UI — new owner's eventual purchase path is still billing@.
  return {
    subject: `${fromDisplayName || "A Nightline user"} wants to transfer ownership of ${chapterName || "a workspace"} to you`,
    html: wrap(`
      <p>Hi,</p>
      <p><strong>${fromDisplayName || "A Nightline user"}</strong> has offered to
        transfer ownership of <strong>${chapterName || "a Nightline workspace"}</strong>
        to you.</p>
      <p>This is a <strong>Path B transfer</strong>:</p>
      <ul>
        <li>Nothing moves mid-term. The current subscription remains paid for
          by the original owner through its expiry date.</li>
        <li>When this term ends, you (the new owner) become responsible for
          arranging the next year's subscription by contacting
          <a href="mailto:${BILLING_EMAIL}">${BILLING_EMAIL}</a>.</li>
        <li>You will receive admin rights, including the ability to delete the
          workspace.</li>
      </ul>
      <p>This invitation expires on <strong>${fmtDate(expiresAt)}</strong>. If
        you don't accept before then, the transfer is cancelled.</p>
      <p>To accept, open the Nightline app and follow the transfer-invitation
        link, or reply to this email with the token <code>${token}</code>.</p>
    `),
  };
}

module.exports = {
  expiryReminder60Day,
  expiryReminder30Day,
  expiryReminder14Day,
  expiryReminder7Day,
  expiryReminder1Day,
  expiryReminderDayOf,
  suspensionStarted,
  adminDeletedWorkspace,
  transferPathAConfirmation,
  transferPathBInvite,
};
