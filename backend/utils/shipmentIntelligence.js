/**
 * NER-SAHAYAK — Shipment & Vehicle Intelligence Service (Phase 4)
 *
 * Deterministically associates shipments with active corridor disruptions,
 * evaluates route accessibility, computes delay/ETA differences,
 * handles vehicle-shipment relationships, and provides multimodal recommendations.
 *
 * Reuses existing Dijkstra routing, disruption multipliers, and routeScorer logic.
 */

const { findRoute } = require('./dijkstra');
const { scoreAndRecommendRoutes } = require('./routeScorer');
const { NODES, EDGES } = require('../data/nerNetwork');

/**
 * Determines explicit location source for a vehicle.
 * Guarantees that static coordinates are never presented as live GPS.
 * @param {Object} v - Vehicle record
 * @returns {'LIVE_GPS'|'LAST_KNOWN'|'STATIC_DEMO'|'UNAVAILABLE'}
 */
function determineLocationSource(v) {
  if (!v) return 'UNAVAILABLE';
  const hasLat = v.lat !== null && v.lat !== undefined && v.lat !== '' && !isNaN(Number(v.lat));
  const hasLng = v.lng !== null && v.lng !== undefined && v.lng !== '' && !isNaN(Number(v.lng));

  if (!hasLat || !hasLng) {
    return 'UNAVAILABLE';
  }

  if (v.locationSource) {
    return v.locationSource;
  }

  if (v.isDemo || v.is_demo) {
    return 'STATIC_DEMO';
  }

  return 'LAST_KNOWN';
}

/**
 * Evaluates active corridor disruptions, delay, accessibility state, and alternative routes for a shipment.
 * @param {Object} shipment - The shipment record
 * @param {Object} context - { disruptions, incidents, weatherSeverityByNode }
 * @returns {Object} Enriched shipment record
 */
