const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/facultyController');

router.get('/', facultyController.getAll);
router.get('/:id', facultyController.getById);
router.post('/', facultyController.create);
router.put('/:id', facultyController.update);
router.delete('/:id', facultyController.delete);

module.exports = router;
