from typing import Optional, Tuple
from werkzeug.datastructures import FileStorage
from flask import current_app, redirect, Response, stream_with_context
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
        
        # For MinIO, we need to configure boto3 properly
        boto_config = BotoConfig(
            signature_version='s3v4',
            s3={
                'addressing_style': 'path'  # MinIO requires path-style addressing
            }
        )
        
        self.client = boto3.client(
            's3',
            endpoint_url=self.endpoint_url,
            region_name=self.region_name,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            use_ssl=use_ssl,
            config=boto_config
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

    def _proxy_response(self, key: str, content_disposition: str, download_name: str = None) -> Response:
        """Stream object bytes from MinIO/S3 through the backend.

        This avoids mixed-content errors when the MinIO endpoint is HTTP and
        the app is served over HTTPS – the browser only ever contacts the
        HTTPS backend, which fetches from MinIO internally.
        """
        try:
            s3_resp = self.client.get_object(Bucket=self.bucket, Key=key)
            content_type = s3_resp.get('ContentType', 'application/octet-stream')
            content_length = s3_resp.get('ContentLength')
            body = s3_resp['Body']

            if download_name and content_disposition == 'attachment':
                disp = f'attachment; filename="{download_name}"'
            elif download_name:
                disp = f'inline; filename="{download_name}"'
            else:
                disp = content_disposition

            headers = {
                'Content-Disposition': disp,
                'Cache-Control': 'private, max-age=3600',
            }
            if content_length is not None:
                headers['Content-Length'] = str(content_length)

            return Response(
                stream_with_context(body.iter_chunks(chunk_size=65536)),
                status=200,
                headers=headers,
                content_type=content_type,
            )
        except Exception:
            from flask import abort
            abort(404)

    def make_download_response(self, key: str, download_name: str = None):
        return self._proxy_response(key, 'attachment', download_name=download_name)

    def make_view_response(self, key: str):
        return self._proxy_response(key, 'inline')
