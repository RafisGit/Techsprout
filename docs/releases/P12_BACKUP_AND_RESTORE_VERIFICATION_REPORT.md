# TECHSPROUT LMS — PHASE 12 BACKUP AND RESTORE VERIFICATION REPORT
## Comprehensive Audit of Staging Database Snapshot, Isolated Docker PostgreSQL 16 Recovery, and Application Data Integrity

**Project:** TechSprout Learning Management System (LMS)  
**Milestone:** Phase 12 (P12) — Workpackage P12.3  
**Repository:** `RafisGit/Techsprout`  
**Candidate Branch:** `feat/p12-production-readiness`  
**Head Commit:** `3033bd8`  
**Evaluation Date:** 2026-11-04  
**Evaluator:** Database Reliability & Security Engineering  
**Verification Verdict:** **VERIFIED (Cryptographically Proven, Restored in Docker PG 16.15, Application-Level Zero-Defect)**

---

## 1. Scope & Objective

This report provides the authoritative technical audit and evidence of database preservation for the TechSprout LMS staging environment. With the free-tier Render staging database approaching its scheduled expiration on **November 8, 2026 at 04:48:42 UTC**, this workstream was executed to:

1. Capture an uncorrupted, complete, and reproducible backup of the staging PostgreSQL 16 database.
2. Protect all database credentials during capture, eliminating CLI argument, environment, and shell history leakage.
3. Validate client-to-server PostgreSQL major version compatibility (PG 16.15 $\rightarrow$ PG 16.15).
4. Prove restore feasibility via an automated, fully isolated Docker PostgreSQL 16 recovery procedure running with `--network none`.
5. Verify application-level referential integrity and real business read query execution against the restored schema.
6. Provide an operational runbook and network security closure plan for the hosted staging environment.

---

## 2. Source Database Provenance

The backup was captured directly from the live Render staging database prior to its expiration.

### 2.1 Staging Environment Metadata
| Attribute | Specification |
|---|---|
| **Cloud Hosting Provider** | Render Managed PostgreSQL |
| **Service Tier** | Free Tier (750 hours/month compute) |
| **Resource Identifier** | `dpg-db474ae0tbcc73dcgr10-a` |
| **Hosted Staging Hostname** | `dpg-db474ae0tbcc73dcgr10-a-oregon-postgres.render.com` |
| **Region** | Oregon, USA (`us-west`) |
| **Database Name** | `techsprout_staging` |
| **Engine / Server Version** | `PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2)` |
| **Expiration Deadline** | **2026-11-08 04:48:42 UTC** |
| **SSL Requirement** | Mandatory (`sslmode=require`) |

---

## 3. Backup Capture & Cryptographic Provenance

The backup was executed on **2026-11-04** using the hardened `scripts/ops/backup-postgres.ps1` script.

### 3.1 Backup File Specifications
| Property | Value |
|---|---|
| **Backup File Name** | `techsprout-staging-2026-11-04-165705.dump` |
| **Local File Location** | `C:\Users\hrafi\TechSproutBackups\techsprout-staging-2026-11-04-165705.dump` |
| **Manifest File Name** | `techsprout-staging-2026-11-04-165705.manifest.json` |
| **Backup Timestamp** | `2026-11-04T10:57:56Z` (16:57:05 +06:00) |
| **Exact File Size** | **240,974 bytes** |
| **Cryptographic Checksum** | `SHA-256: F55515E770BE62E3577586D7CAB03E5E57DBFE93DCEA51AB62CB68406F697FAF` |
| **Archive Format** | PostgreSQL Custom Format (`-Fc`), gzip compressed |
| **Dump Parameters** | `pg_dump --no-owner --no-acl --no-password -Fc` |
| **Client Version** | `pg_dump (PostgreSQL) 16.15` |
| **Verification Tool** | `pg_restore (PostgreSQL) 16.15` |

