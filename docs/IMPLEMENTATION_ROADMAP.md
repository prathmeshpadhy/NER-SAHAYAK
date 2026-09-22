# NER-SAHAYAK — Implementation Roadmap

**Program**: AI-Based Smart Logistics and Accessibility Intelligence Platform for North Eastern Region (NER)  
**Document**: Implementation Roadmap (Phase 0 Planning Baseline)  
**Date**: September 2026  
**Branch**: `ner-sahayak-hackathon`  

---

## Roadmap Overview

This roadmap defines the structured implementation plan across 8 sequential phases. It outlines existing capabilities, addresses identified architectural gaps, specifies affected files, and defines automated and manual verification protocols for each phase.

```
Phase 1: Disruption & Accessibility Intelligence
    |
    v
Phase 2: Intelligent Routing & Alternatives
    |
    v
Phase 3: Field Officer & Offline Operations
    |
    v
Phase 4: Logistics, Vehicles & Shipments
    |
    v
Phase 5: Alerts & Multilingual Communication
    |
    v
Phase 6: Command Dashboard & GIS
    |
    v
Phase 7: Security, Reliability & Deployment
    |
    v
Phase 8: End-to-End QA & Jury Demo
```

---

## Phase 1 — Disruption & Accessibility Intelligence [COMPLETE]

### Objectives
- Enhance real-time road/corridor accessibility calculations with normalized states (`OPEN`, `CAUTION`, `RESTRICTED`, `SEVERELY_DISRUPTED`, `BLOCKED`).
- Implement 3-Tier Resilient Weather Provider: Tier 1 (OpenWeatherMap) -> Tier 2 (Open-Meteo keyless) -> Tier 3 (Deterministic Local Fallback).
- Refine Deterministic Risk-Weighted Disruption Intelligence Engine with transparent explainability.
- Prevent duplicate alerts via 5-minute rapid duplicate submission guards.
- Verify weather and incident coexistence without signal overwriting.

### Capabilities Implemented
- 3-tier resilient weather fetcher (`backend/routes/weather.js`) returning `source`, `isLive`, `observedAt`, and bounded severity `[0.0, 1.0]`.
- Normalized accessibility state derivation on network edges (`/api/network/edges`) and routing segments (`dijkstra.js`, `routeCalculator.js`).
- Compound weight calculation: `weight = baseWeight * weatherMultiplier * disruptionMultiplier`.
- Automated incident-to-alert pipeline with rapid duplicate protection in `supabaseService.js`.
- Explainable attribution in route recommendations identifying weather vs field hazard factors.

### Verified Files
- `backend/routes/weather.js`
- `backend/routes/network.js`
- `backend/utils/dijkstra.js`
- `backend/utils/routeScorer.js`
- `frontend/src/services/routeCalculator.js`
- `backend/test_phase1_disruption.js`

### Acceptance Criteria & Verification
1. `GET /api/weather/all` returns valid, structured weather data across all tiers without throwing (Verified).
2. Active field reports reliably degrade corridor accessibility and increase routing weights (Minor=2x, Moderate=5x, Severe=15x, Blocked=Infinity) (Verified).
3. Field report submission auto-generates operational alerts with rapid duplicate suppression (Verified).
4. All 14 mandatory automated test cases passing in `node backend/test_phase1_disruption.js` (14/14 PASSED).
5. Zero regressions across existing test suites (`test_routing_architecture.js`, `test_multimodal_matrix.js`, `test_connectivity.js`, frontend test and production build) (Verified).

---

## Phase 2 — Intelligent Routing & Alternatives [COMPLETE]

### Objectives
- Preserve and solidify the core multimodal Dijkstra routing engine (Road, Rail, Waterway, Air).
- Enforce calibrated Decision Score presentation without probability terminology.
- Provide clear operational rationale comparing recommended corridors against alternatives.
- Implement explicit delay estimation model (`baseDurationMinutes` vs `etaMinutes` -> `estimatedDelayMinutes`).
- Generate structured explanation schema (`explanation` object with affected corridors and avoided hazards).
- Validate emergency green-corridor routing and modal isolation under severe disruption.

