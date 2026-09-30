import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';

export default function TimetableViewer() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [timetables, setTimetables] = useState([]);
  const [selectedTimetableId, setSelectedTimetableId] = useState('');
  const [timetableData, setTimetableData] = useState(null);

  // Filters
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedDayId, setSelectedDayId] = useState('');

  // Primary View Mode: 'CLASS' | 'FACULTY' | 'ROOM' | 'DAY'
  const [viewMode, setViewMode] = useState('CLASS');

  // Independent Validator State
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch institutions
  useEffect(() => {
    api.get('/institutions')
      .then(({ data }) => {
        setInstitutions(data);
        if (data.length) setSelectedInstId(String(data[0].id));
      })
      .catch(() => setError('Failed to load institutions'));
  }, []);

  // 2. Fetch timetables for selected institution
  useEffect(() => {
    if (!selectedInstId) {
      setTimetables([]);
      setSelectedTimetableId('');
      setTimetableData(null);
      return;
    }

    api.get(`/timetable?institution_id=${selectedInstId}`)
      .then(({ data }) => {
        setTimetables(data);
        if (data.length) {
          setSelectedTimetableId(String(data[0].id));
        } else {
          setSelectedTimetableId('');
          setTimetableData(null);
        }
      })
      .catch(() => {});
  }, [selectedInstId]);

  // 3. Fetch detailed timetable entries and topology
  useEffect(() => {
    if (!selectedTimetableId) {
      setTimetableData(null);
      setValidationResult(null);
      return;
    }

    setLoading(true);
    setError('');
    setValidationResult(null);

    api.get(`/timetable/${selectedTimetableId}`)
      .then(({ data }) => {
        setTimetableData(data);
        // Reset specific filters when switching timetable
        setSelectedDeptId('');
        setSelectedYear('');
        if (data.classes?.length) setSelectedClassId(String(data.classes[0].id));
        if (data.faculty?.length) setSelectedFacultyId(String(data.faculty[0].id));
        if (data.rooms?.length) setSelectedRoomId(String(data.rooms[0].id));
        if (data.working_days?.length) setSelectedDayId(String(data.working_days[0].id));
      })
      .catch(err => {
        setError(err.response?.data?.message || 'Error loading timetable details');
      })
      .finally(() => setLoading(false));
  }, [selectedTimetableId]);

  // 4. Independent Validation trigger
  const handleValidate = async () => {
    if (!selectedTimetableId) return;
    setValidating(true);
    setError('');
    try {
      const { data } = await api.post('/timetable/validate', {
        timetable_id: Number(selectedTimetableId),
      });
      setValidationResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Validation request failed');
    } finally {
      setValidating(false);
    }
  };

  // Filter classes based on selected department and year
  const filteredClasses = useMemo(() => {
    if (!timetableData?.classes) return [];
    return timetableData.classes.filter(c => {
      if (selectedDeptId && String(c.department_id) !== String(selectedDeptId)) return false;
      if (selectedYear && String(c.year) !== String(selectedYear)) return false;
      return true;
    });
  }, [timetableData, selectedDeptId, selectedYear]);

  // Working days and periods from backend topology
  const workingDays = useMemo(() => timetableData?.working_days || [], [timetableData]);
  const periods = useMemo(() => timetableData?.periods || [], [timetableData]);

  // Active entries filtered by current view mode and selections
  const currentEntries = useMemo(() => {
    if (!timetableData?.entries) return [];
    let list = timetableData.entries;

    if (viewMode === 'CLASS') {
      if (selectedClassId) {
        list = list.filter(e => String(e.class_id) === String(selectedClassId));
      } else if (filteredClasses.length) {
        list = list.filter(e => e.class_id === filteredClasses[0].id);
      }
    } else if (viewMode === 'FACULTY') {
      if (selectedFacultyId) {
        list = list.filter(e => String(e.faculty_id) === String(selectedFacultyId));
      }
    } else if (viewMode === 'ROOM') {
      if (selectedRoomId) {
        list = list.filter(e => String(e.room_id) === String(selectedRoomId));
      }
    } else if (viewMode === 'DAY') {
      if (selectedDayId) {
        list = list.filter(e => String(e.day_id) === String(selectedDayId));
      }
    }

    return list;
  }, [timetableData, viewMode, selectedClassId, filteredClasses, selectedFacultyId, selectedRoomId, selectedDayId]);

  return (
    <div className="page-container" style={{ maxWidth: '1320px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a' }}>
            📅 Institutional Timetable Viewer & Validator
          </h1>
          <p className="page-subtitle" style={{ color: '#64748b', fontSize: '15px', marginTop: '4px' }}>
            Multi-perspective timetable visualization (Class, Faculty, Room, Day) with break/lunch intervals and independent constraint auditing.
          </p>
        </div>

        {/* Independent Validator Button */}
        {selectedTimetableId && (
          <button
            onClick={handleValidate}
            disabled={validating || loading}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontWeight: '700',
              background: validating ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              color: '#ffffff',
              border: 'none',
              cursor: validating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
            }}
          >
            {validating ? '🛡️ Auditing Schedule...' : '🛡️ Run Independent Validation'}
          </button>
        )}
      </div>

      {/* Validation Result Banner */}
      {validationResult && (
        <div style={{
          padding: '16px 20px',
          borderRadius: '10px',
          marginBottom: '24px',
          background: validationResult.is_valid ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${validationResult.is_valid ? '#bbf7d0' : '#fecaca'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '26px' }}>{validationResult.is_valid ? '✅' : '❌'}</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: validationResult.is_valid ? '#166534' : '#991b1b', fontWeight: '800' }}>
                  {validationResult.is_valid ? 'Schedule 100% Validated' : 'Constraint Violations Detected'}
                </h3>
                <p style={{ margin: '2px 0 0 0', color: '#475569', fontSize: '14px' }}>
                  {validationResult.summary} (Total Slots Checked: {validationResult.total_slots})
                </p>
              </div>
            </div>
            <button
              onClick={() => setValidationResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
            >
              ✕
            </button>
          </div>

          {/* If violations exist, list them */}
          {validationResult.violations?.length > 0 && (
            <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
              {validationResult.violations.map((v, idx) => (
                <div key={idx} style={{ background: '#fff', padding: '10px 14px', borderRadius: '6px', borderLeft: '4px solid #ef4444', fontSize: '13px' }}>
                  <strong style={{ color: '#991b1b' }}>[{v.type}]</strong> {v.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Primary Selector Bar */}
      <div className="form-card" style={{ padding: '18px 20px', borderRadius: '12px', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {/* Institution Selector */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Institution</label>
            <select
              value={selectedInstId}
              onChange={e => setSelectedInstId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
            >
              <option value="">Select Institution...</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name} ({inst.code})</option>
              ))}
            </select>
          </div>

          {/* Timetable Selector */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Schedule Version</label>
            <select
              value={selectedTimetableId}
              onChange={e => setSelectedTimetableId(e.target.value)}
              disabled={timetables.length === 0}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}
            >
              {timetables.length === 0 ? (
                <option value="">No schedules generated yet</option>
              ) : (
                timetables.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Score: {t.soft_score ?? 100}%)
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Main Timetable Matrix View */}
      {timetableData && (
        <div className="form-card" style={{ padding: '24px', borderRadius: '12px', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)' }}>
          {/* View Mode Switcher and Context Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '18px', marginBottom: '22px' }}>
            {/* View Mode Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setViewMode('CLASS')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '7px',
                  border: 'none',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: viewMode === 'CLASS' ? '#4f46e5' : '#f1f5f9',
                  color: viewMode === 'CLASS' ? '#fff' : '#475569',
                }}
              >
                🎓 Class View
              </button>
              <button
                onClick={() => setViewMode('FACULTY')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '7px',
                  border: 'none',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: viewMode === 'FACULTY' ? '#4f46e5' : '#f1f5f9',
                  color: viewMode === 'FACULTY' ? '#fff' : '#475569',
                }}
              >
                👩‍🏫 Faculty Schedule
              </button>
              <button
                onClick={() => setViewMode('ROOM')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '7px',
                  border: 'none',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: viewMode === 'ROOM' ? '#4f46e5' : '#f1f5f9',
                  color: viewMode === 'ROOM' ? '#fff' : '#475569',
                }}
              >
                🏢 Room Occupancy
              </button>
              <button
                onClick={() => setViewMode('DAY')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '7px',
                  border: 'none',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: viewMode === 'DAY' ? '#4f46e5' : '#f1f5f9',
                  color: viewMode === 'DAY' ? '#fff' : '#475569',
                }}
              >
                📅 Day View
              </button>
            </div>

            {/* Context Filters */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Department & Year filter for Class View */}
              {viewMode === 'CLASS' && (
                <>
                  <select
                    value={selectedDeptId}
                    onChange={e => setSelectedDeptId(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="">All Departments</option>
                    {timetableData.departments?.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>

                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="">All Years</option>
                    {[1, 2, 3, 4, 5].map(y => (
                      <option key={y} value={y}>Year {y}</option>
                    ))}
                  </select>

                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                  >
                    {filteredClasses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </>
              )}

              {/* Faculty Selector */}
              {viewMode === 'FACULTY' && (
                <select
                  value={selectedFacultyId}
                  onChange={e => setSelectedFacultyId(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                >
                  {timetableData.faculty?.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.faculty_code})</option>
                  ))}
                </select>
              )}

              {/* Room Selector */}
              {viewMode === 'ROOM' && (
                <select
                  value={selectedRoomId}
                  onChange={e => setSelectedRoomId(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                >
                  {timetableData.rooms?.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.room_code} - {r.name} ({r.type}, Cap: {r.capacity})
                    </option>
                  ))}
                </select>
              )}

              {/* Day Selector for Day View */}
              {viewMode === 'DAY' && (
                <select
                  value={selectedDayId}
                  onChange={e => setSelectedDayId(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                >
                  {workingDays.map(d => (
                    <option key={d.id} value={d.id}>{d.day_name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* VIEW: Weekly Grid (CLASS, FACULTY, ROOM) */}
          {viewMode !== 'DAY' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '760px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 14px', color: '#475569', fontSize: '13px', width: '180px' }}>
                      Period / Time
                    </th>
                    {workingDays.map(d => (
                      <th key={d.id} style={{ padding: '12px 14px', color: '#1e293b', fontWeight: '700', fontSize: '14px', textAlign: 'center' }}>
                        {d.day_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map(p => {
                    const isBreakOrLunch = p.is_break || p.is_lunch;

                    // If it's a break or lunch period, render full-row break banner
                    if (isBreakOrLunch) {
                      return (
                        <tr key={p.id} style={{ background: p.is_lunch ? '#fffbeb' : '#f0fdf4', borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 14px', borderRight: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: '700', color: p.is_lunch ? '#b45309' : '#15803d', fontSize: '13px' }}>
                              {p.is_lunch ? '🍽️ ' : '☕ '} {p.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {String(p.start_time).slice(0, 5)} - {String(p.end_time).slice(0, 5)}
                            </div>
                          </td>
                          <td
                            colSpan={workingDays.length}
                            style={{
                              textAlign: 'center',
                              fontWeight: '700',
                              letterSpacing: '1px',
                              fontSize: '12px',
                              color: p.is_lunch ? '#b45309' : '#15803d',
                              textTransform: 'uppercase',
                              padding: '10px',
                            }}
                          >
                            — {p.is_lunch ? 'Institutional Lunch Break' : 'Interval Break'} —
                          </td>
                        </tr>
                      );
                    }

                    // Normal teaching period row
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 14px', background: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
                          <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>{p.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {String(p.start_time).slice(0, 5)} - {String(p.end_time).slice(0, 5)}
                          </div>
                        </td>

                        {workingDays.map(d => {
                          const slot = currentEntries.find(e => e.day_id === d.id && e.period_id === p.id);

                          return (
                            <td
                              key={d.id}
                              style={{
                                padding: '10px',
                                verticalAlign: 'top',
                                background: slot ? (slot.requires_lab || slot.subject_type === 'LAB' ? '#eef2ff' : '#f0fdf4') : '#ffffff',
                                borderRight: '1px solid #f1f5f9',
                              }}
                            >
                              {slot ? (
                                <div style={{
                                  padding: '10px',
                                  borderRadius: '8px',
                                  background: '#ffffff',
                                  border: `1px solid ${slot.requires_lab || slot.subject_type === 'LAB' ? '#c7d2fe' : '#bbf7d0'}`,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '14px' }}>
                                      {slot.subject_code}
                                    </span>
                                    {(slot.requires_lab || slot.subject_type === 'LAB') && (
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

                                  <div style={{ fontSize: '12px', color: '#475569', fontWeight: '600', marginTop: '2px' }}>
                                    {slot.subject_name}
                                  </div>

                                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {viewMode !== 'FACULTY' && <div>👤 <strong>Faculty:</strong> {slot.faculty_name}</div>}
                                    {viewMode !== 'CLASS' && <div>🎓 <strong>Class:</strong> {slot.class_name}</div>}
                                    {viewMode !== 'ROOM' && <div>📍 <strong>Room:</strong> {slot.room_code} ({slot.room_name})</div>}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: '12px', padding: '14px 0' }}>
                                  —
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW: DAY VIEW (All classes/rooms on a specific day) */}
          {viewMode === 'DAY' && (
            <div>
              <div style={{ marginBottom: '16px', fontWeight: '700', color: '#334155', fontSize: '16px' }}>
                All Scheduled Classes on {workingDays.find(d => String(d.id) === String(selectedDayId))?.day_name}:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
                {periods.map(p => {
                  const daySlots = currentEntries.filter(e => e.period_id === p.id);
                  const isBreakOrLunch = p.is_break || p.is_lunch;

                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: `1px solid ${isBreakOrLunch ? '#fed7aa' : '#e2e8f0'}`,
                        background: isBreakOrLunch ? '#fff7ed' : '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px' }}>
                        <span style={{ fontWeight: '800', color: '#1e293b' }}>{p.name}</span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          {String(p.start_time).slice(0, 5)} - {String(p.end_time).slice(0, 5)}
                        </span>
                      </div>

                      {isBreakOrLunch ? (
                        <div style={{ textAlign: 'center', color: '#c2410c', fontWeight: '700', fontSize: '13px', padding: '10px 0' }}>
                          {p.is_lunch ? '🍽️ Lunch Break' : '☕ Recess Break'}
                        </div>
                      ) : daySlots.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
                          No classes scheduled
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {daySlots.map(s => (
                            <div key={s.entry_id} style={{ padding: '8px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong style={{ color: '#1e293b' }}>{s.subject_code} - {s.subject_name}</strong>
                                <span style={{ fontSize: '11px', color: '#4f46e5', fontWeight: '700' }}>{s.class_name}</span>
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                👤 {s.faculty_name} | 📍 Room {s.room_code}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
