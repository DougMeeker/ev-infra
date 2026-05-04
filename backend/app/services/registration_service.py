"""
Self-service registration service.

Handles:
  - Input validation (username format, password strength, uniqueness)
  - argon2id password hashing with the same parameters as Authelia
  - Storing pending registrations in PostgreSQL
  - Writing verified users to Authelia's file user store (YAML)

Deployment note
---------------
The Flask process needs write access to AUTHELIA_USERS_FILE
(/etc/authelia/users_database.yml by default). On the server:

    sudo chown authelia:evinfra /etc/authelia/users_database.yml
    sudo chmod 660 /etc/authelia/users_database.yml

(Replace 'evinfra' with the OS user that runs the Flask/gunicorn process.)
"""

import re
import secrets
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path

import yaml
from argon2 import PasswordHasher, Type
from flask import current_app

from ..extensions import db
from ..models import PendingRegistration

import logging

logger = logging.getLogger(__name__)

# In-process lock to serialise YAML writes.
# NOTE: gunicorn multi-worker deployments run multiple processes; this lock
# only protects within a single worker. Concurrent registrations across
# workers are extremely rare in practice for this app size, but a proper
# file lock (e.g. portalocker) can be added if needed.
_yaml_lock = threading.Lock()

# Argon2id parameters matching backend/deploy/authelia/configuration.yml
_ph = PasswordHasher(
    time_cost=3,
    memory_cost=131_072,
    parallelism=4,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)

# Username rules: 3–32 chars, lowercase letters/digits/underscore/dot/hyphen
USERNAME_RE = re.compile(r"^[a-z0-9_.\-]{3,32}$")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _users_file() -> str:
    return current_app.config.get("AUTHELIA_USERS_FILE", "/etc/authelia/users_database.yml")


def _load_users(path: str) -> dict:
    p = Path(path)
    if p.exists():
        with open(p) as f:
            data = yaml.safe_load(f) or {}
        return data.get("users", {})
    return {}


def _save_users(path: str, users: dict) -> None:
    import subprocess
    content = yaml.safe_dump({"users": users}, default_flow_style=False, allow_unicode=True)
    # Write via sudo tee so the file stays owned by authelia regardless of
    # which OS user the Flask process runs as.  Requires the sudoers rule:
    #   evinfra ALL=(authelia) NOPASSWD: /usr/bin/tee /etc/authelia/users_database.yml
    result = subprocess.run(
        ["sudo", "-u", "authelia", "/usr/bin/tee", path],
        input=content,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise PermissionError(
            f"Failed to write {path} via sudo tee: {result.stderr.strip()}"
        )


# ── Public API ────────────────────────────────────────────────────────────────

def register_user(
    username: str, display_name: str, email: str, password: str
) -> tuple[bool, str]:
    """
    Validate input and create a pending registration.

    Returns (True, token) on success, or (False, error_message) on failure.
    The caller is responsible for sending the verification email.
    """
    username = username.strip().lower()
    email = email.strip().lower()
    display_name = display_name.strip()

    # ── Validation ──────────────────────────────────────────────────
    if not username or not display_name or not email or not password:
        return False, "All fields are required"

    if not USERNAME_RE.match(username):
        return False, (
            "Username must be 3–32 characters and contain only "
            "lowercase letters, digits, underscores, dots, or hyphens"
        )

    if len(password) < 10:
        return False, "Password must be at least 10 characters"

    # ── Uniqueness: pending table ───────────────────────────────────
    if PendingRegistration.query.filter(
        (PendingRegistration.username == username)
        | (PendingRegistration.email == email)
    ).first():
        return False, "An account with that username or email is already pending verification"

    # ── Uniqueness: live Authelia user store ────────────────────────
    existing = _load_users(_users_file())
    if username in existing:
        return False, "Username is already taken"
    if any(u.get("email", "").lower() == email for u in existing.values()):
        return False, "Email address is already registered"

    # ── Hash password ───────────────────────────────────────────────
    pw_hash = _ph.hash(password)

    # ── Persist pending record ──────────────────────────────────────
    token = secrets.token_urlsafe(32)
    record = PendingRegistration(
        username=username,
        email=email,
        display_name=display_name,
        password_hash=pw_hash,
        token=token,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(record)
    db.session.commit()

    return True, token


def verify_registration(token: str) -> tuple[bool, str]:
    """
    Complete registration by writing the verified user to Authelia's YAML.

    Returns (True, "") on success, or (False, error_message) on failure.
    """
    record = PendingRegistration.query.filter_by(token=token).first()
    if not record:
        return False, "Invalid or expired verification link"

    # Check token age
    created = record.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    ttl = current_app.config.get("REGISTRATION_TOKEN_TTL", 24 * 3600)
    if datetime.now(timezone.utc) - created > timedelta(seconds=ttl):
        db.session.delete(record)
        db.session.commit()
        return False, "Verification link has expired. Please register again."

    path = _users_file()
    with _yaml_lock:
        users = _load_users(path)

        # Re-check uniqueness inside the lock
        if record.username in users:
            db.session.delete(record)
            db.session.commit()
            return False, "Username was taken by another account. Please register again with a different username."

        users[record.username] = {
            "disabled": False,
            "displayname": record.display_name,
            "password": record.password_hash,
            "email": record.email,
            "groups": ["users"],
        }

        try:
            _save_users(path, users)
        except OSError as exc:
            logger.error("Could not write Authelia users file %s: %s", path, exc)
            return False, "Server error: could not save account. Please contact an administrator."

    db.session.delete(record)
    db.session.commit()
    logger.info("New user verified and added to Authelia: %s (%s)", record.username, record.email)
    return True, ""
