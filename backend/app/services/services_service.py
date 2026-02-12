"""Service layer for managing services (meters) associated with sites."""
from app.models import Service, UtilityBill, Site, db
from sqlalchemy import and_, func
from datetime import datetime, timedelta


def get_all_services(include_site_info=True):
    """Retrieve all active services, optionally with site information."""
    services = Service.query.filter(Service.is_deleted == False).all()
    result = []
    for service in services:
        service_dict = service.to_dict()
        if include_site_info and service.site:
            service_dict['site_name'] = service.site.name
            service_dict['site_address'] = service.site.address
            service_dict['site_city'] = service.site.city
        result.append(service_dict)
    return result


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
    Calculate service capacity for a service in kW.
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


def get_12_month_max_demand(service_id):
    """
    Get the maximum demand (max_power in kW) over the last 12 months for a service.
    Returns None if no billing data is available.
    """
    # Calculate date range for last 12 months
    now = datetime.utcnow()
    twelve_months_ago = now - timedelta(days=365)
    
    # Query for max demand
    result = db.session.query(func.max(UtilityBill.max_power)).filter(
        and_(
            UtilityBill.service_id == service_id,
            UtilityBill.is_deleted == False,
            # Filter by year/month being within the last 12 months
            (UtilityBill.year * 100 + UtilityBill.month) >= 
            (twelve_months_ago.year * 100 + twelve_months_ago.month)
        )
    ).scalar()
    
    return result


def get_meter_data_date_range(service_id):
    """
    Get the date range of meter data from utility bills.
    Returns a tuple of (meter_data_from, meter_data_to) in "MM-YYYY" format.
    - meter_data_to: Most recent bill
    - meter_data_from: Oldest bill, but not longer than 1 year back from most recent
    Returns ("", "") if no bills are available.
    """
    # Get all bills for this service, ordered by date
    bills = db.session.query(
        UtilityBill.year, 
        UtilityBill.month
    ).filter(
        and_(
            UtilityBill.service_id == service_id,
            UtilityBill.is_deleted == False
        )
    ).order_by(
        UtilityBill.year.asc(),
        UtilityBill.month.asc()
    ).all()
    
    if not bills:
        return "", ""
    
    # Get the oldest and most recent bills
    oldest_bill = bills[0]
    newest_bill = bills[-1]
    
    # Calculate the date 1 year before the newest bill
    newest_year = newest_bill.year
    newest_month = newest_bill.month
    one_year_ago_month = newest_month
    one_year_ago_year = newest_year - 1
    
    # Determine the effective "from" date (oldest bill or 1 year ago, whichever is more recent)
    oldest_date_value = oldest_bill.year * 100 + oldest_bill.month
    one_year_ago_value = one_year_ago_year * 100 + one_year_ago_month
    
    if oldest_date_value >= one_year_ago_value:
        from_month = oldest_bill.month
        from_year = oldest_bill.year
    else:
        from_month = one_year_ago_month
        from_year = one_year_ago_year
    
    # Format as "MM-YYYY"
    meter_data_from = f"{from_month:02d}-{from_year}"
    meter_data_to = f"{newest_month:02d}-{newest_year}"
    
    return meter_data_from, meter_data_to


def get_electrical_profile(service_id):
    """
    Get the electrical profile for a service in a format compatible with plan_gen.
    Returns a dictionary with system settings, demand info, and site details.
    """
    service = get_service_by_id(service_id)
    if not service:
        return None
    
    # Get site information
    site = service.site
    site_name = site.name if site else "Unknown Site"
    site_address = site.address if site else ""
    
    # Determine voltage values
    voltage_ll = service.voltage or 480  # Line-to-line voltage
    phase_count = service.phase_count or 3
    
    # Calculate line-to-neutral voltage for 3-phase systems
    if phase_count == 3:
        voltage_ln = round(voltage_ll / 1.732)  # sqrt(3) ≈ 1.732
    else:
        voltage_ln = voltage_ll  # For single phase, L-L = L-N
    
    # Get 12-month max demand
    max_demand_kw = get_12_month_max_demand(service_id)
    
    # Convert kW to kVA using power factor
    pf = service.power_factor or 0.95
    max_demand_kva = round(max_demand_kw / pf, 2) if max_demand_kw else 0
    
    # Get meter data date range from bills
    meter_data_from, meter_data_to = get_meter_data_date_range(service_id)
    
    return {
        "service_id": service_id,
        "site_name": site_name,
        "site_address": site_address,
        "service_notes": service.notes or "",
        "meter_number": service.meter_number or "",
        "utility": service.utility or "",
        "utility_account": service.utility_account or "",
        "system": {
            "voltage_LL": voltage_ll,
            "voltage_LN": voltage_ln,
            "frequency_hz": 60,  # Standard US frequency
            "use_excel_export": True,
            "excel_path": ""
        },
        "demand": {
            "main_breaker_A": service.main_breaker_amps or 0,
            "existing_12mo_kVA": max_demand_kva,
            "meter_data_from": meter_data_from,
            "meter_data_to": meter_data_to,
            "removed_load_kva": 0.0,
            "use_continuous_factor": True,
            "continuous_factor": 1.25
        },
        "power_factor": pf,
        "phase_count": phase_count,
        "capacity_kw": calculate_service_capacity(service)
    }
