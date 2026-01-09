import re
import csv
from io import TextIOWrapper
from datetime import datetime
from flask import jsonify
from ..extensions import db
from ..models import Equipment, EquipmentUsage


def _extract_year_month(filename: str):
    """Extract (year, month) from filenames like 'GPS-Vehicle-Utilization-2022-12.csv'.
    Returns (year, month) or (None, None) if not found.
    """
    if not filename:
        return None, None
    m = re.search(r"(20\d{2})[-_](0[1-9]|1[0-2])", filename)
    if m:
        try:
            return int(m.group(1)), int(m.group(2))
        except Exception:
            return None, None
    # Fallback: find any 4-digit year and 1-2 digit month
    m2 = re.search(r"(20\d{2}).*?(\d{1,2})", filename)
    if m2:
        try:
            year = int(m2.group(1))
            month = int(m2.group(2))
            if 1 <= month <= 12:
                return year, month
        except Exception:
            pass
    return None, None


def _normalize_float(val):
    if val is None:
        return None
    try:
        s = str(val).strip()
        if s == "":
            return None
        return float(s)
    except Exception:
        return None


def _normalize_int(val):
    try:
        s = str(val).strip()
        if s == "":
            return None
        return int(float(s))
    except Exception:
        return None


def _normalize_key(k: str) -> str:
    """Normalize header keys: lowercase, strip BOM/whitespace, collapse spaces.
    Keep parentheses text for unit detection, but remove double spaces.
    """
    if k is None:
        return ''
    s = str(k)
    s = s.lstrip('\ufeff').strip()
    s = s.lower()
    s = s.replace('_', ' ')
    # collapse multiple spaces
    s = re.sub(r"\s+", " ", s)
    return s


def _parse_hhmm(val: str):
    if val is None:
        return None
    s = str(val).strip()
    if s == '':
        return None
    # Accept hh:mm or h:mm or mm:ss (assume hours:minutes)
    m = re.match(r"^(\d{1,3}):(\d{2})$", s)
    if m:
        try:
            h = int(m.group(1))
            minutes = int(m.group(2))
            return float(h) + float(minutes)/60.0
        except Exception:
            return None
    # Fallback: try plain float
    try:
        return float(s)
    except Exception:
        return None


def import_utilization(file_storage):
    """Import GPS Vehicle Utilization CSV for a given month.

    - Extracts year/month from filename.
    - Tries flexible header matching for equipment id, miles, and driving hours.
    - Upserts into EquipmentUsage by (equipment_id, year, month).
    """
    filename = (getattr(file_storage, 'filename', None) or '')
    year, month = _extract_year_month(filename)
    if not year or not month:
        return {"error": "Could not determine year/month from filename"}, 400

    # Candidate header name tokens (normalized)
    id_candidates = [
        'equipment id', 'vehicle id', 'eq id', 'equipment_id', 'vehicle_id', 'unit id', 'unit number', 'vehicle'
    ]
    # Match headers containing these substrings for miles and hours
    miles_substrings = ['mile', 'mi', 'distance']
    hours_substrings = ['driving hours', 'drive hours', 'hours driving', 'driving time', 'utilization hours']
    days_substrings = ['days utilized', 'days used', 'days']

    processed = 0
    skipped = 0
    unknown_ids = []
    errors = []

    # Read CSV in text mode with utf-8
    try:
        stream = TextIOWrapper(file_storage.stream, encoding='utf-8', newline='')
        reader = csv.DictReader(stream)
    except Exception as e:
        return {"error": f"Failed to read CSV: {e}"}, 400

    for idx, row in enumerate(reader):
        try:
            # Build normalized header map
            norm_map = { _normalize_key(k): k for k in row.keys() }
            # Find equipment external id (prefer exact normalized matches)
            raw_id = None
            for token in id_candidates:
                nk = token
                if nk in norm_map:
                    v = row.get(norm_map[nk])
                    if v not in (None, ''):
                        raw_id = v
                        break
            # Special-case the observed header 'Vehicle_id'
            if raw_id is None and 'vehicle_id' in norm_map:
                raw_id = row.get(norm_map['vehicle_id'])
            eq_ext_id = _normalize_int(raw_id)
            if eq_ext_id is None:
                skipped += 1
                continue

            # Miles, driving hours, and days utilized
            raw_miles = None
            # Prefer exact observed header 'DistanceTraveled(mi)'
            if 'distancetraveled(mi)' in norm_map:
                raw_miles = row.get(norm_map['distancetraveled(mi)'])
            if raw_miles in (None, ''):
                # Fuzzy search by substrings
                for nk, orig in norm_map.items():
                    if any(sub in nk for sub in miles_substrings):
                        v = row.get(orig)
                        if v not in (None, ''):
                            raw_miles = v
                            break
            miles = _normalize_float(raw_miles)

            raw_hours = None
            # Prefer observed header 'vehicledriving hours(hh:mm)'
            if 'vehicledriving hours(hh:mm)' in norm_map:
                raw_hours = row.get(norm_map['vehicledriving hours(hh:mm)'])
            if raw_hours in (None, ''):
                for nk, orig in norm_map.items():
                    if any(sub in nk for sub in hours_substrings):
                        v = row.get(orig)
                        if v not in (None, ''):
                            raw_hours = v
                            break
            # Parse hh:mm to float hours
            driving_hours = _parse_hhmm(raw_hours)

            # Days utilized
            raw_days = None
            if 'daysutilized' in norm_map:
                raw_days = row.get(norm_map['daysutilized'])
            if raw_days in (None, ''):
                for nk, orig in norm_map.items():
                    if any(sub in nk for sub in days_substrings):
                        v = row.get(orig)
                        if v not in (None, ''):
                            raw_days = v
                            break
            days_utilized = _normalize_int(raw_days)

            # Lookup equipment by external id
            equipment = Equipment.query.filter_by(equipment_id=eq_ext_id).first()
            if not equipment:
                unknown_ids.append(eq_ext_id)
                skipped += 1
                continue

            # Upsert usage row
            usage = EquipmentUsage.query.filter_by(equipment_id=equipment.id, year=year, month=month).first()
            if usage:
                usage.miles = miles
                usage.driving_hours = driving_hours
                usage.days_utilized = days_utilized
                usage.updated_at = datetime.utcnow()
            else:
                usage = EquipmentUsage(
                    equipment_id=equipment.id,
                    year=year,
                    month=month,
                    miles=miles,
                    driving_hours=driving_hours,
                    days_utilized=days_utilized,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.session.add(usage)
            processed += 1
        except Exception as e:
            errors.append({"row": idx, "error": str(e)})
            skipped += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to import utilization: {e}"}, 500

    return jsonify({
        "message": "Utilization imported",
        "year": year,
        "month": month,
        "processed": processed,
        "skipped": skipped,
        "unknown_equipment_ids": list(sorted(set([x for x in unknown_ids if x is not None])))[:50],
        "errors": errors[:25]
    }), 200
