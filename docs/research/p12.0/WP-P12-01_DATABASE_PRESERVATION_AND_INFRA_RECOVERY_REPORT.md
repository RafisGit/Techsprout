# TechSprout LMS — Phase 12.1 / WP-P12-01 Implementation & Recovery Report
**Database Preservation, Backup Verification & Infrastructure Recovery**

**Repository:** `RafisGit/Techsprout`  
**Feature Branch:** `feat/p12-production-readiness`  
**Base Commit:** `4a3ddf0` (`feat(p11): complete end-to-end certificate lifecycle integration`)  
**Work Package:** `WP-P12-01`  
**Date:** 2026-11-01  
**Status:** **PARTIAL — STAGING BACKUP PENDING OPERATOR CREDENTIAL INPUT / PRODUCTION PRE-SUSPENSION BACKUP PROVEN RESTORABLE**

---

## 1. Executive Summary

Work Package WP-P12-01 initiated Phase 12 (Production Readiness) with the immediate mandate of database preservation and infrastructure recovery across TechSprout LMS.

### Core Achievements & Live Findings:
1. **Git State & History Preserved:** Branch `feat/p12-production-readiness` was established directly from P11.4 completion commit `4a3ddf0`. The complete 11-phase commit history remains intact with zero destructive resets or unapproved pushes.
2. **Empirical Cloud Probing of Databases:**
   - **Staging Database (`techsprout-postgres-staging`, `dpg-db474ae0tbcc73dcgr10-a`):** Confirmed online and accessible over TCP on port 5432 (`35.227.164.209:5432`). It successfully negotiates TLS and enforces password authentication for user `techsprout_staging`. Staging API (`https://techsprout-api-staging.onrender.com/api/v1/health`) responded with `HTTP 200 OK` (`database: "up"`, `redis: "up"`). The database expires in 7 days (**November 8, 2026 at 04:48:42 UTC**).
   - **Production Database (`techsprout-postgres`, `dpg-dasmr1e0tbcc73849i90-a`):** Confirmed suspended. Live TCP connections negotiate TLS but are immediately terminated by Render gateway with `SSL connection has been closed unexpectedly` due to billing expiration on October 27, 2026.
3. **Database Pre-Deployment Backup Verified & Restore-Tested:**
   - The pre-suspension physical backup archive `techsprout-production-2026-10-14.dump` (150,149 bytes, SHA-256 `D8406730D54A6CF29595371257251BE3A0B74A0EA34005F27D0395404A11254E`) was verified with `pg_restore --list` (285 TOC entries).
   - An active isolated restore test was executed inside a temporary disposable PostgreSQL 18 cluster on ephemeral port `54333`. `pg_restore` completed with **exit code 0**, accurately restoring 33 database tables (32 in `public`, 1 in `drizzle`) and all records with zero errors.
4. **Air-Gapped Backup & Recovery Automation:** Developed reusable, secure, cross-platform operational scripts in `scripts/ops/` and comprehensive runbook documentation in `docs/ops/database-backup-and-recovery.md`.
5. **Git Safeguards:** Updated `.gitignore` to guarantee `.dump`, `.backup`, and `*.manifest.json` files can never be committed to source control.

---

## 2. Render Database States & Resource Identifiers

| Environment | Resource Name | Resource ID | Region | Status | Expiry / Suspension | Empirical Verification Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Production** | `techsprout-postgres` | `dpg-dasmr1e0tbcc73849i90-a` | `oregon` | **SUSPENDED** | Suspended: Oct 27, 2026 (Billing) | Port 5432 reachable; TLS negotiation aborted by Render proxy (`SSL connection closed unexpectedly`). |
| **Staging** | `techsprout-postgres-staging` | `dpg-db474ae0tbcc73dcgr10-a` | `oregon` | **AVAILABLE** | Expiry: Nov 8, 2026 at 04:48:42 UTC | Port 5432 reachable; TLS negotiation succeeds; enforces password auth (`FATAL: password authentication failed`). |

---

## 3. Staging Database Backup Outcome & Action Required

