# NER-SAHAYAK — Architecture & Gap Analysis

**System**: AI-Based Smart Logistics and Accessibility Intelligence Platform for North Eastern Region (NER)  
**Document**: Architecture Gap Analysis (Phase 0 Audit)  
**Date**: September 2026  
**Branch**: `ner-sahayak-hackathon`  

---

## 1. System Architecture & Topology

NER-Sahayak implements a modern, decoupled client-server architecture designed for high availability, low-bandwidth resilience, and role-based field coordination across the 8 North Eastern states.

```
+-------------------------------------------------------------------------------+
|                               REACT 18 FRONTEND SPA                           |
|  [Driver Workspace]  [Field Officer Workspace]  [Logistics Control]  [Official Briefing]  |
|         |                     |                       |                     |         |
|  +--------------+     +---------------+        +--------------+      +--------------+ |
|  | LiveMap.jsx  |     | FieldReport   |        | Vehicle      |      | District     | |
|  | (Leaflet/SVG)|     | Form.jsx      |        | Tracker.jsx  |      | Dashboard.jsx| |
|  +--------------+     +---------------+        +--------------+      +--------------+ |
|         |                     |                       |                     |         |
|  +----------------------------------------------------------------------------------+ |
|  |                                  SERVICES LAYER                                  | |
|  |  api.js  |  offlineQueue.js  |  gpsHelper.js  |  webPushService.js  |  i18n.js   | |
|  |  routeCalculator.js (Offline Dijkstra)  |  askLocalFallback.js (Offline AI)     | |
|  +----------------------------------------------------------------------------------+ |
+---------------------------------------+-----------------------------------------------+
                                        | (HTTPS / REST API / JWT)
                                        v
+-------------------------------------------------------------------------------+
|                              NODE/EXPRESS BACKEND                             |
|  server.js (CORS, 8MB Body Parser, Centralized Error Handling, JWT Auth)       |
|                                       |                                       |
|  +------------------------------------+-------------------------------------+ |
|  |                               ROUTES LAYER                               | |
|  |  /auth     |  /network   |  /reports   |  /vehicles  |  /shipments       | |
|  |  /alerts   |  /dashboard |  /weather   |  /i18n      |  /users  |  /ask  | |
|  +------------------------------------+-------------------------------------+ |
|                                       |                                       |
|  +------------------------------------+-------------------------------------+ |
|  |                           CORE UTILITY ENGINES                           | |
|  |  dijkstra.js (Multimodal Graph)    |  routeScorer.js (Composite Scoring) | |
|  |  weather.js (Severity Engine)      |  auth.js (RBAC Middleware)          | |
|  +------------------------------------+-------------------------------------+ |
|                                       |                                       |
|  +------------------------------------+-------------------------------------+ |
|  |                        PERSISTENCE ABSTRACTION                           | |
|  |                        supabaseService.js                                | |
|  |                                                                           | |
|  |     [Online Supabase Mode]                    [Offline Fallback Mode]    | |
|  |    Supabase PostgreSQL (Cloud)           Local SQLite WAL (ner_sahayak.db)| |
|  +--------------------------------------------------------------------------+ |
+-------------------------------------------------------------------------------+
```

---

## 2. Component Boundaries & Responsibilities

| Layer | Component | Core Responsibilities |
| :--- | :--- | :--- |
| **Frontend UI** | `App.jsx` & Workspaces | Renders 4 role-specific views (`driver`, `field`, `logistics`, `official`), handles global navigation, dark mode, command palette (`Ctrl+K`), and error boundaries. |
| **GIS Visualization** | `LiveMap.jsx` | Dual-mode GIS engine: Leaflet map with OpenStreetMap tiles for online navigation, and an offline SVG vector canvas map (`88°E-98°E, 22°N-29°N`) for zero-connectivity situations. Includes `RouteFitter` bounds management. |
| **Routing UI** | `RoutePlanner.jsx` | Multimodal route exploration interface displaying Road, Rail, Waterway, and Air corridors, Decision Scores (0-100), active hazard summaries, and route segment breakdowns. |
| **Offline Cache** | `offlineQueue.js` | Client-side queue persisted in `localStorage`. Captures incident reports when offline and synchronizes in batches via `/reports/sync`. |
| **REST Router** | Express Routes (`/api/*`) | Validates requests, enforces JWT verification and role permissions, interacts with utility engines, and routes persistence queries. |
| **Routing Engine** | `dijkstra.js` | Multimodal Dijkstra algorithm implementing a 3-stage state machine (Stage 0: Road pickup $\to$ Stage 1: Rail/Water/Air trunk $\to$ Stage 2: Road delivery) with dynamic disruption and weather penalties. |
| **Scoring Engine** | `routeScorer.js` | Computes composite cost and rank for route options, generates human-readable explanations, and calibrates presentation Decision Scores. |
| **Data Abstraction** | `supabaseService.js` | Dual-engine persistence driver that queries Supabase PostgreSQL via the Service Role client when configured, or executes parameterized queries on SQLite (`ner_sahayak.db`) with zero code changes. |

