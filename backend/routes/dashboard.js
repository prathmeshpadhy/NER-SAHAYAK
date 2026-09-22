const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { NODES, EDGES } = require('../data/nerNetwork');
const { fetchNodeWeather } = require('./weather');
const supabaseService = require('../services/supabaseService');
const {
  computeRegionalConnectivity,
  computeCriticalCorridors,
  aggregateMultiHazardAlerts,
  evaluateEmergencyRoute,
  summarizeAtRiskLogistics,
} = require('../utils/commandCenterIntelligence');

const router = express.Router();

/**
 * GET /api/dashboard/summary
 * Primary briefing endpoint consumed by Government Officials & Command Center.
 * Aggregates state-wise connectivity, critical corridors, at-risk logistics, and multi-hazard alerts.
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const weatherByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try { weatherByNode[n.id] = (await fetchNodeWeather(n)).severity; } catch (_) { weatherByNode[n.id] = 0; }
    }));

    const allIncidents = await supabaseService.getIncidents(300);
    const openReports = allIncidents.filter((r) => r.status !== 'resolved');
    const disruptions = await supabaseService.getActiveDisruptions();
    const vehicles = await supabaseService.getVehicles();
    const shipments = await supabaseService.getShipments();
    const alerts = await supabaseService.getAlerts(50);
    const recentActivity = await supabaseService.getActivityLogs(25);

    // 1. Regional Connectivity Breakdown & State-level Index
    const connectivityData = computeRegionalConnectivity({
      disruptions,
      incidents: allIncidents,
      shipments,
      vehicles,
      weatherByNode,
    });

    // 2. Critical Corridors Aggregation
    const criticalCorridors = computeCriticalCorridors({
      disruptions,
      incidents: allIncidents,
      shipments,
      vehicles,
    });

    // 3. Multi-Hazard Alerts Aggregation
    const multiHazardAlerts = aggregateMultiHazardAlerts(openReports, alerts);

    // 4. At-Risk Logistics Summary
    const atRiskLogistics = summarizeAtRiskLogistics(shipments, vehicles);

    // Node-level district connectivity list for backwards compatibility
    const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));
    const districtConnectivity = NODES.filter((n) => n.type !== 'airport').map((n) => {
      const localReports = openReports.filter((r) => r.nodeId === n.id || r.fromNode === n.id || r.toNode === n.id);
      const blockingReports = localReports.filter((r) => ['road_block', 'road_blockage', 'landslide', 'flood', 'bridge_damage'].includes(r.category));
      const weatherPenalty = Math.round((weatherByNode[n.id] || 0) * 40);
      const reportPenalty = Math.min(50, blockingReports.length * 18);
      const score = Math.max(0, 100 - weatherPenalty - reportPenalty);
      return {
        nodeId: n.id,
        name: n.name,
        state: n.state,
        score,
        status: score >= 75 ? 'connected' : score >= 45 ? 'partial' : 'cut_off',
        openReports: localReports.length,
        weatherSeverity: Number((weatherByNode[n.id] || 0).toFixed(2)),
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      regionalConnectivityIndex: connectivityData.regionalConnectivityIndex,
      regionalStatus: connectivityData.regionalStatus,
      stateBreakdown: connectivityData.stateBreakdown,
      corridorTotals: connectivityData.corridorTotals,
      criticalCorridors: criticalCorridors.slice(0, 10),
      allCriticalCorridorsCount: criticalCorridors.filter((c) => c.severity !== 'clear').length,
      multiHazardAlerts: multiHazardAlerts.slice(0, 15),
      multiHazardAlertsCount: multiHazardAlerts.length,
      atRiskLogistics,
      districtConnectivity,
      activeVehicles: vehicles.filter((v) => v.status === 'in_transit').length,
      delayedVehicles: vehicles.filter((v) => v.status === 'delayed').length,
      totalVehicles: vehicles.length,
      openFieldReports: openReports.length,
      activeIncidents: openReports.length,
      criticalReports: openReports.filter((r) => r.severity === 'critical' || r.severity === 'major').length,
      criticalIncidents: openReports.filter((r) => r.severity === 'critical' || r.severity === 'major').length,
      activeAlertsCount: alerts.length,
      activeShipmentsCount: shipments.filter((s) => s.status === 'in_transit' || s.status === 'assigned' || s.status === 'loading').length,
      delayedShipmentsCount: shipments.filter((s) => s.status === 'delayed' || (s.estimatedDelayMinutes > 0)).length,
      atRiskShipmentsCount: atRiskLogistics.atRiskCount,
      blockedShipmentsCount: atRiskLogistics.blockedCount,
      shipments: {
        planned: shipments.filter((s) => s.status === 'planned' || s.status === 'assigned' || s.status === 'loading').length,
        inTransit: shipments.filter((s) => s.status === 'in_transit').length,
        delayed: shipments.filter((s) => s.status === 'delayed' || (s.estimatedDelayMinutes > 0)).length,
        delivered: shipments.filter((s) => s.status === 'delivered').length,
        atRisk: atRiskLogistics.atRiskCount,
        blocked: atRiskLogistics.blockedCount,
        total: shipments.length,
      },
      recentActivity,
      regionAccessCoveragePct: connectivityData.regionalConnectivityIndex,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build dashboard summary', detail: err.message });
  }
});

/**
 * GET /api/dashboard/regional
 * Detailed regional briefing broken down by state, connectivity capacity, and operational status.
 */
router.get('/regional', requireAuth, async (req, res) => {
  try {
    const allIncidents = await supabaseService.getIncidents(300);
    const disruptions = await supabaseService.getActiveDisruptions();
    const shipments = await supabaseService.getShipments();
    const vehicles = await supabaseService.getVehicles();

    const connectivity = computeRegionalConnectivity({
      disruptions,
      incidents: allIncidents,
      shipments,
      vehicles,
    });

    res.json(connectivity);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute regional connectivity', detail: err.message });
  }
});

/**
 * GET /api/dashboard/corridors
 * Complete list of critical and monitored corridors across the North Eastern Region.
 */
router.get('/corridors', requireAuth, async (req, res) => {
  try {
    const allIncidents = await supabaseService.getIncidents(300);
    const disruptions = await supabaseService.getActiveDisruptions();
    const shipments = await supabaseService.getShipments();
    const vehicles = await supabaseService.getVehicles();

    const corridors = computeCriticalCorridors({
      disruptions,
      incidents: allIncidents,
      shipments,
      vehicles,
    });

    res.json({
      corridors,
      totalCount: corridors.length,
      disruptedCount: corridors.filter((c) => c.severity !== 'clear').length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch critical corridors', detail: err.message });
  }
});

/**
 * GET /api/dashboard/emergency-route
 * Evaluates an emergency supply route between two nodes for government officials.
 */
router.get('/emergency-route', requireAuth, async (req, res) => {
  const { origin, destination } = req.query || {};
  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination query parameters are required' });
  }

  try {
    const disruptions = await supabaseService.getActiveDisruptions();
    const weatherSeverityByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try { weatherSeverityByNode[n.id] = (await fetchNodeWeather(n)).severity; } catch (_) { weatherSeverityByNode[n.id] = 0; }
    }));

    const result = evaluateEmergencyRoute(origin, destination, { disruptions, weatherSeverityByNode });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to evaluate emergency route', detail: err.message });
  }
});

router.get('/activity', requireAuth, async (req, res) => {
  try {
    const activity = await supabaseService.getActivityLogs(50);
    res.json({ activity });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity logs', detail: err.message });
  }
});

module.exports = router;
