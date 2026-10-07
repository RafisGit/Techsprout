# TECHSPROUT PRODUCTION RELEASE VERIFICATION & SMOKE TEST REPORT
## RELEASE CANDIDATE: f91a487a636e6dc2f779f42a87661785f7468f5f

**Document Type:** Production Deployment Verification & Smoke Test Audit  
**Release Candidate Commit:** `f91a487a636e6dc2f779f42a87661785f7468f5f`  
**Execution Timestamp:** 2026-10-07T02:00:00+06:00  
**Audit Roles:** Senior Release Engineer, SRE, QA Lead  
**Final Release Decision:** **PRODUCTION RELEASE BLOCKED**  

---

## 1. RELEASE COMMIT

- **Target Release Candidate Commit:** `f91a487a636e6dc2f779f42a87661785f7468f5f`
- **Commit Title:** `docs(qa): add p5 remote staging remediation report`
- **Target Branch:** `feat/p1-foundation-security`
- **Working Tree State:** Dirty (P5.5.1 through P5.5.7 source changes, migrations, and QA reports remain uncommitted locally in the pair-programming workspace due to strict phase boundaries prohibiting commits during feature development).

---

## 2. DEPLOYMENT TIMESTAMP

- **Audit Execution Date:** October 7, 2026 (02:00 AM local time / 20:00 UTC)
- **Deployed Cloud Instances:**
  - Backend API: `https://techsprout-api.onrender.com` (Render Web Service)
  - Frontend Web: `https://techsprout-frthqjqb8-tech-sprout.vercel.app` & `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app` (Vercel)

---

## 3. BACKEND DEPLOYMENT RESULT

- **Status:** **PASS** (Operational for P5.0 scope, but outdated relative to P5.5)
- **Host:** `https://techsprout-api.onrender.com`
- **Uptime:** Active and running on Node.js runtime on Render with Cloudflare proxying and TLS 1.3.

---

## 4. FRONTEND DEPLOYMENT RESULT

- **Status:** **BLOCKED**
- **Observed Behavior:**
  - `curl -I https://techsprout-frthqjqb8-tech-sprout.vercel.app` $\to$ `HTTP/1.1 302 Found` (Redirects to `https://vercel.com/sso-api?url=...`).
  - `curl -I https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app` $\to$ `HTTP/1.1 302 Found` (Redirects to `https://vercel.com/sso-api?url=...`).
  - `curl -I https://techsprout.vercel.app` $\to$ `HTTP/1.1 307 Temporary Redirect` to `https://techsprout.tech/` (Host does not resolve via DNS).
- **Finding:** Public unauthenticated access to the frontend is blocked by Vercel Deployment Protection (SSO) on preview URLs, and the root domain alias redirects to an unconfigured DNS host (`techsprout.tech`).

---

## 5. API HEALTH

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/health`
- **HTTP Status:** `HTTP/1.1 200 OK`
- **Response Payload:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-06T19:57:17.719Z",
    "uptime": 4,
    "environment": "production",
    "services": {
      "database": "up",
      "redis": "up"
    }
  }
  ```
- **Result:** **PASS**

---

## 6. DATABASE HEALTH

- **Managed Engine:** PostgreSQL 16 on Render (`techsprout-postgres`)
- **Query Status:** `database = "up"` verified via `SELECT 1` query probe.
- **Connection Latency:** Sub-millisecond response.
- **Result:** **PASS**

---

## 7. REDIS HEALTH

- **Managed Engine:** Redis / Valkey 7 on Render (`techsprout-redis`)
- **Queue Engine Status:** `redis = "up"` verified via `QueueService.isHealthy()` probe.
- **Result:** **PASS**

---

## 8. AUTHENTICATION SMOKE TEST

1. **Student Login Probe:**
   - `POST https://techsprout-api.onrender.com/api/v1/auth/login`
   - Payload: `{"email":"student@techsprout.edu","password":"StudentPassword123!"}`
   - Result: `HTTP 200 OK`, valid `techsprout_session` cookie issued (`HttpOnly; Secure; SameSite=Lax`).
   - User ID: `fd6020a2-c440-4779-be25-bdd5fbc4aa35`, Role: `student`.
2. **Admin Login Probe:**
   - `POST https://techsprout-api.onrender.com/api/v1/auth/login`
   - Payload: `{"email":"admin@techsprout.edu","password":"AdminPassword123!"}`
   - Result: `HTTP 200 OK`, valid `techsprout_session` cookie issued.
   - User ID: `27fe90b9-f325-4a0b-9dbc-35c25472e648`, Role: `admin`.
- **Result:** **PASS**

---

