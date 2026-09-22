# NER-SAHAYAK — AI-Based Smart Logistics & Accessibility Intelligence Platform for North Eastern Region (NER)

**Official Problem Statement:**
> “AI-Based Smart Logistics and Accessibility Intelligence Platform for North Eastern Region (NER).”

NER-SAHAYAK is a unified, resilient, and production-hardened logistics and accessibility platform purpose-built for the challenging terrain, volatile weather, and intermittent connectivity of India's North Eastern Region (NER).

The platform links **Field Officers**, **Command Centers (Disaster Management & PWD)**, **Logistics Operators**, and **Commercial Drivers** through a single canonical data pipeline:

$$\text{Field Officer (Evidence + GPS)} \to \text{Canonical Incident} \to \text{Disruption Engine} \to \text{Multi-Agency Operations} \to \text{Driver / Logistics Coordination}$$

---

## What is Real vs. Simulated

Every capability listed below is backed by real, verified code and automated regression suites:

| Capability | Actual Implementation & Mechanics | Status |
| :--- | :--- | :--- |
| **Routing & Disruption** | Deterministic Risk-Weighted Disruption Intelligence Engine using Dijkstra's algorithm across Road, Rail, Waterway, and Air. Applies $2\times$ to $15\times$ risk multipliers and infinity blockage bypass. | **Live & Deterministic** |
| **Multimodal Matrix** | 4 transport modes covering all 8 NER states (Assam, Meghalaya, Arunachal Pradesh, Nagaland, Manipur, Mizoram, Tripura, Sikkim) with transfer node detection. | **Live & Deterministic** |
| **Disruption Model** | **Explainable rule-weighted risk model** combining live weather, elevation, road conditions, and canonical incidents. *(Not trained machine learning — see Data Honesty section).* | **Rule-based & Grounded** |
| **Canonical Evidence** | Real captured GPS coordinates (never substituted with mock values) and base64 field photos. Missing GPS is honestly returned as `lat: null`, `lng: null`, `hasGps: false`. | **Canonical Truth** |
| **Offline Operations** | Offline field queuing in `localStorage` with client IDs (`clientId`). Batch sync via `/api/reports/sync` and `/api/alerts/sync-responses` with idempotent deduplication. | **Tested & Resilient** |
| **Logistics & Vehicles** | Live telemetry tracking with explicit location source labels: `LIVE GPS`, `LAST KNOWN`, `STATIC DEMO`, or `UNAVAILABLE`. Corridors map to shipments with delay calculation. | **Honest Telemetry** |
| **Command Center** | State-by-state Regional Connectivity Index ($0 - 100$), critical corridor monitoring, emergency route evaluator, and cross-hazard alert aggregation. | **Real-time Aggregation** |
| **Multi-Agency Response** | Closed-loop state machine (`new` $\to$ `acknowledged` $\to$ `in_progress` $\to$ `escalated` $\to$ `resolved`) with chronological audit logging in `activity_logs`. | **RBAC Enforced** |
| **Multilingual Support** | Complete localized strings for all 8 NER languages: English, Assamese, Bengali, Hindi, Manipuri, Khasi, Mizo, and Nagamese. | **Full 8 Languages** |
| **Security & Hardening** | Security headers (CSP, nosniff, SAMEORIGIN), CORS origin whitelisting, sliding-window rate limiters, coordinate sanity bounds, and sanitized error responses. | **Production Hardened** |

---

## System Architecture

```
                                  [ CLIENT WORKSPACES ]
       ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
       │ Command Center   │  Field Officer   │ Logistics Fleet  │  Freight Driver  │
       │ (Official / PWD) │  (Site Reports)  │  (Dispatchers)   │  (Safe Routing)  │
       └────────┬─────────┴────────┬─────────┴────────┬─────────┴────────┬─────────┘
                │                  │                  │                  │
                ▼                  ▼                  ▼                  ▼
       ┌───────────────────────────────────────────────────────────────────────────┐
       │          API GATEWAY / SECURITY MIDDLEWARE (Express.js on Node 22+)        │
       │  • CORS Origin Filter  • Security Headers (CSP)  • Rate Limiter (Sliding) │
       │  • Coordinate Bounds   • Role-Based Access Control • Photo MIME Verifier   │
       └─────────────────────────────────────┬─────────────────────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
       ┌───────────────────────────────┐           ┌───────────────────────────────┐
       │   INTELLIGENCE CORE ENGINE    │           │     PERSISTENCE & RECOVERY    │
       │ • Risk-Weighted Dijkstra      │           │ • Primary: Supabase Postgres  │
       │ • Multimodal Transfer Scorer  │           │ • Fallback: Embedded SQLite   │
       │ • Disruption Multiplier Matrix│           │ • Client Queue: localStorage  │
       │ • State Connectivity Index    │           │ • Canonical Incident Store    │
       └───────────────┬───────────────┘           └───────────────────────────────┘
                       │
       ┌───────────────┴───────────────────────────────────────────┐
       ▼                                                           ▼
┌───────────────────────────────┐                   ┌───────────────────────────────┐
│   EXTERNAL WEATHER SERVICES   │                   │    NOTIFICATION & AI ENGINE   │
│ Tier 1: OpenWeatherMap (Key)  │                   │ Tier 1: OpenAI / Gemini API   │
│ Tier 2: Open-Meteo (Keyless)  │                   │ Tier 2: Local Rule Knowledge  │
│ Tier 3: Deterministic Fallback│                   │ Tier 3: In-App Broadcast Bus  │
└───────────────────────────────┘                   └───────────────────────────────┘
```

