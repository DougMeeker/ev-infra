from flask import Flask
import os
from flask_cors import CORS
from .config import get_config
from .extensions import db, cors
from .routes import register_routes
from .routes.vehicles_routes import vehicles_bp

def create_app(config_name="default"):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    # Allow CORS from React frontend
    CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

    # Initialize extensions
    db.init_app(app)

    # Register blueprints
    register_routes(app)
    app.register_blueprint(vehicles_bp, url_prefix='/api/vehicles')

    # Ensure upload directory exists
    upload_folder = app.config.get('UPLOAD_FOLDER') or os.path.join(app.instance_path, 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder

    return app
