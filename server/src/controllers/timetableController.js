const db = require('../config/db');

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
