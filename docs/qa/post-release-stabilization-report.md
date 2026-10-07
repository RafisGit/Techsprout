# TECHSPROUT — POST-RELEASE STABILIZATION & PRODUCTION OBSERVATION REPORT

**Audit Date:** 2026-10-07T11:45:00+06:00  
**Audit Role:** Senior SRE + Production QA Engineer + Backend Engineer  
**System Under Audit:** TechSprout LMS (Phase 5 Core Payments + Phase 5.5 Student Refunds & Financial Operations)  
**Production API Base URL:** `https://techsprout-api.onrender.com`  
**Production Web Base URL:** `https://techsprout-web.vercel.app`  
**Release Baseline Git Commit:** `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`  
**Report File:** `docs/qa/post-release-stabilization-report.md`  
**Stabilization Status:** **REMEDIATION APPLIED & FULLY VERIFIED**  

---

## 1. EXECUTIVE SUMMARY & REMEDIATION OVERVIEW

Following the initial post-release observation, a P0 production blocker was identified on the Vercel frontend where missing build-time environment variables forced browser clients and serverless functions to fall back to `http://localhost:3001`.

The production environment configuration has now been **fully remediated and verified**:
1. `NEXT_PUBLIC_API_URL=https://techsprout-api.onrender.com` was configured for all environments (including Production).
2. `INTERNAL_API_URL=https://techsprout-api.onrender.com` was added to Production environment variables.
3. A clean Vercel production rebuild was triggered without build cache, deploying the exact verified release commit `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`.
4. Bundle inspection verified **0 references to localhost:3001** in the production client bundle.
5. Live browser network inspection confirmed that 100% of client-side catalog and auth requests target `https://techsprout-api.onrender.com`.
6. Server-side session verification now successfully reaches Render, enabling full student and admin SSR portal workflows.

---

## 2. PRODUCTION BASELINE

| Component | Target / Expected | Observed Live Value | Status |
|---|---|---|---|
| **Git Release Commit** | `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` | `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` (`origin/main`) | **ALIGNED** |
| **Render Active SHA** | `e3506d4` or direct descendant | `841e55c10d5a6976d07ca3656e5aabda3209ab62` (Docs sync descendant) | **ALIGNED** |
| **Vercel Active SHA** | `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` | `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` (Clean Production Redeployment) | **ALIGNED** |
| **Render Service ID** | `srv-d326fbe4d50c73e04k50` | `srv-d326fbe4d50c73e04k50` (Node.js NestJS API) | **HEALTHY** |
| **Vercel Project** | `techsprout-web` | `techsprout-web.vercel.app` (Target: `techsprout` project) | **HEALTHY** |
| **Target Database** | Managed PostgreSQL (Render) | Connected via Drizzle ORM (`SELECT 1` OK) | **UP** |
| **Target Cache / Queue** | Redis / Valkey | Connected via BullMQ & IORedis (`PING` -> `PONG`) | **UP** |
| **Gateway Sandbox Mode** | Live / Production Mode | `SSLCOMMERZ_IS_SANDBOX=false` | **CONFIGURED** |

---

## 3. ROOT CAUSE ANALYSIS (P0 DEFECT)

- **Root Cause:** Next.js inlines variables prefixed with `NEXT_PUBLIC_*` into client-side JavaScript chunks during `next build`. Prior to remediation, `NEXT_PUBLIC_API_URL` was configured only for `Preview` in Vercel project settings, leaving `Production` unset. In `apps/web/src/lib/axiosInstance.ts`, the build fell back to `http://localhost:3001`.
- **Secondary Impact:** In `apps/web/src/auth.ts`, `apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'`. The lack of `INTERNAL_API_URL` caused serverless functions executing on Vercel to fail when calling `/api/v1/auth/me`, rejecting all student and admin SSR sessions with `HTTP 307` redirects to `/login`.

---

## 4. REMEDIATION DETAILS (VERCEL CONFIGURATION)

