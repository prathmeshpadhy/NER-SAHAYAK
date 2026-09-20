/**
 * Centralized Multimodal Route Scoring & Recommendation Engine for NER-Sahayak
 * 
 * Evaluates candidates (ROAD, RAIL + ROAD, WATERWAY + ROAD, AIR + ROAD)
 * using a normalized multi-criteria composite decision model.
 * 
 * Criteria:
 *  1. Travel Time (ETA in minutes)
 *  2. Distance (km / fuel & vehicle wear)
 *  3. Corridor Risk (100 - safetyIndex, accounting for active weather & field disruptions)
 *  4. Transport Suitability (Cargo type, weight, priority, emergency mode, and transfer friction)
 */

function scoreAndRecommendRoutes(routes = {}, options = {}) {
  const {
    cargoType = 'General Cargo',
    weight = 100,
    priority = 'Normal',
    emergencyMode = false
  } = options;

  const isEmergency = emergencyMode || priority === 'Emergency' || priority === 'urgent' || priority === 'emergency';
  const isHighPriority = priority === 'High' || priority === 'high';
  const isHeavy = cargoType === 'Heavy Cargo' || Number(weight) > 5000;
  const isPerishableOrUrgent = cargoType === 'Perishable' || 
                               cargoType === 'Pharmaceutical / Medicine' || 
                               cargoType === 'Emergency Supplies';
  const isHighValue = cargoType === 'High Value';

  // Identify available candidate modes
  const availableModes = Object.keys(routes).filter((m) => routes[m] !== null && routes[m] !== undefined);
  if (availableModes.length === 0) {
    return null;
  }

  // Extract metrics across available candidates for min-max normalization
  const times = availableModes.map((m) => routes[m].etaMinutes || 0);
  const distances = availableModes.map((m) => routes[m].totalKm || 0);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);

  // Determine base weights according to operational priority
  let wTime = 0.35;
  let wDist = 0.20;
  let wRisk = 0.45;

  if (isEmergency) {
    wTime = 0.65;
    wDist = 0.05;
    wRisk = 0.30;
  } else if (isHighPriority) {
    wTime = 0.50;
    wDist = 0.15;
    wRisk = 0.35;
  } else if (isHighValue) {
    wTime = 0.30;
    wDist = 0.15;
    wRisk = 0.55;
  }

  const scoredCandidates = availableModes.map((mode) => {
    const r = routes[mode];
    const time = r.etaMinutes || 0;
    const distance = r.totalKm || 0;
    const safety = r.safetyIndex !== undefined ? r.safetyIndex : 90;
    const risk = Math.max(0, 100 - safety);

    // Min-Max normalization into [0, 1] range (0 is best, 1 is worst)
    const normTime = maxTime > minTime ? (time - minTime) / (maxTime - minTime) : 0;
    const normDist = maxDistance > minDistance ? (distance - minDistance) / (maxDistance - minDistance) : 0;
    const normRisk = risk / 100;

    // Operational suitability adjustments (positive adds penalty, negative adds bonus)
    let suitabilityAdjustment = 0;

    // Multimodal transfer friction (each transfer adds ~0.03 handling overhead)
    const transferCount = (r.transfers || []).length;
    suitabilityAdjustment += transferCount * 0.03;

    // Cargo profile adjustments
    if (isHeavy) {
      if (mode === 'air') suitabilityAdjustment += 0.50; // Air is constrained for heavy bulk
      if (mode === 'waterway') suitabilityAdjustment -= 0.18; // Waterway is optimal for bulk
      if (mode === 'railway') suitabilityAdjustment -= 0.12; // Rail bulk efficiency
    }

    if (isPerishableOrUrgent) {
      if (mode === 'air') suitabilityAdjustment -= 0.18; // Speed preserves perishable goods
      if (mode === 'waterway') suitabilityAdjustment += 0.30; // Waterway transit too slow
    }

    if (isHighValue) {
      if (mode === 'air') suitabilityAdjustment -= 0.10; // Secured fast transport
    }

    // Composite cost (lower is better)
    const cost = (wTime * normTime) + (wDist * normDist) + (wRisk * normRisk) + suitabilityAdjustment;

    // 0-100 Recommendation Score (higher is better)
    const score = Math.round(Math.max(10, Math.min(99, (1 - cost) * 100)));

    return {
      mode,
      cost,
      score,
      metrics: {
        timeMinutes: time,
        distanceKm: distance,
        safetyIndex: safety,
        transfers: transferCount,
      },
      route: r,
    };
  });

  // Sort candidates by cost ascending (lowest cost = best recommendation)
  scoredCandidates.sort((a, b) => a.cost - b.cost);

  const best = scoredCandidates[0];
  const bestMode = best.mode;
  const bestRoute = routes[bestMode];

  // Synthesize deterministic, human-readable rationale
  let reason = '';
  if (isEmergency) {
    reason = `Emergency priority selected ${bestMode.toUpperCase()} (${bestRoute.totalKm} km, ${Math.floor(bestRoute.etaMinutes / 60)}h ${bestRoute.etaMinutes % 60}m) to minimize transit delay with ${bestRoute.safetyIndex}% corridor safety.`;
  } else if (isHeavy && (bestMode === 'railway' || bestMode === 'waterway')) {
    reason = `Heavy freight profile prioritized ${bestMode === 'railway' ? 'NFR Rail' : 'IWAI Waterway'} for high-capacity bulk payload, lower logistics cost, and ${bestRoute.safetyIndex}% corridor integrity.`;
  } else if (bestMode === 'air') {
    reason = `Air + Road multimodal corridor delivers optimal efficiency (${Math.floor(bestRoute.etaMinutes / 60)}h ${bestRoute.etaMinutes % 60}m vs road transit) with high safety index of ${bestRoute.safetyIndex}%.`;
  } else if (bestMode === 'railway') {
    reason = `NFR Railway freight corridor selected for superior balance of transport safety (${bestRoute.safetyIndex}%), low disruption vulnerability, and reliable transit schedule.`;
  } else if (bestMode === 'waterway') {
    reason = `Inland Waterway corridor (NW-2/16) selected for stable river freight movement with ${bestRoute.safetyIndex}% route safety index.`;
  } else {
    reason = `Direct highway corridor selected as the most viable and direct routing (${bestRoute.totalKm} km) with ${bestRoute.safetyIndex}% corridor safety.`;
  }

  // Attach score directly to candidate route objects
  scoredCandidates.forEach((c) => {
    if (routes[c.mode]) {
      routes[c.mode].score = c.score;
    }
  });

  return {
    recommendedMode: bestMode,
    recommendationReason: reason,
    score: best.score,
    route: bestRoute,
    rankings: scoredCandidates,
  };
}

module.exports = { scoreAndRecommendRoutes };
