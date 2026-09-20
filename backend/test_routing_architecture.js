const assert = require('assert');
const { findRoute } = require('./utils/dijkstra');
const { scoreAndRecommendRoutes } = require('./utils/routeScorer');
const { NODES, EDGES } = require('./data/nerNetwork');

console.log('====================================================');
console.log('NER-SAHAYAK — ROUTING ARCHITECTURE & SCORING TESTS');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// -------------------------------------------------------------------
// 1. Centralized Recommendation Scoring Tests
// -------------------------------------------------------------------
console.log('1. Centralized Recommendation Scoring & Weights:');

test('Air route wins under normal priority when Road is severely slow and hazardous', () => {
  const mockRoutes = {
    road: { totalKm: 408, etaMinutes: 1216, safetyIndex: 36, transfers: [] },
    railway: { totalKm: 305, etaMinutes: 677, safetyIndex: 15, transfers: [{ at: 'guwahati' }, { at: 'agartala' }] },
    waterway: { totalKm: 400, etaMinutes: 1525, safetyIndex: 36, transfers: [{ at: 'pandu' }] },
    air: { totalKm: 520, etaMinutes: 269, safetyIndex: 96, transfers: [{ at: 'gau_airport' }, { at: 'ixa_airport' }] }
  };
  const res = scoreAndRecommendRoutes(mockRoutes, { priority: 'Normal', cargoType: 'General Cargo' });
  assert.strictEqual(res.recommendedMode, 'air', 'Air should be recommended given 4h 29m vs 20h 16m and 96% vs 36% safety');
  assert(res.score > 60, 'Score should be high');
});

test('Rail wins for Heavy Cargo over long distances when Rail is safe', () => {
  const mockRoutes = {
    road: { totalKm: 550, etaMinutes: 780, safetyIndex: 82, transfers: [] },
    railway: { totalKm: 520, etaMinutes: 600, safetyIndex: 90, transfers: [{ at: 'guwahati' }] },
    air: { totalKm: 480, etaMinutes: 240, safetyIndex: 98, transfers: [{ at: 'airport1' }, { at: 'airport2' }] }
  };
  const res = scoreAndRecommendRoutes(mockRoutes, { priority: 'Normal', cargoType: 'Heavy Cargo', weight: 8000 });
  assert.strictEqual(res.recommendedMode, 'railway', 'Rail should be prioritized for heavy freight over air due to bulk capacity');
});

test('Air wins decisively under Emergency Priority', () => {
  const mockRoutes = {
    road: { totalKm: 300, etaMinutes: 450, safetyIndex: 88, transfers: [] },
    air: { totalKm: 320, etaMinutes: 90, safetyIndex: 94, transfers: [{ at: 'a1' }, { at: 'a2' }] }
  };
  const res = scoreAndRecommendRoutes(mockRoutes, { priority: 'Emergency', cargoType: 'Emergency Supplies' });
  assert.strictEqual(res.recommendedMode, 'air', 'Emergency priority must favor fastest available mode');
});

test('Normalization handles single available route gracefully without NaN', () => {
  const mockRoutes = {
    road: { totalKm: 150, etaMinutes: 200, safetyIndex: 92, transfers: [] }
  };
  const res = scoreAndRecommendRoutes(mockRoutes, { priority: 'Normal' });
  assert.strictEqual(res.recommendedMode, 'road');
  assert(!isNaN(res.score));
});

// -------------------------------------------------------------------
// 2. Multimodal Segments and Transfer Points
// -------------------------------------------------------------------
console.log('\n2. Multimodal Segments & Transfer Detection:');

test('Guwahati to Agartala Air route correctly contains Road -> Air -> Road transfer segments', () => {
  const route = findRoute('guwahati', 'agartala', { mode: 'air' });
  assert(route, 'Air route must exist between Guwahati and Agartala');
  assert(route.segments && route.segments.length >= 3, 'Must have at least 3 segments (road, air, road)');
  assert(route.transfers && route.transfers.length >= 2, 'Must have at least 2 transfers (road->air and air->road)');
  
  const modes = route.segments.map(s => s.mode);
  assert(modes.includes('air'), 'Must include air segment');
  assert(modes.includes('road'), 'Must include road access segments');
  assert.strictEqual(route.modeLabel, 'AIR + ROAD');
});

