# EV Infra Deployment

This folder contains systemd unit files and an example nginx config to run the backend and frontend behind nginx on a Linux server.

## Paths and Users
- Adjust `/opt/evinfra/...` paths to where you deployed the code.
- Create a service user (recommended): `useradd -r -s /usr/sbin/nologin evinfra`.

## Backend (Flask via Gunicorn)
1. Install dependencies:
   - Python 3.x and pip
   - `pip install gunicorn sqlalchemy alembic python-dotenv psycopg[binary]`
2. Set env file `/etc/evinfra/backend.env` (create directory if needed):
   ```
   DATABASE_URL=postgresql+psycopg://evinfra:ChangeMe123!@localhost:5432/evinfra
   FLASK_ENV=production
   ```
3. Copy unit file:
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

Optional: If you prefer a Node static server, use the provided unit:
```bash
sudo cp deploy/systemd/evinfra-frontend.service /etc/systemd/system/evinfra-frontend.service
sudo systemctl daemon-reload
sudo systemctl enable --now evinfra-frontend
```
Requires: `npm i -g serve` or use `npx serve`.

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
```bash
cd /opt/evinfra/backend
export DATABASE_URL=postgresql+psycopg://evinfra:ChangeMe123!@localhost:5432/evinfra
alembic upgrade head
```

## Logs and Troubleshooting
- `journalctl -u evinfra-backend -f`
- `journalctl -u evinfra-frontend -f`
- `sudo nginx -t` to validate config.
- If gunicorn fails to import app, ensure `WorkingDirectory` is the backend folder and the factory path `"app:create_app()"` is correct.
