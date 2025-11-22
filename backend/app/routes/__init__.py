from flask import Flask
from .site_routes import site_bp

def register_routes(app: Flask):
    app.register_blueprint(site_bp, url_prefix="/api/sites")
