const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');

// Phase 7: Feasibility Check
router.post('/feasibility-check', timetableController.checkFeasibility);

module.exports = router;
