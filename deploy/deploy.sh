rsync -a --delete --human-readable --progress --checksum frontend/build/ /var/www/evinfra/
chown -R nginx:nginx /var/www/
systemctl reload nginx.service

rsync -a --delete --human-readable --progress --checksum backend/ /opt/evinfra/backend/
chown -R evinfra:web /opt/evinfra/
systemctl restart evinfra-backend.service
