const db = require('./db');
const bcrypt = require('bcryptjs');

function run() {
  const hash = bcrypt.hashSync('password123', 10);
  
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, role, email, passwordHash, phone, organisation, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  const now = new Date().toISOString();

  // Insert 10 Drivers
  for (let i = 1; i <= 10; i++) {
    insertUser.run(`driver-${i}`, `Driver ${i}`, 'driver', `driver${i}@test.com`, hash, `987654321${i}`, 'NER Logistics Co.', now);
  }

  // Insert 10 Govt Officers
  for (let i = 1; i <= 10; i++) {
    insertUser.run(`official-${i}`, `Govt Officer ${i}`, 'official', `official${i}@gov.in`, hash, `887654321${i}`, 'Ministry of Transport', now);
  }

  // Insert 10 Field Officers
  for (let i = 1; i <= 10; i++) {
    insertUser.run(`field-${i}`, `Field Officer ${i}`, 'field', `field${i}@ner.in`, hash, `787654321${i}`, 'NER Field Ops', now);
  }

  // Insert Field Reports
  const insertReport = db.prepare(`
    INSERT OR IGNORE INTO field_reports 
    (id, userId, title, category, severity, road, fromNode, toNode, description, status, lat, lng, createdAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const reports = [
    { id: 'rep-1', cat: 'landslide', title: 'Landslide on NH6', sev: 'high', road: 'NH6', from: 'shillong', to: 'jowai', desc: 'Major landslide blocking the road.', status: 'open', by: 'field-1' },
    { id: 'rep-2', cat: 'flood', title: 'Flooding near Nagaon', sev: 'medium', road: 'NH27', from: 'guwahati', to: 'nagaon', desc: 'Waterlogging on highway.', status: 'resolved', by: 'field-2' },
    { id: 'rep-3', cat: 'bridge_damage', title: 'Bridge Damage', sev: 'critical', road: 'NH415', from: 'tezpur', to: 'itanagar', desc: 'Bridge structural crack spotted.', status: 'open', by: 'field-3' },
    { id: 'rep-4', cat: 'road_block', title: 'Protest blocking road', sev: 'minor', road: 'NH29', from: 'dimapur', to: 'kohima', desc: 'Protest blocking road.', status: 'resolved', by: 'field-4' },
    { id: 'rep-5', cat: 'accident', title: 'Truck overturned', sev: 'medium', road: 'NH37', from: 'silchar', to: 'karimganj', desc: 'Truck overturned.', status: 'resolved', by: 'field-5' }
  ];

  for (const r of reports) {
    try {
      insertReport.run(r.id, r.by, r.title, r.cat, r.sev, r.road, r.from, r.to, r.desc, r.status, 26.0, 92.0, now);
    } catch (e) {
      console.log('Skipped duplicate report', r.id, e);
    }
  }

  console.log('Seed completed successfully.');
}

run();
