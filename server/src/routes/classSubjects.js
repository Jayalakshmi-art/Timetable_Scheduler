const express = require('express');
const router = express.Router();
const classSubjectController = require('../controllers/classSubjectController');

router.get('/', classSubjectController.getAll);
router.get('/:classId/:subjectId', classSubjectController.getById);
router.post('/', classSubjectController.create);
router.put('/:classId/:subjectId', classSubjectController.update);
router.delete('/:classId/:subjectId', classSubjectController.delete);
router.delete('/', classSubjectController.delete);

module.exports = router;
