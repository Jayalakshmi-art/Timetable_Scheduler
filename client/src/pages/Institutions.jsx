import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Institutions() {
  const [institutions, setInstitutions] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/institutions');
      setInstitutions(data);
    } catch (e) {
      setError('Failed to load institutions');
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/institutions', { name, code });
      setName(''); setCode('');
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Error creating institution');
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/institutions/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'Error deleting');
    }
  };

  return (
    <div>
      <h2>Institutions</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={create}>
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={e => setCode(e.target.value)} required />
        <button type="submit">Add Institution</button>
      </form>
      <ul>
        {institutions.map(inst => (
          <li key={inst.id}>
            {inst.name} ({inst.code}) 
            <button onClick={() => remove(inst.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
