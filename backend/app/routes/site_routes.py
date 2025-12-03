from flask import Blueprint, jsonify, request
from ..models import Site, UtilityBill, Equipment, EquipmentUsage, EquipmentCatalog, Charger
from ..extensions import db
from datetime import datetime, timedelta
import math
import json
import os

site_bp = Blueprint("sites", __name__)

@site_bp.route("/", methods=["GET"])
def get_sites():
    sites = Site.query.filter_by(is_deleted=False).all()
    site_ids = [s.id for s in sites]
    # Preload chargers and sum kW per site
    chargers = Charger.query.filter(Charger.site_id.in_(site_ids)).all()
    totals = {}
    for c in chargers:
        kw = c.kw if c.kw is not None else 0.0
        totals[c.site_id] = (totals.get(c.site_id, 0.0) + (kw or 0.0))
    rows = []
    for s in sites:
        d = s.to_dict()
        total_kw = totals.get(s.id)
        d['total_charger_kw'] = round(total_kw, 3) if total_kw is not None else 0.0
        rows.append(d)
    return jsonify(rows)

@site_bp.route("/<int:site_id>", methods=["GET"])
def get_site(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    return site.to_dict()


@site_bp.route("/", methods=["POST"])
def create_site():
    data = request.get_json()
    site = Site(
        name=data.get("name"),
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        utility=data.get("utility"),
        utility_account=data.get("utility_account"),
        utility_name=data.get("utility_name"),
        meter_number=data.get("meter_number"),
        address=data.get("address"),
        city=data.get("city"),
        contact_name=data.get("contact_name"),
        contact_phone=data.get("contact_phone")
    )
    db.session.add(site)
    db.session.commit()
    return site.to_dict(), 201

@site_bp.route("/<int:site_id>", methods=["PUT"])
def update_site(site_id):
    site = Site.query.get(site_id)
    if not site:
        return {"error": "Site not found"}, 404

    data = request.get_json() or {}
    # Only allow scalar field updates; ignore relationships like 'bills'
    allowed_fields = {
        "name": str,
        "latitude": float,
        "longitude": float,
        "utility": str,
        "utility_account": str,
        "utility_name": str,
        "meter_number": str,
        "address": str,
        "city": str,
        "contact_name": str,
        "contact_phone": str,
        "main_breaker_amps": int,
        "voltage": int,
        "phase_count": int,
        "power_factor": float,
        "is_deleted": bool,
    }

    for key, caster in allowed_fields.items():
        if key in data:
            raw = data[key]
            if raw == "":  # treat empty string as None
                setattr(site, key, None)
                continue
            try:
                # Preserve original value types if caster is str (avoid casting None)
                if raw is None:
                    setattr(site, key, None)
                else:
                    setattr(site, key, caster(raw) if caster is not str else str(raw))
            except (ValueError, TypeError):
                # Skip invalid casts rather than failing entire request
                continue

    db.session.commit()
    return site.to_dict()

@site_bp.route("/<int:site_id>", methods=["DELETE"])
def delete_site(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404

    site.is_deleted = True
    db.session.commit()
    return {"message": f"Site {site_id} deleted successfully."}, 200


@site_bp.route("/<int:site_id>/restore", methods=["POST"])
def restore_site(site_id):
    site = Site.query.get(site_id)
    if not site or not site.is_deleted:
        return {"error": "Site not found or not deleted"}, 404

    site.is_deleted = False
    db.session.commit()
    return {"message": f"Site {site_id} restored successfully."}, 200

@site_bp.route("/<int:site_id>/metrics", methods=["GET"])
def site_metrics(site_id):
    """Return capacity and demand metrics for a site.
    last_year_peak_kw: max bill.max_power over last 365 days
    theoretical_capacity_kw: derived from breaker amps, voltage, phase count (PF=0.95)
    available_capacity_kw: theoretical - last_year_peak_kw (not below 0)
    """
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404

    cutoff = datetime.utcnow() - timedelta(days=365)
    bills = UtilityBill.query.filter_by(site_id=site_id, is_deleted=False).all()
    last_year_bills = []
    for b in bills:
        # Construct first day of month datetime for comparison
        try:
            bill_dt = datetime(b.year, b.month, 1)
        except ValueError:
            continue
        if bill_dt >= cutoff:
            last_year_bills.append(b)

    last_year_peak_kw = max([b.max_power for b in last_year_bills if b.max_power is not None], default=0)

    theoretical_capacity_kw = None
    pf = site.power_factor or 0.95
    if site.main_breaker_amps and site.voltage and site.phase_count:
        if site.phase_count == 3:
            theoretical_capacity_kw = site.main_breaker_amps * site.voltage * math.sqrt(3) * pf / 1000.0
        else:  # Single phase (phase_count == 1)
            theoretical_capacity_kw = site.main_breaker_amps * site.voltage * pf / 1000.0

    available_capacity_kw = None
    if theoretical_capacity_kw is not None:
        available_capacity_kw = max(theoretical_capacity_kw - last_year_peak_kw, 0)

    return {
        "site_id": site_id,
        "last_year_peak_kw": round(last_year_peak_kw, 3),
        "theoretical_capacity_kw": round(theoretical_capacity_kw, 3) if theoretical_capacity_kw is not None else None,
        "available_capacity_kw": round(available_capacity_kw, 3) if available_capacity_kw is not None else None,
        "power_factor": pf,
        "phase_count": site.phase_count,
        "voltage": site.voltage,
        "main_breaker_amps": site.main_breaker_amps
    }, 200

@site_bp.route("/metrics/aggregate", methods=["GET"])
def aggregate_site_metrics():
    """Return metrics list for all non-deleted sites, ranked by available capacity.
    Each item contains: site_id, name, last_year_peak_kw, theoretical_capacity_kw, available_capacity_kw.
    Optional query params: limit (int), order (asc|desc) for available_capacity_kw.
    """
    order = request.args.get('order', 'desc').lower()
    sort_field = request.args.get('sort', 'available_capacity_kw')
    search = request.args.get('search', '').strip()
    limit_param = request.args.get('limit', None)
    page_param = request.args.get('page', None)
    per_page_param = request.args.get('per_page', None)
    offset_param = request.args.get('offset', None)

    # Parse ints safely
    def to_int(val):
        try:
            return int(val)
        except (TypeError, ValueError):
            return None

    limit = to_int(limit_param)
    page = to_int(page_param)
    per_page = to_int(per_page_param) or 50
    offset = to_int(offset_param)

    site_query = Site.query.filter_by(is_deleted=False)
    if search:
        like = f"%{search}%"
        site_query = site_query.filter(Site.name.ilike(like))
    sites = site_query.all()
    site_ids = [s.id for s in sites]
    bills = UtilityBill.query.filter(UtilityBill.site_id.in_(site_ids), UtilityBill.is_deleted.is_(False)).all()
    # Preload chargers for totals
    chargers = Charger.query.filter(Charger.site_id.in_(site_ids)).all()
    charger_totals = {}
    charger_installed_totals = {}
    for c in chargers:
        kw = c.kw if c.kw is not None else 0.0
        sid = c.site_id
        charger_totals[sid] = charger_totals.get(sid, 0.0) + (kw or 0.0)
        if c.date_installed is not None:
            charger_installed_totals[sid] = charger_installed_totals.get(sid, 0.0) + (kw or 0.0)

    # Organize bills by site
    bills_by_site = {}
    cutoff = datetime.utcnow() - timedelta(days=365)
    for b in bills:
        try:
            bill_dt = datetime(b.year, b.month, 1)
        except ValueError:
            continue
        if bill_dt < cutoff:
            continue
        bills_by_site.setdefault(b.site_id, []).append(b)

    rows = []
    for s in sites:
        last_year_peak_kw = max([b.max_power for b in bills_by_site.get(s.id, []) if b.max_power is not None], default=0)
        theoretical_capacity_kw = None
        pf = s.power_factor or 0.95
        if s.main_breaker_amps and s.voltage and s.phase_count:
            if s.phase_count == 3:
                theoretical_capacity_kw = s.main_breaker_amps * s.voltage * math.sqrt(3) * pf / 1000.0
            else:
                theoretical_capacity_kw = s.main_breaker_amps * s.voltage * pf / 1000.0
        available_capacity_kw = None
        if theoretical_capacity_kw is not None:
            available_capacity_kw = max(theoretical_capacity_kw - last_year_peak_kw, 0)
        rows.append({
            "site_id": s.id,
            "name": s.name,
            "last_year_peak_kw": round(last_year_peak_kw, 3),
            "theoretical_capacity_kw": round(theoretical_capacity_kw, 3) if theoretical_capacity_kw is not None else None,
            "available_capacity_kw": round(available_capacity_kw, 3) if available_capacity_kw is not None else None,
            "voltage": s.voltage,
            "phase_count": s.phase_count,
            "main_breaker_amps": s.main_breaker_amps,
            "power_factor": pf,
            "total_charger_kw": round(charger_totals.get(s.id, 0.0), 3),
            "installed_charger_kw": round(charger_installed_totals.get(s.id, 0.0), 3)
        })

    # Sorting
    def sort_key(row):
        val = None
        if sort_field == 'available_capacity_kw':
            val = row.get('available_capacity_kw')
        elif sort_field == 'last_year_peak_kw':
            val = row.get('last_year_peak_kw')
        elif sort_field == 'theoretical_capacity_kw':
            val = row.get('theoretical_capacity_kw')
        elif sort_field == 'power_factor':
            val = row.get('power_factor')
        elif sort_field == 'total_charger_kw':
            val = row.get('total_charger_kw')
        elif sort_field == 'installed_charger_kw':
            val = row.get('installed_charger_kw')
        elif sort_field == 'name':
            val = row.get('name') or ''
            return val.lower()
        # Handle None by pushing to end in descending, start in ascending
        if val is None:
            return -1 if order != 'asc' else float('inf')
        return val

    rows.sort(key=sort_key, reverse=(order != 'asc'))
    # Pagination logic: offset/limit take precedence; else page/per_page
    if offset is not None and offset >= 0:
        end = offset + (limit if limit is not None else per_page)
        rows = rows[offset:end]
    elif page is not None and page > 0:
        start = (page - 1) * per_page
        end = start + per_page
        rows = rows[start:end]
    elif limit is not None and limit > 0:
        rows = rows[:limit]

    meta = {
        "total": len(site_ids),
        "returned": len(rows),
        "order": order,
        "sort": sort_field,
        "page": page,
        "per_page": per_page if page else None,
        "offset": offset,
        "limit": limit,
        "search": search
    }
    return jsonify({"data": rows, "meta": meta}), 200


# ---------------------- Equipment Endpoints ----------------------
@site_bp.route("/<int:site_id>/equipment", methods=["GET"])
def list_equipment(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    year = request.args.get('year')
    try:
        target_year = int(year) if year else (datetime.utcnow().year - 1)
    except ValueError:
        target_year = datetime.utcnow().year - 1
    equipment_rows = Equipment.query.filter_by(site_id=site_id).all()
    results = []
    for eq in equipment_rows:
        usage = EquipmentUsage.query.filter_by(equipment_id=eq.id, year=target_year).first()
        usage_miles = usage.miles if usage else None
        miles_source = 'usage'
        miles = usage_miles
        if eq.annual_miles is not None:
            miles = eq.annual_miles
            miles_source = 'annual'
        energy_per_mile = eq.catalog.energy_per_mile if eq.catalog else None
        energy_kwh = miles * energy_per_mile if (miles is not None and energy_per_mile is not None) else None
        operating_hours = 8760.0
        if eq.downtime_hours and eq.downtime_hours > 0:
            operating_hours = max(operating_hours - eq.downtime_hours, 1.0)
        average_power_kw = (energy_kwh / operating_hours) if (energy_kwh is not None) else None
        data = eq.to_dict()
        data['year'] = target_year
        data['miles_source'] = miles_source
        data['last_year_miles'] = usage_miles
        data['effective_miles'] = miles
        data['last_year_energy_kwh'] = energy_kwh
        data['avg_power_kw'] = average_power_kw
        results.append(data)
    return jsonify(results), 200


@site_bp.route("/<int:site_id>/equipment", methods=["POST"])
def create_equipment(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    data = request.get_json() or {}
    mc_code = data.get('mc_code')
    if not mc_code:
        return {"error": "mc_code is required"}, 400
    catalog = EquipmentCatalog.query.get(mc_code)
    if not catalog:
        return {"error": f"MC code {mc_code} not found in catalog"}, 400
    eq = Equipment(
        site_id=site_id,
        mc_code=mc_code,
        equipment_identifier=data.get('equipment_identifier'),
        department_id=data.get('department_id'),
        annual_miles=data.get('annual_miles'),
        downtime_hours=data.get('downtime_hours')
    )
    db.session.add(eq)
    db.session.commit()
    return eq.to_dict(), 201


@site_bp.route("/equipment/<int:equipment_id>", methods=["GET"])
def get_equipment(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    return eq.to_dict(), 200


@site_bp.route("/equipment/<int:equipment_id>", methods=["PUT"])
def update_equipment(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    data = request.get_json() or {}
    if 'equipment_identifier' in data:
        eq.equipment_identifier = data['equipment_identifier']
    if 'department_id' in data:
        eq.department_id = data['department_id']
    if 'annual_miles' in data:
        try:
            eq.annual_miles = float(data['annual_miles']) if data['annual_miles'] is not None else None
        except (TypeError, ValueError):
            pass
    if 'downtime_hours' in data:
        try:
            eq.downtime_hours = float(data['downtime_hours']) if data['downtime_hours'] is not None else None
        except (TypeError, ValueError):
            pass
    if 'mc_code' in data and data['mc_code'] != eq.mc_code:
        new_code = data['mc_code']
        catalog = EquipmentCatalog.query.get(new_code)
        if not catalog:
            return {"error": f"MC code {new_code} not found"}, 400
        eq.mc_code = new_code
    db.session.commit()
    return eq.to_dict(), 200


@site_bp.route("/equipment/<int:equipment_id>", methods=["DELETE"])
def delete_equipment(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    db.session.delete(eq)
    db.session.commit()
    return {"message": f"Equipment {equipment_id} deleted"}, 200


@site_bp.route("/equipment/<int:equipment_id>/usage", methods=["GET"])
def list_equipment_usage(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    entries = EquipmentUsage.query.filter_by(equipment_id=equipment_id).order_by(EquipmentUsage.year.desc()).all()
    return jsonify([e.to_dict() for e in entries]), 200


@site_bp.route("/equipment/<int:equipment_id>/usage", methods=["POST"])
def upsert_equipment_usage(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    data = request.get_json() or {}
    year = data.get('year')
    miles = data.get('miles')
    if not isinstance(year, int):
        return {"error": "Valid integer year required"}, 400
    usage = EquipmentUsage.query.filter_by(equipment_id=equipment_id, year=year).first()
    if usage:
        usage.miles = miles
    else:
        usage = EquipmentUsage(equipment_id=equipment_id, year=year, miles=miles)
        db.session.add(usage)
    db.session.commit()
    return usage.to_dict(), 200


@site_bp.route("/<int:site_id>/equipment/energy", methods=["GET"])
def site_equipment_energy(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    year_param = request.args.get('year')
    try:
        target_year = int(year_param) if year_param else (datetime.utcnow().year - 1)
    except ValueError:
        target_year = datetime.utcnow().year - 1
    equipment_rows = Equipment.query.filter_by(site_id=site_id).all()
    total_miles = 0.0
    total_energy = 0.0
    items = []
    for eq in equipment_rows:
        usage = EquipmentUsage.query.filter_by(equipment_id=eq.id, year=target_year).first()
        usage_miles = usage.miles if usage else None
        miles = usage_miles if usage_miles is not None else 0.0
        source = 'usage'
        if eq.annual_miles is not None:
            miles = eq.annual_miles
            source = 'annual'
        energy_per_mile = eq.catalog.energy_per_mile if eq.catalog else None
        energy_kwh = miles * energy_per_mile if (energy_per_mile is not None) else None
        operating_hours = 8760.0
        if eq.downtime_hours and eq.downtime_hours > 0:
            operating_hours = max(operating_hours - eq.downtime_hours, 1.0)
        average_power_kw = (energy_kwh / operating_hours) if energy_kwh is not None else None
        total_miles += miles
        if energy_kwh:
            total_energy += energy_kwh
        items.append({
            'equipment_id': eq.id,
            'equipment_identifier': eq.equipment_identifier,
            'mc_code': eq.mc_code,
            'department_id': eq.department_id,
            'miles': miles,
            'miles_source': source,
            'energy_per_mile': energy_per_mile,
            'energy_kwh': energy_kwh,
            'avg_power_kw': average_power_kw,
            'downtime_hours': eq.downtime_hours
        })
    return {
        'site_id': site_id,
        'year': target_year,
        'total_miles': round(total_miles, 3),
        'total_energy_kwh': round(total_energy, 3),
        'items': items
    }, 200


# ---------------------- Charger Endpoints ----------------------
@site_bp.route("/<int:site_id>/chargers", methods=["GET"])
def list_chargers(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    chargers = Charger.query.filter_by(site_id=site_id).order_by(Charger.id.desc()).all()
    rows = []
    for c in chargers:
        data = c.to_dict()
        try:
            data['project_name'] = c.project.name if getattr(c, 'project', None) else None
        except Exception:
            data['project_name'] = None
        rows.append(data)
    return jsonify(rows), 200


@site_bp.route("/<int:site_id>/chargers", methods=["POST"])
def create_charger(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    data = request.get_json() or {}
    charger = Charger(
        site_id=site_id,
        project_id=data.get('project_id'),
        kw=data.get('kw'),
        breaker_size=data.get('breaker_size'),
        input_voltage=data.get('input_voltage'),
        output_voltage=data.get('output_voltage'),
        port_count=data.get('port_count'),
        handle_type=data.get('handle_type'),
        manufacturer=data.get('manufacturer'),
        model_number=data.get('model_number'),
        serial_number=data.get('serial_number'),
        date_installed=data.get('date_installed')
    )
    # Normalize project_id empty string to None
    if isinstance(charger.project_id, str) and charger.project_id.strip() == "":
        charger.project_id = None
    # Cast date_installed if provided as ISO string; treat empty string as None
    if isinstance(charger.date_installed, str):
        if charger.date_installed.strip() == "":
            charger.date_installed = None
        else:
            try:
                charger.date_installed = datetime.fromisoformat(charger.date_installed).date()
            except Exception:
                charger.date_installed = None
    db.session.add(charger)
    db.session.commit()
    return charger.to_dict(), 201


@site_bp.route("/chargers/<int:charger_id>", methods=["GET"])
def get_charger(charger_id):
    c = Charger.query.get(charger_id)
    if not c:
        return {"error": "Charger not found"}, 404
    data = c.to_dict()
    try:
        data['project_name'] = c.project.name if getattr(c, 'project', None) else None
    except Exception:
        data['project_name'] = None
    return data, 200


@site_bp.route("/chargers/<int:charger_id>", methods=["PUT"])
def update_charger(charger_id):
    c = Charger.query.get(charger_id)
    if not c:
        return {"error": "Charger not found"}, 404
    data = request.get_json() or {}
    scalar_fields = [
        'project_id','kw','breaker_size','input_voltage','output_voltage',
        'port_count','handle_type','manufacturer','model_number','serial_number','date_installed'
    ]
    for f in scalar_fields:
        if f in data:
            val = data[f]
            if f == 'project_id' and isinstance(val, str) and val.strip() == "":
                val = None
            if f == 'date_installed' and isinstance(val, str):
                if val.strip() == "":
                    val = None
                else:
                    try:
                        val = datetime.fromisoformat(val).date()
                    except Exception:
                        val = None
            setattr(c, f, val)
    db.session.commit()
    return c.to_dict(), 200


@site_bp.route("/chargers/<int:charger_id>", methods=["DELETE"])
def delete_charger(charger_id):
    c = Charger.query.get(charger_id)
    if not c:
        return {"error": "Charger not found"}, 404
    db.session.delete(c)
    db.session.commit()
    return {"message": f"Charger {charger_id} deleted"}, 200


# ---------------------- Utility Bill Endpoints ----------------------
@site_bp.route("/<int:site_id>/bills", methods=["GET"])
def list_bills(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    bills = UtilityBill.query.filter_by(site_id=site_id, is_deleted=False).order_by(UtilityBill.year.desc(), UtilityBill.month.desc()).all()
    return jsonify([b.to_dict() for b in bills])


@site_bp.route("/<int:site_id>/bills", methods=["POST"])
def create_bill(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404

    data = request.get_json() or {}
    year = data.get("year")
    month = data.get("month")
    if not isinstance(year, int) or not isinstance(month, int) or month < 1 or month > 12:
        return {"error": "Invalid year/month"}, 400

    # Upsert by (site_id, year, month). If a deleted bill exists, restore it.
    existing = UtilityBill.query.filter_by(site_id=site_id, year=year, month=month).first()
    try:
        if existing:
            existing.energy_usage = data.get("energy_usage")
            existing.max_power = data.get("max_power")
            existing.is_deleted = False
            existing.updated_at = datetime.utcnow()
            db.session.commit()
            return existing.to_dict(), 200
        else:
            bill = UtilityBill(
                site_id=site_id,
                year=year,
                month=month,
                energy_usage=data.get("energy_usage"),
                max_power=data.get("max_power"),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.session.add(bill)
            db.session.commit()
            return bill.to_dict(), 201
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to save bill: {e}"}, 400


@site_bp.route("/bills/<int:bill_id>", methods=["GET"])
def get_bill(bill_id):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404
    return bill.to_dict()


@site_bp.route("/bills/<int:bill_id>", methods=["PUT"])
def update_bill(bill_id):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404
    data = request.get_json() or {}
    for field in ["year", "month", "energy_usage", "max_power"]:
        if field in data:
            setattr(bill, field, data[field])
    bill.updated_at = datetime.utcnow()
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to update bill: {e}"}, 400
    return bill.to_dict()


@site_bp.route("/bills/<int:bill_id>", methods=["DELETE"])
def delete_bill(bill_id):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404
    bill.is_deleted = True
    db.session.commit()
    return {"message": f"Bill {bill_id} deleted."}, 200


# ---------------------- GeoJSON Import ----------------------
@site_bp.route("/upload-geojson", methods=["POST"])
def upload_geojson_sites():
    """Upload a GeoJSON file and upsert Site records.
    - Expects multipart/form-data with field 'file'.
    - Accepts FeatureCollection of Point features.
    - Upserts by exact name match (case-sensitive) when provided; otherwise inserts.
    - Maps common property keys to Site fields (best-effort).
    Returns counts and simple diagnostics.
    """
    if 'file' not in request.files:
        return {"error": "No file part"}, 400
    file = request.files['file']
    if not file.filename:
        return {"error": "Empty filename"}, 400
    try:
        raw = file.stream.read().decode('utf-8', errors='ignore')
        data = json.loads(raw)
    except Exception as e:
        return {"error": f"Failed to read/parse GeoJSON: {e}"}, 400

    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection':
        return {"error": "GeoJSON must be a FeatureCollection"}, 400
    features = data.get('features') or []
    if not isinstance(features, list) or not features:
        return {"error": "No features found in GeoJSON"}, 400

    def first_prop(props, keys):
        if not isinstance(props, dict):
            return None
        for k in keys:
            for candidate in (k, k.lower(), k.upper()):
                if candidate in props and props.get(candidate) not in (None, ''):
                    return props.get(candidate)
        # Case-insensitive search
        lower = {str(k).lower(): v for k, v in props.items()}
        for k in keys:
            v = lower.get(str(k).lower())
            if v not in (None, ''):
                return v
        return None

    added = 0
    updated = 0
    skipped = 0
    errors = []

    # Cache existing sites by name for quick lookup
    existing_by_name = {s.name: s for s in Site.query.filter_by(is_deleted=False).all() if s.name}

    for idx, feat in enumerate(features):
        try:
            geom = feat.get('geometry') if isinstance(feat, dict) else None
            if not geom or geom.get('type') != 'Point':
                skipped += 1
                continue
            coords = geom.get('coordinates')
            if not isinstance(coords, (list, tuple)) or len(coords) < 2:
                skipped += 1
                continue
            lon, lat = coords[0], coords[1]
            try:
                lon = float(lon); lat = float(lat)
            except (TypeError, ValueError):
                skipped += 1
                continue
            props = feat.get('properties') or {}

            name = first_prop(props, ['name', 'site', 'site_name', 'Site Name', 'LOCATION'])
            address = first_prop(props, ['address', 'street', 'address1'])
            city = first_prop(props, ['city', 'municipality', 'town'])
            utility = first_prop(props, ['utility', 'utility_name', 'Utility'])
            meter_number = first_prop(props, ['meter', 'meter_number', 'MeterNumber'])
            contact_name = first_prop(props, ['contact', 'contact_name'])
            contact_phone = first_prop(props, ['phone', 'contact_phone'])

            if name and name in existing_by_name:
                site = existing_by_name[name]
                site.latitude = lat
                site.longitude = lon
                if address is not None:
                    site.address = address
                if city is not None:
                    site.city = city
                if utility is not None:
                    site.utility = utility
                if meter_number is not None:
                    site.meter_number = meter_number
                if contact_name is not None:
                    site.contact_name = contact_name
                if contact_phone is not None:
                    site.contact_phone = contact_phone
                updated += 1
            else:
                site = Site(
                    name=name or f"Imported Site {idx+1}",
                    latitude=lat,
                    longitude=lon,
                    address=address,
                    city=city,
                    utility=utility,
                    meter_number=meter_number,
                    contact_name=contact_name,
                    contact_phone=contact_phone
                )
                db.session.add(site)
                added += 1
                if name:
                    existing_by_name[name] = site
        except Exception as e:
            errors.append({"feature_index": idx, "error": str(e)})
            skipped += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to save sites: {e}"}, 500

    return {
        "message": "GeoJSON processed",
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:10]  # cap error list
    }, 200


@site_bp.route("/refresh-geojson", methods=["POST"])
def refresh_geojson_sites():
    """Refresh sites from a server-side GeoJSON file in the workspace.
    Reads `PGE EV Fleet Program.geojson` from the project root.
    Mirrors the logic of the upload endpoint.
    """
    geojson_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "PGE EV Fleet Program.geojson"))
    if not os.path.exists(geojson_path):
        return {"error": f"GeoJSON not found at {geojson_path}"}, 404
    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return {"error": f"Failed to read GeoJSON: {e}"}, 400

    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection':
        return {"error": "GeoJSON must be a FeatureCollection"}, 400
    features = data.get('features') or []
    if not isinstance(features, list) or not features:
        return {"error": "No features found in GeoJSON"}, 400

    def first_prop(props, keys):
        if not isinstance(props, dict):
            return None
        for k in keys:
            for candidate in (k, k.lower(), k.upper()):
                if candidate in props and props.get(candidate) not in (None, ''):
                    return props.get(candidate)
        lower = {str(k).lower(): v for k, v in props.items()}
        for k in keys:
            v = lower.get(str(k).lower())
            if v not in (None, ''):
                return v
        return None

    added = 0
    updated = 0
    skipped = 0
    errors = []

    existing_by_name = {s.name: s for s in Site.query.filter_by(is_deleted=False).all() if s.name}

    for idx, feat in enumerate(features):
        try:
            geom = feat.get('geometry') if isinstance(feat, dict) else None
            if not geom or geom.get('type') != 'Point':
                skipped += 1
                continue
            coords = geom.get('coordinates')
            if not isinstance(coords, (list, tuple)) or len(coords) < 2:
                skipped += 1
                continue
            lon, lat = coords[0], coords[1]
            try:
                lon = float(lon); lat = float(lat)
            except (TypeError, ValueError):
                skipped += 1
                continue
            props = feat.get('properties') or {}

            name = first_prop(props, ['name', 'site', 'site_name', 'Site Name', 'LOCATION'])
            address = first_prop(props, ['address', 'street', 'address1'])
            city = first_prop(props, ['city', 'municipality', 'town'])
            utility = first_prop(props, ['utility', 'utility_name', 'Utility'])
            meter_number = first_prop(props, ['meter', 'meter_number', 'MeterNumber'])
            contact_name = first_prop(props, ['contact', 'contact_name'])
            contact_phone = first_prop(props, ['phone', 'contact_phone'])

            if name and name in existing_by_name:
                site = existing_by_name[name]
                site.latitude = lat
                site.longitude = lon
                if address is not None:
                    site.address = address
                if city is not None:
                    site.city = city
                if utility is not None:
                    site.utility = utility
                if meter_number is not None:
                    site.meter_number = meter_number
                if contact_name is not None:
                    site.contact_name = contact_name
                if contact_phone is not None:
                    site.contact_phone = contact_phone
                updated += 1
            else:
                site = Site(
                    name=name or f"Imported Site {idx+1}",
                    latitude=lat,
                    longitude=lon,
                    address=address,
                    city=city,
                    utility=utility,
                    meter_number=meter_number,
                    contact_name=contact_name,
                    contact_phone=contact_phone
                )
                db.session.add(site)
                added += 1
                if name:
                    existing_by_name[name] = site
        except Exception as e:
            errors.append({"feature_index": idx, "error": str(e)})
            skipped += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to save sites: {e}"}, 500

    return {
        "message": "GeoJSON refreshed",
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:10]
    }, 200
