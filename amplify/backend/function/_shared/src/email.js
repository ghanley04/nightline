/**
 * SHARED: email helper
 *
 * Wraps AWS SES v3 with a single sendEmail(...) function used by every lambda
 * that needs to send mail (sendExpiryReminder, deleteGroup, transferGroupOwnsership,
 * acceptTransfer).
 *
 * DEPLOY PREREQUISITE
 * -------------------
 * The FROM domain (nightlinecomo.com) must be verified in AWS SES in the same
 * region the lambdas run in (us-east-2 based on existing code). Until then SES
 * is sandboxed and the recipient also has to be verified.
 *
 * USAGE
 * -----
 *   const { sendEmail } = require("../../_shared/src/email");
 *   await sendEmail({
 *     to: "someone@example.com",
 *     subject: "...",
 *     html: "...",
 *     text: "...",   // optional — falls back to stripped html
 *   });
 *
 * NON-FATAL FAILURE MODEL
 * -----------------------
 * sendEmail does NOT throw on SES errors. Email is almost always a
 * side-effect of a primary action (transferring ownership, deleting a group,
 * hitting a reminder window). Failing the primary action because SMTP was
 * flaky would be worse than silently dropping an email, so errors are logged
 * and a { ok: false, error } result is returned to the caller.
 */

const {
  SESClient,
  SendEmailCommand,
} = require("@aws-sdk/client-ses");

const REGION = process.env.AWS_REGION || "us-east-2";
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || "billing@nightlinecomo.com";
const REPLY_TO = process.env.SES_REPLY_TO || "billing@nightlinecomo.com";

const ses = new SESClient({ region: REGION });

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || !html) {
    const err = "sendEmail: missing required field (to, subject, html)";
    console.warn(`⚠️ ${err}`);
    return { ok: false, error: err };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const plainText = text || stripHtml(html);

  const cmd = new SendEmailCommand({
    Source: FROM_ADDRESS,
    ReplyToAddresses: [REPLY_TO],
    Destination: { ToAddresses: recipients },
    Message: {
      Subject: { Charset: "UTF-8", Data: subject },
      Body: {
        Html: { Charset: "UTF-8", Data: html },
        Text: { Charset: "UTF-8", Data: plainText },
      },
    },
  });

  try {
    const result = await ses.send(cmd);
    console.log(
      `✉️  SES sent: subject="${subject}" to=${JSON.stringify(recipients)} messageId=${result.MessageId}`
    );
    return { ok: true, messageId: result.MessageId };
  } catch (err) {
    console.error(
      `❌ SES send failed: subject="${subject}" to=${JSON.stringify(recipients)} err=${err.message}`
    );
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail };
