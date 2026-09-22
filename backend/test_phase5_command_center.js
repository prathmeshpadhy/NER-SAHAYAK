/**
 * NER-SAHAYAK — PHASE 5 TEST SUITE: GOVERNMENT / REGIONAL COMMAND CENTER
 *
 * Verifies all 25 required points for the Command Center & Regional Disruption Intelligence:
 * 1. Regional dashboard loads
 * 2. Regional dashboard uses canonical incidents
 * 3. Active incident count correct
 * 4. Resolved incident excluded
 * 5. Critical corridor aggregation
 * 6. Corridor accessibility state correct
 * 7. Corridor severity preserved
 * 8. Corridor evidence availability preserved
 * 9. Corridor GPS availability preserved
 * 10. Affected shipment aggregation
 * 11. Affected vehicle aggregation
 * 12. Shipment delay propagated
 * 13. Blocked shipment represented correctly
 * 14. Unaffected shipment remains unaffected
 * 15. Regional alert aggregation
 * 16. No duplicate alert creation on dashboard refresh
 * 17. Emergency route uses existing routing engine
 * 18. Emergency route disruption reflected
 * 19. Alternative route comes from existing scorer
 * 20. Field evidence remains inspectable
 * 21. Missing evidence handled safely
 * 22. Missing GPS handled safely
 * 23. Location source remains honest
 * 24. RBAC/authorization remains enforced
 * 25. Dashboard does not fabricate unavailable metrics
 */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('./server');
const db = require('./db');
const supabaseService = require('./services/supabaseService');
const { JWT_SECRET } = require('./middleware/auth');
const {
  NER_STATES,
  evaluateEdgeAccessibility,
  computeRegionalConnectivity,
  computeCriticalCorridors,
  aggregateMultiHazardAlerts,
  evaluateEmergencyRoute,
  summarizeAtRiskLogistics,
} = require('./utils/commandCenterIntelligence');
const { NODES, EDGES } = require('./data/nerNetwork');

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [TEST ${total}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [TEST ${total}] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

/**
 * In-memory invocation of Express app to avoid TCP loopback socket requirements in sandbox.
 */
function invokeApp(expressApp, method, url, { token, body } = {}) {
  return new Promise((resolve) => {
    const req = new http.IncomingMessage();
    req.method = method;
    req.url = url;
    req.headers = {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    if (body) req.push(JSON.stringify(body));
    req.push(null);

    const res = new http.ServerResponse(req);
    const chunks = [];
    res.write = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    };
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      resolve({ status: res.statusCode || 200, body: json || text });
    };

    expressApp.handle(req, res);
  });
}

