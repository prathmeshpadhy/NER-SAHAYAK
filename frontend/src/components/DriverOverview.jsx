import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LiveMap from './LiveMap';
import IncidentDetailModal from './IncidentDetailModal';
import AlertResponseModal from './AlertResponseModal';
import { watchGpsPosition } from '../services/gpsHelper';
import { useTranslation } from '../hooks/useTranslation';

export default function DriverOverview({ navigate, action, notify }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [insight, setInsight] = useState(null);
  const [myVehicle, setMyVehicle] = useState(null);
  const [assignedShipment, setAssignedShipment] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [stopFn, setStopFn] = useState(null);
  const [hazards, setHazards] = useState([]);
  const [loadingHazards, setLoadingHazards] = useState(true);
  const [selectedHazard, setSelectedHazard] = useState(null);
  const [selectedAlertForResponse, setSelectedAlertForResponse] = useState(null);

  useEffect(() => {
    // Load local weather for driver's district
    api.nodes().then((res) => {
      const match = res.nodes.find((n) => n.name.toLowerCase() === (user.district || '').toLowerCase())
        || res.nodes.find((n) => n.state === user.state) || res.nodes.find((n) => n.id === 'guwahati');
      if (match) api.weatherFor(match.id).then((w) => setInsight({ node: match, weather: w })).catch(() => {});
    }).catch(() => {});

    // Load driver's registered vehicle
    api.vehicles().then((res) => {
      const found = res.vehicles.find((v) => v.ownerId === user.id || v.driverId === user.id) || res.vehicles[0];
      if (found) setMyVehicle(found);
    }).catch(() => {});

    // Load assigned shipment from Supabase
    api.shipments().then((res) => {
      const myShipment = res.shipments.find((s) => s.driverId === user.id || s.status === 'in_transit') || res.shipments[0];
      if (myShipment) setAssignedShipment(myShipment);
    }).catch(() => {});

    // Load active field officer hazards
    api.reports().then((res) => {
      const reports = res.reports || [];
      const active = reports.filter((r) => r.status !== 'resolved');
      setHazards(active);
    }).catch(() => {}).finally(() => setLoadingHazards(false));
  }, [user.district, user.id, user.state]);

  const toggleGpsTracking = () => {
    if (tracking && stopFn) {
      stopFn();
      setStopFn(null);
      setTracking(false);
      notify && notify('Driver GPS location tracking stopped.');
      return;
    }

    const unwatch = watchGpsPosition(
      async (pos) => {
        if (myVehicle) {
          try {
            const res = await api.pingVehicle(myVehicle.id, { lat: pos.lat, lng: pos.lng });
            setMyVehicle(res.vehicle);
          } catch (_) {}
        }
        setMyVehicle((prev) => prev ? { ...prev, lat: pos.lat, lng: pos.lng } : null);
      },
      () => {}
    );

    setStopFn(() => unwatch);
    setTracking(true);
    notify && notify(`Live GPS tracking activated for ${myVehicle?.vehicleNumber || 'vehicle'} (NH27 corridor fix active)`);
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Driver Identity Card with Demo Indicator */}
      <section className="card" style={{ padding: '18px 20px', background: 'linear-gradient(135deg, #175b4a, #20745d)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#c3ebda' }}>{t('driver.telemetryTitle') || 'DRIVER TELEMETRY & WORKSPACE'}</span>
              <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                Demo Operational Data
              </span>
            </div>
            <h2 style={{ color: '#fff', fontSize: 20, margin: '4px 0 2px' }}>{user.name}</h2>
            <div style={{ fontSize: 11, color: '#d2f2e5' }}>
              {t('driver.vehicle') || 'Vehicle'}: <b>{user.vehicleNumber || myVehicle?.vehicleNumber || 'AS 01 K 4309'}</b> · {t('driver.district') || 'District'}: <b>{user.district || 'Kamrup Metropolitan'}</b>
            </div>
          </div>
          <button
            onClick={toggleGpsTracking}
            style={{
              padding: '10px 16px',
              border: 0,
              borderRadius: 7,
              background: tracking ? '#b5493a' : '#ccf363',
              color: tracking ? '#fff' : '#12483a',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {tracking ? `🔴 ${t('driver.stopGps') || 'Stop GPS Location Broadcast'}` : `📡 ${t('driver.startGps') || 'Start Live Driver GPS'}`}
          </button>
        </div>
      </section>

      {/* Field Officer Synced Hazards & Active Alerts for Driver */}
      <section className="card" style={{ padding: '16px 20px', background: '#fff', border: '1px solid #dce8e2' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#175b4a', letterSpacing: 0.5 }}>
              ⚠️ ACTIVE CORRIDOR HAZARDS & FIELD INCIDENTS
            </span>
            <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              {hazards.length} Live Hazard{hazards.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            onClick={() => navigate('Route planner')}
            style={{ padding: '6px 12px', border: 0, borderRadius: 6, background: '#175b4a', color: '#fff', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
          >
            🗺️ Calculate Safe Bypass
          </button>
        </div>

        {loadingHazards ? (
          <p style={{ fontSize: 11, color: '#7c8f87', margin: 0 }}>Syncing live field reports from network…</p>
        ) : hazards.length === 0 ? (
          <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#166534', fontSize: 11 }}>
            ✓ All major routes in your operating corridor are currently reported clear by field officers.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {hazards.slice(0, 3).map((h) => {
              const hasGps = h.hasGps || (h.lat !== null && h.lat !== undefined && !isNaN(Number(h.lat)) && h.lng !== null && h.lng !== undefined && !isNaN(Number(h.lng)));
              const hasPhoto = Boolean(h.photoDataUrl && typeof h.photoDataUrl === 'string' && h.photoDataUrl.trim().length > 0);

              return (
                <div key={h.id} style={{ padding: '10px 14px', background: h.severity === 'critical' ? '#fef2f2' : '#fffbeb', border: `1px solid ${h.severity === 'critical' ? '#fecaca' : '#fde68a'}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 12, color: '#1f2937' }}>[{h.category?.toUpperCase().replace('_', ' ')}] {h.title}</b>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 4,
                        textTransform: 'uppercase',
                        color: h.severity === 'critical' ? '#b91c1c' : '#b45309',
                        background: h.severity === 'critical' ? '#fee2e2' : '#fef3c7',
                      }}>
                        {h.severity}
                      </span>
                      {hasPhoto && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1' }}>
                          📷 Photo Attached
                        </span>
                      )}
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: hasGps ? '#dcfce7' : '#f1f5f9', color: hasGps ? '#15803d' : '#64748b' }}>
                        {hasGps ? `🌐 Fix: ${Number(h.lat).toFixed(4)}, ${Number(h.lng).toFixed(4)}` : '🌐 GPS: Unavailable'}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: '#4b5563', margin: '3px 0 0' }}>
                      {h.description || 'Reported by PWD Field Officer. Proceed with extreme caution or request reroute.'}
                    </p>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                      Corridor: <b>{h.road || 'NH27 Corridor'}</b> · District: <b>{h.district || user.district || 'Assam'}</b> · Reported {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      onClick={() => setSelectedHazard(h)}
                      style={{ border: '1px solid #0f766e', background: '#0f766e', color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Inspect Evidence
                    </button>
                    <button
                      onClick={() => setSelectedAlertForResponse({
                        id: h.id,
                        title: h.title,
                        text: h.description,
                        road: h.road,
                        severity: h.severity,
                        incidentId: h.id,
                        type: h.category,
                        createdAt: h.createdAt || h.created_at,
                        responseStatus: h.status === 'resolved' ? 'resolved' : 'new',
                      })}
                      style={{ border: '1px solid #1e745b', background: '#1e745b', color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Acknowledge ➔
                    </button>
                    <button
                      onClick={() => navigate('Live map')}
                      style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', color: '#374151' }}
                    >
                      View on Map ➔
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Grid Layout */}
      <div className="dashboard-grid">
        <section className="card routes">
          <header><div><small>{t('driver.liveRoadMap') || 'LIVE ROAD MAP'}</small><h2>{t('driver.corridorMap') || 'Corridor map around'} {user.district || t('driver.you') || 'you'}</h2></div><button onClick={() => navigate('Live map')}>{t('driver.openMap') || 'Open map ➔'}</button></header>
          <div className="map-view" style={{ padding: 0 }}><LiveMap height={270} /></div>
        </section>

        <section className="card journey">
          <div className="journey-top">
            <div><small>{t('driver.weatherWatch') || 'ROUTE WEATHER WATCH'}</small><h2>{insight?.node?.name || (t('driver.localDist') || 'Local District')} <span>→</span> {t('driver.destination') || 'Destination'}</h2><p>{t('driver.nh27Corridor') || 'NH 27 Corridor · Live Weather & Risk'}</p></div>
          </div>
          <div className="journey-time">
            <span style={{ color: '#176d55' }}>⛅ {insight ? insight.weather.label : (t('driver.checkCond') || 'Checking conditions')}</span>
            <b>{insight ? `${insight.weather.tempC}°C` : '28°C'}</b>
            <p>{t('weather.precip') || 'Precipitation'}: {insight ? `${insight.weather.rainMm} mm` : '0 mm'} · {t('weather.wind') || 'Wind'}: {insight ? `${insight.weather.windKmh} km/h` : '12 km/h'}</p>
          </div>
          <div className="conditions">
            <div><span>{t('driver.distRisk') || 'District Risk Level'}</span><b><i></i>{insight ? insight.weather.label : (t('weather.clear') || 'Clear')}</b></div>
            <p><i style={{ left: `${Math.min(90, (insight?.weather?.severity || 0) * 100)}%` }}></i></p>
            <footer><span>{t('weather.clear') || 'Clear'}</span><span>{t('weather.caution') || 'Caution'}</span><span>{t('weather.disrupted') || 'Disrupted'}</span></footer>
          </div>
          <button className="route-details" onClick={action}>{t('driver.planDetails') || 'Plan route details ➔'}</button>
        </section>
      </div>

      {/* Quick Actions & Assigned Cargo */}
      <div className="bottom-grid">
        <section className="card quick">
          <small>{t('driver.quickActions') || 'DRIVER QUICK ACTIONS'}</small><h2>{t('driver.onRoad') || 'On-road Tools'}</h2>
          <button onClick={() => navigate('Route planner')}>
            <span>🗺️</span><b>{t('driver.planSafest') || 'Plan Safest Route'}</b><small>{t('driver.riskNav') || 'Risk-weighted navigation'}</small>➔
          </button>
          <button onClick={() => navigate('Field reports')}>
            <span>⚠️</span><b>{t('driver.reportHazard') || 'Report Road Hazard'}</b><small>{t('driver.hazardUpdate') || 'Landslide / flood update'}</small>➔
          </button>
          <button onClick={() => notify(t('driver.emergencyMsg') || 'Emergency helpline: dial 112 (India National Emergency).')}>
            <span>📞</span><b>{t('driver.emergencySup') || 'Emergency Support'}</b><small>{t('driver.dial112') || 'Dial 112 Helpline'}</small>➔
          </button>
        </section>

        <section className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800 }}>{t('driver.assignedVeh') || 'ASSIGNED VEHICLE & SHIPMENT'}</small>
            {assignedShipment && (
              <span style={{ fontSize: 9, fontWeight: 800, color: '#176d55', background: '#e6f4ea', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                {assignedShipment.status}
              </span>
            )}
          </div>
          <h3 style={{ margin: '8px 0 12px', fontSize: 16, color: '#25483d' }}>{myVehicle ? myVehicle.vehicleNumber : (user.vehicleNumber || 'AS 01 K 4309')}</h3>
          <div style={{ display: 'grid', gap: 8, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
              <span style={{ color: '#7c8f87' }}>{t('route.cargo') || 'Cargo Type'}:</span>
              <b>{assignedShipment?.cargoType || myVehicle?.cargoType || (t('driver.medSupplies') || 'Medical supplies / Essential goods')}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
              <span style={{ color: '#7c8f87' }}>{t('driver.routeAssigned') || 'Route Assigned'}:</span>
              <b>{assignedShipment ? `${assignedShipment.originNode?.toUpperCase()} → ${assignedShipment.destinationNode?.toUpperCase()}` : (myVehicle ? `${myVehicle.originNode?.toUpperCase()} → ${myVehicle.destinationNode?.toUpperCase()}` : 'Guwahati → Jorhat')}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
              <span style={{ color: '#7c8f87' }}>{t('driver.gpsSignal') || 'GPS Signal'}:</span>
              <b style={{ color: tracking ? '#176d55' : '#7c8f87' }}>{tracking ? `🟢 ${t('driver.liveCast') || 'Broadcasting Live'}` : `⚪ ${t('driver.idle') || 'Idle'}`}</b>
            </div>
          </div>
        </section>
      </div>

      {/* Incident Evidence Modal */}
      <IncidentDetailModal
        incident={selectedHazard}
        onClose={() => setSelectedHazard(null)}
        onLocateOnMap={() => navigate('Live map')}
      />

      {/* Driver Alert Response Modal */}
      {selectedAlertForResponse && (
        <AlertResponseModal
          alert={selectedAlertForResponse}
          onClose={() => setSelectedAlertForResponse(null)}
          onResponseSuccess={() => {
            setSelectedAlertForResponse(null);
          }}
          notify={notify}
        />
      )}
    </div>
  );
}
