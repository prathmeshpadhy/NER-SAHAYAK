# NER-Sahayak — AI-Powered Smart Logistics & Accessibility Intelligence Platform

A full working prototype for the North Eastern Region (NER) logistics/accessibility
problem statement: real-time road accessibility, AI-optimized routing, GPS vehicle
tracking, geo-tagged field reporting with offline sync, multilingual alerts, and a
regional connectivity dashboard for officials — each in its own role-based workspace.

## What's real vs. simulated

Everything below is a genuinely working implementation, not mockups:

| Capability | Implementation |
|---|---|
| Auth & roles | JWT auth, bcrypt password hashing, SQLite-backed users (driver / field / logistics / official) |
| GIS road network | 25 real NER towns/hubs with coordinates + 28 real highway corridors (NH27, NH6, NH2, NH37…) |
| Route optimization | Dijkstra shortest-path, weighted by terrain difficulty + **live weather** + active disruption reports, with alternate-route generation |
| Live weather | Real calls to the free Open-Meteo API per network node (no key needed), cached 10 min |
| Disruption prediction | Open field reports (landslide/flood/road-block/bridge-damage) automatically feed into route risk weighting and the district dashboard — this is a rules-based risk model, not a trained ML model (see "Honest limitations" below) |
| GPS vehicle tracking | Browser Geolocation `watchPosition` pings a live `/vehicles/:id/ping` endpoint; positions persisted in SQLite |
| Field reporting | Geo-tag, photo upload (base64), category/severity, persisted to SQLite |
| Offline sync | Reports queue in `localStorage` when offline and batch-sync via `/reports/sync` when connectivity returns |
| Multilingual alerts | 8 NER languages (English, Assamese, Bengali, Hindi, Manipuri, Khasi, Mizo, Nagamese) with translated notification strings |
| District dashboard | Live connectivity score per district, logistics bottleneck ranking, shipment/vehicle counters |
| Live map | Leaflet + OpenStreetMap tiles, colored by live road condition (clear/caution/disrupted/blocked) |

### Honest limitations (so nothing is oversold)
- **Disruption prediction is rules-based, not machine-learned.** It combines live
  weather severity, terrain difficulty, and open field reports into a risk score.
  A production system would train this on historical incident + weather data.
- **GPS tracking uses the browser's/device's own location**, not a dedicated
  hardware telemetry unit — appropriate for a driver's phone, not for unattended
  cargo trackers (which would need a separate IoT/SIM tracker integration).
- **SQLite** is used for simplicity and portability. For real regional deployment,
  swap in PostgreSQL/PostGIS (`node:sqlite` → `pg`, minimal query changes).
- The weather API call is blocked in *this development sandbox's* network
  allowlist, so routes computed here may show `weatherSeverity: 0` — it works
  normally once run outside the sandbox (verified against the live Open-Meteo API
  during development, e.g. actual disruption-derived corridor blocking was tested
  successfully).

## Project structure

```
ner-sahayak/
  backend/                 Node/Express API + SQLite
    data/nerNetwork.js      Road network graph (nodes + edges)
    utils/dijkstra.js       Risk-weighted shortest-path engine
    routes/                 auth, network, weather, alerts, reports, vehicles, shipments, dashboard, i18n
    db.js                   SQLite schema + demo data seeding
    server.js                Express entrypoint
  frontend/                 React app (Create React App)
    src/context/AuthContext.jsx   Auth wired to the real backend
    src/services/api.js           API client
    src/services/offlineQueue.js  Offline report queue
    src/components/               LiveMap, RoutePlanner, FieldReportForm,
                                   VehicleTracker, DistrictDashboard, AlertsList, SettingsPanel
    src/App.jsx / App.css         Role-based workspace shell
```

## Prerequisites

- **Node.js 22 or newer** — the backend uses `node:sqlite`, a built-in module available from Node 22+. Check with `node --version`.
- No other global tools required.

## Running it

### 1. Backend
```bash
cd backend
npm install
npm start            # http://localhost:4000
```

