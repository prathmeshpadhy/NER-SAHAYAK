/**
 * NER-SAHAYAK — Command Center & Regional Intelligence Service (Phase 5)
 *
 * Provides deterministic, explainable aggregation for the Government / Regional
 * Command Center across 8 North Eastern States:
 * - Regional & State-level Connectivity Index
 * - Critical Corridor Monitoring (accessibility, delays, active hazards)
 * - Multi-Hazard Regional Alert Aggregation
 * - Emergency Supply Route Evaluation
 * - At-Risk Logistics & Fleet Summaries
 *
 * Uses CANONICAL data from Phases 1, 2, 3A, 3B, and 4.
 * Never fabricates metrics, GPS, weather, or ML predictions.
 */

const { NODES, EDGES } = require('../data/nerNetwork');
const { findRoute } = require('./dijkstra');
const { scoreAndRecommendRoutes } = require('./routeScorer');
const { determineLocationSource, evaluateShipmentDisruption } = require('./shipmentIntelligence');

const NER_STATES = [
  'Assam',
  'Meghalaya',
  'Nagaland',
  'Manipur',
  'Mizoram',
  'Tripura',
  'Arunachal Pradesh',
  'Sikkim',
  'West Bengal (gateway)',
];

/**
 * Derives accessibility state for an edge based on active disruptions.
 * @param {Object} edge - Graph edge
 * @param {Array} disruptions - Active disruptions
 * @returns {Object} { accessibilityState, severity, multiplier, isBlocked, matchingDisruptions }
 */
function evaluateEdgeAccessibility(edge, disruptions = []) {
  if (!edge) return { accessibilityState: 'OPEN', severity: 'none', multiplier: 1.0, isBlocked: false, matchingDisruptions: [] };

  const edgeRoad = (edge.road || '').trim().toLowerCase();
  const matching = disruptions.filter((d) => {
    if (!d) return false;
    if (d.road && edge.road && edge.mode !== 'road' && d.road.trim().toLowerCase() !== edgeRoad) {
      return false;
    }
    if (d.road && edgeRoad && d.road.trim().toLowerCase() === edgeRoad) {
      return true;
    }
    const fromN = d.fromNode || d.from_node;
    const toN = d.toNode || d.to_node;
    if (fromN && toN) {
      if ((fromN === edge.from && toN === edge.to) || (fromN === edge.to && toN === edge.from)) {
        return true;
      }
    }
    const singleNode = fromN || d.nodeId || d.node_id;
    if (singleNode && !toN) {
      if (edge.from === singleNode || edge.to === singleNode) {
        return true;
      }
    }
    return false;
  });

  let multiplier = 1.0;
  let isBlocked = false;
  let severity = 'none';

  matching.forEach((d) => {
    const sev = (d.severity || '').toLowerCase();
    const cat = (d.category || '').toLowerCase();
    if (sev === 'blocked' || sev === 'critical' || cat === 'bridge_damage') {
      isBlocked = true;
      severity = 'blocked';
    } else if (sev === 'severe' || sev === 'major' || sev === 'high') {
      if (severity !== 'blocked') severity = 'severe';
      multiplier = Math.max(multiplier, 15.0);
    } else if (sev === 'moderate' || sev === 'medium') {
      if (severity !== 'blocked' && severity !== 'severe') severity = 'moderate';
      multiplier = Math.max(multiplier, 5.0);
    } else if (sev === 'minor' || sev === 'low') {
      if (severity === 'none') severity = 'minor';
      multiplier = Math.max(multiplier, 2.0);
    }
  });

  let accessibilityState = 'OPEN';
  if (isBlocked) {
    accessibilityState = 'BLOCKED';
  } else if (multiplier >= 15.0) {
    accessibilityState = 'SEVERELY_DISRUPTED';
  } else if (multiplier >= 5.0) {
    accessibilityState = 'RESTRICTED';
  } else if (multiplier >= 2.0) {
    accessibilityState = 'CAUTION';
  }

  return {
    accessibilityState,
    severity,
    multiplier,
    isBlocked,
    matchingDisruptions: matching,
  };
}

/**
 * Deterministic State & Regional Connectivity Index Calculation.
 *
 * Formula:
 *   Accessibility Score Factor:
 *     OPEN = 1.0
 *     CAUTION = 0.85
 *     RESTRICTED = 0.55
 *     SEVERELY_DISRUPTED = 0.25
 *     BLOCKED = 0.0
 *   Connectivity Index = (Sum of accessibility score factors / total corridors) * 100
 *
 * @param {Object} context - { disruptions, incidents, shipments, vehicles, weatherByNode }
 * @returns {Object} Regional and State-wise connectivity metrics
 */
