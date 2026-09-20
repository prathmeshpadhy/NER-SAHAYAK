import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Tooltip, CircleMarker, Marker, LayersControl, LayerGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import { NODES as LOCAL_NODES, EDGES as LOCAL_EDGES } from '../services/routeCalculator';
import { DRIVER_ROSTER } from '../services/driverService';
import { useTranslation } from '../hooks/useTranslation';

const CONDITION_COLOR = { clear: '#3ea274', caution: '#e2ab3d', disrupted: '#dc725d', blocked: '#8a1f1f' };

// Ensure Leaflet default marker icons resolve reliably in production/WebView
try {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
} catch (_) {}

function MapResizer() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const safeInvalidate = () => {
      try {
        if (map && map._leaflet_id && map.getContainer()) {
          map.invalidateSize({ debounceMoveEnd: true });
        }
      } catch (_) {}
    };

    // Staged invalidations for WebView viewport settling
    const t1 = setTimeout(safeInvalidate, 100);
    const t2 = setTimeout(safeInvalidate, 350);
    const t3 = setTimeout(safeInvalidate, 700);
    const t4 = setTimeout(safeInvalidate, 1400);

    const handleResize = () => {
      safeInvalidate();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('pageshow', handleResize);

    // ResizeObserver on the map DOM container
    let ro = null;
    let rafId = null;
    const container = map.getContainer();
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            safeInvalidate();
          }
        });
      });
      ro.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('pageshow', handleResize);
      if (ro) ro.disconnect();
    };
  }, [map]);

  return null;
}

function MapCenterer() {
  const map = useMap();
  useEffect(() => {
    const handleFocus = (e) => {
      if (e.detail && e.detail.center) {
        map.setView(e.detail.center, e.detail.zoom || 10, { animate: true });
      }
    };
    window.addEventListener('map-focus', handleFocus);
    return () => window.removeEventListener('map-focus', handleFocus);
  }, [map]);
  return null;
}

