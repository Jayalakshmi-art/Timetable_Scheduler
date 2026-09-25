import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function Periods() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [periods, setPeriods] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ institution_id:'', name:'', start_time:'', end_time:'', period_order:0, is_break:false, is_lunch:false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadInstitutions(); }, []);
  const loadInstitutions = async () => {
    try {
      const { data } = await api.get('/institutions');
      setInstitutions(data);
      if (data.length) setSelectedInstId(String(data[0].id));
    } catch { setError('Failed to load institutions'); }
  };

  const loadPeriods = useCallback(async () => {
    if (!selectedInstId) { setPeriods([]); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/periods?institution_id=${selectedInstId}`);
      setPeriods(data);
    } catch { setError('Failed to load periods'); }
    finally { setLoading(false); }
  }, [selectedInstId]);
  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const blankForm = useCallback(() => ({ institution_id: selectedInstId, name:'', start_time:'', end_time:'', period_order: periods.length, is_break:false, is_lunch:false }), [selectedInstId, periods.length]);
  const openAdd = () => { setError(''); setSuccess(''); setForm(blankForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (p) => {
    setError(''); setSuccess('');
    // Format time for input (HH:MM)
    const fmtTime = (t) => { const s = String(t); return s.length > 5 ? s.substring(0,5) : s; };
    setForm({ institution_id: String(p.institution_id), name: p.name, start_time: fmtTime(p.start_time), end_time: fmtTime(p.end_time), period_order: p.period_order, is_break: Boolean(p.is_break), is_lunch: Boolean(p.is_lunch) });
    setEditingId(p.id);
    setShowForm(true);
  };
  const resetForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm()); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    const order = parseInt(form.period_order, 10);
    if (isNaN(order) || order < 0) { setError('Period order must be a non-negative integer.'); return; }
    if (!form.start_time || !form.end_time) { setError('Start time and end time are required.'); return; }
    if (form.end_time <= form.start_time) { setError('End time must be after start time.'); return; }

    const payload = {
      institution_id: Number(form.institution_id), name: form.name.trim(),
      start_time: form.start_time, end_time: form.end_time,
      period_order: order, is_break: form.is_break, is_lunch: form.is_lunch,
    };
    try {
      if (editingId) { await api.put(`/periods/${editingId}`, payload); setSuccess('Period updated.'); }
      else { await api.post('/periods', payload); setSuccess('Period created.'); }
      resetForm(); loadPeriods();
    } catch (e) { setError(e.response?.data?.message || 'Error saving period'); }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete period "${p.name}"?`)) return;
    setError(''); setSuccess('');
    try { await api.delete(`/periods/${p.id}`); setSuccess(`"${p.name}" deleted.`); loadPeriods(); }
    catch (e) { setError(e.response?.data?.message || 'Error deleting period'); }
  };

  const fmtTime = (t) => { const s = String(t); return s.length > 5 ? s.substring(0,5) : s; };

  const teachingPeriods = periods.filter(p => !p.is_break && !p.is_lunch);
  const breakPeriods = periods.filter(p => p.is_break || p.is_lunch);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Period Configuration</h1>
          <p className="page-subtitle">Define daily time slots, breaks, and lunch periods for the institution's schedule.</p>
        </div>
        <button className="btn-primary" onClick={() => showForm ? resetForm() : openAdd()}>
          {showForm ? 'Cancel' : '+ Add Period'}
        </button>
      </div>

      {error && <div className="alert-box alert-error"><span>{error}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={()=>setError('')}>✕</button></div>}
      {success && <div className="alert-box alert-success"><span>{success}</span><button className="btn-secondary" style={{padding:'2px 8px'}} onClick={()=>setSuccess('')}>✕</button></div>}

      <div className="filter-bar">
        <div className="filter-group">
          <label>Institution</label>
          <select value={selectedInstId} onChange={e => setSelectedInstId(e.target.value)}>
            <option value="">Select Institution</option>
            {institutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
          </select>
        </div>
        {selectedInstId && (
          <div style={{display:'flex', gap:'24px', alignItems:'center', marginLeft:'auto'}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'12px', color:'var(--text)', textTransform:'uppercase'}}>Teaching</div>
              <strong style={{fontSize:'20px', color:'#6366f1'}}>{teachingPeriods.length}</strong>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'12px', color:'var(--text)', textTransform:'uppercase'}}>Breaks</div>
              <strong style={{fontSize:'20px', color:'#f59e0b'}}>{breakPeriods.length}</strong>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'12px', color:'var(--text)', textTransform:'uppercase'}}>Total</div>
              <strong style={{fontSize:'20px', color:'var(--text-h)'}}>{periods.length}</strong>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="form-card">
          <h2 style={{marginBottom:'16px'}}>{editingId ? 'Edit Period' : 'Add New Period'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field"><label>Institution *</label>
                <select value={form.institution_id} onChange={e => setForm({...form, institution_id: e.target.value})} required>
                  <option value="">Select Institution</option>
                  {institutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
                </select>
              </div>
              <div className="form-field"><label>Period Name *</label>
                <input type="text" placeholder="e.g. Period 1 or Morning Break" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-field"><label>Start Time *</label>
                <input type="time" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} required />
              </div>
              <div className="form-field"><label>End Time *</label>
                <input type="time" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} required />
              </div>
              <div className="form-field"><label>Period Order *</label>
                <input type="number" min="0" value={form.period_order} onChange={e => setForm({...form, period_order: e.target.value})} required />
              </div>
            </div>
            <div style={{display:'flex', gap:'24px', marginBottom:'20px'}}>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.is_break} onChange={e => setForm({...form, is_break: e.target.checked, is_lunch: e.target.checked ? false : form.is_lunch})} />
                <strong>☕ Break Period</strong>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.is_lunch} onChange={e => setForm({...form, is_lunch: e.target.checked, is_break: e.target.checked ? false : form.is_break})} />
                <strong>🍽️ Lunch Period</strong>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create Period'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="data-table-container">
        {loading ? (
          <div className="empty-state">Loading periods...</div>
        ) : !selectedInstId ? (
          <div className="empty-state">Select an institution to configure its period schedule.</div>
        ) : periods.length === 0 ? (
          <div className="empty-state">No periods configured. Click "+ Add Period" to define the daily schedule.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Order</th><th>Name</th><th>Start</th><th>End</th><th>Duration</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>
              {periods.map(p => {
                const startMin = parseInt(String(p.start_time).split(':')[0])*60 + parseInt(String(p.start_time).split(':')[1]);
                const endMin = parseInt(String(p.end_time).split(':')[0])*60 + parseInt(String(p.end_time).split(':')[1]);
                const dur = endMin - startMin;
                return (
                  <tr key={p.id} style={p.is_break || p.is_lunch ? {background:'rgba(245,158,11,0.06)'} : {}}>
                    <td><code>{p.period_order}</code></td>
                    <td><strong>{p.name}</strong></td>
                    <td>{fmtTime(p.start_time)}</td>
                    <td>{fmtTime(p.end_time)}</td>
                    <td>{dur} min</td>
                    <td>
                      {p.is_lunch ? <span className="badge badge-tutorial">🍽️ LUNCH</span>
                       : p.is_break ? <span className="badge badge-other">☕ BREAK</span>
                       : <span className="badge badge-theory">📚 TEACHING</span>}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <button className="btn-secondary" onClick={() => openEdit(p)}>Edit</button>
                        <button className="btn-danger" onClick={() => handleDelete(p)}>Delete</button>
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
