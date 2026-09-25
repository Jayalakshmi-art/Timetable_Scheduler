import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const ROOM_TYPES = ['CLASSROOM', 'LAB', 'SEMINAR_HALL', 'OTHER'];

export default function Rooms() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [rooms, setRooms] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ institution_id:'', room_code:'', name:'', type:'CLASSROOM', capacity:30, floor:'', building:'', is_active:true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => { loadInstitutions(); }, []);
  const loadInstitutions = async () => {
    try {
      const { data } = await api.get('/institutions');
      setInstitutions(data);
      if (data.length) setSelectedInstId(String(data[0].id));
    } catch { setError('Failed to load institutions'); }
  };

  const loadRooms = useCallback(async () => {
    if (!selectedInstId) { setRooms([]); return; }
    try {
      setLoading(true);
      let url = `/rooms?institution_id=${selectedInstId}`;
      if (filterType) url += `&type=${filterType}`;
      const { data } = await api.get(url);
      setRooms(data);
    } catch { setError('Failed to load rooms'); }
    finally { setLoading(false); }
  }, [selectedInstId, filterType]);
  useEffect(() => { loadRooms(); }, [loadRooms]);

  const blankForm = useCallback(() => ({ institution_id: selectedInstId, room_code:'', name:'', type:'CLASSROOM', capacity:30, floor:'', building:'', is_active:true }), [selectedInstId]);
  const openAdd = () => { setError(''); setSuccess(''); setForm(blankForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (r) => { setError(''); setSuccess(''); setForm({ institution_id: String(r.institution_id), room_code: r.room_code, name: r.name, type: r.type, capacity: r.capacity, floor: r.floor || '', building: r.building || '', is_active: Boolean(r.is_active) }); setEditingId(r.id); setShowForm(true); };
  const resetForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm()); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    const cap = parseInt(form.capacity, 10);
    if (isNaN(cap) || cap <= 0) { setError('Capacity must be a positive integer.'); return; }
    const payload = { institution_id: Number(form.institution_id), room_code: form.room_code.trim().toUpperCase(), name: form.name.trim(), type: form.type, capacity: cap, floor: form.floor.trim() || null, building: form.building.trim() || null, is_active: form.is_active };
    try {
      if (editingId) { await api.put(`/rooms/${editingId}`, payload); setSuccess('Room updated.'); }
      else { await api.post('/rooms', payload); setSuccess('Room created.'); }
      resetForm(); loadRooms();
    } catch (e) { setError(e.response?.data?.message || 'Error saving room'); }
  };

  const toggleActive = async (r) => {
    setError(''); setSuccess('');
    try { await api.put(`/rooms/${r.id}`, { is_active: !r.is_active }); setSuccess(`${r.name} ${r.is_active ? 'deactivated' : 'activated'}.`); loadRooms(); }
    catch (e) { setError(e.response?.data?.message || 'Error updating status'); }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete room "${r.name}"?`)) return;
    setError(''); setSuccess('');
    try { await api.delete(`/rooms/${r.id}`); setSuccess(`"${r.name}" deleted.`); loadRooms(); }
    catch (e) { setError(e.response?.data?.message || 'Error deleting room'); }
  };

  const getTypeBadge = (t) => {
    switch (t) {
      case 'CLASSROOM': return 'badge-theory';
      case 'LAB': return 'badge-lab';
      case 'SEMINAR_HALL': return 'badge-tutorial';
      default: return 'badge-other';
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rooms & Labs</h1>
          <p className="page-subtitle">Manage classrooms, laboratories, seminar halls, and other spaces.</p>
        </div>
        <button className="btn-primary" onClick={() => showForm ? resetForm() : openAdd()}>
          {showForm ? 'Cancel' : '+ Add Room'}
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
        <div className="filter-group">
          <label>Room Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="form-card">
          <h2 style={{marginBottom:'16px'}}>{editingId ? 'Edit Room' : 'Add New Room'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field"><label>Institution *</label>
                <select value={form.institution_id} onChange={e => setForm({...form, institution_id: e.target.value})} required>
                  <option value="">Select Institution</option>
                  {institutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
                </select>
              </div>
              <div className="form-field"><label>Room Code *</label>
                <input type="text" placeholder="e.g. CR101" value={form.room_code} onChange={e => setForm({...form, room_code: e.target.value.toUpperCase()})} required />
              </div>
              <div className="form-field"><label>Room Name *</label>
                <input type="text" placeholder="e.g. Classroom 101" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-field"><label>Room Type *</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} required>
                  {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-field"><label>Capacity *</label>
                <input type="number" min="1" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} required />
              </div>
              <div className="form-field"><label>Building</label>
                <input type="text" placeholder="e.g. Block A" value={form.building} onChange={e => setForm({...form, building: e.target.value})} />
              </div>
              <div className="form-field"><label>Floor</label>
                <input type="text" placeholder="e.g. 2nd Floor" value={form.floor} onChange={e => setForm({...form, floor: e.target.value})} />
              </div>
            </div>
            <label className="checkbox-label" style={{marginBottom:'20px'}}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} />
              <strong>Room is Active</strong>
            </label>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create Room'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="data-table-container">
        {loading ? (
          <div className="empty-state">Loading rooms...</div>
        ) : !selectedInstId ? (
          <div className="empty-state">Select an institution to view its rooms.</div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">No rooms found. Click "+ Add Room" to create one.</div>
        ) : (
          <table className="data-table">
            <thead><tr>
              <th>Code</th><th>Name</th><th>Type</th><th>Capacity</th><th>Building</th><th>Floor</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id}>
                  <td><code>{r.room_code}</code></td>
                  <td><strong>{r.name}</strong></td>
                  <td><span className={`badge ${getTypeBadge(r.type)}`}>{r.type}</span></td>
                  <td>{r.capacity} seats</td>
                  <td>{r.building || '—'}</td>
                  <td>{r.floor || '—'}</td>
                  <td><span className={`badge ${r.is_active ? 'badge-active' : 'badge-inactive'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn-secondary" onClick={() => openEdit(r)}>Edit</button>
                      <button className={`btn-toggle ${r.is_active ? 'active' : 'inactive'}`} onClick={() => toggleActive(r)}>{r.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn-danger" onClick={() => handleDelete(r)}>Delete</button>
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
