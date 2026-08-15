const mongoose = require('mongoose');

// Sequential invoice numbers. `$inc` inside the payment transaction guarantees
// no two invoices can claim the same number, even under concurrent webhooks.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(key, session) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
