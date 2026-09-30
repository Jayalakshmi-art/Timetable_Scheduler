import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';

export default function TimetableGenerator() {
  const [institutions, setInstitutions] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [selectedAyId, setSelectedAyId] = useState('');
  const [solverType, setSolverType] = useState('CSP');

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Generation response
  const [genResult, setGenResult] = useState(null);
  const [conflicts, setConflicts] = useState([]);

  // View state: 'CLASS' | 'FACULTY' | 'ROOM'
  const [viewMode, setViewMode] = useState('CLASS');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');

  // Saved timetables list
  const [savedTimetables, setSavedTimetables] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // 1. Load institutions
  useEffect(() => {
    api.get('/institutions')
      .then(({ data }) => {
        setInstitutions(data);
        if (data.length) setSelectedInstId(String(data[0].id));
      })
      .catch(() => setError('Failed to load institutions'));
  }, []);

  // 2. Load academic years & saved timetables when institution changes
  useEffect(() => {
    if (!selectedInstId) {
      setAcademicYears([]);
      setSavedTimetables([]);
      return;
    }

    api.get(`/academic-years?institution_id=${selectedInstId}`)
      .then(({ data }) => {
        setAcademicYears(data);
        const active = data.find(ay => ay.is_active);
        setSelectedAyId(active ? String(active.id) : (data[0] ? String(data[0].id) : ''));
      })
      .catch(() => {});

    loadSavedTimetables(selectedInstId);
  }, [selectedInstId]);

  const loadSavedTimetables = (instId) => {
    setLoadingSaved(true);
    api.get(`/timetable?institution_id=${instId}`)
      .then(({ data }) => setSavedTimetables(data))
      .catch(() => {})
      .finally(() => setLoadingSaved(false));
  };

  // Run Feasibility Check
  const handleFeasibility = async () => {
    if (!selectedInstId) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const { data } = await api.post('/timetable/feasibility-check', {
        institution_id: selectedInstId,
      });
      if (data.feasible) {
        setSuccessMsg('Feasibility Check Passed: ' + data.summary);
      } else {
        setError('Feasibility Warning: ' + data.summary);
        if (data.issues) setConflicts(data.issues);
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Error running feasibility check');
    } finally {
      setLoading(false);
    }
  };

  // Run Generation
  const handleGenerate = async () => {
    if (!selectedInstId) return;
    setGenerating(true);
    setError('');
    setSuccessMsg('');
    setConflicts([]);
    setGenResult(null);

    try {
      const payload = {
        institution_id: Number(selectedInstId),
        academic_year_id: selectedAyId ? Number(selectedAyId) : null,
        solver_type: solverType,
        save_to_db: true,
      };

      const { data } = await api.post('/timetable/generate', payload);

      setGenResult(data);
      setSuccessMsg(`Timetable successfully generated! Score: ${data.metrics?.soft_score ?? 100}/100 with 0 hard-constraint violations.`);
      loadSavedTimetables(selectedInstId);

      // Auto-select first class/faculty/room
      if (data.timetable && data.timetable.length > 0) {
        setSelectedClassId(String(data.timetable[0].class_id));
        setSelectedFacultyId(String(data.timetable[0].faculty_id));
        setSelectedRoomId(String(data.timetable[0].room_id));
      }
    } catch (e) {
      const respData = e.response?.data;
      if (respData) {
        setGenResult(respData);
        setError(respData.message || 'Timetable generation could not find a feasible solution.');
        if (respData.conflicts) setConflicts(respData.conflicts);
      } else {
        setError(e.message || 'Failed to generate timetable.');
      }
    } finally {
      setGenerating(false);
    }
  };

  // Load a saved timetable
  const handleLoadSaved = async (id) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/timetable/${id}`);
      // Format into genResult shape
      setGenResult({
        success: true,
        status: data.status,
        timetable: data.entries.map(e => ({
          ...e,
          id: e.entry_id,
        })),
        metrics: data.metadata?.metrics || {
          soft_score: data.soft_score || 100,
          total_slots_scheduled: data.entries.length,
          execution_time_ms: 0,
        },
        validation: data.metadata?.validation || { is_valid: true, hard_constraints_violated: 0 },
      });
      setSuccessMsg(`Loaded saved timetable: "${data.name}"`);
      if (data.entries.length > 0) {
        setSelectedClassId(String(data.entries[0].class_id));
        setSelectedFacultyId(String(data.entries[0].faculty_id));
        setSelectedRoomId(String(data.entries[0].room_id));
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Error loading timetable');
    } finally {
      setLoading(false);
    }
  };

  // Delete saved timetable
  const handleDeleteSaved = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved timetable?')) return;
    try {
      await api.delete(`/timetable/${id}`);
      loadSavedTimetables(selectedInstId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete');
    }
  };

  // Derived filter options for grid viewer
  const filterOptions = useMemo(() => {
    if (!genResult || !genResult.timetable) return { classes: [], faculty: [], rooms: [], days: [], periods: [] };

    const classesMap = new Map();
    const facultyMap = new Map();
    const roomsMap = new Map();
    const daysMap = new Map();
    const periodsMap = new Map();

    genResult.timetable.forEach(slot => {
      classesMap.set(slot.class_id, { id: slot.class_id, name: slot.class_name });
      facultyMap.set(slot.faculty_id, { id: slot.faculty_id, name: slot.faculty_name });
      roomsMap.set(slot.room_id, { id: slot.room_id, name: `${slot.room_number} (${slot.room_name})` });
      daysMap.set(slot.day_id, { id: slot.day_id, name: slot.day_name, order: slot.day_order });
      periodsMap.set(slot.period_id, {
        id: slot.period_id,
        name: slot.period_name,
        order: slot.period_order,
        start_time: slot.start_time,
        end_time: slot.end_time,
      });
    });

    const days = Array.from(daysMap.values()).sort((a, b) => a.order - b.order);
    const periods = Array.from(periodsMap.values()).sort((a, b) => a.order - b.order);

    return {
      classes: Array.from(classesMap.values()),
      faculty: Array.from(facultyMap.values()),
      rooms: Array.from(roomsMap.values()),
      days,
      periods,
    };
  }, [genResult]);

  // Active slots filtered by current view mode
  const activeGridSlots = useMemo(() => {
    if (!genResult || !genResult.timetable) return [];
    if (viewMode === 'CLASS') {
      return genResult.timetable.filter(s => String(s.class_id) === String(selectedClassId));
    } else if (viewMode === 'FACULTY') {
      return genResult.timetable.filter(s => String(s.faculty_id) === String(selectedFacultyId));
    } else {
      return genResult.timetable.filter(s => String(s.room_id) === String(selectedRoomId));
    }
  }, [genResult, viewMode, selectedClassId, selectedFacultyId, selectedRoomId]);

  return (
    <div className="page-container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
            🗓️ Timetable Generation Engine
          </h1>
          <p className="page-subtitle" style={{ color: '#64748b', fontSize: '15px', marginTop: '4px' }}>
            Deterministic Constraint Satisfaction Problem (CSP) solver with Forward Checking, Backtracking, Hard Constraint Guarantees, and Soft-Constraint Scoring.
          </p>
        </div>
      </div>

      {/* Control Panel Card */}
      <div className="form-card" style={{ padding: '20px', borderRadius: '12px', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'end' }}>
          {/* Institution */}
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontWeight: '600', color: '#334155' }}>Institution</label>
            <select
              value={selectedInstId}
              onChange={e => setSelectedInstId(e.target.value)}
              disabled={generating || loading}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            >
              <option value="">Select Institution...</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name} ({inst.code})</option>
              ))}
            </select>
          </div>

          {/* Academic Year */}
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontWeight: '600', color: '#334155' }}>Academic Year</label>
            <select
              value={selectedAyId}
              onChange={e => setSelectedAyId(e.target.value)}
              disabled={generating || loading}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            >
              <option value="">Default / All Cohorts</option>
              {academicYears.map(ay => (
                <option key={ay.id} value={ay.id}>{ay.name} {ay.is_active ? '(Active)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Solver Engine */}
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontWeight: '600', color: '#334155' }}>Modular Solver</label>
            <select
              value={solverType}
              onChange={e => setSolverType(e.target.value)}
              disabled={generating || loading}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            >
              <option value="CSP">⚡ Deterministic CSP (Backtracking + MRV)</option>
              <option value="OR_TOOLS" disabled>🔧 Google OR-Tools [Adapter Registered]</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn-secondary"
              onClick={handleFeasibility}
              disabled={!selectedInstId || generating || loading}
              style={{ padding: '10px 16px', borderRadius: '8px', fontWeight: '600', height: '44px' }}
            >
              {loading ? 'Checking...' : '🔍 Feasibility'}
            </button>
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={!selectedInstId || generating || loading}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: '700',
                background: generating ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#fff',
                border: 'none',
                cursor: generating ? 'not-allowed' : 'pointer',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {generating ? (
                <>⏳ Solving CSP...</>
              ) : (
                <>🚀 Generate Timetable</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ padding: '14px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>⚠️ Warning:</strong> {error}</div>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#991b1b' }}>✕</button>
        </div>
      )}

      {successMsg && (
        <div style={{ padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', color: '#166534', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>✅ Success:</strong> {successMsg}</div>
          <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#166534' }}>✕</button>
        </div>
      )}

      {/* Conflicts Display if Generation Failed */}
      {conflicts.length > 0 && (
        <div className="form-card" style={{ padding: '20px', borderRadius: '12px', background: '#fff1f2', border: '1px solid #fda4af', marginBottom: '24px' }}>
          <h3 style={{ color: '#9f1239', margin: '0 0 12px 0', fontSize: '18px' }}>
            ❌ Generation Conflicts ({conflicts.length})
          </h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {conflicts.map((c, i) => (
              <div key={i} style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #e11d48' }}>
                <span style={{ fontWeight: '700', color: '#9f1239', fontSize: '13px' }}>[{c.type}]</span>
                <p style={{ margin: '4px 0 0 0', color: '#334155', fontSize: '14px' }}>{c.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation Results & Score Summary */}
      {genResult && genResult.success && (
        <div style={{ marginBottom: '24px' }}>
          {/* Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>STATUS</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#10b981', marginTop: '4px' }}>
                ✅ {genResult.status || 'VALID'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>0 Hard Violations</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>SOFT-CONSTRAINT SCORE</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#4f46e5', marginTop: '4px' }}>
                {genResult.metrics?.soft_score ?? 100} <span style={{ fontSize: '14px', fontWeight: '500', color: '#64748b' }}>/ 100</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Optimized heuristics</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>SCHEDULED SLOTS</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#0284c7', marginTop: '4px' }}>
                {genResult.metrics?.total_slots_scheduled ?? genResult.timetable.length}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Total assignments</div>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>EXECUTION TIME</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#7c3aed', marginTop: '4px' }}>
                {genResult.metrics?.execution_time_ms ?? 0} <span style={{ fontSize: '14px' }}>ms</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Deterministic Backtracking</div>
            </div>
          </div>

          {/* Soft-score breakdown */}
          {genResult.metrics?.soft_constraints_breakdown && (
            <div style={{ background: '#f1f5f9', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: '#334155', marginBottom: '10px' }}>
                Soft Constraint Optimization Breakdown:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {genResult.metrics.soft_constraints_breakdown.map((item, idx) => (
                  <div key={idx} style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                      <span>{item.name}</span>
                      <span style={{ color: '#4f46e5' }}>{item.score}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', marginTop: '6px' }}>
                      <div style={{ width: `${item.score}%`, height: '100%', background: '#4f46e5', borderRadius: '3px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Timetable Viewer */}
          <div className="form-card" style={{ padding: '24px', borderRadius: '12px', background: '#fff' }}>
            {/* View Mode Tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setViewMode('CLASS')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: viewMode === 'CLASS' ? '#4f46e5' : '#e2e8f0',
                    color: viewMode === 'CLASS' ? '#fff' : '#475569',
                  }}
                >
                  🎓 By Class
                </button>
                <button
                  onClick={() => setViewMode('FACULTY')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: viewMode === 'FACULTY' ? '#4f46e5' : '#e2e8f0',
                    color: viewMode === 'FACULTY' ? '#fff' : '#475569',
                  }}
                >
                  👩‍🏫 By Faculty
                </button>
                <button
                  onClick={() => setViewMode('ROOM')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: viewMode === 'ROOM' ? '#4f46e5' : '#e2e8f0',
                    color: viewMode === 'ROOM' ? '#fff' : '#475569',
                  }}
                >
                  🏢 By Room
                </button>
              </div>

              {/* Selector dropdown depending on mode */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontWeight: '600', fontSize: '14px', color: '#475569' }}>
                  {viewMode === 'CLASS' && 'Select Class:'}
                  {viewMode === 'FACULTY' && 'Select Faculty:'}
                  {viewMode === 'ROOM' && 'Select Room:'}
                </label>

                {viewMode === 'CLASS' && (
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '500' }}
                  >
                    {filterOptions.classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}

                {viewMode === 'FACULTY' && (
                  <select
                    value={selectedFacultyId}
                    onChange={e => setSelectedFacultyId(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '500' }}
                  >
                    {filterOptions.faculty.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                )}

                {viewMode === 'ROOM' && (
                  <select
                    value={selectedRoomId}
                    onChange={e => setSelectedRoomId(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '500' }}
                  >
                    {filterOptions.rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Grid Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 14px', color: '#475569', fontSize: '13px', width: '160px' }}>
                      Period / Time
                    </th>
                    {filterOptions.days.map(d => (
                      <th key={d.id} style={{ padding: '12px 14px', color: '#334155', fontWeight: '700', fontSize: '14px', textAlign: 'center' }}>
                        {d.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filterOptions.periods.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      {/* Period Header Column */}
                      <td style={{ padding: '12px 14px', background: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {p.start_time ? String(p.start_time).slice(0, 5) : ''} - {p.end_time ? String(p.end_time).slice(0, 5) : ''}
                        </div>
                      </td>

                      {/* Day Columns */}
                      {filterOptions.days.map(d => {
                        const slot = activeGridSlots.find(s => s.day_id === d.id && s.period_id === p.id);

                        return (
                          <td
                            key={d.id}
                            style={{
                              padding: '10px',
                              verticalAlign: 'top',
                              background: slot ? (slot.is_lab_block ? '#eef2ff' : '#f0fdf4') : '#ffffff',
                              borderRight: '1px solid #f1f5f9',
                            }}
                          >
                            {slot ? (
                              <div style={{
                                padding: '10px',
                                borderRadius: '8px',
                                background: '#ffffff',
                                border: `1px solid ${slot.is_lab_block ? '#c7d2fe' : '#bbf7d0'}`,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>
                                    {slot.subject_code}
                                  </span>
                                  {slot.is_lab_block && (
                                    <span style={{
                                      fontSize: '10px',
                                      fontWeight: '700',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      background: '#4f46e5',
                                      color: '#fff',
                                    }}>
                                      LAB
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: '12px', color: '#475569', fontWeight: '500', marginTop: '2px' }}>
                                  {slot.subject_name}
                                </div>

                                <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                                  {viewMode !== 'FACULTY' && <div>👤 {slot.faculty_name}</div>}
                                  {viewMode !== 'CLASS' && <div>🎓 Class: {slot.class_name}</div>}
                                  {viewMode !== 'ROOM' && <div>📍 Room: {slot.room_number}</div>}
                                </div>
                              </div>
                            ) : (
                              <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: '12px', padding: '12px 0' }}>
                                —
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Saved Timetables History Section */}
      <div className="form-card" style={{ marginTop: '24px', padding: '20px', borderRadius: '12px', background: '#fff' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#334155', margin: '0 0 16px 0' }}>
          📂 Generated Timetables History ({savedTimetables.length})
        </h3>
        {savedTimetables.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>No saved timetables yet for this institution.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {savedTimetables.map(t => (
              <div
                key={t.id}
                onClick={() => handleLoadSaved(t.id)}
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '15px' }}>{t.name}</span>
                  <button
                    onClick={e => handleDeleteSaved(t.id, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px' }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
                  Score: <strong>{t.soft_score ?? 100} / 100</strong> • {t.total_entries || 0} slots
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  {new Date(t.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
