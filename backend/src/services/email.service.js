const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporterPromise = null;

// Real SMTP if it is configured, otherwise a throwaway Ethereal inbox created
// on first send. Ethereal accepts everything and gives back a preview URL,
// which is what we log for the demo.
async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (env.SMTP_HOST && env.SMTP_USER) {
        return nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT || 587,
          secure: env.SMTP_PORT === 465,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        });
      }
      const account = await nodemailer.createTestAccount();
      console.log(`Email: using Ethereal test inbox (${account.user})`);
      return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    })();
  }
  return transporterPromise;
}

// Email must never break the request that triggered it: a failed SMTP call is
// logged, not thrown. Payments in particular are not rolled back because a
// receipt could not be delivered.
async function sendMail({ to, subject, html, text }) {
  if (env.isTest) return { skipped: true };
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ' '),
      html,
    });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log(`Email sent to ${to} - preview: ${preview}`);
    return { messageId: info.messageId, preview };
  } catch (err) {
    console.error(`Email to ${to} failed: ${err.message}`);
    return { error: err.message };
  }
}

const layout = (title, body) => `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="margin:0 0 16px;font-size:18px;color:#111827">${title}</h2>
    <div style="font-size:14px;line-height:1.6">${body}</div>
    <p style="margin-top:28px;font-size:12px;color:#6b7280">Octopi Digital - SaaS subscription platform</p>
  </div>
`;

const button = (href, label) => `
  <p style="margin:22px 0">
    <a href="${href}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">${label}</a>
  </p>
  <p style="font-size:12px;color:#6b7280">If the button does not work, paste this link into your browser:<br>${href}</p>
`;

const money = (amount, currency = 'usd') =>
  `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;

const templates = {
  memberInvited: ({ inviteUrl, orgName, invitedBy }) => ({
    subject: `You have been invited to join ${orgName}`,
    html: layout(
      `Join ${orgName}`,
      `<p>${invitedBy} invited you to join <strong>${orgName}</strong> on Octopi Digital.</p>
       <p>Set your password to activate your account. This link expires in 7 days.</p>
       ${button(inviteUrl, 'Accept invitation')}`
    ),
  }),

  passwordReset: ({ resetUrl, name }) => ({
    subject: 'Reset your password',
    html: layout(
      'Reset your password',
      `<p>Hi ${name}, we received a request to reset your password.</p>
       <p>This link expires in 1 hour. If you did not ask for this, you can ignore this email.</p>
       ${button(resetUrl, 'Choose a new password')}`
    ),
  }),

  paymentSucceeded: ({ orgName, planName, amount, currency, invoiceNumber }) => ({
    subject: `Payment received - ${planName}`,
    html: layout(
      'Payment received',
      `<p>We received your payment for <strong>${orgName}</strong>.</p>
       <ul>
         <li>Plan: ${planName}</li>
         <li>Amount: ${money(amount, currency)}</li>
         <li>Invoice: ${invoiceNumber}</li>
       </ul>
       <p>Your subscription is active. The invoice PDF is available on your billing page.</p>`
    ),
  }),

  paymentFailed: ({ orgName, planName, amount, currency, reason }) => ({
    subject: `Payment failed - ${planName}`,
    html: layout(
      'Payment failed',
      `<p>We could not process the payment of ${money(amount, currency)} for <strong>${orgName}</strong>.</p>
       ${reason ? `<p>Reason given by the card issuer: ${reason}</p>` : ''}
       <p>Please update your payment method from the billing page to keep your subscription active.</p>`
    ),
  }),

  subscriptionChanged: ({ orgName, action, planName }) => ({
    subject: `Subscription ${action}`,
    html: layout(
      `Subscription ${action}`,
      `<p>The subscription for <strong>${orgName}</strong> was ${action}.</p>
       <p>Current plan: <strong>${planName}</strong>.</p>`
    ),
  }),

  subscriptionExpiring: ({ orgName, planName, renewsOn }) => ({
    subject: 'Your subscription renews soon',
    html: layout(
      'Renewal reminder',
      `<p>The <strong>${planName}</strong> subscription for <strong>${orgName}</strong> renews on ${renewsOn}.</p>
       <p>Make sure your payment method is up to date to avoid interruption.</p>`
    ),
  }),
};

// Fire-and-forget wrapper used by the payment flow.
function notify(template, to, data) {
  const { subject, html } = templates[template](data);
  return sendMail({ to, subject, html });
}

module.exports = { sendMail, notify, templates };
