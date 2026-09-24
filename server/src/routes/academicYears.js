const express = require('express');
const router = express.Router();
const academicYearController = require('../controllers/academicYearController');

router.get('/', academicYearController.getAll);
router.post('/', academicYearController.create);
router.put('/:id', academicYearController.update);
router.delete('/:id', academicYearController.delete);

module.exports = router;
