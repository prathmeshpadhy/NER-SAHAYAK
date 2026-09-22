# NER-SAHAYAK — Phase 3A Implementation: Field Report Evidence Propagation
**Deterministic Risk-Weighted Disruption Intelligence Platform for North Eastern Region (NER)**

---

## 1. Executive Summary
During manual testing of the field reporting lifecycle, a functional gap was identified:
When a Field Officer submitted an incident report with live GPS coordinates and an attached photo, the disruption reached Driver and Route Planner workspaces as an abstract numerical hazard penalty, but the original GPS telemetry and photographic ground truth evidence could not be inspected.

Phase 3A resolves this gap by propagating the single canonical incident record across all operational workspaces:
1. **Field Officer**: Submits report with device GPS and on-site photo $\to$ verifies evidence in report stream.
2. **Driver**: Receives active hazard alert on route $\to$ inspects verified GPS coordinates and photo evidence $\to$ evaluates bypass.
3. **Logistics & Command Control**: Reviews corridor hazards affecting supply chains $\to$ inspects field evidence before authorizing rerouting.
4. **Live Map**: Clicks incident markers on the interactive Leaflet map or SVG offline vector canvas $\to$ opens full evidence modal.
5. **Route Planner**: Clicks active corridor hazards $\to$ inspects photo and coordinates without perturbing the underlying Dijkstra routing algorithm.

---

## 2. Canonical Data Architecture

### Single Canonical Record
No duplicated records are created for different workspaces. All roles access the same canonical incident model:
```typescript
interface CanonicalIncident {
  id: string;                      // UUID matching incidents table
  userId: string;                  // Reporter ID
  reporterRole: 'field' | 'driver' | 'official';
  road: string;                    // Corridor designation (e.g., NH27)
  fromNode: string | null;         // Nearest network node / segment start
  toNode: string | null;           // Nearest network node / segment end
  category: string;                // Disruption category (landslide, flood, etc.)
  severity: 'minor' | 'moderate' | 'major' | 'critical';
  title: string;                   // Operational incident title
  description: string;             // Qualitative field observations
  lat: number | null;              // Exact device GPS latitude (null if omitted)
  lng: number | null;              // Exact device GPS longitude (null if omitted)
  hasGps: boolean;                 // Explicit boolean flag (true only when GPS provided)
  photoDataUrl: string | null;     // Valid Base64 Data URL or storage URL
  status: 'active' | 'verified' | 'resolved';
  createdAt: string;               // ISO 8601 timestamp
  resolvedAt?: string;             // ISO 8601 timestamp upon resolution
  resolutionNotes?: string;        // Officer sign-off rationale
}
```

---

## 3. Evidence Propagation Guarantees

### GPS Handling
- **Authentic Telemetry**: The exact latitude and longitude submitted by the field hardware are stored without rounding loss or synthetic substitution.
- **Never Fabricate Coordinates**: If a field officer reports an incident without GPS (e.g. by corridor name), the backend explicitly returns `lat: null`, `lng: null`, and `hasGps: false`.
- **UI Distinction**: The UI displays an explicit badge:
  - When present: `🌐 Fix: 26.3457°, 92.6843°` (Verified on-site fix)
  - When omitted: `🌐 GPS: Unavailable` (Reported by corridor reference)
- **Map Visualization Fallback**: The interactive map may calculate approximate corridor placement for map markers, but the evidence modal explicitly informs the user that GPS coordinates are unavailable.

### Photo Evidence Handling
- **Authentic Media**: The actual image captured on-site is propagated via Base64 Data URL.
- **Format Validation**: New submissions are strictly validated against supported image mime types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`) or valid image URLs. Malicious non-image payloads (e.g. HTML or script injections) are rejected with a 400 Bad Request.
- **Never Fabricate Placeholders**: If no photo was attached, `photoDataUrl` remains `null`. The UI renders `📷 No photo attached` rather than mock placeholder images masquerading as real photos.

---

## 4. API Specification

### `GET /api/reports/:id`
- **Authentication**: Protected by `requireAuth` (JWT or valid session token).
- **Access Control**: Authenticated field officers, drivers, logistics operators, and command officials.
- **Response**:
```json
{
  "report": {
    "id": "7c12f458-9b81-4822-8409-bbdf59239841",
    "title": "NH27 Major Landslide near Nagaon Bypass",
    "category": "landslide",
    "severity": "major",
    "road": "NH27",
    "fromNode": "nagaon",
    "toNode": "guwahati",
    "lat": 26.34567,
    "lng": 92.68432,
    "hasGps": true,
    "photoDataUrl": "data:image/jpeg;base64,...",
    "status": "active",
    "createdAt": "2026-09-22T01:30:00.000Z",
    "description": "Both lanes blocked by boulder fall. Heavy machinery deployed."
  }
}
```

---

## 5. Automated Verification Results

### Test Suite Execution
```
Suite 1: node backend/test_phase3a_evidence.js
✓ Field Officer submits report with GPS -> server stores GPS accurately
✓ Driver retrieves incident -> exact same GPS coordinates returned
✓ Command/Admin retrieves incident -> exact same GPS coordinates returned
✓ Field Officer submits report with photo -> server stores photo data URL
✓ Driver retrieves incident -> actual photo data is available
✓ Command/Admin retrieves incident -> actual photo data is available
✓ Missing GPS -> returns null coordinates and hasGps: false (never fabricated)
✓ Missing photo -> returns null photoDataUrl without placeholder URLs
✓ Photo validation -> successfully rejected invalid non-image payload
✓ Same report ID / incident ID used across all queries (canonical single record)
Result: 10/10 PASSED (0 failed)

Suite 2: node backend/test_phase1_disruption.js
Result: 14/14 PASSED (0 failed)

Suite 3: node backend/test_phase2_routing.js
Result: 16/16 PASSED (0 failed)

Suite 4: node backend/test_routing_architecture.js
Result: 20/20 PASSED (0 failed)

Suite 5: node backend/test_multimodal_matrix.js
Result: 36/36 PASSED (0 failed)

Suite 6: node backend/test_connectivity.js
Result: 600/600 node pairs tested (0 failed)

Suite 7: npm --prefix frontend test -- --watchAll=false
Result: 4/4 PASSED (0 failed)

Suite 8: npm --prefix frontend run build
Result: Compiled successfully with zero errors
```
