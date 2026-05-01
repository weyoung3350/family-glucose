#!/bin/bash
set -e

DB=/opt/glucose-api/data/glucose.db
DEST=/var/backups/glucose
mkdir -p "$DEST"
ts=$(date +%Y%m%d)
sqlite3 "$DB" ".backup $DEST/glucose-$ts.db"
find "$DEST" -name "glucose-*.db" -mtime +30 -delete
echo "$(date -Iseconds) backup ok: glucose-$ts.db"
