/**
 * ConstraintEngine validates hard constraints and evaluates soft constraints score.
 */
class ConstraintEngine {
  /**
   * Validates a complete timetable solution against all hard constraints.
   * Returns { isValid: boolean, violations: Array }
   */
  static validate(timetable, problemData) {
    const violations = [];
    const {
      workingDays,
      periods,
      classes,
      subjects,
      faculty,
      rooms,
      facultySubjects,
      availabilities,
    } = problemData;

    const classMap = new Map(classes.map(c => [c.id, c]));
    const subjectMap = new Map(subjects.map(s => [s.id, s]));
    const facultyMap = new Map(faculty.map(f => [f.id, f]));
    const roomMap = new Map(rooms.map(r => [r.id, r]));
    const periodMap = new Map(periods.map(p => [p.id, p]));

    // Qualified faculty set: "facultyId-subjectId"
    const qualifiedSet = new Set(facultySubjects.map(fs => `${fs.faculty_id}-${fs.subject_id}`));

    // Tracking maps for clash detection
    // key: "dayId-periodId" -> Map or Set
    const facultyClashes = new Map();
    const classClashes = new Map();
    const roomClashes = new Map();

    // Faculty workload tracking
    // facultyDaily: "facultyId-dayId" -> count
    // facultyWeekly: facultyId -> count
    const facultyDaily = new Map();
    const facultyWeekly = new Map();

    for (const slot of timetable) {
      const {
        class_id,
        subject_id,
        faculty_id,
        room_id,
        day_id,
        period_id,
      } = slot;

      const p = periodMap.get(period_id);
      const sub = subjectMap.get(subject_id);
      const cls = classMap.get(class_id);
      const fac = facultyMap.get(faculty_id);
      const rm = roomMap.get(room_id);

      // 1. Break / Lunch Check
      if (p && (p.is_break || p.is_lunch)) {
        violations.push({
          type: 'NON_TEACHING_PERIOD_VIOLATION',
          message: `Slot assigned during non-teaching period ${p.name} (Break/Lunch).`,
          slot,
        });
      }

      // 2. Faculty Qualification Check
      if (!qualifiedSet.has(`${faculty_id}-${subject_id}`)) {
        violations.push({
          type: 'UNQUALIFIED_FACULTY',
          message: `Faculty ${fac ? fac.name : faculty_id} is not qualified to teach subject ${sub ? sub.name : subject_id}.`,
          slot,
        });
      }

      // 3. Room Type Check (Lab requires LAB room)
      if (sub && (sub.requires_lab || sub.type === 'LAB')) {
        if (!rm || rm.type !== 'LAB') {
          violations.push({
            type: 'ROOM_TYPE_MISMATCH',
            message: `Subject ${sub.name} requires a LAB room, but room ${rm ? rm.room_code : room_id} is ${rm ? rm.type : 'unknown'}.`,
            slot,
          });
        }
      }

      // 4. Room Capacity Check
      if (rm && cls && rm.capacity < cls.student_count) {
        violations.push({
          type: 'ROOM_CAPACITY_EXCEEDED',
          message: `Room ${rm.room_code} capacity (${rm.capacity}) is less than class ${cls.name} student count (${cls.student_count}).`,
          slot,
        });
      }

      // 5. Availability Checks (blocked slots)
      if (availabilities.faculty[`${faculty_id}-${day_id}-${period_id}`]) {
        violations.push({
          type: 'FACULTY_UNAVAILABLE',
          message: `Faculty ${fac ? fac.name : faculty_id} is marked unavailable at day ${day_id}, period ${period_id}.`,
          slot,
        });
      }
      if (availabilities.class[`${class_id}-${day_id}-${period_id}`]) {
        violations.push({
          type: 'CLASS_UNAVAILABLE',
          message: `Class ${cls ? cls.name : class_id} is marked unavailable at day ${day_id}, period ${period_id}.`,
          slot,
        });
      }
      if (availabilities.room[`${room_id}-${day_id}-${period_id}`]) {
        violations.push({
          type: 'ROOM_UNAVAILABLE',
          message: `Room ${rm ? rm.room_code : room_id} is marked unavailable at day ${day_id}, period ${period_id}.`,
          slot,
        });
      }

      // 6. Faculty Clash
      const timeKey = `${day_id}-${period_id}`;
      if (!facultyClashes.has(timeKey)) facultyClashes.set(timeKey, new Map());
      const fMap = facultyClashes.get(timeKey);
      if (fMap.has(faculty_id)) {
        violations.push({
          type: 'FACULTY_CLASH',
          message: `Faculty ${fac ? fac.name : faculty_id} has a double-booking at day ${day_id}, period ${period_id}.`,
          slot,
        });
      } else {
        fMap.set(faculty_id, slot);
      }

      // 7. Class Clash
      if (!classClashes.has(timeKey)) classClashes.set(timeKey, new Map());
      const cMap = classClashes.get(timeKey);
      if (cMap.has(class_id)) {
        violations.push({
          type: 'CLASS_CLASH',
          message: `Class ${cls ? cls.name : class_id} has a double-booking at day ${day_id}, period ${period_id}.`,
          slot,
        });
      } else {
        cMap.set(class_id, slot);
      }

      // 8. Room Clash
      if (!roomClashes.has(timeKey)) roomClashes.set(timeKey, new Map());
      const rMap = roomClashes.get(timeKey);
      if (rMap.has(room_id)) {
        violations.push({
          type: 'ROOM_CLASH',
          message: `Room ${rm ? rm.room_code : room_id} has a double-booking at day ${day_id}, period ${period_id}.`,
          slot,
        });
      } else {
        rMap.set(room_id, slot);
      }

      // 9. Workload accumulation
      const facDayKey = `${faculty_id}-${day_id}`;
      facultyDaily.set(facDayKey, (facultyDaily.get(facDayKey) || 0) + 1);
      facultyWeekly.set(faculty_id, (facultyWeekly.get(faculty_id) || 0) + 1);
    }

    // 10. Check Faculty Workload Limits
    for (const [facDayKey, count] of facultyDaily.entries()) {
      const [fIdStr] = facDayKey.split('-');
      const fId = Number(fIdStr);
      const fac = facultyMap.get(fId);
      if (fac && fac.max_periods_per_day && count > fac.max_periods_per_day) {
        violations.push({
          type: 'FACULTY_DAILY_WORKLOAD_EXCEEDED',
          message: `Faculty ${fac.name} assigned ${count} periods in a single day (max: ${fac.max_periods_per_day}).`,
        });
      }
    }

    for (const [fId, count] of facultyWeekly.entries()) {
      const fac = facultyMap.get(fId);
      if (fac && fac.max_periods_per_week && count > fac.max_periods_per_week) {
        violations.push({
          type: 'FACULTY_WEEKLY_WORKLOAD_EXCEEDED',
          message: `Faculty ${fac.name} assigned ${count} periods in a week (max: ${fac.max_periods_per_week}).`,
        });
      }
    }

    // 11. Check Lab / Multi-Period Consecutiveness
    const { classSubjects } = problemData;
    const labGroupMap = new Map(); // "classId-subjectId-dayId" -> Array of slots

    for (const slot of timetable) {
      const sub = subjectMap.get(slot.subject_id);
      if (sub && (sub.type === 'LAB' || sub.requires_lab || sub.duration > 1)) {
        const key = `${slot.class_id}-${slot.subject_id}-${slot.day_id}`;
        if (!labGroupMap.has(key)) labGroupMap.set(key, []);
        labGroupMap.get(key).push(slot);
      }
    }

    for (const [key, slots] of labGroupMap.entries()) {
      const firstSlot = slots[0];
      const sub = subjectMap.get(firstSlot.subject_id);
      const mapping = classSubjects ? classSubjects.find(cs => cs.class_id === firstSlot.class_id && cs.subject_id === firstSlot.subject_id) : null;
      const expectedDuration = mapping?.duration_override || sub?.duration || 2;

      if (expectedDuration > 1) {
        // Sort slots by period order
        slots.sort((a, b) => {
          const poA = periodMap.get(a.period_id)?.period_order ?? a.period_order ?? 0;
          const poB = periodMap.get(b.period_id)?.period_order ?? b.period_order ?? 0;
          return poA - poB;
        });

        // Verify all slots in the group share the same room & faculty
        const roomsInGroup = new Set(slots.map(s => s.room_id));
        if (roomsInGroup.size > 1) {
          violations.push({
            type: 'LAB_ROOM_CONSISTENCY_VIOLATION',
            message: `Multi-period lab session for subject "${sub.name}" was split across different rooms on the same day.`,
            key,
          });
        }

        const facultyInGroup = new Set(slots.map(s => s.faculty_id));
        if (facultyInGroup.size > 1) {
          violations.push({
            type: 'LAB_FACULTY_CONSISTENCY_VIOLATION',
            message: `Multi-period lab session for subject "${sub.name}" was split across different faculty members on the same day.`,
            key,
          });
        }

        // Verify periods are strictly consecutive
        for (let i = 0; i < slots.length - 1; i++) {
          const poA = periodMap.get(slots[i].period_id)?.period_order ?? slots[i].period_order ?? 0;
          const poB = periodMap.get(slots[i + 1].period_id)?.period_order ?? slots[i + 1].period_order ?? 0;

          if (poB !== poA + 1) {
            violations.push({
              type: 'LAB_CONSECUTIVE_VIOLATION',
              message: `Multi-period lab session for subject "${sub.name}" requires ${expectedDuration} consecutive periods, but periods are disconnected (${poA} and ${poB}).`,
              slot: slots[i + 1],
            });
          }
        }
      }
    }

    return {
      isValid: violations.length === 0,
      hardConstraintsViolated: violations.length,
      violations,
    };
  }

