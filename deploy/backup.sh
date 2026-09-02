#!/usr/bin/env bash
# Nightly backup of the database and uploaded media.
# Install:  sudo crontab -e   →   15 3 * * * /srv/bonfire/deploy/backup.sh
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/bonfire}
KEEP_DAYS=${KEEP_DAYS:-30}
STAMP=$(date +%F-%H%M)

mkdir -p "$BACKUP_DIR"

sudo -u postgres pg_dump -Fc bonfire > "$BACKUP_DIR/bonfire-$STAMP.dump"
tar -czf "$BACKUP_DIR/media-$STAMP.tar.gz" -C /srv/bonfire/backend media

find "$BACKUP_DIR" -name '*.dump'   -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name '*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backed up to $BACKUP_DIR (keeping $KEEP_DAYS days)"

# Restore:
#   sudo -u postgres pg_restore -d bonfire --clean --if-exists <file>.dump
#   tar -xzf media-<stamp>.tar.gz -C /srv/bonfire/backend
