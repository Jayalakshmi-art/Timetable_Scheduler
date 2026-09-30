const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistantController');

// Phase 10: AI Natural-Language Timetable Assistant Routes
router.post('/chat', assistantController.chat);
router.post('/apply', assistantController.apply);
router.get('/proposals/:timetable_id', assistantController.getProposals);

module.exports = router;
