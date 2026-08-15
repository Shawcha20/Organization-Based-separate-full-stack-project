const express = require('express');
const org = require('../controllers/org.controller');
const billing = require('../controllers/billing.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole, requireTenant } = require('../middleware/auth');
const { sensitiveLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../utils/constants');
const schemas = require('../validators/org.schema');

const router = express.Router();

// Tenant endpoints. requireTenant keeps the platform admin out - they have
// their own read-only view of every organization.
router.use(requireAuth, requireTenant);

// --- available to any member of the organization -------------------------
router.get('/info', org.getOrgInfoForMember);

// --- organization admin only ---------------------------------------------
const adminOnly = requireRole(ROLES.ORG_ADMIN);

router.get('/', adminOnly, org.getProfile);
router.patch('/', adminOnly, validate(schemas.orgProfileSchema), org.updateProfile);

router.get('/members', adminOnly, org.listMembers);
router.post(
  '/members',
  adminOnly,
  sensitiveLimiter,
  validate(schemas.inviteMemberSchema),
  org.inviteMember
);
router.patch('/members/:id/role', adminOnly, validate(schemas.changeRoleSchema), org.changeMemberRole);
router.delete('/members/:id', adminOnly, org.removeMember);

router.get('/subscription', adminOnly, billing.getSubscription);
router.post('/subscription/change', adminOnly, validate(schemas.changePlanSchema), billing.changePlan);
router.post('/subscription/cancel', adminOnly, billing.cancelSubscription);

router.get('/payments', adminOnly, billing.listPayments);
router.get('/payments/:id/invoice', adminOnly, billing.downloadInvoice);
router.post('/billing-portal', adminOnly, billing.billingPortal);
router.get('/transactions', adminOnly, billing.listTransactions);

module.exports = router;
