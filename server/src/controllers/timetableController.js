const db = require('../config/db');
const ProblemLoader = require('../services/solver/ProblemLoader');
const { defaultRegistry } = require('../services/solver/SolverAdapter');
const ConstraintEngine = require('../services/solver/ConstraintEngine');

exports.checkFeasibility = async (req, res) => {
  const { institution_id } = req.body;
  if (!institution_id) {
    return res.status(400).json({ message: 'institution_id is required' });
  }

  try {
    const issues = [];
    const warnings = [];
    const suggestions = [];

    // 1. Fetch Working Days & Periods
    const [workingDays] = await db.query(
      'SELECT * FROM working_days WHERE institution_id = ? AND is_active = TRUE ORDER BY day_order',
      [institution_id]
    );
    const [periods] = await db.query(
      'SELECT * FROM periods WHERE institution_id = ? AND is_break = FALSE AND is_lunch = FALSE ORDER BY period_order',
      [institution_id]
    );

    const totalDays = workingDays.length;
    const periodsPerDay = periods.length;
    const totalWeeklyPeriods = totalDays * periodsPerDay;

    if (totalWeeklyPeriods === 0) {
      issues.push({
        type: 'NO_TIME_SLOTS',
        severity: 'CRITICAL',
        message: 'No working days or non-break periods are configured.',
      });
      return res.json({
        feasible: false,
        summary: 'Configuration lacks basic time slots.',
        issues,
        warnings,
        suggestions: ['Add working days and non-break periods.'],
      });
    }

    // Check for consecutive periods capability (for labs)
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    // Assuming period_order is sequential without gaps for consecutive non-break periods.
    // A better way is to fetch all periods including breaks, and count consecutive non-breaks.
    const [allPeriods] = await db.query(
      'SELECT * FROM periods WHERE institution_id = ? ORDER BY period_order',
      [institution_id]
    );
    for (let p of allPeriods) {
      if (!p.is_break && !p.is_lunch) {
        currentConsecutive++;
        if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
      } else {
        currentConsecutive = 0;
      }
    }

    // 2. Fetch Departments, Classes, Subjects
    const [departments] = await db.query(
      'SELECT id, name FROM departments WHERE institution_id = ?',
      [institution_id]
    );
    if (departments.length === 0) {
      issues.push({ type: 'NO_DEPARTMENTS', severity: 'CRITICAL', message: 'No departments found.' });
    }

    const deptIds = departments.map(d => d.id);
    let classes = [];
    let subjects = [];
    let classSubjects = [];
    let faculty = [];
    let facultySubjects = [];
    let rooms = [];

    if (deptIds.length > 0) {
      [classes] = await db.query(
        'SELECT * FROM classes WHERE department_id IN (?) AND is_active = TRUE',
        [deptIds]
      );
      [subjects] = await db.query(
        'SELECT * FROM subjects WHERE department_id IN (?) AND is_active = TRUE',
        [deptIds]
      );
      if (classes.length > 0 && subjects.length > 0) {
        const classIds = classes.map(c => c.id);
        [classSubjects] = await db.query(
          'SELECT * FROM class_subjects WHERE class_id IN (?)',
          [classIds]
        );
      }
      [faculty] = await db.query(
        'SELECT * FROM faculty WHERE department_id IN (?) AND is_active = TRUE',
        [deptIds]
      );
      if (faculty.length > 0) {
        const facIds = faculty.map(f => f.id);
        [facultySubjects] = await db.query(
          'SELECT * FROM faculty_subjects WHERE faculty_id IN (?)',
          [facIds]
        );
      }
    }

    [rooms] = await db.query(
      'SELECT * FROM rooms WHERE institution_id = ? AND is_active = TRUE',
      [institution_id]
    );

    // 3. Analyze Classes (Period Shortage, Lab consecutive)
    let totalRequiredPeriods = 0;
    let totalRequiredLabPeriods = 0;
    const requiredSubjectMap = new Set(); // To track which subjects actually need faculty

    classes.forEach(cls => {
      const mappings = classSubjects.filter(cs => cs.class_id === cls.id);
      let classTotalPeriods = 0;

      mappings.forEach(mapping => {
        const subject = subjects.find(s => s.id === mapping.subject_id);
        if (!subject) return;

        requiredSubjectMap.add(subject.id);

        const periodsPerWeek = mapping.periods_per_week_override || subject.periods_per_week;
        const duration = mapping.duration_override || subject.duration;
        
        classTotalPeriods += periodsPerWeek;

        if (subject.requires_lab || subject.type === 'LAB') {
          totalRequiredLabPeriods += periodsPerWeek;
          if (duration > maxConsecutive) {
            issues.push({
              type: 'CONSECUTIVE_LAB_SHORTAGE',
              severity: 'HIGH',
              class_id: cls.id,
              message: `Subject ${subject.name} requires ${duration} consecutive periods, but max available is ${maxConsecutive}.`
            });
          }
        }
      });

      totalRequiredPeriods += classTotalPeriods;

      // Class availability check
      // We will need to query class_availability, let's just do it for all classes outside the loop for efficiency, but wait we didn't fetch it yet.
      // We will fetch availabilities below and do the math.
      
      if (classTotalPeriods > totalWeeklyPeriods) {
        issues.push({
          type: 'PERIOD_SHORTAGE',
          severity: 'HIGH',
          class_id: cls.id,
          message: `Class requires ${classTotalPeriods} periods/week, but only ${totalWeeklyPeriods} are available.`,
        });
        suggestions.push(`Increase working days or periods per day, or reduce subjects for class ${cls.name}.`);
      }
    });

    // 4. Analyze Availability (Faculty, Class, Room)
    const [facultyAvail] = await db.query(
      'SELECT faculty_id, COUNT(*) as blocked_slots FROM faculty_availability WHERE is_available = FALSE GROUP BY faculty_id'
    );
    const [classAvail] = await db.query(
      'SELECT class_id, COUNT(*) as blocked_slots FROM class_availability WHERE is_available = FALSE GROUP BY class_id'
    );
    const [roomAvail] = await db.query(
      'SELECT room_id, COUNT(*) as blocked_slots FROM room_availability WHERE is_available = FALSE GROUP BY room_id'
    );

    // Class availability validation
    classes.forEach(cls => {
      const blocked = classAvail.find(ca => ca.class_id === cls.id)?.blocked_slots || 0;
      const netAvailable = totalWeeklyPeriods - blocked;
      
      const mappings = classSubjects.filter(cs => cs.class_id === cls.id);
      let classReqPeriods = 0;
      mappings.forEach(m => classReqPeriods += (m.periods_per_week_override || subjects.find(s => s.id === m.subject_id)?.periods_per_week || 0));

      if (classReqPeriods > netAvailable) {
        issues.push({
          type: 'CLASS_UNAVAILABLE',
          severity: 'HIGH',
          class_id: cls.id,
          message: `Class requires ${classReqPeriods} periods but has ${blocked} blocked slots, leaving only ${netAvailable} available.`
        });
      }
    });

    // 5. Analyze Faculty 
    let totalFacultyCapacity = 0;
    faculty.forEach(fac => {
      const blocked = facultyAvail.find(fa => fa.faculty_id === fac.id)?.blocked_slots || 0;
      // Actual capacity is min of max_periods_per_week and (totalWeeklyPeriods - blocked)
      const actualCapacity = Math.min(fac.max_periods_per_week, totalWeeklyPeriods - blocked);
      totalFacultyCapacity += actualCapacity;

      if (actualCapacity === 0 && facultySubjects.some(fs => fs.faculty_id === fac.id)) {
        issues.push({
          type: 'FACULTY_UNAVAILABLE',
          severity: 'HIGH',
          message: `Faculty ${fac.name} is completely blocked but assigned to subjects.`
        });
      }
    });

    if (totalRequiredPeriods > totalFacultyCapacity) {
      issues.push({
        type: 'INSUFFICIENT_FACULTY_CAPACITY',
        severity: 'HIGH',
        message: `Total required periods (${totalRequiredPeriods}) exceeds total faculty capacity (${totalFacultyCapacity}).`
      });
      suggestions.push('Add more faculty or increase max periods per week for existing faculty.');
    }

    // Check missing qualified faculty
    const subjectToFacultyCount = {};
    facultySubjects.forEach(fs => {
      subjectToFacultyCount[fs.subject_id] = (subjectToFacultyCount[fs.subject_id] || 0) + 1;
    });

    for (let subId of requiredSubjectMap) {
      if (!subjectToFacultyCount[subId]) {
        const sub = subjects.find(s => s.id === subId);
        issues.push({
          type: 'MISSING_QUALIFIED_FACULTY',
          severity: 'HIGH',
          message: `No faculty assigned to teach required subject: ${sub ? sub.name : subId}`
        });
        suggestions.push(`Assign at least one faculty member to teach ${sub ? sub.name : subId}.`);
      }
    }

    // 6. Analyze Rooms
    let totalRoomSlots = 0;
    let totalLabRoomSlots = 0;
    
    rooms.forEach(r => {
      const blocked = roomAvail.find(ra => ra.room_id === r.id)?.blocked_slots || 0;
      const netAvail = totalWeeklyPeriods - blocked;
      totalRoomSlots += netAvail;
      if (r.type === 'LAB') {
        totalLabRoomSlots += netAvail;
      }
    });

    if (totalRequiredPeriods > totalRoomSlots) {
      issues.push({
        type: 'INSUFFICIENT_ROOMS',
        severity: 'HIGH',
        message: `Total required periods (${totalRequiredPeriods}) exceeds available room slots (${totalRoomSlots}).`
      });
      suggestions.push('Add more rooms or increase available time slots.');
    }

    if (totalRequiredLabPeriods > totalLabRoomSlots) {
      issues.push({
        type: 'INSUFFICIENT_LAB_ROOMS',
        severity: 'HIGH',
        message: `Total required lab periods (${totalRequiredLabPeriods}) exceeds available lab room slots (${totalLabRoomSlots}).`
      });
      suggestions.push('Add more lab rooms.');
    }

    // 7. Constraints Analysis
    const [constraints] = await db.query(
      'SELECT * FROM timetable_constraints WHERE institution_id = ? AND is_enabled = TRUE',
      [institution_id]
    );

    const hardConstraints = constraints.filter(c => c.constraint_type === 'HARD');
    const softConstraints = constraints.filter(c => c.constraint_type === 'SOFT');

    if (hardConstraints.length === 0) {
      warnings.push({
        type: 'NO_HARD_CONSTRAINTS',
        message: 'No HARD constraints are enabled. Timetable might have double bookings if default rules are disabled.'
      });
    } else {
      // Check for impossible hard constraints
      const maxLecConstraint = hardConstraints.find(c => c.constraint_key === 'FACULTY_MAX_CONSECUTIVE');
      if (maxLecConstraint && maxLecConstraint.parameters?.max_consecutive) {
        const maxCons = parseInt(maxLecConstraint.parameters.max_consecutive, 10);
        // check if any subject requires more consecutive periods than this constraint allows
        subjects.forEach(s => {
          if (s.duration > maxCons && s.type !== 'LAB') {
            issues.push({
              type: 'IMPOSSIBLE_HARD_CONSTRAINT',
              severity: 'HIGH',
              message: `Subject ${s.name} requires ${s.duration} consecutive periods, but HARD constraint limits it to ${maxCons}.`
            });
          }
        });
      }
    }

    if (softConstraints.length > 0) {
      const avoidRepeated = softConstraints.find(c => c.constraint_key === 'AVOID_REPEATED_SUBJECT_DAY');
      if (avoidRepeated) {
        warnings.push({
          type: 'SOFT_CONSTRAINT_WARNING',
          message: 'Soft constraint "Avoid Repeated Subject per Day" is enabled. It may be broken if subjects have high weekly periods.'
        });
      }
    }

    // Return Results
    const isFeasible = issues.length === 0;
    const summary = isFeasible 
      ? 'Configuration is valid and feasible for timetable generation.' 
      : 'Timetable cannot be generated with the current configuration due to critical issues.';

    res.json({
      feasible: isFeasible,
      summary,
      issues,
      warnings,
      suggestions: [...new Set(suggestions)], // deduplicate
    });
  } catch (error) {
    console.error('Feasibility Check Error:', error);
    res.status(500).json({ message: 'Error performing feasibility check', error: error.message });
  }
};

