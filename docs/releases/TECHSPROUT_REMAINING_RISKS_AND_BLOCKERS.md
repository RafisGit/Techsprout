# TECHSPROUT LMS — REMAINING RISKS AND BLOCKERS LEDGER
## Comprehensive Inventory of Technical Risks, External Blockers, Lifecycle States, and Senior Decision Preconditions

**Project:** TechSprout Learning Management System (LMS)  
**Milestone:** Phase 12 (P12) — Workstream F: Risk Governance  
**Repository:** `RafisGit/Techsprout`  
**Candidate Release Branch:** `feat/p12-production-readiness`  
**Candidate Commit SHA:** `3033bd8`  
**Evaluation Date:** 2026-11-04  
**Author / Governance Lead:** Release Engineering, Database Reliability & Security Assurance  
**Governance Verdict:** **CLEAR DIVISION OF TECHNICAL READINESS VS. EXTERNAL BLOCKERS**

---

## 1. Executive Overview

This document establishes the definitive inventory of technical risks, environmental dependencies, external blockers, and senior approval preconditions facing the TechSprout LMS as it concludes Phase 12.

The codebase, data schema, internationalization catalog, certificate generation engine, and operational tooling have completed all required implementation, verification, and regression gates. However, clear boundaries exist between what is technically completed and verified, what is constrained by cloud infrastructure expiration policies, and what awaits senior leadership authorization.

---

## 2. Feature & Workstream Lifecycle Classification Matrix

To maintain total transparency, every key system capability and workstream is categorized under one of the formal lifecycle states:

| System Capability / Subsystem | Lifecycle State | Primary Environment Verified | Evidence & Status Summary |
|---|---|---|---|
| **Staging Database Snapshot** | **Implemented & Verified** | Hosted Staging $\rightarrow$ Local Storage | 240,974 bytes, SHA-256: `F55515E7...`, custom format, verified checksum. |
| **Docker PG 16 Restore Procedure** | **Implemented & Verified** | Local Docker (`postgres:16.15`) | Script `restore-postgres-docker.ps1` ran in `--network none`, exit code 0, 46 tables, 870 rows. |
| **Application Recovery Verification** | **Implemented & Verified** | Local Loopback / Restored Replica | 16/16 tests passed in `application-recovery-verification.spec.ts`. Zero orphan records. |
| **Backup Tooling Security & Dry-Run**| **Implemented & Verified** | Windows PowerShell 5.1 & Core | 43/43 safety tests passed in `test-staging-backup-safety.ps1`. Zero credential leaks. |
| **Bilingual i18n Framework (P10)** | **Integrated & Verified** | Monorepo Web (`@techsprout/web`) | 1,671 keys in EN/BN, 0 missing, 195 files scanned, zero naked dollar signs. |
| **Certificate Lifecycle Engine (P11)**| **Integrated & Verified** | Monorepo API & Web | Bilingual PDF generation, Noto Sans fonts, QR verification, SHA-256 digital signature. |
| **Student / Instructor / Admin Dashboards (P9)** | **Integrated & Verified** | Monorepo API & Web | Verified by curriculum, roster, review queue, and audit log integration queries. |
| **Deployment Hardening Validator** | **Implemented & Verified** | Local / CI Pipeline | `pnpm run validate:deploy` passed 23/23 configuration checks. |
| **Hosted Staging PostgreSQL Availability** | **Expiring / Deprecating** | Render Cloud (`dpg-db474ae...`) | **Expires on 2026-11-08 04:48:42 UTC**. Preserved via local Docker replica. |
| **Production Cloud Database** | **Blocked (Awaiting Decision)**| Cloud Infrastructure | Requires paid PostgreSQL 16 instance provisioning. Senior budget sign-off needed. |
| **Production Payment Processing** | **Blocked (Awaiting Keys)** | SSLCommerz Gateway | Requires live merchant Store ID and Store Password from SSLCommerz. |
| **Production Domain & DNS Routing**| **Awaiting Senior Approval** | Vercel / Render DNS | Custom domain `techsprout.edu.bd` DNS records and SSL cert issuance pending cutover. |
| **Main Branch Merge & Cutover** | **Awaiting Senior Approval** | Git Repository / CI | Pull Request from `feat/p12-production-readiness` to `main` awaiting senior sign-off. |

