import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import VehicleTracker from './VehicleTracker';
import DriverAssignModal from './DriverAssignModal';
import { DRIVER_ROSTER } from '../services/driverService';
import { useTranslation } from '../hooks/useTranslation';

export default function LogisticsOverview({ navigate, notify }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [shipments, setShipments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [incidents, setIncidents] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([api.shipments(), api.vehicles(), api.reports().catch(() => ({ reports: [] }))])
      .then(([sRes, vRes, rRes]) => {
        setShipments(sRes.shipments || []);
        setVehicles(vRes.vehicles || []);
        setIncidents((rRes.reports || []).filter((r) => r.status !== 'resolved'));
        setError('');
      })
      .catch((err) => {
        setError(err.message || 'Unable to load shipments from Supabase.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const openAssignModal = (shp) => {
    setSelectedShipment({
      id: shp.id,
      title: `Shipment #${shp.id.slice(0, 8)}`,
      origin: (shp.originNode || 'GUWAHATI').toUpperCase(),
      dest: (shp.destinationNode || 'JORHAT').toUpperCase(),
    });
    setAssignModalOpen(true);
  };

  const handleDriverAssigned = async (driver, shp) => {
    try {
      const res = await api.assignDriver(shp.id, driver.id);
      setShipments(prev => prev.map(s => s.id === shp.id ? res.shipment : s));
      notify(`Driver ${driver.name} assigned to shipment.`);
      load();
    } catch (err) {
      notify(`Failed to assign driver: ${err.message}`);
    }
  };

  const handleStatusChange = async (shipmentId, newStatus) => {
    try {
      const res = await api.updateShipmentStatus(shipmentId, newStatus);
      setShipments(prev => prev.map(s => s.id === shipmentId ? res.shipment : s));
      notify(`Shipment status updated to ${newStatus.toUpperCase()}`);
    } catch (err) {
      notify(`Failed to update status: ${err.message}`);
    }
  };

  const planned = shipments.filter((s) => s.status === 'planned' || s.status === 'assigned' || s.status === 'loading').length;
  const inTransit = shipments.filter((s) => s.status === 'in_transit').length;
  const delayed = shipments.filter((s) => s.status === 'delayed').length;
  const delivered = shipments.filter((s) => s.status === 'delivered').length;

  const filteredShipments = shipments.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchOrigin = (s.originNode || '').toLowerCase().includes(q);
      const matchDest = (s.destinationNode || '').toLowerCase().includes(q);
      const matchCargo = (s.cargoType || '').toLowerCase().includes(q);
      const matchId = (s.id || '').toLowerCase().includes(q);
      if (!matchOrigin && !matchDest && !matchCargo && !matchId) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Logistics Operator Banner */}
      <section className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, #1b5344, #123d32)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#b9ead7' }}>
              {user.role === 'official' ? (t('logistics.officialView') || 'GOVERNMENT OFFICIAL LOGISTICS VIEW') : (t('logistics.operatorRoom') || 'LOGISTICS OPERATOR CONTROL ROOM')}
            </div>
            <h2 style={{ color: '#fff', fontSize: 20, margin: '4px 0 2px' }}>{user.name}</h2>
            <div style={{ fontSize: 11, color: '#d2f2e5' }}>
              {user.role === 'official' ? `${t('logistics.department') || 'Department'}: ${user.department || 'DoNER / Disaster Management'}` : `${t('logistics.company') || 'Company'}: ${user.organisation || 'NER Freight Movers'} · ${t('logistics.hub') || 'Hub'}: ${user.hub || 'Khanapara Multimodal Hub'}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#d2f2e5', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 6 }}>
              Demo Operational Data
            </span>
            <button onClick={() => setAssignModalOpen(true)} style={{ padding: '9px 15px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 7, background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
              👤 {t('logistics.assignDriver') || 'Assign Driver (10 Roster)'}
            </button>
            <button onClick={() => navigate('Route planner')} style={{ padding: '9px 15px', border: 0, borderRadius: 7, background: '#ccf363', color: '#12483a', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
              + {t('logistics.planCargo') || 'Plan Cargo Shipment'}
            </button>
          </div>
        </div>
      </section>

      {/* Shipment Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <StatCard label={t('logistics.totalShipments') || 'TOTAL SHIPMENTS'} value={shipments.length} color="#176d55" />
        <StatCard label={t('logistics.inTransit') || 'IN TRANSIT'} value={inTransit} color="#2b765e" />
        <StatCard label={t('logistics.planned') || 'PLANNED / ASSIGNED'} value={planned} color="#bd7e22" />
        <StatCard label="DELAYED SHIPMENTS" value={delayed} color={delayed > 0 ? '#b91c1c' : '#176d55'} />
        <StatCard label="DELIVERED" value={delivered} color="#047857" />
        <StatCard label={t('logistics.regDrivers') || 'REGISTERED DRIVERS'} value="10 Active" color="#3c5c50" />
      </div>

      {/* Field Officer Disruption Alerts Impacting Logistics */}
      {incidents.length > 0 && (
        <section className="card" style={{ padding: '14px 18px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#92400e' }}>
                ⚠️ ACTIVE CORRIDOR HAZARDS REPORTED BY FIELD OFFICERS ({incidents.length})
              </span>
            </div>
            <button
              onClick={() => navigate('Route planner')}
              style={{ padding: '4px 10px', border: 0, borderRadius: 5, background: '#92400e', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              Reroute Critical Shipments
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
            {incidents.slice(0, 3).map((inc) => (
              <div key={inc.id} style={{ padding: '8px 12px', background: '#fff', border: '1px solid #fef3c7', borderRadius: 6, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: '#1f2937' }}>[{inc.category?.toUpperCase().replace('_', ' ')}] {inc.title}</b>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase' }}>{inc.severity}</span>
                </div>
                <div style={{ color: '#6b7280', fontSize: 10, marginTop: 2 }}>
                  Corridor: <b>{inc.road || 'Regional Corridor'}</b> · Delay Est: <b>{inc.estimatedDelayMinutes || 45} mins</b>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="dashboard-grid">
        {/* Fleet Vehicle Tracker */}
        <section className="card" style={{ padding: '20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>{t('logistics.activeFleet') || 'ACTIVE FLEET GPS'}</small>
              <h3 style={{ marginTop: 4, color: '#25483d', fontSize: 16 }}>{t('logistics.vehTelemetry') || '12 Regional Vehicles & Telemetry'}</h3>
            </div>
            <span style={{ fontSize: 10, color: '#6b7280' }}>Supabase Live</span>
          </header>
          <VehicleTracker notify={notify} />
        </section>

        {/* Active Shipments Queue with Status Control & Driver Assignment */}
        <section className="card" style={{ padding: '20px' }}>
          <header style={{ padding: 0, minHeight: 'auto', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <small style={{ color: '#059669', fontSize: 9, fontWeight: 800 }}>{t('logistics.cargoQueue') || 'CARGO DISPATCH QUEUE'}</small>
              <h3 style={{ margin: '4px 0 0', fontSize: 16, color: '#25483d' }}>
                {t('logistics.activeShipments') || 'Shipments & Multimodal Freight'} ({shipments.length})
              </h3>
            </div>
            <button
              onClick={load}
              style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
            >
              🔄 Refresh
            </button>
          </header>

          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search origin, destination, cargo…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: 34, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, flex: 1, minWidth: 160 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: 34, padding: '0 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11 }}
            >
              <option value="all">All Statuses ({shipments.length})</option>
              <option value="planned">Planned</option>
              <option value="assigned">Assigned</option>
              <option value="loading">Loading</option>
              <option value="in_transit">In Transit</option>
              <option value="delayed">Delayed</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>

          {loading && <p style={{ fontSize: 11, color: '#7c8f87' }}>{t('logistics.loadingShipments') || 'Loading shipments from Supabase…'}</p>}
          {!loading && error && <p style={{ fontSize: 11, color: '#b91c1c' }}>{error}</p>}
          {!loading && !error && filteredShipments.length === 0 && (
            <p style={{ fontSize: 11, color: '#7c8f87' }}>No cargo shipments matching current selection.</p>
          )}

          <div style={{ display: 'grid', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
            {filteredShipments.map((s, idx) => {
              const assignedDriver = DRIVER_ROSTER.find(d => d.id === s.driverId) || DRIVER_ROSTER[idx % 10];
              const linkedVehicle = vehicles.find(v => v.id === s.vehicleId || v.driverId === s.driverId) || { vehicleNumber: assignedDriver?.vehicleNumber || 'AS 01 K 4309' };

              return (
                <div key={s.id} style={shipmentCardStyle(s.status)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#25483d', flexWrap: 'wrap', gap: 6 }}>
                    <b>{t(`enum.${s.originNode}`) || (s.originNode || 'GUWAHATI').toUpperCase()} → {t(`enum.${s.destinationNode}`) || (s.destinationNode || 'JORHAT').toUpperCase()}</b>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={statusPill(s.status)}>{t(`enum.${s.status}`) || s.status.replace('_', ' ').toUpperCase()}</span>
                      <select
                        value={s.status}
                        onChange={(e) => handleStatusChange(s.id, e.target.value)}
                        style={{ fontSize: 9, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
                        title="Update Status in Supabase"
                      >
                        <option value="planned">Planned</option>
                        <option value="assigned">Assigned</option>
                        <option value="loading">Loading</option>
                        <option value="in_transit">In Transit</option>
                        <option value="delayed">Delayed</option>
                        <option value="delivered">Delivered</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: '#4b5563', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📦 <b>Cargo:</b> {s.cargoType || 'General Cargo'}</span>
                    <span>⚡ <b>Priority:</b> <span style={priorityStyle(s.priority)}>{(s.priority || 'normal').toUpperCase()}</span></span>
                    <span>⏱️ <b>ETA:</b> {s.etaMinutes ? `${Math.floor(s.etaMinutes/60)}h ${s.etaMinutes%60}m` : '3h 30m'}</span>
                    <span>🚛 <b>Vehicle:</b> {linkedVehicle.vehicleNumber}</span>
                  </div>

                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2ede6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontSize: 10, color: '#165744', fontWeight: 700 }}>
                      👤 {t('logistics.driver') || 'Driver'}: <b>{s.driverId ? assignedDriver.name : `${assignedDriver.name} (Assigned)`}</b>
                    </div>
                    <button
                      onClick={() => openAssignModal(s)}
                      style={{ padding: '5px 10px', border: '1px solid #c0d8cb', borderRadius: 5, background: '#f0f9f4', color: '#176d55', fontSize: 9, fontWeight: 800, cursor: 'pointer', marginLeft: 'auto' }}
                    >
                      {t('logistics.reassign') || 'Reassign Driver ➔'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Driver Assignment Modal */}
      <DriverAssignModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        targetItem={selectedShipment || { title: 'Cargo Shipment' }}
        onDriverAssigned={handleDriverAssigned}
        notify={notify}
      />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ padding: '14px 16px', border: '1px solid #e1e9e3', borderRadius: 8, background: '#fff' }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#8aa097', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#25483d', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function shipmentCardStyle(s) {
  const isDelayed = s === 'delayed';
  return {
    padding: '12px 14px',
    border: `1px solid ${isDelayed ? '#fecaca' : '#edf1ee'}`,
    borderRadius: 8,
    background: isDelayed ? '#fff8f8' : '#fbfdfb',
  };
}

function priorityStyle(p) {
  const isHigh = p === 'high' || p === 'urgent' || p === 'critical' || p === 'emergency' || p === 'Emergency';
  return {
    color: isHigh ? '#b91c1c' : '#065f46',
    fontWeight: 800,
  };
}

function statusPill(s) {
  const map = {
    planned: { color: '#4b5563', bg: '#f3f4f6' },
    assigned: { color: '#1e40af', bg: '#dbeafe' },
    loading: { color: '#92400e', bg: '#fef3c7' },
    in_transit: { color: '#065f46', bg: '#d1fae5' },
    delayed: { color: '#991b1b', bg: '#fee2e2' },
    delivered: { color: '#047857', bg: '#ecfdf5' },
  };
  const theme = map[s] || map.planned;
  return {
    padding: '2px 7px',
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 800,
    textTransform: 'uppercase',
    color: theme.color,
    background: theme.bg,
  };
}
