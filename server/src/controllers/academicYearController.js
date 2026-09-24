const pool = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const institution_id = req.query.institution_id;
    let query = 'SELECT * FROM academic_years';
    let params = [];
    if (institution_id) {
      query += ' WHERE institution_id = ?';
      params.push(institution_id);
    }
    query += ' ORDER BY start_date DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { institution_id, name, start_date, end_date, is_active } = req.body;
    if (!institution_id || !name || !start_date || !end_date) return res.status(400).json({ message: 'Missing required fields' });
    const [result] = await pool.query(
      'INSERT INTO academic_years (institution_id, name, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?)', 
      [institution_id, name, start_date, end_date, is_active || false]
    );
    res.status(201).json({ id: result.insertId, institution_id, name, start_date, end_date, is_active });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Academic year name already exists for this institution' });
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { name, start_date, end_date, is_active } = req.body;
    const [result] = await pool.query(
      'UPDATE academic_years SET name = ?, start_date = ?, end_date = ?, is_active = ? WHERE id = ?', 
      [name, start_date, end_date, is_active, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Academic Year not found' });
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Academic year name already exists for this institution' });
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM academic_years WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Academic Year not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete academic year because it has dependent records.' });
    }
    next(err);
  }
};
