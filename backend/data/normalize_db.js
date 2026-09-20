const db = require('../db');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { DRIVER_PROFILES, LOGISTICS_PROFILES, FIELD_PROFILES, OFFICIAL_PROFILES } = require('./seedSupabase');

const passwordHash = bcrypt.hashSync('sahayak123', 8);

// Remove mock duplicate accounts
db.prepare("DELETE FROM users WHERE email LIKE '%@test.com' OR email LIKE '%@ner.in' OR email LIKE '%@gov.in'").run();

// Ensure 10 drivers
const insertUser = db.prepare(`INSERT OR REPLACE INTO users 
  (id, name, email, passwordHash, phone, role, organisation, vehicleNumber, state, district, language, hub, department, createdAt)
  VALUES (@id, @name, @email, @passwordHash, @phone, @role, @organisation, @vehicleNumber, @state, @district, @language, @hub, @department, @createdAt)`);

const allUsers = [
  ...DRIVER_PROFILES.map(d => ({
    id: d.id,
    name: d.name,
    email: d.email,
    passwordHash,
    phone: d.phone,
    role: d.role,
    organisation: d.organisation,
    vehicleNumber: d.vehicle_number,
    state: d.state,
    district: d.district,
    language: d.language,
    hub: null,
    department: null,
    createdAt: new Date().toISOString(),
  })),
  ...LOGISTICS_PROFILES.map(l => ({
    id: l.id,
    name: l.name,
    email: l.email,
    passwordHash,
    phone: l.phone,
    role: l.role,
    organisation: l.organisation,
    vehicleNumber: null,
    state: l.state,
    district: l.district,
    language: l.language,
    hub: l.hub,
    department: null,
    createdAt: new Date().toISOString(),
  })),
  ...FIELD_PROFILES.map(f => ({
    id: f.id,
    name: f.name,
    email: f.email,
    passwordHash,
    phone: f.phone,
    role: f.role,
    organisation: f.organisation,
    vehicleNumber: null,
    state: f.state,
    district: f.district,
    language: f.language,
    hub: null,
    department: f.department,
    createdAt: new Date().toISOString(),
  })),
  ...OFFICIAL_PROFILES.map(o => ({
    id: o.id,
    name: o.name,
    email: o.email,
    passwordHash,
    phone: o.phone,
    role: o.role,
    organisation: o.organisation,
    vehicleNumber: null,
    state: o.state,
    district: o.district,
    language: o.language,
    hub: null,
    department: o.department,
    createdAt: new Date().toISOString(),
  })),
];

allUsers.forEach(u => insertUser.run(u));

const driverCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'driver'").get().c;
const totalCount = db.prepare("SELECT COUNT(*) c FROM users").get().c;
console.log(`Database normalized. Drivers: ${driverCount}, Total Users: ${totalCount}`);
