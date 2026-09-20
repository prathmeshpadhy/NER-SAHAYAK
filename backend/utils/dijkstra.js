const { NODES, EDGES } = require('../data/nerNetwork');

function buildGraph() {
  const clean = {};
  NODES.forEach((n) => { clean[n.id] = []; });
  EDGES.forEach((e) => {
    const mode = e.mode || 'road';
    clean[e.from].push({ from: e.from, to: e.to, km: e.km, terrainFactor: e.terrainFactor, road: e.road, mode });
    clean[e.to].push({ from: e.to, to: e.from, km: e.km, terrainFactor: e.terrainFactor, road: e.road, mode });
  });
  return clean;
}

/**
 * Compute edge risk weight.
 * Safety is heavily prioritized over raw distance:
 * Hazards (landslides, floods, storms) apply exponential penalties so the router
 * willingly chooses longer, slower bypasses if they guarantee safe delivery.
 */
function edgeWeight(edge, { weatherSeverityByNode = {}, disruptions = [] } = {}) {
  const baseWeight = edge.km * edge.terrainFactor;

  // Weather severity (0 to 1) -> exponential risk penalty up to 8x
  const wA = weatherSeverityByNode[edge.from] ?? 0;
  const wB = weatherSeverityByNode[edge.to] ?? 0;
  const weatherSeverity = Math.max(wA, wB);
  const weatherMultiplier = 1 + Math.pow(weatherSeverity, 2) * 8.0;

  // Active field disruption reports (landslide, flood, bridge damage)
  const relevant = disruptions.filter((d) => {
    // If road is specified, match road name
    if (d.road && edge.road && d.road.toLowerCase().trim() === edge.road.toLowerCase().trim()) {
      return true;
    }
    // If fromNode and toNode match
    if (d.fromNode && d.toNode) {
      const matchEndpoints = (d.fromNode === edge.from && d.toNode === edge.to) || 
                             (d.fromNode === edge.to && d.toNode === edge.from);
      if (matchEndpoints) {
        // If disruption specifies a road (like NH27), and this edge is a railway/waterway line, do NOT cross-pollinate
        if (d.road && edge.road && d.road.toUpperCase() !== edge.road.toUpperCase() && edge.mode !== 'road') {
          return false;
        }
        return true;
      }
    }
    // If single node (fromNode or nodeId) is specified without toNode, match connected edges
    const singleNode = d.fromNode || d.nodeId;
    if (singleNode && !d.toNode) {
      if (edge.from === singleNode || edge.to === singleNode) {
        if (d.road && edge.road && d.road.toUpperCase() !== edge.road.toUpperCase() && edge.mode !== 'road') {
          return false;
        }
        return true;
      }
    }
    return false;
  });
  let disruptionMultiplier = 1;
  let blocked = false;
  relevant.forEach((d) => {
    if (d.severity === 'blocked') blocked = true;
    else if (d.severity === 'severe') disruptionMultiplier = Math.max(disruptionMultiplier, 15.0); // 15x safety penalty
    else if (d.severity === 'moderate') disruptionMultiplier = Math.max(disruptionMultiplier, 5.0);  // 5x safety penalty
    else if (d.severity === 'minor') disruptionMultiplier = Math.max(disruptionMultiplier, 2.0);
  });

  return {
    weight: blocked ? Infinity : baseWeight * weatherMultiplier * disruptionMultiplier,
    weatherSeverity,
    disruptionMultiplier,
    blocked,
  };
}

/**
 * Safety-Prioritized Dijkstra Algorithm with Multimodal Stage Support.
 * For target modes ('railway', 'waterway', 'air'):
 * Guarantees the multimodal transfer pattern:
 * Origin -> (first-mile road) -> Target Mode Trunk -> (last-mile road) -> Destination
 * Returns route with safety index, total km, ETA, and segment conditions.
 */
