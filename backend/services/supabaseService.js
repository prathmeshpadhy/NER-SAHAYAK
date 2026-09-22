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
        incidentId: a.incident_id || null,
        responseStatus: a.response_status || 'new',
        assignedTo: a.assigned_to || null,
        assignedRole: a.assigned_role || null,
        latestAction: a.latest_action || null,
        latestNote: a.latest_note || null,
        updatedAt: a.updated_at || a.created_at,
        isDemo: a.is_demo,
      }));
    }
  }

  // SQLite fallback
  const rows = db.prepare('SELECT * FROM alerts ORDER BY createdAt DESC LIMIT ?').all(limit);
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    tone: a.tone || 'amber',
    icon: a.icon || 'bell',
    title: a.title,
    text: a.text,
    nodeId: a.nodeId,
    road: a.road,
    severity: a.severity || 'minor',
    createdAt: a.createdAt,
    createdBy: a.createdBy,
    incidentId: a.incidentId || null,
    responseStatus: a.responseStatus || 'new',
    assignedTo: a.assignedTo || null,
    assignedRole: a.assignedRole || null,
    latestAction: a.latestAction || null,
    latestNote: a.latestNote || null,
    updatedAt: a.updatedAt || a.createdAt,
  }));
}

async function getAlertById(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('alerts').select('*').eq('id', id).maybeSingle();
    if (!error && data) {
      return {
        id: data.id,
        type: data.type,
        tone: data.tone || 'amber',
        icon: data.icon || 'bell',
        title: data.title,
        text: data.text,
        nodeId: data.node_id,
        road: data.road,
        severity: data.severity || 'minor',
        createdAt: data.created_at,
        createdBy: data.created_by,
        incidentId: data.incident_id || null,
        responseStatus: data.response_status || 'new',
        assignedTo: data.assigned_to || null,
        assignedRole: data.assigned_role || null,
        latestAction: data.latest_action || null,
        latestNote: data.latest_note || null,
        updatedAt: data.updated_at || data.created_at,
      };
    }
  }

  const a = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  if (!a) return null;
  return {
    id: a.id,
    type: a.type,
    tone: a.tone || 'amber',
    icon: a.icon || 'bell',
    title: a.title,
    text: a.text,
    nodeId: a.nodeId,
    road: a.road,
    severity: a.severity || 'minor',
    createdAt: a.createdAt,
    createdBy: a.createdBy,
    incidentId: a.incidentId || null,
    responseStatus: a.responseStatus || 'new',
    assignedTo: a.assignedTo || null,
    assignedRole: a.assignedRole || null,
    latestAction: a.latestAction || null,
    latestNote: a.latestNote || null,
    updatedAt: a.updatedAt || a.createdAt,
  };
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
    incident_id: alertData.incidentId || null,
    response_status: alertData.responseStatus || 'new',
    assigned_to: alertData.assignedTo || null,
    assigned_role: alertData.assignedRole || null,
    latest_action: alertData.latestAction || null,
    latest_note: alertData.latestNote || null,
    updated_at: alertData.updatedAt || new Date().toISOString(),
    is_demo: false,
    created_at: alertData.createdAt || new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('alerts').insert(record);
    if (error) console.warn('[Supabase] createAlert error:', error.message);
  }

  try {
    db.prepare(`INSERT INTO alerts (id,type,tone,icon,title,text,nodeId,road,severity,createdAt,createdBy,incidentId,responseStatus,assignedTo,assignedRole,latestAction,latestNote,updatedAt)
      VALUES (@id,@type,@tone,@icon,@title,@text,@nodeId,@road,@severity,@createdAt,@createdBy,@incidentId,@responseStatus,@assignedTo,@assignedRole,@latestAction,@latestNote,@updatedAt)`)
      .run({
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
        incidentId: record.incident_id,
        responseStatus: record.response_status,
        assignedTo: record.assigned_to,
        assignedRole: record.assigned_role,
        latestAction: record.latest_action,
        latestNote: record.latest_note,
        updatedAt: record.updated_at,
      });
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
    incidentId: record.incident_id,
    responseStatus: record.response_status,
    assignedTo: record.assigned_to,
    assignedRole: record.assigned_role,
    latestAction: record.latest_action,
    latestNote: record.latest_note,
    updatedAt: record.updated_at,
  };
}

