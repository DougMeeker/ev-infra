from flask import Blueprint, jsonify, request
from ..extensions import db
from ..models import Site, Equipment, EquipmentCatalog
from ..services.utilization_service import import_utilization
import csv
import os
import math
import sqlalchemy as sa

fleet_bp = Blueprint("fleet", __name__)

FLEET_CSV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "FleetList.csv"))


def haversine(lat1, lon1, lat2, lon2):
    # Earth radius in km
    R = 6371.0
    dlat = math.radians((lat2 or 0) - (lat1 or 0))
    dlon = math.radians((lon2 or 0) - (lon1 or 0))
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1 or 0)) * math.cos(math.radians(lat2 or 0)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _site_has_department(site: Site, dept_id: str) -> bool:
    s = (site.department_id or '').strip()
    if not s or not dept_id:
        return False
    tokens = [t.strip() for t in s.split(',') if t.strip()]
    return dept_id.strip() in tokens


def find_best_site(dept_name: str, district: str, lat: float, lon: float, dept_id: str = None):
    sites = Site.query.filter_by(is_deleted=False).all()
    best = None
    confidence = 0.0

    # Rule 0: direct department_id match (supports comma-separated lists)
    if dept_id:
        for s in sites:
            if _site_has_department(s, dept_id):
                best = s
                confidence = 0.99
                break

    # Rule 1: use coordinates if present — nearest site within 10 km
    if lat is not None and lon is not None:
        nearest = None
        nearest_dist = None
        for s in sites:
            if s.latitude is None or s.longitude is None:
                continue
            d = haversine(lat, lon, s.latitude, s.longitude)
            if nearest_dist is None or d < nearest_dist:
                nearest = s
                nearest_dist = d
        if nearest is not None:
            best = nearest
            # Confidence based on proximity
            if nearest_dist is not None:
                if nearest_dist <= 2:
                    confidence = 0.95
                elif nearest_dist <= 5:
                    confidence = 0.8
                elif nearest_dist <= 10:
                    confidence = 0.6
                else:
                    confidence = 0.3

    # Rule 2: match by department/site name (case-insensitive contains)
    if best is None and dept_name:
        dn = dept_name.strip().lower()
        for s in sites:
            if not s.name:
                continue
            if dn in s.name.strip().lower():
                best = s
                confidence = max(confidence, 0.7)
                break

    # Rule 3: match district to city or name
    if best is None and district:
        dd = district.strip().lower()
        for s in sites:
            name = (s.name or "").strip().lower()
            city = (s.city or "").strip().lower()
            if dd and (dd == city or dd in name):
                best = s
                confidence = max(confidence, 0.6)
                break

    return best, confidence


def normalize_float(val):
    if val is None:
        return None
    try:
        s = str(val).strip().replace("'", "")
        if s == "":
            return None
        return float(s)
    except Exception:
        return None


# Normalization helpers to make CSV header handling more forgiving
def norm_header(h):
    if h is None:
        return None
    h = str(h).lstrip('\ufeff').strip()
    # Preserve case for simple alternates but lowercase for match groups
    return h


def norm_row_keys(row):
    return {norm_header(k): v for k, v in row.items()}


def getv(nrow, *keys):
    for k in keys:
        v = nrow.get(k)
        if v not in (None, ''):
            return v
    return None


def normalize_mc_code(mc: str):
    if mc is None:
        return None
    mc = str(mc).strip()
    if mc == "":
        return None
    # Strip leading zeros for matching
    stripped = mc.lstrip('0')
    return stripped if stripped != "" else "0"


def catalog_has_mc(mc: str):
    if not mc:
        return False
    # Try exact first, then leading-zero stripped variant
    entry = EquipmentCatalog.query.get(mc)
    if entry:
        return True
    alt = normalize_mc_code(mc)
    if alt and alt != mc:
        entry = EquipmentCatalog.query.get(alt)
        return bool(entry)
    return False


@fleet_bp.route("/match-preview", methods=["GET"])
def match_preview():
    if not os.path.exists(FLEET_CSV_PATH):
        return {"error": f"FleetList.csv not found at {FLEET_CSV_PATH}"}, 404
    previews = []
    # Optional confidence threshold
    try:
        min_conf = float(request.args.get('min_confidence', 0) or 0)
    except Exception:
        min_conf = 0.0
    with open(FLEET_CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        raw_rows = [norm_row_keys(r) for r in reader]
        for row in raw_rows:
            raw_eq_id = (getv(row, 'Eq ID', 'EQ ID', 'eq id', 'equipment_id', 'equipment_identifier') or '').strip()
            try:
                eq_id = int(raw_eq_id) if raw_eq_id != '' else None
            except Exception:
                eq_id = None
            mc_code = (getv(row, 'MC', 'mc') or '').strip()
            dept_id = (getv(row, 'Dept ID', 'DEPT ID', 'dept id', 'department_id') or '').strip()
            dept_name = (getv(row, 'DEPT ID NAME', 'dept id name', 'department_name') or '').strip()
            district = (getv(row, 'District', 'district') or '').strip()
            lat = normalize_float(getv(row, 'CT_DEPT_LATITUDE', 'dept_latitude', 'latitude', 'lat'))
            lon = normalize_float(getv(row, 'CT_DEPT_LONGITUDE', 'dept_longitude', 'longitude', 'lon'))

            site, conf = find_best_site(dept_name, district, lat, lon, dept_id)
            if site and conf >= min_conf:
                catalog_exists = catalog_has_mc(mc_code)
                previews.append({
                    'equipment_id': eq_id,
                    'mc_code': mc_code,
                    'mc_known': catalog_exists,
                    'department_id': dept_id or None,
                    'department_name': dept_name or None,
                    'district': district or None,
                    'dept_lat': lat,
                    'dept_lon': lon,
                    'matched_site_id': site.id if site else None,
                    'matched_site_name': site.name if site else None,
                    'confidence': round(conf, 3)
                })
    return jsonify(previews), 200


@fleet_bp.route("/import", methods=["POST"])
def import_fleet():
    """Import FleetList.csv into Equipment table.
    Uses matching rules to assign site_id for each vehicle.
    If MC code not found in catalog, row is skipped and reported.
    Upserts by equipment_identifier within site: if same identifier exists, updates mc_code/department.
    """
    if not os.path.exists(FLEET_CSV_PATH):
        return {"error": f"FleetList.csv not found at {FLEET_CSV_PATH}"}, 404

    added = 0
    updated = 0
    skipped = 0
    errors = []

    # Optional confidence threshold
    try:
        min_conf = float(request.args.get('min_confidence', 0) or 0)
    except Exception:
        min_conf = 0.0

    with open(FLEET_CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        raw_rows = [norm_row_keys(r) for r in reader]
        for idx, row in enumerate(raw_rows):
            try:
                raw_eq_id = (getv(row, 'Eq ID', 'EQ ID', 'eq id', 'equipment_id', 'equipment_identifier') or '').strip()
                try:
                    eq_id = int(raw_eq_id) if raw_eq_id != '' else None
                except Exception:
                    eq_id = None
                mc_code = (getv(row, 'MC', 'mc') or '').strip()
                dept_id = (getv(row, 'Dept ID', 'DEPT ID', 'dept id', 'department_id') or '').strip()
                dept_name = (getv(row, 'DEPT ID NAME', 'dept id name', 'department_name') or '').strip()
                district = (getv(row, 'District', 'district') or '').strip()
                lat = normalize_float(getv(row, 'CT_DEPT_LATITUDE', 'dept_latitude', 'latitude', 'lat'))
                lon = normalize_float(getv(row, 'CT_DEPT_LONGITUDE', 'dept_longitude', 'longitude', 'lon'))

                if eq_id is None:
                    skipped += 1
                    continue
                if not mc_code:
                    errors.append({'row': idx, 'error': 'Missing MC code', 'equipment_id': eq_id})
                    skipped += 1
                    continue

                # Resolve catalog entry allowing for leading zeros
                catalog = EquipmentCatalog.query.get(mc_code)
                if not catalog:
                    alt = normalize_mc_code(mc_code)
                    if alt and alt != mc_code:
                        catalog = EquipmentCatalog.query.get(alt)
                if not catalog:
                    errors.append({'row': idx, 'error': f'MC code {mc_code} not in catalog', 'equipment_id': eq_id})
                    skipped += 1
                    continue

                site, conf = find_best_site(dept_name, district, lat, lon, dept_id)
                if site is None or conf < min_conf:
                    errors.append({'row': idx, 'error': 'No site match above confidence threshold', 'department_name': dept_name, 'district': district, 'equipment_id': eq_id, 'confidence': round(conf, 3)})
                    skipped += 1
                    continue

                # Upsert globally by equipment_id to prevent duplicates across sites
                existing = Equipment.query.filter_by(equipment_id=eq_id).order_by(Equipment.id).first()
                # Use the catalog's canonical mc_code
                canonical_mc = catalog.mc_code if catalog else mc_code
                if existing:
                    # Move/align to matched site and update metadata
                    existing.site_id = site.id
                    existing.mc_code = canonical_mc
                    # Merge department_id tokens uniquely
                    if dept_id:
                        current = (existing.department_id or '').strip()
                        tokens = [t.strip() for t in current.split(',') if t.strip()]
                        if dept_id not in tokens:
                            tokens.append(dept_id)
                        existing.department_id = ','.join(tokens) if tokens else None
                    updated += 1
                else:
                    # Create new equipment entry
                    eq = Equipment(
                        site_id=site.id,
                        mc_code=canonical_mc,
                        equipment_id=eq_id,
                        department_id=(dept_id or None)
                    )
                    db.session.add(eq)
                    added += 1
            except Exception as e:
                errors.append({'row': idx, 'error': str(e)})
                skipped += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to import fleet: {e}"}, 500

    return {
        'message': 'Fleet imported',
        'added': added,
        'updated': updated,
        'skipped': skipped,
        'errors': errors[:25]
    }, 200


@fleet_bp.route("/usage/import", methods=["POST"])
def usage_import():
    """Import GPS Vehicle Utilization CSV (month inferred from filename).
    Accepts multipart/form-data with field name 'file'.
    """
    if 'file' not in request.files:
        return {"error": "No file provided (field 'file')"}, 400
    file_storage = request.files['file']
    return import_utilization(file_storage)


@fleet_bp.route("/telematics/mismatches", methods=["GET"])
def telematics_mismatches():
    """Return equipment/site mismatches based on telematics-inferred home site.

    Query params:
      - min_confidence: float, default 0.5
      - limit: int, default 500
      - refresh: bool/int, if truthy, refresh the materialized view first
    """
    # Params
    try:
        min_conf = float(request.args.get('min_confidence', 0.5) or 0.5)
    except Exception:
        min_conf = 0.5
    try:
        limit = int(request.args.get('limit', 500) or 500)
        if limit <= 0:
            limit = 500
    except Exception:
        limit = 500
    do_refresh = request.args.get('refresh')
    should_refresh = False
    if isinstance(do_refresh, str):
        should_refresh = do_refresh.lower() in ("1", "true", "yes", "y")
    elif isinstance(do_refresh, (int, bool)):
        should_refresh = bool(do_refresh)

    # Optionally refresh the MV (non-concurrent for simplicity and broad compatibility)
    if should_refresh:
        try:
            db.session.execute(sa.text("REFRESH MATERIALIZED VIEW public.fleet_telematics_site_inference"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        sql = sa.text(
        """
        SELECT
          e.equipment_id,
          e.site_id AS assigned_site_id,
                    s1.name AS assigned_site_name,
                    s1.address AS assigned_site_address,
          i.vehicle_id,
          i.inferred_site_id,
                    s2.name AS inferred_site_name,
                    s2.address AS inferred_site_address,
          i.near_stops,
          i.confidence
        FROM public.fleet_telematics_site_inference i
        JOIN public.equipment e
          ON (i.vehicle_id ~ '^[0-9]+' AND e.equipment_id = i.vehicle_id::int)
        JOIN public.sites s1 ON s1.id = e.site_id
        LEFT JOIN public.sites s2 ON s2.id = i.inferred_site_id
        WHERE i.confidence >= :min_conf
          AND (e.site_id IS DISTINCT FROM i.inferred_site_id)
        ORDER BY i.confidence DESC
        LIMIT :lim
        """
    )
    rows = db.session.execute(sql, {"min_conf": min_conf, "lim": limit}).mappings().all()
    results = [dict(r) for r in rows]
    # Round confidence for presentation
    for r in results:
        try:
            r["confidence"] = round(float(r.get("confidence")), 3)
        except Exception:
            pass
    return jsonify(results), 200


@fleet_bp.route("/telematics/reassign", methods=["POST"])
def telematics_reassign():
    """Move high-confidence vehicles to the inferred site.

    Body or query params:
      - min_confidence: float, default 0.8
      - max_changes: int, default 200
      - dry_run: bool, default true (preview only)
      - refresh: bool, optional (if true, refresh MV before computing)

    Returns summary and (preview or applied) items.
    """
    # Parse params from query or JSON body
    payload = request.get_json(silent=True) or {}
    def pick(name, default=None):
        return payload.get(name, request.args.get(name, default))
    def to_float(v, d):
        try:
            return float(v)
        except Exception:
            return d
    def to_int(v, d):
        try:
            v = int(v)
            return v if v > 0 else d
        except Exception:
            return d
    def to_bool(v, d):
        if v is None:
            return d
        if isinstance(v, bool):
            return v
        s = str(v).lower()
        return s in ("1", "true", "yes", "y")

    min_conf = to_float(pick('min_confidence', 0.8), 0.8)
    max_changes = to_int(pick('max_changes', 200), 200)
    dry_run = to_bool(pick('dry_run', True), True)
    refresh = to_bool(pick('refresh', False), False)

    # Optionally refresh MV
    if refresh:
        try:
            db.session.execute(sa.text("REFRESH MATERIALIZED VIEW public.fleet_telematics_site_inference"))
            db.session.commit()
        except Exception:
            db.session.rollback()

    # Build candidates using MV
    candidates_sql = sa.text(
        """
        WITH candidates AS (
          SELECT
            e.id AS equipment_pk,
            e.equipment_id,
            e.site_id AS assigned_site_id,
            s1.name AS assigned_site_name,
            s1.address AS assigned_site_address,
            i.inferred_site_id,
            s2.name AS inferred_site_name,
            s2.address AS inferred_site_address,
            i.confidence
          FROM public.fleet_telematics_site_inference i
          JOIN public.equipment e
            ON (i.vehicle_id ~ '^[0-9]+' AND e.equipment_id = i.vehicle_id::int)
          JOIN public.sites s1 ON s1.id = e.site_id
          LEFT JOIN public.sites s2 ON s2.id = i.inferred_site_id
          WHERE i.confidence >= :min_conf
            AND i.inferred_site_id IS NOT NULL
            AND (e.site_id IS DISTINCT FROM i.inferred_site_id)
          ORDER BY i.confidence DESC
          LIMIT :lim
        )
        SELECT * FROM candidates
        """
    )
    c_rows = db.session.execute(candidates_sql, {"min_conf": min_conf, "lim": max_changes}).mappings().all()
    preview = [dict(r) for r in c_rows]
    for r in preview:
        try:
            r["confidence"] = round(float(r.get("confidence")), 3)
        except Exception:
            pass

    if dry_run or not preview:
        return jsonify({
            "dry_run": True,
            "min_confidence": min_conf,
            "max_changes": max_changes,
            "count": len(preview),
            "items": preview
        }), 200

    # Apply updates via CTE update
    update_sql = sa.text(
        """
        WITH candidates AS (
          SELECT
            e.id AS equipment_pk,
            e.equipment_id,
            e.site_id AS old_site_id,
            i.inferred_site_id,
            i.confidence,
            i.vehicle_id
          FROM public.fleet_telematics_site_inference i
          JOIN public.equipment e
            ON (i.vehicle_id ~ '^[0-9]+' AND e.equipment_id = i.vehicle_id::int)
          WHERE i.confidence >= :min_conf
            AND i.inferred_site_id IS NOT NULL
            AND (e.site_id IS DISTINCT FROM i.inferred_site_id)
          ORDER BY i.confidence DESC
          LIMIT :lim
        )
        UPDATE public.equipment e
        SET site_id = c.inferred_site_id
        FROM candidates c
        WHERE e.id = c.equipment_pk
        RETURNING e.id AS equipment_pk, e.equipment_id, c.vehicle_id, c.old_site_id, e.site_id AS new_site_id, c.confidence
        """
    )
    try:
        updated = db.session.execute(update_sql, {"min_conf": min_conf, "lim": max_changes}).mappings().all()
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to apply updates: {str(e)}"}), 500

    # Insert audit records
    actor = payload.get('actor') or request.args.get('actor') or 'system'
    insert_sql = sa.text(
        """
        INSERT INTO public.equipment_site_reassign_audit
          (equipment_id, vehicle_id, old_site_id, new_site_id, confidence, actor)
        VALUES
          (:equipment_id, :vehicle_id, :old_site_id, :new_site_id, :confidence, :actor)
        """
    )
    inserted = 0
    for row in updated:
        params = {
            "equipment_id": row.get("equipment_id"),
            "vehicle_id": row.get("vehicle_id"),
            "old_site_id": row.get("old_site_id"),
            "new_site_id": row.get("new_site_id"),
            "confidence": row.get("confidence"),
            "actor": actor,
        }
        try:
            db.session.execute(insert_sql, params)
            inserted += 1
        except Exception:
            pass
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    return jsonify({
        "dry_run": False,
        "min_confidence": min_conf,
        "max_changes": max_changes,
        "applied_count": len(updated),
        "audit_inserted": inserted,
        "preview_count": len(preview),
        "applied_items": [dict(r) for r in updated]
    }), 200


@fleet_bp.route("/telematics/reassign/audit", methods=["GET"])
def telematics_reassign_audit():
    """List audit history for equipment site reassignments.

    Query params:
      - start: ISO date/time (inclusive)
      - end: ISO date/time (inclusive)
      - actor: filter by actor
      - equipment_id: int
      - old_site_id: int
      - new_site_id: int
      - limit: int (default 200)
      - page: int (default 1)
    """
    def to_int(v, d):
        try:
            vv = int(v)
            return vv if vv >= 0 else d
        except Exception:
            return d
    limit = to_int(request.args.get("limit"), 200)
    page = to_int(request.args.get("page"), 1)
    if limit <= 0:
        limit = 200
    if page <= 0:
        page = 1
    offset = (page - 1) * limit

    start = request.args.get("start")
    end = request.args.get("end")
    actor = request.args.get("actor")
    equipment_id = request.args.get("equipment_id")
    old_site_id = request.args.get("old_site_id")
    new_site_id = request.args.get("new_site_id")

    where = ["1=1"]
    params = {"lim": limit, "off": offset}
    if start:
        where.append("a.performed_at >= :start")
        params["start"] = start
    if end:
        where.append("a.performed_at <= :end")
        params["end"] = end
    if actor:
        where.append("a.actor = :actor")
        params["actor"] = actor
    if equipment_id:
        where.append("a.equipment_id = :equipment_id")
        params["equipment_id"] = equipment_id
    if old_site_id:
        where.append("a.old_site_id = :old_site_id")
        params["old_site_id"] = old_site_id
    if new_site_id:
        where.append("a.new_site_id = :new_site_id")
        params["new_site_id"] = new_site_id

    sql = sa.text(
        f"""
        SELECT
          a.id,
          a.equipment_id,
          a.vehicle_id,
          a.old_site_id,
          s1.name AS old_site_name,
          a.new_site_id,
          s2.name AS new_site_name,
          a.confidence,
          a.actor,
          a.performed_at
        FROM public.equipment_site_reassign_audit a
        LEFT JOIN public.sites s1 ON s1.id = a.old_site_id
        LEFT JOIN public.sites s2 ON s2.id = a.new_site_id
        WHERE {' AND '.join(where)}
        ORDER BY a.performed_at DESC
        LIMIT :lim OFFSET :off
        """
    )
    rows = db.session.execute(sql, params).mappings().all()
    items = [dict(r) for r in rows]
    # Round confidence for presentation
    for it in items:
        try:
            it["confidence"] = round(float(it.get("confidence")), 3)
        except Exception:
            pass
    return jsonify({
        "limit": limit,
        "page": page,
        "count": len(items),
        "items": items,
    }), 200


@fleet_bp.route("/telematics/mismatches/live", methods=["GET"])
def telematics_mismatches_live():
        """Compute mismatches on the fly with tunable lookback and distance.

        Query params:
            - lookback_days: int, default 180
            - max_km: float, default 5.0 (snap threshold)
            - min_confidence: float, default 0.5
            - limit: int, default 500
        """
        # Params
        def _to_int(v, d):
                try:
                        return int(v)
                except Exception:
                        return d
        def _to_float(v, d):
                try:
                        return float(v)
                except Exception:
                        return d
        lookback_days = _to_int(request.args.get('lookback_days'), 180)
        max_km = _to_float(request.args.get('max_km'), 5.0)
        min_conf = _to_float(request.args.get('min_confidence'), 0.5)
        limit = _to_int(request.args.get('limit'), 500)
        if limit <= 0:
                limit = 500

        sql = sa.text(
                """
                WITH recent AS (
                    SELECT
                        f.*,
                        COALESCE(
                            f.stop_point_lat,
                            NULLIF(TRIM(SPLIT_PART(f.stop_point_zone_center_latlon, ',', 1)), '')::double precision
                        ) AS stop_lat,
                        COALESCE(
                            f.stop_point_lng,
                            NULLIF(TRIM(SPLIT_PART(f.stop_point_zone_center_latlon, ',', 2)), '')::double precision
                        ) AS stop_lng
                    FROM public.fleet_daily_metrics f
                    WHERE f.activity_ts >= NOW() - (:lookback_days || ' days')::interval
                ),
                filtered AS (
                    SELECT * FROM recent WHERE stop_lat IS NOT NULL AND stop_lng IS NOT NULL
                ),
                nearest_site_per_stop AS (
                    SELECT
                        r.vehicle_id,
                        r.activity_ts::date AS activity_date,
                        s_near.site_id,
                        s_near.site_name,
                        s_near.dist_km
                    FROM filtered r
                    CROSS JOIN LATERAL (
                        SELECT
                            s.id AS site_id,
                            s.name AS site_name,
                            6371 * 2 * ASIN(
                                SQRT(
                                    POWER(SIN(RADIANS((s.latitude - r.stop_lat) / 2)), 2)
                                    + COS(RADIANS(r.stop_lat)) * COS(RADIANS(s.latitude))
                                    * POWER(SIN(RADIANS((s.longitude - r.stop_lng) / 2)), 2)
                                )
                            ) AS dist_km
                        FROM public.sites s
                        WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
                        ORDER BY dist_km
                        LIMIT 1
                    ) AS s_near
                ),
                near_snaps AS (
                    SELECT n.*
                    FROM nearest_site_per_stop n
                    WHERE n.dist_km <= :max_km
                ),
                site_freq AS (
                    SELECT
                        vehicle_id,
                        site_id,
                        MIN(site_name) AS site_name,
                        COUNT(*) AS near_stops,
                        COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY vehicle_id), 0) AS freq
                    FROM near_snaps
                    GROUP BY vehicle_id, site_id
                ),
                inferred_site AS (
                    SELECT DISTINCT ON (vehicle_id)
                        vehicle_id,
                        site_id AS inferred_site_id,
                        site_name AS inferred_site_name,
                        near_stops,
                        freq AS confidence
                    FROM site_freq
                    ORDER BY vehicle_id, near_stops DESC, site_id
                )
                SELECT
                    e.equipment_id,
                    e.site_id AS assigned_site_id,
                    s1.name AS assigned_site_name,
                    s1.address AS assigned_site_address,
                    i.vehicle_id,
                    i.inferred_site_id,
                    s2.name AS inferred_site_name,
                    s2.address AS inferred_site_address,
                    i.near_stops,
                    i.confidence
                FROM inferred_site i
                JOIN public.equipment e
                    ON (i.vehicle_id ~ '^[0-9]+' AND e.equipment_id = i.vehicle_id::int)
                JOIN public.sites s1 ON s1.id = e.site_id
                LEFT JOIN public.sites s2 ON s2.id = i.inferred_site_id
                WHERE i.confidence >= :min_conf
                    AND (e.site_id IS DISTINCT FROM i.inferred_site_id)
                ORDER BY i.confidence DESC
                LIMIT :lim
                """
        )
        rows = db.session.execute(sql, {
                "lookback_days": lookback_days,
                "max_km": max_km,
                "min_conf": min_conf,
                "lim": limit
        }).mappings().all()
        results = [dict(r) for r in rows]
        for r in results:
                try:
                        r["confidence"] = round(float(r.get("confidence")), 3)
                except Exception:
                        pass
        return jsonify(results), 200
