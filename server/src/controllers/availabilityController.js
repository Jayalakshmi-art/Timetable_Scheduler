const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that working_day_id and period_id belong to the same institution
 * as the entity (faculty/class/room). Returns an error string or null.
 */
async function validateSlot(working_day_id, period_id, institution_id) {
  const [wd] = await pool.query(
    'SELECT id FROM working_days WHERE id = ? AND institution_id = ?',
    [working_day_id, institution_id]
  );
  if (wd.length === 0) return 'working_day_id does not belong to this institution';

  const [pd] = await pool.query(
    'SELECT id, is_break, is_lunch FROM periods WHERE id = ? AND institution_id = ?',
    [period_id, institution_id]
  );
  if (pd.length === 0) return 'period_id does not belong to this institution';
  if (pd[0].is_break || pd[0].is_lunch) return 'Cannot set availability for break or lunch periods';

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FACULTY AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/availability/faculty?faculty_id=&institution_id= */
exports.getFacultyAvailability = async (req, res, next) => {
  try {
    const { faculty_id, institution_id } = req.query;
    if (!faculty_id) return res.status(400).json({ message: 'faculty_id is required' });

    let query = `
      SELECT fa.*,
             f.name AS faculty_name, f.faculty_code,
             wd.day_name, wd.day_order,
             p.name AS period_name, p.start_time, p.end_time, p.period_order
      FROM faculty_availability fa
      JOIN faculty f      ON fa.faculty_id    = f.id
      JOIN working_days wd ON fa.working_day_id = wd.id
      JOIN periods p       ON fa.period_id     = p.id
      WHERE fa.faculty_id = ?
    `;
    const params = [faculty_id];

    if (institution_id) {
      query += ' AND wd.institution_id = ?';
      params.push(institution_id);
    }

    query += ' ORDER BY wd.day_order, p.period_order';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/** POST /api/availability/faculty */
exports.setFacultyAvailability = async (req, res, next) => {
  try {
    const { faculty_id, working_day_id, period_id, is_available, reason } = req.body;

    if (!faculty_id || !working_day_id || !period_id) {
      return res.status(400).json({ message: 'faculty_id, working_day_id, and period_id are required' });
    }

    // Verify faculty exists and get institution_id via department
    const [fac] = await pool.query(
      'SELECT f.id, d.institution_id FROM faculty f JOIN departments d ON f.department_id = d.id WHERE f.id = ?',
      [faculty_id]
    );
    if (fac.length === 0) return res.status(404).json({ message: 'Faculty not found' });

    const institution_id = fac[0].institution_id;
    const slotErr = await validateSlot(working_day_id, period_id, institution_id);
    if (slotErr) return res.status(400).json({ message: slotErr });

    const available = is_available !== undefined ? Boolean(is_available) : false;
    const cleanReason = reason ? reason.trim() : null;

    await pool.query(
      `INSERT INTO faculty_availability (faculty_id, working_day_id, period_id, is_available, reason)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_available = VALUES(is_available), reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
      [faculty_id, working_day_id, period_id, available, cleanReason]
    );

    res.status(200).json({
      message: 'Faculty availability saved',
      faculty_id: Number(faculty_id),
      working_day_id: Number(working_day_id),
      period_id: Number(period_id),
      is_available: available,
      reason: cleanReason,
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/availability/faculty/bulk */
exports.setFacultyAvailabilityBulk = async (req, res, next) => {
  try {
    const { faculty_id, slots } = req.body;
    // slots: [{ working_day_id, period_id, is_available, reason? }]

    if (!faculty_id || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ message: 'faculty_id and slots[] are required' });
    }

    const [fac] = await pool.query(
      'SELECT f.id, d.institution_id FROM faculty f JOIN departments d ON f.department_id = d.id WHERE f.id = ?',
      [faculty_id]
    );
    if (fac.length === 0) return res.status(404).json({ message: 'Faculty not found' });
    const institution_id = fac[0].institution_id;

    const errors = [];
    const validSlots = [];

    for (const slot of slots) {
      const { working_day_id, period_id, is_available, reason } = slot;
      if (!working_day_id || !period_id) {
        errors.push({ slot, error: 'working_day_id and period_id are required' });
        continue;
      }
      const slotErr = await validateSlot(working_day_id, period_id, institution_id);
      if (slotErr) {
        errors.push({ slot, error: slotErr });
        continue;
      }
      validSlots.push([
        faculty_id,
        working_day_id,
        period_id,
        is_available !== undefined ? Boolean(is_available) : false,
        reason ? reason.trim() : null,
      ]);
    }

    if (validSlots.length > 0) {
      await pool.query(
        `INSERT INTO faculty_availability (faculty_id, working_day_id, period_id, is_available, reason) VALUES ?
         ON DUPLICATE KEY UPDATE is_available = VALUES(is_available), reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
        [validSlots]
      );
    }

    res.json({
      message: `Saved ${validSlots.length} slot(s)`,
      saved: validSlots.length,
      errors,
    });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/availability/faculty/:id */
exports.deleteFacultyAvailability = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id FROM faculty_availability WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Availability record not found' });

    await pool.query('DELETE FROM faculty_availability WHERE id = ?', [req.params.id]);
    res.json({ message: 'Faculty availability record deleted' });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/availability/faculty/clear/:faculty_id */
exports.clearFacultyAvailability = async (req, res, next) => {
  try {
    const { faculty_id } = req.params;
    const [result] = await pool.query('DELETE FROM faculty_availability WHERE faculty_id = ?', [faculty_id]);
    res.json({ message: `Cleared ${result.affectedRows} availability record(s) for faculty` });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CLASS AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/availability/class?class_id=&institution_id= */
exports.getClassAvailability = async (req, res, next) => {
  try {
    const { class_id, institution_id } = req.query;
    if (!class_id) return res.status(400).json({ message: 'class_id is required' });

    let query = `
      SELECT ca.*,
             c.name AS class_name, c.year, c.section,
             wd.day_name, wd.day_order,
             p.name AS period_name, p.start_time, p.end_time, p.period_order
      FROM class_availability ca
      JOIN classes c         ON ca.class_id      = c.id
      JOIN working_days wd   ON ca.working_day_id = wd.id
      JOIN periods p          ON ca.period_id     = p.id
      WHERE ca.class_id = ?
    `;
    const params = [class_id];

    if (institution_id) {
      query += ' AND wd.institution_id = ?';
      params.push(institution_id);
    }

    query += ' ORDER BY wd.day_order, p.period_order';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/** POST /api/availability/class */
exports.setClassAvailability = async (req, res, next) => {
  try {
    const { class_id, working_day_id, period_id, is_available, reason } = req.body;

    if (!class_id || !working_day_id || !period_id) {
      return res.status(400).json({ message: 'class_id, working_day_id, and period_id are required' });
    }

    // Get institution_id via class -> department
    const [cls] = await pool.query(
      'SELECT c.id, d.institution_id FROM classes c JOIN departments d ON c.department_id = d.id WHERE c.id = ?',
      [class_id]
    );
    if (cls.length === 0) return res.status(404).json({ message: 'Class not found' });

    const institution_id = cls[0].institution_id;
    const slotErr = await validateSlot(working_day_id, period_id, institution_id);
    if (slotErr) return res.status(400).json({ message: slotErr });

    const available = is_available !== undefined ? Boolean(is_available) : false;
    const cleanReason = reason ? reason.trim() : null;

    await pool.query(
      `INSERT INTO class_availability (class_id, working_day_id, period_id, is_available, reason)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_available = VALUES(is_available), reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
      [class_id, working_day_id, period_id, available, cleanReason]
    );

    res.status(200).json({
      message: 'Class availability saved',
      class_id: Number(class_id),
      working_day_id: Number(working_day_id),
      period_id: Number(period_id),
      is_available: available,
      reason: cleanReason,
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/availability/class/bulk */
exports.setClassAvailabilityBulk = async (req, res, next) => {
  try {
    const { class_id, slots } = req.body;

    if (!class_id || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ message: 'class_id and slots[] are required' });
    }

    const [cls] = await pool.query(
      'SELECT c.id, d.institution_id FROM classes c JOIN departments d ON c.department_id = d.id WHERE c.id = ?',
      [class_id]
    );
    if (cls.length === 0) return res.status(404).json({ message: 'Class not found' });
    const institution_id = cls[0].institution_id;

    const errors = [];
    const validSlots = [];

    for (const slot of slots) {
      const { working_day_id, period_id, is_available, reason } = slot;
      if (!working_day_id || !period_id) {
        errors.push({ slot, error: 'working_day_id and period_id are required' });
        continue;
      }
      const slotErr = await validateSlot(working_day_id, period_id, institution_id);
      if (slotErr) {
        errors.push({ slot, error: slotErr });
        continue;
      }
      validSlots.push([
        class_id,
        working_day_id,
        period_id,
        is_available !== undefined ? Boolean(is_available) : false,
        reason ? reason.trim() : null,
      ]);
    }

    if (validSlots.length > 0) {
      await pool.query(
        `INSERT INTO class_availability (class_id, working_day_id, period_id, is_available, reason) VALUES ?
         ON DUPLICATE KEY UPDATE is_available = VALUES(is_available), reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
        [validSlots]
      );
    }

    res.json({ message: `Saved ${validSlots.length} slot(s)`, saved: validSlots.length, errors });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/availability/class/:id */
exports.deleteClassAvailability = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id FROM class_availability WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Availability record not found' });
    await pool.query('DELETE FROM class_availability WHERE id = ?', [req.params.id]);
    res.json({ message: 'Class availability record deleted' });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/availability/class/clear/:class_id */
exports.clearClassAvailability = async (req, res, next) => {
  try {
    const { class_id } = req.params;
    const [result] = await pool.query('DELETE FROM class_availability WHERE class_id = ?', [class_id]);
    res.json({ message: `Cleared ${result.affectedRows} availability record(s) for class` });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOM AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/availability/room?room_id=&institution_id= */
exports.getRoomAvailability = async (req, res, next) => {
  try {
    const { room_id, institution_id } = req.query;
    if (!room_id) return res.status(400).json({ message: 'room_id is required' });

    let query = `
      SELECT ra.*,
             r.name AS room_name, r.room_code, r.type AS room_type,
             wd.day_name, wd.day_order,
             p.name AS period_name, p.start_time, p.end_time, p.period_order
      FROM room_availability ra
      JOIN rooms r           ON ra.room_id       = r.id
      JOIN working_days wd   ON ra.working_day_id = wd.id
      JOIN periods p          ON ra.period_id     = p.id
      WHERE ra.room_id = ?
    `;
    const params = [room_id];

    if (institution_id) {
      query += ' AND wd.institution_id = ?';
      params.push(institution_id);
    }

    query += ' ORDER BY wd.day_order, p.period_order';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/** POST /api/availability/room */
exports.setRoomAvailability = async (req, res, next) => {
  try {
    const { room_id, working_day_id, period_id, is_available, reason } = req.body;

    if (!room_id || !working_day_id || !period_id) {
      return res.status(400).json({ message: 'room_id, working_day_id, and period_id are required' });
    }

    const [room] = await pool.query('SELECT id, institution_id FROM rooms WHERE id = ?', [room_id]);
    if (room.length === 0) return res.status(404).json({ message: 'Room not found' });

    const institution_id = room[0].institution_id;
    const slotErr = await validateSlot(working_day_id, period_id, institution_id);
    if (slotErr) return res.status(400).json({ message: slotErr });

    const available = is_available !== undefined ? Boolean(is_available) : false;
    const cleanReason = reason ? reason.trim() : null;

    await pool.query(
      `INSERT INTO room_availability (room_id, working_day_id, period_id, is_available, reason)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_available = VALUES(is_available), reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
      [room_id, working_day_id, period_id, available, cleanReason]
    );

    res.status(200).json({
      message: 'Room availability saved',
      room_id: Number(room_id),
      working_day_id: Number(working_day_id),
      period_id: Number(period_id),
      is_available: available,
      reason: cleanReason,
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/availability/room/bulk */
exports.setRoomAvailabilityBulk = async (req, res, next) => {
  try {
    const { room_id, slots } = req.body;

    if (!room_id || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ message: 'room_id and slots[] are required' });
    }

    const [room] = await pool.query('SELECT id, institution_id FROM rooms WHERE id = ?', [room_id]);
    if (room.length === 0) return res.status(404).json({ message: 'Room not found' });
    const institution_id = room[0].institution_id;

    const errors = [];
    const validSlots = [];

    for (const slot of slots) {
      const { working_day_id, period_id, is_available, reason } = slot;
      if (!working_day_id || !period_id) {
        errors.push({ slot, error: 'working_day_id and period_id are required' });
        continue;
      }
      const slotErr = await validateSlot(working_day_id, period_id, institution_id);
      if (slotErr) {
        errors.push({ slot, error: slotErr });
        continue;
      }
      validSlots.push([
        room_id,
        working_day_id,
        period_id,
        is_available !== undefined ? Boolean(is_available) : false,
        reason ? reason.trim() : null,
      ]);
    }

    if (validSlots.length > 0) {
      await pool.query(
        `INSERT INTO room_availability (room_id, working_day_id, period_id, is_available, reason) VALUES ?
         ON DUPLICATE KEY UPDATE is_available = VALUES(is_available), reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
        [validSlots]
      );
    }

    res.json({ message: `Saved ${validSlots.length} slot(s)`, saved: validSlots.length, errors });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/availability/room/:id */
exports.deleteRoomAvailability = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id FROM room_availability WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Availability record not found' });
    await pool.query('DELETE FROM room_availability WHERE id = ?', [req.params.id]);
    res.json({ message: 'Room availability record deleted' });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/availability/room/clear/:room_id */
exports.clearRoomAvailability = async (req, res, next) => {
  try {
    const { room_id } = req.params;
    const [result] = await pool.query('DELETE FROM room_availability WHERE room_id = ?', [room_id]);
    res.json({ message: `Cleared ${result.affectedRows} availability record(s) for room` });
  } catch (err) {
    next(err);
  }
};