function computeRegionalConnectivity({ disruptions = [], incidents = [], shipments = [], vehicles = [], weatherByNode = {} } = {}) {
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const nodeMap = new Map();
  NODES.forEach((n) => nodeMap.set(n.id, n));

  // Evaluate all road edges in NER
  const roadEdges = EDGES.filter((e) => !e.mode || e.mode === 'road');
  const edgeEvaluations = roadEdges.map((e) => {
    const access = evaluateEdgeAccessibility(e, disruptions);
    const nodeA = nodeMap.get(e.from);
    const nodeB = nodeMap.get(e.to);
    return {
      edge: e,
      fromName: nodeA?.name || e.from,
      toName: nodeB?.name || e.to,
      fromState: nodeA?.state || 'Unknown',
      toState: nodeB?.state || 'Unknown',
      ...access,
    };
  });

  // State-by-State Aggregation
  const stateSummaries = NER_STATES.map((state) => {
    const stateNodes = NODES.filter((n) => n.state === state && n.type !== 'airport');
    const stateNodeIds = new Set(stateNodes.map((n) => n.id));

    // Corridors connecting to or within this state
    const stateCorridors = edgeEvaluations.filter(
      (ev) => stateNodeIds.has(ev.edge.from) || stateNodeIds.has(ev.edge.to)
    );

    const totalCorridors = stateCorridors.length;
    if (totalCorridors === 0) {
      return {
        state,
        connectivityIndex: null,
        connectivityStatus: 'UNAVAILABLE',
        reason: 'UNAVAILABLE — insufficient network granularity',
        totalCorridors: 0,
        openCorridors: 0,
        cautionCorridors: 0,
        restrictedCorridors: 0,
        severelyDisruptedCorridors: 0,
        blockedCorridors: 0,
        activeIncidentsCount: 0,
        affectedCorridorsList: [],
        atRiskShipmentsCount: 0,
      };
    }

    let openCount = 0;
    let cautionCount = 0;
    let restrictedCount = 0;
    let severeCount = 0;
    let blockedCount = 0;
    let weightedCapacity = 0;
    const affectedCorridorsSet = new Set();

    stateCorridors.forEach((c) => {
      if (c.isBlocked) {
        blockedCount++;
        weightedCapacity += 0.0;
        affectedCorridorsSet.add(c.edge.road);
      } else if (c.accessibilityState === 'SEVERELY_DISRUPTED') {
        severeCount++;
        weightedCapacity += 0.25;
        affectedCorridorsSet.add(c.edge.road);
      } else if (c.accessibilityState === 'RESTRICTED') {
        restrictedCount++;
        weightedCapacity += 0.55;
        affectedCorridorsSet.add(c.edge.road);
      } else if (c.accessibilityState === 'CAUTION') {
        cautionCount++;
        weightedCapacity += 0.85;
        affectedCorridorsSet.add(c.edge.road);
      } else {
        openCount++;
        weightedCapacity += 1.0;
      }
    });

    const connectivityIndex = Math.round((weightedCapacity / totalCorridors) * 100);

    // Matching active incidents in this state
    const stateIncidents = activeIncidents.filter((inc) => {
      const roadMatch = inc.road && affectedCorridorsSet.has(inc.road);
      const nodeMatch = stateNodeIds.has(inc.nodeId) || stateNodeIds.has(inc.fromNode) || stateNodeIds.has(inc.toNode);
      return roadMatch || nodeMatch;
    });

    // Matching at-risk shipments in this state
    const stateAtRiskShipments = shipments.filter((s) => {
      if (!s.isDisrupted && !s.isBlocked) return false;
      const isOriginOrDest = stateNodeIds.has(s.originNode) || stateNodeIds.has(s.destinationNode);
      const affectsRoad = s.affectedCorridors && s.affectedCorridors.some((r) => affectedCorridorsSet.has(r));
      return isOriginOrDest || affectsRoad;
    });

    let connectivityStatus = 'OPTIMAL';
    let reason = 'All major corridors clear and accessible.';
    if (blockedCount > 0) {
      connectivityStatus = 'CRITICAL_ISOLATION';
      reason = `${blockedCount} corridor(s) physically blocked. Bypass routes required.`;
    } else if (severeCount > 0) {
      connectivityStatus = 'SEVERELY_DISRUPTED';
      reason = `${severeCount} corridor(s) experiencing severe hazard disruption penalties.`;
    } else if (restrictedCount > 0) {
      connectivityStatus = 'RESTRICTED';
      reason = `${restrictedCount} corridor(s) restricted due to active road hazards.`;
    } else if (cautionCount > 0) {
      connectivityStatus = 'WATCHFUL';
      reason = `${cautionCount} corridor(s) under caution advisory.`;
    }

    return {
      state,
      connectivityIndex,
      connectivityStatus,
      reason,
      totalCorridors,
      openCorridors: openCount,
      cautionCorridors: cautionCount,
      restrictedCorridors: restrictedCount,
      severelyDisruptedCorridors: severeCount,
      blockedCorridors: blockedCount,
      activeIncidentsCount: stateIncidents.length,
      affectedCorridorsList: Array.from(affectedCorridorsSet),
      atRiskShipmentsCount: stateAtRiskShipments.length,
    };
  });

  // Overall Regional Summary
  const validStates = stateSummaries.filter((s) => s.connectivityIndex !== null);
  const regionalIndex = validStates.length > 0
    ? Math.round(validStates.reduce((acc, s) => acc + s.connectivityIndex, 0) / validStates.length)
    : 100;

  const totalOpen = stateSummaries.reduce((acc, s) => acc + s.openCorridors, 0);
  const totalCaution = stateSummaries.reduce((acc, s) => acc + s.cautionCorridors, 0);
  const totalRestricted = stateSummaries.reduce((acc, s) => acc + s.restrictedCorridors, 0);
  const totalSevere = stateSummaries.reduce((acc, s) => acc + s.severelyDisruptedCorridors, 0);
  const totalBlocked = stateSummaries.reduce((acc, s) => acc + s.blockedCorridors, 0);

  let regionalStatus = 'STABLE';
  if (totalBlocked > 0 || totalSevere > 2) {
    regionalStatus = 'CRITICAL_DISRUPTION';
  } else if (totalSevere > 0 || totalRestricted > 2) {
    regionalStatus = 'WATCHFUL';
  }

  return {
    regionalConnectivityIndex: regionalIndex,
    regionalStatus,
    formula: 'Connectivity Index = (weighted accessible corridor capacity / total corridors) * 100',
    corridorTotals: {
      open: totalOpen,
      caution: totalCaution,
      restricted: totalRestricted,
      severelyDisrupted: totalSevere,
      blocked: totalBlocked,
      total: totalOpen + totalCaution + totalRestricted + totalSevere + totalBlocked,
    },
    stateBreakdown: stateSummaries,
  };
}

