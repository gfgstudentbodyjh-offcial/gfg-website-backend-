const express = require('express');
const router = express.Router();
const {
  createRegistration,
  getRegistrationById,
  getAllRegistrations,
  syncRegistration,
  getRegistrationAudit
} = require('../controllers/registrationController');

router.post('/', createRegistration);
router.get('/audit/report', getRegistrationAudit);
router.post('/:id/sync', syncRegistration);
router.get('/:id', getRegistrationById);
router.get('/', getAllRegistrations);

module.exports = router;
