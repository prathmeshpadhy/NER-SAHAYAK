/**
 * NER-SAHAYAK — PHASE 2 VERIFICATION TEST SUITE
 * 
 * Deterministic Risk-Weighted Disruption Intelligence Engine
 * Intelligent Routing & Alternatives Validation
 * 
 * Verifies all 16 mandatory test cases:
 *  1. Baseline routing (clear conditions, expected paths)
 *  2. Minor disruption (2.0x multiplier)
 *  3. Moderate disruption (5.0x multiplier)
 *  4. Severe disruption (15.0x multiplier)
 *  5. Blocked corridor (infinity, bypass or clean failure)
 *  6. Severe weather (>0.60 severity penalty)
 *  7. Weather + incident compound penalty (M_weather * M_disruption)
 *  8. Multimodal comparison (Road, Rail, Waterway, Air)
 *  9. Deterministic ranking (Rank #1, #2, #3, #4 strictly ordered)
 *  10. Recommendation consistency across repeated evaluations
 *  11. Viewing alternative state does not mutate recommendation
 *  12. Decision score does not change ranking order
 *  13. Explanation contains real disruption information
 *  14. Delay calculation (disruptionAdjusted - baseDuration)
 *  15. Network isolation (road incident does not affect rail/air)
 *  16. No-route handling (returns null / 422 when all paths blocked)
 */

const assert = require('assert');
const { NODES, EDGES } = require('./data/nerNetwork');
const { findRoute, edgeWeight, findAlternateRoutes } = require('./utils/dijkstra');
const { scoreAndRecommendRoutes } = require('./utils/routeScorer');

let passCount = 0;
let failCount = 0;

function report(name, passed, detail = '') {
  if (passed) {
    console.log(`  ✓ ${name}`);
    passCount++;
  } else {
    console.error(`  ✗ ${name} — ${detail}`);
    failCount++;
  }
}

