const express = require('express');
const router = express.Router();
const {
  createRegistration,
  getRegistrationById,
  getAllRegistrations
} = require('../controllers/registrationController');

router.post('/', createRegistration);
router.get('/:id', getRegistrationById);
router.get('/', getAllRegistrations);

module.exports = router;
