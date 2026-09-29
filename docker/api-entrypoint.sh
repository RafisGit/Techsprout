#!/bin/sh
set -e

# TechSprout API Docker Entrypoint Script
# Idempotently applies database migrations and optional initial seeds
# before launching the NestJS application.

if [ "$RUN_MIGRATIONS" != "false" ]; then
  echo "==> [Docker Entrypoint] Verifying database schema and applying pending migrations..."
  node apps/api/dist/database/migrate.js
  echo "==> [Docker Entrypoint] Migrations complete."
fi

if [ "$SEED_DATABASE" = "true" ]; then
  echo "==> [Docker Entrypoint] Checking and seeding baseline development data..."
  node apps/api/dist/database/seed/seed.js
  echo "==> [Docker Entrypoint] Seeding complete."
fi

echo "==> [Docker Entrypoint] Starting TechSprout API..."
exec "$@"