### 3.2 Manifest Schema & Integrity Record
The manifest file `techsprout-staging-2026-11-04-165705.manifest.json` preserves the complete audit record:

```json
{
    "environment": "staging",
    "resourceId": "dpg-db474ae0tbcc73dcgr10-a",
    "postgresMajorVersion": 16,
    "postgresServerVersion": "16.15 (Debian 16.15-1.pgdg12+2)",
    "pgDumpVersion": "pg_dump (PostgreSQL) 16.15",
    "pgRestoreVersion": "pg_restore (PostgreSQL) 16.15",
    "backupTimestamp": "2026-11-04T10:57:56Z",
    "backupFile": "techsprout-staging-2026-11-04-165705.dump",
    "fileSizeBytes": 240974,
    "sha256": "F55515E770BE62E3577586D7CAB03E5E57DBFE93DCEA51AB62CB68406F697FAF",
    "archiveValidation": "passed",
    "restoreTest": {
        "status": "passed",
        "postgresMajorVersion": 16,
        "postgresServerVersion": "16.15 (Debian 16.15-1.pgdg13+2)",
        "testedBackupSha256": "F55515E770BE62E3577586D7CAB03E5E57DBFE93DCEA51AB62CB68406F697FAF",
        "testedAt": "2026-11-04T12:05:46Z",
        "tablesCount": 46,
        "totalRows": 870,
        "migrationsCount": 12
    },
    "format": "custom",
    "flags": "--no-owner --no-acl --no-password"
}
```

---

## 4. Credential Protection & Tooling Security Audit

### 4.1 Threat Model & Safeguards Implemented
| Attack Vector / Failure Mode | Hardening Mechanism Implemented |
|---|---|
| **Process Command-Line Snooping** | The connection URI is never passed as an argument to `pg_dump`, `pg_restore`, or `psql`. Connection parameters are passed via standard PG environment variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`) with password passed exclusively through a temporary `.pgpass` file. |
| **PowerShell 5.1 Console Paste Flaw** | Standard `Read-Host -AsSecureString` in Windows PowerShell 5.1 converts paste events (`Ctrl+V`) into control character 22. Replaced with local clipboard ingestion via `Get-Clipboard -Raw`, followed immediately by `Clear-StagingClipboard` memory wipe. |
| **NTFS File Permission Exposure** | The temporary `.pgpass` file is created in a user-only directory with explicit NTFS ACLs: all inheritance removed, access granted exclusively to the current Windows user SID, and deleted in a `finally` block. |
| **PostgreSQL Toolchain Mismatches** | Explicit binary path resolution from `C:\Program Files\PostgreSQL\16\bin`. The script invokes `pg_dump --version`, `pg_restore --version`, and `psql --version`, validating major version 16 and aborting on any other version. |
| **Target Resource Mismatch** | Validates that the hostname in the connection URI contains the expected Render resource identifier `dpg-db474ae0tbcc73dcgr10-a` and the database name is `techsprout_staging`. |

### 4.2 Automated Safety Suite Verification
The test suite `scripts/ops/test-staging-backup-safety.ps1` was executed to verify all edge cases:
- **Total Test Cases:** 43
- **Passed:** 43
- **Failed:** 0
- **Pass Rate:** 100%
- **Verified Behaviors:**
  - Non-staging environment parameters rejected (`-Environment production`).
  - Resource ID mismatches rejected.
  - `-MockServerVersion` rejected unless `-WhatIfOnly` is explicitly set.
  - Non-16 server versions rejected during live validation.
  - Offline dry-run (`-WhatIfOnly`) executes without touching credentials, disk, or network.
  - Malformed URIs, query strings, and credential decoding tested without error leakage.
  - Clipboard clearing verified.

---

## 5. Isolated Docker PostgreSQL 16.15 Restore Test

### 5.1 Methodology & Network Isolation
To verify that the backup is valid and complete without risking production systems or incurring cloud costs, a restore test was executed using Docker:
- **Runner Script:** `scripts/ops/restore-postgres-docker.ps1` / `.sh`
- **Docker Image:** `postgres:16.15` (matching the major version of the source database)
- **Network Isolation:** Container started with `--network none`.
  - Zero listening ports on host or local network.
  - Zero external IP routing.
  - Complete protection against accidental network broadcast or exfiltration.
- **Data Ingestion:** The backup archive was copied into the container filesystem via `docker cp`.
- **Database Initialization:** Created target database `techsprout_restore` owned by `postgres`.

### 5.2 Restore Execution Log
```text
====================================================
TechSprout LMS - Isolated Docker PostgreSQL 16 Restore
Target Image:       postgres:16.15
Target Database:    techsprout_restore
Network Mode:       none (Fully Isolated)
Timestamp:          2026-11-04 18:05:30 +06:00
====================================================
[OK] Target Backup File: techsprout-staging-2026-11-04-165705.dump (240974 bytes)
[OK] Backup SHA-256 verified against manifest:
     F55515E770BE62E3577586D7CAB03E5E57DBFE93DCEA51AB62CB68406F697FAF
