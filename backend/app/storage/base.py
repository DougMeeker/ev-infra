from typing import Optional, Tuple
from werkzeug.datastructures import FileStorage
from flask import Response

class StorageProvider:
    def save(self, file_storage: FileStorage) -> Tuple[str, int, str]:
        """
        Persist the uploaded file and return (key, size_bytes, content_type).
        key is the identifier used to retrieve/delete the file later.
        """
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError

    def get_download_url(self, key: str, ttl_seconds: int = 3600) -> Optional[str]:
        """Return a direct (possibly signed) URL to download the file, or None if not applicable."""
        return None

    def make_download_response(self, key: str, download_name: Optional[str] = None) -> Response:
        """
        Return a Flask response for downloading the file.
        Implementations may return a redirect or stream the file directly.
        """
        raise NotImplementedError

    def make_view_response(self, key: str) -> Response:
        """
        Return a Flask response for viewing the file inline (e.g., in a browser or iframe).
        Sets Content-Disposition to inline instead of attachment.
        """
        raise NotImplementedError
