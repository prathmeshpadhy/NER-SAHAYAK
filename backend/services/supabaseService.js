const { v4: uuid } = require('uuid');
const { getSupabaseClient, isSupabaseConfigured } = require('../config/supabase');
const db = require('../db'); // Local SQLite fallback if Supabase credentials are not yet configured

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function toCamelUser(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    passwordHash: profile.password_hash || profile.passwordHash,
    phone: profile.phone,
    role: profile.role,
    organisation: profile.organisation,
    vehicleNumber: profile.vehicle_number || profile.vehicleNumber,
    state: profile.state,
    district: profile.district,
    language: profile.language || 'en',
    hub: profile.hub,
    department: profile.department,
    createdAt: profile.created_at || profile.createdAt,
    updatedAt: profile.updated_at || profile.updatedAt,
  };
}

function toPublicUser(u) {
  if (!u) return null;
  const { passwordHash, password_hash, ...rest } = u;
  return rest;
}

// =============================================================================
// 1. AUTH & USER SERVICE
// =============================================================================
async function getUserByEmail(email) {
  const cleanEmail = String(email).toLowerCase().trim();
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle();
    if (error) {
      console.warn('[Supabase] getUserByEmail error:', error.message);
    } else if (data) {
      return toCamelUser(data);
    }
  }

  // SQLite fallback
  try {
    const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    return row || null;
  } catch (_) {
    return null;
  }
}

async function getUserById(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.warn('[Supabase] getUserById error:', error.message);
    } else if (data) {
      return toCamelUser(data);
    }
  }

  // SQLite fallback
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row || null;
  } catch (_) {
    return null;
  }
}

async function createUser(userData) {
  const id = userData.id || uuid();
  const profileRecord = {
    id,
    name: userData.name,
    email: String(userData.email).toLowerCase().trim(),
    password_hash: userData.passwordHash,
    phone: userData.phone || null,
    role: userData.role,
    organisation: userData.organisation || null,
    vehicle_number: userData.vehicleNumber || null,
    state: userData.state || null,
    district: userData.district || null,
    language: userData.language || 'en',
    hub: userData.hub || null,
    department: userData.department || null,
    is_demo: false,
    created_at: userData.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('profiles').insert(profileRecord);
    if (error) throw new Error(`Supabase profile creation failed: ${error.message}`);

    // If role is driver, also insert into drivers table
    if (userData.role === 'driver') {
      await supabase.from('drivers').insert({
        profile_id: id,
        vehicle_number: userData.vehicleNumber || 'AS 01 K 0000',
        status: 'available',
        is_demo: false,
      });
    }
    // If role is logistics, insert into logistics_operators table
    if (userData.role === 'logistics') {
      await supabase.from('logistics_operators').insert({
        profile_id: id,
        organisation: userData.organisation || 'Logistics Provider',
        hub: userData.hub || 'General Hub',
        state: userData.state,
        district: userData.district,
        is_demo: false,
      });
    }
    // If role is field, insert into field_officers table
    if (userData.role === 'field') {
      await supabase.from('field_officers').insert({
        profile_id: id,
        department: userData.department || 'PWD',
        state: userData.state,
        district: userData.district,
        is_demo: false,
      });
    }
  }

  // Also sync into local SQLite for fallback consistency
  try {
    db.prepare(`INSERT OR REPLACE INTO users (id,name,email,passwordHash,phone,role,organisation,vehicleNumber,state,district,language,hub,department,createdAt)
      VALUES (@id,@name,@email,@passwordHash,@phone,@role,@organisation,@vehicleNumber,@state,@district,@language,@hub,@department,@createdAt)`)
      .run(userData);
  } catch (_) {}

  return toCamelUser(profileRecord);
}

