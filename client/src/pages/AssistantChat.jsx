import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

export default function AssistantChat() {
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [timetables, setTimetables] = useState([]);
  const [selectedTimetableId, setSelectedTimetableId] = useState('');
  const [timetableData, setTimetableData] = useState(null);

  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);

  // Chat conversation messages
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your AI Timetable Assistant. I can help you safely reschedule classes, swap slots, reassign faculty, or find free time slots. Every requested change is independently verified by the constraint solver before you decide to approve or reject it.',
      suggestions: [
        'Move a class to any valid slot',
        'Swap two scheduled periods',
        'Find free slots',
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef(null);

  // 1. Load Institutions
  useEffect(() => {
    api.get('/institutions')
      .then(({ data }) => {
        setInstitutions(data);
        if (data.length) setSelectedInstId(String(data[0].id));
      })
      .catch(() => {});
  }, []);

  // 2. Load Timetables when Institution changes
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

  // 3. Load Timetable details
  const refreshTimetable = (ttId) => {
    if (!ttId) return;
    api.get(`/timetable/${ttId}`)
      .then(({ data }) => setTimetableData(data))
      .catch(() => {});
  };

  useEffect(() => {
    if (selectedTimetableId) {
      refreshTimetable(selectedTimetableId);
    }
  }, [selectedTimetableId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Send Chat Message
  const handleSend = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || !selectedTimetableId || sending) return;

    // Add user message
    const userMsg = {
      id: String(Date.now()),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setSending(true);

    try {
      const { data } = await api.post('/timetable/assistant/chat', {
        timetable_id: Number(selectedTimetableId),
        message: text,
      });

      const assistantMsg = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: data.message || 'Processed your request.',
        command: data.command,
        proposal_id: data.proposal_id,
        proposal: data.proposal,
        can_apply: data.can_apply,
        violations: data.violations || (data.proposal?.violations) || [],
        available_slots: data.available_slots,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: '⚠️ ' + (err.response?.data?.message || 'Error communicating with assistant.'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  // Human Approval / Rejection
  const handleApply = async (proposalId, approved, msgId) => {
    if (!proposalId || applying) return;
    setApplying(true);

    try {
      const { data } = await api.post('/timetable/assistant/apply', {
        proposal_id: proposalId,
        approved,
      });

      // Update message status in chat
      setMessages(prev =>
        prev.map(m => {
          if (m.id === msgId) {
            return {
              ...m,
              actionStatus: approved ? 'APPROVED' : 'REJECTED',
              actionMessage: data.message,
            };
          }
          return m;
        })
      );

      // Refresh schedule if approved
      if (approved) {
        refreshTimetable(selectedTimetableId);
      }
    } catch (err) {
      alert('Action failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a' }}>
            🤖 AI Timetable Assistant
          </h1>
          <p className="page-subtitle" style={{ color: '#64748b', fontSize: '15px', marginTop: '4px' }}>
            Conversational schedule assistant with Intent & Entity Extraction, Constraint-Solver Verification, Change Previews, and Human-in-the-Loop Approval.
          </p>
        </div>
      </div>

      {/* Selectors Bar */}
      <div className="form-card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
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

      {/* Main Assistant Chat & Context Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        <div className="form-card" style={{ padding: 0, borderRadius: '12px', background: '#fff', display: 'flex', flexDirection: 'column', height: '640px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)' }}>
          {/* Chat Messages Scrollable Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc' }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '100%',
                }}
              >
                {/* Sender badge & timestamp */}
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', padding: '0 4px' }}>
                  {msg.sender === 'user' ? 'You' : 'AI Assistant'} • {msg.timestamp}
                </div>

                {/* Bubble Container */}
                <div style={{
                  maxWidth: '82%',
                  padding: '14px 18px',
                  borderRadius: msg.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: msg.sender === 'user' ? '#4f46e5' : '#ffffff',
                  color: msg.sender === 'user' ? '#ffffff' : '#1e293b',
                  boxShadow: msg.sender === 'user' ? '0 2px 4px rgba(79, 70, 229, 0.2)' : '0 2px 4px rgba(0,0,0,0.06)',
                  border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                }}>
                  {/* Message Text */}
                  <div style={{ fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {msg.text}
                  </div>

                  {/* Structured Command Tag */}
                  {msg.command && (
                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: '#e0e7ff',
                        color: '#4338ca',
                        letterSpacing: '0.5px',
                      }}>
                        INTENT: {msg.command.intent}
                      </span>
                    </div>
                  )}

                  {/* Available Slots List (if FIND_FREE_SLOTS) */}
                  {msg.available_slots && msg.available_slots.length > 0 && (
                    <div style={{ marginTop: '12px', background: '#f1f5f9', padding: '10px 14px', borderRadius: '8px' }}>
                      <div style={{ fontWeight: '700', fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                        Free Time Slots:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px' }}>
                        {msg.available_slots.map((s, idx) => (
                          <div key={idx} style={{ background: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                            <strong>{s.day}</strong>: {s.period}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Violations Warning (if conflict detected) */}
                  {msg.violations && msg.violations.length > 0 && (
                    <div style={{ marginTop: '12px', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', color: '#991b1b', fontSize: '13px' }}>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>❌ Constraint Conflicts Detected:</strong>
                      <ul style={{ margin: 0, paddingLeft: '18px' }}>
                        {msg.violations.map((v, i) => (
                          <li key={i}>{v.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Proposal Diff & Human Approval Controls */}
                  {msg.proposal && (
                    <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                      {/* Diff Box */}
                      {msg.proposal.diff && (
                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>
                            PROPOSED SCHEDULE MODIFICATION (DIFF):
                          </div>

                          {msg.proposal.diff.before && msg.proposal.diff.after && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                              <div style={{ background: '#fee2e2', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
                                <strong style={{ color: '#991b1b' }}>CURRENT:</strong>
                                <div>📅 {msg.proposal.diff.before.day_name} ({msg.proposal.diff.before.period_name})</div>
                                <div>📍 Room: {msg.proposal.diff.before.room_code}</div>
                                <div>👤 {msg.proposal.diff.before.faculty_name}</div>
                              </div>
                              <div style={{ background: '#dcfce7', padding: '8px 10px', borderRadius: '6px', border: '1px solid #86efac' }}>
                                <strong style={{ color: '#166534' }}>PROPOSED:</strong>
                                <div>📅 {msg.proposal.diff.after.day_name} ({msg.proposal.diff.after.period_name})</div>
                                <div>📍 Room: {msg.proposal.diff.after.room_code}</div>
                                <div>👤 {msg.proposal.diff.after.faculty_name}</div>
                              </div>
                            </div>
                          )}

                          {msg.proposal.soft_score && (
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                              Soft score: <strong>{msg.proposal.soft_score.before}%</strong> → <strong>{msg.proposal.soft_score.after}%</strong> ({msg.proposal.soft_score.delta >= 0 ? `+${msg.proposal.soft_score.delta}%` : `${msg.proposal.soft_score.delta}%`})
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action status if already approved/rejected */}
                      {msg.actionStatus ? (
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '700',
                          background: msg.actionStatus === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                          color: msg.actionStatus === 'APPROVED' ? '#166534' : '#991b1b',
                        }}>
                          {msg.actionStatus === 'APPROVED' ? '✅ Approved & Applied' : '❌ Proposal Rejected'}
                        </div>
                      ) : (
                        /* Interactive Approve & Reject Buttons */
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                          <button
                            onClick={() => handleApply(msg.proposal_id, true, msg.id)}
                            disabled={!msg.can_apply || applying}
                            style={{
                              flex: 1,
                              padding: '8px 14px',
                              borderRadius: '6px',
                              fontWeight: '700',
                              border: 'none',
                              background: msg.can_apply ? '#10b981' : '#94a3b8',
                              color: '#fff',
                              cursor: msg.can_apply && !applying ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {applying ? 'Applying...' : '✅ Approve & Update Database'}
                          </button>
                          <button
                            onClick={() => handleApply(msg.proposal_id, false, msg.id)}
                            disabled={applying}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '6px',
                              fontWeight: '600',
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              color: '#dc2626',
                              cursor: applying ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Suggestions Chips on Welcome Message */}
                  {msg.suggestions && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {msg.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(s)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '16px',
                            border: '1px solid #cbd5e1',
                            background: '#f1f5f9',
                            fontSize: '12px',
                            cursor: 'pointer',
                            color: '#334155',
                          }}
                        >
                          💬 "{s}"
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ alignSelf: 'flex-start', color: '#64748b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px' }}>
                <span>🤖 Parsing intent and verifying constraints...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              placeholder={selectedTimetableId ? 'Type a request (e.g. "Move Java from Monday P3 to any valid slot")...' : 'Please select an institution and timetable first...'}
              disabled={!selectedTimetableId || sending}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!selectedTimetableId || !inputMessage.trim() || sending}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                background: (!selectedTimetableId || !inputMessage.trim() || sending) ? '#94a3b8' : '#4f46e5',
                color: '#fff',
                fontWeight: '700',
                cursor: (!selectedTimetableId || !inputMessage.trim() || sending) ? 'not-allowed' : 'pointer',
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
