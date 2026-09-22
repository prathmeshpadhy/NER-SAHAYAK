import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import FieldReportForm from './FieldReportForm';
import IncidentDetailModal from './IncidentDetailModal';
import AlertResponseModal from './AlertResponseModal';
import { useTranslation } from '../hooks/useTranslation';

export default function FieldOfficerOverview({ navigate, notify }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [myReports, setMyReports] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedAlertForResponse, setSelectedAlertForResponse] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.myReports(), api.reports()])
      .then(([mineRes, allRes]) => {
        setMyReports(mineRes.reports || []);
        setAllReports(allRes.reports || []);
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Unable to load field reports');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const openCount = allReports.filter((r) => r.status !== 'resolved').length;
  const resolvedCount = allReports.filter((r) => r.status === 'resolved').length;
  const criticalCount = allReports.filter((r) => r.severity === 'critical' || r.severity === 'major').length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Field Unit Banner with Demo Data Badge */}
      <section className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, #2b574a, #1a4439)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#b9ead7' }}>{t('field.commandTitle') || 'FIELD OFFICER COMMAND & INCIDENT RESPONSE'}</span>
              <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                Demo Operational Data
              </span>
            </div>
            <h2 style={{ color: '#fff', fontSize: 20, margin: '4px 0 2px' }}>{user.name}</h2>
            <div style={{ fontSize: 11, color: '#d2f2e5' }}>
              {t('field.unit') || 'Unit'}: <b>{user.organisation || 'PWD Field Unit'}</b> · {t('driver.district') || 'District'}: <b>{user.district || 'Nagaon'}</b>
            </div>
          </div>
          <button onClick={() => navigate('Field reports')} style={{ padding: '9px 15px', border: 0, borderRadius: 7, background: '#ccf363', color: '#12483a', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
            {t('field.submitNew') || '+ Submit New Incident Report'}
          </button>
        </div>
      </section>

      {/* Report Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <StatCard label="TOTAL NETWORK INCIDENTS" value={allReports.length} color="#176d55" />
        <StatCard label="MY FILED REPORTS" value={myReports.length} color="#2b574a" />
        <StatCard label="ACTIVE / OPEN DISRUPTIONS" value={openCount} color="#b5493a" />
        <StatCard label="CRITICAL HAZARDS" value={criticalCount} color="#c0392b" />
        <StatCard label="RESOLVED INCIDENTS" value={resolvedCount} color="#2b765e" />
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fdf2f2', border: '1px solid #f2c0c0', borderRadius: 6, color: '#a82c2c', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={load} style={{ border: 0, background: '#a82c2c', color: '#fff', borderRadius: 4, padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>Retry</button>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Submit Report Widget */}
        <section className="card" style={{ padding: '20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 14 }}>
            <div>
              <small>{t('field.quickIncident') || 'QUICK INCIDENT FILING'}</small>
              <h3 style={{ marginTop: 4, color: '#25483d', fontSize: 16 }}>{t('field.fileReport') || 'File Field Report (Geo-tagged)'}</h3>
            </div>
          </header>
          <FieldReportForm notify={notify} />
        </section>

        {/* My Recent Reports */}
        <section className="card" style={{ padding: '20px' }}>
          <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800 }}>{t('field.yourSubmitted') || 'RECENT NETWORK INCIDENTS'}</small>
          <h3 style={{ margin: '6px 0 14px', fontSize: 16, color: '#25483d' }}>Live Supabase Incident Stream</h3>
          {loading && <p style={{ fontSize: 11, color: '#7c8f87' }}>{t('field.loading') || 'Loading reports…'}</p>}
          {!loading && allReports.length === 0 && (
            <p style={{ fontSize: 11, color: '#7c8f87' }}>No incident reports found in the network database.</p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {allReports.slice(0, 6).map((r) => {
              const hasGps = r.hasGps || (r.lat !== null && r.lat !== undefined && !isNaN(Number(r.lat)) && r.lng !== null && r.lng !== undefined && !isNaN(Number(r.lng)));
              const hasPhoto = Boolean(r.photoDataUrl && typeof r.photoDataUrl === 'string' && r.photoDataUrl.trim().length > 0);

              return (
                <div key={r.id} style={{ padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 8, background: '#fbfdfb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#61776d', flexWrap: 'wrap', gap: 4 }}>
                    <b style={{ color: '#25483d' }}>[{r.category?.toUpperCase().replace('_', ' ')}] {r.title}</b>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {hasPhoto && (
                        <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                          📷 Photo
                        </span>
                      )}
                      <span style={statusPill(r.status)}>{r.status}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#7a8f85', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                    <span>{r.road ? `Corridor: ${r.road}` : 'Location: Geo-tagged'}</span>
                    <span style={{ color: hasGps ? '#0f766e' : '#64748b' }}>
                      {hasGps ? `🌐 Fix: ${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}` : '🌐 GPS: Unavailable'}
                    </span>
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
                          text: r.description || `${r.category} on ${r.road}`,
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
        </section>
      </div>

      {/* Incident Evidence Modal */}
      <IncidentDetailModal
        incident={selectedReport}
        onClose={() => setSelectedReport(null)}
      />

      {/* Field Officer Alert Response Modal */}
      {selectedAlertForResponse && (
        <AlertResponseModal
          alert={selectedAlertForResponse}
          onClose={() => setSelectedAlertForResponse(null)}
          onResponseSuccess={() => {
            load();
            setSelectedAlertForResponse(null);
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ padding: '14px 16px', border: '1px solid #e1e9e3', borderRadius: 8, background: '#fff' }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#8aa097', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#25483d', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function statusPill(s) {
  const norm = (s || '').toLowerCase();
  const isResolved = norm === 'resolved';
  const isVerified = norm === 'verified';
  const isCritical = norm === 'active' || norm === 'open' || norm === 'reported';
  return {
    padding: '2px 7px', borderRadius: 12, fontSize: 8, fontWeight: 800, textTransform: 'uppercase',
    color: isResolved ? '#176d55' : isVerified ? '#20639b' : isCritical ? '#b5493a' : '#bd7e22',
    background: isResolved ? '#e6f4ea' : isVerified ? '#e3f2fd' : isCritical ? '#fbe9e6' : '#fff5da',
  };
}
