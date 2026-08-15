const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const PendingRegistration = require('../models/PendingRegistration');
const WebhookEvent = require('../models/WebhookEvent');
const Counter = require('../models/Counter');

const { slugify } = require('../utils/slug');
const { notify } = require('./email.service');
const {
  ROLES,
  ORG_STATUS,
  USER_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} = require('../utils/constants');

// Thrown when an event has already been applied. It aborts the transaction
// without leaving anything behind and is reported to Stripe as a success, so
// Stripe stops retrying.
class AlreadyProcessed extends Error {
  constructor(message = 'Event already processed') {
    super(message);
    this.name = 'AlreadyProcessed';
  }
}

// --- small helpers -------------------------------------------------------

function periodFrom(stripeSubscription) {
  const item = stripeSubscription?.items?.data?.[0] || {};
  const start = stripeSubscription?.current_period_start ?? item.current_period_start;
  const end = stripeSubscription?.current_period_end ?? item.current_period_end;
  return {
    currentPeriodStart: start ? new Date(start * 1000) : new Date(),
    currentPeriodEnd: end ? new Date(end * 1000) : null,
  };
}

async function nextInvoiceNumber(session) {
  const seq = await Counter.next('invoice', session);
  const year = new Date().getFullYear();
  return `INV-${year}-${String(seq).padStart(5, '0')}`;
}

