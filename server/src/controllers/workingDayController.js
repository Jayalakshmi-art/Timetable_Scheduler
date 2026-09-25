const pool = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const { institution_id } = req.query;
    let query = `
      SELECT wd.*, i.name AS institution_name, i.code AS institution_code
      FROM working_days wd
      JOIN institutions i ON wd.institution_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (institution_id) {
      query += ' AND wd.institution_id = ?';
      params.push(institution_id);
    }

    query += ' ORDER BY wd.day_order ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT wd.*, i.name AS institution_name
      FROM working_days wd
      JOIN institutions i ON wd.institution_id = i.id
      WHERE wd.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Working day not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { institution_id, day_name, day_order, is_active } = req.body;

    if (!institution_id || !day_name || day_order === undefined || day_order === null || day_order === '') {
      return res.status(400).json({ message: 'institution_id, day_name, and day_order are required' });
    }

    const normalizedName = day_name.trim();
    const order = parseInt(day_order, 10);

    if (isNaN(order) || order < 0) {
      return res.status(400).json({ message: 'day_order must be a non-negative integer' });
    }

    // Verify institution
    const [inst] = await pool.query('SELECT id FROM institutions WHERE id = ?', [institution_id]);
    if (inst.length === 0) return res.status(400).json({ message: 'Invalid institution' });

    // Duplicate day_name
    const [dupName] = await pool.query(
      'SELECT id FROM working_days WHERE institution_id = ? AND day_name = ?',
      [institution_id, normalizedName]
    );
    if (dupName.length > 0) return res.status(400).json({ message: 'This day already exists for the institution' });

    // Duplicate day_order
    const [dupOrder] = await pool.query(
      'SELECT id FROM working_days WHERE institution_id = ? AND day_order = ?',
      [institution_id, order]
    );
    if (dupOrder.length > 0) return res.status(400).json({ message: 'A working day with this order already exists' });

    const activeStatus = is_active !== undefined ? Boolean(is_active) : true;

    const [result] = await pool.query(
      'INSERT INTO working_days (institution_id, day_name, day_order, is_active) VALUES (?, ?, ?, ?)',
      [institution_id, normalizedName, order, activeStatus]
    );

    res.status(201).json({
      id: result.insertId, institution_id, day_name: normalizedName, day_order: order, is_active: activeStatus,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('unique_day_order_inst')) return res.status(400).json({ message: 'A working day with this order already exists' });
      return res.status(400).json({ message: 'This day already exists for the institution' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const dayId = req.params.id;
    const { institution_id, day_name, day_order, is_active } = req.body;

    const [current] = await pool.query('SELECT * FROM working_days WHERE id = ?', [dayId]);
    if (current.length === 0) return res.status(404).json({ message: 'Working day not found' });

    const c = current[0];
    const updInstId = institution_id !== undefined ? institution_id : c.institution_id;
    const updName = day_name !== undefined ? day_name.trim() : c.day_name;
    const updOrder = day_order !== undefined ? parseInt(day_order, 10) : c.day_order;
    const updActive = is_active !== undefined ? Boolean(is_active) : c.is_active;

    if (isNaN(updOrder) || updOrder < 0) {
      return res.status(400).json({ message: 'day_order must be a non-negative integer' });
    }

    // Duplicate checks excluding self
    const [dupName] = await pool.query(
      'SELECT id FROM working_days WHERE institution_id = ? AND day_name = ? AND id != ?',
      [updInstId, updName, dayId]
    );
    if (dupName.length > 0) return res.status(400).json({ message: 'This day already exists for the institution' });

    const [dupOrder] = await pool.query(
      'SELECT id FROM working_days WHERE institution_id = ? AND day_order = ? AND id != ?',
      [updInstId, updOrder, dayId]
    );
    if (dupOrder.length > 0) return res.status(400).json({ message: 'A working day with this order already exists' });

    await pool.query(
      'UPDATE working_days SET institution_id=?, day_name=?, day_order=?, is_active=? WHERE id=?',
      [updInstId, updName, updOrder, updActive, dayId]
    );

    res.json({
      message: 'Working day updated successfully',
      working_day: { id: Number(dayId), institution_id: updInstId, day_name: updName, day_order: updOrder, is_active: updActive },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('unique_day_order_inst')) return res.status(400).json({ message: 'A working day with this order already exists' });
      return res.status(400).json({ message: 'This day already exists for the institution' });
    }
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const [day] = await pool.query('SELECT * FROM working_days WHERE id = ?', [req.params.id]);
    if (day.length === 0) return res.status(404).json({ message: 'Working day not found' });

    await pool.query('DELETE FROM working_days WHERE id = ?', [req.params.id]);
    res.json({ message: 'Working day deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete working day because it is referenced. Deactivate instead.' });
    }
    next(err);
  }
};