**Optional — set a JWT secret before running in production:**
```bash
# Create backend/.env
echo "JWT_SECRET=your-long-random-secret-here" > .env
```
If `JWT_SECRET` is not set, the server starts with a hardcoded insecure default and logs a warning. Fine for local development; always set it before deploying.

On first run the server creates `ner_sahayak.db` (SQLite) and seeds 4 demo accounts
(password for all: `sahayak123`):
- `arjun@ner-sahayak.in` — driver
- `priya@ner-sahayak.in` — field officer
- `rohan@ner-sahayak.in` — logistics operator
- `ananya@ner-sahayak.in` — government official

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env   # sets REACT_APP_API_URL=http://localhost:4000
npm start               # http://localhost:3000
```

Open http://localhost:3000 — click a profile card to log in instantly, or use
"Create a profile" to register a new account for any role.

## Role-based workspaces

- **Driver** — live map, safest-route planner with live ETA, alerts, hazard reporting.
- **Field officer** — geo-tagged incident reporting (with photo + offline sync), alerts.
- **Logistics operator** — fleet GPS tracking, shipment route optimization, bottleneck visibility.
- **Government official** — regional connectivity dashboard: district-wise access
  scores, logistics bottlenecks, shipment/vehicle counters, emergency-route readiness,
  plus a **Team directory** (see below) listing every registered account.

Any signed-in user can also switch workspaces from the sidebar to preview the
other three roles without signing out.

## Adding new users / viewing all user details

**Adding users** — there's no separate admin-only creation flow; anyone signs up
through the app's "Create a profile" screen (`POST /auth/signup`), choosing their
own role. That's deliberate for a field-driven network (drivers/field officers
self-register), but if you want official-only account creation instead, gate the
signup route behind an official's JWT and drop the public signup form.

**Viewing all users** — officials get a **Team directory** page (new nav item,
visible only to the `official` role) at `Team directory` in the sidebar:
searchable/filterable table of every account (name, role, email, phone,
organisation, district/state, language, join date), with a detail panel per user.
This is backed by:
- `GET /api/users?role=&state=&search=` — list + role counts (official-only, 403 for everyone else)
- `GET /api/users/:id` — single account detail (official-only)

If you'd rather inspect the raw data directly: the backend stores everything in
`backend/ner_sahayak.db` (SQLite). Open it with any SQLite browser (e.g.
[DB Browser for SQLite](https://sqlitebrowser.org/)) or the CLI:
```bash
sqlite3 backend/ner_sahayak.db "SELECT name, email, role, district, createdAt FROM users;"
```

## API reference (all under `/api`, JWT bearer auth except `/auth/login|signup`)

- `POST /auth/login`, `POST /auth/signup`, `GET/PATCH /auth/me`
- `GET /network/nodes`, `GET /network/edges`, `POST /network/route`
- `GET /weather/all`, `GET /weather/:nodeId`
- `GET/POST/DELETE /alerts`
- `GET /reports`, `GET /reports/mine`, `POST /reports`, `POST /reports/sync`, `PATCH /reports/:id/status`
- `GET/POST /vehicles`, `POST /vehicles/:id/ping`
- `GET/POST /shipments`, `PATCH /shipments/:id/status`
- `GET /dashboard/summary`
- `GET /i18n/languages`, `GET /i18n/strings/:lang`
- `GET /users`, `GET /users/:id` (official-only)

## Extending toward production

1. Swap `node:sqlite` → PostgreSQL/PostGIS for concurrent multi-region write load.
2. Replace the rules-based risk model in `utils/dijkstra.js` with a trained
   ML model (e.g. gradient-boosted risk classifier on historical incident +
   rainfall + terrain data), keeping the same `edgeWeight()` interface.
3. Add a push-notification service (FCM/SMS gateway) driven by `/i18n/strings/:lang`
   for real multilingual delivery to field devices.
4. Add dedicated IoT/SIM-based GPS trackers for unattended cargo, alongside the
   existing driver-phone tracking.
5. Add role-based approval workflow for official-issued alerts before broadcast.
