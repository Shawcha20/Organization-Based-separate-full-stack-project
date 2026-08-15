const request = require('supertest');

// Stripe itself is never called from the test suite. The webhook payloads
// below are the shapes Stripe actually sends.
jest.mock('../src/services/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: jest.fn() } },
    subscriptions: { retrieve: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  },
  priceDataFor: jest.fn(() => ({ currency: 'usd', unit_amount: 4900 })),
}));

const app = require('../src/app');
const { stripe } = require('../src/services/stripe');

const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Subscription = require('../src/models/Subscription');
const Payment = require('../src/models/Payment');
const Transaction = require('../src/models/Transaction');
const PendingRegistration = require('../src/models/PendingRegistration');
const WebhookEvent = require('../src/models/WebhookEvent');
const Counter = require('../src/models/Counter');

const { createPlan, createTenant } = require('./helpers');
const {
  ORG_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  TRANSACTION_STATUS,
} = require('../src/utils/constants');

const SIGNUP = {
  organizationName: 'Contoso Ltd',
  adminName: 'Ada Admin',
  email: 'ada@contoso.test',
  password: 'Password1',
};

const stripeSubscription = {
  id: 'sub_test_123',
  status: 'active',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
  items: { data: [{ id: 'si_test_1' }] },
};

function checkoutCompletedEvent(pendingId, overrides = {}) {
  return {
    id: overrides.eventId || 'evt_checkout_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        payment_status: 'paid',
        amount_total: 4900,
        currency: 'usd',
        customer: 'cus_test_1',
        subscription: 'sub_test_123',
        invoice: 'in_test_1',
        payment_intent: 'pi_test_1',
        metadata: { kind: 'REGISTRATION', pendingRegistrationId: pendingId.toString() },
      },
    },
  };
}

// The signature check is exercised separately; here constructEvent is told to
// return the event we want to deliver.
const deliver = (event) => {
  stripe.webhooks.constructEvent.mockReturnValueOnce(event);
  return request(app)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', 't=1,v1=fake')
    .send(JSON.stringify(event));
};

async function startRegistration() {
  const plan = await createPlan({ price: 4900 });
  stripe.checkout.sessions.create.mockResolvedValueOnce({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.test/cs_test_1',
  });

  const res = await request(app)
    .post('/api/checkout/register')
    .send({ ...SIGNUP, planId: plan._id.toString() });

  return { plan, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  stripe.subscriptions.retrieve.mockResolvedValue(stripeSubscription);
});

