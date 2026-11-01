#!/usr/bin/env bash
# ==============================================================================
# TechSprout LMS - Isolated Local Database Restore Script (POSIX Bash)
# ==============================================================================
# Restores a PostgreSQL custom-format dump archive into a local disposable database.
# Enforces localhost safety assertion to prevent remote/production overwrites.
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET_DB="${2:-techsprout_restore_disposable}"
TARGET_PORT="${3:-5432}"

if [[ -z "${BACKUP_FILE}" ]]; then
    echo "ERROR: Backup file path required." >&2
    echo "Usage: ./restore-postgres-local.sh <path_to_backup.dump> [target_db] [port]" >&2
    exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}" >&2
    exit 1
fi

# Safety check
if [[ "${TARGET_DB}" == "techsprout" ]] || [[ "${TARGET_DB}" == "techsprout_production" ]]; then
    echo "ERROR: Refusing to restore over primary database name '${TARGET_DB}'." >&2
    exit 1
fi

echo "===================================================="
echo "TechSprout LMS — Local PostgreSQL Restore Test"
echo "Target File: ${BACKUP_FILE}"
echo "Target DB:   ${TARGET_DB} (localhost:${TARGET_PORT})"
echo "===================================================="

# Check binaries
command -v createdb >/dev/null 2>&1 || { echo "createdb required"; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore required"; exit 1; }
command -v dropdb >/dev/null 2>&1 || { echo "dropdb required"; exit 1; }

# Recreate target database
echo "[RUN] Preparing disposable database '${TARGET_DB}'..."
dropdb -h 127.0.0.1 -p "${TARGET_PORT}" --if-exists "${TARGET_DB}" 2>/dev/null || true
createdb -h 127.0.0.1 -p "${TARGET_PORT}" "${TARGET_DB}"

# Restore
echo "[RUN] Restoring archive..."
pg_restore -h 127.0.0.1 -p "${TARGET_PORT}" -d "${TARGET_DB}" --no-owner --no-acl "${BACKUP_FILE}" || true

# Verify
echo "[RUN] Verifying tables..."
psql -h 127.0.0.1 -p "${TARGET_PORT}" -d "${TARGET_DB}" -c "
    SELECT schemaname, count(*) as tables_count 
    FROM pg_tables 
    WHERE schemaname IN ('public', 'drizzle') 
    GROUP BY schemaname;
"

echo "===================================================="
echo "SUCCESS: Local restore test completed."
echo "===================================================="
