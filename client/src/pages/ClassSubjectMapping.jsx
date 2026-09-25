import { useState, useEffect } from 'react';
import api from '../services/api';

export default function ClassSubjectMapping() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);

  // Filter selections
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedAyId, setSelectedAyId] = useState('');
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  // Available subjects and mapped subjects
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [mappedSubjects, setMappedSubjects] = useState([]);

  // Assignment Modal/Form
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null);
  const [assignData, setAssignData] = useState({
    subject_id: '',
    periods_per_week_override: '',
    duration_override: '',
  });

  // UI state
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

  // 2. Load Departments & Academic Years when Institution changes
  useEffect(() => {
    if (selectedInstitutionId) {
      loadInstitutionDependencies(selectedInstitutionId);
    } else {
      setDepartments([]);
      setAcademicYears([]);
      setClasses([]);
      setSelectedClassId('');
    }
  }, [selectedInstitutionId]);

  const loadInstitutionDependencies = async (instId) => {
    try {
      setLoading(true);
      setError('');
      const [deptRes, ayRes] = await Promise.all([
        api.get(`/departments?institution_id=${instId}`),
        api.get(`/academic-years?institution_id=${instId}`)
      ]);
      setDepartments(deptRes.data);
      setAcademicYears(ayRes.data);
      if (deptRes.data.length > 0) setSelectedDeptId(String(deptRes.data[0].id));
      if (ayRes.data.length > 0) setSelectedAyId(String(ayRes.data[0].id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load institution data');
    } finally {
      setLoading(false);
    }
  };

  // 3. Load Classes matching department and academic year
  useEffect(() => {
    if (selectedDeptId && selectedAyId) {
      loadClasses(selectedDeptId, selectedAyId);
    } else {
      setClasses([]);
      setSelectedClassId('');
    }
  }, [selectedDeptId, selectedAyId]);

  const loadClasses = async (deptId, ayId) => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/classes?department_id=${deptId}&academic_year_id=${ayId}&is_active=true`);
      setClasses(data);
      if (data.length > 0) {
        setSelectedClassId(String(data[0].id));
      } else {
        setSelectedClassId('');
        setMappedSubjects([]);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  // 4. Load subjects pool for the department (or institution)
  useEffect(() => {
    if (selectedDeptId) {
      loadAvailableSubjects(selectedDeptId);
    }
  }, [selectedDeptId]);

  const loadAvailableSubjects = async (deptId) => {
    try {
      const { data } = await api.get(`/subjects?department_id=${deptId}&is_active=true`);
      setAvailableSubjects(data);
    } catch (err) {
      console.error(err);
    }
  };

  // 5. Load Mapped Subjects for selected class
  useEffect(() => {
    if (selectedClassId) {
      loadClassSubjects(selectedClassId);
    } else {
      setMappedSubjects([]);
    }
  }, [selectedClassId]);

  const loadClassSubjects = async (classId) => {
    try {
      setLoading(true);
      setError('');
      const { data } = await api.get(`/class-subjects?class_id=${classId}`);
      setMappedSubjects(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load class subjects');
    } finally {
      setLoading(false);
    }
  };

  // Handle open Assign modal
  const handleOpenAssign = () => {
    setError('');
    setSuccess('');
    // Pick first unassigned subject
    const mappedIds = new Set(mappedSubjects.map(m => m.subject_id));
    const unassigned = availableSubjects.filter(s => !mappedIds.has(s.id));
    const firstSubject = unassigned[0];

    setAssignData({
      subject_id: firstSubject ? String(firstSubject.id) : '',
      periods_per_week_override: '',
      duration_override: '',
    });
    setEditingMapping(null);
    setShowAssignForm(true);
  };

  const handleOpenEdit = (m) => {
    setError('');
    setSuccess('');
    setAssignData({
      subject_id: String(m.subject_id),
      periods_per_week_override: m.periods_per_week_override ? String(m.periods_per_week_override) : '',
      duration_override: m.duration_override ? String(m.duration_override) : '',
    });
    setEditingMapping(m);
    setShowAssignForm(true);
  };

  const handleCloseForm = () => {
    setShowAssignForm(false);
    setEditingMapping(null);
    setAssignData({
      subject_id: '',
      periods_per_week_override: '',
      duration_override: '',
    });
  };

  const handleSaveMapping = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedClassId) {
      setError('Please select a class first.');
      return;
    }
    if (!assignData.subject_id) {
      setError('Please select a subject.');
      return;
    }

    const payload = {
      class_id: Number(selectedClassId),
      subject_id: Number(assignData.subject_id),
      periods_per_week_override: assignData.periods_per_week_override ? Number(assignData.periods_per_week_override) : null,
      duration_override: assignData.duration_override ? Number(assignData.duration_override) : null,
    };

    // Client-side quick check
    const selectedSubj = availableSubjects.find(s => s.id === payload.subject_id);
    const effPpw = payload.periods_per_week_override || selectedSubj?.periods_per_week;
    const effDur = payload.duration_override || selectedSubj?.duration;

    if (effPpw && effDur && effPpw < effDur) {
      setError('Periods per week must be greater than or equal to duration.');
      return;
    }

    if (selectedSubj?.type === 'LAB' && effDur && effDur < 2) {
      setError('LAB subjects must have a consecutive duration of at least 2 periods.');
      return;
    }

    try {
      if (editingMapping) {
        await api.put(`/class-subjects/${selectedClassId}/${assignData.subject_id}`, payload);
        setSuccess('Mapping overrides updated successfully.');
      } else {
        await api.post('/class-subjects', payload);
        setSuccess('Subject assigned to class successfully.');
      }
      handleCloseForm();
      loadClassSubjects(selectedClassId);
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving mapping');
    }
  };

  const handleRemove = async (subjectId, subjectName) => {
    if (!window.confirm(`Unassign "${subjectName}" from this class?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/class-subjects/${selectedClassId}/${subjectId}`);
      setSuccess(`"${subjectName}" unassigned from class.`);
      loadClassSubjects(selectedClassId);
    } catch (err) {
      setError(err.response?.data?.message || 'Error removing subject');
    }
  };

  const selectedClass = classes.find(c => String(c.id) === String(selectedClassId));
  const unassignedSubjects = availableSubjects.filter(
    s => !mappedSubjects.some(m => m.subject_id === s.id)
  );

  const totalWeeklyPeriods = mappedSubjects.reduce(
    (sum, m) => sum + (Number(m.effective_periods_per_week) || 0), 0
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Class-Subject Mapping</h1>
          <p className="page-subtitle">Assign subjects to classes and customize period quotas and lab session durations.</p>
        </div>
        {selectedClassId && (
          <button className="btn-primary" onClick={handleOpenAssign}>
            + Assign Subject to Class
          </button>
        )}
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

      {/* Selectors Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>Institution</label>
          <select
            value={selectedInstitutionId}
            onChange={(e) => setSelectedInstitutionId(e.target.value)}
          >
            <option value="">Select Institution</option>
            {institutions.map(inst => (
              <option key={inst.id} value={inst.id}>{inst.name} ({inst.code})</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Department</label>
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            disabled={!departments.length}
          >
            <option value="">Select Department</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Academic Year</label>
          <select
            value={selectedAyId}
            onChange={(e) => setSelectedAyId(e.target.value)}
            disabled={!academicYears.length}
          >
            <option value="">Select Academic Year</option>
            {academicYears.map(ay => (
              <option key={ay.id} value={ay.id}>{ay.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Class / Section</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={!classes.length}
          >
            <option value="">Select Class</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} (Year {c.year} - Sec {c.section})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assign / Edit Form Modal */}
      {showAssignForm && (
        <div className="form-card">
          <h2 style={{ marginBottom: '16px' }}>
            {editingMapping ? `Edit Overrides for ${editingMapping.subject_name}` : `Assign Subject to ${selectedClass?.name}`}
          </h2>
          <form onSubmit={handleSaveMapping}>
            <div className="form-grid">
              <div className="form-field">
                <label>Subject *</label>
                <select
                  value={assignData.subject_id}
                  disabled={Boolean(editingMapping)}
                  onChange={(e) => setAssignData({ ...assignData, subject_id: e.target.value })}
                  required
                >
                  <option value="">Select Subject</option>
                  {(editingMapping ? availableSubjects : unassignedSubjects).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name} ({s.type}, {s.periods_per_week} ppw, {s.duration} dur)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Periods per Week Override (Optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave blank for subject default"
                  value={assignData.periods_per_week_override}
                  onChange={(e) => setAssignData({ ...assignData, periods_per_week_override: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Consecutive Duration Override (Optional)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave blank for subject default"
                  value={assignData.duration_override}
                  onChange={(e) => setAssignData({ ...assignData, duration_override: e.target.value })}
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={handleCloseForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {editingMapping ? 'Save Overrides' : 'Assign Subject'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Class Header & Stats */}
      {selectedClass && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          background: 'var(--code-bg)',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid var(--border)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-h)' }}>
              {selectedClass.name}
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>
              Year {selectedClass.year} &bull; Section {selectedClass.section} &bull; {selectedClass.student_count} Students
            </span>
          </div>

          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: 'var(--text)', textTransform: 'uppercase' }}>Mapped Subjects</div>
              <strong style={{ fontSize: '18px', color: 'var(--text-h)' }}>{mappedSubjects.length}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: 'var(--text)', textTransform: 'uppercase' }}>Weekly Periods Total</div>
              <strong style={{ fontSize: '18px', color: 'var(--accent)' }}>{totalWeeklyPeriods}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Mapped Subjects Table */}
      <div className="data-table-container">
        {!selectedClassId ? (
          <div className="empty-state">
            Please select a Department, Academic Year, and Class from the bar above to manage its subject mappings.
          </div>
        ) : loading ? (
          <div className="empty-state">Loading mapped subjects...</div>
        ) : mappedSubjects.length === 0 ? (
          <div className="empty-state">
            No subjects currently assigned to <strong>{selectedClass?.name}</strong>.
            Click "+ Assign Subject to Class" to map subjects.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>Type</th>
                <th>Periods / Week</th>
                <th>Duration</th>
                <th>Requires Lab</th>
                <th>Overrides</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappedSubjects.map(m => {
                const hasPpwOverride = m.periods_per_week_override !== null;
                const hasDurOverride = m.duration_override !== null;

                return (
                  <tr key={`${m.class_id}-${m.subject_id}`}>
                    <td><code>{m.subject_code}</code></td>
                    <td><strong>{m.subject_name}</strong></td>
                    <td>
                      <span className={`badge ${
                        m.subject_type === 'THEORY' ? 'badge-theory' :
                        m.subject_type === 'LAB' ? 'badge-lab' :
                        m.subject_type === 'TUTORIAL' ? 'badge-tutorial' : 'badge-other'
                      }`}>
                        {m.subject_type}
                      </span>
                    </td>
                    <td>
                      <strong>{m.effective_periods_per_week}</strong>
                      {hasPpwOverride && (
                        <span style={{ fontSize: '11px', color: '#6366f1', marginLeft: '6px' }}>
                          (base: {m.base_periods_per_week})
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>{m.effective_duration}</strong>
                      {hasDurOverride && (
                        <span style={{ fontSize: '11px', color: '#6366f1', marginLeft: '6px' }}>
                          (base: {m.base_duration})
                        </span>
                      )}
                    </td>
                    <td>{m.requires_lab ? '🔬 Yes' : 'No'}</td>
                    <td>
                      {hasPpwOverride || hasDurOverride ? (
                        <span className="badge badge-tutorial">Custom Override</span>
                      ) : (
                        <span style={{ color: 'var(--text)', fontSize: '12px' }}>Default</span>
                      )}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <button
                          className="btn-secondary"
                          onClick={() => handleOpenEdit(m)}
                          title="Edit period/duration overrides"
                        >
                          Edit Overrides
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => handleRemove(m.subject_id, m.subject_name)}
                          title="Unassign subject from class"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
