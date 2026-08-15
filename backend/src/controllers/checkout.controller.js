const Plan = require('../models/Plan');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { stripe, priceDataFor } = require('../services/stripe');

// Creates the Stripe Checkout Session for a pending registration. Shared by
// the first attempt and by "retry payment" after an abandoned checkout.
async function createSessionForPending(pending, plan) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: pending.email,
    line_items: [{ price_data: priceDataFor(plan), quantity: 1 }],
    // The webhook trusts nothing from the browser; it reads these instead.
    metadata: {
      kind: 'REGISTRATION',
      pendingRegistrationId: pending._id.toString(),
      planId: plan._id.toString(),
    },
    subscription_data: {
      metadata: {
        kind: 'REGISTRATION',
        pendingRegistrationId: pending._id.toString(),
      },
    },
    success_url: `${env.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/checkout/cancelled?registration=${pending._id}`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  pending.stripeSessionId = session.id;
  await pending.save();

  return session;
}

/**
 * Step 1 of paid onboarding. Nothing is created in the tenant tables here -
 * only a PendingRegistration. The organization comes into existence when the
 * webhook confirms the payment.
 */
const register = asyncHandler(async (req, res) => {
  const { organizationName, adminName, email, password, planId } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const plan = await Plan.findOne({ _id: planId, active: true });
  if (!plan) throw AppError.badRequest('That plan is not available');

  const pending = await PendingRegistration.create({
    organizationName,
    adminName,
    email,
    // Hashed before it is stored; the plaintext never reaches the database.
    passwordHash: await User.hashPassword(password),
    plan: plan._id,
  });

  const session = await createSessionForPending(pending, plan);

  res.status(201).json({
    registrationId: pending._id,
    checkoutUrl: session.url,
    sessionId: session.id,
  });
});

/** Retry a checkout that was cancelled or expired. */
const retry = asyncHandler(async (req, res) => {
  const pending = await PendingRegistration.findById(req.params.id);
  if (!pending) throw AppError.notFound('That registration could not be found');
  if (pending.status === 'COMPLETED') {
    throw AppError.badRequest('This registration is already paid. Please log in.');
  }

  const plan = await Plan.findOne({ _id: pending.plan, active: true });
  if (!plan) throw AppError.badRequest('The selected plan is no longer available');

  pending.status = 'PENDING';
  const session = await createSessionForPending(pending, plan);

  res.json({ registrationId: pending._id, checkoutUrl: session.url, sessionId: session.id });
});

/**
 * The success page polls this. It reports our own database state, which only
 * changes once the webhook has been verified and processed - a user who edits
 * the redirect URL by hand still sees "pending".
 */
const status = asyncHandler(async (req, res) => {
  const { session_id: sessionId } = req.query;
  if (!sessionId) throw AppError.badRequest('Missing checkout session');

  const pending = await PendingRegistration.findOne({ stripeSessionId: sessionId });
  if (!pending) throw AppError.notFound('That checkout session is not recognised');

  res.json({
    status: pending.status,
    registrationId: pending._id,
    email: pending.email,
    organizationName: pending.organizationName,
  });
});

module.exports = { register, retry, status, createSessionForPending };
