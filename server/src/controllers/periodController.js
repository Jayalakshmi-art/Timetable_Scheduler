const pool = require('../config/db');

// Helper: convert TIME string to minutes for overlap comparison
function timeToMinutes(t) {
  // t may be "HH:MM:SS" or "HH:MM"
  const parts = String(t).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

exports.getAll = async (req, res, next) => {
  try {
    const { institution_id } = req.query;
    let query = `
      SELECT p.*, i.name AS institution_name, i.code AS institution_code
      FROM periods p
      JOIN institutions i ON p.institution_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (institution_id) {
      query += ' AND p.institution_id = ?';
      params.push(institution_id);
    }

    query += ' ORDER BY p.period_order ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, i.name AS institution_name
      FROM periods p
      JOIN institutions i ON p.institution_id = i.id
      WHERE p.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Period not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { institution_id, name, start_time, end_time, period_order, is_break, is_lunch } = req.body;

    if (!institution_id || !name || !start_time || !end_time || period_order === undefined || period_order === null || period_order === '') {
      return res.status(400).json({ message: 'institution_id, name, start_time, end_time, and period_order are required' });
    }

    const normalizedName = name.trim();
    const order = parseInt(period_order, 10);
    if (isNaN(order) || order < 0) {
      return res.status(400).json({ message: 'period_order must be a non-negative integer' });
    }

    // Validate times
    const startMin = timeToMinutes(start_time);
    const endMin = timeToMinutes(end_time);
    if (isNaN(startMin) || isNaN(endMin)) {
      return res.status(400).json({ message: 'Invalid time format. Use HH:MM or HH:MM:SS' });
    }
    if (endMin <= startMin) {
      return res.status(400).json({ message: 'end_time must be after start_time' });
    }

    // Verify institution
    const [inst] = await pool.query('SELECT id FROM institutions WHERE id = ?', [institution_id]);
    if (inst.length === 0) return res.status(400).json({ message: 'Invalid institution' });

    // Duplicate name check
    const [dupName] = await pool.query(
      'SELECT id FROM periods WHERE institution_id = ? AND name = ?',
      [institution_id, normalizedName]
    );
    if (dupName.length > 0) return res.status(400).json({ message: 'A period with this name already exists' });

    // Duplicate order check
    const [dupOrder] = await pool.query(
      'SELECT id FROM periods WHERE institution_id = ? AND period_order = ?',
      [institution_id, order]
    );
    if (dupOrder.length > 0) return res.status(400).json({ message: 'A period with this order already exists' });

    // Overlap check: find any existing period whose time range overlaps [start_time, end_time)
    const [overlaps] = await pool.query(
      `SELECT id, name, start_time, end_time FROM periods
       WHERE institution_id = ? AND start_time < ? AND end_time > ?`,
      [institution_id, end_time, start_time]
    );
    if (overlaps.length > 0) {
      return res.status(400).json({
        message: `Time overlaps with existing period "${overlaps[0].name}" (${overlaps[0].start_time}–${overlaps[0].end_time})`,
      });
    }

    const breakFlag = is_break ? true : false;
    const lunchFlag = is_lunch ? true : false;

    const [result] = await pool.query(
      `INSERT INTO periods (institution_id, name, start_time, end_time, period_order, is_break, is_lunch)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [institution_id, normalizedName, start_time, end_time, order, breakFlag, lunchFlag]
    );

    res.status(201).json({
      id: result.insertId, institution_id, name: normalizedName,
      start_time, end_time, period_order: order, is_break: breakFlag, is_lunch: lunchFlag,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('unique_period_order')) return res.status(400).json({ message: 'A period with this order already exists' });
      return res.status(400).json({ message: 'A period with this name already exists' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const periodId = req.params.id;
    const { institution_id, name, start_time, end_time, period_order, is_break, is_lunch } = req.body;

    const [current] = await pool.query('SELECT * FROM periods WHERE id = ?', [periodId]);
    if (current.length === 0) return res.status(404).json({ message: 'Period not found' });

    const c = current[0];
    const updInstId = institution_id !== undefined ? institution_id : c.institution_id;
    const updName = name !== undefined ? name.trim() : c.name;
    const updStart = start_time !== undefined ? start_time : c.start_time;
    const updEnd = end_time !== undefined ? end_time : c.end_time;
    const updOrder = period_order !== undefined ? parseInt(period_order, 10) : c.period_order;
    const updBreak = is_break !== undefined ? Boolean(is_break) : Boolean(c.is_break);
    const updLunch = is_lunch !== undefined ? Boolean(is_lunch) : Boolean(c.is_lunch);

    if (isNaN(updOrder) || updOrder < 0) {
      return res.status(400).json({ message: 'period_order must be a non-negative integer' });
    }

    const startMin = timeToMinutes(updStart);
    const endMin = timeToMinutes(updEnd);
    if (isNaN(startMin) || isNaN(endMin)) {
      return res.status(400).json({ message: 'Invalid time format' });
    }
    if (endMin <= startMin) {
      return res.status(400).json({ message: 'end_time must be after start_time' });
    }

    // Duplicate checks excluding self
    const [dupName] = await pool.query(
      'SELECT id FROM periods WHERE institution_id = ? AND name = ? AND id != ?',
      [updInstId, updName, periodId]
    );
    if (dupName.length > 0) return res.status(400).json({ message: 'A period with this name already exists' });

    const [dupOrder] = await pool.query(
      'SELECT id FROM periods WHERE institution_id = ? AND period_order = ? AND id != ?',
      [updInstId, updOrder, periodId]
    );
    if (dupOrder.length > 0) return res.status(400).json({ message: 'A period with this order already exists' });

    // Overlap check excluding self
    const [overlaps] = await pool.query(
      `SELECT id, name, start_time, end_time FROM periods
       WHERE institution_id = ? AND id != ? AND start_time < ? AND end_time > ?`,
      [updInstId, periodId, updEnd, updStart]
    );
    if (overlaps.length > 0) {
      return res.status(400).json({
        message: `Time overlaps with existing period "${overlaps[0].name}" (${overlaps[0].start_time}–${overlaps[0].end_time})`,
      });
    }

    await pool.query(
      `UPDATE periods SET institution_id=?, name=?, start_time=?, end_time=?, period_order=?, is_break=?, is_lunch=? WHERE id=?`,
      [updInstId, updName, updStart, updEnd, updOrder, updBreak, updLunch, periodId]
    );

    res.json({
      message: 'Period updated successfully',
      period: { id: Number(periodId), institution_id: updInstId, name: updName, start_time: updStart, end_time: updEnd, period_order: updOrder, is_break: updBreak, is_lunch: updLunch },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('unique_period_order')) return res.status(400).json({ message: 'A period with this order already exists' });
      return res.status(400).json({ message: 'A period with this name already exists' });
    }
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const [period] = await pool.query('SELECT * FROM periods WHERE id = ?', [req.params.id]);
    if (period.length === 0) return res.status(404).json({ message: 'Period not found' });

    await pool.query('DELETE FROM periods WHERE id = ?', [req.params.id]);
    res.json({ message: 'Period deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete period because it is referenced. Deactivate instead.' });
    }
    next(err);
  }
};
