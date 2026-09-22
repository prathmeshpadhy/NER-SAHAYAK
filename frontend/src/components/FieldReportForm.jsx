import { useEffect, useState } from 'react';
import api from '../services/api';
import { offlineQueue, isOnline } from '../services/offlineQueue';
import { compressImage, validateImageFile } from '../utils/imageCompressor';
import { acquireGpsPosition } from '../services/gpsHelper';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../context/AuthContext';
import IncidentDetailModal from './IncidentDetailModal';

const CATEGORIES = [
  { id: 'road_block', label: 'Road blocked / Obstruction' },
  { id: 'landslide', label: 'Landslide' },
  { id: 'flood', label: 'Flooding' },
  { id: 'bridge_damage', label: 'Bridge damage' },
  { id: 'accident', label: 'Accident' },
  { id: 'vehicle_breakdown', label: 'Vehicle breakdown' },
  { id: 'traffic', label: 'Heavy traffic' },
  { id: 'poor_road_condition', label: 'Poor road condition' },
  { id: 'other', label: 'Other hazard' },
];

const SEVERITIES = ['minor', 'moderate', 'major', 'critical'];

export default function FieldReportForm({ notify }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'form'
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingReport, setInspectingReport] = useState(null);

  const [nodes, setNodes] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    category: 'road_block',
    severity: 'moderate',
    title: '',
    description: '',
    road: '',
    fromNode: '',
    toNode: '',
    affectedMode: 'road',
    estimatedDelayMinutes: '45',
  });
  const [coords, setCoords] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(offlineQueue.count());
  const [queueItems, setQueueItems] = useState(offlineQueue.all());
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [networkStatus, setNetworkStatus] = useState(isOnline() ? 'online' : 'offline');

  const load = () => {
    setLoading(true);
    Promise.all([api.nodes(), api.reports()])
      .then(([nodesRes, reportsRes]) => {
        if (nodesRes.nodes) setNodes(nodesRes.nodes);
        if (reportsRes.reports) setAllReports(reportsRes.reports);
        setError('');
      })
      .catch((err) => setError(err.message || 'Unable to load incident reports.'))
      .finally(() => setLoading(false));
  };

  const syncNow = async () => {
    if (busy) return;
    setBusy(true);
    setNetworkStatus('syncing');
    try {
      const res = await offlineQueue.flush(api);
      setQueued(offlineQueue.count());
      setQueueItems(offlineQueue.all());
      if (res.synced > 0) {
        notify && notify(`Synced ${res.synced} offline report(s) with canonical server.`);
        load();
      }
      if (res.failed && res.failed.length > 0) {
        setError(`${res.failed.length} report(s) failed sync validation.`);
      }
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setBusy(false);
      setNetworkStatus(isOnline() ? 'online' : 'offline');
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);

    const handleOnline = () => {
      setNetworkStatus('online');
      notify && notify('Network connection re-established. Background sync initiating...');
      if (offlineQueue.count() > 0) {
        syncNow();
      }
    };

    const handleOffline = () => {
      setNetworkStatus('offline');
      notify && notify('Network disconnected. Offline mode active — reports will queue locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const captureLocation = () => {
    acquireGpsPosition(
      (pos) => {
        setCoords({ lat: pos.lat, lng: pos.lng });
        if (notify) notify(pos.isMock ? 'Attached location fix (Guwahati NH27 Corridor)' : 'Attached live GPS location fix');
      },
      () => setError('Could not access location.')
    );
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    try {
      setBusy(true);
      const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.82 });
      setPhoto(compressed);
      setError('');
      if (notify) notify('Photo evidence attached (compressed for low-bandwidth transfer).');
    } catch (compErr) {
      setError(`Photo processing failed: ${compErr.message}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Please give the report a short title.'); return; }
    setError('');
    setBusy(true);

    const clientId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const payload = {
      ...form,
      clientId,
      lat: coords?.lat !== undefined ? coords.lat : null,
      lng: coords?.lng !== undefined ? coords.lng : null,
      photoDataUrl: photo,
      createdAt: new Date().toISOString(),
    };

    try {
      if (isOnline()) {
        const res = await api.createReport(payload);
        setAllReports((prev) => [res.report, ...prev]);
        notify && notify('Incident report accepted by canonical server and live across network.');
      } else {
        offlineQueue.add(payload);
        setQueued(offlineQueue.count());
        setQueueItems(offlineQueue.all());
        notify && notify('Offline mode: report safely saved to local queue and will sync automatically upon reconnection.');
      }

      setForm({
        category: 'road_block',
        severity: 'moderate',
        title: '',
        description: '',
        road: '',
        fromNode: '',
        toNode: '',
        affectedMode: 'road',
        estimatedDelayMinutes: '45',
      });
      setCoords(null);
      setPhoto(null);
      setActiveTab('list');
    } catch (err) {
      // Server unreachable or network timeout: fall back to local queue
      offlineQueue.add(payload);
      setQueued(offlineQueue.count());
      setQueueItems(offlineQueue.all());
      setError(`Network error (${err.message}) — report securely stored in local offline queue.`);
      notify && notify('Report preserved in local offline queue.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (incidentId, newStatus) => {
    try {
      const res = await api.updateReportStatus(incidentId, newStatus);
      setAllReports((prev) => prev.map((r) => (r.id === incidentId ? res.report : r)));
      notify && notify(`Incident status updated to ${newStatus.toUpperCase()}`);
    } catch (err) {
      notify && notify(`Failed to update status: ${err.message}`);
    }
  };

  const retryQueuedItem = async (clientId) => {
    setBusy(true);
    try {
      await offlineQueue.retry(clientId, api);
      setQueued(offlineQueue.count());
      setQueueItems(offlineQueue.all());
      notify && notify('Retried sync for queued report.');
      load();
    } catch (err) {
      setError(`Retry failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeQueuedItem = (clientId) => {
    offlineQueue.remove(clientId);
    setQueued(offlineQueue.count());
    setQueueItems(offlineQueue.all());
  };

  // Filtered reports
  const filteredReports = allReports.filter((r) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && r.status !== 'active' && r.status !== 'open') return false;
      if (statusFilter === 'verified' && r.status !== 'verified' && r.status !== 'in_progress') return false;
      if (statusFilter === 'under_review' && r.status !== 'under_review') return false;
      if (statusFilter === 'reported' && r.status !== 'reported') return false;
      if (statusFilter === 'resolved' && r.status !== 'resolved') return false;
    }
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      const matchRoad = (r.road || '').toLowerCase().includes(q);
      const matchDesc = (r.description || '').toLowerCase().includes(q);
      if (!matchTitle && !matchRoad && !matchDesc) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Top Controls, Connectivity Status & Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('list')}
            style={tabButtonStyle(activeTab === 'list')}
          >
            📋 Live Network Incidents ({allReports.length})
          </button>
          <button
            onClick={() => setActiveTab('form')}
            style={tabButtonStyle(activeTab === 'form')}
          >
            ➕ File Incident Report
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Connectivity Status Badge */}
          {networkStatus === 'online' && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#065f46', background: '#d1fae5', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              🟢 ONLINE
            </span>
          )}
          {networkStatus === 'syncing' && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', background: '#dbeafe', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              🔄 SYNCING...
            </span>
          )}
          {networkStatus === 'offline' && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              🔴 OFFLINE MODE
            </span>
          )}

          <button
            onClick={load}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Offline Queue Bar & Details Drawer */}
      {(queued > 0 || queueItems.length > 0) && (
        <div style={{ display: 'grid', gap: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>📶</span>
              <div>
                <b style={{ fontSize: 12, color: '#92400e' }}>
                  Offline Field Operations Queue: {queued} pending report{queued === 1 ? '' : 's'}
                </b>
                <div style={{ fontSize: 10, color: '#b45309', marginTop: 1 }}>
                  Reports saved locally in localStorage with stable idempotency keys. Will sync upon network reconnection.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowQueueDrawer(!showQueueDrawer)}
                style={{ padding: '5px 10px', background: '#fff', border: '1px solid #d97706', color: '#b45309', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                {showQueueDrawer ? 'Hide Queue Details ▲' : `View Queue (${queueItems.length}) ▼`}
              </button>
              <button
                type="button"
                onClick={syncNow}
                disabled={busy}
                style={{ padding: '5px 12px', background: '#b45309', border: 0, color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
              >
                {busy ? 'Syncing...' : 'Sync Now 🔄'}
              </button>
            </div>
          </div>

          {/* Detailed Queue Cards */}
          {showQueueDrawer && (
            <div style={{ display: 'grid', gap: 8, marginTop: 8, borderTop: '1px solid #fef3c7', paddingTop: 8 }}>
              {queueItems.map((item) => {
                const isSynced = item.syncStatus === 'synced';
                const isFailed = item.syncStatus === 'failed';
                const isSyncing = item.syncStatus === 'syncing';

                return (
                  <div
                    key={item.clientId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      background: '#ffffff',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: `1px solid ${isSynced ? '#86efac' : isFailed ? '#fca5a5' : '#fed7aa'}`,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: 4,
                            color: isSynced ? '#15803d' : isFailed ? '#b91c1c' : isSyncing ? '#1d4ed8' : '#b45309',
                            background: isSynced ? '#dcfce7' : isFailed ? '#fee2e2' : isSyncing ? '#dbeafe' : '#fef3c7',
                          }}
                        >
                          {item.syncStatus.toUpperCase()}
                        </span>
                        <b style={{ fontSize: 12, color: '#111827' }}>{item.title}</b>
                        <span style={{ fontSize: 10, color: '#6b7280' }}>({item.road || 'Corridor'})</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#4b5563', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>🆔 <code>{item.clientId.slice(0, 18)}…</code></span>
                        <span>{item.hasGps ? `📍 GPS: ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : '📍 No GPS Coordinates'}</span>
                        <span>{item.photoDataUrl ? '📷 Photo Attached' : 'No Photo'}</span>
                        {item.serverIncidentId && (
                          <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Server ID: {item.serverIncidentId.slice(0, 8)}…</span>
                        )}
                        {item.lastError && (
                          <span style={{ color: '#b91c1c', fontWeight: 700 }}>⚠️ {item.lastError} (Retries: {item.retryCount})</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {isFailed && (
                        <button
                          type="button"
                          onClick={() => retryQueuedItem(item.clientId)}
                          disabled={busy}
                          style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, cursor: 'pointer' }}
                        >
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeQueuedItem(item.clientId)}
                        style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700, background: '#f3f4f6', border: '1px solid #d1d5db', color: '#4b5563', borderRadius: 4, cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: LIVE INCIDENT LIST */}
      {activeTab === 'list' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: '#f9fafb', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <input
              type="text"
              placeholder="Search incidents by road, location, title…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: 36, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, flex: 1, minWidth: 200 }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: 36, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
            >
              <option value="all">All Statuses</option>
              <option value="reported">Reported</option>
              <option value="under_review">Under Review</option>
              <option value="verified">Verified</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ height: 36, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
            >
              <option value="all">All Hazard Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {loading && (
            <div style={{ padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
              Loading incidents from Supabase…
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: 16, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: 12 }}>
              <b>Unable to load incident data:</b> {error}
              <button onClick={load} style={{ marginLeft: 10, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {!loading && !error && filteredReports.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 8, color: '#6b7280' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🟢</div>
              <b>No incidents match current filters.</b>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Corridors are currently clear under this selection.</p>
            </div>
          )}

          {/* Incident Cards */}
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredReports.map((r) => {
              const reporterType = r.reporterRole === 'driver' ? 'Driver' : 'Field Officer';
              const isOfficerOrAdmin = user?.role === 'official' || user?.role === 'field';

              return (
                <div key={r.id} style={incidentCardStyle(r.severity, r.status)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={severityPill(r.severity)}>{(r.severity || 'moderate').toUpperCase()}</span>
                        <span style={reporterPill(r.reporterRole)}>👤 {reporterType}</span>
                        <span style={statusPill(r.status)}>{r.status ? r.status.replace('_', ' ').toUpperCase() : 'ACTIVE'}</span>
                        <span style={{ fontSize: 9, color: '#6b7280' }}>
                          📅 {new Date(r.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <h4 style={{ margin: '4px 0 2px', fontSize: 13, color: '#111827', fontWeight: 800 }}>
                        {r.title}
                      </h4>
                      <div style={{ fontSize: 10, color: '#4b5563', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 3 }}>
                        <span>📍 <b>Road/Corridor:</b> {r.road || 'State Highway'}</span>
                        <span>🏷️ <b>Category:</b> {r.category ? r.category.replace('_', ' ').toUpperCase() : 'GENERAL'}</span>
                        <span style={{ color: (r.hasGps || (r.lat !== null && r.lat !== undefined && !isNaN(Number(r.lat)))) ? '#0f766e' : '#6b7280', fontWeight: 600 }}>
                          {(r.hasGps || (r.lat !== null && r.lat !== undefined && !isNaN(Number(r.lat)))) ? `🌐 GPS: ${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}` : '🌐 GPS: Unavailable'}
                        </span>
                        {r.photoDataUrl && (
                          <span style={{ color: '#0369a1', fontWeight: 700 }}>📷 Photo Attached</span>
                        )}
                        <span>⏱️ <b>Estimated Impact:</b> Dynamic Disruption Penalty</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setInspectingReport(r)}
                        style={{
                          padding: '4px 10px',
                          border: '1px solid #0f766e',
                          background: '#f0fdfa',
                          color: '#0f766e',
                          borderRadius: 5,
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        🔍 View Evidence Details
                      </button>

                      {isOfficerOrAdmin && (r.status === 'reported' || r.status === 'under_review') && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(r.id, 'verified')}
                          style={verifyBtnStyle}
                        >
                          ✓ Verify Hazard
                        </button>
                      )}

                      {isOfficerOrAdmin && r.status !== 'resolved' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(r.id, 'resolved')}
                          style={resolveBtnStyle}
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>

                  {r.description && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#4b5563', lineHeight: 1.4 }}>
                      {r.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: NEW INCIDENT FORM */}
      {activeTab === 'form' && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 14, background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14, color: '#111827', fontWeight: 800 }}>
              Submit Field Incident / Road Hazard Report
            </h3>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: isOnline() ? '#dcfce7' : '#fee2e2', color: isOnline() ? '#15803d' : '#991b1b' }}>
              {isOnline() ? 'Mode: Online Direct Dispatch' : 'Mode: Offline Local Queue'}
            </span>
          </div>

          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b7280' }}>
            Geo-tagged incident reports feed directly into the Dijkstra network graph to recalculate risk-weighted routes upon server acceptance.
          </p>

          <div style={rowStyle}>
            <label style={labelStyle}>
              {t('report.category') || 'Category'}
              <select value={form.category} onChange={set('category')} style={selectStyle}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              {t('report.severity') || 'Severity Level'}
              <select value={form.severity} onChange={set('severity')} style={selectStyle}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Affected Transport Mode
              <select value={form.affectedMode} onChange={set('affectedMode')} style={selectStyle}>
                <option value="road">Road Highway</option>
                <option value="railway">Railway Track</option>
                <option value="waterway">Inland Waterway</option>
                <option value="air">Air Access</option>
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            {t('report.title') || 'Incident Title'}
            <input
              value={form.title}
              onChange={set('title')}
              type="text"
              placeholder="e.g. Landslide blocking both lanes on NH27 near Nagaon bypass"
              style={inputStyle}
              required
            />
          </label>

          <label style={labelStyle}>
            {t('report.desc') || 'Operational Details & Observations'}
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: 10 }}
              placeholder="Provide obstacle specifics, estimated clearance time, and safe detour advice for heavy freight."
            />
          </label>

          <div style={rowStyle}>
            <label style={labelStyle}>
              {t('report.road') || 'Highway / Corridor Name'}
              <input value={form.road} onChange={set('road')} type="text" placeholder="e.g. NH27 / NH29 / GS Road" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Nearest Network Hub / Node
              <select value={form.fromNode} onChange={set('fromNode')} style={selectStyle}>
                <option value="">Select nearest hub / node (optional)</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} ({n.state})</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Estimated Delay (Minutes)
              <input value={form.estimatedDelayMinutes} onChange={set('estimatedDelayMinutes')} type="number" placeholder="45" style={inputStyle} />
            </label>
          </div>

          <div style={rowStyle}>
            <button type="button" onClick={captureLocation} style={secondaryBtn}>
              {coords ? `📍 GPS Fix: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : (t('report.attachGPS') || '📍 Attach Live GPS Location')}
            </button>
            <label style={secondaryBtn}>
              {photo ? '✓ Photo Evidence Attached (Compressed)' : '📷 Attach On-Site Photo'}
              <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
            </label>
          </div>

          {error && <p style={{ color: '#b91c1c', fontSize: 12, fontWeight: 700, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              style={{ padding: '10px 18px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              disabled={busy}
              type="submit"
              style={btnStyle}
            >
              {busy ? 'Processing…' : isOnline() ? 'Broadcast Incident to Network' : 'Save Offline (Sync Later)'}
            </button>
          </div>
        </form>
      )}

      {/* Incident Evidence Modal */}
      <IncidentDetailModal
        incident={inspectingReport}
        onClose={() => setInspectingReport(null)}
      />
    </div>
  );
}

const tabButtonStyle = (active) => ({
  padding: '8px 16px',
  borderRadius: 7,
  border: active ? '1px solid #0f766e' : '1px solid #d1d5db',
  background: active ? '#0f766e' : '#ffffff',
  color: active ? '#ffffff' : '#374151',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
});

const incidentCardStyle = (severity, status) => {
  const isResolved = status === 'resolved';
  const isCritical = severity === 'critical' || severity === 'major';
  return {
    padding: '14px 16px',
    borderRadius: 8,
    border: `1px solid ${isResolved ? '#e5e7eb' : isCritical ? '#fca5a5' : '#fed7aa'}`,
    borderLeft: `5px solid ${isResolved ? '#10b981' : isCritical ? '#ef4444' : '#f59e0b'}`,
    background: isResolved ? '#fafafa' : isCritical ? '#fff5f5' : '#ffffff',
    opacity: isResolved ? 0.75 : 1,
  };
};

const severityPill = (sev) => {
  const isCrit = sev === 'critical' || sev === 'major';
  return {
    padding: '2px 7px',
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 800,
    color: isCrit ? '#991b1b' : '#92400e',
    background: isCrit ? '#fee2e2' : '#fef3c7',
  };
};

const reporterPill = (role) => ({
  padding: '2px 7px',
  borderRadius: 4,
  fontSize: 8,
  fontWeight: 800,
  color: role === 'driver' ? '#1e40af' : '#065f46',
  background: role === 'driver' ? '#dbeafe' : '#d1fae5',
});

const statusPill = (status) => {
  const s = status || 'active';
  const colorMap = {
    reported: { c: '#374151', bg: '#f3f4f6' },
    under_review: { c: '#92400e', bg: '#fef3c7' },
    verified: { c: '#1e40af', bg: '#dbeafe' },
    active: { c: '#b91c1c', bg: '#fee2e2' },
    resolved: { c: '#065f46', bg: '#d1fae5' },
  };
  const theme = colorMap[s] || colorMap.active;
  return {
    padding: '2px 7px',
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 800,
    color: theme.c,
    background: theme.bg,
  };
};

const verifyBtnStyle = {
  padding: '4px 10px',
  border: '1px solid #bfdbfe',
  borderRadius: 5,
  background: '#eff6ff',
  color: '#1d4ed8',
  fontSize: 10,
  fontWeight: 800,
  cursor: 'pointer',
};

const resolveBtnStyle = {
  padding: '4px 10px',
  border: '1px solid #bbf7d0',
  borderRadius: 5,
  background: '#f0fdf4',
  color: '#15803d',
  fontSize: 10,
  fontWeight: 800,
  cursor: 'pointer',
};

const rowStyle = { display: 'flex', gap: 12, flexWrap: 'wrap' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#374151', flex: 1, minWidth: 180 };
const inputStyle = { height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, width: '100%' };
const selectStyle = { height: 40, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, width: '100%' };
const btnStyle = { height: 42, padding: '0 20px', border: 0, borderRadius: 7, color: '#fff', background: '#0f766e', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', height: 38, padding: '0 14px', border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', color: '#0f766e', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
