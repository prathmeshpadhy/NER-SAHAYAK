/**
 * NER-SAHAYAK — PHASE 7: PRODUCTION HARDENING & RELIABILITY TEST SUITE
 *
 * Verifies:
 * 1. Health endpoint and secret non-leakage
 * 2. Security headers (noSniff, frameOptions, safe CSP)
 * 3. CORS origin enforcement (authorized vs unauthorized)
 * 4. Authentication & JWT verification
 * 5. Route-by-route authorization matrix (Authorized vs Unauthorized)
 * 6. Ownership scoping (Vehicles, Shipments, Reports)
 * 7. Input validation (Coordinates bounds, Enums, ClientId, Photos)
 * 8. SQL injection and path traversal neutralization
 * 9. Rate limiting (429 and Retry-After)
 * 10. External service graceful degradation (Weather, Supabase, AI)
 * 11. Offline queue sync idempotency
 */

const assert = require('assert');
const http = require('http');
const { Duplex } = require('stream');
const jwt = require('jsonwebtoken');
const app = require('./server');
const db = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const { authLimiter, mutationLimiter } = require('./middleware/rateLimiter');
const supabaseService = require('./services/supabaseService');
const { fetchNodeWeather } = require('./routes/weather');
const { NODES } = require('./data/nerNetwork');

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
 * In-memory invocation of Express app with header and response inspection.
 */
function invokeApp(expressApp, method, url, { token, body, headers = {}, remoteIp = '127.0.0.1' } = {}) {
  return new Promise((resolve) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : null;
    const socket = new Duplex({ read() {}, write(chunk, enc, cb) { cb(); } });
    socket.remoteAddress = remoteIp;

    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = {
      'content-type': 'application/json',
      ...(bodyStr ? { 'content-length': String(Buffer.byteLength(bodyStr)) } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    };

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
      const resHeaders = res.getHeaders ? res.getHeaders() : {};
      resolve({
        status: res.statusCode || 200,
        headers: resHeaders,
        body: json !== null ? json : text,
      });
    };

    expressApp.handle(req, res);

    if (bodyStr) {
      req.push(bodyStr);
    }
    req.push(null);
  });
}

