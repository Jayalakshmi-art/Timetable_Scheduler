const pool = require('../config/db');

const ROOM_TYPES = ['CLASSROOM', 'LAB', 'SEMINAR_HALL', 'OTHER'];

exports.getAll = async (req, res, next) => {
  try {
    const { institution_id, type, is_active } = req.query;
    let query = `
      SELECT r.*, i.name AS institution_name, i.code AS institution_code
      FROM rooms r
      JOIN institutions i ON r.institution_id = i.id
      WHERE 1=1
    `;
    const params = [];

    if (institution_id) {
      query += ' AND r.institution_id = ?';
      params.push(institution_id);
    }
    if (type) {
      query += ' AND r.type = ?';
      params.push(type.toUpperCase());
    }
    if (is_active !== undefined && is_active !== '') {
      query += ' AND r.is_active = ?';
      params.push(is_active === 'true' || is_active === true || is_active === 1 || is_active === '1');
    }

    query += ' ORDER BY r.building ASC, r.floor ASC, r.room_code ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, i.name AS institution_name, i.code AS institution_code
      FROM rooms r
      JOIN institutions i ON r.institution_id = i.id
      WHERE r.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Room not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { institution_id, room_code, name, type, capacity, floor, building, is_active } = req.body;

    if (!institution_id || !room_code || !name || !capacity) {
      return res.status(400).json({ message: 'institution_id, room_code, name, and capacity are required' });
    }

    const normalizedCode = room_code.trim().toUpperCase();
    const normalizedName = name.trim();
    const roomType = type ? type.toUpperCase() : 'CLASSROOM';

    if (!ROOM_TYPES.includes(roomType)) {
      return res.status(400).json({ message: `Invalid room type. Must be one of: ${ROOM_TYPES.join(', ')}` });
    }

    const cap = parseInt(capacity, 10);
    if (isNaN(cap) || cap <= 0) {
      return res.status(400).json({ message: 'Capacity must be a positive integer' });
    }

    // Verify institution
    const [inst] = await pool.query('SELECT id FROM institutions WHERE id = ?', [institution_id]);
    if (inst.length === 0) return res.status(400).json({ message: 'Invalid institution' });

    // Duplicate room_code check
    const [dup] = await pool.query(
      'SELECT id FROM rooms WHERE institution_id = ? AND room_code = ?',
      [institution_id, normalizedCode]
    );
    if (dup.length > 0) return res.status(400).json({ message: 'Room code already exists for this institution' });

    const activeStatus = is_active !== undefined ? Boolean(is_active) : true;

    const [result] = await pool.query(
      `INSERT INTO rooms (institution_id, room_code, name, type, capacity, floor, building, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [institution_id, normalizedCode, normalizedName, roomType, cap, floor || null, building || null, activeStatus]
    );

    res.status(201).json({
      id: result.insertId, institution_id, room_code: normalizedCode, name: normalizedName,
      type: roomType, capacity: cap, floor: floor || null, building: building || null, is_active: activeStatus,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Room code already exists for this institution' });
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const roomId = req.params.id;
    const { institution_id, room_code, name, type, capacity, floor, building, is_active } = req.body;

    const [current] = await pool.query('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (current.length === 0) return res.status(404).json({ message: 'Room not found' });

    const c = current[0];
    const updInstId = institution_id !== undefined ? institution_id : c.institution_id;
    const updCode = room_code !== undefined ? room_code.trim().toUpperCase() : c.room_code;
    const updName = name !== undefined ? name.trim() : c.name;
    const updType = type !== undefined ? type.toUpperCase() : c.type;
    const updCap = capacity !== undefined ? parseInt(capacity, 10) : c.capacity;
    const updFloor = floor !== undefined ? (floor || null) : c.floor;
    const updBuilding = building !== undefined ? (building || null) : c.building;
    const updActive = is_active !== undefined ? Boolean(is_active) : c.is_active;

    if (!ROOM_TYPES.includes(updType)) {
      return res.status(400).json({ message: `Invalid room type. Must be one of: ${ROOM_TYPES.join(', ')}` });
    }
    if (isNaN(updCap) || updCap <= 0) {
      return res.status(400).json({ message: 'Capacity must be a positive integer' });
    }

    // Duplicate check excluding self
    const [dup] = await pool.query(
      'SELECT id FROM rooms WHERE institution_id = ? AND room_code = ? AND id != ?',
      [updInstId, updCode, roomId]
    );
    if (dup.length > 0) return res.status(400).json({ message: 'Room code already exists for this institution' });

    await pool.query(
      `UPDATE rooms SET institution_id=?, room_code=?, name=?, type=?, capacity=?, floor=?, building=?, is_active=? WHERE id=?`,
      [updInstId, updCode, updName, updType, updCap, updFloor, updBuilding, updActive, roomId]
    );

    res.json({
      message: 'Room updated successfully',
      room: { id: Number(roomId), institution_id: updInstId, room_code: updCode, name: updName, type: updType, capacity: updCap, floor: updFloor, building: updBuilding, is_active: updActive },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Room code already exists for this institution' });
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const [room] = await pool.query('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
    if (room.length === 0) return res.status(404).json({ message: 'Room not found' });

    await pool.query('DELETE FROM rooms WHERE id = ?', [req.params.id]);
    res.json({ message: 'Room deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete room because it is referenced by timetable entries. Deactivate instead.' });
    }
    next(err);
  }
};
