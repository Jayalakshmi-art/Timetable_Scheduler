const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health');
const institutionRoutes = require('./routes/institutions');
const departmentRoutes = require('./routes/departments');
const academicYearRoutes = require('./routes/academicYears');
const classRoutes = require('./routes/classes');
const subjectRoutes = require('./routes/subjects');
const classSubjectRoutes = require('./routes/classSubjects');
const facultyRoutes = require('./routes/faculty');
const facultySubjectRoutes = require('./routes/facultySubjects');
const roomRoutes = require('./routes/rooms');
const workingDayRoutes = require('./routes/workingDays');
const periodRoutes = require('./routes/periods');

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
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/class-subjects', classSubjectRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/faculty-subjects', facultySubjectRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/working-days', workingDayRoutes);
app.use('/api/periods', periodRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

module.exports = app;
