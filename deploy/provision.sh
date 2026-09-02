#!/usr/bin/env bash
# One-time VPS provisioning for Bonfire Gaming Hub (Ubuntu 22.04/24.04).
# Run as a sudo-capable user:  sudo bash provision.sh
set -euo pipefail

APP_USER=bonfire
APP_DIR=/srv/bonfire
DB_NAME=bonfire
DB_USER=bonfire

echo "==> Installing system packages"
apt-get update
apt-get install -y python3-venv python3-dev build-essential \
    postgresql postgresql-contrib libpq-dev \
    nginx certbot python3-certbot-nginx \
    git curl ufw

echo "==> Installing Node 22 (for building the two front-ends)"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Creating app user and directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
chown -R "$APP_USER":www-data "$APP_DIR"

echo "==> Creating the database"
DB_PASS=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "ALTER ROLE $DB_USER SET client_encoding TO 'utf8';"
sudo -u postgres psql -c "ALTER ROLE $DB_USER SET default_transaction_isolation TO 'read committed';"
sudo -u postgres psql -c "ALTER ROLE $DB_USER SET timezone TO 'Asia/Kolkata';"

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> nginx + systemd units"
cp nginx-bonfire.conf /etc/nginx/sites-available/bonfire
ln -sf /etc/nginx/sites-available/bonfire /etc/nginx/sites-enabled/bonfire
rm -f /etc/nginx/sites-enabled/default
cp bonfire-api.service /etc/systemd/system/bonfire-api.service
systemctl daemon-reload
nginx -t && systemctl reload nginx

cat <<MSG

=========================================================
Provisioning done.

Database password (put this in /srv/bonfire/backend/.env):

    POSTGRES_PASSWORD=$DB_PASS

Next:
  1. Copy the repo to $APP_DIR (git clone or rsync).
  2. cp deploy/backend.env.production.example $APP_DIR/backend/.env
     …and fill in SECRET_KEY + the password above. chmod 600.
  3. bash deploy/deploy.sh
  4. certbot --nginx -d bonfiregaminghub.com -d www.bonfiregaminghub.com \\
       -d admin.bonfiregaminghub.com -d api.bonfiregaminghub.com
=========================================================
MSG