async function runAllTests() {
  console.log('======================================================================');
  console.log('NER-SAHAYAK: PHASE 5 GOVERNMENT COMMAND CENTER VERIFICATION SUITE');
  console.log('Regional Connectivity, Corridor Monitoring, Evidence, Emergency Routes');
  console.log('======================================================================\n');

  const officialToken = jwt.sign(
    { id: 'usr-official-test', email: 'official@ner-sahayak.in', role: 'official', name: 'Director NEC' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // ---------------------------------------------------------------------------
  // TEST 1: Regional dashboard loads
  // ---------------------------------------------------------------------------
  await test('Regional dashboard loads', async () => {
    const summary = computeRegionalConnectivity({
      disruptions: [],
      incidents: [],
      shipments: [],
      vehicles: [],
    });
    assert(summary, 'Summary must not be null');
    assert.strictEqual(typeof summary.regionalConnectivityIndex, 'number');
    assert(summary.regionalConnectivityIndex >= 0 && summary.regionalConnectivityIndex <= 100);
    assert(Array.isArray(summary.stateBreakdown), 'stateBreakdown must be an array');
    assert.strictEqual(summary.stateBreakdown.length, NER_STATES.length);
    assert(summary.corridorTotals, 'corridorTotals must exist');
    assert(summary.corridorTotals.total > 0, 'Must have monitored corridors');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Regional dashboard uses canonical incidents
  // ---------------------------------------------------------------------------
  await test('Regional dashboard uses canonical incidents', async () => {
    const canonicalIncidents = await supabaseService.getIncidents(100);
    assert(Array.isArray(canonicalIncidents), 'Canonical incidents must be an array');
    assert(canonicalIncidents.length > 0, 'Database must have seeded canonical incidents');

    const connectivity = computeRegionalConnectivity({
      disruptions: [],
      incidents: canonicalIncidents,
      shipments: [],
      vehicles: [],
    });

    const openCount = canonicalIncidents.filter((i) => i.status !== 'resolved').length;
    assert(openCount > 0, 'Must have at least one active incident in DB');
    assert(connectivity.stateBreakdown.some((s) => s.activeIncidentsCount > 0));
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Active incident count correct
  // ---------------------------------------------------------------------------
  await test('Active incident count correct', async () => {
    const incidents = [
      { id: 'inc-1', road: 'NH27', status: 'open', severity: 'moderate' },
      { id: 'inc-2', road: 'NH27', status: 'investigating', severity: 'minor' },
      { id: 'inc-3', road: 'NH27', status: 'resolved', severity: 'major' },
    ];
    const alerts = aggregateMultiHazardAlerts(incidents);
    assert.strictEqual(alerts.length, 2, 'Resolved incident must be excluded from active hazard count');
    assert(alerts.every((a) => a.status !== 'resolved'));
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Resolved incident excluded
  // ---------------------------------------------------------------------------
  await test('Resolved incident excluded', async () => {
    const mockIncidents = [
      { id: 'inc-res-1', road: 'NH6', status: 'resolved', severity: 'critical', lat: 25.1, lng: 92.3 },
    ];
    const corridors = computeCriticalCorridors({
      disruptions: [],
      incidents: mockIncidents,
      shipments: [],
      vehicles: [],
    });
    const nh6 = corridors.find((c) => c.corridor === 'NH6');
    assert(nh6, 'NH6 must exist in corridors');
    assert.strictEqual(nh6.activeIncidentCount, 0, 'Resolved incidents must not count towards active corridor incidents');
    assert.strictEqual(nh6.latestIncident, null, 'Resolved incident cannot be latest active incident');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Critical corridor aggregation
  // ---------------------------------------------------------------------------
  await test('Critical corridor aggregation', async () => {
    const corridors = computeCriticalCorridors({
      disruptions: [],
      incidents: [],
      shipments: [],
      vehicles: [],
    });
    assert(Array.isArray(corridors), 'Corridors must be an array');
    const corridorNames = corridors.map((c) => c.corridor);
    assert(corridorNames.includes('NH27'), 'NH27 must be monitored');
    assert(corridorNames.includes('NH6'), 'NH6 must be monitored');
    assert(corridorNames.includes('NH15'), 'NH15 must be monitored');

    const nh27 = corridors.find((c) => c.corridor === 'NH27');
    assert(nh27.segmentsCount > 0, 'NH27 must have segments');
    assert(nh27.accessibilityState, 'Corridor must have accessibilityState');
    assert(nh27.severity, 'Corridor must have severity');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Corridor accessibility state correct
  // ---------------------------------------------------------------------------
  await test('Corridor accessibility state correct', async () => {
    const edge = { from: 'guwahati', to: 'nagaon', road: 'NH27', mode: 'road', km: 120 };

    const clean = evaluateEdgeAccessibility(edge, []);
    assert.strictEqual(clean.accessibilityState, 'OPEN');
    assert.strictEqual(clean.multiplier, 1.0);

    const minor = evaluateEdgeAccessibility(edge, [{ road: 'NH27', severity: 'minor' }]);
    assert.strictEqual(minor.accessibilityState, 'CAUTION');
    assert.strictEqual(minor.multiplier, 2.0);

    const mod = evaluateEdgeAccessibility(edge, [{ road: 'NH27', severity: 'moderate' }]);
    assert.strictEqual(mod.accessibilityState, 'RESTRICTED');
    assert.strictEqual(mod.multiplier, 5.0);

    const sev = evaluateEdgeAccessibility(edge, [{ road: 'NH27', severity: 'major' }]);
    assert.strictEqual(sev.accessibilityState, 'SEVERELY_DISRUPTED');
    assert.strictEqual(sev.multiplier, 15.0);

    const blk = evaluateEdgeAccessibility(edge, [{ road: 'NH27', severity: 'blocked' }]);
    assert.strictEqual(blk.accessibilityState, 'BLOCKED');
    assert.strictEqual(blk.isBlocked, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Corridor severity preserved
  // ---------------------------------------------------------------------------
  await test('Corridor severity preserved', async () => {
    const disruptions = [
      { road: 'NH27', severity: 'blocked', category: 'landslide' },
      { road: 'NH6', severity: 'moderate', category: 'waterlogging' },
    ];
    const incidents = [
      { id: 'inc-b', road: 'NH27', severity: 'critical', category: 'landslide', status: 'open' },
      { id: 'inc-m', road: 'NH6', severity: 'moderate', category: 'waterlogging', status: 'open' },
    ];

    const corridors = computeCriticalCorridors({
      disruptions,
      incidents,
      shipments: [],
      vehicles: [],
    });

    const nh27 = corridors.find((c) => c.corridor === 'NH27');
    assert.strictEqual(nh27.severity, 'blocked', 'NH27 severity must be preserved as blocked');
    assert.strictEqual(nh27.accessibilityState, 'BLOCKED');

    const nh6 = corridors.find((c) => c.corridor === 'NH6');
    assert.strictEqual(nh6.severity, 'moderate', 'NH6 severity must be preserved as moderate');
    assert.strictEqual(nh6.accessibilityState, 'RESTRICTED');
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Corridor evidence availability preserved
  // ---------------------------------------------------------------------------
  await test('Corridor evidence availability preserved', async () => {
    const incidents = [
      {
        id: 'inc-photo-1',
        road: 'NH27',
        severity: 'major',
        category: 'landslide',
        status: 'open',
        photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        lat: 26.15,
        lng: 91.80,
        title: 'NH27 Major Landslide with Ground Photo',
      },
    ];
    const corridors = computeCriticalCorridors({
      disruptions: [{ road: 'NH27', severity: 'major' }],
      incidents,
      shipments: [],
      vehicles: [],
    });

    const nh27 = corridors.find((c) => c.corridor === 'NH27');
    assert(nh27.latestIncident, 'NH27 must have latest incident');
    assert.strictEqual(nh27.latestIncident.hasPhoto, true, 'hasPhoto must be true');
    assert(nh27.latestIncident.photoDataUrl.startsWith('data:image/jpeg;base64,'), 'Photo data must be preserved');
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Corridor GPS availability preserved
  // ---------------------------------------------------------------------------
  await test('Corridor GPS availability preserved', async () => {
    const incidents = [
      {
        id: 'inc-gps-1',
        road: 'NH37',
        severity: 'moderate',
        category: 'road_damage',
        status: 'open',
        lat: 26.2415,
        lng: 92.6841,
        title: 'Culvert Damage',
      },
    ];
    const corridors = computeCriticalCorridors({
      disruptions: [],
      incidents,
      shipments: [],
      vehicles: [],
    });
    const nh37 = corridors.find((c) => c.corridor === 'NH37');
    assert(nh37.latestIncident, 'NH37 must have latest incident');
    assert.strictEqual(nh37.latestIncident.hasGps, true, 'hasGps must be true');
    assert.strictEqual(nh37.latestIncident.lat, 26.2415, 'Exact latitude must be preserved');
    assert.strictEqual(nh37.latestIncident.lng, 92.6841, 'Exact longitude must be preserved');
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Affected shipment aggregation
  // ---------------------------------------------------------------------------
  await test('Affected shipment aggregation', async () => {
    const shipments = [
      {
        id: 'shp-nh27-1',
        originNode: 'guwahati',
        destinationNode: 'silchar',
        cargoType: 'Emergency Pharmaceuticals',
        affectedCorridors: ['NH27'],
        estimatedDelayMinutes: 90,
        status: 'delayed',
        vehicleId: 'veh-001',
      },
    ];
    const corridors = computeCriticalCorridors({
      disruptions: [{ road: 'NH27', severity: 'severe' }],
      incidents: [{ id: 'i1', road: 'NH27', severity: 'severe', status: 'open' }],
      shipments,
      vehicles: [{ id: 'veh-001', vehicleNumber: 'AS 01 K 4309' }],
    });

    const nh27 = corridors.find((c) => c.corridor === 'NH27');
    assert.strictEqual(nh27.affectedShipmentsCount, 1);
    assert.strictEqual(nh27.affectedShipments[0].id, 'shp-nh27-1');
    assert.strictEqual(nh27.affectedShipments[0].cargoType, 'Emergency Pharmaceuticals');
  });

  // ---------------------------------------------------------------------------
  // TEST 11: Affected vehicle aggregation
  // ---------------------------------------------------------------------------
  await test('Affected vehicle aggregation', async () => {
    const shipments = [
      {
        id: 'shp-v-1',
        originNode: 'guwahati',
        destinationNode: 'silchar',
        affectedCorridors: ['NH27'],
        vehicleId: 'veh-assigned-1',
      },
    ];
    const vehicles = [
      { id: 'veh-assigned-1', vehicleNumber: 'AS 01 GC 1001', status: 'in_transit' },
      { id: 'veh-other-2', vehicleNumber: 'ML 05 A 2002', status: 'idle' },
    ];

    const corridors = computeCriticalCorridors({
      disruptions: [{ road: 'NH27', severity: 'severe' }],
      incidents: [{ id: 'i-1', road: 'NH27', status: 'open' }],
      shipments,
      vehicles,
    });

    const nh27 = corridors.find((c) => c.corridor === 'NH27');
    assert.strictEqual(nh27.affectedVehiclesCount, 1, 'Should track exactly the assigned affected vehicle');
  });

  // ---------------------------------------------------------------------------
  // TEST 12: Shipment delay propagated
  // ---------------------------------------------------------------------------
  await test('Shipment delay propagated', async () => {
    const shipments = [
      {
        id: 'shp-delay-1',
        originNode: 'guwahati',
        destinationNode: 'nagaon',
        affectedCorridors: ['NH27'],
        estimatedDelayMinutes: 75,
        isDisrupted: true,
        status: 'delayed',
      },
    ];
    const corridors = computeCriticalCorridors({
      disruptions: [{ road: 'NH27', severity: 'severe' }],
      incidents: [{ id: 'i1', road: 'NH27', status: 'open' }],
      shipments,
      vehicles: [],
    });
    const nh27 = corridors.find((c) => c.corridor === 'NH27');
    assert.strictEqual(nh27.estimatedDelayMinutes, 75, 'Maximum delay on corridor must match shipment delay');
  });

  // ---------------------------------------------------------------------------
  // TEST 13: Blocked shipment represented correctly
  // ---------------------------------------------------------------------------
  await test('Blocked shipment represented correctly', async () => {
    const shipments = [
      {
        id: 'shp-blk-1',
        isBlocked: true,
        status: 'blocked',
        affectedCorridors: ['NH27'],
        estimatedDelayMinutes: null,
        currentEtaMinutes: null,
      },
    ];
    const logistics = summarizeAtRiskLogistics(shipments, []);
    assert.strictEqual(logistics.blockedCount, 1, 'Blocked shipments count must be 1');
    assert.strictEqual(logistics.atRiskShipments[0].status, 'blocked');
    assert.strictEqual(logistics.atRiskShipments[0].currentEtaMinutes, null, 'Blocked route cannot have synthetic ETA');
  });

  // ---------------------------------------------------------------------------
  // TEST 14: Unaffected shipment remains unaffected
  // ---------------------------------------------------------------------------
  await test('Unaffected shipment remains unaffected', async () => {
    const shipments = [
      {
        id: 'shp-clear-1',
        originNode: 'guwahati',
        destinationNode: 'tezpur',
        isDisrupted: false,
        isBlocked: false,
        estimatedDelayMinutes: 0,
        status: 'in_transit',
      },
    ];
    const logistics = summarizeAtRiskLogistics(shipments, []);
    assert.strictEqual(logistics.atRiskCount, 0, 'Clear shipment must not be categorized at risk');
    assert.strictEqual(logistics.blockedCount, 0);
  });

  // ---------------------------------------------------------------------------
  // TEST 15: Regional alert aggregation
  // ---------------------------------------------------------------------------
  await test('Regional alert aggregation', async () => {
    const incidents = [
      {
        id: 'inc-alert-1',
        category: 'flash_flood',
        severity: 'critical',
        title: 'NH15 Flash Flood Submergence',
        road: 'NH15',
        status: 'open',
        lat: 26.65,
        lng: 92.79,
      },
    ];
    const alerts = aggregateMultiHazardAlerts(incidents, []);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].category, 'flash_flood');
    assert.strictEqual(alerts[0].severity, 'critical');
    assert.strictEqual(alerts[0].road, 'NH15');
    assert.strictEqual(alerts[0].hasGps, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 16: No duplicate alert creation on dashboard refresh
  // ---------------------------------------------------------------------------
  await test('No duplicate alert creation on dashboard refresh', async () => {
    const countBefore = db.prepare('SELECT COUNT(*) c FROM alerts').get().c;

    // Simulate dashboard refresh queries via in-memory app handler
    await invokeApp(app, 'GET', '/api/dashboard/summary', { token: officialToken });
    await invokeApp(app, 'GET', '/api/dashboard/corridors', { token: officialToken });
    await invokeApp(app, 'GET', '/api/dashboard/regional', { token: officialToken });

    const countAfter = db.prepare('SELECT COUNT(*) c FROM alerts').get().c;
    assert.strictEqual(countBefore, countAfter, 'Querying dashboard endpoints must never spam alerts table');
  });

  // ---------------------------------------------------------------------------
  // TEST 17: Emergency route uses existing routing engine
  // ---------------------------------------------------------------------------
  await test('Emergency route uses existing routing engine', async () => {
    const result = evaluateEmergencyRoute('guwahati', 'silchar', {
      disruptions: [],
      weatherSeverityByNode: {},
    });
    assert(result, 'Emergency route result must exist');
    assert.strictEqual(result.originNode, 'guwahati');
    assert.strictEqual(result.destinationNode, 'silchar');
    assert(result.baseDurationMinutes > 0, 'Baseline duration must be positive');
    assert(result.currentEtaMinutes > 0, 'Current ETA must be positive');
    assert.strictEqual(result.accessibilityState, 'OPEN');
    assert(result.route, 'Must return route object from Dijkstra findRoute');
    assert(result.route.edges.length > 0, 'Route must have network edges');
  });

  // ---------------------------------------------------------------------------
  // TEST 18: Emergency route disruption reflected
  // ---------------------------------------------------------------------------
  await test('Emergency route disruption reflected', async () => {
    // NH6 is the direct highway connecting Guwahati -> Shillong -> Jowai -> Silchar
    const disruptions = [
      { road: 'NH6', severity: 'blocked', category: 'bridge_damage' },
    ];
    const result = evaluateEmergencyRoute('guwahati', 'silchar', {
      disruptions,
      weatherSeverityByNode: {},
    });
    assert.strictEqual(result.accessibilityState, 'BLOCKED');
    assert.strictEqual(result.isBlocked, true);
    assert.strictEqual(result.isDisrupted, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 19: Alternative route comes from existing scorer
  // ---------------------------------------------------------------------------
  await test('Alternative route comes from existing scorer', async () => {
    // NH6 blocked forces non-road multimodal alternative
    const disruptions = [
      { road: 'NH6', severity: 'blocked', category: 'bridge_damage' },
    ];
    const result = evaluateEmergencyRoute('guwahati', 'silchar', {
      disruptions,
      weatherSeverityByNode: {},
    });

    assert(result.recommendedAlternative, 'Must provide recommended alternative when road is blocked');
    assert(
      ['railway', 'air', 'waterway'].includes(result.recommendedAlternative.mode),
      `Recommended mode must be non-road multimodal alternative, got ${result.recommendedAlternative.mode}`
    );
    assert(result.recommendedAlternative.reason, 'Must include recommendation reason');
    assert.strictEqual(result.recommendedAlternative.rank, 1, 'Alternative must be rank 1');
    assert(result.recommendedAlternative.decisionScore !== undefined, 'Must provide decision score');
  });

  // ---------------------------------------------------------------------------
  // TEST 20: Field evidence remains inspectable
  // ---------------------------------------------------------------------------
  await test('Field evidence remains inspectable', async () => {
    const incidents = [
      {
        id: 'inc-inspect-1',
        road: 'NH27',
        title: 'Verified Landslide Evidence Inspection',
        photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...',
        lat: 26.1445,
        lng: 91.7362,
        status: 'open',
        severity: 'critical',
      },
    ];
    const alerts = aggregateMultiHazardAlerts(incidents);
    assert.strictEqual(alerts[0].id, 'inc-inspect-1');
    assert.strictEqual(alerts[0].hasPhoto, true);
    assert(alerts[0].photoDataUrl.startsWith('data:image/jpeg;base64,'));
    assert.strictEqual(alerts[0].hasGps, true);
    assert.strictEqual(alerts[0].lat, 26.1445);
    assert.strictEqual(alerts[0].lng, 91.7362);
  });

  // ---------------------------------------------------------------------------
  // TEST 21: Missing evidence handled safely
  // ---------------------------------------------------------------------------
  await test('Missing evidence handled safely', async () => {
    const incidentWithoutPhoto = {
      id: 'inc-no-photo',
      road: 'NH6',
      title: 'Report without ground photo',
      photoDataUrl: null,
      photo_url: null,
      status: 'open',
    };
    const alerts = aggregateMultiHazardAlerts([incidentWithoutPhoto]);
    assert.strictEqual(alerts[0].hasPhoto, false, 'hasPhoto must be false');
    assert.strictEqual(alerts[0].photoDataUrl, null, 'photoDataUrl must be null');
  });

  // ---------------------------------------------------------------------------
  // TEST 22: Missing GPS handled safely
  // ---------------------------------------------------------------------------
  await test('Missing GPS handled safely', async () => {
    const incidentWithoutGps = {
      id: 'inc-no-gps',
      road: 'NH15',
      title: 'Report with zero GPS fix',
      lat: null,
      lng: null,
      status: 'open',
    };
    const alerts = aggregateMultiHazardAlerts([incidentWithoutGps]);
    assert.strictEqual(alerts[0].hasGps, false, 'hasGps must be false');
    assert.strictEqual(alerts[0].lat, null, 'lat must be null, never faked');
    assert.strictEqual(alerts[0].lng, null, 'lng must be null, never faked');
  });

  // ---------------------------------------------------------------------------
  // TEST 23: Location source remains honest
  // ---------------------------------------------------------------------------
  await test('Location source remains honest', async () => {
    const vehicles = [
      { id: 'v-demo', vehicleNumber: 'DEMO 01', locationSource: 'STATIC_DEMO', status: 'in_transit' },
      { id: 'v-live', vehicleNumber: 'LIVE 02', locationSource: 'LIVE_GPS', status: 'in_transit' },
      { id: 'v-none', vehicleNumber: 'LOST 03', locationSource: 'UNAVAILABLE', status: 'in_transit' },
    ];
    const shipments = [
      { id: 'shp-1', vehicleId: 'v-demo', isDisrupted: true, vehicle: vehicles[0] },
    ];
    const logistics = summarizeAtRiskLogistics(shipments, vehicles);
    assert.strictEqual(logistics.atRiskVehicles[0].locationSource, 'STATIC_DEMO');
    assert.strictEqual(logistics.atRiskShipments[0].vehicle.locationSource, 'STATIC_DEMO');
  });

  // ---------------------------------------------------------------------------
  // TEST 24: RBAC/authorization remains enforced
  // ---------------------------------------------------------------------------
  await test('RBAC/authorization remains enforced', async () => {
    // 1. Unauthenticated request to /api/dashboard/summary
    const unauthSummary = await invokeApp(app, 'GET', '/api/dashboard/summary');
    assert.strictEqual(unauthSummary.status, 401, 'Unauthenticated summary request must return 401');

    // 2. Unauthenticated request to /api/dashboard/corridors
    const unauthCorridors = await invokeApp(app, 'GET', '/api/dashboard/corridors');
    assert.strictEqual(unauthCorridors.status, 401, 'Unauthenticated corridors request must return 401');

    // 3. Unauthenticated request to /api/dashboard/emergency-route
    const unauthEmergency = await invokeApp(app, 'GET', '/api/dashboard/emergency-route?origin=guwahati&destination=silchar');
    assert.strictEqual(unauthEmergency.status, 401, 'Unauthenticated emergency-route request must return 401');

    // 4. Authenticated request with official token succeeds
    const authSummary = await invokeApp(app, 'GET', '/api/dashboard/summary', { token: officialToken });
    assert.strictEqual(authSummary.status, 200, 'Authorized summary request must return 200');
    assert(authSummary.body.regionalConnectivityIndex !== undefined);
    assert(Array.isArray(authSummary.body.criticalCorridors));
  });

  // ---------------------------------------------------------------------------
  // TEST 25: Dashboard does not fabricate unavailable metrics
  // ---------------------------------------------------------------------------
  await test('Dashboard does not fabricate unavailable metrics', async () => {
    // When evaluating an invalid node pair
    const invalidEval = evaluateEmergencyRoute('fake_node_1', 'fake_node_2');
    assert.strictEqual(invalidEval.viable, false);
    assert.strictEqual(invalidEval.accessibilityState, 'UNAVAILABLE');
    assert.strictEqual(invalidEval.route, null);

    // When route is blocked on NH6, currentEtaMinutes and delay must be null, not a fake number
    const blockedEval = evaluateEmergencyRoute('guwahati', 'silchar', {
      disruptions: [{ road: 'NH6', severity: 'blocked' }],
    });
    assert.strictEqual(blockedEval.currentEtaMinutes, null, 'Blocked ETA must be null');
    assert.strictEqual(blockedEval.estimatedDelayMinutes, null, 'Blocked delay must be null');
  });

  console.log('\n======================================================================');
  console.log(`PHASE 5 TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('======================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
