#!/bin/bash
# Reset the integration-test Postgres database (`inovatic_test`) to a clean,
# fully-migrated state. Wired in via `npm run test:integration:reset` and
# called automatically by `npm run test:integration`, so every full run
# starts from a known baseline with no stale data from past runs.
#
# Requires the `inovatic-db` Docker container from docker-compose.yml.
set -e

CONTAINER="inovatic-db"
DB_USER="inovatic"
DB_PASS="inovatic_dev_2024"
TEST_DB="inovatic_test"
TEST_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${TEST_DB}"

if ! docker ps --filter "name=${CONTAINER}" --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "✗ Container '${CONTAINER}' is not running. Start it with: docker compose up -d db"
  exit 1
fi

echo "→ Dropping and recreating ${TEST_DB} …"
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL >/dev/null
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${TEST_DB};
CREATE DATABASE ${TEST_DB} OWNER ${DB_USER};
SQL

echo "→ Running prisma migrate deploy against ${TEST_DB} …"
DIRECT_URL="$TEST_URL" DATABASE_URL="$TEST_URL" npx prisma migrate deploy >/dev/null

echo "✓ ${TEST_DB} reset and migrated"
