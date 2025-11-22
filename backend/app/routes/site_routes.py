from flask import Blueprint, jsonify, request
from ..models import Site, UtilityBill
from ..extensions import db
from datetime import datetime, timedelta
import math

site_bp = Blueprint("sites", __name__)

@site_bp.route("/", methods=["GET"])
def get_sites():
    sites = Site.query.filter_by(is_deleted=False).all()
    return jsonify([site.to_dict() for site in sites])

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

    data = request.get_json()
    for key, value in data.items():
        if hasattr(site, key):
            setattr(site, key, value)

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
            "power_factor": pf
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
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to create bill: {e}"}, 400
    return bill.to_dict(), 201


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
