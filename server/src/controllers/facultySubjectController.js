const pool = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const { faculty_id, subject_id, department_id } = req.query;
    let query = `
      SELECT 
        fs.faculty_id,
        fs.subject_id,
        fs.created_at,
        f.name AS faculty_name,
        f.faculty_code,
        f.email AS faculty_email,
        f.department_id AS faculty_department_id,
        fd.name AS faculty_department_name,
        s.code AS subject_code,
        s.name AS subject_name,
        s.type AS subject_type,
        s.periods_per_week,
        s.duration,
        s.requires_lab,
        s.department_id AS subject_department_id,
        sd.name AS subject_department_name
      FROM faculty_subjects fs
      JOIN faculty f ON fs.faculty_id = f.id
      JOIN departments fd ON f.department_id = fd.id
      JOIN subjects s ON fs.subject_id = s.id
      JOIN departments sd ON s.department_id = sd.id
      WHERE 1=1
    `;
    const params = [];

    if (faculty_id) {
      query += ' AND fs.faculty_id = ?';
      params.push(faculty_id);
    }
    if (subject_id) {
      query += ' AND fs.subject_id = ?';
      params.push(subject_id);
    }
    if (department_id) {
      query += ' AND f.department_id = ?';
      params.push(department_id);
    }

    query += ' ORDER BY f.name ASC, s.code ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { facultyId, subjectId } = req.params;
    const query = `
      SELECT 
        fs.faculty_id,
        fs.subject_id,
        fs.created_at,
        f.name AS faculty_name,
        f.faculty_code,
        f.email AS faculty_email,
        f.department_id AS faculty_department_id,
        fd.name AS faculty_department_name,
        s.code AS subject_code,
        s.name AS subject_name,
        s.type AS subject_type,
        s.periods_per_week,
        s.duration,
        s.requires_lab,
        s.department_id AS subject_department_id,
        sd.name AS subject_department_name
      FROM faculty_subjects fs
      JOIN faculty f ON fs.faculty_id = f.id
      JOIN departments fd ON f.department_id = fd.id
      JOIN subjects s ON fs.subject_id = s.id
      JOIN departments sd ON s.department_id = sd.id
      WHERE fs.faculty_id = ? AND fs.subject_id = ?
    `;
    const [rows] = await pool.query(query, [facultyId, subjectId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Faculty-subject mapping not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { faculty_id, subject_id } = req.body;

    if (!faculty_id || !subject_id) {
      return res.status(400).json({ message: 'Both faculty_id and subject_id are required' });
    }

    // Verify faculty exists
    const [facultyRows] = await pool.query('SELECT * FROM faculty WHERE id = ?', [faculty_id]);
    if (facultyRows.length === 0) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    const faculty = facultyRows[0];

    // Verify subject exists
    const [subjectRows] = await pool.query('SELECT * FROM subjects WHERE id = ?', [subject_id]);
    if (subjectRows.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    const subject = subjectRows[0];

    // Department match rule: "Subject must belong to the same department unless the existing design explicitly supports cross-department teaching."
    if (faculty.department_id !== subject.department_id) {
      return res.status(400).json({
        message: 'Subject must belong to the same department as the faculty member'
      });
    }

    // Duplicate check
    const [existing] = await pool.query(
      'SELECT * FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?',
      [faculty_id, subject_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'This subject is already assigned to this faculty member' });
    }

    await pool.query(
      'INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (?, ?)',
      [faculty_id, subject_id]
    );

    res.status(201).json({
      message: 'Subject assigned to faculty successfully',
      mapping: {
        faculty_id: Number(faculty_id),
        subject_id: Number(subject_id),
        faculty_name: faculty.name,
        subject_name: subject.name,
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'This subject is already assigned to this faculty member' });
    }
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    let facultyId = req.params.facultyId;
    let subjectId = req.params.subjectId;

    if (!facultyId || !subjectId) {
      facultyId = req.query.faculty_id;
      subjectId = req.query.subject_id;
    }

    if (!facultyId || !subjectId) {
      return res.status(400).json({ message: 'Both faculty_id and subject_id are required' });
    }

    const [result] = await pool.query(
      'DELETE FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?',
      [facultyId, subjectId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Faculty-subject mapping not found' });
    }

    res.json({ message: 'Subject unassigned from faculty successfully' });
  } catch (err) {
    next(err);
  }
};
