const mongoose = require('mongoose');
const { SUBSCRIPTION_STATUS } = require('../utils/constants');

const subscriptionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.PENDING,
    },
    // Snapshot of the plan at purchase time - if a plan's price changes later,
    // historical subscriptions and invoices still show what was actually sold.
    planName: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    interval: { type: String, required: true },

    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },

    stripeSubscriptionId: { type: String, default: null },
    // Set once the "expiring soon" reminder has gone out for the current
    // period, so the reminder job cannot email the same org twice.
    expiryReminderSentFor: { type: Date, default: null },
  },
  { timestamps: true }
);

subscriptionSchema.index({ organization: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
