import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///evinfra.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # File uploads
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", os.path.join(os.getcwd(), "uploads"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(100 * 1024 * 1024)))  # 100 MB
    ALLOWED_EXTENSIONS = set(
        os.getenv(
            "ALLOWED_EXTENSIONS",
            "pdf,doc,docx,xls,xlsx,csv,txt,json,geojson,png,jpg,jpeg"
        ).replace(" ", "").split(",")
    )
    # Storage provider: local | s3 (S3-compatible e.g., MinIO)
    STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local")
    # S3/MinIO settings
    S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")
    S3_REGION_NAME = os.getenv("S3_REGION_NAME", "us-east-1")
    S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
    S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")
    S3_BUCKET = os.getenv("S3_BUCKET", "evinfra-uploads")
    S3_USE_SSL = os.getenv("S3_USE_SSL", "false").lower() == "true"
    SIGNED_URL_TTL = int(os.getenv("SIGNED_URL_TTL", "3600"))

    # ── Microsoft Entra ID (Azure AD) authentication ──────────────────
    # Set AZURE_AD_ENABLED=true to enforce JWT validation on API routes.
    # When disabled (default for local dev), all routes are open.
    AZURE_AD_ENABLED = os.getenv("AZURE_AD_ENABLED", "false").lower() == "true"
    # Tenant ID – use Caltrans tenant; set to "common" for multi-tenant later
    AZURE_AD_TENANT_ID = os.getenv("AZURE_AD_TENANT_ID", "")
    # Application (client) ID registered in Entra ID
    AZURE_AD_CLIENT_ID = os.getenv("AZURE_AD_CLIENT_ID", "")
    # Optional: allowed audience(s); defaults to client ID
    AZURE_AD_AUDIENCE = os.getenv("AZURE_AD_AUDIENCE", "") or os.getenv("AZURE_AD_CLIENT_ID", "")
    # JWKS URI is auto-derived but can be overridden
    AZURE_AD_JWKS_URI = os.getenv(
        "AZURE_AD_JWKS_URI",
        f"https://login.microsoftonline.com/{os.getenv('AZURE_AD_TENANT_ID', 'common')}/discovery/v2.0/keys",
    )
    AZURE_AD_ISSUER = os.getenv(
        "AZURE_AD_ISSUER",
        f"https://login.microsoftonline.com/{os.getenv('AZURE_AD_TENANT_ID', 'common')}/v2.0",
    )

class DevelopmentConfig(Config):
    DEBUG = True
    
class ProductionConfig(Config):
    DEBUG = False

class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    AZURE_AD_ENABLED = False  # auth always off in tests

def get_config(env):
    return {
        "default": DevelopmentConfig,
        "development": DevelopmentConfig,
        "production": ProductionConfig,
        "testing": TestingConfig,
    }.get(env, DevelopmentConfig)
