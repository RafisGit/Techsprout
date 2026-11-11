#!/usr/bin/env bash
# ==============================================================================
# TechSprout LMS - Secure PostgreSQL 16 Staging Backup Script (POSIX Bash)
# ==============================================================================
# Creates a PostgreSQL custom-format logical backup using PostgreSQL 16 client tools.
# Enforces staging identity verification, uses temporary protected PGPASSFILE,
# never exposes credentials in process arguments, queries the database server
# for major version 16, and writes an accurate manifest.
# ==============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
RESOURCE_ID="${2:-dpg-db474ae0tbcc73dcgr10-a}"
OUTPUT_DIR="${3:-${HOME}/TechSproutBackups}"

echo "===================================================="
echo "TechSprout LMS — PostgreSQL 16 Staging Backup"
echo "Target Environment: ${ENVIRONMENT}"
echo "Expected Resource:  ${RESOURCE_ID}"
echo "Destination Dir:    ${OUTPUT_DIR}"
echo "Timestamp:          $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "===================================================="

# 1. Environment & Resource Identity Parameter Assertions
if [[ "${ENVIRONMENT}" != "staging" ]]; then
    echo "ERROR: This script is specifically hardened for staging backup. Expected 'staging', got '${ENVIRONMENT}'." >&2
    exit 1
fi

EXPECTED_STAGING_RESOURCE="dpg-db474ae0tbcc73dcgr10-a"
if [[ "${RESOURCE_ID}" != "${EXPECTED_STAGING_RESOURCE}" ]]; then
    echo "ERROR: Resource ID mismatch: expected '${EXPECTED_STAGING_RESOURCE}', got '${RESOURCE_ID}'." >&2
    exit 1
fi

# 2. Check Tooling & Require Major Version 16
for tool in pg_dump pg_restore psql; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "ERROR: '${tool}' not found on PATH. Install postgresql-client 16." >&2
        exit 1
    fi
    TOOL_VER=$("${tool}" --version | head -n 1)
    TOOL_MAJOR=$(echo "${TOOL_VER}" | grep -oE '[0-9]+' | head -n 1)
    if [[ "${TOOL_MAJOR}" != "16" ]]; then
        echo "ERROR: '${tool}' is major version ${TOOL_MAJOR} (expected 16). Version: ${TOOL_VER}. Fallback prohibited." >&2
        exit 1
    fi
done

PG_DUMP_VERSION=$(pg_dump --version | head -n 1)
PG_RESTORE_VERSION=$(pg_restore --version | head -n 1)
PSQL_VERSION=$(psql --version | head -n 1)

echo "[OK] Verified PostgreSQL 16 Client Tooling:"
echo "     pg_dump:    ${PG_DUMP_VERSION}"
echo "     pg_restore: ${PG_RESTORE_VERSION}"
echo "     psql:       ${PSQL_VERSION}"

# 3. Dry-Run Execution Gate (Strictly Before Any Credential, Network, or Disk Ops)
if [[ "${4:-}" == "--what-if" ]] || [[ "${4:-}" == "--dry-run" ]] || [[ "${WHAT_IF:-}" == "1" ]]; then
    echo "===================================================="
    echo "[WHATIF] Local PostgreSQL 16 toolchain and static staging configuration checks passed."
    echo "[WHATIF] No credentials requested, no temporary credential files created, no database contacted, and no backup artifacts generated."
    echo "===================================================="
    exit 0
fi

# 4. Check credentials (Never silently inherit generic DATABASE_URL)
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL environment variable is required." >&2
    echo "Usage: DATABASE_URL='postgresql://...' ./backup-postgres.sh [environment] [resource_id] [output_dir]" >&2
    exit 1
fi

# 4. Parse URI in memory
# postgresql://[user[:password]@]host[:port][/dbname]
PROTO="$(echo "${DATABASE_URL}" | grep :// | sed -e's,^\(.*://\).*,\1,g')"
URL_NO_PROTO="${DATABASE_URL#$PROTO}"
USER_PASS="$(echo "${URL_NO_PROTO}" | grep @ | cut -d@ -f1 || true)"
HOST_PORT_DB="${URL_NO_PROTO#$USER_PASS@}"
HOST_PORT="$(echo "${HOST_PORT_DB}" | cut -d/ -f1)"
DB_NAME="$(echo "${HOST_PORT_DB}" | cut -d/ -f2 | cut -d? -f1)"

