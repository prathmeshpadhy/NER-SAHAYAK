/**
 * NER-SAHAYAK — PHASE 4 VERIFICATION SUITE: LOGISTICS, VEHICLES & SHIPMENT INTELLIGENCE
 *
 * Verifies:
 * 1. Vehicle records load correctly
 * 2. Vehicle location source is explicit
 * 3. Static/demo location is not labelled live
 * 4. Shipment records load correctly
 * 5. Vehicle <-> shipment assignment is consistent
 * 6. Shipment status lifecycle is valid
 * 7. Unaffected shipment remains unaffected
 * 8. Shipment on disrupted corridor is detected
 * 9. Active incident is associated with affected shipment
 * 10. Baseline ETA is preserved
 * 11. Current/disrupted ETA is calculated when available
 * 12. Delay equals route duration difference
 * 13. Blocked route is represented correctly
 * 14. Alternative/recommended route comes from existing routing engine
 * 15. Missing ETA is shown as unavailable rather than fabricated
 * 16. Missing vehicle is handled safely
 * 17. Missing incident is handled safely
 * 18. Duplicate alert/event is not created on repeated evaluation
 * 19. Existing Phase 3A evidence remains inspectable
 * 20. Existing Phase 3B offline behavior remains intact
 */

const assert = require('assert');
const db = require('./db');
const supabaseService = require('./services/supabaseService');
const {
  determineLocationSource,
  evaluateShipmentDisruption,
  enrichShipments,
  enrichVehicles,
} = require('./utils/shipmentIntelligence');

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

