from flask import Flask
from werkzeug.exceptions import RequestEntityTooLarge
import os
from flask_cors import CORS
from .config import get_config
from .extensions import db, cors
from .auth import init_auth
from .routes import register_routes
from .routes.vehicles_routes import vehicles_bp
from .routes.auth_routes import auth_bp

def create_app(config_name="default"):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    # Allow CORS from React frontend
    CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

    # Initialize extensions
    db.init_app(app)

    # Authentication (Microsoft Entra ID / Azure AD)
    init_auth(app)

    # Register blueprints
    register_routes(app)
    app.register_blueprint(vehicles_bp, url_prefix='/api/vehicles')
    app.register_blueprint(auth_bp)

    # Ensure upload directory exists
    upload_folder = app.config.get('UPLOAD_FOLDER') or os.path.join(app.instance_path, 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder

    # Friendly JSON error for oversized uploads
    @app.errorhandler(RequestEntityTooLarge)
    def handle_file_too_large(e):
        return {
            "error": "File too large",
            "max_bytes": app.config.get("MAX_CONTENT_LENGTH"),
        }, 413

    return app
