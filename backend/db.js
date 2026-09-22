const { DatabaseSync: Database } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { NODES } = require('./data/nerNetwork');

const db = new Database(path.join(__dirname, 'ner_sahayak.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('driver','field','logistics','official')),
  organisation TEXT,
  vehicleNumber TEXT,
  state TEXT,
  district TEXT,
  language TEXT DEFAULT 'en',
  hub TEXT,
  department TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tone TEXT NOT NULL,
  icon TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  nodeId TEXT,
  road TEXT,
  severity TEXT NOT NULL DEFAULT 'minor',
  createdAt TEXT NOT NULL,
  createdBy TEXT
);

CREATE TABLE IF NOT EXISTS field_reports (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  nodeId TEXT,
  road TEXT,
  fromNode TEXT,
  toNode TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'minor',
  title TEXT NOT NULL,
  description TEXT,
  lat REAL,
  lng REAL,
  photoDataUrl TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  synced INTEGER NOT NULL DEFAULT 1,
  clientId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  driverId TEXT,
  vehicleNumber TEXT NOT NULL,
  vehicleType TEXT DEFAULT 'Heavy Truck',
  cargoType TEXT,
  capacityTonnes REAL DEFAULT 16.0,
  originNode TEXT,
  destinationNode TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  lat REAL,
  lng REAL,
  locationSource TEXT DEFAULT 'STATIC_DEMO',
  isDemo INTEGER DEFAULT 1,
  lastUpdated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  vehicleId TEXT,
  driverId TEXT,
  createdBy TEXT NOT NULL,
  originNode TEXT NOT NULL,
  destinationNode TEXT NOT NULL,
  cargoType TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'planned',
  mode TEXT DEFAULT 'road',
  title TEXT,
  routeJson TEXT,
  etaMinutes INTEGER,
  isDemo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_responses (
  id TEXT PRIMARY KEY,
  alertId TEXT NOT NULL,
  incidentId TEXT,
  actorUserId TEXT NOT NULL,
  actorName TEXT,
  actorRole TEXT NOT NULL,
  actionType TEXT NOT NULL,
  previousStatus TEXT NOT NULL,
  newStatus TEXT NOT NULL,
  note TEXT,
  assignedTo TEXT,
  clientId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  userId TEXT,
  action TEXT NOT NULL,
  entityType TEXT,
  entityId TEXT,
  description TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
`);

try {
  db.exec('ALTER TABLE field_reports ADD COLUMN clientId TEXT');
} catch (_) {}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_field_reports_client_id ON field_reports(clientId)');
} catch (_) {}

// Phase 4 Migrations
try { db.exec('ALTER TABLE vehicles ADD COLUMN driverId TEXT'); } catch (_) {}
try { db.exec("ALTER TABLE vehicles ADD COLUMN vehicleType TEXT DEFAULT 'Heavy Truck'"); } catch (_) {}
try { db.exec('ALTER TABLE vehicles ADD COLUMN capacityTonnes REAL DEFAULT 16.0'); } catch (_) {}
try { db.exec("ALTER TABLE vehicles ADD COLUMN locationSource TEXT DEFAULT 'STATIC_DEMO'"); } catch (_) {}
try { db.exec('ALTER TABLE vehicles ADD COLUMN isDemo INTEGER DEFAULT 1'); } catch (_) {}
try { db.exec("ALTER TABLE shipments ADD COLUMN mode TEXT DEFAULT 'road'"); } catch (_) {}
try { db.exec('ALTER TABLE shipments ADD COLUMN title TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE shipments ADD COLUMN isDemo INTEGER DEFAULT 1'); } catch (_) {}

// Phase 6 Migrations
try { db.exec('ALTER TABLE alerts ADD COLUMN incidentId TEXT'); } catch (_) {}
try { db.exec("ALTER TABLE alerts ADD COLUMN responseStatus TEXT DEFAULT 'new'"); } catch (_) {}
try { db.exec('ALTER TABLE alerts ADD COLUMN assignedTo TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE alerts ADD COLUMN assignedRole TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE alerts ADD COLUMN latestAction TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE alerts ADD COLUMN latestNote TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE alerts ADD COLUMN updatedAt TEXT'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_alert_responses_alert ON alert_responses(alertId)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_alert_responses_incident ON alert_responses(incidentId)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_alert_responses_client ON alert_responses(clientId)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(createdAt DESC)'); } catch (_) {}

// --- Seed demo accounts (idempotent) ---
const seedUsers = [
  { name: 'Arjun Bora', email: 'arjun@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 01 K 4309', state: 'Assam', district: 'Kamrup Metropolitan', language: 'as' },
  { name: 'Bikram Das', email: 'bikram@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 02 C 8812', state: 'Assam', district: 'Nagaon', language: 'as' },
  { name: 'Chandan Kalita', email: 'chandan@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 06 F 1045', state: 'Assam', district: 'Dibrugarh', language: 'as' },
  { name: 'Dipankar Saikia', email: 'dipankar@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'TR 01 A 5521', state: 'Tripura', district: 'Agartala', language: 'bn' },
  { name: 'Eshaan Chettri', email: 'eshaan@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'SK 04 P 9934', state: 'Sikkim', district: 'Gangtok', language: 'en' },
  { name: 'Farhan Ahmed', email: 'farhan@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'ML 05 D 7710', state: 'Meghalaya', district: 'Shillong', language: 'kha' },
  { name: 'Gautam Gogoi', email: 'gautam@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AS 03 E 4482', state: 'Assam', district: 'Jorhat', language: 'as' },
  { name: 'Haokip Zou', email: 'haokip@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'MN 01 L 3319', state: 'Manipur', district: 'Imphal', language: 'mni' },
  { name: 'Inaobi Singh', email: 'inaobi@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'NL 07 B 2291', state: 'Nagaland', district: 'Dimapur', language: 'nag' },
  { name: 'Jiten Teron', email: 'jiten@ner-sahayak.in', role: 'driver', organisation: 'Registered Driver', vehicleNumber: 'AR 02 H 6604', state: 'Arunachal Pradesh', district: 'Itanagar', language: 'en' },
  { name: 'Priya Deka', email: 'priya@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit, Nagaon', state: 'Assam', district: 'Nagaon', language: 'as' },
  { name: 'Amitabh Sharma', email: 'amitabh@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Assam', district: 'Guwahati', language: 'hi' },
  { name: 'Ritu Phukan', email: 'ritu@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Assam', district: 'Tezpur', language: 'as' },
  { name: 'Samuel Sangma', email: 'samuel@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Meghalaya', district: 'Tura', language: 'en' },
  { name: 'Lalmingthanga', email: 'lalmingthanga@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Mizoram', district: 'Aizawl', language: 'en' },
  { name: 'Zothanpari', email: 'zothanpari@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Mizoram', district: 'Lunglei', language: 'en' },
  { name: 'Khupkholam', email: 'khupkholam@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Manipur', district: 'Churachandpur', language: 'en' },
  { name: 'Sanjita Devi', email: 'sanjita@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Manipur', district: 'Imphal', language: 'mni' },
  { name: 'Tashi Namgyal', email: 'tashi@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Arunachal Pradesh', district: 'Tawang', language: 'en' },
  { name: 'Millo Tarin', email: 'millo@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Arunachal Pradesh', district: 'Ziro', language: 'en' },
  { name: 'Subhash Deb', email: 'subhash@ner-sahayak.in', role: 'field', organisation: 'PWD Field Unit', state: 'Tripura', district: 'Agartala', language: 'bn' },
  { name: 'Rohan Sharma', email: 'rohan@ner-sahayak.in', role: 'logistics', organisation: 'NER Freight Movers', hub: 'Khanapara Hub', state: 'Assam', district: 'Kamrup Metropolitan', language: 'hi' },
  { name: 'Ananya Gogoi', email: 'ananya@ner-sahayak.in', role: 'official', organisation: 'DoNER Regional Office', department: 'Disaster Management', state: 'Assam', district: 'Kamrup Metropolitan', language: 'en' },
  { name: 'Naveen Jindal', email: 'naveen@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Assam', district: 'Guwahati', language: 'en' },
  { name: 'Sneha Boro', email: 'sneha@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Assam', district: 'Tezpur', language: 'en' },
  { name: 'Wanlamkupar', email: 'wanlamkupar@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Meghalaya', district: 'Shillong', language: 'en' },
  { name: 'Biakzuala', email: 'biakzuala@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Mizoram', district: 'Aizawl', language: 'en' },
  { name: 'R. K. Singh', email: 'rk.singh@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Manipur', district: 'Imphal', language: 'en' },
  { name: 'Neiphiu', email: 'neiphiu@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Nagaland', district: 'Kohima', language: 'en' },
  { name: 'Sentila', email: 'sentila@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Nagaland', district: 'Dimapur', language: 'en' },
  { name: 'Pema', email: 'pema@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Arunachal Pradesh', district: 'Itanagar', language: 'en' },
  { name: 'Karma Bhutia', email: 'karma@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Infrastructure', state: 'Sikkim', district: 'Gangtok', language: 'en' },
  { name: 'Sushmita Sen', email: 'sushmita@ner-sahayak.in', role: 'official', organisation: 'DoNER', department: 'Disaster Management', state: 'Tripura', district: 'Agartala', language: 'en' },
];

const insertUser = db.prepare(`INSERT OR IGNORE INTO users
  (id,name,email,passwordHash,phone,role,organisation,vehicleNumber,state,district,language,hub,department,createdAt)
  VALUES (@id,@name,@email,@passwordHash,@phone,@role,@organisation,@vehicleNumber,@state,@district,@language,@hub,@department,@createdAt)`);

const existing = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (existing === 0) {
  const passwordHash = bcrypt.hashSync('sahayak123', 8);
  seedUsers.forEach((u) => {
    insertUser.run({
      id: uuid(),
      phone: '+91 90000 00000',
      vehicleNumber: null,
      hub: null,
      department: null,
      ...u,
      passwordHash,
      createdAt: new Date().toISOString(),
    });
  });

  // Seed alerts
  const insertAlert = db.prepare(`INSERT INTO alerts (id,type,tone,icon,title,text,nodeId,road,severity,createdAt,createdBy)
    VALUES (@id,@type,@tone,@icon,@title,@text,@nodeId,@road,@severity,@createdAt,@createdBy)`);
  insertAlert.run({ id: uuid(), type: 'Weather watch', tone: 'amber', icon: 'cloud', title: 'Heavy rainfall expected near Nagaon', text: 'Plan for slower movement along NH27 this afternoon.', nodeId: 'nagaon', road: 'NH27', severity: 'moderate', createdAt: new Date().toISOString(), createdBy: 'system' });
  insertAlert.run({ id: uuid(), type: 'Route update', tone: 'blue', icon: 'route', title: 'Alternate route via Morigaon clear', text: 'The bypass via Morigaon is available for light vehicles.', nodeId: 'nagaon', road: 'NH27', severity: 'minor', createdAt: new Date().toISOString(), createdBy: 'system' });

  // Seed field reports (issues and solved)
  const insertReport = db.prepare(`INSERT INTO field_reports (id,userId,nodeId,road,fromNode,toNode,category,severity,title,description,lat,lng,status,synced,createdAt)
    VALUES (@id,@userId,@nodeId,@road,@fromNode,@toNode,@category,@severity,@title,@description,@lat,@lng,@status,@synced,@createdAt)`);
  const fieldUser = db.prepare('SELECT id FROM users WHERE email = ?').get('priya@ner-sahayak.in');
  insertReport.run({ id: uuid(), userId: fieldUser.id, nodeId: 'nagaon', road: 'NH27', fromNode: 'guwahati', toNode: 'nagaon', category: 'landslide', severity: 'high', title: 'Landslide on NH27', description: 'Debris blocking one lane.', lat: 26.25, lng: 92.2, status: 'open', synced: 1, createdAt: new Date().toISOString() });
  insertReport.run({ id: uuid(), userId: fieldUser.id, nodeId: 'tezpur', road: 'NH15', fromNode: 'tezpur', toNode: 'jorhat', category: 'flood', severity: 'medium', title: 'Waterlogging near Tezpur', description: 'Slow movement.', lat: 26.6, lng: 92.7, status: 'open', synced: 1, createdAt: new Date().toISOString() });
  insertReport.run({ id: uuid(), userId: fieldUser.id, nodeId: 'shillong', road: 'NH6', fromNode: 'guwahati', toNode: 'shillong', category: 'road_block', severity: 'minor', title: 'Clearing work', description: 'Road block removed.', lat: 25.8, lng: 91.8, status: 'resolved', synced: 1, createdAt: new Date().toISOString() });
}

// Ensure fleet vehicles are seeded (idempotent)
const vehicleCount = db.prepare('SELECT COUNT(*) c FROM vehicles').get().c;
if (vehicleCount < 5) {
  const rohan = db.prepare('SELECT id FROM users WHERE email = ?').get('rohan@ner-sahayak.in');
  const ownerId = rohan ? rohan.id : uuid();

  const driverEmails = [
    'arjun@ner-sahayak.in',
    'bikram@ner-sahayak.in',
    'chandan@ner-sahayak.in',
    'dipankar@ner-sahayak.in',
    'eshaan@ner-sahayak.in',
    'farhan@ner-sahayak.in',
    'gautam@ner-sahayak.in',
    'haokip@ner-sahayak.in',
    'inaobi@ner-sahayak.in',
    'jiten@ner-sahayak.in',
  ];

  const driverMap = {};
  driverEmails.forEach((email) => {
    const u = db.prepare('SELECT id, vehicleNumber FROM users WHERE email = ?').get(email);
    if (u) driverMap[email] = u;
  });

  const fleetSeed = [
    { id: 'veh-001', driverEmail: 'arjun@ner-sahayak.in', vehicleNumber: 'AS 01 K 4309', vehicleType: 'Heavy Truck', capacityTonnes: 16.0, cargoType: 'Medical supplies', originNode: 'guwahati', destinationNode: 'nagaon', status: 'in_transit', lat: 26.1445, lng: 91.7362 },
    { id: 'veh-002', driverEmail: 'bikram@ner-sahayak.in', vehicleNumber: 'AS 02 C 8812', vehicleType: 'Heavy Truck', capacityTonnes: 16.0, cargoType: 'Pharmaceuticals', originNode: 'guwahati', destinationNode: 'jorhat', status: 'in_transit', lat: 26.3452, lng: 92.6841 },
    { id: 'veh-003', driverEmail: 'chandan@ner-sahayak.in', vehicleNumber: 'AS 06 F 1045', vehicleType: 'Container Trailer', capacityTonnes: 24.0, cargoType: 'FMCG Food Grains', originNode: 'siliguri', destinationNode: 'guwahati', status: 'in_transit', lat: 26.7271, lng: 88.3953 },
    { id: 'veh-004', driverEmail: 'dipankar@ner-sahayak.in', vehicleNumber: 'TR 01 A 5521', vehicleType: 'Medium Commercial', capacityTonnes: 10.0, cargoType: 'Fresh Produce', originNode: 'agartala', destinationNode: 'silchar', status: 'in_transit', lat: 23.8315, lng: 91.2868 },
    { id: 'veh-005', driverEmail: 'eshaan@ner-sahayak.in', vehicleNumber: 'SK 04 P 9934', vehicleType: 'Refrigerated Carrier', capacityTonnes: 8.0, cargoType: 'Hospital Oxygen Cylinders', originNode: 'siliguri', destinationNode: 'gangtok', status: 'in_transit', lat: 27.3389, lng: 88.6065 },
    { id: 'veh-006', driverEmail: 'farhan@ner-sahayak.in', vehicleNumber: 'ML 05 D 7710', vehicleType: 'Heavy Truck', capacityTonnes: 16.0, cargoType: 'Bridge Reconstruction Steel', originNode: 'guwahati', destinationNode: 'shillong', status: 'in_transit', lat: 25.5788, lng: 91.8933 },
    { id: 'veh-007', driverEmail: 'gautam@ner-sahayak.in', vehicleNumber: 'AS 03 E 4482', vehicleType: 'Medium Commercial', capacityTonnes: 10.0, cargoType: 'Educational Textbooks', originNode: 'guwahati', destinationNode: 'tezpur', status: 'in_transit', lat: 26.6528, lng: 92.7926 },
    { id: 'veh-008', driverEmail: 'haokip@ner-sahayak.in', vehicleNumber: 'MN 01 L 3319', vehicleType: 'Light Commercial Vehicle', capacityTonnes: 4.5, cargoType: 'Baby Food & Infant Care', originNode: 'imphal', destinationNode: 'churachandpur', status: 'in_transit', lat: 24.8170, lng: 93.9368 },
    { id: 'veh-009', driverEmail: 'inaobi@ner-sahayak.in', vehicleNumber: 'NL 07 B 2291', vehicleType: 'Heavy Truck', capacityTonnes: 16.0, cargoType: 'Disaster Relief Tents', originNode: 'guwahati', destinationNode: 'dimapur', status: 'in_transit', lat: 25.9068, lng: 93.7271 },
    { id: 'veh-010', driverEmail: 'jiten@ner-sahayak.in', vehicleNumber: 'AR 02 H 6604', vehicleType: 'Heavy Truck', capacityTonnes: 16.0, cargoType: 'Essential Rations', originNode: 'dimapur', destinationNode: 'kohima', status: 'in_transit', lat: 25.6751, lng: 94.1086 },
    { id: 'veh-011', driverEmail: null, vehicleNumber: 'AS 01 M 1205', vehicleType: 'Tanker', capacityTonnes: 20.0, cargoType: 'Petroleum / Diesel', originNode: 'guwahati', destinationNode: 'tezpur', status: 'idle', lat: 26.1445, lng: 91.7362 },
    { id: 'veh-012', driverEmail: null, vehicleNumber: 'MZ 01 D 8920', vehicleType: 'Medium Commercial', capacityTonnes: 10.0, cargoType: 'Water Purification Systems', originNode: 'aizawl', destinationNode: 'lunglei', status: 'idle', lat: 23.7271, lng: 92.7176 },
  ];

  const insertVehicleStmt = db.prepare(`INSERT OR REPLACE INTO vehicles
    (id, ownerId, driverId, vehicleNumber, vehicleType, cargoType, capacityTonnes, originNode, destinationNode, status, lat, lng, locationSource, isDemo, lastUpdated)
    VALUES (@id, @ownerId, @driverId, @vehicleNumber, @vehicleType, @cargoType, @capacityTonnes, @originNode, @destinationNode, @status, @lat, @lng, @locationSource, @isDemo, @lastUpdated)`);

  fleetSeed.forEach((v) => {
    const driver = v.driverEmail ? driverMap[v.driverEmail] : null;
    insertVehicleStmt.run({
      id: v.id,
      ownerId: ownerId,
      driverId: driver ? driver.id : null,
      vehicleNumber: v.vehicleNumber,
      vehicleType: v.vehicleType,
      cargoType: v.cargoType,
      capacityTonnes: v.capacityTonnes,
      originNode: v.originNode,
      destinationNode: v.destinationNode,
      status: v.status,
      lat: v.lat,
      lng: v.lng,
      locationSource: 'STATIC_DEMO',
      isDemo: 1,
      lastUpdated: new Date().toISOString(),
    });
  });
}

// Ensure shipments are seeded (idempotent)
const shipmentCount = db.prepare('SELECT COUNT(*) c FROM shipments').get().c;
if (shipmentCount < 5) {
  const rohan = db.prepare('SELECT id FROM users WHERE email = ?').get('rohan@ner-sahayak.in');
  const createdBy = rohan ? rohan.id : uuid();

  const driverEmails = [
    'arjun@ner-sahayak.in',
    'bikram@ner-sahayak.in',
    'chandan@ner-sahayak.in',
    'dipankar@ner-sahayak.in',
    'eshaan@ner-sahayak.in',
    'farhan@ner-sahayak.in',
    'gautam@ner-sahayak.in',
    'haokip@ner-sahayak.in',
    'inaobi@ner-sahayak.in',
    'jiten@ner-sahayak.in',
  ];

  const driverMap = {};
  driverEmails.forEach((email) => {
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (u) driverMap[email] = u.id;
  });

  const shipmentSeed = [
    { id: 'shp-001', vehicleId: 'veh-001', driverEmail: 'arjun@ner-sahayak.in', originNode: 'guwahati', destinationNode: 'nagaon', cargoType: 'Medical Supplies', priority: 'emergency', status: 'in_transit', etaMinutes: 140 },
    { id: 'shp-002', vehicleId: 'veh-002', driverEmail: 'bikram@ner-sahayak.in', originNode: 'guwahati', destinationNode: 'jorhat', cargoType: 'Pharmaceuticals', priority: 'high', status: 'in_transit', etaMinutes: 320 },
    { id: 'shp-003', vehicleId: 'veh-003', driverEmail: 'chandan@ner-sahayak.in', originNode: 'siliguri', destinationNode: 'guwahati', cargoType: 'FMCG Food Grains', priority: 'normal', status: 'in_transit', etaMinutes: 480 },
    { id: 'shp-004', vehicleId: 'veh-004', driverEmail: 'dipankar@ner-sahayak.in', originNode: 'agartala', destinationNode: 'silchar', cargoType: 'Fresh Agricultural Produce', priority: 'normal', status: 'in_transit', etaMinutes: 350 },
    { id: 'shp-005', vehicleId: 'veh-005', driverEmail: 'eshaan@ner-sahayak.in', originNode: 'siliguri', destinationNode: 'gangtok', cargoType: 'Hospital Oxygen Cylinders', priority: 'critical', status: 'in_transit', etaMinutes: 190 },
    { id: 'shp-006', vehicleId: 'veh-006', driverEmail: 'farhan@ner-sahayak.in', originNode: 'guwahati', destinationNode: 'shillong', cargoType: 'Bridge Reconstruction Steel', priority: 'high', status: 'in_transit', etaMinutes: 160 },
    { id: 'shp-007', vehicleId: 'veh-007', driverEmail: 'gautam@ner-sahayak.in', originNode: 'guwahati', destinationNode: 'tezpur', cargoType: 'Educational Textbooks', priority: 'normal', status: 'in_transit', etaMinutes: 210 },
    { id: 'shp-008', vehicleId: 'veh-008', driverEmail: 'haokip@ner-sahayak.in', originNode: 'imphal', destinationNode: 'churachandpur', cargoType: 'Infant Nutrition & Medicines', priority: 'urgent', status: 'in_transit', etaMinutes: 110 },
    { id: 'shp-009', vehicleId: 'veh-009', driverEmail: 'inaobi@ner-sahayak.in', originNode: 'guwahati', destinationNode: 'dimapur', cargoType: 'Disaster Relief Tents', priority: 'emergency', status: 'in_transit', etaMinutes: 300 },
    { id: 'shp-010', vehicleId: 'veh-010', driverEmail: 'jiten@ner-sahayak.in', originNode: 'dimapur', destinationNode: 'kohima', cargoType: 'Essential Rations', priority: 'high', status: 'in_transit', etaMinutes: 130 },
    { id: 'shp-011', vehicleId: null, driverEmail: null, originNode: 'guwahati', destinationNode: 'dibrugarh', cargoType: 'Industrial Machinery', priority: 'normal', status: 'planned', etaMinutes: 440 },
    { id: 'shp-012', vehicleId: null, driverEmail: null, originNode: 'aizawl', destinationNode: 'lunglei', cargoType: 'Water Purification Kits', priority: 'urgent', status: 'planned', etaMinutes: 240 },
  ];

  const insertShipmentStmt = db.prepare(`INSERT OR REPLACE INTO shipments
    (id, vehicleId, driverId, createdBy, originNode, destinationNode, cargoType, priority, status, mode, title, etaMinutes, isDemo, createdAt)
    VALUES (@id, @vehicleId, @driverId, @createdBy, @originNode, @destinationNode, @cargoType, @priority, @status, @mode, @title, @etaMinutes, @isDemo, @createdAt)`);

  shipmentSeed.forEach((s) => {
    insertShipmentStmt.run({
      id: s.id,
      vehicleId: s.vehicleId,
      driverId: s.driverEmail ? driverMap[s.driverEmail] || null : null,
      createdBy: createdBy,
      originNode: s.originNode,
      destinationNode: s.destinationNode,
      cargoType: s.cargoType,
      priority: s.priority,
      status: s.status,
      mode: 'road',
      title: `${s.cargoType} (${s.originNode.toUpperCase()} → ${s.destinationNode.toUpperCase()})`,
      etaMinutes: s.etaMinutes,
      isDemo: 1,
      createdAt: new Date().toISOString(),
    });
  });
}

module.exports = db;
