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
from .files_routes import files_bp
from .service_routes import bp as service_bp

def register_routes(app: Flask):
    # site_bp already has url_prefix in its declaration
    app.register_blueprint(site_bp)
    app.register_blueprint(catalog_bp, url_prefix="/api/catalog")
    app.register_blueprint(project_bp)
    app.register_blueprint(fleet_bp, url_prefix="/api/fleet")
    app.register_blueprint(department_bp, url_prefix="/api/departments")
    app.register_blueprint(files_bp)
    app.register_blueprint(service_bp)

    # Provide a simple API root/health response to avoid 404 on /api/
    def _api_root():
        return {"status": "ok", "service": "ev-infra-backend"}, 200
    app.add_url_rule("/api/", endpoint="api_root", view_func=_api_root, methods=["GET"]) 
    app.add_url_rule("/api/health", endpoint="api_health", view_func=_api_root, methods=["GET"]) 
