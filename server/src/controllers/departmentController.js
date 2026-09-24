const pool = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const institution_id = req.query.institution_id;
    let query = 'SELECT * FROM departments';
    let params = [];
    if (institution_id) {
      query += ' WHERE institution_id = ?';
      params.push(institution_id);
    }
    query += ' ORDER BY name ASC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { institution_id, name, code } = req.body;
    if (!institution_id || !name || !code) return res.status(400).json({ message: 'Missing required fields' });
    const [result] = await pool.query('INSERT INTO departments (institution_id, name, code) VALUES (?, ?, ?)', [institution_id, name, code]);
    res.status(201).json({ id: result.insertId, institution_id, name, code });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Department name or code already exists for this institution' });
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { name, code } = req.body;
    const [result] = await pool.query('UPDATE departments SET name = ?, code = ? WHERE id = ?', [name, code, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Department not found' });
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Department name or code already exists for this institution' });
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Department not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete department because it has dependent records.' });
    }
    next(err);
  }
};
