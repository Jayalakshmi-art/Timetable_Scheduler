import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const ENTITY_TYPES = [
  { key: 'faculty', label: '👩‍🏫 Faculty', color: '#6366f1' },
  { key: 'class',   label: '📚 Classes',  color: '#0891b2' },
  { key: 'room',    label: '🏢 Rooms',    color: '#059669' },
];

export default function Availability() {
  const [institutions, setInstitutions]   = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [entityType, setEntityType]       = useState('faculty');
  const [entities, setEntities]           = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [workingDays, setWorkingDays]     = useState([]);
  const [periods, setPeriods]             = useState([]);
  const [availability, setAvailability]   = useState({});  // { "dayId_periodId": { id, is_available, reason } }
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [reasonModal, setReasonModal]     = useState(null); // { dayId, periodId, reason }

  // ── Load institutions ────────────────────────────────────────────
  useEffect(() => {
    api.get('/institutions')
      .then(({ data }) => {
        setInstitutions(data);
        if (data.length) setSelectedInstId(String(data[0].id));
      })
      .catch(() => setError('Failed to load institutions'));
  }, []);

  // ── Load entities (faculty/class/room) when inst or type changes ─
  useEffect(() => {
    setSelectedEntityId('');
    setEntities([]);
    setAvailability({});
    if (!selectedInstId) return;

    const fetchEntities = async () => {
      try {
        if (entityType === 'faculty') {
          // Faculty is per department; get all departments for this institution, then faculty
          const { data: depts } = await api.get(`/departments?institution_id=${selectedInstId}`);
          const results = [];
          for (const d of depts) {
            const { data: facs } = await api.get(`/faculty?department_id=${d.id}&is_active=true`);
            facs.forEach(f => results.push({ ...f, label: `${f.name} (${f.faculty_code}) — ${d.name}` }));
          }
          setEntities(results);
        } else if (entityType === 'class') {
          const { data: depts } = await api.get(`/departments?institution_id=${selectedInstId}`);
          const { data: years } = await api.get(`/academic-years?institution_id=${selectedInstId}`);
          const results = [];
          for (const d of depts) {
            for (const y of years) {
              const { data: cls } = await api.get(`/classes?department_id=${d.id}&academic_year_id=${y.id}&is_active=true`);
              cls.forEach(c => results.push({ ...c, label: `${c.name} — ${d.name} (${y.name})` }));
            }
          }
          setEntities(results);
        } else {
          const { data: rooms } = await api.get(`/rooms?institution_id=${selectedInstId}&is_active=true`);
          setEntities(rooms.map(r => ({ ...r, label: `${r.room_code} — ${r.name} (${r.type})` })));
        }
      } catch {
        setError('Failed to load entities');
      }
    };
    fetchEntities();
  }, [selectedInstId, entityType]);

  // ── Load working days + periods for selected institution ─────────
  useEffect(() => {
    if (!selectedInstId) return;
    Promise.all([
      api.get(`/working-days?institution_id=${selectedInstId}`),
      api.get(`/periods?institution_id=${selectedInstId}`),
    ]).then(([dRes, pRes]) => {
      setWorkingDays(dRes.data.filter(d => d.is_active).sort((a, b) => a.day_order - b.day_order));
      setPeriods(pRes.data.filter(p => !p.is_break && !p.is_lunch).sort((a, b) => a.period_order - b.period_order));
    }).catch(() => setError('Failed to load schedule grid'));
  }, [selectedInstId]);

  // ── Load existing availability when entity is selected ───────────
  const loadAvailability = useCallback(async () => {
    if (!selectedEntityId || !selectedInstId) return;
    try {
      setLoading(true);
      const { data } = await api.get(
        `/availability/${entityType}?${entityType}_id=${selectedEntityId}&institution_id=${selectedInstId}`
      );
      const map = {};
      data.forEach(r => {
        map[`${r.working_day_id}_${r.period_id}`] = {
          id: r.id,
          is_available: r.is_available,
          reason: r.reason || '',
        };
      });
      setAvailability(map);
    } catch {
      setError('Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [selectedEntityId, selectedInstId, entityType]);

  useEffect(() => {
    setAvailability({});
    loadAvailability();
  }, [loadAvailability]);

  // ── Toggle a cell ────────────────────────────────────────────────
  const toggleCell = (dayId, periodId) => {
    const key = `${dayId}_${periodId}`;
    setAvailability(prev => {
      const existing = prev[key];
      // If unavailable (marked) → remove marking (available by default = not in table)
      if (existing) {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      }
      // Mark as unavailable
      return { ...prev, [key]: { id: null, is_available: false, reason: '' } };
    });
  };

  // ── Open reason modal for a blocked cell ────────────────────────
  const openReason = (dayId, periodId) => {
    const key = `${dayId}_${periodId}`;
    const existing = availability[key] || {};
    setReasonModal({ dayId, periodId, reason: existing.reason || '' });
  };

  const saveReason = () => {
    const { dayId, periodId, reason } = reasonModal;
    const key = `${dayId}_${periodId}`;
    setAvailability(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { id: null, is_available: false }), reason },
    }));
    setReasonModal(null);
  };

  // ── Save to backend ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedEntityId) return;
    setError(''); setSuccess(''); setSaving(true);

    const slots = [];
    for (const wd of workingDays) {
      for (const p of periods) {
        const key = `${wd.id}_${p.id}`;
        if (availability[key]) {
          slots.push({
            working_day_id: wd.id,
            period_id: p.id,
            is_available: false,
            reason: availability[key].reason || null,
          });
        }
      }
    }

    try {
      const entityIdKey = entityType === 'faculty' ? 'faculty_id' : entityType === 'class' ? 'class_id' : 'room_id';
      await api.post(`/availability/${entityType}/bulk`, {
        [entityIdKey]: Number(selectedEntityId),
        slots,
      });

      // Also clear slots that were removed (not in current availability)
      // Strategy: clear all then re-set. Let's do a clear + bulk
      // Actually the bulk endpoint uses ON DUPLICATE KEY UPDATE, so old slots that
      // aren't in the new list remain. We need to clear then re-add.
      // => clear first, then bulk insert
      const clearKey = entityType === 'faculty' ? 'faculty_id' : entityType === 'class' ? 'class_id' : 'room_id';
      await api.delete(`/availability/${entityType}/clear/${selectedEntityId}`);

      if (slots.length > 0) {
        await api.post(`/availability/${entityType}/bulk`, {
          [clearKey]: Number(selectedEntityId),
          slots,
        });
      }

      setSuccess(`Availability saved — ${slots.length} blocked slot(s) recorded.`);
      loadAvailability();
    } catch (e) {
      setError(e.response?.data?.message || 'Error saving availability');
    } finally {
      setSaving(false);
    }
  };

  // ── Clear all slots ──────────────────────────────────────────────
  const handleClearAll = async () => {
    if (!selectedEntityId) return;
    if (!window.confirm('Clear all unavailability records for this entity?')) return;
    try {
      await api.delete(`/availability/${entityType}/clear/${selectedEntityId}`);
      setAvailability({});
      setSuccess('All availability records cleared.');
    } catch (e) {
      setError(e.response?.data?.message || 'Error clearing records');
    }
  };

  const blockedCount = Object.keys(availability).length;
  const selectedEntity = entities.find(e => String(e.id) === selectedEntityId);
  const currentColor = ENTITY_TYPES.find(e => e.key === entityType)?.color || '#6366f1';

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">⏰ Availability Configuration</h1>
          <p className="page-subtitle">
            Mark unavailable slots for faculty, classes, and rooms. Blocked slots are enforced as hard constraints.
          </p>
        </div>
        {selectedEntityId && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={handleClearAll}>🗑 Clear All</button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{ background: currentColor }}
            >
              {saving ? 'Saving…' : `💾 Save (${blockedCount} blocked)`}
            </button>
          </div>
        )}
      </div>

      {error   && <div className="alert-box alert-error"><span>{error}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setError('')}>✕</button></div>}
      {success && <div className="alert-box alert-success"><span>{success}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setSuccess('')}>✕</button></div>}

      {/* ── Filter bar ── */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="filter-group">
          <label>Institution</label>
          <select value={selectedInstId} onChange={e => setSelectedInstId(e.target.value)}>
            <option value="">Select Institution</option>
            {institutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Entity Type</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {ENTITY_TYPES.map(e => (
              <button
                key={e.key}
                onClick={() => setEntityType(e.key)}
                style={{
                  padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
                  background: entityType === e.key ? e.color : 'var(--code-bg)',
                  color: entityType === e.key ? '#fff' : 'var(--text-h)',
                  boxShadow: entityType === e.key ? `0 2px 8px ${e.color}66` : 'none',
                }}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group" style={{ minWidth: '260px', flex: 2 }}>
          <label>{ENTITY_TYPES.find(e => e.key === entityType)?.label.replace(/[^a-zA-Z ]/g, '').trim()}</label>
          <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)}>
            <option value="">Select {entityType}…</option>
            {entities.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: '#dcfce7', border: '1px solid #86efac' }} />
          <span>Available (default)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: '#fee2e2', border: '1px solid #fca5a5' }} />
          <span>Unavailable (blocked)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: '#fef3c7', border: '1px solid #fde68a' }} />
          <span>Blocked with reason (right-click to edit)</span>
        </div>
      </div>

      {/* ── Grid ── */}
      {!selectedInstId ? (
        <div className="empty-state">Select an institution to configure availability.</div>
      ) : !selectedEntityId ? (
        <div className="empty-state">Select a {entityType} to view and edit its availability grid.</div>
      ) : loading ? (
        <div className="empty-state">Loading availability grid…</div>
      ) : workingDays.length === 0 || periods.length === 0 ? (
        <div className="empty-state">
          No working days or periods configured for this institution.
          <br />
          <small>Set up working days and periods in Phase 5 first.</small>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text)' }}>
            Editing availability for <strong>{selectedEntity?.label || selectedEntity?.name || selectedEntityId}</strong>
            {' '}— Click a cell to toggle · Right-click to add a reason
          </div>
          <div className="avail-grid-wrapper">
            <table className="avail-grid">
              <thead>
                <tr>
                  <th className="avail-corner">Day \ Period</th>
                  {periods.map(p => (
                    <th key={p.id} className="avail-period-header">
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: '10px', fontWeight: 400, opacity: 0.7 }}>
                        {p.start_time?.substring(0, 5)}–{p.end_time?.substring(0, 5)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workingDays.map(wd => (
                  <tr key={wd.id}>
                    <td className="avail-day-label">{wd.day_name}</td>
                    {periods.map(p => {
                      const key = `${wd.id}_${p.id}`;
                      const slot = availability[key];
                      const isBlocked = !!slot;
                      const hasReason = isBlocked && slot.reason;
                      return (
                        <td
                          key={p.id}
                          className={`avail-cell ${isBlocked ? (hasReason ? 'avail-blocked-reason' : 'avail-blocked') : 'avail-free'}`}
                          onClick={() => toggleCell(wd.id, p.id)}
                          onContextMenu={e => { e.preventDefault(); if (isBlocked) openReason(wd.id, p.id); }}
                          title={isBlocked ? (hasReason ? `Reason: ${slot.reason}` : 'Click to unblock · Right-click to add reason') : 'Click to block'}
                        >
                          {isBlocked ? (hasReason ? '📝' : '✕') : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text)', textAlign: 'right' }}>
            {blockedCount} slot(s) blocked · Click Save to persist changes
          </div>
        </div>
      )}

      {/* ── Reason Modal ── */}
      {reasonModal && (
        <div className="modal-overlay" onClick={() => setReasonModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>Add Reason for Unavailability</h3>
            <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '12px' }}>
              {workingDays.find(d => d.id === reasonModal.dayId)?.day_name}
              {' — '}
              {periods.find(p => p.id === reasonModal.periodId)?.name}
            </div>
            <textarea
              autoFocus
              value={reasonModal.reason}
              onChange={e => setReasonModal({ ...reasonModal, reason: e.target.value })}
              placeholder="e.g. Department meeting, Holiday, Lab maintenance…"
              style={{
                width: '100%', height: '80px', padding: '8px 12px', borderRadius: '6px',
                border: '1px solid var(--border)', fontSize: '13px', resize: 'vertical',
                background: 'var(--bg)', color: 'var(--text-h)', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="btn-secondary" onClick={() => setReasonModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveReason}>Save Reason</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
