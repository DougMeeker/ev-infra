# EV Infra Deployment

This folder contains systemd unit files and an example nginx config to run the backend and frontend behind nginx on a Linux server.

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
   sudo nginx -t
   sudo systemctl reload nginx
   ```
2. TLS: replace `listen 80;` with your SSL setup (e.g., certbot).

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
