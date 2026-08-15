const mongoose = require('mongoose');
const { TRANSACTION_STATUS, TRANSACTION_TYPE } = require('../utils/constants');

// The audit ledger. A Payment is what Stripe did; a Transaction is what our
// system did about it, including attempts that failed or were rolled back.
const transactionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    type: { type: String, enum: Object.values(TRANSACTION_TYPE), required: true },
    status: {
      type: String,
      enum: Object.values(TRANSACTION_STATUS),
      default: TRANSACTION_STATUS.PENDING,
    },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'usd' },
    // Human-readable line for the transactions table.
    description: { type: String, default: '' },
    // Stripe event id or session id, so a row can be traced back to its source.
    reference: { type: String, default: '' },
    failureReason: { type: String, default: '' },
  },
  { timestamps: true }
);

transactionSchema.index({ organization: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