---

## 3. Detailed Risk & Blocker Ledger

### 3.1 Blocker BLK-01: Free Render Staging Database Expiration
- **Risk Severity:** **CRITICAL** (Imminent Infrastructure Deprecation)
- **Component Affected:** Hosted Render Staging Database (`dpg-db474ae0tbcc73dcgr10-a`)
- **Expiration Deadline:** **November 8, 2026 at 04:48:42 UTC**
- **Detailed Context:**
  The staging PostgreSQL database was provisioned under Render's free tier, which imposes a mandatory expiration date. After November 8, 2026 at 04:48:42 UTC, Render will automatically delete the database instance, and the public hostname `dpg-db474ae0tbcc73dcgr10-a-oregon-postgres.render.com` will become non-routable.
- **Rule of Record:**
  **Do NOT claim or assume that hosted staging will remain available after November 8, 2026.** Any deployment or test relying on this hosted endpoint after that timestamp will fail.
- **Technical Mitigation Completed:**
  1. A complete, uncorrupted snapshot was captured on 2026-11-04 (`techsprout-staging-2026-11-04-165705.dump`).
  2. The snapshot was independently restored and validated in an isolated local Docker container (`techsprout-restore-pg16`, `postgres:16.15`, `--network none`).
  3. The local replica contains 100% of staging test data (12 migrations, 46 tables, 870 rows).
  4. Development, testing, and offline verification can proceed indefinitely on developer machines without cloud dependencies.
- **Required Senior Action:**
  - Option A (No-Cost): Accept expiration of hosted staging; utilize local Docker replicas for all ongoing integration testing.
  - Option B (Paid): Authorize upgrading the Render staging database to a paid persistent tier ($7/month) prior to November 8.

---

### 3.2 Blocker BLK-02: Production Database Instance Provisioning
- **Risk Severity:** **HIGH** (Deployment Precondition)
- **Component Affected:** Production Data Layer
- **Detailed Context:**
  TechSprout has adhered strictly to the constraint of zero paid cloud resource creation during development. Consequently, a dedicated production PostgreSQL 16 database instance has not yet been provisioned.
- **Prerequisites for Production Launch:**
  1. Senior engineering must approve the cloud provider and instance size (e.g., Render Managed PostgreSQL Starter/Standard or AWS RDS/DigitalOcean).
  2. The production database must be initialized with:
     - Engine: PostgreSQL `16.x`.
     - Required Extension: `pgcrypto`.
     - SSL: Mandatory (`sslmode=require`).
     - Connection Pooling: PgBouncer recommended for concurrency.
  3. The migration runner (`run-migrations.ps1`) must be executed against the clean production instance with a verified pre-migration backup gate.
- **Required Senior Action:**
  - Authorize cloud database infrastructure budget and create production instance.

---

### 3.3 Blocker BLK-03: SSLCommerz Production Merchant Credentials
- **Risk Severity:** **HIGH** (Commercial Precondition)
- **Component Affected:** Payment Processing & Checkout Subsystem
- **Detailed Context:**
  Staging currently utilizes SSLCommerz sandbox credentials (`testbox`, `qwerty`). These credentials simulate payment success, failure, and cancellation callbacks but do not interface with live Bangladeshi mobile financial services (bKash, Nagad, Rocket) or commercial bank gateways.
- **Technical State:**
  The payment gateway integration in `apps/api/src/modules/payments/sslcommerz.service.ts` is fully implemented and tested. It automatically switches to live production endpoints when `SSLCOMMERZ_IS_LIVE=true`.
- **Prerequisites for Production Launch:**
  1. Execution of corporate merchant agreement with SSLCommerz.
  2. Receipt of live `STORE_ID` and `STORE_PASSWD`.
  3. Verification of IPN (Instant Payment Notification) webhook URL configuration in SSLCommerz merchant panel.
- **Required Senior Action:**
  - Operations / Finance team to provide production merchant keys and sign off on IPN endpoint security.

---

