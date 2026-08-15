const mongoose = require('mongoose');
const { BILLING_INTERVAL } = require('../utils/constants');

// Plans are platform-level, not tenant-scoped: every organization picks from
// the same catalogue.
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: '' },
    // Stored in the smallest currency unit (cents) to avoid float rounding.
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'usd', lowercase: true },
    interval: {
      type: String,
      enum: Object.values(BILLING_INTERVAL),
      default: BILLING_INTERVAL.MONTH,
    },
    features: { type: [String], default: [] },
    memberLimit: { type: Number, default: 10, min: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

planSchema.index({ active: 1, price: 1 });

module.exports = mongoose.model('Plan', planSchema);
