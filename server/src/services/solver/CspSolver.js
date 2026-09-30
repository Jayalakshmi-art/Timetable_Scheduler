/**
 * Deterministic CSP Solver with Backtracking, MRV heuristic, LCV value ordering,
 * and Forward Checking / Constraint Propagation.
 */
class CspSolver {
  constructor(options = {}) {
    this.maxSteps = options.maxSteps || 60000;
    this.timeoutMs = options.timeoutMs || 15000;
  }

  /**
   * Main solve method.
   * Returns:
   * {
   *   success: boolean,
   *   timetable: Array, // assigned slots
   *   conflicts: Array, // issues if generation failed
   *   stats: Object
   * }
   */
  solve(problemData) {
    const startTime = Date.now();
    const conflicts = [];

    // Pre-flight checks before building CSP
    const preflight = this.preflightChecks(problemData);
    if (!preflight.passed) {
      return {
        success: false,
        status: 'INFEASIBLE',
        message: 'Pre-flight feasibility checks failed.',
        conflicts: preflight.conflicts,
        timetable: [],
        stats: {
          executionTimeMs: Date.now() - startTime,
          stepsExplored: 0,
        },
      };
    }

    // 1. Build CSP Variables & Initial Domains
    const { variables, domainMap, buildConflicts } = this.buildVariablesAndDomains(problemData);
    if (buildConflicts.length > 0) {
      return {
        success: false,
        status: 'INFEASIBLE',
        message: 'Cannot schedule some course blocks due to missing resources or zero valid time slots.',
        conflicts: buildConflicts,
        timetable: [],
        stats: {
          executionTimeMs: Date.now() - startTime,
          stepsExplored: 0,
        },
      };
    }

    if (variables.length === 0) {
      return {
        success: true,
        status: 'VALID',
        timetable: [],
        conflicts: [],
        stats: {
          executionTimeMs: Date.now() - startTime,
          stepsExplored: 0,
        },
      };
    }

    // 2. Setup Solver State
    const state = {
      // Occupancy lookup: "entityId-dayId-periodId" -> variableId
      classOccupied: new Map(),
      facultyOccupied: new Map(),
      roomOccupied: new Map(),

      // Workload counters
      facultyDailyPeriods: new Map(), // "facultyId-dayId" -> int
      facultyWeeklyPeriods: new Map(), // facultyId -> int

      // Subject per day count per class (for soft optimization)
      classDaySubjectCount: new Map(), // "classId-dayId-subjectId" -> int

      // Assignments: variableId -> assignedValue
      assignments: new Map(),

      // Step counters
      steps: 0,
      startTime,
      timedOut: false,
    };

    // 3. Run Backtracking Search with MRV & Forward Checking
    const unassignedVars = new Set(variables.map(v => v.id));
    const varMap = new Map(variables.map(v => [v.id, v]));

    const solved = this.backtrack(unassignedVars, varMap, domainMap, state, problemData);

    const executionTimeMs = Date.now() - startTime;

    if (!solved) {
      const conflictMsg = state.timedOut
        ? `Timetable generation timed out after ${this.timeoutMs}ms without finding a zero-conflict schedule.`
        : `Could not satisfy all hard constraints. The problem may be over-constrained with the given faculty workloads, room sizes, or availability limits.`;

      return {
        success: false,
        status: 'INFEASIBLE',
        message: conflictMsg,
        conflicts: [
          {
            type: state.timedOut ? 'TIMEOUT' : 'CSP_BACKTRACK_EXHAUSTED',
            message: conflictMsg,
            details: {
              stepsExplored: state.steps,
              variablesCount: variables.length,
              assignedCount: state.assignments.size,
            },
          },
        ],
        timetable: [],
        stats: {
          executionTimeMs,
          stepsExplored: state.steps,
        },
      };
    }

    // 4. Transform Assignments into Final Timetable Slots
    const timetable = this.formatTimetable(state.assignments, varMap, problemData);

    return {
      success: true,
      status: 'VALID',
      timetable,
      conflicts: [],
      stats: {
        executionTimeMs,
        stepsExplored: state.steps,
        totalSlotsScheduled: timetable.length,
      },
    };
  }

