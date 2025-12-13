import json
import os
from flask import request
from .site_routes import site_bp
from ..services.sites_geojson import process_upload_geojson, refresh_geojson_features


@site_bp.route("/upload-geojson", methods=["POST"])
def upload_geojson_sites():
    if 'file' not in request.files:
        return {"error": "No file part"}, 400
    file = request.files['file']
    if not file.filename:
        return {"error": "Empty filename"}, 400
    try:
        raw = file.stream.read().decode('utf-8', errors='ignore')
        data = json.loads(raw)
    except Exception as e:
        return {"error": f"Failed to read/parse GeoJSON: {e}"}, 400
    return process_upload_geojson(data)


@site_bp.route("/refresh-geojson", methods=["POST"])
def refresh_geojson_sites():
    # Resolve the GeoJSON path relative to workspace root
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    source = (request.args.get('source') or '').lower().strip()
    filename = request.args.get('filename')

    if filename:
        # Sanitize to avoid path traversal; only allow relative paths under workspace
        candidate = os.path.abspath(os.path.join(workspace_root, filename))
        if not candidate.startswith(workspace_root + os.sep):
            return {"error": "Invalid filename path"}, 400
        geojson_path = candidate
    else:
        if source == 'dgs':
            geojson_path = os.path.join(workspace_root, "DGS_DOT_Property.geojson")
        else:
            # default to PGE file
            geojson_path = os.path.join(workspace_root, "PGE EV Fleet Program.geojson")
    if not os.path.exists(geojson_path):
        return {"error": f"GeoJSON not found at {geojson_path}"}, 404
    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return {"error": f"Failed to read GeoJSON: {e}"}, 400

    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection':
        return {"error": "GeoJSON must be a FeatureCollection"}, 400
    features = data.get('features') or []
    if not isinstance(features, list) or not features:
        return {"error": "No features found in GeoJSON"}, 400

    try:
        tolerance_m = float(request.args.get('tolerance_m', '10'))
    except (TypeError, ValueError):
        tolerance_m = 10.0

    try:
        result, status = refresh_geojson_features(features, tolerance_m)
        # Include basic context in response for transparency
        if isinstance(result, dict):
            result.setdefault('source_file', geojson_path)
            result.setdefault('tolerance_m', tolerance_m)
            result.setdefault('total_features', len(features))
        return result, status
    except Exception as e:
        return {"error": f"Refresh failed: {e}"}, 500
