import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const DEFAULT_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function WorkingDays() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [days, setDays] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ institution_id:'', day_name:'', day_order:0, is_active:true });
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

  const loadDays = useCallback(async () => {
    if (!selectedInstId) { setDays([]); return; }
    try {
      setLoading(true);
      const { data } = await api.get(`/working-days?institution_id=${selectedInstId}`);
      setDays(data);
    } catch { setError('Failed to load working days'); }
    finally { setLoading(false); }
  }, [selectedInstId]);
  useEffect(() => { loadDays(); }, [loadDays]);

  const blankForm = useCallback(() => ({ institution_id: selectedInstId, day_name:'', day_order: days.length, is_active: true }), [selectedInstId, days.length]);
  const openAdd = () => { setError(''); setSuccess(''); setForm(blankForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (d) => { setError(''); setSuccess(''); setForm({ institution_id: String(d.institution_id), day_name: d.day_name, day_order: d.day_order, is_active: Boolean(d.is_active) }); setEditingId(d.id); setShowForm(true); };
  const resetForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm()); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    const order = parseInt(form.day_order, 10);
    if (isNaN(order) || order < 0) { setError('Day order must be a non-negative integer.'); return; }
    const payload = { institution_id: Number(form.institution_id), day_name: form.day_name.trim(), day_order: order, is_active: form.is_active };
    try {
      if (editingId) { await api.put(`/working-days/${editingId}`, payload); setSuccess('Working day updated.'); }
      else { await api.post('/working-days', payload); setSuccess('Working day created.'); }
      resetForm(); loadDays();
    } catch (e) { setError(e.response?.data?.message || 'Error saving working day'); }
  };

  const toggleActive = async (d) => {
    setError(''); setSuccess('');
    try { await api.put(`/working-days/${d.id}`, { is_active: !d.is_active }); setSuccess(`${d.day_name} ${d.is_active ? 'deactivated' : 'activated'}.`); loadDays(); }
    catch (e) { setError(e.response?.data?.message || 'Error updating status'); }
  };

  const handleDelete = async (d) => {
    if (!window.confirm(`Delete "${d.day_name}"?`)) return;
    setError(''); setSuccess('');
    try { await api.delete(`/working-days/${d.id}`); setSuccess(`"${d.day_name}" deleted.`); loadDays(); }
    catch (e) { setError(e.response?.data?.message || 'Error deleting working day'); }
  };

  // Quick-add all standard weekdays
  const quickAddWeekdays = async () => {
    setError(''); setSuccess('');
    const existingNames = new Set(days.map(d => d.day_name.toLowerCase()));
    const toAdd = DEFAULT_DAYS.filter(d => !existingNames.has(d.toLowerCase()));
    if (toAdd.length === 0) { setSuccess('All standard days already exist.'); return; }
    let startOrder = days.length;
    try {
      for (const d of toAdd) {
        await api.post('/working-days', { institution_id: Number(selectedInstId), day_name: d, day_order: startOrder++, is_active: true });
      }
      setSuccess(`Added ${toAdd.length} working day(s).`);
      loadDays();
    } catch (e) { setError(e.response?.data?.message || 'Error adding days'); loadDays(); }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Working Days</h1>
          <p className="page-subtitle">Configure which days of the week are working days for each institution.</p>
        </div>
        <div style={{display:'flex', gap:'10px'}}>
          {selectedInstId && <button className="btn-secondary" onClick={quickAddWeekdays}>⚡ Quick-Add Weekdays</button>}
          <button className="btn-primary" onClick={() => showForm ? resetForm() : openAdd()}>
            {showForm ? 'Cancel' : '+ Add Day'}
          </button>
        </div>
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
      </div>

      {showForm && (
        <div className="form-card">
          <h2 style={{marginBottom:'16px'}}>{editingId ? 'Edit Working Day' : 'Add Working Day'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field"><label>Institution *</label>
                <select value={form.institution_id} onChange={e => setForm({...form, institution_id: e.target.value})} required>
                  <option value="">Select Institution</option>
                  {institutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
                </select>
              </div>
              <div className="form-field"><label>Day Name *</label>
                <input type="text" placeholder="e.g. Monday" value={form.day_name} onChange={e => setForm({...form, day_name: e.target.value})} required list="day-suggestions" />
                <datalist id="day-suggestions">
                  {DEFAULT_DAYS.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div className="form-field"><label>Day Order *</label>
                <input type="number" min="0" value={form.day_order} onChange={e => setForm({...form, day_order: e.target.value})} required />
              </div>
            </div>
            <label className="checkbox-label" style={{marginBottom:'20px'}}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
              <strong>Day is Active</strong>
            </label>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create Day'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="data-table-container">
        {loading ? (
          <div className="empty-state">Loading working days...</div>
        ) : !selectedInstId ? (
          <div className="empty-state">Select an institution to view its working days.</div>
        ) : days.length === 0 ? (
          <div className="empty-state">No working days configured. Click "+ Add Day" or "⚡ Quick-Add Weekdays".</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Order</th><th>Day Name</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {days.map(d => (
                <tr key={d.id}>
                  <td><code>{d.day_order}</code></td>
                  <td><strong>{d.day_name}</strong></td>
                  <td><span className={`badge ${d.is_active ? 'badge-active' : 'badge-inactive'}`}>{d.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn-secondary" onClick={() => openEdit(d)}>Edit</button>
                      <button className={`btn-toggle ${d.is_active ? 'active' : 'inactive'}`} onClick={() => toggleActive(d)}>{d.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn-danger" onClick={() => handleDelete(d)}>Delete</button>
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
