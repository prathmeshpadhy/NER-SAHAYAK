const path = require('path');
const { DatabaseSync: Database } = require('node:sqlite');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('your-project-id')) {
  console.error('[Supabase Migration] ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env before running migration.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runMigration() {
  const sqliteDbPath = path.join(__dirname, '..', 'ner_sahayak.db');
  console.log(`[Supabase Migration] Reading local SQLite database: ${sqliteDbPath}`);

  let db;
  try {
    db = new Database(sqliteDbPath);
  } catch (err) {
    console.error(`[Supabase Migration] Could not open SQLite database at ${sqliteDbPath}:`, err.message);
    process.exit(1);
  }

  // 1. Migrate Users -> Profiles
  try {
    const users = db.prepare('SELECT * FROM users').all();
    console.log(`[Supabase Migration] Found ${users.length} users in SQLite.`);
    const profiles = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      password_hash: u.passwordHash,
      phone: u.phone,
      role: u.role,
      organisation: u.organisation,
      vehicle_number: u.vehicleNumber,
      state: u.state,
      district: u.district,
      language: u.language || 'en',
      hub: u.hub,
      department: u.department,
      is_demo: false, // Mark migrated historical data
      created_at: u.createdAt || new Date().toISOString(),
    }));

    if (profiles.length > 0) {
      const { error } = await supabase.from('profiles').upsert(profiles, { onConflict: 'email' });
      if (error) console.warn('[Supabase Migration] Profiles upsert error:', error.message);
      else console.log(`[Supabase Migration] Migrated ${profiles.length} profiles to Supabase.`);
    }
  } catch (e) {
    console.warn('[Supabase Migration] Error migrating users:', e.message);
  }

  // 2. Migrate Field Reports -> Incidents
  try {
    const reports = db.prepare('SELECT * FROM field_reports').all();
    console.log(`[Supabase Migration] Found ${reports.length} field reports in SQLite.`);
    const incidents = reports.map((r) => ({
      id: r.id,
      reporter_id: r.userId,
      reporter_role: 'field',
      title: r.title,
      description: r.description,
      category: r.category === 'road_block' ? 'road_blockage' : r.category,
      severity: r.severity === 'high' ? 'major' : r.severity === 'medium' ? 'moderate' : r.severity === 'low' ? 'minor' : r.severity,
      status: r.status === 'open' ? 'active' : r.status,
      node_id: r.nodeId,
      road: r.road,
      lat: r.lat,
      lng: r.lng,
      photo_url: r.photoDataUrl,
      is_demo: false,
      created_at: r.createdAt || new Date().toISOString(),
    }));

    if (incidents.length > 0) {
      const { error } = await supabase.from('incidents').upsert(incidents, { onConflict: 'id' });
      if (error) console.warn('[Supabase Migration] Incidents upsert error:', error.message);
      else console.log(`[Supabase Migration] Migrated ${incidents.length} incidents to Supabase.`);
    }
  } catch (e) {
    console.warn('[Supabase Migration] Error migrating field reports:', e.message);
  }

  // 3. Migrate Alerts
  try {
    const alerts = db.prepare('SELECT * FROM alerts').all();
    console.log(`[Supabase Migration] Found ${alerts.length} alerts in SQLite.`);
    const alertRecords = alerts.map((a) => ({
      id: a.id,
      type: a.type,
      tone: a.tone,
      icon: a.icon,
      title: a.title,
      text: a.text,
      node_id: a.nodeId,
      road: a.road,
      severity: a.severity,
      created_by: a.createdBy,
      is_demo: false,
      created_at: a.createdAt || new Date().toISOString(),
    }));

    if (alertRecords.length > 0) {
      const { error } = await supabase.from('alerts').upsert(alertRecords, { onConflict: 'id' });
      if (error) console.warn('[Supabase Migration] Alerts upsert error:', error.message);
      else console.log(`[Supabase Migration] Migrated ${alertRecords.length} alerts to Supabase.`);
    }
  } catch (e) {
    console.warn('[Supabase Migration] Error migrating alerts:', e.message);
  }

  // 4. Migrate Vehicles
  try {
    const vehicles = db.prepare('SELECT * FROM vehicles').all();
    console.log(`[Supabase Migration] Found ${vehicles.length} vehicles in SQLite.`);
    const vehicleRecords = vehicles.map((v) => ({
      id: v.id,
      owner_id: v.ownerId,
      driver_id: v.ownerId,
      vehicle_number: v.vehicleNumber,
      cargo_type: v.cargoType,
      origin_node: v.originNode,
      destination_node: v.destinationNode,
      status: v.status,
      lat: v.lat,
      lng: v.lng,
      last_updated: v.lastUpdated || new Date().toISOString(),
      is_demo: false,
    }));

    if (vehicleRecords.length > 0) {
      const { error } = await supabase.from('vehicles').upsert(vehicleRecords, { onConflict: 'id' });
      if (error) console.warn('[Supabase Migration] Vehicles upsert error:', error.message);
      else console.log(`[Supabase Migration] Migrated ${vehicleRecords.length} vehicles to Supabase.`);
    }
  } catch (e) {
    console.warn('[Supabase Migration] Error migrating vehicles:', e.message);
  }

  // 5. Migrate Shipments
  try {
    const shipments = db.prepare('SELECT * FROM shipments').all();
    console.log(`[Supabase Migration] Found ${shipments.length} shipments in SQLite.`);
    const shipmentRecords = shipments.map((s) => ({
      id: s.id,
      vehicle_id: s.vehicleId,
      driver_id: s.driverId,
      created_by: s.createdBy,
      origin_node: s.originNode,
      destination_node: s.destinationNode,
      cargo_type: s.cargoType,
      priority: s.priority,
      status: s.status,
      route_json: s.routeJson ? JSON.parse(s.routeJson) : null,
      eta_minutes: s.etaMinutes,
      is_demo: false,
      created_at: s.createdAt || new Date().toISOString(),
    }));

    if (shipmentRecords.length > 0) {
      const { error } = await supabase.from('shipments').upsert(shipmentRecords, { onConflict: 'id' });
      if (error) console.warn('[Supabase Migration] Shipments upsert error:', error.message);
      else console.log(`[Supabase Migration] Migrated ${shipmentRecords.length} shipments to Supabase.`);
    }
  } catch (e) {
    console.warn('[Supabase Migration] Error migrating shipments:', e.message);
  }

  console.log('[Supabase Migration] Migration from SQLite completed successfully. SQLite file preserved.');
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Supabase Migration] Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