async function getAlertResponses(alertId) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('alert_responses')
      .select('*')
      .eq('alert_id', alertId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      return data.map((r) => ({
        id: r.id,
        alertId: r.alert_id,
        incidentId: r.incident_id,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name,
        actorRole: r.actor_role,
        actionType: r.action_type,
        previousStatus: r.previous_status,
        newStatus: r.new_status,
        note: r.note,
        assignedTo: r.assigned_to,
        clientId: r.client_id,
        createdAt: r.created_at,
      }));
    }
  }

  // SQLite fallback
  const rows = db.prepare('SELECT * FROM alert_responses WHERE alertId = ? ORDER BY createdAt ASC').all(alertId);
  return rows;
}

const VALID_ACTIONS = ['ACKNOWLEDGE', 'CLAIM', 'UPDATE_STATUS', 'ADD_NOTE', 'ESCALATE', 'RESOLVE'];
const VALID_STATUSES = ['new', 'acknowledged', 'in_progress', 'escalated', 'resolved'];

const ROLE_PERMISSIONS = {
  official: ['ACKNOWLEDGE', 'CLAIM', 'UPDATE_STATUS', 'ADD_NOTE', 'ESCALATE', 'RESOLVE'],
  logistics: ['ACKNOWLEDGE', 'CLAIM', 'UPDATE_STATUS', 'ADD_NOTE', 'ESCALATE'],
  field: ['ACKNOWLEDGE', 'CLAIM', 'UPDATE_STATUS', 'ADD_NOTE', 'ESCALATE', 'RESOLVE'],
  driver: ['ACKNOWLEDGE', 'ADD_NOTE'],
};

function getAllowedActionsForRole(role, alert) {
  const baseAllowed = ROLE_PERMISSIONS[role] || [];
  if (!alert) return baseAllowed;

  // Filter based on current status
  const currentStatus = alert.responseStatus || 'new';
  if (currentStatus === 'resolved') {
    // Only adding notes is permitted once resolved
    return baseAllowed.filter((a) => a === 'ADD_NOTE');
  }
  return baseAllowed;
}

