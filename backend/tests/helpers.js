const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Plan = require('../src/models/Plan');
const Subscription = require('../src/models/Subscription');
const Payment = require('../src/models/Payment');
const { signAccessToken } = require('../src/utils/tokens');
const {
  ROLES,
  ORG_STATUS,
  USER_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
} = require('../src/utils/constants');

let counter = 0;
const unique = () => {
  counter += 1;
  return counter;
};

async function createPlan(overrides = {}) {
  const n = unique();
  return Plan.create({
    name: `Plan ${n}`,
    slug: `plan-${n}`,
    price: 4900,
    interval: 'month',
    memberLimit: 25,
    ...overrides,
  });
}

async function createUser({ organization = null, role = ROLES.ORG_MEMBER, password = 'Password1', ...rest } = {}) {
  const n = unique();
  const user = await User.create({
    organization,
    name: rest.name || `User ${n}`,
    email: rest.email || `user${n}@test.dev`,
    passwordHash: await User.hashPassword(password),
    role,
    status: rest.status || USER_STATUS.ACTIVE,
  });
  return { user, token: signAccessToken(user), password };
}

/** A fully set up tenant: organization, plan, subscription, admin and member. */
async function createTenant(overrides = {}) {
  const n = unique();
  const plan = await createPlan();

  const organization = await Organization.create({
    name: overrides.name || `Org ${n}`,
    slug: `org-${n}`,
    billingEmail: `billing${n}@test.dev`,
    status: overrides.status || ORG_STATUS.ACTIVE,
    plan: plan._id,
    stripeCustomerId: `cus_test_${n}`,
  });

  const subscription = await Subscription.create({
    organization: organization._id,
    plan: plan._id,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    planName: plan.name,
    amount: plan.price,
    currency: plan.currency,
    interval: plan.interval,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    stripeSubscriptionId: `sub_test_${n}`,
  });

  const admin = await createUser({
    organization: organization._id,
    role: ROLES.ORG_ADMIN,
    email: `admin${n}@test.dev`,
  });
  const member = await createUser({
    organization: organization._id,
    role: ROLES.ORG_MEMBER,
    email: `member${n}@test.dev`,
  });

  const payment = await Payment.create({
    organization: organization._id,
    subscription: subscription._id,
    amount: plan.price,
    currency: plan.currency,
    status: PAYMENT_STATUS.SUCCESS,
    planName: plan.name,
    invoiceNumber: `INV-TEST-${n}`,
    paidAt: new Date(),
  });

  return { organization, plan, subscription, admin, member, payment };
}

async function createPlatformAdmin() {
  const n = unique();
  return createUser({ role: ROLES.PLATFORM_ADMIN, email: `platform${n}@test.dev` });
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { createPlan, createUser, createTenant, createPlatformAdmin, bearer };
