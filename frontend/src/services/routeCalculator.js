// Client-side Multimodal Safety-Prioritized Router
// Computes Road, NFR Railway, and IWAI Waterway (NW-2/NW-16) routes offline.

export const NODES = [
  { id: 'guwahati',    name: 'Guwahati',    state: 'Assam',            lat: 26.1445, lng: 91.7362, type: 'hub' },
  { id: 'tezpur',      name: 'Tezpur',      state: 'Assam',            lat: 26.6528, lng: 92.7926, type: 'town' },
  { id: 'nagaon',      name: 'Nagaon',      state: 'Assam',            lat: 26.3480, lng: 92.6840, type: 'town' },
  { id: 'jorhat',      name: 'Jorhat',      state: 'Assam',            lat: 26.7509, lng: 94.2037, type: 'town' },
  { id: 'dibrugarh',   name: 'Dibrugarh',   state: 'Assam',            lat: 27.4728, lng: 94.9120, type: 'hub' },
  { id: 'silchar',     name: 'Silchar',     state: 'Assam',            lat: 24.8333, lng: 92.7789, type: 'hub' },
  { id: 'karimganj',   name: 'Karimganj',   state: 'Assam',            lat: 24.8697, lng: 92.3576, type: 'town' },
  { id: 'shillong',    name: 'Shillong',    state: 'Meghalaya',        lat: 25.5788, lng: 91.8933, type: 'hub' },
  { id: 'tura',        name: 'Tura',        state: 'Meghalaya',        lat: 25.5138, lng: 90.2201, type: 'town' },
  { id: 'jowai',       name: 'Jowai',       state: 'Meghalaya',        lat: 25.4500, lng: 92.2000, type: 'town' },
  { id: 'kohima',      name: 'Kohima',      state: 'Nagaland',         lat: 25.6751, lng: 94.1086, type: 'hub' },
  { id: 'dimapur',     name: 'Dimapur',     state: 'Nagaland',         lat: 25.9091, lng: 93.7266, type: 'hub' },
  { id: 'mokokchung',  name: 'Mokokchung',  state: 'Nagaland',         lat: 26.3260, lng: 94.5300, type: 'town' },
  { id: 'imphal',      name: 'Imphal',      state: 'Manipur',          lat: 24.8170, lng: 93.9368, type: 'hub' },
  { id: 'churachandpur',name:'Churachandpur',state: 'Manipur',         lat: 24.3333, lng: 93.6833, type: 'town' },
  { id: 'aizawl',      name: 'Aizawl',      state: 'Mizoram',          lat: 23.7271, lng: 92.7176, type: 'hub' },
  { id: 'lunglei',     name: 'Lunglei',     state: 'Mizoram',          lat: 22.8879, lng: 92.7320, type: 'town' },
  { id: 'agartala',    name: 'Agartala',    state: 'Tripura',          lat: 23.8315, lng: 91.2868, type: 'hub' },
  { id: 'udaipur_tr',  name: 'Udaipur',     state: 'Tripura',          lat: 23.5333, lng: 91.4833, type: 'town' },
  { id: 'itanagar',    name: 'Itanagar',    state: 'Arunachal Pradesh',lat: 27.0844, lng: 93.6053, type: 'hub' },
  { id: 'ziro',        name: 'Ziro',        state: 'Arunachal Pradesh',lat: 27.5486, lng: 93.8250, type: 'town' },
  { id: 'pasighat',    name: 'Pasighat',    state: 'Arunachal Pradesh',lat: 28.0667, lng: 95.3333, type: 'town' },
  { id: 'tawang',      name: 'Tawang',      state: 'Arunachal Pradesh',lat: 27.5859, lng: 91.8594, type: 'town' },
  { id: 'gangtok',     name: 'Gangtok',     state: 'Sikkim',           lat: 27.3389, lng: 88.6065, type: 'hub' },
  { id: 'siliguri',    name: 'Siliguri',    state: 'West Bengal (gateway)', lat: 26.7271, lng: 88.3953, type: 'hub' },
  
  // --- AIRPORTS ---
  { id: 'guwahati_airport',  name: 'LGBI Airport (GAU)', state: 'Assam', lat: 26.1061, lng: 91.5859, type: 'airport', cargo: true },
  { id: 'imphal_airport',    name: 'Bir Tikendrajit Airport (IMF)', state: 'Manipur', lat: 24.7600, lng: 93.8967, type: 'airport', cargo: true },
  { id: 'dibrugarh_airport', name: 'Mohanbari Airport (DIB)', state: 'Assam', lat: 27.4839, lng: 95.0181, type: 'airport', cargo: true },
  { id: 'agartala_airport',  name: 'MBB Airport (IXA)', state: 'Tripura', lat: 23.8864, lng: 91.2406, type: 'airport', cargo: true },
  { id: 'silchar_airport',   name: 'Kumbhirgram Airport (IXS)', state: 'Assam', lat: 24.9125, lng: 92.9786, type: 'airport', cargo: false },
  { id: 'shillong_airport',  name: 'Umroi Airport (SHL)', state: 'Meghalaya', lat: 25.7061, lng: 91.9786, type: 'airport', cargo: false },
  { id: 'dimapur_airport',   name: 'Dimapur Airport (DMU)', state: 'Nagaland', lat: 25.8839, lng: 93.7711, type: 'airport', cargo: true },
  { id: 'lengpui_airport',   name: 'Lengpui Airport (AJL)', state: 'Mizoram', lat: 23.8406, lng: 92.6194, type: 'airport', cargo: true },
  { id: 'hollongi_airport',  name: 'Donyi Polo Airport (HGI)', state: 'Arunachal Pradesh', lat: 26.9933, lng: 93.6389, type: 'airport', cargo: true },
  { id: 'bagdogra_airport',  name: 'Bagdogra Airport (IXB)', state: 'West Bengal (gateway)', lat: 26.6812, lng: 88.3286, type: 'airport', cargo: true },
  { id: 'pakyong_airport',   name: 'Pakyong Airport (PYG)', state: 'Sikkim', lat: 27.2325, lng: 88.5861, type: 'airport', cargo: false },
];