async function uniqueSlug(name, session) {
  const base = slugify(name);
  let candidate = base;
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const taken = await Organization.exists({ slug: candidate }).session(session);
    if (!taken) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// Recorded first thing inside every transaction. The unique index on
// stripeEventId is what actually makes redelivery safe: a second insert of the
// same id fails and rolls the whole transaction back.
async function claimEvent(event, session) {
  const seen = await WebhookEvent.findOne({ stripeEventId: event.id }).session(session);
  if (seen) throw new AlreadyProcessed(`Event ${event.id} already processed`);
  await WebhookEvent.create([{ stripeEventId: event.id, type: event.type }], { session });
}

function runInTransaction(work) {
  return mongoose.connection.transaction(work);
}

// --- registration --------------------------------------------------------

/**
 * Paid onboarding. Everything the new tenant needs - organization, admin user,
 * subscription, payment and ledger entry - is written as one unit. If any step
 * throws, none of it exists and the customer can retry checkout.
 */
async function fulfilRegistration({ event, session: checkoutSession, stripeSubscription }) {
  let outcome = null;

  await runInTransaction(async (session) => {
    await claimEvent(event, session);

    const pending = await PendingRegistration.findById(
      checkoutSession.metadata.pendingRegistrationId
    )
      .select('+passwordHash')
      .session(session);

    if (!pending) throw new AlreadyProcessed('Registration record no longer exists');
    if (pending.status === 'COMPLETED') {
      throw new AlreadyProcessed('Registration already completed');
    }

    const plan = await Plan.findById(pending.plan).session(session);
    if (!plan) throw new Error(`Plan ${pending.plan} is missing`);

    const [organization] = await Organization.create(
      [
        {
          name: pending.organizationName,
          slug: await uniqueSlug(pending.organizationName, session),
          billingEmail: pending.email,
          contactEmail: pending.email,
          status: ORG_STATUS.ACTIVE,
          stripeCustomerId: checkoutSession.customer,
          plan: plan._id,
        },
      ],
      { session }
    );

    const [admin] = await User.create(
      [
        {
          organization: organization._id,
          name: pending.adminName,
          email: pending.email,
          passwordHash: pending.passwordHash,
          role: ROLES.ORG_ADMIN,
          status: USER_STATUS.ACTIVE,
        },
      ],
      { session }
    );

    const period = periodFrom(stripeSubscription);
    const [subscription] = await Subscription.create(
      [
        {
          organization: organization._id,
          plan: plan._id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          planName: plan.name,
          amount: plan.price,
          currency: plan.currency,
          interval: plan.interval,
          stripeSubscriptionId: stripeSubscription?.id || null,
          ...period,
        },
      ],
      { session }
    );

    const invoiceNumber = await nextInvoiceNumber(session);
    const [payment] = await Payment.create(
      [
        {
          organization: organization._id,
          subscription: subscription._id,
          amount: checkoutSession.amount_total ?? plan.price,
          currency: checkoutSession.currency || plan.currency,
          status: PAYMENT_STATUS.SUCCESS,
          description: `${plan.name} - initial subscription`,
          planName: plan.name,
          periodStart: period.currentPeriodStart,
          periodEnd: period.currentPeriodEnd,
          paidAt: new Date(),
          invoiceNumber,
          stripeSessionId: checkoutSession.id,
          stripeInvoiceId: checkoutSession.invoice || null,
          stripePaymentIntentId: checkoutSession.payment_intent || null,
        },
      ],
      { session }
    );

    await Transaction.create(
      [
        {
          organization: organization._id,
          payment: payment._id,
          subscription: subscription._id,
          type: TRANSACTION_TYPE.SUBSCRIPTION_CREATE,
          status: TRANSACTION_STATUS.SUCCESS,
          amount: payment.amount,
          currency: payment.currency,
          description: `Subscription activated on ${plan.name}`,
          reference: event.id,
        },
      ],
      { session }
    );

    pending.status = 'COMPLETED';
    pending.organization = organization._id;
    pending.stripeCustomerId = checkoutSession.customer;
    await pending.save({ session });

    outcome = { organization, admin, plan, payment, invoiceNumber };
  });

  // Email only after the commit succeeded - a failed send must never undo a
  // paid subscription.
  if (outcome) {
    await notify('paymentSucceeded', outcome.organization.billingEmail, {
      orgName: outcome.organization.name,
      planName: outcome.plan.name,
      amount: outcome.payment.amount,
      currency: outcome.payment.currency,
      invoiceNumber: outcome.invoiceNumber,
    });
  }
  return outcome;
}

// --- recurring payments --------------------------------------------------

/** A renewal or proration invoice was paid. */
async function recordInvoicePaid({ event, invoice }) {
  let outcome = null;

  await runInTransaction(async (session) => {
    await claimEvent(event, session);

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription,
    }).session(session);

    // The registration webhook has not landed yet; that handler owns the very
    // first payment, so there is nothing to do here.
    if (!subscription) throw new AlreadyProcessed('No local subscription for this invoice');

    // Second safety net beside the unique index on stripeInvoiceId.
    const existing = await Payment.findOne({ stripeInvoiceId: invoice.id }).session(session);
    if (existing) throw new AlreadyProcessed('Invoice already recorded');

    const organization = await Organization.findById(subscription.organization).session(session);
    if (!organization) throw new Error('Organization missing for subscription');

    const line = invoice.lines?.data?.[0];
    const periodStart = line?.period?.start ? new Date(line.period.start * 1000) : new Date();
    const periodEnd = line?.period?.end ? new Date(line.period.end * 1000) : null;

    const invoiceNumber = await nextInvoiceNumber(session);
    const [payment] = await Payment.create(
      [
        {
          organization: organization._id,
          subscription: subscription._id,
          amount: invoice.amount_paid,
          currency: invoice.currency,
          status: PAYMENT_STATUS.SUCCESS,
          description: `${subscription.planName} - renewal`,
          planName: subscription.planName,
          periodStart,
          periodEnd,
          paidAt: new Date(),
          invoiceNumber,
          stripeInvoiceId: invoice.id,
          stripePaymentIntentId: invoice.payment_intent || null,
        },
      ],
      { session }
    );

    await Transaction.create(
      [
        {
          organization: organization._id,
          payment: payment._id,
          subscription: subscription._id,
          type: TRANSACTION_TYPE.RENEWAL,
          status: TRANSACTION_STATUS.SUCCESS,
          amount: payment.amount,
          currency: payment.currency,
          description: `Renewal payment for ${subscription.planName}`,
          reference: event.id,
        },
      ],
      { session }
    );

    subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
    if (periodEnd) {
      subscription.currentPeriodStart = periodStart;
      subscription.currentPeriodEnd = periodEnd;
      subscription.expiryReminderSentFor = null;
    }
    await subscription.save({ session });

    if (organization.status === ORG_STATUS.PENDING) {
      organization.status = ORG_STATUS.ACTIVE;
      await organization.save({ session });
    }

    outcome = { organization, subscription, payment, invoiceNumber };
  });

  if (outcome) {
    await notify('paymentSucceeded', outcome.organization.billingEmail, {
      orgName: outcome.organization.name,
      planName: outcome.subscription.planName,
      amount: outcome.payment.amount,
      currency: outcome.payment.currency,
      invoiceNumber: outcome.invoiceNumber,
    });
  }
  return outcome;
}

