const db = require('../../config/db');

/**
 * Loads and normalizes all problem data needed for timetable generation.
 */
class ProblemLoader {
  static async load(institutionId, academicYearId = null) {
    if (!institutionId) {
      throw new Error('institutionId is required to load timetable problem data');
    }

    // 1. Working Days
    const [workingDays] = await db.query(
      'SELECT id, institution_id, day_name, day_order FROM working_days WHERE institution_id = ? AND is_active = TRUE ORDER BY day_order ASC',
      [institutionId]
    );

    // 2. Periods (all periods including breaks & lunches)
    const [periods] = await db.query(
      'SELECT id, institution_id, name, start_time, end_time, period_order, is_break, is_lunch FROM periods WHERE institution_id = ? ORDER BY period_order ASC',
      [institutionId]
    );

    // Teaching periods only (for slot matching)
    const teachingPeriods = periods.filter(p => !p.is_break && !p.is_lunch);

    // 3. Departments
    const [departments] = await db.query(
      'SELECT id, institution_id, name, code FROM departments WHERE institution_id = ?',
      [institutionId]
    );
    const deptIds = departments.map(d => d.id);

    if (deptIds.length === 0) {
      return {
        institutionId,
        workingDays,
        periods,
        teachingPeriods,
        departments: [],
        classes: [],
        subjects: [],
        classSubjects: [],
        faculty: [],
        facultySubjects: [],
        rooms: [],
        availabilities: { faculty: {}, class: {}, room: {} },
        constraints: [],
        academicYear: null,
      };
    }

    // 4. Academic Year
    let academicYear = null;
    if (academicYearId) {
      const [ay] = await db.query(
        'SELECT * FROM academic_years WHERE id = ? AND institution_id = ?',
        [academicYearId, institutionId]
      );
      academicYear = ay[0] || null;
    } else {
      const [ay] = await db.query(
        'SELECT * FROM academic_years WHERE institution_id = ? AND is_active = TRUE LIMIT 1',
        [institutionId]
      );
      academicYear = ay[0] || null;
    }

    // 5. Classes
    let classQuery = 'SELECT * FROM classes WHERE department_id IN (?) AND is_active = TRUE';
    const classQueryParams = [deptIds];
    if (academicYear) {
      classQuery += ' AND academic_year_id = ?';
      classQueryParams.push(academicYear.id);
    }
    const [classes] = await db.query(classQuery, classQueryParams);
    const classIds = classes.map(c => c.id);

    // 6. Subjects
    const [subjects] = await db.query(
      'SELECT * FROM subjects WHERE department_id IN (?) AND is_active = TRUE',
      [deptIds]
    );

    // 7. Class-Subject Mappings
    let classSubjects = [];
    if (classIds.length > 0) {
      const [cs] = await db.query(
        'SELECT * FROM class_subjects WHERE class_id IN (?)',
        [classIds]
      );
      classSubjects = cs;
    }

    // 8. Faculty
    const [faculty] = await db.query(
      'SELECT * FROM faculty WHERE department_id IN (?) AND is_active = TRUE',
      [deptIds]
    );
    const facultyIds = faculty.map(f => f.id);

    // 9. Faculty-Subject Mappings
    let facultySubjects = [];
    if (facultyIds.length > 0) {
      const [fs] = await db.query(
        'SELECT * FROM faculty_subjects WHERE faculty_id IN (?)',
        [facultyIds]
      );
      facultySubjects = fs;
    }

    // 10. Rooms
    const [rooms] = await db.query(
      'SELECT * FROM rooms WHERE institution_id = ? AND is_active = TRUE',
      [institutionId]
    );

    // 11. Availability grids (is_available = FALSE means BLOCKED)
    const availabilities = {
      faculty: {}, // "facultyId-dayId-periodId": true if blocked
      class: {},   // "classId-dayId-periodId": true if blocked
      room: {},    // "roomId-dayId-periodId": true if blocked
    };

    if (facultyIds.length > 0) {
      const [fa] = await db.query(
        'SELECT faculty_id, working_day_id, period_id FROM faculty_availability WHERE faculty_id IN (?) AND is_available = FALSE',
        [facultyIds]
      );
      fa.forEach(row => {
        availabilities.faculty[`${row.faculty_id}-${row.working_day_id}-${row.period_id}`] = true;
      });
    }

    if (classIds.length > 0) {
      const [ca] = await db.query(
        'SELECT class_id, working_day_id, period_id FROM class_availability WHERE class_id IN (?) AND is_available = FALSE',
        [classIds]
      );
      ca.forEach(row => {
        availabilities.class[`${row.class_id}-${row.working_day_id}-${row.period_id}`] = true;
      });
    }

    const roomIds = rooms.map(r => r.id);
    if (roomIds.length > 0) {
      const [ra] = await db.query(
        'SELECT room_id, working_day_id, period_id FROM room_availability WHERE room_id IN (?) AND is_available = FALSE',
        [roomIds]
      );
      ra.forEach(row => {
        availabilities.room[`${row.room_id}-${row.working_day_id}-${row.period_id}`] = true;
      });
    }

    // 12. Active Timetable Constraints
    const [constraints] = await db.query(
      'SELECT * FROM timetable_constraints WHERE institution_id = ? AND is_enabled = TRUE',
      [institutionId]
    );

    return {
      institutionId,
      academicYear,
      workingDays,
      periods,
      teachingPeriods,
      departments,
      classes,
      subjects,
      classSubjects,
      faculty,
      facultySubjects,
      rooms,
      availabilities,
      constraints,
    };
  }
}

module.exports = ProblemLoader;
