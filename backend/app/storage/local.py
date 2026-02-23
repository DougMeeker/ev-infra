import os
import uuid
from typing import Optional, Tuple
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage
from flask import current_app, send_from_directory
from .base import StorageProvider

class LocalStorageProvider(StorageProvider):
    def _ensure_dir(self) -> str:
        upload_dir = current_app.config.get('UPLOAD_FOLDER')
        if not upload_dir:
            upload_dir = os.path.join(os.getcwd(), 'uploads')
            current_app.config['UPLOAD_FOLDER'] = upload_dir
        os.makedirs(upload_dir, exist_ok=True)
        return upload_dir

    def _generate_key(self, original_name: str) -> str:
        base = secure_filename(original_name or 'upload')
        uid = uuid.uuid4().hex
        if '.' in base:
            name, ext = base.rsplit('.', 1)
            return f"{name}_{uid}.{ext}"
        return f"{base}_{uid}"

    def save(self, file_storage: FileStorage) -> Tuple[str, int, str]:
        upload_dir = self._ensure_dir()
        key = self._generate_key(file_storage.filename or 'upload')
        path = os.path.join(upload_dir, key)
        file_storage.save(path)
        size_bytes = os.path.getsize(path)
        return key, size_bytes, file_storage.mimetype

    def delete(self, key: str) -> None:
        upload_dir = self._ensure_dir()
        try:
            os.remove(os.path.join(upload_dir, key))
        except Exception:
            pass

    def get_download_url(self, key: str, ttl_seconds: int = 3600) -> Optional[str]:
        return None

    def make_download_response(self, key: str, download_name: str = None):
        upload_dir = self._ensure_dir()
        return send_from_directory(
            upload_dir,
            key,
            as_attachment=True,
            download_name=download_name if download_name else None
        )

    def make_view_response(self, key: str):
        upload_dir = self._ensure_dir()
        return send_from_directory(
            upload_dir,
            key,
            as_attachment=False
        )
