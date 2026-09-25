const pool = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const { department_id, academic_year_id, is_active } = req.query;
    let query = `
      SELECT c.*, 
             d.name AS department_name, 
             d.code AS department_code,
             ay.name AS academic_year_name
      FROM classes c
      JOIN departments d ON c.department_id = d.id
      JOIN academic_years ay ON c.academic_year_id = ay.id
      WHERE 1=1
    `;
    const params = [];

    if (department_id) {
      query += ' AND c.department_id = ?';
      params.push(department_id);
    }
    if (academic_year_id) {
      query += ' AND c.academic_year_id = ?';
      params.push(academic_year_id);
    }
    if (is_active !== undefined && is_active !== '') {
      query += ' AND c.is_active = ?';
      params.push(is_active === 'true' || is_active === true || is_active === 1 || is_active === '1');
    }

    query += ' ORDER BY d.name ASC, c.year ASC, c.section ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const query = `
      SELECT c.*, 
             d.name AS department_name, 
             d.code AS department_code,
             ay.name AS academic_year_name
      FROM classes c
      JOIN departments d ON c.department_id = d.id
      JOIN academic_years ay ON c.academic_year_id = ay.id
      WHERE c.id = ?
    `;
    const [rows] = await pool.query(query, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Class not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { department_id, academic_year_id, year, section, name, student_count, is_active } = req.body;

    if (!department_id || !academic_year_id || !year || !section || !name || student_count === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const yearNum = parseInt(year, 10);
    const countNum = parseInt(student_count, 10);

    if (isNaN(yearNum) || yearNum <= 0) {
      return res.status(400).json({ message: 'Year must be a positive integer' });
    }
    if (isNaN(countNum) || countNum <= 0) {
      return res.status(400).json({ message: 'Student count must be a positive integer greater than 0' });
    }

    // Verify department exists
    const [deptRows] = await pool.query('SELECT institution_id FROM departments WHERE id = ?', [department_id]);
    if (deptRows.length === 0) {
      return res.status(400).json({ message: 'Invalid department selected' });
    }

    // Verify academic year exists
    const [ayRows] = await pool.query('SELECT institution_id FROM academic_years WHERE id = ?', [academic_year_id]);
    if (ayRows.length === 0) {
      return res.status(400).json({ message: 'Invalid academic year selected' });
    }

    // Validate institution relationship
    if (deptRows[0].institution_id !== ayRows[0].institution_id) {
      return res.status(400).json({ message: 'Department and Academic Year must belong to the same institution' });
    }

    // Duplicate check
    const [existing] = await pool.query(
      'SELECT id FROM classes WHERE department_id = ? AND academic_year_id = ? AND year = ? AND section = ?',
      [department_id, academic_year_id, yearNum, section.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'A class with this department, academic year, year, and section already exists' });
    }

    const activeStatus = is_active !== undefined ? Boolean(is_active) : true;

    const [result] = await pool.query(
      'INSERT INTO classes (department_id, academic_year_id, year, section, name, student_count, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [department_id, academic_year_id, yearNum, section.trim(), name.trim(), countNum, activeStatus]
    );

    res.status(201).json({
      id: result.insertId,
      department_id,
      academic_year_id,
      year: yearNum,
      section: section.trim(),
      name: name.trim(),
      student_count: countNum,
      is_active: activeStatus
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'A class with this department, academic year, year, and section already exists' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { department_id, academic_year_id, year, section, name, student_count, is_active } = req.body;
    const classId = req.params.id;

    const [current] = await pool.query('SELECT * FROM classes WHERE id = ?', [classId]);
    if (current.length === 0) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const updatedDeptId = department_id !== undefined ? department_id : current[0].department_id;
    const updatedAyId = academic_year_id !== undefined ? academic_year_id : current[0].academic_year_id;
    const updatedYear = year !== undefined ? parseInt(year, 10) : current[0].year;
    const updatedSection = section !== undefined ? section.trim() : current[0].section;
    const updatedName = name !== undefined ? name.trim() : current[0].name;
    const updatedCount = student_count !== undefined ? parseInt(student_count, 10) : current[0].student_count;
    const updatedActive = is_active !== undefined ? Boolean(is_active) : current[0].is_active;

    if (isNaN(updatedYear) || updatedYear <= 0) {
      return res.status(400).json({ message: 'Year must be a positive integer' });
    }
    if (isNaN(updatedCount) || updatedCount <= 0) {
      return res.status(400).json({ message: 'Student count must be a positive integer greater than 0' });
    }

    // Verify department and academic year
    const [deptRows] = await pool.query('SELECT institution_id FROM departments WHERE id = ?', [updatedDeptId]);
    if (deptRows.length === 0) {
      return res.status(400).json({ message: 'Invalid department selected' });
    }
    const [ayRows] = await pool.query('SELECT institution_id FROM academic_years WHERE id = ?', [updatedAyId]);
    if (ayRows.length === 0) {
      return res.status(400).json({ message: 'Invalid academic year selected' });
    }
    if (deptRows[0].institution_id !== ayRows[0].institution_id) {
      return res.status(400).json({ message: 'Department and Academic Year must belong to the same institution' });
    }

    // Duplicate check excluding self
    const [existing] = await pool.query(
      'SELECT id FROM classes WHERE department_id = ? AND academic_year_id = ? AND year = ? AND section = ? AND id != ?',
      [updatedDeptId, updatedAyId, updatedYear, updatedSection, classId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'A class with this department, academic year, year, and section already exists' });
    }

    await pool.query(
      'UPDATE classes SET department_id = ?, academic_year_id = ?, year = ?, section = ?, name = ?, student_count = ?, is_active = ? WHERE id = ?',
      [updatedDeptId, updatedAyId, updatedYear, updatedSection, updatedName, updatedCount, updatedActive, classId]
    );

    res.json({
      message: 'Class updated successfully',
      class: {
        id: Number(classId),
        department_id: updatedDeptId,
        academic_year_id: updatedAyId,
        year: updatedYear,
        section: updatedSection,
        name: updatedName,
        student_count: updatedCount,
        is_active: updatedActive
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'A class with this department, academic year, year, and section already exists' });
    }
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Class not found' });
    }
    res.json({ message: 'Class deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete class because it has dependent records.' });
    }
    next(err);
  }
};
