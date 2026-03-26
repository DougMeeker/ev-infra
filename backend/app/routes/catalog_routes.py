from flask import Blueprint, jsonify, request
from ..extensions import db
from ..models import EquipmentCatalog, EquipmentCategory
from ..models import Equipment
import csv
import re
import os
from datetime import datetime

catalog_bp = Blueprint("catalog", __name__)

CATALOG_CSV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ActiveCatalog.csv"))
MC_CODES_CSV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "MC_Codes.csv"))
def normalize_mc_code(mc: str):
    if mc is None:
        return None
    mc = str(mc).strip()
    if mc == "":
        return None
    stripped = mc.lstrip('0')
    return stripped if stripped != "" else "0"

def get_catalog_entry_by_mc(mc: str):
    if not mc:
        return None
    entry = EquipmentCatalog.query.get(mc)
    if entry:
        return entry
    alt = normalize_mc_code(mc)
    if alt and alt != mc:
        return EquipmentCatalog.query.get(alt)
    return None

def norm_header(h):
    if h is None:
        return None
    return str(h).lstrip('\ufeff').strip()

def norm_row_keys(row):
    return {norm_header(k): v for k, v in row.items()}

def getv(nrow, *keys):
    for k in keys:
        v = nrow.get(k)
        if v not in (None, ''):
            return v
    return None

@catalog_bp.route("/", methods=["GET"])
def list_catalog():
    rows = EquipmentCatalog.query.order_by(EquipmentCatalog.mc_code.asc()).all()
    return jsonify([r.to_dict() for r in rows]), 200

@catalog_bp.route("/<mc_code>", methods=["GET"])
def get_catalog_entry(mc_code):
    entry = EquipmentCatalog.query.get(mc_code)
    if not entry:
        return {"error": "MC code not found"}, 404
    return entry.to_dict(), 200

@catalog_bp.route("/", methods=["POST"])
def create_catalog_entry():
    data = request.get_json() or {}
    mc_code = str(data.get('mc_code') or '').strip()
    if not mc_code:
        return {"error": "mc_code is required"}, 400
    if EquipmentCatalog.query.get(mc_code):
        return {"error": f"MC code '{mc_code}' already exists"}, 409
    cat_code = (data.get('equipment_category_code') or '').strip() or None
    if cat_code:
        cat = EquipmentCategory.query.get(cat_code)
        if not cat:
            db.session.add(EquipmentCategory(code=cat_code, description=cat_code))
    entry = EquipmentCatalog(
        mc_code=mc_code,
        description=(data.get('description') or '').strip() or None,
        status=(data.get('status') or '').strip() or None,
        equipment_category_code=cat_code,
    )
    db.session.add(entry)
    db.session.commit()
    return entry.to_dict(), 201

@catalog_bp.route("/<mc_code>", methods=["PUT"])
def update_catalog_entry(mc_code):
    entry = EquipmentCatalog.query.get(mc_code)
    if not entry:
        return {"error": "MC code not found"}, 404
    data = request.get_json() or {}
    if 'description' in data:
        entry.description = data['description']
    if 'status' in data:
        entry.status = data['status']
    if 'equipment_category_code' in data:
        code = (data.get('equipment_category_code') or '').strip() or None
        if code:
            # Ensure category exists (create stub if missing)
            cat = EquipmentCategory.query.get(code)
            if not cat:
                db.session.add(EquipmentCategory(code=code, description=code))
        entry.equipment_category_code = code
    db.session.commit()
    return entry.to_dict(), 200

@catalog_bp.route("/refresh", methods=["POST"])
def refresh_catalog():
    if not os.path.exists(CATALOG_CSV_PATH):
        return {"error": f"Catalog CSV not found at {CATALOG_CSV_PATH}"}, 500
    added = 0
    updated = 0
    processed = 0
    with open(CATALOG_CSV_PATH, newline='', encoding='utf-8') as f:
        # Read all lines and normalize header to first 4 expected columns ignoring trailing empties.
        raw_lines = f.read().splitlines()
        if not raw_lines:
            return {"error": "Catalog file empty"}, 400
        header = raw_lines[0]
        # Ensure consistent header naming
        base_cols = ['MC', 'Equipment Description', 'Status', 'Revised','Energy Use']
        # Reconstruct a CSV string with trimmed first 5 columns only
        reconstructed = [','.join(base_cols)]
        for line in raw_lines[1:]:
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(',')]
            # Pad to length 5
            while len(parts) < 5:
                parts.append('')
            reconstructed.append(','.join(parts[:5]))
        reader = csv.DictReader(reconstructed)
        for row in reader:
            mc = (row.get('MC') or '').strip()
            if not mc:
                continue
            desc = (row.get('Equipment Description') or '').strip() or None
            status = (row.get('Status') or '').strip() or None
            revised_raw = (row.get('Revised') or '').strip()
            revised_date = None
            if revised_raw:
                for fmt in ('%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d'):
                    try:
                        revised_date = datetime.strptime(revised_raw, fmt).date()
                        break
                    except ValueError:
                        continue
            existing = get_catalog_entry_by_mc(mc)
            if existing:
                existing.description = desc
                existing.status = status
                existing.revised_date = revised_date
                updated += 1
            else:
                db.session.add(EquipmentCatalog(mc_code=mc, description=desc, status=status, revised_date=revised_date))
                added += 1
            processed += 1
    db.session.commit()
    return {"message": "Catalog refreshed", "added": added, "updated": updated, "processed": processed}, 200


