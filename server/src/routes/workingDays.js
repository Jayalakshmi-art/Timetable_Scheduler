const express = require('express');
const router = express.Router();
const workingDayController = require('../controllers/workingDayController');

router.get('/', workingDayController.getAll);
router.get('/:id', workingDayController.getById);
router.post('/', workingDayController.create);
router.put('/:id', workingDayController.update);
router.delete('/:id', workingDayController.delete);

module.exports = router;
