import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function Faculty() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [facultyList, setFacultyList] = useState([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    department_id: '',
    faculty_code: '',
    name: '',
    email: '',
    phone: '',
    max_periods_per_day: 4,
    max_periods_per_week: 20,
    is_active: true,
  });

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* ─────── Data Loading ─────── */
  useEffect(() => { loadInstitutions(); }, []);

  const loadInstitutions = async () => {
    try {
      const { data } = await api.get('/institutions');
      setInstitutions(data);
      if (data.length) setSelectedInstId(String(data[0].id));
    } catch (e) { setError('Failed to load institutions'); }
  };

  useEffect(() => {
    if (!selectedInstId) { setDepartments([]); setFacultyList([]); return; }
    (async () => {
      try {
        const { data } = await api.get(`/departments?institution_id=${selectedInstId}`);
        setDepartments(data);
        if (data.length) setSelectedDeptId(String(data[0].id));
        else { setSelectedDeptId(''); setFacultyList([]); }
      } catch (e) { setError('Failed to load departments'); }
    })();
  }, [selectedInstId]);

  const loadFaculty = useCallback(async () => {
    if (!selectedDeptId) { setFacultyList([]); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/faculty?department_id=${selectedDeptId}`);
      setFacultyList(data);
    } catch (e) { setError('Failed to load faculty'); }
    finally { setLoading(false); }
  }, [selectedDeptId]);

  useEffect(() => { loadFaculty(); }, [loadFaculty]);

  /* ─────── Form Helpers ─────── */
  const blankForm = useCallback(() => ({
    department_id: selectedDeptId,
    faculty_code: '',
    name: '',
    email: '',
    phone: '',
    max_periods_per_day: 4,
    max_periods_per_week: 20,
    is_active: true,
  }), [selectedDeptId]);

  const openAdd = () => {
    setError(''); setSuccess('');
    setForm(blankForm());
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (f) => {
    setError(''); setSuccess('');
    setForm({
      department_id: String(f.department_id),
      faculty_code: f.faculty_code,
      name: f.name,
      email: f.email,
      phone: f.phone || '',
      max_periods_per_day: f.max_periods_per_day,
      max_periods_per_week: f.max_periods_per_week,
      is_active: Boolean(f.is_active),
    });
    setEditingId(f.id);
    setShowForm(true);
  };

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm()); };

  /* ─────── CRUD Actions ─────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    const day = parseInt(form.max_periods_per_day, 10);
    const week = parseInt(form.max_periods_per_week, 10);

    if (isNaN(day) || day <= 0) { setError('Max periods per day must be a positive integer.'); return; }
    if (isNaN(week) || week <= 0) { setError('Max periods per week must be a positive integer.'); return; }
    if (week < day) { setError('Max periods per week must be ≥ max periods per day.'); return; }

    const payload = {
      department_id: Number(form.department_id),
      faculty_code: form.faculty_code.trim().toUpperCase(),
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      max_periods_per_day: day,
      max_periods_per_week: week,
      is_active: form.is_active,
    };

    try {
      if (editingId) {
        await api.put(`/faculty/${editingId}`, payload);
        setSuccess('Faculty updated successfully.');
      } else {
        await api.post('/faculty', payload);
        setSuccess('Faculty created successfully.');
      }
      resetForm();
      loadFaculty();
    } catch (e) { setError(e.response?.data?.message || 'Error saving faculty'); }
  };

  const toggleActive = async (f) => {
    setError(''); setSuccess('');
    try {
      await api.put(`/faculty/${f.id}`, { is_active: !f.is_active });
      setSuccess(`${f.name} ${f.is_active ? 'deactivated' : 'activated'} successfully.`);
      loadFaculty();
    } catch (e) { setError(e.response?.data?.message || 'Error updating status'); }
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Delete faculty "${f.name}"? This cannot be undone.`)) return;
    setError(''); setSuccess('');
    try {
      await api.delete(`/faculty/${f.id}`);
      setSuccess(`"${f.name}" deleted.`);
      loadFaculty();
    } catch (e) { setError(e.response?.data?.message || 'Error deleting faculty'); }
  };

  /* ─────── Render ─────── */
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Faculty Management</h1>
          <p className="page-subtitle">Manage faculty members, workload limits, and department assignments.</p>
        </div>
        <button className="btn-primary" onClick={() => showForm ? resetForm() : openAdd()}>
          {showForm ? 'Cancel' : '+ Add Faculty'}
        </button>
      </div>

      {error && <div className="alert-box alert-error"><span>{error}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setError('')}>✕</button></div>}
      {success && <div className="alert-box alert-success"><span>{success}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setSuccess('')}>✕</button></div>}

      {/* Scope selectors */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>Institution</label>
          <select value={selectedInstId} onChange={e => setSelectedInstId(e.target.value)}>
            <option value="">Select Institution</option>
            {institutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Department</label>
          <select value={selectedDeptId} onChange={e => setSelectedDeptId(e.target.value)} disabled={!departments.length}>
            <option value="">Select Department</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
          </select>
        </div>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="form-card">
          <h2 style={{marginBottom:'16px'}}>{editingId ? 'Edit Faculty' : 'Add New Faculty'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Department *</label>
                <select value={form.department_id} onChange={e => setForm({...form, department_id: e.target.value})} required>
                  <option value="">Select Department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Faculty Code *</label>
                <input type="text" placeholder="e.g. FAC001" value={form.faculty_code} onChange={e => setForm({...form, faculty_code: e.target.value.toUpperCase()})} required />
              </div>
              <div className="form-field">
                <label>Full Name *</label>
                <input type="text" placeholder="e.g. Dr. Ramesh Kumar" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-field">
                <label>Email Address *</label>
                <input type="email" placeholder="e.g. ramesh@college.edu" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
              </div>
              <div className="form-field">
                <label>Phone (Optional)</label>
                <input type="text" placeholder="e.g. +91 98765 43210" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div className="form-field">
                <label>Max Periods / Day *</label>
                <input type="number" min="1" max="12" value={form.max_periods_per_day} onChange={e => setForm({...form, max_periods_per_day: e.target.value})} required />
              </div>
              <div className="form-field">
                <label>Max Periods / Week *</label>
                <input type="number" min="1" max="60" value={form.max_periods_per_week} onChange={e => setForm({...form, max_periods_per_week: e.target.value})} required />
              </div>
            </div>
            <label className="checkbox-label" style={{marginBottom:'20px'}}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
              <strong>Faculty is Active</strong>
            </label>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create Faculty'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Faculty Table */}
      <div className="data-table-container">
        {loading ? (
          <div className="empty-state">Loading faculty...</div>
        ) : !selectedDeptId ? (
          <div className="empty-state">Select a department to view its faculty members.</div>
        ) : facultyList.length === 0 ? (
          <div className="empty-state">No faculty found. Click "+ Add Faculty" to register one.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Max Day</th>
                <th>Max Week</th>
                <th>Subjects</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {facultyList.map(f => (
                <tr key={f.id}>
                  <td><code>{f.faculty_code}</code></td>
                  <td><strong>{f.name}</strong></td>
                  <td style={{fontSize:'13px'}}>{f.email}</td>
                  <td style={{fontSize:'13px'}}>{f.phone || '—'}</td>
                  <td>{f.max_periods_per_day} pd</td>
                  <td>{f.max_periods_per_week} pw</td>
                  <td>
                    <span className="badge badge-theory">{f.mapped_subjects_count || 0} subject{Number(f.mapped_subjects_count) !== 1 ? 's' : ''}</span>
                  </td>
                  <td>
                    <span className={`badge ${f.is_active ? 'badge-active' : 'badge-inactive'}`}>
                      {f.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn-secondary" onClick={() => openEdit(f)}>Edit</button>
                      <button
                        className={`btn-toggle ${f.is_active ? 'active' : 'inactive'}`}
                        onClick={() => toggleActive(f)}
                      >
                        {f.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn-danger" onClick={() => handleDelete(f)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
