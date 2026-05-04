"""
OIDC JWT validation and role-based access control for Flask.

Compatible with Authelia and any standards-compliant OIDC provider that
issues RS256-signed access tokens.

Provides:
- `require_auth`       - decorator: rejects request with 401 if no valid token
- `require_role(*roles)` - decorator: rejects request with 403 unless the user
                           has one of the named roles (admin / hq / district / site)
- `can_edit_site(site_id)` - returns True if the current user may mutate a site
- `get_current_user()` - returns validated token claims from `g`
- `get_user_role()`    - returns the UserRole row for the current user (or None)
- `init_auth(app)`     - registers a `before_request` hook on all /api/ routes

When OIDC_ENABLED is False (default for local dev), authentication and all
role checks are completely bypassed so the app works without any OIDC setup.
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
    """Fetch (and cache) the JSON Web Key Set from the OIDC provider."""
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL:
        return _jwks_cache["keys"]

    jwks_uri = current_app.config["OIDC_JWKS_URI"]
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
    Validate an OIDC access token (RS256).

    Returns the decoded claims dict on success, or None on failure.
    """
    public_key = _get_public_key(token)
    if public_key is None:
        return None

    audience = current_app.config["OIDC_AUDIENCE"]
    issuer = current_app.config["OIDC_ISSUER"]

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


# ── Role loading ─────────────────────────────────────────────────────

def _load_user_role():
    """
    Load the UserRole row for the current token's subject (``g.user_claims['sub']``)
    and attach it to ``g.user_role``.  No-ops if auth is disabled or no token.
    """
    claims = getattr(g, "user_claims", None)
    if claims is None:
        return
    username = claims.get("sub")
    if not username:
        return
    from .models import UserRole
    g.user_role = UserRole.query.filter_by(username=username).first()


# ── Public helpers ────────────────────────────────────────────────────

def get_current_user() -> Optional[dict]:
    """Return the validated token claims from `g`, or None."""
    return getattr(g, "user_claims", None)


def get_user_role():
    """Return the UserRole for the current user, or None (no role assigned)."""
    return getattr(g, "user_role", None)


def can_edit_site(site_id: int) -> bool:
    """
    Return True if the current user is allowed to mutate the given site.

    Rules
    -----
    - auth disabled  → True  (dev mode, no restrictions)
    - admin / hq     → True  (unrestricted)
    - district       → True  if the site has at least one department whose
                              district number matches the user's district
    - site           → True  if the user's site_id matches exactly
    - no role        → False (read-only users)
    """
    if not current_app.config.get("OIDC_ENABLED"):
        return True

    role_row = get_user_role()
    if role_row is None:
        return False

    if role_row.role in ("admin", "hq"):
        return True

    if role_row.role == "district":
        from .models import Department
        match = Department.query.filter_by(site_id=site_id, district=role_row.district).first()
        return match is not None

    if role_row.role == "site":
        return role_row.site_id == site_id

    return False


# ── Decorators ────────────────────────────────────────────────────────

def require_auth(fn):
    """Decorator: reject the request with 401 if there is no valid token."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_app.config.get("OIDC_ENABLED"):
            return fn(*args, **kwargs)

        if not getattr(g, "user_claims", None):
            return jsonify({"error": "Authentication required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_role(*allowed_roles):
    """
    Decorator factory: allow only users whose role is in *allowed_roles*.

    Usage::

        @require_role('admin', 'hq')
        def admin_only_endpoint(): ...
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_app.config.get("OIDC_ENABLED"):
                return fn(*args, **kwargs)

            if not getattr(g, "user_claims", None):
                return jsonify({"error": "Authentication required"}), 401

            role_row = get_user_role()
            if role_row is None or role_row.role not in allowed_roles:
                return jsonify({"error": "Insufficient permissions"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ── App-level before_request hook ────────────────────────────────────

def _before_api_request():
    """
    Run before every request to /api/*.

    1. Extract and validate the Bearer token; store claims in g.user_claims.
    2. Load the UserRole for the authenticated user into g.user_role.
    3. GET/HEAD requests are always public (read-only anonymous access).
    4. Mutating requests require a valid token.
    """
    if not current_app.config.get("OIDC_ENABLED"):
        return None

    if request.method == "OPTIONS":
        return None

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        claims = _validate_token(token)
        if claims is not None:
            g.user_claims = claims
            _load_user_role()

    if request.method in ("GET", "HEAD"):
        return None

    if not getattr(g, "user_claims", None):
        return jsonify({"error": "Authentication required"}), 401

    return None


def init_auth(app):
    """Register the authentication before_request hook on the Flask app."""
    app.before_request(_before_api_request)