  /**
   * Evaluates soft constraints and returns an overall score (0–100) with breakdown.
   */
  static evaluateSoftConstraints(timetable, problemData) {
    if (!timetable || timetable.length === 0) {
      return {
        overallScore: 0,
        breakdown: [],
      };
    }

    const { workingDays, periods, classes, subjects, faculty } = problemData;
    const breakdown = [];

    // 1. Soft Constraint: Subject Spread Across Days
    // Penalize when a class has > 2 periods of the same theory subject on the same day.
    let subjectSpreadPenalties = 0;
    let totalSubjectDays = 0;
    const classDaySubCount = new Map(); // "classId-dayId-subjectId" -> count

    for (const slot of timetable) {
      const key = `${slot.class_id}-${slot.day_id}-${slot.subject_id}`;
      const count = (classDaySubCount.get(key) || 0) + 1;
      classDaySubCount.set(key, count);
    }

    for (const count of classDaySubCount.values()) {
      totalSubjectDays++;
      if (count > 2) {
        subjectSpreadPenalties += (count - 2) * 15;
      }
    }

    const subjectSpreadScore = Math.max(0, Math.min(100, 100 - subjectSpreadPenalties));
    breakdown.push({
      key: 'SUBJECT_SPREAD',
      name: 'Subject Day Distribution',
      description: 'Even distribution of subjects across days rather than bunching',
      score: Math.round(subjectSpreadScore * 10) / 10,
      weight: 1.0,
    });

    // 2. Soft Constraint: Balanced Faculty Daily Workload
    // Prefer variance in faculty daily teaching load to be small.
    const facDaysMap = new Map(); // "facultyId-dayId" -> count
    for (const slot of timetable) {
      const key = `${slot.faculty_id}-${slot.day_id}`;
      facDaysMap.set(key, (facDaysMap.get(key) || 0) + 1);
    }

    let facultyBalancePenalties = 0;
    for (const facMember of faculty) {
      const dailyCounts = workingDays.map(wd => facDaysMap.get(`${facMember.id}-${wd.id}`) || 0);
      const activeCounts = dailyCounts.filter(c => c > 0);
      if (activeCounts.length > 1) {
        const max = Math.max(...activeCounts);
        const min = Math.min(...activeCounts);
        if (max - min > 2) {
          facultyBalancePenalties += (max - min - 2) * 5;
        }
      }
    }
    const facultyBalanceScore = Math.max(0, Math.min(100, 100 - facultyBalancePenalties));
    breakdown.push({
      key: 'BALANCED_FACULTY_WORKLOAD',
      name: 'Faculty Daily Balance',
      description: 'Smooth and balanced teaching load for faculty across days',
      score: Math.round(facultyBalanceScore * 10) / 10,
      weight: 1.0,
    });

    // 3. Soft Constraint: Minimize Faculty Gaps
    // Penalize idle periods between classes on the same day for a faculty member.
    let facultyGapPenalties = 0;
    for (const facMember of faculty) {
      for (const wd of workingDays) {
        const facultySlots = timetable
          .filter(t => t.faculty_id === facMember.id && t.day_id === wd.id)
          .map(t => t.period_order)
          .sort((a, b) => a - b);

        if (facultySlots.length >= 2) {
          for (let i = 0; i < facultySlots.length - 1; i++) {
            const gap = facultySlots[i + 1] - facultySlots[i] - 1;
            if (gap > 0) {
              facultyGapPenalties += gap * 5;
            }
          }
        }
      }
    }
    const facultyGapScore = Math.max(0, Math.min(100, 100 - facultyGapPenalties));
    breakdown.push({
      key: 'MINIMIZE_FACULTY_GAPS',
      name: 'Minimise Faculty Gaps',
      description: 'Minimise idle gap periods between teaching sessions',
      score: Math.round(facultyGapScore * 10) / 10,
      weight: 1.0,
    });

    // 4. Soft Constraint: Room Consistency
    // Classes prefer the same classroom for all theory subjects.
    let roomChanges = 0;
    for (const cls of classes) {
      const theorySlots = timetable.filter(t => t.class_id === cls.id && t.subject_type === 'THEORY');
      if (theorySlots.length > 0) {
        const distinctRooms = new Set(theorySlots.map(t => t.room_id));
        if (distinctRooms.size > 1) {
          roomChanges += (distinctRooms.size - 1) * 8;
        }
      }
    }
    const roomConsistencyScore = Math.max(0, Math.min(100, 100 - roomChanges));
    breakdown.push({
      key: 'ROOM_CONSISTENCY',
      name: 'Classroom Consistency',
      description: 'Assign consistent theory classrooms to classes',
      score: Math.round(roomConsistencyScore * 10) / 10,
      weight: 0.8,
    });

    // Compute weighted average
    let totalWeight = 0;
    let weightedSum = 0;
    for (const item of breakdown) {
      weightedSum += item.score * item.weight;
      totalWeight += item.weight;
    }
    const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 100;

    return {
      overallScore,
      breakdown,
    };
  }
}

module.exports = ConstraintEngine;
