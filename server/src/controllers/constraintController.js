const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRAINT CATALOGUE
// Defines all known constraints with types, descriptions, and default params.
// The catalogue is used to seed and validate constraint keys.
// ─────────────────────────────────────────────────────────────────────────────
const CONSTRAINT_CATALOGUE = {
  // ── HARD CONSTRAINTS ────────────────────────────────────────────────────────
  NO_FACULTY_DOUBLE_BOOKING: {
    type: 'HARD',
    name: 'No Faculty Double-Booking',
    description: 'A faculty member cannot be assigned to two different classes at the same day and period.',
    defaultParams: {},
  },
  NO_CLASS_DOUBLE_BOOKING: {
    type: 'HARD',
    name: 'No Class Double-Booking',
    description: 'A class cannot have two subjects scheduled at the same day and period.',
    defaultParams: {},
  },
  NO_ROOM_DOUBLE_BOOKING: {
    type: 'HARD',
    name: 'No Room Double-Booking',
    description: 'A room cannot be assigned to two different sessions at the same day and period.',
    defaultParams: {},
  },
  FACULTY_UNAVAILABILITY: {
    type: 'HARD',
    name: 'Respect Faculty Unavailability',
    description: 'Faculty cannot be scheduled during periods they have marked as unavailable.',
    defaultParams: {},
  },
  CLASS_UNAVAILABILITY: {
    type: 'HARD',
    name: 'Respect Class Unavailability',
    description: 'Classes cannot be scheduled during periods they have marked as unavailable.',
    defaultParams: {},
  },
  ROOM_UNAVAILABILITY: {
    type: 'HARD',
    name: 'Respect Room Unavailability',
    description: 'Rooms cannot be assigned during periods they have been marked as unavailable.',
    defaultParams: {},
  },
  LAB_REQUIRES_LAB_ROOM: {
    type: 'HARD',
    name: 'Lab Subject Requires Lab Room',
    description: 'Subjects marked as requiring a lab (requires_lab=true) must be assigned to a room of type LAB.',
    defaultParams: {},
  },
  LAB_CONSECUTIVE_PERIODS: {
    type: 'HARD',
    name: 'Lab Sessions Must Be Consecutive',
    description: 'Lab subjects with duration > 1 must be scheduled in consecutive periods.',
    defaultParams: { min_consecutive: 2 },
  },
  FACULTY_WORKLOAD_LIMIT: {
    type: 'HARD',
    name: 'Faculty Workload Limit',
    description: 'Faculty cannot exceed their configured max_periods_per_day and max_periods_per_week limits.',
    defaultParams: {},
  },
  ROOM_CAPACITY: {
    type: 'HARD',
    name: 'Room Capacity Constraint',
    description: 'Room capacity must be >= the number of students in the assigned class.',
    defaultParams: { allow_overflow_percent: 0 },
  },

  // ── SOFT CONSTRAINTS ────────────────────────────────────────────────────────
  AVOID_SAME_SUBJECT_SAME_DAY: {
    type: 'SOFT',
    name: 'Avoid Repeated Subject on Same Day',
    description: 'Prefer not scheduling the same subject more than once on the same day for a class.',
    defaultParams: { max_occurrences_per_day: 1 },
  },
  AVOID_EXCESSIVE_CONSECUTIVE: {
    type: 'SOFT',
    name: 'Avoid Excessive Consecutive Classes (Faculty)',
    description: 'Prefer faculty do not teach more than a configurable number of classes back-to-back.',
    defaultParams: { max_consecutive_periods: 3 },
  },
  AVOID_EXCESSIVE_CONSECUTIVE_CLASS: {
    type: 'SOFT',
    name: 'Avoid Excessive Consecutive Classes (Student)',
    description: 'Prefer student classes do not have more than a configurable number of consecutive periods.',
    defaultParams: { max_consecutive_periods: 4 },
  },
  BALANCE_FACULTY_WORKLOAD: {
    type: 'SOFT',
    name: 'Balance Faculty Workload',
    description: 'Prefer evenly distributing teaching load across days rather than clustering on specific days.',
    defaultParams: { max_variance_per_day: 2 },
  },
  PREFERRED_LAB_PERIODS: {
    type: 'SOFT',
    name: 'Preferred Lab Period Slots',
    description: 'Prefer scheduling lab sessions in specified period slots (e.g., last two periods of the day).',
    defaultParams: { preferred_period_order_start: 5 },
  },
  AVOID_FIRST_LAST_PERIOD_FACULTY: {
    type: 'SOFT',
    name: 'Avoid First/Last Period for Faculty',
    description: 'Prefer not assigning faculty to the very first or last period of the day.',
    defaultParams: { avoid_first: true, avoid_last: true },
  },
  DISTRIBUTE_SUBJECTS_ACROSS_WEEK: {
    type: 'SOFT',
    name: 'Distribute Subjects Across Week',
    description: 'Prefer spreading subject occurrences evenly across all working days.',
    defaultParams: {},
  },
};

