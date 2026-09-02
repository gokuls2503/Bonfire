#!/usr/bin/env bash
# Build + release. Run from the repo root on the VPS:  bash deploy/deploy.sh
set -euo pipefail

APP_DIR=${APP_DIR:-/srv/bonfire}
REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
API_HOST=${API_HOST:-https://api.bonfiregaminghub.com/api}

echo "==> Backend"
cd "$REPO_DIR/backend"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py check --deploy || true

echo "==> Public site"
cd "$REPO_DIR/public-web"
npm ci --silent
VITE_API_BASE="$API_HOST" npm run build

echo "==> Admin site"
cd "$REPO_DIR/admin-web"
npm ci --silent
VITE_API_BASE="$API_HOST" npm run build

echo "==> Publishing static bundles"
mkdir -p "$APP_DIR/public-web" "$APP_DIR/admin-web"
rsync -a --delete "$REPO_DIR/public-web/dist/" "$APP_DIR/public-web/"
rsync -a --delete "$REPO_DIR/admin-web/dist/"  "$APP_DIR/admin-web/"

echo "==> Restarting API"
sudo systemctl restart bonfire-api
sleep 2
sudo systemctl --no-pager --lines=5 status bonfire-api || true

echo "==> Health check"
curl -fsS http://127.0.0.1:8001/healthz/ && echo " — API is up"

echo "Deploy complete."