/**
 * Aggregates Critical & Disrupted Corridors across the region.
 * Corridors with active disruptions or higher risk scores are prioritized.
 * @param {Object} context - { disruptions, incidents, shipments, vehicles }
 * @returns {Array} List of critical corridors with active hazard and logistics impact
 */
function computeCriticalCorridors({ disruptions = [], incidents = [], shipments = [], vehicles = [] } = {}) {
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const nodeMap = new Map();
  NODES.forEach((n) => nodeMap.set(n.id, n));

  // Distinct highway roads
  const roadNames = new Set(EDGES.filter((e) => e.road).map((e) => e.road));
  const corridorList = [];

  roadNames.forEach((road) => {
    const roadEdges = EDGES.filter((e) => e.road === road);
    const cleanRoad = road.trim().toLowerCase();

    // Find all active incidents on this road
    const matchingIncidents = activeIncidents.filter((inc) => {
      const incRoad = (inc.road || '').trim().toLowerCase();
      if (incRoad === cleanRoad) return true;
      return roadEdges.some((e) => {
        const fromN = inc.fromNode || inc.from_node;
        const toN = inc.toNode || inc.to_node;
        if (fromN && toN) {
          return (fromN === e.from && toN === e.to) || (fromN === e.to && toN === e.from);
        }
        const single = fromN || inc.nodeId || inc.node_id;
        return single && (single === e.from || single === e.to);
      });
    });

    // Evaluate accessibility of this corridor across its segments
    let maxMultiplier = 1.0;
    let isBlocked = false;
    let highestSeverity = 'minor';

    roadEdges.forEach((e) => {
      const access = evaluateEdgeAccessibility(e, disruptions);
      if (access.isBlocked) isBlocked = true;
      maxMultiplier = Math.max(maxMultiplier, access.multiplier);
      if (access.severity === 'blocked') highestSeverity = 'blocked';
      else if (access.severity === 'severe' && highestSeverity !== 'blocked') highestSeverity = 'severe';
      else if (access.severity === 'moderate' && highestSeverity !== 'blocked' && highestSeverity !== 'severe') highestSeverity = 'moderate';
    });

    let accessibilityState = 'OPEN';
    if (isBlocked) accessibilityState = 'BLOCKED';
    else if (maxMultiplier >= 15.0) accessibilityState = 'SEVERELY_DISRUPTED';
    else if (maxMultiplier >= 5.0) accessibilityState = 'RESTRICTED';
    else if (maxMultiplier >= 2.0) accessibilityState = 'CAUTION';

    // Find affected shipments on this corridor
    const affectedShipments = shipments.filter((s) => {
      if (!s.affectedCorridors) return false;
      return s.affectedCorridors.some((r) => r && r.toLowerCase() === cleanRoad);
    });

    // Find affected vehicles
    const affectedVehicleIds = new Set(affectedShipments.map((s) => s.vehicleId).filter(Boolean));
    const affectedVehicles = vehicles.filter((v) => affectedVehicleIds.has(v.id));

    // Calculate maximum delay on this corridor
    const maxDelay = affectedShipments.reduce((max, s) => Math.max(max, s.estimatedDelayMinutes || 0), 0);

    // Latest incident details
    const latestIncident = matchingIncidents.length > 0 ? matchingIncidents[0] : null;

    // Check GPS and Photo evidence availability on latest incident
    const hasGps = Boolean(
      latestIncident &&
      latestIncident.lat !== null && latestIncident.lat !== undefined && !isNaN(Number(latestIncident.lat)) &&
      latestIncident.lng !== null && latestIncident.lng !== undefined && !isNaN(Number(latestIncident.lng))
    );
    const hasPhoto = Boolean(
      latestIncident &&
      latestIncident.photoDataUrl &&
      typeof latestIncident.photoDataUrl === 'string' &&
      latestIncident.photoDataUrl.trim().length > 0
    );

    corridorList.push({
      corridor: road,
      road,
      segmentsCount: roadEdges.length,
      segments: roadEdges.map((e) => ({
        from: nodeMap.get(e.from)?.name || e.from,
        to: nodeMap.get(e.to)?.name || e.to,
        km: e.km,
        mode: e.mode || 'road',
      })),
      accessibilityState,
      severity: matchingIncidents.length > 0 ? highestSeverity : 'clear',
      activeIncidentCount: matchingIncidents.length,
      latestIncident: latestIncident ? {
        id: latestIncident.id,
        title: latestIncident.title,
        category: latestIncident.category,
        severity: latestIncident.severity,
        createdAt: latestIncident.createdAt || latestIncident.created_at,
        lat: latestIncident.lat ?? null,
        lng: latestIncident.lng ?? null,
        hasGps,
        hasPhoto,
        photoDataUrl: latestIncident.photoDataUrl || latestIncident.photo_url || null,
      } : null,
      affectedShipmentsCount: affectedShipments.length,
      affectedShipments: affectedShipments.map((s) => ({
        id: s.id,
        origin: s.originNode,
        destination: s.destinationNode,
        cargoType: s.cargoType,
        estimatedDelayMinutes: s.estimatedDelayMinutes || 0,
        status: s.status,
      })),
      affectedVehiclesCount: affectedVehicles.length,
      estimatedDelayMinutes: isBlocked ? null : maxDelay,
      isBlocked,
      disruptionReason: isBlocked
        ? `Corridor ${road} is blocked. Physical obstruction reported.`
        : matchingIncidents.length > 0
        ? `Corridor ${road} has ${matchingIncidents.length} active hazard report(s). Delay penalty: +${maxDelay}m.`
        : `Corridor ${road} is operating normally.`,
    });
  });

  // Sort critical / disrupted corridors first
  const severityRank = { blocked: 4, severe: 3, moderate: 2, minor: 1, clear: 0 };
  return corridorList.sort((a, b) => {
    const rankDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (rankDiff !== 0) return rankDiff;
    return b.activeIncidentCount - a.activeIncidentCount;
  });
}

