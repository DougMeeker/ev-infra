from flask import Blueprint, jsonify, request
from ..extensions import db
from ..models import Site, Department
import csv
import os
import math
import re

department_bp = Blueprint("departments", __name__)

DEPT_CSV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "Department_Id.csv"))


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians((lat2 or 0) - (lat1 or 0))
    dlon = math.radians((lon2 or 0) - (lon1 or 0))
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1 or 0)) * math.cos(math.radians(lat2 or 0)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


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


# Normalization helpers available to all endpoints
def norm_header(h):
    if h is None:
        return None
    h = str(h).lstrip('\ufeff').strip().lower()
    return re.sub(r"[^a-z0-9_]+", "_", h)


def norm_row_keys(row):
    return {norm_header(k): v for k, v in row.items()}


def getv(nrow, *keys):
    for k in keys:
        v = nrow.get(k)
        if v not in (None, ''):
            return v
    return None


def _dept_to_dict(d, site_map=None):
    row = d.to_dict()
    row['code'] = f"{d.district:02d}-{d.unit:04d}"
    if site_map is not None and d.site_id is not None:
        s = site_map.get(d.site_id)
        row['site_name'] = s.name if s else None
    elif d.site_id is not None and d.site is not None:
        row['site_name'] = d.site.name
    else:
        row['site_name'] = None
    return row


@department_bp.route("/", methods=["GET"])
def list_departments():
    """List departments with optional filtering and pagination.

    Query params:
        q           – search unit_name or formatted code 'DD-UUUU'
        site_id     – filter to a specific site
        unassigned  – '1' to return only rows with site_id IS NULL
        district    – integer filter on district
        page        – 1-based page (default 1)
        per_page    – rows per page (default 50, max 200)
    """
    from sqlalchemy import or_, func, cast
    from sqlalchemy import String as SAString

    q           = (request.args.get('q') or '').strip()
    site_id_param = request.args.get('site_id')
    unassigned  = request.args.get('unassigned') == '1'
    district_param = request.args.get('district')

    try:
        page     = max(1, int(request.args.get('page', 1)))
        per_page = min(200, max(1, int(request.args.get('per_page', 50))))
    except (TypeError, ValueError):
        page, per_page = 1, 50

    query = Department.query
    if site_id_param:
        try:
            query = query.filter(Department.site_id == int(site_id_param))
        except (TypeError, ValueError):
            pass
    if unassigned:
        query = query.filter(Department.site_id.is_(None))
    if district_param:
        try:
            query = query.filter(Department.district == int(district_param))
        except (TypeError, ValueError):
            pass
    if q:
        like = f"%{q}%"
        formatted_code = (
            func.lpad(cast(Department.district, SAString), 2, '0')
            + '-'
            + func.lpad(cast(Department.unit, SAString), 4, '0')
        )
        query = query.filter(or_(
            Department.unit_name.ilike(like),
            formatted_code.ilike(like),
        ))

    query = query.order_by(Department.district, Department.unit)
    total = query.count()
    depts = query.offset((page - 1) * per_page).limit(per_page).all()

    # Build site name map for the page in one query
    site_ids = {d.site_id for d in depts if d.site_id is not None}
    site_map = {}
    if site_ids:
        from ..models import Site as _Site
        for s in _Site.query.filter(_Site.id.in_(site_ids)).all():
            site_map[s.id] = s

    result = [_dept_to_dict(d, site_map) for d in depts]
    return jsonify({
        'items': result,
        'meta': {'total': total, 'page': page, 'per_page': per_page, 'returned': len(result)}
    }), 200


@department_bp.route("/", methods=["POST"])
def create_department():
    """Create a new department row."""
    data = request.get_json(silent=True) or {}
    try:
        district  = int(data['district'])
        unit      = int(data['unit'])
        unit_name = str(data.get('unit_name', '')).strip()
    except (KeyError, TypeError, ValueError) as e:
        return {"error": f"district (int), unit (int) and unit_name (str) are required: {e}"}, 400

    site_id = data.get('site_id')
    if site_id is not None:
        try:
            site_id = int(site_id)
        except (TypeError, ValueError):
            site_id = None

    dept = Department(district=district, unit=unit, unit_name=unit_name, site_id=site_id)
    db.session.add(dept)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Could not create department: {e}"}, 400
    return jsonify(_dept_to_dict(dept)), 201


@department_bp.route("/<int:dept_id>", methods=["PUT"])
def update_department(dept_id):
    """Update district, unit, and/or unit_name of a department."""
    dept = Department.query.get(dept_id)
    if not dept:
        return {"error": "Department not found"}, 404
    data = request.get_json(silent=True) or {}
    if 'district' in data:
        try:
            dept.district = int(data['district'])
        except (TypeError, ValueError):
            return {"error": "district must be an integer"}, 400
    if 'unit' in data:
        try:
            dept.unit = int(data['unit'])
        except (TypeError, ValueError):
            return {"error": "unit must be an integer"}, 400
    if 'unit_name' in data:
        dept.unit_name = str(data['unit_name']).strip()
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Could not update department: {e}"}, 400
    return jsonify(_dept_to_dict(dept)), 200


@department_bp.route("/<int:dept_id>/site", methods=["PATCH"])
def assign_department_site(dept_id):
    """Assign or unassign a site to a department.
    Body: { "site_id": <int|null> }
    """
    dept = Department.query.get(dept_id)
    if not dept:
        return {"error": "Department not found"}, 404
    data = request.get_json(silent=True) or {}
    raw = data.get('site_id')
    if raw is None:
        dept.site_id = None
    else:
        try:
            dept.site_id = int(raw)
        except (TypeError, ValueError):
            return {"error": "site_id must be an integer or null"}, 400
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Could not assign site: {e}"}, 400
    return jsonify(_dept_to_dict(dept)), 200


@department_bp.route("/<int:dept_id>", methods=["DELETE"])
def delete_department(dept_id):
    """Permanently delete a department row."""
    dept = Department.query.get(dept_id)
    if not dept:
        return {"error": "Department not found"}, 404
    db.session.delete(dept)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Could not delete department: {e}"}, 400
    return {"status": "deleted", "id": dept_id}, 200


@department_bp.route("/site-mapping/preview", methods=["GET"])
def preview_site_department_mapping():
    if not os.path.exists(DEPT_CSV_PATH):
        return {"error": f"Department_Id.csv not found at {DEPT_CSV_PATH}"}, 404
    rows = []
    sites = Site.query.filter_by(is_deleted=False).all()
    # Parse optional confidence threshold
    try:
        min_conf = float(request.args.get('min_confidence', 0) or 0)
    except Exception:
        min_conf = 0.0

    with open(DEPT_CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        # Pre-normalize rows and build a name->id lookup for fallback
        raw_rows = [norm_row_keys(r) for r in reader]
        id_by_name = {}
        for r in raw_rows:
            did = (getv(r, 'dept_id', 'department_id') or '').strip()
            dname = (getv(r, 'dept_name', 'department_name') or '').strip()
            if did and dname:
                id_by_name[dname.lower()] = did

        for nrow in raw_rows:
            dept_id = (getv(nrow, 'dept_id', 'department_id') or '').strip()
            dept_name = (getv(nrow, 'dept_name', 'department_name') or '').strip()
            # Fallback: fill id by exact name if id missing
            if not dept_id and dept_name:
                dept_id = id_by_name.get(dept_name.lower(), '')

            lat = normalize_float(getv(nrow, 'dept_latitude', 'latitude', 'lat'))
            lon = normalize_float(getv(nrow, 'dept_longitude', 'longitude', 'lon'))
            matched_site = None
            confidence = 0.0

            # Match by coordinates if provided (nearest site within 2 km)
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
                    matched_site = nearest
                    if nearest_dist is not None:
                        confidence = 0.9 if nearest_dist <= 1.0 else (0.7 if nearest_dist <= 2.0 else 0.4)

            # Fallback: name contains (case-insensitive) — compare dept_name to site.name
            if matched_site is None and dept_name:
                dn = dept_name.strip().lower()
                for s in sites:
                    if not s.name:
                        continue
                    if dn in s.name.strip().lower():
                        matched_site = s
                        confidence = max(confidence, 0.6)
                        break

            # Apply threshold filter: only include confident matches
            # Determine if we would rename a placeholder site name
            will_rename = False
            proposed_site_name = None
            RENAME_CONF = max(min_conf, 0.8)
            if matched_site and dept_name:
                name_now = (matched_site.name or '').strip()
                if re.match(r'^\s*dgs\s+property\s+\d+\s*$', name_now, flags=re.IGNORECASE) and confidence >= RENAME_CONF:
                    will_rename = True
                    proposed_site_name = dept_name

            if matched_site and confidence >= min_conf:
                rows.append({
                    'dept_id': dept_id or None,
                    'dept_name': dept_name or None,
                    'dept_lat': lat,
                    'dept_lon': lon,
                    'matched_site_id': matched_site.id if matched_site else None,
                    'matched_site_name': matched_site.name if matched_site else None,
                    'current_department_id': (matched_site.department_id if matched_site else None),
                    'confidence': round(confidence, 3),
                    'will_rename': will_rename,
                    'proposed_site_name': proposed_site_name
                })
    return jsonify(rows), 200


@department_bp.route("/site-mapping/import", methods=["POST"])
def import_site_department_mapping():
    if not os.path.exists(DEPT_CSV_PATH):
        return {"error": f"Department_Id.csv not found at {DEPT_CSV_PATH}"}, 404
    updated = 0
    skipped = 0
    errors = []
    sites = Site.query.filter_by(is_deleted=False).all()
    try:
        min_conf = float(request.args.get('min_confidence', 0) or 0)
    except Exception:
        min_conf = 0.0
    with open(DEPT_CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        raw_rows = [norm_row_keys(r) for r in reader]
        id_by_name = {}
        for r in raw_rows:
            did = (getv(r, 'dept_id', 'department_id') or '').strip()
            dname = (getv(r, 'dept_name', 'department_name') or '').strip()
            if did and dname:
                id_by_name[dname.lower()] = did
        for idx, nrow in enumerate(raw_rows):
            try:
                dept_id = (getv(nrow, 'dept_id', 'department_id') or '').strip()
                dept_name = (getv(nrow, 'dept_name', 'department_name') or '').strip()
                if not dept_id and dept_name:
                    dept_id = id_by_name.get(dept_name.lower(), '')
                lat = normalize_float(getv(nrow, 'dept_latitude', 'latitude', 'lat'))
                lon = normalize_float(getv(nrow, 'dept_longitude', 'longitude', 'lon'))

                # Find target site using same preview logic
                target = None
                nearest = None
                nearest_dist = None
                confidence = 0.0
                if lat is not None and lon is not None:
                    for s in sites:
                        if s.latitude is None or s.longitude is None:
                            continue
                        d = haversine(lat, lon, s.latitude, s.longitude)
                        if nearest_dist is None or d < nearest_dist:
                            nearest = s
                            nearest_dist = d
                    if nearest is not None:
                        target = nearest
                        if nearest_dist is not None:
                            confidence = 0.9 if nearest_dist <= 1.0 else (0.7 if nearest_dist <= 2.0 else 0.4)
                if target is None and dept_name:
                    dn = dept_name.strip().lower()
                    for s in sites:
                        if not s.name:
                            continue
                        if dn in s.name.strip().lower():
                            target = s
                            confidence = max(confidence, 0.6)
                            break
                if not target or confidence < min_conf:
                    skipped += 1
                    errors.append({'row': idx, 'error': 'No site match above confidence threshold', 'dept_id': dept_id, 'dept_name': dept_name, 'confidence': round(confidence, 3)})
                    continue
                # Update department_id: allow comma-separated list, append if new
                if dept_id:
                    existing = (target.department_id or '').strip()
                    tokens = [t.strip() for t in existing.split(',') if t.strip()]
                    if dept_id not in tokens:
                        tokens.append(dept_id)
                    target.department_id = ','.join(tokens) if tokens else None
                # Optionally rename placeholder site names when confidence is high
                RENAME_CONF = max(min_conf, 0.8)
                if dept_name and target.name:
                    current_name = target.name.strip()
                    if re.match(r'^\s*dgs\s+property\s+\d+\s*$', current_name, flags=re.IGNORECASE) and confidence >= RENAME_CONF:
                        target.name = dept_name
                updated += 1
            except Exception as e:
                errors.append({'row': idx, 'error': str(e)})
                skipped += 1
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to update sites: {e}"}, 500
    return {
        'message': 'Department mapping applied',
        'updated': updated,
        'skipped': skipped,
        'errors': errors[:25]
    }, 200
