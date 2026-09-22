import { useEffect, useState } from 'react';
import api from '../services/api';
import IncidentDetailModal from './IncidentDetailModal';
import AlertResponseModal from './AlertResponseModal';
import LiveMap from './LiveMap';
import { useTranslation } from '../hooks/useTranslation';

const NER_STATES = [
  'Assam',
  'Meghalaya',
  'Nagaland',
  'Manipur',
  'Mizoram',
  'Tripura',
  'Arunachal Pradesh',
  'Sikkim',
];

export default function DistrictDashboard({ notify, navigate }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [reports, setReports] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedAlertForResponse, setSelectedAlertForResponse] = useState(null);
  const [selectedState, setSelectedState] = useState('ALL');

  // Emergency Route Evaluator State
  const [emergencyOrigin, setEmergencyOrigin] = useState('guwahati');
  const [emergencyDestination, setEmergencyDestination] = useState('silchar');
  const [emergencyResult, setEmergencyResult] = useState(null);
  const [evaluatingEmergency, setEvaluatingEmergency] = useState(false);
  const [emergencyError, setEmergencyError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.dashboardSummary(),
      api.reports().catch(() => ({ reports: [] })),
      api.nodes().catch(() => ({ nodes: [] })),
    ])
      .then(([dashRes, repRes, nodeRes]) => {
        setData(dashRes);
        setReports(repRes.reports || []);
        if (nodeRes.nodes && nodeRes.nodes.length > 0) {
          setNodes(nodeRes.nodes);
        }
        setError('');
      })
      .catch((err) => setError(err.message || 'Unable to load live operational summary.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleEvaluateEmergency = async (e) => {
    if (e) e.preventDefault();
    if (!emergencyOrigin || !emergencyDestination) return;
    setEvaluatingEmergency(true);
    setEmergencyError('');
    try {
      const res = await api.emergencyRoute(emergencyOrigin, emergencyDestination);
      setEmergencyResult(res);
    } catch (err) {
      setEmergencyError(err.message || 'Failed to evaluate emergency route.');
      setEmergencyResult(null);
    } finally {
      setEvaluatingEmergency(false);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 24, background: '#fdf2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800 }}>⚠️ Operational Data Unavailable</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12 }}>{error}</p>
        <button
          onClick={load}
          style={{ padding: '6px 14px', border: 0, borderRadius: 6, background: '#b91c1c', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
        >
          🔄 Retry Connection
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
        <b>{t('dash.loading') || 'Loading regional command intelligence…'}</b>
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
          Querying canonical incidents, corridor accessibility, and multimodal cargo status
        </p>
      </div>
    );
  }

  // Filtered state summaries
  const filteredStates = (data?.stateBreakdown || []).filter(
    (s) => selectedState === 'ALL' || s.state === selectedState
  );

  // Filtered critical corridors
  const filteredCorridors = (data?.criticalCorridors || []).filter((c) => {
    if (selectedState === 'ALL') return true;
    return c.segments && c.segments.some((seg) => {
      const nodeObj = nodes.find((n) => n.name === seg.from || n.name === seg.to);
      return nodeObj && nodeObj.state === selectedState;
    });
  });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* 1. Command Center Header & Status Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingBottom: 4, borderBottom: '1px solid #e5e7eb' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🏛️</span>
            <h3 style={{ margin: 0, fontSize: 18, color: '#111827', fontWeight: 800 }}>
              {t('dash.commandBriefing') || 'Northeast Regional Logistics & Disruption Intelligence'}
            </h3>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#4b5563' }}>
            Government & Disaster Management Command Center · Real-time Situational Awareness across 8 North Eastern States
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Live Database Synced
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#1f2937', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '4px 10px', borderRadius: 12 }}>
            Deterministic Risk Engine
          </span>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 11,
              fontWeight: 700,
              color: '#374151',
              background: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All States (NER Region)</option>
            {NER_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            style={{
              padding: '4px 10px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              background: '#ffffff',
              fontSize: 11,
              fontWeight: 700,
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* 2. High-Level Regional KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Stat
          label="Regional Connectivity"
          value={`${data?.regionalConnectivityIndex ?? 100}%`}
          sub={data?.regionalStatus?.replace('_', ' ') || 'OPTIMAL'}
          tone={data?.regionalConnectivityIndex >= 80 ? 'ok' : data?.regionalConnectivityIndex >= 60 ? 'warning' : 'danger'}
        />
        <Stat
          label="Active Hazards"
          value={data?.activeIncidents ?? data?.openFieldReports ?? 0}
          sub={`${data?.criticalIncidents ?? 0} Critical / Major`}
          tone={data?.activeIncidents > 0 ? (data?.criticalIncidents > 0 ? 'danger' : 'warning') : 'ok'}
        />
        <Stat
          label="Monitored Corridors"
          value={`${data?.corridorTotals?.total ?? 38}`}
          sub={`${data?.corridorTotals?.open ?? 0} Open · ${data?.corridorTotals?.blocked ?? 0} Blocked`}
          tone={data?.corridorTotals?.blocked > 0 ? 'danger' : data?.corridorTotals?.severelyDisrupted > 0 ? 'warning' : 'ok'}
        />
        <Stat
          label="At-Risk Shipments"
          value={data?.atRiskShipmentsCount ?? 0}
          sub={`${data?.blockedShipmentsCount ?? 0} Blocked / Halted`}
          tone={data?.atRiskShipmentsCount > 0 ? (data?.blockedShipmentsCount > 0 ? 'danger' : 'warning') : 'ok'}
        />
        <Stat
          label="Vehicles in Transit"
          value={`${data?.activeVehicles ?? 0} / ${data?.totalVehicles ?? 0}`}
          sub={`${data?.delayedVehicles ?? 0} Delayed`}
          tone={data?.delayedVehicles > 0 ? 'warning' : 'ok'}
        />
        <Stat
          label="Active Alerts"
          value={data?.multiHazardAlertsCount ?? data?.activeAlertsCount ?? 0}
          sub="Multi-hazard stream"
          tone={(data?.multiHazardAlertsCount || data?.activeAlertsCount) > 0 ? 'warning' : 'ok'}
        />
      </div>

      {/* 3. State-Level Regional Connectivity Breakdown */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>STATE-WISE CONNECTIVITY CAPACITY</small>
            <h4 style={{ fontSize: 14, color: '#155b4b', margin: '2px 0 0', fontWeight: 800 }}>
              {t('dash.connectivity') || 'State Connectivity & Accessibility Matrix'}
            </h4>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>
              Formula: (Weighted Accessible Corridor Capacity / Total Corridors) × 100 · Open=1.0, Caution=0.85, Restricted=0.55, Severe=0.25, Blocked=0.0
            </p>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280' }}>
            {filteredStates.length} State{filteredStates.length !== 1 ? 's' : ''} Shown
          </span>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {filteredStates.map((s) => {
            const score = s.connectivityIndex;
            const statusTone = s.connectivityStatus === 'OPTIMAL' ? '#065f46' : s.connectivityStatus === 'WATCHFUL' ? '#92400e' : '#991b1b';
            const bgTone = s.connectivityStatus === 'OPTIMAL' ? '#f0fdf4' : s.connectivityStatus === 'WATCHFUL' ? '#fffbeb' : '#fef2f2';
            const borderTone = s.connectivityStatus === 'OPTIMAL' ? '#bbf7d0' : s.connectivityStatus === 'WATCHFUL' ? '#fde68a' : '#fecaca';

            return (
              <div
                key={s.state}
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: `1px solid ${borderTone}`,
                  background: bgTone,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <b style={{ fontSize: 13, color: '#111827' }}>{s.state}</b>
                      <span style={{ fontSize: 9, color: '#6b7280', display: 'block' }}>
                        {s.totalCorridors} Corridors Monitored
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 9,
                        fontWeight: 800,
                        color: statusTone,
                        background: '#ffffff',
                        border: `1px solid ${borderTone}`,
                      }}
                    >
                      {s.connectivityStatus?.replace('_', ' ')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '4px 0' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: statusTone }}>
                      {score !== null ? `${score}%` : 'N/A'}
                    </span>
                    <span style={{ fontSize: 9, color: '#6b7280' }}>Accessibility Index</span>
                  </div>

                  <p style={{ fontSize: 10, color: '#4b5563', margin: '4px 0 6px', lineHeight: 1.3 }}>
                    {s.reason}
                  </p>

                  <div style={{ fontSize: 9, color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span>🟢 {s.openCorridors} Open</span>
                    <span>🟡 {s.cautionCorridors} Caution</span>
                    <span>🟠 {s.restrictedCorridors} Restricted</span>
                    {s.severelyDisruptedCorridors > 0 && <span style={{ color: '#ea580c' }}>🔥 {s.severelyDisruptedCorridors} Severe</span>}
                    {s.blockedCorridors > 0 && <span style={{ color: '#b91c1c', fontWeight: 700 }}>⛔ {s.blockedCorridors} Blocked</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px dashed #e5e7eb', fontSize: 9 }}>
                  <span style={{ color: s.activeIncidentsCount > 0 ? '#b91c1c' : '#059669', fontWeight: 700 }}>
                    {s.activeIncidentsCount > 0 ? `⚠️ ${s.activeIncidentsCount} active hazard(s)` : '✓ No active hazards'}
                  </span>
                  {s.atRiskShipmentsCount > 0 && (
                    <span style={{ color: '#d97706', fontWeight: 700 }}>
                      📦 {s.atRiskShipmentsCount} cargo at risk
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Interactive Regional GIS Situational Map */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>SPATIAL SITUATIONAL AWARENESS</small>
            <h4 style={{ fontSize: 14, color: '#155b4b', margin: '2px 0 0', fontWeight: 800 }}>
              Regional GIS Network & Active Hazard Mapping
            </h4>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>
              Live geospatial overlay of road highways, NFR railway corridors, inland waterways, and field hazard pins
            </p>
          </div>
          {navigate && (
            <button
              type="button"
              onClick={() => navigate('Live map')}
              style={{
                padding: '4px 10px',
                border: '1px solid #10b981',
                borderRadius: 6,
                background: '#ecfdf5',
                color: '#065f46',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Expand Full Map →
            </button>
          )}
        </header>
        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <LiveMap height={360} />
        </div>
      </div>

      {/* 5. Critical Corridors & Disruption Monitoring */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>LIFELINE HIGHWAYS & CORRIDOR RISKS</small>
            <h4 style={{ fontSize: 14, color: '#155b4b', margin: '2px 0 0', fontWeight: 800 }}>
              Critical Corridor Status & Bottleneck Monitoring
            </h4>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>
              Corridors sorted by severity impact. Real field incident evidence and logistics exposure.
            </p>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280' }}>
            {filteredCorridors.length} Corridors
          </span>
        </header>

        {filteredCorridors.length === 0 ? (
          <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>No monitored corridors match the filter criteria.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredCorridors.map((c) => {
              const accessColor = getAccessibilityColor(c.accessibilityState);
              const latest = c.latestIncident;

              return (
                <div
                  key={c.corridor}
                  style={{
                    padding: '12px 14px',
                    border: `1px solid ${c.isBlocked ? '#fca5a5' : c.accessibilityState !== 'OPEN' ? '#fde68a' : '#e5e7eb'}`,
                    borderRadius: 8,
                    background: c.isBlocked ? '#fff5f5' : c.accessibilityState !== 'OPEN' ? '#fffdf7' : '#ffffff',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(200px, 2fr) minmax(180px, 1fr)',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  {/* Column 1: Corridor Identity & Accessibility State */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <b style={{ fontSize: 13, color: '#111827' }}>{c.corridor}</b>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 4,
                          color: accessColor.color,
                          background: accessColor.bg,
                          border: `1px solid ${accessColor.border}`,
                        }}
                      >
                        {c.accessibilityState.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>
                      {c.segmentsCount} Segment{c.segmentsCount !== 1 ? 's' : ''} ·{' '}
                      {c.isBlocked ? (
                        <span style={{ color: '#b91c1c', fontWeight: 800 }}>⛔ PASSAGE BLOCKED</span>
                      ) : c.estimatedDelayMinutes > 0 ? (
                        <span style={{ color: '#d97706', fontWeight: 700 }}>⏱️ +{c.estimatedDelayMinutes}m delay</span>
                      ) : (
                        <span style={{ color: '#059669' }}>✓ Flowing on schedule</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3 }}>
                      {c.disruptionReason}
                    </div>
                  </div>

                  {/* Column 2: Latest Incident & Evidence Status */}
                  <div>
                    {latest ? (
                      <div style={{ padding: '6px 10px', background: '#f9fafb', borderRadius: 6, border: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#1f2937' }}>
                            [{latest.category?.toUpperCase()}] {latest.title}
                          </span>
                          <span style={{ fontSize: 8, fontWeight: 800, color: latest.severity === 'critical' ? '#991b1b' : '#92400e', textTransform: 'uppercase' }}>
                            {latest.severity}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 9, color: '#6b7280' }}>
                          <span style={{ color: latest.hasGps ? '#0f766e' : '#9ca3af', fontWeight: latest.hasGps ? 700 : 400 }}>
                            {latest.hasGps ? `🌐 Fix: ${Number(latest.lat).toFixed(3)}, ${Number(latest.lng).toFixed(3)}` : '🌐 GPS: Unavailable'}
                          </span>
                          {latest.hasPhoto && (
                            <span style={{ color: '#0284c7', fontWeight: 700, background: '#e0f2fe', padding: '1px 5px', borderRadius: 3 }}>
                              📷 Photo Evidence
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: '#059669' }}>
                        ✓ No active hazard reports logged for this highway.
                      </div>
                    )}
                  </div>

                  {/* Column 3: Impact on Logistics & Evidence Action */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ fontSize: 10, color: '#374151' }}>
                      {c.affectedShipmentsCount > 0 ? (
                        <b style={{ color: '#b91c1c' }}>📦 {c.affectedShipmentsCount} shipment(s) at risk</b>
                      ) : (
                        <span style={{ color: '#6b7280' }}>0 shipments exposed</span>
                      )}
                    </div>
                    {latest && (
                      <button
                        type="button"
                        onClick={() => setSelectedReport(latest)}
                        style={{
                          padding: '4px 10px',
                          border: '1px solid #0f766e',
                          borderRadius: 5,
                          background: '#0f766e',
                          color: '#ffffff',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Inspect Field Evidence
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Emergency Route Evaluator & Multimodal Bypass */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12 }}>
          <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>DISASTER RESPONSE & CONTINGENCY</small>
          <h4 style={{ fontSize: 14, color: '#155b4b', margin: '2px 0 0', fontWeight: 800 }}>
            Emergency Supply Corridor Evaluator & Multimodal Bypass
          </h4>
          <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>
            Assess route viability between critical NER hubs under active hazards and receive canonical multimodal alternative recommendations (Rail/Air/Waterway)
          </p>
        </header>

        <form onSubmit={handleEvaluateEmergency} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) auto', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#374151', marginBottom: 4 }}>
              ORIGIN NODE
            </label>
            <select
              value={emergencyOrigin}
              onChange={(e) => setEmergencyOrigin(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, background: '#fff' }}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name} ({n.state})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#374151', marginBottom: 4 }}>
              DESTINATION NODE
            </label>
            <select
              value={emergencyDestination}
              onChange={(e) => setEmergencyDestination(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, background: '#fff' }}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name} ({n.state})</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={evaluatingEmergency || emergencyOrigin === emergencyDestination}
            style={{
              padding: '8px 16px',
              border: 0,
              borderRadius: 6,
              background: '#155b4b',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 800,
              cursor: (evaluatingEmergency || emergencyOrigin === emergencyDestination) ? 'not-allowed' : 'pointer',
              opacity: (evaluatingEmergency || emergencyOrigin === emergencyDestination) ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {evaluatingEmergency ? 'Evaluating…' : '⚡ Evaluate Corridor'}
          </button>
        </form>

        {emergencyError && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 11, marginBottom: 12 }}>
            {emergencyError}
          </div>
        )}

        {emergencyResult && (
          <div style={{ padding: 14, border: '1px solid #d1fae5', borderRadius: 8, background: '#f0fdf4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 13, color: '#111827' }}>
                  {emergencyResult.originName} → {emergencyResult.destinationName}
                </b>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 4,
                    color: emergencyResult.isBlocked ? '#991b1b' : emergencyResult.isDisrupted ? '#92400e' : '#065f46',
                    background: emergencyResult.isBlocked ? '#fee2e2' : emergencyResult.isDisrupted ? '#fef3c7' : '#d1fae5',
                  }}
                >
                  {emergencyResult.accessibilityState.replace('_', ' ')}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#374151' }}>
                Base: <b>{emergencyResult.baseDurationMinutes ? `${emergencyResult.baseDurationMinutes}m` : 'N/A'}</b>
                {emergencyResult.currentEtaMinutes !== null && (
                  <> · Disrupted ETA: <b>{emergencyResult.currentEtaMinutes}m</b></>
                )}
                {emergencyResult.estimatedDelayMinutes > 0 && (
                  <span style={{ color: '#b91c1c', fontWeight: 800 }}> (+{emergencyResult.estimatedDelayMinutes}m)</span>
                )}
              </div>
            </div>

            <p style={{ fontSize: 11, color: '#374151', margin: '0 0 10px', lineHeight: 1.4 }}>
              {emergencyResult.explanation}
            </p>

            {emergencyResult.recommendedAlternative && (
              <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: 6, border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#065f46', background: '#ecfdf5', padding: '2px 6px', borderRadius: 3 }}>
                      RECOMMENDED BYPASS · {emergencyResult.recommendedAlternative.mode?.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 9, color: '#6b7280' }}>
                      Safety Index: {emergencyResult.recommendedAlternative.safetyIndex ?? 'N/A'}/100 · Decision Score: {emergencyResult.recommendedAlternative.decisionScore ?? 'N/A'}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: '#4b5563', margin: '3px 0 0' }}>
                    {emergencyResult.recommendedAlternative.reason}
                  </p>
                </div>
                {navigate && (
                  <button
                    type="button"
                    onClick={() => navigate('Route Planner')}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid #059669',
                      borderRadius: 5,
                      background: '#059669',
                      color: '#ffffff',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Open in Route Planner →
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. Multi-Hazard Alerts & At-Risk Logistics Double-Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Multi-Hazard Regional Alerts Stream */}
        <section className="card" style={{ padding: '18px 20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>CANONICAL INCIDENT STREAM</small>
              <h4 style={{ fontSize: 13, color: '#155b4b', margin: '2px 0 0', fontWeight: 800 }}>
                Active Multi-Hazard Regional Alerts ({reports.filter((r) => r.status !== 'resolved').length})
              </h4>
            </div>
            <span style={{ fontSize: 9, color: '#6b7280' }}>Verified Field Data</span>
          </header>

          {reports.filter((r) => r.status !== 'resolved').length === 0 ? (
            <p style={{ fontSize: 11, color: '#6b7280' }}>No active multi-hazard alerts reported across the region.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {reports.filter((r) => r.status !== 'resolved').slice(0, 8).map((r) => {
                const hasGps = r.hasGps || (r.lat !== null && r.lat !== undefined && !isNaN(Number(r.lat)) && r.lng !== null && r.lng !== undefined && !isNaN(Number(r.lng)));
                const hasPhoto = Boolean(r.photoDataUrl && typeof r.photoDataUrl === 'string' && r.photoDataUrl.trim().length > 0);

                return (
                  <div
                    key={r.id}
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <b style={{ fontSize: 11, color: '#111827' }}>
                        [{r.category?.toUpperCase()}] {r.title}
                      </b>
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: 3,
                          color: r.severity === 'critical' ? '#991b1b' : '#92400e',
                          background: r.severity === 'critical' ? '#fee2e2' : '#fef3c7',
                          textTransform: 'uppercase',
                        }}
                      >
                        {r.severity}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: '#6b7280' }}>
                      <span>Highway: <b>{r.road || 'State Highway'}</b></span>
                      <span style={{ color: hasGps ? '#0f766e' : '#9ca3af' }}>
                        {hasGps ? `🌐 Fix: ${Number(r.lat).toFixed(3)}, ${Number(r.lng).toFixed(3)}` : '🌐 GPS: Unavailable'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, paddingTop: 4, borderTop: '1px dashed #f3f4f6' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {hasPhoto && (
                          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                            📷 Photo Evidence
                          </span>
                        )}
                        <span style={{ fontSize: 8, color: '#9ca3af' }}>
                          {new Date(r.createdAt || r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedReport(r)}
                          style={{
                            padding: '2px 8px',
                            border: '1px solid #0f766e',
                            background: '#0f766e',
                            color: '#fff',
                            borderRadius: 4,
                            fontSize: 9,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Inspect Evidence
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedAlertForResponse({
                            id: r.id,
                            title: r.title,
                            text: r.description || `${r.category} reported on ${r.road}`,
                            road: r.road,
                            severity: r.severity,
                            incidentId: r.id,
                            type: r.category,
                            createdAt: r.createdAt || r.created_at,
                            responseStatus: r.status === 'resolved' ? 'resolved' : 'in_progress',
                          })}
                          style={{
                            padding: '2px 8px',
                            border: '1px solid #1e745b',
                            background: '#1e745b',
                            color: '#fff',
                            borderRadius: 4,
                            fontSize: 9,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Take Action ➔
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* At-Risk Logistics & Shipments Overview */}
        <section className="card" style={{ padding: '18px 20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>SUPPLY CHAIN CONTINUITY</small>
              <h4 style={{ fontSize: 13, color: '#155b4b', margin: '2px 0 0', fontWeight: 800 }}>
                Disrupted & At-Risk Shipments ({data?.atRiskLogistics?.atRiskCount ?? 0})
              </h4>
            </div>
            {navigate && (
              <button
                type="button"
                onClick={() => navigate('Logistics')}
                style={{
                  border: 0,
                  background: 'transparent',
                  color: '#059669',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Logistics Desk →
              </button>
            )}
          </header>

          {(!data?.atRiskLogistics?.atRiskShipments || data.atRiskLogistics.atRiskShipments.length === 0) ? (
            <p style={{ fontSize: 11, color: '#059669', margin: 0 }}>
              ✓ All active essential shipments are moving on schedule without corridor disruptions.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {data.atRiskLogistics.atRiskShipments.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid #fee2e2',
                    borderRadius: 6,
                    background: '#fffbfb',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: 11, color: '#111827' }}>
                      {s.origin} → {s.destination}
                    </b>
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: 3,
                        color: s.priority === 'emergency' ? '#991b1b' : '#92400e',
                        background: s.priority === 'emergency' ? '#fee2e2' : '#fef3c7',
                        textTransform: 'uppercase',
                      }}
                    >
                      {s.priority}
                    </span>
                  </div>

                  <div style={{ fontSize: 10, color: '#4b5563' }}>
                    Cargo: <b>{s.cargoType}</b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: '#6b7280' }}>
                    <span style={{ color: s.estimatedDelayMinutes > 0 ? '#b91c1c' : '#374151', fontWeight: 700 }}>
                      {s.status === 'blocked' ? '⛔ Passage Blocked' : `⏱️ Delay: +${s.estimatedDelayMinutes || 0}m`}
                    </span>
                    {s.vehicle && (
                      <span style={{ fontSize: 8, background: '#f3f4f6', padding: '1px 4px', borderRadius: 3 }}>
                        Veh: {s.vehicle.vehicleNumber} ({s.vehicle.locationSource})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 8. Operational Activity Audit Trail */}
      <section className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>AUDIT & TELEMETRY</small>
            <h4 style={{ fontSize: 13, color: '#155b4b', margin: '2px 0 0', fontWeight: 800 }}>
              Operational Activity Audit Timeline
            </h4>
          </div>
          <span style={{ fontSize: 9, color: '#6b7280' }}>Live Stream</span>
        </header>

        {(!data?.recentActivity || data.recentActivity.length === 0) ? (
          <p style={{ fontSize: 11, color: '#6b7280' }}>No recent operational activity recorded.</p>
        ) : (
          <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {data.recentActivity.map((act) => (
              <div key={act.id} style={{ padding: '6px 10px', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 6, fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#111827' }}>
                    {activityIcon(act.action)} {act.description}
                  </span>
                  <span style={{ fontSize: 8, color: '#9ca3af' }}>
                    {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', paddingTop: 8 }}>
        <span>{t('dash.generatedAt') || 'Generated'}: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}</span>
        <span>Auto-refreshing every 30s · CANONICAL SINGLE SOURCE OF TRUTH</span>
      </div>

      {/* Evidence Modal */}
      <IncidentDetailModal
        incident={selectedReport}
        onClose={() => setSelectedReport(null)}
      />

      {/* Alert / Incident Response Modal */}
      {selectedAlertForResponse && (
        <AlertResponseModal
          alert={selectedAlertForResponse}
          onClose={() => setSelectedAlertForResponse(null)}
          onResponseSuccess={() => {
            load();
            setSelectedAlertForResponse(null);
          }}
          onInspectIncident={(incId) => {
            const inc = reports.find((r) => r.id === incId);
            if (inc) setSelectedReport(inc);
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  const col = tone === 'danger' ? '#b91c1c' : tone === 'warning' ? '#d97706' : tone === 'ok' ? '#047857' : '#1f2937';
  const bg = tone === 'danger' ? '#fef2f2' : tone === 'warning' ? '#fffbeb' : tone === 'ok' ? '#ecfdf5' : '#ffffff';
  const border = tone === 'danger' ? '#fecaca' : tone === 'warning' ? '#fde68a' : tone === 'ok' ? '#a7f3d0' : '#e5e7eb';

  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${border}`, borderRadius: 8, background: bg }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 0.8 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: col }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function getAccessibilityColor(state) {
  switch (state) {
    case 'BLOCKED':
      return { color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
    case 'SEVERELY_DISRUPTED':
      return { color: '#c2410c', bg: '#ffedd5', border: '#fdba74' };
    case 'RESTRICTED':
      return { color: '#b45309', bg: '#fef3c7', border: '#fcd34d' };
    case 'CAUTION':
      return { color: '#854d0e', bg: '#fef9c3', border: '#fde047' };
    case 'OPEN':
    default:
      return { color: '#065f46', bg: '#d1fae5', border: '#86efac' };
  }
}

function activityIcon(action) {
  if (action === 'incident_reported') return '⚠️';
  if (action === 'vehicle_ping') return '📍';
  if (action === 'shipment_assigned') return '👤';
  if (action === 'alert_created') return '🔔';
  if (action === 'incident_verified' || action === 'alert_response_RESOLVE') return '✅';
  if (action === 'alert_response_ESCALATE') return '🚨';
  if (action === 'alert_response_CLAIM') return '🚚';
  if (action === 'alert_response_ACKNOWLEDGE') return '👁️';
  if (action?.startsWith('alert_response')) return '📋';
  return '📋';
}
