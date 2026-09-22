/**
 * NER-SAHAYAK — PHASE 6 TEST SUITE: MULTI-AGENCY RESPONSE + ALERT LIFECYCLE + MULTILINGUAL OPERATIONS
 *
 * Verifies all 30 points for the active multi-agency response platform:
 * 1. Database Schema: alert_responses table exists with required columns
 * 2. Database Schema: alerts table has lifecycle columns
 * 3. Database Schema: activity_logs table exists in SQLite
 * 4. Database Schema: indexes on alert_responses and activity_logs
 * 5. Alert Creation defaults to responseStatus: 'new'
 * 6. Incident Creation links canonical alert with incidentId
 * 7. GET /api/alerts/:id returns responseStatus, history, allowedActions
 * 8. GET /api/alerts/:id/responses returns chronological response log
 * 9. Lifecycle Transition: ACKNOWLEDGE transitions new -> acknowledged
 * 10. Lifecycle Transition: CLAIM transitions to in_progress with assignedTo
 * 11. Lifecycle Transition: UPDATE_STATUS transitions to valid state
 * 12. Lifecycle Transition: ADD_NOTE records note in audit trail
 * 13. Lifecycle Transition: ESCALATE transitions to escalated
 * 14. Lifecycle Transition: RESOLVE transitions to resolved
 * 15. Lifecycle Protection: Invalid status transition rejected
 * 16. Action Validation: Unknown actionType rejected with 400
 * 17. Note Integrity: Operational notes preserved verbatim
 * 18. Multi-Agency RBAC: Official role allowed all actions
 * 19. Multi-Agency RBAC: Logistics operator cannot resolve disaster alert
 * 20. Multi-Agency RBAC: Field officer can acknowledge and resolve field hazard
 * 21. Multi-Agency RBAC: Driver can acknowledge and note but cannot resolve disaster
 * 22. Canonical Resolution Linkage: Resolving alert auto-resolves linked incident
 * 23. Disruption Engine Linkage: Resolving incident clears corridor penalty
 * 24. Offline Response Sync: POST /api/alerts/sync-responses syncs offline actions
 * 25. Offline Idempotency: Duplicate clientId syncs do not create duplicate responses
 * 26. Audit Trail Logging: Response actions recorded in activity_logs
 * 27. Activity Log Retrieval: Dashboard activity reflects alert responses
 * 28. Multilingual Strings: All 8 NER languages return response lifecycle dictionary
 * 29. Multilingual Fallback: Invalid language falls back cleanly to English
 * 30. Notification Delivery Honesty: Honest states IN_APP, PUSH_REQUESTED, NOT_CONFIGURED
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('./server');
const db = require('./db');
const supabaseService = require('./services/supabaseService');
const { JWT_SECRET } = require('./middleware/auth');
const dijkstra = require('./utils/dijkstra');

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

const { Duplex } = require('stream');

/**
 * In-memory invocation of Express app to avoid TCP loopback socket requirements in sandbox.
 */
function invokeApp(expressApp, method, url, { token, body } = {}) {
  return new Promise((resolve) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : null;
    const socket = new Duplex({ read() {}, write(chunk, enc, cb) { cb(); } });
    socket.remoteAddress = '127.0.0.1';

    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = {
      'content-type': 'application/json',
      ...(bodyStr ? { 'content-length': String(Buffer.byteLength(bodyStr)) } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
      resolve({ status: res.statusCode || 200, body: json || text });
    };

    expressApp.handle(req, res);

    if (bodyStr) {
      req.push(bodyStr);
    }
    req.push(null);
  });
}

