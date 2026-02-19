from flask import request, jsonify
from .site_routes import site_bp
from ..services.bills_service import (
    list_bills_by_site,
    list_bills_by_service,
    create_bill as svc_create_bill,
    get_bill as svc_get_bill,
    update_bill as svc_update_bill,
    delete_bill as svc_delete_bill,
    import_pge_bills as svc_import_pge_bills,
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


@site_bp.route("/bills/import/pge", methods=["POST"])
def import_pge_bills():
    """
    Import PG&E usage report and create bills.
    
    Expects multipart/form-data with a 'file' field containing the CSV.
    Extracts month from filename (e.g., Historical_20250501-20250531.csv).
    Matches Account ID (first column) to Service.utility_account.
    Sums Usage Value columns for total kWh.
    Calculates peak kW from max Usage Value / Interval Length.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.endswith('.csv'):
        return jsonify({"error": "File must be a CSV"}), 400
    
    # Read file content
    file_content = file.read()
    
    # Process the import
    result, status_code = svc_import_pge_bills(file_content, file.filename)
    
    return jsonify(result), status_code