function findRoute(startId, endId, context = {}) {
  const graph = buildGraph();
  if (!graph[startId] || !graph[endId]) {
    throw new Error('Unknown start or end location');
  }

  const targetMode = context.mode;
  const isMultimodalTarget = targetMode && targetMode !== 'all' && targetMode !== 'road';

  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));

  // -------------------------------------------------------------------------
  // 1. STANDARD SINGLE-STAGE ROUTING (for 'all' or 'road')
  // -------------------------------------------------------------------------
  if (!isMultimodalTarget) {
    const dist = {};
    const prevEdge = {};
    const queue = new Set(Object.keys(graph));
    Object.keys(graph).forEach((id) => { dist[id] = Infinity; });
    dist[startId] = 0;

    while (queue.size) {
      let u = null;
      let best = Infinity;
      for (const id of queue) {
        if (dist[id] < best) { best = dist[id]; u = id; }
      }
      if (u === null) break;
      queue.delete(u);
      if (u === endId) break;

      for (const edge of graph[u]) {
        if (targetMode === 'road' && edge.mode !== 'road') continue;

        const { weight, weatherSeverity, disruptionMultiplier, blocked } = edgeWeight(edge, context);
        if (blocked) continue;

        const alt = dist[u] + weight;
        if (alt < dist[edge.to]) {
          dist[edge.to] = alt;
          prevEdge[edge.to] = { ...edge, weatherSeverity, disruptionMultiplier };
        }
      }
    }

    if (dist[endId] === Infinity) return null;

    const pathEdges = [];
    let cur = endId;
    while (cur !== startId) {
      const e = prevEdge[cur];
      if (!e) break;
      pathEdges.unshift(e);
      cur = e.from;
    }

    return buildRouteResult(startId, endId, pathEdges, dist[endId], nodeMap);
  }

  // -------------------------------------------------------------------------
  // 2. STATE-EXPANDED MULTIMODAL ROUTING (for 'railway', 'waterway', 'air')
  // Stage 0: First-mile road access to transfer hub / station / port / airport
  // Stage 1: Main freight corridor using targetMode (must traverse >= 1 targetMode edge)
  // Stage 2: Last-mile road egress from station / port / airport to destination
  // -------------------------------------------------------------------------
  const dist = {};
  const prevEdge = {};
  const queue = new Set();

  for (const n of NODES) {
    for (let s = 0; s <= 2; s++) {
      const k = `${n.id}|${s}`;
      dist[k] = Infinity;
      queue.add(k);
    }
  }

  dist[`${startId}|0`] = 0;

  // Weight incentives / road transfer penalties
  const modeIncentive = targetMode === 'air' ? 0.35 : (targetMode === 'waterway' ? 0.75 : 0.85);
  const roadTransferPenalty = 1.35;

  while (queue.size) {
    let uKey = null;
    let best = Infinity;
    for (const k of queue) {
      if (dist[k] < best) { best = dist[k]; uKey = k; }
    }
    if (uKey === null || best === Infinity) break;
    queue.delete(uKey);

    const [uId, sStr] = uKey.split('|');
    const stage = parseInt(sStr, 10);
    if (uId === endId && (stage === 1 || stage === 2)) break;

    const prev = prevEdge[uKey];
    const prevNode = prev ? prev.from : null;

    for (const edge of graph[uId]) {
      // Forbid immediate backtrack on previous edge
      if (edge.to === prevNode) continue;

      let nextStage = null;
      let costMultiplier = 1.0;

      if (stage === 0) {
        if (edge.mode === targetMode) {
          nextStage = 1;
          costMultiplier = modeIncentive;
        } else if (edge.mode === 'road') {
          nextStage = 0;
          costMultiplier = roadTransferPenalty;
        }
      } else if (stage === 1) {
        if (edge.mode === targetMode) {
          nextStage = 1;
          costMultiplier = modeIncentive;
        } else if (edge.mode === 'road') {
          nextStage = 2;
          costMultiplier = roadTransferPenalty;
        }
      } else if (stage === 2) {
        if (edge.mode === 'road') {
          nextStage = 2;
          costMultiplier = roadTransferPenalty;
        }
      }

      if (nextStage === null) continue;

      const { weight, weatherSeverity, disruptionMultiplier, blocked } = edgeWeight(edge, context);
      if (blocked) continue;

      const alt = dist[uKey] + weight * costMultiplier;
      const nextKey = `${edge.to}|${nextStage}`;
      if (alt < dist[nextKey]) {
        dist[nextKey] = alt;
        prevEdge[nextKey] = { ...edge, weatherSeverity, disruptionMultiplier, fromKey: uKey };
      }
    }
  }

  // A valid multimodal path must finish in stage 1 or stage 2 (having used targetMode)
  const k1 = `${endId}|1`;
  const k2 = `${endId}|2`;
  let bestEndKey = null;

  if (dist[k1] !== Infinity && dist[k2] !== Infinity) {
    bestEndKey = dist[k1] <= dist[k2] ? k1 : k2;
  } else if (dist[k1] !== Infinity) {
    bestEndKey = k1;
  } else if (dist[k2] !== Infinity) {
    bestEndKey = k2;
  }

  if (!bestEndKey) {
    return null; // genuinely no multimodal path reachable using targetMode
  }

  const pathEdges = [];
  let cur = bestEndKey;
  while (cur) {
    const p = prevEdge[cur];
    if (!p) break;
    pathEdges.unshift(p);
    cur = p.fromKey;
  }

  // Safety check: verify path actually utilized the target mode
  if (!pathEdges.some((e) => e.mode === targetMode)) {
    return null;
  }

  return buildRouteResult(startId, endId, pathEdges, dist[bestEndKey], nodeMap);
}

