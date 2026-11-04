#!/bin/sh
set -e

cd /pb

# Create/update the admin (superuser) account from env, if provided.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  ./pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir /pb/pb_data >/dev/null \
    && echo "[giftlist] admin account ready: $PB_ADMIN_EMAIL"
fi

exec ./pocketbase serve \
  --http "0.0.0.0:${PORT:-8090}" \
  --dir /pb/pb_data \
  --publicDir /pb/pb_public \
  --hooksDir /pb/pb_hooks \
  --migrationsDir /pb/pb_migrations \
  "$@"
