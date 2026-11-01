# TechSprout LMS — Database Backup, Verification & Recovery Runbook

**Document ID:** `OPS-DB-001`  
**Phase:** P12 — Production Readiness  
**Target Environments:** Staging (`techsprout-postgres-staging`) & Production (`techsprout-postgres`)  
**PostgreSQL Target Version:** 16.x  
**Classification:** Operational Security & Disaster Recovery Standard

---

## 1. Overview & Architectural Principles

TechSprout LMS relies on managed PostgreSQL 16 instances hosted on Render Cloud. To ensure absolute data preservation and disaster recovery readiness, all database backup and recovery operations must adhere to the following principles:

1. **Logical Custom-Format Archives:** All backups use PostgreSQL's custom binary format (`pg_dump --format=custom --no-owner --no-acl`), enabling selective table restoration, parallel restore capability, and built-in gzip compression.
2. **Cryptographic Integrity:** Every backup artifact is validated by generating a SHA-256 checksum and recording it alongside metadata in an adjacent manifest (`.manifest.json`).
3. **Zero Secrets in Repositories or Logs:** Database passwords, connection URIs, and credentials must never be printed to stdout, logged to shell history, committed to Git, or stored in plaintext files.
4. **Air-Gapped & Excluded Backups:** Physical `.dump` files and secret manifests are strictly excluded from Git via `.gitignore` and must be stored in protected operator directories (e.g., `%USERPROFILE%\TechSproutBackups` or secure off-site cold storage).
5. **Fail-Closed & Safe Restores:** Restore scripts strictly enforce `localhost` / `127.0.0.1` execution checks and utilize disposable ephemeral clusters to prevent accidental overwrites of staging or production databases.
6. **Multi-Factor Pre-Migration Gates:** Database migrations cannot proceed on staging or production unless a fresh (<= 7 days old), verified, isolated restore-tested backup matching the target environment and resource ID exists.

---

## 2. Infrastructure Identity & State Matrix

| Environment | Resource Name | Resource ID | Region | Status | Known Expiry / State | Network Mode |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Production** | `techsprout-postgres` | `dpg-dasmr1e0tbcc73849i90-a` | `oregon` | **SUSPENDED** (Billing) | Suspended Oct 27, 2026 | Private + External (`0.0.0.0/0`) |
| **Staging** | `techsprout-postgres-staging` | `dpg-db474ae0tbcc73dcgr10-a` | `oregon` | **AVAILABLE** | Expiry: Nov 8, 2026 (04:48:42 UTC) | Private + External (`0.0.0.0/0`) |

---

## 3. Operational Automation Scripts

The repository provides production-grade, cross-platform scripts in `scripts/ops/`:

