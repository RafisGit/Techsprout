#!/usr/bin/env bash
# ==============================================================================
# TechSprout LMS - Controlled Database Migration Runner (POSIX Bash)
# ==============================================================================
# Executes pending Drizzle ORM migrations as an isolated, deliberate release operation.
# Enforces pre-migration backup presence, fails closed on error, and never executes seeds.
# ==============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
BACKUP_DIR="${2:-${HOME}/TechSproutBackups}"

echo "===================================================="
echo "TechSprout LMS — Controlled Migration Execution"
echo "Target Environment: ${ENVIRONMENT}"
echo "Timestamp:          $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "===================================================="

# 1. Require DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "ERROR: DATABASE_URL environment variable is required but missing." >&2
    echo "Usage: DATABASE_URL='postgresql://...' ./run-migrations.sh [environment] [backup_dir]" >&2
    exit 1
fi

# 2. Check Backup for staging/production
if [[ "${ENVIRONMENT}" == "staging" ]] || [[ "${ENVIRONMENT}" == "production" ]]; then
    echo "[CHECK] Verifying pre-migration backup presence in ${BACKUP_DIR}..."
    if [[ ! -d "${BACKUP_DIR}" ]]; then
        echo "ERROR: Backup directory ${BACKUP_DIR} does not exist. Pre-migration backup is mandatory." >&2
        exit 1
    fi
    RECENT_DUMP=$(find "${BACKUP_DIR}" -name "*.dump" -size +0c -mtime -7 2>/dev/null | head -n 1 || true)
    if [[ -z "${RECENT_DUMP}" ]]; then
        echo "ERROR: No verified non-empty .dump archive found within the last 7 days in ${BACKUP_DIR}." >&2
        exit 1
    fi
    echo "[OK] Found pre-migration backup: ${RECENT_DUMP}"
fi

# 3. Execute Migrations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

export PGSSLMODE="require"

if [[ -f "${REPO_ROOT}/apps/api/dist/database/migrate.js" ]]; then
    echo "[RUN] Running compiled migration runner..."
    node "${REPO_ROOT}/apps/api/dist/database/migrate.js"
else
    echo "[RUN] Running tsx migration runner..."
    pnpm --filter @techsprout/api exec tsx src/database/migrate.ts
fi

echo "===================================================="
echo "SUCCESS: Database migration run completed."
echo "===================================================="