test('Guwahati to Dibrugarh Rail route correctly contains Rail mode segment', () => {
  const route = findRoute('guwahati', 'dibrugarh', { mode: 'railway' });
  assert(route, 'Railway route must exist');
  assert(route.segments.some(s => s.mode === 'railway'), 'Must have railway segment');
  assert.strictEqual(route.modeLabel, 'RAIL + ROAD');
});

test('Guwahati to Tezpur Waterway route correctly contains Waterway mode segment', () => {
  const route = findRoute('guwahati', 'tezpur', { mode: 'waterway' });
  assert(route, 'Waterway route must exist');
  assert(route.segments.some(s => s.mode === 'waterway'), 'Must have waterway segment');
  assert.strictEqual(route.modeLabel, 'WATERWAY + ROAD');
});

// -------------------------------------------------------------------
// 3. Safety Aggregation & Disruption Impact
// -------------------------------------------------------------------
console.log('\n3. Safety Aggregation & Incident Sensitivity:');

test('Clear route with no disruptions has high safety index (>= 90%)', () => {
  const route = findRoute('guwahati', 'tezpur', { mode: 'road', disruptions: [] });
  assert(route, 'Road route exists');
  assert(route.safetyIndex >= 90, `Safety should be >= 90%, was ${route.safetyIndex}%`);
});

test('Active severe disruption on corridor significantly lowers safety index', () => {
  const clearRoute = findRoute('guwahati', 'nagaon', { mode: 'road', disruptions: [] });
  const disruptedRoute = findRoute('guwahati', 'nagaon', { 
    mode: 'road', 
    disruptions: [{ road: 'NH27', fromNode: 'guwahati', toNode: 'nagaon', severity: 'severe' }] 
  });
  
  assert(clearRoute, 'Clear route exists');
  assert(disruptedRoute, 'Disrupted route exists (or bypass)');
  assert(disruptedRoute.safetyIndex < clearRoute.safetyIndex, 
    `Disrupted safety (${disruptedRoute.safetyIndex}%) must be lower than clear safety (${clearRoute.safetyIndex}%)`);
  assert(disruptedRoute.safetyIndex <= 55, `Severe disruption should cap safety <= 55%`);
});

test('Road disruption on NH27 does not crush railway line safety', () => {
  const railRoute = findRoute('guwahati', 'nagaon', {
    mode: 'railway',
    disruptions: [{ road: 'NH27', fromNode: 'guwahati', toNode: 'nagaon', severity: 'severe' }]
  });
  assert(railRoute, 'Rail route exists');
  assert(railRoute.safetyIndex >= 80, `Rail safety should not be crushed by road NH27 incident, got ${railRoute.safetyIndex}%`);
});

// -------------------------------------------------------------------
// 4. Testing 10 Mandatory NER Corridors
// -------------------------------------------------------------------
console.log('\n4. Mandatory 10 NER Corridor Tests:');

const mandatoryDestinations = [
  'tezpur',
  'jorhat',
  'dibrugarh',
  'shillong',
  'agartala',
  'imphal',
  'aizawl',
  'dimapur',
  'itanagar',
  'gangtok'
];

mandatoryDestinations.forEach((dest, i) => {
  test(`Corridor ${i + 1}: Guwahati → ${dest.toUpperCase()}`, () => {
    const road = findRoute('guwahati', dest, { mode: 'road' });
    assert(road, `Road route must exist from guwahati to ${dest}`);
    assert(road.totalKm > 0, 'Total km must be > 0');
    assert(road.etaMinutes > 0, 'ETA minutes must be > 0');
    assert(road.safetyIndex >= 15 && road.safetyIndex <= 100, 'Safety index within 15-100');

    // Attempt multimodal options
    const railway = findRoute('guwahati', dest, { mode: 'railway' });
    const waterway = findRoute('guwahati', dest, { mode: 'waterway' });
    const air = findRoute('guwahati', dest, { mode: 'air' });

    const routes = { road, railway, waterway, air };
    const rec = scoreAndRecommendRoutes(routes, { priority: 'Normal' });

    assert(rec, 'Must produce a recommendation');
    assert(rec.recommendedMode, 'Must specify recommendedMode');
    assert(rec.score >= 10 && rec.score <= 100, 'Score must be 10-100');
    assert(rec.recommendationReason.length > 10, 'Must provide an explanation');
  });
});

console.log('\n====================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) process.exit(1);