async function recordAlertResponse(alertId, userId, userRole, { actionType, note, newStatus, assignedTo, clientId, clearHazard, resolveIncident } = {}) {
  const normAction = (actionType || '').trim().toUpperCase();
  if (!VALID_ACTIONS.includes(normAction)) {
    const err = new Error(`Invalid action type "${normAction}". Must be one of: ${VALID_ACTIONS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const allowed = ROLE_PERMISSIONS[userRole] || [];
  if (!allowed.includes(normAction)) {
    const err = new Error(`Role "${userRole}" is not authorized to perform action "${normAction}"`);
    err.status = 403;
    throw err;
  }

  if (note && note.length > 2000) {
    const err = new Error('Response note must be 2000 characters or fewer');
    err.status = 400;
    throw err;
  }

  const alert = await getAlertById(alertId);
  if (!alert) {
    const err = new Error(`Alert "${alertId}" not found`);
    err.status = 404;
    throw err;
  }

  // Idempotency check via clientId (for offline sync)
  if (clientId) {
    const existing = db.prepare('SELECT * FROM alert_responses WHERE clientId = ?').get(clientId);
    if (existing) {
      const history = await getAlertResponses(alertId);
      return {
        response: existing,
        alert,
        history,
        allowedActions: getAllowedActionsForRole(userRole, alert),
        idempotent: true,
      };
    }
  }

  const prevStatus = alert.responseStatus || 'new';
  let derivedStatus = prevStatus;

  switch (normAction) {
    case 'ACKNOWLEDGE':
      derivedStatus = prevStatus === 'new' ? 'acknowledged' : prevStatus;
      break;
    case 'CLAIM':
      derivedStatus = 'in_progress';
      break;
    case 'ADD_NOTE':
      derivedStatus = prevStatus;
      break;
    case 'ESCALATE':
      derivedStatus = 'escalated';
      break;
    case 'RESOLVE':
      derivedStatus = 'resolved';
      break;
    case 'UPDATE_STATUS': {
      const target = (newStatus || '').trim().toLowerCase();
      if (!VALID_STATUSES.includes(target)) {
        const err = new Error(`Invalid status "${target}". Must be one of: ${VALID_STATUSES.join(', ')}`);
        err.status = 400;
        throw err;
      }
      // Cannot transition out of resolved to new/acknowledged
      if (prevStatus === 'resolved' && (target === 'new' || target === 'acknowledged')) {
        const err = new Error(`Cannot transition alert from "${prevStatus}" to "${target}"`);
        err.status = 400;
        throw err;
      }
      derivedStatus = target;
      break;
    }
    default:
      derivedStatus = prevStatus;
  }

  // Look up user name for actor identity
  const actorUser = await getUserById(userId);
  const actorName = actorUser ? actorUser.name : `User (${userRole})`;

  const responseId = uuid();
  const now = new Date().toISOString();
  const responseRecord = {
    id: responseId,
    alertId,
    incidentId: alert.incidentId || null,
    actorUserId: userId,
    actorName,
    actorRole: userRole,
    actionType: normAction,
    previousStatus: prevStatus,
    newStatus: derivedStatus,
    note: (note || '').trim() || null,
    assignedTo: assignedTo || alert.assignedTo || null,
    clientId: clientId || null,
    createdAt: now,
  };

  // Persist response in SQLite
  try {
    db.prepare(`INSERT INTO alert_responses
      (id, alertId, incidentId, actorUserId, actorName, actorRole, actionType, previousStatus, newStatus, note, assignedTo, clientId, createdAt)
      VALUES (@id, @alertId, @incidentId, @actorUserId, @actorName, @actorRole, @actionType, @previousStatus, @newStatus, @note, @assignedTo, @clientId, @createdAt)`)
      .run(responseRecord);
  } catch (_) {}

  // Update alert in SQLite
  try {
    db.prepare(`UPDATE alerts SET
      responseStatus = ?,
      assignedTo = COALESCE(?, assignedTo),
      latestAction = ?,
      latestNote = COALESCE(?, latestNote),
      updatedAt = ?
      WHERE id = ?`).run(
        derivedStatus,
        assignedTo || null,
        normAction,
        responseRecord.note,
        now,
        alertId
      );
  } catch (_) {}

  // Persist in Supabase if configured
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('alert_responses').insert({
        id: responseId,
        alert_id: alertId,
        incident_id: alert.incidentId || null,
        actor_user_id: userId,
        actor_name: actorName,
        actor_role: userRole,
        action_type: normAction,
        previous_status: prevStatus,
        new_status: derivedStatus,
        note: responseRecord.note,
        assigned_to: responseRecord.assignedTo,
        client_id: clientId || null,
        created_at: now,
      });
      await supabase.from('alerts').update({
        response_status: derivedStatus,
        assigned_to: responseRecord.assignedTo,
        latest_action: normAction,
        latest_note: responseRecord.note,
        updated_at: now,
      }).eq('id', alertId);
    } catch (_) {}
  }

  // If action is RESOLVE and alert is linked to an incident, resolve the canonical incident if hazard clearance is confirmed
  const shouldClearHazard = clearHazard !== false && resolveIncident !== false;
  if (normAction === 'RESOLVE' && alert.incidentId && shouldClearHazard) {
    try {
      db.prepare('UPDATE field_reports SET status = ? WHERE id = ?').run('resolved', alert.incidentId);
      if (supabase) {
        await supabase.from('incidents').update({ status: 'resolved' }).eq('id', alert.incidentId);
      }
    } catch (_) {}
    await logActivity(userId, 'incident_resolved', 'incident', alert.incidentId, `Hazard marked resolved by ${actorName} (${userRole}) via alert response`);
  }

  // Audit log
  await logActivity(
    userId,
    `alert_response_${normAction}`,
    'alert',
    alertId,
    `${actorName} (${userRole}) performed ${normAction}: ${prevStatus} → ${derivedStatus}${responseRecord.note ? ` ("${responseRecord.note}")` : ''}`
  );

  const updatedAlert = await getAlertById(alertId);
  const history = await getAlertResponses(alertId);

  return {
    response: responseRecord,
    alert: updatedAlert,
    history,
    allowedActions: getAllowedActionsForRole(userRole, updatedAlert),
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
  const rawLat = inc.lat;
  const rawLng = inc.lng;
  const hasValidLat = rawLat !== null && rawLat !== undefined && rawLat !== '' && !isNaN(Number(rawLat));
  const hasValidLng = rawLng !== null && rawLng !== undefined && rawLng !== '' && !isNaN(Number(rawLng));
  const hasGps = hasValidLat && hasValidLng;
  const lat = hasGps ? Number(rawLat) : null;
  const lng = hasGps ? Number(rawLng) : null;
  const photo = inc.photo_url || inc.photoDataUrl || null;

  return {
    id: inc.id,
    userId: inc.reporter_id || inc.userId,
    reporterRole: inc.reporter_role || (inc.userId && inc.userId.startsWith('driver') ? 'driver' : 'field'),
    nodeId: inc.node_id || inc.nodeId,
    road: inc.road,
    fromNode: inc.from_node || inc.fromNode || null,
    toNode: inc.to_node || inc.toNode || null,
    category: inc.category,
    severity: inc.severity,
    title: inc.title,
    description: inc.description || '',
    lat,
    lng,
    hasGps,
    photoDataUrl: photo,
    status: inc.status === 'open' ? 'active' : inc.status,
    synced: 1,
    clientId: inc.clientId || inc.client_id || null,
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

  const clientId = (body.clientId || body.clientSubmissionId || '').trim() || null;

  // 1. Idempotency Guard: Match by clientId (offline queue sync retransmissions)
  if (clientId) {
    try {
      const existingByClientId = db.prepare('SELECT * FROM field_reports WHERE clientId = ?').get(clientId);
      if (existingByClientId) {
        console.log(`[SupabaseService] Idempotency match by clientId: ${clientId}`);
        return { ...toFrontendReport(existingByClientId), clientId };
      }
    } catch (err) {
      console.warn('[SupabaseService] clientId lookup error:', err.message);
    }
  }

  // 2. Idempotency Guard: Match by explicit report id
  if (body.id) {
    try {
      const existingById = db.prepare('SELECT * FROM field_reports WHERE id = ?').get(body.id);
      if (existingById) {
        console.log(`[SupabaseService] Idempotency match by id: ${body.id}`);
        return { ...toFrontendReport(existingById), clientId: clientId || existingById.clientId || null };
      }
    } catch (_) {}
  }

  // 3. Rapid accidental double-submission guard (within 5 minutes)
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const cleanCategory = category === 'road_block' ? 'road_blockage' : category;
    const cleanRoad = (road || '').trim().toLowerCase();
    const cleanTitle = (title || '').trim().toLowerCase();
    const subLat = (lat !== undefined && lat !== null && lat !== '') ? Number(lat) : null;
    const subLng = (lng !== undefined && lng !== null && lng !== '') ? Number(lng) : null;

    const recentReports = db.prepare(`
      SELECT * FROM field_reports
      WHERE userId = ?
        AND status != 'resolved'
        AND createdAt >= ?
      ORDER BY createdAt DESC
    `).all(userId, fiveMinutesAgo);

    const duplicate = recentReports.find((r) => {
      const rCat = r.category === 'road_block' ? 'road_blockage' : r.category;
      if (rCat !== cleanCategory) return false;
      if ((r.title || '').trim().toLowerCase() !== cleanTitle) return false;
      if (((r.road || '').trim().toLowerCase()) !== cleanRoad) return false;

      // Geographically nearby check when GPS exists on both
      if (subLat !== null && subLng !== null && r.lat !== null && r.lat !== undefined && r.lng !== null && r.lng !== undefined) {
        const distDeg = Math.hypot(subLat - Number(r.lat), subLng - Number(r.lng));
        return distDeg < 0.01; // within ~1 km
      }

      // If GPS is unavailable on either, fallback duplicate key is matched
      return true;
    });

    if (duplicate) {
      console.log(`[SupabaseService] Rapid duplicate submission prevented for user ${userId}: "${title}"`);
      return { ...toFrontendReport(duplicate), clientId: clientId || duplicate.clientId || null };
    }
  } catch (err) {
    console.warn('[SupabaseService] Duplicate check warning:', err.message);
  }

  const id = body.id || uuid();

  // Validate photoDataUrl if provided
  let cleanPhoto = null;
  if (photoDataUrl && typeof photoDataUrl === 'string' && photoDataUrl.trim().length > 0) {
    const trimmedPhoto = photoDataUrl.trim();
    const isDataImage = /^data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,/i.test(trimmedPhoto);
    const isHttpUrl = /^https?:\/\/.+/i.test(trimmedPhoto);
    const isLocalPath = /^\/images\/.+/i.test(trimmedPhoto);
    if (!isDataImage && !isHttpUrl && !isLocalPath) {
      throw new Error('Invalid image format. Attached photos must be valid base64 image Data URLs (JPEG, PNG, WebP) or image URLs.');
    }
    cleanPhoto = trimmedPhoto;
  }

  const hasSubLat = lat !== undefined && lat !== null && lat !== '' && !isNaN(Number(lat));
  const hasSubLng = lng !== undefined && lng !== null && lng !== '' && !isNaN(Number(lng));
  const cleanLat = (hasSubLat && hasSubLng) ? Number(lat) : null;
  const cleanLng = (hasSubLat && hasSubLng) ? Number(lng) : null;

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
    lat: cleanLat,
    lng: cleanLng,
    photo_url: cleanPhoto,
    affected_modes: body.affectedMode ? [body.affectedMode] : ['road'],
    estimated_delay_minutes: Number(body.estimatedDelayMinutes) || 0,
    is_demo: false,
    clientId,
    client_id: clientId,
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
    db.prepare(`INSERT INTO field_reports (id,userId,nodeId,road,fromNode,toNode,category,severity,title,description,lat,lng,photoDataUrl,status,synced,clientId,createdAt)
      VALUES (@id,@userId,@nodeId,@road,@fromNode,@toNode,@category,@severity,@title,@description,@lat,@lng,@photoDataUrl,@status,@synced,@clientId,@createdAt)`)
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
        description: record.description || '',
        lat: record.lat,
        lng: record.lng,
        photoDataUrl: record.photo_url,
        status: 'open',
        synced: 1,
        clientId,
        createdAt: record.created_at,
      });
  } catch (err) {
    console.warn('[SupabaseService] field_reports insert error:', err.message);
  }

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
      incidentId: id,
      responseStatus: 'new',
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

    if (newStatus === 'resolved' || mappedStatus === 'resolved') {
      db.prepare("UPDATE alerts SET responseStatus = 'resolved', updatedAt = ? WHERE incidentId = ?").run(new Date().toISOString(), id);
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
  const { determineLocationSource } = require('../utils/shipmentIntelligence');
  const supabase = getSupabaseClient();
  if (supabase) {
    let query = supabase.from('vehicles').select('*');
    if (ownerId) query = query.eq('owner_id', ownerId);
    query = query.order('last_updated', { ascending: false });

    const { data, error } = await query;
    if (!error && data) {
      return data.map((v) => {
        const item = {
          id: v.id,
          ownerId: v.owner_id,
          driverId: v.driver_id,
          vehicleNumber: v.vehicle_number,
          vehicleType: v.vehicle_type || 'Heavy Truck',
          cargoType: v.cargo_type,
          capacityTonnes: v.capacity_tonnes || 16.0,
          originNode: v.origin_node,
          destinationNode: v.destination_node,
          status: v.status,
          lat: v.lat ?? null,
          lng: v.lng ?? null,
          lastUpdated: v.last_updated,
          isDemo: Boolean(v.is_demo),
        };
        item.locationSource = determineLocationSource(item);
        return item;
      });
    }
  }

  // SQLite fallback
  const rows = ownerId
    ? db.prepare('SELECT * FROM vehicles WHERE ownerId = ?').all(ownerId)
    : db.prepare('SELECT * FROM vehicles ORDER BY lastUpdated DESC').all();

  return rows.map((v) => {
    const item = {
      ...v,
      driverId: v.driverId || null,
      vehicleType: v.vehicleType || 'Heavy Truck',
      capacityTonnes: v.capacityTonnes || 16.0,
      isDemo: Boolean(v.isDemo),
      lat: v.lat ?? null,
      lng: v.lng ?? null,
    };
    item.locationSource = determineLocationSource(item);
    return item;
  });
}

async function createVehicle(userId, vehicleData) {
  const { determineLocationSource } = require('../utils/shipmentIntelligence');
  const id = vehicleData.id || uuid();
  const hasGps = vehicleData.lat !== undefined && vehicleData.lat !== null && vehicleData.lng !== undefined && vehicleData.lng !== null;
  const locationSource = hasGps ? (vehicleData.locationSource || 'STATIC_DEMO') : 'UNAVAILABLE';

  const record = {
    id,
    owner_id: userId,
    driver_id: vehicleData.driverId || userId,
    vehicle_number: vehicleData.vehicleNumber,
    vehicle_type: vehicleData.vehicleType || 'Heavy Truck',
    cargo_type: vehicleData.cargoType || 'General cargo',
    capacity_tonnes: vehicleData.capacityTonnes || 16.0,
    origin_node: vehicleData.originNode,
    destination_node: vehicleData.destinationNode,
    status: vehicleData.status || 'in_transit',
    lat: vehicleData.lat ?? null,
    lng: vehicleData.lng ?? null,
    location_source: locationSource,
    is_demo: false,
    last_updated: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('vehicles').insert(record);
  }

  try {
    db.prepare(`INSERT INTO vehicles (id,ownerId,driverId,vehicleNumber,vehicleType,cargoType,capacityTonnes,originNode,destinationNode,status,lat,lng,locationSource,isDemo,lastUpdated)
      VALUES (@id,@ownerId,@driverId,@vehicleNumber,@vehicleType,@cargoType,@capacityTonnes,@originNode,@destinationNode,@status,@lat,@lng,@locationSource,@isDemo,@lastUpdated)`)
      .run({
        id,
        ownerId: userId,
        driverId: record.driver_id,
        vehicleNumber: record.vehicle_number,
        vehicleType: record.vehicle_type,
        cargoType: record.cargo_type,
        capacityTonnes: record.capacity_tonnes,
        originNode: record.origin_node,
        destinationNode: record.destination_node,
        status: record.status,
        lat: record.lat,
        lng: record.lng,
        locationSource,
        isDemo: 0,
        lastUpdated: record.last_updated,
      });
  } catch (_) {}

  await logActivity(userId, 'vehicle_created', 'vehicle', id, `Vehicle ${vehicleData.vehicleNumber} registered.`);

  return {
    id,
    ownerId: userId,
    driverId: record.driver_id,
    vehicleNumber: record.vehicle_number,
    vehicleType: record.vehicle_type,
    cargoType: record.cargo_type,
    capacityTonnes: record.capacity_tonnes,
    originNode: record.origin_node,
    destinationNode: record.destination_node,
    status: record.status,
    lat: record.lat,
    lng: record.lng,
    locationSource,
    lastUpdated: record.last_updated,
    isDemo: false,
  };
}

async function updateVehicleLocation(id, userId, role, { lat, lng, status }) {
  const hasGps = lat !== undefined && lat !== null && lat !== '' && !isNaN(Number(lat)) &&
                 lng !== undefined && lng !== null && lng !== '' && !isNaN(Number(lng));
  const cleanLat = hasGps ? Number(lat) : null;
  const cleanLng = hasGps ? Number(lng) : null;
  const locationSource = hasGps ? 'LIVE_GPS' : 'UNAVAILABLE';

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: vehicle } = await supabase.from('vehicles').select('*').eq('id', id).maybeSingle();
    if (!vehicle) return { notFound: true };
    if (role !== 'official' && vehicle.owner_id !== userId && vehicle.driver_id !== userId) {
      return { forbidden: true };
    }

    const updates = {
      lat: cleanLat,
      lng: cleanLng,
      location_source: locationSource,
      last_updated: new Date().toISOString(),
    };
    if (status) updates.status = status;

    await supabase.from('vehicles').update(updates).eq('id', id);
    const { data: updated } = await supabase.from('vehicles').select('*').eq('id', id).single();
    return {
      vehicle: {
        id: updated.id,
        ownerId: updated.owner_id,
        driverId: updated.driver_id,
        vehicleNumber: updated.vehicle_number,
        vehicleType: updated.vehicle_type,
        cargoType: updated.cargo_type,
        capacityTonnes: updated.capacity_tonnes,
        originNode: updated.origin_node,
        destinationNode: updated.destination_node,
        status: updated.status,
        lat: updated.lat,
        lng: updated.lng,
        locationSource,
        lastUpdated: updated.last_updated,
        isDemo: Boolean(updated.is_demo),
      },
    };
  }

  // SQLite fallback
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  if (!vehicle) return { notFound: true };
  if (role !== 'official' && role !== 'logistics' && vehicle.ownerId !== userId && vehicle.driverId !== userId) {
    return { forbidden: true };
  }

  db.prepare('UPDATE vehicles SET lat = ?, lng = ?, status = COALESCE(?, status), locationSource = ?, lastUpdated = ? WHERE id = ?')
    .run(cleanLat, cleanLng, status || null, locationSource, new Date().toISOString(), id);
  const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
  return {
    vehicle: {
      ...updated,
      locationSource,
      isDemo: Boolean(updated.isDemo),
    },
  };
}

// =============================================================================
// 5. SHIPMENTS SERVICE
// =============================================================================
async function getShipments(userId = null, role = null) {
  const supabase = getSupabaseClient();
  let shipments = [];
  if (supabase) {
    let query = supabase.from('shipments').select('*');
    if (role === 'logistics' && userId) {
      query = query.eq('created_by', userId);
    }
    query = query.order('created_at', { ascending: false }).limit(100);

    const { data, error } = await query;
    if (!error && data) {
      shipments = data.map((s) => ({
        id: s.id,
        vehicleId: s.vehicle_id,
        driverId: s.driver_id,
        createdBy: s.created_by,
        originNode: s.origin_node,
        destinationNode: s.destination_node,
        cargoType: s.cargo_type,
        priority: s.priority,
        status: s.status,
        mode: s.mode || 'road',
        title: s.title || null,
        routeJson: s.route_json ? (typeof s.route_json === 'string' ? s.route_json : JSON.stringify(s.route_json)) : null,
        route: typeof s.route_json === 'object' ? s.route_json : (s.route_json ? JSON.parse(s.route_json) : null),
        etaMinutes: s.eta_minutes,
        createdAt: s.created_at,
        isDemo: s.is_demo,
      }));
    }
  } else {
    // SQLite fallback
    let rows = [];
    if (role === 'logistics' && userId) {
      rows = db.prepare('SELECT * FROM shipments WHERE createdBy = ? ORDER BY createdAt DESC').all(userId);
      if (rows.length === 0) {
        rows = db.prepare('SELECT * FROM shipments ORDER BY createdAt DESC LIMIT 100').all();
      }
    } else {
      rows = db.prepare('SELECT * FROM shipments ORDER BY createdAt DESC LIMIT 100').all();
    }
    shipments = rows.map((r) => ({
      ...r,
      mode: r.mode || 'road',
      route: r.routeJson ? JSON.parse(r.routeJson) : null,
      isDemo: Boolean(r.isDemo),
    }));
  }

  // Phase 4 Intelligence Enrichment
  const { enrichShipments } = require('../utils/shipmentIntelligence');
  const vehicles = await getVehicles();
  const disruptions = await getActiveDisruptions();
  const incidents = await getIncidents();

  return enrichShipments(shipments, vehicles, { disruptions, incidents });
}

async function getShipmentById(id) {
  const all = await getShipments();
  return all.find((s) => s.id === id) || null;
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
    status: shipmentData.status || 'planned',
    mode: shipmentData.mode || 'road',
    title: shipmentData.title || `${shipmentData.cargoType || 'Cargo'} (${shipmentData.originNode?.toUpperCase()} → ${shipmentData.destinationNode?.toUpperCase()})`,
    route_json: shipmentData.route ? shipmentData.route : null,
    eta_minutes: shipmentData.route ? shipmentData.route.etaMinutes : (shipmentData.etaMinutes || null),
    is_demo: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('shipments').insert(record);
  }

  try {
    db.prepare(`INSERT INTO shipments (id,vehicleId,driverId,createdBy,originNode,destinationNode,cargoType,priority,status,mode,title,routeJson,etaMinutes,isDemo,createdAt)
      VALUES (@id,@vehicleId,@driverId,@createdBy,@originNode,@destinationNode,@cargoType,@priority,@status,@mode,@title,@routeJson,@etaMinutes,@isDemo,@createdAt)`)
      .run({
        id,
        vehicleId: record.vehicle_id,
        driverId: record.driver_id,
        createdBy: userId,
        originNode: record.origin_node,
        destinationNode: record.destination_node,
        cargoType: record.cargo_type,
        priority: record.priority,
        status: record.status,
        mode: record.mode,
        title: record.title,
        routeJson: record.route_json ? JSON.stringify(record.route_json) : null,
        etaMinutes: record.eta_minutes,
        isDemo: 0,
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
    mode: record.mode,
    title: record.title,
    route: record.route_json,
    etaMinutes: record.eta_minutes,
    createdAt: record.created_at,
  };
}

async function updateShipmentStatus(id, userId, role, status) {
  const validStatuses = ['planned', 'assigned', 'loading', 'in_transit', 'delayed', 'delivered', 'blocked', 'cancelled', 'pending'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid shipment status: ${status}`);
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: shipment } = await supabase.from('shipments').select('*').eq('id', id).maybeSingle();
    if (!shipment) return { notFound: true };
    const isCreator = shipment.created_by === userId;
    const isAssignedDriver = role === 'driver' && shipment.driver_id === userId;
    if (role !== 'official' && role !== 'logistics' && !isCreator && !isAssignedDriver) {
      return { forbidden: true };
    }

    await supabase.from('shipments').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    const updated = await getShipmentById(id);
    return { shipment: updated };
  }

  // SQLite fallback
  const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  if (!existing) return { notFound: true };
  const isCreator = existing.createdBy === userId;
  const isAssignedDriver = role === 'driver' && existing.driverId === userId;
  if (role !== 'official' && role !== 'logistics' && !isCreator && !isAssignedDriver) {
    return { forbidden: true };
  }

  db.prepare('UPDATE shipments SET status = ? WHERE id = ?').run(status, id);
  const updated = await getShipmentById(id);
  return { shipment: updated };
}

