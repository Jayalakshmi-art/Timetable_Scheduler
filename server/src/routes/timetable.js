const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');

// Phase 7: Feasibility Check
router.post('/feasibility-check', timetableController.checkFeasibility);

// Phase 8: Timetable Generation Engine
router.post('/generate', timetableController.generate);
router.get('/', timetableController.getAll);
router.get('/:id', timetableController.getById);
router.delete('/:id', timetableController.delete);

// Phase 9: Independent Timetable Validator
router.post('/validate', timetableController.validate);

module.exports = router;
