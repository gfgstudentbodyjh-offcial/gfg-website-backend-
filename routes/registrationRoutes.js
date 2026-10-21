const express = require('express');
const router = express.Router();
const {
  createRegistration,
  retrievePass,
  getRegistrationById,
  getAllRegistrations,
  syncRegistration,
  getRegistrationAudit
} = require('../controllers/registrationController');
const { passRetrievalLimiter } = require('../middleware/rateLimiter');

router.post('/retrieve-pass', passRetrievalLimiter, retrievePass);
router.post('/', createRegistration);
router.get('/audit/report', getRegistrationAudit);
router.post('/:id/sync', syncRegistration);
router.get('/:id', getRegistrationById);
router.get('/', getAllRegistrations);

module.exports = router;