---

## The Four Role-Based Workspaces

1. **Government Official & Command Center** (`ananya@ner-sahayak.in`):
   - Executive briefing with Regional Connectivity Index across all 8 NER states.
   - Live corridor monitoring with accessibility states: `OPEN`, `CAUTION`, `RESTRICTED`, `SEVERELY_DISRUPTED`, `BLOCKED`.
   - Emergency Route Evaluator calculating detour delays and multimodal alternatives (e.g. Rail/Air during highway blockages).
   - Team Directory with administrative user management.
2. **Field Officer** (`priya@ner-sahayak.in`):
   - Incident reporting with real device GPS capture and photo capture.
   - Automatic local offline queueing when out of cellular coverage with pending counter.
   - Automatic background and manual one-click synchronization upon network reconnection.
   - Field alert response and site clearance verification.
3. **Logistics Operator & Fleet Dispatcher** (`rohan@ner-sahayak.in`):
   - Real-time fleet monitoring and driver assignment.
   - Disruption-aware shipment tracking: automatic baseline ETA vs. current ETA delay calculation.
   - Immediate visibility into affected corridors, site evidence, and recommended multimodal alternatives.
4. **Transport Driver** (`arjun@ner-sahayak.in`):
   - Turn-by-turn route planner with live road hazard warnings.
   - Location ping reporting (`LIVE GPS` or `LAST KNOWN`).
   - Route hazard acknowledgment with photo evidence inspection.

---

## Intelligence & Routing Approach

### 1. Deterministic Disruption & Routing Engine
The routing engine is a **deterministic risk-weighted Dijkstra shortest-path algorithm**:
- **Baseline Speeds**: Road ($45\text{ km/h}$), Railway ($55\text{ km/h}$), Waterway ($24\text{ km/h}$), Air ($500\text{ km/h}$).
- **Disruption Penalties**:
  - `minor`: $2.0\times$ transit multiplier (Caution).
  - `moderate`: $5.0\times$ transit multiplier (Restricted).
  - `severe` / `major`: $15.0\times$ transit multiplier (Severely Disrupted).
  - `blocked`: $\infty$ cost multiplier (Physical Blockage; Dijkstra automatically routes around blocked corridors).
- **Compound Weather Penalties**: Adverse weather ($>0.60$ severity) compounds multiplicatively with physical hazards without overwriting.

### 2. Explainable Recommendation Scorer
Candidate routes across all 4 modes are scored using a normalized decision function balancing:
$$\text{Score} = w_{\text{safety}} \cdot S_{\text{norm}} + w_{\text{time}} \cdot T_{\text{norm}} + w_{\text{cost}} \cdot C_{\text{norm}}$$
- **Normal Freight**: Balanced weights prioritizing predictable transit and highway safety.
- **Heavy Cargo**: Strongly prioritizes Railway for heavy payloads over long distances.
- **Emergency Priority**: Heavily weights Safety ($0.60$) and Transit Speed ($0.40$), favoring Air corridors during regional landslides.

---

## Data Honesty & Terminology Standards

To maintain absolute credibility for hackathon and jury evaluation:
1. **No Fake ML**: The disruption engine is an **explainable, deterministic rule-weighted risk model**, not a trained deep learning model.
2. **No Fabricated GPS**: If device GPS is denied or unavailable, coordinates remain `null`, and `hasGps: false` is displayed. Approximate hub positions are clearly labeled as map fallbacks.
3. **Honest Telemetry Labels**:
   - `LIVE GPS`: Real device fix received within threshold.
   - `LAST KNOWN`: Cached coordinates with timestamp.
   - `STATIC DEMO`: Pre-seeded demo vehicle.
   - `UNAVAILABLE`: Telemetry absent or unreachable.
