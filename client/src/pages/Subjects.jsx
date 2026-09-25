import { useState, useEffect } from 'react';
import api from '../services/api';

const SUBJECT_TYPES = ['THEORY', 'LAB', 'TUTORIAL', 'OTHER'];

export default function Subjects() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Filters
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterType, setFilterType] = useState('');

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [formData, setFormData] = useState({
    department_id: '',
    code: '',
    name: '',
    type: 'THEORY',
    periods_per_week: '4',
    duration: '1',
    requires_lab: false,
    is_active: true,
  });

  // UI status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 1. Initial Load of Institutions
  useEffect(() => {
    loadInstitutions();
  }, []);

  const loadInstitutions = async () => {
    try {
      const { data } = await api.get('/institutions');
      setInstitutions(data);
      if (data.length > 0) {
        setSelectedInstitutionId(String(data[0].id));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load institutions');
    }
  };

  // 2. Load Departments when Institution changes
  useEffect(() => {
    if (selectedInstitutionId) {
      loadDepartments(selectedInstitutionId);
    } else {
      setDepartments([]);
      setSubjects([]);
    }
  }, [selectedInstitutionId]);

  const loadDepartments = async (instId) => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/departments?institution_id=${instId}`);
      setDepartments(data);
      setFilterDeptId('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  // 3. Load Subjects
  const loadSubjects = async () => {
    try {
      setLoading(true);
      setError('');
      let url = '/subjects?';
      if (filterDeptId) url += `department_id=${filterDeptId}&`;
      if (filterType) url += `type=${filterType}&`;
      const { data } = await api.get(url);

      if (selectedInstitutionId && departments.length > 0) {
        const deptIds = new Set(departments.map(d => d.id));
        setSubjects(data.filter(s => deptIds.has(s.department_id)));
      } else {
        setSubjects(data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load subjects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (departments.length > 0 || !selectedInstitutionId) {
      loadSubjects();
    }
  }, [filterDeptId, filterType, departments, selectedInstitutionId]);

  const resetForm = () => {
    setFormData({
      department_id: departments[0]?.id ? String(departments[0].id) : '',
      code: '',
      name: '',
      type: 'THEORY',
      periods_per_week: '4',
      duration: '1',
      requires_lab: false,
      is_active: true,
    });
    setEditingSubjectId(null);
    setShowForm(false);
  };

  const handleOpenAdd = () => {
    setError('');
    setSuccess('');
    setFormData({
      department_id: departments[0]?.id ? String(departments[0].id) : '',
      code: '',
      name: '',
      type: 'THEORY',
      periods_per_week: '4',
      duration: '1',
      requires_lab: false,
      is_active: true,
    });
    setEditingSubjectId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (s) => {
    setError('');
    setSuccess('');
    setFormData({
      department_id: String(s.department_id),
      code: s.code,
      name: s.name,
      type: s.type,
      periods_per_week: String(s.periods_per_week),
      duration: String(s.duration),
      requires_lab: Boolean(s.requires_lab),
      is_active: Boolean(s.is_active),
    });
    setEditingSubjectId(s.id);
    setShowForm(true);
  };

  const handleTypeChange = (newType) => {
    setFormData((prev) => {
      const isLab = newType === 'LAB';
      const newDur = isLab && Number(prev.duration) < 2 ? '2' : prev.duration;
      const newPpw = isLab && Number(prev.periods_per_week) < Number(newDur) ? newDur : prev.periods_per_week;
      return {
        ...prev,
        type: newType,
        requires_lab: isLab ? true : prev.requires_lab,
        duration: newDur,
        periods_per_week: newPpw,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const ppw = parseInt(formData.periods_per_week, 10);
    const dur = parseInt(formData.duration, 10);

    if (isNaN(ppw) || ppw <= 0) {
      setError('Periods per week must be a positive integer.');
      return;
    }
    if (isNaN(dur) || dur <= 0) {
      setError('Duration must be a positive integer.');
      return;
    }
    if (ppw < dur) {
      setError('Periods per week must be greater than or equal to duration.');
      return;
    }
    if (formData.type === 'LAB' && dur < 2) {
      setError('LAB subjects must have an appropriate consecutive duration of at least 2 periods.');
      return;
    }

    const payload = {
      department_id: Number(formData.department_id),
      code: formData.code.trim().toUpperCase(),
      name: formData.name.trim(),
      type: formData.type,
      periods_per_week: ppw,
      duration: dur,
      requires_lab: formData.type === 'LAB' ? true : formData.requires_lab,
      is_active: formData.is_active,
    };

    try {
      if (editingSubjectId) {
        await api.put(`/subjects/${editingSubjectId}`, payload);
        setSuccess('Subject updated successfully.');
      } else {
        await api.post('/subjects', payload);
        setSuccess('Subject created successfully.');
      }
      resetForm();
      loadSubjects();
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving subject');
    }
  };

  const handleToggleActive = async (s) => {
    setError('');
    setSuccess('');
    try {
      await api.put(`/subjects/${s.id}`, {
        is_active: !s.is_active,
      });
      setSuccess(`Subject "${s.name}" ${s.is_active ? 'deactivated' : 'activated'} successfully.`);
      loadSubjects();
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating subject status');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete subject "${name}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/subjects/${id}`);
      setSuccess(`Subject "${name}" deleted successfully.`);
      loadSubjects();
    } catch (err) {
      setError(err.response?.data?.message || 'Error deleting subject');
    }
  };

  const getTypeBadgeClass = (type) => {
    switch (type) {
      case 'THEORY': return 'badge-theory';
      case 'LAB': return 'badge-lab';
      case 'TUTORIAL': return 'badge-tutorial';
      default: return 'badge-other';
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Subjects Management</h1>
          <p className="page-subtitle">Configure courses, theory/lab durations, weekly period loads, and activation status.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            if (showForm) resetForm();
            else handleOpenAdd();
          }}
        >
          {showForm ? 'Cancel' : '+ Add New Subject'}
        </button>
      </div>

      {error && (
        <div className="alert-box alert-error">
          <span>{error}</span>
          <button className="btn-secondary" style={{ padding: '2px 8px' }} onClick={() => setError('')}>✕</button>
        </div>
      )}

      {success && (
        <div className="alert-box alert-success">
          <span>{success}</span>
          <button className="btn-secondary" style={{ padding: '2px 8px' }} onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      {/* Filter / Toolbar */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>Institution</label>
          <select
            value={selectedInstitutionId}
            onChange={(e) => setSelectedInstitutionId(e.target.value)}
          >
            <option value="">Select Institution</option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.name} ({inst.code})</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Department Filter</label>
          <select
            value={filterDeptId}
            onChange={(e) => setFilterDeptId(e.target.value)}
            disabled={!departments.length}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>{dept.name} ({dept.code})</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Type Filter</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All Types</option>
            {SUBJECT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Add / Edit Subject Form */}
      {showForm && (
        <div className="form-card">
          <h2 style={{ marginBottom: '16px' }}>{editingSubjectId ? 'Edit Subject' : 'Create New Subject'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Department *</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                  required
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Subject Code *</label>
                <input
                  type="text"
                  placeholder="e.g. CS301, PH102"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Subject Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Data Structures & Algorithms"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Subject Type *</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  required
                >
                  {SUBJECT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Periods per Week *</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 4"
                  value={formData.periods_per_week}
                  onChange={(e) => setFormData({ ...formData, periods_per_week: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Period Duration (Consecutive) *</label>
                <input
                  type="number"
                  min={formData.type === 'LAB' ? '2' : '1'}
                  placeholder={formData.type === 'LAB' ? 'Min 2 for Lab' : 'e.g. 1'}
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.type === 'LAB' ? true : formData.requires_lab}
                  disabled={formData.type === 'LAB'}
                  onChange={(e) => setFormData({ ...formData, requires_lab: e.target.checked })}
                />
                <strong>Requires Computer/Science Lab</strong>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <strong>Subject is Active</strong>
              </label>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {editingSubjectId ? 'Save Changes' : 'Create Subject'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Subjects Table */}
      <div className="data-table-container">
        {loading ? (
          <div className="empty-state">Loading subjects...</div>
        ) : subjects.length === 0 ? (
          <div className="empty-state">
            No subjects found for the selected criteria. Click "+ Add New Subject" above to register courses.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Subject Name</th>
                <th>Department</th>
                <th>Type</th>
                <th>Periods / Week</th>
                <th>Duration</th>
                <th>Lab Required</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td><code>{s.code}</code></td>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.department_name || s.department_code}</td>
                  <td>
                    <span className={`badge ${getTypeBadgeClass(s.type)}`}>
                      {s.type}
                    </span>
                  </td>
                  <td>{s.periods_per_week} periods</td>
                  <td>{s.duration} consecutive</td>
                  <td>{s.requires_lab ? '🔬 Yes' : 'No'}</td>
                  <td>
                    <span className={`badge ${s.is_active ? 'badge-active' : 'badge-inactive'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="btn-secondary"
                        onClick={() => handleOpenEdit(s)}
                        title="Edit Subject"
                      >
                        Edit
                      </button>
                      <button
                        className={`btn-toggle ${s.is_active ? 'active' : 'inactive'}`}
                        onClick={() => handleToggleActive(s)}
                        title={s.is_active ? 'Deactivate subject' : 'Activate subject'}
                      >
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => handleDelete(s.id, s.name)}
                        title="Delete Subject"
                      >
                        Delete
                      </button>
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