  /**
   * Preflight sanity checks to quickly identify impossible scenarios.
   */
  preflightChecks(problemData) {
    const conflicts = [];
    const {
      workingDays,
      teachingPeriods,
      classes,
      subjects,
      classSubjects,
      faculty,
      facultySubjects,
      rooms,
    } = problemData;

    if (!workingDays || workingDays.length === 0) {
      conflicts.push({ type: 'NO_WORKING_DAYS', message: 'No active working days configured for this institution.' });
    }

    if (!teachingPeriods || teachingPeriods.length === 0) {
      conflicts.push({ type: 'NO_TEACHING_PERIODS', message: 'No active non-break teaching periods configured.' });
    }

    if (conflicts.length > 0) return { passed: false, conflicts };

    const totalWeeklySlots = workingDays.length * teachingPeriods.length;
    const subjectMap = new Map(subjects.map(s => [s.id, s]));

    // Check qualified faculty exists for each required subject
    const qualifiedFacultyBySub = new Map();
    for (const fs of facultySubjects) {
      if (!qualifiedFacultyBySub.has(fs.subject_id)) qualifiedFacultyBySub.set(fs.subject_id, []);
      qualifiedFacultyBySub.get(fs.subject_id).push(fs.faculty_id);
    }

    // Check each class load
    for (const cls of classes) {
      const mappings = classSubjects.filter(cs => cs.class_id === cls.id);
      let classTotalReq = 0;

      for (const m of mappings) {
        const sub = subjectMap.get(m.subject_id);
        if (!sub) continue;
        const ppw = m.periods_per_week_override || sub.periods_per_week;
        classTotalReq += ppw;

        // Check if subject has qualified faculty
        const facList = qualifiedFacultyBySub.get(sub.id) || [];
        if (facList.length === 0) {
          conflicts.push({
            type: 'NO_QUALIFIED_FACULTY',
            message: `No faculty members are qualified/assigned to teach required subject "${sub.name}" (${sub.code}).`,
            class_id: cls.id,
            subject_id: sub.id,
          });
        }

        // Check if lab room exists for lab subjects
        if (sub.requires_lab || sub.type === 'LAB') {
          const suitableLabRooms = rooms.filter(r => r.type === 'LAB' && r.capacity >= cls.student_count);
          if (suitableLabRooms.length === 0) {
            conflicts.push({
              type: 'NO_SUITABLE_LAB_ROOM',
              message: `No active LAB room has enough capacity (requires ${cls.student_count}) for class "${cls.name}" and subject "${sub.name}".`,
              class_id: cls.id,
              subject_id: sub.id,
            });
          }
        }
      }

      if (classTotalReq > totalWeeklySlots) {
        conflicts.push({
          type: 'CLASS_PERIOD_CAPACITY_EXCEEDED',
          message: `Class "${cls.name}" requires ${classTotalReq} periods per week, but the schedule only has ${totalWeeklySlots} periods available.`,
          class_id: cls.id,
          required_periods: classTotalReq,
          available_periods: totalWeeklySlots,
        });
      }
    }

    return {
      passed: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Break each class-subject requirement into course blocks (variables)
   * and compute the initial valid domain for each variable.
   */
  buildVariablesAndDomains(problemData) {
    const {
      workingDays,
      periods,
      teachingPeriods,
      classes,
      subjects,
      classSubjects,
      faculty,
      facultySubjects,
      rooms,
      availabilities,
    } = problemData;

    const subjectMap = new Map(subjects.map(s => [s.id, s]));
    const facultyMap = new Map(faculty.map(f => [f.id, f]));
    const classMap = new Map(classes.map(c => [c.id, c]));

    // Qualified faculty per subject
    const qualifiedFacultyBySub = new Map();
    for (const fs of facultySubjects) {
      if (!qualifiedFacultyBySub.has(fs.subject_id)) qualifiedFacultyBySub.set(fs.subject_id, []);
      qualifiedFacultyBySub.get(fs.subject_id).push(fs.faculty_id);
    }

    // Precompute consecutive teaching period blocks for each working day
    // Map: dayId -> Array of blocks { startPeriod, periods: [p1, p2, ...] }
    const dayPeriodBlocks = new Map();
    const sortedPeriods = [...periods].sort((a, b) => a.period_order - b.period_order);

    for (const wd of workingDays) {
      dayPeriodBlocks.set(wd.id, []);
      // Find all sequences of non-break periods
      for (let i = 0; i < sortedPeriods.length; i++) {
        const startP = sortedPeriods[i];
        if (startP.is_break || startP.is_lunch) continue;

        // Collect consecutive non-break periods starting from i
        const block = [];
        for (let j = i; j < sortedPeriods.length; j++) {
          const curP = sortedPeriods[j];
          if (curP.is_break || curP.is_lunch) break;
          // check strict sequential order
          if (j > i && curP.period_order !== sortedPeriods[j - 1].period_order + 1) break;
          block.push(curP);
        }
        dayPeriodBlocks.get(wd.id).push({
          startPeriod: startP,
          availablePeriods: block,
        });
      }
    }

    const variables = [];
    const domainMap = new Map();
    const buildConflicts = [];

    // For each class and its mapped subjects
    for (const cls of classes) {
      const mappings = classSubjects.filter(cs => cs.class_id === cls.id);

      for (const m of mappings) {
        const sub = subjectMap.get(m.subject_id);
        if (!sub) continue;

        const totalPpw = m.periods_per_week_override || sub.periods_per_week;
        const nominalDuration = m.duration_override || sub.duration || 1;
        const isLab = Boolean(sub.requires_lab || sub.type === 'LAB');

        // Partition totalPpw into block durations
        // e.g. If lab with nominalDuration = 2, and ppw = 4 -> [2, 2]
        // If nominalDuration = 2 and ppw = 3 -> [2, 1]
        // If theory with duration = 1 and ppw = 4 -> [1, 1, 1, 1]
        const blockDurations = [];
        let remaining = totalPpw;
        while (remaining > 0) {
          const d = Math.min(remaining, nominalDuration);
          blockDurations.push(d);
          remaining -= d;
        }

        // Qualified faculty for this subject
        const facIds = qualifiedFacultyBySub.get(sub.id) || [];
        const qualifiedFaculty = facIds.map(fId => facultyMap.get(fId)).filter(Boolean);

        // Candidate rooms based on lab requirement and capacity
        const candidateRooms = rooms.filter(rm => {
          if (rm.capacity < cls.student_count) return false;
          if (isLab) return rm.type === 'LAB';
          return rm.type !== 'LAB'; // theory subjects use CLASSROOM / SEMINAR_HALL / OTHER
        });

        if (candidateRooms.length === 0) {
          buildConflicts.push({
            type: 'NO_SUITABLE_ROOMS',
            message: `No active rooms found with capacity >= ${cls.student_count} for ${isLab ? 'LAB' : 'THEORY'} subject "${sub.name}".`,
            class_id: cls.id,
            subject_id: sub.id,
          });
          continue;
        }

        if (qualifiedFaculty.length === 0) {
          buildConflicts.push({
            type: 'NO_QUALIFIED_FACULTY',
            message: `No faculty assigned for subject "${sub.name}".`,
            class_id: cls.id,
            subject_id: sub.id,
          });
          continue;
        }

        // Create variables for each block
        for (let bIdx = 0; bIdx < blockDurations.length; bIdx++) {
          const duration = blockDurations[bIdx];
          const varId = `cls_${cls.id}_sub_${sub.id}_blk_${bIdx}`;
          const variable = {
            id: varId,
            classId: cls.id,
            className: cls.name,
            subjectId: sub.id,
            subjectName: sub.name,
            subjectCode: sub.code,
            subjectType: sub.type,
            requiresLab: isLab,
            duration,
            blockIndex: bIdx,
            totalBlocks: blockDurations.length,
          };

          // Generate domain values for this variable
          // A domain value is: { day, startPeriod, periods, faculty, room }
          const domain = [];

          for (const wd of workingDays) {
            const dayBlocks = dayPeriodBlocks.get(wd.id) || [];

            for (const { startPeriod, availablePeriods } of dayBlocks) {
              if (availablePeriods.length < duration) continue;

              const periodsInBlock = availablePeriods.slice(0, duration);

              // Check class availability for all periods in block
              const classBlocked = periodsInBlock.some(
                p => availabilities.class[`${cls.id}-${wd.id}-${p.id}`]
              );
              if (classBlocked) continue;

              // Pair with candidate faculty and rooms
              for (const fac of qualifiedFaculty) {
                // Check faculty availability for all periods in block
                const facultyBlocked = periodsInBlock.some(
                  p => availabilities.faculty[`${fac.id}-${wd.id}-${p.id}`]
                );
                if (facultyBlocked) continue;

                for (const rm of candidateRooms) {
                  // Check room availability for all periods in block
                  const roomBlocked = periodsInBlock.some(
                    p => availabilities.room[`${rm.id}-${wd.id}-${p.id}`]
                  );
                  if (roomBlocked) continue;

                  domain.push({
                    dayId: wd.id,
                    dayName: wd.day_name,
                    dayOrder: wd.day_order,
                    startPeriodId: startPeriod.id,
                    periods: periodsInBlock, // array of period objects
                    facultyId: fac.id,
                    facultyName: fac.name,
                    roomId: rm.id,
                    roomCode: rm.room_code,
                    roomName: rm.name,
                  });
                }
              }
            }
          }

          if (domain.length === 0) {
            buildConflicts.push({
              type: 'ZERO_DOMAIN_FOR_BLOCK',
              message: `No available time slots/resources exist for class "${cls.name}", subject "${sub.name}" (block ${bIdx + 1} of duration ${duration}).`,
              class_id: cls.id,
              subject_id: sub.id,
              duration,
            });
          }

          variables.push(variable);
          domainMap.set(varId, domain);
        }
      }
    }

    return { variables, domainMap, buildConflicts };
  }

  /**
   * Backtracking Search with MRV heuristic, forward checking, and soft-cost ordering.
   */
  backtrack(unassignedVars, varMap, domainMap, state, problemData) {
    // If all variables are assigned, we found a valid solution!
    if (unassignedVars.size === 0) {
      return true;
    }

    // Check step limit and timeout
    state.steps++;
    if (state.steps > this.maxSteps || (Date.now() - state.startTime > this.timeoutMs)) {
      state.timedOut = true;
      return false;
    }

    // 1. MRV Heuristic (Minimum Remaining Values):
    // Choose unassigned variable with fewest valid domain values remaining.
    let selectedVarId = null;
    let minDomainSize = Infinity;

    for (const vId of unassignedVars) {
      const variable = varMap.get(vId);
      const rawDomain = domainMap.get(vId);

      // Count valid options currently open
      let validCount = 0;
      for (let i = 0; i < rawDomain.length; i++) {
        if (this.isConsistent(variable, rawDomain[i], state, problemData)) {
          validCount++;
        }
      }

      // If any unassigned variable has 0 valid options, dead-end! Backtrack immediately.
      if (validCount === 0) {
        return false;
      }

      // Prioritize smaller domain, break ties with larger duration (Degree heuristic)
      if (validCount < minDomainSize) {
        minDomainSize = validCount;
        selectedVarId = vId;
      } else if (validCount === minDomainSize && selectedVarId) {
        const prevVar = varMap.get(selectedVarId);
        if (variable.duration > prevVar.duration) {
          selectedVarId = vId;
        }
      }
    }

    if (!selectedVarId) return false;

    const variable = varMap.get(selectedVarId);
    const domain = domainMap.get(selectedVarId);

    // 2. Filter & Sort Domain Values (LCV & Soft-Score Heuristic)
    const validValues = domain.filter(val => this.isConsistent(variable, val, state, problemData));

    // Sort to prefer:
    // a) Days where the class has fewer periods of this subject (subject spread)
    // b) Faculty members with fewer periods assigned this day (faculty balance)
    validValues.sort((a, b) => {
      const keyA = `${variable.classId}-${a.dayId}-${variable.subjectId}`;
      const countA = state.classDaySubjectCount.get(keyA) || 0;
      const keyB = `${variable.classId}-${b.dayId}-${variable.subjectId}`;
      const countB = state.classDaySubjectCount.get(keyB) || 0;

      if (countA !== countB) return countA - countB;

      // Faculty daily balance
      const fDayA = state.facultyDailyPeriods.get(`${a.facultyId}-${a.dayId}`) || 0;
      const fDayB = state.facultyDailyPeriods.get(`${b.facultyId}-${b.dayId}`) || 0;
      return fDayA - fDayB;
    });

    // 3. Try each value
    unassignedVars.delete(selectedVarId);

    for (const val of validValues) {
      // Forward assign
      this.assign(variable, val, state);

      const success = this.backtrack(unassignedVars, varMap, domainMap, state, problemData);
      if (success) return true;

      // Unassign (backtrack)
      this.unassign(variable, val, state);

      if (state.timedOut) return false;
    }

    // Restore unassigned set
    unassignedVars.add(selectedVarId);
    return false;
  }

  /**
   * Fast consistency check for a candidate domain value against current state.
   */
  isConsistent(variable, val, state, problemData) {
    const { classId } = variable;
    const { dayId, periods, facultyId, roomId } = val;

    // 1. Check each period in the block for clashes
    for (let p of periods) {
      const timeKey = `${dayId}-${p.id}`;

      // Class clash
      if (state.classOccupied.has(`${classId}-${timeKey}`)) return false;

      // Faculty clash
      if (state.facultyOccupied.has(`${facultyId}-${timeKey}`)) return false;

      // Room clash
      if (state.roomOccupied.has(`${roomId}-${timeKey}`)) return false;
    }

    // 2. Workload limit checks
    const fac = problemData.faculty.find(f => f.id === facultyId);
    if (fac) {
      const curDaily = state.facultyDailyPeriods.get(`${facultyId}-${dayId}`) || 0;
      if (fac.max_periods_per_day && curDaily + variable.duration > fac.max_periods_per_day) {
        return false;
      }

      const curWeekly = state.facultyWeeklyPeriods.get(facultyId) || 0;
      if (fac.max_periods_per_week && curWeekly + variable.duration > fac.max_periods_per_week) {
        return false;
      }
    }

    return true;
  }

  /**
   * Apply assignment to state.
   */
  assign(variable, val, state) {
    state.assignments.set(variable.id, val);

    const { classId } = variable;
    const { dayId, periods, facultyId, roomId } = val;

    for (let p of periods) {
      const timeKey = `${dayId}-${p.id}`;
      state.classOccupied.set(`${classId}-${timeKey}`, variable.id);
      state.facultyOccupied.set(`${facultyId}-${timeKey}`, variable.id);
      state.roomOccupied.set(`${roomId}-${timeKey}`, variable.id);
    }

    // Workload
    const facDayKey = `${facultyId}-${dayId}`;
    state.facultyDailyPeriods.set(facDayKey, (state.facultyDailyPeriods.get(facDayKey) || 0) + variable.duration);
    state.facultyWeeklyPeriods.set(facultyId, (state.facultyWeeklyPeriods.get(facultyId) || 0) + variable.duration);

    // Subject per day count
    const cdsKey = `${classId}-${dayId}-${variable.subjectId}`;
    state.classDaySubjectCount.set(cdsKey, (state.classDaySubjectCount.get(cdsKey) || 0) + variable.duration);
  }

  /**
   * Revert assignment from state.
   */
  unassign(variable, val, state) {
    state.assignments.delete(variable.id);

    const { classId } = variable;
    const { dayId, periods, facultyId, roomId } = val;

    for (let p of periods) {
      const timeKey = `${dayId}-${p.id}`;
      state.classOccupied.delete(`${classId}-${timeKey}`);
      state.facultyOccupied.delete(`${facultyId}-${timeKey}`);
      state.roomOccupied.delete(`${roomId}-${timeKey}`);
    }

    // Workload
    const facDayKey = `${facultyId}-${dayId}`;
    state.facultyDailyPeriods.set(facDayKey, (state.facultyDailyPeriods.get(facDayKey) || 0) - variable.duration);
    state.facultyWeeklyPeriods.set(facultyId, (state.facultyWeeklyPeriods.get(facultyId) || 0) - variable.duration);

    // Subject per day count
    const cdsKey = `${classId}-${dayId}-${variable.subjectId}`;
    state.classDaySubjectCount.set(cdsKey, (state.classDaySubjectCount.get(cdsKey) || 0) - variable.duration);
  }

  /**
   * Format assigned variables into individual timetable slot entries.
   */
  formatTimetable(assignments, varMap, problemData) {
    const timetable = [];

    for (const [varId, val] of assignments.entries()) {
      const variable = varMap.get(varId);

      for (let pIdx = 0; pIdx < val.periods.length; pIdx++) {
        const periodObj = val.periods[pIdx];

        timetable.push({
          class_id: variable.classId,
          class_name: variable.className,
          subject_id: variable.subjectId,
          subject_name: variable.subjectName,
          subject_code: variable.subjectCode,
          subject_type: variable.subjectType,
          faculty_id: val.facultyId,
          faculty_name: val.facultyName,
          room_id: val.roomId,
          room_number: val.roomCode,
          room_name: val.roomName,
          day_id: val.dayId,
          day_name: val.dayName,
          day_order: val.dayOrder,
          period_id: periodObj.id,
          period_name: periodObj.name,
          period_order: periodObj.period_order,
          start_time: periodObj.start_time,
          end_time: periodObj.end_time,
          is_lab_block: variable.duration > 1,
          block_period_index: pIdx + 1,
          block_duration: variable.duration,
        });
      }
    }

    // Sort timetable nicely by class, day_order, period_order
    timetable.sort((a, b) => {
      if (a.class_id !== b.class_id) return a.class_id - b.class_id;
      if (a.day_order !== b.day_order) return a.day_order - b.day_order;
      return a.period_order - b.period_order;
    });

    return timetable;
  }
}

module.exports = CspSolver;