DB_USER="${USER_PASS%%:*}"
DB_PASS="${USER_PASS#*:}"
DB_HOST="${HOST_PORT%%:*}"
DB_PORT="5432"
if [[ "${HOST_PORT}" == *:* ]]; then
    DB_PORT="${HOST_PORT##*:}"
fi

# 5. Staging Identity & Anti-Production Assertions
PROD_RESOURCE_ID="dpg-dasmr1e0tbcc73849i90-a"
if [[ "${DB_HOST}" == *"${PROD_RESOURCE_ID}"* ]]; then
    echo "CRITICAL REJECTION: Connection host identifies PRODUCTION database (${PROD_RESOURCE_ID}). Refusing staging backup." >&2
    exit 1
fi

if [[ "${DB_NAME}" == "techsprout" ]] || [[ "${DB_NAME}" == "techsprout_production" ]]; then
    echo "CRITICAL REJECTION: Connection database is '${DB_NAME}'. Expected 'techsprout_staging'. Refusing production database." >&2
    exit 1
fi

if [[ "${DB_HOST}" != *"${EXPECTED_STAGING_RESOURCE}"* ]]; then
    echo "CRITICAL: Connection host does not match staging resource ID '${EXPECTED_STAGING_RESOURCE}'." >&2
    exit 1
fi

if [[ "${DB_NAME}" != "techsprout_staging" ]]; then
    echo "CRITICAL: Connection database is '${DB_NAME}'. Expected 'techsprout_staging'." >&2
    exit 1
fi

echo "[PASS] Staging connection contract verified (Host matches ${EXPECTED_STAGING_RESOURCE}, DB is techsprout_staging)."

# 6. Create Destination Directory & Paths
mkdir -p "${OUTPUT_DIR}"
chmod 700 "${OUTPUT_DIR}" 2>/dev/null || true

TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_FILENAME="techsprout-${ENVIRONMENT}-${TIMESTAMP}.dump"
BACKUP_PATH="${OUTPUT_DIR}/${BACKUP_FILENAME}"
MANIFEST_PATH="${OUTPUT_DIR}/techsprout-${ENVIRONMENT}-${TIMESTAMP}.manifest.json"

if [[ -f "${BACKUP_PATH}" ]]; then
    echo "ERROR: Backup file ${BACKUP_PATH} already exists. Refusing overwrite." >&2
    exit 1
fi

# 7. Safe Credential Handling via Temporary Protected PGPASSFILE
TEMP_PGPASS="$(mktemp "${TMPDIR:-/tmp}/techsprout_pgpass.XXXXXX")"
chmod 600 "${TEMP_PGPASS}"

# Protect against inherited PGPASSWORD
ORIG_PGPASSWORD="${PGPASSWORD:-}"
unset PGPASSWORD

# Trap to remove temporary credentials file and restore environment on exit
cleanup() {
    rm -f "${TEMP_PGPASS}" 2>/dev/null || true
    if [[ -n "${ORIG_PGPASSWORD}" ]]; then
        export PGPASSWORD="${ORIG_PGPASSWORD}"
    else
        unset PGPASSWORD
    fi
}
trap cleanup EXIT

# Escape colons and backslashes in password
ESCAPED_PASS=$(echo -n "${DB_PASS}" | sed -e 's/\\/\\\\/g' -e 's/:/\\:/g')
echo "${DB_HOST}:${DB_PORT}:${DB_NAME}:${DB_USER}:${ESCAPED_PASS}" > "${TEMP_PGPASS}"

export PGPASSFILE="${TEMP_PGPASS}"
export PGHOST="${DB_HOST}"
export PGPORT="${DB_PORT}"
export PGDATABASE="${DB_NAME}"
export PGUSER="${DB_USER}"
export PGSSLMODE="require"

