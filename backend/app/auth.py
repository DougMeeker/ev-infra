"""
Microsoft Entra ID (Azure AD) JWT validation for Flask.

Provides:
- `require_auth` – decorator to protect individual routes
- `init_auth(app)` – registers a `before_request` hook on all /api/ routes

When AZURE_AD_ENABLED is False (default for local dev), authentication is
completely bypassed so the app keeps working without any Azure setup.
"""

import functools
import time
from typing import Optional

import jwt
import requests
from flask import current_app, g, jsonify, request


# ── JWKS key cache (in-memory) ──────────────────────────────────────

_jwks_cache: dict = {"keys": [], "fetched_at": 0}
_JWKS_TTL = 3600  # re-fetch signing keys every hour


def _get_signing_keys() -> list[dict]:
    """Fetch (and cache) the JSON Web Key Set from Microsoft."""
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL:
        return _jwks_cache["keys"]

    jwks_uri = current_app.config["AZURE_AD_JWKS_URI"]
    resp = requests.get(jwks_uri, timeout=10)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return keys


def _get_public_key(token: str):
    """Match the token's `kid` header to a key in the JWKS."""
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    for key_data in _get_signing_keys():
        if key_data["kid"] == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
    # Key not found – force refresh once in case keys rotated
    _jwks_cache["fetched_at"] = 0
    for key_data in _get_signing_keys():
        if key_data["kid"] == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
    return None


# ── Token validation ─────────────────────────────────────────────────

def _validate_token(token: str) -> Optional[dict]:
    """
    Validate a Microsoft Entra ID access token.

    Returns the decoded claims dict on success, or None on failure.
    """
    public_key = _get_public_key(token)
    if public_key is None:
        return None

    audience = current_app.config["AZURE_AD_AUDIENCE"]
    issuer = current_app.config["AZURE_AD_ISSUER"]

    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iss", "aud"]},
        )
        return claims
    except jwt.PyJWTError:
        return None


# ── Helpers to read the current user from g ──────────────────────────

def get_current_user() -> Optional[dict]:
    """Return the validated token claims from `g`, or None."""
    return getattr(g, "user_claims", None)


# ── Decorator for individual routes ─────────────────────────────────

def require_auth(fn):
    """Decorator: reject the request with 401 if there is no valid token."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_app.config.get("AZURE_AD_ENABLED"):
            return fn(*args, **kwargs)

        if not getattr(g, "user_claims", None):
            return jsonify({"error": "Authentication required"}), 401
        return fn(*args, **kwargs)
    return wrapper


# ── App-level before_request hook ────────────────────────────────────

def _before_api_request():
    """
    Run before every request to /api/*.

    - Extracts the Bearer token from the Authorization header.
    - Validates it and stores claims on ``g.user_claims``.
    - If auth is disabled, does nothing (all requests pass through).
    - Health / root endpoints are always public.
    """
    # Skip if auth is not turned on
    if not current_app.config.get("AZURE_AD_ENABLED"):
        return None

    # Allow health-check endpoints without auth
    if request.path in ("/api/", "/api/health"):
        return None

    # Allow CORS preflight
    if request.method == "OPTIONS":
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Missing or invalid Authorization header"}), 401

    token = auth_header[7:]
    claims = _validate_token(token)
    if claims is None:
        return jsonify({"error": "Invalid or expired token"}), 401

    # Attach claims for downstream use
    g.user_claims = claims
    return None


def init_auth(app):
    """Register the authentication before_request hook on the Flask app."""
    app.before_request(_before_api_request)
