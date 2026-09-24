const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/health', async (req, res, next) => {
  try {
    // Check if database is reachable
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'success',
      message: 'Backend server is running and database connection is healthy.'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
