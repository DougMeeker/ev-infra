from flask import Blueprint, jsonify, request
from ..extensions import db
from ..models import EquipmentCatalog
from ..models import Equipment
import csv
import re
import os
from datetime import datetime

catalog_bp = Blueprint("catalog", __name__)

CATALOG_CSV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ActiveCatalog.csv"))

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

@catalog_bp.route("/<mc_code>", methods=["PUT"])
def update_catalog_entry(mc_code):
    entry = EquipmentCatalog.query.get(mc_code)
    if not entry:
        return {"error": "MC code not found"}, 404
    data = request.get_json() or {}
    if 'energy_per_mile' in data:
        val = data.get('energy_per_mile')
        try:
            entry.energy_per_mile = float(val) if val is not None else None
        except (ValueError, TypeError):
            return {"error": "energy_per_mile must be numeric"}, 400
    if 'description' in data:
        entry.description = data['description']
    if 'status' in data:
        entry.status = data['status']
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
            energy_use_raw = (row.get('Energy Use') or '').strip()  
            existing = EquipmentCatalog.query.get(mc)
            if existing:
                existing.description = desc
                existing.status = status
                existing.revised_date = revised_date
                updated += 1
            else:
                db.session.add(EquipmentCatalog(mc_code=mc, description=desc, status=status, revised_date=revised_date, energy_per_mile=energy_use_raw if energy_use_raw else None))
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

    def parse_energy(val):
        if val is None:
            return None
        s = str(val).strip()
        if not s:
            return None
        # extract first float-like number from the string
        m = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", s)
        if not m:
            return None
        try:
            return float(m.group(0))
        except ValueError:
            return None

    # normalize potential header names for energy per mile
    def get_energy_from_row(row):
        keys = [
            'Energy Use', 'Energy', 'Energy per Mile', 'Energy/Mile',
            'kWh per Mile', 'kWh/Mile', 'kwh_per_mile', 'energy_per_mile',
            'Energy_kWh_per_mile', 'Energy_kwh_per_mile'
        ]
        for k in row.keys():
            if k is None:
                continue
            kl = k.strip().lower()
            if kl in [x.lower() for x in keys]:
                return parse_energy(row.get(k))
        return None
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
        energy_val = get_energy_from_row(row)
        existing = EquipmentCatalog.query.get(mc)
        if existing:
            existing.description = desc
            existing.status = status
            existing.revised_date = revised_date
            if energy_val is not None:
                existing.energy_per_mile = energy_val
            updated += 1
        else:
            db.session.add(EquipmentCatalog(mc_code=mc, description=desc, status=status, revised_date=revised_date, energy_per_mile=energy_val))
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