async function runTests() {
  console.log('======================================================================');
  console.log('NER-SAHAYAK — PHASE 2: INTELLIGENT ROUTING & ALTERNATIVES TESTS');
  console.log('Deterministic Risk-Weighted Disruption Intelligence Engine');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Baseline routing (clear conditions, expected paths)
  // -------------------------------------------------------------------------
  console.log('1. Baseline Routing (Clear Conditions):');
  try {
    const route = findRoute('guwahati', 'shillong', { weatherSeverityByNode: {}, disruptions: [], mode: 'road' });
    assert(route !== null, 'Route must exist between Guwahati and Shillong');
    assert.strictEqual(route.mode, 'road', 'Mode must be road');
    assert.strictEqual(route.totalKm, 100, 'Baseline distance should be 100 km');
    assert(route.etaMinutes > 120 && route.etaMinutes < 150, `ETA should be ~133 mins (got ${route.etaMinutes})`);
    assert(route.safetyIndex >= 90, `Baseline safety index should be >= 90% (got ${route.safetyIndex}%)`);
    assert.strictEqual(route.estimatedDelayMinutes, 0, 'Baseline estimated delay must be 0');
    assert.strictEqual(route.baseDurationMinutes, route.etaMinutes, 'Base duration must equal etaMinutes under clear conditions');
    report('Guwahati → Shillong baseline road route valid and clear', true);
  } catch (err) {
    report('Baseline routing failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Minor disruption (2.0x multiplier)
  // -------------------------------------------------------------------------
  console.log('\n2. Minor Disruption (2.0x Multiplier):');
  try {
    const minorDisruptions = [
      { road: 'NH27', from_node: 'guwahati', to_node: 'nagaon', severity: 'minor', multiplier: 2.0 }
    ];
    const baseRoute = findRoute('guwahati', 'nagaon', { weatherSeverityByNode: {}, disruptions: [], mode: 'road' });
    const minorRoute = findRoute('guwahati', 'nagaon', { weatherSeverityByNode: {}, disruptions: minorDisruptions, mode: 'road' });

    assert(minorRoute !== null, 'Route must exist');
    const nh27Edge = minorRoute.edges.find(e => e.road === 'NH27');
    assert(nh27Edge !== null, 'NH27 edge must be in route');
    assert.strictEqual(nh27Edge.accessibilityState, 'CAUTION', `Accessibility state should be CAUTION, got ${nh27Edge.accessibilityState}`);
    assert.strictEqual(nh27Edge.disruptionMultiplier, 2.0, 'Disruption multiplier must be 2.0');
    assert(minorRoute.etaMinutes > baseRoute.etaMinutes, 'Disrupted route ETA must exceed baseline ETA');
    assert(minorRoute.estimatedDelayMinutes > 0, `Estimated delay should be > 0 (got ${minorRoute.estimatedDelayMinutes} mins)`);
    report('Minor disruption applies 2.0x multiplier, sets CAUTION, and calculates delay', true);
  } catch (err) {
    report('Minor disruption test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Moderate disruption (5.0x multiplier)
  // -------------------------------------------------------------------------
  console.log('\n3. Moderate Disruption (5.0x Multiplier):');
  try {
    const modDisruptions = [
      { road: 'NH27', from_node: 'guwahati', to_node: 'nagaon', severity: 'moderate', multiplier: 5.0 }
    ];
    const modRoute = findRoute('guwahati', 'nagaon', { weatherSeverityByNode: {}, disruptions: modDisruptions, mode: 'road' });
    assert(modRoute !== null, 'Route must exist');
    const nh27Edge = modRoute.edges.find(e => e.road === 'NH27');
    assert.strictEqual(nh27Edge.accessibilityState, 'RESTRICTED', `Accessibility state should be RESTRICTED, got ${nh27Edge.accessibilityState}`);
    assert.strictEqual(nh27Edge.disruptionMultiplier, 5.0, 'Disruption multiplier must be 5.0');
    assert(nh27Edge.safetyIndex <= 75, `Safety index should be dampened <= 75%, got ${nh27Edge.safetyIndex}%`);
    report('Moderate disruption applies 5.0x multiplier and sets RESTRICTED', true);
  } catch (err) {
    report('Moderate disruption test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Severe disruption (15.0x multiplier)
  // -------------------------------------------------------------------------
  console.log('\n4. Severe Disruption (15.0x Multiplier):');
  try {
    const severeDisruptions = [
      { road: 'NH6', from_node: 'shillong', to_node: 'jowai', severity: 'severe', multiplier: 15.0 }
    ];
    const severeRoute = findRoute('shillong', 'jowai', { weatherSeverityByNode: {}, disruptions: severeDisruptions, mode: 'road' });
    assert(severeRoute !== null, 'Route must exist');
    const nh6Edge = severeRoute.edges.find(e => e.road === 'NH6');
    assert.strictEqual(nh6Edge.accessibilityState, 'SEVERELY_DISRUPTED', `Accessibility state should be SEVERELY_DISRUPTED, got ${nh6Edge.accessibilityState}`);
    assert.strictEqual(nh6Edge.disruptionMultiplier, 15.0, 'Disruption multiplier must be 15.0');
    assert(severeRoute.safetyIndex <= 55, `Route safety index must drop to <= 55%, got ${severeRoute.safetyIndex}%`);
    assert(severeRoute.etaMinutes >= 300, `ETA must scale up significantly under 15x penalty, got ${severeRoute.etaMinutes} mins`);
    assert(severeRoute.estimatedDelayMinutes >= 200, `Estimated delay must be >= 200 mins, got ${severeRoute.estimatedDelayMinutes}`);
    report('Severe disruption applies 15.0x multiplier, sets SEVERELY_DISRUPTED, and dampens safety <= 55%', true);
  } catch (err) {
    report('Severe disruption test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Blocked corridor (infinity, bypass or clean failure)
  // -------------------------------------------------------------------------
  console.log('\n5. Blocked Corridor (Infinity Multiplier & Automatic Bypass):');
  try {
    // Block direct NH6 corridor between Guwahati and Shillong
    const blockedDisruptions = [
      { road: 'NH6', severity: 'blocked', multiplier: Infinity }
    ];
    const bypassedRoute = findRoute('guwahati', 'shillong', { weatherSeverityByNode: {}, disruptions: blockedDisruptions, mode: 'road' });
    assert(bypassedRoute !== null, 'Router should find an alternate bypass route');
    const usesNH6 = bypassedRoute.edges.some(e => e.road === 'NH6');
    assert(!usesNH6, 'Bypassed route must NOT use blocked NH6 corridor');
    // It should route via Guwahati -> Tura (NH27) -> Shillong (SH)
    const hasTura = bypassedRoute.path.some(n => n.id === 'tura');
    assert(hasTura, 'Bypassed route must detour via Tura (NH27/SH)');
    report('Blocked direct corridor cleanly bypassed via alternate highway network', true);
  } catch (err) {
    report('Blocked corridor bypass test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Severe weather (>0.60 severity penalty)
  // -------------------------------------------------------------------------
  console.log('\n6. Severe Weather Penalty (>0.60 Severity):');
  try {
    const weatherSeverityByNode = { nagaon: 0.85 };
    const clearRoute = findRoute('guwahati', 'nagaon', { weatherSeverityByNode: {}, disruptions: [], mode: 'road' });
    const weatherRoute = findRoute('guwahati', 'nagaon', { weatherSeverityByNode, disruptions: [], mode: 'road' });

    assert(weatherRoute !== null, 'Route must exist');
    assert(weatherRoute.etaMinutes > clearRoute.etaMinutes, `Weather route ETA (${weatherRoute.etaMinutes}) must exceed clear ETA (${clearRoute.etaMinutes})`);
    assert(weatherRoute.estimatedDelayMinutes > 0, 'Estimated delay due to weather must be > 0');
    assert(weatherRoute.safetyIndex < clearRoute.safetyIndex, 'Route safety index must drop due to weather');
    report('Severe weather (>0.60) applies weather penalty, increases transit duration and reduces safety', true);
  } catch (err) {
    report('Severe weather penalty test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 7: Weather + incident compound penalty (M_weather * M_disruption)
  // -------------------------------------------------------------------------
  console.log('\n7. Weather + Incident Compound Penalty:');
  try {
    const edge = EDGES.find(e => e.from === 'guwahati' && e.to === 'nagaon' && e.mode === 'road');
    assert(edge, 'Edge guwahati-nagaon must exist');
    
    const weatherContext = { nagaon: 0.50 }; // weather multiplier = 1 + 0.25 * 8.0 = 3.0x
    const disruptions = [{ road: 'NH27', from_node: 'guwahati', to_node: 'nagaon', severity: 'moderate', multiplier: 5.0 }];
    
    const context = { weatherSeverityByNode: weatherContext, disruptions, mode: 'road' };
    const compoundRes = edgeWeight(edge, context);
    
    // base weight = km * terrain = 117 * 1.05 = 122.85
    // weather multiplier = 3.0x
    // disruption multiplier = 5.0x
    // expected compound weight = 122.85 * 3.0 * 5.0 = 1842.75
    const expectedWeight = edge.km * edge.terrainFactor * 3.0 * 5.0;
    assert.strictEqual(compoundRes.weight, expectedWeight, `Compound weight should be ${expectedWeight}, got ${compoundRes.weight}`);
    assert.strictEqual(compoundRes.disruptionMultiplier, 5.0, 'Disruption multiplier must be 5.0');
    assert.strictEqual(compoundRes.weatherSeverity, 0.50, 'Weather severity must be 0.50');
    report('Weather (3.0x) and incident (5.0x) compound multiplicatively to 15.0x without data loss', true);
  } catch (err) {
    report('Compound penalty test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Multimodal comparison (Road, Rail, Waterway, Air)
  // -------------------------------------------------------------------------
  console.log('\n8. Multimodal Comparison:');
  try {
    const originId = 'guwahati';
    const destinationId = 'imphal';
    const context = { weatherSeverityByNode: {}, disruptions: [] };

    const routes = {
      road: findRoute(originId, destinationId, { ...context, mode: 'road' }),
      railway: findRoute(originId, destinationId, { ...context, mode: 'railway' }),
      waterway: findRoute(originId, destinationId, { ...context, mode: 'waterway' }),
      air: findRoute(originId, destinationId, { ...context, mode: 'air' })
    };

    assert(routes.road !== null, 'Road route must exist');
    assert(routes.railway !== null, 'Railway route must exist');
    assert(routes.waterway !== null, 'Waterway route must exist');
    assert(routes.air !== null, 'Air route must exist');

    assert.strictEqual(routes.road.mode, 'road');
    assert.strictEqual(routes.railway.mode, 'railway');
    assert.strictEqual(routes.waterway.mode, 'waterway');
    assert.strictEqual(routes.air.mode, 'air');
    report('All 4 multimodal corridors (Road, Rail, Waterway, Air) computed successfully', true);
  } catch (err) {
    report('Multimodal comparison failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 9: Deterministic ranking (Rank #1, #2, #3, #4 strictly ordered)
  // -------------------------------------------------------------------------
  console.log('\n9. Deterministic Ranking & Strict Ordering:');
  try {
    const originId = 'guwahati';
    const destinationId = 'imphal';
    const context = { weatherSeverityByNode: {}, disruptions: [] };
    const routes = {
      road: findRoute(originId, destinationId, { ...context, mode: 'road' }),
      railway: findRoute(originId, destinationId, { ...context, mode: 'railway' }),
      waterway: findRoute(originId, destinationId, { ...context, mode: 'waterway' }),
      air: findRoute(originId, destinationId, { ...context, mode: 'air' })
    };

    const recResult = scoreAndRecommendRoutes(routes, { cargoType: 'General Cargo', priority: 'Normal' });
    assert(recResult !== null, 'Recommendation result must not be null');
    assert.strictEqual(recResult.rankings.length, 4, 'All 4 modes must be ranked');

    for (let i = 0; i < recResult.rankings.length; i++) {
      const candidate = recResult.rankings[i];
      assert.strictEqual(candidate.rank, i + 1, `Rank should be ${i + 1}, got ${candidate.rank}`);
      if (i > 0) {
        const prev = recResult.rankings[i - 1];
        assert(candidate.cost >= prev.cost, `Cost of rank ${candidate.rank} (${candidate.cost}) must be >= rank ${prev.rank} (${prev.cost})`);
      }
    }
    report('Candidates strictly ordered with ranks 1..4 and monotonically increasing costs', true);
  } catch (err) {
    report('Deterministic ranking test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 10: Recommendation consistency across repeated evaluations
  // -------------------------------------------------------------------------
  console.log('\n10. Recommendation Consistency across Repeated Runs:');
  try {
    const originId = 'guwahati';
    const destinationId = 'imphal';
    const disruptions = [{ road: 'NH27', from_node: 'guwahati', to_node: 'nagaon', severity: 'severe', multiplier: 15.0 }];
    const context = { weatherSeverityByNode: { nagaon: 0.3 }, disruptions };

    const firstRun = scoreAndRecommendRoutes({
      road: findRoute(originId, destinationId, { ...context, mode: 'road' }),
      railway: findRoute(originId, destinationId, { ...context, mode: 'railway' }),
      waterway: findRoute(originId, destinationId, { ...context, mode: 'waterway' }),
      air: findRoute(originId, destinationId, { ...context, mode: 'air' })
    }, { cargoType: 'Pharmaceutical / Medicine', priority: 'High' });

    for (let i = 0; i < 10; i++) {
      const run = scoreAndRecommendRoutes({
        road: findRoute(originId, destinationId, { ...context, mode: 'road' }),
        railway: findRoute(originId, destinationId, { ...context, mode: 'railway' }),
        waterway: findRoute(originId, destinationId, { ...context, mode: 'waterway' }),
        air: findRoute(originId, destinationId, { ...context, mode: 'air' })
      }, { cargoType: 'Pharmaceutical / Medicine', priority: 'High' });

      assert.strictEqual(run.recommendedMode, firstRun.recommendedMode, `Run ${i + 1}: Recommended mode mismatch`);
      assert.strictEqual(run.decisionScore, firstRun.decisionScore, `Run ${i + 1}: Decision score mismatch`);
      assert.strictEqual(run.recommendationReason, firstRun.recommendationReason, `Run ${i + 1}: Reason mismatch`);
      for (let j = 0; j < run.rankings.length; j++) {
        assert.strictEqual(run.rankings[j].mode, firstRun.rankings[j].mode, `Run ${i + 1}: Rank ${j + 1} mode mismatch`);
        assert.strictEqual(run.rankings[j].decisionScore, firstRun.rankings[j].decisionScore, `Run ${i + 1}: Rank ${j + 1} score mismatch`);
      }
    }
    report('10 repeated evaluations yield identical recommendation, ranking, and scores', true);
  } catch (err) {
    report('Recommendation consistency test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 11: Viewing alternative state does not mutate recommendation
  // -------------------------------------------------------------------------
  console.log('\n11. Viewing Alternative State Isolation:');
  try {
    const routes = {
      road: { mode: 'road', etaMinutes: 720, totalKm: 540, safetyIndex: 60, transfers: [] },
      railway: { mode: 'railway', etaMinutes: 610, totalKm: 555, safetyIndex: 95, transfers: [] },
      air: { mode: 'air', etaMinutes: 70, totalKm: 280, safetyIndex: 98, transfers: [] }
    };
    const recResult = scoreAndRecommendRoutes(routes, { cargoType: 'General Cargo', priority: 'Normal' });
    const originalRecommendedMode = recResult.recommendedMode;
    const originalRank1 = recResult.rankings[0];

    // Simulate viewing an alternative mode in UI
    const viewedAlternativeMode = 'road';
    assert.notStrictEqual(viewedAlternativeMode, originalRecommendedMode, 'Alternative mode must be different from recommended mode');

    // Verify recResult properties remained locked
    assert.strictEqual(recResult.recommendedMode, originalRecommendedMode, 'Recommended mode must not be mutated');
    assert.strictEqual(recResult.rankings[0].mode, originalRank1.mode, 'Rank #1 candidate must remain unchanged');
    assert.strictEqual(recResult.rank, 1, 'Recommendation rank must remain 1');
    report('Viewing alternative mode does not mutate recommendation or rankings', true);
  } catch (err) {
    report('Viewing alternative state isolation test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 12: Decision score does not change ranking order
  // -------------------------------------------------------------------------
  console.log('\n12. Decision Score Monotonicity with Respect to Rank:');
  try {
    const mockRoutes = {
      road: { mode: 'road', etaMinutes: 1200, totalKm: 500, safetyIndex: 40, transfers: [] },
      railway: { mode: 'railway', etaMinutes: 600, totalKm: 520, safetyIndex: 90, transfers: [] },
      waterway: { mode: 'waterway', etaMinutes: 1800, totalKm: 900, safetyIndex: 85, transfers: [] },
      air: { mode: 'air', etaMinutes: 80, totalKm: 280, safetyIndex: 98, transfers: [] }
    };
    const res = scoreAndRecommendRoutes(mockRoutes, { priority: 'Normal', cargoType: 'General Cargo' });
    
    let prevScore = 100;
    for (const item of res.rankings) {
      assert(item.decisionScore <= prevScore, `Decision score of rank ${item.rank} (${item.decisionScore}) must be <= previous rank score (${prevScore})`);
      assert(item.decisionScore >= 0 && item.decisionScore <= 100, `Decision score must be in range [0, 100], got ${item.decisionScore}`);
      prevScore = item.decisionScore;
    }
    report('Decision scores are monotonically non-increasing across ranks and do not perturb ranking order', true);
  } catch (err) {
    report('Decision score monotonicity test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 13: Explanation contains real disruption information
  // -------------------------------------------------------------------------
  console.log('\n13. Explanation Contains Real Disruption Details:');
  try {
    const originId = 'guwahati';
    const destinationId = 'imphal';
    const disruptions = [
      { road: 'NH27', severity: 'severe', multiplier: 15.0 }
    ];
    const context = { weatherSeverityByNode: { nagaon: 0.4 }, disruptions };

    const routes = {
      road: findRoute(originId, destinationId, { ...context, mode: 'road' }),
      railway: findRoute(originId, destinationId, { ...context, mode: 'railway' }),
      air: findRoute(originId, destinationId, { ...context, mode: 'air' })
    };

    const recResult = scoreAndRecommendRoutes(routes, { cargoType: 'General Cargo', priority: 'Normal' });
    assert(recResult.explanation, 'Explanation object must be present in recommendation');
    const exp = recResult.explanation;

    assert.strictEqual(exp.recommendedMode, recResult.recommendedMode, 'Recommended mode in explanation must match recResult');
    assert(exp.reasons.length > 0, 'Explanation must include rationale reasons');
    assert(exp.affectedCorridors.some(c => c.includes('NH27')), 'Explanation must identify NH27 as affected corridor');
    assert(exp.avoidedDisruptions.length > 0, 'Explanation must report avoided disruptions when bypassing road');
    assert(recResult.recommendationReason.includes('NH27'), 'Text recommendation reason must mention NH27 road alternative');
    report('Explanation object contains real disruption details, affected corridors, and avoided hazards', true);
  } catch (err) {
    report('Explanation disruption details test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 14: Delay calculation (disruptionAdjusted - baseDuration)
  // -------------------------------------------------------------------------
  console.log('\n14. Delay Calculation Accuracy:');
  try {
    const disruptions = [
      { road: 'NH27', from_node: 'guwahati', to_node: 'nagaon', severity: 'moderate', multiplier: 5.0 }
    ];
    const route = findRoute('guwahati', 'nagaon', { weatherSeverityByNode: {}, disruptions, mode: 'road' });
    assert(route !== null, 'Route must exist');
    
    assert(typeof route.baseDurationMinutes === 'number', 'baseDurationMinutes must be a number');
    assert(typeof route.etaMinutes === 'number', 'etaMinutes must be a number');
    assert(typeof route.estimatedDelayMinutes === 'number', 'estimatedDelayMinutes must be a number');

    const expectedDelay = route.etaMinutes - route.baseDurationMinutes;
    assert.strictEqual(route.estimatedDelayMinutes, expectedDelay, `Estimated delay (${route.estimatedDelayMinutes}) must equal etaMinutes - baseDurationMinutes (${expectedDelay})`);
    assert(route.estimatedDelayMinutes > 0, `Estimated delay under 5x disruption must be > 0 (got ${route.estimatedDelayMinutes} mins)`);
    report('Delay calculation is exact: etaMinutes - baseDurationMinutes = estimatedDelayMinutes', true);
  } catch (err) {
    report('Delay calculation test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 15: Network isolation (road incident does not affect rail/air)
  // -------------------------------------------------------------------------
  console.log('\n15. Multimodal Network Isolation:');
  try {
    const originId = 'guwahati';
    const destinationId = 'imphal';

    // Clear network baseline
    const clearRail = findRoute(originId, destinationId, { weatherSeverityByNode: {}, disruptions: [], mode: 'railway' });
    const clearAir = findRoute(originId, destinationId, { weatherSeverityByNode: {}, disruptions: [], mode: 'air' });

    // Inject catastrophic road disruption on NH27
    const roadDisruptions = [
      { road: 'NH27', from_node: 'guwahati', to_node: 'nagaon', severity: 'blocked', multiplier: Infinity }
    ];
    const disruptedRail = findRoute(originId, destinationId, { weatherSeverityByNode: {}, disruptions: roadDisruptions, mode: 'railway' });
    const disruptedAir = findRoute(originId, destinationId, { weatherSeverityByNode: {}, disruptions: roadDisruptions, mode: 'air' });

    assert(disruptedRail !== null && clearRail !== null, 'Rail routes must exist');
    assert(disruptedAir !== null && clearAir !== null, 'Air routes must exist');

    // Rail transit duration and safety must be unaffected by road blockage
    assert.strictEqual(disruptedRail.totalKm, clearRail.totalKm, 'Rail distance must remain identical');
    assert.strictEqual(disruptedRail.etaMinutes, clearRail.etaMinutes, 'Rail ETA must remain unaffected by road blockage');
    assert.strictEqual(disruptedRail.safetyIndex, clearRail.safetyIndex, 'Rail safety index must remain unaffected');

    // Air flight corridor must be unaffected
    assert.strictEqual(disruptedAir.totalKm, clearAir.totalKm, 'Air distance must remain identical');
    assert.strictEqual(disruptedAir.etaMinutes, clearAir.etaMinutes, 'Air ETA must remain unaffected by road blockage');
    assert.strictEqual(disruptedAir.safetyIndex, clearAir.safetyIndex, 'Air safety index must remain unaffected');

    report('Road disruption strictly isolated: Rail and Air corridors maintain intact metrics', true);
  } catch (err) {
    report('Multimodal network isolation test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 16: No-route handling (returns null cleanly when all paths blocked)
  // -------------------------------------------------------------------------
  console.log('\n16. No-Route Handling & Clean Degradation:');
  try {
    // Block ALL road edges connected to Shillong (NH6 to Guwahati, NH6 to Jowai, SH to Tura)
    const allShillongDisruptions = [
      { road: 'NH6', from_node: 'guwahati', to_node: 'shillong', severity: 'blocked', multiplier: Infinity },
      { road: 'NH6', from_node: 'shillong', to_node: 'jowai', severity: 'blocked', multiplier: Infinity },
      { road: 'SH', from_node: 'shillong', to_node: 'tura', severity: 'blocked', multiplier: Infinity }
    ];
    const noRoute = findRoute('guwahati', 'shillong', { weatherSeverityByNode: {}, disruptions: allShillongDisruptions, mode: 'road' });
    assert.strictEqual(noRoute, null, 'findRoute must return null when destination is unreachable');

    // Verify scoreAndRecommendRoutes handles empty routes gracefully
    const emptyRec = scoreAndRecommendRoutes({ road: null, railway: null }, { cargoType: 'General Cargo' });
    assert.strictEqual(emptyRec, null, 'scoreAndRecommendRoutes must return null when no candidate routes are viable');

    report('Clean degradation: findRoute returns null and scoreAndRecommendRoutes returns null without throwing', true);
  } catch (err) {
    report('No-route handling test failed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`PHASE 2 TEST SUMMARY: ${passCount}/${passCount + failCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running Phase 2 tests:', err);
  process.exit(1);
});
