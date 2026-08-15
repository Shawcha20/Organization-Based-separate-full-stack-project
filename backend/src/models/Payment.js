const mongoose = require('mongoose');
const { PAYMENT_STATUS } = require('../utils/constants');

// One row per money movement reported by Stripe. No card data is ever stored -
// only Stripe's identifiers and the last four digits Stripe hands back.
const paymentSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
    },
    description: { type: String, default: '' },
    planName: { type: String, default: '' },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },

    invoiceNumber: { type: String, default: null, index: true },
    cardBrand: { type: String, default: '' },
    cardLast4: { type: String, default: '' },

    stripePaymentIntentId: { type: String, default: null },
    stripeInvoiceId: { type: String, default: null },
    stripeSessionId: { type: String, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ organization: 1, createdAt: -1 });
paymentSchema.index({ organization: 1, status: 1 });

// Stripe can deliver the same invoice event more than once, so the invoice id
// is unique. It has to be a *partial* index rather than a sparse one: the field
// defaults to null, and a sparse index still indexes an explicit null, which
// would make any two invoice-less payments collide.
paymentSchema.index(
  { stripeInvoiceId: 1 },
  { unique: true, partialFilterExpression: { stripeInvoiceId: { $type: 'string' } } }
);

module.exports = mongoose.model('Payment', paymentSchema);
