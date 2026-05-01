import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///evinfra.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Database connection pool settings to handle stale connections
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,  # Test connections before using them
        "pool_recycle": 3600,   # Recycle connections after 1 hour
        "pool_size": 10,         # Maximum number of permanent connections
        "max_overflow": 20,      # Maximum number of temporary connections
        "pool_timeout": 30,      # Timeout for getting a connection from pool
    }
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

    # ── OIDC Authentication (Authelia or any standards-compliant provider) ─
    # Set OIDC_ENABLED=true to enforce JWT validation on all /api/ routes.
    # When disabled (default for local dev), all routes are open.
    OIDC_ENABLED = os.getenv("OIDC_ENABLED", "false").lower() == "true"
    # Base URL of the OIDC issuer (e.g. https://auth.example.com)
    OIDC_ISSUER = os.getenv("OIDC_ISSUER", "")
    # Client ID registered with the OIDC provider
    OIDC_CLIENT_ID = os.getenv("OIDC_CLIENT_ID", "")
    # Audience claim to validate – defaults to client ID
    OIDC_AUDIENCE = os.getenv("OIDC_AUDIENCE", "") or os.getenv("OIDC_CLIENT_ID", "")
    # JWKS URI is auto-derived from issuer but can be overridden
    _oidc_issuer = os.getenv("OIDC_ISSUER", "").rstrip("/")
    OIDC_JWKS_URI = os.getenv(
        "OIDC_JWKS_URI",
        f"{_oidc_issuer}/.well-known/jwks.json" if _oidc_issuer else "",
    )

    # ── MCP Knowledge Base Sync ──────────────────────────────────────
    MCP_PGVECTOR_URL = os.getenv("MCP_PGVECTOR_URL", "http://127.0.0.1:8000")
    MCP_API_KEY = os.getenv("MCP_API_KEY", "")
    MCP_SYNC_ENABLED = os.getenv("MCP_SYNC_ENABLED", "false").lower() == "true"

class DevelopmentConfig(Config):
    DEBUG = True
    
class ProductionConfig(Config):
    DEBUG = False

class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    OIDC_ENABLED = False  # auth always off in tests
    MCP_SYNC_ENABLED = False   # sync off in tests

def get_config(env):
    return {
        "default": DevelopmentConfig,
        "development": DevelopmentConfig,
        "production": ProductionConfig,
        "testing": TestingConfig,
    }.get(env, DevelopmentConfig)
