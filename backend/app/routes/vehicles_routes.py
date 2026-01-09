from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models import Equipment, Site, EquipmentCatalog

vehicles_bp = Blueprint('vehicles', __name__)


def _parse_int(val, default=None):
    try:
        return int(val)
    except Exception:
        return default


def _parse_float(val, default=None):
    try:
        return float(val)
    except Exception:
        return default


@vehicles_bp.route('/', methods=['GET'])
def list_vehicles():
    """List vehicles with filtering, sorting, and pagination.
    Query params: page, per_page, order, sort, search, site_id, department_id, mc_code
    """
    page = _parse_int(request.args.get('page', 1), 1)
    per_page = _parse_int(request.args.get('per_page', 25), 25)
    order = (request.args.get('order') or 'asc').lower()
    sort = (request.args.get('sort') or 'equipment_id')
    search = (request.args.get('search') or '').strip()
    site_id = request.args.get('site_id')
    department_id = request.args.get('department_id')
    mc_code = (request.args.get('mc_code') or '').strip()

    q = Equipment.query
    if site_id:
        q = q.filter(Equipment.site_id == _parse_int(site_id))
    if department_id:
        q = q.filter(Equipment.department_id == department_id)
    if mc_code:
        q = q.filter(Equipment.mc_code == mc_code)
    if search:
        # Allow searching by equipment_id (numeric) or string fields
        from sqlalchemy import or_, cast, String
        like = f"%{search}%"
        try:
            s_int = int(search)
        except Exception:
            s_int = None
        conds = [
            cast(Equipment.equipment_id, String).ilike(like),
            Equipment.mc_code.ilike(like),
            Equipment.department_id.ilike(like)
        ]
        if s_int is not None:
            conds.append(Equipment.equipment_id == s_int)
        q = q.filter(or_(*conds))

    # Sorting
    sort_attr = getattr(Equipment, sort, Equipment.equipment_id)
    if order == 'desc':
        q = q.order_by(sort_attr.desc())
    else:
        q = q.order_by(sort_attr.asc())

    pagination = q.paginate(page=page, per_page=per_page, error_out=False)
    items = []
    for e in pagination.items:
        d = e.to_dict()
        # Include lightweight site and catalog info
        site = Site.query.get(e.site_id)
        if site:
            d['site'] = {'id': site.id, 'name': site.name}
        cat = EquipmentCatalog.query.get(e.mc_code)
        if cat:
            d['catalog'] = cat.to_dict()
        items.append(d)

    return jsonify({
        'items': items,
        'page': pagination.page,
        'per_page': pagination.per_page,
        'total': pagination.total,
        'pages': pagination.pages,
    }), 200


@vehicles_bp.route('/counts-by-site', methods=['GET'])
def counts_by_site():
    """Return vehicle counts grouped by site_id."""
    # Simple aggregation using SQLAlchemy
    from sqlalchemy import func
    rows = db.session.query(Equipment.site_id, func.count(Equipment.id)).group_by(Equipment.site_id).all()
    data = {int(site_id): int(cnt) for site_id, cnt in rows if site_id is not None}
    return jsonify({'counts': data, 'total_sites': len(data)}), 200


@vehicles_bp.route('/', methods=['POST'])
def create_vehicle():
    data = request.get_json() or {}
    site_id = _parse_int(data.get('site_id'))
    mc_code = (data.get('mc_code') or '').strip()
    if not site_id or not mc_code:
        return {'error': 'site_id and mc_code are required'}, 400
    if not Site.query.get(site_id):
        return {'error': 'site_id not found'}, 404
    if not EquipmentCatalog.query.get(mc_code):
        return {'error': 'mc_code not found in catalog'}, 404
    # external equipment_id (optional numeric)
    ext_id = data.get('equipment_id')
    try:
        ext_id = int(ext_id) if ext_id is not None and str(ext_id).strip() != '' else None
    except Exception:
        ext_id = None
    e = Equipment(
        site_id=site_id,
        mc_code=mc_code,
        equipment_id=ext_id,
        department_id=(data.get('department_id') or '').strip() or None,
        annual_miles=_parse_float(data.get('annual_miles')),
        driving_hours=_parse_float(data.get('driving_hours')),
    )
    db.session.add(e)
    db.session.commit()
    return e.to_dict(), 201


@vehicles_bp.route('/<int:vehicle_id>', methods=['PUT'])
def update_vehicle(vehicle_id):
    e = Equipment.query.get(vehicle_id)
    if not e:
        return {'error': 'vehicle not found'}, 404
    data = request.get_json() or {}
    if 'site_id' in data:
        sid = _parse_int(data.get('site_id'))
        if sid and Site.query.get(sid):
            e.site_id = sid
        else:
            return {'error': 'invalid site_id'}, 400
    if 'mc_code' in data:
        mc = (data.get('mc_code') or '').strip()
        if mc and EquipmentCatalog.query.get(mc):
            e.mc_code = mc
        else:
            return {'error': 'invalid mc_code'}, 400
    if 'equipment_id' in data:
        try:
            val = data.get('equipment_id')
            e.equipment_id = int(val) if val is not None and str(val).strip() != '' else None
        except Exception:
            pass
    if 'department_id' in data:
        e.department_id = (data.get('department_id') or '').strip() or None
    if 'annual_miles' in data:
        e.annual_miles = _parse_float(data.get('annual_miles'))
    if 'driving_hours' in data:
        e.driving_hours = _parse_float(data.get('driving_hours'))
    db.session.commit()
    return e.to_dict(), 200


@vehicles_bp.route('/<int:vehicle_id>', methods=['DELETE'])
def delete_vehicle(vehicle_id):
    e = Equipment.query.get(vehicle_id)
    if not e:
        return {'error': 'vehicle not found'}, 404
    db.session.delete(e)
    db.session.commit()
    return {'message': 'vehicle deleted'}, 200