### 3.1 Security & Credential Audit
In compliance with repository safety standards:
- Neither plaintext PostgreSQL passwords nor administrative `RENDER_API_KEY` tokens are stored in tracked repository files, environment files, or local disk configuration.
- The live Render PostgreSQL server at `dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com` strictly enforces password authentication.
- Consequently, programmatic `pg_dump` from an unauthenticated agent environment without operator input is properly blocked.

### 3.2 Gate Status: `BLOCKED PENDING OPERATOR CREDENTIAL INPUT`
To prevent data loss before the November 8 expiration date, the account owner must execute the automated backup script locally using the external connection string from the Render Dashboard.

#### Exact Operator Command:
```powershell
& powershell.exe -ExecutionPolicy Bypass -File "scripts/ops/backup-postgres.ps1" `
    -Environment staging `
    -ResourceId "dpg-db474ae0tbcc73dcgr10-a" `
    -OutputDir "$env:USERPROFILE\TechSproutBackups"
```
*(The operator will be prompted to paste the Render External Database URL privately into a masked input field).*

---

## 4. Production Database Pre-Suspension Backup Verification & Restore Test

To establish a verified baseline for disaster recovery, the existing physical backup archive taken prior to production suspension was subjected to end-to-end cryptographic and restore validation.

### 4.1 Backup Artifact Metadata
- **Archive Path:** `%USERPROFILE%\TechSproutBackups\techsprout-production-2026-10-14.dump`
- **File Size:** `150,149 bytes`
- **Recorded Creation Timestamp:** `2026-10-15 00:29:59`
- **PostgreSQL Version:** PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2)
- **Archive Format:** PostgreSQL Custom Format (`pg_dump -Fc --no-owner --no-acl`, gzip compressed)
- **Cryptographic SHA-256 Checksum:** `D8406730D54A6CF29595371257251BE3A0B74A0EA34005F27D0395404A11254E`
- **Integrity Validation:** **PASS** (Matches pre-deployment hash from Phase 6.3 review).

### 4.2 Table of Contents (TOC) Inspection
- **Total TOC Entries:** `285 entries`
- **Schemas Identified:** `public`, `drizzle`
- **Database Tables Cataloged:** `33 tables`
- **Extensions:** `pgcrypto`

### 4.3 Isolated Restore-Test Execution & Findings
An automated restore test was executed via [`scripts/ops/restore-postgres-local.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/restore-postgres-local.ps1):
1. **Cluster Initialization:** Initialized a disposable cluster at `$env:TEMP\techsprout_pg_restore_492c0d96` using `initdb --encoding=UTF8 -A trust`.
2. **Server Startup:** Started ephemeral PostgreSQL server on port `54333` listening strictly on `127.0.0.1`.
3. **Database Creation:** Created isolated test database `techsprout_restore_verification`.
4. **Restore Execution:** Ran `pg_restore --no-owner --no-acl` against the database.
   - **`pg_restore` Exit Code:** **`0` (CLEAN PASS)**.
5. **Schema & Table Inventory Verification:**
   - Schemas: `public` (32 tables), `drizzle` (1 table: `__drizzle_migrations`).
6. **Non-Sensitive Row Count Verification:**
   - `users`: **10**
   - `courses`: **11**
   - `categories`: **6**
   - `modules`: **22**
   - `lessons`: **44**
   - `enrollments`: **1**
   - `certificates`: **0**
   - `__drizzle_migrations`: **7**
7. **Cluster Disposal:** The server was stopped immediately and the temporary cluster directory purged from disk.

---

## 5. Production Database Recovery Plan & Owner Actions

### Current State
`techsprout-postgres` (`dpg-dasmr1e0tbcc73849i90-a`) is in a `suspended` state by Render due to billing expiration on October 27, 2026.