---

## 3. End-to-End Operational Data Flows

### A. Field Incident Reporting & Dynamic Network Recalculation Flow
```
Field Officer (Phone/Web)
   |
   |-- 1. Captures Category (Landslide), Severity (Major), Road (NH27)
   |-- 2. "Attach GPS" acquires lat/lng (via gpsHelper.js)
   |-- 3. Attaches photo (converted to base64 Data URL)
   |
   v
POST /api/reports  [or offlineQueue.js if disconnected]
   |
   v
reports.js (requireAuth)
   |
   v
supabaseService.createIncident()
   |-- Rapid Duplicate Guard (blocks same user, category, road, title within 5 min)
   |-- Persists to incidents / field_reports table
   |-- Auto-creates alert record in alerts table (createAlert)
   |-- Logs activity in activity_logs
   |
   v
Driver / Logistics / Official Workspaces
   |-- Active hazards appear on LiveMap (warning markers)
   |-- useWebPushNotifications detects new alert -> delivers native push
   |-- Next call to /api/network/edges or /api/network/compare applies:
         - Disruption penalty (15x penalty on NH27 edge)
         - Road corridor safety index drops from 95% -> 43%
         - Multimodal engine prioritizes AIR + ROAD or RAILWAY as Rank #1
```

### B. Supply Vehicle GPS Telemetry Flow
```
Driver Workspace (DriverOverview.jsx / VehicleTracker.jsx)
   |
   |-- Driver toggles "Start Live Driver GPS"
   |-- watchGpsPosition() listens to navigator.geolocation (or Trial Mock NH27 fix)
   |
   v
POST /api/vehicles/:id/ping  { lat, lng, status: 'in_transit' }
   |
   v
vehicles.js (requireAuth)
   |
   v
supabaseService.updateVehicleLocation()
   |-- Updates lat, lng, last_updated timestamp in vehicles table
   |
   v
Logistics Control Room & LiveMap
   |-- Vehicle position pin updates on map with animated pulse
   |-- Active fleet KPIs increment (In Transit counter)
```

### C. Multimodal Shipment Lifecycle Flow
```
Logistics Operator (LogisticsOverview.jsx)
   |
   |-- Clicks "+ Plan Cargo Shipment"
   |-- Inputs Origin (Guwahati), Destination (Agartala), Cargo (Medical Supplies), Priority (Emergency)
   |
   v
POST /api/shipments
   |
   v
shipments.js
   |-- Computes optimal route via dijkstra.js (prioritizes Air + Road under Emergency)
   |-- Creates shipment in shipments table with status: "planned"
   |
   v
Operator assigns driver from 10-driver roster (DriverAssignModal.jsx)
   |
   v
PATCH /api/shipments/:id/assign  { driverId: "d-arjun" }
   |-- Status updates to "assigned"
   |
   v
Driver Workspace (Arjun Bora)
   |-- Assigned shipment card appears in Driver Telemetry view
   |-- Driver starts journey -> updates status to "in_transit"
   |-- Driver arrives at destination -> updates status to "delivered"
```

---

## 4. Technical Risks, Weaknesses & Gaps

### A. Dual-Engine Logic Duplication (SYNCHRONIZED in Phase 2)
- **Observation**:
  - Routing logic is implemented in **two places**:
    1. `backend/utils/dijkstra.js` and `backend/utils/routeScorer.js` (Server-side)
    2. `frontend/src/services/routeCalculator.js` (Client-side offline fallback)
  - Graph nodes and edges are duplicated in `backend/data/nerNetwork.js` and `frontend/src/services/routeCalculator.js`.