/** A renewal invoice failed. The failure is recorded, not swallowed. */
async function recordInvoiceFailed({ event, invoice }) {
  let outcome = null;

  await runInTransaction(async (session) => {
    await claimEvent(event, session);

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: invoice.subscription,
    }).session(session);
    if (!subscription) throw new AlreadyProcessed('No local subscription for this invoice');

    const organization = await Organization.findById(subscription.organization).session(session);
    if (!organization) throw new Error('Organization missing for subscription');

    const reason =
      invoice.last_finalization_error?.message || 'The card was declined or could not be charged';

    const [payment] = await Payment.create(
      [
        {
          organization: organization._id,
          subscription: subscription._id,
          amount: invoice.amount_due,
          currency: invoice.currency,
          status: PAYMENT_STATUS.FAILED,
          description: `${subscription.planName} - payment failed`,
          planName: subscription.planName,
          failureReason: reason,
          stripeInvoiceId: invoice.id,
        },
      ],
      { session }
    );

    await Transaction.create(
      [
        {
          organization: organization._id,
          payment: payment._id,
          subscription: subscription._id,
          type: TRANSACTION_TYPE.RENEWAL,
          status: TRANSACTION_STATUS.FAILED,
          amount: invoice.amount_due,
          currency: invoice.currency,
          description: `Failed renewal for ${subscription.planName}`,
          failureReason: reason,
          reference: event.id,
        },
      ],
      { session }
    );

    subscription.status = SUBSCRIPTION_STATUS.FAILED;
    await subscription.save({ session });

    outcome = { organization, subscription, amount: invoice.amount_due, currency: invoice.currency, reason };
  });

  if (outcome) {
    await notify('paymentFailed', outcome.organization.billingEmail, {
      orgName: outcome.organization.name,
      planName: outcome.subscription.planName,
      amount: outcome.amount,
      currency: outcome.currency,
      reason: outcome.reason,
    });
  }
  return outcome;
}

// --- subscription lifecycle ---------------------------------------------

/** Keeps our copy in step with Stripe after an upgrade, downgrade or cancel. */
async function syncSubscription({ event, stripeSubscription }) {
  await runInTransaction(async (session) => {
    await claimEvent(event, session);

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: stripeSubscription.id,
    }).session(session);
    if (!subscription) throw new AlreadyProcessed('Unknown subscription');

    const period = periodFrom(stripeSubscription);
    subscription.currentPeriodStart = period.currentPeriodStart;
    subscription.currentPeriodEnd = period.currentPeriodEnd;
    subscription.cancelAtPeriodEnd = Boolean(stripeSubscription.cancel_at_period_end);

    if (stripeSubscription.status === 'canceled') {
      subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
      subscription.cancelledAt = new Date();
    } else if (stripeSubscription.status === 'past_due' || stripeSubscription.status === 'unpaid') {
      subscription.status = SUBSCRIPTION_STATUS.FAILED;
    } else if (stripeSubscription.status === 'active') {
      subscription.status = SUBSCRIPTION_STATUS.ACTIVE;
    }
    await subscription.save({ session });

    if (subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
      const organization = await Organization.findById(subscription.organization).session(session);
      if (organization && organization.status === ORG_STATUS.ACTIVE) {
        organization.status = ORG_STATUS.CANCELLED;
        await organization.save({ session });
      }
      await Transaction.create(
        [
          {
            organization: subscription.organization,
            subscription: subscription._id,
            type: TRANSACTION_TYPE.CANCELLATION,
            status: TRANSACTION_STATUS.SUCCESS,
            amount: 0,
            currency: subscription.currency,
            description: `Subscription cancelled (${subscription.planName})`,
            reference: event.id,
          },
        ],
        { session }
      );
    }
  });
}

module.exports = {
  AlreadyProcessed,
  fulfilRegistration,
  recordInvoicePaid,
  recordInvoiceFailed,
  syncSubscription,
  periodFrom,
  nextInvoiceNumber,
  uniqueSlug,
  runInTransaction,
  claimEvent,
};
