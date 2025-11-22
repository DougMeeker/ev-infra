from flask import Flask
from flask_cors import CORS
from .config import get_config
from .extensions import db, cors
from .routes import register_routes

def create_app(config_name="default"):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    # Allow CORS from React frontend
    CORS(app, supports_credentials=True, origins=["http://localhost:3000"])

    # Initialize extensions
    db.init_app(app)

    # Register blueprints
    register_routes(app)

    return app
