const express = require('express');
const controller = require('../controllers/checkout.controller');
const validate = require('../middleware/validate');
const { checkoutLimiter } = require('../middleware/rateLimit');
const { registerSchema } = require('../validators/checkout.schema');

const router = express.Router();

// Public: this is how a brand new organization signs up and pays.
router.post('/register', checkoutLimiter, validate(registerSchema), controller.register);
router.post('/register/:id/retry', checkoutLimiter, controller.retry);
router.get('/status', controller.status);

module.exports = router;
