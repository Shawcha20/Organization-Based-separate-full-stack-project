const Stripe = require('stripe');
const env = require('../config/env');

// Single Stripe client for the whole app. The secret key only ever lives in
// the environment.
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  maxNetworkRetries: 2,
});

// Plans live in our database, so we hand Stripe an inline price on every
// checkout instead of keeping a mirrored price catalogue in sync.
function priceDataFor(plan) {
  return {
    currency: plan.currency,
    unit_amount: plan.price,
    recurring: { interval: plan.interval },
    product_data: {
      name: plan.name,
      description: plan.description || `${plan.name} subscription`,
    },
  };
}

module.exports = { stripe, priceDataFor };
