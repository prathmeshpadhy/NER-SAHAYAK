const { NODES, EDGES } = require('./data/nerNetwork');
const { findRoute } = require('./utils/dijkstra');

const nodes = NODES.filter(n => n.type !== 'airport'); // test main cities

let pass = 0;
let fail = 0;
const fails = [];

for (const a of nodes) {
  for (const b of nodes) {
    if (a.id === b.id) continue;
    try {
      const r = findRoute(a.id, b.id, { mode: 'all' });
      if (!r) {
        fail++;
        fails.push(`${a.id} -> ${b.id}`);
      } else {
        pass++;
      }
    } catch (e) {
      fail++;
      fails.push(`${a.id} -> ${b.id} (Error: ${e.message})`);
    }
  }
}

console.log(`Tested ${pass + fail} pairs.`);
console.log(`Pass: ${pass}`);
console.log(`Fail: ${fail}`);
if (fails.length > 0) {
  console.log('Failures:');
  console.log(fails.slice(0, 20).join('\n'));
}

// Test specific mode
console.log('\nTesting mode = road');
let roadFail = 0;
for (const a of nodes) {
  for (const b of nodes) {
    if (a.id === b.id) continue;
    try {
      const r = findRoute(a.id, b.id, { mode: 'road' });
      if (!r) {
        roadFail++;
      }
    } catch (e) {
      roadFail++;
    }
  }
}
console.log(`Road Fails: ${roadFail}`);

// Let's also check Jowai -> Ziro specifically
console.log('\nChecking jowai -> ziro');
const r = findRoute('jowai', 'ziro', { mode: 'road' });
console.log('jowai -> ziro:', r ? 'FOUND' : 'NOT FOUND');
