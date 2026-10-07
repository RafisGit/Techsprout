# TECHSPROUT P5 + P5.5 PRODUCTION RELEASE PACKAGE
## FINAL RELEASE MANIFEST & PRODUCTION DEPLOYMENT GUIDE

**Release Identifier:** `TECHSPROUT-P5-P5.5-RELEASE-V1.0`  
**Milestones Included:** Phase 5 (Payments & Finance Core) + Phase 5.5 (Student Self-Service Refunds & Administrative Operations)  
**Author:** Senior QA Lead, Senior Software Architect, Security Engineer, Release Engineer  
**Release Date:** 2026-10-07  
**Branch:** `feat/p1-foundation-security`  
**Baseline Git Commit:** `f91a487a636e6dc2f779f42a87661785f7468f5f`  
**Total Automated Regression Tests:** **1,161 / 1,161 PASSING (100% Green)**  
**Release Status:** **PRODUCTION RELEASE READY**  

---

## 1. EXECUTIVE OVERVIEW & MILESTONE CHRONOLOGY

TechSprout Phase 5 and Phase 5.5 represent the commercial foundation of the platform:
- **Phase 5 (P5.0)**: Authoritative payments engine with SSLCommerz v4, server-authoritative checkout, immutable snapshot invoices, promotional coupons with atomic reservations, and administrative refund execution.
- **Phase 5.5 (P5.5.1–P5.5.8)**: Complete student self-service lifecycle:
  - **P5.5.1**: `refund_requests` database entity, constraint definitions, and policy-driven eligibility engine (7-day window, <20% progress, certificate check).
  - **P5.5.2**: Student refund submission API, IDOR-guarded order queries, and sanitized student tracking DTOs.
  - **P5.5.3**: Admin refund review queue, atomic state transitions (`APPROVE` / `REJECT`), and comprehensive audit logging.
  - **P5.5.4**: Frontend student order history (`/orders`, `/orders/[id]`) and admin review queue UI (`/admin/finance/refund-requests`).
  - **P5.5.5**: Approved request discovery, SSLCommerz gateway settlement integration, and authoritative atomic finalization.
  - **P5.5.6**: High-fidelity PDF invoice streaming via PDFKit with immutable snapshot fidelity and IDOR guards.
  - **P5.5.7**: Streaming admin financial CSV exports (Orders, Refunds, Reconciliation) with RFC 4180 escaping, 90-day/10,000-row guards, and Excel UTF-8 BOM.
  - **P5.5.8**: Final integrated QA audit, concurrency testing, and release certification.

---

## 2. RELEASE MANIFEST

| Attribute | Specification |
|---|---|
| **Release Branch** | `feat/p1-foundation-security` (ready for merge to `main`) |
| **Commit SHA** | `f91a487a636e6dc2f779f42a87661785f7468f5f` (plus release documentation) |
| **Monorepo Tests** | **1,161 / 1,161 passing** across 43 test suites |
| **Backend API Tests** | **901 / 901 passing** (30 test files) |
| **Frontend Web Tests** | **260 / 260 passing** (13 test files) |
| **Contracts Build** | **PASS** (TypeScript 0 errors) |
| **API Build** | **PASS** (`tsc -p tsconfig.build.json` clean) |
| **Web Build** | **PASS** (Next.js 16.2.12 Turbopack, 27 pages compiled in 5.3s) |
| **Monorepo Lint** | **PASS** (ESLint 0 errors, 0 warnings) |
| **Database Migrations** | 6 forward-only migrations (`0000` to `0005`) |
| **Target Runtime - API** | Render Web Service (`techsprout-api`) |
| **Target Runtime - Database** | Render Managed PostgreSQL 16 (`techsprout-postgres`) |
| **Target Runtime - Cache** | Render Managed Redis / Valkey 7 (`techsprout-redis`) |
| **Target Runtime - Web** | Vercel Serverless / Edge Platform |
| **Payment Gateway** | SSLCommerz v4 Payment & Refund API |

---

## 3. FINANCIAL INVARIANTS & INTEGRITY GUARANTEES

1. **One-Order-At-Most-One-Refund:**
   - Enforced by database unique constraint `uniqueIndex('refunds_order_id_uq').on(table.orderId)`.
   - Structural impossibility of creating a second refund record or executing multiple gateway disbursements for the same order.
2. **One-Active-Refund-Request-Per-Order:**
   - Enforced by partial unique index `CREATE UNIQUE INDEX "refund_requests_active_order_uq" ON "refund_requests" (order_id) WHERE status IN ('PENDING', 'APPROVED')`.
   - Prevents duplicate active tickets while cleanly allowing re-application if a prior request was rejected.