const VALID_KEYS = new Set(Object.keys(CONSTRAINT_CATALOGUE));

// ─────────────────────────────────────────────────────────────────────────────
// PARAMETER VALIDATION
// Validates user-supplied parameters against known constraint schemas.
// ─────────────────────────────────────────────────────────────────────────────
function validateParameters(constraintKey, parameters) {
  if (!parameters || typeof parameters !== 'object') return null; // null = valid
  const errors = [];

  switch (constraintKey) {
    case 'LAB_CONSECUTIVE_PERIODS': {
      const { min_consecutive } = parameters;
      if (min_consecutive !== undefined) {
        const v = parseInt(min_consecutive, 10);
        if (isNaN(v) || v < 1) errors.push('min_consecutive must be a positive integer');
      }
      break;
    }
    case 'AVOID_SAME_SUBJECT_SAME_DAY': {
      const { max_occurrences_per_day } = parameters;
      if (max_occurrences_per_day !== undefined) {
        const v = parseInt(max_occurrences_per_day, 10);
        if (isNaN(v) || v < 1) errors.push('max_occurrences_per_day must be >= 1');
      }
      break;
    }
    case 'AVOID_EXCESSIVE_CONSECUTIVE':
    case 'AVOID_EXCESSIVE_CONSECUTIVE_CLASS': {
      const { max_consecutive_periods } = parameters;
      if (max_consecutive_periods !== undefined) {
        const v = parseInt(max_consecutive_periods, 10);
        if (isNaN(v) || v < 1) errors.push('max_consecutive_periods must be >= 1');
      }
      break;
    }
    case 'BALANCE_FACULTY_WORKLOAD': {
      const { max_variance_per_day } = parameters;
      if (max_variance_per_day !== undefined) {
        const v = parseInt(max_variance_per_day, 10);
        if (isNaN(v) || v < 0) errors.push('max_variance_per_day must be >= 0');
      }
      break;
    }
    case 'PREFERRED_LAB_PERIODS': {
      const { preferred_period_order_start } = parameters;
      if (preferred_period_order_start !== undefined) {
        const v = parseInt(preferred_period_order_start, 10);
        if (isNaN(v) || v < 0) errors.push('preferred_period_order_start must be >= 0');
      }
      break;
    }
    case 'ROOM_CAPACITY': {
      const { allow_overflow_percent } = parameters;
      if (allow_overflow_percent !== undefined) {
        const v = parseInt(allow_overflow_percent, 10);
        if (isNaN(v) || v < 0 || v > 100) errors.push('allow_overflow_percent must be between 0 and 100');
      }
      break;
    }
    case 'AVOID_FIRST_LAST_PERIOD_FACULTY': {
      const { avoid_first, avoid_last } = parameters;
      if (avoid_first !== undefined && typeof avoid_first !== 'boolean') errors.push('avoid_first must be a boolean');
      if (avoid_last !== undefined && typeof avoid_last !== 'boolean') errors.push('avoid_last must be a boolean');
      break;
    }
    default:
      break;
  }

  return errors.length > 0 ? errors : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/constraints/catalogue — returns the full constraint catalogue */
exports.getCatalogue = async (req, res) => {
  const catalogue = Object.entries(CONSTRAINT_CATALOGUE).map(([key, def]) => ({
    constraint_key: key,
    constraint_type: def.type,
    name: def.name,
    description: def.description,
    defaultParams: def.defaultParams,
  }));
  res.json(catalogue);
};

/** GET /api/constraints?institution_id= */
exports.getAll = async (req, res, next) => {
  try {
    const { institution_id, constraint_type } = req.query;
    if (!institution_id) return res.status(400).json({ message: 'institution_id is required' });

    let query = `
      SELECT tc.*, i.name AS institution_name
      FROM timetable_constraints tc
      JOIN institutions i ON tc.institution_id = i.id
      WHERE tc.institution_id = ?
    `;
    const params = [institution_id];

    if (constraint_type) {
      const ct = constraint_type.toUpperCase();
      if (!['HARD', 'SOFT'].includes(ct)) {
        return res.status(400).json({ message: 'constraint_type must be HARD or SOFT' });
      }
      query += ' AND tc.constraint_type = ?';
      params.push(ct);
    }

    query += ' ORDER BY tc.constraint_type DESC, tc.priority DESC, tc.constraint_key ASC';
    const [rows] = await pool.query(query, params);

    // Parse the JSON `parameters` field for each row
    const parsed = rows.map(r => ({
      ...r,
      parameters: r.parameters ? (typeof r.parameters === 'string' ? JSON.parse(r.parameters) : r.parameters) : {},
    }));

    res.json(parsed);
  } catch (err) {
    next(err);
  }
};

/** GET /api/constraints/:id */
exports.getById = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT tc.*, i.name AS institution_name FROM timetable_constraints tc JOIN institutions i ON tc.institution_id = i.id WHERE tc.id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Constraint not found' });
    const r = rows[0];
    res.json({
      ...r,
      parameters: r.parameters ? (typeof r.parameters === 'string' ? JSON.parse(r.parameters) : r.parameters) : {},
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/constraints — create or upsert a constraint config */
exports.create = async (req, res, next) => {
  try {
    const { institution_id, constraint_key, is_enabled, priority, parameters } = req.body;

    if (!institution_id || !constraint_key) {
      return res.status(400).json({ message: 'institution_id and constraint_key are required' });
    }

    const key = constraint_key.trim().toUpperCase();
    if (!VALID_KEYS.has(key)) {
      return res.status(400).json({
        message: `Unknown constraint_key: "${key}". Valid keys: ${[...VALID_KEYS].join(', ')}`,
      });
    }

    // Verify institution
    const [inst] = await pool.query('SELECT id FROM institutions WHERE id = ?', [institution_id]);
    if (inst.length === 0) return res.status(400).json({ message: 'Invalid institution_id' });

    const def = CONSTRAINT_CATALOGUE[key];
    const mergedParams = { ...def.defaultParams, ...(parameters || {}) };

    // Validate parameters
    const paramErrors = validateParameters(key, mergedParams);
    if (paramErrors) return res.status(400).json({ message: 'Invalid parameters', errors: paramErrors });

    const enabled = is_enabled !== undefined ? Boolean(is_enabled) : true;
    const prio = priority !== undefined ? parseInt(priority, 10) : 1;
    if (isNaN(prio) || prio < 1 || prio > 10) {
      return res.status(400).json({ message: 'priority must be an integer between 1 and 10' });
    }

    const paramsJson = JSON.stringify(mergedParams);

    const [result] = await pool.query(
      `INSERT INTO timetable_constraints
         (institution_id, constraint_key, constraint_type, name, description, is_enabled, priority, parameters)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_enabled  = VALUES(is_enabled),
         priority    = VALUES(priority),
         parameters  = VALUES(parameters),
         updated_at  = CURRENT_TIMESTAMP`,
      [institution_id, key, def.type, def.name, def.description, enabled, prio, paramsJson]
    );

    // Fetch the saved record
    const insertId = result.insertId || null;
    let savedRecord;
    if (insertId) {
      const [r] = await pool.query('SELECT * FROM timetable_constraints WHERE id = ?', [insertId]);
      savedRecord = r[0];
    } else {
      const [r] = await pool.query(
        'SELECT * FROM timetable_constraints WHERE institution_id = ? AND constraint_key = ?',
        [institution_id, key]
      );
      savedRecord = r[0];
    }

    res.status(200).json({
      message: 'Constraint saved',
      constraint: {
        ...savedRecord,
        parameters: savedRecord.parameters
          ? (typeof savedRecord.parameters === 'string' ? JSON.parse(savedRecord.parameters) : savedRecord.parameters)
          : {},
      },
    });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/constraints/:id/toggle — enable/disable a constraint */
exports.toggle = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM timetable_constraints WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Constraint not found' });

    const newState = !rows[0].is_enabled;
    await pool.query('UPDATE timetable_constraints SET is_enabled = ? WHERE id = ?', [newState, req.params.id]);
    res.json({ message: `Constraint ${newState ? 'enabled' : 'disabled'}`, is_enabled: newState });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/constraints/:id — update priority and/or parameters */
exports.update = async (req, res, next) => {
  try {
    const { priority, parameters, is_enabled } = req.body;

    const [rows] = await pool.query('SELECT * FROM timetable_constraints WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Constraint not found' });

    const current = rows[0];
    const currentParams = current.parameters
      ? (typeof current.parameters === 'string' ? JSON.parse(current.parameters) : current.parameters)
      : {};

    const updPrio = priority !== undefined ? parseInt(priority, 10) : current.priority;
    if (isNaN(updPrio) || updPrio < 1 || updPrio > 10) {
      return res.status(400).json({ message: 'priority must be between 1 and 10' });
    }

    const updParams = parameters !== undefined ? { ...currentParams, ...parameters } : currentParams;
    const paramErrors = validateParameters(current.constraint_key, updParams);
    if (paramErrors) return res.status(400).json({ message: 'Invalid parameters', errors: paramErrors });

    const updEnabled = is_enabled !== undefined ? Boolean(is_enabled) : current.is_enabled;

    await pool.query(
      'UPDATE timetable_constraints SET priority = ?, parameters = ?, is_enabled = ? WHERE id = ?',
      [updPrio, JSON.stringify(updParams), updEnabled, req.params.id]
    );

    res.json({
      message: 'Constraint updated',
      constraint: { ...current, priority: updPrio, parameters: updParams, is_enabled: updEnabled },
    });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/constraints/:id */
exports.delete = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, constraint_type FROM timetable_constraints WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Constraint not found' });

    if (rows[0].constraint_type === 'HARD') {
      return res.status(400).json({
        message: 'HARD constraints cannot be deleted; disable them instead to prevent timetable corruption.',
      });
    }

    await pool.query('DELETE FROM timetable_constraints WHERE id = ?', [req.params.id]);
    res.json({ message: 'Soft constraint deleted successfully' });
  } catch (err) {
    next(err);
  }
};

/** POST /api/constraints/seed/:institution_id — seed all default constraints for an institution */
exports.seedDefaults = async (req, res, next) => {
  try {
    const { institution_id } = req.params;

    const [inst] = await pool.query('SELECT id FROM institutions WHERE id = ?', [institution_id]);
    if (inst.length === 0) return res.status(404).json({ message: 'Institution not found' });

    const values = Object.entries(CONSTRAINT_CATALOGUE).map(([key, def]) => [
      institution_id,
      key,
      def.type,
      def.name,
      def.description,
      true, // is_enabled
      def.type === 'HARD' ? 10 : 5, // default priority
      JSON.stringify(def.defaultParams),
    ]);

    await pool.query(
      `INSERT IGNORE INTO timetable_constraints
         (institution_id, constraint_key, constraint_type, name, description, is_enabled, priority, parameters)
       VALUES ?`,
      [values]
    );

    res.json({ message: `Seeded ${values.length} default constraints for institution #${institution_id}` });
  } catch (err) {
    next(err);
  }
};

/** POST /api/constraints/validate — validate a constraint config without saving */
exports.validateConstraint = async (req, res) => {
  const { constraint_key, parameters } = req.body;

  if (!constraint_key) return res.status(400).json({ message: 'constraint_key is required' });

  const key = constraint_key.trim().toUpperCase();
  if (!VALID_KEYS.has(key)) {
    return res.status(400).json({ message: `Unknown constraint_key: "${key}"` });
  }

  const def = CONSTRAINT_CATALOGUE[key];
  const mergedParams = { ...def.defaultParams, ...(parameters || {}) };
  const errors = validateParameters(key, mergedParams);

  if (errors) {
    return res.status(400).json({ valid: false, errors });
  }

  return res.json({
    valid: true,
    constraint_key: key,
    constraint_type: def.type,
    name: def.name,
    resolved_parameters: mergedParams,
  });
};
