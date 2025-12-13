from flask import jsonify, request
from datetime import datetime, timedelta
import math
from .site_routes import site_bp
from ..models import Site, UtilityBill, Charger, Equipment
from ..extensions import db
from ..models import project_sites


@site_bp.route("/", methods=["GET"])
def get_sites():
    sites = Site.query.filter_by(is_deleted=False).all()
    site_ids = [s.id for s in sites]
    chargers = Charger.query.filter(Charger.site_id.in_(site_ids)).all()
    totals = {}
    for c in chargers:
        kw = c.kw if c.kw is not None else 0.0
        totals[c.site_id] = (totals.get(c.site_id, 0.0) + (kw or 0.0))
    # Vehicle counts by site
    vehicle_counts = {}
    try:
        from sqlalchemy import func
        vc_rows = db.session.query(Equipment.site_id, func.count(Equipment.id)).group_by(Equipment.site_id).all()
        vehicle_counts = {int(site_id): int(cnt) for site_id, cnt in vc_rows if site_id is not None}
    except Exception:
        pass

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


@site_bp.route("/<int:site_id>", methods=["PUT"])
def update_site(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    data = request.get_json(silent=True) or {}
    allowed = {
        "name", "address", "city", "latitude", "longitude",
        "department_id", "utility", "meter_number", "contact_name", "contact_phone",
        "voltage", "phase_count", "main_breaker_amps", "power_factor"
    }
    for key in allowed:
        if key in data:
            setattr(site, key, data[key])
    try:
        # Commit via SQLAlchemy session on the model
        from ..extensions import db
        db.session.commit()
    except Exception as e:
        from ..extensions import db
        db.session.rollback()
        return {"error": f"Failed to update site: {e}"}, 500
    return site.to_dict(), 200


@site_bp.route("/", methods=["POST"])
def create_site():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        # Allow creating with address+city fallback name
        address = (data.get('address') or '').strip()
        city = (data.get('city') or '').strip()
        if address and city:
            name = f"{address}, {city}"
        else:
            return {"error": "name is required"}, 400

    site = Site(
        name=name,
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        address=data.get('address'),
        city=data.get('city'),
        utility=data.get('utility'),
        meter_number=data.get('meter_number'),
        contact_name=data.get('contact_name'),
        contact_phone=data.get('contact_phone'),
        department_id=data.get('department_id'),
        voltage=data.get('voltage'),
        phase_count=data.get('phase_count'),
        main_breaker_amps=data.get('main_breaker_amps'),
        power_factor=data.get('power_factor'),
    )
    db.session.add(site)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to create site: {e}"}, 500
    return site.to_dict(), 201


@site_bp.route("/<int:site_id>", methods=["DELETE"])
def delete_site(site_id):
    site = Site.query.get(site_id)
    if not site:
        return {"error": "Site not found"}, 404
    # Soft delete to preserve historical links
    site.is_deleted = True
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to delete site: {e}"}, 500
    return {"message": "site deleted", "site_id": site_id}, 200


@site_bp.route("/metrics/aggregate", methods=["GET"])
def aggregate_site_metrics():
        # Vehicle counts by site
    vehicle_counts = {}
    try:
        from sqlalchemy import func
        vc_rows = db.session.query(Equipment.site_id, func.count(Equipment.id)).group_by(Equipment.site_id).all()
        vehicle_counts = {int(site_id): int(cnt) for site_id, cnt in vc_rows if site_id is not None}
    except Exception:
        pass
    order = request.args.get('order', 'desc').lower()
    sort_field = request.args.get('sort', 'available_capacity_kw')
    search = request.args.get('search', '').strip()
    project_id_param = request.args.get('project_id')
    limit_param = request.args.get('limit', None)
    page_param = request.args.get('page', None)
    per_page_param = request.args.get('per_page', None)
    offset_param = request.args.get('offset', None)

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
    # Optional filter: restrict to sites in a specific project
    try:
        project_id = int(project_id_param) if project_id_param is not None else None
    except (TypeError, ValueError):
        project_id = None
    if project_id:
        site_query = site_query.join(project_sites, Site.id == project_sites.c.site_id)\
                               .filter(project_sites.c.project_id == project_id)
    if search:
        like = f"%{search}%"
        site_query = site_query.filter(Site.name.ilike(like))
    # Compute filtered total before pagination
    filtered_total = site_query.count()
    sites = site_query.all()
    site_ids = [s.id for s in sites]
    bills = UtilityBill.query.filter(UtilityBill.site_id.in_(site_ids), UtilityBill.is_deleted.is_(False)).all()
    chargers = Charger.query.filter(Charger.site_id.in_(site_ids)).all()
    charger_totals = {}
    charger_installed_totals = {}
    for c in chargers:
        kw = c.kw if c.kw is not None else 0.0
        sid = c.site_id
        charger_totals[sid] = charger_totals.get(sid, 0.0) + (kw or 0.0)
        if c.date_installed is not None:
            charger_installed_totals[sid] = charger_installed_totals.get(sid, 0.0) + (kw or 0.0)

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
            "installed_charger_kw": round(charger_installed_totals.get(s.id, 0.0), 3),
            "vehicle_count": vehicle_counts.get(s.id, 0)
        })

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
        elif sort_field == 'vehicle_count':
            val = row.get('vehicle_count')
        if val is None:
            return -1 if order != 'asc' else float('inf')
        return val

    rows.sort(key=sort_key, reverse=(order != 'asc'))
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
        "total": filtered_total,
        "returned": len(rows),
        "order": order,
        "sort": sort_field,
        "page": page,
        "per_page": per_page if page else None,
        "offset": offset,
        "limit": limit,
        "search": search,
        "project_id": project_id
    }
    return jsonify({"data": rows, "meta": meta}), 200