/**
 * Phase 8: Timetable Generation Engine
 * POST /api/timetable/generate
 */
exports.generate = async (req, res) => {
  const {
    institution_id,
    academic_year_id,
    name,
    save_to_db = true,
    solver_type = 'CSP',
    options = {},
  } = req.body;

  if (!institution_id) {
    return res.status(400).json({
      success: false,
      status: 'ERROR',
      message: 'institution_id is required',
    });
  }

  try {
    // 1. Load Problem Data
    const problemData = await ProblemLoader.load(institution_id, academic_year_id);

    // 2. Run Modular Solver through SolverAdapter
    const result = await defaultRegistry.generate(problemData, {
      solverType: solver_type,
      ...options,
    });

    if (!result.success) {
      return res.status(422).json(result);
    }

    // 3. Save to database if requested
    let savedTimetableId = null;
    if (save_to_db && result.timetable.length > 0) {
      const timetableName = name || `Timetable - ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`;
      const ayId = academic_year_id || problemData.academicYear?.id || null;

      const [insertRes] = await db.query(
        `INSERT INTO timetables (institution_id, academic_year_id, name, status, soft_score, metadata)
         VALUES (?, ?, ?, 'GENERATED', ?, ?)`,
        [
          institution_id,
          ayId,
          timetableName,
          result.metrics.soft_score,
          JSON.stringify({
            metrics: result.metrics,
            validation: result.validation,
            generated_at: new Date().toISOString(),
          }),
        ]
      );

      savedTimetableId = insertRes.insertId;

      // Bulk insert entries
      const entryValues = result.timetable.map(slot => [
        savedTimetableId,
        slot.class_id,
        slot.subject_id,
        slot.faculty_id,
        slot.room_id,
        slot.day_id,
        slot.period_id,
      ]);

      if (entryValues.length > 0) {
        await db.query(
          `INSERT INTO timetable_entries 
           (timetable_id, class_id, subject_id, faculty_id, room_id, working_day_id, period_id)
           VALUES ?`,
          [entryValues]
        );
      }
    }

    return res.status(200).json({
      ...result,
      timetable_id: savedTimetableId,
    });
  } catch (error) {
    console.error('Timetable Generation Controller Error:', error);
    res.status(500).json({
      success: false,
      status: 'SERVER_ERROR',
      message: 'An error occurred during timetable generation: ' + error.message,
      conflicts: [{ type: 'INTERNAL_ERROR', message: error.message }],
      timetable: [],
    });
  }
};

