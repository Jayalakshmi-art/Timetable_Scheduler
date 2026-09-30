const ConstraintEngine = require('../solver/ConstraintEngine');
const { defaultProposalManager } = require('./ProposalManager');

/**
 * CommandExecutor safely verifies structured assistant commands against
 * the constraint engine and generates previews requiring human approval.
 * It NEVER modifies the database directly.
 */
class CommandExecutor {
  /**
   * Execute and verify a parsed command.
   */
  static async execute(command, timetableData, problemData) {
    if (!command || command.status !== 'SUCCESS') {
      return {
        success: false,
        status: command.status || 'ERROR',
        message: command.message || 'Malformed or ambiguous command.',
        command,
      };
    }

    const { intent, entities } = command;

    switch (intent) {
      case 'MOVE_SLOT':
        return this.handleMoveSlot(entities, timetableData, problemData, command);

      case 'SWAP_SLOTS':
        return this.handleSwapSlots(entities, timetableData, problemData, command);

      case 'REASSIGN_FACULTY':
        return this.handleReassignFaculty(entities, timetableData, problemData, command);

      case 'REASSIGN_ROOM':
        return this.handleReassignRoom(entities, timetableData, problemData, command);

      case 'FIND_FREE_SLOTS':
        return this.handleFindFreeSlots(entities, timetableData, problemData, command);

      default:
        return {
          success: false,
          status: 'UNSUPPORTED_INTENT',
          message: `Intent "${intent}" is not currently supported.`,
          command,
        };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. MOVE SLOT
  // ─────────────────────────────────────────────────────────────────
  static handleMoveSlot(entities, timetableData, problemData, command) {
    const { subject, from_day, from_period, to_day, to_period, any_slot } = entities;
    const entries = timetableData.entries || [];

    // Find candidate origin slot(s)
    const matches = this.findMatchingEntries(entries, { subject, day: from_day, period: from_period });

    if (matches.length === 0) {
      return {
        success: false,
        status: 'NOT_FOUND',
        message: `Could not find any scheduled slot matching ${subject ? `"${subject}"` : ''} ${from_day ? `on ${from_day}` : ''} ${from_period ? `at ${from_period}` : ''}.`,
        command,
      };
    }

    if (matches.length > 1 && !from_day && !from_period) {
      const options = matches.map(m => `"${m.subject_name}" on ${m.day_name} (${m.period_name})`).slice(0, 5).join(', ');
      return {
        success: false,
        status: 'AMBIGUOUS',
        message: `Found multiple matching slots: ${options}. Please specify which day and period to move from.`,
        command,
      };
    }

    const sourceSlot = matches[0];

    // Compute baseline soft score
    const baselineSoft = ConstraintEngine.evaluateSoftConstraints(entries, problemData);

    // Case A: Move to "any valid slot"
    if (any_slot || (!to_day && !to_period)) {
      return this.findBestMoveSlot(sourceSlot, entries, problemData, timetableData, command, baselineSoft);
    }

    // Case B: Move to explicitly specified (to_day, to_period)
    const targetDay = this.resolveWorkingDay(to_day, problemData.workingDays);
    const targetPeriod = this.resolvePeriod(to_period, problemData.periods);

    if (!targetDay) {
      return {
        success: false,
        status: 'INVALID_TARGET',
        message: `Target day "${to_day}" is not a recognized working day.`,
        command,
      };
    }

    if (!targetPeriod) {
      return {
        success: false,
        status: 'INVALID_TARGET',
        message: `Target period "${to_period}" is not a recognized period.`,
        command,
      };
    }

    // Check if target is a Break or Lunch
    if (targetPeriod.is_break || targetPeriod.is_lunch) {
      return {
        success: false,
        status: 'CONSTRAINT_VIOLATION',
        message: `Cannot move to "${targetPeriod.name}" because it is a non-teaching break/lunch period.`,
        command,
        violations: [
          {
            type: 'NON_TEACHING_PERIOD_VIOLATION',
            message: `Target period "${targetPeriod.name}" is designated as a break/lunch.`,
          },
        ],
      };
    }

    // Simulate moving
    const simulatedEntries = entries.map(e => {
      if (e.entry_id === sourceSlot.entry_id) {
        return {
          ...e,
          day_id: targetDay.id,
          working_day_id: targetDay.id,
          day_name: targetDay.day_name,
          day_order: targetDay.day_order,
          period_id: targetPeriod.id,
          period_name: targetPeriod.name,
          period_order: targetPeriod.period_order,
          start_time: targetPeriod.start_time,
          end_time: targetPeriod.end_time,
        };
      }
      return { ...e };
    });

    const targetSlotSimulated = simulatedEntries.find(e => e.entry_id === sourceSlot.entry_id);

    // Validate with Constraint Engine
    const validation = ConstraintEngine.validate(simulatedEntries, problemData);
    const newSoft = ConstraintEngine.evaluateSoftConstraints(simulatedEntries, problemData);

    const description = `Move "${sourceSlot.subject_code} - ${sourceSlot.subject_name}" for class ${sourceSlot.class_name} from ${sourceSlot.day_name} (${sourceSlot.period_name}) to ${targetDay.day_name} (${targetPeriod.name}).`;

    // Create proposal
    const proposal = defaultProposalManager.createProposal({
      timetable_id: timetableData.id,
      intent: 'MOVE_SLOT',
      command,
      description,
      can_apply: validation.isValid,
      is_valid: validation.isValid,
      violations: validation.violations,
      diff: {
        before: {
          class_name: sourceSlot.class_name,
          subject_name: sourceSlot.subject_name,
          faculty_name: sourceSlot.faculty_name,
          room_code: sourceSlot.room_code,
          day_name: sourceSlot.day_name,
          period_name: sourceSlot.period_name,
          time: `${String(sourceSlot.start_time).slice(0, 5)} - ${String(sourceSlot.end_time).slice(0, 5)}`,
        },
        after: {
          class_name: sourceSlot.class_name,
          subject_name: sourceSlot.subject_name,
          faculty_name: sourceSlot.faculty_name,
          room_code: sourceSlot.room_code,
          day_name: targetDay.day_name,
          period_name: targetPeriod.name,
          time: `${String(targetPeriod.start_time).slice(0, 5)} - ${String(targetPeriod.end_time).slice(0, 5)}`,
        },
      },
      changes: [
        {
          type: 'UPDATE_ENTRY',
          entry_id: sourceSlot.entry_id,
          old_slot: sourceSlot,
          new_slot: targetSlotSimulated,
        },
      ],
      soft_score: {
        before: baselineSoft.overallScore,
        after: newSoft.overallScore,
        delta: Math.round((newSoft.overallScore - baselineSoft.overallScore) * 10) / 10,
      },
    });

    return {
      success: true,
      status: validation.isValid ? 'PREVIEW_READY' : 'CONFLICT_DETECTED',
      can_apply: validation.isValid,
      message: validation.isValid
        ? `Proposed move is completely valid and ready for your approval: ${description}`
        : `Proposed move violates constraints: ${validation.violations.map(v => v.message).join('; ')}`,
      proposal_id: proposal.id,
      proposal,
      validation,
      command,
    };
  }

  /**
   * Helper: Search candidate slots to find the best valid slot.
   */
  static findBestMoveSlot(sourceSlot, entries, problemData, timetableData, command, baselineSoft) {
    const teachingPeriods = problemData.periods.filter(p => !p.is_break && !p.is_lunch);
    const candidateResults = [];

    for (const wd of problemData.workingDays) {
      for (const p of teachingPeriods) {
        // Skip current slot
        if (wd.id === sourceSlot.day_id && p.id === sourceSlot.period_id) continue;

        const simulated = entries.map(e => {
          if (e.entry_id === sourceSlot.entry_id) {
            return {
              ...e,
              day_id: wd.id,
              working_day_id: wd.id,
              day_name: wd.day_name,
              day_order: wd.day_order,
              period_id: p.id,
              period_name: p.name,
              period_order: p.period_order,
              start_time: p.start_time,
              end_time: p.end_time,
            };
          }
          return { ...e };
        });

        const validation = ConstraintEngine.validate(simulated, problemData);
        if (validation.isValid) {
          const soft = ConstraintEngine.evaluateSoftConstraints(simulated, problemData);
          candidateResults.push({
            day: wd,
            period: p,
            softScore: soft.overallScore,
            simulatedSlot: simulated.find(e => e.entry_id === sourceSlot.entry_id),
          });
        }
      }
    }

    if (candidateResults.length === 0) {
      return {
        success: false,
        status: 'NO_VALID_SLOT',
        message: `No conflict-free slot could be found for "${sourceSlot.subject_name}". All alternative time slots result in room, faculty, or class clashes.`,
        command,
      };
    }

    // Sort candidate results by highest soft score
    candidateResults.sort((a, b) => b.softScore - a.softScore);
    const best = candidateResults[0];

    const description = `Move "${sourceSlot.subject_code} - ${sourceSlot.subject_name}" from ${sourceSlot.day_name} (${sourceSlot.period_name}) to optimal free slot on ${best.day.day_name} (${best.period.name}).`;

    const proposal = defaultProposalManager.createProposal({
      timetable_id: timetableData.id,
      intent: 'MOVE_SLOT',
      command,
      description,
      can_apply: true,
      is_valid: true,
      violations: [],
      diff: {
        before: {
          class_name: sourceSlot.class_name,
          subject_name: sourceSlot.subject_name,
          faculty_name: sourceSlot.faculty_name,
          room_code: sourceSlot.room_code,
          day_name: sourceSlot.day_name,
          period_name: sourceSlot.period_name,
        },
        after: {
          class_name: sourceSlot.class_name,
          subject_name: sourceSlot.subject_name,
          faculty_name: sourceSlot.faculty_name,
          room_code: sourceSlot.room_code,
          day_name: best.day.day_name,
          period_name: best.period.name,
        },
      },
      changes: [
        {
          type: 'UPDATE_ENTRY',
          entry_id: sourceSlot.entry_id,
          old_slot: sourceSlot,
          new_slot: best.simulatedSlot,
        },
      ],
      soft_score: {
        before: baselineSoft.overallScore,
        after: best.softScore,
        delta: Math.round((best.softScore - baselineSoft.overallScore) * 10) / 10,
      },
    });

    return {
      success: true,
      status: 'PREVIEW_READY',
      can_apply: true,
      message: `Found optimal conflict-free slot: ${description}`,
      proposal_id: proposal.id,
      proposal,
      validation: { isValid: true, hardConstraintsViolated: 0, violations: [] },
      command,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. SWAP SLOTS
  // ─────────────────────────────────────────────────────────────────
  static handleSwapSlots(entities, timetableData, problemData, command) {
    const { slot_a, slot_b } = entities;
    const entries = timetableData.entries || [];

    const matchesA = this.findMatchingEntries(entries, { subject: slot_a.subject, day: slot_a.day, period: slot_a.period });
    const matchesB = this.findMatchingEntries(entries, { subject: slot_b.subject, day: slot_b.day, period: slot_b.period });

    if (matchesA.length === 0 || matchesB.length === 0) {
      return {
        success: false,
        status: 'NOT_FOUND',
        message: 'Could not find both slots to swap.',
        command,
      };
    }

    const slotA = matchesA[0];
    const slotB = matchesB[0];

    if (slotA.entry_id === slotB.entry_id) {
      return {
        success: false,
        status: 'IDENTICAL_SLOTS',
        message: 'Slot A and Slot B refer to the exact same scheduled period.',
        command,
      };
    }

    // Simulate swap
    const simulated = entries.map(e => {
      if (e.entry_id === slotA.entry_id) {
        return {
          ...e,
          day_id: slotB.day_id,
          working_day_id: slotB.day_id,
          day_name: slotB.day_name,
          day_order: slotB.day_order,
          period_id: slotB.period_id,
          period_name: slotB.period_name,
          period_order: slotB.period_order,
          start_time: slotB.start_time,
          end_time: slotB.end_time,
        };
      }
      if (e.entry_id === slotB.entry_id) {
        return {
          ...e,
          day_id: slotA.day_id,
          working_day_id: slotA.day_id,
          day_name: slotA.day_name,
          day_order: slotA.day_order,
          period_id: slotA.period_id,
          period_name: slotA.period_name,
          period_order: slotA.period_order,
          start_time: slotA.start_time,
          end_time: slotA.end_time,
        };
      }
      return { ...e };
    });

    const validation = ConstraintEngine.validate(simulated, problemData);
    const baselineSoft = ConstraintEngine.evaluateSoftConstraints(entries, problemData);
    const newSoft = ConstraintEngine.evaluateSoftConstraints(simulated, problemData);

    const description = `Swap "${slotA.subject_code}" (${slotA.day_name} ${slotA.period_name}) with "${slotB.subject_code}" (${slotB.day_name} ${slotB.period_name}).`;

    const proposal = defaultProposalManager.createProposal({
      timetable_id: timetableData.id,
      intent: 'SWAP_SLOTS',
      command,
      description,
      can_apply: validation.isValid,
      is_valid: validation.isValid,
      violations: validation.violations,
      diff: {
        slot_a: {
          subject: slotA.subject_name,
          from: `${slotA.day_name} ${slotA.period_name}`,
          to: `${slotB.day_name} ${slotB.period_name}`,
        },
        slot_b: {
          subject: slotB.subject_name,
          from: `${slotB.day_name} ${slotB.period_name}`,
          to: `${slotA.day_name} ${slotA.period_name}`,
        },
      },
      changes: [
        {
          type: 'UPDATE_ENTRY',
          entry_id: slotA.entry_id,
          new_slot: simulated.find(e => e.entry_id === slotA.entry_id),
        },
        {
          type: 'UPDATE_ENTRY',
          entry_id: slotB.entry_id,
          new_slot: simulated.find(e => e.entry_id === slotB.entry_id),
        },
      ],
      soft_score: {
        before: baselineSoft.overallScore,
        after: newSoft.overallScore,
        delta: Math.round((newSoft.overallScore - baselineSoft.overallScore) * 10) / 10,
      },
    });

    return {
      success: true,
      status: validation.isValid ? 'PREVIEW_READY' : 'CONFLICT_DETECTED',
      can_apply: validation.isValid,
      message: validation.isValid
        ? `Proposed swap is valid: ${description}`
        : `Proposed swap causes conflicts: ${validation.violations.map(v => v.message).join('; ')}`,
      proposal_id: proposal.id,
      proposal,
      validation,
      command,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. REASSIGN FACULTY
  // ─────────────────────────────────────────────────────────────────
  static handleReassignFaculty(entities, timetableData, problemData, command) {
    const { subject, target_faculty } = entities;
    const entries = timetableData.entries || [];

    const matches = this.findMatchingEntries(entries, { subject });
    if (matches.length === 0) {
      return {
        success: false,
        status: 'NOT_FOUND',
        message: `Could not find any slot for subject "${subject}".`,
        command,
      };
    }

    const slot = matches[0];

    // Find target faculty
    const fac = problemData.faculty.find(f =>
      f.name.toLowerCase().includes(target_faculty.toLowerCase()) ||
      f.faculty_code.toLowerCase() === target_faculty.toLowerCase()
    );

    if (!fac) {
      return {
        success: false,
        status: 'FACULTY_NOT_FOUND',
        message: `Faculty "${target_faculty}" was not found.`,
        command,
      };
    }

    // Simulate reassignment
    const simulated = entries.map(e => {
      if (e.entry_id === slot.entry_id) {
        return {
          ...e,
          faculty_id: fac.id,
          faculty_name: fac.name,
          faculty_code: fac.faculty_code,
        };
      }
      return { ...e };
    });

    const validation = ConstraintEngine.validate(simulated, problemData);
    const description = `Reassign faculty for "${slot.subject_name}" (${slot.day_name} ${slot.period_name}) from ${slot.faculty_name} to ${fac.name}.`;

    const proposal = defaultProposalManager.createProposal({
      timetable_id: timetableData.id,
      intent: 'REASSIGN_FACULTY',
      command,
      description,
      can_apply: validation.isValid,
      is_valid: validation.isValid,
      violations: validation.violations,
      diff: {
        subject: slot.subject_name,
        time: `${slot.day_name} ${slot.period_name}`,
        before_faculty: slot.faculty_name,
        after_faculty: fac.name,
      },
      changes: [
        {
          type: 'UPDATE_ENTRY',
          entry_id: slot.entry_id,
          new_slot: simulated.find(e => e.entry_id === slot.entry_id),
        },
      ],
    });

    return {
      success: true,
      status: validation.isValid ? 'PREVIEW_READY' : 'CONFLICT_DETECTED',
      can_apply: validation.isValid,
      message: validation.isValid
        ? `Reassignment verified: ${description}`
        : `Reassignment violates constraints: ${validation.violations.map(v => v.message).join('; ')}`,
      proposal_id: proposal.id,
      proposal,
      validation,
      command,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. REASSIGN ROOM
  // ─────────────────────────────────────────────────────────────────
  static handleReassignRoom(entities, timetableData, problemData, command) {
    const { subject, target_room } = entities;
    const entries = timetableData.entries || [];

    const matches = this.findMatchingEntries(entries, { subject });
    if (matches.length === 0) {
      return {
        success: false,
        status: 'NOT_FOUND',
        message: `Could not find any slot for subject "${subject}".`,
        command,
      };
    }

    const slot = matches[0];

    // Find target room
    const rm = problemData.rooms.find(r =>
      r.room_code.toLowerCase().includes(target_room.toLowerCase()) ||
      r.name.toLowerCase().includes(target_room.toLowerCase())
    );

    if (!rm) {
      return {
        success: false,
        status: 'ROOM_NOT_FOUND',
        message: `Room "${target_room}" was not found in active rooms.`,
        command,
      };
    }

    // Simulate room change
    const simulated = entries.map(e => {
      if (e.entry_id === slot.entry_id) {
        return {
          ...e,
          room_id: rm.id,
          room_code: rm.room_code,
          room_name: rm.name,
          room_type: rm.type,
          room_capacity: rm.capacity,
        };
      }
      return { ...e };
    });

    const validation = ConstraintEngine.validate(simulated, problemData);
    const description = `Change room for "${slot.subject_name}" (${slot.day_name} ${slot.period_name}) from ${slot.room_code} to ${rm.room_code} (${rm.type}, Cap: ${rm.capacity}).`;

    const proposal = defaultProposalManager.createProposal({
      timetable_id: timetableData.id,
      intent: 'REASSIGN_ROOM',
      command,
      description,
      can_apply: validation.isValid,
      is_valid: validation.isValid,
      violations: validation.violations,
      diff: {
        subject: slot.subject_name,
        time: `${slot.day_name} ${slot.period_name}`,
        before_room: slot.room_code,
        after_room: rm.room_code,
      },
      changes: [
        {
          type: 'UPDATE_ENTRY',
          entry_id: slot.entry_id,
          new_slot: simulated.find(e => e.entry_id === slot.entry_id),
        },
      ],
    });

    return {
      success: true,
      status: validation.isValid ? 'PREVIEW_READY' : 'CONFLICT_DETECTED',
      can_apply: validation.isValid,
      message: validation.isValid
        ? `Room change verified: ${description}`
        : `Room change causes conflict: ${validation.violations.map(v => v.message).join('; ')}`,
      proposal_id: proposal.id,
      proposal,
      validation,
      command,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. FIND FREE SLOTS
  // ─────────────────────────────────────────────────────────────────
  static handleFindFreeSlots(entities, timetableData, problemData, command) {
    const entries = timetableData.entries || [];
    const teachingPeriods = problemData.periods.filter(p => !p.is_break && !p.is_lunch);

    const availableSlots = [];
    for (const wd of problemData.workingDays) {
      if (entities.day && wd.day_name.toLowerCase() !== entities.day.toLowerCase()) continue;

      for (const p of teachingPeriods) {
        const occupiedCount = entries.filter(e => e.day_id === wd.id && e.period_id === p.id).length;
        if (occupiedCount === 0) {
          availableSlots.push({
            day: wd.day_name,
            period: p.name,
            time: `${String(p.start_time).slice(0, 5)} - ${String(p.end_time).slice(0, 5)}`,
          });
        }
      }
    }

    return {
      success: true,
      status: 'INFO_ONLY',
      can_apply: false,
      message: `Found ${availableSlots.length} completely unoccupied period slots in the institution.`,
      available_slots: availableSlots.slice(0, 10),
      command,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Resolvers & Matching Helpers
  // ─────────────────────────────────────────────────────────────────
  static findMatchingEntries(entries, criteria) {
    return entries.filter(e => {
      if (criteria.subject) {
        const sub = criteria.subject.toLowerCase();
        const matchesName = e.subject_name && e.subject_name.toLowerCase().includes(sub);
        const matchesCode = e.subject_code && e.subject_code.toLowerCase().includes(sub);
        if (!matchesName && !matchesCode) return false;
      }

      if (criteria.day) {
        const d = criteria.day.toLowerCase();
        if (!e.day_name || !e.day_name.toLowerCase().includes(d)) return false;
      }

      if (criteria.period) {
        const pStr = criteria.period.toUpperCase();
        // check "P1", "Period 1", "P-1"
        const pNumMatch = pStr.match(/[0-9]+/);
        if (pNumMatch) {
          const num = parseInt(pNumMatch[0], 10);
          // compare against period_order + 1 or period_name
          const matchesOrder = (e.period_order + 1 === num) || (e.period_order === num);
          const matchesName = e.period_name && e.period_name.toUpperCase().includes(pStr);
          if (!matchesOrder && !matchesName) return false;
        }
      }

      return true;
    });
  }

  static resolveWorkingDay(dayStr, workingDays) {
    if (!dayStr) return null;
    const lower = dayStr.toLowerCase();
    return workingDays.find(wd => wd.day_name.toLowerCase().includes(lower)) || null;
  }

  static resolvePeriod(periodStr, periods) {
    if (!periodStr) return null;
    const pStr = periodStr.toUpperCase();

    // Check for break or lunch explicitly
    if (pStr.includes('BREAK')) {
      return periods.find(p => p.is_break) || periods.find(p => p.name.toUpperCase().includes('BREAK')) || null;
    }
    if (pStr.includes('LUNCH')) {
      return periods.find(p => p.is_lunch) || periods.find(p => p.name.toUpperCase().includes('LUNCH')) || null;
    }

    const pNumMatch = pStr.match(/[0-9]+/);
    if (!pNumMatch) return null;

    const num = parseInt(pNumMatch[0], 10);

    // Look for exact period_name match first (e.g. "Period 1" or "P1")
    const nameMatch = periods.find(p => p.name.toUpperCase().includes(pStr));
    if (nameMatch) return nameMatch;

    // Fallback: 1-indexed order match or 0-indexed order match
    return periods.find(p => p.period_order === num - 1) || periods.find(p => p.period_order === num) || null;
  }
}

module.exports = CommandExecutor;