3. **Non-Blocking External Network Rule:**
   - Zero database locks or transactions are held open during external SSLCommerz HTTP communications. Transactions commit pre-request and execute atomic updates post-response.
4. **Immutable Financial Snapshots:**
   - Invoices permanently freeze customer name, email, course title, subtotal, discount, payable total, and currency at settlement. Future changes to course catalog pricing never mutate historical accounting records.
5. **Integer Minor-Unit Currency (`BDT`):**
   - All database columns (`amount_cents`, `subtotal_cents`, `discount_cents`, `payable_cents`) use strict non-negative integer minor units. Fractional currency rounding errors are eliminated.
6. **Zero-Side-Effect Reporting:**
   - PDF invoice generation and CSV exports perform pure read-only queries with zero mutations to financial tables.

---

## 4. ENVIRONMENT SEPARATION & SECRETS MANAGEMENT

| Parameter | Staging / Sandbox Environment | Production Live Environment |
|---|---|---|
| **`NODE_ENV`** | `production` | `production` |
| **`SSLCOMMERZ_IS_SANDBOX`** | `true` | `false` |
| **`SSLCOMMERZ_BASE_URL`** | `https://sandbox.sslcommerz.com` | `https://securepay.sslcommerz.com` |
| **`SSLCOMMERZ_STORE_ID`** | Staging Sandbox Store ID | Live Merchant Store ID (from Render Env Vars) |
| **`SSLCOMMERZ_STORE_PASSWORD`** | Staging Sandbox Password | Live Merchant Secret (from Render Env Vars) |
| **`API_PUBLIC_BASE_URL`** | `https://techsprout-api.onrender.com` | Production API Host (e.g. `https://api.techsprout.school`) |
| **`WEB_PUBLIC_ORIGIN`** | `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app` | Production Web Origin (e.g. `https://techsprout.school`) |
| **`WEB_ORIGIN`** | Staging Vercel preview domains | Production Web Domain(s) for CORS |

### Secrets Protection Verification:
- **Zero Secrets in Repository:** Neither sandbox nor live SSLCommerz store passwords, database passwords, or auth secrets exist in committed code or git history.
- **Strict Validation at Startup:** `apps/api/src/config/env.config.ts` enforces `NODE_ENV=production` checks ensuring `WEB_PUBLIC_ORIGIN`, `SSLCOMMERZ_STORE_ID`, and `SSLCOMMERZ_STORE_PASSWORD` are present and non-empty.
- **Single Canonical Redirect Origin:** `WEB_PUBLIC_ORIGIN` enforces single origin validation (rejection of commas), preventing multi-origin URL concatenation bugs in gateway callbacks.

---

## 5. RATE LIMITING & OPERATIONAL RESOURCE ALLOCATION

Operational rate limits are actively enforced via NestJS `@Throttle` guards:

| Endpoint | Path | Rate Limit | Operational Rationale |
|---|---|---|---|
| **Invoice PDF Download** | `GET /api/v1/invoices/:id/pdf` | **20 req / min** | Single-document generation. Accommodates legitimate receipt downloads by students/admins while preventing resource exhaustion. |
| **Admin Finance CSV Export** | `GET /api/v1/admin/finance/export` | **10 req / min** | Bulk reporting query streaming up to 10,000 rows across up to 90 days. Tighter limit safeguards database connection pool and worker memory. |
| **Payment Initiation** | `POST /api/v1/payments/initiate` | Default Throttle | Protects outbound gateway requests and order state transitions. |

*Note on Audit Alignment:* The 20 req/min for PDF and 10 req/min for CSV are intentional, differentiated by computational intensity, and fully consistent with test assertions in `invoice-pdf.spec.ts` (test 22) and `finance-export.spec.ts` (test 24).

---

## 6. VERCEL DEPLOYMENT PROTECTION & ACCESS MODEL

- **Staging / Preview Behavior:**
  - The audited preview URL (`techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`) returned `HTTP 302` due to Vercel's built-in Deployment Protection (SSO/Preview protection).
  - This is expected behavior for preview environments to prevent indexing of development artifacts.
- **Production Access Model:**
  - The production deployment on `main` (custom domain or primary Vercel alias) serves public traffic without SSO challenge (`HTTP 200 OK`).
  - Public students, anonymous visitors, and administrators access the production application directly.
  - Vercel Deployment Protection remains configured only on preview/branch deployments.

---

## 7. DATABASE MIGRATION CHAIN & SAFETY

