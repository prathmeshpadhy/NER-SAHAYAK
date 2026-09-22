/**
 * NER-SAHAYAK — PHASE 1 VERIFICATION TEST SUITE
 * 
 * Deterministic Risk-Weighted Disruption Intelligence Engine
 * 
 * Verifies all 14 mandatory test cases:
 *  1. OpenWeather mock/scoring
 *  2. OpenWeather unavailable fallback
 *  3. Open-Meteo fetch & scoring
 *  4. Local deterministic fallback
 *  5. Weather severity score bounds
 *  6. Accessibility state mappings
 *  7. Minor incident propagation (2.0x)
 *  8. Moderate incident propagation (5.0x)
 *  9. Major incident propagation (15.0x)
 *  10. Blocked corridor propagation (Infinity)
 *  11. Incident -> Alert generation
 *  12. Duplicate alert prevention
 *  13. Weather + Incident coexistence
 *  14. Multimodal routing regression check
 */

const assert = require('assert');
const { NODES, EDGES } = require('./data/nerNetwork');
const {
  scoreWeather,
  scoreOpenMeteoWeather,
  getDeterministicLocalWeather,
  fetchNodeWeather,
  clearCache
} = require('./routes/weather');
const { findRoute, edgeWeight } = require('./utils/dijkstra');
const { scoreAndRecommendRoutes } = require('./utils/routeScorer');
const supabaseService = require('./services/supabaseService');
const db = require('./db');

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
  console.log('NER-SAHAYAK — PHASE 1: DISRUPTION & ACCESSIBILITY INTELLIGENCE TESTS');
  console.log('Deterministic Risk-Weighted Disruption Intelligence Engine');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: OpenWeather mock/scoring
  // -------------------------------------------------------------------------
  console.log('1. OpenWeather Scoring & Structure:');
  try {
    const owmSample = {
      weather: [{ id: 502, main: 'Rain', description: 'heavy intensity rain' }],
      wind: { speed: 12.5 }, // 12.5 m/s = 45 km/h (> 40 km/h adds 0.20)
      rain: { '1h': 12.0 }, // > 10 mm adds 0.15
      main: { temp: 24.2 }
    };
    const scored = scoreWeather(owmSample);
    const passed = (
      scored.code === 502 &&
      scored.label === 'Heavy rain' &&
      scored.severity >= 0.90 &&
      scored.severity <= 1.00 &&
      scored.windspeed === 45.0 &&
      scored.precipitation === 12.0
    );
    report('OpenWeather heavy rain + high wind scored with high severity (>= 0.90)', passed, `severity=${scored.severity}`);
  } catch (err) {
    report('OpenWeather scoring', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: OpenWeather unavailable fallback
  // -------------------------------------------------------------------------
  console.log('\n2. OpenWeather Unavailable Fallback:');
  try {
    clearCache();
    // Simulate lack of OWM key or failure by skipping OpenWeather
    const node = NODES.find((n) => n.id === 'guwahati');
    const result = await fetchNodeWeather(node, { skipOpenWeather: true, forceRefresh: true });
    const passed = (
      result &&
      result.nodeId === 'guwahati' &&
      (result.source === 'open_meteo' || result.source === 'local_deterministic') &&
      typeof result.severity === 'number' &&
      result.severity >= 0 &&
      result.severity <= 1
    );
    report('Gracefully falls back to Open-Meteo or Local Fallback without throwing', passed, `source=${result?.source}`);
  } catch (err) {
    report('OpenWeather unavailable fallback', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Open-Meteo fetch & scoring
  // -------------------------------------------------------------------------
  console.log('\n3. Open-Meteo WMO Code Scoring:');
  try {
    const omThunderstorm = scoreOpenMeteoWeather({
      weather_code: 95,
      wind_speed_10m: 45.0, // > 40 adds 0.20
      precipitation: 15.0, // > 10 adds 0.15
    });
    const omClear = scoreOpenMeteoWeather({
      weather_code: 0,
      wind_speed_10m: 10.0,
      precipitation: 0.0,
    });
    const omFog = scoreOpenMeteoWeather({
      weather_code: 45,
      wind_speed_10m: 5.0,
      precipitation: 0.0,
    });
    const passed = (
      omThunderstorm.severity >= 0.90 &&
      omThunderstorm.label === 'Thunderstorm' &&
      omClear.severity <= 0.10 &&
      omClear.label === 'Clear sky' &&
      omFog.severity === 0.40 &&
      omFog.label === 'Fog/Mist'
    );
    report('Open-Meteo WMO codes mapped correctly (Clear=0.05, Fog=0.40, Storm>=0.90)', passed,
      `clear=${omClear.severity}, fog=${omFog.severity}, storm=${omThunderstorm.severity}`);
  } catch (err) {
    report('Open-Meteo scoring', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Local deterministic fallback
  // -------------------------------------------------------------------------
  console.log('\n4. Deterministic Local Fallback:');
  try {
    const tawangNode = NODES.find((n) => n.id === 'tawang');
    const local1 = getDeterministicLocalWeather(tawangNode);
    const local2 = getDeterministicLocalWeather(tawangNode);
    const passed = (
      local1.source === 'local_deterministic' &&
      local1.isLive === false &&
      local1.severity > 0 &&
      local1.severity <= 1 &&
      local1.severity === local2.severity &&
      local1.temperature === local2.temperature &&
      local1.label === 'Mountain mist'
    );
    report('Deterministic local fallback produces stable, realistic baseline for high-altitude node', passed,
      `severity=${local1.severity}, temp=${local1.temperature}C`);
  } catch (err) {
    report('Local deterministic fallback', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Weather severity score bounds
  // -------------------------------------------------------------------------
  console.log('\n5. Weather Severity Score Bounds [0.0, 1.0]:');
  try {
    const testCases = [
      { weather: [{ id: 800 }], wind: { speed: 0 }, rain: {} },
      { weather: [{ id: 200 }], wind: { speed: 30 }, rain: { '1h': 50 } },
      { weather_code: 0, wind_speed_10m: 0, precipitation: 0 },
      { weather_code: 99, wind_speed_10m: 90, precipitation: 80 },
    ];
    let allBounded = true;
    testCases.forEach((tc) => {
      const s = tc.weather ? scoreWeather(tc).severity : scoreOpenMeteoWeather(tc).severity;
      if (s < 0 || s > 1.0 || isNaN(s)) allBounded = false;
    });
    report('All weather scores bounded strictly between 0.00 and 1.00 inclusive', allBounded);
  } catch (err) {
    report('Weather bounds', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Accessibility state mappings
  // -------------------------------------------------------------------------
  console.log('\n6. Accessibility State Mappings:');
  try {
    // Check edge mapping from dijkstra
    const testEdge = { from: 'guwahati', to: 'nagaon', km: 120, terrainFactor: 1.0, road: 'NH27', mode: 'road' };
    
    // Scenario A: Clear
    const clearCtx = { weatherSeverityByNode: { guwahati: 0.1, nagaon: 0.1 }, disruptions: [] };
    const clearWeight = edgeWeight(testEdge, clearCtx);
    
    // Scenario B: Minor (2x)
    const minorCtx = { weatherSeverityByNode: {}, disruptions: [{ road: 'NH27', severity: 'minor' }] };
    const minorWeight = edgeWeight(testEdge, minorCtx);

    // Scenario C: Moderate (5x)
    const modCtx = { weatherSeverityByNode: {}, disruptions: [{ road: 'NH27', severity: 'moderate' }] };
    const modWeight = edgeWeight(testEdge, modCtx);

    // Scenario D: Severe (15x)
    const sevCtx = { weatherSeverityByNode: {}, disruptions: [{ road: 'NH27', severity: 'severe' }] };
    const sevWeight = edgeWeight(testEdge, sevCtx);

    // Scenario E: Blocked (Infinity)
    const blockCtx = { weatherSeverityByNode: {}, disruptions: [{ road: 'NH27', severity: 'blocked' }] };
    const blockWeight = edgeWeight(testEdge, blockCtx);

    const passed = (
      clearWeight.disruptionMultiplier === 1 && !clearWeight.blocked &&
      minorWeight.disruptionMultiplier === 2 && !minorWeight.blocked &&
      modWeight.disruptionMultiplier === 5 && !modWeight.blocked &&
      sevWeight.disruptionMultiplier === 15 && !sevWeight.blocked &&
      blockWeight.blocked && blockWeight.weight === Infinity
    );
    report('Multipliers map correctly: Minor=2x, Moderate=5x, Severe=15x, Blocked=Infinity', passed);
  } catch (err) {
    report('Accessibility state mappings', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 7: Minor incident propagation
  // -------------------------------------------------------------------------
  console.log('\n7. Minor Incident Propagation:');
  try {
    const route = findRoute('guwahati', 'dimapur', {
      mode: 'road',
      disruptions: [{ road: 'NH27', severity: 'minor' }]
    });
    const nh27Seg = route.segments.find((s) => s.road === 'NH27');
    const passed = (
      route &&
      nh27Seg &&
      nh27Seg.disruptionMultiplier === 2 &&
      nh27Seg.accessibilityState === 'CAUTION' &&
      nh27Seg.condition === 'caution'
    );
    report('Minor incident on NH27 sets accessibilityState="CAUTION" and multiplier=2x', passed,
      `state=${nh27Seg?.accessibilityState}`);
  } catch (err) {
    report('Minor incident propagation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Moderate incident propagation
  // -------------------------------------------------------------------------
  console.log('\n8. Moderate Incident Propagation:');
  try {
    const route = findRoute('guwahati', 'dimapur', {
      mode: 'road',
      disruptions: [{ road: 'NH27', severity: 'moderate' }]
    });
    const nh27Seg = route.segments.find((s) => s.road === 'NH27');
    const passed = (
      route &&
      nh27Seg &&
      nh27Seg.disruptionMultiplier === 5 &&
      nh27Seg.accessibilityState === 'RESTRICTED' &&
      nh27Seg.condition === 'disrupted'
    );
    report('Moderate incident on NH27 sets accessibilityState="RESTRICTED" and multiplier=5x', passed,
      `state=${nh27Seg?.accessibilityState}`);
  } catch (err) {
    report('Moderate incident propagation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 9: Major incident propagation
  // -------------------------------------------------------------------------
  console.log('\n9. Major Incident Propagation & Safety Damping:');
  try {
    const route = findRoute('guwahati', 'dimapur', {
      mode: 'road',
      disruptions: [{ road: 'NH27', severity: 'severe' }]
    });
    const nh27Seg = route.segments.find((s) => s.road === 'NH27');
    const passed = (
      route &&
      nh27Seg &&
      nh27Seg.disruptionMultiplier === 15 &&
      nh27Seg.accessibilityState === 'SEVERELY_DISRUPTED' &&
      nh27Seg.condition === 'disrupted' &&
      route.safetyIndex <= 55
    );
    report('Major incident on NH27 dampens route safety to <= 55% and sets accessibilityState="SEVERELY_DISRUPTED"', passed,
      `routeSafety=${route?.safetyIndex}%, segState=${nh27Seg?.accessibilityState}`);
  } catch (err) {
    report('Major incident propagation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 10: Blocked corridor propagation
  // -------------------------------------------------------------------------
  console.log('\n10. Blocked Corridor Propagation (Physical Blockage):');
  try {
    // Guwahati -> Tezpur normally uses NH15 (182 km). If NH15 is blocked, multimodal router bypasses via Rail or Waterway
    const routeBlocked = findRoute('guwahati', 'tezpur', {
      mode: 'all',
      disruptions: [{ road: 'NH15', severity: 'blocked' }]
    });
    const usesNH15 = routeBlocked.segments.some((s) => s.road === 'NH15');
    const passed = routeBlocked && !usesNH15;
    report('Blocked NH15 forces router to bypass blocked road corridor completely', passed,
      `bypassed=${!usesNH15}, chosenMode=${routeBlocked.modeLabel}`);
  } catch (err) {
    report('Blocked corridor propagation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 11: Incident -> Alert generation
  // -------------------------------------------------------------------------
  console.log('\n11. Incident -> Alert Generation Pipeline:');
  try {
    const testUserId = 'test_phase1_officer';
    const testTitle = `Phase1 AutoAlert Test ${Date.now()}`;
    const incident = await supabaseService.createIncident(testUserId, {
      title: testTitle,
      category: 'landslide',
      severity: 'major',
      road: 'NH27',
      fromNode: 'guwahati',
      toNode: 'nagaon',
      lat: 26.15,
      lng: 92.05,
      description: 'Major landslide blocking half corridor'
    }, 'field');

    const alerts = await supabaseService.getAlerts(10);
    const matchingAlert = alerts.find((a) => a.title.includes(testTitle));
    const passed = (
      incident &&
      matchingAlert &&
      matchingAlert.title.includes('[LANDSLIDE]') &&
      matchingAlert.severity === 'major'
    );
    report('Creating an incident immediately auto-publishes an operational alert', passed,
      `alertTitle=${matchingAlert?.title}`);

    // Cleanup test record
    db.prepare('DELETE FROM field_reports WHERE id = ?').run(incident.id);
    db.prepare('DELETE FROM alerts WHERE title LIKE ?').run(`%${testTitle}%`);
  } catch (err) {
    report('Incident -> Alert generation', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 12: Duplicate alert prevention
  // -------------------------------------------------------------------------
  console.log('\n12. Rapid Duplicate Incident & Alert Prevention:');
  try {
    const testUserId = 'test_duplicate_officer';
    const testTitle = `Duplicate Guard Test ${Date.now()}`;
    const payload = {
      title: testTitle,
      category: 'flood',
      severity: 'moderate',
      road: 'NH37',
      fromNode: 'guwahati',
      toNode: 'morigaon',
      lat: 26.25,
      lng: 92.35,
      description: 'Waterlogging on NH37'
    };

    // First submission
    const inc1 = await supabaseService.createIncident(testUserId, payload, 'field');
    const alertsAfterFirst = await supabaseService.getAlerts(20);
    const alertCountFirst = alertsAfterFirst.filter((a) => a.title.includes(testTitle)).length;

    // Immediate second submission (within 5 minutes, same user, same category, same road)
    const inc2 = await supabaseService.createIncident(testUserId, payload, 'field');
    const alertsAfterSecond = await supabaseService.getAlerts(20);
    const alertCountSecond = alertsAfterSecond.filter((a) => a.title.includes(testTitle)).length;

    const passed = (
      inc1.id === inc2.id &&
      alertCountFirst === 1 &&
      alertCountSecond === 1
    );
    report('Duplicate report returns existing incident and prevents duplicate alert publication', passed,
      `sameId=${inc1.id === inc2.id}, alertCount=${alertCountSecond}`);

    // Cleanup
    db.prepare('DELETE FROM field_reports WHERE id = ?').run(inc1.id);
    db.prepare('DELETE FROM alerts WHERE title LIKE ?').run(`%${testTitle}%`);
  } catch (err) {
    report('Duplicate alert prevention', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 13: Weather + Incident coexistence
  // -------------------------------------------------------------------------
  console.log('\n13. Weather + Incident Coexistence (Compounding without overwrite):');
  try {
    const testEdge = { from: 'guwahati', to: 'nagaon', km: 120, terrainFactor: 1.0, road: 'NH27', mode: 'road' };
    const baseWeight = testEdge.km * testEdge.terrainFactor; // 120

    // Weather severity = 0.50 -> weatherMultiplier = 1 + (0.50)^2 * 8 = 1 + 2 = 3.0
    const weatherSeverityByNode = { guwahati: 0.50, nagaon: 0.50 };
    // Moderate incident -> disruptionMultiplier = 5.0
    const disruptions = [{ road: 'NH27', severity: 'moderate' }];

    const calc = edgeWeight(testEdge, { weatherSeverityByNode, disruptions });
    const expectedWeight = baseWeight * 3.0 * 5.0; // 120 * 15 = 1800

    const passed = (
      calc.weatherSeverity === 0.50 &&
      calc.disruptionMultiplier === 5.0 &&
      Math.abs(calc.weight - expectedWeight) < 0.001 &&
      !calc.blocked
    );
    report('Adverse weather (3.0x) and field disruption (5.0x) compound cleanly to 15.0x without data loss', passed,
      `weight=${calc.weight}, expected=${expectedWeight}`);
  } catch (err) {
    report('Weather + incident coexistence', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 14: Multimodal routing regression check
  // -------------------------------------------------------------------------
  console.log('\n14. Multimodal Routing Regression Check under Disruption:');
  try {
    // Severe disruption on NH27 between Guwahati and Nagaon
    const disruptions = [{ road: 'NH27', severity: 'severe' }];
    const weatherSeverityByNode = {};

    const roadRoute = findRoute('guwahati', 'dimapur', { disruptions, weatherSeverityByNode, mode: 'road' });
    const railRoute = findRoute('guwahati', 'dimapur', { disruptions, weatherSeverityByNode, mode: 'railway' });
    const airRoute = findRoute('guwahati', 'dimapur', { disruptions, weatherSeverityByNode, mode: 'air' });

    // Score candidates
    const scored = scoreAndRecommendRoutes({
      road: roadRoute,
      railway: railRoute,
      air: airRoute
    }, { priority: 'Normal', cargoType: 'General Cargo' });

    const passed = (
      roadRoute.safetyIndex <= 55 &&
      railRoute.safetyIndex >= 90 &&
      airRoute.safetyIndex >= 95 &&
      scored.recommendedMode !== 'road' &&
      scored.rankings[0].rank === 1 &&
      scored.rankings.length === 3
    );
    report('Road hazard lowers road safety but does not affect Rail/Air; recommendation shifts away from road', passed,
      `roadSafety=${roadRoute.safetyIndex}%, railSafety=${railRoute.safetyIndex}%, recommended=${scored.recommendedMode}`);
  } catch (err) {
    report('Multimodal regression check', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`PHASE 1 TEST SUMMARY: ${passCount}/${passCount + failCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
