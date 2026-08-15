const express = require('express');
const plans = require('../controllers/plans.controller');

const router = express.Router();

// Public catalogue used by the signup page. Only active plans are exposed.
router.get('/', plans.listActive);

module.exports = router;
