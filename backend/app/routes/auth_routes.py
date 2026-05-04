"""
Auth routes – user profile and self-service registration.
"""

from flask import Blueprint, g, jsonify, request, current_app
from ..auth import require_auth
from ..email_utils import send_verification_email
from ..services.registration_service import register_user, verify_registration

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    """Return the current user's claims from the validated token."""
    claims = getattr(g, "user_claims", None)
    if claims is None:
        return jsonify({
            "authenticated": False,
            "auth_enabled": current_app.config.get("OIDC_ENABLED", False),
            "name": "Local Developer",
            "email": "dev@localhost",
            "roles": [],
        })

    from ..auth import get_user_role
    role_row = get_user_role()

    return jsonify({
        "authenticated": True,
        "auth_enabled": True,
        "sub": claims.get("sub"),
        "name": claims.get("name", ""),
        "email": claims.get("preferred_username", claims.get("email", "")),
        "role": role_row.role if role_row else None,
        "district": role_row.district if role_row else None,
        "site_id": role_row.site_id if role_row else None,
    })


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    Create a pending registration and send a verification email.

    Body (JSON): { username, display_name, email, password }
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    display_name = data.get("display_name", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not all([username, display_name, email, password]):
        return jsonify({"error": "All fields are required"}), 400

    ok, result = register_user(username, display_name, email, password)
    if not ok:
        return jsonify({"error": result}), 400

    token = result
    frontend_url = current_app.config.get("FRONTEND_URL", "").rstrip("/")
    verify_url = f"{frontend_url}/verify-email?token={token}"

    send_verification_email(current_app._get_current_object(), email, display_name, verify_url)

    return jsonify({
        "message": "Registration submitted. Please check your email to verify your account."
    }), 201


@auth_bp.route("/verify-email", methods=["GET"])
def verify_email():
    """
    Confirm a registration token and activate the account.

    Query param: token
    """
    token = request.args.get("token", "").strip()
    if not token:
        return jsonify({"error": "Missing verification token"}), 400

    ok, error = verify_registration(token)
    if not ok:
        return jsonify({"error": error}), 400

    return jsonify({"message": "Email verified. You can now sign in."}), 200
