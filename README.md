# EV Infrastructure Management Application

A full-stack application for managing California's EV charging infrastructure, including sites, utility services, equipment, vehicles, and infrastructure projects.

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm start
```

### Backend
```bash
cd backend
pip install -r requirements.txt

# Windows PowerShell
$env:FLASK_APP = "run.py"
flask run

# Linux/Mac
export FLASK_APP=run.py
flask run
```

## Authentication (Authelia OIDC)

The app uses **Authelia** as the identity provider via OpenID Connect (OIDC). The frontend
uses `oidc-client-ts` / `react-oidc-context` for the authorization code + PKCE flow; the
Flask backend validates the resulting JWT against Authelia's JWKS endpoint.

Authentication is **opt-in** — disabled by default so the app works out of the box for local
development with no Authelia setup required.

### How It Works

```
Browser  →  signinRedirect (prompt:login)  →  Authelia login page
                                                      ↓
                                         Authorization code returned
                                                      ↓
Browser  →  Token exchange (PKCE)  →  Authelia /api/oidc/token
                                                      ↓
                                         Access token (JWT) cached in sessionStorage
                                                      ↓
Browser  →  GET /api/...  →  Flask validates token via Authelia JWKS
```

1. The frontend redirects the user to Authelia's login page (`prompt: 'login'` is always
   passed so credentials are required even if an Authelia session cookie exists).
2. After sign-in, an authorization code is exchanged for tokens via PKCE — no client secret
   is needed or used.
3. Every API request attaches the access token as `Authorization: Bearer <token>`.
4. The Flask backend validates the token's signature, expiry, issuer, and audience before
   serving any `/api/` response. Unauthenticated requests receive `401`.
5. Sign-out calls `removeUser()` to clear the local token. Because this version of Authelia
   does not publish an `end_session_endpoint`, the Authelia session cookie is cleared by
   the browser when it expires; `prompt: 'login'` on the next sign-in prevents silent reuse
   of any lingering session.

### Step 1 — Authelia OIDC Client Registration

In `deploy/authelia/configuration.yml`, register the app as an OIDC client:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: ev-infra-app
        client_name: EV Infrastructure App
        public: true          # no client_secret — PKCE only
        authorization_policy: one_factor
        redirect_uris:
          - https://<production-hostname>
          - https://<production-hostname>/
          - http://localhost:3000
          - http://localhost:3000/
        scopes:
          - openid
          - profile
          - email
        response_types:
          - code
        grant_types:
          - authorization_code
        pkce_challenge_method: S256
    cors:
      endpoints:
        - authorization
        - pushed-authorization-request
        - token
        - revocation
        - introspection
        - userinfo
      allowed_origins:
        - 'https://<production-hostname>'
        - 'http://localhost:3000'
      allowed_origins_from_client_redirect_uris: true
```

> **CORS note:** `allowed_origins_from_client_redirect_uris: true` alone is not sufficient
> for cross-origin token exchange. The `allowed_origins` list must be explicit.

### Step 2 — Configure the Backend

Copy `.env.example` to `.env` inside the `backend/` folder and fill in:

```dotenv
OIDC_ENABLED=true
OIDC_ISSUER=https://<authelia-hostname>
OIDC_CLIENT_ID=ev-infra-app
OIDC_AUDIENCE=ev-infra-app
# OIDC_JWKS_URI defaults to <OIDC_ISSUER>/jwks.json
```

### Step 3 — Configure the Frontend

Copy `.env.example` to `.env.local` inside the `frontend/` folder and fill in:

```dotenv
REACT_APP_OIDC_AUTHORITY=https://<authelia-hostname>
REACT_APP_OIDC_CLIENT_ID=ev-infra-app
REACT_APP_OIDC_REDIRECT_URI=http://localhost:3000
```

### Step 4 — Run With Auth Enabled

```powershell
# Backend (PowerShell)
cd backend
$env:FLASK_APP = "run.py"
flask run

# Frontend (separate terminal)
cd frontend
npm start
```

Open `http://localhost:3000` — you will be redirected to the Authelia login page.
After signing in, you are returned to the app with full access.

The header shows your display name and **Sign out** / **Register** buttons.

### Turning Auth Off (Local Development)

Leave `OIDC_CLIENT_ID` unset (or set `OIDC_ENABLED=false` in the backend). The app runs
with no login required. The backend's `TestingConfig` also hard-disables auth so the test
suite is unaffected.

### API Endpoint — Current User

```
GET /api/auth/me
```

Returns the signed-in user's claims:

```json
{
  "authenticated": true,
  "auth_enabled": true,
  "sub": "jsmith",
  "name": "Jane Smith",
  "email": "jsmith@example.com"
}
```

Returns `"authenticated": false` with a stub name when auth is disabled.

### Configuration Reference

#### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `OIDC_ENABLED` | `false` | Set `true` to enforce auth on all `/api/` routes |
| `OIDC_ISSUER` | `""` | Authelia base URL (e.g. `https://auth.example.com`) |
| `OIDC_CLIENT_ID` | `""` | Client ID registered in Authelia |
| `OIDC_AUDIENCE` | *(client ID)* | Token audience; defaults to `OIDC_CLIENT_ID` |
| `OIDC_JWKS_URI` | *(auto)* | Override JWKS endpoint (auto-derived from issuer) |
| `AUTHELIA_USERS_FILE` | `/etc/authelia/users_database.yml` | Path to Authelia users file (write access required for self-service registration) |
| `FRONTEND_URL` | `https://svgc32zevi.dot.ca.gov` | Base URL for email verification links |
| `SMTP_HOST` | `""` | SMTP server host (leave empty to log verification links instead) |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USERNAME` | `""` | SMTP credentials |
| `SMTP_PASSWORD` | `""` | SMTP credentials |
| `SMTP_FROM` | `""` | From address for verification emails |
| `SMTP_USE_TLS` | `true` | Use STARTTLS (`true`) or plain SMTP (`false`) |

#### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `REACT_APP_OIDC_AUTHORITY` | `""` | Authelia base URL — leave blank to disable auth |
| `REACT_APP_OIDC_CLIENT_ID` | `""` | Client ID |
| `REACT_APP_OIDC_REDIRECT_URI` | `http://localhost:3000` | OAuth redirect URI |

## Self-Service User Registration

Users can create their own accounts without administrator intervention. Accounts are created
directly in Authelia's `users_database.yml` after email verification.

### Flow