/**
 * Aggregates multi-hazard alerts across the region with evidence and GPS preservation.
 * @param {Array} incidents - Field officer & driver incidents
 * @param {Array} alerts - System & operational alerts
 * @returns {Array} Cleanly formatted multi-hazard alerts
 */
function aggregateMultiHazardAlerts(incidents = [], alerts = []) {
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');

  return activeIncidents.map((inc) => {
    const hasGps = Boolean(
      inc.lat !== null && inc.lat !== undefined && !isNaN(Number(inc.lat)) &&
      inc.lng !== null && inc.lng !== undefined && !isNaN(Number(inc.lng))
    );
    const hasPhoto = Boolean(
      inc.photoDataUrl &&
      typeof inc.photoDataUrl === 'string' &&
      inc.photoDataUrl.trim().length > 0
    );

    let source = 'PWD Field Officer';
    if (inc.reporterRole === 'driver' || inc.role === 'driver') source = 'Registered Driver';
    else if (inc.createdBy === 'system') source = 'Automated System Monitor';

    return {
      id: inc.id,
      category: inc.category || 'landslide',
      severity: inc.severity || 'moderate',
      title: inc.title,
      description: inc.description || '',
      road: inc.road || null,
      nodeId: inc.nodeId || inc.node_id || null,
      fromNode: inc.fromNode || inc.from_node || null,
      toNode: inc.toNode || inc.to_node || null,
      lat: hasGps ? Number(inc.lat) : null,
      lng: hasGps ? Number(inc.lng) : null,
      hasGps,
      hasPhoto,
      photoDataUrl: inc.photoDataUrl || inc.photo_url || null,
      createdAt: inc.createdAt || inc.created_at || new Date().toISOString(),
      status: inc.status || 'open',
      source,
    };
  });
}

