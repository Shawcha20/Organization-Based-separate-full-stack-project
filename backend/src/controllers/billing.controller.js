const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const Plan = require('../models/Plan');
const Organization = require('../models/Organization');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { paginate } = require('../utils/paginate');
const { stripe, priceDataFor } = require('../services/stripe');
const { streamInvoice } = require('../services/invoice.service');
const { notify } = require('../services/email.service');
const {
  SUBSCRIPTION_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} = require('../utils/constants');

async function currentSubscription(orgId) {
  return Subscription.findOne({ organization: orgId }).sort({ createdAt: -1 }).populate('plan');
}

/**
 * Anything that changes a subscription has to go through Stripe, so a
 * subscription with no Stripe id cannot be changed here. Seeded demo data is
 * the usual reason - it was inserted directly rather than bought through
 * Checkout.
 */
function requireStripeLink(subscription) {
  if (!subscription.stripeSubscriptionId) {
    throw AppError.badRequest(
      'This subscription is not linked to Stripe, so it cannot be changed. ' +
        'Register an organization through checkout to manage a live subscription.'
    );
  }
}

const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await currentSubscription(req.orgId);
  if (!subscription) throw AppError.notFound('No subscription found for this organization');

  const plans = await Plan.find({ active: true }).sort({ price: 1 }).lean();

  res.json({ subscription, plans });
});

/**
 * Upgrade or downgrade. The Stripe subscription item is swapped in place with
 * prorations, so the customer is only charged the difference. Our copy is
 * updated here and reconciled again when the subscription.updated webhook
 * arrives.
 */
const changePlan = asyncHandler(async (req, res) => {
  const subscription = await currentSubscription(req.orgId);
  if (!subscription) throw AppError.notFound('No subscription found for this organization');
  if (subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
    throw AppError.badRequest('This subscription has been cancelled');
  }

  const plan = await Plan.findOne({ _id: req.body.planId, active: true });
  if (!plan) throw AppError.badRequest('That plan is not available');
  if (plan._id.equals(subscription.plan?._id)) {
    throw AppError.badRequest('You are already on that plan');
  }

  requireStripeLink(subscription);

  const isUpgrade = plan.price > subscription.amount;

  const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    items: [{ id: stripeSub.items.data[0].id, price_data: priceDataFor(plan) }],
    proration_behavior: 'create_prorations',
  });

  subscription.plan = plan._id;
  subscription.planName = plan.name;
  subscription.amount = plan.price;
  subscription.currency = plan.currency;
  subscription.interval = plan.interval;
  await subscription.save();

  await Organization.updateOne({ _id: req.orgId }, { plan: plan._id });

  await Transaction.create({
    organization: req.orgId,
    subscription: subscription._id,
    type: isUpgrade ? TRANSACTION_TYPE.UPGRADE : TRANSACTION_TYPE.DOWNGRADE,
    status: TRANSACTION_STATUS.SUCCESS,
    amount: plan.price,
    currency: plan.currency,
    description: `Plan changed to ${plan.name}`,
  });

  const organization = await Organization.findById(req.orgId);
  await notify('subscriptionChanged', organization.billingEmail, {
    orgName: organization.name,
    action: isUpgrade ? 'upgraded' : 'downgraded',
    planName: plan.name,
  });

  res.json(subscription);
});

/** Cancels at the end of the paid period - the customer keeps what they paid for. */
const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await currentSubscription(req.orgId);
  if (!subscription) throw AppError.notFound('No subscription found for this organization');
  if (subscription.cancelAtPeriodEnd || subscription.status === SUBSCRIPTION_STATUS.CANCELLED) {
    throw AppError.badRequest('This subscription is already cancelled');
  }

  requireStripeLink(subscription);

  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  subscription.cancelAtPeriodEnd = true;
  await subscription.save();

  await Transaction.create({
    organization: req.orgId,
    subscription: subscription._id,
    type: TRANSACTION_TYPE.CANCELLATION,
    status: TRANSACTION_STATUS.SUCCESS,
    amount: 0,
    currency: subscription.currency,
    description: 'Cancellation scheduled for the end of the current period',
  });

  const organization = await Organization.findById(req.orgId);
  await notify('subscriptionChanged', organization.billingEmail, {
    orgName: organization.name,
    action: 'cancelled',
    planName: subscription.planName,
  });

  res.json(subscription);
});

const listPayments = asyncHandler(async (req, res) => {
  const filter = { organization: req.orgId };
  if (req.query.status) filter.status = req.query.status;

  res.json(await paginate(Payment, filter, { query: req.query }));
});

const listTransactions = asyncHandler(async (req, res) => {
  const filter = { organization: req.orgId };
  if (req.query.status) filter.status = req.query.status;

  res.json(await paginate(Transaction, filter, { query: req.query }));
});

/** Invoice PDF. The lookup is tenant-scoped, so ids cannot be walked. */
const downloadInvoice = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, organization: req.orgId });
  if (!payment) throw AppError.notFound('Payment not found');
  if (!payment.invoiceNumber) {
    throw AppError.badRequest('No invoice is available for this payment');
  }

  const organization = await Organization.findById(req.orgId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${payment.invoiceNumber}.pdf"`
  );
  streamInvoice({ payment, organization, res });
});

/**
 * Payment method management is delegated to Stripe's hosted billing portal, so
 * card details never touch our servers or our frontend.
 */
const billingPortal = asyncHandler(async (req, res) => {
  const organization = await Organization.findById(req.orgId);
  if (!organization?.stripeCustomerId) {
    throw AppError.badRequest('No billing profile exists for this organization yet');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: `${env.APP_URL}/org/billing`,
  });

  res.json({ url: session.url });
});

module.exports = {
  getSubscription,
  changePlan,
  cancelSubscription,
  listPayments,
  listTransactions,
  downloadInvoice,
  billingPortal,
};