### 4.1 Variables Added / Updated
Under Vercel Project Settings (`https://vercel.com/tech-sprout/techsprout/settings/environment-variables`):
1. **`NEXT_PUBLIC_API_URL`**:
   - Value: `https://techsprout-api.onrender.com`
   - Scope: `All Environments` (Production, Preview, Development)
2. **`INTERNAL_API_URL`**:
   - Value: `https://techsprout-api.onrender.com`
   - Scope: `Production`

### 4.2 Clean Production Redeployment
- **Source Code Base:** Release commit `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` (`chore(release): finalize techsprout p5.5`).
- **Build Cache Setting:** `Use existing Build Cache: FALSE` (Fresh compilation to guarantee environment variable inlining).
- **Deployment Status:** `Ready` (Build completed in 1m 1s).
- **Assigned Canonical Domain:** `https://techsprout-web.vercel.app`.

---

## 5. CLIENT BUNDLE & LOCALHOST FALLBACK VERIFICATION

An automated audit of all JavaScript chunks served from `https://techsprout-web.vercel.app` and `https://techsprout-web.vercel.app/courses` was executed:
- **`http://localhost:3001` occurrences in client bundle:** **0 (ZERO)**
- **`https://techsprout-api.onrender.com` occurrences in client bundle:** **2 (CONFIRMED)**
- **Authoritative Chunk:** `/_next/static/chunks/0ruj7h34m2x4h.js` contains the compiled Axios instance baseURL pointing to Render:
  ```javascript
  tu.create({ baseURL: "https://techsprout-api.onrender.com", withCredentials: !0 })
  ```

---

## 6. POST-DEPLOYMENT SMOKE & OBSERVATION MATRIX

| Checkpoint | Target / Flow | Mode | Expected | Observed Live | Verdict |
|---|---|---|---|---|---|
| **1. Public Frontend** | `GET https://techsprout-web.vercel.app` | HTTP Edge Probe | 200 OK | HTTP 200 OK (232ms) | **PASS** |
| **2. Browser API Target** | Client fetch requests | Chrome CDP Network Capture | `onrender.com` | `https://techsprout-api.onrender.com/api/v1/*` | **PASS** |
| **3. Localhost Calls** | Client fetch requests | Chrome CDP Network Capture | 0 calls | **0 calls** | **PASS** |
| **4. Catalog UI** | `https://techsprout-web.vercel.app/courses` | Chrome CDP DOM Render | 11 courses published | 6 cards on page 1 of 11, Error banner: **FALSE** | **PASS** |
| **5. Student Login** | `POST /api/v1/auth/login` | Automated API Probe | Session cookie | `techsprout_session` issued (`HttpOnly; Secure; Lax`) | **PASS** |
| **6. Student Orders SSR** | `GET /orders` & `/orders/:id` | SSR Authenticated Probe | 200 OK | HTTP 200 OK (46,021 bytes rendered) | **PASS** |
| **7. Admin Portal SSR** | `GET /admin/finance` | SSR Authenticated Probe | 200 OK | HTTP 200 OK (54,750 bytes rendered) | **PASS** |
| **8. Admin Refund Queue** | `GET /admin/finance/refund-requests` | SSR Authenticated Probe | 200 OK | HTTP 200 OK (49,860 bytes rendered) | **PASS** |
| **9. Student Refund Eligibility**| `GET /orders/:id/refund-eligibility` | Authenticated Student Probe | 200 OK | `isEligible: true`, 6 days remaining | **PASS** |
| **10. Invoice SSR View** | `GET /invoices/:id` | SSR Authenticated Probe | 200 OK | HTTP 200 OK (45,099 bytes rendered) | **PASS** |
| **11. Invoice PDF Stream** | `GET /api/v1/invoices/:id/pdf` | Authenticated Student Probe | `application/pdf` | Binary A4 PDF (3,366 bytes, `%PDF-1.3`) | **PASS** |
| **12. Admin CSV Export** | `GET /api/v1/admin/finance/export?type=orders` | Authenticated Admin Probe | `text/csv` | RFC 4180 CSV (2,426 bytes, UTF-8 BOM) | **PASS** |
| **13. Serverless SSR Target** | `getCurrentUser` via `INTERNAL_API_URL` | Edge Node Evaluation | `onrender.com` | Successfully validates roles against Render | **PASS** |
| **14. Live Payment** | Gateway checkout session | Prohibited | NOT TESTED | **PAYMENT = NOT TESTED — LIVE FINANCIAL TRANSACTION NOT AUTHORIZED** | **NOT TESTED** |
| **15. Live Refund** | Gateway refund execution | Prohibited | NOT TESTED | **REFUND = NOT TESTED — LIVE FINANCIAL TRANSACTION NOT AUTHORIZED** | **NOT TESTED** |

