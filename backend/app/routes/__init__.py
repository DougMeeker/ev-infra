from flask import Flask
from .site_routes import site_bp
from .catalog_routes import catalog_bp
from .project_routes import project_bp
from .fleet_routes import fleet_bp
from .department_routes import department_bp

def register_routes(app: Flask):
    app.register_blueprint(site_bp, url_prefix="/api/sites")
    app.register_blueprint(catalog_bp, url_prefix="/api/catalog")
    app.register_blueprint(project_bp)
    app.register_blueprint(fleet_bp, url_prefix="/api/fleet")
    app.register_blueprint(department_bp, url_prefix="/api/departments")
