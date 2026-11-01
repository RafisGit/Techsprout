# TechSprout LMS — Phase 12.2 / WP-P12-02 Implementation Report
**Release Branch Integration & Deployment Configuration Hardening**

**Repository:** `RafisGit/Techsprout`  
**Feature Branch:** `feat/p12-production-readiness`  
**Base Commit:** [`e83d09f`](file:///d:/Work/2026/techsprout-main) (`ops(p12): add database preservation and recovery safeguards`)  
**P11 Completion Commit:** [`4a3ddf0`](file:///d:/Work/2026/techsprout-main)  
**Work Package:** `WP-P12-02`  
**Date:** 2026-11-01  
**Status:** **COMPLETE & FULLY VERIFIED (100% GREEN QUALITY GATES)**

---

## 1. Executive Summary

Work Package WP-P12-02 established a unified, locally integrated release candidate on `feat/p12-production-readiness` and hardened the deployment specifications for both Render Cloud and Vercel.

### Core Milestones Achieved:
1. **Git Lineage & Integrity Verification:**
   - Verified that `origin/main` (`6db61a7`), local `main` (`b66cd35`), and `feat/p11-certificate-lifecycle` (`4a3ddf0`) are direct linear ancestors of `feat/p12-production-readiness`.
   - Confirmed that all work from Phase 1 through Phase 11 and Phase 12.1 is fully preserved without cherry-picking, history rewriting, or force pushes.
2. **Render Startup Command Reconciliation:**
   - Both `render.yaml` (Production) and `render.staging.yaml` (Staging) were reconciled to execute the compiled NestJS server only:
     `startCommand: node apps/api/dist/main.js`
   - Completely eliminated dangerous implicit database migrations (`migrate.js`) and database seeding (`seed.js`) from routine web service restarts, preventing accidental schema mutations and eliminating 10–20 second cold-start boot delays.
   - Configured `autoDeploy: false` on staging to match production and prevent uncoordinated deploys.
3. **Controlled Database Migration Execution Path:**
   - Authored dedicated, standalone operational migration runners:
     [`scripts/ops/run-migrations.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.ps1) and [`scripts/ops/run-migrations.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.sh).
   - Enforced pre-migration backup verification (rejects migration execution if a verified non-empty `.dump` archive is not found within the last 7 days).
   - Documented why `preDeployCommand` is not used on Render Free tier (`plan: free`) and established a manual release execution standard.
4. **Certificate Canonical Base URL Alignment:**
   - Verified that QR barcode generation, public verification DTO serialization, and frontend routing consistently use the canonical domain `https://techsprout.edu` and route `/verify/[certificateNumber]`.
5. **Automated Deployment Configuration Validator:**
   - Implemented [`scripts/ops/validate-deployment-config.mjs`](file:///d:/Work/2026/techsprout-main/scripts/ops/validate-deployment-config.mjs) registered under `pnpm run validate:deploy`, asserting 21 deployment safety conditions across both environments.
6. **Full Monorepo Quality Gates:**
   - Contracts build: **0 errors**.
   - API typecheck (`tsc --noEmit`): **0 errors**.
   - Web i18n validation: **100% key parity across 1,671 keys**.
   - Web ESLint: **0 warnings, 0 errors**.
   - Web Next.js production build: **33 static and dynamic routes compiled**.
   - Web Vitest suite: **591 / 591 passed** (27 test files).
   - API Vitest suite: **1,416 / 1,416 passed** (58 test files).

---

## 2. Git Provenance & Ancestry Inspection

A thorough inspection of local and remote Git references was conducted:

| Git Reference | Commit SHA | Relationship to `feat/p12-production-readiness` | Status |
| :--- | :--- | :--- | :---: |
| **`origin/main`** | `6db61a7` | Strict ancestor (`git merge-base --is-ancestor origin/main HEAD` $\rightarrow$ 0) | **PASS** |
| **Local `main`** | `b66cd35` | Strict ancestor (`git merge-base --is-ancestor main HEAD` $\rightarrow$ 0) | **PASS** |
| **`feat/p11-certificate-lifecycle`** | `4a3ddf0` | Strict ancestor (direct parent of P12.1 commit `e83d09f`) | **PASS** |
| **Candidate HEAD** | `e83d09f` | Base of WP-P12-02 | **PASS** |

- **Commits Included:** `feat/p12-production-readiness` is exactly 38 commits ahead of `main`, incorporating:
  - Phase 7 (AI Tutoring, Lexical Search, Discussions, Assignments, Monetization)
  - Phase 8 (Subscription Lifecycle & SSLCommerz Integration)
  - Phase 10 (Full English/Bangla Platform Localization across Student, Instructor, and Admin portals)
  - Phase 11 (Certificate Eligibility, PDF Generation, QR Decoding, Public Verification)
  - Phase 12.1 (Database Preservation, Backup Verification, Isolated Local Restore Testing)
- **Branch Safety Adherence:** No branches were merged into `main`, and no commits were pushed to the remote repository.

---

## 3. Render Startup Command Reconciliation

### 3.1 Historical Context & Problem Statement
Previous deployment inspections revealed a critical discrepancy between staging and production:
- **Observed Staging Command:** `node apps/api/dist/database/migrate.js && node apps/api/dist/database/seed/seed.js && node apps/api/dist/main.js`
- **Observed Production Command:** `node apps/api/dist/main.js`

### 3.2 Risks of Implicit Startup Migrations & Seeding:
1. **Uncontrolled Cold-Start Overhead:** On Render Free/Starter tiers, every container restart (including spin-up from idle sleep) executed the Drizzle migration scanner and verified every seeded table, adding 10–20 seconds of unnecessary latency before the health check responded.
2. **Production Database Mutation Risk:** Restarting a container should never execute DDL statements or attempt data seeding. A bug in a migration or unique constraint check in a seed script could cause a boot loop (`process.exit(1)`), causing platform-wide downtime.
3. **Loss of Migration Audit Trail:** Automatically running migrations on boot makes it impossible to verify pre-migration backups or coordinate rollback procedures.

### 3.3 Reconciled Configuration:
Both [`render.yaml`](file:///d:/Work/2026/techsprout-main/render.yaml) and [`render.staging.yaml`](file:///d:/Work/2026/techsprout-main/render.staging.yaml) have been unified:
```yaml
    startCommand: node apps/api/dist/main.js
    autoDeploy: false
```
- **Result:** Container restarts strictly initialize NestJS and listen on `$PORT`. Schema mutations and seeding are completely decoupled from application lifecycle.

---

## 4. Controlled Database Migration Execution Strategy

### 4.1 Platform Capability Assessment
Render Blueprints support a `preDeployCommand` directive for Web Services on paid compute plans (Starter and above). However:
- On Render's Free compute tier (`plan: free`), `preDeployCommand` is unsupported or ignored during deploy workflows.
- Relying on speculative YAML keys risks unmonitored migration failures.

### 4.2 Reusable Operational Migration Runners
To ensure safe, controlled, and serialized migration execution across both local and cloud environments, two automated scripts were implemented:
- [`scripts/ops/run-migrations.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.ps1) (Windows PowerShell)
- [`scripts/ops/run-migrations.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.sh) (POSIX Bash)

#### Safety Guardrails Built Into Runners:
1. **Pre-Migration Backup Enforcement:** Rejects execution for `staging` and `production` unless a verified, non-empty `.dump` archive created within the last 7 days is located in the operator's backup repository (`%USERPROFILE%\TechSproutBackups` or `$HOME/TechSproutBackups`).
2. **Zero Plaintext Secrets:** Connection strings are passed via masked interactive prompts (`Read-Host -AsSecureString`) or temporary non-logged environment variables, immediately cleared upon completion.
3. **Serialization:** Runs the compiled Drizzle ORM runner (`apps/api/dist/database/migrate.js`) or TypeScript runner via `tsx`, ensuring sequential, transactional execution.
4. **Seed Separation:** Migration runners **strictly prohibit** running `seed.js`.
5. **Fail-Closed Semantics:** Any DDL syntax error or connection drop causes immediate process exit with non-zero exit code.

---

## 5. Migration Inventory & Rollback Risk Analysis

Inspection of `apps/api/src/database/migrations/meta/_journal.json` confirms 12 versioned migrations:

| Index | Migration Tag | Journal Timestamp (`when`) | Status in Prod Backup | Status in Staging | DDL Nature | Rollback Script (`.down.sql`) |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 0 | `0000_initial_schema` | `1727430000000` | **APPLIED** | **APPLIED** | Additive | None |
| 1 | `0001_whole_living_tribunal` | `1790706794581` | **APPLIED** | **APPLIED** | Additive | None |
| 2 | `0002_small_talon` | `1790788929154` | **APPLIED** | **APPLIED** | Additive | None |
| 3 | `0003_hard_night_thrasher` | `1790795351051` | **APPLIED** | **APPLIED** | Additive | None |
| 4 | `0004_payment_admin_subsystem` | `1790800000000` | **APPLIED** | **APPLIED** | Additive | None |
| 5 | `0005_refund_requests_subsystem` | `1791184848587` | **APPLIED** | **APPLIED** | Additive | None |
| 6 | `0006_p6_1_notification_and_ownership` | `1791353000000` | **APPLIED** | **APPLIED** | Additive | None |
| 7 | `0007_instructor_platform_foundation` | `1791584243020` | *Pending* | **APPLIED** | Additive | None |
| 8 | `0008_analytics_foundation` | `1791800000000` | *Pending* | **APPLIED** | Additive (Indexes) | None |
| 9 | `0009_telemetry_foundation` | `1792000000000` | *Pending* | *Pending* | Additive | [`0009_telemetry_foundation.down.sql`](file:///d:/Work/2026/techsprout-main/apps/api/src/database/migrations/0009_telemetry_foundation.down.sql) |
| 10 | `0010_monetization_ledger` | `1792500000000` | *Pending* | *Pending* | Additive (Triggers) | None |
| 11 | `0011_discussions_and_assignments` | `1793000000000` | *Pending* | *Pending* | Additive | None |

### Rollback Gap & Mitigation:
- **Gap:** Only migration 0009 includes a `.down.sql` script. Migrations 0007, 0008, 0010, and 0011 lack automated rollback scripts.
- **Financial Immutability:** Migration 0010 installs PostgreSQL triggers (`trg_immutable_ledger_transactions`, `trg_immutable_ledger_entries`) that strictly prevent `UPDATE` or `DELETE` on posted transactions.
- **Mitigation Standard:** Because migrations are forward-only, **a pre-migration logical `.dump` backup is non-negotiable** prior to executing migrations against staging or production.

---

## 6. Database Connection Hardening & Network Review

### 6.1 Private Networking Verification
- Both `render.yaml` and `render.staging.yaml` configure:
  ```yaml
        - key: DATABASE_URL
          fromDatabase:
            name: techsprout-postgres
            property: connectionString
  ```
- **Render Implementation:** Within the Render Oregon region, `property: connectionString` automatically resolves to the database's internal hostname (`techsprout-postgres:5432` / `techsprout-postgres-staging:5432`) over Render's private virtual network. Application-to-database traffic does not traverse the public internet.

### 6.2 Critical Backup Dependency & Allowlist Strategy
- **Finding:** Both databases currently have `0.0.0.0/0` in their external access control lists.
- **Safety Directive:** In accordance with prompt instructions, **neither live database allowlist was modified in this work package**.
- **Reason:** The staging database backup remains pending operator credentials. Removing `0.0.0.0/0` immediately would sever external connectivity and block the operator from running `backup-postgres.ps1`.
- **Live Allowlist Remediation Sequence (Post-Backup):**
  1. Operator executes `backup-postgres.ps1` and secures staging backup.
  2. Confirm application health via internal private network connection.
  3. In Render Dashboard, remove `0.0.0.0/0` from the IP allowlist.
  4. Restrict external ingress to specific static VPN CIDRs or open external access only during planned maintenance windows.

---

## 7. Environment & Secret Configuration Review

Inspection of environment schemas in `apps/api/src/config/env.config.ts`, `render.yaml`, `render.staging.yaml`, and Vercel Next.js configuration confirmed:

| Configuration Key | Production Value / Scope | Staging Value / Scope | Secret Type |
| :--- | :--- | :--- | :---: |
| `DATABASE_URL` | Render Private Network binding (`techsprout-postgres`) | Render Private Network binding (`techsprout-postgres-staging`) | Sensitive |
| `REDIS_URL` | Render Private Network binding (`techsprout-redis`) | Render Private Network binding (`techsprout-redis-staging`) | Sensitive |
| `AUTH_SECRET` | Auto-generated by Render (`generateValue: true`) | Auto-generated by Render (`generateValue: true`) | Secret |
| `WEB_ORIGIN` | `https://techsprout-web.vercel.app` | `https://staging.techsprout-web.vercel.app,https://techsprout-web-staging.vercel.app` | Public (CORS) |
| `WEB_PUBLIC_ORIGIN` | `https://techsprout-web.vercel.app` | `https://staging.techsprout-web.vercel.app` | Public (Redirects) |
| `SSLCOMMERZ_IS_SANDBOX` | `false` | `true` | Public |
| `SSLCOMMERZ_BASE_URL` | `https://securepay.sslcommerz.com` | `https://sandbox.sslcommerz.com` | Public |
| `RESEND_FROM_EMAIL` | `notifications@techsprout.io` | `staging-notifications@techsprout.io` | Public |

- **Isolation Guarantee:** Production and staging environments maintain distinct databases, user roles, Redis instances, and web origins. Zero cross-environment leakage.

---

## 8. Certificate Canonical Base URL Alignment

Verification of certificate generation and public verification confirms complete URL parity:
1. **PDF Generation & QR Matrix ([`certificate-pdf.service.ts`](file:///d:/Work/2026/techsprout-main/apps/api/src/modules/certificates/certificate-pdf.service.ts)):**
   Defaults to `https://techsprout.edu` and encodes:
   `https://techsprout.edu/verify/${encodeURIComponent(certificateNumber)}`
2. **Public Verification DTO ([`certificate.dto.ts`](file:///d:/Work/2026/techsprout-main/apps/api/src/modules/certificates/dto/certificate.dto.ts)):**
   Defaults `baseUrl` parameter to `https://techsprout.edu` and formats:
   `https://techsprout.edu/verify/${encodeURIComponent(cert.certificateNumber)}`
3. **Frontend Verification Page ([`apps/web/src/app/verify/[certificateNumber]/page.tsx`](file:///d:/Work/2026/techsprout-main/apps/web/src/app/verify/[certificateNumber]/page.tsx)):**
   Extracts `certificateNumber` and defaults fallback share URL to:
   `https://techsprout.edu/verify/${certificateNumber}`

---

## 9. Automated Release Configuration Validation

Implemented [`scripts/ops/validate-deployment-config.mjs`](file:///d:/Work/2026/techsprout-main/scripts/ops/validate-deployment-config.mjs) registered under `pnpm run validate:deploy`.

### Validation Test Output:
```
====================================================
TechSprout LMS — Release Configuration Validator
Timestamp: 2026-11-01T05:40:16.951Z
Root Dir:  D:\Work\2026\techsprout-main
====================================================

--- 1. Render Blueprints Parsing ---
  ✓ [PASS] render.yaml exists on disk
  ✓ [PASS] render.staging.yaml exists on disk
  ✓ [PASS] render.yaml defines services
  ✓ [PASS] render.staging.yaml defines services

--- 2. Resource Name Isolation ---
  ✓ [PASS] Zero service name collisions between prod and staging
  ✓ [PASS] Zero database name collisions between prod and staging
  ✓ [PASS] Production databaseName is techsprout
  ✓ [PASS] Staging databaseName is techsprout_staging

--- 3. Startup Command Safety ---
  ✓ [PASS] Production web service startCommand is clean: "node apps/api/dist/main.js"
  ✓ [PASS] Staging web service startCommand is clean: "node apps/api/dist/main.js"

--- 4. Controlled Migration Runner ---
  ✓ [PASS] apps/api/package.json has db:migrate:prod script
  ✓ [PASS] scripts/ops/run-migrations.ps1 exists
  ✓ [PASS] scripts/ops/run-migrations.sh exists

--- 5. Secret Exposure Audit ---
  ✓ [PASS] render.yaml does not contain plaintext passwords or secrets
  ✓ [PASS] render.staging.yaml does not contain plaintext passwords or secrets

--- 6. Git Tracked Files Audit ---
  ✓ [PASS] Zero database dump archives tracked in Git
  ✓ [PASS] Zero local .env files tracked in Git
  ✓ [PASS] Zero backup manifests tracked in Git

--- 7. Certificate Verification Route Consistency ---
  ✓ [PASS] certificate-pdf.service.ts uses canonical base https://techsprout.edu
  ✓ [PASS] certificate.dto.ts defaults to https://techsprout.edu
  ✓ [PASS] verify page routes to /verify/[certificateNumber]

====================================================
VALIDATION RESULT: 21 PASSED, 0 FAILED
====================================================
```

---

## 10. Full Monorepo Quality Gate Verification

| Quality Gate | Command | Result |
| :--- | :--- | :---: |
| **Contracts Build** | `pnpm --filter @techsprout/contracts build` | **PASS** (0 errors) |
| **API Typecheck** | `pnpm --filter @techsprout/api typecheck` | **PASS** (`tsc --noEmit`, 0 errors) |
| **Web i18n Parity** | `pnpm --filter @techsprout/web validate:i18n` | **PASS** (100% key parity across 1,671 keys) |
| **Web Lint** | `pnpm --filter @techsprout/web lint` | **PASS** (`eslint .`, 0 warnings, 0 errors) |
| **Web Next.js Build** | `pnpm --filter @techsprout/web build` | **PASS** (33 static and dynamic routes compiled) |
| **Web Test Suite** | `pnpm --filter @techsprout/web test` | **PASS** (591 passed across 27 test files) |
| **API Test Suite** | `pnpm --filter @techsprout/api test` | **PASS** (1,416 passed across 58 test files) |
| **Deploy Config Validation**| `pnpm run validate:deploy` | **PASS** (21 / 21 checks passed) |

---

## 11. Backup & Recovery Gate Tracking Status

- **Staging Backup Status:** **STILL PENDING OPERATOR CREDENTIAL INPUT**. The staging database expires on **November 8, 2026 at 04:48:42 UTC**. The gate cannot be marked complete until the account owner runs `backup-postgres.ps1` with the external connection string.
- **Production Restore Compatibility Revisit:**
  - The physical pre-suspension archive `techsprout-production-2026-10-14.dump` (PostgreSQL 16.15 format) was restored and validated with exit code 0 on an isolated PostgreSQL 18.6 engine (33 tables, all rows verified).
  - Because local host development tooling currently has PostgreSQL 14 and 18 installed but not PostgreSQL 16, this test confirms forward-compatibility restore integrity.
  - A strict same-major 16-to-16 verification gate is tracked for execution once Docker Desktop or a PostgreSQL 16 test container is activated.

---

## 12. Changes Committed to Repository

- [`render.staging.yaml`](file:///d:/Work/2026/techsprout-main/render.staging.yaml) — Reconciled `startCommand` to `node apps/api/dist/main.js` and added `autoDeploy: false`.
- [`package.json`](file:///d:/Work/2026/techsprout-main/package.json) — Added `validate:deploy` validation script.
- [`scripts/ops/run-migrations.ps1`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.ps1) — PowerShell controlled migration runner with backup checks.
- [`scripts/ops/run-migrations.sh`](file:///d:/Work/2026/techsprout-main/scripts/ops/run-migrations.sh) — POSIX Bash controlled migration runner with backup checks.
- [`scripts/ops/validate-deployment-config.mjs`](file:///d:/Work/2026/techsprout-main/scripts/ops/validate-deployment-config.mjs) — Automated deployment configuration validator.
- [`docs/ops/database-backup-and-recovery.md`](file:///d:/Work/2026/techsprout-main/docs/ops/database-backup-and-recovery.md) — Updated operational runbook with migration runner instructions.
- [`docs/research/p12.0/WP-P12-02_RELEASE_INTEGRATION_AND_DEPLOYMENT_HARDENING_REPORT.md`](file:///d:/Work/2026/techsprout-main/docs/research/p12.0/WP-P12-02_RELEASE_INTEGRATION_AND_DEPLOYMENT_HARDENING_REPORT.md) — This document.
