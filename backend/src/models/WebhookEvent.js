const mongoose = require('mongoose');

// Idempotency ledger. The event id is inserted inside the same transaction that
// applies the event's effects, so a redelivered webhook hits the unique index
// and the whole transaction aborts without changing anything.
const webhookEventSchema = new mongoose.Schema(
  {
    stripeEventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
