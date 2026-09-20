import { useEffect, useState } from 'react';
import api from '../services/api';
import { offlineQueue, isOnline } from '../services/offlineQueue';
import { acquireGpsPosition } from '../services/gpsHelper';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../context/AuthContext';

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

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
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

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Please give the report a short title.'); return; }
    setError('');
    setBusy(true);
    const payload = {
      ...form,
      lat: coords?.lat,
      lng: coords?.lng,
      photoDataUrl: photo,
      createdAt: new Date().toISOString(),
    };
    try {
      if (isOnline()) {
        const res = await api.createReport(payload);
        setAllReports((prev) => [res.report, ...prev]);
        notify && notify('Incident report submitted and active across network.');
      } else {
        offlineQueue.add(payload);
        setQueued(offlineQueue.count());
        notify && notify('You are offline — report saved locally and will sync automatically.');
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
      offlineQueue.add(payload);
      setQueued(offlineQueue.count());
      setError(`Couldn't reach the server (${err.message}) — saved locally instead.`);
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

  const syncNow = async () => {
    setBusy(true);
    try {
      const res = await offlineQueue.flush(api);
      setQueued(offlineQueue.count());
      notify && notify(`Synced ${res.synced} offline report(s).`);
      load();
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
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
      {/* Top Controls & Navigation */}
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
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '3px 8px', borderRadius: 6 }}>
            Demo Operational Data
          </span>
          <button
            onClick={load}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {queued > 0 && (
        <div style={queuedBanner}>
          <span>⚠️ {queued} {t('report.offlineReports') || `report${queued > 1 ? 's' : ''} saved offline, waiting to sync.`}</span>
          <button onClick={syncNow} disabled={busy} style={syncBtn}>{t('report.syncNow') || 'Sync now'}</button>
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
                        {r.lat && <span>🌐 <b>GPS:</b> {Number(r.lat).toFixed(4)}, {Number(r.lng).toFixed(4)}</span>}
                        <span>⏱️ <b>Estimated Impact:</b> Dynamic Disruption Penalty</span>
                      </div>
                    </div>

                    {/* Officer Status Control */}
                    {isOfficerOrAdmin && r.status !== 'resolved' && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {r.status !== 'verified' && (
                          <button
                            onClick={() => handleStatusChange(r.id, 'verified')}
                            style={verifyBtnStyle}
                          >
                            ✓ Verify
                          </button>
                        )}
                        <button
                          onClick={() => handleStatusChange(r.id, 'resolved')}
                          style={resolveBtnStyle}
                        >
                          Resolve & Clear
                        </button>
                      </div>
                    )}
                  </div>

                  {r.description && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#4b5563', lineHeight: 1.4, background: '#f9fafb', padding: '6px 10px', borderRadius: 6 }}>
                      {r.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: SUBMIT INCIDENT REPORT FORM */}
      {activeTab === 'form' && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 14, background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: 14, color: '#111827', fontWeight: 800 }}>
            Submit Field Incident / Road Hazard Report
          </h3>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#6b7280' }}>
            Geo-tagged incident reports immediately feed into the Dijkstra network graph to recalculate risk-weighted routes.
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
              {photo ? '✓ Photo Evidence Attached' : '📷 Attach On-Site Photo'}
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
              {busy ? 'Broadcasting…' : isOnline() ? 'Broadcast Incident to Network' : 'Save Offline (Sync Later)'}
            </button>
          </div>
        </form>
      )}
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
const queuedBanner = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #f2d9a6', borderRadius: 8, background: '#fff8e8', fontSize: 11, fontWeight: 700, color: '#8a6b1f' };
const syncBtn = { border: 0, background: '#8a6b1f', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 10, fontWeight: 800, cursor: 'pointer' };