/**
 * GET /api/timetable?institution_id=X
 */
exports.getAll = async (req, res) => {
  const { institution_id } = req.query;
  try {
    let query = `
      SELECT t.*, i.name AS institution_name, ay.name AS academic_year_name,
        (SELECT COUNT(*) FROM timetable_entries te WHERE te.timetable_id = t.id) AS total_entries
      FROM timetables t
      LEFT JOIN institutions i ON t.institution_id = i.id
      LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
    `;
    const params = [];
    if (institution_id) {
      query += ' WHERE t.institution_id = ?';
      params.push(institution_id);
    }
    query += ' ORDER BY t.created_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get Timetables Error:', error);
    res.status(500).json({ message: 'Error fetching timetables', error: error.message });
  }
};

/**
 * GET /api/timetable/:id
 */
exports.getById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT t.*, i.name AS institution_name, ay.name AS academic_year_name
       FROM timetables t
       LEFT JOIN institutions i ON t.institution_id = i.id
       LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE t.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Timetable not found' });
    }

    const timetable = rows[0];

    const {
      department_id,
      class_id,
      faculty_id,
      room_id,
      day_id,
      year,
    } = req.query;

    let entriesQuery = `
      SELECT 
        te.id AS entry_id,
        te.timetable_id,
        te.class_id, c.name AS class_name, c.year AS class_year, c.section AS class_section, c.department_id,
        dept.name AS department_name, dept.code AS department_code,
        te.subject_id, s.name AS subject_name, s.code AS subject_code, s.type AS subject_type, s.requires_lab, s.duration,
        te.faculty_id, f.name AS faculty_name, f.faculty_code,
        te.room_id, r.room_code, r.name AS room_name, r.type AS room_type, r.capacity AS room_capacity,
        te.working_day_id AS day_id, wd.day_name, wd.day_order,
        te.period_id, p.name AS period_name, p.period_order, p.start_time, p.end_time, p.is_break, p.is_lunch
       FROM timetable_entries te
       JOIN classes c ON te.class_id = c.id
       JOIN departments dept ON c.department_id = dept.id
       JOIN subjects s ON te.subject_id = s.id
       JOIN faculty f ON te.faculty_id = f.id
       JOIN rooms r ON te.room_id = r.id
       JOIN working_days wd ON te.working_day_id = wd.id
       JOIN periods p ON te.period_id = p.id
       WHERE te.timetable_id = ?
    `;
    const filterParams = [id];

    if (department_id) {
      entriesQuery += ' AND c.department_id = ?';
      filterParams.push(department_id);
    }
    if (class_id) {
      entriesQuery += ' AND te.class_id = ?';
      filterParams.push(class_id);
    }
    if (faculty_id) {
      entriesQuery += ' AND te.faculty_id = ?';
      filterParams.push(faculty_id);
    }
    if (room_id) {
      entriesQuery += ' AND te.room_id = ?';
      filterParams.push(room_id);
    }
    if (day_id) {
      entriesQuery += ' AND te.working_day_id = ?';
      filterParams.push(day_id);
    }
    if (year) {
      entriesQuery += ' AND c.year = ?';
      filterParams.push(year);
    }

    entriesQuery += ' ORDER BY c.name, wd.day_order, p.period_order';

    const [entries] = await db.query(entriesQuery, filterParams);

    // Fetch supporting topology (working days, periods, departments, classes, faculty, rooms)
    const [workingDays] = await db.query(
      'SELECT * FROM working_days WHERE institution_id = ? AND is_active = TRUE ORDER BY day_order ASC',
      [timetable.institution_id]
    );

    const [periods] = await db.query(
      'SELECT * FROM periods WHERE institution_id = ? ORDER BY period_order ASC',
      [timetable.institution_id]
    );

    const [departments] = await db.query(
      'SELECT id, name, code FROM departments WHERE institution_id = ?',
      [timetable.institution_id]
    );

    const deptIds = departments.map(d => d.id);
    let classes = [];
    let faculty = [];
    if (deptIds.length > 0) {
      const [cls] = await db.query(
        'SELECT id, department_id, name, year, section FROM classes WHERE department_id IN (?) AND is_active = TRUE',
        [deptIds]
      );
      classes = cls;

      const [fac] = await db.query(
        'SELECT id, department_id, name, faculty_code FROM faculty WHERE department_id IN (?) AND is_active = TRUE',
        [deptIds]
      );
      faculty = fac;
    }

    const [rooms] = await db.query(
      'SELECT id, room_code, name, type, capacity FROM rooms WHERE institution_id = ? AND is_active = TRUE',
      [timetable.institution_id]
    );

    res.json({
      ...timetable,
      entries,
      working_days: workingDays,
      periods,
      departments,
      classes,
      faculty,
      rooms,
    });
  } catch (error) {
    console.error('Get Timetable By ID Error:', error);
    res.status(500).json({ message: 'Error fetching timetable details', error: error.message });
  }
};

