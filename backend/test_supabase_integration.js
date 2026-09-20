const http = require('http');
const assert = require('assert');

const BASE_URL = 'http://localhost:4000/api';

function request(path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING NER-SAHAYAK INTEGRATION & REGRESSION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] ${name} -> ${e.message}`);
      failed++;
    }
  }

  // 1. Health check
  await test('0. Health Check Endpoint', async () => {
    const res = await request('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
  });

  // 2. Driver Login
  let driverToken, driverUser;
  await test('1. Driver Login (arjun@ner-sahayak.in)', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { email: 'arjun@ner-sahayak.in', password: 'sahayak123' },
    });
    assert.strictEqual(res.status, 200, `Expected 200 got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.token, 'Token must be returned');
    assert.strictEqual(res.body.user.role, 'driver');
    assert.strictEqual(res.body.user.email, 'arjun@ner-sahayak.in');
    driverToken = res.body.token;
    driverUser = res.body.user;
  });

  // 3. Field Officer Login
  let fieldToken, fieldUser;
  await test('2. Field Officer Login (priya@ner-sahayak.in)', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { email: 'priya@ner-sahayak.in', password: 'sahayak123' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.role, 'field');
    fieldToken = res.body.token;
    fieldUser = res.body.user;
  });

  // 4. Logistics Login
  let logisticsToken, logisticsUser;
  await test('3. Logistics Operator Login (rohan@ner-sahayak.in)', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { email: 'rohan@ner-sahayak.in', password: 'sahayak123' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.role, 'logistics');
    logisticsToken = res.body.token;
    logisticsUser = res.body.user;
  });

  // 5. Official Login
  let officialToken, officialUser;
  await test('4. Official Login (ananya@ner-sahayak.in)', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { email: 'ananya@ner-sahayak.in', password: 'sahayak123' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.user.role, 'official');
    officialToken = res.body.token;
    officialUser = res.body.user;
  });

  // 6. User Directory & Verify Driver Count
  await test('5. Official User Directory & Verify Exactly 10 Drivers', async () => {
    const res = await request('/users', { token: officialToken });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.users));
    const drivers = res.body.users.filter(u => u.role === 'driver');
    assert.strictEqual(drivers.length, 10, `Expected 10 drivers, got ${drivers.length}`);
    console.log(`       Verified ${drivers.length} drivers, ${res.body.users.length} total users.`);
  });

  // 7. Dashboard Summary
  await test('6. Dashboard Summary (/api/dashboard/summary)', async () => {
    const res = await request('/dashboard/summary', { token: officialToken });
    assert.strictEqual(res.status, 200);
    assert(typeof res.body.openFieldReports === 'number');
    assert(typeof res.body.activeVehicles === 'number');
    assert(typeof res.body.regionAccessCoveragePct === 'number');
    assert(Array.isArray(res.body.districtConnectivity));
    assert(Array.isArray(res.body.logisticsBottlenecks));
  });

  // 8. Alerts GET and POST
  let createdAlertId;
  await test('7. Alerts GET & POST (/api/alerts)', async () => {
    const getRes = await request('/alerts', { token: driverToken });
    assert.strictEqual(getRes.status, 200);
    assert(Array.isArray(getRes.body.alerts));

    const postRes = await request('/alerts', {
      method: 'POST',
      token: officialToken,
      body: {
        type: 'Weather warning',
        tone: 'amber',
        icon: 'cloud',
        title: 'Integration Test Monsoon Alert',
        text: 'Temporary flash flood advisory.',
        nodeId: 'nagaon',
        road: 'NH27',
        severity: 'moderate',
      },
    });
    assert.strictEqual(postRes.status, 201);
    assert(postRes.body.alert.id);
    createdAlertId = postRes.body.alert.id;
  });

  // 9. Field Reports / Incident Creation & Status Update
  let testIncidentId;
  await test('8. Incident Creation & Lifecycle Update (/api/reports)', async () => {
    const createRes = await request('/reports', {
      method: 'POST',
      token: fieldToken,
      body: {
        title: 'Test Fallen Tree on NH27',
        description: 'Single lane obstructed by eucalyptus branch.',
        category: 'road_block',
        severity: 'minor',
        nodeId: 'nagaon',
        road: 'NH27',
        lat: 26.25,
        lng: 92.50,
      },
    });
    assert.strictEqual(createRes.status, 201);
    assert(createRes.body.report.id);
    testIncidentId = createRes.body.report.id;

    // Status update
    const updateRes = await request(`/reports/${testIncidentId}/status`, {
      method: 'PATCH',
      token: fieldToken,
      body: { status: 'resolved', comment: 'Branch cut and cleared from roadway.' },
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.report.status, 'resolved');
  });

  // 10. Vehicles List & GPS Ping
  let testVehicleId;
  await test('9. Vehicle List & GPS Ping (/api/vehicles)', async () => {
    const listRes = await request('/vehicles', { token: officialToken });
    assert.strictEqual(listRes.status, 200);
    assert(Array.isArray(listRes.body.vehicles));
    assert(listRes.body.vehicles.length > 0);
    testVehicleId = listRes.body.vehicles[0].id;

    const pingRes = await request(`/vehicles/${testVehicleId}/ping`, {
      method: 'POST',
      token: officialToken,
      body: { lat: 26.15, lng: 91.75, status: 'in_transit' },
    });
    assert.strictEqual(pingRes.status, 200);
    assert.strictEqual(pingRes.body.vehicle.lat, 26.15);
  });

  // 11. Shipments List, Creation & Driver Assignment
  let testShipmentId;
  await test('10. Shipments Management (/api/shipments)', async () => {
    const listRes = await request('/shipments', { token: logisticsToken });
    assert.strictEqual(listRes.status, 200);
    assert(Array.isArray(listRes.body.shipments));

    const createRes = await request('/shipments', {
      method: 'POST',
      token: logisticsToken,
      body: {
        originNode: 'guwahati',
        destinationNode: 'jorhat',
        cargoType: 'Pharmaceutical',
        priority: 'urgent',
      },
    });
    assert.strictEqual(createRes.status, 201);
    assert(createRes.body.shipment.id);
    testShipmentId = createRes.body.shipment.id;

    const assignRes = await request(`/shipments/${testShipmentId}/assign`, {
      method: 'PATCH',
      token: logisticsToken,
      body: { driverId: driverUser.id },
    });
    assert.strictEqual(assignRes.status, 200);
    assert.strictEqual(assignRes.body.shipment.driverId, driverUser.id);
    assert.strictEqual(assignRes.body.shipment.status, 'assigned');
  });

  // 12. Multimodal Routing Engine
  await test('11. Multimodal Route Planning (/api/network/route)', async () => {
    const roadRes = await request('/network/route', {
      method: 'POST',
      token: driverToken,
      body: { originId: 'guwahati', destinationId: 'jorhat', mode: 'road' },
    });
    assert.strictEqual(roadRes.status, 200);
    assert(roadRes.body.recommended.totalKm > 0);
    assert(roadRes.body.recommended.safetyIndex > 0);

    const railRes = await request('/network/route', {
      method: 'POST',
      token: driverToken,
      body: { originId: 'guwahati', destinationId: 'dibrugarh', mode: 'railway' },
    });
    assert.strictEqual(railRes.status, 200);
    assert(railRes.body.recommended.edges.some(e => e.mode === 'railway'));

    const waterRes = await request('/network/route', {
      method: 'POST',
      token: driverToken,
      body: { originId: 'guwahati', destinationId: 'tezpur', mode: 'waterway' },
    });
    assert.strictEqual(waterRes.status, 200);
    assert(waterRes.body.recommended.edges.some(e => e.mode === 'waterway'));

    const airRes = await request('/network/route', {
      method: 'POST',
      token: driverToken,
      body: { originId: 'guwahati', destinationId: 'imphal', mode: 'air' },
    });
    assert.strictEqual(airRes.status, 200);
    assert(airRes.body.recommended.edges.some(e => e.mode === 'air'));
  });

  // 13. Multimodal Comparator
  await test('12. Cargo Intelligence & Multimodal Comparator (/api/network/compare)', async () => {
    const compRes = await request('/network/compare', {
      method: 'POST',
      token: logisticsToken,
      body: {
        originId: 'guwahati',
        destinationId: 'imphal',
        cargoType: 'Emergency Supplies',
        priority: 'Emergency',
        emergencyMode: true,
      },
    });
    assert.strictEqual(compRes.status, 200);
    assert(compRes.body.recommendation.mode);
    assert(compRes.body.routes.air || compRes.body.routes.road);
  });

  // 14. Weather API
  await test('13. Weather Service (/api/weather/all)', async () => {
    const res = await request('/weather/all', { token: driverToken });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.nodes));
    assert(res.body.nodes.length > 0);
  });

  // 15. Ask Sahayak
  await test('14. Ask Sahayak AI Assistant (/api/ask)', async () => {
    const res = await request('/ask', {
      method: 'POST',
      token: driverToken,
      body: { query: 'What is the safest route from Guwahati to Jorhat?' },
    });
    assert.strictEqual(res.status, 200);
    assert(res.body.answer);
  });

  // 16. Profile & Settings
  await test('15. Profile Details & Language Setting (/api/auth/me)', async () => {
    const meRes = await request('/auth/me', { token: driverToken });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.email, 'arjun@ner-sahayak.in');

    const patchRes = await request('/auth/me', {
      method: 'PATCH',
      token: driverToken,
      body: { language: 'hi' },
    });
    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(patchRes.body.user.language, 'hi');
  });

  // 17. i18n
  await test('16. Multilingual Strings (/api/i18n)', async () => {
    const langRes = await request('/i18n/languages', { token: driverToken });
    assert.strictEqual(langRes.status, 200);
    assert.strictEqual(langRes.body.languages.length, 8);

    const strRes = await request('/i18n/strings/hi', { token: driverToken });
    assert.strictEqual(strRes.status, 200);
    assert(strRes.body.strings.weather_watch);
  });

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests();
