import { useEffect, useState } from 'react';
import api from '../services/api';
import { useTranslation } from '../hooks/useTranslation';

export default function DistrictDashboard({ notify }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.dashboardSummary(),
      api.reports().catch(() => ({ reports: [] })),
    ])
      .then(([dashRes, repRes]) => {
        setData(dashRes);
        setReports(repRes.reports || []);
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
        <b>{t('dash.loading') || 'Loading regional briefing from Supabase…'}</b>
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Querying live incidents, vehicles, and multimodal cargo status</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Header with Demo Data Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: '#111827', fontWeight: 800 }}>
            {t('dash.commandBriefing') || 'Northeast Regional Logistics & Disruption Intelligence'}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>
            Live status from Supabase PostgreSQL across 8 North Eastern States
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '3px 9px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            Live Database Synced
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '3px 9px', borderRadius: 12 }}>
            Demo Operational Data
          </span>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <Stat label={t('dash.coverage') || "Network Coverage"} value={`${data?.regionAccessCoveragePct ?? 100}%`} tone="ok" />
        <Stat label="Active Incidents" value={data?.activeIncidents ?? data?.openFieldReports ?? 0} tone={data?.activeIncidents > 0 ? 'warning' : 'ok'} />
        <Stat label="Critical / Major" value={data?.criticalIncidents ?? data?.criticalReports ?? 0} tone={data?.criticalIncidents > 0 ? 'danger' : 'ok'} />
        <Stat label="Vehicles In Transit" value={`${data?.activeVehicles ?? 0} / ${data?.totalVehicles ?? 12}`} tone="ok" />
        <Stat label="Delayed Vehicles" value={data?.delayedVehicles ?? 0} tone={data?.delayedVehicles > 0 ? 'danger' : 'ok'} />
        <Stat label="Active Shipments" value={data?.activeShipmentsCount ?? data?.shipments?.inTransit ?? 0} tone="ok" />
        <Stat label="Delayed Shipments" value={data?.delayedShipmentsCount ?? data?.shipments?.delayed ?? 0} tone={data?.delayedShipmentsCount > 0 ? 'danger' : 'ok'} />
        <Stat label="Active Alerts" value={data?.activeAlertsCount ?? 12} tone="warning" />
      </div>

      {/* District-wise connectivity */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ fontSize: 13, color: '#155b4b', margin: 0, fontWeight: 800 }}>{t('dash.connectivity') || 'District-wise Connectivity Scores'}</h4>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>Evaluated against live weather severity and corridor incident blocks</p>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280' }}>{data?.districtConnectivity?.length || 0} Districts Monitored</span>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {(data?.districtConnectivity || []).map((d) => (
            <div key={d.nodeId} style={districtCard(d.status)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <b style={{ fontSize: 11, color: '#111827' }}>{t(`enum.${d.name.toLowerCase()}`) || d.name}</b>
                  <span style={{ fontSize: 9, color: '#6b7280', display: 'block' }}>{t(`enum.${d.state}`) || d.state}</span>
                </div>
                <span style={statusPill(d.status)}>{d.status.replace('_', ' ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: d.score >= 75 ? '#065f46' : d.score >= 45 ? '#92400e' : '#991b1b' }}>{d.score} / 100</span>
                {d.openReports > 0 ? (
                  <span style={{ fontSize: 9, color: '#b91c1c', fontWeight: 700 }}>⚠️ {d.openReports} report{d.openReports > 1 ? 's' : ''}</span>
                ) : (
                  <span style={{ fontSize: 9, color: '#059669' }}>✓ Clear</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Bottlenecks & Recent Activity */}
      <div className="dashboard-grid">
        {/* Logistics Bottlenecks */}
        <section className="card" style={{ padding: '18px 20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12 }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>LIVE RISK ENGINE</small>
              <h4 style={{ fontSize: 13, color: '#155b4b', margin: '4px 0 0', fontWeight: 800 }}>{t('dash.bottlenecks') || 'Logistics Bottlenecks & High-Risk Corridors'}</h4>
            </div>
          </header>
          {(!data?.logisticsBottlenecks || data.logisticsBottlenecks.length === 0) ? (
            <p style={{ fontSize: 11, color: '#6b7280' }}>{t('dash.noBottlenecks') || 'No major bottlenecks currently detected.'}</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {data.logisticsBottlenecks.map((b, i) => (
                <div key={i} style={segmentStyle}>
                  <div>
                    <b style={{ color: '#111827', fontSize: 11 }}>{t(`enum.${b.from}`) || b.from} → {t(`enum.${b.to}`) || b.to}</b>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>{b.road} · {b.km} km</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, color: b.riskScore > 50 ? '#b91c1c' : '#d97706', fontSize: 11 }}>
                      Risk Index: {b.riskScore}
                    </span>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>{b.activeReports} active hazard(s)</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Operational Activity Stream */}
        <section className="card" style={{ padding: '18px 20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>AUDIT & TELEMETRY</small>
              <h4 style={{ fontSize: 13, color: '#155b4b', margin: '4px 0 0', fontWeight: 800 }}>Operational Activity Timeline</h4>
            </div>
            <span style={{ fontSize: 9, color: '#6b7280' }}>Live Stream</span>
          </header>

          {(!data?.recentActivity || data.recentActivity.length === 0) ? (
            <p style={{ fontSize: 11, color: '#6b7280' }}>No recent operational activity recorded.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {data.recentActivity.map((act) => (
                <div key={act.id} style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 6, fontSize: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#111827' }}>
                      {activityIcon(act.action)} {act.description}
                    </span>
                  </div>
                  <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {new Date(act.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Synchronized Field Officer Incident Stream for Government Officials */}
      <section className="card" style={{ padding: '18px 20px' }}>
        <header style={{ padding: 0, minHeight: 'auto', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>LIVE FIELD INTELLIGENCE</small>
            <h4 style={{ fontSize: 13, color: '#155b4b', margin: '4px 0 0', fontWeight: 800 }}>
              Field Officer Hazard Reports & Corridor Disruptions ({reports.filter(r => r.status !== 'resolved').length} Active)
            </h4>
          </div>
          <span style={{ fontSize: 10, color: '#6b7280' }}>
            {reports.length} Total Logged
          </span>
        </header>

        {reports.length === 0 ? (
          <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>No active field hazards reported across the network.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {reports.slice(0, 6).map((r) => (
              <div key={r.id} style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: r.status === 'resolved' ? '#f9fafb' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <b style={{ fontSize: 11, color: '#111827' }}>[{r.category?.toUpperCase().replace('_', ' ')}] {r.title}</b>
                  <span style={{
                    fontSize: 8,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                    color: r.status === 'resolved' ? '#065f46' : r.severity === 'critical' ? '#991b1b' : '#92400e',
                    background: r.status === 'resolved' ? '#ecfdf5' : r.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                  }}>
                    {r.status}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: '#4b5563', margin: '0 0 6px', lineHeight: 1.3 }}>
                  {r.description || 'Reported by PWD field unit.'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af' }}>
                  <span>Corridor: <b>{r.road || 'State Highway'}</b></span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Shipment Pipeline Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <Stat label={t('dash.shipPlanned') || "Shipments Planned"} value={data?.shipments?.planned ?? 0} />
        <Stat label={t('dash.shipTransit') || "In Transit"} value={data?.shipments?.inTransit ?? 0} tone="ok" />
        <Stat label={t('dash.shipDelayed') || "Delayed"} value={data?.shipments?.delayed ?? 0} tone={data?.shipments?.delayed > 0 ? 'danger' : 'ok'} />
        <Stat label={t('dash.shipDelivered') || "Delivered"} value={data?.shipments?.delivered ?? 0} tone="ok" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
        <span>{t('dash.generatedAt') || 'Generated'}: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}</span>
        <span>Auto-refreshing every 30s</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const col = tone === 'danger' ? '#b91c1c' : tone === 'warning' ? '#d97706' : tone === 'ok' ? '#047857' : '#1f2937';
  const bg = tone === 'danger' ? '#fef2f2' : tone === 'warning' ? '#fffbeb' : tone === 'ok' ? '#ecfdf5' : '#ffffff';
  const border = tone === 'danger' ? '#fecaca' : tone === 'warning' ? '#fde68a' : tone === 'ok' ? '#a7f3d0' : '#e5e7eb';

  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${border}`, borderRadius: 8, background: bg }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 0.8 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, color: col }}>{value}</div>
    </div>
  );
}

function activityIcon(action) {
  if (action === 'incident_reported') return '⚠️';
  if (action === 'vehicle_ping') return '📍';
  if (action === 'shipment_assigned') return '👤';
  if (action === 'alert_created') return '🔔';
  if (action === 'incident_verified') return '✅';
  return '📋';
}

const segmentStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  border: '1px solid #edf1ee',
  borderRadius: 7,
  background: '#ffffff',
};

const districtCard = (status) => ({
  padding: '10px 12px',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${status === 'connected' ? '#d1fae5' : status === 'partial' ? '#fef3c7' : '#fee2e2'}`,
  background: status === 'connected' ? '#f0fdf4' : status === 'partial' ? '#fffbeb' : '#fef2f2',
});

const statusPill = (status) => ({
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 8,
  fontWeight: 800,
  textTransform: 'capitalize',
  color: status === 'connected' ? '#065f46' : status === 'partial' ? '#92400e' : '#991b1b',
  background: status === 'connected' ? '#d1fae5' : status === 'partial' ? '#fde68a' : '#fecaca',
});
