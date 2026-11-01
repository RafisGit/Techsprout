#!/usr/bin/env bash
# ==============================================================================
# TechSprout LMS - Secure PostgreSQL Database Backup Script (POSIX Bash)
# ==============================================================================
# Creates a PostgreSQL custom-format logical backup using pg_dump.
# Captures SHA-256 checksum and generates a non-sensitive metadata manifest.
# Secrets are never printed or saved to reports.
# ==============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
RESOURCE_ID="${2:-}"
OUTPUT_DIR="${3:-${HOME}/TechSproutBackups}"

echo "===================================================="
echo "TechSprout LMS — PostgreSQL Logical Backup Script"
echo "Target Environment: ${ENVIRONMENT}"
echo "Destination Dir:    ${OUTPUT_DIR}"
echo "Timestamp:          $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "===================================================="

# 1. Check tooling
if ! command -v pg_dump >/dev/null 2>&1; then
    echo "ERROR: 'pg_dump' not found on PATH. Install postgresql-client 16+." >&2
    exit 1
fi

PG_DUMP_VERSION=$(pg_dump --version)
echo "[OK] Found pg_dump: ${PG_DUMP_VERSION}"

# 2. Check credentials
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL environment variable is required but missing." >&2
    echo "Usage: DATABASE_URL='postgresql://...' ./backup-postgres.sh [environment] [resource_id] [output_dir]" >&2
    exit 1
fi

# 3. Create destination directory
mkdir -p "${OUTPUT_DIR}"
chmod 700 "${OUTPUT_DIR}" 2>/dev/null || true

# 4. Generate paths
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_FILENAME="techsprout-${ENVIRONMENT}-${TIMESTAMP}.dump"
BACKUP_PATH="${OUTPUT_DIR}/${BACKUP_FILENAME}"
MANIFEST_PATH="${OUTPUT_DIR}/techsprout-${ENVIRONMENT}-${TIMESTAMP}.manifest.json"

if [[ -f "${BACKUP_PATH}" ]]; then
    echo "ERROR: Backup file ${BACKUP_PATH} already exists. Refusing overwrite." >&2
    exit 1
fi

# 5. Execute pg_dump
echo "[RUN] Executing pg_dump logical backup..."
export PGSSLMODE="require"

if ! pg_dump \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="${BACKUP_PATH}" \
    "${DATABASE_URL}"; then
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

# 6. Checksum
if command -v sha256sum >/dev/null 2>&1; then
    SHA256=$(sha256sum "${BACKUP_PATH}" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
    SHA256=$(shasum -a 256 "${BACKUP_PATH}" | awk '{print $1}')
else
    SHA256="unavailable"
fi
echo "[OK] SHA-256 Checksum: ${SHA256}"

# 7. Metadata Manifest
cat <<EOF > "${MANIFEST_PATH}"
{
  "backupFile": "${BACKUP_FILENAME}",
  "environment": "${ENVIRONMENT}",
  "sourceResourceId": "${RESOURCE_ID}",
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "fileSizeBytes": ${FILE_SIZE},
  "sha256": "${SHA256}",
  "pgDumpVersion": "${PG_DUMP_VERSION}",
  "format": "custom",
  "flags": "--no-owner --no-acl"
}
EOF

chmod 600 "${MANIFEST_PATH}" 2>/dev/null || true
echo "[OK] Backup manifest written to ${MANIFEST_PATH}"
echo "===================================================="
echo "SUCCESS: PostgreSQL backup completed."
echo "===================================================="
