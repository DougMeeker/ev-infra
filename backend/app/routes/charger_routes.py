from flask import current_app, request
from .site_routes import site_bp
from ..services.chargers_service import (
    list_all_chargers as svc_list_all_chargers,
    list_chargers as svc_list_chargers,
    create_charger as svc_create_charger,
    get_charger as svc_get_charger,
    update_charger as svc_update_charger,
    delete_charger as svc_delete_charger,
)
from ..models import Charger


def _mcp_sync_site(site_id):
    """Fire-and-forget MCP sync for the given site."""
    try:
        from ..services.mcp_sync_service import sync_site
        sync_site(site_id)
    except Exception:
        pass


@site_bp.route("/chargers", methods=["GET"])
def list_all_chargers():
    return svc_list_all_chargers()


@site_bp.route("/<int:site_id>/chargers", methods=["GET"])
def list_chargers(site_id):
    return svc_list_chargers(site_id)


@site_bp.route("/<int:site_id>/chargers", methods=["POST"])
def create_charger(site_id):
    data = request.get_json() or {}
    result = svc_create_charger(site_id, data)
    if isinstance(result, tuple) and result[1] == 201:
        _mcp_sync_site(site_id)
    return result


@site_bp.route("/chargers/<int:charger_id>", methods=["GET"])
def get_charger(charger_id):
    return svc_get_charger(charger_id)


@site_bp.route("/chargers/<int:charger_id>", methods=["PUT"])
def update_charger(charger_id):
    charger = Charger.query.get(charger_id)
    site_id = charger.site_id if charger else None
    data = request.get_json() or {}
    result = svc_update_charger(charger_id, data)
    if isinstance(result, tuple) and result[1] == 200 and site_id:
        _mcp_sync_site(site_id)
    return result


@site_bp.route("/chargers/<int:charger_id>", methods=["DELETE"])
def delete_charger(charger_id):
    charger = Charger.query.get(charger_id)
    site_id = charger.site_id if charger else None
    result = svc_delete_charger(charger_id)
    if isinstance(result, tuple) and result[1] == 200 and site_id:
        _mcp_sync_site(site_id)
    return result
