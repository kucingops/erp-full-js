#!/bin/sh
set -e
# Migrasi selalu dijalankan; seed idempotent (upsert), jadi aman tiap start.
npx prisma migrate deploy
if [ "${SEED_ON_START:-true}" = "true" ]; then
  npx prisma db seed
fi
exec node dist/main
