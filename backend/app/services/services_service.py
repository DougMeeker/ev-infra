"""Service layer for managing services (meters) associated with sites."""
from app.models import Service, db
from sqlalchemy import and_


def get_services_by_site(site_id):
    """Retrieve all services for a given site."""
    return Service.query.filter(
        and_(Service.site_id == site_id, Service.is_deleted == False)
    ).all()


def get_service_by_id(service_id):
    """Retrieve a single service by ID."""
    return Service.query.filter(
        and_(Service.id == service_id, Service.is_deleted == False)
    ).first()


def create_service(site_id, data):
    """Create a new service for a site."""
    service = Service(
        site_id=site_id,
        utility=data.get('utility'),
        utility_account=data.get('utility_account'),
        utility_name=data.get('utility_name'),
        meter_number=data.get('meter_number'),
        main_breaker_amps=data.get('main_breaker_amps'),
        voltage=data.get('voltage'),
        phase_count=data.get('phase_count'),
        power_factor=data.get('power_factor', 0.95),
        notes=data.get('notes'),
        is_deleted=False
    )
    db.session.add(service)
    db.session.commit()
    return service


def update_service(service_id, data):
    """Update an existing service."""
    service = get_service_by_id(service_id)
    if not service:
        return None
    
    # Update fields if provided
    if 'utility' in data:
        service.utility = data['utility']
    if 'utility_account' in data:
        service.utility_account = data['utility_account']
    if 'utility_name' in data:
        service.utility_name = data['utility_name']
    if 'meter_number' in data:
        service.meter_number = data['meter_number']
    if 'main_breaker_amps' in data:
        service.main_breaker_amps = data['main_breaker_amps']
    if 'voltage' in data:
        service.voltage = data['voltage']
    if 'phase_count' in data:
        service.phase_count = data['phase_count']
    if 'power_factor' in data:
        service.power_factor = data['power_factor']
    if 'notes' in data:
        service.notes = data['notes']
    
    db.session.commit()
    return service


def delete_service(service_id):
    """Soft delete a service."""
    service = get_service_by_id(service_id)
    if not service:
        return False
    
    service.is_deleted = True
    db.session.commit()
    return True


def calculate_service_capacity(service):
    """
    Calculate theoretical capacity for a service in kW.
    Formula: (voltage * amps * phase_count * power_factor) / 1000
    """
    if not all([service.voltage, service.main_breaker_amps, service.phase_count, service.power_factor]):
        return None
    
    capacity_kw = (
        service.voltage * 
        service.main_breaker_amps * 
        service.phase_count * 
        service.power_factor
    ) / 1000.0
    
    return round(capacity_kw, 2)
