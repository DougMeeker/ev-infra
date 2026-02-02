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

class DevelopmentConfig(Config):
    DEBUG = True
    
class ProductionConfig(Config):
    DEBUG = False

def get_config(env):
    return {
        "default": DevelopmentConfig,
        "development": DevelopmentConfig,
        "production": ProductionConfig
    }.get(env, DevelopmentConfig)
