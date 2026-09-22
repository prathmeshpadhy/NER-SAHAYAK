/**
 * NER-SAHAYAK — PHASE 3A: FIELD REPORT EVIDENCE PROPAGATION TESTS
 * Verifies end-to-end GPS, photo, and canonical incident details across
 * Field Officer, Driver, and Command/Admin workspaces.
 */

const assert = require('assert');
const supabaseService = require('./services/supabaseService');
const db = require('./db');

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
  console.log('NER-SAHAYAK — PHASE 3A: FIELD REPORT EVIDENCE PROPAGATION TESTS');
  console.log('GPS, Photo Evidence & Canonical Incident Synchronization');
  console.log('======================================================================\n');

  // Sample valid Base64 PNG image (1x1 pixel PNG)
  const SAMPLE_BASE64_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const testOfficerId = 'test_field_officer_p3a';
  const testDriverId = 'test_driver_p3a';
  const testAdminId = 'test_admin_p3a';

  let incidentWithEvidenceId = null;
  let incidentWithoutEvidenceId = null;

  // ---------------------------------------------------------------------------
  // TEST 1: Field Officer submits report with GPS -> server stores GPS
  // ---------------------------------------------------------------------------
  try {
    console.log('1. Field Officer submits report with GPS:');
    const reportPayload = {
      title: 'NH27 Landslide with GPS and Photo',
      category: 'landslide',
      severity: 'major',
      road: 'NH27',
      fromNode: 'nagaon',
      toNode: 'guwahati',
      lat: 26.34567,
      lng: 92.68432,
      photoDataUrl: SAMPLE_BASE64_PHOTO,
      description: 'Major rockfall blocking westbound carriageway at km 142.',
    };

    const saved = await supabaseService.createIncident(testOfficerId, reportPayload, 'field');
    assert(saved && saved.id, 'Expected saved report to have an id');
    assert.strictEqual(saved.lat, 26.34567, 'Expected exact latitude to be preserved');
    assert.strictEqual(saved.lng, 92.68432, 'Expected exact longitude to be preserved');
    assert.strictEqual(saved.hasGps, true, 'Expected hasGps to be true');
    incidentWithEvidenceId = saved.id;
    pass('Field Officer submits report with GPS -> server stores GPS accurately');
  } catch (err) {
    fail('Field Officer submits report with GPS -> server stores GPS', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Driver retrieves incident -> same GPS is returned
  // ---------------------------------------------------------------------------
  try {
    console.log('\n2. Driver retrieves incident with GPS:');
    const fetched = await supabaseService.getIncidentById(incidentWithEvidenceId);
    assert(fetched, 'Expected incident to exist');
    assert.strictEqual(fetched.lat, 26.34567, 'Expected driver to see identical latitude');
    assert.strictEqual(fetched.lng, 92.68432, 'Expected driver to see identical longitude');
    assert.strictEqual(fetched.hasGps, true, 'Expected driver to see hasGps === true');
    pass('Driver retrieves incident -> exact same GPS coordinates returned');
  } catch (err) {
    fail('Driver retrieves incident -> same GPS is returned', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Command/Admin retrieves incident -> same GPS is returned
  // ---------------------------------------------------------------------------
  try {
    console.log('\n3. Command/Admin retrieves incident with GPS:');
    const allIncidents = await supabaseService.getIncidents(50);
    const found = allIncidents.find((i) => i.id === incidentWithEvidenceId);
    assert(found, 'Expected incident in command/admin incident list');
    assert.strictEqual(found.lat, 26.34567, 'Expected admin to see identical latitude');
    assert.strictEqual(found.lng, 92.68432, 'Expected admin to see identical longitude');
    assert.strictEqual(found.hasGps, true, 'Expected admin to see hasGps === true');
    pass('Command/Admin retrieves incident -> exact same GPS coordinates returned');
  } catch (err) {
    fail('Command/Admin retrieves incident -> same GPS is returned', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Field Officer submits report with photo -> server stores/references photo
  // ---------------------------------------------------------------------------
  try {
    console.log('\n4. Field Officer submits report with photo:');
    const fetched = await supabaseService.getIncidentById(incidentWithEvidenceId);
    assert(fetched.photoDataUrl, 'Expected photoDataUrl to be present');
    assert(fetched.photoDataUrl.startsWith('data:image/png;base64,'), 'Expected valid base64 data URL');
    assert.strictEqual(fetched.photoDataUrl, SAMPLE_BASE64_PHOTO, 'Expected exact image data URL to match');
    pass('Field Officer submits report with photo -> server stores photo data URL');
  } catch (err) {
    fail('Field Officer submits report with photo -> server stores/references photo', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Driver retrieves incident -> actual photo is available
  // ---------------------------------------------------------------------------
  try {
    console.log('\n5. Driver retrieves incident with photo:');
    const fetched = await supabaseService.getIncidentById(incidentWithEvidenceId);
    assert(fetched.photoDataUrl, 'Expected driver to receive photoDataUrl');
    assert(fetched.photoDataUrl.length > 50, 'Expected non-empty photo payload');
    assert.strictEqual(fetched.photoDataUrl, SAMPLE_BASE64_PHOTO, 'Expected driver to see actual uploaded photo');
    pass('Driver retrieves incident -> actual photo data is available');
  } catch (err) {
    fail('Driver retrieves incident -> actual photo is available', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Command/Admin retrieves incident -> actual photo is available
  // ---------------------------------------------------------------------------
  try {
    console.log('\n6. Command/Admin retrieves incident with photo:');
    const allIncidents = await supabaseService.getIncidents(50);
    const found = allIncidents.find((i) => i.id === incidentWithEvidenceId);
    assert(found.photoDataUrl, 'Expected admin to receive photoDataUrl');
    assert.strictEqual(found.photoDataUrl, SAMPLE_BASE64_PHOTO, 'Expected admin to see actual uploaded photo');
    pass('Command/Admin retrieves incident -> actual photo data is available');
  } catch (err) {
    fail('Command/Admin retrieves incident -> actual photo is available', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Missing GPS -> returns null/unavailable indication (never fabricated)
  // ---------------------------------------------------------------------------
  try {
    console.log('\n7. Missing GPS handling (never fabricate coordinates):');
    const noGpsPayload = {
      title: 'NH15 Flooding near Tezpur (No GPS fix)',
      category: 'flood',
      severity: 'moderate',
      road: 'NH15',
      fromNode: 'tezpur',
      toNode: 'guwahati',
      lat: null,
      lng: null,
      photoDataUrl: null,
      description: 'Water overtopping road by 15cm. Reported by phone.',
    };

    const savedNoGps = await supabaseService.createIncident(testOfficerId, noGpsPayload, 'field');
    incidentWithoutEvidenceId = savedNoGps.id;

    assert.strictEqual(savedNoGps.lat, null, 'Expected lat to be null');
    assert.strictEqual(savedNoGps.lng, null, 'Expected lng to be null');
    assert.strictEqual(savedNoGps.hasGps, false, 'Expected hasGps to be false');

    const fetchedNoGps = await supabaseService.getIncidentById(incidentWithoutEvidenceId);
    assert.strictEqual(fetchedNoGps.lat, null, 'Expected fetched lat to be null');
    assert.strictEqual(fetchedNoGps.lng, null, 'Expected fetched lng to be null');
    assert.strictEqual(fetchedNoGps.hasGps, false, 'Expected fetched hasGps to be false');

    pass('Missing GPS -> returns null coordinates and hasGps: false (never fabricated)');
  } catch (err) {
    fail('Missing GPS -> returns null/unavailable indication', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Missing photo -> returns null/unavailable indication (no fake URLs)
  // ---------------------------------------------------------------------------
  try {
    console.log('\n8. Missing photo handling (never generate placeholder URLs):');
    const fetched = await supabaseService.getIncidentById(incidentWithoutEvidenceId);
    assert.strictEqual(fetched.photoDataUrl, null, 'Expected photoDataUrl to be strictly null');
    pass('Missing photo -> returns null photoDataUrl without placeholder URLs');
  } catch (err) {
    fail('Missing photo -> returns null/unavailable indication', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Photo validation -> rejects invalid non-image formats
  // ---------------------------------------------------------------------------
  try {
    console.log('\n9. Photo format validation:');
    let rejected = false;
    try {
      await supabaseService.createIncident(testOfficerId, {
        title: 'Malicious HTML payload test',
        category: 'other',
        severity: 'minor',
        road: 'NH27',
        photoDataUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      }, 'field');
    } catch (e) {
      rejected = true;
      assert(e.message.includes('Invalid image format'), 'Expected invalid image format error');
    }
    assert(rejected, 'Expected invalid image format to be rejected');
    pass('Photo validation -> successfully rejected invalid non-image payload');
  } catch (err) {
    fail('Photo format validation', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Single canonical record -> same ID used across all queries
  // ---------------------------------------------------------------------------
  try {
    console.log('\n10. Single canonical record consistency across queries:');
    const directById = await supabaseService.getIncidentById(incidentWithEvidenceId);
    const fromList = (await supabaseService.getIncidents(100)).find(r => r.id === incidentWithEvidenceId);
    const fromUserReports = (await supabaseService.getIncidentsByUserId(testOfficerId)).find(r => r.id === incidentWithEvidenceId);

    assert.strictEqual(directById.id, incidentWithEvidenceId, 'Direct ID match');
    assert.strictEqual(fromList.id, incidentWithEvidenceId, 'List ID match');
    assert.strictEqual(fromUserReports.id, incidentWithEvidenceId, 'User reports ID match');

    assert.strictEqual(directById.title, fromList.title, 'Canonical title match');
    assert.strictEqual(directById.lat, fromList.lat, 'Canonical lat match');
    assert.strictEqual(directById.lng, fromList.lng, 'Canonical lng match');
    assert.strictEqual(directById.photoDataUrl, fromList.photoDataUrl, 'Canonical photo match');

    pass('Same report ID / incident ID used across all queries (canonical single record)');
  } catch (err) {
    fail('Single canonical record consistency across queries', err);
  }

  // Cleanup test records
  try {
    if (incidentWithEvidenceId) {
      db.prepare('DELETE FROM field_reports WHERE id = ?').run(incidentWithEvidenceId);
    }
    if (incidentWithoutEvidenceId) {
      db.prepare('DELETE FROM field_reports WHERE id = ?').run(incidentWithoutEvidenceId);
    }
  } catch (_) {}

  console.log('\n======================================================================');
  console.log(`PHASE 3A TEST SUMMARY: ${passedTests}/${passedTests + failedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
