"""MCP Knowledge Base sync routes (Phase 2)."""
from flask import Blueprint, jsonify

from ..services.mcp_sync_service import (
    sync_all,
    sync_site,
    sync_project,
    get_sync_status,
)

mcp_bp = Blueprint('mcp', __name__, url_prefix='/api/mcp')


@mcp_bp.route('/sync', methods=['POST'])
def trigger_full_sync():
    result = sync_all()
    status_code = 200 if 'error' not in result else 502
    return jsonify(result), status_code


@mcp_bp.route('/sync/site/<int:site_id>', methods=['POST'])
def trigger_site_sync(site_id):
    result = sync_site(site_id)
    status_code = 200 if 'error' not in result else 502
    return jsonify(result), status_code


@mcp_bp.route('/sync/project/<int:project_id>', methods=['POST'])
def trigger_project_sync(project_id):
    result = sync_project(project_id)
    status_code = 200 if 'error' not in result else 502
    return jsonify(result), status_code


@mcp_bp.route('/status', methods=['GET'])
def status():
    return jsonify(get_sync_status()), 200
