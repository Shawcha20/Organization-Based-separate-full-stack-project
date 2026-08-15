const express = require('express');
const { handleStripeWebhook } = require('../controllers/webhook.controller');

const router = express.Router();

// express.raw is required: signature verification runs over the byte-for-byte
// body, so this route must never see a parsed JSON object.
router.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
