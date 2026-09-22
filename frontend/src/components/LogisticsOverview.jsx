import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import VehicleTracker from './VehicleTracker';
import DriverAssignModal from './DriverAssignModal';
import IncidentDetailModal from './IncidentDetailModal';
import AlertResponseModal from './AlertResponseModal';
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
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedAlertForResponse, setSelectedAlertForResponse] = useState(null);

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
  const delayed = shipments.filter((s) => s.status === 'delayed' || (s.estimatedDelayMinutes > 0)).length;
  const delivered = shipments.filter((s) => s.status === 'delivered').length;
  const atRiskCount = shipments.filter((s) => s.isDisrupted || s.isBlocked || (s.estimatedDelayMinutes > 0)).length;

  const filteredShipments = shipments.filter((s) => {
    if (statusFilter === 'at_risk') {
      if (!s.isDisrupted && !s.isBlocked && !(s.estimatedDelayMinutes > 0)) return false;
    } else if (statusFilter === 'blocked') {
      if (!s.isBlocked && s.status !== 'blocked') return false;
    } else if (statusFilter !== 'all' && s.status !== statusFilter) {
      return false;
    }
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
        <StatCard label="AT-RISK / DISRUPTED" value={atRiskCount} color={atRiskCount > 0 ? '#b91c1c' : '#176d55'} />
        <StatCard label="DELAYED SHIPMENTS" value={delayed} color={delayed > 0 ? '#b91c1c' : '#176d55'} />
        <StatCard label="DELIVERED" value={delivered} color="#047857" />
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
            {incidents.slice(0, 3).map((inc) => {
              const hasGps = inc.hasGps || (inc.lat !== null && inc.lat !== undefined && !isNaN(Number(inc.lat)) && inc.lng !== null && inc.lng !== undefined && !isNaN(Number(inc.lng)));
              const hasPhoto = Boolean(inc.photoDataUrl && typeof inc.photoDataUrl === 'string' && inc.photoDataUrl.trim().length > 0);

              return (
                <div key={inc.id} style={{ padding: '10px 12px', background: '#fff', border: '1px solid #fef3c7', borderRadius: 6, fontSize: 11, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                      <b style={{ color: '#1f2937' }}>[{inc.category?.toUpperCase().replace('_', ' ')}] {inc.title}</b>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase' }}>{inc.severity}</span>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 10, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>Corridor: <b>{inc.road || 'Regional Corridor'}</b></span>
                      <span>Delay: <b>{inc.estimatedDelayMinutes || 45}m</b></span>
                      <span style={{ color: hasGps ? '#0f766e' : '#64748b' }}>
                        {hasGps ? `🌐 Fix: ${Number(inc.lat).toFixed(4)}, ${Number(inc.lng).toFixed(4)}` : '🌐 GPS: Unavailable'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #fde68a' }}>
                    <span style={{ fontSize: 9, color: hasPhoto ? '#0369a1' : '#64748b', fontWeight: 700 }}>
                      {hasPhoto ? '📷 Photo Attached' : '⚪ No Photo'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedIncident(inc)}
                        style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, borderRadius: 4, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', cursor: 'pointer' }}
                      >
                        Inspect Evidence
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAlertForResponse({
                          id: inc.id,
                          title: inc.title,
                          text: inc.description || `${inc.category} on ${inc.road}`,
                          road: inc.road,
                          severity: inc.severity,
                          incidentId: inc.id,
                          type: inc.category,
                          createdAt: inc.createdAt || inc.created_at,
                          responseStatus: inc.status === 'resolved' ? 'resolved' : 'in_progress',
                        })}
                        style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, borderRadius: 4, border: '1px solid #1e745b', background: '#1e745b', color: '#fff', cursor: 'pointer' }}
                      >
                        Dispatch / Action ➔
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
              <option value="at_risk">⚠️ At-Risk / Disrupted ({atRiskCount})</option>
              <option value="planned">Planned</option>
              <option value="assigned">Assigned</option>
              <option value="loading">Loading</option>
              <option value="in_transit">In Transit</option>
              <option value="delayed">Delayed</option>
              <option value="delivered">Delivered</option>
              <option value="blocked">Blocked</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading && <p style={{ fontSize: 11, color: '#7c8f87' }}>{t('logistics.loadingShipments') || 'Loading shipments from Supabase…'}</p>}
          {!loading && error && <p style={{ fontSize: 11, color: '#b91c1c' }}>{error}</p>}
          {!loading && !error && filteredShipments.length === 0 && (
            <p style={{ fontSize: 11, color: '#7c8f87' }}>No cargo shipments matching current selection.</p>
          )}

          <div style={{ display: 'grid', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
            {filteredShipments.map((s, idx) => {
              const assignedDriver = DRIVER_ROSTER.find(d => d.id === s.driverId) || DRIVER_ROSTER[idx % 10];
              const linkedVehicle = s.vehicle || vehicles.find(v => v.id === s.vehicleId || v.driverId === s.driverId) || { vehicleNumber: assignedDriver?.vehicleNumber || 'AS 01 K 4309', locationSource: 'STATIC_DEMO' };

              const isDisrupted = Boolean(s.isDisrupted || s.isBlocked || (s.estimatedDelayMinutes > 0));
              const baseEtaText = s.baseDurationMinutes !== null && s.baseDurationMinutes !== undefined
                ? `${Math.floor(s.baseDurationMinutes / 60)}h ${s.baseDurationMinutes % 60}m`
                : (s.etaMinutes ? `${Math.floor(s.etaMinutes / 60)}h ${s.etaMinutes % 60}m` : 'N/A');

              const currentEtaText = s.isBlocked
                ? 'UNAVAILABLE (Blocked)'
                : (s.currentEtaMinutes !== null && s.currentEtaMinutes !== undefined
                    ? `${Math.floor(s.currentEtaMinutes / 60)}h ${s.currentEtaMinutes % 60}m`
                    : baseEtaText);

              return (
                <div key={s.id} style={shipmentCardStyle(s.status, isDisrupted)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#25483d', flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <b>{t(`enum.${s.originNode}`) || (s.originNode || 'GUWAHATI').toUpperCase()} → {t(`enum.${s.destinationNode}`) || (s.destinationNode || 'JORHAT').toUpperCase()}</b>
                      {isDisrupted && (
                        <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, color: s.isBlocked ? '#991b1b' : '#b45309', background: s.isBlocked ? '#fee2e2' : '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>
                          {s.isBlocked ? 'BLOCKED' : (s.accessibilityState ? s.accessibilityState.replace('_', ' ') : 'DISRUPTED')}
                        </span>
                      )}
                    </div>
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
                        <option value="blocked">Blocked</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: '#4b5563', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>📦 <b>Cargo:</b> {s.cargoType || 'General Cargo'}</span>
                    <span>⚡ <b>Priority:</b> <span style={priorityStyle(s.priority)}>{(s.priority || 'normal').toUpperCase()}</span></span>
                    <span>⏱️ <b>Base ETA:</b> {baseEtaText}</span>
                    {isDisrupted ? (
                      <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                        ⏱️ <b>Current ETA:</b> {currentEtaText} ({s.isBlocked ? 'Blocked' : `+${s.estimatedDelayMinutes}m delay`})
                      </span>
                    ) : (
                      <span style={{ color: '#047857', fontWeight: 600 }}>✅ On Schedule</span>
                    )}
                    <span>🚛 <b>Vehicle:</b> {linkedVehicle.vehicleNumber}</span>
                    <span style={locationSourceStyle(linkedVehicle.locationSource)}>
                      {locationSourceLabel(linkedVehicle.locationSource)}
                    </span>
                  </div>

                  {/* Active Corridor Disruption & Evidence Box */}
                  {isDisrupted && (
                    <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#991b1b' }}>
                          ⚠️ CORRIDOR DISRUPTION RISK: {s.accessibilityState ? s.accessibilityState.replace('_', ' ') : 'DISRUPTED'}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#991b1b' }}>
                          {s.isBlocked ? 'NO VIABLE ROAD' : `Estimated Delay: +${s.estimatedDelayMinutes} min`}
                        </span>
                      </div>

                      {s.affectedIncidents && s.affectedIncidents.length > 0 && (
                        <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                          {s.affectedIncidents.slice(0, 2).map((inc) => (
                            <div key={inc.id} style={{ fontSize: 9, color: '#7f1d1d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '4px 8px', borderRadius: 4, border: '1px solid #fed7d7' }}>
                              <span>
                                <b>[{inc.category?.toUpperCase()}]</b> {inc.title} ({inc.road || 'Corridor'})
                                {inc.hasGps ? ` · 🌐 Fix: ${Number(inc.lat).toFixed(3)}, ${Number(inc.lng).toFixed(3)}` : ' · 🌐 No GPS fix'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedIncident(inc)}
                                style={{ border: '1px solid #991b1b', background: '#991b1b', color: '#fff', borderRadius: 3, padding: '2px 6px', fontSize: 8, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Inspect Evidence
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {s.recommendedAlternative && (
                        <div style={{ marginTop: 6, padding: '6px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ fontSize: 9, color: '#166534', flex: 1 }}>
                            <b>🚆 RECOMMENDED MULTIMODAL ALTERNATIVE:</b> {s.recommendedAlternative.mode?.toUpperCase()} (Score: {s.recommendedAlternative.decisionScore || 98})
                            <div style={{ fontSize: 8, color: '#15803d', marginTop: 2 }}>{s.recommendedAlternative.reason}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate('Route planner')}
                            style={{ border: 0, background: '#16a34a', color: '#fff', borderRadius: 4, padding: '4px 8px', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                          >
                            Plan Bypass in Route Planner ➔
                          </button>
                        </div>
                      )}
                    </div>
                  )}

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

      {/* Incident Evidence Modal */}
      <IncidentDetailModal
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onLocateOnMap={() => navigate('Live map')}
      />

      {/* Logistics Response / Action Modal */}
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
      <div style={{ fontSize: 9, fontWeight: 800, color: '#8aa097', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#25483d', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function shipmentCardStyle(status, isDisrupted) {
  const isDelayed = status === 'delayed' || isDisrupted;
  return {
    padding: '12px 14px',
    border: `1px solid ${isDelayed ? '#fecaca' : '#edf1ee'}`,
    borderRadius: 8,
    background: isDelayed ? '#fffdfd' : '#fbfdfb',
  };
}

function priorityStyle(p) {
  const isHigh = p === 'high' || p === 'urgent' || p === 'critical' || p === 'emergency' || p === 'Emergency';
  return {
    color: isHigh ? '#b91c1c' : '#065f46',
    fontWeight: 800,
  };
}

function locationSourceStyle(source) {
  const isLive = source === 'LIVE_GPS';
  const isDemo = source === 'STATIC_DEMO';
  return {
    fontSize: 8,
    fontWeight: 800,
    padding: '1px 5px',
    borderRadius: 3,
    background: isLive ? '#dcfce7' : isDemo ? '#fef3c7' : '#f1f5f9',
    color: isLive ? '#15803d' : isDemo ? '#92400e' : '#475569',
    border: `1px solid ${isLive ? '#86efac' : isDemo ? '#fde68a' : '#cbd5e1'}`,
  };
}

function locationSourceLabel(source) {
  switch (source) {
    case 'LIVE_GPS': return '🟢 LIVE GPS';
    case 'LAST_KNOWN': return '🟡 LAST KNOWN';
    case 'STATIC_DEMO': return '🏷️ STATIC DEMO';
    case 'UNAVAILABLE':
    default: return '⚪ UNAVAILABLE';
  }
}

function statusPill(s) {
  const map = {
    planned: { color: '#4b5563', bg: '#f3f4f6' },
    assigned: { color: '#1e40af', bg: '#dbeafe' },
    loading: { color: '#92400e', bg: '#fef3c7' },
    in_transit: { color: '#065f46', bg: '#d1fae5' },
    delayed: { color: '#991b1b', bg: '#fee2e2' },
    delivered: { color: '#047857', bg: '#ecfdf5' },
    blocked: { color: '#7f1d1d', bg: '#fecaca' },
    cancelled: { color: '#6b7280', bg: '#e5e7eb' },
    pending: { color: '#b45309', bg: '#fef3c7' },
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
