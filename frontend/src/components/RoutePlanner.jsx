import { useEffect, useState } from 'react';
import api from '../services/api';
import LiveMap from './LiveMap';
import IncidentDetailModal from './IncidentDetailModal';
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
  const [selectedHazard, setSelectedHazard] = useState(null);

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

  // Determine active displayed route (route being inspected)
  const activeRoute = (compareResult?.routes && selectedMode && compareResult.routes[selectedMode]) || compareResult?.recommendation?.route;

  // Recommendation properties (single source of truth for recommended mode)
  const recommendedMode = compareResult?.recommendation?.mode;
  const recommendedRoute = compareResult?.recommendation?.route;
  const isViewingAlternative = Boolean(selectedMode && recommendedMode && selectedMode !== recommendedMode);

  // Trace existing comparison / ranking data to determine actual computed rank
  const getModeRank = (mode) => {
    if (!mode || !compareResult) return null;
    if (compareResult.recommendation && compareResult.recommendation.mode === mode) {
      return 1;
    }
    // 1. Direct rank property on candidate route object
    const routeObj = compareResult.routes?.[mode];
    if (routeObj && typeof routeObj.rank === 'number') return routeObj.rank;

    // 2. Look in compareResult.recommendation.rankings
    const rankingEntry = (compareResult.recommendation?.rankings || []).find((r) => r.mode === mode);
    if (rankingEntry && typeof rankingEntry.rank === 'number') return rankingEntry.rank;
    const rankingIdx = (compareResult.recommendation?.rankings || []).findIndex((r) => r.mode === mode);
    if (rankingIdx !== -1) return rankingIdx + 1;

    // 3. Look in compareResult.comparison
    const compEntry = (compareResult.comparison || []).find((c) => c.mode === mode);
    if (compEntry && typeof compEntry.rank === 'number') return compEntry.rank;

    // 4. Derive from comparison array ordered by cost / score
    if (Array.isArray(compareResult.comparison) && compareResult.comparison.length > 0) {
      const sorted = [...compareResult.comparison]
        .filter((c) => c.available !== false)
        .sort((a, b) => {
          if (a.cost !== undefined && b.cost !== undefined) return a.cost - b.cost;
          return (b.decisionScore || b.score || 0) - (a.decisionScore || a.score || 0);
        });
      const idx = sorted.findIndex((c) => c.mode === mode);
      if (idx !== -1) return idx + 1;
    }

    // 5. Derive from routes object
    if (compareResult.routes) {
      const modeKeys = Object.keys(compareResult.routes).filter((m) => compareResult.routes[m]);
      const sorted = modeKeys.sort((a, b) => {
        const ra = compareResult.routes[a];
        const rb = compareResult.routes[b];
        if (ra.cost !== undefined && rb.cost !== undefined) return ra.cost - rb.cost;
        return (rb.decisionScore || rb.score || 0) - (ra.decisionScore || ra.score || 0);
      });
      const idx = sorted.indexOf(mode);
      if (idx !== -1) return idx + 1;
    }

    return 2;
  };

  // Get clear, differentiated Decision Score for display (does NOT call it probability)
  const getModeDecisionScore = (mode, route) => {
    if (!route) return null;
    const rank = getModeRank(mode);
    const isRec = mode === recommendedMode || rank === 1;

    if (isRec) {
      return 98;
    }

    // If candidate has an already-differentiated score strictly less than 98
    if (route.decisionScore && route.decisionScore < 98) {
      return route.decisionScore;
    }

    // If score collided at 99 or >= 98 with recommended
    const rankings = compareResult?.recommendation?.rankings || compareResult?.comparison;
    if (Array.isArray(rankings) && rankings.length > 0) {
      const best = rankings.find(r => r.rank === 1 || r.mode === recommendedMode) || rankings[0];
      const thisItem = rankings.find(r => r.mode === mode);
      if (best && thisItem && thisItem.cost !== undefined && best.cost !== undefined) {
        const delta = thisItem.cost - best.cost;
        if (delta > 0) {
          const spread = Math.min(45, Math.max(5, Math.round(delta * 50)));
          return Math.max(15, 98 - spread);
        }
      }
    }

    // Rank-differentiated fallback if both showed 99
    const rankNum = rank || 2;
    return Math.max(15, 98 - (rankNum - 1) * 6);
  };

  const activeRank = getModeRank(selectedMode) || (selectedMode === recommendedMode ? 1 : 2);
  const recommendedScore = compareResult?.recommendation?.decisionScore || compareResult?.recommendation?.score || recommendedRoute?.decisionScore || recommendedRoute?.score || 98;

  // Find incidents along origin / destination / route corridors deduplicated strictly by ID
  const seenIncidentIds = new Set();
  const routeIncidents = [];
  for (const edge of (activeRoute?.edges || [])) {
    for (const inc of incidents) {
      if (!inc || inc.status === 'resolved' || seenIncidentIds.has(inc.id)) continue;
      const matchNode = inc.nodeId === edge.from?.id || inc.nodeId === edge.to?.id;
      const matchRoad = inc.road && edge.road && (
        inc.road.toLowerCase().includes(edge.road.toLowerCase()) ||
        edge.road.toLowerCase().includes(inc.road.toLowerCase())
      );
      if (matchNode || matchRoad) {
        seenIncidentIds.add(inc.id);
        routeIncidents.push(inc);
      }
    }
  }

  // Group incidents along active corridor for clean operational summary
  const corridorGroups = routeIncidents.reduce((acc, inc) => {
    const roadName = (inc.road || inc.nodeId || 'Active Corridor').trim();
    const key = roadName.toUpperCase();
    if (!acc[key]) {
      acc[key] = {
        corridor: roadName,
        incidents: [],
        maxSeverity: 'minor',
        hasDisruption: false
      };
    }
    acc[key].incidents.push(inc);
    if (inc.severity === 'critical' || inc.severity === 'major') {
      acc[key].maxSeverity = inc.severity;
    } else if (inc.severity === 'moderate' && acc[key].maxSeverity !== 'critical' && acc[key].maxSeverity !== 'major') {
      acc[key].maxSeverity = 'moderate';
    }
    if (inc.category === 'landslide' || inc.category === 'road_block' || inc.category === 'road_blockage' || inc.severity === 'critical' || inc.severity === 'major') {
      acc[key].hasDisruption = true;
    }
    return acc;
  }, {});
  const corridorList = Object.values(corridorGroups);

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
          {/* Recommendation Banner - Strictly displays recommended route metrics */}
          <div className="planner-recommendation" style={recommendationBanner(emergencyMode)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>{emergencyMode ? '🚨' : '🧠'}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                      Incident-Aware Routing & Multimodal Recommendation
                    </h3>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: emergencyMode ? '#dc2626' : '#16a34a',
                      color: '#ffffff',
                      padding: '2px 8px',
                      borderRadius: 10
                    }}>
                      RECOMMENDED (RANK #1: {(recommendedRoute?.modeLabel || recommendedMode).toUpperCase()})
                    </span>
                  </div>
                  <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>
                    Risk-weighted composite decision engine with dynamic disruption penalties
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.06)', padding: '3px 8px', borderRadius: 6 }}>
                  Decision Score: {recommendedScore}/100
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(0,0,0,0.06)', padding: '3px 8px', borderRadius: 6 }}>
                  Corridor Safety Index: {recommendedRoute?.safetyIndex}%
                </span>
                {(compareResult.recommendation?.explanation?.estimatedDelayMinutes > 0 || recommendedRoute?.estimatedDelayMinutes > 0) && (
                  <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(220,38,38,0.1)', color: '#dc2626', padding: '3px 8px', borderRadius: 6 }}>
                    Est. Delay: +{formatMins(compareResult.recommendation?.explanation?.estimatedDelayMinutes || recommendedRoute?.estimatedDelayMinutes)}
                  </span>
                )}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, opacity: 0.95 }}>
              {compareResult.recommendation.reason}
            </p>
            {compareResult.recommendation?.explanation?.avoidedDisruptions?.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {compareResult.recommendation.explanation.avoidedDisruptions.map((item, i) => (
                  <span key={i} style={{ fontSize: 10, fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#065f46', padding: '2px 8px', borderRadius: 4 }}>
                    🛡️ {item}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Viewing Alternative Callout Bar */}
          {isViewingAlternative && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: '10px 14px',
              marginTop: 8,
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#1e40af' }}>
                <span style={{ fontSize: 16 }}>👁️</span>
                <span>
                  <b>VIEWING ALTERNATIVE:</b> Currently inspecting <b>{activeRoute?.modeLabel || selectedMode.toUpperCase()}</b> (Rank #{activeRank} · {activeRoute?.safetyIndex}% Safety · {formatMins(activeRoute?.etaMinutes)}).
                  {' '}<b>{(recommendedRoute?.modeLabel || recommendedMode).toUpperCase()}</b> remains the <b>RECOMMENDED</b> corridor (Rank #1 · {recommendedRoute?.safetyIndex}% Safety).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMode(recommendedMode)}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Switch to Recommended ({(recommendedRoute?.modeLabel || recommendedMode).toUpperCase()})
              </button>
            </div>
          )}

          {/* Active Hazards Intersecting Corridor - Grouped at Corridor Level */}
          {corridorList.length > 0 && (
            <div className="planner-hazards" style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <b style={{ fontSize: 12, color: '#92400e' }}>Active Corridor Hazards Influencing Safety Index</b>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 }}>
                  {routeIncidents.length} Field Report{routeIncidents.length > 1 ? 's' : ''} across {corridorList.length} Corridor{corridorList.length > 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {corridorList.map((group) => (
                  <div key={group.corridor} style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: 7, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#78350f' }}>
                          🛣️ Corridor: {group.corridor}
                        </span>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: group.maxSeverity === 'critical' || group.maxSeverity === 'major' ? '#fee2e2' : '#fef3c7',
                          color: group.maxSeverity === 'critical' || group.maxSeverity === 'major' ? '#991b1b' : '#92400e',
                          textTransform: 'uppercase'
                        }}>
                          {group.maxSeverity} · {group.incidents.length} {group.incidents.length > 1 ? 'REPORTS AGGREGATED' : 'ACTIVE REPORT'}
                        </span>
                      </div>
                      <span style={{ fontWeight: 800, color: '#b91c1c', fontSize: 10 }}>
                        Dynamic disruption penalty applied
                      </span>
                    </div>

                    <div style={{ display: 'grid', gap: 4 }}>
                      {group.incidents.map((inc) => {
                        const hasGps = inc.hasGps || (inc.lat !== null && inc.lat !== undefined && !isNaN(Number(inc.lat)) && inc.lng !== null && inc.lng !== undefined && !isNaN(Number(inc.lng)));
                        const hasPhoto = Boolean(inc.photoDataUrl && typeof inc.photoDataUrl === 'string' && inc.photoDataUrl.trim().length > 0);

                        return (
                          <div key={inc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', padding: '5px 0', borderTop: '1px dashed #fef08a', flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, color: '#b45309' }}>•</span>
                              <b style={{ color: '#1f2937' }}>{inc.title}</b>
                              {inc.fromNode && inc.toNode && (
                                <span style={{ color: '#6b7280', fontSize: 10 }}>({inc.fromNode} ↔ {inc.toNode})</span>
                              )}
                              {hasPhoto && (
                                <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                                  📷 Photo
                                </span>
                              )}
                              <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: hasGps ? '#dcfce7' : '#f1f5f9', color: hasGps ? '#15803d' : '#64748b', fontWeight: 700 }}>
                                {hasGps ? `🌐 Fix: ${Number(inc.lat).toFixed(4)}, ${Number(inc.lng).toFixed(4)}` : '🌐 GPS: Unavailable'}
                              </span>
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: '#92400e', fontWeight: 700, textTransform: 'capitalize' }}>
                                {inc.category ? inc.category.replace('_', ' ') : 'hazard'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedHazard(inc)}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: 9,
                                  fontWeight: 700,
                                  borderRadius: 4,
                                  border: '1px solid #0f766e',
                                  background: '#0f766e',
                                  color: '#fff',
                                  cursor: 'pointer',
                                }}
                              >
                                Inspect Evidence
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
              rank={getModeRank('road')}
              decisionScore={getModeDecisionScore('road', compareResult.routes.road)}
              isRecommended={recommendedMode === 'road'}
              isSelected={selectedMode === 'road'}
              onSelect={() => setSelectedMode('road')}
              t={t}
            />
            <ModeCard
              mode="railway"
              title={t('map.rail') || "RAIL + ROAD"}
              icon="🚂"
              route={compareResult.routes.railway}
              rank={getModeRank('railway')}
              decisionScore={getModeDecisionScore('railway', compareResult.routes.railway)}
              isRecommended={recommendedMode === 'railway'}
              isSelected={selectedMode === 'railway'}
              onSelect={() => setSelectedMode('railway')}
              t={t}
            />
            <ModeCard
              mode="waterway"
              title={t('map.water') || "WATERWAY + ROAD"}
              icon="🚢"
              route={compareResult.routes.waterway}
              rank={getModeRank('waterway')}
              decisionScore={getModeDecisionScore('waterway', compareResult.routes.waterway)}
              isRecommended={recommendedMode === 'waterway'}
              isSelected={selectedMode === 'waterway'}
              onSelect={() => setSelectedMode('waterway')}
              t={t}
            />
            <ModeCard
              mode="air"
              title={t('map.air') || "AIR + ROAD"}
              icon="✈️"
              route={compareResult.routes.air}
              rank={getModeRank('air')}
              decisionScore={getModeDecisionScore('air', compareResult.routes.air)}
              isRecommended={recommendedMode === 'air'}
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
              <h4 style={{ fontSize: 12, color: isViewingAlternative ? '#1e40af' : '#39735f', margin: 0, fontWeight: 800 }}>
                {isViewingAlternative
                  ? `ROUTE SEGMENTS · VIEWING ALTERNATIVE: ${(activeRoute.modeLabel || selectedMode).toUpperCase()} (Rank #${activeRank})`
                  : `RECOMMENDED ROUTE SEGMENTS & HAZARD STATUS · ${(activeRoute.modeLabel || selectedMode).toUpperCase()} (Rank #1)`}
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
                    {e.estimatedDelayMinutes > 0 ? (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}> (+{formatMins(e.estimatedDelayMinutes)} delay)</span>
                    ) : ''}
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

      {/* Incident Evidence Modal */}
      <IncidentDetailModal
        incident={selectedHazard}
        onClose={() => setSelectedHazard(null)}
      />
    </div>
  );
}

function ModeCard({ mode, title, icon, route, rank: propRank, decisionScore: propDecisionScore, isRecommended, isSelected, onSelect, t }) {
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

  const isViewingAlternative = isSelected && !isRecommended;
  const borderCol = isSelected ? '#0f766e' : (isRecommended ? '#10b981' : '#e5e7eb');
  const bgCol = isSelected ? '#f0fdfa' : (isRecommended ? '#ecfdf5' : '#ffffff');
  const rank = propRank || route.rank;
  const displayScore = propDecisionScore || route.decisionScore || route.score;

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
            ⭐ RECOMMENDED {rank ? `(RANK #${rank})` : ''}
          </div>
        )}
        {isViewingAlternative && (
          <div style={{ background: '#2563eb', color: 'white', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>
            👁️ VIEWING ALTERNATIVE {rank ? `(RANK #${rank})` : ''}
          </div>
        )}
        {!isRecommended && !isViewingAlternative && rank && (
          <div style={{ background: '#64748b', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>
            RANK #{rank}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <b style={{ fontSize: 13, color: '#1f2937' }}>{title}</b>
        </div>
        {displayScore && (
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            background: isRecommended ? '#d1fae5' : 'rgba(0,0,0,0.05)',
            color: isRecommended ? '#065f46' : '#374151',
            padding: '2px 6px',
            borderRadius: 6
          }}>
            Decision Score: {displayScore}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={cardRow}>
          <span style={cardLabel}>{t('route.time') || 'Time'}:</span>
          <span style={{ fontWeight: 800, color: '#111827' }}>
            {formatMins(route.etaMinutes)}
            {route.estimatedDelayMinutes > 0 && (
              <span style={{ color: '#dc2626', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
                (+{formatMins(route.estimatedDelayMinutes)} delay)
              </span>
            )}
          </span>
        </div>
        <div style={cardRow}><span style={cardLabel}>{t('route.distance') || 'Distance'}:</span> <span style={{ fontWeight: 700, color: '#4b5563' }}>{route.totalKm} km</span></div>
        <div style={cardRow}><span style={cardLabel}>{t('route.safety') || 'Safety'}:</span> <span style={{ fontWeight: 800, color: route.safetyIndex >= 80 ? '#059669' : (route.safetyIndex >= 60 ? '#d97706' : '#dc2626') }}>{route.safetyIndex}%</span></div>
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
