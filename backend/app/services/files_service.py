from typing import Tuple
from flask import current_app
from werkzeug.datastructures import FileStorage
from ..storage.base import StorageProvider
from ..storage.local import LocalStorageProvider
from ..storage.s3 import S3StorageProvider

def allowed_extension(filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    allowed = current_app.config.get("ALLOWED_EXTENSIONS", set())
    return ext in allowed if allowed else True

def get_storage_provider() -> StorageProvider:
    provider = (current_app.config.get('STORAGE_PROVIDER') or 'local').lower()
    if provider == 's3':
        return S3StorageProvider()
    return LocalStorageProvider()

def save_uploaded_file(file_storage: FileStorage) -> Tuple[str, int, str]:
    original_name = file_storage.filename or 'upload'
    if not allowed_extension(original_name):
        raise ValueError('Unsupported file extension')
    storage = get_storage_provider()
    key, size_bytes, content_type = storage.save(file_storage)
    return key, size_bytes, content_type
