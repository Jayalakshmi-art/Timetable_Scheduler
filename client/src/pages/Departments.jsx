import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Departments() {
  const [institutions, setInstitutions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [institutionId, setInstitutionId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const loadInstitutions = async () => {
    const { data } = await api.get('/institutions');
    setInstitutions(data);
  };

  const loadDepartments = async (instId) => {
    const { data } = await api.get(`/departments?institution_id=${instId}`);
    setDepartments(data);
  };

  useEffect(() => { loadInstitutions(); }, []);

  useEffect(() => {
    if (institutionId) loadDepartments(institutionId);
    else setDepartments([]);
  }, [institutionId]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/departments', { institution_id: institutionId, name, code });
      setName(''); setCode('');
      loadDepartments(institutionId);
    } catch (e) {
      setError(e.response?.data?.message || 'Error creating department');
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/departments/${id}`);
      loadDepartments(institutionId);
    } catch (e) {
      alert(e.response?.data?.message || 'Error deleting');
    }
  };

  return (
    <div>
      <h2>Departments</h2>
      <select value={institutionId} onChange={e => setInstitutionId(e.target.value)}>
        <option value="">Select Institution</option>
        {institutions.map(inst => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
      </select>
      
      {institutionId && (
        <>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <form onSubmit={create}>
            <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
            <input placeholder="Code" value={code} onChange={e => setCode(e.target.value)} required />
            <button type="submit">Add Department</button>
          </form>
          <ul>
            {departments.map(dept => (
              <li key={dept.id}>
                {dept.name} ({dept.code}) 
                <button onClick={() => remove(dept.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
