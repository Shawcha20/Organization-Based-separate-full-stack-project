// Set before anything loads src/config/env.js, so the suite runs on its own
// throwaway settings and never touches the real database or Stripe account.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused-in-tests';
process.env.JWT_SECRET = 'test_secret_value_for_jest_only';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
process.env.APP_URL = 'http://localhost:3000';

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// A single-node replica set, not a standalone server: the payment flow relies
// on multi-document transactions, which Mongo only offers on a replica set.
let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri(), { dbName: 'octopi_test' });

  // Load every model, then build its indexes - the duplicate-webhook and
  // duplicate-invoice guards are unique indexes, so the tests are meaningless
  // without them.
  require('../src/models/Plan');
  require('../src/models/Organization');
  require('../src/models/User');
  require('../src/models/Subscription');
  require('../src/models/Payment');
  require('../src/models/Transaction');
  require('../src/models/PendingRegistration');
  require('../src/models/WebhookEvent');
  require('../src/models/Counter');

  await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});
