from datetime import datetime
from flask import jsonify
from ..models import Site, Equipment, EquipmentUsage, EquipmentCatalog
from ..extensions import db


def list_equipment(site_id, target_year):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    equipment_rows = Equipment.query.filter_by(site_id=site_id).all()
    results = []
    for eq in equipment_rows:
        usage = EquipmentUsage.query.filter_by(equipment_id=eq.id, year=target_year).first()
        usage_miles = usage.miles if usage else None
        miles_source = 'usage'
        miles = usage_miles
        if eq.annual_miles is not None:
            miles = eq.annual_miles
            miles_source = 'annual'
        energy_per_mile = None
        try:
            energy_per_mile = eq.catalog.category.energy_per_mile if (eq.catalog and eq.catalog.category) else None
        except Exception:
            energy_per_mile = None
        energy_kwh = miles * energy_per_mile if (miles is not None and energy_per_mile is not None) else None
        operating_hours = 8760.0
        if eq.downtime_hours and eq.downtime_hours > 0:
            operating_hours = max(operating_hours - eq.downtime_hours, 1.0)
        average_power_kw = (energy_kwh / operating_hours) if (energy_kwh is not None) else None
        data = eq.to_dict()
        data['year'] = target_year
        data['miles_source'] = miles_source
        data['last_year_miles'] = usage_miles
        data['effective_miles'] = miles
        data['last_year_energy_kwh'] = energy_kwh
        data['avg_power_kw'] = average_power_kw
        results.append(data)
    return jsonify(results), 200


def create_equipment(site_id, data):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    mc_code = data.get('mc_code')
    if not mc_code:
        return {"error": "mc_code is required"}, 400
    catalog = EquipmentCatalog.query.get(mc_code)
    if not catalog:
        return {"error": f"MC code {mc_code} not found in catalog"}, 400
    eq = Equipment(
        site_id=site_id,
        mc_code=mc_code,
        equipment_identifier=data.get('equipment_identifier'),
        department_id=data.get('department_id'),
        annual_miles=data.get('annual_miles'),
        downtime_hours=data.get('downtime_hours')
    )
    db.session.add(eq)
    db.session.commit()
    return eq.to_dict(), 201


def get_equipment(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    return eq.to_dict(), 200


def update_equipment(equipment_id, data):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    if 'equipment_identifier' in data:
        eq.equipment_identifier = data['equipment_identifier']
    if 'department_id' in data:
        eq.department_id = data['department_id']
    if 'annual_miles' in data:
        try:
            eq.annual_miles = float(data['annual_miles']) if data['annual_miles'] is not None else None
        except (TypeError, ValueError):
            pass
    if 'downtime_hours' in data:
        try:
            eq.downtime_hours = float(data['downtime_hours']) if data['downtime_hours'] is not None else None
        except (TypeError, ValueError):
            pass
    if 'mc_code' in data and data['mc_code'] != eq.mc_code:
        new_code = data['mc_code']
        catalog = EquipmentCatalog.query.get(new_code)
        if not catalog:
            return {"error": f"MC code {new_code} not found"}, 400
        eq.mc_code = new_code
    db.session.commit()
    return eq.to_dict(), 200


def delete_equipment(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    db.session.delete(eq)
    db.session.commit()
    return {"message": f"Equipment {equipment_id} deleted"}, 200


def list_equipment_usage(equipment_id):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    entries = EquipmentUsage.query.filter_by(equipment_id=equipment_id).order_by(EquipmentUsage.year.desc()).all()
    return jsonify([e.to_dict() for e in entries]), 200


def upsert_equipment_usage(equipment_id, data):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    year = data.get('year')
    miles = data.get('miles')
    if not isinstance(year, int):
        return {"error": "Valid integer year required"}, 400
    usage = EquipmentUsage.query.filter_by(equipment_id=equipment_id, year=year).first()
    if usage:
        usage.miles = miles
    else:
        usage = EquipmentUsage(equipment_id=equipment_id, year=year, miles=miles)
        db.session.add(usage)
    db.session.commit()
    return usage.to_dict(), 200


def site_equipment_energy(site_id, target_year):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    equipment_rows = Equipment.query.filter_by(site_id=site_id).all()
    total_miles = 0.0
    total_energy = 0.0
    items = []
    for eq in equipment_rows:
        usage = EquipmentUsage.query.filter_by(equipment_id=eq.id, year=target_year).first()
        usage_miles = usage.miles if usage else None
        miles = usage_miles if usage_miles is not None else 0.0
        source = 'usage'
        if eq.annual_miles is not None:
            miles = eq.annual_miles
            source = 'annual'
        energy_per_mile = None
        try:
            energy_per_mile = eq.catalog.category.energy_per_mile if (eq.catalog and eq.catalog.category) else None
        except Exception:
            energy_per_mile = None
        energy_kwh = miles * energy_per_mile if (energy_per_mile is not None) else None
        operating_hours = 8760.0
        if eq.downtime_hours and eq.downtime_hours > 0:
            operating_hours = max(operating_hours - eq.downtime_hours, 1.0)
        average_power_kw = (energy_kwh / operating_hours) if energy_kwh is not None else None
        total_miles += miles
        if energy_kwh:
            total_energy += energy_kwh
        items.append({
            'equipment_id': eq.id,
            'equipment_identifier': eq.equipment_identifier,
            'mc_code': eq.mc_code,
            'department_id': eq.department_id,
            'miles': miles,
            'miles_source': source,
            'energy_per_mile': energy_per_mile,
            'energy_kwh': energy_kwh,
            'avg_power_kw': average_power_kw,
            'downtime_hours': eq.downtime_hours
        })
    return {
        'site_id': site_id,
        'year': target_year,
        'total_miles': round(total_miles, 3),
        'total_energy_kwh': round(total_energy, 3),
        'items': items
    }, 200