function evaluateShipmentDisruption(shipment, { disruptions = [], incidents = [], weatherSeverityByNode = {} } = {}) {
  if (!shipment) return null;

  const originNode = shipment.originNode || shipment.origin_node;
  const destinationNode = shipment.destinationNode || shipment.destination_node;

  if (!originNode || !destinationNode) {
    return {
      ...shipment,
      baseDurationMinutes: shipment.etaMinutes || null,
      currentEtaMinutes: null,
      estimatedDelayMinutes: null,
      etaStatus: 'UNAVAILABLE',
      isDisrupted: false,
      isBlocked: false,
      accessibilityState: 'OPEN',
      affectedCorridors: [],
      affectedIncidents: [],
      recommendedAlternative: null,
    };
  }

  // 1. Compute baseline route with clean conditions (no active disruptions)
  const shipmentMode = shipment.mode || 'road';
  let baselineRoute = null;
  try {
    baselineRoute = findRoute(originNode, destinationNode, { mode: shipmentMode, weatherSeverityByNode: {}, disruptions: [] });
  } catch (_) {}

  const baseDurationMinutes = baselineRoute
    ? (baselineRoute.baseDurationMinutes || baselineRoute.etaMinutes)
    : (shipment.etaMinutes || null);

  // 2. Compute current route with active disruptions and weather
  let currentRoute = null;
  let isBlocked = false;
  try {
    currentRoute = findRoute(originNode, destinationNode, { mode: shipmentMode, weatherSeverityByNode, disruptions });
  } catch (_) {
    isBlocked = true;
  }

  if (!currentRoute) {
    isBlocked = true;
  }

  // 3. Derive current ETA and exact delay difference
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
    } else {
      estimatedDelayMinutes = 0;
    }
    accessibilityState = currentRoute.accessibilityState || 'OPEN';
  }

  // 4. Identify matching active incidents along this corridor
  const routeRoads = new Set();
  const routeNodes = new Set([originNode, destinationNode]);

  if (baselineRoute && baselineRoute.segments) {
    baselineRoute.segments.forEach((seg) => {
      if (seg.road) routeRoads.add(seg.road.trim().toLowerCase());
      if (seg.from && seg.from.id) routeNodes.add(seg.from.id);
      if (seg.to && seg.to.id) routeNodes.add(seg.to.id);
    });
  }

  if (currentRoute && currentRoute.segments) {
    currentRoute.segments.forEach((seg) => {
      if (seg.road) routeRoads.add(seg.road.trim().toLowerCase());
      if (seg.from && seg.from.id) routeNodes.add(seg.from.id);
      if (seg.to && seg.to.id) routeNodes.add(seg.to.id);
    });
  }

  const affectedIncidents = [];
  const affectedCorridorsSet = new Set();

  incidents.forEach((inc) => {
    if (!inc || inc.status === 'resolved') return;

    const incRoad = (inc.road || '').trim().toLowerCase();
    const incFrom = inc.fromNode || inc.from_node;
    const incTo = inc.toNode || inc.to_node;
    const incNode = inc.nodeId || inc.node_id;

    let matches = false;
    if (incRoad && routeRoads.has(incRoad)) {
      matches = true;
      affectedCorridorsSet.add(inc.road);
    } else if (incFrom && incTo && routeNodes.has(incFrom) && routeNodes.has(incTo)) {
      matches = true;
      if (inc.road) affectedCorridorsSet.add(inc.road);
    } else if (incNode && routeNodes.has(incNode)) {
      matches = true;
      if (inc.road) affectedCorridorsSet.add(inc.road);
    }

    if (matches) {
      affectedIncidents.push({
        id: inc.id,
        title: inc.title,
        category: inc.category,
        severity: inc.severity,
        road: inc.road,
        fromNode: incFrom || null,
        toNode: incTo || null,
        lat: inc.lat ?? null,
        lng: inc.lng ?? null,
        hasGps: Boolean(inc.hasGps || (inc.lat !== null && inc.lat !== undefined && inc.lng !== null && inc.lng !== undefined)),
        photoDataUrl: inc.photoDataUrl || inc.photo_url || null,
        estimatedDelayMinutes: Number(inc.estimatedDelayMinutes || inc.estimated_delay_minutes) || 0,
      });
    }
  });

  const isDisrupted = Boolean(
    isBlocked ||
    estimatedDelayMinutes > 0 ||
    affectedIncidents.length > 0 ||
    (accessibilityState && accessibilityState !== 'OPEN')
  );

  // 5. Multi-modal alternative recommendation if route is disrupted
  let recommendedAlternative = null;
  if (isDisrupted) {
    try {
      const candidates = {};
      ['road', 'railway', 'air', 'waterway'].forEach((m) => {
        try {
          candidates[m] = findRoute(originNode, destinationNode, { mode: m, weatherSeverityByNode, disruptions });
        } catch (_) {
          candidates[m] = null;
        }
      });

      const recommendation = scoreAndRecommendRoutes(candidates, {
        cargoType: shipment.cargoType || 'General Cargo',
        priority: shipment.priority || 'normal',
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

  return {
    ...shipment,
    baseDurationMinutes,
    currentEtaMinutes,
    estimatedDelayMinutes,
    etaStatus: (baseDurationMinutes !== null || currentEtaMinutes !== null) ? 'CALCULATED' : 'UNAVAILABLE',
    isDisrupted,
    isBlocked,
    accessibilityState,
    affectedCorridors: Array.from(affectedCorridorsSet),
    affectedIncidents,
    recommendedAlternative,
  };
}

/**
 * Enriches a list of shipments with vehicle telemetry and disruption intelligence.
 * @param {Array} shipments
 * @param {Array} vehicles
 * @param {Object} context - { disruptions, incidents, weatherSeverityByNode }
 * @returns {Array}
 */
function enrichShipments(shipments = [], vehicles = [], context = {}) {
  const vehicleMap = new Map();
  vehicles.forEach((v) => {
    if (v && v.id) vehicleMap.set(v.id, v);
  });

  return shipments.map((s) => {
    const rawVehicle = s.vehicleId ? vehicleMap.get(s.vehicleId) : null;
    let linkedVehicle = null;

    if (rawVehicle) {
      linkedVehicle = {
        id: rawVehicle.id,
        vehicleNumber: rawVehicle.vehicleNumber || rawVehicle.vehicle_number,
        vehicleType: rawVehicle.vehicleType || rawVehicle.vehicle_type || 'Heavy Truck',
        capacityTonnes: rawVehicle.capacityTonnes || rawVehicle.capacity_tonnes || 16.0,
        status: rawVehicle.status,
        lat: rawVehicle.lat ?? null,
        lng: rawVehicle.lng ?? null,
        locationSource: determineLocationSource(rawVehicle),
        lastUpdated: rawVehicle.lastUpdated || rawVehicle.last_updated,
      };
    }

    const evaluated = evaluateShipmentDisruption(s, context);
    return {
      ...evaluated,
      vehicle: linkedVehicle,
      vehicleId: s.vehicleId || null,
    };
  });
}

/**
 * Enriches a list of vehicles with explicit locationSource and assigned shipment details.
 * @param {Array} vehicles
 * @param {Array} shipments
 * @returns {Array}
 */
function enrichVehicles(vehicles = [], shipments = []) {
  // Map of active shipment by vehicleId
  const activeShipmentByVehicle = new Map();
  shipments.forEach((s) => {
    if (s.vehicleId && s.status !== 'delivered' && s.status !== 'cancelled') {
      activeShipmentByVehicle.set(s.vehicleId, {
        id: s.id,
        originNode: s.originNode,
        destinationNode: s.destinationNode,
        cargoType: s.cargoType,
        priority: s.priority,
        status: s.status,
        isDisrupted: s.isDisrupted || false,
        estimatedDelayMinutes: s.estimatedDelayMinutes || 0,
      });
    }
  });

  return vehicles.map((v) => {
    const locationSource = determineLocationSource(v);
    const assignedShipment = activeShipmentByVehicle.get(v.id) || null;

    return {
      id: v.id,
      ownerId: v.ownerId || v.owner_id,
      driverId: v.driverId || v.driver_id || null,
      vehicleNumber: v.vehicleNumber || v.vehicle_number,
      vehicleType: v.vehicleType || v.vehicle_type || 'Heavy Truck',
      cargoType: v.cargoType || v.cargo_type || 'General cargo',
      capacityTonnes: v.capacityTonnes || v.capacity_tonnes || 16.0,
      originNode: v.originNode || v.origin_node,
      destinationNode: v.destinationNode || v.destination_node,
      status: v.status || 'idle',
      lat: v.lat ?? null,
      lng: v.lng ?? null,
      locationSource,
      lastUpdated: v.lastUpdated || v.last_updated,
      isDemo: Boolean(v.isDemo || v.is_demo),
      assignedShipment,
    };
  });
}

module.exports = {
  determineLocationSource,
  evaluateShipmentDisruption,
  enrichShipments,
  enrichVehicles,
};
