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

# Check binaries and require PostgreSQL 16
command -v createdb >/dev/null 2>&1 || { echo "createdb required"; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore required"; exit 1; }
command -v dropdb >/dev/null 2>&1 || { echo "dropdb required"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "psql required"; exit 1; }

PG_RESTORE_VER=$(pg_restore --version | head -n 1)
PG_RESTORE_MAJOR=$(echo "${PG_RESTORE_VER}" | grep -oE '[0-9]+' | head -n 1)
if [[ "${PG_RESTORE_MAJOR}" != "16" ]]; then
    echo "ERROR: 'pg_restore' major version is ${PG_RESTORE_MAJOR} (expected 16). Version: ${PG_RESTORE_VER}. Fallback prohibited." >&2
    exit 1
fi

# Recreate target database
echo "[RUN] Preparing disposable database '${TARGET_DB}'..."
dropdb -h 127.0.0.1 -p "${TARGET_PORT}" --if-exists "${TARGET_DB}" 2>/dev/null || true
createdb -h 127.0.0.1 -p "${TARGET_PORT}" "${TARGET_DB}"

# Restore
echo "[RUN] Restoring archive..."
if ! pg_restore -h 127.0.0.1 -p "${TARGET_PORT}" -d "${TARGET_DB}" --no-owner --no-acl "${BACKUP_FILE}"; then
    echo "ERROR: pg_restore failed with non-zero exit code. Restore verification failed. Manifest will not be marked as passed." >&2
    exit 1
fi
echo "[PASS] pg_restore completed with exit code 0."
RESTORE_STATUS="passed"

# Verify
echo "[RUN] Verifying tables..."
if ! psql -h 127.0.0.1 -p "${TARGET_PORT}" -d "${TARGET_DB}" -c "
    SELECT schemaname, count(*) as tables_count 
    FROM pg_tables 
    WHERE schemaname IN ('public', 'drizzle') 
    GROUP BY schemaname;
"; then
    echo "ERROR: Table verification query failed. Manifest will not be marked as passed." >&2
    exit 1
fi

# Update manifest if present
MANIFEST_PATH="${BACKUP_FILE%.dump}.manifest.json"
if [[ -f "${MANIFEST_PATH}" ]]; then
    PG_VER_RAW=$(psql -V | awk '{print $3}' | cut -d'.' -f1)
    BACKUP_HASH="unavailable"
    if command -v sha256sum >/dev/null 2>&1; then
        BACKUP_HASH=$(sha256sum "${BACKUP_FILE}" | grep -oE '[0-9a-fA-F]{64}' | tr '[:lower:]' '[:upper:]' || true)
    elif command -v shasum >/dev/null 2>&1; then
        BACKUP_HASH=$(shasum -a 256 "${BACKUP_FILE}" | grep -oE '[0-9a-fA-F]{64}' | tr '[:lower:]' '[:upper:]' || true)
    fi
    echo "[OK] Updating manifest ${MANIFEST_PATH} with restore test outcome..."
    # If jq or python is available, patch JSON
    if command -v node >/dev/null 2>&1; then
        node -e '
            const fs = require("fs");
            const m = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
            m.restoreTest = {
                status: process.argv[2],
                postgresMajorVersion: parseInt(process.argv[3], 10) || 16,
                testedBackupSha256: process.argv[4],
                testedAt: new Date().toISOString()
            };
            fs.writeFileSync(process.argv[1], JSON.stringify(m, null, 2));
        ' "${MANIFEST_PATH}" "${RESTORE_STATUS}" "${PG_VER_RAW}" "${BACKUP_HASH}"
        echo "[OK] Manifest successfully updated with restore test record."
    fi
fi

echo "===================================================="
echo "SUCCESS: Local restore test completed."
echo "===================================================="
