const pool = require('../config/db');

const VALID_TYPES = ['THEORY', 'LAB', 'TUTORIAL', 'OTHER'];

exports.getAll = async (req, res, next) => {
  try {
    const { department_id, type, is_active } = req.query;
    let query = `
      SELECT s.*, 
             d.name AS department_name, 
             d.code AS department_code
      FROM subjects s
      JOIN departments d ON s.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (department_id) {
      query += ' AND s.department_id = ?';
      params.push(department_id);
    }
    if (type) {
      query += ' AND s.type = ?';
      params.push(type.toUpperCase());
    }
    if (is_active !== undefined && is_active !== '') {
      query += ' AND s.is_active = ?';
      params.push(is_active === 'true' || is_active === true || is_active === 1 || is_active === '1');
    }

    query += ' ORDER BY d.name ASC, s.code ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const query = `
      SELECT s.*, 
             d.name AS department_name, 
             d.code AS department_code
      FROM subjects s
      JOIN departments d ON s.department_id = d.id
      WHERE s.id = ?
    `;
    const [rows] = await pool.query(query, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { department_id, code, name, type, periods_per_week, duration, requires_lab, is_active } = req.body;

    if (!department_id || !code || !name || !type || periods_per_week === undefined || duration === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();
    const normalizedType = type.trim().toUpperCase();

    if (!VALID_TYPES.includes(normalizedType)) {
      return res.status(400).json({ message: `Invalid subject type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const ppw = parseInt(periods_per_week, 10);
    const dur = parseInt(duration, 10);

    if (isNaN(ppw) || ppw <= 0) {
      return res.status(400).json({ message: 'Periods per week must be a positive integer greater than 0' });
    }
    if (isNaN(dur) || dur <= 0) {
      return res.status(400).json({ message: 'Duration must be a positive integer greater than 0' });
    }

    // periods_per_week must be >= duration
    if (ppw < dur) {
      return res.status(400).json({ message: 'Periods per week must be greater than or equal to duration' });
    }

    // LAB subjects must have an appropriate consecutive duration (at least 2 periods)
    if (normalizedType === 'LAB' && dur < 2) {
      return res.status(400).json({ message: 'LAB subjects must have an appropriate consecutive duration of at least 2 periods' });
    }

    // Check department existence
    const [deptRows] = await pool.query('SELECT id FROM departments WHERE id = ?', [department_id]);
    if (deptRows.length === 0) {
      return res.status(400).json({ message: 'Invalid department selected' });
    }

    // Check duplicate code in department
    const [existing] = await pool.query(
      'SELECT id FROM subjects WHERE department_id = ? AND code = ?',
      [department_id, normalizedCode]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Subject code already exists for this department' });
    }

    const reqLab = normalizedType === 'LAB' ? true : Boolean(requires_lab);
    const activeStatus = is_active !== undefined ? Boolean(is_active) : true;

    const [result] = await pool.query(
      'INSERT INTO subjects (department_id, code, name, type, periods_per_week, duration, requires_lab, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [department_id, normalizedCode, normalizedName, normalizedType, ppw, dur, reqLab, activeStatus]
    );

    res.status(201).json({
      id: result.insertId,
      department_id,
      code: normalizedCode,
      name: normalizedName,
      type: normalizedType,
      periods_per_week: ppw,
      duration: dur,
      requires_lab: reqLab,
      is_active: activeStatus
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Subject code already exists for this department' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { department_id, code, name, type, periods_per_week, duration, requires_lab, is_active } = req.body;
    const subjectId = req.params.id;

    const [current] = await pool.query('SELECT * FROM subjects WHERE id = ?', [subjectId]);
    if (current.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const updatedDeptId = department_id !== undefined ? department_id : current[0].department_id;
    const updatedCode = code !== undefined ? code.trim().toUpperCase() : current[0].code;
    const updatedName = name !== undefined ? name.trim() : current[0].name;
    const updatedType = type !== undefined ? type.trim().toUpperCase() : current[0].type;
    const updatedPpw = periods_per_week !== undefined ? parseInt(periods_per_week, 10) : current[0].periods_per_week;
    const updatedDur = duration !== undefined ? parseInt(duration, 10) : current[0].duration;
    const updatedReqLab = requires_lab !== undefined ? Boolean(requires_lab) : (updatedType === 'LAB' ? true : current[0].requires_lab);
    const updatedActive = is_active !== undefined ? Boolean(is_active) : current[0].is_active;

    if (!VALID_TYPES.includes(updatedType)) {
      return res.status(400).json({ message: `Invalid subject type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (isNaN(updatedPpw) || updatedPpw <= 0) {
      return res.status(400).json({ message: 'Periods per week must be a positive integer greater than 0' });
    }
    if (isNaN(updatedDur) || updatedDur <= 0) {
      return res.status(400).json({ message: 'Duration must be a positive integer greater than 0' });
    }
    if (updatedPpw < updatedDur) {
      return res.status(400).json({ message: 'Periods per week must be greater than or equal to duration' });
    }
    if (updatedType === 'LAB' && updatedDur < 2) {
      return res.status(400).json({ message: 'LAB subjects must have an appropriate consecutive duration of at least 2 periods' });
    }

    // Verify department
    const [deptRows] = await pool.query('SELECT id FROM departments WHERE id = ?', [updatedDeptId]);
    if (deptRows.length === 0) {
      return res.status(400).json({ message: 'Invalid department selected' });
    }

    // Check duplicate code
    const [existing] = await pool.query(
      'SELECT id FROM subjects WHERE department_id = ? AND code = ? AND id != ?',
      [updatedDeptId, updatedCode, subjectId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Subject code already exists for this department' });
    }

    await pool.query(
      'UPDATE subjects SET department_id = ?, code = ?, name = ?, type = ?, periods_per_week = ?, duration = ?, requires_lab = ?, is_active = ? WHERE id = ?',
      [updatedDeptId, updatedCode, updatedName, updatedType, updatedPpw, updatedDur, updatedReqLab, updatedActive, subjectId]
    );

    res.json({
      message: 'Subject updated successfully',
      subject: {
        id: Number(subjectId),
        department_id: updatedDeptId,
        code: updatedCode,
        name: updatedName,
        type: updatedType,
        periods_per_week: updatedPpw,
        duration: updatedDur,
        requires_lab: updatedReqLab,
        is_active: updatedActive
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Subject code already exists for this department' });
    }
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const subjectId = req.params.id;

    // Check if subject exists
    const [subj] = await pool.query('SELECT * FROM subjects WHERE id = ?', [subjectId]);
    if (subj.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Safe deletion check: check if mapped to classes
    const [mappings] = await pool.query('SELECT COUNT(*) as count FROM class_subjects WHERE subject_id = ?', [subjectId]);
    if (mappings[0].count > 0 && req.query.force !== 'true') {
      return res.status(400).json({
        message: `Cannot delete subject because it is assigned to ${mappings[0].count} class(es). Please unassign it first or use force=true.`
      });
    }

    await pool.query('DELETE FROM subjects WHERE id = ?', [subjectId]);
    res.json({ message: 'Subject deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete subject because it has dependent records.' });
    }
    next(err);
  }
};