@catalog_bp.route("/upload", methods=["POST"])
def upload_catalog():
    """Upload a CSV file from client to refresh catalog.
    Expects multipart/form-data with field name 'file'. Columns: MC, Equipment Description, Status, Revised.
    Doesn't wipe energy_per_mile if already set. Returns counts.
    """
    if 'file' not in request.files:
        return {"error": "No file part"}, 400
    file = request.files['file']
    if file.filename == '':
        return {"error": "Empty filename"}, 400
    # Read CSV from uploaded file (in-memory)
    try:
        stream = file.stream.read().decode('utf-8', errors='ignore').splitlines()
    except Exception as e:
        return {"error": f"Failed to read file: {e}"}, 400
    reader = csv.DictReader(stream)
    added = 0
    updated = 0
    processed = 0

    for row in reader:
        # Accept several MC header variants
        mc = row.get('MC') or row.get('Mc') or row.get('mc') or row.get('MC Code') or row.get('MC_Code')
        if not mc:
            continue
        desc = row.get('Equipment Description') or row.get('Description')
        status = row.get('Status')
        revised_raw = row.get('Revised') or row.get('Revised Date')
        revised_date = None
        if revised_raw:
            for fmt in ('%m/%d/%Y', '%m/%d/%y', '%Y-%m-%d'):
                try:
                    revised_date = datetime.strptime(revised_raw, fmt).date()
                    break
                except ValueError:
                    continue
        existing = get_catalog_entry_by_mc(mc)
        if existing:
            existing.description = desc
            existing.status = status
            existing.revised_date = revised_date
            updated += 1
        else:
            db.session.add(EquipmentCatalog(mc_code=mc, description=desc, status=status, revised_date=revised_date))
            added += 1
        processed += 1
    db.session.commit()
    return {"message": "Catalog uploaded", "added": added, "updated": updated, "processed": processed}, 200


@catalog_bp.route("/<mc_code>", methods=["DELETE"])
def delete_catalog_entry(mc_code):
    """Delete a catalog entry if no equipment references it."""
    entry = EquipmentCatalog.query.get(mc_code)
    if not entry:
        return {"error": "MC code not found"}, 404
    # Prevent deletion if any equipment uses this MC code
    in_use = Equipment.query.filter_by(mc_code=mc_code).first()
    if in_use:
        return {"error": "Cannot delete; equipment references this MC code"}, 400
    db.session.delete(entry)
    db.session.commit()
    return {"message": f"MC {mc_code} deleted"}, 200


@catalog_bp.route('/map-mc-categories', methods=['POST'])
def map_mc_categories():
    """Map MC codes to equipment categories using server-side MC_Codes.csv.
    Expected headers include at least: MC (or MC Code) and EQ CAT (category code).
    Creates stub categories if missing and sets EquipmentCatalog.equipment_category_code.
    """
    if not os.path.exists(MC_CODES_CSV_PATH):
        return {"error": f"MC_Codes.csv not found at {MC_CODES_CSV_PATH}"}, 404
    updated = 0
    created_categories = 0
    processed = 0
    with open(MC_CODES_CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        raw_rows = [norm_row_keys(r) for r in reader]
        for row in raw_rows:
            processed += 1
            mc = (getv(row, 'MC', 'MC Code', 'mc') or '').strip()
            cat_code = (getv(row, 'EQ CAT', 'EQ_CAT', 'Equipment Category') or '').strip()
            cat_desc = (getv(row, 'EQ_CAT_Description', 'EQ CAT Description', 'Category Description') or '').strip()
            mc_desc = (getv(row, 'MC Description', 'Equipment Description', 'Description') or '').strip()
            if not mc or not cat_code:
                continue
            entry = get_catalog_entry_by_mc(mc)
            if not entry:
                # Create missing catalog entry with minimal info
                db.session.add(EquipmentCatalog(mc_code=normalize_mc_code(mc), description=(mc_desc or None), status=None, revised_date=None))
                entry = get_catalog_entry_by_mc(mc)
            else:
                # If description is blank and MC Description provided, populate it
                if (not entry.description) and mc_desc:
                    entry.description = mc_desc
            # Ensure category exists
            cat = EquipmentCategory.query.get(cat_code)
            if not cat:
                db.session.add(EquipmentCategory(code=cat_code, description=(cat_desc or cat_code)))
                created_categories += 1
            # Assign category code
            entry.equipment_category_code = cat_code
            updated += 1
    db.session.commit()
    return {"message": "MC to category mapping applied", "updated": updated, "created_categories": created_categories, "processed": processed}, 200