/**
 * Evaluates an Emergency Route for Government Officials using the canonical routing engine.
 * @param {string} originNode
 * @param {string} destinationNode
 * @param {Object} context - { disruptions, weatherSeverityByNode }
 * @returns {Object} Emergency route analysis with accessibility, delay, and multimodal recommendations
 */
function evaluateEmergencyRoute(originNode, destinationNode, { disruptions = [], weatherSeverityByNode = {} } = {}) {
  const nodeMap = new Map();
  NODES.forEach((n) => nodeMap.set(n.id, n));

  if (!nodeMap.has(originNode) || !nodeMap.has(destinationNode)) {
    return {
      viable: false,
      error: 'Invalid or unknown origin/destination node in NER network.',
      accessibilityState: 'UNAVAILABLE',
      route: null,
      recommendedAlternative: null,
    };
  }

  // 1. Baseline Route (clean conditions)
  let baselineRoute = null;
  try {
    baselineRoute = findRoute(originNode, destinationNode, { mode: 'road', disruptions: [], weatherSeverityByNode: {} });
  } catch (_) {}

  const baseDurationMinutes = baselineRoute ? (baselineRoute.baseDurationMinutes || baselineRoute.etaMinutes) : null;

  // 2. Disrupted Road Route
  let currentRoute = null;
  let isBlocked = false;
  try {
    currentRoute = findRoute(originNode, destinationNode, { mode: 'road', disruptions, weatherSeverityByNode });
  } catch (_) {
    isBlocked = true;
  }
  if (!currentRoute) isBlocked = true;

  let currentEtaMinutes = null;
  let estimatedDelayMinutes = 0;
  let accessibilityState = 'OPEN';

  if (isBlocked) {
    accessibilityState = 'BLOCKED';
    currentEtaMinutes = null;
    estimatedDelayMinutes = null;
  } else {
    currentEtaMinutes = currentRoute.etaMinutes;
    if (baseDurationMinutes !== null && currentEtaMinutes !== null) {
      estimatedDelayMinutes = Math.max(0, currentEtaMinutes - baseDurationMinutes);
    }
    accessibilityState = currentRoute.accessibilityState || 'OPEN';
  }

  // 3. Multimodal Alternative Recommendation (Rail / Air / Waterway)
  let recommendedAlternative = null;
  const isDisrupted = isBlocked || estimatedDelayMinutes > 0 || (accessibilityState !== 'OPEN');

  if (isDisrupted) {
    try {
      const candidates = {};
      ['road', 'railway', 'air', 'waterway'].forEach((m) => {
        try {
          candidates[m] = findRoute(originNode, destinationNode, { mode: m, disruptions, weatherSeverityByNode });
        } catch (_) {
          candidates[m] = null;
        }
      });

      const recommendation = scoreAndRecommendRoutes(candidates, {
        cargoType: 'Emergency Relief & Medical Supplies',
        priority: 'emergency',
      });

      if (recommendation && recommendation.recommendedMode) {
        recommendedAlternative = {
          mode: recommendation.recommendedMode,
          reason: recommendation.recommendationReason,
          rank: 1,
          etaMinutes: recommendation.route ? recommendation.route.etaMinutes : null,
          safetyIndex: recommendation.route ? recommendation.route.safetyIndex : null,
          decisionScore: recommendation.decisionScore || recommendation.score,
        };
      }
    } catch (_) {}
  }

  const originName = nodeMap.get(originNode)?.name || originNode;
  const destinationName = nodeMap.get(destinationNode)?.name || destinationNode;

  return {
    viable: !isBlocked,
    originNode,
    destinationNode,
    originName,
    destinationName,
    baseDurationMinutes,
    currentEtaMinutes,
    estimatedDelayMinutes,
    accessibilityState,
    isBlocked,
    isDisrupted,
    route: currentRoute,
    recommendedAlternative,
    explanation: isBlocked
      ? `Direct road route from ${originName} to ${destinationName} is completely blocked. Use multimodal alternative (${recommendedAlternative?.mode?.toUpperCase() || 'RAIL / AIR'}).`
      : isDisrupted
      ? `Road transit has +${estimatedDelayMinutes}m delay (${accessibilityState.replace('_', ' ')}). Bypass available via ${recommendedAlternative?.mode?.toUpperCase() || 'multimodal transport'}.`
      : `Emergency corridor ${originName} → ${destinationName} is fully open and operating on schedule.`,
  };
}

