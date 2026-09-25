const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');

router.get('/', classController.getAll);
router.get('/:id', classController.getById);
router.post('/', classController.create);
router.put('/:id', classController.update);
router.delete('/:id', classController.delete);

module.exports = router;
