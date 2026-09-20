import { useEffect, useState } from 'react';
import api from '../services/api';
import LiveMap from './LiveMap';
import { NODES as LOCAL_NODES, computeSafetyRoute, scoreAndRecommendRoutes } from '../services/routeCalculator';
import { useTranslation } from '../hooks/useTranslation';

export default function RoutePlanner({ notify }) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [origin, setOrigin] = useState('guwahati');
  const [destination, setDestination] = useState('jorhat');
  
  const [cargoType, setCargoType] = useState('General Cargo');
  const [cargoWeight, setCargoWeight] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [emergencyMode, setEmergencyMode] = useState(false);
  
  const [compareResult, setCompareResult] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Remove duplicate airports from dropdowns (we'll just list city nodes to keep it simple, or list all)
  const cityNodes = nodes.filter(n => n.type !== 'airport');

  useEffect(() => {
    Promise.all([
      api.nodes(),
      api.reports().catch(() => ({ reports: [] }))
    ]).then(([nodeRes, repRes]) => {
      if (nodeRes.nodes && nodeRes.nodes.length > 0) {
        setNodes(nodeRes.nodes);
        const cities = nodeRes.nodes.filter(n => n.type !== 'airport');
        setOrigin(cities.find((n) => n.id === 'guwahati')?.id || cities[0].id);
        setDestination(cities.find((n) => n.id === 'jorhat')?.id || cities[1].id);
      }
      if (repRes.reports) setIncidents(repRes.reports);
    }).catch(() => {
      setNodes(LOCAL_NODES);
    });
  }, []);

  const plan = async (e) => {
    e?.preventDefault();
    if (origin === destination) { setError('Origin and destination must be different.'); return; }
    setBusy(true);
    setError('');

    try {
      const res = await api.compareRoutes({ 
        originId: origin, 
        destinationId: destination,
        cargoType,
        weight: cargoWeight || 100,
        priority,
        emergencyMode
      });
      setCompareResult(res);
      setSelectedMode(res.recommendation.mode);
      notify && notify(`Risk-weighted routing complete: Recommended ${res.recommendation.mode.toUpperCase()}`);
    } catch (_) {
      // Client-side fallback computation
      const road = computeSafetyRoute(origin, destination, 1, 'road');
      const railway = computeSafetyRoute(origin, destination, 1, 'railway');
      const waterway = computeSafetyRoute(origin, destination, 1, 'waterway');
      const air = computeSafetyRoute(origin, destination, 1, 'air');
      const fallbackRoutes = { road, railway, waterway, air };
      
      const scoring = scoreAndRecommendRoutes(fallbackRoutes, {
        cargoType,
        weight: cargoWeight || 100,
        priority,
        emergencyMode
      });

      if (!scoring) {
        setError('No viable safe route found between these locations.');
        setCompareResult(null);
      } else {
        setCompareResult({
          routes: fallbackRoutes,
          recommendation: {
            mode: scoring.recommendedMode,
            reason: scoring.recommendationReason,
            score: scoring.score,
            route: scoring.route
          }
        });
        setSelectedMode(scoring.recommendedMode);
        notify && notify(`Offline multimodal route calculated: Recommended ${scoring.recommendedMode.toUpperCase()}`);
      }
    } finally {
      setBusy(false);
    }
  };

  // Determine active displayed route
  const activeRoute = (compareResult?.routes && selectedMode && compareResult.routes[selectedMode]) || compareResult?.recommendation?.route;

  // Find incidents along origin / destination / route corridors
  const routeIncidents = (activeRoute?.edges || []).flatMap(edge => {
    return incidents.filter(inc => {
      if (inc.status === 'resolved') return false;
      const matchNode = inc.nodeId === edge.from.id || inc.nodeId === edge.to.id;
      const matchRoad = inc.road && edge.road && inc.road.toLowerCase().includes(edge.road.toLowerCase());
      return matchNode || matchRoad;
    });
  });

  return (
    <div className="planner-layout">
      {/* Map display - on mobile appears at top, on desktop flows seamlessly */}
      <div className="planner-map-slot">
        <LiveMap height={360} focusRouteEdges={activeRoute?.edges} activeRoute={activeRoute} />
      </div>

      {/* Route Form */}
      <form onSubmit={plan} className="planner-form" style={formStyle}>
        <div className="planner-form-row two-cols">
          <label style={labelStyle}>{t('route.origin') || 'Origin'}
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} style={selectStyle}>
              {cityNodes.map((n) => <option key={n.id} value={n.id}>{t(`enum.${n.id}`) || n.name}, {t(`enum.${n.state}`) || n.state}</option>)}
            </select>
          </label>
          <label style={labelStyle}>{t('route.dest') || 'Destination'}
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={selectStyle}>
              {cityNodes.map((n) => <option key={n.id} value={n.id}>{t(`enum.${n.id}`) || n.name}, {t(`enum.${n.state}`) || n.state}</option>)}
            </select>
          </label>
        </div>

        <div className="planner-form-row three-cols">
          <label style={labelStyle}>{t('route.cargo') || 'Cargo Type'}
            <select value={cargoType} onChange={(e) => setCargoType(e.target.value)} style={selectStyle}>
              <option value="General Cargo">{t('cargo.general') || 'General Cargo'}</option>
              <option value="Perishable">{t('cargo.perishable') || 'Perishable'}</option>
              <option value="Pharmaceutical / Medicine">{t('cargo.pharma') || 'Pharmaceutical / Medicine'}</option>
              <option value="Emergency Supplies">{t('cargo.emergency') || 'Emergency Supplies'}</option>
              <option value="High Value">{t('cargo.highValue') || 'High Value'}</option>
              <option value="Heavy Cargo">{t('cargo.heavy') || 'Heavy Cargo'}</option>
            </select>
          </label>
          <label style={labelStyle}>{t('route.weight') || 'Weight (kg)'}
            <input type="number" placeholder="e.g. 500" value={cargoWeight} onChange={(e) => setCargoWeight(e.target.value)} style={selectStyle} />
          </label>
          <label style={labelStyle}>{t('route.priority') || 'Priority'}
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
              <option value="Normal">{t('enum.normal') || 'Normal'}</option>
              <option value="High">{t('enum.high') || 'High'}</option>
              <option value="Emergency">{t('enum.emergency') || 'Emergency'}</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 8, flexWrap: 'wrap', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: emergencyMode ? '#dc2626' : '#4b5563', cursor: 'pointer' }}>
            <input type="checkbox" checked={emergencyMode} onChange={(e) => setEmergencyMode(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#dc2626' }} />
            🚨 {t('route.emergencyMode') || 'Emergency Logistics Priority'}
          </label>
          
          <button type="submit" disabled={busy} style={btnStyle}>
            {busy ? t('route.btn_planning') || 'Evaluating Multimodal Corridors…' : `⚖️ Calculate Risk-Weighted Route`}
          </button>
        </div>
      </form>

      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700, margin: '8px 0' }}>{error}</p>}

      {compareResult && compareResult.recommendation && activeRoute && (
        <>
          {/* Recommendation Banner with Incident-Aware Routing terminology */}
          <div className="planner-recommendation" style={recommendationBanner(emergencyMode)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{emergencyMode ? '🚨' : '🧠'}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                    Incident-Aware Routing & Multimodal Recommendation
                  </h3>
                  <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>
                    Risk-weighted route engine with dynamic disruption penalties
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.06)', padding: '3px 8px', borderRadius: 6 }}>
                  Score: {compareResult.recommendation.score || compareResult.recommendation.route.score || 85}/100
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.06)', padding: '3px 8px', borderRadius: 6 }}>
                  Dijkstra Safety Index: {activeRoute.safetyIndex}%
                </span>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, opacity: 0.95 }}>
              {compareResult.recommendation.reason}
            </p>
          </div>

          {/* Active Hazards Intersecting Corridor */}
          {routeIncidents.length > 0 && (
            <div className="planner-hazards" style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <b style={{ fontSize: 12, color: '#92400e' }}>Active Corridor Hazards Influencing Safety Index</b>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {routeIncidents.slice(0, 3).map((inc) => (
                  <div key={inc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#78350f', background: '#ffffff', padding: '6px 10px', borderRadius: 6, border: '1px solid #fde68a' }}>
                    <span><b>{inc.title}</b> ({inc.road || 'Corridor'})</span>
                    <span style={{ fontWeight: 800, color: '#b91c1c' }}>Dynamic disruption penalty applied</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multimodal Comparison Cards */}
          <div className="planner-options-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 0 0', flexWrap: 'wrap', gap: 6 }}>
            <h4 style={{ fontSize: 13, color: '#374151', margin: 0, fontWeight: 800 }}>
              {t('route.availableOptions') || 'Available Multimodal Options (Risk-Weighted)'}
            </h4>
            <span style={{ fontSize: 11, color: '#6b7280' }}>Click any card to inspect path & segments</span>
          </div>

          <div className="multimodal-cards-container">
            <ModeCard
              mode="road"
              title={t('map.road') || "ROAD"}
              icon="🚚"
              route={compareResult.routes.road}
              isRecommended={compareResult.recommendation.mode === 'road'}
              isSelected={selectedMode === 'road'}
              onSelect={() => setSelectedMode('road')}
              t={t}
            />
            <ModeCard
              mode="railway"
              title={t('map.rail') || "RAIL + ROAD"}
              icon="🚂"
              route={compareResult.routes.railway}
              isRecommended={compareResult.recommendation.mode === 'railway'}
              isSelected={selectedMode === 'railway'}
              onSelect={() => setSelectedMode('railway')}
              t={t}
            />
            <ModeCard
              mode="waterway"
              title={t('map.water') || "WATERWAY + ROAD"}
              icon="🚢"
              route={compareResult.routes.waterway}
              isRecommended={compareResult.recommendation.mode === 'waterway'}
              isSelected={selectedMode === 'waterway'}
              onSelect={() => setSelectedMode('waterway')}
              t={t}
            />
            <ModeCard
              mode="air"
              title={t('map.air') || "AIR + ROAD"}
              icon="✈️"
              route={compareResult.routes.air}
              isRecommended={compareResult.recommendation.mode === 'air'}
              isSelected={selectedMode === 'air'}
              onSelect={() => setSelectedMode('air')}
              t={t}
            />
          </div>

          {/* Multimodal Transfer Points (if applicable) */}
          {activeRoute.transfers && activeRoute.transfers.length > 0 && (
            <div className="planner-transfers" style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                🔄 Multimodal Transfer Nodes ({activeRoute.transfers.length})
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {activeRoute.transfers.map((tr, idx) => (
                  <div key={idx} style={{ fontSize: 11, background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 6, color: '#1e293b' }}>
                    <b>{tr.node?.name || tr.name}</b>: {tr.fromMode.toUpperCase()} → {tr.toMode.toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Route Segments for Selected Route */}
          <div className="planner-segments" style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <h4 style={{ fontSize: 12, color: '#39735f', margin: 0, fontWeight: 800 }}>
                {selectedMode === compareResult.recommendation.mode 
                  ? (t('route.recommendedSegments') || 'RECOMMENDED ROUTE SEGMENTS & HAZARD STATUS')
                  : `ROUTE SEGMENTS · ${(activeRoute.modeLabel || selectedMode).toUpperCase()}`}
              </h4>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                {(activeRoute.segments || activeRoute.edges || []).length} Corridor Segments
              </span>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              {(activeRoute.segments || activeRoute.edges || []).map((e, i) => (
                <div key={i} className="route-segment-row" style={segmentStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                    <span style={modeBadgeStyle(e.mode)}>[{(e.mode || 'road').toUpperCase()}]</span>
                    <span style={{ fontWeight: 700 }}>
                      {t(`enum.${e.from.id}`) || e.from.name} → {t(`enum.${e.to.id}`) || e.to.name}
                    </span>
                  </div>
                  <span style={{ color: '#64748b' }}>
                    {e.corridor || e.road} · {e.distance || e.km} km {e.time ? `· ${formatMins(e.time)}` : ''}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                      {e.safetyIndex || 95}% Safe
                    </span>
                    <span style={{ color: conditionColor(e.condition || e.status), fontWeight: 800, textTransform: 'capitalize' }}>
                      {e.condition === 'clear' ? `🟢 Clear & Safe` : e.condition === 'caution' ? `⚠️ Caution` : `🔴 Disrupted`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ModeCard({ mode, title, icon, route, isRecommended, isSelected, onSelect, t }) {
  if (!route) {
    return (
      <div style={{ ...modeCardBase, opacity: 0.5, background: '#f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span>{icon}</span>
          <b style={{ fontSize: 12, color: '#6b7280' }}>{title}</b>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>{t('route.unavailable') || 'Route unavailable'}</div>
      </div>
    );
  }

  const borderCol = isSelected ? '#0f766e' : (isRecommended ? '#10b981' : '#e5e7eb');
  const bgCol = isSelected ? '#f0fdfa' : (isRecommended ? '#ecfdf5' : '#ffffff');

  return (
    <div 
      onClick={onSelect}
      style={{ 
        ...modeCardBase, 
        border: `2px solid ${borderCol}`, 
        background: bgCol, 
        position: 'relative',
        cursor: 'pointer',
        boxShadow: isSelected ? '0 0 0 2px rgba(15,118,110,0.2)' : '0 1px 3px rgba(0,0,0,0.05)'
      }}
    >
      <div style={{ position: 'absolute', top: -10, right: 10, display: 'flex', gap: 4 }}>
        {isRecommended && (
          <div style={{ background: '#10b981', color: 'white', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>
            {t('route.recommended') || 'RECOMMENDED'}
          </div>
        )}
        {isSelected && !isRecommended && (
          <div style={{ background: '#0f766e', color: 'white', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>
            VIEWING
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <b style={{ fontSize: 13, color: '#1f2937' }}>{title}</b>
        </div>
        {route.score && (
          <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 6, color: '#374151' }}>
            Score: {route.score}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={cardRow}><span style={cardLabel}>{t('route.time') || 'Time'}:</span> <span style={{ fontWeight: 800, color: '#111827' }}>{formatMins(route.etaMinutes)}</span></div>
        <div style={cardRow}><span style={cardLabel}>{t('route.distance') || 'Distance'}:</span> <span style={{ fontWeight: 700, color: '#4b5563' }}>{route.totalKm} km</span></div>
        <div style={cardRow}><span style={cardLabel}>{t('route.safety') || 'Safety'}:</span> <span style={{ fontWeight: 800, color: route.safetyIndex > 80 ? '#059669' : '#d97706' }}>{route.safetyIndex}%</span></div>
      </div>
    </div>
  );
}

function formatMins(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function conditionColor(c) {
  return { clear: '#3ea274', caution: '#bd7e22', disrupted: '#b5493a', blocked: '#8a1f1f' }[c] || '#7c8f87';
}

const formStyle = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', background: '#f9fafb', padding: 16, borderRadius: 10, border: '1px solid #e5e7eb' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#4b5563' };
const selectStyle = { height: 40, padding: '0 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%' };
const btnStyle = { height: 44, padding: '0 24px', border: 0, borderRadius: 7, color: '#fff', background: '#0f766e', fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'background 0.2s' };
const segmentStyle = { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, padding: '10px 12px', border: '1px solid #edf1ee', borderRadius: 7, fontSize: 11, alignItems: 'center' };

const recommendationBanner = (isEmergency) => ({
  padding: '16px 20px',
  background: isEmergency ? 'linear-gradient(135deg, #fef2f2, #fee2e2)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
  border: `1px solid ${isEmergency ? '#fca5a5' : '#86efac'}`,
  borderRadius: 10,
  color: isEmergency ? '#991b1b' : '#166534',
  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
});

const modeCardBase = {
  padding: 14,
  borderRadius: 10,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  transition: 'all 0.2s'
};

const cardRow = { display: 'flex', justifyContent: 'space-between', fontSize: 12 };
const cardLabel = { color: '#6b7280', fontWeight: 600 };

const modeBadgeStyle = (mode) => {
  const map = {
    road: { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
    railway: { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' },
    waterway: { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' },
    air: { background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff' },
  };
  const style = map[mode] || map.road;
  return {
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 6px',
    borderRadius: 4,
    ...style
  };
};
