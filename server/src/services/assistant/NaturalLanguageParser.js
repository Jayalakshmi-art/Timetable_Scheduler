/**
 * NaturalLanguageParser extracts intents and entities from human natural language,
 * and compiles them into structured JSON commands without executing any SQL.
 */
class NaturalLanguageParser {
  /**
   * Parse a natural language user query.
   * @param {string} query - The raw input text
   * @param {Object} context - Optional context (current timetable, subjects, days, periods)
   * @returns {Object} Structured command or error
   */
  static parse(query, context = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return {
        status: 'MALFORMED',
        intent: 'UNKNOWN',
        message: 'Empty or invalid query provided.',
      };
    }

    const text = query.trim();

    // Check for clearly unsupported or malicious queries
    const lower = text.toLowerCase();
    const maliciousKeywords = ['drop table', 'delete from', 'insert into', 'update ', 'select ', '--', ';', 'exec('];
    if (maliciousKeywords.some(kw => lower.includes(kw))) {
      return {
        status: 'UNSUPPORTED',
        intent: 'SECURITY_BLOCKED',
        message: 'Direct database or SQL commands are not permitted. Only natural-language timetable operations are allowed.',
      };
    }

    // 1. SWAP INTENT
    // e.g. "Swap Monday P1 with Wednesday P2" or "Swap Java on Monday P1 with OS on Wednesday P2"
    if (lower.startsWith('swap') || lower.includes('exchange') || lower.includes('switch')) {
      return this.parseSwapIntent(text, lower, context);
    }

    // 2. REASSIGN FACULTY INTENT
    // e.g. "Reassign DBMS to Bob", "Change faculty for Algorithms to Prof. Alice", "Assign David to DS"
    if (lower.includes('reassign faculty') || lower.includes('change faculty') || lower.includes('change teacher') || (lower.includes('faculty') && lower.includes('to '))) {
      return this.parseReassignFacultyIntent(text, lower, context);
    }

    // 3. REASSIGN ROOM INTENT
    // e.g. "Change room for Java to Lab 2", "Move Java to Room 101" (when target is explicitly a room)
    if (lower.includes('change room') || lower.includes('switch room') || (lower.includes('room') && (lower.includes('to lab') || lower.includes('to room')))) {
      return this.parseReassignRoomIntent(text, lower, context);
    }

    // 4. FIND / SHOW FREE SLOTS INTENT
    // e.g. "Find free slots for Java", "What slots are available on Wednesday?", "Available periods for CE-3A"
    const hasSlotKeywords = lower.includes('slot') || lower.includes('period') || lower.includes('free') || lower.includes('available');
    if (((lower.startsWith('find') || lower.startsWith('what') || lower.startsWith('show')) && hasSlotKeywords) || lower.includes('available slot') || lower.includes('free slot')) {
      return this.parseFindSlotsIntent(text, lower, context);
    }

    // 5. MOVE / RESCHEDULE INTENT
    // e.g. "Move Java from Monday P3 to any valid slot"
    // e.g. "Move Algorithms from Monday Period 1 to Wednesday Period 2"
    // e.g. "Reschedule Web Lab to Friday"
    if (lower.startsWith('move') || lower.startsWith('reschedule') || lower.startsWith('shift') || lower.startsWith('relocate') || lower.includes('move ')) {
      return this.parseMoveIntent(text, lower, context);
    }

