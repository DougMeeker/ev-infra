"""API routes for managing services (meters)."""
from flask import Blueprint, request, jsonify
from app.services import services_service

bp = Blueprint('services', __name__, url_prefix='/api/services')


@bp.route('/site/<int:site_id>', methods=['GET'])
def list_services_for_site(site_id):
    """Get all services for a specific site."""
    services = services_service.get_services_by_site(site_id)
    return jsonify([service.to_dict() for service in services]), 200


@bp.route('/<int:service_id>', methods=['GET'])
def get_service(service_id):
    """Get a specific service by ID."""
    service = services_service.get_service_by_id(service_id)
    if not service:
        return jsonify({'error': 'Service not found'}), 404
    return jsonify(service.to_dict()), 200


@bp.route('/site/<int:site_id>', methods=['POST'])
def create_service(site_id):
    """Create a new service for a site."""
    data = request.get_json()
    try:
        service = services_service.create_service(site_id, data)
        return jsonify(service.to_dict()), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@bp.route('/<int:service_id>', methods=['PUT'])
def update_service(service_id):
    """Update an existing service."""
    data = request.get_json()
    service = services_service.update_service(service_id, data)
    if not service:
        return jsonify({'error': 'Service not found'}), 404
    return jsonify(service.to_dict()), 200


@bp.route('/<int:service_id>', methods=['DELETE'])
def delete_service(service_id):
    """Soft delete a service."""
    success = services_service.delete_service(service_id)
    if not success:
        return jsonify({'error': 'Service not found'}), 404
    return jsonify({'message': 'Service deleted successfully'}), 200


@bp.route('/<int:service_id>/capacity', methods=['GET'])
def get_service_capacity(service_id):
    """Calculate and return the theoretical capacity for a service."""
    service = services_service.get_service_by_id(service_id)
    if not service:
        return jsonify({'error': 'Service not found'}), 404
    
    capacity_kw = services_service.calculate_service_capacity(service)
    return jsonify({
        'service_id': service_id,
        'capacity_kw': capacity_kw,
        'voltage': service.voltage,
        'main_breaker_amps': service.main_breaker_amps,
        'phase_count': service.phase_count,
        'power_factor': service.power_factor
    }), 200