async function assignDriverToShipment(id, userId, role, driverId) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: shipment } = await supabase.from('shipments').select('*').eq('id', id).maybeSingle();
    if (!shipment) return { notFound: true };
    if (role !== 'official' && role !== 'logistics') return { forbidden: true };

    await supabase.from('shipments').update({ driver_id: driverId, status: 'assigned', updated_at: new Date().toISOString() }).eq('id', id);
    await logActivity(userId, 'shipment_assigned', 'shipment', id, `Driver assigned to shipment ${id}`);
    const updated = await getShipmentById(id);
    return { shipment: updated };
  }

  // SQLite fallback
  const existing = db.prepare('SELECT * FROM shipments WHERE id = ?').get(id);
  if (!existing) return { notFound: true };
  if (role !== 'official' && role !== 'logistics') return { forbidden: true };

  db.prepare('UPDATE shipments SET driverId = ?, status = ? WHERE id = ?').run(driverId, 'assigned', id);
  await logActivity(userId, 'shipment_assigned', 'shipment', id, `Driver assigned to shipment ${id}`);
  const updated = await getShipmentById(id);
  return { shipment: updated };
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

  // SQLite fallback
  try {
    db.prepare(`INSERT INTO activity_logs (id, userId, action, entityType, entityId, description, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        uuid(), userId || null, action, entityType, entityId ? String(entityId) : null, description || '', record.created_at
      );
  } catch (_) {}
}

async function getActivityLogs(limit = 25) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data && data.length > 0) {
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

  // SQLite fallback
  try {
    const rows = db.prepare('SELECT * FROM activity_logs ORDER BY createdAt DESC LIMIT ?').all(limit);
    if (rows && rows.length > 0) {
      return rows.map((a) => ({
        id: a.id,
        userId: a.userId,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        description: a.description,
        createdAt: a.createdAt,
      }));
    }
  } catch (_) {}

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
  // Alerts & Response Lifecycle (Phase 6)
  getAlerts,
  getAlertById,
  getAlertResponses,
  recordAlertResponse,
  getAllowedActionsForRole,
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
  getShipmentById,
  createShipment,
  updateShipmentStatus,
  assignDriverToShipment,
  // Logging
  logActivity,
  getActivityLogs,
  CATEGORIES,
  SEVERITIES,
};
