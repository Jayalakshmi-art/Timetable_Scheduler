const express = require('express');
const router = express.Router();
const institutionController = require('../controllers/institutionController');

router.get('/', institutionController.getAll);
router.get('/:id', institutionController.getById);
router.post('/', institutionController.create);
router.put('/:id', institutionController.update);
router.delete('/:id', institutionController.delete);

module.exports = router;
