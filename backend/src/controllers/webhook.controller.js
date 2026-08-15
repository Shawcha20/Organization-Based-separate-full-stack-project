const env = require('../config/env');
const { stripe } = require('../services/stripe');
const billing = require('../services/billing.service');
const PendingRegistration = require('../models/PendingRegistration');

/**
 * The only place a payment is ever confirmed. The request must carry a valid
 * Stripe signature over the exact raw body, so a forged POST to this URL is
 * rejected before any handler runs.
 */
const handleStripeWebhook = async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw Buffer - express.json() is deliberately not applied here
      req.headers['stripe-signature'],
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.warn(`Rejected webhook: ${err.message}`);
    return res.status(400).json({ message: 'Invalid signature' });
  }

  try {
    await dispatch(event);
  } catch (err) {
    if (err instanceof billing.AlreadyProcessed) {
      // Redelivery of something we already applied. Acknowledge so Stripe
      // stops retrying; nothing was written a second time.
      console.log(`Webhook ${event.id} skipped: ${err.message}`);
      return res.json({ received: true, duplicate: true });
    }
    // Something genuinely went wrong. The transaction was rolled back, so
    // returning 500 lets Stripe retry against a clean state.
    console.error(`Webhook ${event.id} (${event.type}) failed:`, err);
    return res.status(500).json({ message: 'Webhook processing failed' });
  }

  return res.json({ received: true });
};

async function dispatch(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.payment_status !== 'paid') return;
      if (session.metadata?.kind !== 'REGISTRATION') return;

      const stripeSubscription = session.subscription
        ? await stripe.subscriptions.retrieve(session.subscription)
        : null;

      await billing.fulfilRegistration({ event, session, stripeSubscription });
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      if (session.metadata?.kind !== 'REGISTRATION') return;
      await PendingRegistration.findOneAndUpdate(
        { _id: session.metadata.pendingRegistrationId, status: 'PENDING' },
        { status: 'FAILED', failureReason: 'Checkout was abandoned or expired' }
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      // The first invoice of a new subscription belongs to the registration
      // handler, which records it together with the organization.
      if (invoice.billing_reason === 'subscription_create') return;
      await billing.recordInvoicePaid({ event, invoice });
      break;
    }

    case 'invoice.payment_failed': {
      await billing.recordInvoiceFailed({ event, invoice: event.data.object });
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await billing.syncSubscription({ event, stripeSubscription: event.data.object });
      break;
    }

    default:
      // Everything else is acknowledged and ignored on purpose.
      break;
  }
}

module.exports = { handleStripeWebhook, dispatch };