4. **Semantic Distinction between Alerts and Incidents**:
   - *Alert Lifecycle*: `new` $\to$ `acknowledged` $\to$ `in_progress` $\to$ `escalated` $\to$ `resolved`.
   - *Incident Lifecycle*: `active` $\to$ `monitored` $\to$ `physically cleared/resolved`.
   - Resolving an operational alert does not automatically clear the corridor disruption unless physical hazard clearance (`clearHazard: true`) is verified.

---

## Prerequisites & Setup Instructions

### Prerequisites
- **Node.js 20 or newer** (tested on Node 22 & 26).
- **npm** (v9+).

### 1. Backend Setup
```bash
cd backend
npm install
npm start
# Backend runs on http://localhost:4000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm start
# Frontend runs on http://localhost:3000
```

### 3. Production Build & Static Serving
```bash
# Build the optimized production bundle
npm --prefix frontend run build

# Backend automatically serves frontend/build when present
NODE_ENV=production node backend/server.js
```

### Seed User Accounts
All seed accounts use the default password: `sahayak123`
- `ananya@ner-sahayak.in` — Government Official / Command Center
- `priya@ner-sahayak.in` — Field Officer (PWD / District Engineer)
- `rohan@ner-sahayak.in` — Logistics Operator (Fleet Manager)
- `arjun@ner-sahayak.in` — Commercial Driver (Cargo Operator)

---

## Environment Variables Configuration

Copy `.env.example` to `.env` in the project root or configure in deployment:

```bash
# General
NODE_ENV=development
PORT=4000
JWT_SECRET=your-secure-random-jwt-secret-at-least-32-chars
CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

# Weather (Optional - falls back to Open-Meteo & deterministic baseline)
OPENWEATHER_API_KEY=

# Supabase Database (Optional - falls back to local SQLite)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# Generative AI (Optional - falls back to local rule-based NER engine)
OPENAI_API_KEY=
GEMINI_API_KEY=

# Web Push (Optional - falls back to in-app delivery)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

---

## End-to-End Golden Path Demo Flow

To demonstrate the full power of NER-SAHAYAK to judges:

1. **Field Incident Capture**:
   - Log in as **Priya Deka** (Field Officer).
   - Submit a report on **NH37 (Jorhat ↔ Dibrugarh)**: Category `landslide`, Severity `major`, with real photo and GPS fix.
2. **Canonical Incident & Alert Publication**:
   - Canonical server incident created with verified evidence.
   - Operational alert auto-published across the network.
3. **Command Center Monitoring**:
   - Log in as **Dr. Ananya Gogoi** (Government Official).
   - View **Critical Corridors**: NH37 is flagged as disrupted with active hazard details.
   - View **Emergency Route Evaluator**: Evaluates detour impact and recommends Rail alternative.
4. **Logistics & Driver Impact**:
   - Log in as **Rohan Sharma** (Logistics Operator): Shipments routed via NH37 immediately show delay and hazard warnings.
   - Log in as **Arjun Bora** (Driver): Route planner advises detour or alternate multimodal transit.
5. **Multi-Agency Response**:
   - Official or Logistics clicks **Take Action ➔** on the alert.
   - Performs `ACKNOWLEDGE`, then `CLAIM` (assigns "PWD Quick Response Unit"), and appends operational notes.
6. **Physical Hazard Clearance**:
   - Once site clearance is complete, official executes `RESOLVE` with hazard clearance confirmation.
   - Canonical incident updates to `resolved`, clearing the Dijkstra corridor penalty.
   - Corridor accessibility immediately returns to `OPEN`.

---

## Automated Verification Suite

Run all automated test suites locally:

```bash
# Phase 7 Hardening & Security (42 tests)
node backend/test_phase7_hardening.js

# Phase 6 Multi-Agency Response & i18n (30 tests)
node backend/test_phase6_response.js

# Phase 5 Government Command Center (25 tests)
node backend/test_phase5_command_center.js

# Phase 4 Logistics & Shipment Intelligence (20 tests)
node backend/test_phase4_logistics.js

# Phase 3B Offline Operations & Sync (16 tests)
node backend/test_phase3b_offline.js

# Phase 3A Field Evidence Propagation (10 tests)
node backend/test_phase3a_evidence.js

# Phase 2 Intelligent Routing & Scorer (16 tests)
node backend/test_phase2_routing.js

# Phase 1 Disruption & Accessibility (14 tests)
node backend/test_phase1_disruption.js

# Routing Architecture & Corridor Tests (20 tests)
node backend/test_routing_architecture.js

# Multimodal Matrix Across 8 States (36 tests)
node backend/test_multimodal_matrix.js

# Full Network Graph Connectivity (600 node pairs)
node backend/test_connectivity.js

# Frontend Unit Tests (4 tests)
npm --prefix frontend test -- --watchAll=false

# Production Webpack Compilation
npm --prefix frontend run build
```

**Total Verified Checks: 833 / 833 Passing.**
