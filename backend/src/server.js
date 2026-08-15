const mongoose = require('mongoose');
const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { startExpiryReminders } = require('./jobs/expiryReminder');

async function start() {
  await connectDB();

  // The unique indexes on webhook event ids and Stripe invoice ids are part of
  // how duplicate payments are prevented, so make sure they exist before the
  // first webhook can arrive.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  startExpiryReminders();

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
