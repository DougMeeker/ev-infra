from flask import Blueprint, request, jsonify, current_app
from sqlalchemy.exc import SQLAlchemyError
from ..extensions import db
from ..models import File, Site
from ..services.files_service import save_uploaded_file, get_storage_provider
import os

files_bp = Blueprint('files', __name__, url_prefix='/api/files')

@files_bp.route('/', methods=['GET'])
def list_files():
    q = request.args.get('q', '').strip()
    site_id = request.args.get('site_id')
    query = File.query
    if q:
        query = query.filter(File.original_name.ilike(f'%{q}%'))
    if site_id:
        try:
            sid = int(site_id)
            query = query.join(File.sites).filter(Site.id == sid)
        except ValueError:
            pass
    files = query.order_by(File.uploaded_at.desc()).all()
    return jsonify([f.to_dict(include_sites=True) for f in files])

@files_bp.route('/upload', methods=['POST'])
def upload_file():
    file = request.files.get('file')
    description = request.form.get('description')
    site_ids_raw = request.form.get('site_ids', '')
    site_ids = []
    if site_ids_raw:
        try:
            site_ids = [int(s) for s in site_ids_raw.split(',') if s]
        except Exception:
            return jsonify({'error': 'Invalid site_ids format'}), 400

    if not file:
        return jsonify({'error': 'No file provided'}), 400

    try:
        stored_name, size_bytes, content_type, file_created_at = save_uploaded_file(file)
        new_file = File(
            original_name=file.filename,
            stored_name=stored_name,
            content_type=content_type or file.mimetype,
            size_bytes=size_bytes,
            description=description,
            file_created_at=file_created_at
        )
        if site_ids:
            linked_sites = Site.query.filter(Site.id.in_(site_ids)).all()
            new_file.sites = linked_sites
        db.session.add(new_file)
        db.session.commit()
        return jsonify(new_file.to_dict(include_sites=True)), 201
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except SQLAlchemyError as e:
        db.session.rollback()
        return jsonify({'error': 'Database error', 'detail': str(e)}), 500

@files_bp.route('/<int:file_id>', methods=['PUT', 'PATCH'])
def update_file(file_id: int):
    f = File.query.get_or_404(file_id)
    payload = request.get_json(silent=True) or {}
    original_name = payload.get('original_name')
    description = payload.get('description')
    changed = False
    if isinstance(original_name, str) and original_name.strip():
        f.original_name = original_name.strip()
        changed = True
    if isinstance(description, str):
        f.description = description
        changed = True
    if not changed:
        return jsonify({'error': 'No valid fields to update'}), 400
    db.session.commit()
    return jsonify(f.to_dict(include_sites=True)), 200

@files_bp.route('/<int:file_id>/download', methods=['GET'])
def download_file(file_id: int):
    try:
        f = File.query.get_or_404(file_id)
    except SQLAlchemyError as e:
        current_app.logger.error(f"Database error fetching file {file_id}: {e}")
        db.session.rollback()
        return jsonify({'error': 'Database connection error', 'detail': str(e)}), 500
    
    storage = get_storage_provider()
    # Let provider decide whether to stream locally or redirect to signed URL
    try:
        # Prefer passing a friendly filename when supported
        resp = storage.make_download_response(f.stored_name, download_name=f.original_name)
    except TypeError:
        # Older providers without download_name support
        resp = storage.make_download_response(f.stored_name)
    # Some providers may not set Content-Disposition filename; we can adjust if needed
    return resp

@files_bp.route('/<int:file_id>/view', methods=['GET'])
def view_file(file_id: int):
    try:
        f = File.query.get_or_404(file_id)
    except SQLAlchemyError as e:
        current_app.logger.error(f"Database error fetching file {file_id}: {e}")
        db.session.rollback()
        return jsonify({'error': 'Database connection error', 'detail': str(e)}), 500
    
    storage = get_storage_provider()
    # Serve file with inline content-disposition for viewing in browser/iframe
    return storage.make_view_response(f.stored_name)

@files_bp.route('/<int:file_id>/sites', methods=['POST'])
def assign_file_sites(file_id: int):
    f = File.query.get_or_404(file_id)
    payload = request.get_json(silent=True) or {}
    site_ids = payload.get('site_ids') or []
    if not isinstance(site_ids, list):
        return jsonify({'error': 'site_ids must be a list'}), 400
    sites = Site.query.filter(Site.id.in_(site_ids)).all()
    # Merge unique
    existing_ids = {s.id for s in f.sites}
    for s in sites:
        if s.id not in existing_ids:
            f.sites.append(s)
    db.session.commit()
    return jsonify(f.to_dict(include_sites=True)), 200

@files_bp.route('/<int:file_id>/sites/<int:site_id>', methods=['DELETE'])
def unassign_file_site(file_id: int, site_id: int):
    f = File.query.get_or_404(file_id)
    f.sites = [s for s in f.sites if s.id != site_id]
    db.session.commit()
    return jsonify(f.to_dict(include_sites=True)), 200

@files_bp.route('/<int:file_id>', methods=['DELETE'])
def delete_file(file_id: int):
    f = File.query.get_or_404(file_id)
    # Delete via storage provider (handles local or S3/MinIO)
    try:
        storage = get_storage_provider()
        storage.delete(f.stored_name)
    except Exception:
        pass
    db.session.delete(f)
    db.session.commit()
    return jsonify({'status': 'deleted', 'id': file_id}), 200

# Site-scoped listing
@files_bp.route('/by-site/<int:site_id>', methods=['GET'])
def list_files_by_site(site_id: int):
    site = Site.query.get_or_404(site_id)
    return jsonify([f.to_dict() for f in site.files])
