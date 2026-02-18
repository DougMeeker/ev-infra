from flask import jsonify, request
from datetime import datetime, timedelta
import math
from .site_routes import site_bp
from ..models import Site, UtilityBill, Charger, Equipment, EquipmentUsage, EquipmentCatalog, EquipmentCategory
from ..extensions import db
from ..models import project_sites


@site_bp.route("/", methods=["GET"])
def get_sites():
    from sqlalchemy import func
    
    # Get all non-deleted sites
    sites = Site.query.filter_by(is_deleted=False).all()
    site_ids = [s.id for s in sites]
    
    # Aggregate charger kW by site in a single query
    charger_aggregates = db.session.query(
        Charger.site_id,
        func.sum(Charger.kw).label('total_kw')
    ).filter(
        Charger.site_id.in_(site_ids)
    ).group_by(Charger.site_id).all()
    
    charger_totals = {site_id: float(total_kw or 0.0) for site_id, total_kw in charger_aggregates}
    
    # Get vehicle counts by site in a single query
    vehicle_counts = {}
    try:
        vc_rows = db.session.query(
            Equipment.site_id,
            func.count(Equipment.id)
        ).group_by(Equipment.site_id).all()
        vehicle_counts = {int(site_id): int(cnt) for site_id, cnt in vc_rows if site_id is not None}
    except Exception:
        pass

    # Build response
    rows = []
    for s in sites:
        d = s.to_dict(include_services=False, include_project_ids=False)
        d['total_charger_kw'] = round(charger_totals.get(s.id, 0.0), 3)
        d['vehicle_count'] = vehicle_counts.get(s.id, 0)
        rows.append(d)
    return jsonify(rows)