| Script | Platform | Purpose | Safety Safeguards |
| :--- | :--- | :--- | :--- |
| [`scripts/ops/backup-postgres.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/backup-postgres.ps1) | Windows PowerShell | Creates logical `.dump` + `.manifest.json` | Masked credential prompt, overwrite prevention, TLS forced (`require`), TOC verified via `pg_restore --list`. |
| [`scripts/ops/backup-postgres.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/backup-postgres.sh) | Linux / macOS Bash | Creates logical `.dump` + `.manifest.json` | Fail-closed on missing vars, permission hardening (`chmod 600`), TOC verification. |
| [`scripts/ops/backup-gate.mjs`](file:///d:/Work/2026/techsprout-main/scripts/ops/backup-gate.mjs) | Node.js ESM | Pre-migration backup gate validation engine | Zero-trust validation: environment, resource ID, 7-day age, SHA-256, TOC, and restore test matching. |
| [`scripts/ops/verify-postgres-backup.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/verify-postgres-backup.ps1) | Windows PowerShell | Verifies TOC and SHA-256 against manifest | Checks file size, TOC entry count, schema inventory (`pg_restore --list`), and manifest generation. |
| [`scripts/ops/verify-postgres-backup.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/verify-postgres-backup.sh) | Linux / macOS Bash | Verifies TOC and SHA-256 | Validates parseability of archive headers and catalog entries. |
| [`scripts/ops/restore-postgres-local.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/restore-postgres-local.ps1) | Windows PowerShell | Isolated disposable restore test | Spawns temporary `initdb` cluster on port 54333, verifies row counts, records `restoreTest` in manifest, destroys cluster. |
| [`scripts/ops/restore-postgres-local.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/restore-postgres-local.sh) | Linux / macOS Bash | Disposable test database restore | Blocks non-local targets; verifies table counts, records `restoreTest` in manifest. |
| [`scripts/ops/run-migrations.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.ps1) | Windows PowerShell | Controlled migration execution | Enforces pre-migration backup gate, rejects seeds, fails closed. |
| [`scripts/ops/run-migrations.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.sh) | Linux / macOS Bash | Controlled migration execution | Enforces pre-migration backup gate, rejects seeds, fails closed. |

---

## 4. Machine-Readable Backup Manifest Standard

All logical backups generate an adjacent JSON manifest containing only safe, non-sensitive metadata:

```json
{
  "environment": "staging",
  "resourceId": "dpg-db474ae0tbcc73dcgr10-a",
  "postgresMajorVersion": 16,
  "backupTimestamp": "2026-11-01T06:00:00Z",
  "backupFile": "techsprout-staging-2026-11-01-060000.dump",
  "fileSizeBytes": 150149,
  "sha256": "D8406730D54A6CF29595371257251BE3A0B74A0EA34005F27D0395404A11254E",
  "archiveValidation": "passed",
  "restoreTest": {
    "status": "passed",
    "postgresMajorVersion": 16,
    "testedBackupSha256": "D8406730D54A6CF29595371257251BE3A0B74A0EA34005F27D0395404A11254E",
    "testedAt": "2026-11-01T06:15:00Z"
  }
}
```

### Safety Rules:
- **No Credentials:** Never store passwords, usernames, full connection URIs, or tokens.
- **Same-Major Versioning:** `restoreTest.postgresMajorVersion` must strictly match `postgresMajorVersion` (e.g. 16 to 16).
- **Cryptographic Binding:** `restoreTest.testedBackupSha256` must equal the backup's `sha256`.

---

## 5. Step-by-Step Operator Procedures

### Procedure A: Backing Up Staging Before Expiration (Priority 1)

> [!IMPORTANT]
> The staging database `techsprout-postgres-staging` (`dpg-db474ae0tbcc73dcgr10-a`) is scheduled for deprovisioning by Render on **November 8, 2026 at 04:48:42 UTC**. The account owner must take a logical backup before this date.

#### Using PowerShell (Windows Operator):
```powershell
# 1. Ensure you have the External Database URL from Render Dashboard
# 2. Run the backup automation (you will be prompted to paste the URL privately):
& powershell.exe -ExecutionPolicy Bypass -File "scripts/ops/backup-postgres.ps1" `
    -Environment staging `
    -ResourceId "dpg-db474ae0tbcc73dcgr10-a" `
    -OutputDir "$env:USERPROFILE\TechSproutBackups"
```

#### Using Bash (POSIX / CI):
```bash
export DATABASE_URL="postgresql://techsprout_staging:<PASSWORD>@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com/techsprout_staging"
./scripts/ops/backup-postgres.sh staging "dpg-db474ae0tbcc73dcgr10-a" "$HOME/TechSproutBackups"
unset DATABASE_URL
```

---

### Procedure B: Verifying a Backup Archive

Once a `.dump` archive is created, verify its integrity before signing off on data preservation:

```powershell
& powershell.exe -ExecutionPolicy Bypass -File "scripts/ops/verify-postgres-backup.ps1" `
    -BackupFile "$env:USERPROFILE\TechSproutBackups\techsprout-staging-<TIMESTAMP>.dump" `
    -Environment staging `
    -ResourceId "dpg-db474ae0tbcc73dcgr10-a"
```

Expected output:
- File size > 0 bytes.
- Cryptographic SHA-256 match against `.manifest.json`.
- Table of Contents parsed successfully with `pg_restore --list`.
- Both `public` and `drizzle` schemas confirmed present.

---

### Procedure C: Executing an Isolated Restore Test

To prove that the archive is completely restorable without corruptions or missing sequences:

```powershell
& powershell.exe -ExecutionPolicy Bypass -File "scripts/ops/restore-postgres-local.ps1" `
    -BackupFile "$env:USERPROFILE\TechSproutBackups\techsprout-staging-<TIMESTAMP>.dump"
```

The script will:
1. Spin up a temporary, completely isolated PostgreSQL 16 cluster in `$env:TEMP` on ephemeral port `54333` using `auth-method=trust`.
2. Create database `techsprout_restore_verification`.
3. Restore the archive via `pg_restore --no-owner --no-acl`.
4. Output verified table inventories and primary entity row counts.
5. Record `restoreTest: { status: "passed", postgresMajorVersion: 16 }` into `.manifest.json`.
6. Immediately stop the server and delete all temporary files.

---

## 6. Pre-Migration Backup Verification Gate

Controlled migration execution via `run-migrations.ps1` and `run-migrations.sh` enforces the following zero-trust checks:

1. **Existence:** Target backup file exists and length > 0.
2. **Environment Match:** Target migration environment strictly matches `manifest.environment`. Cross-environment satisfy is forbidden.
3. **Resource ID Match:** Target resource ID matches `manifest.resourceId`.
4. **Freshness Window:** Backup timestamp is within 7.0 days of the migration execution time.
5. **Cryptographic Match:** Actual dump SHA-256 matches `manifest.sha256`.
6. **TOC Validation:** `manifest.archiveValidation` equals `"passed"`.
7. **PostgreSQL Version:** `manifest.postgresMajorVersion` is recorded as an integer (e.g. 16).
8. **Restore Test Evidence:** `manifest.restoreTest` exists, is non-null, and status is `"passed"`.
9. **Restore Checksum Match:** `manifest.restoreTest.testedBackupSha256` matches `manifest.sha256`.
10. **Same-Major Versioning:** `manifest.restoreTest.postgresMajorVersion` matches `manifest.postgresMajorVersion`.
11. **Fail-Closed:** Any missing, expired, or tampered artifact terminates execution immediately before any migration script runs.

---

## 7. Staging Expiration Protection & Disaster Recovery Procedure

### Staging Expiration Timeline
- **Resource:** `techsprout-postgres-staging` (`dpg-db474ae0tbcc73dcgr10-a`)
- **Expiration Date:** **November 8, 2026 at 04:48:42 UTC**
- **Action Required:** Operator must execute Procedure A and capture a full logical backup before the expiration timestamp.

### Network Lockdown Prerequisites (Section 6 Gate)
The broad external IP allowlist entry `0.0.0.0/0` on Render PostgreSQL must **NOT** be removed until:
1. Staging API (`https://techsprout-api-staging.onrender.com/api/v1/health`) confirms internal private connectivity is healthy.
2. The staging backup has been extracted, validated, and restore-tested.
3. Once those gates pass, remove `0.0.0.0/0` in Render Dashboard under `techsprout-postgres-staging` $\rightarrow$ **Access Control**.

### Recovery if Staging Deprovisions
If Render deprovisions `techsprout-postgres-staging`:
1. Provision a fresh PostgreSQL 16 database in workspace `TechSprout Staging` with name `techsprout-postgres-staging` in region `oregon`.
2. Restore the latest verified staging backup dump using `pg_restore --no-owner --no-acl`.
3. Update the `techsprout-api-staging` web service environment variable `DATABASE_URL` via the internal connection string.
4. Verify staging health at `GET /api/v1/health`.

---

## 8. Production Database Recovery Plan

### Current Status
- Database `techsprout-postgres` (`dpg-dasmr1e0tbcc73849i90-a`) was suspended on **October 27, 2026** due to billing expiration.
- Live TLS probes fail immediately with `SSL connection has been closed unexpectedly` because Render drops traffic to suspended instances.

### Primary Recovery Path: Render Dashboard Account-Owner Resume
1. The Render account owner must log into the [Render Dashboard](https://dashboard.render.com).
2. Navigate to workspace **`techsprout`** $\rightarrow$ **`techsprout-postgres`**.
3. Under **Billing / Subscription**, resolve outstanding charges or select an active database tier (Starter or higher).
4. Click **Resume Database**.
5. Once Render reports the database `Available`, verify connectivity and immediately execute Procedure A to generate a fresh logical backup.

### Secondary Recovery Path: Disaster Recovery from Verified Pre-Suspension Backup
If Render has purged the suspended resource or billing cannot be resolved on the original instance:
1. Locate the verified pre-suspension backup archive:
   - **Path:** `%USERPROFILE%\TechSproutBackups\techsprout-production-2026-10-14.dump`
   - **File Size:** `150,149 bytes`
   - **SHA-256:** `D8406730D54A6CF29595371257251BE3A0B74A0EA34005F27D0395404A11254E`
   - **Status:** **PROVEN RESTORABLE** (Verified in WP-P12-01 isolated restore test with 33 tables and zero errors).
2. Provision a clean PostgreSQL 16 database on Render or self-hosted infrastructure.
3. Restore the archive using `pg_restore --no-owner --no-acl`.
4. Point `DATABASE_URL` in `render.yaml` to the restored instance.
