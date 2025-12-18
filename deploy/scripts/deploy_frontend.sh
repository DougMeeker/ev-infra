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
TARGET_DIR="/opt/evinfra/frontend/build"
OWNER_OPT=""
CHMOD_OPT="Du=rwx,Dgo=rx,Fu=rw,Fgo=r"
SELINUX=1

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
    *)
      echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Source dir not found: $SRC_DIR" >&2
  exit 1
fi

cd "$SRC_DIR"
echo "[deploy] Installing deps and building React app in $SRC_DIR"
if command -v npm >/dev/null 2>&1; then
  npm ci
  npm run build
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

# SELinux context for web content
if [[ "$SELINUX" -eq 1 ]]; then
  if command -v semanage >/dev/null 2>&1; then
    sudo semanage fcontext -a -t httpd_sys_content_t "${TARGET_DIR}(/.*)?" || true
  fi
  if command -v restorecon >/dev/null 2>&1; then
    sudo restorecon -Rv "$TARGET_DIR" || true
  elif command -v chcon >/dev/null 2>&1; then
    sudo chcon -R -t httpd_sys_content_t "$TARGET_DIR" || true
  fi
fi

echo "[deploy] Frontend deployed to $TARGET_DIR"