/**
 * Summarizes at-risk shipments and vehicles for the Government Command Center.
 * @param {Array} shipments - Enriched shipments from Phase 4
 * @param {Array} vehicles - Enriched vehicles from Phase 4
 * @returns {Object} At-risk logistics overview
 */
function summarizeAtRiskLogistics(shipments = [], vehicles = []) {
  const atRiskShipments = shipments.filter((s) => s.isDisrupted || s.isBlocked || (s.estimatedDelayMinutes > 0));
  const blockedShipments = shipments.filter((s) => s.isBlocked || s.status === 'blocked');
  const delayedShipments = shipments.filter((s) => s.status === 'delayed' || (s.estimatedDelayMinutes > 0));
  const unavailableEtaShipments = shipments.filter((s) => s.etaStatus === 'UNAVAILABLE' || (s.isBlocked && s.currentEtaMinutes === null));

  const atRiskVehicleIds = new Set(atRiskShipments.map((s) => s.vehicleId).filter(Boolean));
  const atRiskVehicles = vehicles.filter((v) => atRiskVehicleIds.has(v.id));
  const inTransitVehicles = vehicles.filter((v) => v.status === 'in_transit');

  return {
    totalActiveShipments: shipments.length,
    atRiskCount: atRiskShipments.length,
    blockedCount: blockedShipments.length,
    delayedCount: delayedShipments.length,
    unavailableEtaCount: unavailableEtaShipments.length,
    inTransitVehiclesCount: inTransitVehicles.length,
    atRiskVehiclesCount: atRiskVehicles.length,
    atRiskShipments: atRiskShipments.map((s) => ({
      id: s.id,
      origin: s.originNode,
      destination: s.destinationNode,
      cargoType: s.cargoType,
      priority: s.priority,
      status: s.status,
      accessibilityState: s.accessibilityState || 'DISRUPTED',
      baseDurationMinutes: s.baseDurationMinutes,
      currentEtaMinutes: s.currentEtaMinutes,
      estimatedDelayMinutes: s.estimatedDelayMinutes,
      affectedCorridors: s.affectedCorridors || [],
      affectedIncidents: (s.affectedIncidents || []).map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        severity: i.severity,
        road: i.road,
        hasGps: i.hasGps,
        hasPhoto: Boolean(i.photoDataUrl),
      })),
      recommendedAlternative: s.recommendedAlternative || null,
      vehicle: s.vehicle ? {
        id: s.vehicle.id,
        vehicleNumber: s.vehicle.vehicleNumber,
        vehicleType: s.vehicle.vehicleType,
        locationSource: s.vehicle.locationSource,
      } : null,
    })),
    atRiskVehicles: atRiskVehicles.map((v) => ({
      id: v.id,
      vehicleNumber: v.vehicleNumber,
      vehicleType: v.vehicleType,
      status: v.status,
      lat: v.lat,
      lng: v.lng,
      locationSource: v.locationSource,
      assignedShipment: v.assignedShipment,
    })),
  };
}

module.exports = {
  NER_STATES,
  evaluateEdgeAccessibility,
  computeRegionalConnectivity,
  computeCriticalCorridors,
  aggregateMultiHazardAlerts,
  evaluateEmergencyRoute,
  summarizeAtRiskLogistics,
};