/**
 * Phase 9: Independent Timetable Validator
 * POST /api/timetable/validate
 */
exports.validate = async (req, res) => {
  const { timetable_id, institution_id, academic_year_id, timetable } = req.body;

  try {
    let slots = [];
    let instId = institution_id;
    let ayId = academic_year_id;

    if (timetable_id) {
      const [ttRows] = await db.query('SELECT * FROM timetables WHERE id = ?', [timetable_id]);
      if (ttRows.length === 0) {
        return res.status(404).json({ success: false, is_valid: false, message: 'Timetable not found' });
      }
      instId = ttRows[0].institution_id;
      ayId = ttRows[0].academic_year_id;

      const [entryRows] = await db.query(
        `SELECT te.*, 
           c.name AS class_name, c.student_count,
           s.name AS subject_name, s.code AS subject_code, s.type AS subject_type, s.requires_lab, s.duration,
           f.name AS faculty_name, f.faculty_code,
           r.room_code, r.name AS room_name, r.type AS room_type, r.capacity AS room_capacity,
           wd.day_name, wd.day_order,
           p.name AS period_name, p.period_order, p.is_break, p.is_lunch
         FROM timetable_entries te
         JOIN classes c ON te.class_id = c.id
         JOIN subjects s ON te.subject_id = s.id
         JOIN faculty f ON te.faculty_id = f.id
         JOIN rooms r ON te.room_id = r.id
         JOIN working_days wd ON te.working_day_id = wd.id
         JOIN periods p ON te.period_id = p.id
         WHERE te.timetable_id = ?`,
        [timetable_id]
      );
      slots = entryRows.map(r => ({
        ...r,
        day_id: r.working_day_id,
      }));
    } else if (Array.isArray(timetable)) {
      if (!instId) {
        return res.status(400).json({ success: false, is_valid: false, message: 'institution_id is required when validating raw timetable slots' });
      }
      slots = timetable;
    } else {
      return res.status(400).json({ success: false, is_valid: false, message: 'Either timetable_id or timetable array is required' });
    }

    // 1. Load ground truth topology from MySQL (ProblemLoader)
    const problemData = await ProblemLoader.load(instId, ayId);

    // 2. Independently validate all hard constraints
    const validation = ConstraintEngine.validate(slots, problemData);

    // 3. Score soft constraints
    const softMetrics = ConstraintEngine.evaluateSoftConstraints(slots, problemData);

    const isValid = validation.isValid;

    res.json({
      success: true,
      is_valid: isValid,
      status: isValid ? 'VALID' : 'INVALID',
      total_slots: slots.length,
      hard_constraints_violated: validation.hardConstraintsViolated,
      violations: validation.violations,
      conflicts: validation.violations,
      summary: isValid
        ? `Timetable is 100% valid! All ${slots.length} assignments satisfy all hard constraints.`
        : `Validation detected ${validation.hardConstraintsViolated} hard constraint violation(s).`,
      soft_score: softMetrics.overallScore,
      soft_constraints_breakdown: softMetrics.breakdown,
    });
  } catch (error) {
    console.error('Validate Timetable Error:', error);
    res.status(500).json({
      success: false,
      is_valid: false,
      message: 'Error during validation: ' + error.message,
    });
  }
};

/**
 * DELETE /api/timetable/:id
 */
exports.delete = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT id FROM timetables WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Timetable not found' });
    }

    await db.query('DELETE FROM timetables WHERE id = ?', [id]);
    res.json({ message: 'Timetable deleted successfully' });
  } catch (error) {
    console.error('Delete Timetable Error:', error);
    res.status(500).json({ message: 'Error deleting timetable', error: error.message });
  }
};