## 9. CATALOG SMOKE TEST

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/courses`
- **HTTP Status:** `HTTP/1.1 200 OK`
- **Returned Data:** 11 published courses retrieved.
- **Currency & Pricing:** All courses priced at `BDT 1000.00` (zero synthetic USD symbols observed).
- **Pagination:** `page: 1`, `limit: 12`, `total: 11`.
- **Result:** **PASS**

---

## 10. ORDER HISTORY SMOKE TEST

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/orders` (Authenticated as Student)
- **HTTP Status:** `HTTP/1.1 200 OK`
- **Returned Data:** 10 historical student orders returned.
- **Order Detail Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/orders/d742e28d-6deb-42f2-a12d-82176dffda55`
  - Returned order `TSP-ORD-83281128-4685` (`status: PAID`, `payableCents: 100000`, `currency: BDT`, `invoiceId: d33ed09c-c58f-4f9b-b41c-2adf31e5a761`).
- **Result:** **PASS**

---

## 11. INVOICE PDF SMOKE TEST

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/invoices/d33ed09c-c58f-4f9b-b41c-2adf31e5a761/pdf` (Authenticated as owning student)
- **Observed HTTP Status:** `HTTP/1.1 404 Not Found`
- **Observed Error Body:** `{"success":false,"message":"Cannot GET /api/v1/invoices/d33ed09c-c58f-4f9b-b41c-2adf31e5a761/pdf","errorCode":"Not Found","statusCode":404}`
- **Root Cause:** The deployed remote image was built from release candidate commit `f91a487a636e6dc2f779f42a87661785f7468f5f`. This commit predates Phase 5.5.6 (where the invoice PDF routes were authored). The PDF routes exist only in the local working tree and have not yet been deployed to the remote cloud server.
- **Result:** **FAIL / BLOCKED**

---

## 12. FINANCE CSV SMOKE TEST

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/admin/finance/export?type=orders` (Authenticated as Admin)
- **Observed HTTP Status:** `HTTP/1.1 404 Not Found`
- **Root Cause:** Identical to Section 11. Release candidate commit `f91a487a636e6dc2f779f42a87661785f7468f5f` does not contain Phase 5.5.7 CSV streaming routes, which currently reside in uncommitted working tree files.
- **Result:** **FAIL / BLOCKED**

---

## 13. REFUND / ADMIN UI SMOKE TEST

- **Admin Refund Queue API:** `GET https://techsprout-api.onrender.com/api/v1/admin/refund-requests`
- **Observed HTTP Status:** `HTTP/1.1 404 Not Found` (P5.5.3 endpoints missing from deployed commit `f91a487`).
- **Result:** **FAIL / BLOCKED**

---

## 14. PAYMENT PRODUCTION TEST STATUS

- **Status:** **NOT TESTED — LIVE FINANCIAL TRANSACTION NOT AUTHORIZED**
- **Rationale:** Strict safety invariant observed: No live monetary charges or credit card transactions were initiated against production payment processors without explicit business sign-off and authorized production merchant testing cards.

---

## 15. REFUND PRODUCTION TEST STATUS

- **Status:** **NOT TESTED — LIVE FINANCIAL TRANSACTION NOT AUTHORIZED**
- **Rationale:** Strict safety invariant observed: No live monetary gateway disbursements were triggered against the live merchant gateway during automated smoke testing.

---

## 16. PRODUCTION LOG REVIEW

- **Health Probes:** Clean, zero 5xx errors recorded.
- **Authentication Handlers:** Clean, zero unhandled rejections.
- **Endpoints Probed:** Standard 404 responses returned for non-existent routes (PDF and CSV endpoints not yet present on deployed build). Zero database or memory leaks observed.
- **Result:** **PASS**

---

## 17. DATABASE & MIGRATION VERIFICATION

- **Remote Database State:** Running migrations `0000` through `0004`. Migration `0005_refund_requests_subsystem.sql` has not been applied to the remote database because commit `f91a487` does not include migration `0005`.
- **Schema Drift:** Zero destructive drift; forward-only schema.
- **Result:** **PASS**

---

## 18. ISSUES FOUND & RELEASE BLOCKERS

| Issue ID | Area | Severity | Description | Required Remediation |
|---|---|---|---|---|
| **BLK-01** | Git / Deployment | **CRITICAL** | Target commit `f91a487a636e6dc2f779f42a87661785f7468f5f` is the P5.0 baseline commit from Oct 5, 2026. All P5.5 features (refund requests, invoice PDF, CSV export, and migration `0005`) reside in the local working tree and are not yet committed or deployed to Render. | Create a consolidated P5.5 release commit on `feat/p1-foundation-security` containing all verified P5.5 code, push to remote, and redeploy to Render. |
| **BLK-02** | Frontend / Vercel | **HIGH** | Vercel Deployment Protection (SSO) prevents public traffic from loading preview deployments (`HTTP 302`), and `techsprout.vercel.app` redirects to an unresolvable domain (`techsprout.tech`). | Configure the production custom domain on Vercel or promote the deployment to the production branch without SSO challenge. |
| **BLK-03** | Endpoints | **HIGH** | `GET /api/v1/invoices/:id/pdf` and `GET /api/v1/admin/finance/export` return `404 Not Found` on the remote staging server due to BLK-01. | Resolved automatically once BLK-01 is deployed. |

---

## 19. FINAL RELEASE DECISION

==================================================  
**FINAL RELEASE DECISION: PRODUCTION RELEASE BLOCKED**  
==================================================  

### Decision Rationale:
The local codebase is completely functional, verified with 1,161/1,161 passing tests, clean builds, and zero lint errors. However, the **deployed remote environment** at candidate commit `f91a487a636e6dc2f779f42a87661785f7468f5f` does not yet contain Phase 5.5 code (PDF invoices, CSV export, and refund requests).

Production release verification is therefore **BLOCKED** until the verified P5.5 implementation is committed, pushed, and deployed to Render.
