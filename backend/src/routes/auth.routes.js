const express = require('express');
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, sensitiveLimiter } = require('../middleware/rateLimit');
const schemas = require('../validators/auth.schema');

const router = express.Router();

router.post('/login', authLimiter, validate(schemas.loginSchema), controller.login);
router.post(
  '/forgot-password',
  sensitiveLimiter,
  validate(schemas.forgotPasswordSchema),
  controller.forgotPassword
);
router.post(
  '/reset-password',
  sensitiveLimiter,
  validate(schemas.resetPasswordSchema),
  controller.resetPassword
);
router.post(
  '/accept-invite',
  authLimiter,
  validate(schemas.acceptInviteSchema),
  controller.acceptInvite
);

router.get('/me', requireAuth, controller.me);
router.post(
  '/change-password',
  requireAuth,
  validate(schemas.changePasswordSchema),
  controller.changePassword
);

module.exports = router;
