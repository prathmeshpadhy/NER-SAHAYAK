import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { watchGpsPosition } from '../services/gpsHelper';
import { useTranslation } from '../hooks/useTranslation';

export default function VehicleTracker({ notify }) {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({ vehicleNumber: '', cargoType: '', originNode: '', destinationNode: '', vehicleType: 'Heavy Truck' });
  const [tracking, setTracking] = useState({}); // vehicleId -> bool
  const watchers = useRef({});

  const load = () => {
    return api.vehicles()
      .then((res) => {
        setVehicles(res.vehicles || []);
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Unable to load vehicle telemetry');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.nodes().then((res) => setNodes(res.nodes || [])).catch(() => {});
    load();
    const interval = setInterval(load, 15000);
    const watcherMap = watchers.current;
    return () => {
      clearInterval(interval);
      Object.values(watcherMap).forEach((unwatch) => typeof unwatch === 'function' && unwatch());
    };
  }, []);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const registerVehicle = async (e) => {
    e.preventDefault();
    if (!form.vehicleNumber || !form.originNode || !form.destinationNode) return;
    try {
      const res = await api.createVehicle(form);
      setVehicles((prev) => [res.vehicle, ...prev]);
      setForm({ vehicleNumber: '', cargoType: '', originNode: '', destinationNode: '', vehicleType: 'Heavy Truck' });
      setShowRegister(false);
      notify && notify(`${res.vehicle.vehicleNumber} registered for live tracking.`);
    } catch (err) {
      notify && notify(`Could not register vehicle: ${err.message}`);
    }
  };

  const toggleTracking = (vehicle) => {
    const isTracking = !!watchers.current[vehicle.id];
    if (isTracking) {
      if (typeof watchers.current[vehicle.id] === 'function') {
        watchers.current[vehicle.id]();
      }
      delete watchers.current[vehicle.id];
      setTracking((prev) => ({ ...prev, [vehicle.id]: false }));
      notify && notify(`GPS tracking stopped for ${vehicle.vehicleNumber}`);
      return;
    }

    const unwatch = watchGpsPosition(
      async (pos) => {
        try {
          const res = await api.pingVehicle(vehicle.id, { lat: pos.lat, lng: pos.lng });
          setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? res.vehicle : v)));
        } catch (_) {
          setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? { ...v, lat: pos.lat, lng: pos.lng, lastUpdated: new Date().toISOString() } : v)));
        }
      },
      () => {}
    );

    watchers.current[vehicle.id] = unwatch;
    setTracking((prev) => ({ ...prev, [vehicle.id]: true }));
    notify && notify(`GPS tracking active for ${vehicle.vehicleNumber} (NH27 corridor fix active)`);
  };

  const nodeName = (id) => nodes.find((n) => n.id === id)?.name || id;

  const filteredVehicles = vehicles.filter((v) => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const numMatch = (v.vehicleNumber || '').toLowerCase().includes(q);
      const cargoMatch = (v.cargoType || '').toLowerCase().includes(q);
      const typeMatch = (v.vehicleType || '').toLowerCase().includes(q);
      const originMatch = (v.originNode || '').toLowerCase().includes(q);
      const destMatch = (v.destinationNode || '').toLowerCase().includes(q);
      return numMatch || cargoMatch || typeMatch || originMatch || destMatch;
    }
    return true;
  });

  const inTransitCount = vehicles.filter((v) => v.status === 'in_transit').length;
  const delayedCount = vehicles.filter((v) => v.status === 'delayed').length;
  const idleCount = vehicles.filter((v) => v.status === 'idle' || v.status === 'available').length;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Header Banner & Demo Indicator */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, background: '#f5faf7', border: '1px solid #dce8e2', padding: '12px 16px', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#175b4a' }}>🚛 Live Fleet Telematics</span>
          <span style={{ fontSize: 10, background: '#e1ede7', color: '#175b4a', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
            {vehicles.length} Supabase Fleet Vehicles
          </span>
          <span style={{ fontSize: 10, background: '#fff3d6', color: '#8a6200', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
            Demo Operational Data
          </span>
        </div>
        <button onClick={() => setShowRegister(!showRegister)} style={btnStyle}>
          {showRegister ? '✕ Close Registration' : '+ Register New Fleet Vehicle'}
        </button>
      </div>

      {/* Fleet KPI Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <div style={kpiBox('#176d55', '#e6f4ea')}>
          <span style={kpiLabel}>IN TRANSIT</span>
          <b style={kpiVal}>{inTransitCount}</b>
        </div>
        <div style={kpiBox('#b5493a', '#fbe9e6')}>
          <span style={kpiLabel}>DELAYED</span>
          <b style={kpiVal}>{delayedCount}</b>
        </div>
        <div style={kpiBox('#61776d', '#f1f5f2')}>
          <span style={kpiLabel}>IDLE / AVAILABLE</span>
          <b style={kpiVal}>{idleCount}</b>
        </div>
        <div style={kpiBox('#205547', '#e8f3ef')}>
          <span style={kpiLabel}>TOTAL MONITORED</span>
          <b style={kpiVal}>{vehicles.length}</b>
        </div>
      </div>

      {/* Registration Form (Collapsible) */}
      {showRegister && (
        <form onSubmit={registerVehicle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr)) auto', gap: 10, alignItems: 'end', padding: 14, background: '#fff', border: '1px solid #c9ded5', borderRadius: 8 }}>
          <label style={labelStyle}>{t('tracker.vehicleNumber') || 'Vehicle number'}<input value={form.vehicleNumber} onChange={set('vehicleNumber')} style={inputStyle} placeholder="AS 01 K 4309" required/></label>
          <label style={labelStyle}>Vehicle Type
            <select value={form.vehicleType} onChange={set('vehicleType')} style={inputStyle}>
              <option value="Heavy Truck">Heavy Truck (16T)</option>
              <option value="Medium Truck">Medium Truck (8T)</option>
              <option value="Refrigerated Van">Refrigerated Van</option>
              <option value="Light Commercial Vehicle">Light Commercial Vehicle</option>
              <option value="Tanker">Fuel Tanker</option>
            </select>
          </label>
          <label style={labelStyle}>{t('route.cargo') || 'Cargo'}<input value={form.cargoType} onChange={set('cargoType')} style={inputStyle} placeholder="Medical supplies / Agri"/></label>
          <label style={labelStyle}>{t('route.origin') || 'Origin'}
            <select value={form.originNode} onChange={set('originNode')} style={inputStyle} required>
              <option value="">{t('common.select') || 'Select…'}</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{t(`enum.${n.id}`) || n.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>{t('route.dest') || 'Destination'}
            <select value={form.destinationNode} onChange={set('destinationNode')} style={inputStyle} required>
              <option value="">{t('common.select') || 'Select…'}</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{t(`enum.${n.id}`) || n.name}</option>)}
            </select>
          </label>
          <button type="submit" style={btnStyle}>{t('tracker.register') || 'Register'}</button>
        </form>
      )}

      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', 'in_transit', 'delayed', 'available'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: statusFilter === st ? '1px solid #1e745b' : '1px solid #dce5df',
                background: statusFilter === st ? '#1e745b' : '#fff',
                color: statusFilter === st ? '#fff' : '#4a675d',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {st === 'all' ? `All Vehicles (${vehicles.length})` : st.replace('_', ' ')}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by vehicle #, cargo, corridor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ height: 34, padding: '0 10px', border: '1px solid #dce5df', borderRadius: 6, fontSize: 11, minWidth: 220 }}
        />
      </div>

      {/* Loading & Error States */}
      {loading && <p style={{ fontSize: 12, color: '#7c8f87' }}>Loading vehicle fleet from live database…</p>}
      {error && (
        <div style={{ padding: '10px 14px', background: '#fdf2f2', border: '1px solid #f2c0c0', borderRadius: 6, color: '#a82c2c', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={load} style={{ border: 0, background: '#a82c2c', color: '#fff', borderRadius: 4, padding: '4px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {/* Vehicle Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {!loading && filteredVehicles.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#7c8f87', border: '1px dashed #dce5df', borderRadius: 8, gridColumn: '1 / -1' }}>
            No vehicles match your selected filter criteria.
          </div>
        )}
        {filteredVehicles.map((v) => (
          <div key={v.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <b style={{ fontSize: 13, color: '#174f40', letterSpacing: 0.5 }}>{v.vehicleNumber}</b>
                <span style={{ fontSize: 10, color: '#688278', marginLeft: 8, background: '#eef5f1', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {v.vehicleType || 'Heavy Truck'}
                </span>
              </div>
              <span style={statusPill(v.status)}>{t(`enum.${v.status}`) || v.status.replace('_', ' ')}</span>
            </div>

            <div style={{ fontSize: 11, color: '#3f5951', marginTop: 4, lineHeight: 1.4 }}>
              <b>Cargo:</b> {v.cargoType || 'General cargo'} {v.capacityTonnes ? `(${v.capacityTonnes}T)` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#5e756c', marginTop: 2 }}>
              <b>Corridor:</b> {t(`enum.${v.originNode}`) || nodeName(v.originNode)} → {t(`enum.${v.destinationNode}`) || nodeName(v.destinationNode)}
            </div>

            <div style={{ fontSize: 10, color: '#7f948b', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f4f1', paddingTop: 6 }}>
              <span>
                {v.lat ? `📍 ${Number(v.lat).toFixed(4)}, ${Number(v.lng).toFixed(4)}` : '📡 No GPS fix'}
              </span>
              <span>
                Updated: {v.lastUpdated ? new Date(v.lastUpdated).toLocaleTimeString() : 'Just now'}
              </span>
            </div>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => toggleTracking(v)} style={tracking[v.id] ? stopBtn : startBtn}>
                {tracking[v.id] ? `🔴 ${t('tracker.stopGPS') || 'Stop GPS broadcast'}` : `📡 ${t('tracker.startGPS') || 'Broadcast GPS Telemetry'}`}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle = { display: 'grid', gap: 4, fontSize: 10, fontWeight: 800, color: '#3f5951' };
const inputStyle = { height: 36, padding: '0 8px', border: '1px solid #dce5df', borderRadius: 6, fontSize: 11 };
const btnStyle = { height: 36, padding: '0 14px', border: 0, borderRadius: 6, color: '#fff', background: '#1e745b', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const cardStyle = { padding: '14px 16px', border: '1px solid #dce8e1', borderRadius: 8, background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' };
const startBtn = { border: 0, background: '#1e745b', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 10, fontWeight: 800, cursor: 'pointer' };
const stopBtn = { border: 0, background: '#b5493a', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 10, fontWeight: 800, cursor: 'pointer' };

const kpiBox = (color, bg) => ({
  padding: '10px 14px', borderRadius: 7, border: '1px solid #e1e9e3', background: bg || '#fff',
  display: 'flex', flexDirection: 'column', gap: 2,
});
const kpiLabel = { fontSize: 9, fontWeight: 800, color: '#5f776d', letterSpacing: 0.5 };
const kpiVal = { fontSize: 18, fontWeight: 800, color: '#17483a' };

const statusPill = (status) => ({
  padding: '3px 8px', borderRadius: 20, fontSize: 9, fontWeight: 800, textTransform: 'capitalize',
  color: status === 'in_transit' ? '#176d55' : status === 'delayed' ? '#b5493a' : '#5a7369',
  background: status === 'in_transit' ? '#e6f4ea' : status === 'delayed' ? '#fbe9e6' : '#edf3f0',
});
