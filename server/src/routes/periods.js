const express = require('express');
const router = express.Router();
const periodController = require('../controllers/periodController');

router.get('/', periodController.getAll);
router.get('/:id', periodController.getById);
router.post('/', periodController.create);
router.put('/:id', periodController.update);
router.delete('/:id', periodController.delete);

module.exports = router;