function buildRouteResult(startId, endId, pathEdges, totalWeight, nodeMap) {
  const totalKm = pathEdges.reduce((s, e) => s + e.km, 0);

  let totalMinutes = 0;
  const segments = pathEdges.map((e) => {
    let baseSpeed = 45;
    if (e.mode === 'air') baseSpeed = 500;
    else if (e.mode === 'railway') baseSpeed = 55;
    else if (e.mode === 'waterway') baseSpeed = 24;

    const edgeRatio = (e.disruptionMultiplier || 1) * Math.max(1, (e.weatherSeverity || 0) * 2);
    const speed = Math.max(12, baseSpeed / Math.sqrt(edgeRatio));
    const segmentTime = Math.round((e.km / speed) * 60);
    totalMinutes += (e.km / speed) * 60;

    // Segment condition
    const isDisrupted = (e.weatherSeverity > 0.6 || (e.disruptionMultiplier && e.disruptionMultiplier >= 4.0));
    const isCaution = (e.weatherSeverity > 0.3 || (e.disruptionMultiplier && e.disruptionMultiplier >= 1.8));
    const condition = isDisrupted ? 'disrupted' : (isCaution ? 'caution' : 'clear');

    // Individual segment safety percentage (0-100)
    let segmentSafety = 98;
    if (e.disruptionMultiplier >= 15) segmentSafety -= 55;
    else if (e.disruptionMultiplier >= 5) segmentSafety -= 35;
    else if (e.disruptionMultiplier >= 2) segmentSafety -= 15;

    segmentSafety -= Math.round((e.weatherSeverity || 0) * 25);
    if (e.terrainFactor && e.terrainFactor > 1.3) {
      segmentSafety -= Math.round((e.terrainFactor - 1) * 10);
    }
    segmentSafety = Math.max(15, Math.min(99, segmentSafety));

    return {
      from: nodeMap[e.from],
      to: nodeMap[e.to],
      km: e.km,
      distance: e.km,
      time: segmentTime,
      road: e.road,
      corridor: e.road,
      mode: e.mode || 'road',
      weatherSeverity: Number((e.weatherSeverity || 0).toFixed(2)),
      disruptionMultiplier: e.disruptionMultiplier || 1,
      condition,
      risk: condition,
      status: condition,
      safetyIndex: segmentSafety,
    };
  });

  const etaMinutes = Math.round(totalMinutes);
  const avgSpeedKmh = totalKm > 0 ? Number((totalKm / (etaMinutes / 60)).toFixed(1)) : 0;

  // Distance-weighted safety aggregation across all segments
  let weightedSafetySum = 0;
  segments.forEach((seg) => {
    weightedSafetySum += seg.km * seg.safetyIndex;
  });
  let routeSafety = totalKm > 0 ? (weightedSafetySum / totalKm) : 95;

  // Corridor hazard damping if any segment has severe disruption
  const hasSevereDisruption = segments.some((s) => s.disruptionMultiplier >= 14);
  const hasModerateDisruption = segments.some((s) => s.disruptionMultiplier >= 4);
  if (hasSevereDisruption) {
    routeSafety = Math.min(routeSafety, 55);
  } else if (hasModerateDisruption) {
    routeSafety = Math.min(routeSafety, 78);
  }
  const safetyIndex = Math.max(15, Math.min(99, Math.round(routeSafety)));

  // Identify multimodal transfer nodes
  const transfers = [];
  for (let i = 0; i < pathEdges.length - 1; i++) {
    if (pathEdges[i].mode !== pathEdges[i + 1].mode) {
      transfers.push({
        node: nodeMap[pathEdges[i].to],
        fromMode: pathEdges[i].mode,
        toMode: pathEdges[i + 1].mode,
        name: nodeMap[pathEdges[i].to]?.name || pathEdges[i].to,
      });
    }
  }

  // Determine dominant mode label
  const hasAir = pathEdges.some((e) => e.mode === 'air');
  const hasRailway = pathEdges.some((e) => e.mode === 'railway');
  const hasWaterway = pathEdges.some((e) => e.mode === 'waterway');
  let modeLabel = 'ROAD';
  let primaryMode = 'road';
  if (hasAir) {
    modeLabel = 'AIR + ROAD';
    primaryMode = 'air';
  } else if (hasRailway) {
    modeLabel = 'RAIL + ROAD';
    primaryMode = 'railway';
  } else if (hasWaterway) {
    modeLabel = 'WATERWAY + ROAD';
    primaryMode = 'waterway';
  }

  const path = [startId, ...pathEdges.map((e) => e.to)].map((id) => nodeMap[id]);

  return {
    path,
    edges: segments,
    segments,
    transfers,
    mode: primaryMode,
    modeLabel,
    totalKm: Number(totalKm.toFixed(1)),
    totalDistance: Number(totalKm.toFixed(1)),
    totalWeight: Number(totalWeight.toFixed(1)),
    avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
    etaMinutes,
    totalTime: etaMinutes,
    safetyIndex,
  };
}

/** Find k alternate routes prioritizing safety over raw distance. */
function findAlternateRoutes(startId, endId, context = {}, k = 3) {
  const results = [];
  const penalized = new Set();
  for (let i = 0; i < k; i++) {
    const ctx = {
      ...context,
      disruptions: [
        ...(context.disruptions || []),
        ...[...penalized].map((key) => {
          const [a, b] = key.split('|');
          return { fromNode: a, toNode: b, severity: 'moderate' };
        }),
      ],
    };
    const route = findRoute(startId, endId, ctx);
    if (!route) break;
    const dup = results.some((r) => r.totalKm === route.totalKm && r.edges.length === route.edges.length);
    if (!dup) results.push(route);
    route.edges.forEach((e) => penalized.add(`${e.from.id}|${e.to.id}`));
  }
  return results;
}

module.exports = { findRoute, findAlternateRoutes, buildGraph };
