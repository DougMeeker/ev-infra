from datetime import datetime
from flask import jsonify
from ..models import Service, UtilityBill
from ..extensions import db
import csv
import re
from io import StringIO


def list_bills_by_service(service_id):
    """List all bills for a specific service."""
    service = Service.query.get(service_id)
    if not service or service.is_deleted:
        return {"error": "Service not found"}, 404
    bills = UtilityBill.query.filter_by(service_id=service_id, is_deleted=False).order_by(
        UtilityBill.year.desc(), UtilityBill.month.desc()
    ).all()
    return jsonify([b.to_dict() for b in bills])


def list_bills_by_site(site_id):
    """List all bills for all services at a site."""
    from ..models import Site
    site = Site.query.get(site_id)
    if not site or site.is_deleted:
        return {"error": "Site not found"}, 404
    
    # Get all service IDs for this site
    service_ids = [s.id for s in site.services if not s.is_deleted]
    
    if not service_ids:
        return jsonify([])
    
    bills = UtilityBill.query.filter(
        UtilityBill.service_id.in_(service_ids),
        UtilityBill.is_deleted == False
    ).order_by(UtilityBill.year.desc(), UtilityBill.month.desc()).all()
    
    return jsonify([b.to_dict() for b in bills])


def create_bill(service_id, data):
    """Create a new bill for a service."""
    service = Service.query.get(service_id)
    if not service or service.is_deleted:
        return {"error": "Service not found"}, 404
    year = data.get("year")
    month = data.get("month")
    
    # Validate year and month types and range
    if year is None or month is None:
        return {"error": "Year and month are required"}, 400
    if not isinstance(year, int) or not isinstance(month, int):
        return {"error": f"Invalid year/month types: year={type(year).__name__}, month={type(month).__name__}"}, 400
    if month < 1 or month > 12:
        return {"error": f"Month must be between 1 and 12, got {month}"}, 400
    
    # Check for existing bill (including soft-deleted ones)
    existing = UtilityBill.query.filter_by(
        service_id=service_id, 
        year=year, 
        month=month,
        is_deleted=False
    ).first()
    
    try:
        if existing:
            # Update existing bill
            existing.energy_usage = data.get("energy_usage")
            existing.max_power = data.get("max_power")
            existing.updated_at = datetime.utcnow()
            db.session.commit()
            return existing.to_dict(), 200
        else:
            # Create new bill
            bill = UtilityBill(
                service_id=service_id,
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
        import traceback
        error_details = traceback.format_exc()
        print(f"Error creating bill: {error_details}")
        return {"error": f"Failed to save bill: {str(e)}"}, 400


def get_bill(bill_id):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404
    return bill.to_dict()


def update_bill(bill_id, data):
    bill = UtilityBill.query.get(bill_id)
    if not bill or bill.is_deleted:
        return {"error": "Bill not found"}, 404

    new_service = data.get("service_id", bill.service_id)
    new_year = data.get("year", bill.year)
    new_month = data.get("month", bill.month)

    # If the date/service changed, check for a conflicting soft-deleted row
    if (new_service != bill.service_id or new_year != bill.year or new_month != bill.month):
        conflict = UtilityBill.query.filter_by(
            service_id=new_service, year=new_year, month=new_month
        ).filter(UtilityBill.id != bill_id).first()
        if conflict:
            if conflict.is_deleted:
                # Remove the soft-deleted row so the unique constraint is freed
                db.session.delete(conflict)
                db.session.flush()
            else:
                return {"error": f"A bill already exists for {new_year}-{new_month:02d} on this service"}, 409

    for field in ["year", "month", "energy_usage", "max_power", "service_id"]:
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


def import_pge_bills(file_content, filename):
    """
    Import PG&E usage reports and create bills.
    
    Args:
        file_content: The file content (string or bytes)
        filename: Original filename to extract month/year
    
    Returns:
        dict with success/error counts
    """
    # Extract year and month from filename (e.g., Historical_20250501-20250531.csv)
    match = re.search(r'(\d{4})(\d{2})\d{2}', filename)
    if not match:
        return {"error": f"Cannot extract date from filename: {filename}"}, 400
    
    year = int(match.group(1))
    month = int(match.group(2))
    
    if month < 1 or month > 12:
        return {"error": f"Invalid month extracted from filename: {month}"}, 400
    
    # Parse CSV content
    if isinstance(file_content, bytes):
        file_content = file_content.decode('utf-8-sig')  # Handle BOM
    
    # Remove BOM if present
    if file_content.startswith('\ufeff'):
        file_content = file_content[1:]
    
    csv_reader = csv.DictReader(StringIO(file_content))
    
    # Normalize column names by stripping whitespace and checking actual headers
    rows = list(csv_reader)
    if not rows:
        return {"error": "CSV file is empty"}, 400
    
    # Get the actual column names from the first row
    available_columns = list(rows[0].keys()) if rows else []
    
    # Find the Account ID column (handle variations)
    account_col = None
    for col in available_columns:
        col_clean = col.strip().lower().replace(' ', '').replace('_', '')
        if col_clean == 'accountid':
            account_col = col
            break
    
    if not account_col:
        return {
            "error": f"Cannot find 'Account ID' column. Available columns: {', '.join(available_columns)}"
        }, 400
    
    # Find Usage Value column
    usage_col = None
    for col in available_columns:
        col_clean = col.strip().lower().replace(' ', '').replace('_', '')
        if col_clean == 'usagevalue':
            usage_col = col
            break
    
    # Find Interval Length column
    interval_col = None
    for col in available_columns:
        col_clean = col.strip().lower().replace(' ', '').replace('_', '')
        if col_clean == 'intervallength':
            interval_col = col
            break
    
    if not usage_col or not interval_col:
        return {
            "error": f"Cannot find required columns. Need 'Usage Value' and 'Interval Length'. Available: {', '.join(available_columns)}"
        }, 400
    
    # Group data by Account ID
    account_data = {}
    
    for row in rows:
        # Use the identified account column
        account_id = row.get(account_col, '').strip()
        if not account_id:
            continue
        
        try:
            usage_value = float(row.get(usage_col, 0))
            interval_length = int(row.get(interval_col, 15))
        except (ValueError, TypeError):
            continue
        
        if account_id not in account_data:
            account_data[account_id] = {
                'total_kwh': 0,
                'max_usage': 0,
                'interval_length': interval_length
            }
        
        account_data[account_id]['total_kwh'] += usage_value
        account_data[account_id]['max_usage'] = max(
            account_data[account_id]['max_usage'], 
            usage_value
        )
    
    # Create bills for each account
    created = 0
    updated = 0
    errors = []
    
    for account_id, data in account_data.items():
        # Find service by utility_account
        service = Service.query.filter_by(
            utility_account=account_id, 
            is_deleted=False
        ).first()
        
        if not service:
            errors.append(f"No service found for account {account_id}")
            continue
        
        # Calculate peak power (kW)
        # Interval Length is in minutes, convert to hours
        interval_hours = data['interval_length'] / 60.0
        max_power_kw = data['max_usage'] / interval_hours if interval_hours > 0 else 0
        
        # Create or update bill
        bill_data = {
            "year": year,
            "month": month,
            "energy_usage": round(data['total_kwh'], 2),
            "max_power": round(max_power_kw, 2)
        }
        
        result, status_code = create_bill(service.id, bill_data)
        
        if status_code in (200, 201):
            if status_code == 201:
                created += 1
            else:
                updated += 1
        else:
            errors.append(f"Account {account_id}: {result.get('error', 'Unknown error')}")
    
    return {
        "success": True,
        "year": year,
        "month": month,
        "created": created,
        "updated": updated,
        "errors": errors,
        "total_accounts": len(account_data)
    }, 200
