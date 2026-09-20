const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { NODES, EDGES } = require('../data/nerNetwork');
const { fetchNodeWeather } = require('./weather');
const supabaseService = require('../services/supabaseService');

const router = express.Router();

// GET /api/dashboard/summary — centralized dashboard data for officials:
// district-wise connectivity, logistics bottlenecks, active vehicles,
// open field reports, and a simple emergency-route readiness score.
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const weatherByNode = {};
    await Promise.all(NODES.map(async (n) => {
      try { weatherByNode[n.id] = (await fetchNodeWeather(n)).severity; } catch (_) { weatherByNode[n.id] = 0; }
    }));

    const allIncidents = await supabaseService.getIncidents(300);
    const openReports = allIncidents.filter((r) => r.status !== 'resolved');
    const vehicles = await supabaseService.getVehicles();
    const shipments = await supabaseService.getShipments();

    const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));

    // Connectivity score per district/node: 100 minus penalties for weather + open blocking reports on adjoining edges
    const connectivity = NODES.map((n) => {
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

    const bottlenecks = EDGES.map((e) => {
      const relevant = openReports.filter((r) =>
        (r.fromNode === e.from && r.toNode === e.to) || (r.fromNode === e.to && r.toNode === e.from) || r.road === e.road);
      const weatherSeverity = Math.max(weatherByNode[e.from] || 0, weatherByNode[e.to] || 0);
      const riskScore = relevant.length * 25 + weatherSeverity * 40;
      if (!nodeMap[e.from] || !nodeMap[e.to]) return null;
      return {
        from: nodeMap[e.from].name,
        to: nodeMap[e.to].name,
        road: e.road,
        km: e.km,
        riskScore: Math.round(riskScore),
        activeReports: relevant.length,
        weatherSeverity: Number(weatherSeverity.toFixed(2)),
      };
    }).filter((b) => b !== null && b.riskScore > 15).sort((a, b) => b.riskScore - a.riskScore).slice(0, 8);

    const alerts = await supabaseService.getAlerts(50);
    const recentActivity = await supabaseService.getActivityLogs(15);

    res.json({
      generatedAt: new Date().toISOString(),
      districtConnectivity: connectivity,
      logisticsBottlenecks: bottlenecks,
      activeVehicles: vehicles.filter((v) => v.status === 'in_transit').length,
      delayedVehicles: vehicles.filter((v) => v.status === 'delayed').length,
      totalVehicles: vehicles.length,
      openFieldReports: openReports.length,
      activeIncidents: openReports.length,
      criticalReports: openReports.filter((r) => r.severity === 'critical' || r.severity === 'major').length,
      criticalIncidents: openReports.filter((r) => r.severity === 'critical' || r.severity === 'major').length,
      fieldReportsCount: openReports.filter((r) => r.reporterRole === 'field' || r.role === 'field' || !r.reporterRole).length,
      driverReportsCount: openReports.filter((r) => r.reporterRole === 'driver' || r.role === 'driver').length,
      activeAlertsCount: alerts.length,
      activeShipmentsCount: shipments.filter((s) => s.status === 'in_transit' || s.status === 'assigned' || s.status === 'loading').length,
      delayedShipmentsCount: shipments.filter((s) => s.status === 'delayed').length,
      shipments: {
        planned: shipments.filter((s) => s.status === 'planned' || s.status === 'assigned' || s.status === 'loading').length,
        inTransit: shipments.filter((s) => s.status === 'in_transit').length,
        delayed: shipments.filter((s) => s.status === 'delayed').length,
        delivered: shipments.filter((s) => s.status === 'delivered').length,
        total: shipments.length,
      },
      recentActivity,
      regionAccessCoveragePct: Math.round(
        (connectivity.filter((c) => c.status !== 'cut_off').length / connectivity.length) * 100
      ),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build dashboard summary', detail: err.message });
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
