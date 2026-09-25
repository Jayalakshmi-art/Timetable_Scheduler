const pool = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const { class_id, subject_id, department_id } = req.query;
    let query = `
      SELECT 
        cs.class_id,
        cs.subject_id,
        cs.periods_per_week_override,
        cs.duration_override,
        c.name AS class_name,
        c.year AS class_year,
        c.section AS class_section,
        c.department_id AS class_department_id,
        cd.name AS department_name,
        cd.code AS department_code,
        ay.name AS academic_year_name,
        s.code AS subject_code,
        s.name AS subject_name,
        s.type AS subject_type,
        s.periods_per_week AS base_periods_per_week,
        s.duration AS base_duration,
        s.requires_lab,
        COALESCE(cs.periods_per_week_override, s.periods_per_week) AS effective_periods_per_week,
        COALESCE(cs.duration_override, s.duration) AS effective_duration
      FROM class_subjects cs
      JOIN classes c ON cs.class_id = c.id
      JOIN departments cd ON c.department_id = cd.id
      JOIN academic_years ay ON c.academic_year_id = ay.id
      JOIN subjects s ON cs.subject_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (class_id) {
      query += ' AND cs.class_id = ?';
      params.push(class_id);
    }
    if (subject_id) {
      query += ' AND cs.subject_id = ?';
      params.push(subject_id);
    }
    if (department_id) {
      query += ' AND c.department_id = ?';
      params.push(department_id);
    }

    query += ' ORDER BY c.name ASC, s.code ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { classId, subjectId } = req.params;
    const query = `
      SELECT 
        cs.class_id,
        cs.subject_id,
        cs.periods_per_week_override,
        cs.duration_override,
        c.name AS class_name,
        c.year AS class_year,
        c.section AS class_section,
        c.department_id AS class_department_id,
        cd.name AS department_name,
        cd.code AS department_code,
        ay.name AS academic_year_name,
        s.code AS subject_code,
        s.name AS subject_name,
        s.type AS subject_type,
        s.periods_per_week AS base_periods_per_week,
        s.duration AS base_duration,
        s.requires_lab,
        COALESCE(cs.periods_per_week_override, s.periods_per_week) AS effective_periods_per_week,
        COALESCE(cs.duration_override, s.duration) AS effective_duration
      FROM class_subjects cs
      JOIN classes c ON cs.class_id = c.id
      JOIN departments cd ON c.department_id = cd.id
      JOIN academic_years ay ON c.academic_year_id = ay.id
      JOIN subjects s ON cs.subject_id = s.id
      WHERE cs.class_id = ? AND cs.subject_id = ?
    `;
    const [rows] = await pool.query(query, [classId, subjectId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Class-subject mapping not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { class_id, subject_id, periods_per_week_override, duration_override } = req.body;

    if (!class_id || !subject_id) {
      return res.status(400).json({ message: 'Both class_id and subject_id are required' });
    }

    // Verify class exists
    const [classRows] = await pool.query('SELECT c.*, d.institution_id FROM classes c JOIN departments d ON c.department_id = d.id WHERE c.id = ?', [class_id]);
    if (classRows.length === 0) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const classItem = classRows[0];

    // Verify subject exists
    const [subjectRows] = await pool.query('SELECT s.*, d.institution_id FROM subjects s JOIN departments d ON s.department_id = d.id WHERE s.id = ?', [subject_id]);
    if (subjectRows.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    const subjectItem = subjectRows[0];

    // Validate institution match
    if (classItem.institution_id !== subjectItem.institution_id) {
      return res.status(400).json({ message: 'Class and Subject must belong to the same institution' });
    }

    // Check duplicate mapping
    const [existing] = await pool.query('SELECT * FROM class_subjects WHERE class_id = ? AND subject_id = ?', [class_id, subject_id]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'This subject is already assigned to the selected class' });
    }

    // Handle overrides & validations
    let ppwOverride = null;
    let durOverride = null;

    if (periods_per_week_override !== undefined && periods_per_week_override !== null && periods_per_week_override !== '') {
      ppwOverride = parseInt(periods_per_week_override, 10);
      if (isNaN(ppwOverride) || ppwOverride <= 0) {
        return res.status(400).json({ message: 'Periods per week override must be a positive integer greater than 0' });
      }
    }

    if (duration_override !== undefined && duration_override !== null && duration_override !== '') {
      durOverride = parseInt(duration_override, 10);
      if (isNaN(durOverride) || durOverride <= 0) {
        return res.status(400).json({ message: 'Duration override must be a positive integer greater than 0' });
      }
    }

    const effectivePpw = ppwOverride !== null ? ppwOverride : subjectItem.periods_per_week;
    const effectiveDur = durOverride !== null ? durOverride : subjectItem.duration;

    if (effectivePpw < effectiveDur) {
      return res.status(400).json({ message: 'Periods per week must be greater than or equal to duration' });
    }

    if (subjectItem.type === 'LAB' && effectiveDur < 2) {
      return res.status(400).json({ message: 'LAB subjects must have an appropriate consecutive duration of at least 2 periods' });
    }

    await pool.query(
      'INSERT INTO class_subjects (class_id, subject_id, periods_per_week_override, duration_override) VALUES (?, ?, ?, ?)',
      [class_id, subject_id, ppwOverride, durOverride]
    );

    res.status(201).json({
      message: 'Subject mapped to class successfully',
      mapping: {
        class_id: Number(class_id),
        subject_id: Number(subject_id),
        periods_per_week_override: ppwOverride,
        duration_override: durOverride,
        effective_periods_per_week: effectivePpw,
        effective_duration: effectiveDur
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'This subject is already assigned to the selected class' });
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { classId, subjectId } = req.params;
    const { periods_per_week_override, duration_override } = req.body;

    const [existing] = await pool.query('SELECT * FROM class_subjects WHERE class_id = ? AND subject_id = ?', [classId, subjectId]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Class-subject mapping not found' });
    }

    const [subjectRows] = await pool.query('SELECT * FROM subjects WHERE id = ?', [subjectId]);
    if (subjectRows.length === 0) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    const subjectItem = subjectRows[0];

    let ppwOverride = null;
    let durOverride = null;

    if (periods_per_week_override !== undefined && periods_per_week_override !== null && periods_per_week_override !== '') {
      ppwOverride = parseInt(periods_per_week_override, 10);
      if (isNaN(ppwOverride) || ppwOverride <= 0) {
        return res.status(400).json({ message: 'Periods per week override must be a positive integer greater than 0' });
      }
    }

    if (duration_override !== undefined && duration_override !== null && duration_override !== '') {
      durOverride = parseInt(duration_override, 10);
      if (isNaN(durOverride) || durOverride <= 0) {
        return res.status(400).json({ message: 'Duration override must be a positive integer greater than 0' });
      }
    }

    const effectivePpw = ppwOverride !== null ? ppwOverride : subjectItem.periods_per_week;
    const effectiveDur = durOverride !== null ? durOverride : subjectItem.duration;

    if (effectivePpw < effectiveDur) {
      return res.status(400).json({ message: 'Periods per week must be greater than or equal to duration' });
    }

    if (subjectItem.type === 'LAB' && effectiveDur < 2) {
      return res.status(400).json({ message: 'LAB subjects must have an appropriate consecutive duration of at least 2 periods' });
    }

    await pool.query(
      'UPDATE class_subjects SET periods_per_week_override = ?, duration_override = ? WHERE class_id = ? AND subject_id = ?',
      [ppwOverride, durOverride, classId, subjectId]
    );

    res.json({
      message: 'Mapping updated successfully',
      mapping: {
        class_id: Number(classId),
        subject_id: Number(subjectId),
        periods_per_week_override: ppwOverride,
        duration_override: durOverride,
        effective_periods_per_week: effectivePpw,
        effective_duration: effectiveDur
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    let classId = req.params.classId;
    let subjectId = req.params.subjectId;

    if (!classId || !subjectId) {
      classId = req.query.class_id;
      subjectId = req.query.subject_id;
    }

    if (!classId || !subjectId) {
      return res.status(400).json({ message: 'Both class_id and subject_id are required' });
    }

    const [result] = await pool.query('DELETE FROM class_subjects WHERE class_id = ? AND subject_id = ?', [classId, subjectId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Class-subject mapping not found' });
    }

    res.json({ message: 'Subject unassigned from class successfully' });
  } catch (err) {
    next(err);
  }
};
