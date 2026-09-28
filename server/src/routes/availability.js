const express = require('express');
const router = express.Router();
const avail = require('../controllers/availabilityController');

// ── Faculty Availability ──────────────────────────────────────────────────────
router.get('/faculty',              avail.getFacultyAvailability);
router.post('/faculty',             avail.setFacultyAvailability);
router.post('/faculty/bulk',        avail.setFacultyAvailabilityBulk);
router.delete('/faculty/clear/:faculty_id', avail.clearFacultyAvailability);
router.delete('/faculty/:id',       avail.deleteFacultyAvailability);

// ── Class Availability ────────────────────────────────────────────────────────
router.get('/class',                avail.getClassAvailability);
router.post('/class',               avail.setClassAvailability);
router.post('/class/bulk',          avail.setClassAvailabilityBulk);
router.delete('/class/clear/:class_id', avail.clearClassAvailability);
router.delete('/class/:id',         avail.deleteClassAvailability);

// ── Room Availability ─────────────────────────────────────────────────────────
router.get('/room',                 avail.getRoomAvailability);
router.post('/room',                avail.setRoomAvailability);
router.post('/room/bulk',           avail.setRoomAvailabilityBulk);
router.delete('/room/clear/:room_id', avail.clearRoomAvailability);
router.delete('/room/:id',          avail.deleteRoomAvailability);

module.exports = router;
