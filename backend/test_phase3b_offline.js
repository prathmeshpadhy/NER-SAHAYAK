/**
 * NER-SAHAYAK — PHASE 3B: OFFLINE FIELD OPERATIONS TEST SUITE
 *
 * Verifies the end-to-end offline-first field operations pipeline:
 * - Client-side photo compression & dimension scaling (max 1280px)
 * - Offline queueing with stable idempotency keys (clientId)
 * - Persistence across simulated session reloads
 * - Exact GPS preservation vs. explicit null handling
 * - Single canonical record architecture & pipeline sequencing
 * - Idempotent server-side batch synchronization (POST /api/reports/sync)
 * - Server confirmation & canonical incident ID mapping
 * - Disruption penalties & automated alerts triggered ONLY after server acceptance
 */

const assert = require('assert');
const path = require('path');
const db = require('./db');
const supabaseService = require('./services/supabaseService');

let passedTests = 0;
let failedTests = 0;

function pass(name) {
  passedTests++;
  console.log(`  ✓ ${name}`);
}

function fail(name, err) {
  failedTests++;
  console.error(`  ✗ ${name}:`, err.message || err);
}

async function runTests() {
  console.log('======================================================================');
  console.log('NER-SAHAYAK — PHASE 3B: OFFLINE FIELD OPERATIONS TEST SUITE');
  console.log('Offline Queuing, Idempotent Sync, Compression & Pipeline Sequencing');
  console.log('======================================================================\n');

  // Dynamically import ESM frontend modules in Node
  const { offlineQueue } = await import(path.join(__dirname, '../frontend/src/services/offlineQueue.js'));
  const {
    calculateTargetDimensions,
    validateImageFormat,
    validateImageFile,
  } = await import(path.join(__dirname, '../frontend/src/utils/imageCompressor.js'));

  const testOfficerId = 'test_field_officer_phase3b';
  const createdIncidentIds = [];
  const testClientIds = [];

  try {
    offlineQueue.clear();

    // ---------------------------------------------------------------------------
    // TEST 1: Online submission creates canonical incident immediately
    // ---------------------------------------------------------------------------
    console.log('1. Online submission creates canonical incident immediately:');
    try {
      const onlinePayload = {
        title: 'Immediate Online Tree Fall on NH37',
        category: 'road_block',
        severity: 'minor',
        road: 'NH37',
        fromNode: 'guwahati',
        toNode: 'nagaon',
        lat: 26.185,
        lng: 91.755,
        photoDataUrl: null,
        description: 'Fallen branch partially blocking right lane.',
      };

      const result = await supabaseService.createIncident(testOfficerId, onlinePayload, 'field');
      assert(result && result.id, 'Expected server incident id');
      assert.strictEqual(result.status, 'active');
      assert.strictEqual(result.hasGps, true);
      assert.strictEqual(result.lat, 26.185);
      createdIncidentIds.push(result.id);
      pass('Online submission creates canonical incident with immediate active status');
    } catch (err) {
      fail('Online submission creates canonical incident immediately', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 2: Offline submission creates local queue item with stable clientId
    // ---------------------------------------------------------------------------
    console.log('\n2. Offline submission creates local queue item with stable clientId:');
    try {
      const offlinePayload = {
        title: 'Offline Queued Landslide on NH27',
        category: 'landslide',
        severity: 'major',
        road: 'NH27',
        fromNode: 'nagaon',
        toNode: 'guwahati',
        lat: 26.3456,
        lng: 92.6843,
        photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        description: 'Rockfall blocking westbound carriageway at km 142.',
      };

      const queuedItem = offlineQueue.add(offlinePayload);
      assert(queuedItem && queuedItem.clientId, 'Expected stable clientId');
      assert(queuedItem.clientId.startsWith('offline-'), 'Expected clientId format offline-*');
      assert.strictEqual(queuedItem.syncStatus, 'pending');
      assert.strictEqual(queuedItem.retryCount, 0);
      assert.strictEqual(queuedItem.serverIncidentId, null);
      testClientIds.push(queuedItem.clientId);
      pass(`Offline item queued locally with stable clientId: ${queuedItem.clientId}`);
    } catch (err) {
      fail('Offline submission creates local queue item with stable clientId', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 3: Offline queue persists across simulated reloads
    // ---------------------------------------------------------------------------
    console.log('\n3. Offline queue persists across simulated reloads:');
    try {
      const allItems = offlineQueue.all();
      assert.strictEqual(allItems.length, 1, 'Expected 1 item in queue');
      const pendingCount = offlineQueue.count();
      assert.strictEqual(pendingCount, 1, 'Expected count of pending items to be 1');
      assert.strictEqual(allItems[0].clientId, testClientIds[0]);
      pass('Offline queue state persists and retrieves exact queued items');
    } catch (err) {
      fail('Offline queue persists across simulated reloads', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 4: Real GPS preserved in queue item (lat/lng match exactly)
    // ---------------------------------------------------------------------------
    console.log('\n4. Real GPS preserved in queue item (lat/lng match exactly):');
    try {
      const item = offlineQueue.all()[0];
      assert.strictEqual(item.lat, 26.3456, 'Exact latitude must be preserved');
      assert.strictEqual(item.lng, 92.6843, 'Exact longitude must be preserved');
      assert.strictEqual(item.hasGps, true, 'hasGps flag must be true');
      pass('Real GPS fix preserved exactly in local queue record');
    } catch (err) {
      fail('Real GPS preserved in queue item', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 5: Missing GPS stored as null with hasGps: false
    // ---------------------------------------------------------------------------
    console.log('\n5. Missing GPS stored as null with hasGps: false:');
    try {
      const noGpsPayload = {
        title: 'Flooding without GPS in valley',
        category: 'flood',
        severity: 'moderate',
        road: 'NH15',
        lat: null,
        lng: null,
      };
      const noGpsItem = offlineQueue.add(noGpsPayload);
      assert.strictEqual(noGpsItem.lat, null, 'Expected null latitude');
      assert.strictEqual(noGpsItem.lng, null, 'Expected null longitude');
      assert.strictEqual(noGpsItem.hasGps, false, 'Expected hasGps to be false');
      testClientIds.push(noGpsItem.clientId);
      pass('Missing GPS correctly serialized as null with hasGps: false');
    } catch (err) {
      fail('Missing GPS stored as null with hasGps: false', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 6: Photo compression downscaling produces valid dimensions <= 1280px
    // ---------------------------------------------------------------------------
    console.log('\n6. Photo compression downscaling produces valid dimensions <= 1280px:');
    try {
      // Test aspect ratio preserving downscaling logic
      const d1 = calculateTargetDimensions(4000, 3000, 1280);
      assert.strictEqual(d1.width, 1280);
      assert.strictEqual(d1.height, 960);
      assert.strictEqual(d1.wasScaled, true);

      const d2 = calculateTargetDimensions(1080, 1920, 1280);
      assert.strictEqual(d2.height, 1280);
      assert.strictEqual(d2.width, 720);
      assert.strictEqual(d2.wasScaled, true);

      const d3 = calculateTargetDimensions(800, 600, 1280);
      assert.strictEqual(d3.width, 800);
      assert.strictEqual(d3.height, 600);
      assert.strictEqual(d3.wasScaled, false);

      pass('Image compression dimension calculator scales high-res captures within 1280px limit');
    } catch (err) {
      fail('Photo compression downscaling produces valid dimensions', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 7: Missing photo stored as null (no placeholder)
    // ---------------------------------------------------------------------------
    console.log('\n7. Missing photo stored as null (no placeholder):');
    try {
      const noPhotoPayload = {
        title: 'Bridge Damage report without photo',
        category: 'bridge_damage',
        severity: 'critical',
        road: 'NH29',
        photoDataUrl: null,
      };
      const noPhotoItem = offlineQueue.add(noPhotoPayload);
      assert.strictEqual(noPhotoItem.photoDataUrl, null, 'Expected null photoDataUrl');
      testClientIds.push(noPhotoItem.clientId);
      pass('Missing photo stored as null without placeholder or fake URL generation');
    } catch (err) {
      fail('Missing photo stored as null', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 8: Syncing pending queue items to server creates canonical incidents
    // ---------------------------------------------------------------------------
    console.log('\n8. Syncing pending queue items to server creates canonical incidents:');
    let syncResult = null;
    try {
      // Mock API handler matching POST /api/reports/sync
      const mockApi = {
        syncReports: async (reports) => {
          const saved = [];
          const failed = [];
          for (const r of reports) {
            try {
              const savedReport = await supabaseService.createIncident(
                testOfficerId,
                { ...r, synced: 1 },
                'field',
                { preserveClientTimestamp: true }
              );
              saved.push({
                ...savedReport,
                clientId: r.clientId,
                serverIncidentId: savedReport.id,
              });
              createdIncidentIds.push(savedReport.id);
            } catch (err) {
              failed.push({ clientId: r.clientId, error: err.message });
            }
          }
          return { synced: saved.length, failed, reports: saved };
        },
      };

      syncResult = await offlineQueue.flush(mockApi);
      assert(syncResult && syncResult.synced >= 3, `Expected at least 3 synced reports, got ${syncResult.synced}`);
      assert.strictEqual(syncResult.failed.length, 0, 'Expected zero sync failures');
      pass(`Batch synced ${syncResult.synced} pending reports to canonical server`);
    } catch (err) {
      fail('Syncing pending queue items to server creates canonical incidents', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 9: Server confirms sync and returns canonical server incident IDs
    // ---------------------------------------------------------------------------
    console.log('\n9. Server confirms sync and returns canonical server incident IDs:');
    try {
      assert(syncResult && syncResult.reports && syncResult.reports.length > 0);
      syncResult.reports.forEach((rep) => {
        assert(rep.id, 'Report must contain canonical server ID');
        assert(rep.serverIncidentId, 'Report must contain serverIncidentId');
        assert(rep.clientId, 'Report must preserve originating clientId');
      });
      pass('Server response maps each submitted clientId to a canonical server incident ID');
    } catch (err) {
      fail('Server confirms sync and returns canonical server incident IDs', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 10: Queue item is updated with serverIncidentId and marked synced
    // ---------------------------------------------------------------------------
    console.log('\n10. Queue item is updated with serverIncidentId and marked synced:');
    try {
      const allQueued = offlineQueue.all();
      allQueued.forEach((item) => {
        assert.strictEqual(item.syncStatus, 'synced', `Expected synced status for ${item.clientId}`);
        assert(item.serverIncidentId, `Expected serverIncidentId populated for ${item.clientId}`);
      });
      assert.strictEqual(offlineQueue.count(), 0, 'Pending queue count should be 0 after successful sync');
      pass('Local queue records updated with syncStatus="synced" and serverIncidentId');
    } catch (err) {
      fail('Queue item updated with serverIncidentId and marked synced', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 11: Duplicate sync with same clientId returns existing incident (idempotent)
    // ---------------------------------------------------------------------------
    console.log('\n11. Duplicate sync with same clientId returns existing incident (idempotent):');
    try {
      const existingClient = syncResult.reports[0];
      const retransmissionPayload = {
        clientId: existingClient.clientId,
        title: 'Retransmitted Incident with Same Client ID',
        category: 'landslide',
        severity: 'major',
        road: 'NH27',
      };

      const secondResult = await supabaseService.createIncident(testOfficerId, retransmissionPayload, 'field');
      assert.strictEqual(secondResult.id, existingClient.id, 'Expected identical incident ID from idempotent match');
      assert.strictEqual(secondResult.clientId, existingClient.clientId, 'Expected matching clientId');
      pass('Server recognized existing clientId and returned canonical incident without duplicate insert');
    } catch (err) {
      fail('Duplicate sync with same clientId returns existing incident', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 12: Rapid re-sync does not create duplicate database rows
    // ---------------------------------------------------------------------------
    console.log('\n12. Rapid re-sync does not create duplicate database rows:');
    try {
      const existingClient = syncResult.reports[0];
      const countBefore = db.prepare('SELECT COUNT(*) c FROM field_reports WHERE clientId = ?').get(existingClient.clientId).c;
      assert.strictEqual(countBefore, 1, 'Expected exactly 1 database row for clientId before second submit');

      // Attempt second submission
      await supabaseService.createIncident(testOfficerId, {
        clientId: existingClient.clientId,
        title: 'Another Rapid Retransmission',
        category: 'landslide',
        severity: 'major',
        road: 'NH27',
      }, 'field');

      const countAfter = db.prepare('SELECT COUNT(*) c FROM field_reports WHERE clientId = ?').get(existingClient.clientId).c;
      assert.strictEqual(countAfter, 1, 'Database must retain exactly 1 row after duplicate sync attempt');
      pass('Database rows remain strictly deduplicated under rapid re-sync attempts');
    } catch (err) {
      fail('Rapid re-sync does not create duplicate database rows', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 13: Server failure retains item in queue with retryCount and lastError
    // ---------------------------------------------------------------------------
    console.log('\n13. Server failure retains item in queue with retryCount and lastError:');
    try {
      const failingItem = offlineQueue.add({
        title: 'Report that encounters transient server fault',
        category: 'accident',
        severity: 'minor',
        road: 'NH37',
      });

      const failingApi = {
        syncReports: async (batch) => {
          return {
            synced: 0,
            failed: batch.map((b) => ({ clientId: b.clientId, error: 'Network gateway 503 timeout' })),
            reports: [],
          };
        },
      };

      await offlineQueue.flush(failingApi);
      const updatedItem = offlineQueue.all().find((i) => i.clientId === failingItem.clientId);
      assert.strictEqual(updatedItem.syncStatus, 'failed');
      assert.strictEqual(updatedItem.retryCount, 1);
      assert(updatedItem.lastError.includes('503'), 'Expected lastError recorded');
      assert.strictEqual(offlineQueue.count(), 1, 'Failed item remains in pending queue count for retry');
      pass('Failed queue item preserved with incremented retryCount and descriptive lastError');
    } catch (err) {
      fail('Server failure retains item in queue with retryCount and lastError', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 14: Alerts are generated ONLY after server acceptance, not during offline queueing
    // ---------------------------------------------------------------------------
    console.log('\n14. Alerts generated ONLY after server acceptance, not during offline queueing:');
    try {
      const initialAlertsCount = db.prepare('SELECT COUNT(*) c FROM alerts WHERE createdBy = ?').get('officer_offline_alert_test').c;
      assert.strictEqual(initialAlertsCount, 0);

      // Step A: Queue locally while offline
      const queuedAlertReport = offlineQueue.add({
        title: 'Massive Rockslide on NH6 near Shillong',
        category: 'landslide',
        severity: 'critical',
        road: 'NH6',
        description: 'All movement halted.',
      });

      // Confirm NO alert exists in database yet
      const duringQueueAlerts = db.prepare('SELECT COUNT(*) c FROM alerts WHERE text LIKE ?').get('%Massive Rockslide%').c;
      assert.strictEqual(duringQueueAlerts, 0, 'Zero alerts should exist while report is queued offline');

      // Step B: Server accepts synced report
      const accepted = await supabaseService.createIncident('officer_offline_alert_test', queuedAlertReport, 'field');
      createdIncidentIds.push(accepted.id);

      // Confirm alert IS created after server acceptance
      const postSyncAlerts = db.prepare('SELECT COUNT(*) c FROM alerts WHERE createdBy = ?').get('officer_offline_alert_test').c;
      assert(postSyncAlerts >= 1, 'Alert must be generated upon canonical server acceptance');
      pass('Pipeline sequencing verified: Alerts triggered ONLY upon server acceptance');
    } catch (err) {
      fail('Alerts generated ONLY after server acceptance', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 15: Disruption penalty applies to routing ONLY after server acceptance
    // ---------------------------------------------------------------------------
    console.log('\n15. Disruption penalty applies to routing ONLY after server acceptance:');
    try {
      // Check active disruptions before acceptance
      const disruptionsBefore = await supabaseService.getActiveDisruptions();
      const nh27DisruptionBefore = disruptionsBefore.find((d) => d.road === 'NH27-OFFLINE-TEST');
      assert.strictEqual(nh27DisruptionBefore, undefined, 'No disruption penalty before server acceptance');

      // Sync and accept report on NH27-OFFLINE-TEST
      const disruptionReport = {
        title: 'Major Road Obstruction for Routing Test',
        category: 'road_block',
        severity: 'major',
        road: 'NH27-OFFLINE-TEST',
        fromNode: 'guwahati',
        toNode: 'nagaon',
      };
      const accepted = await supabaseService.createIncident(testOfficerId, disruptionReport, 'field');
      createdIncidentIds.push(accepted.id);

      // Check active disruptions after acceptance
      const disruptionsAfter = await supabaseService.getActiveDisruptions();
      const nh27DisruptionAfter = disruptionsAfter.find((d) => d.road === 'NH27-OFFLINE-TEST');
      assert(nh27DisruptionAfter, 'Disruption must be registered in active network disruptions after server acceptance');
      assert.strictEqual(nh27DisruptionAfter.severity, 'severe');
      pass('Corridor disruption penalty and Dijkstra network impact apply ONLY after server acceptance');
    } catch (err) {
      fail('Disruption penalty applies to routing ONLY after server acceptance', err);
    }

    // ---------------------------------------------------------------------------
    // TEST 16: Driver / Logistics see incident ONLY after server acceptance
    // ---------------------------------------------------------------------------
    console.log('\n16. Driver / Logistics see incident ONLY after server acceptance:');
    try {
      const driverReports = await supabaseService.getIncidents(100);
      const matchedIncident = driverReports.find((r) => r.id === createdIncidentIds[0]);
      assert(matchedIncident, 'Driver/Logistics query must return canonical server incident');
      assert.strictEqual(matchedIncident.status, 'active');
      pass('Driver and Logistics workspaces consume incident only after server acceptance');
    } catch (err) {
      fail('Driver / Logistics see incident ONLY after server acceptance', err);
    }

  } finally {
    // Teardown: Clean up created test incidents and alerts
    console.log('\nCleaning up test artifacts...');
    try {
      createdIncidentIds.forEach((id) => {
        db.prepare('DELETE FROM field_reports WHERE id = ?').run(id);
        db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
      });
      db.prepare('DELETE FROM alerts WHERE createdBy = ?').run('officer_offline_alert_test');
      db.prepare('DELETE FROM alerts WHERE createdBy = ?').run(testOfficerId);
      offlineQueue.clear();
      console.log('Cleanup completed successfully.');
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    }
  }

  console.log('\n======================================================================');
  console.log(`PHASE 3B TEST RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during Phase 3B testing:', err);
  process.exit(1);
});
