const mongoose = require('mongoose');

// Signup is paid onboarding: the submitted details are parked here until Stripe
// confirms payment via webhook. Nothing is written to Organization/User until
// then, so an abandoned checkout leaves no half-created tenant behind.
const pendingRegistrationSchema = new mongoose.Schema(
  {
    organizationName: { type: String, required: true, trim: true },
    adminName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    // Already hashed here - the plaintext password never reaches the database.
    passwordHash: { type: String, required: true, select: false },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },

    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    stripeSessionId: { type: String, default: null, index: true },
    stripeCustomerId: { type: String, default: null },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    failureReason: { type: String, default: '' },
    // Abandoned attempts clean themselves up after 24h.
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