[RUN] Initializing Docker container 'techsprout-restore-test-e1fcf82a'...
[OK] Target database 'techsprout_restore' initialized in container.
[RUN] Copying backup archive into isolated container...
[RUN] Executing pg_restore inside isolated container...
[OK] pg_restore completed successfully with exit code 0.
[CHECK] Verifying restored schema invariants...
     Database Name:   techsprout_restore
     Server Version:  PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2)
     Migrations:      12 (drizzle.__drizzle_migrations)
     Tables Count:    46 public tables
     Total Rows:      870 rows
     Foreign Keys:    80 active constraints
     Indexes:         195 secondary indexes
     Extensions:      pgcrypto enabled
====================================================
RESTORE VERIFICATION SUCCESS: 0 ERRORS DETECTED
====================================================
```

### 5.3 Invariant Verification Results
| Invariant Checked | Expected Value | Actual Value Restored | Status |
|---|---|---|---|
| **PostgreSQL Major Version** | 16 | 16 (`16.15`) | **PASS** |
| **Drizzle Migration Journal** | 12 migrations | 12 migrations (0000 to 0011) | **PASS** |
| **Public Tables Count** | 46 tables | 46 tables | **PASS** |
| **Total Table Rows** | 870 rows | 870 rows | **PASS** |
| **Foreign Key Constraints** | 80 foreign keys | 80 foreign keys active & enforced | **PASS** |
| **Secondary Indexes** | 195 indexes | 195 btree indexes active | **PASS** |
| **Required Extensions** | `pgcrypto` | `pgcrypto` active in catalog | **PASS** |

### 5.4 Active Preserved Replica Container
In addition to the disposable container test, a persistent baseline container was created and preserved:
- **Container Name:** `techsprout-restore-pg16`
- **Container ID:** `3da8a426abbb`
- **Image:** `postgres:16.15`
- **Network Mode:** `none`
- **Status:** `Up` (Preserved locally for ongoing offline development and testing)

---

## 6. Application-Level Recovery Verification

To guarantee that the restored database is structurally sound and functionally compatible with the application tier, a comprehensive integration test suite (`apps/api/src/test/application-recovery-verification.spec.ts`) was executed:

### 6.1 Test Execution Results
- **Test File:** `apps/api/src/test/application-recovery-verification.spec.ts`
- **Execution Target:** `127.0.0.1:54332/techsprout_restore` (temporary loopback verification proxy)
- **Total Tests:** 16
- **Passed Tests:** 16 (100%)
- **Failed Tests:** 0

### 6.2 Verified Application Invariants & Query Scenarios
```text
✓ Staging Database Application Recovery Verification
  ✓ Safety & Target Database Assertion (4ms)
  ✓ PostgreSQL 16 Engine Identity Verification (2ms)
  ✓ Drizzle Schema Migrations Inventory (3ms)
  ✓ Schema Completeness - Table Catalog (4ms)
  ✓ Schema Completeness - Row Volume Integrity (6ms)
  ✓ Constraint Integrity - Foreign Keys Enforced (5ms)
  ✓ Index Integrity - Secondary B-Tree Indexes (4ms)
  ✓ Extension Verification - pgcrypto (2ms)
  ✓ Referential Integrity - Zero Orphan Lessons (3ms)
  ✓ Referential Integrity - Zero Orphan Modules (3ms)
  ✓ Referential Integrity - Zero Orphan Enrollments (3ms)
  ✓ Referential Integrity - Zero Orphan Submissions (3ms)
  ✓ Application Query - Student Curriculum Progression (4ms)
  ✓ Application Query - Instructor Learner Roster (5ms)
  ✓ Application Query - Admin Course Review Queue (4ms)
  ✓ Application Query - Admin Platform Audit Logging (3ms)
