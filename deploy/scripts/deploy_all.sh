#!/usr/bin/env bash
set -euo pipefail

# Build and deploy both frontend and backend, including Alembic migrations and service restarts.
#
# Usage (examples):
#   sudo deploy/scripts/deploy_all.sh \
#     --front-src /opt/evinfra/frontend \
#     --front-target /opt/evinfra/frontend/build \
#     --frontend-mode serve \
#     --back-dir /opt/evinfra/backend \
#     --back-env /etc/evinfra/backend.env
#
#   sudo deploy/scripts/deploy_all.sh --frontend-mode static --front-target /var/www/evinfra --owner nginx:nginx
#
# Options:
#   --front-src <dir>       Frontend source directory (contains package.json). Default: /opt/evinfra/frontend
#   --front-target <dir>    Frontend target directory for built assets. Default: /opt/evinfra/frontend/build
#   --frontend-mode <m>     'serve' (systemd service) or 'static' (nginx serves files). Default: serve
#   --owner <user:group>    Chown owner:group for static deploy rsync. Default: nginx:nginx
#   --chmod <spec>          Chmod spec for rsync. Default: Du=rwx,Dgo=rx,Fu=rw,Fgo=r
#   --no-selinux            Skip SELinux relabeling for static deploy
#   --user <name>           Runtime user to run npm commands (defaults to SUDO_USER or 'evinfra' if exists)
#   --back-dir <dir>        Backend working directory (contains alembic.ini). Default: /opt/evinfra/backend
#   --back-env <file>       Backend environment file (sourced for Alembic). Default: /etc/evinfra/backend.env
#   --back-venv <dir>       Backend virtualenv directory. Default: /opt/evinfra/backend/venv
#   --front-service <name>  Frontend systemd service name. Default: evinfra-frontend
#   --back-service <name>   Backend systemd service name. Default: evinfra-backend
#   --skip-migrate          Skip Alembic migration step
#

FRONT_SRC="/opt/evinfra/frontend"
FRONT_TARGET="/opt/evinfra/frontend/build"
FRONTEND_MODE="serve" # or 'static'
OWNER_OPT="nginx:nginx"
CHMOD_OPT="Du=rwx,Dgo=rx,Fu=rw,Fgo=r"
SELINUX=1
RUN_AS="${SUDO_USER:-}"

BACK_DIR="/opt/evinfra/backend"
BACK_ENV_FILE="/etc/evinfra/backend.env"
BACK_VENV="/opt/evinfra/backend/venv"
FRONT_SERVICE="evinfra-frontend"
BACK_SERVICE="evinfra-backend"
RUN_MIGRATE=1

if [[ -z "$RUN_AS" ]] && id evinfra >/dev/null 2>&1; then
  RUN_AS="evinfra"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --front-src) FRONT_SRC="$2"; shift 2 ;;
    --front-target) FRONT_TARGET="$2"; shift 2 ;;
    --frontend-mode) FRONTEND_MODE="$2"; shift 2 ;;
    --owner) OWNER_OPT="$2"; shift 2 ;;
    --chmod) CHMOD_OPT="$2"; shift 2 ;;
    --no-selinux) SELINUX=0; shift ;;
    --user) RUN_AS="$2"; shift 2 ;;
    --back-dir) BACK_DIR="$2"; shift 2 ;;
    --back-env) BACK_ENV_FILE="$2"; shift 2 ;;
    --back-venv) BACK_VENV="$2"; shift 2 ;;
    --front-service) FRONT_SERVICE="$2"; shift 2 ;;
    --back-service) BACK_SERVICE="$2"; shift 2 ;;
    --skip-migrate) RUN_MIGRATE=0; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$FRONT_SRC" ]]; then
  echo "Frontend src not found: $FRONT_SRC" >&2
  exit 1
fi
if [[ ! -d "$BACK_DIR" ]]; then
  echo "Backend dir not found: $BACK_DIR" >&2
  exit 1
fi

# --- Frontend build ---
cd "$FRONT_SRC"
echo "[deploy] Building frontend in $FRONT_SRC"
if command -v npm >/dev/null 2>&1; then
  if [[ -n "$RUN_AS" ]] && id "$RUN_AS" >/dev/null 2>&1; then
    sudo -u "$RUN_AS" npm ci
    sudo -u "$RUN_AS" npm run build
  else
    npm ci
    npm run build
  fi
else
  echo "npm not found in PATH" >&2
  exit 1
fi

# --- Frontend deploy ---
if [[ "$FRONTEND_MODE" == "static" ]]; then
  mkdir -p "$FRONT_TARGET"
  RSYNC_ARGS=( -a --delete --human-readable --progress --checksum )
  if [[ -n "$OWNER_OPT" ]]; then RSYNC_ARGS+=( --chown="$OWNER_OPT" ); fi
  if [[ -n "$CHMOD_OPT" ]]; then RSYNC_ARGS+=( --chmod="$CHMOD_OPT" ); fi
  echo "[deploy] Rsyncing build/ -> $FRONT_TARGET"
  rsync "${RSYNC_ARGS[@]}" build/ "$FRONT_TARGET/"
  if [[ "$SELINUX" -eq 1 ]]; then
    if command -v semanage >/dev/null 2>&1; then
      sudo semanage fcontext -a -t httpd_sys_content_t "${FRONT_TARGET}(/.*)?" || true
    fi
    if command -v restorecon >/dev/null 2>&1; then
      sudo restorecon -Rv "$FRONT_TARGET" || true
    elif command -v chcon >/dev/null 2>&1; then
      sudo chcon -R -t httpd_sys_content_t "$FRONT_TARGET" || true
    fi
  fi
  echo "[deploy] Frontend static assets deployed to $FRONT_TARGET"
else
  echo "[deploy] Restarting frontend service: $FRONT_SERVICE"
  sudo systemctl restart "$FRONT_SERVICE"
fi

# --- Backend migrate (optional) ---
if [[ "$RUN_MIGRATE" -eq 1 ]]; then
  echo "[deploy] Running Alembic migrations"
  if [[ ! -x "$BACK_VENV/bin/alembic" ]]; then
    echo "[warn] Alembic not found at $BACK_VENV/bin/alembic; skipping migrations"
  else
    pushd "$BACK_DIR" >/dev/null
    # Export env vars from backend env file for alembic
    if [[ -f "$BACK_ENV_FILE" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "$BACK_ENV_FILE"
      set +a
    fi
    "$BACK_VENV/bin/alembic" upgrade head || { echo "[error] Alembic migration failed" >&2; exit 1; }
    popd >/dev/null
  fi
fi

# --- Backend restart ---
echo "[deploy] Restarting backend service: $BACK_SERVICE"
sudo systemctl restart "$BACK_SERVICE"

echo "[deploy] Done: frontend + backend deployed"
