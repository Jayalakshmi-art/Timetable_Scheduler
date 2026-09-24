const pool = require('../config/db');

exports.getAll = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM institutions ORDER BY name ASC');
    res.json(rows);
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM institutions WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Institution not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ message: 'Name and code are required' });
    const [result] = await pool.query('INSERT INTO institutions (name, code) VALUES (?, ?)', [name, code]);
    res.status(201).json({ id: result.insertId, name, code });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Institution name or code already exists' });
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { name, code } = req.body;
    const [result] = await pool.query('UPDATE institutions SET name = ?, code = ? WHERE id = ?', [name, code, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Institution not found' });
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Institution name or code already exists' });
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM institutions WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Institution not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ message: 'Cannot delete institution because it has dependent departments or academic years.' });
    }
    next(err);
  }
};