export const EDGES = [
  // --- ROAD HIGHWAYS ---
  { from: 'guwahati', to: 'tezpur', km: 182, terrainFactor: 1.15, road: 'NH15', mode: 'road' },
  { from: 'tezpur', to: 'jorhat', km: 226, terrainFactor: 1.2, road: 'NH15', mode: 'road' },
  { from: 'jorhat', to: 'dibrugarh', km: 133, terrainFactor: 1.1, road: 'NH37', mode: 'road' },
  { from: 'guwahati', to: 'nagaon', km: 117, terrainFactor: 1.05, road: 'NH27', mode: 'road' },
  { from: 'nagaon', to: 'jorhat', km: 208, terrainFactor: 1.15, road: 'NH27', mode: 'road' },
  { from: 'guwahati', to: 'shillong', km: 100, terrainFactor: 1.5, road: 'NH6', mode: 'road' },
  { from: 'shillong', to: 'jowai', km: 64, terrainFactor: 1.4, road: 'NH6', mode: 'road' },
  { from: 'jowai', to: 'silchar', km: 168, terrainFactor: 1.7, road: 'NH6', mode: 'road' },
  { from: 'shillong', to: 'tura', km: 220, terrainFactor: 1.6, road: 'SH', mode: 'road' },
  { from: 'guwahati', to: 'tura', km: 300, terrainFactor: 1.4, road: 'NH27', mode: 'road' },
  { from: 'silchar', to: 'karimganj', km: 58, terrainFactor: 1.1, road: 'NH37', mode: 'road' },
  { from: 'silchar', to: 'aizawl', km: 180, terrainFactor: 1.9, road: 'NH306', mode: 'road' },
  { from: 'aizawl', to: 'lunglei', km: 120, terrainFactor: 1.8, road: 'NH54', mode: 'road' },
  { from: 'silchar', to: 'agartala', km: 220, terrainFactor: 1.6, road: 'NH8', mode: 'road' },
  { from: 'agartala', to: 'udaipur_tr', km: 55, terrainFactor: 1.1, road: 'NH8', mode: 'road' },
  { from: 'agartala', to: 'karimganj', km: 130, terrainFactor: 1.4, road: 'NH8', mode: 'road' },
  { from: 'nagaon', to: 'dimapur', km: 210, terrainFactor: 1.3, road: 'NH36', mode: 'road' },
  { from: 'dimapur', to: 'kohima', km: 74, terrainFactor: 1.7, road: 'NH29', mode: 'road' },
  { from: 'kohima', to: 'imphal', km: 141, terrainFactor: 1.9, road: 'NH2', mode: 'road' },
  { from: 'dimapur', to: 'imphal', km: 215, terrainFactor: 1.6, road: 'NH2', mode: 'road' },
  { from: 'imphal', to: 'churachandpur', km: 65, terrainFactor: 1.7, road: 'NH150', mode: 'road' },
  { from: 'dimapur', to: 'mokokchung', km: 162, terrainFactor: 1.6, road: 'SH', mode: 'road' },
  { from: 'jorhat', to: 'itanagar', km: 160, terrainFactor: 1.6, road: 'NH415', mode: 'road' },
  { from: 'itanagar', to: 'ziro', km: 115, terrainFactor: 1.9, road: 'NH13', mode: 'road' },
  { from: 'dibrugarh', to: 'pasighat', km: 145, terrainFactor: 1.7, road: 'NH515', mode: 'road' },
  { from: 'tezpur', to: 'tawang', km: 320, terrainFactor: 2.2, road: 'NH13', mode: 'road' },
  { from: 'guwahati', to: 'siliguri', km: 275, terrainFactor: 1.2, road: 'NH27', mode: 'road' },
  { from: 'siliguri', to: 'gangtok', km: 114, terrainFactor: 1.9, road: 'NH10', mode: 'road' },

  // --- RAILWAY FREIGHT CORRIDORS (Northeast Frontier Railway - NFR) ---
  { from: 'guwahati', to: 'tezpur', km: 175, terrainFactor: 1.0, road: 'NFR Tezpur Rail Line', mode: 'railway' },
  { from: 'guwahati', to: 'nagaon', km: 110, terrainFactor: 1.0, road: 'NFR Lumding-Guwahati Rail Corridor', mode: 'railway' },
  { from: 'nagaon', to: 'jorhat', km: 195, terrainFactor: 1.0, road: 'NFR Upper Assam Freight Rail Line', mode: 'railway' },
  { from: 'jorhat', to: 'dibrugarh', km: 130, terrainFactor: 1.0, road: 'NFR Tinsukia-Dibrugarh Rail Line', mode: 'railway' },
  { from: 'nagaon', to: 'dimapur', km: 190, terrainFactor: 1.1, road: 'NFR Nagaland Express Rail Corridor', mode: 'railway' },
  { from: 'dimapur', to: 'kohima', km: 82, terrainFactor: 1.2, road: 'NFR Dimapur-Zubza Rail Corridor', mode: 'railway' },
  { from: 'nagaon', to: 'silchar', km: 215, terrainFactor: 1.3, road: 'NFR Hill Section Lumding-Badarpur Freight Rail', mode: 'railway' },
  { from: 'silchar', to: 'agartala', km: 210, terrainFactor: 1.2, road: 'NFR Tripura Broad-Gauge Rail Line', mode: 'railway' },
  { from: 'silchar', to: 'aizawl', km: 160, terrainFactor: 1.1, road: 'NFR Bairabi-Sairang Rail Corridor', mode: 'railway' },
  { from: 'silchar', to: 'imphal', km: 230, terrainFactor: 1.2, road: 'NFR Jiribam-Imphal Rail Corridor', mode: 'railway' },
  { from: 'tezpur', to: 'itanagar', km: 165, terrainFactor: 1.0, road: 'NFR Rangiya-Murkongselek Rail (Naharlagun Spur)', mode: 'railway' },
  { from: 'dibrugarh', to: 'pasighat', km: 135, terrainFactor: 1.0, road: 'NFR Bogibeel Rail Corridor', mode: 'railway' },
  { from: 'guwahati', to: 'siliguri', km: 260, terrainFactor: 1.0, road: 'NFR Trunk Rail Freight Corridor', mode: 'railway' },

  // --- WATERWAY FREIGHT CORRIDORS (IWAI National Waterways NW-2 & NW-16) ---
  { from: 'guwahati', to: 'tezpur', km: 190, terrainFactor: 1.0, road: 'NW-2 Brahmaputra River Barges (Pandu ↔ Tezpur Port)', mode: 'waterway' },
  { from: 'tezpur', to: 'jorhat', km: 210, terrainFactor: 1.0, road: 'NW-2 Brahmaputra Waterway (Tezpur ↔ Neamati Ghat Port)', mode: 'waterway' },
  { from: 'jorhat', to: 'dibrugarh', km: 140, terrainFactor: 1.0, road: 'NW-2 Upper Brahmaputra Waterway (Neamati ↔ Dibrugarh Port)', mode: 'waterway' },
  { from: 'dibrugarh', to: 'pasighat', km: 120, terrainFactor: 1.0, road: 'NW-2 Sadiya/Pasighat Waterway', mode: 'waterway' },
  { from: 'guwahati', to: 'siliguri', km: 290, terrainFactor: 1.0, road: 'NW-2 Lower Brahmaputra Freight Route (Pandu ↔ Dhubri Port)', mode: 'waterway' },
  { from: 'silchar', to: 'karimganj', km: 62, terrainFactor: 1.0, road: 'NW-16 Barak River Freight Corridor (Silchar ↔ Karimganj Inland Port)', mode: 'waterway' },

  // --- AIRPORT LAST MILE (ROAD) ---
  { from: 'guwahati', to: 'guwahati_airport', km: 22, terrainFactor: 1.0, road: 'Airport Road', mode: 'road' },
  { from: 'imphal', to: 'imphal_airport', km: 8, terrainFactor: 1.0, road: 'Airport Road', mode: 'road' },
  { from: 'dibrugarh', to: 'dibrugarh_airport', km: 15, terrainFactor: 1.0, road: 'Airport Road', mode: 'road' },
  { from: 'agartala', to: 'agartala_airport', km: 12, terrainFactor: 1.0, road: 'Airport Road', mode: 'road' },
  { from: 'silchar', to: 'silchar_airport', km: 26, terrainFactor: 1.1, road: 'Airport Road', mode: 'road' },
  { from: 'shillong', to: 'shillong_airport', km: 30, terrainFactor: 1.3, road: 'Airport Road', mode: 'road' },
  { from: 'dimapur', to: 'dimapur_airport', km: 7, terrainFactor: 1.0, road: 'Airport Road', mode: 'road' },
  { from: 'aizawl', to: 'lengpui_airport', km: 32, terrainFactor: 1.4, road: 'NH54 / Airport Road', mode: 'road' },
  { from: 'itanagar', to: 'hollongi_airport', km: 25, terrainFactor: 1.2, road: 'Airport Expressway', mode: 'road' },
  { from: 'siliguri', to: 'bagdogra_airport', km: 14, terrainFactor: 1.0, road: 'AH2 / Airport Road', mode: 'road' },
  { from: 'gangtok', to: 'pakyong_airport', km: 28, terrainFactor: 1.8, road: 'Pakyong Road', mode: 'road' },

  // --- AIR CARGO FLIGHTS ---
  { from: 'guwahati_airport', to: 'imphal_airport', km: 250, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'guwahati_airport', to: 'dibrugarh_airport', km: 350, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'guwahati_airport', to: 'agartala_airport', km: 250, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'guwahati_airport', to: 'silchar_airport', km: 170, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'guwahati_airport', to: 'shillong_airport', km: 95, terrainFactor: 1.0, road: 'Air Route GAU-SHL', mode: 'air' },
  { from: 'guwahati_airport', to: 'dimapur_airport', km: 220, terrainFactor: 1.0, road: 'Air Route GAU-DMU', mode: 'air' },
  { from: 'guwahati_airport', to: 'lengpui_airport', km: 290, terrainFactor: 1.0, road: 'Air Route GAU-AJL', mode: 'air' },
  { from: 'guwahati_airport', to: 'hollongi_airport', km: 210, terrainFactor: 1.0, road: 'Air Route GAU-HGI', mode: 'air' },
  { from: 'guwahati_airport', to: 'bagdogra_airport', km: 330, terrainFactor: 1.0, road: 'Air Route GAU-IXB', mode: 'air' },
  { from: 'bagdogra_airport', to: 'pakyong_airport', km: 80, terrainFactor: 1.0, road: 'Air Route IXB-PYG', mode: 'air' },
  { from: 'imphal_airport', to: 'agartala_airport', km: 270, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'imphal_airport', to: 'dimapur_airport', km: 140, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'lengpui_airport', to: 'agartala_airport', km: 170, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'lengpui_airport', to: 'imphal_airport', km: 200, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
  { from: 'dibrugarh_airport', to: 'hollongi_airport', km: 150, terrainFactor: 1.0, road: 'Air Route', mode: 'air' },
];

export function computeSafetyRoute(startId, endId, penaltyMultiplier = 1, modeFilter = 'all') {
  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));
  if (!nodeMap[startId] || !nodeMap[endId]) return null;

  const isMultimodal = modeFilter && modeFilter !== 'all' && modeFilter !== 'road';

  const adj = {};
  NODES.forEach((n) => { adj[n.id] = []; });
  EDGES.forEach((e) => {
    let risk = e.terrainFactor;
    if (e.road && e.road.includes('NH6') && penaltyMultiplier > 1) risk *= 2.5;
    adj[e.from].push({ from: e.from, to: e.to, km: e.km, road: e.road, mode: e.mode || 'road', risk });
    adj[e.to].push({ from: e.to, to: e.from, km: e.km, road: e.road, mode: e.mode || 'road', risk });
  });

  if (!isMultimodal) {
    const activeEdges = modeFilter === 'road' ? EDGES.filter((e) => (e.mode || 'road') === 'road') : EDGES;
    const roadAdj = {};
    NODES.forEach((n) => { roadAdj[n.id] = []; });
    activeEdges.forEach((e) => {
      let risk = e.terrainFactor;
      if (e.road && e.road.includes('NH6') && penaltyMultiplier > 1) risk *= 2.5;
      roadAdj[e.from].push({ to: e.to, km: e.km, road: e.road, mode: e.mode || 'road', risk });
      roadAdj[e.to].push({ to: e.from, km: e.km, road: e.road, mode: e.mode || 'road', risk });
    });

    const dist = {};
    const prev = {};
    NODES.forEach((n) => { dist[n.id] = Infinity; });
    dist[startId] = 0;
    const queue = new Set(NODES.map((n) => n.id));

    while (queue.size) {
      let u = null;
      let best = Infinity;
      for (const id of queue) {
        if (dist[id] < best) { best = dist[id]; u = id; }
      }
      if (u === null) break;
      queue.delete(u);
      if (u === endId) break;

      for (const edge of roadAdj[u]) {
        const weight = edge.km * edge.risk * penaltyMultiplier;
        const alt = dist[u] + weight;
        if (alt < dist[edge.to]) {
          dist[edge.to] = alt;
          prev[edge.to] = { from: u, to: edge.to, km: edge.km, road: edge.road, mode: edge.mode, risk: edge.risk };
        }
      }
    }

    if (dist[endId] === Infinity) return null;

    const edges = [];
    let cur = endId;
    while (cur !== startId) {
      const p = prev[cur];
      if (!p) break;
      edges.unshift({
        from: nodeMap[p.from],
        to: nodeMap[p.to],
        km: p.km,
        road: p.road,
        mode: p.mode || 'road',
        condition: p.risk > 1.5 ? 'caution' : 'clear',
      });
      cur = p.from;
    }

    let totalMinutes = 0;
    const segments = edges.map((e) => {
      const modeSpeed = 42;
      const segTime = Math.round((e.km / modeSpeed) * 60);
      totalMinutes += segTime;
      const segSafety = e.condition === 'caution' ? 82 : 96;
      return {
        ...e,
        distance: e.km,
        time: segTime,
        corridor: e.road,
        risk: e.condition,
        status: e.condition,
        safetyIndex: segSafety
      };
    });

    const totalKm = segments.reduce((s, e) => s + e.km, 0);
    const avgSpeedKmh = 42;
    const etaMinutes = totalMinutes || Math.round((totalKm / avgSpeedKmh) * 60);
    
    // Distance-weighted safety aggregation
    let weightedSum = 0;
    segments.forEach(s => { weightedSum += s.km * s.safetyIndex; });
    const safetyIndex = totalKm > 0 ? Math.round(weightedSum / totalKm) : 95;

    return {
      path: [nodeMap[startId], ...edges.map((e) => e.to)],
      edges: segments,
      segments,
      transfers: [],
      mode: 'road',
      modeLabel: 'ROAD',
      totalKm,
      totalDistance: totalKm,
      etaMinutes,
      totalTime: etaMinutes,
      avgSpeedKmh,
      safetyIndex,
    };
  }

  // 3-Stage Multimodal Offline Fallback
  const dist = {};
  const prev = {};
  const queue = new Set();

  for (const n of NODES) {
    for (let s = 0; s <= 2; s++) {
      const k = `${n.id}|${s}`;
      dist[k] = Infinity;
      queue.add(k);
    }
  }
  dist[`${startId}|0`] = 0;

  const modeIncentive = modeFilter === 'air' ? 0.35 : (modeFilter === 'waterway' ? 0.75 : 0.85);

  while (queue.size) {
    let uKey = null;
    let best = Infinity;
    for (const k of queue) {
      if (dist[k] < best) { best = dist[k]; uKey = k; }
    }
    if (uKey === null || best === Infinity) break;
    queue.delete(uKey);

    const [uId, sStr] = uKey.split('|');
    const stage = parseInt(sStr, 10);
    if (uId === endId && (stage === 1 || stage === 2)) break;

    const prevNode = prev[uKey] ? prev[uKey].from : null;

    for (const edge of adj[uId]) {
      if (edge.to === prevNode) continue;

      let nextStage = null;
      let costMultiplier = 1.0;

      if (stage === 0) {
        if (edge.mode === modeFilter) {
          nextStage = 1;
          costMultiplier = modeIncentive;
        } else if (edge.mode === 'road') {
          nextStage = 0;
          costMultiplier = 1.35;
        }
      } else if (stage === 1) {
        if (edge.mode === modeFilter) {
          nextStage = 1;
          costMultiplier = modeIncentive;
        } else if (edge.mode === 'road') {
          nextStage = 2;
          costMultiplier = 1.35;
        }
      } else if (stage === 2) {
        if (edge.mode === 'road') {
          nextStage = 2;
          costMultiplier = 1.35;
        }
      }

      if (nextStage === null) continue;

      const alt = dist[uKey] + (edge.km * edge.risk * penaltyMultiplier * costMultiplier);
      const nextKey = `${edge.to}|${nextStage}`;
      if (alt < dist[nextKey]) {
        dist[nextKey] = alt;
        prev[nextKey] = { from: uId, to: edge.to, km: edge.km, road: edge.road, mode: edge.mode, risk: edge.risk, fromKey: uKey };
      }
    }
  }

  const k1 = `${endId}|1`;
  const k2 = `${endId}|2`;
  let bestEnd = null;
  if (dist[k1] !== Infinity && dist[k2] !== Infinity) {
    bestEnd = dist[k1] <= dist[k2] ? k1 : k2;
  } else if (dist[k1] !== Infinity) bestEnd = k1;
  else if (dist[k2] !== Infinity) bestEnd = k2;

  if (!bestEnd) return null;

  const edges = [];
  let curKey = bestEnd;
  while (curKey) {
    const p = prev[curKey];
    if (!p) break;
    edges.unshift({
      from: nodeMap[p.from],
      to: nodeMap[p.to],
      km: p.km,
      road: p.road,
      mode: p.mode,
      condition: p.risk > 1.5 ? 'caution' : 'clear',
    });
    curKey = p.fromKey;
  }

  if (!edges.some((e) => e.mode === modeFilter)) return null;

  let totalMinutes = 0;
  const segments = edges.map((e) => {
    let speed = 45;
    if (e.mode === 'air') speed = 500;
    else if (e.mode === 'railway') speed = 55;
    else if (e.mode === 'waterway') speed = 24;
    const segTime = Math.round((e.km / speed) * 60);
    totalMinutes += (e.km / speed) * 60;
    const segSafety = e.mode === 'air' ? 98 : (e.condition === 'caution' ? 80 : 95);
    return {
      ...e,
      distance: e.km,
      time: segTime,
      corridor: e.road,
      risk: e.condition,
      status: e.condition,
      safetyIndex: segSafety
    };
  });

  const totalKm = segments.reduce((s, e) => s + e.km, 0);
  const etaMinutes = Math.round(totalMinutes);
  const avgSpeedKmh = totalKm > 0 ? Number((totalKm / (etaMinutes / 60)).toFixed(1)) : 0;

  // Distance-weighted safety aggregation
  let weightedSum = 0;
  segments.forEach(s => { weightedSum += s.km * s.safetyIndex; });
  const safetyIndex = totalKm > 0 ? Math.round(weightedSum / totalKm) : 95;

  // Mode transfers
  const transfers = [];
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].mode !== segments[i + 1].mode) {
      transfers.push({
        node: segments[i].to,
        fromMode: segments[i].mode,
        toMode: segments[i + 1].mode,
        name: segments[i].to?.name || segments[i].to?.id
      });
    }
  }

  const modeLabel = modeFilter === 'air' ? 'AIR + ROAD' : (modeFilter === 'railway' ? 'RAIL + ROAD' : (modeFilter === 'waterway' ? 'WATERWAY + ROAD' : 'ROAD'));

  return {
    path: [nodeMap[startId], ...segments.map((e) => e.to)],
    edges: segments,
    segments,
    transfers,
    mode: modeFilter,
    modeLabel,
    totalKm,
    totalDistance: totalKm,
    etaMinutes,
    totalTime: etaMinutes,
    avgSpeedKmh,
    safetyIndex,
  };
}

