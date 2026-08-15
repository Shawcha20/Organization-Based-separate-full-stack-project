const Subscription = require('../models/Subscription');
const Organization = require('../models/Organization');
const { notify } = require('../services/email.service');
const { SUBSCRIPTION_STATUS } = require('../utils/constants');

const DAY = 24 * 60 * 60 * 1000;

/**
 * Emails organizations whose subscription renews within three days.
 * `expiryReminderSentFor` records which period the reminder covered, so an
 * organization is reminded once per billing period no matter how often this
 * runs. The field is cleared when a renewal payment starts a new period.
 */
async function sendExpiryReminders() {
  const soon = new Date(Date.now() + 3 * DAY);

  const due = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    currentPeriodEnd: { $gt: new Date(), $lte: soon },
    $or: [{ expiryReminderSentFor: null }, { $expr: { $ne: ['$expiryReminderSentFor', '$currentPeriodEnd'] } }],
  }).limit(100);

  for (const subscription of due) {
    // eslint-disable-next-line no-await-in-loop
    const organization = await Organization.findById(subscription.organization);
    if (!organization) continue;

    // eslint-disable-next-line no-await-in-loop
    await notify('subscriptionExpiring', organization.billingEmail, {
      orgName: organization.name,
      planName: subscription.planName,
      renewsOn: subscription.currentPeriodEnd.toDateString(),
    });

    subscription.expiryReminderSentFor = subscription.currentPeriodEnd;
    // eslint-disable-next-line no-await-in-loop
    await subscription.save();
  }

  return due.length;
}

// A plain interval rather than a cron dependency - one process, one job.
function startExpiryReminders() {
  const run = () =>
    sendExpiryReminders().catch((err) => console.error('Expiry reminder job failed:', err.message));
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
  run();
  return timer;
}

module.exports = { sendExpiryReminders, startExpiryReminders };