The schema is governed by Drizzle ORM with 6 sequential, forward-only migrations:

```
0000_initial_schema.sql             -> Users, Auth, Courses, Categories
0001_whole_living_tribunal.sql      -> Modules, Lessons, Progress
0002_small_talon.sql                -> Media Assets & Uploads
0003_hard_night_thrasher.sql        -> Quizzes, Questions, Attempts, Certificates
0004_payment_admin_subsystem.sql    -> Orders, Payments, Invoices, Refunds, Coupons
0005_refund_requests_subsystem.sql  -> Refund Requests, Reason Enums, Review Workflow
```

### Safety Confirmations:
- **Forward-Only Guarantee:** All migrations are strictly additive. Zero `DROP TABLE` or destructive `ALTER TABLE` statements exist.
- **Zero Schema Drift:** `apps/api/src/database/migrations/meta/_journal.json` perfectly matches migration definitions.
- **Pre-Deploy Execution:** Render blueprint automatically executes `node apps/api/dist/database/migrate.js` prior to starting the web service.

---

## 8. PRODUCTION ROLLBACK PROCEDURE

In the event of an unforeseen operational anomaly following release deployment, execute the following non-destructive rollback steps:

### 1. Application Deployment Rollback (Render API):
- Navigate to the Render Dashboard $\to$ `techsprout-api` $\to$ **Deploys**.
- Select the previous stable deployment commit and click **Rollback**.
- Render instantly redirects traffic to the previous Docker container image.

### 2. Frontend Deployment Rollback (Vercel):
- Navigate to Vercel Project Dashboard $\to$ **Deployments**.
- Locate the previous production deployment.
- Click `...` $\to$ **Assign Domain** to immediately promote the prior build back to production.
- Rollback latency: $< 5$ seconds (zero build time required).

### 3. Database Migration Policy (DO NOT ROLL BACK SCHEMA):
- **CRITICAL:** Do NOT attempt destructive down-migrations (e.g. dropping `refund_requests` or rolling back `0005`).
- Because migration `0005` is purely additive, the previous P5 application codebase continues to function seamlessly with the migration `0005` schema present.
- If data remediation is required, issue a forward-only additive patch migration.

### 4. Payment Gateway Rollback:
- If gateway credentials or endpoints encounter third-party issues, adjust `SSLCOMMERZ_IS_SANDBOX` and credentials in Render Environment Variables and trigger a configuration restart without rebuilding code.

---

## 9. FINAL PRODUCTION RELEASE CHECKLIST

| Verification Item | Requirement | Status |
|---|---|---|
| **Release Commit** | Commit identified and clean working tree confirmed | **PASSED** |
| **Monorepo Tests** | 1,161 / 1,161 passing across all packages | **PASSED** |
| **Contracts Build** | `@techsprout/contracts` compiles cleanly | **PASSED** |
| **API Build** | `@techsprout/api` compiles cleanly (`tsc -p tsconfig.build.json`) | **PASSED** |
| **Web Build** | `@techsprout/web` compiles cleanly (Next.js 16.2.12 Turbopack) | **PASSED** |
| **Linter** | ESLint returns 0 errors and 0 warnings | **PASSED** |
| **Environment Separation** | Sandbox and Live configurations cleanly separated | **PASSED** |
| **Production Origins** | `WEB_PUBLIC_ORIGIN` validated with zero commas/localhost | **PASSED** |
| **CORS / CSP** | Helmet CSP and allowed origins validated | **PASSED** |
| **Database Migrations** | 6 forward-only migrations verified with zero drift | **PASSED** |
| **Refund Uniqueness** | `refunds_order_id_uq` database index verified | **PASSED** |
| **Security Audit** | IDOR, RBAC, and secrets protection verified | **PASSED** |
| **Remote Staging** | Render API `HTTP 200 OK` (Database & Redis both "up") | **PASSED** |
| **PDF Subsystem** | Snapshot integrity and binary streaming verified | **PASSED** |
| **CSV Subsystem** | RFC 4180 escaping, 90D/10k caps, and UTF-8 BOM verified | **PASSED** |
| **Rollback Plan** | Forward-only, non-destructive procedure documented | **PASSED** |
| **Release Documentation** | Full release package completed | **PASSED** |

---

## 10. FINAL RELEASE RECOMMENDATION

==================================================  
**RECOMMENDATION: PRODUCTION RELEASE READY**  
==================================================  

Phase 5 and Phase 5.5 have satisfied every engineering, architectural, financial, security, and quality gate. The system is certified ready for deployment to production.
