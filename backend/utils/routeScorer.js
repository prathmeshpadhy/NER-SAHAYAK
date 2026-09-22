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

    // Composite cost (lower is better) - unconstrained for ranking
    const cost = (wTime * normTime) + (wDist * normDist) + (wRisk * normRisk) + suitabilityAdjustment;

    return {
      mode,
      cost,
      metrics: {
        timeMinutes: time,
        distanceKm: distance,
        safetyIndex: safety,
        transfers: transferCount,
      },
      route: r,
    };
  });

  // Sort candidates strictly by composite cost ascending (lowest cost = Rank #1)
  scoredCandidates.sort((a, b) => a.cost - b.cost);

  const best = scoredCandidates[0];
  const bestMode = best.mode;
  const bestRoute = routes[bestMode];

  // Presentation-only Decision Score derived from normalized relative cost
  // Preserves strict ordering while Rank serves as the primary decision signal.
  const bestCost = best.cost;
  const worstCost = scoredCandidates[scoredCandidates.length - 1].cost;
  const costRange = worstCost - bestCost;

  let lastAssignedScore = 99;
  scoredCandidates.forEach((c, idx) => {
    let decScore;
    if (costRange <= 0.0001) {
      decScore = Math.max(15, 98 - (idx * 5));
    } else {
      // Relative composite cost in [0, 1]
      const relativeCost = (c.cost - bestCost) / costRange;
      // Scales inversely with relative cost: higher relative cost results in a lower decision score
      const dynamicSpread = Math.min(55, Math.max(20, Math.round(costRange * 60)));
      decScore = Math.round(98 - (relativeCost * dynamicSpread));
    }

    // Preserve strict ordering across ranked candidates
    if (idx > 0 && decScore >= lastAssignedScore) {
      decScore = Math.max(10, lastAssignedScore - 1);
    }
    lastAssignedScore = decScore;

    c.rank = idx + 1;
    c.isRecommended = (idx === 0);
    c.decisionScore = decScore;
    c.score = decScore;
    c.costDelta = Number((c.cost - bestCost).toFixed(3));
    c.metricDeltas = {
      timeDiffMinutes: (c.metrics.timeMinutes || 0) - (best.metrics.timeMinutes || 0),
      distanceDiffKm: (c.metrics.distanceKm || 0) - (best.metrics.distanceKm || 0),
      safetyDiff: (c.metrics.safetyIndex || 0) - (best.metrics.safetyIndex || 0),
    };

    // Attach to candidate route objects for frontend & API consumers
    if (routes[c.mode]) {
      routes[c.mode].rank = c.rank;
      routes[c.mode].isRecommended = c.isRecommended;
      routes[c.mode].decisionScore = decScore;
      routes[c.mode].score = decScore;
      routes[c.mode].costDelta = c.costDelta;
      routes[c.mode].metricDeltas = c.metricDeltas;
    }
  });

  // Dynamic operational explanation generation
  function formatHoursMins(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const modeLabels = {
    road: 'ROAD',
    railway: 'RAIL + ROAD',
    waterway: 'WATERWAY + ROAD',
    air: 'AIR + ROAD'
  };

  const bestModeTitle = modeLabels[bestMode] || bestMode.toUpperCase();
  const runnerUp = scoredCandidates.length > 1 ? scoredCandidates[1] : null;
  const roadCandidate = scoredCandidates.find((c) => c.mode === 'road');

  // Lead clause with recommended mode, rank, safety, and transit duration
  let reason = `${bestModeTitle} recommended — Rank #1. ${bestRoute.safetyIndex}% corridor safety and ${formatHoursMins(bestRoute.etaMinutes)} transit (${bestRoute.totalKm} km).`;

  // Comparative clause contrasting with road corridor or alternative
  if (bestMode !== 'road' && roadCandidate && roadCandidate.route) {
    const roadRoute = roadCandidate.route;
    const disruptedEdge = (roadRoute.edges || []).find((e) => e.condition === 'disrupted' || e.condition === 'blocked');
    const roadName = disruptedEdge?.road || roadRoute.edges?.[0]?.road || 'highway';

    if (disruptedEdge || roadRoute.safetyIndex < 75) {
      let cause = 'active disruption';
      const isIncident = (disruptedEdge?.disruptionMultiplier && disruptedEdge.disruptionMultiplier >= 4) || disruptedEdge?.condition === 'blocked';
      const isWeather = Boolean(disruptedEdge?.weatherSeverity && disruptedEdge.weatherSeverity > 0.4);
      if (disruptedEdge?.condition === 'blocked') {
        cause = 'active road blockage';
      } else if (isIncident && isWeather) {
        cause = 'active hazard and adverse weather/rainfall';
      } else if (isWeather) {
        cause = 'severe weather and rainfall risk';
      } else if (isIncident) {
        cause = 'active field hazard disruption';
      }
      reason += ` The ${roadName} road alternative has ${roadRoute.safetyIndex}% safety because of ${cause} and takes ${formatHoursMins(roadRoute.etaMinutes)}.`;
    } else {
      reason += ` The road alternative offers ${roadRoute.safetyIndex}% safety and takes ${formatHoursMins(roadRoute.etaMinutes)}.`;
    }

    if (runnerUp && runnerUp.mode !== 'road' && runnerUp.mode !== bestMode && runnerUp.route) {
      const runnerTitle = modeLabels[runnerUp.mode] || runnerUp.mode.toUpperCase();
      reason += ` Selected over ${runnerTitle} (Rank #2 · ${formatHoursMins(runnerUp.route.etaMinutes)} transit) for optimal transit speed.`;
    }
  } else if (bestMode === 'road' && runnerUp && runnerUp.route) {
    const runnerTitle = modeLabels[runnerUp.mode] || runnerUp.mode.toUpperCase();
    const timeDelta = runnerUp.route.etaMinutes - bestRoute.etaMinutes;
    if (timeDelta > 0) {
      reason += ` Direct highway connectivity outperforms ${runnerTitle} by ${formatHoursMins(timeDelta)} without multimodal transfer delays.`;
    } else {
      reason += ` Direct highway routing provides optimal logistics feasibility over ${runnerTitle}.`;
    }
  }

  // Priority and cargo context clause
  if (isEmergency) {
    reason += ' Emergency priority favors faster, safer transport.';
  } else if (isHeavy && (bestMode === 'railway' || bestMode === 'waterway')) {
    reason += ` Bulk freight profile prioritizes ${bestMode === 'railway' ? 'NFR rail capacity' : 'IWAI waterway barge'} for high-payload cargo and corridor integrity.`;
  } else if (isPerishableOrUrgent) {
    reason += ' Perishable cargo profile prioritizes reduced transit exposure and rapid delivery.';
  } else if (isHighValue) {
    reason += ' High-value freight profile prioritizes corridor security and minimal transfer risk.';
  }

  // Structured explanation generation (Task 11)
  const affectedCorridors = [];
  const avoidedDisruptions = [];
  scoredCandidates.forEach((c) => {
    if (c.route && c.route.edges) {
      c.route.edges.forEach((e) => {
        if (e.condition === 'disrupted' || e.condition === 'blocked' || (e.accessibilityState && e.accessibilityState !== 'OPEN')) {
          const fromName = e.from?.name || e.from?.id || e.from || 'Origin';
          const toName = e.to?.name || e.to?.id || e.to || 'Destination';
          const entry = `${e.road || 'Corridor'} (${fromName} → ${toName}): ${e.accessibilityState || e.condition}`;
          if (!affectedCorridors.includes(entry)) affectedCorridors.push(entry);
        }
      });
    }
  });

  if (bestRoute && bestRoute.edges && roadCandidate && roadCandidate.route && roadCandidate.route.edges) {
    roadCandidate.route.edges.forEach((e) => {
      if (e.condition === 'disrupted' || e.condition === 'blocked' || (e.accessibilityState && e.accessibilityState !== 'OPEN')) {
        const isUsedByBest = bestRoute.edges.some(be => be.road === e.road && (be.from?.id || be.from) === (e.from?.id || e.from));
        if (!isUsedByBest) {
          avoidedDisruptions.push(`Bypassed ${e.road || 'corridor'} hazard (${e.accessibilityState || e.condition}) on road network`);
        }
      }
    });
  }

  let primaryRisk = 'None';
  if (bestRoute.safetyIndex < 70) {
    primaryRisk = 'Reduced corridor safety / terrain hazard';
  } else if (bestRoute.accessibilityState === 'SEVERELY_DISRUPTED') {
    primaryRisk = 'Severe weather / terrain disruption along corridor';
  } else if (bestRoute.accessibilityState === 'CAUTION') {
    primaryRisk = 'Minor speed reduction / regional weather';
  } else {
    primaryRisk = 'Low risk / clear corridor';
  }

  const structuredExplanation = {
    recommendation: bestModeTitle,
    recommendedMode: bestMode,
    rank: 1,
    decisionScore: best.decisionScore,
    primaryRisk,
    affectedCorridors,
    avoidedDisruptions,
    estimatedDelay: `${bestRoute.estimatedDelayMinutes || 0} mins`,
    estimatedDelayMinutes: bestRoute.estimatedDelayMinutes || 0,
    baseDurationMinutes: bestRoute.baseDurationMinutes || bestRoute.etaMinutes,
    disruptionAdjustedMinutes: bestRoute.etaMinutes,
    comparison: scoredCandidates.map(c => ({
      mode: c.mode,
      rank: c.rank,
      decisionScore: c.decisionScore,
      etaMinutes: c.metrics.timeMinutes,
      safetyIndex: c.metrics.safetyIndex,
      costDelta: c.costDelta,
      isRecommended: c.isRecommended,
    })),
    reasons: [reason]
  };

  return {
    recommendedMode: bestMode,
    recommendationReason: reason,
    decisionScore: best.decisionScore,
    score: best.score,
    rank: 1,
    route: bestRoute,
    rankings: scoredCandidates,
    explanation: structuredExplanation,
  };
}

module.exports = { scoreAndRecommendRoutes };