# 8. Query Live Server Identity & Version
echo "[RUN] Verifying live server identity and version using psql..."
SERVER_QUERY="SELECT current_database(), current_setting('server_version'), version();"
QUERY_OUT=$(psql --no-password -t -A -F'|' -c "${SERVER_QUERY}")
QUERIED_DB=$(echo "${QUERY_OUT}" | cut -d'|' -f1)
SERVER_VER_SETTING=$(echo "${QUERY_OUT}" | cut -d'|' -f2)

if [[ "${QUERIED_DB}" != "techsprout_staging" ]]; then
    echo "CRITICAL: Live database identity is '${QUERIED_DB}', expected 'techsprout_staging'. Aborting." >&2
    exit 1
fi

SERVER_MAJOR=$(echo "${SERVER_VER_SETTING}" | cut -d'.' -f1)
if [[ "${SERVER_MAJOR}" != "16" ]]; then
    echo "CRITICAL: Live database server major version is ${SERVER_MAJOR} (expected 16). Aborting." >&2
    exit 1
fi
echo "[PASS] Live server verified: DB='${QUERIED_DB}', Version='${SERVER_VER_SETTING}' (Major: ${SERVER_MAJOR})."

# 9. Execute pg_dump (Zero Credentials in Process Arguments)
echo "[RUN] Executing PostgreSQL 16 pg_dump logical backup..."
if ! pg_dump \
    --no-password \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="${BACKUP_PATH}"; then
    echo "ERROR: pg_dump failed." >&2
    rm -f "${BACKUP_PATH}"
    exit 1
fi

if [[ ! -s "${BACKUP_PATH}" ]]; then
    echo "ERROR: Dump file is empty or missing." >&2
    rm -f "${BACKUP_PATH}"
    exit 1
fi

chmod 600 "${BACKUP_PATH}" 2>/dev/null || true
FILE_SIZE=$(wc -c < "${BACKUP_PATH}" | tr -d ' ')
echo "[OK] Backup dump file created (${FILE_SIZE} bytes)."

# 10. Checksum
if command -v sha256sum >/dev/null 2>&1; then
    SHA256=$(sha256sum "${BACKUP_PATH}" | awk '{print $1}' | tr '[:lower:]' '[:upper:]')
elif command -v shasum >/dev/null 2>&1; then
    SHA256=$(shasum -a 256 "${BACKUP_PATH}" | awk '{print $1}' | tr '[:lower:]' '[:upper:]')
else
    SHA256="unavailable"
fi
echo "[OK] SHA-256 Checksum: ${SHA256}"

# 11. Validate Archive via PostgreSQL 16 pg_restore --list
ARCHIVE_VALIDATION="failed"
if pg_restore --list "${BACKUP_PATH}" >/dev/null 2>&1; then
    ARCHIVE_VALIDATION="passed"
    echo "[PASS] Archive passed PostgreSQL 16 pg_restore --list check."
else
    echo "ERROR: Archive validation failed." >&2
    exit 1
fi

# 12. Write Accurate Non-Sensitive Metadata Manifest
cat <<EOF > "${MANIFEST_PATH}"
{
  "environment": "${ENVIRONMENT}",
  "resourceId": "${RESOURCE_ID}",
  "postgresMajorVersion": ${SERVER_MAJOR},
  "postgresServerVersion": "${SERVER_VER_SETTING}",
  "pgDumpVersion": "${PG_DUMP_VERSION}",
  "pgRestoreVersion": "${PG_RESTORE_VERSION}",
  "backupTimestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "backupFile": "${BACKUP_FILENAME}",
  "fileSizeBytes": ${FILE_SIZE},
  "sha256": "${SHA256}",
  "archiveValidation": "${ARCHIVE_VALIDATION}",
  "restoreTest": null,
  "format": "custom",
  "flags": "--no-owner --no-acl --no-password"
}
EOF

chmod 600 "${MANIFEST_PATH}" 2>/dev/null || true
echo "[OK] Backup manifest written to ${MANIFEST_PATH}"
echo "===================================================="
echo "SUCCESS: PostgreSQL 16 staging backup completed."
echo "===================================================="