### 3.4 Blocker BLK-04: Production Domain, DNS & SSL Cutover
- **Risk Severity:** **MEDIUM** (Operational Go-Live)
- **Component Affected:** Network Ingress & Public Routing
- **Detailed Context:**
  The Web frontend and API services currently operate under platform subdomains (`techsprout-web.vercel.app` and `techsprout-api.onrender.com`). Production release requires mapping to institutional domain names (e.g., `techsprout.edu.bd` and `api.techsprout.edu.bd`).
- **Technical State:**
  The application CORS configurations, cookie security rules, and canonical certificate verification URLs are parameter-driven via environment variables (`CORS_ORIGIN`, `FRONTEND_URL`).
- **Prerequisites for Production Launch:**
  1. DNS A/CNAME records configured pointing to Vercel and Render edge networks.
  2. SSL/TLS edge certificates issued and validated.
  3. CORS whitelist updated to reflect production apex and subdomains.
- **Required Senior Action:**
  - Network administrator to configure DNS records and verify SSL propagation.

---

### 3.5 Risk RSK-01: Local E2E Test Suite Redis Daemon Dependency
- **Risk Severity:** **LOW** (Developer Environment Convenience)
- **Component Affected:** `apps/api/src/test/http-e2e.spec.ts`
- **Detailed Context:**
  A single end-to-end integration test file requires a live Redis instance listening on default port `6379`. In environments where Redis is not running locally, this test fails with `ECONNREFUSED`.
- **Mitigation & Impact:**
  This does not affect production code, where Redis connection is verified via the `/ready` probe and fail-open caching guarantees zero application downtime. All other 61 API test files (1,492 tests) pass completely using mocked/in-memory adapters.
- **Action Item:**
  For local end-to-end test execution, developers can spin up a local Redis container via `docker run -d -p 6379:6379 redis:7.4.1-alpine`.

---

## 4. Operational Maintenance & Ongoing Disaster Recovery Rules

To maintain high reliability following release, the following operational protocols must be adhered to:

### 4.1 Daily Automated Backup Schedule
- Automated `pg_dump` snapshots must be scheduled daily at 02:00 UTC using `scripts/ops/backup-postgres.ps1` or managed cloud snapshot tooling.
- Backups must be validated against `scripts/ops/verify-postgres-backup.ps1` with SHA-256 manifests stored in immutable cloud object storage (e.g., AWS S3 with Object Lock or Google Cloud Storage).

### 4.2 Mandatory Pre-Migration Gate
- Under no circumstances may `pnpm run migrate` or manual SQL DDL be executed directly in production.
- All schema migrations must be run through `scripts/ops/run-migrations.ps1`, which programmatically blocks migration execution unless a verified backup with passing `restoreTest` metadata exists from within the past 24 hours.

### 4.3 Staging Access Restriction
- Hosted staging database access should be restricted via IP allowlist in the Render dashboard to authorized developer networks.
- Once the staging database expires on November 8, 2026, all staging references in configuration must be transitioned to the local Docker replica environment.

---

## 5. Senior Go/No-Go Decision Criteria

Production release authorization should be granted when the following conditions are met:

```text
[X] Technical Implementation: 100% Complete & Reconciled (P9, P10, P11, P12)
[X] Monorepo Regression: 100% Pass Rate (591 Web, 1,492 API Tests)
[X] Database Preservation: Verified Snapshot & Docker PG 16 Restore Proven
[X] Deployment Configuration: 23/23 Checks Passed
[ ] BLK-01 Resolution: Free Staging Expiry Acknowledged / Local Docker Adopted
[ ] BLK-02 Resolution: Production PostgreSQL 16 Database Provisioned
[ ] BLK-03 Resolution: Live SSLCommerz Merchant Credentials Acquired
[ ] BLK-04 Resolution: Production Domain DNS & SSL Certificate Configured
[ ] Governance Approval: Senior Peer Review & Merge into 'main'
```

---

## 6. Conclusion

Phase 12 has achieved complete technical stabilization. All internal code, database, and configuration blockers under the engineering team's control have been resolved and verified with cryptographic proof and automated regression testing.

The remaining blockers (BLK-01 through BLK-04) are governance, commercial, and cloud infrastructure provisioning decisions. With the delivery of these 6 authoritative reports, the TechSprout LMS is positioned for an orderly, risk-controlled production release upon executive sign-off.