describe('paid registration', () => {
  it('creates only a pending registration before payment, never an active tenant', async () => {
    const { res } = await startRegistration();

    expect(res.status).toBe(201);
    expect(res.body.checkoutUrl).toMatch(/^https:\/\/checkout/);

    const pending = await PendingRegistration.findById(res.body.registrationId);
    expect(pending.status).toBe('PENDING');

    // Nothing exists in the tenant tables yet.
    expect(await Organization.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
    expect(await Subscription.countDocuments()).toBe(0);
  });

  it('never stores the password in plain text, even before payment', async () => {
    const { res } = await startRegistration();

    const pending = await PendingRegistration.findById(res.body.registrationId).select('+passwordHash');
    expect(pending.passwordHash).not.toBe(SIGNUP.password);
    expect(pending.passwordHash.startsWith('$2')).toBe(true);
  });

  it('rejects a signup for an email that already has an account', async () => {
    const { admin } = await createTenant();
    const plan = await createPlan();

    const res = await request(app)
      .post('/api/checkout/register')
      .send({ ...SIGNUP, email: admin.user.email, planId: plan._id.toString() });

    expect(res.status).toBe(409);
  });

  it('reports pending status to the success page until the webhook arrives', async () => {
    await startRegistration();

    const res = await request(app).get('/api/checkout/status').query({ session_id: 'cs_test_1' });

    // The frontend redirect alone proves nothing; this reads our own state.
    expect(res.body.status).toBe('PENDING');
  });
});

describe('webhook fulfilment', () => {
  it('rejects a payload whose signature does not verify', async () => {
    stripe.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed' }));

    expect(res.status).toBe(400);
    expect(await Organization.countDocuments()).toBe(0);
  });

  it('activates the organization, admin, subscription, payment and ledger entry together', async () => {
    const { res } = await startRegistration();
    const pendingId = res.body.registrationId;

    const hook = await deliver(checkoutCompletedEvent(pendingId));
    expect(hook.status).toBe(200);

    const organization = await Organization.findOne({ name: SIGNUP.organizationName });
    expect(organization.status).toBe(ORG_STATUS.ACTIVE);

    const admin = await User.findOne({ email: SIGNUP.email });
    expect(admin.role).toBe('ORG_ADMIN');
    expect(admin.organization).toEqual(organization._id);

    const subscription = await Subscription.findOne({ organization: organization._id });
    expect(subscription.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(subscription.stripeSubscriptionId).toBe('sub_test_123');

    const payment = await Payment.findOne({ organization: organization._id });
    expect(payment.status).toBe(PAYMENT_STATUS.SUCCESS);
    expect(payment.amount).toBe(4900);
    expect(payment.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);
    // No card data is ever persisted.
    expect(payment.toObject()).not.toHaveProperty('cardNumber');

    const transaction = await Transaction.findOne({ organization: organization._id });
    expect(transaction.status).toBe(TRANSACTION_STATUS.SUCCESS);
    expect(transaction.type).toBe('SUBSCRIPTION_CREATE');

    const pending = await PendingRegistration.findById(pendingId);
    expect(pending.status).toBe('COMPLETED');
  });

  it('lets the new admin log in only after the webhook has been processed', async () => {
    const { res } = await startRegistration();

    const before = await request(app)
      .post('/api/auth/login')
      .send({ email: SIGNUP.email, password: SIGNUP.password });
    expect(before.status).toBe(401);

    await deliver(checkoutCompletedEvent(res.body.registrationId));

    const after = await request(app)
      .post('/api/auth/login')
      .send({ email: SIGNUP.email, password: SIGNUP.password });
    expect(after.status).toBe(200);
    expect(after.body.user.role).toBe('ORG_ADMIN');
  });

  it('ignores a session that was not actually paid', async () => {
    const { res } = await startRegistration();
    const event = checkoutCompletedEvent(res.body.registrationId);
    event.data.object.payment_status = 'unpaid';

    await deliver(event);

    expect(await Organization.countDocuments()).toBe(0);
  });

  it('marks the registration failed when checkout expires, and allows a retry', async () => {
    const { res } = await startRegistration();

    await deliver({
      id: 'evt_expired_1',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { kind: 'REGISTRATION', pendingRegistrationId: res.body.registrationId },
        },
      },
    });

    expect((await PendingRegistration.findById(res.body.registrationId)).status).toBe('FAILED');
    expect(await Organization.countDocuments()).toBe(0);

    stripe.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_test_2', url: 'https://checkout.stripe.test/2' });
    const retry = await request(app).post(`/api/checkout/register/${res.body.registrationId}/retry`);

    expect(retry.status).toBe(200);
    expect((await PendingRegistration.findById(res.body.registrationId)).status).toBe('PENDING');
  });
});

describe('duplicate webhook delivery', () => {
  it('applies the same event only once', async () => {
    const { res } = await startRegistration();
    const event = checkoutCompletedEvent(res.body.registrationId);

    const first = await deliver(event);
    const second = await deliver(event);
    const third = await deliver(event);

    expect(first.body).toEqual({ received: true });
    expect(second.body.duplicate).toBe(true);
    expect(third.body.duplicate).toBe(true);
    // Stripe is told the event was handled, so it stops retrying.
    expect(second.status).toBe(200);

    expect(await Organization.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
    expect(await Subscription.countDocuments()).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);
    expect(await Transaction.countDocuments()).toBe(1);
    expect(await WebhookEvent.countDocuments()).toBe(1);
  });

  it('blocks a replay that arrives under a fresh event id', async () => {
    const { res } = await startRegistration();

    await deliver(checkoutCompletedEvent(res.body.registrationId));
    // Same checkout session, different event id: the completed registration is
    // what stops it, not just the event ledger.
    const replay = await deliver(
      checkoutCompletedEvent(res.body.registrationId, { eventId: 'evt_checkout_2' })
    );

    expect(replay.body.duplicate).toBe(true);
    expect(await Payment.countDocuments()).toBe(1);
    expect(await Organization.countDocuments()).toBe(1);
  });
});

