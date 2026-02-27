from datetime import datetime
from flask import jsonify
from ..models import Site, Charger
from ..extensions import db


def list_all_chargers():
    """Get all chargers across all sites"""
    chargers = Charger.query.join(Site).filter(Site.is_deleted == False).order_by(Charger.id.desc()).all()
    rows = []
    for c in chargers:
        data = c.to_dict()
        try:
            data['project_name'] = c.project.name if getattr(c, 'project', None) else None
            data['site_name'] = c.site.name if getattr(c, 'site', None) else None
        except Exception:
            data['project_name'] = None
            data['site_name'] = None
        rows.append(data)
    return jsonify(rows), 200


def list_chargers(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    chargers = Charger.query.filter_by(site_id=site_id).order_by(Charger.id.desc()).all()
    rows = []
    for c in chargers:
        data = c.to_dict()
        try:
            data['project_name'] = c.project.name if getattr(c, 'project', None) else None
        except Exception:
            data['project_name'] = None
        rows.append(data)
    return jsonify(rows), 200


def create_charger(site_id, data):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    c = Charger(
        site_id=site_id,
        project_id=data.get('project_id'),
        kw=data.get('kw'),
        breaker_size=data.get('breaker_size'),
        input_voltage=data.get('input_voltage'),
        output_voltage=data.get('output_voltage'),
        port_count=data.get('port_count'),
        handle_type=data.get('handle_type'),
        manufacturer=data.get('manufacturer'),
        model_number=data.get('model_number'),
        serial_number=data.get('serial_number'),
        date_installed=data.get('date_installed'),
        fleet=data.get('fleet', False),
        description=data.get('description')
    )
    if isinstance(c.project_id, str) and c.project_id.strip() == "":
        c.project_id = None
    if isinstance(c.date_installed, str):
        if c.date_installed.strip() == "":
            c.date_installed = None
        else:
            try:
                c.date_installed = datetime.fromisoformat(c.date_installed).date()
            except Exception:
                c.date_installed = None
    db.session.add(c)
    db.session.commit()
    return c.to_dict(), 201


def get_charger(charger_id):
    c = Charger.query.get(charger_id)
    if not c:
        return {"error": "Charger not found"}, 404
    data = c.to_dict()
    try:
        data['project_name'] = c.project.name if getattr(c, 'project', None) else None
    except Exception:
        data['project_name'] = None
    return data, 200


def update_charger(charger_id, data):
    c = Charger.query.get(charger_id)
    if not c:
        return {"error": "Charger not found"}, 404
    scalar_fields = [
        'project_id','kw','breaker_size','input_voltage','output_voltage',
        'port_count','handle_type','manufacturer','model_number','serial_number','date_installed','fleet','description'
    ]
    for f in scalar_fields:
        if f in data:
            val = data[f]
            if f == 'project_id' and isinstance(val, str) and val.strip() == "":
                val = None
            if f == 'date_installed' and isinstance(val, str):
                if val.strip() == "":
                    val = None
                else:
                    try:
                        val = datetime.fromisoformat(val).date()
                    except Exception:
                        val = None
            setattr(c, f, val)
    db.session.commit()
    return c.to_dict(), 200


def delete_charger(charger_id):
    c = Charger.query.get(charger_id)
    if not c:
        return {"error": "Charger not found"}, 404
    db.session.delete(c)
    db.session.commit()
    return {"message": f"Charger {charger_id} deleted"}, 200
