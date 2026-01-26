from flask import request
from .site_routes import site_bp
from ..services.bills_service import (
    list_bills_by_site,
    list_bills_by_service,
    create_bill as svc_create_bill,
    get_bill as svc_get_bill,
    update_bill as svc_update_bill,
    delete_bill as svc_delete_bill,
)


@site_bp.route("/<int:site_id>/bills", methods=["GET"])
def list_bills_for_site(site_id):
    """List all bills for all services at a site."""
    return list_bills_by_site(site_id)


@site_bp.route("/services/<int:service_id>/bills", methods=["GET"])
def list_bills_for_service(service_id):
    """List all bills for a specific service."""
    return list_bills_by_service(service_id)


@site_bp.route("/services/<int:service_id>/bills", methods=["POST"])
def create_bill(service_id):
    """Create a new bill for a service."""
    data = request.get_json() or {}
    return svc_create_bill(service_id, data)


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