---

## 7. BACKEND API HEALTH & SERVICE METRICS (RENDER)

- **System Health (`GET /api/v1/health`):**
  - Status: `HTTP/1.1 200 OK`
  - Payload: `{"status":"ok","environment":"production","services":{"database":"up","redis":"up"}}`
  - Database status: `up`
  - Redis status: `up`
- **Readiness Probe (`GET /api/v1/health/ready`):** `HTTP/1.1 200 OK` (`{"ready":true}`)
- **PostgreSQL Data Integrity:**
  - Reconciliation scan executed across all 10 orders:
    `totalOrdersScanned: 10, discrepanciesFoundCount: 0, autoResolvedCount: 0, discrepancies: []`.
  - Migration state: `0005_refund_requests_subsystem.sql` active.
- **BullMQ / Valkey Queue Health:**
  - Queue `techsprout-queue` active in worker process with exponential retry backoff and dead-letter queue preservation.

---

## 8. SECURITY & RUNTIME HYGIENE

- **Cookie Security:** Session cookies issued with `HttpOnly; Secure; SameSite=Lax`.
- **CORS Configuration:** `WEB_PUBLIC_ORIGIN` strictly set to `https://techsprout-web.vercel.app` (single origin, zero commas).
- **Callback Integrity:** Payment callback handlers (`/fail`, `/cancel`) redirect strictly to `https://techsprout-web.vercel.app/orders/unknown/...`.
- **Zero Secrets Leaked:** Environment variables, database connection strings, and payment passwords remain completely unexposed in client bundles, server logs, and HTTP response headers.

---

## 9. REMAINING OPERATIONAL RECOMMENDATIONS (NON-BLOCKING)

1. **DNS Cutover for `techsprout.tech`:** Configure registrar DNS records for `techsprout.tech` or update Vercel domain alias settings to remove redirects to unresolving domains.
2. **Catalog Response Caching:** Implement a 60-second Redis cache on `GET /api/v1/courses` to decrease catalog latency from ~750ms to <50ms.
3. **Synthetic Health Ping:** Maintain an external monitor pinging `GET /api/v1/health` every 5 minutes to prevent free/starter container sleep on Render.

---

## 10. FINAL DECISION

==================================================  
**FINAL DECISION: PRODUCTION STABILIZATION COMPLETE**  
==================================================  

### Decision Summary:
1. **Vercel Production Deployment:** Successfully deployed and in `Ready` state on release commit `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`.
2. **Public Frontend:** Returns `HTTP 200 OK` with zero SSO barriers or redirect loops.
3. **Catalog UI:** Live `/courses` renders 11 published courses directly from Render API without errors.
4. **Network Traffic:** Browser requests call `https://techsprout-api.onrender.com` with **0 calls** to `localhost:3001`.
5. **Serverless SSR:** Uses `INTERNAL_API_URL` targeting Render; SSR authentication and role authorization function correctly.
6. **Authentication & Orders:** Student login, session validation, and order history operate cleanly.
7. **Financial Operations:** Invoice PDF streaming, Admin Finance summary, and CSV export streaming verified without regressions.
8. **No Code Modifications:** Zero application source code was modified; all changes were strictly environment configuration fixes.

---

**Sign-off:**  
*Senior SRE & Production QA Engineer*  
*TechSprout Engineering Team*
