import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Feasibility() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Load institutions on mount
  useEffect(() => {
    api.get('/institutions')
      .then(({ data }) => {
        setInstitutions(data);
        if (data.length) setSelectedInstId(String(data[0].id));
      })
      .catch(() => setError('Failed to load institutions'));
  }, []);

  const handleCheck = async () => {
    if (!selectedInstId) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const { data } = await api.post('/timetable/feasibility-check', {
        institution_id: selectedInstId
      });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.message || 'Error running feasibility check');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ Feasibility Checker</h1>
          <p className="page-subtitle">
            Verify if a valid timetable can be generated with the current configuration.
          </p>
        </div>
      </div>

      <div className="form-card">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Institution</label>
            <select
              value={selectedInstId}
              onChange={e => setSelectedInstId(e.target.value)}
              disabled={loading}
            >
              <option value="">Select Institution...</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name} ({inst.code})</option>
              ))}
            </select>
          </div>
          <button 
            className="btn-primary" 
            onClick={handleCheck}
            disabled={!selectedInstId || loading}
            style={{ height: '42px' }}
          >
            {loading ? 'Checking...' : 'Run Feasibility Check'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-box alert-error">
          <span>{error}</span>
          <button className="btn-secondary" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {result && (
        <div className="form-card" style={{ marginTop: '20px' }}>
          <div style={{ 
            padding: '16px', 
            borderRadius: '8px', 
            background: result.feasible ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${result.feasible ? '#86efac' : '#fca5a5'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '32px' }}>
              {result.feasible ? '✅' : '❌'}
            </div>
            <div>
              <h2 style={{ color: result.feasible ? '#166534' : '#991b1b', margin: '0 0 4px 0' }}>
                {result.feasible ? 'Configuration is Feasible' : 'Configuration is Not Feasible'}
              </h2>
              <p style={{ margin: 0, color: result.feasible ? '#14532d' : '#7f1d1d' }}>
                {result.summary}
              </p>
            </div>
          </div>

          {result.issues && result.issues.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: '#991b1b', borderBottom: '1px solid #fca5a5', paddingBottom: '8px' }}>
                Critical Issues ({result.issues.length})
              </h3>
              <ul style={{ listStyleType: 'none', padding: 0 }}>
                {result.issues.map((issue, idx) => (
                  <li key={idx} style={{ 
                    padding: '12px', 
                    background: '#fef2f2', 
                    border: '1px solid #fecaca', 
                    borderRadius: '6px', 
                    marginBottom: '8px' 
                  }}>
                    <strong style={{ color: '#dc2626' }}>[{issue.type}]</strong> {issue.message}
                    {issue.class_id && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#ef4444' }}>(Class ID: {issue.class_id})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings && result.warnings.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: '#92400e', borderBottom: '1px solid #fde68a', paddingBottom: '8px' }}>
                Warnings ({result.warnings.length})
              </h3>
              <ul style={{ listStyleType: 'none', padding: 0 }}>
                {result.warnings.map((warning, idx) => (
                  <li key={idx} style={{ 
                    padding: '12px', 
                    background: '#fef3c7', 
                    border: '1px solid #fde68a', 
                    borderRadius: '6px', 
                    marginBottom: '8px' 
                  }}>
                    <strong style={{ color: '#d97706' }}>[{warning.type}]</strong> {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.suggestions && result.suggestions.length > 0 && (
            <div>
              <h3 style={{ color: '#0369a1', borderBottom: '1px solid #bae6fd', paddingBottom: '8px' }}>
                Suggestions
              </h3>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#0c4a6e' }}>
                {result.suggestions.map((sug, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>{sug}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
