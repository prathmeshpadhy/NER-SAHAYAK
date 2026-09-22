const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { NODES, EDGES } = require('../data/nerNetwork');
const { findRoute, findAlternateRoutes } = require('../utils/dijkstra');
const { scoreAndRecommendRoutes } = require('../utils/routeScorer');
const { fetchNodeWeather } = require('./weather');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

// GET /api/network/nodes — all locations (for map + dropdowns)
router.get('/nodes', requireAuth, (req, res) => {
  res.json({ nodes: NODES });
});

// GET /api/network/edges — full road graph (for map rendering) with live condition
router.get('/edges', requireAuth, async (req, res) => {
  try {
    const weatherByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try {
        const w = await fetchNodeWeather(n);
        weatherByNode[n.id] = w.severity;
      } catch (_) { weatherByNode[n.id] = 0; }
    }));
    const disruptions = await supabaseService.getActiveDisruptions();
    const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));

    const edges = EDGES.map((e) => {
      const relevant = disruptions.filter((d) => {
        // If road is specified, match road name
        if (d.road && e.road && d.road.toLowerCase().trim() === e.road.toLowerCase().trim()) {
          return true;
        }
        if (d.fromNode && d.toNode) {
          const matchEndpoints = (d.fromNode === e.from && d.toNode === e.to) ||
                                 (d.fromNode === e.to && d.toNode === e.from);
          if (matchEndpoints) {
            if (d.road && e.road && d.road.toUpperCase() !== e.road.toUpperCase() && e.mode !== 'road') {
              return false;
            }
            return true;
          }
        }
        const singleNode = d.fromNode || d.nodeId;
        if (singleNode && !d.toNode) {
          if (e.from === singleNode || e.to === singleNode) {
            if (d.road && e.road && d.road.toUpperCase() !== e.road.toUpperCase() && e.mode !== 'road') {
              return false;
            }
            return true;
          }
        }
        return false;
      });

      const blocked = relevant.some((d) => d.severity === 'blocked');
      const worstSeverity = relevant.reduce((max, d) => {
        const rank = { minor: 1, moderate: 2, severe: 3, blocked: 4 };
        return Math.max(max, rank[d.severity] || 0);
      }, 0);
      const weatherSeverity = Math.max(weatherByNode[e.from] || 0, weatherByNode[e.to] || 0);

      let accessibilityState = 'OPEN';
      let condition = 'clear';

      if (blocked) {
        accessibilityState = 'BLOCKED';
        condition = 'blocked';
      } else if (worstSeverity >= 3 || weatherSeverity > 0.6) {
        accessibilityState = 'SEVERELY_DISRUPTED';
        condition = 'disrupted';
      } else if (worstSeverity === 2) {
        accessibilityState = 'RESTRICTED';
        condition = 'disrupted';
      } else if (worstSeverity === 1 || weatherSeverity > 0.3) {
        accessibilityState = 'CAUTION';
        condition = 'caution';
      } else {
        accessibilityState = 'OPEN';
        condition = 'clear';
      }

      return {
        from: nodeMap[e.from],
        to: nodeMap[e.to],
        km: e.km,
        road: e.road,
        condition,
        accessibilityState,
        mode: e.mode,
        weatherSeverity: Number(weatherSeverity.toFixed(2)),
      };
    });
    res.json({ edges, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: 'Unable to compute live network status', detail: err.message });
  }
});

// POST /api/network/route  { originId, destinationId, alternates?, mode? }
router.post('/route', requireAuth, async (req, res) => {
  const { originId, destinationId, alternates = true, mode = 'all' } = req.body || {};
  if (!originId || !destinationId) return res.status(400).json({ error: 'originId and destinationId are required' });
  
  try {
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try {
        const w = await fetchNodeWeather(n);
        weatherSeverityByNode[n.id] = w.severity;
      } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));
    const disruptions = await supabaseService.getActiveDisruptions();
    const context = { weatherSeverityByNode, disruptions, mode };

    const best = findRoute(originId, destinationId, context);
    if (!best) return res.status(422).json({ error: 'No viable route found' });

    let alternateRoutes = [];
    if (alternates) {
      alternateRoutes = findAlternateRoutes(originId, destinationId, context, 3).filter((r) => r.totalKm !== best.totalKm);
    }
    res.json({ recommended: best, alternates: alternateRoutes.slice(0, 2), computedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Route computation failed', detail: err.message });
  }
});

