"""Routes for the Site Prioritization Model (Phase 1)."""
import csv
import io
from flask import Blueprint, jsonify, request, Response

from ..services.priority_service import (
    get_weight_profiles, get_weight_profile, create_weight_profile,
    update_weight_profile, delete_weight_profile,
    recalculate_all, get_ranked_sites, get_investigation_list, get_site_score,
)

priority_bp = Blueprint('priorities', __name__, url_prefix='/api/priorities')


# ---------------------------------------------------------------------------
# Weight profile endpoints
# ---------------------------------------------------------------------------

@priority_bp.route('/weights', methods=['GET'])
def list_weights():
    profiles = get_weight_profiles()
    return jsonify([p.to_dict() for p in profiles])


@priority_bp.route('/weights', methods=['POST'])
def create_weights():
    data = request.get_json(silent=True)
    if not data or not data.get('name'):
        return jsonify({'error': 'name is required'}), 400
    profile = create_weight_profile(data)
    return jsonify(profile.to_dict()), 201


@priority_bp.route('/weights/<int:profile_id>', methods=['PUT'])
def update_weights(profile_id):
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    profile = update_weight_profile(profile_id, data)
    if profile is None:
        return jsonify({'error': 'Profile not found'}), 404
    return jsonify(profile.to_dict())


@priority_bp.route('/weights/<int:profile_id>', methods=['DELETE'])
def delete_weights(profile_id):
    result = delete_weight_profile(profile_id)
    if result is None:
        return jsonify({'error': 'Profile not found'}), 404
    if result is False:
        return jsonify({'error': 'Cannot delete Default profile'}), 400
    return jsonify({'ok': True})


# ---------------------------------------------------------------------------
# Score endpoints
# ---------------------------------------------------------------------------

@priority_bp.route('/recalculate', methods=['POST'])
def recalculate():
    data = request.get_json(silent=True) or {}
    weight_profile_id = data.get('weight_profile_id')
    count = recalculate_all(weight_profile_id)
    # MCP sync hook (fire-and-forget)
    try:
        from ..services.mcp_sync_service import sync_priorities
        sync_priorities()
    except Exception:
        pass
    return jsonify({'recalculated': count})


@priority_bp.route('/scores', methods=['GET'])
def list_scores():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
    sort = request.args.get('sort', 'composite_score')
    order = request.args.get('order', 'desc')
    district = request.args.get('district', None, type=int)
    min_score = request.args.get('min_score', None, type=float)
    search = request.args.get('search', None, type=str)
    weight_profile_id = request.args.get('weight_profile_id', None, type=int)
    result = get_ranked_sites(
        weight_profile_id=weight_profile_id,
        page=page, per_page=per_page,
        sort=sort, order=order,
        district=district, min_score=min_score, search=search,
    )
    return jsonify(result)


@priority_bp.route('/scores/<int:site_id>', methods=['GET'])
def site_score(site_id):
    score = get_site_score(site_id)
    if not score:
        return jsonify({'error': 'Score not found — run recalculate first'}), 404
    return jsonify(score.to_dict())


@priority_bp.route('/investigation', methods=['GET'])
def investigation():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
    district = request.args.get('district', None, type=int)
    search = request.args.get('search', None, type=str)
    result = get_investigation_list(page=page, per_page=per_page,
                                    district=district, search=search)
    return jsonify(result)


# ---------------------------------------------------------------------------
# CSV Export
# ---------------------------------------------------------------------------

@priority_bp.route('/scores/export', methods=['GET'])
def export_scores():
    """Export ranked scores as CSV."""
    district = request.args.get('district', None, type=int)
    min_score = request.args.get('min_score', None, type=float)
    search = request.args.get('search', None, type=str)
    result = get_ranked_sites(page=1, per_page=10000, district=district,
                              min_score=min_score, search=search)
    return _to_csv(result['items'], 'priority_scores.csv')


@priority_bp.route('/investigation/export', methods=['GET'])
def export_investigation():
    """Export investigation list as CSV."""
    district = request.args.get('district', None, type=int)
    search = request.args.get('search', None, type=str)
    result = get_investigation_list(page=1, per_page=10000,
                                    district=district, search=search)
    return _to_csv(result['items'], 'investigation_list.csv')


def _to_csv(rows, filename):
    if not rows:
        return Response('', mimetype='text/csv',
                        headers={'Content-Disposition': f'attachment; filename={filename}'})
    si = io.StringIO()
    writer = csv.DictWriter(si, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return Response(si.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': f'attachment; filename={filename}'})
