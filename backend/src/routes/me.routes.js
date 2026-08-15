const express = require('express');
const org = require('../controllers/org.controller');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { ownProfileSchema } = require('../validators/org.schema');

const router = express.Router();

// Own account details - available to every authenticated role.
router.get('/', requireAuth, org.getOwnProfile);
router.patch('/', requireAuth, validate(ownProfileSchema), org.updateOwnProfile);

module.exports = router;
