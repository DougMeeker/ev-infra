from flask import Flask
from .site_routes import site_bp
# Import route modules that attach endpoints to site_bp
from .site_core_routes import *  # noqa: F401,F403
from .equipment_routes import *  # noqa: F401,F403
from .charger_routes import *    # noqa: F401,F403
from .bill_routes import *       # noqa: F401,F403
from .site_geojson_routes import *  # noqa: F401,F403
from .catalog_routes import catalog_bp
from .project_routes import project_bp
from .fleet_routes import fleet_bp
from .department_routes import department_bp

def register_routes(app: Flask):
    # site_bp already has url_prefix in its declaration
    app.register_blueprint(site_bp)
    app.register_blueprint(catalog_bp, url_prefix="/api/catalog")
    app.register_blueprint(project_bp)
    app.register_blueprint(fleet_bp, url_prefix="/api/fleet")
    app.register_blueprint(department_bp, url_prefix="/api/departments")
