import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';

const TONE_ICON = { amber: 'cloud', blue: 'route', green: 'report' };
const CAN_CREATE = ['field', 'logistics', 'official'];

export default function AlertsList({ notify }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'Route update', tone: 'blue', icon: 'route', title: '', text: '', road: '', severity: 'minor' });

  const load = () => {
    return api.alerts()
      .then((res) => {
        setAlerts(res.alerts || []);
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Unable to load network alerts');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.text) return;
    try {
      await api.createAlert(form);
      setForm({ type: 'Route update', tone: 'blue', icon: 'route', title: '', text: '', road: '', severity: 'minor' });
      setShowForm(false);
      load();
      notify && notify('Alert published to the network.');
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteAlert = async (id) => {
    if (!window.confirm('Delete this alert from the regional network?')) return;
    try {
      await api.deleteAlert(id);
      load();
      notify && notify('Alert deleted.');
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    return true;
  });

  const severeCount = alerts.filter((a) => a.severity === 'severe' || a.severity === 'critical').length;
  const moderateCount = alerts.filter((a) => a.severity === 'moderate').length;
  const minorCount = alerts.filter((a) => a.severity === 'minor').length;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header Banner with Demo Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: '#f5faf7', border: '1px solid #dce8e2', padding: '12px 16px', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#175b4a' }}>📢 Regional Alert Center</span>
          <span style={{ fontSize: 10, background: '#e1ede7', color: '#175b4a', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
            {alerts.length} Supabase Network Alerts
          </span>
          <span style={{ fontSize: 10, background: '#fff3d6', color: '#8a6200', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
            Demo Operational Data
          </span>
        </div>
        {CAN_CREATE.includes(user.role) && (
          <button onClick={() => setShowForm((v) => !v)} style={toggleBtn}>
            {showForm ? (t('alerts.cancel') || 'Cancel') : `+ ${t('alerts.raiseAlert') || 'Raise Network Alert'}`}
          </button>
        )}
      </div>

      {/* Severity Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setFilterSeverity('all')}
          style={filterTab(filterSeverity === 'all', '#1e745b')}
        >
          All Alerts ({alerts.length})
        </button>
        <button
          onClick={() => setFilterSeverity('severe')}
          style={filterTab(filterSeverity === 'severe', '#b5493a')}
        >
          🔴 Severe ({severeCount})
        </button>
        <button
          onClick={() => setFilterSeverity('moderate')}
          style={filterTab(filterSeverity === 'moderate', '#bd7e22')}
        >
          🟠 Moderate ({moderateCount})
        </button>
        <button
          onClick={() => setFilterSeverity('minor')}
          style={filterTab(filterSeverity === 'minor', '#2b765e')}
        >
          🟢 Minor ({minorCount})
        </button>
      </div>

      {/* Alert Creation Form */}
      {showForm && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid #c9ded5', borderRadius: 8, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={form.type} onChange={set('type')} style={inputStyle}>
              <option value="Weather watch">{t('alerts.typeWeather') || 'Weather watch'}</option>
              <option value="Route update">{t('alerts.typeRoute') || 'Route update'}</option>
              <option value="Field report">{t('alerts.typeField') || 'Field report'}</option>
            </select>
            <select value={form.tone} onChange={(e) => { const tone = e.target.value; setForm((p) => ({ ...p, tone, icon: TONE_ICON[tone] })); }} style={inputStyle}>
              <option value="amber">{t('alerts.toneAmber') || 'Weather (amber)'}</option>
              <option value="blue">{t('alerts.toneBlue') || 'Route (blue)'}</option>
              <option value="green">{t('alerts.toneGreen') || 'Field (green)'}</option>
            </select>
            <select value={form.severity} onChange={set('severity')} style={inputStyle}>
              <option value="minor">{t('enum.minor') || 'Minor'}</option>
              <option value="moderate">{t('enum.moderate') || 'Moderate'}</option>
              <option value="severe">{t('enum.severe') || 'Severe'}</option>
            </select>
          </div>
          <input value={form.title} onChange={set('title')} placeholder={t('alerts.titleHolder') || 'Alert title'} style={inputStyle} required/>
          <textarea value={form.text} onChange={set('text')} placeholder={t('alerts.detailsHolder') || 'Details for the network'} rows={2} style={{ ...inputStyle, height: 'auto', padding: 10 }} required/>
          <input value={form.road} onChange={set('road')} placeholder={t('alerts.roadHolder') || 'Related road/corridor (e.g. NH27, Brahmaputra NW-2)'} style={inputStyle}/>
          <button type="submit" style={btnStyle}>{t('alerts.publish') || 'Publish alert'}</button>
        </form>
      )}

      {/* Loading & Error States */}
      {loading && <p style={{ fontSize: 12, color: '#7c8f87' }}>Loading network alerts from live database…</p>}
      {error && (
        <div style={{ padding: '10px 14px', background: '#fdf2f2', border: '1px solid #f2c0c0', borderRadius: 6, color: '#a82c2c', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={load} style={{ border: 0, background: '#a82c2c', color: '#fff', borderRadius: 4, padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {/* Alerts Feed */}
      <div style={{ display: 'grid', gap: 10 }}>
        {!loading && filteredAlerts.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#7c8f87', border: '1px dashed #dce5df', borderRadius: 8 }}>
            {t('alerts.noAlerts') || 'No active alerts in this category.'}
          </div>
        )}
        {filteredAlerts.map((a) => (
          <div key={a.id} style={alertCard(a.tone, a.severity)}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontSize: 11, color: '#3c5c50' }}>{t(`enum.${a.type}`) || a.type}</b>
                  <span style={severityPill(a.severity)}>{a.severity}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <time style={{ fontSize: 10, color: '#889e94' }}>{new Date(a.createdAt).toLocaleString()}</time>
                  {(user.role === 'official' || a.createdBy === user.id) && (
                    <button onClick={() => deleteAlert(a.id)} style={deleteAlertBtn} title="Delete alert">✕</button>
                  )}
                </div>
              </div>
              <h4 style={{ fontSize: 13, margin: '6px 0 3px', color: '#1e483b' }}>{a.title}</h4>
              <p style={{ fontSize: 12, color: '#577267', margin: 0, lineHeight: 1.4 }}>{a.text}</p>
              {a.road && (
                <div style={{ fontSize: 10, color: '#7d9489', marginTop: 6, fontWeight: 700 }}>
                  📍 {t('report.road') || 'Affected corridor'}: <b>{a.road}</b>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const toggleBtn = { border: 0, background: '#1e745b', color: '#fff', borderRadius: 7, padding: '7px 14px', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const inputStyle = { height: 38, padding: '0 10px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 12, flex: 1 };
const btnStyle = { height: 38, border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const deleteAlertBtn = { border: 0, background: 'transparent', color: '#b5493a', fontSize: 12, cursor: 'pointer', padding: '0 4px', fontWeight: 800 };

const filterTab = (active, color) => ({
  padding: '5px 12px',
  borderRadius: 6,
  border: active ? `1px solid ${color}` : '1px solid #dce5df',
  background: active ? color : '#fff',
  color: active ? '#fff' : '#4a675d',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
});

const alertCard = (tone, severity) => {
  const borderColor = severity === 'severe' || severity === 'critical' ? '#d9534f' : tone === 'amber' ? '#e2ab3d' : tone === 'blue' ? '#3c779a' : '#337b60';
  return {
    padding: '12px 16px', borderRadius: 8, border: '1px solid #e1e9e3',
    borderLeft: `5px solid ${borderColor}`,
    background: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  };
};

const severityPill = (sev) => ({
  padding: '2px 7px', borderRadius: 12, fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
  color: sev === 'severe' || sev === 'critical' ? '#b5493a' : sev === 'moderate' ? '#bd7e22' : '#2b765e',
  background: sev === 'severe' || sev === 'critical' ? '#fbe9e6' : sev === 'moderate' ? '#fff5da' : '#e6f4ea',
});
