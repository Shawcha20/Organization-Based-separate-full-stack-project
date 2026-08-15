const express = require('express');
const controller = require('../controllers/platform.controller');
const plans = require('../controllers/plans.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');
const { planSchema, planUpdateSchema, orgStatusSchema } = require('../validators/platform.schema');

const router = express.Router();

// Everything below is platform-admin only, enforced here rather than per route.
router.use(requireAuth, requireRole(ROLES.PLATFORM_ADMIN));

router.get('/stats', controller.stats);

router.get('/organizations', controller.listOrganizations);
router.get('/organizations/:id', controller.getOrganization);
router.patch('/organizations/:id/status', validate(orgStatusSchema), controller.setOrganizationStatus);

router.get('/plans', plans.listAll);
router.post('/plans', validate(planSchema), plans.create);
router.patch('/plans/:id', validate(planUpdateSchema), plans.update);
router.patch('/plans/:id/active', plans.setActive);

router.get('/transactions', controller.listTransactions);

module.exports = router;