```
/register form  →  POST /api/auth/register
                         │
                   Validate input
                   Hash password (argon2id — same params as Authelia)
                   Insert into pending_registrations table
                         │
                   Send verification email  →  User clicks link
                         │
                   GET /api/auth/verify-email?token=…
                         │
                   Write user to users_database.yml
                   Delete pending record
                         │
                   User can now log in via Authelia
```

### Setup

1. **Grant Flask write access to the Authelia users file** (run on the server):
   ```bash
   sudo chown authelia:<flask-process-user> /etc/authelia/users_database.yml
   sudo chmod 660 /etc/authelia/users_database.yml
   ```

2. **Run the database migration** to create the `pending_registrations` table:
   ```bash
   export FLASK_APP=run.py
   flask db migrate -m "add pending registrations"
   flask db upgrade
   ```

3. **Set `FRONTEND_URL`** in `backend/.env` to the production hostname so verification
   links in emails point to the right server.

4. **Optionally configure SMTP** (see `SMTP_*` vars above). Without SMTP, the verification
   link is printed to the Flask/gunicorn log (`journalctl -u evinfra`) — useful for testing.

### Password Requirements

- Minimum 10 characters
- Hashed with **argon2id** using the same parameters Authelia uses:
  `memory=131072, iterations=3, parallelism=4, hash_len=32, salt_len=16`
- The hash written to `users_database.yml` is immediately usable by Authelia with no
  rehashing required.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Submit registration (username, display_name, email, password) |
| `GET` | `/api/auth/verify-email?token=…` | Confirm email and activate account |

### Token Expiry

Pending registrations expire after 24 hours by default. Override with
`REGISTRATION_TOKEN_TTL=<seconds>` in `backend/.env`.

## Browser & Deployment Requirements

### HTTPS Required
The application **requires HTTPS in production** for the following features:
- **Geolocation API**: Modern browsers (Chrome, Safari, Firefox) block location access on non-HTTPS sites
- **Secure cookies**: For production authentication and session management
- **Progressive Web App features**: Service workers require HTTPS

**Development Exception**: `localhost` and `127.0.0.1` are exempt from HTTPS requirements for local development.

### Browser Compatibility
- **Chrome/Edge**: 90+ (fully supported)
- **Safari**: 14+ (fully supported, including iOS Safari)
- **Firefox**: 88+ (fully supported)
- **Mobile browsers**: Optimized for iOS Safari and Chrome on Android

