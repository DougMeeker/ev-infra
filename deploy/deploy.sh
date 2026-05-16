# Build frontend with embedded build timestamp and OIDC config
OIDC_ENV=$(grep -E '^(OIDC_ISSUER|OIDC_CLIENT_ID)=' /etc/evinfra/backend.env 2>/dev/null || true)
OIDC_AUTHORITY=$(echo "$OIDC_ENV" | grep OIDC_ISSUER    | cut -d= -f2-)
OIDC_CLIENT_ID=$(echo "$OIDC_ENV" | grep OIDC_CLIENT_ID | cut -d= -f2-)

cd frontend
REACT_APP_BUILD_DATE=$(date -u '+%Y-%m-%d %H:%M UTC') \
  REACT_APP_OIDC_AUTHORITY="$OIDC_AUTHORITY" \
  REACT_APP_OIDC_CLIENT_ID="$OIDC_CLIENT_ID" \
  npm run build
cd ..

rsync -a --delete --human-readable --progress --checksum frontend/build/ /var/www/evinfra/
chown -R nginx:nginx /var/www/
systemctl reload nginx.service

rsync -a --delete --human-readable --progress --checksum backend/ /opt/evinfra/backend/
chown -R evinfra:web /opt/evinfra/
systemctl restart evinfra-backend.service
