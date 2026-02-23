from typing import Tuple, Optional
from flask import current_app
from werkzeug.datastructures import FileStorage
from ..storage.base import StorageProvider
from ..storage.local import LocalStorageProvider
from ..storage.s3 import S3StorageProvider
from datetime import datetime
import io

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

def extract_file_creation_date(file_storage: FileStorage) -> Optional[datetime]:
    """
    Extract the original creation/capture date from file metadata.
    For images: tries to extract EXIF DateTimeOriginal or DateTime
    Returns None if unable to extract or if not an image.
    """
    content_type = file_storage.content_type or ''
    if not content_type.startswith('image/'):
        return None
    
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
        
        # Read the file into memory
        file_storage.stream.seek(0)
        image_data = file_storage.stream.read()
        file_storage.stream.seek(0)  # Reset for later use
        
        # Open image with PIL
        image = Image.open(io.BytesIO(image_data))
        
        # Extract EXIF data
        exif_data = image._getexif()
        if not exif_data:
            return None
        
        # Look for date fields in order of preference
        date_tags = [
            36867,  # DateTimeOriginal - when photo was taken
            36868,  # DateTimeDigitized - when photo was digitized
            306,    # DateTime - last modified
        ]
        
        for tag_id in date_tags:
            if tag_id in exif_data:
                date_str = exif_data[tag_id]
                if isinstance(date_str, str):
                    try:
                        # EXIF dates are typically in format: "YYYY:MM:DD HH:MM:SS"
                        return datetime.strptime(date_str, '%Y:%m:%d %H:%M:%S')
                    except ValueError:
                        continue
        
        return None
    except Exception as e:
        # If PIL is not installed or any error occurs, just return None
        current_app.logger.debug(f"Could not extract EXIF date: {e}")
        return None

def save_uploaded_file(file_storage: FileStorage) -> Tuple[str, int, str, Optional[datetime]]:
    original_name = file_storage.filename or 'upload'
    if not allowed_extension(original_name):
        raise ValueError('Unsupported file extension')
    
    # Extract file creation date before saving
    file_created_at = extract_file_creation_date(file_storage)
    
    storage = get_storage_provider()
    key, size_bytes, content_type = storage.save(file_storage)
    return key, size_bytes, content_type, file_created_at
