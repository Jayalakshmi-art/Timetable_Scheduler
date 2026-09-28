import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const TYPE_COLORS = {
  HARD: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', dot: '#ef4444' },
  SOFT: { bg: '#fef3c7', color: '#92400e', border: '#fde68a', dot: '#f59e0b' },
};

const PRIORITY_LABELS = {
  1: 'Low', 2: 'Low', 3: 'Low',
  4: 'Medium', 5: 'Medium', 6: 'Medium',
  7: 'High', 8: 'High',
  9: 'Critical', 10: 'Critical',
};

function PriorityBadge({ priority }) {
  const label = PRIORITY_LABELS[priority] || 'Medium';
  const color = priority >= 9 ? '#7c3aed' : priority >= 7 ? '#2563eb' : priority >= 4 ? '#0891b2' : '#6b7280';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
      fontSize: '11px', fontWeight: 700, background: color + '22', color,
      border: `1px solid ${color}44`,
    }}>
      P{priority} {label}
    </span>
  );
}

function ConstraintCard({ constraint, onToggle, onEdit, onDelete, readOnly }) {
  const tc = TYPE_COLORS[constraint.constraint_type] || TYPE_COLORS.SOFT;
  const params = constraint.parameters || {};
  const hasParams = Object.keys(params).length > 0;

  return (
    <div style={{
      border: `1px solid ${constraint.is_enabled ? 'var(--border)' : '#e5e7eb'}`,
      borderRadius: '10px', padding: '16px 20px',
      background: constraint.is_enabled ? 'var(--bg)' : '#f9fafb',
      opacity: constraint.is_enabled ? 1 : 0.65,
      transition: 'all 0.2s',
      borderLeft: `4px solid ${constraint.is_enabled ? tc.dot : '#d1d5db'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
              fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
              background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
            }}>
              {constraint.constraint_type}
            </span>
            <PriorityBadge priority={constraint.priority} />
            {!constraint.is_enabled && (
              <span style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>disabled</span>
            )}
            <code style={{ fontSize: '11px', color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: '3px' }}>
              {constraint.constraint_key}
            </code>
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-h)', marginBottom: '4px' }}>
            {constraint.name}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: hasParams ? '8px' : 0 }}>
            {constraint.description}
          </div>
          {hasParams && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px',
            }}>
              {Object.entries(params).map(([k, v]) => (
                <span key={k} style={{
                  fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
                  background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
                }}>
                  <strong>{k}</strong>: {String(v)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => onToggle(constraint)}
            style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.2s',
              background: constraint.is_enabled ? '#fef2f2' : '#f0fdf4',
              color: constraint.is_enabled ? '#dc2626' : '#16a34a',
              border: `1px solid ${constraint.is_enabled ? '#fecaca' : '#bbf7d0'}`,
            }}
          >
            {constraint.is_enabled ? 'Disable' : 'Enable'}
          </button>
          <button className="btn-secondary" onClick={() => onEdit(constraint)} style={{ fontSize: '12px', padding: '6px 10px' }}>
            Edit
          </button>
          {constraint.constraint_type === 'SOFT' && (
            <button className="btn-danger" onClick={() => onDelete(constraint)} style={{ fontSize: '12px', padding: '6px 10px' }}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Constraints() {
  const [institutions, setInstitutions]   = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [constraints, setConstraints]     = useState([]);
  const [catalogue, setCatalogue]         = useState([]);
  const [filterType, setFilterType]       = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');
  const [loading, setLoading]             = useState(false);
  const [seeding, setSeeding]             = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [showForm, setShowForm]           = useState(false);
  const [editTarget, setEditTarget]       = useState(null);
  const [form, setForm]                   = useState({ constraint_key: '', priority: 5, is_enabled: true, parameters: '{}' });
  const [formError, setFormError]         = useState('');
  const [validating, setValidating]       = useState(false);
  const [validateResult, setValidateResult] = useState(null);

  // ── Load catalogue once ────────────────────────────────────────
  useEffect(() => {
    api.get('/constraints/catalogue').then(({ data }) => setCatalogue(data)).catch(() => {});
  }, []);

  // ── Load institutions ─────────────────────────────────────────
  useEffect(() => {
    api.get('/institutions')
      .then(({ data }) => {
        setInstitutions(data);
        if (data.length) setSelectedInstId(String(data[0].id));
      })
      .catch(() => setError('Failed to load institutions'));
  }, []);

  // ── Load constraints ──────────────────────────────────────────
  const loadConstraints = useCallback(async () => {
    if (!selectedInstId) { setConstraints([]); return; }
    try {
      setLoading(true);
      let url = `/constraints?institution_id=${selectedInstId}`;
      if (filterType) url += `&constraint_type=${filterType}`;
      const { data } = await api.get(url);
      setConstraints(data);
    } catch {
      setError('Failed to load constraints');
    } finally {
      setLoading(false);
    }
  }, [selectedInstId, filterType]);

  useEffect(() => { loadConstraints(); }, [loadConstraints]);

  // ── Seed defaults ──────────────────────────────────────────────
  const handleSeedDefaults = async () => {
    if (!selectedInstId) return;
    if (!window.confirm('Seed all default constraints for this institution? Existing ones won\'t be overwritten.')) return;
    setSeeding(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post(`/constraints/seed/${selectedInstId}`);
      setSuccess(data.message);
      loadConstraints();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to seed defaults');
    } finally {
      setSeeding(false);
    }
  };

  // ── Toggle constraint ─────────────────────────────────────────
  const handleToggle = async (c) => {
    setError(''); setSuccess('');
    try {
      const { data } = await api.patch(`/constraints/${c.id}/toggle`);
      setSuccess(`Constraint "${c.name}" ${data.is_enabled ? 'enabled' : 'disabled'}.`);
      loadConstraints();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to toggle constraint');
    }
  };

  // ── Open edit ─────────────────────────────────────────────────
  const openEdit = (c) => {
    setEditTarget(c);
    setForm({
      constraint_key: c.constraint_key,
      priority: c.priority,
      is_enabled: c.is_enabled,
      parameters: JSON.stringify(c.parameters || {}, null, 2),
    });
    setFormError(''); setValidateResult(null);
    setShowForm(true);
  };

  // ── Open add ─────────────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null);
    setForm({ constraint_key: '', priority: 5, is_enabled: true, parameters: '{}' });
    setFormError(''); setValidateResult(null);
    setShowForm(true);
  };

  // ── Validate params ───────────────────────────────────────────
  const handleValidate = async () => {
    setFormError(''); setValidateResult(null); setValidating(true);
    try {
      let parsedParams;
      try { parsedParams = JSON.parse(form.parameters); }
      catch { setFormError('Parameters must be valid JSON'); setValidating(false); return; }

      const { data } = await api.post('/constraints/validate', {
        constraint_key: form.constraint_key,
        parameters: parsedParams,
      });
      setValidateResult(data);
    } catch (e) {
      setValidateResult({ valid: false, errors: e.response?.data?.errors || [e.response?.data?.message] });
    } finally {
      setValidating(false);
    }
  };

  // ── Submit form ───────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError('');
    let parsedParams;
    try { parsedParams = JSON.parse(form.parameters); }
    catch { setFormError('Parameters must be valid JSON'); return; }

    try {
      if (editTarget) {
        await api.put(`/constraints/${editTarget.id}`, {
          priority: form.priority,
          is_enabled: form.is_enabled,
          parameters: parsedParams,
        });
        setSuccess('Constraint updated successfully.');
      } else {
        await api.post('/constraints', {
          institution_id: selectedInstId,
          constraint_key: form.constraint_key,
          is_enabled: form.is_enabled,
          priority: form.priority,
          parameters: parsedParams,
        });
        setSuccess('Constraint saved successfully.');
      }
      setShowForm(false);
      loadConstraints();
    } catch (e) {
      const msg = e.response?.data;
      if (msg?.errors) setFormError(msg.errors.join(', '));
      else setFormError(msg?.message || 'Error saving constraint');
    }
  };

  // ── Delete soft constraint ────────────────────────────────────
  const handleDelete = async (c) => {
    if (!window.confirm(`Delete soft constraint "${c.name}"?`)) return;
    setError(''); setSuccess('');
    try {
      await api.delete(`/constraints/${c.id}`);
      setSuccess(`Constraint "${c.name}" deleted.`);
      loadConstraints();
    } catch (e) {
      setError(e.response?.data?.message || 'Error deleting constraint');
    }
  };

  // ── Filter ────────────────────────────────────────────────────
  const filtered = constraints.filter(c => {
    if (filterEnabled === 'true' && !c.is_enabled) return false;
    if (filterEnabled === 'false' && c.is_enabled) return false;
    return true;
  });

  const hardCount  = filtered.filter(c => c.constraint_type === 'HARD').length;
  const softCount  = filtered.filter(c => c.constraint_type === 'SOFT').length;
  const enabledCt  = filtered.filter(c => c.is_enabled).length;

  // Selected catalogue entry (for form hint)
  const catalogueEntry = catalogue.find(c => c.constraint_key === form.constraint_key);
  const existingKeys = new Set(constraints.map(c => c.constraint_key));
  const availableKeys = catalogue.filter(c => !existingKeys.has(c.constraint_key) || editTarget?.constraint_key === c.constraint_key);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔒 Timetable Constraints</h1>
          <p className="page-subtitle">
            Configure HARD (mandatory) and SOFT (preferred) constraints for the timetable scheduler.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {selectedInstId && (
            <>
              <button className="btn-secondary" onClick={handleSeedDefaults} disabled={seeding}>
                {seeding ? '⏳ Seeding…' : '🌱 Seed Defaults'}
              </button>
              <button className="btn-primary" onClick={() => showForm ? setShowForm(false) : openAdd()}>
                {showForm ? 'Cancel' : '+ Add Constraint'}
              </button>
            </>
          )}
        </div>
      </div>

      {error   && <div className="alert-box alert-error"><span>{error}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setError('')}>✕</button></div>}
      {success && <div className="alert-box alert-success"><span>{success}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={() => setSuccess('')}>✕</button></div>}

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <div className="filter-group">
          <label>Institution</label>
          <select value={selectedInstId} onChange={e => setSelectedInstId(e.target.value)}>
            <option value="">Select Institution</option>
            {institutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            <option value="HARD">HARD only</option>
            <option value="SOFT">SOFT only</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Status</label>
          <select value={filterEnabled} onChange={e => setFilterEnabled(e.target.value)}>
            <option value="">All</option>
            <option value="true">Enabled only</option>
            <option value="false">Disabled only</option>
          </select>
        </div>
      </div>

      {/* ── Stats row ── */}
      {constraints.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: filtered.length, color: '#6366f1' },
            { label: 'HARD', value: hardCount, color: '#ef4444' },
            { label: 'SOFT', value: softCount, color: '#f59e0b' },
            { label: 'Enabled', value: enabledCt, color: '#16a34a' },
            { label: 'Disabled', value: filtered.length - enabledCt, color: '#9ca3af' },
          ].map(s => (
            <div key={s.label} style={{
              padding: '10px 16px', borderRadius: '8px', background: s.color + '15',
              border: `1px solid ${s.color}33`, minWidth: '80px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: s.color, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit form ── */}
      {showForm && (
        <div className="form-card">
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>
            {editTarget ? `Edit: ${editTarget.name}` : 'Add Constraint'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {!editTarget && (
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Constraint Key *</label>
                  <select
                    value={form.constraint_key}
                    onChange={e => {
                      const key = e.target.value;
                      const entry = catalogue.find(c => c.constraint_key === key);
                      setForm({
                        ...form,
                        constraint_key: key,
                        parameters: entry ? JSON.stringify(entry.defaultParams, null, 2) : '{}',
                        priority: entry?.constraint_type === 'HARD' ? 10 : 5,
                      });
                      setValidateResult(null);
                    }}
                    required
                  >
                    <option value="">Select a constraint key…</option>
                    <optgroup label="HARD Constraints">
                      {availableKeys.filter(c => c.constraint_type === 'HARD').map(c => (
                        <option key={c.constraint_key} value={c.constraint_key}>{c.constraint_key} — {c.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="SOFT Constraints">
                      {availableKeys.filter(c => c.constraint_type === 'SOFT').map(c => (
                        <option key={c.constraint_key} value={c.constraint_key}>{c.constraint_key} — {c.name}</option>
                      ))}
                    </optgroup>
                  </select>
                  {catalogueEntry && (
                    <div style={{
                      marginTop: '6px', fontSize: '12px', padding: '8px 12px', borderRadius: '6px',
                      background: TYPE_COLORS[catalogueEntry.constraint_type].bg,
                      color: TYPE_COLORS[catalogueEntry.constraint_type].color,
                    }}>
                      <strong>{catalogueEntry.constraint_type}</strong> — {catalogueEntry.description}
                    </div>
                  )}
                </div>
              )}

              <div className="form-field">
                <label>Priority (1–10)</label>
                <input
                  type="number" min="1" max="10"
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}
                  required
                />
                <small style={{ color: 'var(--text)', fontSize: '11px' }}>
                  HARD constraints: 10 = critical. SOFT: higher = more preferred.
                </small>
              </div>

              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <label>Status</label>
                <label className="checkbox-label" style={{ marginTop: '8px' }}>
                  <input type="checkbox" checked={form.is_enabled} onChange={e => setForm({ ...form, is_enabled: e.target.checked })} />
                  <strong>Constraint Enabled</strong>
                </label>
              </div>

              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label>Parameters (JSON)</label>
                <textarea
                  value={form.parameters}
                  onChange={e => { setForm({ ...form, parameters: e.target.value }); setValidateResult(null); }}
                  rows={5}
                  style={{
                    fontFamily: 'monospace', fontSize: '13px', padding: '10px 12px',
                    border: '1px solid var(--border)', borderRadius: '6px',
                    background: 'var(--bg)', color: 'var(--text-h)', resize: 'vertical',
                    width: '100%', boxSizing: 'border-box',
                  }}
                  spellCheck={false}
                />
                {catalogueEntry && Object.keys(catalogueEntry.defaultParams).length > 0 && (
                  <small style={{ color: 'var(--text)', fontSize: '11px' }}>
                    Default: <code>{JSON.stringify(catalogueEntry.defaultParams)}</code>
                  </small>
                )}
              </div>
            </div>

            {/* Validate result */}
            {validateResult && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
                background: validateResult.valid ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${validateResult.valid ? '#86efac' : '#fca5a5'}`,
                color: validateResult.valid ? '#166534' : '#991b1b',
              }}>
                {validateResult.valid
                  ? `✓ Valid — Resolved params: ${JSON.stringify(validateResult.resolved_parameters)}`
                  : `✗ Invalid — ${validateResult.errors?.join(', ')}`
                }
              </div>
            )}

            {formError && (
              <div className="alert-box alert-error" style={{ marginBottom: '12px' }}>{formError}</div>
            )}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditTarget(null); }}>Cancel</button>
              <button type="button" className="btn-secondary" onClick={handleValidate} disabled={validating}>
                {validating ? 'Validating…' : '🔍 Validate'}
              </button>
              <button type="submit" className="btn-primary">{editTarget ? 'Save Changes' : 'Add Constraint'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Constraint list ── */}
      {!selectedInstId ? (
        <div className="empty-state">Select an institution to view its constraints.</div>
      ) : loading ? (
        <div className="empty-state">Loading constraints…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {constraints.length === 0
            ? <>No constraints configured. Click <strong>🌱 Seed Defaults</strong> to populate all default constraints.</>
            : 'No constraints match the current filters.'
          }
        </div>
      ) : (
        <>
          {/* HARD section */}
          {filtered.filter(c => c.constraint_type === 'HARD').length > 0 && (
            <section style={{ marginBottom: '28px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
                paddingBottom: '8px', borderBottom: '2px solid #fee2e2',
              }}>
                <span style={{
                  background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
                  padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px',
                }}>🔴 HARD</span>
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                  These constraints are absolute — violations make a timetable invalid. Cannot be deleted, only disabled.
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtered.filter(c => c.constraint_type === 'HARD').map(c => (
                  <ConstraintCard key={c.id} constraint={c} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}

          {/* SOFT section */}
          {filtered.filter(c => c.constraint_type === 'SOFT').length > 0 && (
            <section>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
                paddingBottom: '8px', borderBottom: '2px solid #fef3c7',
              }}>
                <span style={{
                  background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
                  padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px',
                }}>🟡 SOFT</span>
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                  These are preferences — violations are penalized by their priority weight during scheduling.
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filtered.filter(c => c.constraint_type === 'SOFT').map(c => (
                  <ConstraintCard key={c.id} constraint={c} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
