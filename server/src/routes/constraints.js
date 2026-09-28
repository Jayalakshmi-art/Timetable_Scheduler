const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/constraintController');

// Catalogue & validation (no DB writes)
router.get('/catalogue',                    ctrl.getCatalogue);
router.post('/validate',                    ctrl.validateConstraint);

// Seed all defaults for an institution
router.post('/seed/:institution_id',        ctrl.seedDefaults);

// CRUD
router.get('/',                             ctrl.getAll);
router.get('/:id',                          ctrl.getById);
router.post('/',                            ctrl.create);
router.put('/:id',                          ctrl.update);
router.patch('/:id/toggle',                 ctrl.toggle);
router.delete('/:id',                       ctrl.delete);

module.exports = router;
