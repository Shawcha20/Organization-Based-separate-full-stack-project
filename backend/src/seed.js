/**
 * Seeds the plan catalogue, the platform administrator, and one demo
 * organization so all three roles can be logged into straight away.
 *
 * The demo organization is inserted directly rather than paid for, purely so
 * reviewers have working credentials. A real signup always goes through Stripe
 * Checkout and the webhook.
 *
 *   npm run seed
 */
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');

const Plan = require('./models/Plan');
const Organization = require('./models/Organization');
const User = require('./models/User');
const Subscription = require('./models/Subscription');
const Payment = require('./models/Payment');
const Transaction = require('./models/Transaction');
const Counter = require('./models/Counter');

const {
  ROLES,
  ORG_STATUS,
  USER_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} = require('./utils/constants');

const PLANS = [
  {
    slug: 'starter',
    name: 'Starter',
    description: 'For small teams getting started',
    price: 1900,
    interval: 'month',
    memberLimit: 5,
    features: ['Up to 5 members', 'Email support', 'Basic reporting'],
  },
  {
    slug: 'growth',
    name: 'Growth',
    description: 'For teams that need more room',
    price: 4900,
    interval: 'month',
    memberLimit: 25,
    features: ['Up to 25 members', 'Priority support', 'Advanced reporting', 'Invoice history'],
  },
  {
    slug: 'scale',
    name: 'Scale',
    description: 'For established organizations',
    price: 9900,
    interval: 'month',
    memberLimit: 100,
    features: ['Up to 100 members', 'Dedicated support', 'Advanced reporting', 'Audit log'],
  },
];

const CREDENTIALS = {
  platformAdmin: { email: 'admin@octopi.test', password: 'Admin1234' },
  orgAdmin: { email: 'owner@northwind.test', password: 'Owner1234' },
  orgMember: { email: 'member@northwind.test', password: 'Member1234' },
};

async function seed() {
  await connectDB();

  console.log('Seeding plans...');
  const plans = {};
  for (const plan of PLANS) {
    // eslint-disable-next-line no-await-in-loop
    plans[plan.slug] = await Plan.findOneAndUpdate({ slug: plan.slug }, plan, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  }

  console.log('Seeding platform admin...');
  await User.findOneAndUpdate(
    { email: CREDENTIALS.platformAdmin.email },
    {
      name: 'Platform Admin',
      email: CREDENTIALS.platformAdmin.email,
      passwordHash: await User.hashPassword(CREDENTIALS.platformAdmin.password),
      role: ROLES.PLATFORM_ADMIN,
      status: USER_STATUS.ACTIVE,
      organization: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log('Seeding demo organization...');
  const organization = await Organization.findOneAndUpdate(
    { slug: 'northwind-labs' },
    {
      name: 'Northwind Labs',
      slug: 'northwind-labs',
      billingEmail: CREDENTIALS.orgAdmin.email,
      contactEmail: CREDENTIALS.orgAdmin.email,
      contactPhone: '+1 555 0134',
      status: ORG_STATUS.ACTIVE,
      plan: plans.growth._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findOneAndUpdate(
    { email: CREDENTIALS.orgAdmin.email },
    {
      organization: organization._id,
      name: 'Nadia Owner',
      email: CREDENTIALS.orgAdmin.email,
      passwordHash: await User.hashPassword(CREDENTIALS.orgAdmin.password),
      role: ROLES.ORG_ADMIN,
      status: USER_STATUS.ACTIVE,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findOneAndUpdate(
    { email: CREDENTIALS.orgMember.email },
    {
      organization: organization._id,
      name: 'Sam Member',
      email: CREDENTIALS.orgMember.email,
      passwordHash: await User.hashPassword(CREDENTIALS.orgMember.password),
      role: ROLES.ORG_MEMBER,
      status: USER_STATUS.ACTIVE,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await Subscription.findOneAndUpdate(
    { organization: organization._id },
    {
      organization: organization._id,
      plan: plans.growth._id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      planName: plans.growth.name,
      amount: plans.growth.price,
      currency: plans.growth.currency,
      interval: plans.growth.interval,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // One paid invoice so the billing and transaction pages are not empty.
  const existingPayment = await Payment.findOne({ organization: organization._id });
  if (!existingPayment) {
    const seq = await Counter.next('invoice');
    const payment = await Payment.create({
      organization: organization._id,
      subscription: subscription._id,
      amount: plans.growth.price,
      currency: plans.growth.currency,
      status: PAYMENT_STATUS.SUCCESS,
      description: `${plans.growth.name} - initial subscription`,
      planName: plans.growth.name,
      periodStart: now,
      periodEnd,
      paidAt: now,
      invoiceNumber: `INV-${now.getFullYear()}-${String(seq).padStart(5, '0')}`,
    });

    await Transaction.create({
      organization: organization._id,
      payment: payment._id,
      subscription: subscription._id,
      type: TRANSACTION_TYPE.SUBSCRIPTION_CREATE,
      status: TRANSACTION_STATUS.SUCCESS,
      amount: payment.amount,
      currency: payment.currency,
      description: `Subscription activated on ${plans.growth.name}`,
      reference: 'seed',
    });
  }

  console.log('\nDone. Test credentials:');
  console.table(
    Object.entries(CREDENTIALS).map(([role, c]) => ({ role, email: c.email, password: c.password }))
  );

  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
