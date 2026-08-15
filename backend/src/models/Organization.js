const mongoose = require('mongoose');
const { ORG_STATUS } = require('../utils/constants');

// The tenant root. Every tenant-scoped document points back here.
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    billingEmail: { type: String, required: true, lowercase: true, trim: true },
    contactEmail: { type: String, lowercase: true, trim: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: Object.values(ORG_STATUS),
      default: ORG_STATUS.PENDING,
      index: true,
    },
    stripeCustomerId: { type: String, default: null },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

// Backs the platform admin's "search by name" on the organizations list.
organizationSchema.index({ name: 'text' });
organizationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Organization', organizationSchema);