export function scoreAndRecommendRoutes(routes = {}, options = {}) {
  const {
    cargoType = 'General Cargo',
    weight = 100,
    priority = 'Normal',
    emergencyMode = false
  } = options;

  const isEmergency = emergencyMode || priority === 'Emergency' || priority === 'urgent' || priority === 'emergency';
  const isHighPriority = priority === 'High' || priority === 'high';
  const isHeavy = cargoType === 'Heavy Cargo' || Number(weight) > 5000;
  const isPerishableOrUrgent = cargoType === 'Perishable' || 
                               cargoType === 'Pharmaceutical / Medicine' || 
                               cargoType === 'Emergency Supplies';
  const isHighValue = cargoType === 'High Value';

  const availableModes = Object.keys(routes).filter((m) => routes[m] !== null && routes[m] !== undefined);
  if (availableModes.length === 0) return null;

  const times = availableModes.map((m) => routes[m].etaMinutes || 0);
  const distances = availableModes.map((m) => routes[m].totalKm || 0);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);

  let wTime = 0.35;
  let wDist = 0.20;
  let wRisk = 0.45;

  if (isEmergency) {
    wTime = 0.65;
    wDist = 0.05;
    wRisk = 0.30;
  } else if (isHighPriority) {
    wTime = 0.50;
    wDist = 0.15;
    wRisk = 0.35;
  } else if (isHighValue) {
    wTime = 0.30;
    wDist = 0.15;
    wRisk = 0.55;
  }

  const scoredCandidates = availableModes.map((mode) => {
    const r = routes[mode];
    const time = r.etaMinutes || 0;
    const distance = r.totalKm || 0;
    const safety = r.safetyIndex !== undefined ? r.safetyIndex : 90;
    const risk = Math.max(0, 100 - safety);

    const normTime = maxTime > minTime ? (time - minTime) / (maxTime - minTime) : 0;
    const normDist = maxDistance > minDistance ? (distance - minDistance) / (maxDistance - minDistance) : 0;
    const normRisk = risk / 100;

    let suitabilityAdjustment = 0;
    const transferCount = (r.transfers || []).length;
    suitabilityAdjustment += transferCount * 0.03;

    if (isHeavy) {
      if (mode === 'air') suitabilityAdjustment += 0.50;
      if (mode === 'waterway') suitabilityAdjustment -= 0.18;
      if (mode === 'railway') suitabilityAdjustment -= 0.12;
    }

    if (isPerishableOrUrgent) {
      if (mode === 'air') suitabilityAdjustment -= 0.18;
      if (mode === 'waterway') suitabilityAdjustment += 0.30;
    }

    if (isHighValue) {
      if (mode === 'air') suitabilityAdjustment -= 0.10;
    }

    const cost = (wTime * normTime) + (wDist * normDist) + (wRisk * normRisk) + suitabilityAdjustment;
    const score = Math.round(Math.max(10, Math.min(99, (1 - cost) * 100)));

    return {
      mode,
      cost,
      score,
      route: r,
    };
  });

  scoredCandidates.sort((a, b) => a.cost - b.cost);
  const best = scoredCandidates[0];
  const bestMode = best.mode;
  const bestRoute = routes[bestMode];

  let reason = '';
  if (isEmergency) {
    reason = `Emergency priority selected ${bestMode.toUpperCase()} (${bestRoute.totalKm} km, ${Math.floor(bestRoute.etaMinutes / 60)}h ${bestRoute.etaMinutes % 60}m) to minimize transit delay with ${bestRoute.safetyIndex}% corridor safety.`;
  } else if (isHeavy && (bestMode === 'railway' || bestMode === 'waterway')) {
    reason = `Heavy freight profile prioritized ${bestMode === 'railway' ? 'NFR Rail' : 'IWAI Waterway'} for high-capacity bulk payload, lower logistics cost, and ${bestRoute.safetyIndex}% corridor integrity.`;
  } else if (bestMode === 'air') {
    reason = `Air + Road multimodal corridor delivers optimal efficiency (${Math.floor(bestRoute.etaMinutes / 60)}h ${bestRoute.etaMinutes % 60}m vs road transit) with high safety index of ${bestRoute.safetyIndex}%.`;
  } else if (bestMode === 'railway') {
    reason = `NFR Railway freight corridor selected for superior balance of transport safety (${bestRoute.safetyIndex}%), low disruption vulnerability, and reliable transit schedule.`;
  } else if (bestMode === 'waterway') {
    reason = `Inland Waterway corridor (NW-2/16) selected for stable river freight movement with ${bestRoute.safetyIndex}% route safety index.`;
  } else {
    reason = `Direct highway corridor selected as the most viable and direct routing (${bestRoute.totalKm} km) with ${bestRoute.safetyIndex}% corridor safety.`;
  }

  scoredCandidates.forEach((c) => {
    if (routes[c.mode]) {
      routes[c.mode].score = c.score;
    }
  });

  return {
    recommendedMode: bestMode,
    recommendationReason: reason,
    score: best.score,
    route: bestRoute,
    rankings: scoredCandidates,
  };
}
