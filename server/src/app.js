const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health');
const institutionRoutes = require('./routes/institutions');
const departmentRoutes = require('./routes/departments');
const academicYearRoutes = require('./routes/academicYears');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', healthRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/academic-years', academicYearRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

module.exports = app;
