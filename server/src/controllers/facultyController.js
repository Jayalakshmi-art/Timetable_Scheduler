const pool = require('../config/db');

// Basic email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.getAll = async (req, res, next) => {
  try {
    const { department_id, is_active } = req.query;
    let query = `
      SELECT f.*, 
             d.name AS department_name, 
             d.code AS department_code,
             COUNT(fs.subject_id) AS mapped_subjects_count
      FROM faculty f
      JOIN departments d ON f.department_id = d.id
      LEFT JOIN faculty_subjects fs ON f.id = fs.faculty_id
      WHERE 1=1
    `;
    const params = [];

    if (department_id) {
      query += ' AND f.department_id = ?';
      params.push(department_id);
    }
    if (is_active !== undefined && is_active !== '') {
      query += ' AND f.is_active = ?';
      params.push(is_active === 'true' || is_active === true || is_active === 1 || is_active === '1');
    }

    query += ' GROUP BY f.id ORDER BY d.name ASC, f.name ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const query = `
      SELECT f.*, 
             d.name AS department_name, 
             d.code AS department_code,
             d.institution_id
      FROM faculty f
      JOIN departments d ON f.department_id = d.id
      WHERE f.id = ?
    `;
    const [rows] = await pool.query(query, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Also fetch their mapped subjects
    const [subjects] = await pool.query(`
      SELECT s.*, d.name AS department_name, d.code AS department_code
      FROM faculty_subjects fs
      JOIN subjects s ON fs.subject_id = s.id
      JOIN departments d ON s.department_id = d.id
      WHERE fs.faculty_id = ?
      ORDER BY s.code ASC
    `, [req.params.id]);

    res.json({
      ...rows[0],
      subjects,
    });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const {
      department_id,
      faculty_code,
      name,
      email,
      phone,
      max_periods_per_day,
      max_periods_per_week,
      is_active,
    } = req.body;

    if (!department_id || !faculty_code || !name || !email) {
      return res.status(400).json({ message: 'department_id, faculty_code, name, and email are required' });
    }

    const normalizedCode = faculty_code.trim().toUpperCase();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone ? phone.trim() : null;

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Invalid email address format' });
    }

    // Workload defaults & validation
    const maxDay = max_periods_per_day !== undefined && max_periods_per_day !== ''
      ? parseInt(max_periods_per_day, 10)
      : 4;
    const maxWeek = max_periods_per_week !== undefined && max_periods_per_week !== ''
      ? parseInt(max_periods_per_week, 10)
      : 20;

    if (isNaN(maxDay) || maxDay <= 0) {
      return res.status(400).json({ message: 'Max periods per day must be a positive integer greater than 0' });
    }
    if (isNaN(maxWeek) || maxWeek <= 0) {
      return res.status(400).json({ message: 'Max periods per week must be a positive integer greater than 0' });
    }
    if (maxWeek < maxDay) {
      return res.status(400).json({ message: 'Max periods per week must be greater than or equal to max periods per day' });
    }

    // Verify department exists
    const [deptRows] = await pool.query('SELECT id, institution_id FROM departments WHERE id = ?', [department_id]);
    if (deptRows.length === 0) {
      return res.status(400).json({ message: 'Invalid department selected' });
    }

    // Check duplicate faculty_code in department
    const [existingCode] = await pool.query(
      'SELECT id FROM faculty WHERE department_id = ? AND faculty_code = ?',
      [department_id, normalizedCode]
    );
    if (existingCode.length > 0) {
      return res.status(400).json({ message: 'Faculty code already exists for this department' });
    }

    // Check duplicate email
    const [existingEmail] = await pool.query(
      'SELECT id FROM faculty WHERE email = ?',
      [normalizedEmail]
    );
    if (existingEmail.length > 0) {
      return res.status(400).json({ message: 'A faculty member with this email already exists' });
    }

    const activeStatus = is_active !== undefined ? Boolean(is_active) : true;

    const [result] = await pool.query(
      `INSERT INTO faculty 
       (department_id, faculty_code, name, email, phone, max_periods_per_day, max_periods_per_week, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [department_id, normalizedCode, normalizedName, normalizedEmail, normalizedPhone, maxDay, maxWeek, activeStatus]
    );

    res.status(201).json({
      id: result.insertId,
      department_id,
      faculty_code: normalizedCode,
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      max_periods_per_day: maxDay,
      max_periods_per_week: maxWeek,
      is_active: activeStatus,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('unique_faculty_email')) {
        return res.status(400).json({ message: 'A faculty member with this email already exists' });
      }
      return res.status(400).json({ message: 'Faculty code already exists for this department' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const facultyId = req.params.id;
    const {
      department_id,
      faculty_code,
      name,
      email,
      phone,
      max_periods_per_day,
      max_periods_per_week,
      is_active,
    } = req.body;

    const [current] = await pool.query('SELECT * FROM faculty WHERE id = ?', [facultyId]);
    if (current.length === 0) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    const updatedDeptId = department_id !== undefined ? department_id : current[0].department_id;
    const updatedCode = faculty_code !== undefined ? faculty_code.trim().toUpperCase() : current[0].faculty_code;
    const updatedName = name !== undefined ? name.trim() : current[0].name;
    const updatedEmail = email !== undefined ? email.trim().toLowerCase() : current[0].email;
    const updatedPhone = phone !== undefined ? (phone ? phone.trim() : null) : current[0].phone;
    const updatedMaxDay = max_periods_per_day !== undefined
      ? parseInt(max_periods_per_day, 10)
      : current[0].max_periods_per_day;
    const updatedMaxWeek = max_periods_per_week !== undefined
      ? parseInt(max_periods_per_week, 10)
      : current[0].max_periods_per_week;
    const updatedActive = is_active !== undefined ? Boolean(is_active) : current[0].is_active;

    if (!EMAIL_REGEX.test(updatedEmail)) {
      return res.status(400).json({ message: 'Invalid email address format' });
    }
    if (isNaN(updatedMaxDay) || updatedMaxDay <= 0) {
      return res.status(400).json({ message: 'Max periods per day must be a positive integer greater than 0' });
    }
    if (isNaN(updatedMaxWeek) || updatedMaxWeek <= 0) {
      return res.status(400).json({ message: 'Max periods per week must be a positive integer greater than 0' });
    }
    if (updatedMaxWeek < updatedMaxDay) {
      return res.status(400).json({ message: 'Max periods per week must be greater than or equal to max periods per day' });
    }

    // Verify department
    const [deptRows] = await pool.query('SELECT id FROM departments WHERE id = ?', [updatedDeptId]);
    if (deptRows.length === 0) {
      return res.status(400).json({ message: 'Invalid department selected' });
    }

    // Check duplicate code in department (excluding self)
    const [existingCode] = await pool.query(
      'SELECT id FROM faculty WHERE department_id = ? AND faculty_code = ? AND id != ?',
      [updatedDeptId, updatedCode, facultyId]
    );
    if (existingCode.length > 0) {
      return res.status(400).json({ message: 'Faculty code already exists for this department' });
    }

    // Check duplicate email (excluding self)
    const [existingEmail] = await pool.query(
      'SELECT id FROM faculty WHERE email = ? AND id != ?',
      [updatedEmail, facultyId]
    );
    if (existingEmail.length > 0) {
      return res.status(400).json({ message: 'A faculty member with this email already exists' });
    }

    await pool.query(
      `UPDATE faculty 
       SET department_id = ?, faculty_code = ?, name = ?, email = ?, phone = ?, 
           max_periods_per_day = ?, max_periods_per_week = ?, is_active = ? 
       WHERE id = ?`,
      [updatedDeptId, updatedCode, updatedName, updatedEmail, updatedPhone, updatedMaxDay, updatedMaxWeek, updatedActive, facultyId]
    );

    res.json({
      message: 'Faculty updated successfully',
      faculty: {
        id: Number(facultyId),
        department_id: updatedDeptId,
        faculty_code: updatedCode,
        name: updatedName,
        email: updatedEmail,
        phone: updatedPhone,
        max_periods_per_day: updatedMaxDay,
        max_periods_per_week: updatedMaxWeek,
        is_active: updatedActive,
      },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('unique_faculty_email')) {
        return res.status(400).json({ message: 'A faculty member with this email already exists' });
      }
      return res.status(400).json({ message: 'Faculty code already exists for this department' });
    }
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const facultyId = req.params.id;

    const [faculty] = await pool.query('SELECT * FROM faculty WHERE id = ?', [facultyId]);
    if (faculty.length === 0) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Safe deletion: Check if mapped subjects exist
    const [mappings] = await pool.query('SELECT COUNT(*) as count FROM faculty_subjects WHERE faculty_id = ?', [facultyId]);
    if (mappings[0].count > 0 && req.query.force !== 'true') {
      return res.status(400).json({
        message: `Cannot delete faculty because they have ${mappings[0].count} mapped subject(s). Please unassign subjects or deactivate the faculty member instead (or use ?force=true).`
      });
    }

    await pool.query('DELETE FROM faculty WHERE id = ?', [facultyId]);
    res.json({ message: 'Faculty deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete faculty because dependent records exist. Deactivate instead.' });
    }
    next(err);
  }
};