async function runHardeningTests() {
  console.log('======================================================================');
  console.log('NER-SAHAYAK: PHASE 7 PRODUCTION HARDENING & SECURITY TEST SUITE');
  console.log('Security Headers, CORS, Auth Matrix, Scoping, Validation & Resilience');
  console.log('======================================================================\n');

  // Reset rate limiters before testing
  authLimiter.reset();
  mutationLimiter.reset();

  // Test Tokens for each persona
  const officialToken = jwt.sign(
    { id: 'usr-p7-official', email: 'ananya@ner-sahayak.in', role: 'official', name: 'Ananya Gogoi' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const logisticsToken = jwt.sign(
    { id: 'usr-p7-logistics', email: 'rohan@ner-sahayak.in', role: 'logistics', name: 'Rohan Sharma' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const fieldToken = jwt.sign(
    { id: 'usr-p7-field', email: 'priya@ner-sahayak.in', role: 'field', name: 'Priya Deka' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const driverToken1 = jwt.sign(
    { id: 'usr-p7-driver1', email: 'arjun@ner-sahayak.in', role: 'driver', name: 'Arjun Bora' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const driverToken2 = jwt.sign(
    { id: 'usr-p7-driver2', email: 'bikram@ner-sahayak.in', role: 'driver', name: 'Bikram Das' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // -------------------------------------------------------------------------
  // 1. Health Endpoint & Secret Protection
  // -------------------------------------------------------------------------
  await test('Health endpoint returns 200 with structured service statuses', async () => {
    const res = await invokeApp(app, 'GET', '/api/health');
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.status, 'healthy');
    assert.strictEqual(res.body.service, 'ner-sahayak-backend');
    assert.strictEqual(res.body.database.status, 'connected');
    assert(res.body.services, 'Missing services status block');
  });

  await test('Health endpoint strictly does not expose any credentials or secrets', async () => {
    const res = await invokeApp(app, 'GET', '/api/health');
    const jsonStr = JSON.stringify(res.body);
    assert(!jsonStr.includes(JWT_SECRET), 'JWT_SECRET leaked in health endpoint');
    assert(!jsonStr.includes('password'), 'Password key leaked in health endpoint');
    assert(!jsonStr.includes('service_role'), 'Service role leaked in health endpoint');
    assert(!jsonStr.includes('apiKey'), 'apiKey leaked in health endpoint');
    assert(!jsonStr.includes('privateKey'), 'privateKey leaked in health endpoint');
    assert(!jsonStr.includes('SECRET'), 'Secret property leaked in health endpoint');
    if (process.env.OPENWEATHER_API_KEY) {
      assert(!jsonStr.includes(process.env.OPENWEATHER_API_KEY), 'OpenWeather key leaked in health endpoint');
    }
  });

  // -------------------------------------------------------------------------
  // 2. Security Headers & Safe CSP
  // -------------------------------------------------------------------------
  await test('Security headers are injected on API responses (noSniff, frameOptions)', async () => {
    const res = await invokeApp(app, 'GET', '/api/health');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.strictEqual(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });

  await test('Content-Security-Policy permits OpenStreetMap and CartoDB map tiles', async () => {
    const res = await invokeApp(app, 'GET', '/api/health');
    const csp = res.headers['content-security-policy'];
    assert(csp, 'Missing Content-Security-Policy header');
    assert(csp.includes('tile.openstreetmap.org'), 'CSP must permit OpenStreetMap tiles');
    assert(csp.includes('basemaps.cartocdn.com'), 'CSP must permit CartoDB tiles');
    assert(csp.includes("'unsafe-inline'"), 'CSP must allow inline styles for React');
  });

  // -------------------------------------------------------------------------
  // 3. CORS Origin Enforcement
  // -------------------------------------------------------------------------
  await test('CORS allows requests from authorized origins (localhost:3000)', async () => {
    const res = await invokeApp(app, 'GET', '/api/health', {
      headers: { origin: 'http://localhost:3000' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:3000');
  });

  await test('CORS rejects unauthorized origins with 403 Forbidden', async () => {
    const res = await invokeApp(app, 'GET', '/api/health', {
      headers: { origin: 'http://evil-malicious-domain.com' },
    });
    assert.strictEqual(res.status, 403, `Expected 403 for unauthorized origin, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 4. Authentication & JWT Validation
  // -------------------------------------------------------------------------
  await test('Unauthenticated request to protected endpoint returns 401', async () => {
    const res = await invokeApp(app, 'GET', '/api/alerts');
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  await test('Malformed or expired JWT token is rejected with 401', async () => {
    const res = await invokeApp(app, 'GET', '/api/alerts', {
      token: 'invalid.jwt.token.signature',
    });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 5. Authorization Matrix: User Administration
  // -------------------------------------------------------------------------
  await test('Official can access user administration directory (Authorized)', async () => {
    const res = await invokeApp(app, 'GET', '/api/users', { token: officialToken });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.body.users), 'Expected users array');
  });

  await test('Non-official roles cannot access user directory (Unauthorized: 403)', async () => {
    const logRes = await invokeApp(app, 'GET', '/api/users', { token: logisticsToken });
    assert.strictEqual(logRes.status, 403, `Logistics should be 403, got ${logRes.status}`);

    const fieldRes = await invokeApp(app, 'GET', '/api/users', { token: fieldToken });
    assert.strictEqual(fieldRes.status, 403, `Field should be 403, got ${fieldRes.status}`);

    const driverRes = await invokeApp(app, 'GET', '/api/users', { token: driverToken1 });
    assert.strictEqual(driverRes.status, 403, `Driver should be 403, got ${driverRes.status}`);
  });

  await test('Official cannot delete their own account', async () => {
    const res = await invokeApp(app, 'DELETE', '/api/users/usr-p7-official', { token: officialToken });
    assert.strictEqual(res.status, 400, `Expected 400 for self deletion, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 6. Authorization Matrix: Vehicle Registration & Telemetry
  // -------------------------------------------------------------------------
  let registeredVehicleId = null;
  await test('Logistics operator can register a vehicle (Authorized: 201)', async () => {
    const res = await invokeApp(app, 'POST', '/api/vehicles', {
      token: logisticsToken,
      body: {
        vehicleNumber: `AS 01 P ${Date.now().toString().slice(-4)}`,
        cargoType: 'Emergency Food Kits',
        originNode: 'guwahati',
        destinationNode: 'nagaon',
        driverId: 'usr-p7-driver1',
        lat: 26.15,
        lng: 91.75,
      },
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    registeredVehicleId = res.body.vehicle.id;
  });

  await test('Field officer cannot register transport vehicles (Unauthorized: 403)', async () => {
    const res = await invokeApp(app, 'POST', '/api/vehicles', {
      token: fieldToken,
      body: {
        vehicleNumber: 'AS 01 F 9999',
        originNode: 'guwahati',
        destinationNode: 'nagaon',
      },
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
  });

  await test('Assigned driver can update location on their vehicle (Authorized: 200)', async () => {
    assert(registeredVehicleId, 'Missing registeredVehicleId');
    const res = await invokeApp(app, 'POST', `/api/vehicles/${registeredVehicleId}/ping`, {
      token: driverToken1,
      body: {
        lat: 26.22,
        lng: 91.88,
        status: 'in_transit',
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.vehicle.locationSource, 'LIVE_GPS');
  });

  await test('Different driver cannot update location on another driver vehicle (Unauthorized: 403)', async () => {
    assert(registeredVehicleId, 'Missing registeredVehicleId');
    const res = await invokeApp(app, 'POST', `/api/vehicles/${registeredVehicleId}/ping`, {
      token: driverToken2, // Different driver!
      body: {
        lat: 26.33,
        lng: 91.99,
        status: 'in_transit',
      },
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for wrong driver, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 7. Authorization Matrix: Cargo Shipments
  // -------------------------------------------------------------------------
  let plannedShipmentId = null;
  await test('Logistics operator can plan cargo shipment (Authorized: 201)', async () => {
    const res = await invokeApp(app, 'POST', '/api/shipments', {
      token: logisticsToken,
      body: {
        originNode: 'guwahati',
        destinationNode: 'tezpur',
        cargoType: 'Life-saving Medicines',
        priority: 'emergency',
        vehicleId: registeredVehicleId,
      },
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    plannedShipmentId = res.body.shipment.id;
  });

  await test('Driver cannot plan cargo shipments (Unauthorized: 403)', async () => {
    const res = await invokeApp(app, 'POST', '/api/shipments', {
      token: driverToken1,
      body: {
        originNode: 'guwahati',
        destinationNode: 'tezpur',
      },
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
  });

  await test('Logistics operator can assign driver to shipment (Authorized: 200)', async () => {
    assert(plannedShipmentId, 'Missing plannedShipmentId');
    const res = await invokeApp(app, 'PATCH', `/api/shipments/${plannedShipmentId}/assign`, {
      token: logisticsToken,
      body: { driverId: 'usr-p7-driver1' },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
  });

  await test('Driver cannot assign drivers to shipments (Unauthorized: 403)', async () => {
    assert(plannedShipmentId, 'Missing plannedShipmentId');
    const res = await invokeApp(app, 'PATCH', `/api/shipments/${plannedShipmentId}/assign`, {
      token: driverToken1,
      body: { driverId: 'usr-p7-driver2' },
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
  });

  await test('Assigned driver can update shipment status (Authorized: 200)', async () => {
    assert(plannedShipmentId, 'Missing plannedShipmentId');
    const res = await invokeApp(app, 'PATCH', `/api/shipments/${plannedShipmentId}/status`, {
      token: driverToken1,
      body: { status: 'in_transit' },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.shipment.status, 'in_transit');
  });

  await test('Unassigned driver cannot update shipment status (Unauthorized: 403)', async () => {
    assert(plannedShipmentId, 'Missing plannedShipmentId');
    const res = await invokeApp(app, 'PATCH', `/api/shipments/${plannedShipmentId}/status`, {
      token: driverToken2, // Unassigned driver
      body: { status: 'delivered' },
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for unassigned driver, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 8. Authorization Matrix: Field Reports & Incidents
  // -------------------------------------------------------------------------
  let createdReportId = null;
  const uniqueReportTitle = `Flash flood on Diphu approach - ${Date.now()}`;
  await test('Field officer can submit incident report (Authorized: 201)', async () => {
    const res = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: uniqueReportTitle,
        description: 'Road covered with water 1.5 ft high.',
        category: 'flood',
        severity: 'major',
        road: 'NH29',
        fromNode: 'dimapur',
        toNode: 'kohima',
        lat: 25.85,
        lng: 93.82,
      },
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    createdReportId = res.body.report.id;
  });

  await test('Official can update status of any incident report (Authorized: 200)', async () => {
    assert(createdReportId, 'Missing createdReportId');
    const res = await invokeApp(app, 'PATCH', `/api/reports/${createdReportId}/status`, {
      token: officialToken,
      body: { status: 'verified', comment: 'Official verified report via District Administration' },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
  });

  await test('Driver cannot alter report status of another officer report (Unauthorized: 403)', async () => {
    assert(createdReportId, 'Missing createdReportId');
    const res = await invokeApp(app, 'PATCH', `/api/reports/${createdReportId}/status`, {
      token: driverToken1,
      body: { status: 'resolved' },
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 9. Authorization Matrix: Alerts & Disaster Escalations
  // -------------------------------------------------------------------------
  let testAlertId = null;
  await test('Field officer can broadcast operational alert (Authorized: 201)', async () => {
    const res = await invokeApp(app, 'POST', '/api/alerts', {
      token: fieldToken,
      body: {
        type: 'Field report',
        title: 'Debris clearance active on NH29',
        text: 'Single lane traffic allowed under escort.',
        road: 'NH29',
        severity: 'moderate',
      },
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    testAlertId = res.body.alert.id;
  });

  await test('Driver cannot broadcast new network alerts (Unauthorized: 403)', async () => {
    const res = await invokeApp(app, 'POST', '/api/alerts', {
      token: driverToken1,
      body: {
        type: 'Route update',
        title: 'Driver broadcasting alert',
        text: 'Should be rejected.',
      },
    });
    assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
  });

  await test('Logistics operator cannot resolve severe disaster alert (Unauthorized: 403)', async () => {
    // Create critical disaster alert
    const disRes = await invokeApp(app, 'POST', '/api/alerts', {
      token: officialToken,
      body: {
        type: 'Weather watch',
        title: 'Critical Flood Emergency in Cachar',
        text: 'All movement stopped.',
        severity: 'critical',
      },
    });
    const critAlertId = disRes.body.alert.id;

    // Logistics tries to resolve
    const res = await invokeApp(app, 'POST', `/api/alerts/${critAlertId}/respond`, {
      token: logisticsToken,
      body: { actionType: 'RESOLVE', note: 'Attempting resolution' },
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for logistics, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 10. Input Validation & Bounds Enforcement
  // -------------------------------------------------------------------------
  await test('Latitude > 90.0 is rejected with 400 Bad Request', async () => {
    const res = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: 'Invalid lat test',
        road: 'NH27',
        lat: 95.5, // Out of bounds!
        lng: 92.5,
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert(res.body.error.includes('Latitude'), 'Error should specify Latitude');
  });

  await test('Longitude > 180.0 is rejected with 400 Bad Request', async () => {
    const res = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: 'Invalid lng test',
        road: 'NH27',
        lat: 26.5,
        lng: 195.5, // Out of bounds!
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert(res.body.error.includes('Longitude'), 'Error should specify Longitude');
  });

  await test('Non-numeric coordinates rejected with 400 Bad Request', async () => {
    const res = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: 'String lat test',
        road: 'NH27',
        lat: 'corridor-coordinate-abc',
        lng: 92.5,
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await test('Invalid incident category enum rejected with 400 Bad Request', async () => {
    const res = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: 'Invalid category test',
        road: 'NH27',
        category: 'alien_spacecraft_landing',
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await test('Invalid shipment status enum rejected with 400 Bad Request', async () => {
    assert(plannedShipmentId, 'Missing plannedShipmentId');
    const res = await invokeApp(app, 'PATCH', `/api/shipments/${plannedShipmentId}/status`, {
      token: logisticsToken,
      body: { status: 'teleported_to_moon' },
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await test('Malformed clientId with path traversal characters rejected with 400', async () => {
    const res = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: 'Traversal test',
        road: 'NH27',
        clientId: '../../etc/passwd',
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await test('Malformed photo payload (non-image text) rejected with 400 Bad Request', async () => {
    const res = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: 'Bad photo test',
        road: 'NH27',
        photoDataUrl: 'javascript:alert(1)',
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 11. SQL Injection & Path Traversal Neutralization
  // -------------------------------------------------------------------------
  await test('SQL injection in query/parameters safely handled without database corruption', async () => {
    const res = await invokeApp(app, 'GET', "/api/reports/' OR '1'='1", { token: officialToken });
    assert.strictEqual(res.status, 404, `Expected 404 for non-existent injected ID, got ${res.status}`);
    assert(!JSON.stringify(res.body).includes('SQLITE_ERROR'), 'Must not leak SQLite error');
  });

  await test('Path traversal in user/report ID parameter handled safely', async () => {
    const res = await invokeApp(app, 'GET', '/api/reports/..%2F..%2Fetc%2Fpasswd', { token: officialToken });
    assert(res.status === 404 || res.status === 400, `Expected 404/400, got ${res.status}`);
  });

  // -------------------------------------------------------------------------
  // 12. Rate Limiting (Single-Process In-Memory)
  // -------------------------------------------------------------------------
  await test('In-memory rate limiter returns 429 Too Many Requests upon threshold breach', async () => {
    const testLimiter = require('./middleware/rateLimiter').createRateLimiter({
      windowMs: 5000,
      max: 3,
      message: 'Rate limit exceeded in test',
    });

    const mockReq = { ip: '10.0.0.99', headers: {}, socket: {} };
    let wasBlocked = false;
    let retryAfter = null;

    for (let i = 0; i < 4; i++) {
      const mockRes = {
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          if (this.statusCode === 429) {
            wasBlocked = true;
            retryAfter = this.headers['Retry-After'];
          }
        },
      };
      testLimiter(mockReq, mockRes, () => {});
    }

    assert(wasBlocked, '4th request should be rate limited to 429');
    assert(retryAfter !== null, 'Should return Retry-After header');
  });

  // -------------------------------------------------------------------------
  // 13. External Services Resilience & Fallback Integrity
  // -------------------------------------------------------------------------
  await test('Weather 3-tier fallback provides local deterministic conditions when external is skipped', async () => {
    const node = NODES.find((n) => n.id === 'guwahati');
    const weather = await fetchNodeWeather(node, { skipOpenWeather: true, skipOpenMeteo: true, forceRefresh: true });
    assert(weather, 'Weather fallback should return data');
    assert.strictEqual(weather.isLive, false, 'Fallback must honestly be marked isLive: false');
    assert.strictEqual(weather.source, 'local_deterministic', 'Source must be local_deterministic');
    assert(weather.severity >= 0 && weather.severity <= 1, 'Severity must be bounded [0, 1]');
  });

  await test('Ask Sahayak operates via local engine when no OpenAI key is configured', async () => {
    const res = await invokeApp(app, 'POST', '/api/ask', {
      token: officialToken,
      body: { query: 'What is the route between Guwahati and Nagaon?' },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert(res.body.answer, 'Missing answer in response');
    assert(res.body.mode === 'local_engine' || res.body.mode === 'local_fallback', 'Must use local fallback engine');
  });

  // -------------------------------------------------------------------------
  // 14. Offline Queue Sync Idempotency
  // -------------------------------------------------------------------------
  await test('Offline report sync idempotency rejects duplicate submissions safely', async () => {
    const stableClientId = `phase7-client-rep-${Date.now()}`;
    const reportPayload = {
      clientId: stableClientId,
      title: `Pothole cluster on NH15 - ${stableClientId}`,
      road: 'NH15',
      category: 'poor_road_condition',
      severity: 'minor',
    };

    // First sync
    const firstRes = await invokeApp(app, 'POST', '/api/reports/sync', {
      token: fieldToken,
      body: { reports: [reportPayload] },
    });
    assert.strictEqual(firstRes.status, 201);
    assert.strictEqual(firstRes.body.synced, 1);

    // Second duplicate sync
    const dupRes = await invokeApp(app, 'POST', '/api/reports/sync', {
      token: fieldToken,
      body: { reports: [reportPayload] },
    });
    assert.strictEqual(dupRes.status, 201);
    const incidentRows = db.prepare('SELECT COUNT(*) c FROM field_reports WHERE clientId = ?').get(stableClientId);
    assert.strictEqual(incidentRows.c, 1, 'Database must not duplicate report with same clientId');
  });

  await test('Offline response sync idempotency rejects duplicate submissions safely', async () => {
    const stableRespClientId = `phase7-client-resp-${Date.now()}`;
    assert(testAlertId, 'Missing testAlertId');

    const responsePayload = {
      clientId: stableRespClientId,
      alertId: testAlertId,
      actionType: 'ADD_NOTE',
      note: 'Offline progress check note',
    };

    // First sync
    const firstRes = await invokeApp(app, 'POST', '/api/alerts/sync-responses', {
      token: fieldToken,
      body: { responses: [responsePayload] },
    });
    assert.strictEqual(firstRes.status, 200);

    // Second duplicate sync
    const dupRes = await invokeApp(app, 'POST', '/api/alerts/sync-responses', {
      token: fieldToken,
      body: { responses: [responsePayload] },
    });
    assert.strictEqual(dupRes.status, 200);

    const respRows = db.prepare('SELECT COUNT(*) c FROM alert_responses WHERE clientId = ?').get(stableRespClientId);
    assert.strictEqual(respRows.c, 1, 'Database must not duplicate response with same clientId');
  });

  // -------------------------------------------------------------------------
  // 15. Semantic Check: Alert Lifecycle vs Physical Incident Disruption
  // -------------------------------------------------------------------------
  await test('Semantic Check: Resolving alert with clearHazard: false keeps incident active and corridor disrupted', async () => {
    // 1. Submit new severe incident
    const semRepRes = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        title: `Semantic Rockslide Test - ${Date.now()}`,
        category: 'landslide',
        severity: 'major',
        road: 'NH15',
        fromNode: 'tezpur',
        toNode: 'itanagar',
      },
    });
    assert.strictEqual(semRepRes.status, 201);
    const incidentId = semRepRes.body.report.id;

    // Find auto-generated linked alert
    const alertsRes = await invokeApp(app, 'GET', '/api/alerts', { token: officialToken });
    const linkedAlert = alertsRes.body.alerts.find((a) => a.incidentId === incidentId);
    assert(linkedAlert, 'Linked alert must exist for incident');

    // 2. Official resolves the ALERT, but specifies clearHazard: false (road still physically blocked)
    const resolveAlertRes = await invokeApp(app, 'POST', `/api/alerts/${linkedAlert.id}/respond`, {
      token: officialToken,
      body: {
        actionType: 'RESOLVE',
        clearHazard: false,
        note: 'Response team dispatched and public advisory issued, but clearing machinery still active.',
      },
    });
    assert.strictEqual(resolveAlertRes.status, 200);
    assert.strictEqual(resolveAlertRes.body.alert.responseStatus, 'resolved', 'Alert should be marked resolved');

    // 3. Incident must REMAIN ACTIVE (not resolved)
    const incCheck = await supabaseService.getIncidentById(incidentId);
    assert.notStrictEqual(incCheck.status, 'resolved', 'Incident must remain active when clearHazard is false');

    // 4. Dijkstra must still reflect corridor disruption
    const disruptions = await supabaseService.getActiveDisruptions();
    const isDisrupted = disruptions.some((d) => d.road === 'NH15' && (d.fromNode === 'tezpur' || d.nodeId === 'tezpur'));
    assert.strictEqual(isDisrupted, true, 'Corridor must remain in active disruptions while physical hazard is active');

    // 5. Officially clearing the physical incident now resolves the hazard and clears disruption
    const resolveIncRes = await invokeApp(app, 'PATCH', `/api/reports/${incidentId}/status`, {
      token: officialToken,
      body: { status: 'resolved', comment: 'Physical road clearing verified complete by site engineer.' },
    });
    assert.strictEqual(resolveIncRes.status, 200);
    const postInc = await supabaseService.getIncidentById(incidentId);
    assert.strictEqual(postInc.status, 'resolved');
  });

  console.log('\n======================================================================');
  console.log(`PHASE 7 VERIFICATION SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('======================================================================\n');

  if (passed < total) {
    process.exit(1);
  }
}

runHardeningTests().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