async function runAllTests() {
  console.log('====================================================');
  console.log('NER-SAHAYAK: PHASE 4 LOGISTICS & SHIPMENT VERIFICATION');
  console.log('====================================================\n');

  // Test 1: Vehicle records load correctly
  await test('Vehicle records load correctly', async () => {
    const vehicles = await supabaseService.getVehicles();
    assert(Array.isArray(vehicles), 'getVehicles must return an array');
    assert(vehicles.length >= 10, `Expected at least 10 fleet vehicles, got ${vehicles.length}`);
    const v1 = vehicles.find((v) => v.vehicleNumber === 'AS 01 K 4309');
    assert(v1, 'Vehicle AS 01 K 4309 must exist');
    assert.strictEqual(v1.vehicleType, 'Heavy Truck');
    assert(v1.capacityTonnes > 0, 'capacityTonnes must be positive');
  });

  // Test 2: Vehicle location source is explicit
  await test('Vehicle location source is explicit', async () => {
    const vehicles = await supabaseService.getVehicles();
    const validSources = new Set(['LIVE_GPS', 'LAST_KNOWN', 'STATIC_DEMO', 'UNAVAILABLE']);
    vehicles.forEach((v) => {
      assert(v.locationSource, `Vehicle ${v.id} must have locationSource`);
      assert(validSources.has(v.locationSource), `Invalid locationSource "${v.locationSource}" on vehicle ${v.id}`);
    });
  });

  // Test 3: Static/demo location is not labelled live
  await test('Static/demo location is not labelled live', async () => {
    const demoVeh = {
      id: 'demo-v-1',
      lat: 26.1445,
      lng: 91.7362,
      isDemo: true,
    };
    const src = determineLocationSource(demoVeh);
    assert.strictEqual(src, 'STATIC_DEMO', 'Static demo vehicle must not be labeled live GPS');

    const liveVeh = {
      id: 'live-v-1',
      lat: 26.1445,
      lng: 91.7362,
      locationSource: 'LIVE_GPS',
    };
    assert.strictEqual(determineLocationSource(liveVeh), 'LIVE_GPS');
  });

  // Test 4: Shipment records load correctly
  await test('Shipment records load correctly', async () => {
    const shipments = await supabaseService.getShipments();
    assert(Array.isArray(shipments), 'getShipments must return an array');
    assert(shipments.length >= 10, `Expected at least 10 seeded shipments, got ${shipments.length}`);
    const s1 = shipments.find((s) => s.id === 'shp-001');
    assert(s1, 'shp-001 must exist');
    assert.strictEqual(s1.originNode, 'guwahati');
    assert.strictEqual(s1.destinationNode, 'nagaon');
    assert.strictEqual(s1.cargoType, 'Medical Supplies');
  });

  // Test 5: Vehicle ↔ shipment assignment is consistent
  await test('Vehicle ↔ shipment assignment is consistent', async () => {
    const vehicles = await supabaseService.getVehicles();
    const shipments = await supabaseService.getShipments();
    const enriched = enrichVehicles(vehicles, shipments);

    const v1 = enriched.find((v) => v.id === 'veh-001');
    assert(v1, 'veh-001 must exist');
    assert(v1.assignedShipment, 'veh-001 must have an assigned shipment');
    assert.strictEqual(v1.assignedShipment.id, 'shp-001');

    const s1 = shipments.find((s) => s.id === 'shp-001');
    assert(s1.vehicle, 'shp-001 must have linked vehicle');
    assert.strictEqual(s1.vehicle.id, 'veh-001');
  });

  // Test 6: Shipment status lifecycle is valid
  await test('Shipment status lifecycle is valid', async () => {
    const validStatuses = ['planned', 'assigned', 'loading', 'in_transit', 'delayed', 'delivered', 'blocked', 'cancelled', 'pending'];
    const testShpId = 'shp-011';
    const rohan = db.prepare('SELECT id FROM users WHERE email = ?').get('rohan@ner-sahayak.in');

    for (const st of ['assigned', 'loading', 'in_transit', 'delayed', 'planned']) {
      const res = await supabaseService.updateShipmentStatus(testShpId, rohan.id, 'logistics', st);
      assert.strictEqual(res.shipment.status, st, `Status should update to ${st}`);
    }

    // Attempt invalid status
    let threw = false;
    try {
      await supabaseService.updateShipmentStatus(testShpId, rohan.id, 'logistics', 'flying_to_moon');
    } catch (_) {
      threw = true;
    }
    assert(threw, 'Should reject invalid shipment status');
  });

  // Test 7: Unaffected shipment remains unaffected
  await test('Unaffected shipment remains unaffected', () => {
    const cleanShipment = {
      id: 'shp-clean',
      originNode: 'gangtok',
      destinationNode: 'siliguri',
      cargoType: 'General Cargo',
      mode: 'road',
      etaMinutes: 190,
    };
    // Active incident only on NH27
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'severe' }],
      incidents: [{ id: 'inc-1', road: 'NH27', fromNode: 'guwahati', toNode: 'nagaon', title: 'Landslide', category: 'landslide', status: 'open' }],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(cleanShipment, context);
    assert.strictEqual(res.isDisrupted, false, 'Clean corridor shipment must not be marked disrupted');
    assert.strictEqual(res.estimatedDelayMinutes, 0, 'Clean shipment must have 0 delay');
    assert.strictEqual(res.accessibilityState, 'OPEN');
    assert.strictEqual(res.affectedIncidents.length, 0);
  });

  // Test 8: Shipment on disrupted corridor is detected
  await test('Shipment on disrupted corridor is detected', () => {
    const disruptedShipment = {
      id: 'shp-nh27',
      originNode: 'guwahati',
      destinationNode: 'nagaon',
      cargoType: 'Medical supplies',
      mode: 'road',
      etaMinutes: 140,
    };
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'severe' }],
      incidents: [{ id: 'inc-nh27', road: 'NH27', fromNode: 'guwahati', toNode: 'nagaon', title: 'Landslide on NH27', category: 'landslide', status: 'open', estimatedDelayMinutes: 180 }],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(disruptedShipment, context);
    assert.strictEqual(res.isDisrupted, true, 'Disrupted corridor must be marked disrupted');
    assert(res.estimatedDelayMinutes > 0, `Delay must be positive, got ${res.estimatedDelayMinutes}`);
    assert(res.accessibilityState === 'SEVERELY_DISRUPTED' || res.accessibilityState === 'DISRUPTED');
  });

  // Test 9: Active incident is associated with affected shipment
  await test('Active incident is associated with affected shipment', () => {
    const shipment = {
      id: 'shp-nh27',
      originNode: 'guwahati',
      destinationNode: 'nagaon',
      mode: 'road',
    };
    const incidentRecord = {
      id: 'inc-nh27-debris',
      title: 'Major Landslide on NH27',
      road: 'NH27',
      fromNode: 'guwahati',
      toNode: 'nagaon',
      category: 'landslide',
      severity: 'major',
      status: 'open',
      lat: 26.25,
      lng: 92.20,
      photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    };
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'severe' }],
      incidents: [incidentRecord],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(shipment, context);
    assert.strictEqual(res.affectedIncidents.length, 1);
    const inc = res.affectedIncidents[0];
    assert.strictEqual(inc.id, 'inc-nh27-debris');
    assert.strictEqual(inc.title, 'Major Landslide on NH27');
    assert.strictEqual(inc.road, 'NH27');
    assert.strictEqual(inc.hasGps, true);
    assert(inc.photoDataUrl.startsWith('data:image/jpeg'), 'Photo must be preserved');
  });

  // Test 10: Baseline ETA is preserved
  await test('Baseline ETA is preserved', () => {
    const shipment = {
      id: 'shp-base-check',
      originNode: 'guwahati',
      destinationNode: 'nagaon',
      mode: 'road',
    };
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'severe' }],
      incidents: [{ id: 'inc-1', road: 'NH27', status: 'open' }],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(shipment, context);
    // Baseline clean route from Guwahati to Nagaon is 156 minutes
    assert(res.baseDurationMinutes > 0, 'Baseline duration must be calculated');
    assert(res.baseDurationMinutes <= 160, `Baseline duration should be ~156 min, got ${res.baseDurationMinutes}`);
  });

  // Test 11: Current/disrupted ETA is calculated when available
  await test('Current/disrupted ETA is calculated when available', () => {
    const shipment = {
      id: 'shp-curr-check',
      originNode: 'guwahati',
      destinationNode: 'nagaon',
      mode: 'road',
    };
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'severe' }],
      incidents: [{ id: 'inc-1', road: 'NH27', status: 'open' }],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(shipment, context);
    assert(res.currentEtaMinutes !== null, 'Current ETA must be calculated');
    assert(res.currentEtaMinutes > res.baseDurationMinutes, `Current ETA (${res.currentEtaMinutes}) must exceed baseline (${res.baseDurationMinutes})`);
  });

  // Test 12: Delay equals route duration difference
  await test('Delay equals route duration difference', () => {
    const shipment = {
      id: 'shp-delay-check',
      originNode: 'guwahati',
      destinationNode: 'nagaon',
      mode: 'road',
    };
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'severe' }],
      incidents: [{ id: 'inc-1', road: 'NH27', status: 'open' }],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(shipment, context);
    const expectedDelay = res.currentEtaMinutes - res.baseDurationMinutes;
    assert.strictEqual(res.estimatedDelayMinutes, expectedDelay, `Delay (${res.estimatedDelayMinutes}) must equal current (${res.currentEtaMinutes}) - base (${res.baseDurationMinutes})`);
  });

  // Test 13: Blocked route is represented correctly
  await test('Blocked route is represented correctly', () => {
    const shipment = {
      id: 'shp-blocked-check',
      originNode: 'guwahati',
      destinationNode: 'nagaon',
      mode: 'road',
    };
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'blocked' }],
      incidents: [{ id: 'inc-1', road: 'NH27', status: 'open', severity: 'blocked' }],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(shipment, context);
    assert.strictEqual(res.isBlocked, true, 'isBlocked must be true');
    assert.strictEqual(res.accessibilityState, 'BLOCKED', 'accessibilityState must be BLOCKED');
    assert.strictEqual(res.currentEtaMinutes, null, 'currentEtaMinutes must be null on blocked route');
    assert.strictEqual(res.estimatedDelayMinutes, null, 'estimatedDelayMinutes must be null on blocked route');
  });

  // Test 14: Alternative/recommended route comes from existing routing engine
  await test('Alternative/recommended route comes from existing routing engine', () => {
    const shipment = {
      id: 'shp-alt-check',
      originNode: 'guwahati',
      destinationNode: 'nagaon',
      mode: 'road',
      cargoType: 'Medical Supplies',
      priority: 'emergency',
    };
    const context = {
      disruptions: [{ fromNode: 'guwahati', toNode: 'nagaon', road: 'nh27', severity: 'severe' }],
      incidents: [{ id: 'inc-1', road: 'NH27', status: 'open' }],
      weatherSeverityByNode: {},
    };

    const res = evaluateShipmentDisruption(shipment, context);
    assert(res.recommendedAlternative, 'Must provide recommended alternative for disrupted shipment');
    assert(res.recommendedAlternative.mode, 'Alternative must have mode');
    assert(res.recommendedAlternative.mode === 'railway' || res.recommendedAlternative.mode === 'air', `Expected rail or air bypass, got ${res.recommendedAlternative.mode}`);
    assert(res.recommendedAlternative.reason && res.recommendedAlternative.reason.length > 10, 'Must include explanation reason');
    assert.strictEqual(res.recommendedAlternative.rank, 1, 'Alternative must be Rank 1');
  });

  // Test 15: Missing ETA is shown as unavailable rather than fabricated
  await test('Missing ETA is shown as unavailable rather than fabricated', () => {
    const unroutableShipment = {
      id: 'shp-missing-eta',
      originNode: 'atlantis',
      destinationNode: 'el_dorado',
      mode: 'road',
    };

    const res = evaluateShipmentDisruption(unroutableShipment);
    assert.strictEqual(res.currentEtaMinutes, null);
    assert.strictEqual(res.estimatedDelayMinutes, null);
    assert.strictEqual(res.etaStatus, 'UNAVAILABLE');
  });

  // Test 16: Missing vehicle is handled safely
  await test('Missing vehicle is handled safely', () => {
    const unassignedShipment = {
      id: 'shp-no-veh',
      originNode: 'guwahati',
      destinationNode: 'tezpur',
      vehicleId: null,
      mode: 'road',
    };

    const enriched = enrichShipments([unassignedShipment], []);
    assert.strictEqual(enriched.length, 1);
    assert.strictEqual(enriched[0].vehicle, null);
    assert.strictEqual(enriched[0].vehicleId, null);
  });

  // Test 17: Missing incident is handled safely
  await test('Missing incident is handled safely', () => {
    const shipment = {
      id: 'shp-no-inc',
      originNode: 'guwahati',
      destinationNode: 'tezpur',
      mode: 'road',
    };

    const res = evaluateShipmentDisruption(shipment, { disruptions: [], incidents: [] });
    assert.strictEqual(res.isDisrupted, false);
    assert.strictEqual(res.estimatedDelayMinutes, 0);
    assert.strictEqual(res.affectedIncidents.length, 0);
  });

  // Test 18: Duplicate alert/event is not created on repeated evaluation
  await test('Duplicate alert/event is not created on repeated evaluation', async () => {
    const alertCountBefore = db.prepare('SELECT COUNT(*) c FROM alerts').get().c;
    // Call getShipments multiple times
    await supabaseService.getShipments();
    await supabaseService.getShipments();
    await supabaseService.getShipments();
    const alertCountAfter = db.prepare('SELECT COUNT(*) c FROM alerts').get().c;
    assert.strictEqual(alertCountBefore, alertCountAfter, 'Querying shipments must not spam alerts');
  });

  // Test 19: Existing Phase 3A evidence remains inspectable
  await test('Existing Phase 3A evidence remains inspectable', async () => {
    const reports = await supabaseService.getIncidents();
    const withPhoto = reports.find((r) => r.photoDataUrl && r.photoDataUrl.startsWith('data:image'));
    assert(withPhoto, 'Should have at least one report with photoDataUrl');
    assert(withPhoto.photoDataUrl.length > 50, 'Photo data URL must be preserved');
    assert(typeof withPhoto.hasGps === 'boolean', 'hasGps must be boolean');
  });

  // Test 20: Existing Phase 3B offline behavior remains intact
  await test('Existing Phase 3B offline behavior remains intact', async () => {
    const fieldUser = db.prepare('SELECT id FROM users WHERE email = ?').get('priya@ner-sahayak.in');
    const clientId = 'phase4-offline-test-' + Date.now();
    const reportPayload = {
      clientId,
      nodeId: 'nagaon',
      road: 'NH27',
      category: 'landslide',
      severity: 'moderate',
      title: 'Phase 4 Offline Consistency Verification',
      description: 'Verifying offline queue ingestion compatibility in Phase 4',
      lat: 26.25,
      lng: 92.20,
    };

    const created = await supabaseService.createIncident(fieldUser.id, reportPayload, 'field', { preserveClientTimestamp: true });
    assert.strictEqual(created.clientId, clientId, 'Client submission ID must be preserved');

    // Retransmit same client ID (idempotency check)
    const retransmitted = await supabaseService.createIncident(fieldUser.id, reportPayload, 'field');
    assert.strictEqual(retransmitted.id, created.id, 'Retransmission must return existing canonical record');
  });

  console.log('\n====================================================');
  console.log(`PHASE 4 TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
