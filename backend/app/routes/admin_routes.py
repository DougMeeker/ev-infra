"""
Admin routes – user role management.

All endpoints require the 'admin' role.

Endpoints
---------
GET    /api/admin/roles              List all role assignments
POST   /api/admin/roles              Create a role assignment
GET    /api/admin/roles/<id>         Get one role assignment
PUT    /api/admin/roles/<id>         Update a role assignment
DELETE /api/admin/roles/<id>         Delete a role assignment
"""

from flask import Blueprint, jsonify, request
from ..auth import require_role
from ..extensions import db
from ..models import UserRole, Site

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

VALID_ROLES = {"admin", "hq", "district", "site"}


@admin_bp.route("/roles", methods=["GET"])
@require_role("admin")
def list_roles():
    """Return all role assignments, optionally filtered by username."""
    username = request.args.get("username", "").strip()
    q = UserRole.query
    if username:
        q = q.filter_by(username=username)
    return jsonify([r.to_dict() for r in q.order_by(UserRole.username).all()])


@admin_bp.route("/roles", methods=["POST"])
@require_role("admin")
def create_role():
    """
    Assign a role to a user.

    Body (JSON):
      { username, role, district?, site_id? }

    - role='district' requires district (integer)
    - role='site'     requires site_id (integer)
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    role = data.get("role", "").strip()

    if not username or not role:
        return jsonify({"error": "username and role are required"}), 400

    if role not in VALID_ROLES:
        return jsonify({"error": f"role must be one of: {', '.join(sorted(VALID_ROLES))}"}), 400

    district = data.get("district")
    site_id = data.get("site_id")

    if role == "district":
        if district is None:
            return jsonify({"error": "district is required for role='district'"}), 400
        try:
            district = int(district)
        except (TypeError, ValueError):
            return jsonify({"error": "district must be an integer"}), 400
        site_id = None

    elif role == "site":
        if site_id is None:
            return jsonify({"error": "site_id is required for role='site'"}), 400
        try:
            site_id = int(site_id)
        except (TypeError, ValueError):
            return jsonify({"error": "site_id must be an integer"}), 400
        if not Site.query.get(site_id):
            return jsonify({"error": "site not found"}), 400
        district = None

    else:
        # admin / hq – district and site_id are not meaningful
        district = None
        site_id = None

    row = UserRole(username=username, role=role, district=district, site_id=site_id)
    db.session.add(row)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to create role: {e}"}), 500

    return jsonify(row.to_dict()), 201


@admin_bp.route("/roles/<int:role_id>", methods=["GET"])
@require_role("admin")
def get_role(role_id):
    row = UserRole.query.get(role_id)
    if not row:
        return jsonify({"error": "Role assignment not found"}), 404
    return jsonify(row.to_dict())


@admin_bp.route("/roles/<int:role_id>", methods=["PUT"])
@require_role("admin")
def update_role(role_id):
    """Update an existing role assignment (replace all fields)."""
    row = UserRole.query.get(role_id)
    if not row:
        return jsonify({"error": "Role assignment not found"}), 404

    data = request.get_json(silent=True) or {}
    role = data.get("role", row.role).strip()

    if role not in VALID_ROLES:
        return jsonify({"error": f"role must be one of: {', '.join(sorted(VALID_ROLES))}"}), 400

    district = data.get("district")
    site_id = data.get("site_id")

    if role == "district":
        if district is None:
            return jsonify({"error": "district is required for role='district'"}), 400
        district = int(district)
        site_id = None
    elif role == "site":
        if site_id is None:
            return jsonify({"error": "site_id is required for role='site'"}), 400
        site_id = int(site_id)
        if not Site.query.get(site_id):
            return jsonify({"error": "site not found"}), 400
        district = None
    else:
        district = None
        site_id = None

    row.role = role
    row.district = district
    row.site_id = site_id
    if "username" in data:
        row.username = data["username"].strip()

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to update role: {e}"}), 500

    return jsonify(row.to_dict())


@admin_bp.route("/roles/<int:role_id>", methods=["DELETE"])
@require_role("admin")
def delete_role(role_id):
    row = UserRole.query.get(role_id)
    if not row:
        return jsonify({"error": "Role assignment not found"}), 404
    db.session.delete(row)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete role: {e}"}), 500
    return jsonify({"message": "Role assignment deleted", "id": role_id})
