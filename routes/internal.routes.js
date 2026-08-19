const express = require('express');
const router = express.Router();
const internalAuth = require('../middleware/internalAuth');
const internalController = require('../controllers/internal.controller');

// Secure all internal routes
router.use(internalAuth);

router.post('/provision-company', internalController.provisionCompany);
router.post('/toggle-status', internalController.toggleStatus);

module.exports = router;
