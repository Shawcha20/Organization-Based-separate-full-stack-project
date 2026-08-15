const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limiting a test run just makes the suite flaky.
  skip: () => env.isTest,
  message: { message: 'Too many requests. Please wait a moment and try again.' },
};

// Brute-force protection on credential endpoints.
const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 10 });

// Password reset and invites also send email, so they are kept tighter.
const sensitiveLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 5 });

// Checkout creates Stripe objects; keep a lid on abuse without blocking a
// customer who retries a failed card a few times.
const checkoutLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 20 });

// Everything else.
const apiLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 500 });

module.exports = { authLimiter, sensitiveLimiter, checkoutLimiter, apiLimiter };
