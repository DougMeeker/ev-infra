from datetime import datetime
from flask import jsonify
from ..models import Site, Equipment, EquipmentUsage, EquipmentCatalog
from ..extensions import db


def list_equipment(site_id, target_year, page=1, per_page=25):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    base_query = Equipment.query.filter_by(site_id=site_id)
    total = base_query.count()
    if page is None or page <= 0:
        page = 1
    if per_page is None or per_page <= 0:
        per_page = 25
    offset = (page - 1) * per_page
    equipment_rows = base_query.order_by(Equipment.id.asc()).offset(offset).limit(per_page).all()
    results = []
    for eq in equipment_rows:
        # Aggregate monthly usage for the target year
        yearly_usage = EquipmentUsage.query.filter_by(equipment_id=eq.id, year=target_year).all()
        usage_miles = sum([u.miles or 0.0 for u in yearly_usage]) if yearly_usage else None
        usage_hours = sum([u.driving_hours or 0.0 for u in yearly_usage]) if yearly_usage else None
        usage_days = sum([u.days_utilized or 0 for u in yearly_usage]) if yearly_usage else 0
        miles_source = 'usage'
        miles = usage_miles
        if eq.annual_miles is not None:
            miles = eq.annual_miles
            miles_source = 'annual'
        # Determine energy factor (kWh per mile), supporting either energy_per_mile or miles_per_kwh
        energy_factor_kwh_per_mile = None
        try:
            if eq.catalog and eq.catalog.category:
                cat = eq.catalog.category
                if cat.energy_per_mile is not None and cat.energy_per_mile > 0:
                    energy_factor_kwh_per_mile = cat.energy_per_mile
                elif hasattr(cat, 'miles_per_kwh') and cat.miles_per_kwh is not None and cat.miles_per_kwh > 0:
                    energy_factor_kwh_per_mile = 1.0 / cat.miles_per_kwh
        except Exception:
            energy_factor_kwh_per_mile = None
        energy_kwh = miles * energy_factor_kwh_per_mile if (miles is not None and energy_factor_kwh_per_mile is not None) else None
        # Average power calculation uses driving hours if available
        driving_hours = None
        if eq.driving_hours is not None:
            driving_hours = eq.driving_hours
        elif usage_hours is not None and usage_hours > 0:
            driving_hours = usage_hours
        # Fallback to annual hours if driving hours unknown
        operating_hours = 8760.0
        average_power_kw = None
        if energy_kwh is not None:
            if driving_hours and driving_hours > 0:
                average_power_kw = energy_kwh / max(driving_hours, 1.0)
            else:
                average_power_kw = energy_kwh / operating_hours
        data = eq.to_dict()
        data['year'] = target_year
        data['miles_source'] = miles_source
        data['last_year_miles'] = usage_miles
        data['last_year_driving_hours'] = usage_hours
        data['effective_miles'] = miles
        data['last_year_energy_kwh'] = energy_kwh
        # Daily metrics
        daily_avg_kwh = None
        daily_max_kwh = None
        if energy_kwh is not None and usage_days and usage_days > 0:
            daily_avg_kwh = energy_kwh / float(max(usage_days, 1))
        if yearly_usage:
            per_month_daily = []
            for u in yearly_usage:
                try:
                    if (u.days_utilized or 0) > 0:
                        month_energy = (u.miles or 0.0) * (energy_factor_kwh_per_mile or 0.0)
                        per_month_daily.append(month_energy / float(max(u.days_utilized, 1)))
                except Exception:
                    pass
            if per_month_daily:
                daily_max_kwh = max(per_month_daily)
        data['avg_power_kw'] = average_power_kw
        data['daily_avg_kwh'] = daily_avg_kwh
        data['daily_max_kwh'] = daily_max_kwh
        results.append(data)
    payload = {
        'items': results,
        'meta': {
            'total': total,
            'page': page,
            'per_page': per_page,
            'returned': len(results)
        }
    }
    return jsonify(payload), 200


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
    # equipment_id is an external/fleet numeric identifier (optional)
    ext_id = data.get('equipment_id')
    try:
        ext_id = int(ext_id) if ext_id is not None and str(ext_id).strip() != '' else None
    except Exception:
        ext_id = None
    eq = Equipment(
        site_id=site_id,
        mc_code=mc_code,
        equipment_id=ext_id,
        department_id=data.get('department_id'),
        annual_miles=data.get('annual_miles'),
        driving_hours=data.get('driving_hours')
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
    if 'equipment_id' in data:
        try:
            val = data.get('equipment_id')
            eq.equipment_id = int(val) if val is not None and str(val).strip() != '' else None
        except Exception:
            pass
    if 'site_id' in data:
        try:
            val = data.get('site_id')
            eq.site_id = int(val) if val is not None else None
        except (TypeError, ValueError):
            pass
    if 'department_id' in data:
        eq.department_id = data['department_id']
    if 'annual_miles' in data:
        try:
            eq.annual_miles = float(data['annual_miles']) if data['annual_miles'] is not None else None
        except (TypeError, ValueError):
            pass
    if 'driving_hours' in data:
        try:
            eq.driving_hours = float(data['driving_hours']) if data['driving_hours'] is not None else None
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
    entries = EquipmentUsage.query.filter_by(equipment_id=equipment_id).order_by(EquipmentUsage.year.desc(), EquipmentUsage.month.desc()).all()
    return jsonify([e.to_dict() for e in entries]), 200


def upsert_equipment_usage(equipment_id, data):
    eq = Equipment.query.get(equipment_id)
    if not eq:
        return {"error": "Equipment not found"}, 404
    year = data.get('year')
    month = data.get('month')
    miles = data.get('miles')
    driving_hours = data.get('driving_hours')
    days_utilized = data.get('days_utilized')
    if not isinstance(year, int) or not isinstance(month, int) or month < 1 or month > 12:
        return {"error": "Valid integer year and month required"}, 400
    usage = EquipmentUsage.query.filter_by(equipment_id=equipment_id, year=year, month=month).first()
    if usage:
        usage.miles = miles
        usage.driving_hours = driving_hours
        usage.days_utilized = days_utilized
    else:
        usage = EquipmentUsage(equipment_id=equipment_id, year=year, month=month, miles=miles, driving_hours=driving_hours, days_utilized=days_utilized)
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
    site_days_total = 0
    site_daily_values = []
    items = []
    for eq in equipment_rows:
        yearly_usage = EquipmentUsage.query.filter_by(equipment_id=eq.id, year=target_year).all()
        usage_miles = sum([u.miles or 0.0 for u in yearly_usage]) if yearly_usage else 0.0
        usage_hours = sum([u.driving_hours or 0.0 for u in yearly_usage]) if yearly_usage else 0.0
        usage_days = sum([u.days_utilized or 0 for u in yearly_usage]) if yearly_usage else 0
        usage_days = sum([u.days_utilized or 0 for u in yearly_usage]) if yearly_usage else 0
        miles = usage_miles
        source = 'usage'
        if eq.annual_miles is not None:
            miles = eq.annual_miles
            source = 'annual'
        # Determine energy factor (kWh per mile), supporting either energy_per_mile or miles_per_kwh
        energy_factor_kwh_per_mile = None
        try:
            if eq.catalog and eq.catalog.category:
                cat = eq.catalog.category
                if cat.energy_per_mile is not None and cat.energy_per_mile > 0:
                    energy_factor_kwh_per_mile = cat.energy_per_mile
                elif hasattr(cat, 'miles_per_kwh') and cat.miles_per_kwh is not None and cat.miles_per_kwh > 0:
                    energy_factor_kwh_per_mile = 1.0 / cat.miles_per_kwh
        except Exception:
            energy_factor_kwh_per_mile = None
        energy_kwh = miles * energy_factor_kwh_per_mile if (energy_factor_kwh_per_mile is not None) else None
        # Average power uses driving hours if available
        average_power_kw = None
        if energy_kwh is not None:
            if (eq.driving_hours is not None and eq.driving_hours > 0):
                average_power_kw = energy_kwh / max(eq.driving_hours, 1.0)
            elif (usage_hours is not None and usage_hours > 0):
                average_power_kw = energy_kwh / max(usage_hours, 1.0)
            else:
                average_power_kw = energy_kwh / 8760.0
        # Daily metrics per item
        item_daily_avg_kwh = None
        item_daily_max_kwh = None
        if energy_kwh is not None and usage_days and usage_days > 0:
            item_daily_avg_kwh = energy_kwh / float(max(usage_days, 1))
        if yearly_usage:
            per_month_daily = []
            for u in yearly_usage:
                try:
                    if (u.days_utilized or 0) > 0:
                        month_energy = (u.miles or 0.0) * (energy_factor_kwh_per_mile or 0.0)
                        per_month_daily.append(month_energy / float(max(u.days_utilized, 1)))
                except Exception:
                    pass
            if per_month_daily:
                item_daily_max_kwh = max(per_month_daily)
        total_miles += miles
        if energy_kwh:
            total_energy += energy_kwh
        # Accumulate site-level daily metrics
        if usage_days and usage_days > 0 and energy_factor_kwh_per_mile is not None:
            site_days_total += usage_days
            for u in yearly_usage:
                if (u.days_utilized or 0) > 0:
                    month_energy = (u.miles or 0.0) * (energy_factor_kwh_per_mile or 0.0)
                    site_daily_values.append(month_energy / float(max(u.days_utilized, 1)))
        items.append({
            'id': eq.id,
            'equipment_id': eq.equipment_id,
            'mc_code': eq.mc_code,
            'department_id': eq.department_id,
            'miles': miles,
            'miles_source': source,
            'energy_per_mile': energy_factor_kwh_per_mile,
            'miles_per_kwh': (None if energy_factor_kwh_per_mile is None else (None if energy_factor_kwh_per_mile == 0 else (1.0 / energy_factor_kwh_per_mile))),
            'energy_kwh': energy_kwh,
            'avg_power_kw': average_power_kw,
            'driving_hours': eq.driving_hours,
            'yearly_driving_hours': usage_hours,
            'daily_avg_kwh': item_daily_avg_kwh,
            'daily_max_kwh': item_daily_max_kwh
        })
    return {
        'site_id': site_id,
        'year': target_year,
        'total_miles': round(total_miles, 3),
        'total_energy_kwh': round(total_energy, 3),
        'items': items,
        'site_daily_avg_kwh': (round(total_energy / float(max(site_days_total, 1)), 3) if site_days_total > 0 else None),
        'site_daily_max_kwh': (round(max(site_daily_values), 3) if site_daily_values else None)
    }, 200
