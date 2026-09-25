const express = require('express');
const router = express.Router();
const facultySubjectController = require('../controllers/facultySubjectController');

router.get('/', facultySubjectController.getAll);
router.get('/:facultyId/:subjectId', facultySubjectController.getById);
router.post('/', facultySubjectController.create);
router.delete('/:facultyId/:subjectId', facultySubjectController.delete);
router.delete('/', facultySubjectController.delete);

module.exports = router;
