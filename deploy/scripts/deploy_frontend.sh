#!/usr/bin/env bash
set -euo pipefail

# Build and deploy the frontend using rsync with proper permissions and SELinux context.
#
# Usage:
#   sudo deploy/scripts/deploy_frontend.sh [--src /opt/evinfra/frontend] [--target /opt/evinfra/frontend/build] \
#        [--owner nginx:nginx] [--chmod "Du=rwx,Dgo=rx,Fu=rw,Fgo=r"] [--no-selinux]
#
# Defaults are safe for serving static content directly from nginx using the existing root.
# If you prefer a separate web root, set --target to something like /var/www/evinfra and
# update nginx root accordingly.

SRC_DIR="/opt/evinfra/frontend"
TARGET_DIR="/var/www/evinfra"
OWNER_OPT="nginx:nginx"
CHMOD_OPT="Du=rwx,Dgo=rx,Fu=rw,Fgo=r"
SELINUX=1

# Default runtime user: prefer the calling sudo user or 'evinfra' if present
RUN_AS="${SUDO_USER:-}" 
if [[ -z "$RUN_AS" ]] && id evinfra >/dev/null 2>&1; then
  RUN_AS="evinfra"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src)
      SRC_DIR="$2"; shift 2 ;;
    --target)
      TARGET_DIR="$2"; shift 2 ;;
    --owner)
      OWNER_OPT="$2"; shift 2 ;;
    --chmod)
      CHMOD_OPT="$2"; shift 2 ;;
    --no-selinux)
      SELINUX=0; shift ;;
    --user)
      RUN_AS="$2"; shift 2 ;;
    *)
      echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Source dir not found: $SRC_DIR" >&2
  exit 1
fi

cd "$SRC_DIR"
# If targeting the source build directory, reset it to avoid permission/SELinux conflicts
if [[ "$TARGET_DIR" == "$SRC_DIR/build" ]]; then
  echo "[deploy] Resetting source build directory to ensure writable state"
  sudo rm -rf "$SRC_DIR/build"
  sudo mkdir -p "$SRC_DIR/build"
  if [[ -n "$RUN_AS" ]] && id "$RUN_AS" >/dev/null 2>&1; then
    sudo chown "$RUN_AS":"$RUN_AS" "$SRC_DIR/build" || true
  fi
fi

echo "[deploy] Installing deps and building React app in $SRC_DIR"
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

# Ensure target exists
mkdir -p "$TARGET_DIR"

# Rsync from the fresh build/ to target, enforcing permissions
RSYNC_ARGS=( -a --delete --human-readable --progress --checksum )
if [[ -n "$OWNER_OPT" ]]; then
  RSYNC_ARGS+=( --chown="$OWNER_OPT" )
fi
if [[ -n "$CHMOD_OPT" ]]; then
  RSYNC_ARGS+=( --chmod="$CHMOD_OPT" )
fi

echo "[deploy] Rsyncing build/ -> $TARGET_DIR"
rsync "${RSYNC_ARGS[@]}" build/ "$TARGET_DIR/"

# SELinux context for web content (skip if target is the source build dir)
if [[ "$SELINUX" -eq 1 ]]; then
  if [[ "$TARGET_DIR" == "$SRC_DIR/build" ]]; then
    echo "[deploy] Skipping SELinux relabel on source build directory. Consider using --target /var/www/evinfra and updating nginx root."
  else
    if command -v semanage >/dev/null 2>&1; then
      sudo semanage fcontext -a -t httpd_sys_content_t "${TARGET_DIR}(/.*)?" || true
    fi
    if command -v restorecon >/dev/null 2>&1; then
      sudo restorecon -Rv "$TARGET_DIR" || true
    elif command -v chcon >/dev/null 2>&1; then
      sudo chcon -R -t httpd_sys_content_t "$TARGET_DIR" || true
    fi
  fi
fi

echo "[deploy] Frontend deployed to $TARGET_DIR"
