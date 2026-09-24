import { useState, useEffect } from 'react';
import api from '../services/api';

export default function AcademicYears() {
  const [institutions, setInstitutions] = useState([]);
  const [years, setYears] = useState([]);
  const [institutionId, setInstitutionId] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState('');

  const loadInstitutions = async () => {
    const { data } = await api.get('/institutions');
    setInstitutions(data);
  };

  const loadYears = async (instId) => {
    const { data } = await api.get(`/academic-years?institution_id=${instId}`);
    setYears(data);
  };

  useEffect(() => { loadInstitutions(); }, []);

  useEffect(() => {
    if (institutionId) loadYears(institutionId);
    else setYears([]);
  }, [institutionId]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/academic-years', { institution_id: institutionId, name, start_date: startDate, end_date: endDate, is_active: isActive });
      setName(''); setStartDate(''); setEndDate(''); setIsActive(false);
      loadYears(institutionId);
    } catch (e) {
      setError(e.response?.data?.message || 'Error creating academic year');
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/academic-years/${id}`);
      loadYears(institutionId);
    } catch (e) {
      alert(e.response?.data?.message || 'Error deleting');
    }
  };

  return (
    <div>
      <h2>Academic Years</h2>
      <select value={institutionId} onChange={e => setInstitutionId(e.target.value)}>
        <option value="">Select Institution</option>
        {institutions.map(inst => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
      </select>
      
      {institutionId && (
        <>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <form onSubmit={create}>
            <input placeholder="Name (e.g. 2023-2024)" value={name} onChange={e => setName(e.target.value)} required />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            <label>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              Is Active
            </label>
            <button type="submit">Add Academic Year</button>
          </form>
          <ul>
            {years.map(year => (
              <li key={year.id}>
                {year.name} ({year.start_date?.slice(0,10)} to {year.end_date?.slice(0,10)}) - {year.is_active ? 'Active' : 'Inactive'}
                <button onClick={() => remove(year.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