// POST & GET /api/network/compare
// Computes multimodal options and applies centralized composite recommendation scoring
const handleCompare = async (req, res) => {
  const params = req.method === 'GET' ? req.query : req.body;
  const {
    originId,
    destinationId,
    cargoType = 'General Cargo',
    weight = 100,
    priority = 'Normal',
    emergencyMode = false
  } = params || {};

  const isEmergency = emergencyMode === true || emergencyMode === 'true';

  if (!originId || !destinationId) {
    return res.status(400).json({ error: 'originId and destinationId are required' });
  }

  try {
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try {
        const w = await fetchNodeWeather(n);
        weatherSeverityByNode[n.id] = w.severity;
      } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));
    const disruptions = await supabaseService.getActiveDisruptions();
    
    const computeForMode = (modeName) => {
      const route = findRoute(originId, destinationId, { weatherSeverityByNode, disruptions, mode: modeName });
      if (!route) return null;
      // If we requested a specific mode, but the route has none of those edges, it's just a fallback (e.g. road)
      if (modeName !== 'road' && modeName !== 'all') {
        const hasMode = route.edges.some(e => e.mode === modeName);
        if (!hasMode) return null; // That mode doesn't actually connect these points
      }
      return route;
    };

    const routes = {
      road: computeForMode('road'),
      railway: computeForMode('railway'),
      waterway: computeForMode('waterway'),
      air: computeForMode('air')
    };

    const recommendationResult = scoreAndRecommendRoutes(routes, {
      cargoType,
      weight,
      priority,
      emergencyMode: isEmergency
    });

    if (!recommendationResult) {
      return res.status(422).json({ error: 'No viable route found for any mode.' });
    }

    const comparison = Object.entries(routes).map(([modeKey, r]) => {
      if (!r) {
        return {
          mode: modeKey,
          available: false,
          rank: null,
          isRecommended: false,
          totalDistance: null,
          totalTime: null,
          baseDurationMinutes: null,
          estimatedDelayMinutes: null,
          safetyIndex: null,
          score: null,
          decisionScore: null,
          costDelta: null,
          metricDeltas: null,
          segments: [],
          transfers: []
        };
      }
      return {
        mode: modeKey,
        modeLabel: r.modeLabel,
        available: true,
        rank: r.rank,
        isRecommended: r.isRecommended,
        totalDistance: r.totalKm,
        totalTime: r.etaMinutes,
        baseDurationMinutes: r.baseDurationMinutes || r.etaMinutes,
        estimatedDelayMinutes: r.estimatedDelayMinutes || 0,
        safetyIndex: r.safetyIndex,
        score: r.score,
        decisionScore: r.decisionScore || r.score,
        costDelta: r.costDelta,
        metricDeltas: r.metricDeltas,
        segments: r.segments || r.edges,
        transfers: r.transfers || []
      };
    });

    res.json({
      routes,
      comparison,
      recommendation: {
        mode: recommendationResult.recommendedMode,
        reason: recommendationResult.recommendationReason,
        score: recommendationResult.score,
        decisionScore: recommendationResult.decisionScore || recommendationResult.score,
        rank: 1,
        route: recommendationResult.route,
        rankings: recommendationResult.rankings,
        explanation: recommendationResult.explanation
      },
      computedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Route comparison failed', detail: err.message });
  }
};

router.post('/compare', requireAuth, handleCompare);
router.get('/compare', requireAuth, handleCompare);

module.exports = router;