- **Architectural Rationale**: This duplication is deliberate to guarantee complete offline execution in remote border and hill areas without internet access.
- **Phase 2 Hardening**: Synchronized `routeCalculator.js` with `routeScorer.js` and `dijkstra.js`. Both engines now calculate identical `baseDurationMinutes`, `estimatedDelayMinutes`, calibrated Decision Scores ($0-100$), and generate identical structured `explanation` objects (`recommendation`, `rank`, `primaryRisk`, `affectedCorridors`, `avoidedDisruptions`, `estimatedDelay`, `comparison`, `reasons`).
- **Status**: **HARMONIZED & VALIDATED** — Zero divergence between online API and offline client calculations.

### B. Incident Photo Persistence & Payload Sizing
- **Current State**: Photos attached in `FieldReportForm.jsx` are encoded as Base64 Data URLs and stored directly in database text fields (`photoDataUrl` in SQLite, `photo_url` in Supabase).
- **Risk**: While the backend supports this via `express.json({ limit: '8mb' })`, storing multiple high-resolution base64 images directly in table rows inflates database size and slows down list queries.
- **Recommended Remediation**: In Phase 3, implement upload to Supabase Storage bucket `incident-photos` for online clients, retaining base64 only for the local offline queue.

### C. Third-Party Weather API Dependency (RESOLVED in Phase 1)
- **Previous State**: `backend/routes/weather.js` attempted to fetch live weather only from `api.openweathermap.org` and required `WEATHER_API_KEY`. If omitted or offline, it defaulted to `severity: 0`.
- **Phase 1 Remediation**: Implemented a **3-Tier Resilient Weather Provider**:
  1. *Tier 1 (OpenWeatherMap)*: Polled when `WEATHER_API_KEY` or `OPENWEATHER_API_KEY` is present.
  2. *Tier 2 (Open-Meteo)*: Keyless, open-access fallback querying WMO weather codes, precipitation, and wind speeds without authentication.
  3. *Tier 3 (Local Deterministic Fallback)*: Deterministic, climate-aware regional baseline for all 25 NER nodes. Always succeeds, returns `source: 'local_deterministic'`, and never defaults to a broken 0 or crashes.
- **Status**: **RESOLVED** — Verified with 14/14 automated test suite.

### D. Polling vs. Real-Time Push Subscriptions
- **Current State**: Cross-workspace updates (new incidents, vehicle telemetry, active alerts) rely on client-side polling intervals (`setInterval(load, 15000)` to `30000ms`).
- **Risk**: In a high-traffic production system, repeated polling introduces unnecessary HTTP overhead.
- **Mitigation for Hackathon**: Polling is predictable, firewall-friendly, and requires no persistent WebSocket servers. For production (Phase 7), Supabase Realtime subscriptions (PostgreSQL CDC) can be enabled.

### E. Security Hardening Gaps
- **Current State**:
  - JWT authentication and bcrypt password hashing are fully functional.
  - Role-based authorization (`requireRole`) protects sensitive routes (`/api/users`, `/api/alerts`).
- **Gaps**:
  - `cors()` is currently permissive (`app.use(cors())`).
  - No HTTP security headers (`helmet`).
  - No IP rate limiting (`express-rate-limit`) on login and signup endpoints.
  - Default hardcoded JWT secret is used if `JWT_SECRET` is not set in `.env`.

---

## 5. Hackathon Demo Risks & Mitigation Strategies

| Potential Demo Failure Point | Severity | Built-In Mitigation in Existing Codebase |
| :--- | :---: | :--- |
| **WiFi / Internet drops during presentation** | Critical | **Zero-Downtime Offline Fallback**: Frontend seamlessly switches to client-side `routeCalculator.js`, offline SVG canvas map, and `askLocalFallback.js`. Reports queue in `offlineQueue.js`. |
| **Browser GPS permission denied on demo laptop** | High | **Trial Mock GPS Fix**: `gpsHelper.js` automatically detects timeout or permission denial and falls back to simulated coordinates along the Guwahati NH27 logistics corridor (`isMock: true`). |
| **Weather API network blocked or rate-limited** | Low | **3-Tier Resilient Fallback**: OpenWeather $\to$ Open-Meteo (keyless) $\to$ Local Deterministic. The router always receives valid weather severity, metadata (`source`, `isLive`), and calculates compound risk without failure. |
| **Accidental double-click on "Submit Report"** | Medium | **Rapid Duplicate Guard**: `supabaseService.createIncident` identifies duplicate submissions (same user + category + road within 5 minutes) and returns the existing incident without creating duplicate alerts. |
| **Leaflet tile server slow or laggy** | Low | **Offline Vector Canvas Map**: Users can click "🗺️ Offline Canvas Map" in LiveMap top bar to switch instantaneously to the crisp, responsive SVG vector topology. |