### SSL Certificate Setup
For servers behind a firewall (cannot use Let's Encrypt):
1. Request a `.pfx` certificate from your IT department
2. Use the automated setup script: `sudo deploy/scripts/setup_ssl.sh`
3. See detailed instructions in `deploy/SSL_SETUP_BEHIND_FIREWALL.md`

For publicly accessible servers:
- Use Let's Encrypt with certbot (automated renewal)
- See `deploy/README.md` for complete SSL setup instructions

## Equipment Energy & Peak Concurrent kWh

The application computes energy metrics for each vehicle and rolls them up to a site-level summary via the `site_equipment_energy` service. The most important metric for charger infrastructure sizing is **Peak Concurrent kWh**.

### Trailing 12-Month Window

All energy calculations use a trailing 12-month window rather than a fixed calendar year. The window end is auto-detected from the latest `equipment_usage` record using month ordinals (`year × 12 + month − 1`). For example, if the latest data is January 2026, the window covers **Feb 2025 – Jan 2026**.

### Per-Vehicle Metrics

For each vehicle at a site, the service computes:

| Metric | Formula |
|---|---|
| **Usage Miles** | Sum of `miles` across all months in the window |
| **Effective Miles** | `annual_miles` override if set, otherwise usage miles |
| **Energy (kWh)** | `effective_miles × energy_per_mile` (from the vehicle's equipment category) |
| **Daily Avg kWh** | `energy_kwh / total_days_utilized` |
| **Daily Max kWh** (`item_daily_max_kwh`) | `max` over all months of `(month_miles × energy_per_mile / days_utilized)` |
| **Avg Power (kW)** | `energy_kwh / driving_hours` (falls back to 8760 hrs if unknown) |

The energy factor (`energy_per_mile`) is resolved from the vehicle's `EquipmentCategory`. If `energy_per_mile` is set, it is used directly; otherwise `1 / miles_per_kwh` is used. Months with zero or null `days_utilized` are excluded from daily calculations.

### Site-Level Rollup

| Metric | Formula |
|---|---|
| **Total Miles** | Sum of each vehicle's effective miles |
| **Total Energy (kWh)** | Sum of each vehicle's energy |
| **Site Daily Avg kWh** | `total_energy / total_days_utilized` across all vehicles |
| **Site Daily Max kWh** | Max single-vehicle single-month daily energy observed at the site |
| **Peak Concurrent kWh** | **Sum of each vehicle's `item_daily_max_kwh`** |

### Peak Concurrent kWh — Charger Sizing Metric

`site_peak_concurrent_kwh` answers: *"If every vehicle at this site hit its worst-case daily energy demand on the same day, how many kWh would the site need?"*

**Calculation:**
1. For each vehicle, find the month with the highest daily energy: `max(month_miles × energy_per_mile / days_utilized)`
2. Sum those per-vehicle peaks across all vehicles at the site

This is deliberately conservative — it assumes all vehicles peak simultaneously. To convert to required charger capacity in kW, divide by the number of hours in the charging window (e.g., `peak_concurrent_kwh / 10` for a 10-hour overnight window).

**Edge cases handled:**
- Months with `days_utilized = 0` or `NULL` are excluded
- Vehicles without a valid energy factor (no `energy_per_mile` or `miles_per_kwh`) are excluded
- `annual_miles` override affects total energy but **not** `item_daily_max_kwh` (which always uses actual monthly usage)
- Usage outside the 12-month window is excluded
- Sites with no equipment or no qualifying usage return `null`

**Tests:** `backend/tests/test_peak_concurrent_kwh.py` — 17 tests covering single/multi-vehicle scenarios, window boundaries, edge cases, and the inverse `miles_per_kwh` path.

## Recent Features (March 2026)

### Phase 1 — Site Prioritization Model

A configurable scoring engine that ranks all ~240+ sites by EV infrastructure readiness using seven weighted dimensions.

**Backend:**
- **Weight Profiles** — Create multiple named profiles with custom weights for: Vehicle Count, Annual Miles, Electrical Headroom, Charger Gap, Project Readiness, Energy Demand, and Data Completeness.
- **Composite Scoring** — Min-max normalization across all sites, then weighted sum (0–100 scale). Deterministic: same data + same weights = same scores.
- **Investigation Urgency** — Separate metric flagging sites with vehicles but missing service/survey data, calculated as `(100 - completeness) × (vehicle_count_score + charger_gap_score) / 200`.
- **CSV Export** — Download ranked tables or investigation lists as CSV.

**Frontend:**
- **Priority Dashboard** (`/priorities`) — Two tabs:
  - *Design Priority*: Ranked table with per-dimension breakdown, sortable/filterable/searchable, weight profile selector, recalculate button
  - *Needs Investigation*: Sites requiring field surveys, with data completeness % and missing data indicators
- **Home Page Widgets** — Top 10 Priority Sites and Top 10 Needs Investigation cards on the dashboard
- **Site Details Enhancement** — Data completeness progress bar and "Needs Survey" banner with missing-data checklist

**API Endpoints:**
- `POST /api/priorities/recalculate` — Recalculate all scores (optional `weight_profile_id`)
- `GET /api/priorities/scores?page=&per_page=&sort=&order=&district=&min_score=&search=` — Paginated ranked scores
- `GET /api/priorities/scores/:site_id` — Single site score breakdown
- `GET /api/priorities/scores/export` — CSV export
- `GET /api/priorities/investigation?page=&per_page=&district=&search=` — Investigation list
- `GET /api/priorities/investigation/export` — Investigation CSV export
- `GET /api/priorities/weights` — List weight profiles
- `POST /api/priorities/weights` — Create profile
- `PUT /api/priorities/weights/:id` — Update profile
- `DELETE /api/priorities/weights/:id` — Delete profile (cannot delete Default)

**Migration:** `alembic upgrade head` creates `site_priority_weights` and `site_priority_scores` tables with a seeded Default profile.

### Phase 2 — MCP Knowledge Base Integration

Connects ev-infra-app to the MCP RAG knowledge base so site data, project facts, and fleet statistics are searchable via semantic queries in VS Code Copilot.

**Architecture:**
```
ev-infra-app (PostgreSQL)
       │
       ▼
  Sync Service (mcp_sync_service.py)
       │  Generates text documents from structured data
       │  POST to pgvector-api /ingest endpoint
       ▼
  pgvector-api (PostgreSQL + pgvector)
       │
       ▼
  mcp_server.py ──► VS Code Copilot / Claude Desktop
```

**Backend:**
- **Sync Service** (`app/services/mcp_sync_service.py`) — Generates natural-language summaries for 4 document types:
  - `evinfra://sites/{id}` — Site Summary (location, electrical, chargers, vehicles)
  - `evinfra://sites/{id}/fleet` — Fleet Profile (vehicle categories, miles, energy demand)
  - `evinfra://projects/{id}` — Project Status (steps, per-site progress)
  - `evinfra://priorities/latest` — Priority Rankings (top/bottom 20, score distribution)
- **Sync Modes:**
  - `sync_all()` — Full re-sync of all documents
  - `sync_site(site_id)` — Incremental sync after site data changes
  - `sync_project(project_id)` — Incremental sync after project status update
  - `sync_priorities()` — Re-sync after priority recalculation
- **Auto-Sync Hooks** (fire-and-forget, gated by `MCP_SYNC_ENABLED`):
  - Site update → `sync_site()`
  - Charger create/update/delete → `sync_site()`
  - Equipment create → `sync_site()`
  - Project status create/update → `sync_project()`
  - Priority recalculate → `sync_priorities()`
- **Sync Logging** — `mcp_sync_log` table tracks every sync (type, status, document count, errors)

**API Endpoints:**
- `POST /api/mcp/sync` — Trigger full sync (all sites, projects, priorities)
- `POST /api/mcp/sync/site/:site_id` — Sync a single site's documents
- `POST /api/mcp/sync/project/:project_id` — Sync a single project's documents
- `GET /api/mcp/status` — Sync status (last sync time, document count, recent errors)

**Frontend:**
- **Settings Page** (`/settings`) — MCP Sync section with:
  - Enabled/Disabled status badge
  - Last sync info (time, type, result, document count)
  - "Sync Now" button for manual full sync
  - Recent errors log viewer

**Configuration (`backend/.env`):**

| Variable | Default | Description |
|---|---|---|
| `MCP_PGVECTOR_URL` | `http://127.0.0.1:8000` | pgvector-api base URL |
| `MCP_API_KEY` | `""` | API key for pgvector-api authentication |
| `MCP_SYNC_ENABLED` | `false` | Enable/disable MCP sync (opt-in, zero impact when off) |

**Migration:** `alembic upgrade head` creates the `mcp_sync_log` table.

**Key design decisions:**
- Sync is disabled by default — zero performance impact until opted in
- All sync hooks are fire-and-forget — failures are logged but never break the primary API
- Documents use `evinfra://` URI scheme for scoped semantic search in MCP tools

## Recent Features (April 2026)

### Charger Capacity Analysis

A dual-scenario charger capacity analysis tool that helps determine infrastructure readiness by comparing available charging capacity against fleet energy demands for both overnight and fast-charging scenarios.

**Features:**
- **Dual Scenario Analysis** — Two side-by-side boxes in Site Details:
  - **8-Hour Charging** (Overnight): Evaluates slow/medium chargers (≤19 kW) for overnight charging use
  - **2-Hour Charging** (Fast): Evaluates fast chargers (>19 kW) for rapid turnover scenarios
- **Intelligent Charger Filtering** — Each scenario only counts relevant charger types:
  - 8-hour box filters to chargers ≤19 kW (e.g., 6.7, 11, 19 kW Level 2 chargers)
  - 2-hour box filters to chargers >19 kW (e.g., 50, 150, 350 kW DC fast chargers)
- **Port-Level Metrics** — Counts individual charging ports (not just chargers) since many fast chargers have multiple ports:
  - Installed Charger Ports / Vehicles ratio
  - Planned Charger Ports / Vehicles ratio
  - Per-vehicle port ratios for capacity planning
- **Capacity Gap Analysis**:
  - Required kW capacity calculated from `Peak Concurrent kWh / hours`
  - Installed vs Required comparison with percentage progress
  - Planned Total vs Required comparison
  - Color-coded surplus (green) or deficit (red) indicators
  - Visual progress bars showing installed capacity readiness
- **Integration with Equipment Energy** — Uses the existing `Peak Concurrent kWh` metric (sum of each vehicle's peak-month daily energy) as the basis for capacity requirements

**Display:**
- Located in Site Details page immediately after Equipment Energy section
- Side-by-side layout matching other site metric boxes
- Responsive design stacks vertically on smaller screens
- Only appears when Peak Concurrent kWh data is available

**Component:** `frontend/src/components/ChargerCapacitySection.js`
- Reusable component accepts `hours` prop (8 or 2) to configure scenario
- Fetches charger data and filters based on power rating
- Calculates installed vs planned capacity metrics
- Displays vehicle count ratios when available

**Use Cases:**
- Determine if existing slow chargers can support overnight fleet charging (8-hour scenario)
- Assess need for fast charging infrastructure for rapid vehicle turnover (2-hour scenario)
- Identify capacity gaps before they impact operations
- Plan infrastructure upgrades with clear surplus/deficit visibility
- Compare charger port availability against fleet size

**Calculation Example:**
- Site has 18 vehicles with Peak Concurrent kWh = 450 kWh
- 8-hour scenario: Requires 450/8 = 56.25 kW of slow charger capacity
- 2-hour scenario: Requires 450/2 = 225 kW of fast charger capacity
- If site has 6 × 6.7kW chargers installed = 40.2 kW (71% of 8-hour requirement)
- Shows deficit of 16.05 kW needed for full 8-hour coverage

## Recent Features (January 2026)

### Chargers Management
- **Enhanced Chargers Page**: Redesigned interface matching application-wide styling
  - View all chargers across all sites by default
  - Filter by site using searchable dropdown
  - URL updates automatically when site is filtered for bookmarking and sharing
  - Site name column shown when viewing all chargers
  - Improved form styling with consistent button and input designs

### Map & Geolocation
- **User Location Feature**: Click the 𖦏 button on the map to center on your current location
  - Optimized for mobile browsers including Safari iOS
  - Graceful error handling with specific messages for permission issues
  - **Requires HTTPS**: Modern browsers require secure connections for geolocation API
  - Configurable accuracy and timeout settings for better mobile performance

### Service Management
- **Notes Field**: Added notes text field to Services/Meters to differentiate multiple services at a site
- Services now properly separated from Site model with dedicated utility, meter, and electrical capacity fields

### Project Management Enhancements
- **Project-Site Reassignment**: Reassign projects between sites while preserving complete status history
  - Accessible via "Reassign to Different Site" button in Site Details → Projects section
  - Searchable site selector with live filtering
  - All status records copied to new site automatically
- **Inline Status Editing**: Edit and delete status updates directly in the status history
  - Yellow background indicates edit mode
  - Duplicate status date validation with user-friendly error messages
- **Status History Display**: Full chronological list of all status updates per project/site
- **Inline Project Editing**: Edit button on each project card; edit mode includes steps editor

### Map & Performance Optimizations
- **Ultra-Fast Map Loading**: Separated map data endpoint (`/api/sites/map-data`) returns only coordinates
  - Loads all sites instantly without calculating capacity metrics
  - Popup details loaded on-demand when clicking markers
  - Results cached per site for fast subsequent access
- **Marker Color Modes**:
  - **Neutral** (default): All sites shown in Caltrans Orange (#F16A22)
  - **Status**: Color-coded by project progress (when project selected)
- **Focus Feature**: "View on Map" from site details always works, even if site not in current paginated results
- **Independent Data Loading**: Map shows ALL sites; table remains paginated for performance

### User Experience
- Error messages displayed in dismissible banners for constraint violations
- Confirmation dialogs for destructive actions
- Loading states for asynchronous operations
- Responsive layouts with proper mobile support

## Frontend Development

Created frontend ev-infra-app\frontend
Inside that directory, you can run several commands:

  npm start
    Starts the development server.

  npm run build
    Bundles the app into static files for production.

  npm test
    Starts the test runner.

  npm run eject
    Removes this tool and copies build dependencies, configuration files
    and scripts into the app directory. If you do this, you can’t go back!

We suggest that you begin by typing:

  cd frontend
  npm start


cd backend

export FLASK_APP=run.py
flask run

or flask --app run.py run

## File Storage (Local vs MinIO)

Uploads are stored via a storage adapter selectable by environment:

- `local` (default): files saved under the backend `UPLOAD_FOLDER` and downloaded via the API.
- `s3` (MinIO-compatible): files stored in an S3 bucket (e.g., MinIO); downloads use presigned URLs.

### Switch Providers

Windows PowerShell example (MinIO):

```powershell
# Backend env
cd backend
$env:STORAGE_PROVIDER = "s3"
$env:S3_ENDPOINT_URL = "http://localhost:9000"        # MinIO endpoint
$env:S3_BUCKET = "evinfra-uploads"                    # Ensure this bucket exists
$env:S3_ACCESS_KEY = "<minio-access-key>"
$env:S3_SECRET_KEY = "<minio-secret-key>"
$env:S3_REGION_NAME = "us-east-1"
$env:S3_USE_SSL = "false"                              # set "true" if using HTTPS
$env:SIGNED_URL_TTL = "3600"                           # seconds

# Install dependency
pip install boto3

# Run backend
python run.py
```

To use local filesystem storage:

```powershell
cd backend
$env:STORAGE_PROVIDER = "local"
$env:UPLOAD_FOLDER = (Resolve-Path "./uploads").Path  # optional custom path
python run.py
```

### Config Reference

- `STORAGE_PROVIDER`: `local` | `s3`
- Local:
  - `UPLOAD_FOLDER`: directory for saved files
- S3/MinIO:
  - `S3_ENDPOINT_URL`, `S3_REGION_NAME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_USE_SSL`
  - `SIGNED_URL_TTL`: presigned URL lifetime in seconds

### Production Notes

- MinIO: create the bucket (e.g., `evinfra-uploads`) and a service account with write permissions.
- No cloud required: MinIO runs on-prem; the adapter uses S3 API.
- Permissions: with `local` storage, ensure the backend process identity has write access to `UPLOAD_FOLDER`.
- Backups: with S3/MinIO, use bucket versioning/lifecycle; with local, include `UPLOAD_FOLDER` in backups.

### Frontend Download Links

The UI constructs download URLs against the API base (e.g., `http://localhost:5000/api/files/:id/download`). Avoid clicking raw relative `/api/...` links in the dev server (port 3000), as the SPA router will intercept.

### Migrating Existing Local Uploads to MinIO

1. Set `STORAGE_PROVIDER=s3` and MinIO env vars.
2. Create the bucket in MinIO.
3. Upload existing files from `backend/uploads` to the bucket keeping their filenames (keys).
4. Ensure DB `files.stored_name` values match the object keys (default behavior already uses the stored filename).
5. Restart backend.

If you want, we can add a simple script to push `backend/uploads` into MinIO automatically and verify records.

## Utility Bills Feature
## Projects, Steps, and Status

Projects manage many Sites. Each project can define ordered steps; sites report per-site status against those steps.

- Tables:
  - `projects`: name, description, timestamps
  - `project_steps`: `project_id`, `step_order` (unique per project), `title`, `description`, timestamps
  - `project_status`: per-site updates with `project_id`, `site_id`, `status_date`, `status_message`, `current_step`, optional `estimated_cost` and `actual_cost`
  - Association `project_sites`: many-to-many link between projects and sites

- Derived step count: `projects` does not store `total_steps`; clients use `steps_count` from project JSON.

### API Endpoints

#### Sites
- `GET /api/sites` — list all sites with vehicle counts, charger totals, and department codes
- `GET /api/sites/:id` — get single site details
- `GET /api/sites/:id/metrics` — get calculated capacity metrics and vehicle count for a site
- `GET /api/sites/:id/projects` — get projects associated with site (includes progress and latest status)
- `GET /api/sites/map-data?project_id=&include_capacity=` — lightweight endpoint for map markers
  - Returns only id, name, latitude, longitude by default
  - Add `include_capacity=1` for basic capacity calculation (no bills/vehicles)
- `GET /api/sites/metrics/aggregate` — paginated site metrics with capacity calculations
- `POST /api/sites` — create site
- `PUT /api/sites/:id` — update site
- `DELETE /api/sites/:id` — soft delete site

#### Departments
Departments are managed via a dedicated `departments` table with `district`, `unit`, `unit_name`, and an optional `site_id` foreign key. Each site can have multiple departments assigned to it. The old `site.department_id` text column is deprecated.

- `GET /api/departments/?q=&site_id=&unassigned=1&district=&page=1&per_page=50` — paginated list with search
- `POST /api/departments/` — create department `{ district, unit, unit_name, site_id? }`
- `PUT /api/departments/:id` — update `{ district?, unit?, unit_name? }`
- `PATCH /api/departments/:id/site` — assign/unassign site `{ site_id: <int|null> }`
- `DELETE /api/departments/:id` — permanently delete
- `GET /api/departments/site-mapping/preview?min_confidence=0` — preview auto-mapping from CSV
- `POST /api/departments/site-mapping/import?min_confidence=0` — apply auto-mapping

The `GET /api/sites` response includes a `departments` array on each site with `{ code, unit_name }` entries derived from the departments table.

#### Projects
- `GET /api/projects` — list projects
- `POST /api/projects` — create project `{ name, description }`
- `GET /api/projects/:id` — get project (includes `site_ids` and `steps_count`)
- `PUT /api/projects/:id` — update `{ name?, description? }`
- `DELETE /api/projects/:id`

#### Project Sites (with pagination and search)
- `GET /api/projects/:id/sites?q=&page=1&page_size=25`
  - Returns `{ items: [Site], page, page_size, total }`
- `POST /api/projects/:id/sites` — add site `{ site_id }`
- `DELETE /api/projects/:id/sites/:site_id` — remove site from project
- `POST /api/projects/:id/sites/:old_site_id/reassign/:new_site_id` — **NEW**: reassign project to different site
  - Copies all status records from old site to new site
  - Removes old site association
  - Returns `{ status, statuses_copied, statuses_skipped, message }`

#### Project Steps
- `GET /api/projects/:id/steps` — list ordered steps
- `POST /api/projects/:id/steps` — create step `{ title, description?, step_order? }`
  - `step_order` default = next integer after current max
- `PUT /api/projects/:id/steps/:step_id` — update fields
- `DELETE /api/projects/:id/steps/:step_id`

#### Project Status
- `GET /api/projects/:id/sites/:site_id/status` — list per-site status entries (newest first)
- `POST /api/projects/:id/sites/:site_id/status` — create status `{ current_step, status_message?, status_date?, estimated_cost?, actual_cost? }`
- `PUT /api/projects/:id/sites/:site_id/status/:status_id` — **NEW**: update existing status
- `DELETE /api/projects/:id/sites/:site_id/status/:status_id` — **NEW**: delete status entry
- `GET /api/projects/:id/status/latest` — latest status per site in project (including sites without status)

#### Services (Utility Meters)
- `GET /api/sites/:site_id/services` — list services for site
- `POST /api/sites/:site_id/services` — create service with utility info and electrical specs
- `PUT /api/services/:id` — update service (includes `notes` field)
- `DELETE /api/services/:id` — soft delete service

### Frontend Features

#### Home Page (`/`)
- **Map View**:
  - Displays ALL sites instantly (not limited by table pagination)
  - Marker colors: Neutral (Caltrans Orange) or Status-based (when project selected)
  - Click markers to load site details on-demand
  - Focus feature: "View on Map" from site details always works
  - Can add new sites by clicking map (when enabled)
- **Table View**:
  - Paginated site metrics (10/25/50/100 per page or All)
  - Sortable columns: capacity, peak kW, vehicle count, etc.
  - Search by site name
  - Filter by project
  - Shows missing data indicators
- **Project Selector**: Filter sites by project and view status badges

#### Projects Manager (`/projects`)
- Create/edit projects with inline editing (click Edit button)
- **Steps Editor**: Integrated in project edit form
  - Add/edit/delete steps
  - Reorder with up/down buttons
- **Sites Assignment**: 
  - Search and paginate available sites
  - Add/remove sites from project
- **Status History**: 
  - Sorted chronological display
  - Inline edit/delete for each status entry
  - Date validation prevents duplicates
  - Error messages displayed in dismissible banners

#### Site Details (`/site/:id`)
- **Projects Section**: 
  - Shows all associated projects with progress bars
  - Latest status message and date
  - "View Details" button links to project manager
  - "Reassign to Different Site" button with searchable site selector
  - "Remove from Site" button
- **Services/Meters**: Add/edit utility services with notes field
- **Utility Bills**: Monthly peak demand tracking per service
- **Equipment**: Vehicle and charger assignment
- **Files**: Document management with upload/download

#### Project Status UI
- Page: `/projects/:projectId` (also `/project/:projectId`)
- Deep-link to specific site: `/project/:projectId/site/:siteId`
- Features:
  - Choose step via buttons
  - Add status with message, date, and cost estimates
  - View latest status per site in responsive grid
  - Click site box to view full status history
  - Inline edit/delete status entries

### Migrations

Run migrations after pulling:
```powershell
cd backend
alembic upgrade head
```

Recent migrations include:
- Add `project_steps` table
- Drop `projects.total_steps` (derived from steps)
- Drop `project_steps.due_date` (use per-site status dates instead)
- Make `equipment_usage` monthly and add `driving_hours`; rename `equipment.downtime_hours` to `driving_hours` (2026-01-08)

### Notes

- Step completion logic compares `current_step` to the project’s steps count.
- Reordering steps updates `step_order`; ensure uniqueness per project is maintained.
- SQLite compatibility is handled via Alembic batch operations in migrations.

New model `UtilityBill` added with fields:
- site_id (FK to Site)
- year, month (unique per site/month)
- max_power (kW)
- timestamps and soft delete flag

### Run Migration
In PowerShell:

cd backend
alembic upgrade head
```

If Alembic isn't initialized in your environment, ensure the `ALEMBIC` config points to the same database URI as in `app/config.py`.
### API Endpoints
List bills for a site:
GET /api/sites/<site_id>/bills

Create bill:
POST /api/sites/<site_id>/bills {"year":2025,"month":11,"energy_usage":1234.5,"max_power":250.0}

GET /api/sites/bills/<bill_id>

Update bill:
PUT /api/sites/bills/<bill_id>

Soft delete bill:
DELETE /api/sites/bills/<bill_id>

**Import PG&E Bills:**
```bash
curl -X POST http://localhost:5000/api/sites/bills/import/pge \
  -F "file=@Historical_20250501-20250531.csv"
```

This endpoint:
- Extracts month/year from filename (e.g., `Historical_20250501-20250531.csv` → May 2025)
- Matches "Account ID" column to `Service.utility_account`
- Sums all "Usage Value" entries for total kWh
- Finds max "Usage Value" and divides by "Interval Length" (minutes → hours) for peak kW
- Creates or updates bills for each matched service

Example response:
```json
{
  "success": true,
  "year": 2025,
  "month": 5,
  "created": 3,
  "updated": 1,
  "total_accounts": 4,
  "errors": ["No service found for account 1234567890"]
}
```

### Capacity & Metrics

Added site fields:
- main_breaker_amps (Amps)
- phase_count (1 or 3)
- power_factor (default 0.95, configurable)

Metrics endpoint:
GET /api/sites/<site_id>/metrics
{
  "site_id": 12,
  "last_year_peak_kw": 180.4,
  "theoretical_capacity_kw": 250.123,
  "available_capacity_kw": 69.723,
  "power_factor": 0.92,
  "phase_count": 3,
  "voltage": 480,
  "main_breaker_amps": 300
}
 http://localhost:5000/api/fleet/match-preview?min_confidence=0.7

 Note: If you click a relative `/api/...` link while running the React dev server on port 3000, the browser will navigate to `http://localhost:3000/api/...` and the SPA will serve the frontend shell (nav/blank page). Use the explicit backend URL above (port 5000) or run the request via curl/Postman.

Formulas:
- Single-phase capacity (kW) ≈ Amps * Volts * PF / 1000
- Three-phase capacity (kW) ≈ Amps * Volts * √3 * PF / 1000

PF (power factor) taken from site.power_factor (default 0.95 if null). Available capacity = theoretical_capacity_kw − last_year_peak_kw (floored at 0).

### Aggregate Metrics

Endpoint: `GET /api/sites/metrics/aggregate?order=desc&page=1&per_page=50` or with offset/limit: `GET /api/sites/metrics/aggregate?offset=0&limit=50`

Returns ranked array of site metric objects sorted by `available_capacity_kw` (descending by default). Query params:
- `order`: `asc` or `desc`
- `page`: 1-based page number (ignored if `offset` provided)
- `per_page`: items per page (default 50)
- `offset`: zero-based explicit offset (takes precedence over page/per_page)
- `limit`: max items to return when used with offset (else page logic applies)

Example response:
```
[
  {
    "site_id": 3,
    "name": "Main Depot",
    "last_year_peak_kw": 120.4,
    "theoretical_capacity_kw": 300.15,
    "available_capacity_kw": 179.75,
    "voltage": 480,
    "phase_count": 3,
    "main_breaker_amps": 400,
    "power_factor": 0.94
  }
]

### Frontend Pagination

### Vehicle Utilization Import (Monthly)

- Backend endpoint: `POST /api/fleet/usage/import`
- Accepts `multipart/form-data` with field `file` and infers year/month from filename pattern like `GPS-Vehicle-Utilization-YYYY-MM.csv`.
- Upserts monthly `equipment_usage` rows by `equipment_id`, including `miles` and `driving_hours`.

Windows (PowerShell) example:
```powershell
# From project root
cd frontend
# Use the API helper in the UI or call directly via curl

# Using curl with a local CSV
curl -F file=@../GPS-Vehicle-Utilization-2022-12.csv http://localhost:5000/api/fleet/usage/import
```

Frontend changes:
- `Downtime Hrs` field renamed to `Driving Hrs (annual)`
- Vehicle Usage now supports Year+Month, with optional Driving Hours per month.


On the Home page a table lists site capacity and demand metrics with controls:
- Prev / Next page buttons
- Rows per page selector (10/25/50)
- Order toggle (ascending/descending by available capacity)

The Home view requests aggregate metrics with query params (`page`, `per_page`, `order`) and displays `meta.total` to indicate total site count.

### Styling & Housekeeping

A backend `.gitignore` was added to exclude common Python artifacts (virtual environments, `__pycache__`, coverage, logs, local DB files).

Global styling classes were introduced in `frontend/src/App.css`:
- Layout: `.container`, `.card`, `.page-header`
- Tables: `.table`, `.table-sortable`
- Buttons: `.btn`, `.btn-secondary`, `.btn-danger`
- Forms: `.form-grid`, `.form-group`, `.input`
- Utility: `.flex-row`, `.gap-sm`, `.details-section`

Pages updated:
- `Home.js` now uses cards, improved table styling, search & sort UI.
- `SiteDetails.js` has a responsive grid form and styled metrics & bills table.

To customize further, extend `App.css` or add a new file (e.g. `theme.css`) and import it in `App.js`.
```

### Performance Notes

Indexes added:
- `ix_utility_bills_year_month` for filtering recent year/month demand
- `ix_utility_bills_max_power` for peak demand scans

Run migrations after pulling changes:
```powershell
cd backend
alembic upgrade head
```

### Frontend
`SiteDetails` now displays bills and allows creation/edit/delete. Ensure backend running on port 5000.

### Map Zoom & Location Fields

The Home page table includes a 🔍 button in the Map column. Clicking it pans and zooms the map to the selected site.

New Site fields for California locations:
 - `address` (street address)
 - `city`

State is omitted (all sites are in CA). These fields are returned in site JSON and editable in the Site Details form.

Migration required for new columns:
```powershell
cd backend
alembic upgrade head
```

Example site JSON fragment:
```json
{
  "id": 12,
  "name": "West Valley Depot",
  "address": "123 Industrial Way",
  "city": "Fresno",
  "latitude": 36.7378,
  "longitude": -119.7871
}
```

## Equipment & Usage Feature

Adds three new tables:

- `equipment_catalog` (MC master list)
  - `mc_code` (PK), `description`, `status`, `revised_date`, `energy_per_mile` (kWh per mile, nullable until set)
- `equipment`
  - `id`, `site_id` (FK), `equipment_identifier`, `mc_code` (FK to catalog), `department_id` (owning dept string), `annual_miles`, `driving_hours`, timestamps
- `equipment_usage`
  - `id`, `equipment_id` (FK), `year`, `miles`, timestamps (unique per equipment/year)

### Migration
Run after pulling:
```powershell
cd backend
alembic upgrade head
```

### Populate Catalog
Refresh from `ActiveCatalog.csv` (upserts description/status/revised_date, preserves existing `energy_per_mile` values):
```powershell
Invoke-RestMethod -Method Post http://localhost:5000/api/catalog/refresh
```
Or via curl:
```powershell
curl -X POST http://localhost:5000/api/catalog/refresh
```

### Set Energy per Mile
Update an MC entry's energy factor:
```powershell
curl -X PUT http://localhost:5000/api/catalog/00490 -H "Content-Type: application/json" -d '{"energy_per_mile":1.2}'
```

### Equipment Endpoints
List site equipment (default last year):
`GET /api/sites/<site_id>/equipment?year=2024`

Create equipment:
`POST /api/sites/<site_id>/equipment {"mc_code":"00490","equipment_identifier":"Unit-42","department_id":5}`

Upsert usage (miles for a year):
`POST /api/sites/equipment/<equipment_id>/usage {"year":2024,"miles":15432.7}`

Site energy aggregation:
`GET /api/sites/<site_id>/equipment/energy?year=2024`
Returns totals and per-equipment energy: `miles * energy_per_mile`.

### Frontend
`SiteDetails` now includes an Equipment section:
- Add equipment by MC code.
- Enter prior-year miles and save.
- Displays per-equipment and total site energy (kWh) for last year.

### Workflow to Use Feature
1. Run migration (includes annual miles & downtime fields as of latest revision).
2. Refresh catalog.
3. Set `energy_per_mile` for relevant MC codes.
4. Add equipment to each site.
5. Enter last year's miles per equipment.
6. View aggregated kWh in Site Details Equipment section.

### Assumptions
- `energy_per_mile` is kWh consumed per mile for that MC category.
- Last year = `current_year - 1` unless `year` query param supplied.
- Miles without an energy factor yield `null` energy until factor is set.
- If `annual_miles` set on equipment it overrides usage entries for energy calculations.
- `downtime_hours` reduces operating hours from 8760 when computing average kW = annual_energy_kWh / (8760 - downtime_hours).

### Future Enhancements (Optional)
- Bulk import equipment usage.
- Support partial-year mileage (store monthly usage table).
- Historical energy trends endpoint.
- Permission model for department-specific edits.

## Catalog Manager UI

A new page at `/catalog` allows:
- Uploading a CSV file to refresh catalog (`/api/catalog/upload`).
- Refreshing from server-side `ActiveCatalog.csv` (`/api/catalog/refresh`).
- Inline editing of description, status, and `energy_per_mile`.
- Sorting and filtering by MC or description.
- Delete unused catalog entries (only if no equipment references MC).

### Upload Endpoint
`POST /api/catalog/upload` (multipart/form-data, field name: `file`)
Response: `{ "message": "Catalog uploaded", "added": <int>, "updated": <int> }`

Client sample (PowerShell):
```powershell
Invoke-WebRequest -Method Post -InFile .\ActiveCatalog.csv -ContentType 'multipart/form-data' -Uri http://localhost:5000/api/catalog/upload -Form @{ file = Get-Item .\ActiveCatalog.csv }
```

Simpler with curl:
```powershell
curl -F file=@ActiveCatalog.csv http://localhost:5000/api/catalog/upload
```

### Editing Energy Factors
Inline edits call `PUT /api/catalog/<mc_code>` with JSON, e.g.:
```powershell
curl -X PUT http://localhost:5000/api/catalog/00490 -H "Content-Type: application/json" -d '{"energy_per_mile":1.25, "status":"Available"}'
```

### Notes
- Upload does not clear existing `energy_per_mile` values; they persist unless overwritten via PUT.
- CSV expected headers: `MC,Equipment Description,Status,Revised`.
- Invalid or empty MC rows are skipped silently.
- Delete endpoint: `DELETE /api/catalog/<mc_code>` returns error if equipment exists for MC.

## Site Importer (GeoJSON)

A new page at `/sites/import` lets you upload a GeoJSON exported from QGIS (or similar). The importer:

- Expects a `FeatureCollection` of `Point` features.
- Reads longitude/latitude from `geometry.coordinates`.
- Attempts to map common properties to Site fields: `name`, `address`, `city`, `utility`, `meter`, `contact`, `phone`.
- Upserts by exact site `name` when present; otherwise inserts as a new site.

### API
`POST /api/sites/upload-geojson` (multipart/form-data, field name: `file`)
Response:
```
{ "message": "GeoJSON processed", "added": <int>, "updated": <int>, "skipped": <int>, "errors": [ ... ] }
```

PowerShell example:
```powershell
curl -F file=@"PGE EV Fleet Program.geojson" http://localhost:5000/api/sites/upload-geojson
```

### Frontend
- Navigate to `Imports` in the header, choose your `.geojson` file, and upload.
 - After success, click "View on Map" to return to Home and see new markers.

### Notes
- Only Point features are imported; non-Point features are skipped.
- If a feature lacks a `name` property, it is imported with a generated name like "Imported Site 3".
- Property key matching is case-insensitive and best-effort.

## DGS Properties Import (Add-Only)

Imports state property locations from a server-side GeoJSON file and only inserts new Sites. Existing sites are detected by exact name (case-insensitive) or proximity within ~250 meters.

### Endpoint
`POST /api/sites/import-dgs-properties`

Behavior:
- Reads `DGS_DOT_Property.geojson` from the project root. If not found, falls back to `DGS_TOT_Property.gojson`.
- Skips features that match an existing site by name or within 0.25 km.
- Inserts unmatched features as new Sites, mapping common properties when present: `name`, `address`, `city`, `utility`, `meter_number`, `contact_name`, `contact_phone`.

Response example:
```
{ "message": "DGS properties processed (add-only)", "added": 12, "skipped": 57, "new_sites": [ {"temp_name":"DGS Property 4","lat":36.77,"lon":-119.82} ] }
```

PowerShell:
```powershell
curl -X POST http://localhost:5000/api/sites/import-dgs-properties
```

Frontend:
- Go to `Imports` → click "Import DGS Properties". Shows counts and a small sample of added sites.

## Fleet Vehicles Import & Matching

Imports vehicles from `FleetList.csv` into the `equipment` table, assigning each vehicle to a `Site` via a matcher. A preview endpoint shows the proposed site matches with confidence scores before importing.

### Endpoints
- Preview matches: `GET /api/fleet/match-preview?min_confidence=0.7`
- Import fleet: `POST /api/fleet/import?min_confidence=0.7`

Matching rules (in priority order):
- Department ID: if Dept ID matches a department code assigned to a site (via the departments table), that site is used with highest confidence.
- Coordinates: nearest site by `CT_DEPT_LATITUDE`/`CT_DEPT_LONGITUDE` with distance-weighted confidence.
- Department name: case-insensitive substring match of `DEPT ID NAME` against `Site.name`.
- District: match `District` to `Site.city` or substring of `Site.name`.

Confidence filter:
- Both preview and import accept `min_confidence` (0–1). Rows with a match confidence below the threshold are excluded from preview and skipped during import.

Import behavior:
- Requires valid `MC` codes present in `equipment_catalog`; rows with unknown MC are skipped and reported.
- Upsert by `(site_id, equipment_identifier)`; updates `mc_code` and department for existing records.

CSV columns used (best-effort): `Eq ID`, `MC`, `Dept ID`/`DEPT ID`, `DEPT ID NAME`, `District`, `CT_DEPT_LATITUDE`, `CT_DEPT_LONGITUDE`.

PowerShell examples:
```powershell
curl "http://localhost:5000/api/fleet/match-preview?min_confidence=0.7" | more
curl -X POST "http://localhost:5000/api/fleet/import?min_confidence=0.7"
```

Frontend:
- Go to `Imports` → Fleet Vehicles card.
- Click "Preview Matches" to review the first 25 suggested matches and confidence.
- Click "Import Fleet" to create/update equipment records.

## Telematics Site Verification & Reassignment

Use telematics stops to infer each vehicle’s likely home site, compare against `equipment.site_id`, preview mismatches, and optionally reassign high-confidence vehicles. Responses include assigned and inferred site names and addresses.

### Mismatches (Materialized View)
- Queries `public.fleet_telematics_site_inference` created by migrations.
- Add `refresh=1` to rebuild the MV before querying.

```powershell
# Refresh then list top mismatches with confidence >= 0.6
curl "http://localhost:5000/api/fleet/telematics/mismatches?refresh=1&min_confidence=0.6&limit=100"
```

Fields (subset): `equipment_id`, `vehicle_id`, `assigned_site_id/name/address`, `inferred_site_id/name/address`, `near_stops`, `confidence`.

### Mismatches (Live, tunable)
- Computes inference on the fly with tunable window and distance.

```powershell
# 180-day window, snap within 5 km, confidence >= 0.5
curl "http://localhost:5000/api/fleet/telematics/mismatches/live?lookback_days=180&max_km=5&min_confidence=0.5&limit=200"
```

Query params:
- `lookback_days` (default 180)
- `max_km` (default 5.0)
- `min_confidence` (default 0.5)
- `limit` (default 500)

### Reassign Vehicles (Preview and Apply)
- Preview candidates (dry run) or apply updates to move `equipment.site_id` to the inferred site for high-confidence rows.

```powershell
# Preview only (no writes):
curl -X POST "http://localhost:5000/api/fleet/telematics/reassign?min_confidence=0.85&max_changes=100&dry_run=1"

# Apply changes: refresh MV, reassign with confidence >= 0.9, attribute to actor
curl -X POST "http://localhost:5000/api/fleet/telematics/reassign?min_confidence=0.9&max_changes=200&dry_run=0&refresh=1&actor=admin_user"
```

Params:
- `min_confidence`: minimum confidence to consider (default 0.8)
- `max_changes`: cap number of updates (default 200)
- `dry_run`: when true (default), no changes are written
- `refresh`: when true, `REFRESH MATERIALIZED VIEW` runs before selecting candidates
- `actor`: optional string for audit trail

Writes audit rows to `equipment_site_reassign_audit` with `equipment_id`, `vehicle_id`, `old_site_id`, `new_site_id`, `confidence`, `actor`, `performed_at`.

### Review Audit History

```powershell
# Recent 50 changes
curl "http://localhost:5000/api/fleet/telematics/reassign/audit?limit=50"

# Filter by date range (ISO) and actor
curl "http://localhost:5000/api/fleet/telematics/reassign/audit?start=2026-01-01T00:00:00Z&end=2026-01-31T23:59:59Z&actor=admin_user&limit=100"

# Filter for a specific equipment
curl "http://localhost:5000/api/fleet/telematics/reassign/audit?equipment_id=12345&limit=50"
```

### Notes
- Telematics join assumes `fleet_daily_metrics.vehicle_id` (numeric) equals `equipment.equipment_id`. If a mapping is needed, adjust the backend join.
- Site coordinates (`sites.latitude/longitude`) must be present for inference.
- Live thresholds (`lookback_days`, `max_km`, `min_confidence`) are tunable to match GPS accuracy and site spacing.
