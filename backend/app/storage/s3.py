from typing import Optional, Tuple
from werkzeug.datastructures import FileStorage
from flask import current_app, redirect
from .base import StorageProvider

import boto3
from botocore.config import Config as BotoConfig

class S3StorageProvider(StorageProvider):
    def __init__(self):
        cfg = current_app.config
        self.endpoint_url = cfg.get('S3_ENDPOINT_URL')
        self.region_name = cfg.get('S3_REGION_NAME')
        self.access_key = cfg.get('S3_ACCESS_KEY')
        self.secret_key = cfg.get('S3_SECRET_KEY')
        self.bucket = cfg.get('S3_BUCKET')
        use_ssl = bool(cfg.get('S3_USE_SSL'))
        self.client = boto3.client(
            's3',
            endpoint_url=self.endpoint_url,
            region_name=self.region_name,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            use_ssl=use_ssl,
            config=BotoConfig(signature_version='s3v4')
        )

    def _choose_key(self, original_name: str) -> str:
        # Use a UUID suffix to avoid collisions
        import uuid
        from werkzeug.utils import secure_filename
        base = secure_filename(original_name or 'upload')
        uid = uuid.uuid4().hex
        if '.' in base:
            name, ext = base.rsplit('.', 1)
            return f"{name}_{uid}.{ext}"
        return f"{base}_{uid}"

    def save(self, file_storage: FileStorage) -> Tuple[str, int, str]:
        key = self._choose_key(file_storage.filename or 'upload')
        body = file_storage.stream.read()
        self.client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType=file_storage.mimetype)
        size_bytes = len(body)
        return key, size_bytes, file_storage.mimetype

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            pass

    def get_download_url(self, key: str, ttl_seconds: int = 3600) -> Optional[str]:
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': key},
                ExpiresIn=int(ttl_seconds)
            )
            return url
        except Exception:
            return None

    def make_download_response(self, key: str, download_name: str = None):
        url = self.get_download_url(key, current_app.config.get('SIGNED_URL_TTL', 3600))
        if not url:
            # Fallback to 404-like behavior if URL generation fails
            from flask import abort
            abort(404)
        return redirect(url)
