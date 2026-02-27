"""
Auth routes – provides /api/auth/me so the frontend can fetch the current
user's profile after authenticating with MSAL.
"""

from flask import Blueprint, g, jsonify, current_app
from ..auth import require_auth

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    """Return the current user's claims from the validated token."""
    claims = getattr(g, "user_claims", None)
    if claims is None:
        # Auth is disabled – return a stub so the frontend still works
        return jsonify({
            "authenticated": False,
            "auth_enabled": current_app.config.get("AZURE_AD_ENABLED", False),
            "name": "Local Developer",
            "email": "dev@localhost",
            "roles": [],
        })

    return jsonify({
        "authenticated": True,
        "auth_enabled": True,
        "oid": claims.get("oid"),
        "name": claims.get("name", ""),
        "email": claims.get("preferred_username", claims.get("email", "")),
        "roles": claims.get("roles", []),
        "tenant_id": claims.get("tid", ""),
    })