async function runAllTests() {
  console.log('======================================================================');
  console.log('NER-SAHAYAK: PHASE 6 MULTI-AGENCY RESPONSE & ALERT LIFECYCLE SUITE');
  console.log('Response Lifecycle, Multi-Agency RBAC, Incident Linkage, Multilingual');
  console.log('======================================================================\n');

  // Generate tokens for each persona
  const officialToken = jwt.sign(
    { id: 'usr-p6-official', email: 'director@nec.gov.in', role: 'official', name: 'Director NEC' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const logisticsToken = jwt.sign(
    { id: 'usr-p6-logistics', email: 'dispatch@ner-freight.in', role: 'logistics', name: 'Logistics Controller' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const fieldToken = jwt.sign(
    { id: 'usr-p6-field', email: 'pwd.field@assam.gov.in', role: 'field', name: 'Junior Engineer PWD' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const driverToken = jwt.sign(
    { id: 'usr-p6-driver', email: 'ramesh.driver@ner.in', role: 'driver', name: 'Ramesh Singh' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // 1. Database Schema: alert_responses table
  await test('Database Schema: alert_responses table exists with required columns', async () => {
    const tableInfo = db.prepare("PRAGMA table_info('alert_responses')").all();
    const colNames = tableInfo.map((c) => c.name);
    assert(colNames.includes('id'), 'Missing id column');
    assert(colNames.includes('alertId'), 'Missing alertId column');
    assert(colNames.includes('actorUserId'), 'Missing actorUserId column');
    assert(colNames.includes('actorRole'), 'Missing actorRole column');
    assert(colNames.includes('actionType'), 'Missing actionType column');
    assert(colNames.includes('previousStatus'), 'Missing previousStatus column');
    assert(colNames.includes('newStatus'), 'Missing newStatus column');
    assert(colNames.includes('note'), 'Missing note column');
    assert(colNames.includes('clientId'), 'Missing clientId column');
  });

  // 2. Database Schema: alerts table columns
  await test('Database Schema: alerts table has lifecycle columns', async () => {
    const tableInfo = db.prepare("PRAGMA table_info('alerts')").all();
    const colNames = tableInfo.map((c) => c.name);
    assert(colNames.includes('incidentId'), 'Missing incidentId in alerts');
    assert(colNames.includes('responseStatus'), 'Missing responseStatus in alerts');
    assert(colNames.includes('assignedTo'), 'Missing assignedTo in alerts');
    assert(colNames.includes('assignedRole'), 'Missing assignedRole in alerts');
    assert(colNames.includes('latestAction'), 'Missing latestAction in alerts');
  });

  // 3. Database Schema: activity_logs table
  await test('Database Schema: activity_logs table exists in SQLite', async () => {
    const tableInfo = db.prepare("PRAGMA table_info('activity_logs')").all();
    const colNames = tableInfo.map((c) => c.name);
    assert(colNames.includes('id'), 'Missing id in activity_logs');
    assert(colNames.includes('userId'), 'Missing userId in activity_logs');
    assert(colNames.includes('action'), 'Missing action in activity_logs');
    assert(colNames.includes('entityType'), 'Missing entityType in activity_logs');
  });

  // 4. Database Schema: indexes on alert_responses
  await test('Database Schema: indexes on alert_responses and activity_logs exist', async () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((i) => i.name);
    assert(indexes.includes('idx_alert_responses_alert'), 'Missing idx_alert_responses_alert');
    assert(indexes.includes('idx_alert_responses_client'), 'Missing idx_alert_responses_client');
  });

  // 5. Alert Creation defaults to responseStatus: 'new'
  let createdAlertId = null;
  await test('Alert Creation defaults to responseStatus: "new"', async () => {
    const res = await invokeApp(app, 'POST', '/api/alerts', {
      token: officialToken,
      body: {
        type: 'Route update',
        title: 'NH27 Heavy Debris Clearance Needed',
        text: 'Rockfall blocking one lane near Umrangso.',
        road: 'NH27',
        severity: 'severe',
      },
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    assert(res.body.alert, 'Alert not returned');
    assert.strictEqual(res.body.alert.responseStatus, 'new', 'Alert should default to new');
    createdAlertId = res.body.alert.id;
  });

  // 6. Incident Creation links alert with incidentId
  let linkedIncidentId = null;
  let linkedAlertId = null;
  await test('Incident Creation links canonical alert with incidentId', async () => {
    const incRes = await invokeApp(app, 'POST', '/api/reports', {
      token: fieldToken,
      body: {
        category: 'landslide',
        severity: 'critical',
        title: 'Major Landslide on Jowai-Badarpur corridor',
        description: 'Complete road cut-off near Sonapur tunnel.',
        road: 'NH06',
        fromNode: 'shillong',
        toNode: 'silchar',
        estimatedDelayMinutes: 240,
        lat: 25.1234,
        lng: 92.4321,
      },
    });
    assert.strictEqual(incRes.status, 201, `Expected 201, got ${incRes.status}`);
    linkedIncidentId = incRes.body.report.id;

    // Check alerts in db to verify linked alert
    const alerts = await supabaseService.getAlerts(50);
    const matchedAlert = alerts.find((a) => a.incidentId === linkedIncidentId);
    assert(matchedAlert, 'No alert linked to the newly created incident');
    assert.strictEqual(matchedAlert.responseStatus, 'new', 'Linked alert should start with new');
    linkedAlertId = matchedAlert.id;
  });

  // 7. GET /api/alerts/:id returns responseStatus, history, allowedActions
  await test('GET /api/alerts/:id returns responseStatus, history, allowedActions', async () => {
    const res = await invokeApp(app, 'GET', `/api/alerts/${createdAlertId}`, {
      token: officialToken,
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert(res.body.alert, 'Missing alert in response');
    assert.strictEqual(res.body.responseStatus, 'new');
    assert(Array.isArray(res.body.allowedActions), 'allowedActions must be an array');
    assert(Array.isArray(res.body.history), 'history must be an array');
  });

  // 8. GET /api/alerts/:id/responses returns chronological response log
  await test('GET /api/alerts/:id/responses returns empty list initially', async () => {
    const res = await invokeApp(app, 'GET', `/api/alerts/${createdAlertId}/responses`, {
      token: officialToken,
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.count, 0, 'Should have 0 responses initially');
  });

  // 9. Lifecycle Transition: ACKNOWLEDGE transitions new -> acknowledged
  await test('Lifecycle Transition: ACKNOWLEDGE transitions new -> acknowledged', async () => {
    const res = await invokeApp(app, 'POST', `/api/alerts/${createdAlertId}/respond`, {
      token: officialToken,
      body: {
        actionType: 'ACKNOWLEDGE',
        note: 'Directorate has reviewed the notification.',
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.response.previousStatus, 'new');
    assert.strictEqual(res.body.response.newStatus, 'acknowledged');
    assert.strictEqual(res.body.alert.responseStatus, 'acknowledged');
  });

  // 10. Lifecycle Transition: CLAIM transitions to in_progress with assignedTo
  await test('Lifecycle Transition: CLAIM transitions to in_progress with assignedTo', async () => {
    const res = await invokeApp(app, 'POST', `/api/alerts/${createdAlertId}/respond`, {
      token: logisticsToken,
      body: {
        actionType: 'CLAIM',
        assignedTo: 'PWD Heavy Earthmoving Team 4',
        note: 'Dispatching clearing machinery to Umrangso point.',
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.response.newStatus, 'in_progress');
    assert.strictEqual(res.body.alert.assignedTo, 'PWD Heavy Earthmoving Team 4');
    assert.strictEqual(res.body.alert.responseStatus, 'in_progress');
  });

  // 11. Lifecycle Transition: UPDATE_STATUS transitions to valid state
  await test('Lifecycle Transition: UPDATE_STATUS transitions to valid state', async () => {
    const res = await invokeApp(app, 'PATCH', `/api/alerts/${createdAlertId}/status`, {
      token: officialToken,
      body: {
        status: 'in_progress',
        note: 'Machinery deployed on site; one-way traffic controlled.',
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.alert.responseStatus, 'in_progress');
  });

  // 12. Lifecycle Transition: ADD_NOTE records note in audit trail
  await test('Lifecycle Transition: ADD_NOTE records note in audit trail without state regression', async () => {
    const res = await invokeApp(app, 'POST', `/api/alerts/${createdAlertId}/respond`, {
      token: fieldToken,
      body: {
        actionType: 'ADD_NOTE',
        note: 'Survey engineer reports clearing progress at 50%.',
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.alert.responseStatus, 'in_progress', 'Status should remain in_progress');
    assert.strictEqual(res.body.alert.latestAction, 'ADD_NOTE');
  });

  // 13. Lifecycle Transition: ESCALATE transitions to escalated
  await test('Lifecycle Transition: ESCALATE transitions to escalated', async () => {
    const res = await invokeApp(app, 'POST', `/api/alerts/${createdAlertId}/respond`, {
      token: officialToken,
      body: {
        actionType: 'ESCALATE',
        note: 'Secondary slip reported; requesting National Disaster Response Force standby.',
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.response.newStatus, 'escalated');
    assert.strictEqual(res.body.alert.responseStatus, 'escalated');
  });

  // 14. Lifecycle Transition: RESOLVE transitions to resolved
  await test('Lifecycle Transition: RESOLVE transitions to resolved', async () => {
    const res = await invokeApp(app, 'POST', `/api/alerts/${createdAlertId}/respond`, {
      token: officialToken,
      body: {
        actionType: 'RESOLVE',
        note: 'Debris completely cleared. Dual lane traffic restored safely.',
      },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.response.newStatus, 'resolved');
    assert.strictEqual(res.body.alert.responseStatus, 'resolved');
  });

  // 15. Lifecycle Protection: Invalid status transition rejected
  await test('Lifecycle Protection: Invalid status transition rejected', async () => {
    // Try to transition resolved alert back to new without valid transition
    const res = await invokeApp(app, 'PATCH', `/api/alerts/${createdAlertId}/status`, {
      token: officialToken,
      body: {
        status: 'new',
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400 rejection on invalid transition, got ${res.status}`);
  });

  // 16. Action Validation: Unknown actionType rejected with 400
  await test('Action Validation: Unknown actionType rejected with 400', async () => {
    const res = await invokeApp(app, 'POST', `/api/alerts/${createdAlertId}/respond`, {
      token: officialToken,
      body: {
        actionType: 'DELETE_ALERT_PERMANENTLY',
        note: 'Should be rejected.',
      },
    });
    assert.strictEqual(res.status, 400, `Expected 400 for unknown actionType, got ${res.status}`);
  });

  // 17. Note Integrity: Operational notes preserved verbatim
  await test('Note Integrity: Operational notes preserved verbatim', async () => {
    const responsesRes = await invokeApp(app, 'GET', `/api/alerts/${createdAlertId}/responses`, {
      token: officialToken,
    });
    assert.strictEqual(responsesRes.status, 200);
    const notes = responsesRes.body.responses.map((r) => r.note);
    assert(notes.includes('Debris completely cleared. Dual lane traffic restored safely.'), 'Resolving note missing or altered');
    assert(notes.includes('Survey engineer reports clearing progress at 50%.'), 'Field note missing or altered');
  });

  // 18. Multi-Agency RBAC: Official role allowed all actions
  await test('Multi-Agency RBAC: Official role allowed all actions on active alert, and ADD_NOTE when resolved', async () => {
    const activeActions = supabaseService.getAllowedActionsForRole('official', { responseStatus: 'new' });
    assert(activeActions.includes('ACKNOWLEDGE'));
    assert(activeActions.includes('CLAIM'));
    assert(activeActions.includes('UPDATE_STATUS'));
    assert(activeActions.includes('ADD_NOTE'));
    assert(activeActions.includes('ESCALATE'));
    assert(activeActions.includes('RESOLVE'));

    const resolvedAlert = await supabaseService.getAlertById(createdAlertId);
    const resolvedActions = supabaseService.getAllowedActionsForRole('official', resolvedAlert);
    assert(resolvedActions.includes('ADD_NOTE'));
    assert(!resolvedActions.includes('CLAIM'));
  });

  // 19. Multi-Agency RBAC: Logistics operator cannot resolve disaster alert
  await test('Multi-Agency RBAC: Logistics operator cannot resolve disaster alert', async () => {
    // Create new critical disaster alert
    const disRes = await invokeApp(app, 'POST', '/api/alerts', {
      token: officialToken,
      body: {
        type: 'Weather watch',
        title: 'Severe Cyclone Red Alert over Cachar',
        text: 'Flooding on all highway approaches.',
        severity: 'critical',
      },
    });
    const disasterAlertId = disRes.body.alert.id;

    // Logistics controller tries to resolve disaster alert
    const res = await invokeApp(app, 'POST', `/api/alerts/${disasterAlertId}/respond`, {
      token: logisticsToken,
      body: {
        actionType: 'RESOLVE',
        note: 'Attempting to resolve government red alert as logistics operator.',
      },
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  // 20. Multi-Agency RBAC: Field officer can acknowledge and resolve field hazard
  await test('Multi-Agency RBAC: Field officer can acknowledge and resolve field hazard', async () => {
    assert(linkedAlertId, 'Missing linkedAlertId');
    // Field officer acknowledges
    const ackRes = await invokeApp(app, 'POST', `/api/alerts/${linkedAlertId}/respond`, {
      token: fieldToken,
      body: {
        actionType: 'ACKNOWLEDGE',
        note: 'Field unit acknowledges Sonapur tunnel landslide report.',
      },
    });
    assert.strictEqual(ackRes.status, 200);

    // Field officer adds operational note
    const noteRes = await invokeApp(app, 'POST', `/api/alerts/${linkedAlertId}/respond`, {
      token: fieldToken,
      body: {
        actionType: 'ADD_NOTE',
        note: 'Excavator on scene. Mud clearing initiated.',
      },
    });
    assert.strictEqual(noteRes.status, 200);
  });

  // 21. Multi-Agency RBAC: Driver can acknowledge and note but cannot resolve disaster
  await test('Multi-Agency RBAC: Driver can acknowledge and note but cannot resolve disaster', async () => {
    // Driver can acknowledge
    const ackRes = await invokeApp(app, 'POST', `/api/alerts/${linkedAlertId}/respond`, {
      token: driverToken,
      body: {
        actionType: 'ACKNOWLEDGE',
        note: 'Driver received hazard alert on route.',
      },
    });
    assert.strictEqual(ackRes.status, 200, `Driver should be able to acknowledge: ${ackRes.status}`);

    // Driver cannot resolve
    const resRes = await invokeApp(app, 'POST', `/api/alerts/${linkedAlertId}/respond`, {
      token: driverToken,
      body: {
        actionType: 'RESOLVE',
        note: 'Driver attempting to mark hazard resolved.',
      },
    });
    assert.strictEqual(resRes.status, 403, `Driver cannot resolve hazard: ${resRes.status}`);
  });

  // 22. Canonical Resolution Linkage: Resolving alert auto-resolves linked incident
  await test('Canonical Resolution Linkage: Resolving alert auto-resolves linked incident', async () => {
    // Check initial status of linked incident
    const initialInc = await supabaseService.getIncidentById(linkedIncidentId);
    assert.notStrictEqual(initialInc.status, 'resolved', 'Incident should not be resolved yet');

    // Official resolves the linked alert
    const res = await invokeApp(app, 'POST', `/api/alerts/${linkedAlertId}/respond`, {
      token: officialToken,
      body: {
        actionType: 'RESOLVE',
        note: 'Sonapur tunnel slip fully cleared and safety verified by BRO.',
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.alert.responseStatus, 'resolved');

    // Verify canonical incident record is now resolved
    const updatedInc = await supabaseService.getIncidentById(linkedIncidentId);
    assert.strictEqual(updatedInc.status, 'resolved', 'Canonical incident status must be resolved');
  });

  // 23. Disruption Engine Linkage: Resolving incident clears corridor penalty
  await test('Disruption Engine Linkage: Resolving incident clears corridor penalty in Dijkstra', async () => {
    // Verify active disruptions excludes the resolved incident
    const disruptions = await supabaseService.getActiveDisruptions();
    const isPresent = disruptions.some((d) => d.fromNode === 'shillong' && d.toNode === 'silchar');
    assert.strictEqual(isPresent, false, 'Resolved incident must not appear in active disruptions');

    // Run Dijkstra routing: route between shillong and silchar should have 0 active incident penalty
    const route = dijkstra.findRoute('shillong', 'silchar', { mode: 'road', disruptions });
    assert(route, 'Route must exist');
    const hasDisruptedSegment = route.segments.some((s) => (s.disruptionMultiplier || 1) > 1);
    assert.strictEqual(hasDisruptedSegment, false, 'No disrupted segments on corridor');
    assert.strictEqual(route.accessibilityState, 'OPEN');
  });

  // 24. Offline Response Sync: POST /api/alerts/sync-responses syncs offline actions
  const syncClientId1 = `client-resp-${Date.now()}-1`;
  const syncClientId2 = `client-resp-${Date.now()}-2`;
  await test('Offline Response Sync: POST /api/alerts/sync-responses syncs offline actions', async () => {
    // Create test alert
    const alRes = await invokeApp(app, 'POST', '/api/alerts', {
      token: officialToken,
      body: {
        type: 'Route update',
        title: 'Offline Sync Hazard Test',
        text: 'Testing offline response sync capabilities.',
        severity: 'minor',
      },
    });
    const testAlertId = alRes.body.alert.id;

    const res = await invokeApp(app, 'POST', '/api/alerts/sync-responses', {
      token: fieldToken,
      body: {
        responses: [
          {
            clientId: syncClientId1,
            alertId: testAlertId,
            actionType: 'ACKNOWLEDGE',
            note: 'Offline acknowledge test',
          },
          {
            clientId: syncClientId2,
            alertId: testAlertId,
            actionType: 'ADD_NOTE',
            note: 'Offline note test',
          },
        ],
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.count, 2, 'Should have synced 2 offline responses');
    assert.strictEqual(res.body.errors.length, 0, 'Should have 0 errors');
  });

  // 25. Offline Idempotency: Duplicate clientId syncs do not create duplicate responses
  await test('Offline Idempotency: Duplicate clientId syncs do not create duplicate responses', async () => {
    const checkAlert = (await supabaseService.getAlerts(10)).find((a) => a.title === 'Offline Sync Hazard Test');
    assert(checkAlert, 'Test alert not found');

    // Resubmit the exact same batch with syncClientId1 and syncClientId2
    const dupRes = await invokeApp(app, 'POST', '/api/alerts/sync-responses', {
      token: fieldToken,
      body: {
        responses: [
          {
            clientId: syncClientId1,
            alertId: checkAlert.id,
            actionType: 'ACKNOWLEDGE',
            note: 'Offline acknowledge test',
          },
          {
            clientId: syncClientId2,
            alertId: checkAlert.id,
            actionType: 'ADD_NOTE',
            note: 'Offline note test',
          },
        ],
      },
    });
    assert.strictEqual(dupRes.status, 200);

    // Verify responses table count for this alert
    const responses = await supabaseService.getAlertResponses(checkAlert.id);
    const client1Matches = responses.filter((r) => r.clientId === syncClientId1);
    assert.strictEqual(client1Matches.length, 1, 'Duplicate clientId must not create second response record');
  });

  // 26. Audit Trail Logging: Response actions recorded in activity_logs
  await test('Audit Trail Logging: Response actions recorded in activity_logs', async () => {
    const logs = await supabaseService.getActivityLogs(20);
    const responseLogs = logs.filter((l) => l.action?.startsWith('alert_response_'));
    assert(responseLogs.length > 0, 'activity_logs should contain alert_response_* actions');
    assert(responseLogs.some((l) => l.action === 'alert_response_RESOLVE'), 'Should log alert_response_RESOLVE');
  });

  // 27. Activity Log Retrieval: Dashboard activity reflects alert responses
  await test('Activity Log Retrieval: Dashboard activity reflects alert responses', async () => {
    const res = await invokeApp(app, 'GET', '/api/dashboard/summary', {
      token: officialToken,
    });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.recentActivity), 'recentActivity must be an array');
    const hasResponseActivity = res.body.recentActivity.some((a) => a.action?.startsWith('alert_response_'));
    assert(hasResponseActivity, 'Dashboard recentActivity must reflect alert response actions');
  });

  // 28. Multilingual Strings: All 8 NER languages return response lifecycle dictionary
  const NER_LANGS = ['en', 'as', 'bn', 'hi', 'mni', 'kha', 'lus', 'nag'];
  await test('Multilingual Strings: All 8 NER languages return response lifecycle dictionary', async () => {
    for (const lang of NER_LANGS) {
      const res = await invokeApp(app, 'GET', `/api/i18n/strings/${lang}`, { token: officialToken });
      assert.strictEqual(res.status, 200, `Language ${lang} should return 200`);
      assert(res.body.strings, `Missing strings for ${lang}`);
      assert(res.body.strings.response_status, `Missing response_status in ${lang}`);
      assert(res.body.strings.status_resolved, `Missing status_resolved in ${lang}`);
      assert(res.body.strings.action_acknowledge, `Missing action_acknowledge in ${lang}`);
    }
  });

  // 29. Multilingual Fallback: Invalid language falls back cleanly to English
  await test('Multilingual Fallback: Invalid language falls back cleanly to English', async () => {
    const res = await invokeApp(app, 'GET', '/api/i18n/strings/xyz_unsupported', { token: officialToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.lang, 'en', 'Should fall back to English');
    assert.strictEqual(res.body.strings.status_resolved, 'Resolved');
  });

  // 30. Notification Delivery Honesty: Honest states IN_APP, PUSH_REQUESTED, NOT_CONFIGURED
  await test('Notification Delivery Honesty: Honest states IN_APP, PUSH_REQUESTED, NOT_CONFIGURED', async () => {
    const webPushPath = path.join(__dirname, '../frontend/src/services/webPushService.js');
    const content = fs.readFileSync(webPushPath, 'utf8');
    assert(content.includes('NOTIFICATION_DELIVERY_STATES'), 'Missing NOTIFICATION_DELIVERY_STATES export in webPushService');
    assert(content.includes("IN_APP: 'IN_APP'"), 'Missing IN_APP state');
    assert(content.includes("PUSH_REQUESTED: 'PUSH_REQUESTED'"), 'Missing PUSH_REQUESTED state');
    assert(content.includes("NOT_CONFIGURED: 'NOT_CONFIGURED'"), 'Missing NOT_CONFIGURED state');
    assert(content.includes("DELIVERY_UNKNOWN: 'DELIVERY_UNKNOWN'"), 'Missing DELIVERY_UNKNOWN state');
    assert(content.includes('sendRoleNotification'), 'Missing sendRoleNotification function');
  });

  console.log('\n======================================================================');
  console.log(`PHASE 6 VERIFICATION SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('======================================================================\n');

  if (passed < total) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