```

### 6.3 Detailed Audit Findings
1. **Zero Orphan Entities:**
   - Evaluated foreign key relationships between `lessons` $\rightarrow$ `modules`, `modules` $\rightarrow$ `courses`, `enrollments` $\rightarrow$ `users`/`courses`, and `assignment_submissions` $\rightarrow$ `users`/`assignments`.
   - Result: Exactly 0 orphan rows detected across all relational hierarchies.
2. **Student Persona Verification:**
   - Executed production SQL queries simulating student course enrollment view, progress calculation, and module completion tracking. All joins returned valid datasets matching staging state.
3. **Instructor Persona Verification:**
   - Executed queries simulating instructor course roster generation, student identity mapping, and assignment submission review. Zero schema discrepancies.
4. **Admin Persona Verification:**
   - Executed queries querying pending course review queues (`course_review_requests`) and administrative audit logs (`audit_logs`). Verified full fidelity of historical audit entries.

---

## 7. Staging Expiration & Network Security Closure Plan

### 7.1 Hosted Staging Expiration Impact
The Render free-tier staging database will be reclaimed on:
$$\mathbf{2026\text{-}11\text{-}08\text{ }04:48:42\text{ UTC}}$$

After this timestamp:
- The external endpoint `dpg-db474ae0tbcc73dcgr10-a-oregon-postgres.render.com` will be decommissioned by Render.
- Any attempt by the staging API to query this database will fail with connection timeouts.
- **Impact Mitigation:** Because a verified, restored replica exists locally in Docker (`techsprout-restore-pg16`), development, QA verification, and release preparation can proceed 100% offline without service disruption.

### 7.2 Staging Access Control & Network Closure
To protect staging data during the remaining days before expiration:
1. **Public Ingress Closure:** If external staging testing is not actively occurring, public network access to `techsprout_staging` should be disabled in the Render dashboard or restricted to the specific authorized developer IP address.
2. **Credential Rotation Notice:** Staging credentials captured during the backup were cleared from the local operator clipboard and will be naturally invalidated when the free-tier resource is de-provisioned.
3. **Zero Production Credential Sharing:** Confirmed that staging credentials and production credentials share zero overlap in usernames, passwords, or encryption salts.

---

## 8. Verification Sign-Off

The staging database preservation and restore verification workstream has satisfied all requirements of WP-P12-03.

- **Backup SHA-256 Validated:** `F55515E770BE62E3577586D7CAB03E5E57DBFE93DCEA51AB62CB68406F697FAF`
- **Docker PG 16.15 Restore Proven:** Exit Code 0, 46 Tables, 870 Rows, 12 Migrations.
- **Application Recovery Proven:** 16/16 Test Assertions Passed.
- **Safety Test Suite Proven:** 43/43 Tests Passed.

**Final Status:** **PASS — DATABASE PRESERVED & RESTORE VERIFIED**

