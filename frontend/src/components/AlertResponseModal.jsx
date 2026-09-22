import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { offlineResponseQueue, isOnline } from '../services/offlineQueue';

const STATUS_CONFIG = {
  new: { label: 'New Alert', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  acknowledged: { label: 'Acknowledged', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  in_progress: { label: 'In Progress', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  escalated: { label: 'Escalated to Command', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  resolved: { label: 'Resolved', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
};

const ACTION_CONFIG = {
  ACKNOWLEDGE: { label: 'Acknowledge', icon: '👁️', color: '#4338ca', nextStatus: 'acknowledged' },
  CLAIM: { label: 'Claim / Dispatch', icon: '🚚', color: '#b45309', nextStatus: 'in_progress' },
  UPDATE_STATUS: { label: 'Update Status', icon: '🔄', color: '#0f766e', nextStatus: null },
  ADD_NOTE: { label: 'Add Operational Note', icon: '📝', color: '#374151', nextStatus: null },
  ESCALATE: { label: 'Escalate to Command', icon: '🚨', color: '#b91c1c', nextStatus: 'escalated' },
  RESOLVE: { label: 'Resolve Hazard', icon: '✅', color: '#047857', nextStatus: 'resolved' },
};

export default function AlertResponseModal({ alert, onClose, onResponseSuccess, onInspectIncident, notify }) {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [details, setDetails] = useState(null);
  const [history, setHistory] = useState([]);
  const [allowedActions, setAllowedActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [selectedAction, setSelectedAction] = useState('ACKNOWLEDGE');
  const [note, setNote] = useState('');
  const [customStatus, setCustomStatus] = useState('in_progress');
  const [assignedTo, setAssignedTo] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load alert details and response history
  useEffect(() => {
    if (!alert?.id) return;
    setLoading(true);
    setError('');

    api.alert(alert.id)
      .then((res) => {
        if (res.alert) {
          setDetails(res.alert);
          setHistory(res.history || []);
          setAllowedActions(res.allowedActions || []);
          if (res.allowedActions && res.allowedActions.length > 0) {
            setSelectedAction(res.allowedActions[0]);
          }
          if (res.alert.assignedTo) {
            setAssignedTo(res.alert.assignedTo);
          }
        } else {
          // Fallback to prop alert
          setDetails(alert);
          setHistory([]);
          setAllowedActions(getDefaultActionsForRole(user?.role));
        }
      })
      .catch(() => {
        // Fallback for offline or static dev
        setDetails(alert);
        setHistory([]);
        setAllowedActions(getDefaultActionsForRole(user?.role));
      })
      .finally(() => setLoading(false));
  }, [alert, user?.role]);

  function getDefaultActionsForRole(role) {
    if (role === 'official') return ['ACKNOWLEDGE', 'CLAIM', 'UPDATE_STATUS', 'ADD_NOTE', 'ESCALATE', 'RESOLVE'];
    if (role === 'logistics') return ['ACKNOWLEDGE', 'CLAIM', 'UPDATE_STATUS', 'ADD_NOTE', 'ESCALATE'];
    if (role === 'field') return ['ACKNOWLEDGE', 'ADD_NOTE', 'RESOLVE'];
    return ['ACKNOWLEDGE', 'ADD_NOTE'];
  }

  if (!alert) return null;

  const currentStatus = details?.responseStatus || alert.responseStatus || 'new';
  const statusBadge = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.new;
  const isResolved = currentStatus === 'resolved';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Determine target status
    let targetStatus = null;
    if (selectedAction === 'ACKNOWLEDGE') targetStatus = 'acknowledged';
    else if (selectedAction === 'CLAIM') targetStatus = 'in_progress';
    else if (selectedAction === 'ESCALATE') targetStatus = 'escalated';
    else if (selectedAction === 'RESOLVE') targetStatus = 'resolved';
    else if (selectedAction === 'UPDATE_STATUS') targetStatus = customStatus;

    const payload = {
      actionType: selectedAction,
      note: note.trim() || undefined,
      newStatus: targetStatus || undefined,
      assignedTo: assignedTo.trim() || (selectedAction === 'CLAIM' ? user?.name : undefined),
      clientId: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    setSubmitting(true);
    setError('');

    // Check online connectivity
    if (!isOnline()) {
      // Offline mode: queue locally
      try {
        offlineResponseQueue.add({
          alertId: alert.id,
          ...payload,
        });

        const offlineRecord = {
          id: payload.clientId,
          alertId: alert.id,
          actorName: user?.name || 'Current User',
          actorRole: user?.role || 'operator',
          actionType: selectedAction,
          previousStatus: currentStatus,
          newStatus: targetStatus || currentStatus,
          note: payload.note || '',
          assignedTo: payload.assignedTo || null,
          createdAt: new Date().toISOString(),
          isOfflineQueued: true,
        };

        setHistory((prev) => [...prev, offlineRecord]);
        setDetails((prev) => ({
          ...prev,
          responseStatus: targetStatus || prev?.responseStatus,
          latestAction: selectedAction,
          latestNote: payload.note || prev?.latestNote,
          assignedTo: payload.assignedTo || prev?.assignedTo,
        }));
        setNote('');
        notify && notify('Offline: Response action saved locally and queued for synchronization.');
        if (onResponseSuccess) {
          onResponseSuccess({
            ...details,
            responseStatus: targetStatus || currentStatus,
          });
        }
      } catch (queueErr) {
        setError('Failed to queue offline response: ' + queueErr.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await api.respondToAlert(alert.id, payload);
      if (res.response) {
        setHistory((prev) => [...prev, res.response]);
      }
      if (res.alert) {
        setDetails(res.alert);
      } else if (targetStatus) {
        setDetails((prev) => ({ ...prev, responseStatus: targetStatus }));
      }
      setNote('');
      notify && notify(
        selectedAction === 'RESOLVE'
          ? 'Hazard marked resolved. Route disruption penalties cleared.'
          : `Action recorded: ${selectedAction}`
      );
      if (onResponseSuccess) {
        onResponseSuccess(res.alert || { ...details, responseStatus: targetStatus || currentStatus });
      }
    } catch (err) {
      setError(err.message || 'Failed to submit response action');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxWidth: 620,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: isResolved ? '#ecfdf5' : '#f8fafc',
            borderBottom: `1px solid ${isResolved ? '#a7f3d0' : '#e2e8f0'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: statusBadge.bg,
                  color: statusBadge.color,
                  border: `1px solid ${statusBadge.border}`,
                }}
              >
                ● {t(`alert.status_${currentStatus}`) || statusBadge.label}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: '#f1f5f9',
                  color: '#475569',
                }}
              >
                {alert.type || 'Alert'}
              </span>
              {alert.severity && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 4,
                    color: alert.severity === 'severe' || alert.severity === 'critical' ? '#dc2626' : '#b45309',
                    background: alert.severity === 'severe' || alert.severity === 'critical' ? '#fee2e2' : '#fef3c7',
                  }}
                >
                  {alert.severity}
                </span>
              )}
            </div>
            <h3 style={{ margin: '8px 0 2px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              {alert.title}
            </h3>
            {alert.road && (
              <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
                📍 Affected Corridor: <b>{alert.road}</b>
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              padding: '0 4px',
              fontWeight: 700,
              lineHeight: 1,
            }}
            title="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Alert Description & Evidence Context */}
          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
              {alert.text}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b', flexWrap: 'wrap', gap: 6 }}>
              <span>Created: {new Date(alert.createdAt).toLocaleString()}</span>
              {alert.incidentId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#0f766e', fontWeight: 700 }}>
                    🔗 Linked Field Incident
                  </span>
                  {onInspectIncident && (
                    <button
                      type="button"
                      onClick={() => onInspectIncident(alert.incidentId)}
                      style={{
                        background: '#0f766e',
                        color: '#fff',
                        border: 0,
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      View GPS/Photo
                    </button>
                  )}
                </div>
              )}
            </div>
            {details?.assignedTo && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #cbd5e1', fontSize: 11, color: '#4338ca', fontWeight: 700 }}>
                👤 Assigned To: {details.assignedTo} {details.assignedRole ? `(${details.assignedRole})` : ''}
              </div>
            )}
          </div>

          {/* Action Formulation Form */}
          {!isResolved ? (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                  Response Action ({user?.role?.toUpperCase() || 'OPERATOR'}):
                </label>
                {!isOnline() && (
                  <span style={{ fontSize: 10, color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                    ⚡ Offline Mode — Local Queue
                  </span>
                )}
              </div>

              {/* Action Buttons / Selectors */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {allowedActions.map((action) => {
                  const cfg = ACTION_CONFIG[action] || { label: action, icon: '⚙️', color: '#475569' };
                  const isSelected = selectedAction === action;
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setSelectedAction(action)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: isSelected ? `2px solid ${cfg.color}` : '1px solid #cbd5e1',
                        background: isSelected ? `${cfg.color}15` : '#ffffff',
                        color: isSelected ? cfg.color : '#334155',
                        fontWeight: isSelected ? 800 : 600,
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{cfg.icon}</span>
                      <span>{t(`alert.action_${action.toLowerCase()}`) || cfg.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Status Selector if UPDATE_STATUS is selected */}
              {selectedAction === 'UPDATE_STATUS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Target Response Status:</label>
                  <select
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                  >
                    <option value="acknowledged">Acknowledged</option>
                    <option value="in_progress">In Progress</option>
                    <option value="escalated">Escalated</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              )}

              {/* Assignee Input if Official or Logistics */}
              {(user?.role === 'official' || user?.role === 'logistics') && (selectedAction === 'CLAIM' || selectedAction === 'UPDATE_STATUS') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Assign Personnel / Agency Unit:</label>
                  <input
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="e.g. NDRF Unit 12 / PWD Assam Quick Response / Driver Ramesh"
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                  />
                </div>
              )}

              {/* Operational Note Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Operational Note / Instructions:</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    selectedAction === 'RESOLVE'
                      ? 'Confirm hazard cleared, road restored, or safe alternate verified...'
                      : selectedAction === 'ESCALATE'
                      ? 'State reasons for escalation to Disaster Management Authority...'
                      : 'Enter response details, dispatch ETA, or clearing equipment deployed...'
                  }
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                  required={selectedAction === 'RESOLVE' || selectedAction === 'ESCALATE'}
                />
              </div>

              {/* Action Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 16px',
                  borderRadius: 6,
                  border: 0,
                  background:
                    selectedAction === 'RESOLVE'
                      ? '#059669'
                      : selectedAction === 'ESCALATE'
                      ? '#dc2626'
                      : '#1e745b',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: submitting ? 0.7 : 1,
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                }}
              >
                {submitting ? 'Executing...' : `${ACTION_CONFIG[selectedAction]?.icon || '⚡'} Confirm ${ACTION_CONFIG[selectedAction]?.label || selectedAction}`}
              </button>

              {selectedAction === 'RESOLVE' && (
                <p style={{ margin: 0, fontSize: 10, color: '#047857', textAlign: 'center', fontWeight: 600 }}>
                  💡 Resolving this alert will automatically resolve linked incidents and remove route disruption penalties.
                </p>
              )}
            </form>
          ) : (
            <div style={{ padding: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, textAlign: 'center' }}>
              <span style={{ fontSize: 16 }}>✅</span>
              <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                This hazard has been resolved. Disruption penalties are cleared across the regional routing engine.
              </p>
            </div>
          )}

          {error && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 12 }}>
              {error}
            </div>
          )}

          {/* Response Audit Trail */}
          <div style={{ marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 Response Audit Trail</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>
                {history.length} {history.length === 1 ? 'Action' : 'Actions'} Logged
              </span>
            </h4>

            {loading && history.length === 0 ? (
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Loading response history...</p>
            ) : history.length === 0 ? (
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>
                No response actions recorded yet. Alert is currently awaiting initial acknowledgement.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {history.map((h, i) => (
                  <div
                    key={h.id || i}
                    style={{
                      padding: '8px 10px',
                      background: h.actionType === 'RESOLVE' ? '#ecfdf5' : '#f8fafc',
                      borderRadius: 6,
                      border: `1px solid ${h.actionType === 'RESOLVE' ? '#a7f3d0' : '#e2e8f0'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <b style={{ color: '#0f172a' }}>{h.actorName || 'Officer'}</b>
                        <span style={{ background: '#e2e8f0', color: '#475569', padding: '1px 5px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase' }}>
                          {h.actorRole}
                        </span>
                        <span style={{ color: ACTION_CONFIG[h.actionType]?.color || '#475569', fontWeight: 800 }}>
                          [{h.actionType}]
                        </span>
                      </div>
                      <time style={{ color: '#94a3b8' }}>
                        {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>

                    {h.previousStatus && h.newStatus && h.previousStatus !== h.newStatus && (
                      <div style={{ fontSize: 10, color: '#475569' }}>
                        Status transition: <code>{h.previousStatus}</code> ➔ <b>{h.newStatus}</b>
                      </div>
                    )}

                    {h.note && (
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#334155', fontStyle: 'italic', background: '#fff', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                        "{h.note}"
                      </p>
                    )}

                    {h.assignedTo && (
                      <div style={{ fontSize: 10, color: '#0f766e', fontWeight: 600 }}>
                        Assigned: {h.assignedTo}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