async function updateUser(id, updates) {
  const supabaseUpdates = {};
  if (updates.name !== undefined) supabaseUpdates.name = updates.name;
  if (updates.phone !== undefined) supabaseUpdates.phone = updates.phone;
  if (updates.role !== undefined) supabaseUpdates.role = updates.role;
  if (updates.organisation !== undefined) supabaseUpdates.organisation = updates.organisation;
  if (updates.vehicleNumber !== undefined) supabaseUpdates.vehicle_number = updates.vehicleNumber;
  if (updates.state !== undefined) supabaseUpdates.state = updates.state;
  if (updates.district !== undefined) supabaseUpdates.district = updates.district;
  if (updates.language !== undefined) supabaseUpdates.language = updates.language;
  if (updates.hub !== undefined) supabaseUpdates.hub = updates.hub;
  if (updates.department !== undefined) supabaseUpdates.department = updates.department;
  supabaseUpdates.updated_at = new Date().toISOString();

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('profiles').update(supabaseUpdates).eq('id', id);
    if (error) console.warn('[Supabase] updateUser error:', error.message);
  }

  // SQLite sync
  try {
    const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
    if (setClause) {
      db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ ...updates, id });
    }
  } catch (_) {}

  return getUserById(id);
}

async function listUsers({ role, state, search } = {}) {
  const supabase = getSupabaseClient();
  if (supabase) {
    let query = supabase.from('profiles').select('*');
    if (role) query = query.eq('role', role);
    if (state) query = query.eq('state', state);
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,organisation.ilike.%${search}%,district.ilike.%${search}%`);
    }
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (!error && data) {
      const users = data.map(toCamelUser);
      const byRole = {};
      users.forEach((u) => { byRole[u.role] = (byRole[u.role] || 0) + 1; });
      return { users, total: users.length, byRole };
    }
  }

  // SQLite fallback
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params = [];
  if (role) { sql += ' AND role = ?'; params.push(role); }
  if (state) { sql += ' AND state = ?'; params.push(state); }
  if (search) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR organisation LIKE ? OR district LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY createdAt DESC';
  const users = db.prepare(sql).all(...params);
  const counts = db.prepare('SELECT role, COUNT(*) c FROM users GROUP BY role').all();
  const byRole = Object.fromEntries(counts.map((r) => [r.role, r.c]));
  return { users, total: users.length, byRole };
}

async function deleteUser(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('profiles').delete().eq('id', id);
  }
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  } catch (_) {}
  return { ok: true, deletedId: id };
}

// =============================================================================
// 2. ALERTS SERVICE
// =============================================================================
async function getAlerts(limit = 100) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data) {
      return data.map((a) => ({
        id: a.id,
        type: a.type,
        tone: a.tone || 'amber',
        icon: a.icon || 'bell',
        title: a.title,
        text: a.text,
        nodeId: a.node_id,
        road: a.road,
        severity: a.severity || 'minor',
        createdAt: a.created_at,
        createdBy: a.created_by,
        isDemo: a.is_demo,
      }));
    }
  }

  // SQLite fallback
  return db.prepare('SELECT * FROM alerts ORDER BY createdAt DESC LIMIT ?').all(limit);
}

async function createAlert(alertData) {
  const id = alertData.id || uuid();
  const record = {
    id,
    type: alertData.type,
    tone: alertData.tone || 'amber',
    icon: alertData.icon || 'bell',
    title: alertData.title,
    text: alertData.text,
    node_id: alertData.nodeId || null,
    road: alertData.road || null,
    severity: alertData.severity || 'minor',
    created_by: alertData.createdBy || null,
    is_demo: false,
    created_at: alertData.createdAt || new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('alerts').insert(record);
    if (error) console.warn('[Supabase] createAlert error:', error.message);
  }

  try {
    db.prepare(`INSERT INTO alerts (id,type,tone,icon,title,text,nodeId,road,severity,createdAt,createdBy)
      VALUES (@id,@type,@tone,@icon,@title,@text,@nodeId,@road,@severity,@createdAt,@createdBy)`)
      .run({ ...alertData, id, nodeId: record.node_id, createdBy: record.created_by, createdAt: record.created_at });
  } catch (_) {}

  await logActivity(alertData.createdBy, 'alert_created', 'alert', id, `Alert published: ${alertData.title}`);

  return {
    id,
    type: record.type,
    tone: record.tone,
    icon: record.icon,
    title: record.title,
    text: record.text,
    nodeId: record.node_id,
    road: record.road,
    severity: record.severity,
    createdAt: record.created_at,
    createdBy: record.created_by,
  };
}

async function deleteAlert(id, userId, role) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: alert } = await supabase.from('alerts').select('*').eq('id', id).maybeSingle();
    if (!alert) return { notFound: true };
    if (role !== 'official' && alert.created_by !== userId) {
      return { forbidden: true };
    }
    await supabase.from('alerts').delete().eq('id', id);
  }

  try {
    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (alert) {
      if (role !== 'official' && alert.createdBy !== userId) return { forbidden: true };
      db.prepare('DELETE FROM alerts WHERE id = ?').run(id);
    }
  } catch (_) {}

  return { ok: true };
}

// =============================================================================
// 3. INCIDENTS / REPORTS SERVICE (Field & Driver)
// =============================================================================
const CATEGORIES = [
  'road_blockage', 'landslide', 'flood', 'bridge_damage', 'accident',
  'vehicle_breakdown', 'traffic', 'poor_road_condition', 'weather_hazard',
  'visibility_problem', 'infrastructure_damage', 'fuel_problem', 'cargo_delay',
  'road_block', 'other',
];

const SEVERITIES = ['minor', 'moderate', 'major', 'critical', 'low', 'medium', 'high'];

function toFrontendReport(inc) {
  if (!inc) return null;
  return {
    id: inc.id,
    userId: inc.reporter_id || inc.userId,
    reporterRole: inc.reporter_role,
    nodeId: inc.node_id || inc.nodeId,
    road: inc.road,
    fromNode: inc.from_node || inc.fromNode || null,
    toNode: inc.to_node || inc.toNode || null,
    category: inc.category,
    severity: inc.severity,
    title: inc.title,
    description: inc.description || '',
    lat: inc.lat,
    lng: inc.lng,
    photoDataUrl: inc.photo_url || inc.photoDataUrl || null,
    status: inc.status === 'open' ? 'active' : inc.status,
    synced: 1,
    createdAt: inc.created_at || inc.createdAt,
    resolvedAt: inc.resolved_at || inc.resolvedAt,
    resolutionNotes: inc.resolution_notes || inc.resolutionNotes,
    isDemo: inc.is_demo,
  };
}

async function getIncidents(limit = 200) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data) {
      return data.map(toFrontendReport);
    }
  }

  // SQLite fallback
  const rows = db.prepare('SELECT * FROM field_reports ORDER BY createdAt DESC LIMIT ?').all(limit);
  return rows.map(toFrontendReport);
}

async function getIncidentsByUserId(userId) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      return data.map(toFrontendReport);
    }
  }

  // SQLite fallback
  const rows = db.prepare('SELECT * FROM field_reports WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  return rows.map(toFrontendReport);
}

async function createIncident(userId, body, userRole = 'field', { preserveClientTimestamp = false } = {}) {
  const { nodeId, road, fromNode, toNode, category, severity = 'moderate', title, description, lat, lng, photoDataUrl, createdAt } = body;
  
  if (!category || !CATEGORIES.includes(category)) throw new Error('Invalid or missing category');
  if (!title) throw new Error('Title is required');

  const id = body.id || uuid();
  const record = {
    id,
    reporter_id: userId,
    reporter_role: userRole,
    title,
    description: description || '',
    category: category === 'road_block' ? 'road_blockage' : category,
    severity: severity === 'high' ? 'major' : severity === 'medium' ? 'moderate' : severity === 'low' ? 'minor' : severity,
    status: 'active',
    node_id: nodeId || null,
    from_node: fromNode || null,
    to_node: toNode || null,
    road: road || null,
    lat: lat !== undefined ? Number(lat) : null,
    lng: lng !== undefined ? Number(lng) : null,
    photo_url: photoDataUrl || null,
    affected_modes: body.affectedMode ? [body.affectedMode] : ['road'],
    estimated_delay_minutes: Number(body.estimatedDelayMinutes) || 0,
    is_demo: false,
    created_at: preserveClientTimestamp ? (createdAt || new Date().toISOString()) : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('incidents').insert(record);
    if (error) console.warn('[Supabase] createIncident error:', error.message);
  }

  // Sync with SQLite fallback
  try {
    db.prepare(`INSERT INTO field_reports (id,userId,nodeId,road,fromNode,toNode,category,severity,title,description,lat,lng,photoDataUrl,status,synced,createdAt)
      VALUES (@id,@userId,@nodeId,@road,@fromNode,@toNode,@category,@severity,@title,@description,@lat,@lng,@photoDataUrl,@status,@synced,@createdAt)`)
      .run({
        id,
        userId,
        nodeId: record.node_id,
        road: record.road,
        fromNode: fromNode || null,
        toNode: toNode || null,
        category,
        severity,
        title,
        description,
        lat: record.lat,
        lng: record.lng,
        photoDataUrl: record.photo_url,
        status: 'open',
        synced: 1,
        createdAt: record.created_at,
      });
  } catch (_) {}

  // Auto-generate an alert in alerts table so drivers, logistics, and officials are immediately synchronized
  try {
    await createAlert({
      type: 'Field report',
      tone: (record.severity === 'critical' || record.severity === 'major') ? 'amber' : 'green',
      icon: 'report',
      title: `[${category.toUpperCase().replace('_', ' ')}] ${title}`,
      text: description || `Hazard reported by field unit on ${road || nodeId || fromNode || 'corridor'}. Status: active.`,
      nodeId: nodeId || fromNode || null,
      road: road || null,
      severity: record.severity,
      createdBy: userId,
    });
  } catch (_) {}

  await logActivity(userId, 'incident_reported', 'incident', id, `Incident logged: ${title} (${category})`);

  return toFrontendReport(record);
}

async function updateIncidentStatus(id, newStatus, updatedBy, userRole, comment = '') {
  let mappedStatus = newStatus;
  if (newStatus === 'open') mappedStatus = 'active';
  if (newStatus === 'in_progress') mappedStatus = 'verified';

  const supabase = getSupabaseClient();
  let oldStatus = 'active';
  if (supabase) {
    const { data: existing } = await supabase.from('incidents').select('*').eq('id', id).maybeSingle();
    if (!existing) return { notFound: true };
    if (userRole !== 'official' && existing.reporter_id !== updatedBy) {
      return { forbidden: true };
    }
    oldStatus = existing.status;

    const updates = {
      status: mappedStatus,
      updated_at: new Date().toISOString(),
    };
    if (mappedStatus === 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolution_notes = comment || 'Resolved by operational officer.';
    }

    await supabase.from('incidents').update(updates).eq('id', id);

    // Add incident_update record
    await supabase.from('incident_updates').insert({
      incident_id: id,
      updated_by: updatedBy,
      old_status: oldStatus,
      new_status: mappedStatus,
      comment: comment || `Status updated to ${mappedStatus}`,
      created_at: new Date().toISOString(),
    });
  }

  // SQLite sync
  try {
    const existing = db.prepare('SELECT * FROM field_reports WHERE id = ?').get(id);
    if (existing) {
      if (userRole !== 'official' && existing.userId !== updatedBy) return { forbidden: true };
      db.prepare('UPDATE field_reports SET status = ? WHERE id = ?').run(newStatus, id);
    }
  } catch (_) {}

  await logActivity(updatedBy, 'incident_status_changed', 'incident', id, `Incident status changed from ${oldStatus} to ${mappedStatus}`);

  const report = await getIncidentById(id);
  return { report };
}

async function getIncidentById(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data } = await supabase.from('incidents').select('*').eq('id', id).maybeSingle();
    if (data) return toFrontendReport(data);
  }
  const row = db.prepare('SELECT * FROM field_reports WHERE id = ?').get(id);
  return toFrontendReport(row);
}

/**
 * Derives active disruptions from Supabase Incidents for Dijkstra routing.
 * Active incidents (excluding resolved ones) increase edge risk.
 */
async function getActiveDisruptions() {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .in('status', ['reported', 'under_review', 'verified', 'active', 'open', 'in_progress']);
    if (!error && data) {
      return data.map((r) => ({
        fromNode: r.from_node || r.node_id,
        toNode: r.to_node || null,
        nodeId: r.node_id || r.from_node,
        road: r.road,
        severity: r.category === 'bridge_damage' || r.severity === 'critical' ? 'blocked'
          : (r.severity === 'major' || r.severity === 'high') ? 'severe'
          : (r.severity === 'moderate' || r.severity === 'medium') ? 'moderate' : 'minor',
      }));
    }
  }

  // SQLite fallback
  const reports = db.prepare(`SELECT * FROM field_reports WHERE status IN ('open','in_progress','active','reported') AND category IN ('road_block','road_blockage','landslide','flood','bridge_damage','accident')`).all();
  return reports.map((r) => ({
    fromNode: r.fromNode || r.nodeId,
    toNode: r.toNode || null,
    nodeId: r.nodeId || r.fromNode,
    road: r.road,
    severity: r.category === 'bridge_damage' || r.severity === 'critical' ? 'blocked'
      : (r.severity === 'high' || r.severity === 'major') ? 'severe'
      : (r.severity === 'medium' || r.severity === 'moderate') ? 'moderate' : 'minor',
  }));
}

// =============================================================================
// 4. VEHICLES SERVICE
// =============================================================================
async function getVehicles(ownerId = null) {
  const supabase = getSupabaseClient();
  if (supabase) {
    let query = supabase.from('vehicles').select('*');
    if (ownerId) query = query.eq('owner_id', ownerId);
    query = query.order('last_updated', { ascending: false });

    const { data, error } = await query;
    if (!error && data) {
      return data.map((v) => ({
        id: v.id,
        ownerId: v.owner_id,
        driverId: v.driver_id,
        vehicleNumber: v.vehicle_number,
        vehicleType: v.vehicle_type,
        cargoType: v.cargo_type,
        capacityTonnes: v.capacity_tonnes,
        originNode: v.origin_node,
        destinationNode: v.destination_node,
        status: v.status,
        lat: v.lat,
        lng: v.lng,
        lastUpdated: v.last_updated,
        isDemo: v.is_demo,
      }));
    }
  }

  // SQLite fallback
  const rows = ownerId
    ? db.prepare('SELECT * FROM vehicles WHERE ownerId = ?').all(ownerId)
    : db.prepare('SELECT * FROM vehicles ORDER BY lastUpdated DESC').all();
  return rows;
}

async function createVehicle(userId, vehicleData) {
  const id = vehicleData.id || uuid();
  const record = {
    id,
    owner_id: userId,
    driver_id: userId,
    vehicle_number: vehicleData.vehicleNumber,
    cargo_type: vehicleData.cargoType || 'General cargo',
    origin_node: vehicleData.originNode,
    destination_node: vehicleData.destinationNode,
    status: 'in_transit',
    lat: vehicleData.lat ?? null,
    lng: vehicleData.lng ?? null,
    is_demo: false,
    last_updated: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('vehicles').insert(record);
  }

  try {
    db.prepare(`INSERT INTO vehicles (id,ownerId,vehicleNumber,cargoType,originNode,destinationNode,status,lat,lng,lastUpdated)
      VALUES (@id,@ownerId,@vehicleNumber,@cargoType,@originNode,@destinationNode,@status,@lat,@lng,@lastUpdated)`)
      .run({ ...vehicleData, id, ownerId: userId, status: 'in_transit', lastUpdated: record.last_updated });
  } catch (_) {}

  await logActivity(userId, 'vehicle_created', 'vehicle', id, `Vehicle ${vehicleData.vehicleNumber} registered.`);

  return {
    id,
    ownerId: userId,
    vehicleNumber: record.vehicle_number,
    cargoType: record.cargo_type,
    originNode: record.origin_node,
    destinationNode: record.destination_node,
    status: record.status,
    lat: record.lat,
    lng: record.lng,
    lastUpdated: record.last_updated,
  };
}

async function updateVehicleLocation(id, userId, role, { lat, lng, status }) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: vehicle } = await supabase.from('vehicles').select('*').eq('id', id).maybeSingle();
    if (!vehicle) return { notFound: true };
    if (role !== 'official' && vehicle.owner_id !== userId && vehicle.driver_id !== userId) {
      return { forbidden: true };
    }

    const updates = {
      lat,
      lng,
      last_updated: new Date().toISOString(),
    };
    if (status) updates.status = status;

    await supabase.from('vehicles').update(updates).eq('id', id);
    const { data: updated } = await supabase.from('vehicles').select('*').eq('id', id).single();
    return {
      vehicle: {
        id: updated.id,
        ownerId: updated.owner_id,
        vehicleNumber: updated.vehicle_number,
        cargoType: updated.cargo_type,
        originNode: updated.origin_node,
        destinationNode: updated.destination_node,
        status: updated.status,
        lat: updated.lat,
        lng: updated.lng,
        lastUpdated: updated.last_updated,
      },
    };
  }

  // SQLite fallback
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  if (!vehicle) return { notFound: true };
  if (role !== 'official' && vehicle.ownerId !== userId) return { forbidden: true };

  db.prepare('UPDATE vehicles SET lat = ?, lng = ?, status = COALESCE(?, status), lastUpdated = ? WHERE id = ?')
    .run(lat, lng, status || null, new Date().toISOString(), id);
  const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  return { vehicle: updated };
}

// =============================================================================
// 5. SHIPMENTS SERVICE
// =============================================================================
async function getShipments(userId = null, role = null) {
  const supabase = getSupabaseClient();
  if (supabase) {
    let query = supabase.from('shipments').select('*');
    if (role === 'logistics' && userId) {
      query = query.eq('created_by', userId);
    }
    query = query.order('created_at', { ascending: false }).limit(100);

    const { data, error } = await query;
    if (!error && data) {
      return data.map((s) => ({
        id: s.id,
        vehicleId: s.vehicle_id,
        driverId: s.driver_id,
        createdBy: s.created_by,
        originNode: s.origin_node,
        destinationNode: s.destination_node,
        cargoType: s.cargo_type,
        priority: s.priority,
        status: s.status,
        routeJson: s.route_json ? (typeof s.route_json === 'string' ? s.route_json : JSON.stringify(s.route_json)) : null,
        route: typeof s.route_json === 'object' ? s.route_json : (s.route_json ? JSON.parse(s.route_json) : null),
        etaMinutes: s.eta_minutes,
        createdAt: s.created_at,
        isDemo: s.is_demo,
      }));
    }
  }

  // SQLite fallback
  const rows = role === 'logistics'
    ? db.prepare('SELECT * FROM shipments WHERE createdBy = ? ORDER BY createdAt DESC').all(userId)
    : db.prepare('SELECT * FROM shipments ORDER BY createdAt DESC LIMIT 100').all();
  return rows.map((r) => ({ ...r, route: r.routeJson ? JSON.parse(r.routeJson) : null }));
}

async function createShipment(userId, shipmentData) {
  const id = shipmentData.id || uuid();
  const record = {
    id,
    vehicle_id: shipmentData.vehicleId || null,
    driver_id: shipmentData.driverId || null,
    created_by: userId,
    origin_node: shipmentData.originNode,
    destination_node: shipmentData.destinationNode,
    cargo_type: shipmentData.cargoType || 'General cargo',
    priority: shipmentData.priority || 'normal',
    status: 'planned',
    route_json: shipmentData.route ? shipmentData.route : null,
    eta_minutes: shipmentData.route ? shipmentData.route.etaMinutes : null,
    is_demo: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('shipments').insert(record);
  }

  try {
    db.prepare(`INSERT INTO shipments (id,vehicleId,createdBy,originNode,destinationNode,cargoType,priority,status,routeJson,etaMinutes,createdAt)
      VALUES (@id,@vehicleId,@createdBy,@originNode,@destinationNode,@cargoType,@priority,@status,@routeJson,@etaMinutes,@createdAt)`)
      .run({
        id,
        vehicleId: record.vehicle_id,
        createdBy: userId,
        originNode: record.origin_node,
        destinationNode: record.destination_node,
        cargoType: record.cargo_type,
        priority: record.priority,
        status: 'planned',
        routeJson: record.route_json ? JSON.stringify(record.route_json) : null,
        etaMinutes: record.eta_minutes,
        createdAt: record.created_at,
      });
  } catch (_) {}

  await logActivity(userId, 'shipment_created', 'shipment', id, `Shipment created: ${record.origin_node} -> ${record.destination_node}`);

  return {
    id,
    vehicleId: record.vehicle_id,
    driverId: record.driver_id,
    createdBy: userId,
    originNode: record.origin_node,
    destinationNode: record.destination_node,
    cargoType: record.cargo_type,
    priority: record.priority,
    status: record.status,
    route: record.route_json,
    etaMinutes: record.eta_minutes,
    createdAt: record.created_at,
  };
}

async function updateShipmentStatus(id, userId, role, status) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: shipment } = await supabase.from('shipments').select('*').eq('id', id).maybeSingle();
    if (!shipment) return { notFound: true };
    if (role !== 'official' && shipment.created_by !== userId) {
      return { forbidden: true };
    }

    await supabase.from('shipments').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    const { data: updated } = await supabase.from('shipments').select('*').eq('id', id).single();
    return {
      shipment: {
        id: updated.id,
        vehicleId: updated.vehicle_id,
        driverId: updated.driver_id,
        createdBy: updated.created_by,
        originNode: updated.origin_node,
        destinationNode: updated.destination_node,
        cargoType: updated.cargo_type,
        priority: updated.priority,
        status: updated.status,
        route: typeof updated.route_json === 'object' ? updated.route_json : (updated.route_json ? JSON.parse(updated.route_json) : null),
        etaMinutes: updated.eta_minutes,
        createdAt: updated.created_at,
      },
    };
  }

  // SQLite fallback
  const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  if (!existing) return { notFound: true };
  if (role !== 'official' && existing.createdBy !== userId) return { forbidden: true };

  db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(status, id);
  const row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  return { shipment: { ...row, route: row.routeJson ? JSON.parse(row.routeJson) : null } };
}

async function assignDriverToShipment(id, userId, role, driverId) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: shipment } = await supabase.from('shipments').select('*').eq('id', id).maybeSingle();
    if (!shipment) return { notFound: true };
    if (role !== 'official' && role !== 'logistics') return { forbidden: true };

    await supabase.from('shipments').update({ driver_id: driverId, status: 'assigned', updated_at: new Date().toISOString() }).eq('id', id);
    const { data: updated } = await supabase.from('shipments').select('*').eq('id', id).single();

    await logActivity(userId, 'shipment_assigned', 'shipment', id, `Driver assigned to shipment ${id}`);

    return {
      shipment: {
        id: updated.id,
        vehicleId: updated.vehicle_id,
        driverId: updated.driver_id,
        createdBy: updated.created_by,
        originNode: updated.origin_node,
        destinationNode: updated.destination_node,
        cargoType: updated.cargo_type,
        priority: updated.priority,
        status: updated.status,
        route: typeof updated.route_json === 'object' ? updated.route_json : (updated.route_json ? JSON.parse(updated.route_json) : null),
        etaMinutes: updated.eta_minutes,
        createdAt: updated.created_at,
      },
    };
  }

  // SQLite fallback
  const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  if (!existing) return { notFound: true };
  if (role !== 'official' && role !== 'logistics') return { forbidden: true };

  db.prepare('UPDATE shipments SET driverId = ?, status = ? WHERE id = ?').run(driverId, 'assigned', id);
  const row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  return { shipment: { ...row, route: row.routeJson ? JSON.parse(row.routeJson) : null } };
}

// =============================================================================
// 6. ACTIVITY LOGGING
// =============================================================================
async function logActivity(userId, action, entityType, entityId, description) {
  const record = {
    user_id: userId || null,
    action,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    description: description || '',
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('activity_logs').insert(record);
    } catch (_) {}
  }
}

async function getActivityLogs(limit = 25) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data) {
      return data.map((a) => ({
        id: a.id,
        userId: a.user_id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        description: a.description,
        createdAt: a.created_at,
      }));
    }
  }

  // Fallback demo activity items if none stored yet
  return [
    { id: 'act-1', action: 'incident_reported', description: 'Field Officer Priya Deka reported Landslide on NH27 near Nagaon', createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
    { id: 'act-2', action: 'vehicle_ping', description: 'Driver Arjun Bora updated GPS fix along Guwahati corridor', createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString() },
    { id: 'act-3', action: 'shipment_assigned', description: 'Shipment #SHP-001 (Medical Supplies) assigned to driver Arjun Bora', createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    { id: 'act-4', action: 'alert_created', description: 'Monsoon flash flood advisory published for Brahmaputra waterway NW-2', createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
    { id: 'act-5', action: 'incident_verified', description: 'NH29 landslide response verified by PWD Field Unit', createdAt: new Date(Date.now() - 1000 * 60 * 130).toISOString() },
  ];
}

module.exports = {
  toPublicUser,
  toCamelUser,
  // User / Profile
  getUserByEmail,
  getUserById,
  createUser,
  updateUser,
  listUsers,
  deleteUser,
  // Alerts
  getAlerts,
  createAlert,
  deleteAlert,
  // Incidents / Reports
  getIncidents,
  getIncidentsByUserId,
  getIncidentById,
  createIncident,
  updateIncidentStatus,
  getActiveDisruptions,
  // Vehicles
  getVehicles,
  createVehicle,
  updateVehicleLocation,
  // Shipments
  getShipments,
  createShipment,
  updateShipmentStatus,
  assignDriverToShipment,
  // Logging
  logActivity,
  getActivityLogs,
  CATEGORIES,
  SEVERITIES,
};
