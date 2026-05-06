"""
Auth routes – user profile and self-service registration.
"""

from flask import Blueprint, g, jsonify, request, current_app
from ..email_utils import send_verification_email
from ..services.registration_service import register_user, verify_registration, resend_verification_token

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/me", methods=["GET"])
def me():
    """Return the current user's claims from the validated token.

    Does NOT use @require_auth so that it degrades gracefully when the
    access token is expired or fails validation — the frontend receives
    role=null rather than a 401 that hides all edit controls.
    """
    claims = getattr(g, "user_claims", None)
    if claims is None:
        return jsonify({
            "authenticated": False,
            "auth_enabled": current_app.config.get("OIDC_ENABLED", False),
            "name": "Local Developer",
            "email": "dev@localhost",
            "roles": [],
            "role": None,
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

    sent = send_verification_email(current_app._get_current_object(), email, display_name, verify_url)
    if not sent:
        # Email delivery failed — log the URL so an admin can retrieve it from journalctl
        import logging
        logging.getLogger(__name__).warning(
            "Verification email failed for %s. Manual verify URL: %s", email, verify_url
        )

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


@auth_bp.route("/resend-verification", methods=["POST"])
def resend_verification():
    """
    Re-send the account verification email for a pending registration.

    Body (JSON): { email }
    Always returns 200 to avoid leaking whether an email is registered.
    """
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    ok, result = resend_verification_token(email)
    if ok:
        token = result
        frontend_url = current_app.config.get("FRONTEND_URL", "").rstrip("/")
        verify_url = f"{frontend_url}/verify-email?token={token}"

        # Look up display name for the email
        from ..models import PendingRegistration
        record = PendingRegistration.query.filter_by(email=email).first()
        display_name = record.display_name if record else email

        sent = send_verification_email(current_app._get_current_object(), email, display_name, verify_url)
        if not sent:
            import logging
            logging.getLogger(__name__).warning(
                "Resend verification email failed for %s. Manual verify URL: %s", email, verify_url
            )

    # Always return the same response (no enumeration)
    return jsonify({
        "message": "If that email has a pending registration, a new verification link has been sent."
    }), 200
