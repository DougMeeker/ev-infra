from datetime import datetime
from flask import request
from sqlalchemy import func
from ..extensions import db
from ..models import Equipment, EquipmentUsage
from .site_routes import site_bp
from ..services.equipment_service import (
    list_equipment as svc_list_equipment,
    create_equipment as svc_create_equipment,
    get_equipment as svc_get_equipment,
    update_equipment as svc_update_equipment,
    delete_equipment as svc_delete_equipment,
    list_equipment_usage as svc_list_equipment_usage,
    upsert_equipment_usage as svc_upsert_equipment_usage,
    site_equipment_energy as svc_site_equipment_energy,
)


@site_bp.route("/<int:site_id>/equipment", methods=["GET"])
def list_equipment(site_id):
    year = request.args.get('year')
    try:
        if year:
            target_year = int(year)
        else:
            # Use latest available usage year for this site's equipment
            latest_year = db.session.query(func.max(EquipmentUsage.year))\
                .join(Equipment, Equipment.id == EquipmentUsage.equipment_id)\
                .filter(Equipment.site_id == site_id)\
                .scalar()
            target_year = int(latest_year) if latest_year is not None else (datetime.utcnow().year - 1)
    except ValueError:
        target_year = datetime.utcnow().year - 1
    # Optional pagination
    def to_int(val, default=None):
        try:
            return int(val)
        except (TypeError, ValueError):
            return default
    page = to_int(request.args.get('page'), 1)
    per_page = to_int(request.args.get('per_page'), 25)
    if page is None or page <= 0:
        page = 1
    if per_page is None or per_page <= 0:
        per_page = 25
    return svc_list_equipment(site_id, target_year, page=page, per_page=per_page)


@site_bp.route("/<int:site_id>/equipment", methods=["POST"])
def create_equipment(site_id):
    data = request.get_json() or {}
    result = svc_create_equipment(site_id, data)
    if isinstance(result, tuple) and result[1] == 201:
        try:
            from ..services.mcp_sync_service import sync_site
            sync_site(site_id)
        except Exception:
            pass
    return result


@site_bp.route("/equipment/<int:equipment_id>", methods=["GET"])
def get_equipment(equipment_id):
    return svc_get_equipment(equipment_id)


@site_bp.route("/equipment/<int:equipment_id>", methods=["PUT"])
def update_equipment(equipment_id):
    data = request.get_json() or {}
    return svc_update_equipment(equipment_id, data)


@site_bp.route("/equipment/<int:equipment_id>", methods=["DELETE"])
def delete_equipment(equipment_id):
    return svc_delete_equipment(equipment_id)


@site_bp.route("/equipment/<int:equipment_id>/usage", methods=["GET"])
def list_equipment_usage(equipment_id):
    return svc_list_equipment_usage(equipment_id)


@site_bp.route("/equipment/<int:equipment_id>/usage", methods=["POST"])
def upsert_equipment_usage(equipment_id):
    data = request.get_json() or {}
    return svc_upsert_equipment_usage(equipment_id, data)


@site_bp.route("/<int:site_id>/equipment/energy", methods=["GET"])
def site_equipment_energy(site_id):
    year_param = request.args.get('year')
    try:
        if year_param:
            target_year = int(year_param)
        else:
            latest_year = db.session.query(func.max(EquipmentUsage.year))\
                .join(Equipment, Equipment.id == EquipmentUsage.equipment_id)\
                .filter(Equipment.site_id == site_id)\
                .scalar()
            target_year = int(latest_year) if latest_year is not None else (datetime.utcnow().year - 1)
    except ValueError:
        target_year = datetime.utcnow().year - 1
    return svc_site_equipment_energy(site_id, target_year)
