const http = require('http');

const testCases = [
  { originId: 'guwahati', destinationId: 'imphal', cargoType: 'Heavy Cargo', weight: 5000, priority: 'Normal' },
  { originId: 'guwahati', destinationId: 'dibrugarh', cargoType: 'Pharmaceutical / Medicine', weight: 200, priority: 'High' },
  { originId: 'guwahati', destinationId: 'agartala', cargoType: 'Emergency Supplies', weight: 100, priority: 'Emergency', emergencyMode: true }
];

async function login() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email: 'rohan@ner-sahayak.in', password: 'sahayak123' });
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data).token));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTest(tc, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(tc);
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/network/compare',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

(async () => {
  const token = await login();
  console.log('Got token:', token ? 'YES' : 'NO');
  for (let i = 0; i < testCases.length; i++) {
    const res = await runTest(testCases[i], token);
    if (res.error) {
      console.log(`\n--- Test Case ${i + 1} (${testCases[i].cargoType}) ---`);
      console.log(`Error: ${res.error}`);
      continue;
    }
    console.log(`\n--- Test Case ${i + 1} (${testCases[i].cargoType}) ---`);
    console.log(`Recommended Mode: ${res.recommendation?.mode?.toUpperCase()}`);
    console.log(`Reason: ${res.recommendation?.reason}`);
    
    // Log ETA and Safety for available routes
    Object.keys(res.routes || {}).forEach(mode => {
      const r = res.routes[mode];
      if (r) {
        console.log(`  [${mode.toUpperCase()}] ETA: ${r.etaMinutes}m, Safety: ${r.safetyIndex}%, Dist: ${r.totalKm}km`);
      } else {
        console.log(`  [${mode.toUpperCase()}] Unavailable`);
      }
    });
  }
})();
