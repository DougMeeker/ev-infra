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

## Utility Bills Feature

New model `UtilityBill` added with fields:
- site_id (FK to Site)
- year, month (unique per site/month)
- energy_usage (kWh)
- max_power (kW)
- timestamps and soft delete flag

### Run Migration
In PowerShell:

```powershell
cd backend
alembic upgrade head
```

If Alembic isn't initialized in your environment, ensure the `ALEMBIC` config points to the same database URI as in `app/config.py`.

### API Endpoints
List bills for a site:
GET /api/sites/<site_id>/bills

Create bill:
POST /api/sites/<site_id>/bills {"year":2025,"month":11,"energy_usage":1234.5,"max_power":250.0}

Get single bill:
GET /api/sites/bills/<bill_id>

Update bill:
PUT /api/sites/bills/<bill_id>

Soft delete bill:
DELETE /api/sites/bills/<bill_id>

### Capacity & Metrics

Added site fields:
- main_breaker_amps (Amps)
- voltage (Line voltage, e.g. 240, 480)
- phase_count (1 or 3)
- power_factor (default 0.95, configurable)

Metrics endpoint:
GET /api/sites/<site_id>/metrics

Returns JSON:
```
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
```

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
- Utility: `.flex-row`, `.gap-sm`, `.metrics-block`

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
  - `id`, `site_id` (FK), `equipment_identifier`, `mc_code` (FK to catalog), `department_id`, `annual_miles`, `downtime_hours`, timestamps
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
