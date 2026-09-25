import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function FacultySubjectMapping() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [facultyList, setFacultyList] = useState([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [assignSubjectId, setAssignSubjectId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* ─────── Load chain ─────── */
  useEffect(() => { loadInstitutions(); }, []);

  const loadInstitutions = async () => {
    try {
      const { data } = await api.get('/institutions');
      setInstitutions(data);
      if (data.length) setSelectedInstId(String(data[0].id));
    } catch { setError('Failed to load institutions'); }
  };

  useEffect(() => {
    if (!selectedInstId) { setDepartments([]); setFacultyList([]); return; }
    (async () => {
      try {
        const { data } = await api.get(`/departments?institution_id=${selectedInstId}`);
        setDepartments(data);
        setSelectedDeptId(data.length ? String(data[0].id) : '');
      } catch { setError('Failed to load departments'); }
    })();
  }, [selectedInstId]);

  useEffect(() => {
    if (!selectedDeptId) { setFacultyList([]); setSelectedFacultyId(''); setAvailableSubjects([]); return; }
    (async () => {
      try {
        const [fRes, sRes] = await Promise.all([
          api.get(`/faculty?department_id=${selectedDeptId}&is_active=true`),
          api.get(`/subjects?department_id=${selectedDeptId}&is_active=true`),
        ]);
        setFacultyList(fRes.data);
        setAvailableSubjects(sRes.data);
        setSelectedFacultyId(fRes.data.length ? String(fRes.data[0].id) : '');
      } catch { setError('Failed to load faculty or subjects'); }
    })();
  }, [selectedDeptId]);

  const loadMappings = useCallback(async () => {
    if (!selectedFacultyId) { setMappings([]); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/faculty-subjects?faculty_id=${selectedFacultyId}`);
      setMappings(data);
    } catch { setError('Failed to load faculty subject mappings'); }
    finally { setLoading(false); }
  }, [selectedFacultyId]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  /* ─────── Assign subject ─────── */
  const handleAssign = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!assignSubjectId) { setError('Please select a subject to assign.'); return; }
    try {
      await api.post('/faculty-subjects', {
        faculty_id: Number(selectedFacultyId),
        subject_id: Number(assignSubjectId),
      });
      setSuccess('Subject assigned successfully.');
      setAssignSubjectId('');
      loadMappings();
    } catch (e) { setError(e.response?.data?.message || 'Error assigning subject'); }
  };

  /* ─────── Remove mapping ─────── */
  const handleRemove = async (subjectId, subjectName) => {
    if (!window.confirm(`Unassign "${subjectName}" from this faculty?`)) return;
    setError(''); setSuccess('');
    try {
      await api.delete(`/faculty-subjects/${selectedFacultyId}/${subjectId}`);
      setSuccess(`"${subjectName}" unassigned.`);
      loadMappings();
    } catch (e) { setError(e.response?.data?.message || 'Error removing mapping'); }
  };

  const selectedFaculty = facultyList.find(f => String(f.id) === String(selectedFacultyId));
  const mappedSubjectIds = new Set(mappings.map(m => m.subject_id));
  const unassigned = availableSubjects.filter(s => !mappedSubjectIds.has(s.id));
  const totalPpw = mappings.reduce((acc, m) => acc + (Number(m.periods_per_week) || 0), 0);

  const getTypeBadge = (type) => {
    switch (type) {
      case 'THEORY': return 'badge-theory';
      case 'LAB': return 'badge-lab';
      case 'TUTORIAL': return 'badge-tutorial';
      default: return 'badge-other';
    }
  };

  /* ─────── Render ─────── */
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Faculty-Subject Mapping</h1>
          <p className="page-subtitle">Assign subjects that a faculty member is qualified to teach.</p>
        </div>
      </div>

      {error && <div className="alert-box alert-error"><span>{error}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setError('')}>✕</button></div>}
      {success && <div className="alert-box alert-success"><span>{success}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setSuccess('')}>✕</button></div>}

      {/* Selectors */}
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
        <div className="filter-group">
          <label>Faculty Member</label>
          <select value={selectedFacultyId} onChange={e => setSelectedFacultyId(e.target.value)} disabled={!facultyList.length}>
            <option value="">Select Faculty</option>
            {facultyList.map(f => <option key={f.id} value={f.id}>{f.name} ({f.faculty_code})</option>)}
          </select>
        </div>
      </div>

      {/* Faculty Info Bar */}
      {selectedFaculty && (
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'16px 20px', background:'var(--code-bg)', borderRadius:'8px',
          marginBottom:'20px', border:'1px solid var(--border)', flexWrap:'wrap', gap:'16px'
        }}>
          <div>
            <h3 style={{margin:0, fontSize:'18px', color:'var(--text-h)'}}>{selectedFaculty.name}</h3>
            <span style={{fontSize:'13px', color:'var(--text)'}}>
              <code style={{marginRight:'8px'}}>{selectedFaculty.faculty_code}</code>
              {selectedFaculty.email} &bull; Max {selectedFaculty.max_periods_per_day} periods/day, {selectedFaculty.max_periods_per_week} periods/week
            </span>
          </div>
          <div style={{display:'flex', gap:'24px'}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'12px', color:'var(--text)', textTransform:'uppercase'}}>Assigned Subjects</div>
              <strong style={{fontSize:'22px', color:'var(--text-h)'}}>{mappings.length}</strong>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'12px', color:'var(--text)', textTransform:'uppercase'}}>Total PPW Load</div>
              <strong style={{
                fontSize:'22px',
                color: totalPpw > selectedFaculty.max_periods_per_week ? '#dc2626' : '#6366f1'
              }}>
                {totalPpw} / {selectedFaculty.max_periods_per_week}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Assign Form */}
      {selectedFacultyId && (
        <div className="form-card">
          <h2 style={{marginBottom:'14px', fontSize:'18px'}}>Assign a Subject</h2>
          {unassigned.length === 0 ? (
            <p style={{color:'var(--text)', fontSize:'14px'}}>
              All available subjects in this department have already been assigned to this faculty member.
            </p>
          ) : (
            <form onSubmit={handleAssign} style={{display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap'}}>
              <div className="form-field" style={{flex:'1', minWidth:'220px'}}>
                <label>Subject to Assign *</label>
                <select value={assignSubjectId} onChange={e => setAssignSubjectId(e.target.value)} required>
                  <option value="">Select Subject</option>
                  {unassigned.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name} ({s.type}, {s.periods_per_week} ppw)
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary" style={{height:'42px'}}>
                Assign Subject
              </button>
            </form>
          )}
        </div>
      )}

      {/* Mapped Subjects Table */}
      <div className="data-table-container">
        {!selectedFacultyId ? (
          <div className="empty-state">Select a faculty member to manage their subject assignments.</div>
        ) : loading ? (
          <div className="empty-state">Loading assigned subjects...</div>
        ) : mappings.length === 0 ? (
          <div className="empty-state">No subjects assigned yet. Use the form above to assign subjects.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Subject Name</th>
                <th>Type</th>
                <th>Periods / Week</th>
                <th>Duration</th>
                <th>Lab?</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={`${m.faculty_id}-${m.subject_id}`}>
                  <td><code>{m.subject_code}</code></td>
                  <td><strong>{m.subject_name}</strong></td>
                  <td><span className={`badge ${getTypeBadge(m.subject_type)}`}>{m.subject_type}</span></td>
                  <td>{m.periods_per_week}</td>
                  <td>{m.duration}</td>
                  <td>{m.requires_lab ? '🔬 Yes' : 'No'}</td>
                  <td>
                    <button className="btn-danger" onClick={() => handleRemove(m.subject_id, m.subject_name)}>
                      Remove
                    </button>
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
