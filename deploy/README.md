# EV Infra Deployment

This folder contains systemd unit files and an example nginx config to run the backend and frontend behind nginx on a Linux server.

**⚠️ IMPORTANT: HTTPS Required**
The application requires HTTPS in production for geolocation features and secure browser APIs. See the Nginx section below for SSL certificate setup instructions. For servers behind a firewall, see `SSL_SETUP_BEHIND_FIREWALL.md`.

## Paths and Users
- Adjust `/opt/evinfra/...` paths to where you deployed the code.
- Create a service user (recommended): `useradd -r -s /usr/sbin/nologin evinfra`.

## Backend (Flask via Gunicorn)
1. Create and use a Python virtual environment (recommended):
   ```bash
   sudo -u evinfra mkdir -p /opt/evinfra/backend
   cd /opt/evinfra/backend
   python3 -m venv venv
   source venv/bin/activate
   pip install --upgrade pip
   pip install flask flask_cors flask_sqlalchemy gunicorn sqlalchemy alembic python-dotenv "psycopg[binary]"
   ```
2. Set env file `/etc/evinfra/backend.env` (create directory if needed):
   ```
   DATABASE_URL=postgresql+psycopg://evinfra:ChangeMe123!@localhost:5432/evinfra
   FLASK_ENV=production
   ```
3. Copy unit file (uses venv gunicorn at `/opt/evinfra/backend/venv/bin/gunicorn`):
   ```bash
   sudo cp deploy/systemd/evinfra-backend.service /etc/systemd/system/evinfra-backend.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now evinfra-backend
   ```

## Frontend (React)
Recommended: build and serve static from nginx (no Node process needed).

1. Build on the server or CI:
   ```bash
   cd /opt/evinfra/frontend
   npm ci
   npm run build
   ```
2. Nginx will serve `/opt/evinfra/frontend/build` directly.

### One-command build + rsync deploy
Use the helper script to build and rsync with correct permissions and SELinux context:
```bash
sudo deploy/scripts/deploy_frontend.sh \
   --src /opt/evinfra/frontend \
   --target /opt/evinfra/frontend/build \
   --owner nginx:nginx \
   --chmod "Du=rwx,Dgo=rx,Fu=rw,Fgo=r"
```
Notes:
- Adjust `--owner` to match your nginx user/group (omit if unsure).
- To deploy to a separate web root (e.g., `/var/www/evinfra`), change `--target` and update nginx `root` accordingly, then reload nginx.
- The script persists SELinux labeling with `semanage fcontext` (if available) and applies `restorecon`.

Optional: If you prefer a Node static server, use the provided unit:
```bash
sudo cp deploy/systemd/evinfra-frontend.service /etc/systemd/system/evinfra-frontend.service
sudo systemctl daemon-reload
sudo systemctl enable --now evinfra-frontend
```
Requires: `npm i -g serve` or use `npx serve`.

## Combined Deploy (Frontend + Backend)

Use the helper script to build and deploy both sides, apply Alembic migrations, and restart services.

Examples:
```bash
# Serve frontend via systemd service (proxy on :3000) and restart backend
sudo deploy/scripts/deploy_all.sh \
   --front-src /opt/evinfra/frontend \
   --front-target /opt/evinfra/frontend/build \
   --frontend-mode serve \
   --back-dir /opt/evinfra/backend \
   --back-env /etc/evinfra/backend.env

# Deploy static frontend to nginx web root and run migrations
sudo deploy/scripts/deploy_all.sh \
   --frontend-mode static \
   --front-target /var/www/evinfra \
   --owner nginx:nginx
```

Options:
- `--front-src`: Frontend source directory (contains `package.json`).
- `--front-target`: Target directory for built assets (use `/var/www/evinfra` for nginx static).
- `--frontend-mode`: `serve` (restart `evinfra-frontend`) or `static` (rsync + SELinux relabel).
- `--owner` / `--chmod` / `--no-selinux`: control rsync permissions and labeling for static deploys.
- `--back-dir`: Backend working directory (contains `alembic.ini`).
- `--back-env`: Backend env file sourced for Alembic (e.g., `DATABASE_URL`).
- `--back-venv`: Backend venv path (default `/opt/evinfra/backend/venv`).
- `--front-service` / `--back-service`: systemd unit names (defaults provided).
- `--skip-migrate`: skip Alembic migration.

