// Central API client for the NER-Sahayak backend.
// Set REACT_APP_API_URL in your frontend .env to point at the deployed
// backend (defaults to local dev server on :4000).

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'ner_sahayak_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

function mockFallback(path) {
  if (path.startsWith('/dashboard/summary')) {
    return {
      activeVehicles: 8,
      totalVehicles: 10,
      regionAccessCoveragePct: 88,
      openFieldReports: 3,
      criticalReports: 1,
      districtConnectivity: [
        { nodeId: 'n-guwahati', name: 'Kamrup Metro', state: 'Assam', score: 95, status: 'connected', openReports: 0 },
        { nodeId: 'n-shillong', name: 'East Khasi Hills', state: 'Meghalaya', score: 82, status: 'connected', openReports: 1 },
        { nodeId: 'n-silchar', name: 'Cachar', state: 'Assam', score: 68, status: 'partial', openReports: 2 },
        { nodeId: 'n-imphal', name: 'Imphal East', state: 'Manipur', score: 54, status: 'partial', openReports: 1 },
        { nodeId: 'n-kohima', name: 'Kohima', state: 'Nagaland', score: 78, status: 'connected', openReports: 0 },
        { nodeId: 'n-agartala', name: 'West Tripura', state: 'Tripura', score: 90, status: 'connected', openReports: 0 },
        { nodeId: 'n-aizawl', name: 'Aizawl', state: 'Mizoram', score: 62, status: 'partial', openReports: 1 },
        { nodeId: 'n-itanagar', name: 'Papum Pare', state: 'Arunachal Pradesh', score: 72, status: 'connected', openReports: 0 },
        { nodeId: 'n-gangtok', name: 'East Sikkim', state: 'Sikkim', score: 85, status: 'connected', openReports: 0 },
      ],
      logisticsBottlenecks: [
        { from: 'Guwahati', to: 'Shillong', road: 'NH27 / NH102', km: 99, activeReports: 1, riskScore: 35 },
        { from: 'Silchar', to: 'Imphal', road: 'NH37', km: 135, activeReports: 2, riskScore: 72 },
      ],
      shipments: {
        planned: 4,
        inTransit: 8,
        delayed: 1,
        delivered: 12,
      },
      generatedAt: new Date().toISOString(),
    };
  }
  if (path.startsWith('/network/nodes')) return { nodes: [] };
  if (path.startsWith('/network/edges')) return { edges: [] };
  if (path.startsWith('/weather')) return { weather: [] };
  if (path.startsWith('/alerts')) return { alerts: [] };
  if (path.startsWith('/reports')) return { reports: [] };
  if (path.startsWith('/vehicles')) return { vehicles: [] };
  if (path.startsWith('/shipments')) return { shipments: [] };
  if (path.startsWith('/users')) return { users: [] };
  if (path.startsWith('/health')) return { status: 'ok', mode: 'offline-static' };
  return {};
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    // On auth endpoints, rethrow network error so AuthContext demo fallback handles it
    if (path.startsWith('/auth/')) {
      const err = new Error('Network connection unavailable (offline mode)');
      err.isNetworkError = true;
      err.status = 0;
      throw err;
    }
    // For all other endpoints on static hosting, return fallback data
    return mockFallback(path);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}


export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),

  // Network / GIS / routing
  nodes: () => request('/network/nodes'),
  edges: () => request('/network/edges'),
  planRoute: (originId, destinationId, alternates = true, mode = 'all') =>
    request('/network/route', { method: 'POST', body: { originId, destinationId, alternates, mode } }),
  compareRoutes: (payload) => request('/network/compare', { method: 'POST', body: payload }),

  // Weather
  weatherAll: () => request('/weather/all'),
  weatherFor: (nodeId) => request(`/weather/${nodeId}`),

  // Alerts
  alerts: () => request('/alerts'),
  createAlert: (payload) => request('/alerts', { method: 'POST', body: payload }),
  deleteAlert: (id) => request(`/alerts/${id}`, { method: 'DELETE' }),

  // Field reports
  reports: () => request('/reports'),
  myReports: () => request('/reports/mine'),
  createReport: (payload) => request('/reports', { method: 'POST', body: payload }),
  syncReports: (reports) => request('/reports/sync', { method: 'POST', body: { reports } }),
  updateReportStatus: (id, status) => request(`/reports/${id}/status`, { method: 'PATCH', body: { status } }),

  // Vehicles
  vehicles: () => request('/vehicles'),
  createVehicle: (payload) => request('/vehicles', { method: 'POST', body: payload }),
  pingVehicle: (id, payload) => request(`/vehicles/${id}/ping`, { method: 'POST', body: payload }),

  // Shipments
  shipments: () => request('/shipments'),
  createShipment: (payload) => request('/shipments', { method: 'POST', body: payload }),
  updateShipmentStatus: (id, status) => request(`/shipments/${id}/status`, { method: 'PATCH', body: { status } }),
  assignDriver: (id, driverId) => request(`/shipments/${id}/assign`, { method: 'PATCH', body: { driverId } }),

  // Dashboard
  dashboardSummary: () => request('/dashboard/summary'),
  activityLogs: () => request('/dashboard/activity'),

  // Users directory (official role only)
  users: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/users${qs ? `?${qs}` : ''}`);
  },
  userDetail: (id) => request(`/users/${id}`),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PATCH', body: payload }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  // i18n
  languages: () => request('/i18n/languages'),
  strings: (lang) => request(`/i18n/strings/${lang}`),

  // Ask Sahayak AI
  askSahayak: (query, context) => request('/ask', { method: 'POST', body: { query, context } }),

  health: () => request('/health', { auth: false }),
};

export default api;