describe('transaction rollback', () => {
  it('leaves nothing behind when a step of fulfilment fails', async () => {
    const { res } = await startRegistration();

    // Fail at the last write of the unit of work, after the organization, user
    // and subscription have already been created inside the transaction.
    const boom = jest.spyOn(Counter, 'next').mockRejectedValueOnce(new Error('database went away'));

    const hook = await deliver(checkoutCompletedEvent(res.body.registrationId));

    expect(hook.status).toBe(500);
    expect(boom).toHaveBeenCalled();

    // Every write from the aborted transaction is gone - no orphaned tenant,
    // no half-activated subscription, no ledger entry.
    expect(await Organization.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
    expect(await Subscription.countDocuments()).toBe(0);
    expect(await Payment.countDocuments()).toBe(0);
    expect(await Transaction.countDocuments()).toBe(0);
    expect(await WebhookEvent.countDocuments()).toBe(0);

    // The registration is untouched, so Stripe's retry can still succeed.
    expect((await PendingRegistration.findById(res.body.registrationId)).status).toBe('PENDING');

    boom.mockRestore();
  });

  it('succeeds on Stripe\'s retry after a failed attempt', async () => {
    const { res } = await startRegistration();
    const event = checkoutCompletedEvent(res.body.registrationId);

    jest.spyOn(Counter, 'next').mockRejectedValueOnce(new Error('transient failure'));
    const failed = await deliver(event);
    expect(failed.status).toBe(500);

    jest.spyOn(Counter, 'next').mockRestore();
    const retried = await deliver(event);

    expect(retried.status).toBe(200);
    expect(await Organization.countDocuments()).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);
  });
});

describe('recurring payments', () => {
  const invoiceEvent = (subscriptionId, overrides = {}) => ({
    id: overrides.eventId || 'evt_invoice_1',
    type: overrides.type || 'invoice.payment_succeeded',
    data: {
      object: {
        id: overrides.invoiceId || 'in_renewal_1',
        subscription: subscriptionId,
        billing_reason: 'subscription_cycle',
        amount_paid: 4900,
        amount_due: 4900,
        currency: 'usd',
        payment_intent: 'pi_renewal_1',
        lines: {
          data: [
            {
              period: {
                start: Math.floor(Date.now() / 1000),
                end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
              },
            },
          ],
        },
      },
    },
  });

  it('records a renewal and extends the billing period', async () => {
    const tenant = await createTenant();

    await deliver(invoiceEvent(tenant.subscription.stripeSubscriptionId));

    const payments = await Payment.find({ organization: tenant.organization._id }).sort({ createdAt: 1 });
    expect(payments).toHaveLength(2); // the seeded one plus the renewal
    expect(payments[1].status).toBe(PAYMENT_STATUS.SUCCESS);
    expect(payments[1].invoiceNumber).toMatch(/^INV-/);

    const ledger = await Transaction.findOne({ type: 'RENEWAL' });
    expect(ledger.status).toBe(TRANSACTION_STATUS.SUCCESS);
  });

  it('does not record the same invoice twice', async () => {
    const tenant = await createTenant();

    await deliver(invoiceEvent(tenant.subscription.stripeSubscriptionId));
    const duplicate = await deliver(
      invoiceEvent(tenant.subscription.stripeSubscriptionId, { eventId: 'evt_invoice_2' })
    );

    expect(duplicate.body.duplicate).toBe(true);
    expect(await Payment.countDocuments({ stripeInvoiceId: 'in_renewal_1' })).toBe(1);
  });

  it('records a failed renewal and marks the subscription failed', async () => {
    const tenant = await createTenant();

    await deliver(
      invoiceEvent(tenant.subscription.stripeSubscriptionId, {
        type: 'invoice.payment_failed',
        invoiceId: 'in_failed_1',
      })
    );

    const payment = await Payment.findOne({ stripeInvoiceId: 'in_failed_1' });
    expect(payment.status).toBe(PAYMENT_STATUS.FAILED);
    expect(payment.failureReason).toBeTruthy();

    const ledger = await Transaction.findOne({ status: TRANSACTION_STATUS.FAILED });
    expect(ledger.type).toBe('RENEWAL');

    const subscription = await Subscription.findById(tenant.subscription._id);
    expect(subscription.status).toBe(SUBSCRIPTION_STATUS.FAILED);
  });

  it('skips the first invoice of a subscription, which registration already recorded', async () => {
    const tenant = await createTenant();
    const event = invoiceEvent(tenant.subscription.stripeSubscriptionId);
    event.data.object.billing_reason = 'subscription_create';

    await deliver(event);

    expect(await Payment.countDocuments({ stripeInvoiceId: 'in_renewal_1' })).toBe(0);
  });
});
