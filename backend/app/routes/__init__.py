from flask import Flask
from .site_routes import site_bp
from .catalog_routes import catalog_bp
from .project_routes import project_bp

def register_routes(app: Flask):
    app.register_blueprint(site_bp, url_prefix="/api/sites")
    app.register_blueprint(catalog_bp, url_prefix="/api/catalog")
    app.register_blueprint(project_bp)