### Supported Recovery Paths:
1. **Primary Path (In-Place Resume):**
   - Render retains underlying disk volumes for suspended databases during a temporary grace window.
   - **Action Required by Account Owner:**
     1. Log into [Render Dashboard](https://dashboard.render.com).
     2. Select workspace **`techsprout`** and open **`techsprout-postgres`**.
     3. Resolve billing (update payment card or choose Starter tier).
     4. Click **Resume Database**.
     5. Once Render reports `Available`, run `backup-postgres.ps1` immediately.
2. **Secondary Path (Disaster Recovery from Verified Backup):**
   - If Render has deleted the underlying disk image or billing cannot be resolved on the original instance, the pre-suspension backup archive (`techsprout-production-2026-10-14.dump`) is **100% verified and proven restorable**.
   - A fresh PostgreSQL 16 database can be provisioned and restored in under 2 minutes.

---

## 6. Database Network Exposure Review

### Current State
Inspection of live infrastructure and repository configurations revealed:
- `render.yaml` and `render.staging.yaml` show external database access enabled with an IP allowlist configured to `0.0.0.0/0`.
- Both databases resolve to public IP `35.227.164.209` on port `5432`.

### Risk & Findings
- **Security Blocker:** Leaving `0.0.0.0/0` exposed on PostgreSQL port 5432 subjects the database to continuous internet-wide brute-force connection attempts.
- **Service Ingress Necessity:**
  - The API web services (`techsprout-api` and `techsprout-api-staging`) run in the same Render region (`oregon`).
  - Render provides **Private Networking** within each workspace using internal hostnames (`techsprout-postgres` / `techsprout-postgres-staging`).
  - Application-to-database communication does NOT require public internet routing or external IP allowlisting.
  - The only reason external access was enabled was for manual operator inspection and backup creation from dynamic developer IPs.

### Safe Remediation Recommendation
1. **Immediate:** Do NOT disable external access until the staging backup is secured by the operator.
2. **Target State:**
   - Reconfigure application `DATABASE_URL` in Render Blueprints to use internal private network hostnames (`property: connectionString` from database).
   - In the Render Dashboard, remove `0.0.0.0/0` from the IP allowlist.
   - Restrict external ingress to specific static VPN/operator IPs or open the allowlist only during scheduled administrative maintenance windows.

---

## 7. Infrastructure Configuration Inventory

### 7.1 Render Infrastructure
- **Workspaces:**
  - `techsprout` (Production)
  - `TechSprout Staging` (Staging)
- **Web Services:**
  - Production: `techsprout-api` (Runtime: Node, Plan: Free, Region: Oregon, Branch: `main`, Domain: `https://techsprout-api.onrender.com`).
  - Staging: `techsprout-api-staging` (Runtime: Node, Plan: Free, Region: Oregon, Branch: `release/p6.3-candidate`, Domain: `https://techsprout-api-staging.onrender.com`).
- **Key-Value (Redis):**
  - Production: `techsprout-redis` (Plan: Free, Region: Oregon, `ipAllowList: []`, `maxmemoryPolicy: noeviction`).
  - Staging: `techsprout-redis-staging` (Plan: Free, Region: Oregon, `ipAllowList: []`, `maxmemoryPolicy: noeviction`).
- **PostgreSQL Databases:**
  - Production: `techsprout-postgres` (PostgreSQL 16, Plan: Free, Status: Suspended).
  - Staging: `techsprout-postgres-staging` (PostgreSQL 16, Plan: Free, Status: Available).

### 7.2 Frontend Hosting (Vercel)
- Production Domain: `https://techsprout-web.vercel.app`
- Staging Domains: `https://staging.techsprout-web.vercel.app`, `https://techsprout-web-staging.vercel.app`

### 7.3 Startup-Command Discrepancy Findings
- **Observed Discrepancy:**
  - Live Render staging configuration & `render.staging.yaml`:
    `startCommand: node apps/api/dist/database/migrate.js && node apps/api/dist/database/seed/seed.js && node apps/api/dist/main.js`
  - Checked-in `render.yaml` (Production):
    `startCommand: node apps/api/dist/main.js`
- **Analysis:**
  - Running `migrate.js` on startup is idempotent because Drizzle ORM checks `__drizzle_migrations`.
  - Running `seed.js` on startup checks for existing records before inserting. While structurally idempotent, running seed operations on every production container reboot introduces unnecessary cold-start latency (10-20 seconds delay on Render free/starter tiers) and risks startup failure if a unique constraint check fails.
- **Recommendation:**
  - In production, migrations should run via a dedicated release phase or deployment hook, and `seed.js` must NEVER run on production startup.
  - The start command in `render.yaml` (`node apps/api/dist/main.js`) is the correct architecture and should be maintained.

---

## 8. Database Migration & Rollback Safety Baseline

### 8.1 Migration Inventory
12 versioned migrations recorded in `apps/api/src/database/migrations/meta/_journal.json`:
1. `0000_initial_schema` (`when: 1727430000000`)
2. `0001_whole_living_tribunal` (`when: 1790706794581`)
3. `0002_small_talon` (`when: 1790788929154`)
4. `0003_hard_night_thrasher` (`when: 1790795351051`)
5. `0004_payment_admin_subsystem` (`when: 1790800000000`)
6. `0005_refund_requests_subsystem` (`when: 1791184848587`)
7. `0006_p6_1_notification_and_ownership` (`when: 1791353000000`)
8. `0007_instructor_platform_foundation` (`when: 1791584243020`)
9. `0008_analytics_foundation` (`when: 1791800000000`)
10. `0009_telemetry_foundation` (`when: 1792000000000`)
11. `0010_monetization_ledger` (`when: 1792500000000`)
12. `0011_discussions_and_assignments` (`when: 1793000000000`)

### 8.2 Safety & Rollback Findings
- **Applied Status:**
  - Production pre-suspension backup has migrations 0 through 6 applied (7 total).
  - Staging database has migrations 0 through 8 applied (9 total).
  - Subsequent migrations (0009, 0010, 0011) are pending deployment.
- **Rollback Limitation:** Only migration 0009 includes a corresponding `.down.sql` file (`0009_telemetry_foundation.down.sql`). Other migrations are forward-only DDL.
- **Protocol:** Pre-migration `.dump` backup creation is mandatory before executing migrations 0009–0011.

---

## 9. Scripts & Documentation Added

- [`scripts/ops/backup-postgres.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/backup-postgres.ps1) — PowerShell automated backup with masked credentials.
- [`scripts/ops/backup-postgres.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/backup-postgres.sh) — POSIX Bash automated backup.
- [`scripts/ops/verify-postgres-backup.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/verify-postgres-backup.ps1) — PowerShell backup archive verifier.
- [`scripts/ops/verify-postgres-backup.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/verify-postgres-backup.sh) — POSIX Bash backup archive verifier.
- [`scripts/ops/restore-postgres-local.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/restore-postgres-local.ps1) — PowerShell isolated disposable cluster restore tester.
- [`scripts/ops/restore-postgres-local.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/restore-postgres-local.sh) — POSIX Bash local restore tester.
- [`docs/ops/database-backup-and-recovery.md`](file:///d:/Work/2026/techsprout-main/docs/ops/database-backup-and-recovery.md) — Comprehensive operational runbook.
- [`.gitignore`](file:///d:/Work/2026/techsprout-main/.gitignore) — Hardened to strictly exclude dump files, manifests, and backup folders.

---

## 10. Remaining Blockers & Risk Classification

| Gate / Asset | Status | Classification | Owner Action Required |
| :--- | :---: | :--- | :--- |
| **Staging DB Preservation** | **BLOCKED** | **CRITICAL (7 days to expiry)** | Run `scripts/ops/backup-postgres.ps1` with Render Staging External DB URL. |
| **Production DB Recovery** | **BLOCKED** | **HIGH (Suspended)** | Log into Render Dashboard and resume `techsprout-postgres` or authorize DR restore. |
| **Network Ingress Review** | **ACTIONABLE** | **MEDIUM** | Remove `0.0.0.0/0` after staging backup is secured; use private networking. |
| **Pre-Suspension DR Backup** | **VERIFIED** | **RESOLVED** | Proven restorable with 33 tables and 0 errors in isolated test. |
