from flask import Blueprint, jsonify, request
from ..extensions import db
from ..models import Site
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
                # Update department_id
                target.department_id = dept_id or None
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