export default function LiveMap({ height = null, focusRouteEdges = null, activeRoute = null }) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [edges, setEdges] = useState(LOCAL_EDGES);
  const [incidents, setIncidents] = useState([]);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [modeFilter, setModeFilter] = useState('all'); // all | road | railway | waterway | air

  const load = async () => {
    try {
      const [nodeRes, edgeRes, repRes] = await Promise.all([
        api.nodes(),
        api.edges(),
        api.reports().catch(() => ({ reports: [] })),
      ]);
      if (nodeRes.nodes) setNodes(nodeRes.nodes);
      if (edgeRes.edges) setEdges(edgeRes.edges);
      if (repRes.reports) setIncidents(repRes.reports);
    } catch (_) {
      // Offline fallback: use local nodes and edges
      setNodes(LOCAL_NODES);
      setEdges(LOCAL_EDGES);
      setIsOfflineMode(true);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const nodeMap = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  // Positioned incidents
  const mappedIncidents = useMemo(() => {
    return incidents.map((inc) => {
      let lat = inc.lat;
      let lng = inc.lng;
      if (lat === null || lat === undefined || isNaN(Number(lat))) {
        const node = nodeMap[inc.nodeId] || nodeMap[inc.fromNode];
        if (node) {
          lat = node.lat + (Math.random() - 0.5) * 0.08;
          lng = node.lng + (Math.random() - 0.5) * 0.08;
        } else {
          lat = 26.18;
          lng = 91.75; // Default Guwahati corridor
        }
      }
      return { ...inc, lat: Number(lat), lng: Number(lng) };
    });
  }, [incidents, nodeMap]);

  const displayEdges = useMemo(() => {
    const raw = focusRouteEdges ? focusRouteEdges : edges;
    let filtered = raw;
    if (modeFilter !== 'all') {
      filtered = raw.filter((e) => e.mode === modeFilter || (!e.mode && modeFilter === 'road'));
    }
    // Ensure `from` and `to` are objects, because LOCAL_EDGES uses string IDs
    return filtered.map(e => {
      const fromNode = typeof e.from === 'string' ? nodes.find(n => n.id === e.from) : e.from;
      const toNode = typeof e.to === 'string' ? nodes.find(n => n.id === e.to) : e.to;
      return { ...e, from: fromNode, to: toNode };
    }).filter(e => e.from && e.to);
  }, [focusRouteEdges, edges, modeFilter, nodes]);

  const center = [25.5, 92.8]; // centered on North East India

  return (
    <div className="livemap-wrapper" style={{ height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined }}>
      {/* Top Controls Bar */}
      <div className="livemap-top-bar" style={topControlsStyle}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['all', 'road', 'railway', 'waterway', 'air'].map(m => (
            <button
              key={m}
              onClick={() => setModeFilter(m)}
              style={{
                ...filterTabStyle(modeFilter === m),
                padding: '4px 8px',
                fontSize: 9,
                textTransform: 'capitalize'
              }}
            >
              {m === 'all' ? 'All Modes' : m}
            </button>
          ))}
        </div>
        <button
          onClick={() => setIsOfflineMode(!isOfflineMode)}
          style={{ ...filterTabStyle(isOfflineMode), background: isOfflineMode ? '#175b4a' : '#ffffff', color: isOfflineMode ? '#ffffff' : '#175b4a' }}
        >
          {isOfflineMode ? (t('map.offlineMode') || '🗺️ Offline Canvas Map') : (t('map.onlineMode') || '🌐 Tile Map (Online)')}
        </button>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }}></span>
            {incidents.filter(i => i.status !== 'resolved').length} Active Hazards
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#4b5563', background: '#ffffff', border: '1px solid #d1d5db', padding: '4px 8px', borderRadius: 6 }}>
            Demo Operational Data
          </span>
        </div>
      </div>

      {/* Map Content Rendering */}
      {!isOfflineMode ? (
        <MapContainer center={center} zoom={6} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
          <MapResizer />
          <MapCenterer />
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={18}
                minZoom={4}
              />
            </LayersControl.BaseLayer>
            
            {['road', 'railway', 'waterway', 'air'].map(mode => {
              const modeEdges = displayEdges.filter(e => (e.mode || 'road') === mode);
              
              const modeNames = {
                road: `🚚 ${t('map.road') || 'Road Corridors'}`,
                railway: `🚂 ${t('map.rail') || 'Railway (NFR)'}`,
                waterway: `🚢 ${t('map.water') || 'Waterways (NW-2/16)'}`,
                air: `✈️ ${t('map.air') || 'Air Cargo'}`
              };
              
              return (
                <LayersControl.Overlay key={mode} checked name={modeNames[mode]}>
                  <LayerGroup>
                    {modeEdges.map((e) => (
                      <Polyline
                        key={`${e.from.id}-${e.to.id}-${e.mode || 'road'}`}
                        positions={[[e.from.lat, e.from.lng], [e.to.lat, e.to.lng]]}
                        pathOptions={{
                          color: e.mode === 'waterway' ? '#0284c7' : e.mode === 'railway' ? '#475569' : e.mode === 'air' ? '#9333ea' : (CONDITION_COLOR[e.condition] || '#3ea274'),
                          weight: focusRouteEdges ? 6 : 4,
                          dashArray: e.mode === 'railway' ? '6, 6' : e.mode === 'waterway' ? '10, 4' : e.mode === 'air' ? '2, 8' : null,
                          opacity: 0.85,
                        }}
                      >
                        <Tooltip sticky>
                          [{ (e.mode || 'road').toUpperCase() }] {e.road} · {e.from.name} → {e.to.name} ({e.km} km)
                        </Tooltip>
                      </Polyline>
                    ))}
                  </LayerGroup>
                </LayersControl.Overlay>
              );
            })}

            {/* LIVE INCIDENT / DISRUPTIONS LAYER */}
            <LayersControl.Overlay checked name="⚠️ Disruptions & Hazards">
              <LayerGroup>
                {mappedIncidents.map((inc) => {
                  const isCritical = inc.severity === 'critical' || inc.severity === 'major';
                  const isModerate = inc.severity === 'moderate' || inc.severity === 'medium';
                  const isResolved = inc.status === 'resolved';
                  const iconEmoji = isResolved ? '✅' : isCritical ? '⛔' : isModerate ? '⚠️' : '🟡';
                  const iconColor = isResolved ? '#10b981' : isCritical ? '#ef4444' : isModerate ? '#f59e0b' : '#84cc16';
                  const reporter = inc.reporterRole === 'driver' ? 'Driver' : 'Field Officer';

                  return (
                    <Marker
                      key={inc.id}
                      position={[inc.lat, inc.lng]}
                      icon={new L.DivIcon({
                        html: `<div style="font-size:14px; background:${isResolved ? '#ecfdf5' : '#fff5f5'}; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.35); border: 2.5px solid ${iconColor}; animation: ${isCritical && !isResolved ? 'pulse 1.8s infinite' : 'none'};">${iconEmoji}</div>`,
                        className: 'custom-incident-icon',
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                      })}
                    >
                      <Tooltip sticky>
                        <div style={{ maxWidth: 220, fontSize: 11 }}>
                          <div style={{ fontWeight: 800, color: iconColor, fontSize: 12, marginBottom: 2 }}>
                            {inc.title}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                            <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 8, padding: '1px 5px', borderRadius: 3, background: isCritical ? '#fee2e2' : '#fef3c7', color: isCritical ? '#991b1b' : '#92400e' }}>
                              {inc.severity}
                            </span>
                            <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>
                              👤 {reporter}
                            </span>
                            <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: '#f3f4f6', color: '#374151', fontWeight: 700 }}>
                              {inc.status ? inc.status.toUpperCase() : 'ACTIVE'}
                            </span>
                          </div>
                          <div><b>Road/Corridor:</b> {inc.road || 'State Highway'}</div>
                          {inc.description && <div style={{ color: '#4b5563', margin: '3px 0' }}>{inc.description}</div>}
                          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 3 }}>
                            <b>Reported:</b> {new Date(inc.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        </div>
                      </Tooltip>
                    </Marker>
                  );
                })}
              </LayerGroup>
            </LayersControl.Overlay>

            <LayersControl.Overlay checked name={t('map.nodes') || "Nodes & Hubs"}>
              <LayerGroup>
                {nodes.filter(n => n.type !== 'airport').map((n) => (
                  <CircleMarker key={n.id} center={[n.lat, n.lng]} radius={n.type === 'hub' ? 7 : 5}
                    pathOptions={{ color: '#155b4b', fillColor: n.type === 'hub' ? '#ccf363' : '#ffffff', fillOpacity: 1, weight: 2 }}>
                    <Tooltip>{t(`enum.${n.id}`) || n.name}, {t(`enum.${n.state}`) || n.state} ({n.type === 'hub' ? (t('map.hub') || 'Multimodal Hub') : (t('map.node') || 'District Node')})</Tooltip>
                  </CircleMarker>
                ))}
              </LayerGroup>
            </LayersControl.Overlay>

            <LayersControl.Overlay checked name={t('map.airports') || "Airports"}>
              <LayerGroup>
                {nodes.filter(n => n.type === 'airport').map((n) => {
                  const IATA = n.name.match(/\(([A-Z]{3})\)/)?.[1] || 'N/A';
                  const cleanName = n.name.replace(/\s\([A-Z]{3}\)/, '');
                  return (
                    <Marker 
                      key={n.id} 
                      position={[n.lat, n.lng]}
                      icon={new L.DivIcon({
                        html: '<div style="font-size:16px; background:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.3); border: 2px solid #9333ea;">✈️</div>',
                        className: 'custom-airport-icon',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                      })}
                    >
                      <Tooltip>
                        <div style={{ fontWeight: 800, fontSize: '1.1em', marginBottom: 2, color: '#9333ea' }}>{t(`enum.${n.id}`) || cleanName}</div>
                        <div><strong>IATA:</strong> {IATA}</div>
                        <div><strong>{t('enum.state') || 'State'}:</strong> {t(`enum.${n.state}`) || n.state}</div>
                        <div><strong>{t('enum.status') || 'Status'}:</strong> {n.cargo ? (t('map.cargoActive') || 'Cargo Operations Active') : (t('map.cargoInactive') || 'Passenger Only / Unverified')}</div>
                      </Tooltip>
                    </Marker>
                  );
                })}
              </LayerGroup>
            </LayersControl.Overlay>

            {/* MULTIMODAL TRANSFER HUBS LAYER */}
            {activeRoute && activeRoute.transfers && activeRoute.transfers.length > 0 && (
              <LayersControl.Overlay checked name="🔄 Multimodal Transfers">
                <LayerGroup>
                  {activeRoute.transfers.map((tr, idx) => {
                    const trNode = tr.node || nodes.find(n => n.id === tr.at || n.id === tr.id);
                    if (!trNode || !trNode.lat) return null;
                    return (
                      <Marker
                        key={`transfer-${idx}-${trNode.id}`}
                        position={[trNode.lat, trNode.lng]}
                        icon={new L.DivIcon({
                          html: `<div style="font-size:16px; background:#fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.35); border: 2.5px solid #0f766e;">🔄</div>`,
                          className: 'custom-transfer-icon',
                          iconSize: [28, 28],
                          iconAnchor: [14, 14]
                        })}
                      >
                        <Tooltip sticky permanent>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>
                            <b style={{ color: '#0f766e' }}>Transfer Hub: {trNode.name}</b>
                            <div style={{ color: '#4b5563' }}>{tr.fromMode?.toUpperCase()} → {tr.toMode?.toUpperCase()}</div>
                          </div>
                        </Tooltip>
                      </Marker>
                    );
                  })}
                </LayerGroup>
              </LayersControl.Overlay>
            )}
          </LayersControl>
        </MapContainer>
      ) : (
        /* High-Fidelity SVG Offline Vector Canvas Map */
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #10261f, #18382e)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 50, right: 15, background: 'rgba(255,255,255,0.1)', color: '#d2f2e5', padding: '4px 10px', borderRadius: 14, fontSize: 9, fontWeight: 800 }}>
            {t('map.offlineBanner') || 'OFFLINE VECTOR CANVAS · NORTH EAST REGION'}
          </div>

          <svg width="100%" height="100%" viewBox="88 22 10 7" preserveAspectRatio="none" style={{ transform: 'scale(1, -1)' }}>
            {/* Edge lines */}
            {displayEdges.map((e, idx) => {
              const strokeColor = e.mode === 'waterway' ? '#38bdf8' : e.mode === 'railway' ? '#94a3b8' : e.mode === 'air' ? '#c084fc' : (CONDITION_COLOR[e.condition] || '#4ade80');
              return (
                <g key={idx}>
                  <line
                    x1={e.from.lng}
                    y1={e.from.lat}
                    x2={e.to.lng}
                    y2={e.to.lat}
                    stroke={strokeColor}
                    strokeWidth={e.mode === 'railway' || e.mode === 'air' ? 0.04 : 0.05}
                    strokeDasharray={e.mode === 'railway' ? '0.08,0.06' : e.mode === 'waterway' ? '0.15,0.05' : e.mode === 'air' ? '0.03,0.09' : 'none'}
                    opacity={0.9}
                  />
                </g>
              );
            })}

            {/* Node Dots */}
            {nodes.map((n) => (
              <g key={n.id}>
                <circle
                  cx={n.lng}
                  cy={n.lat}
                  r={n.type === 'hub' ? 0.09 : n.type === 'airport' ? 0.07 : 0.06}
                  fill={n.type === 'hub' ? '#ccf363' : n.type === 'airport' ? '#d8b4fe' : '#ffffff'}
                  stroke={n.type === 'airport' ? '#6b21a8' : '#0e2b22'}
                  strokeWidth={0.02}
                />
              </g>
            ))}

            {/* Active Hazard Markers on Canvas */}
            {mappedIncidents.filter(i => i.status !== 'resolved').slice(0, 10).map((inc) => (
              <circle key={inc.id} cx={inc.lng} cy={inc.lat} r={0.09} fill="#ef4444" stroke="#ffffff" strokeWidth={0.02}>
                <animate attributeName="r" values="0.08;0.14;0.08" dur="1.8s" repeatCount="indefinite" />
              </circle>
            ))}

            {/* 10 Active Driver Vehicle GPS Markers */}
            {DRIVER_ROSTER.slice(0, 8).map((d, idx) => {
              const lat = 25.0 + (idx * 0.35) % 3.0;
              const lng = 91.5 + (idx * 0.45) % 4.0;
              return (
                <circle key={d.id} cx={lng} cy={lat} r={0.07} fill="#38bdf8" stroke="#ffffff" strokeWidth={0.02}>
                  <animate attributeName="r" values="0.06;0.10;0.06" dur="2s" repeatCount="indefinite" />
                </circle>
              );
            })}
          </svg>

          {/* SVG Overlay Labels */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {nodes.slice(0, 12).map((n) => {
              // Convert lat/lng to percentage bounds
              const left = `${((n.lng - 88) / 10) * 100}%`;
              const top = `${(1 - (n.lat - 22) / 7) * 100}%`;
              return (
                <div key={n.id} style={{ position: 'absolute', left, top, transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}>
                  <div style={{ background: 'rgba(14, 43, 34, 0.85)', color: '#ffffff', border: '1px solid rgba(204,243,99,0.4)', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {t(`enum.${n.id}`) || n.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend footer */}
      <div style={legendStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#3ea274', borderRadius: '50%' }} />🚚 {t('map.road') || 'Road'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#475569', borderRadius: '50%' }} />🚂 {t('map.rail') || 'Rail (NFR)'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#0284c7', borderRadius: '50%' }} />🚢 {t('map.water') || 'Waterway (NW-2/16)'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#9333ea', borderRadius: '50%' }} />✈️ {t('map.air') || 'Air Cargo'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }} />⚠️ Hazards ({incidents.length})</span>
        <span style={{ marginLeft: 'auto', color: '#7c8f87' }}>{t('map.activeDrivers') || '10 Active Drivers Tracked'}</span>
      </div>
    </div>
  );
}

const topControlsStyle = {
  position: 'absolute',
  zIndex: 500,
  top: 8,
  left: 8,
  right: 8,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  pointerEvents: 'auto',
};

const filterTabStyle = (active) => ({
  padding: '5px 9px',
  border: '1px solid #c8dbd0',
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 800,
  cursor: 'pointer',
  background: active ? '#175b4a' : 'rgba(255,255,255,0.92)',
  color: active ? '#ffffff' : '#1e3b32',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  touchAction: 'manipulation',
});

const legendStyle = {
  position: 'absolute',
  zIndex: 500,
  bottom: 8,
  left: 8,
  right: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'rgba(255,255,255,0.94)',
  padding: '5px 10px',
  borderRadius: 6,
  fontSize: 9,
  fontWeight: 800,
  color: '#315449',
  flexWrap: 'wrap',
  maxHeight: 68,
  overflowY: 'auto',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};
