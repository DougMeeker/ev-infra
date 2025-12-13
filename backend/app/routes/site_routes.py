from flask import Blueprint

site_bp = Blueprint('sites', __name__, url_prefix='/api/sites')

"""
Shared blueprint declaration for site routes. Endpoints are registered
in sibling modules (e.g., site_core_routes.py, equipment_routes.py, etc.).
"""