The script restarts services with `systemctl` and will gracefully skip migrations if Alembic is not found.

## Nginx
1. Copy config and enable:
   ```bash
   sudo cp deploy/nginx/evinfra.conf /etc/nginx/sites-available/evinfra.conf
   sudo ln -s /etc/nginx/sites-available/evinfra.conf /etc/nginx/sites-enabled/evinfra.conf
   ```

2. **Setup SSL Certificates:**
   
   **Quick Setup (Recommended):**
   ```bash
   sudo chmod +x deploy/scripts/setup_ssl.sh
   sudo deploy/scripts/setup_ssl.sh
   ```
   This interactive script will guide you through setting up certificates. **Choose option 1** to import a .pfx certificate from your IT department (for servers behind a firewall).
   
   **Manual Setup:**
   
   **Option A: Import .pfx Certificate from IT (For servers behind firewall)**
   
   If your IT department provides a .pfx file (e.g., `svgc32zevi.dot.ca.gov.pfx`):
   ```bash
   # Extract certificate and key from .pfx file
   sudo mkdir -p /etc/pki/tls/certs
   
   # Extract certificate (you'll be prompted for the .pfx password)
   sudo openssl pkcs12 -in /path/to/svgc32zevi.dot.ca.gov.pfx \
     -clcerts -nokeys \
     -out /etc/pki/tls/certs/svgc32zevi.dot.ca.gov.crt
   
   # Extract private key
   sudo openssl pkcs12 -in /path/to/svgc32zevi.dot.ca.gov.pfx \
     -nocerts -nodes \
     -out /etc/pki/tls/certs/svgc32zevi.dot.ca.gov.key
   
   # Extract certificate chain (if present)
   sudo openssl pkcs12 -in /path/to/svgc32zevi.dot.ca.gov.pfx \
     -cacerts -nokeys \
     -out /etc/pki/tls/certs/svgc32zevi.dot.ca.gov-chain.crt
   
   # Set proper permissions
   sudo chmod 644 /etc/pki/tls/certs/svgc32zevi.dot.ca.gov.crt
   sudo chmod 600 /etc/pki/tls/certs/svgc32zevi.dot.ca.gov.key
   ```
   
   The nginx config is already configured to use these paths.
   
   **Option B: Using Let's Encrypt (Only if publicly accessible)**
   
   **Note:** This will NOT work if your server is behind a firewall. Skip this if you need to use certificates from IT.
   ```bash
   # Install certbot
   sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian
   # OR
   sudo yum install certbot python3-certbot-nginx  # RHEL/CentOS
   
   # Obtain certificate
   sudo certbot certonly --nginx -d svgc32zevi.dot.ca.gov
   
   # Certificates will be placed at:
   # /etc/letsencrypt/live/svgc32zevi.dot.ca.gov/fullchain.pem
   # /etc/letsencrypt/live/svgc32zevi.dot.ca.gov/privkey.pem
   
   # Setup auto-renewal
   sudo systemctl enable certbot-renew.timer
   sudo systemctl start certbot-renew.timer
   
   # Update nginx config to use Let's Encrypt paths:
   # ssl_certificate /etc/letsencrypt/live/svgc32zevi.dot.ca.gov/fullchain.pem;
   # ssl_certificate_key /etc/letsencrypt/live/svgc32zevi.dot.ca.gov/privkey.pem;
   ```

3. Validate and reload nginx:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

**Note:** The nginx config now includes HTTPS on port 443 and redirects HTTP (port 80) to HTTPS. Make sure your firewall allows both ports:
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## Alembic Migrations
Run Alembic from the same venv:
```bash
cd /opt/evinfra/backend
source venv/bin/activate
export DATABASE_URL=postgresql+psycopg://evinfra:ChangeMe123!@localhost:5432/evinfra
alembic upgrade head
```

## Logs and Troubleshooting
- `journalctl -u evinfra-backend -f`
- `journalctl -u evinfra-frontend -f`
- `sudo nginx -t` to validate config.
- If gunicorn fails to import app, ensure `WorkingDirectory` is the backend folder and the factory path `"app:create_app()"` is correct.

## Minio
Files are in /data/minio/evinfra
Settings file is in /etc/default

## Database backups
Backups are in /opt/db-backups/