    // If no supported intent was recognized
    return {
      status: 'UNSUPPORTED',
      intent: 'UNKNOWN',
      message: `I could not recognize a scheduling action in: "${text}". Examples of supported actions:
• "Move [Subject] from [Day] [Period] to [Day] [Period]"
• "Move [Subject] from [Day] [Period] to any valid slot"
• "Swap [Day1] [Period1] with [Day2] [Period2]"
• "Reassign faculty for [Subject] to [Faculty Name]"
• "Change room for [Subject] to [Room Code]"`,
    };
  }

  static parseMoveIntent(text, lower, context) {
    // Entities to extract: subject, from_day, from_period, to_day, to_period, any_slot
    const isAnySlot = lower.includes('any valid slot') || lower.includes('any slot') || lower.includes('any free slot') || lower.includes('available slot');

    // Extract days
    const dayMatches = this.extractDays(text);
    // Extract periods
    const periodMatches = this.extractPeriods(text);

    // Subject extraction
    const subject = this.extractSubject(text, context);

    // Check for "from X to Y" patterns
    let fromDay = null;
    let toDay = null;
    let fromPeriod = null;
    let toPeriod = null;

    const toIdx = lower.lastIndexOf('to ');
    const fromIdx = lower.indexOf('from ');

    if (dayMatches.length === 1) {
      const dIdx = lower.indexOf(dayMatches[0].toLowerCase());
      if (toIdx !== -1 && dIdx > toIdx) {
        toDay = dayMatches[0];
      } else {
        fromDay = dayMatches[0];
      }
    } else if (dayMatches.length >= 2) {
      fromDay = dayMatches[0];
      toDay = dayMatches[1];
    }

    if (periodMatches.length === 1) {
      const pIdx = lower.indexOf(periodMatches[0].toLowerCase());
      if (toIdx !== -1 && pIdx > toIdx) {
        toPeriod = periodMatches[0];
      } else {
        fromPeriod = periodMatches[0];
      }
    } else if (periodMatches.length >= 2) {
      fromPeriod = periodMatches[0];
      toPeriod = periodMatches[1];
    }

    // Ambiguity checks
    if (!subject && (!fromDay || !fromPeriod)) {
      return {
        status: 'AMBIGUOUS',
        intent: 'MOVE_SLOT',
        message: 'Please specify the subject name or the origin day/period you want to move.',
      };
    }

    if (!toDay && !toPeriod && !isAnySlot) {
      return {
        status: 'AMBIGUOUS',
        intent: 'MOVE_SLOT',
        message: `Please specify the target day/period or say "to any valid slot".`,
      };
    }

    return {
      status: 'SUCCESS',
      intent: 'MOVE_SLOT',
      entities: {
        subject,
        from_day: fromDay,
        from_period: fromPeriod,
        to_day: toDay,
        to_period: toPeriod,
        any_slot: isAnySlot,
      },
      raw_query: text,
    };
  }

  static parseSwapIntent(text, lower, context) {
    const dayMatches = this.extractDays(text);
    const periodMatches = this.extractPeriods(text);
    const subjects = this.extractSubjects(text, context);

    if (dayMatches.length < 2 && periodMatches.length < 2 && subjects.length < 2) {
      return {
        status: 'AMBIGUOUS',
        intent: 'SWAP_SLOTS',
        message: 'Swap requires two slots or subjects to exchange. E.g.: "Swap Monday P1 with Wednesday P2".',
      };
    }

    return {
      status: 'SUCCESS',
      intent: 'SWAP_SLOTS',
      entities: {
        slot_a: {
          day: dayMatches[0] || null,
          period: periodMatches[0] || null,
          subject: subjects[0] || null,
        },
        slot_b: {
          day: dayMatches[1] || dayMatches[0] || null,
          period: periodMatches[1] || null,
          subject: subjects[1] || null,
        },
      },
      raw_query: text,
    };
  }

  static parseReassignFacultyIntent(text, lower, context) {
    const subject = this.extractSubject(text, context);
    // Find faculty name after "to " or "with "
    const toMatch = text.match(/(?:to|with)\s+([A-Za-z0-9._\s]+)/i);
    const targetFaculty = toMatch ? toMatch[1].trim() : null;

    if (!targetFaculty) {
      return {
        status: 'AMBIGUOUS',
        intent: 'REASSIGN_FACULTY',
        message: 'Please specify which faculty member to assign (e.g. "Reassign DBMS to Prof. Bob").',
      };
    }

    return {
      status: 'SUCCESS',
      intent: 'REASSIGN_FACULTY',
      entities: {
        subject,
        target_faculty: targetFaculty,
      },
      raw_query: text,
    };
  }

  static parseReassignRoomIntent(text, lower, context) {
    const subject = this.extractSubject(text, context);
    const toMatch = text.match(/(?:to\s+(?:room|lab)?\s*)([A-Za-z0-9_-]+)/i);
    const targetRoom = toMatch ? toMatch[1].trim() : null;

    if (!targetRoom) {
      return {
        status: 'AMBIGUOUS',
        intent: 'REASSIGN_ROOM',
        message: 'Please specify the target room (e.g. "Change room for Java to Lab 201").',
      };
    }

    return {
      status: 'SUCCESS',
      intent: 'REASSIGN_ROOM',
      entities: {
        subject,
        target_room: targetRoom,
      },
      raw_query: text,
    };
  }

  static parseFindSlotsIntent(text, lower, context) {
    const subject = this.extractSubject(text, context);
    const dayMatches = this.extractDays(text);

    if (!subject && dayMatches.length === 0 && !lower.includes('slot') && !lower.includes('period') && !lower.includes('free') && !lower.includes('available')) {
      return {
        status: 'UNSUPPORTED',
        intent: 'UNKNOWN',
        message: `I could not recognize a scheduling action in: "${text}".`,
      };
    }

    return {
      status: 'SUCCESS',
      intent: 'FIND_FREE_SLOTS',
      entities: {
        subject,
        day: dayMatches[0] || null,
      },
      raw_query: text,
    };
  }

  // --- Helper entity extractors ---
  static extractDays(text) {
    const dayRegex = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi;
    const matches = text.match(dayRegex) || [];
    const dayMap = {
      mon: 'Monday', monday: 'Monday',
      tue: 'Tuesday', tuesday: 'Tuesday',
      wed: 'Wednesday', wednesday: 'Wednesday',
      thu: 'Thursday', thursday: 'Thursday',
      fri: 'Friday', friday: 'Friday',
      sat: 'Saturday', saturday: 'Saturday',
      sun: 'Sunday', sunday: 'Sunday',
    };
    return matches.map(m => dayMap[m.toLowerCase()] || m);
  }

  static extractPeriods(text) {
    // Matches "P1", "P2", "Period 1", "Period 3", "Period-2", "1st period", "Break", "Lunch"
    const periodRegex = /\b(?:period\s*[-]?\s*([0-9]+)|p([0-9]+)|([1-9])(?:st|nd|rd|th)?\s+period|break|lunch)\b/gi;
    const results = [];
    let match;
    while ((match = periodRegex.exec(text)) !== null) {
      if (match[0].toLowerCase() === 'break') {
        results.push('Break');
      } else if (match[0].toLowerCase() === 'lunch') {
        results.push('Lunch');
      } else {
        const num = match[1] || match[2] || match[3];
        results.push(`P${num}`);
      }
    }
    return results;
  }

  static extractSubject(text, context) {
    // If context has known subjects, test against them first
    if (context.subjects && Array.isArray(context.subjects)) {
      for (const s of context.subjects) {
        const sName = s.name ? s.name.toLowerCase() : '';
        const sCode = s.code ? s.code.toLowerCase() : '';
        const lower = text.toLowerCase();
        if (sCode && lower.includes(sCode)) return s.code;
        if (sName && lower.includes(sName)) return s.name;
      }
    }

    // Regex extraction fallback
    // Matches "Move <Subject> from", "Move <Subject> to", "Reschedule <Subject>"
    const moveMatch = text.match(/(?:move|reschedule|shift|reassign|for)\s+([A-Za-z0-9\s_-]+?)(?:\s+(?:from|to|with|on|at)|$)/i);
    if (moveMatch && moveMatch[1]) {
      const cleaned = moveMatch[1].trim();
      const ignoreWords = ['slot', 'class', 'period', 'session', 'the'];
      if (!ignoreWords.includes(cleaned.toLowerCase())) {
        return cleaned;
      }
    }

    return null;
  }

  static extractSubjects(text, context) {
    const subjects = [];
    if (context.subjects && Array.isArray(context.subjects)) {
      for (const s of context.subjects) {
        const lower = text.toLowerCase();
        if ((s.name && lower.includes(s.name.toLowerCase())) || (s.code && lower.includes(s.code.toLowerCase()))) {
          subjects.push(s.name || s.code);
        }
      }
    }
    return subjects;
  }
}

module.exports = NaturalLanguageParser;