### Capabilities Implemented
- **Single Source of Truth**: Centralized ranking and recommendation strictly in `backend/utils/routeScorer.js` with client-side parity in `frontend/src/services/routeCalculator.js`.
- **Calibrated Decision Score**: Non-probability presentation score ($0-100$) reflecting relative composite cost, monotonically aligned with sequential ranks (Rank #1, #2, #3, #4).
- **Exact Delay Derivation**: Segment-level and route-level derivation of `baseDurationMinutes`, `timeMinutes`, and `estimatedDelayMinutes`.
- **Structured Explanation Object**: Generates structured machine-readable payload (`explanation: { recommendation, recommendedMode, rank, decisionScore, primaryRisk, affectedCorridors, avoidedDisruptions, estimatedDelayMinutes, comparison, reasons }`).
- **Multimodal State Machine**: Road, NFR Rail, IWAI Waterways, and Air Cargo evaluated in parallel with modal isolation protecting rail/air corridors from road incidents.
- **Frontend State Isolation**: Recommendation banner locked strictly to recommended route while viewing alternatives; corridor hazard aggregation and delay tags rendered cleanly.

### Verified Files
- `backend/routes/network.js`
- `backend/utils/dijkstra.js`
- `backend/utils/routeScorer.js`
- `frontend/src/services/routeCalculator.js`
- `frontend/src/components/RoutePlanner.jsx`
- `backend/test_phase2_routing.js`
- `docs/PHASE_2_IMPLEMENTATION.md`

### Acceptance Criteria & Verification
1. Route planner always resolves an actual integer rank (`Rank #1`, `Rank #2`, etc.) — zero instances of `Rank #—` (Verified).
2. Decision scores strictly follow cost order with no identical scores between recommended and runner-up modes (Verified).
3. Rationale string clearly explains why the recommended mode was chosen over alternatives (Verified).
4. Delay calculation mathematically exact: $\text{etaMinutes} - \text{baseDurationMinutes} = \text{estimatedDelayMinutes}$ (Verified in Test 14).
5. All 16 mandatory automated test cases passing in `node backend/test_phase2_routing.js` (16/16 PASSED).
6. Full regression suites passing: `test_phase1_disruption.js` (14/14), `test_routing_architecture.js` (20/20), `test_multimodal_matrix.js` (36/36), `test_connectivity.js` (600/600), frontend tests (4/4), production build (Success).

---

## Phase 3 — Field Officer & Offline Operations

### Objectives
- Harden the field officer geo-tagged incident reporting workflow.
- Ensure seamless offline operation, local queuing, and batch synchronization upon network recovery.
- Optimize incident photo attachments.

### Existing Capabilities
- Category, severity, corridor, fromNode, toNode, and estimated delay inputs.
- Geolocation capture via `gpsHelper.js` with trial mock GPS fallback.
- Photo attachment via FileReader base64 Data URL.
- `offlineQueue.js` storing reports in `localStorage` and syncing via `POST /api/reports/sync`.
- Rapid duplicate submission guard in `supabaseService.js`.

### Missing Capabilities
- Automated image compression on the client before Base64 conversion to keep payloads compact (< 500 KB).
- Visual sync indicator in the header showing pending offline report count with a manual "Sync Now" trigger.

### Files Likely to Change
- `frontend/src/components/FieldReportForm.jsx`
- `frontend/src/services/offlineQueue.js`
- `frontend/src/components/FieldOfficerOverview.jsx`
- `backend/routes/reports.js`

### Dependencies
- Phase 1 & 2 for incident reflection in network routing.

### Acceptance Criteria
1. Submitting a report while disconnected queues the report in `localStorage` without UI errors.
2. Reconnecting and triggering sync flushes all queued items to `/reports/sync`, updates database records, and clears the queue.
3. Rapid duplicate submissions (< 5 min, same user, same category, same road) return the existing report without creating duplicates.
4. Photos render cleanly in incident cards and popups.

### Automated Tests Required
- `npm --prefix frontend test` (Verify `offlineQueue` unit tests)
- `node backend/test_supabase_integration.js` (Verify report creation and sync endpoints)

### Manual Tests Required
- Disconnect browser network in DevTools Network tab ("Offline").
- Submit a field incident; verify toast says "saved locally".
- Reconnect network; verify report synchronizes and appears on the Live Map.

---

## Phase 4 — Logistics, Vehicles & Shipments

### Objectives
- Complete the supply vehicle telemetry and fleet GPS tracking lifecycle.
- Streamline cargo shipment creation, driver assignment, and delivery status monitoring.
- Ensure logistics operators have full visibility over vehicle positions and shipment queues.

### Existing Capabilities
- Vehicle table with lat/lng, status, cargo type, and last updated timestamps.
- GPS pinging endpoint `POST /api/vehicles/:id/ping`.
- Browser geolocation `watchGpsPosition` in driver workspace with trial mock fix along NH27.
- Shipment creation with Dijkstra route calculation, priority selection, and status updates.
- Driver assignment modal with 10-driver roster (`DriverAssignModal.jsx`).

### Missing Capabilities
- Automated shipment status progression based on vehicle proximity to destination (geofencing trigger).
- Digital delivery confirmation receipt / OTP entry form.

### Files Likely to Change
- `backend/routes/shipments.js`
- `backend/routes/vehicles.js`
- `frontend/src/components/LogisticsOverview.jsx`
- `frontend/src/components/VehicleTracker.jsx`
- `frontend/src/components/DriverOverview.jsx`

### Dependencies
- Phase 2 routing engine for shipment path calculations.

### Acceptance Criteria
1. Driver clicking "Start Live Driver GPS" periodically updates their vehicle's position on the server.
2. Logistics Control Room displays the moving vehicle pin on the map.
3. Assigning a driver updates the shipment status to `assigned` and reflects immediately in that driver's workspace.
4. Status transitions (`planned` $\to$ `assigned` $\to$ `in_transit` $\to$ `delivered`) update the KPI counters.

### Automated Tests Required
- `node backend/test_api.js` (Shipment and vehicle lifecycle endpoints)

### Manual Tests Required
- In Logistics workspace, plan a new shipment and assign driver Arjun Bora.
- Switch to Driver workspace (Arjun Bora); verify assigned shipment appears.
- Toggle live GPS tracking; verify coordinates update in Logistics overview.

---

## Phase 5 — Alerts & Multilingual Communication

### Objectives
- Consolidate automated alert generation when incidents are reported.
- Verify native Web Push notifications via Service Worker across all user personas.
- Ensure full multilingual coverage across all 8 supported North Eastern languages.

### Existing Capabilities
- Auto-generation of alerts in `alerts` table upon incident creation.
- Web Push hook (`useWebPushNotifications.js`) polling every 15s and triggering desktop/mobile notifications.
- Complete 3,460-line i18n dictionary (`frontend/src/i18n.js`) supporting English, Assamese, Bengali, Hindi, Manipuri, Khasi, Mizo, and Nagamese.
- User language preference persistence in profile (`users.language`).

### Missing Capabilities
- In-app notification sound or audio chime on severe alerts.
- Alert severity threshold filter in user profile (e.g. notify only for critical/major hazards).

### Files Likely to Change
- `frontend/src/hooks/useWebPushNotifications.js`
- `frontend/src/components/AlertsList.jsx`
- `frontend/src/components/SettingsPanel.jsx`
- `backend/routes/alerts.js`

### Dependencies
- Phase 3 incident creation triggers.

### Acceptance Criteria
1. Submitting an incident automatically creates a corresponding alert with matching tone and severity.
2. Browser Web Push notification displays the alert title and road corridor when permission is granted.
3. Switching user language in Settings instantly updates the UI, navigation tabs, and alert strings to the selected language.

### Automated Tests Required
- `npm --prefix frontend test` (Verify `webPushService` and translation hooks)
- `node backend/test_supabase_integration.js` (Alert creation and retrieval)

### Manual Tests Required
- Change language to Assamese (`as`) or Bengali (`bn`); verify all workspace labels, buttons, and alert cards translate accurately.
- Trigger a test notification from the top bar bell icon; verify the browser push appears.

---

## Phase 6 — Command Dashboard & GIS

### Objectives
- Refine the regional command briefing room for government officials and DoNER personnel.
- Polish district-wise connectivity scores, regional coverage percentages, and bottleneck rankings.
- Ensure the Leaflet GIS map provides interactive layer filtering and automatic corridor bounds framing.

### Existing Capabilities
- `DistrictDashboard.jsx` calculating 25 district scores (0-100) based on weather and incident penalties.
- Regional access coverage percentage (`regionAccessCoveragePct`).
- Bottleneck list ranked by composite risk score.
- Leaflet map with 4 transport layers (Road, Rail, Water, Air), airports, transfer hubs, and incident markers.
- `RouteFitter` auto-framing active routes and regional bounds `[[23.6, 89.5], [28.3, 96.5]]`.
- Offline SVG vector canvas map.

### Missing Capabilities
- Search/filter input to quickly isolate a single district on the dashboard.
- Export button to download the regional briefing summary as CSV or printable report.

### Files Likely to Change
- `frontend/src/components/DistrictDashboard.jsx`
- `frontend/src/components/LiveMap.jsx`
- `backend/routes/dashboard.js`

### Dependencies
- Phase 1, 2, 3, 4 for real-time aggregation data.

### Acceptance Criteria
1. District dashboard reflects real-time changes in incidents: adding an incident to a corridor reduces the adjoining district connectivity score.
2. Bottleneck list updates dynamically with the highest-risk corridor at the top.
3. Map layer toggles allow isolating Road, Rail, Waterway, or Air corridors independently.
4. Auto-fit smoothly frames the route corridor without clipping.

### Automated Tests Required
- `node backend/test_api.js` (Dashboard summary endpoint test)
- Frontend build check: `npm --prefix frontend run build`

### Manual Tests Required
- View District Dashboard as Government Official; verify all 25 districts render with scores and status tags.
- Toggle between online Leaflet map and offline vector canvas map; verify both display transport corridors accurately.

---

## Phase 7 — Security, Reliability & Deployment

### Objectives
- Harden API security (CORS origin policy, HTTP security headers, rate limiting).
- Verify Supabase PostgreSQL schema with Row Level Security (RLS) and dual-mode SQLite failover.
- Validate deployment configurations (`render.yaml`, `vercel.json`).

### Existing Capabilities
- JWT authentication with 12h expiration.
- Bcrypt password hashing (salt rounds 8).
- Role-based authorization (`requireRole`).
- Sanitized SQL queries in SQLite and Supabase query builders.
- Rapid duplicate submission guard.
- Supabase schema with RLS policies and table indexes.

### Missing Capabilities
- Security headers middleware (`helmet`).
- Rate limiting middleware (`express-rate-limit`) on `/api/auth/login` and `/api/auth/signup`.
- Production environment variable validation on server startup.

### Files Likely to Change
- `backend/server.js`
- `backend/package.json`
- `backend/middleware/auth.js`
- `backend/.env.example`

### Dependencies
- All prior backend routes.

### Acceptance Criteria
1. Server starts with clear warnings if running with default JWT secret in production.
2. Authentication endpoints enforce rate limiting against brute-force attempts.
3. Unauthorized requests to protected routes return 401; role-violating requests return 403.
4. Production build completes with zero lint errors or missing imports.

### Automated Tests Required
- `node backend/test_supabase_integration.js` (Auth and RBAC tests)
- `npm --prefix frontend test`
- `npm --prefix frontend run build`

### Manual Tests Required
- Attempt accessing official-only routes (`/api/users`) using a driver token; verify 403 Forbidden is returned.

---

## Phase 8 — End-to-End QA & Jury Demo

### Objectives
- Execute the complete end-to-end hackathon demonstration scenario.
- Verify seamless transitions across all 4 role workspaces.
- Confirm trial fallback mechanisms (mock GPS, offline SVG canvas, local AI fallback).
- Finalize demo cheat-sheet and walkthrough documentation.

### The Golden Demonstration Scenario
```
1. Field Officer Priya logs into Field Workspace:
   -> Reports a Major Landslide on NH27 near Jorabat
   -> Attaches GPS fix & photo
   -> Submits report

2. Driver Arjun logs into Driver Workspace:
   -> Immediately sees the new NH27 Landslide warning in active corridor hazards
   -> Live map shows NH27 in red (Disrupted)
   -> Clicks "Calculate Safe Bypass"

3. Route Planner executes multimodal optimization:
   -> NH27 road safety index drops to 43% (estimated delay 11h 33m)
   -> System evaluates Road, Rail, Waterway, and Air Cargo
   -> Recommends AIR + ROAD (Rank #1 · Decision Score 98 · 98% safety · 1h 15m)
   -> Rationale explicitly explains the trade-off vs Rail and blocked Road

4. Logistics Operator Rohan logs into Logistics Control:
   -> Observes updated bottleneck ranking on NH27
   -> Reassigns urgent cargo shipment from road truck to multimodal air dispatch
   -> Monitors fleet GPS tracking on the map

5. Government Official Ananya logs into Briefing Room:
   -> Observes regional connectivity drop in Kamrup/Nagaon districts
   -> Reviews system-wide resource counters and team directory
```

### Existing Capabilities
- All steps of the golden scenario have been individually implemented and verified.

### Acceptance Criteria
1. Full end-to-end golden flow executes flawlessly without manual server restart.
2. Zero console errors or uncaught exceptions during role switching.
3. Map auto-fits smoothly across all viewed routes.
4. All test suites pass 100% cleanly.

### Automated Tests Required
- `node backend/test_routing_architecture.js`
- `node backend/test_multimodal_matrix.js`
- `node backend/test_connectivity.js`
- `node backend/test_api.js`
- `npm --prefix frontend test -- --watchAll=false`
- `npm --prefix frontend run build`
- `git diff --check`

### Manual Tests Required
- Step-by-step walkthrough of the Golden Demonstration Scenario in the browser UI.
