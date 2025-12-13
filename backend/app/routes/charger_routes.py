from flask import request
from .site_routes import site_bp
from ..services.chargers_service import (
    list_chargers as svc_list_chargers,
    create_charger as svc_create_charger,
    get_charger as svc_get_charger,
    update_charger as svc_update_charger,
    delete_charger as svc_delete_charger,
)


@site_bp.route("/<int:site_id>/chargers", methods=["GET"])
def list_chargers(site_id):
    return svc_list_chargers(site_id)


@site_bp.route("/<int:site_id>/chargers", methods=["POST"])
def create_charger(site_id):
    data = request.get_json() or {}
    return svc_create_charger(site_id, data)


@site_bp.route("/chargers/<int:charger_id>", methods=["GET"])
def get_charger(charger_id):
    return svc_get_charger(charger_id)


@site_bp.route("/chargers/<int:charger_id>", methods=["PUT"])
def update_charger(charger_id):
    data = request.get_json() or {}
    return svc_update_charger(charger_id, data)


@site_bp.route("/chargers/<int:charger_id>", methods=["DELETE"])
def delete_charger(charger_id):
    return svc_delete_charger(charger_id)