@site_bp.route("/<int:site_id>", methods=["GET"])
def get_site(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    # Return lean site payload (services fetched via dedicated endpoint if needed)
    return site.to_dict(include_services=False)


@site_bp.route("/<int:site_id>/projects", methods=["GET"])
def get_site_projects(site_id):
    """Get all projects associated with this site, including latest status."""
    from ..models import Project, ProjectStatus
    from sqlalchemy import func
    
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    
    # Get all projects for this site
    projects = site.projects
    
    result = []
    for project in projects:
        if project.is_deleted:
            continue
            
        project_data = project.to_dict()
        
        # Get the latest status for this project at this site
        latest_status = ProjectStatus.query.filter_by(
            project_id=project.id,
            site_id=site_id
        ).order_by(ProjectStatus.status_date.desc()).first()
        
        if latest_status:
            project_data['current_step'] = latest_status.current_step
            project_data['status_message'] = latest_status.status_message
            project_data['status_date'] = latest_status.status_date.isoformat() if latest_status.status_date else None
            # Calculate progress percentage
            steps_count = len(project.steps) if project.steps else 0
            if steps_count > 0:
                project_data['progress_percent'] = round((latest_status.current_step / steps_count) * 100, 1)
            else:
                project_data['progress_percent'] = 0
        else:
            project_data['current_step'] = 0
            project_data['status_message'] = None
            project_data['status_date'] = None
            project_data['progress_percent'] = 0
        
        result.append(project_data)
    
    return result, 200


@site_bp.route("/<int:site_id>/metrics", methods=["GET"])
def get_site_metrics(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404

    # Get all services for this site
    services = [s for s in site.services if not s.is_deleted]
    
    if not services:
        return jsonify({
            "site_id": site_id,
            "last_year_peak_kw": 0.0,
            "theoretical_capacity_kw": None,
            "available_capacity_kw": None,
            "power_factor": 0.95,
            "services": []
        }), 200

    cutoff = datetime.utcnow() - timedelta(days=365)
    
    # Calculate metrics for each service and aggregate
    total_theoretical_capacity_kw = 0.0
    total_last_year_peak_kw = 0.0
    service_metrics = []
    has_capacity_data = False
    total_bill_count = 0
    
    for service in services:
        # Get bills for this service
        bills = (
            UtilityBill.query
            .filter_by(service_id=service.id, is_deleted=False)
            .all()
        )
        
        total_bill_count += len(bills)
        
        # Calculate peak for this service
        service_peak_kw = 0.0
        for b in bills:
            try:
                bill_dt = datetime(b.year, b.month, 1)
            except ValueError:
                continue
            if bill_dt < cutoff:
                continue
            if b.max_power is not None:
                try:
                    val = float(b.max_power)
                except (TypeError, ValueError):
                    val = None
                if val is not None:
                    service_peak_kw = max(service_peak_kw, val)
        
        total_last_year_peak_kw += service_peak_kw
        
        # Calculate capacity for this service
        pf = service.power_factor if (service.power_factor is not None) else 0.95
        service_capacity_kw = None
        if service.main_breaker_amps and service.voltage and service.phase_count:
            try:
                amps = float(service.main_breaker_amps)
                volts = float(service.voltage)
                if int(service.phase_count) == 3:
                    service_capacity_kw = amps * volts * math.sqrt(3) * pf / 1000.0
                else:
                    service_capacity_kw = amps * volts * pf / 1000.0
                has_capacity_data = True
                total_theoretical_capacity_kw += service_capacity_kw
            except Exception:
                service_capacity_kw = None
        
        service_metrics.append({
            "service_id": service.id,
            "meter_number": service.meter_number,
            "utility": service.utility,
            "peak_kw": round(service_peak_kw, 3),
            "capacity_kw": round(service_capacity_kw, 3) if service_capacity_kw is not None else None,
            "available_kw": round(service_capacity_kw - service_peak_kw, 3) if service_capacity_kw is not None else None,
        })
    
    # Calculate aggregate available capacity
    available_capacity_kw = None
    if has_capacity_data:
        available_capacity_kw = max(total_theoretical_capacity_kw - total_last_year_peak_kw, 0.0)

    # Get vehicle/equipment count for this site
    vehicle_count = Equipment.query.filter_by(site_id=site_id).count()

    result = {
        "site_id": site_id,
        "last_year_peak_kw": round(total_last_year_peak_kw, 3),
        "theoretical_capacity_kw": round(total_theoretical_capacity_kw, 3) if has_capacity_data else None,
        "available_capacity_kw": round(available_capacity_kw, 3) if available_capacity_kw is not None else None,
        "power_factor": 0.95,  # Average, could be calculated from services
        "vehicle_count": vehicle_count,
        "bill_count": total_bill_count,
        "services": service_metrics
    }
    return jsonify(result), 200


@site_bp.route("/<int:site_id>", methods=["PUT"])
def update_site(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    data = request.get_json(silent=True) or {}
    allowed = {
        "name", "address", "city", "latitude", "longitude",
        "department_id", "utility", "meter_number", "contact_name", "contact_phone",
        "voltage", "phase_count", "main_breaker_amps", "power_factor", "leased"
    }
    for key in allowed:
        if key in data:
            setattr(site, key, data[key])
    try:
        # Commit via SQLAlchemy session on the model
        from ..extensions import db
        db.session.commit()
    except Exception as e:
        from ..extensions import db
        db.session.rollback()
        return {"error": f"Failed to update site: {e}"}, 500
    return site.to_dict(), 200


@site_bp.route("/", methods=["POST"])
def create_site():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        # Allow creating with address+city fallback name
        address = (data.get('address') or '').strip()
        city = (data.get('city') or '').strip()
        if address and city:
            name = f"{address}, {city}"
        else:
            return {"error": "name is required"}, 400

    site = Site(
        name=name,
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        address=data.get('address'),
        city=data.get('city'),
        contact_name=data.get('contact_name'),
        contact_phone=data.get('contact_phone'),
        department_id=data.get('department_id'),
        leased=data.get('leased', False)
    )
    db.session.add(site)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to create site: {e}"}, 500
    return site.to_dict(), 201


@site_bp.route("/<int:site_id>", methods=["DELETE"])
def delete_site(site_id):
    site = Site.query.get(site_id)
    if not site:
        return {"error": "Site not found"}, 404
    # Soft delete to preserve historical links
    site.is_deleted = True
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to delete site: {e}"}, 500
    return {"message": "site deleted", "site_id": site_id}, 200


@site_bp.route("/map-data", methods=["GET"])
def get_map_data():
    """
    Ultra-lightweight endpoint for map markers - returns only id, name, lat/lon.
    Add ?include_capacity=1 to get basic capacity metrics for marker coloring.
    Popup details are loaded on-demand when marker is clicked.
    """
    project_id_param = request.args.get('project_id')
    include_capacity = request.args.get('include_capacity') == '1'
    
    site_query = Site.query.filter_by(is_deleted=False)
    
    # Optional filter: restrict to sites in a specific project
    try:
        project_id = int(project_id_param) if project_id_param is not None else None
    except (TypeError, ValueError):
        project_id = None
    
    if project_id:
        site_query = site_query.join(project_sites, Site.id == project_sites.c.site_id)\
                               .filter(project_sites.c.project_id == project_id)
    
    sites = site_query.all()
    
    result = []
    for site in sites:
        data = {
            'id': site.id,
            'site_id': site.id,
            'name': site.name,
            'latitude': site.latitude,
            'longitude': site.longitude,
        }
        
        # Optionally include just capacity for marker coloring (faster than full metrics)
        if include_capacity:
            total_capacity_kw = 0
            for service in site.services:
                if service.is_deleted:
                    continue
                pf = service.power_factor if (service.power_factor is not None) else 0.95
                if service.main_breaker_amps and service.voltage and service.phase_count:
                    try:
                        import math
                        amps = float(service.main_breaker_amps)
                        volts = float(service.voltage)
                        if int(service.phase_count) == 3:
                            total_capacity_kw += amps * volts * math.sqrt(3) * pf / 1000.0
                        else:
                            total_capacity_kw += amps * volts * pf / 1000.0
                    except Exception:
                        pass
            data['available_capacity_kw'] = round(total_capacity_kw, 3) if total_capacity_kw > 0 else None
        
        result.append(data)
    
    return jsonify(result)


@site_bp.route("/metrics/aggregate", methods=["GET"])
def aggregate_site_metrics():
    # Vehicle counts by site
    vehicle_counts = {}
    try:
        from sqlalchemy import func
        vc_rows = db.session.query(Equipment.site_id, func.count(Equipment.id)).group_by(Equipment.site_id).all()
        vehicle_counts = {int(site_id): int(cnt) for site_id, cnt in vc_rows if site_id is not None}
    except Exception:
        pass
    order = request.args.get('order', 'desc').lower()
    sort_field = request.args.get('sort', 'available_capacity_kw')
    search = request.args.get('search', '').strip()
    project_id_param = request.args.get('project_id')
    limit_param = request.args.get('limit', None)
    page_param = request.args.get('page', None)
    per_page_param = request.args.get('per_page', None)
    offset_param = request.args.get('offset', None)

    def to_int(val):
        try:
            return int(val)
        except (TypeError, ValueError):
            return None

    limit = to_int(limit_param)
    page = to_int(page_param)
    per_page = to_int(per_page_param) or 50
    offset = to_int(offset_param)

    site_query = Site.query.filter_by(is_deleted=False)
    # Optional filter: restrict to sites in a specific project
    try:
        project_id = int(project_id_param) if project_id_param is not None else None
    except (TypeError, ValueError):
        project_id = None
    if project_id:
        site_query = site_query.join(project_sites, Site.id == project_sites.c.site_id)\
                               .filter(project_sites.c.project_id == project_id)
    if search:
        like = f"%{search}%"
        site_query = site_query.filter(Site.name.ilike(like))
    # Compute filtered total before pagination
    filtered_total = site_query.count()
    sites = site_query.all()
    site_ids = [s.id for s in sites]
    # Precompute daily avg/max kWh per site for latest usage year in a single batched query
    daily_metrics_by_site = {}
    try:
        if site_ids:
            from sqlalchemy import func, case, and_
            latest_years_sub = (
                db.session.query(
                    Equipment.site_id.label('site_id'),
                    func.max(EquipmentUsage.year).label('latest_year')
                )
                .join(EquipmentUsage, Equipment.id == EquipmentUsage.equipment_id)
                .filter(Equipment.site_id.in_(site_ids))
                .group_by(Equipment.site_id)
            ).subquery()

            # kWh per mile factor: prefer energy_per_mile, else invert miles_per_kwh
            kwh_per_mile = case(
                (
                    and_(EquipmentCategory.energy_per_mile.isnot(None), EquipmentCategory.energy_per_mile > 0),
                    EquipmentCategory.energy_per_mile
                ),
                else_=case(
                    (
                        and_(EquipmentCategory.miles_per_kwh.isnot(None), EquipmentCategory.miles_per_kwh > 0),
                        (1.0 / EquipmentCategory.miles_per_kwh)
                    ),
                    else_=None
                )
            )

            month_energy = (EquipmentUsage.miles * kwh_per_mile)
            daily_value = month_energy / func.nullif(EquipmentUsage.days_utilized, 0)

            agg = (
                db.session.query(
                    Equipment.site_id.label('site_id'),
                    func.max(daily_value).label('daily_max'),
                    func.sum(
                        case((EquipmentUsage.days_utilized > 0, month_energy), else_=0.0)
                    ).label('total_energy'),
                    func.sum(
                        case((EquipmentUsage.days_utilized > 0, EquipmentUsage.days_utilized), else_=0)
                    ).label('total_days')
                )
                .join(Equipment, Equipment.id == EquipmentUsage.equipment_id)
                .join(latest_years_sub, and_(latest_years_sub.c.site_id == Equipment.site_id, latest_years_sub.c.latest_year == EquipmentUsage.year))
                .outerjoin(EquipmentCatalog, Equipment.mc_code == EquipmentCatalog.mc_code)
                .outerjoin(EquipmentCategory, EquipmentCatalog.equipment_category_code == EquipmentCategory.code)
                .filter(Equipment.site_id.in_(site_ids))
                .group_by(Equipment.site_id)
                .all()
            )
            for site_id, daily_max, total_energy, total_days in agg:
                avg_val = None
                try:
                    if total_days and total_days > 0 and total_energy is not None:
                        avg_val = float(total_energy) / float(total_days)
                except Exception:
                    avg_val = None
                daily_metrics_by_site[int(site_id)] = {
                    'site_daily_max_kwh': round(float(daily_max), 3) if daily_max is not None else None,
                    'site_daily_avg_kwh': round(avg_val, 3) if avg_val is not None else None,
                }
    except Exception:
        daily_metrics_by_site = {}
    
    # Get all services for the sites
    from app.models import Service
    services = Service.query.filter(Service.site_id.in_(site_ids), Service.is_deleted.is_(False)).all()
    service_ids = [s.id for s in services]
    service_to_site = {s.id: s.site_id for s in services}
    
    # Get bills for all services
    bills = UtilityBill.query.filter(UtilityBill.service_id.in_(service_ids), UtilityBill.is_deleted.is_(False)).all()
    chargers = Charger.query.filter(Charger.site_id.in_(site_ids)).all()
    charger_totals = {}
    charger_installed_totals = {}
    for c in chargers:
        kw = c.kw if c.kw is not None else 0.0
        sid = c.site_id
        charger_totals[sid] = charger_totals.get(sid, 0.0) + (kw or 0.0)
        if c.date_installed is not None:
            charger_installed_totals[sid] = charger_installed_totals.get(sid, 0.0) + (kw or 0.0)

    bills_by_site = {}
    cutoff = datetime.utcnow() - timedelta(days=365)
    for b in bills:
        try:
            bill_dt = datetime(b.year, b.month, 1)
        except ValueError:
            continue
        if bill_dt < cutoff:
            continue
        site_id = service_to_site.get(b.service_id)
        if site_id:
            bills_by_site.setdefault(site_id, []).append(b)

    # Build services by site for capacity calculations
    services_by_site = {}
    for service in services:
        services_by_site.setdefault(service.site_id, []).append(service)

    rows = []
    for s in sites:
        site_bills = bills_by_site.get(s.id, [])
        last_year_peak_kw = max([b.max_power for b in site_bills if b.max_power is not None], default=0)
        bill_count = len(site_bills)
        
        # Calculate aggregate capacity from all services at this site
        theoretical_capacity_kw = None
        site_services = services_by_site.get(s.id, [])
        if site_services:
            total_capacity = 0.0
            has_capacity = False
            for service in site_services:
                pf = service.power_factor if (service.power_factor is not None) else 0.95
                if service.main_breaker_amps and service.voltage and service.phase_count:
                    try:
                        amps = float(service.main_breaker_amps)
                        volts = float(service.voltage)
                        if int(service.phase_count) == 3:
                            capacity = amps * volts * math.sqrt(3) * pf / 1000.0
                        else:
                            capacity = amps * volts * pf / 1000.0
                        total_capacity += capacity
                        has_capacity = True
                    except Exception:
                        pass
            if has_capacity:
                theoretical_capacity_kw = total_capacity
        
        available_capacity_kw = None
        if theoretical_capacity_kw is not None:
            available_capacity_kw = max(theoretical_capacity_kw - last_year_peak_kw, 0)
        
        # Get primary service info for legacy fields (take first service if multiple exist)
        primary_service = site_services[0] if site_services else None
        
        row = {
            # identifiers
            "site_id": s.id,
            "id": s.id,
            "name": s.name,
            # location & contact (for map popups and completeness checks)
            "latitude": s.latitude,
            "longitude": s.longitude,
            "address": s.address,
            "city": s.city,
            "contact_name": s.contact_name,
            "contact_phone": s.contact_phone,
            # utility basics used in UI (from primary service)
            "utility": primary_service.utility if primary_service else None,
            "meter_number": primary_service.meter_number if primary_service else None,
            # capacity fields (aggregated across all services)
            "last_year_peak_kw": round(last_year_peak_kw, 3),
            "theoretical_capacity_kw": round(theoretical_capacity_kw, 3) if theoretical_capacity_kw is not None else None,
            "available_capacity_kw": round(available_capacity_kw, 3) if available_capacity_kw is not None else None,
            "voltage": primary_service.voltage if primary_service else None,
            "phase_count": primary_service.phase_count if primary_service else None,
            "main_breaker_amps": primary_service.main_breaker_amps if primary_service else None,
            "power_factor": primary_service.power_factor if primary_service else 0.95,
            # charger aggregates & vehicles
            "total_charger_kw": round(charger_totals.get(s.id, 0.0), 3),
            "installed_charger_kw": round(charger_installed_totals.get(s.id, 0.0), 3),
            "vehicle_count": vehicle_counts.get(s.id, 0),
            "bill_count": bill_count
        }
        # Attach precomputed daily metrics if available
        dm = daily_metrics_by_site.get(s.id)
        if dm:
            if dm.get('site_daily_max_kwh') is not None:
                row['site_daily_max_kwh'] = dm['site_daily_max_kwh']
            if dm.get('site_daily_avg_kwh') is not None:
                row['site_daily_avg_kwh'] = dm['site_daily_avg_kwh']
        rows.append(row)

    def sort_key(row):
        val = None
        if sort_field == 'available_capacity_kw':
            val = row.get('available_capacity_kw')
        elif sort_field == 'last_year_peak_kw':
            val = row.get('last_year_peak_kw')
        elif sort_field == 'theoretical_capacity_kw':
            val = row.get('theoretical_capacity_kw')
        elif sort_field == 'power_factor':
            val = row.get('power_factor')
        elif sort_field == 'total_charger_kw':
            val = row.get('total_charger_kw')
        elif sort_field == 'installed_charger_kw':
            val = row.get('installed_charger_kw')
        elif sort_field == 'name':
            val = row.get('name') or ''
            return val.lower()
        elif sort_field == 'vehicle_count':
            val = row.get('vehicle_count')
        elif sort_field == 'site_daily_max_kwh':
            val = row.get('site_daily_max_kwh')
        elif sort_field == 'site_daily_avg_kwh':
            val = row.get('site_daily_avg_kwh')
        if val is None:
            return -1 if order != 'asc' else float('inf')
        return val

    rows.sort(key=sort_key, reverse=(order != 'asc'))
    # Apply explicit limit/offset first if provided
    if offset is not None and limit is not None and offset >= 0 and limit > 0:
        rows = rows[offset: offset + limit]
    elif limit is not None and limit > 0:
        rows = rows[:limit]
    elif page is not None and page > 0:
        start = (page - 1) * per_page
        end = start + per_page
        rows = rows[start:end]

    meta = {
        "total": filtered_total,
        "returned": len(rows),
        "order": order,
        "sort": sort_field,
        "page": page,
        "per_page": per_page if page else None,
        "offset": offset,
        "limit": limit,
        "search": search,
        "project_id": project_id
    }
    return jsonify({"data": rows, "meta": meta}), 200
