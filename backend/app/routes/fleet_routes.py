from flask import Blueprint, jsonify, request
from ..extensions import db
from ..models import Site, Equipment, EquipmentCatalog
import csv
import os
import math

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


def find_best_site(dept_name: str, district: str, lat: float, lon: float, dept_id: str = None):
    sites = Site.query.filter_by(is_deleted=False).all()
    best = None
    confidence = 0.0

    # Rule 0: direct department_id match
    if dept_id:
        for s in sites:
            if (s.department_id or '').strip() == dept_id.strip():
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
            eq_id = (getv(row, 'Eq ID', 'EQ ID', 'eq id', 'equipment_id', 'equipment_identifier') or '').strip()
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
                    'equipment_identifier': eq_id,
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
                eq_id = (getv(row, 'Eq ID', 'EQ ID', 'eq id', 'equipment_id', 'equipment_identifier') or '').strip()
                mc_code = (getv(row, 'MC', 'mc') or '').strip()
                dept_id = (getv(row, 'Dept ID', 'DEPT ID', 'dept id', 'department_id') or '').strip()
                dept_name = (getv(row, 'DEPT ID NAME', 'dept id name', 'department_name') or '').strip()
                district = (getv(row, 'District', 'district') or '').strip()
                lat = normalize_float(getv(row, 'CT_DEPT_LATITUDE', 'dept_latitude', 'latitude', 'lat'))
                lon = normalize_float(getv(row, 'CT_DEPT_LONGITUDE', 'dept_longitude', 'longitude', 'lon'))

                if not eq_id:
                    skipped += 1
                    continue
                if not mc_code:
                    errors.append({'row': idx, 'error': 'Missing MC code', 'equipment_identifier': eq_id})
                    skipped += 1
                    continue

                # Resolve catalog entry allowing for leading zeros
                catalog = EquipmentCatalog.query.get(mc_code)
                if not catalog:
                    alt = normalize_mc_code(mc_code)
                    if alt and alt != mc_code:
                        catalog = EquipmentCatalog.query.get(alt)
                if not catalog:
                    errors.append({'row': idx, 'error': f'MC code {mc_code} not in catalog', 'equipment_identifier': eq_id})
                    skipped += 1
                    continue

                site, conf = find_best_site(dept_name, district, lat, lon, dept_id)
                if site is None or conf < min_conf:
                    errors.append({'row': idx, 'error': 'No site match above confidence threshold', 'department_name': dept_name, 'district': district, 'equipment_identifier': eq_id, 'confidence': round(conf, 3)})
                    skipped += 1
                    continue

                existing = Equipment.query.filter_by(site_id=site.id, equipment_identifier=eq_id).first()
                # Use the catalog's canonical mc_code
                canonical_mc = catalog.mc_code if catalog else mc_code
                if existing:
                    existing.mc_code = canonical_mc
                    existing.department_id = dept_id or existing.department_id
                    updated += 1
                else:
                    eq = Equipment(
                        site_id=site.id,
                        mc_code=canonical_mc,
                        equipment_identifier=eq_id,
                        department_id=dept_id or None
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
