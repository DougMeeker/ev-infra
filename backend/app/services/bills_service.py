from datetime import datetime
from flask import jsonify
from ..models import Site, UtilityBill
from ..extensions import db


def list_bills(site_id):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    bills = UtilityBill.query.filter_by(site_id=site_id, is_deleted=False).order_by(UtilityBill.year.desc(), UtilityBill.month.desc()).all()
    return jsonify([b.to_dict() for b in bills])


def create_bill(site_id, data):
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    year = data.get("year")
    month = data.get("month")
    if not isinstance(year, int) or not isinstance(month, int) or month < 1 or month > 12:
        return {"error": "Invalid year/month"}, 400
    existing = UtilityBill.query.filter_by(site_id=site_id, year=year, month=month).first()
    try:
        if existing:
            existing.energy_usage = data.get("energy_usage")
            existing.max_power = data.get("max_power")
            existing.is_deleted = False
            existing.updated_at = datetime.utcnow()
            db.session.commit()
            return existing.to_dict(), 200
        else:
            bill = UtilityBill(
                site_id=site_id,
                year=year,
                month=month,
                energy_usage=data.get("energy_usage"),
                max_power=data.get("max_power"),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.session.add(bill)
            db.session.commit()
            return bill.to_dict(), 201
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to save bill: {e}"}, 400


def get_bill(bill_id):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404
    return bill.to_dict()


def update_bill(bill_id, data):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404
    for field in ["year", "month", "energy_usage", "max_power"]:
        if field in data:
            setattr(bill, field, data[field])
    bill.updated_at = datetime.utcnow()
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"error": f"Failed to update bill: {e}"}, 400
    return bill.to_dict()


def delete_bill(bill_id):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404
    bill.is_deleted = True
    db.session.commit()
    return {"message": f"Bill {bill_id} deleted."}, 200
