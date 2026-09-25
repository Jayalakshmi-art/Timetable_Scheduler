import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Classes() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [classes, setClasses] = useState([]);

  // Filter states
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterAyId, setFilterAyId] = useState('');

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingClassId, setEditingClassId] = useState(null);
  const [formData, setFormData] = useState({
    department_id: '',
    academic_year_id: '',
    year: '',
    section: '',
    name: '',
    student_count: '',
    is_active: true,
  });

  // UI status states
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

  // 2. Load Departments and Academic Years when Institution changes
  useEffect(() => {
    if (selectedInstitutionId) {
      loadDependencies(selectedInstitutionId);
    } else {
      setDepartments([]);
      setAcademicYears([]);
      setClasses([]);
    }
  }, [selectedInstitutionId]);

  const loadDependencies = async (instId) => {
    try {
      setLoading(true);
      setError('');
      const [deptRes, ayRes] = await Promise.all([
        api.get(`/departments?institution_id=${instId}`),
        api.get(`/academic-years?institution_id=${instId}`)
      ]);
      setDepartments(deptRes.data);
      setAcademicYears(ayRes.data);
      setFilterDeptId('');
      setFilterAyId('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load departments or academic years');
    } finally {
      setLoading(false);
    }
  };

  // 3. Load Classes when Filters change or dependencies update
  const loadClasses = async () => {
    try {
      setLoading(true);
      setError('');
      let url = '/classes?';
      if (filterDeptId) url += `department_id=${filterDeptId}&`;
      if (filterAyId) url += `academic_year_id=${filterAyId}&`;
      const { data } = await api.get(url);

      // If an institution is selected, filter rows belonging to that institution's departments
      if (selectedInstitutionId && departments.length > 0) {
        const deptIds = new Set(departments.map(d => d.id));
        setClasses(data.filter(c => deptIds.has(c.department_id)));
      } else {
        setClasses(data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (departments.length > 0 || !selectedInstitutionId) {
      loadClasses();
    }
  }, [filterDeptId, filterAyId, departments, selectedInstitutionId]);

  const resetForm = () => {
    setFormData({
      department_id: departments[0]?.id ? String(departments[0].id) : '',
      academic_year_id: academicYears[0]?.id ? String(academicYears[0].id) : '',
      year: '',
      section: '',
      name: '',
      student_count: '',
      is_active: true,
    });
    setEditingClassId(null);
    setShowForm(false);
  };

  const handleOpenAdd = () => {
    setError('');
    setSuccess('');
    setFormData({
      department_id: departments[0]?.id ? String(departments[0].id) : '',
      academic_year_id: academicYears[0]?.id ? String(academicYears[0].id) : '',
      year: '',
      section: '',
      name: '',
      student_count: '',
      is_active: true,
    });
    setEditingClassId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (c) => {
    setError('');
    setSuccess('');
    setFormData({
      department_id: String(c.department_id),
      academic_year_id: String(c.academic_year_id),
      year: String(c.year),
      section: c.section,
      name: c.name,
      student_count: String(c.student_count),
      is_active: Boolean(c.is_active),
    });
    setEditingClassId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const payload = {
      department_id: Number(formData.department_id),
      academic_year_id: Number(formData.academic_year_id),
      year: Number(formData.year),
      section: formData.section.trim(),
      name: formData.name.trim(),
      student_count: Number(formData.student_count),
      is_active: formData.is_active,
    };

    if (payload.student_count <= 0) {
      setError('Student count must be greater than 0.');
      return;
    }
    if (payload.year <= 0) {
      setError('Year must be a positive integer.');
      return;
    }

    try {
      if (editingClassId) {
        await api.put(`/classes/${editingClassId}`, payload);
        setSuccess('Class updated successfully.');
      } else {
        await api.post('/classes', payload);
        setSuccess('Class created successfully.');
      }
      resetForm();
      loadClasses();
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving class');
    }
  };

  const handleToggleActive = async (c) => {
    setError('');
    setSuccess('');
    try {
      await api.put(`/classes/${c.id}`, {
        is_active: !c.is_active,
      });
      setSuccess(`Class ${c.name} ${c.is_active ? 'deactivated' : 'activated'} successfully.`);
      loadClasses();
    } catch (err) {
      setError(err.response?.data?.message || 'Error changing class status');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete class "${name}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/classes/${id}`);
      setSuccess(`Class "${name}" deleted successfully.`);
      loadClasses();
    } catch (err) {
      setError(err.response?.data?.message || 'Error deleting class');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Classes Management</h1>
          <p className="page-subtitle">Manage class batches, sections, intake capacity, and activation status.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            if (showForm) resetForm();
            else handleOpenAdd();
          }}
        >
          {showForm ? 'Cancel' : '+ Add New Class'}
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

      {/* Filter / Scope Toolbar */}
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
          <label>Academic Year Filter</label>
          <select
            value={filterAyId}
            onChange={(e) => setFilterAyId(e.target.value)}
            disabled={!academicYears.length}
          >
            <option value="">All Academic Years</option>
            {academicYears.map((ay) => (
              <option key={ay.id} value={ay.id}>{ay.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Add / Edit Form Card */}
      {showForm && (
        <div className="form-card">
          <h2 style={{ marginBottom: '16px' }}>{editingClassId ? 'Edit Class' : 'Create New Class'}</h2>
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
                <label>Academic Year *</label>
                <select
                  value={formData.academic_year_id}
                  onChange={(e) => setFormData({ ...formData, academic_year_id: e.target.value })}
                  required
                >
                  <option value="">Select Academic Year</option>
                  {academicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>{ay.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Year (e.g. 1, 2, 3, 4) *</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="e.g. 3"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Section *</label>
                <input
                  type="text"
                  placeholder="e.g. A, B, Sec-1"
                  value={formData.section}
                  onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Class Name / Title *</label>
                <input
                  type="text"
                  placeholder="e.g. B.Tech CSE - 3A"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Student Count (Intake) *</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 60"
                  value={formData.student_count}
                  onChange={(e) => setFormData({ ...formData, student_count: e.target.value })}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <strong>Class is Active</strong> (inactive classes are excluded from scheduling)
              </label>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {editingClassId ? 'Save Changes' : 'Create Class'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Classes Table */}
      <div className="data-table-container">
        {loading ? (
          <div className="empty-state">Loading classes...</div>
        ) : classes.length === 0 ? (
          <div className="empty-state">
            No classes found for the selected criteria. Click "+ Add New Class" above to add your first class.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Class Name</th>
                <th>Department</th>
                <th>Academic Year</th>
                <th>Year & Section</th>
                <th>Students</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.department_name || c.department_code}</td>
                  <td>{c.academic_year_name}</td>
                  <td>Year {c.year} - Sec {c.section}</td>
                  <td>{c.student_count}</td>
                  <td>
                    <span className={`badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="btn-secondary"
                        onClick={() => handleOpenEdit(c)}
                        title="Edit Class Details"
                      >
                        Edit
                      </button>
                      <button
                        className={`btn-toggle ${c.is_active ? 'active' : 'inactive'}`}
                        onClick={() => handleToggleActive(c)}
                        title={c.is_active ? 'Deactivate class' : 'Activate class'}
                      >
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => handleDelete(c.id, c.name)}
                        title="Delete Class"
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
