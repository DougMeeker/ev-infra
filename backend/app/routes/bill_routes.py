from flask import request
from .site_routes import site_bp
from ..services.bills_service import (
    list_bills as svc_list_bills,
    create_bill as svc_create_bill,
    get_bill as svc_get_bill,
    update_bill as svc_update_bill,
    delete_bill as svc_delete_bill,
)


@site_bp.route("/<int:site_id>/bills", methods=["GET"])
def list_bills(site_id):
    return svc_list_bills(site_id)


@site_bp.route("/<int:site_id>/bills", methods=["POST"])
def create_bill(site_id):
    data = request.get_json() or {}
    return svc_create_bill(site_id, data)


@site_bp.route("/bills/<int:bill_id>", methods=["GET"])
def get_bill(bill_id):
    return svc_get_bill(bill_id)


@site_bp.route("/bills/<int:bill_id>", methods=["PUT"])
def update_bill(bill_id):
    data = request.get_json() or {}
    return svc_update_bill(bill_id, data)


@site_bp.route("/bills/<int:bill_id>", methods=["DELETE"])
def delete_bill(bill_id):
    return svc_delete_bill(bill_id)
