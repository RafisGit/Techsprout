#!/usr/bin/env bash
# ==============================================================================
# TechSprout LMS - PostgreSQL Backup Verification Script (POSIX Bash)
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
ENVIRONMENT="${2:-}"
RESOURCE_ID="${3:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
    echo "ERROR: Backup file path required." >&2
    echo "Usage: ./verify-postgres-backup.sh <path_to_backup.dump> [environment] [resource_id]" >&2
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

# Check pg_restore and require major version 16
if ! command -v pg_restore >/dev/null 2>&1; then
    echo "ERROR: 'pg_restore' command not found." >&2
    exit 1
fi
PG_RESTORE_VER=$(pg_restore --version | head -n 1)
PG_RESTORE_MAJOR=$(echo "${PG_RESTORE_VER}" | grep -oE '[0-9]+' | head -n 1)
if [[ "${PG_RESTORE_MAJOR}" != "16" ]]; then
    echo "ERROR: 'pg_restore' major version is ${PG_RESTORE_MAJOR} (expected 16). Version: ${PG_RESTORE_VER}. Fallback prohibited." >&2
    exit 1
fi

# Checksum
COMPUTED_HASH="unavailable"
if command -v sha256sum >/dev/null 2>&1; then
    COMPUTED_HASH=$(sha256sum "${BACKUP_FILE}" | grep -oE '[0-9a-fA-F]{64}' | tr '[:lower:]' '[:upper:]' || true)
elif command -v shasum >/dev/null 2>&1; then
    COMPUTED_HASH=$(shasum -a 256 "${BACKUP_FILE}" | grep -oE '[0-9a-fA-F]{64}' | tr '[:lower:]' '[:upper:]' || true)
fi

if [[ "${COMPUTED_HASH}" == "unavailable" ]] || [[ -z "${COMPUTED_HASH}" ]]; then
    echo "ERROR: Failed to compute SHA-256 checksum for '${BACKUP_FILE}'." >&2
    exit 1
fi
echo "[OK] Computed SHA-256: ${COMPUTED_HASH}"

# Check TOC
echo "[RUN] Inspecting archive TOC..."
TOC_LINES=$(pg_restore --list "${BACKUP_FILE}")
ENTRY_COUNT=$(echo "${TOC_LINES}" | grep -E '^[0-9]+;' | wc -l | tr -d ' ')
echo "[OK] TOC Entries: ${ENTRY_COUNT}"

# Manifest validation and handling
MANIFEST_PATH="${BACKUP_FILE%.dump}.manifest.json"
if [[ -f "${MANIFEST_PATH}" ]]; then
    echo "[INFO] Validating against existing manifest: ${MANIFEST_PATH}"
    RECORDED_HASH=""
    if command -v node >/dev/null 2>&1; then
        RECORDED_HASH=$(node -e '
            const fs = require("fs");
            try {
                const m = JSON.parse(fs.readFileSync(process.argv[1], "utf-8").replace(/^\uFEFF/, ""));
                if (!m.sha256 || typeof m.sha256 !== "string") {
                    process.exit(2);
                }
                console.log(m.sha256.trim().toUpperCase());
            } catch (e) {
                process.exit(1);
            }
        ' "${MANIFEST_PATH}" 2>/dev/null || true)
        NODE_STATUS=$?
        if [[ ${NODE_STATUS} -eq 1 ]]; then
            echo "ERROR: Manifest at '${MANIFEST_PATH}' is corrupt or malformed JSON." >&2
            exit 1
        elif [[ ${NODE_STATUS} -eq 2 ]] || [[ -z "${RECORDED_HASH}" ]]; then
            echo "ERROR: Manifest at '${MANIFEST_PATH}' is missing required 'sha256' field." >&2
            exit 1
        fi
    else
        RECORDED_HASH=$(grep -i '"sha256"' "${MANIFEST_PATH}" | head -n 1 | sed -E 's/.*"sha256"[[:space:]]*:[[:space:]]*"([A-Fa-f0-9]+)".*/\1/' | tr '[:lower:]' '[:upper:]' || true)
        if [[ -z "${RECORDED_HASH}" ]] || [[ ${#RECORDED_HASH} -ne 64 ]]; then
            echo "ERROR: Manifest at '${MANIFEST_PATH}' is malformed or contains invalid SHA-256." >&2
            exit 1
        fi
    fi

    if [[ "${RECORDED_HASH}" != "${COMPUTED_HASH}" ]]; then
        echo "ERROR: Cryptographic checksum mismatch! Manifest: ${RECORDED_HASH}, Actual: ${COMPUTED_HASH}" >&2
        exit 1
    fi
    echo "[PASS] Cryptographic integrity match: SHA-256 matches manifest."
else
    echo "[INFO] No existing manifest found at '${MANIFEST_PATH}'."
    echo "[INFO] Generating baseline verified manifest from inspected archive."
fi

FILE_SIZE=$(wc -c < "${BACKUP_FILE}" | tr -d ' ')
FILENAME=$(basename "${BACKUP_FILE}")

INFERRED_ENV="${ENVIRONMENT}"
if [[ -z "${INFERRED_ENV}" ]]; then
    if [[ "${FILENAME}" == *"staging"* ]]; then
        INFERRED_ENV="staging"
    elif [[ "${FILENAME}" == *"production"* ]]; then
        INFERRED_ENV="production"
    else
        INFERRED_ENV="staging"
    fi
fi

INFERRED_RES_ID="${RESOURCE_ID}"
if [[ -z "${INFERRED_RES_ID}" ]]; then
    if [[ "${INFERRED_ENV}" == "staging" ]]; then
        INFERRED_RES_ID="dpg-db474ae0tbcc73dcgr10-a"
    elif [[ "${INFERRED_ENV}" == "production" ]]; then
        INFERRED_RES_ID="dpg-dasmr1e0tbcc73849i90-a"
    else
        INFERRED_RES_ID="local"
    fi
fi

if [[ ! -f "${MANIFEST_PATH}" ]]; then
    cat <<EOF > "${MANIFEST_PATH}"
{
  "environment": "${INFERRED_ENV}",
  "resourceId": "${INFERRED_RES_ID}",
  "postgresMajorVersion": 16,
  "backupTimestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "backupFile": "${FILENAME}",
  "fileSizeBytes": ${FILE_SIZE},
  "sha256": "${COMPUTED_HASH}",
  "archiveValidation": "passed",
  "restoreTest": null
}
EOF
    echo "[OK] Generated manifest at ${MANIFEST_PATH}"
fi

echo "===================================================="
echo "SUCCESS: Backup archive verified."
echo "===================================================="
