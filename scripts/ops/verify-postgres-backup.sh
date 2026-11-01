#!/usr/bin/env bash
# ==============================================================================
# TechSprout LMS - PostgreSQL Backup Verification Script (POSIX Bash)
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
    echo "ERROR: Backup file path required." >&2
    echo "Usage: ./verify-postgres-backup.sh <path_to_backup.dump>" >&2
    exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]] || [[ ! -s "${BACKUP_FILE}" ]]; then
    echo "ERROR: File '${BACKUP_FILE}' does not exist or has 0 bytes length." >&2
    exit 1
fi

echo "===================================================="
echo "TechSprout LMS — PostgreSQL Backup Verifier"
echo "Backup File: ${BACKUP_FILE}"
echo "===================================================="

# Check pg_restore
if ! command -v pg_restore >/dev/null 2>&1; then
    echo "ERROR: 'pg_restore' command not found." >&2
    exit 1
fi

# Checksum
if command -v sha256sum >/dev/null 2>&1; then
    COMPUTED_HASH=$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')
    echo "[OK] SHA-256: ${COMPUTED_HASH}"
fi

# Check TOC
echo "[RUN] Inspecting archive TOC..."
TOC_LINES=$(pg_restore --list "${BACKUP_FILE}")
ENTRY_COUNT=$(echo "${TOC_LINES}" | grep -E '^[0-9]+;' | wc -l | tr -d ' ')

echo "[OK] TOC Entries: ${ENTRY_COUNT}"
echo "===================================================="
echo "SUCCESS: Backup archive verified."
echo "===================================================="
