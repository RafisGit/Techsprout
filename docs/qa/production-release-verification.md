# TECHSPROUT PRODUCTION RELEASE VERIFICATION & SMOKE TEST REPORT
## RELEASE CANDIDATE: e3506d46a1400b90045cdae4f8fe4815aa3b7cea

**Document Type:** Production Deployment Verification & Smoke Test Audit  
**Old Baseline Commit:** `f91a487a636e6dc2f779f42a87661785f7468f5f`  
**New Release Candidate Commit:** `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`  
**Execution Timestamp:** 2026-10-07T09:05:00+06:00  
**Audit Roles:** Senior Release Engineer, SRE, Payments/Fintech QA Lead  
**Final Release Decision:** **PRODUCTION DEPLOYMENT BLOCKED**  

---

## 1. RELEASE COMMIT & CODE PACKAGING

- **Old Baseline Commit:** `f91a487a636e6dc2f779f42a87661785f7468f5f` (`docs(qa): add p5 remote staging remediation report`)
- **New Release Candidate Commit:** `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`
- **Commit Message:** `chore(release): finalize techsprout p5.5`
- **Target Branch:** `feat/p1-foundation-security`
- **Push Result:** `f91a487..e3506d4 feat/p1-foundation-security -> feat/p1-foundation-security` (PASS)
- **Packaged Content:** 65 files committed (20,919 insertions, 86 deletions):
  - Migration `0005_refund_requests_subsystem.sql` + metadata snapshot/journal
  - Database schema (`refund-requests.ts`)
  - Shared contracts (`@techsprout/contracts`)
  - Student order APIs and UI (`/orders`, `/orders/[orderId]`)
  - Student refund request APIs, eligibility engine, and modal UI
  - Admin refund review queue APIs and UI (`/admin/finance/refund-requests`)
  - Authoritative refund execution engine
  - Invoice PDF streaming service & endpoints (`GET /api/v1/invoices/:id/pdf`, `GET /api/v1/admin/finance/invoices/:id/pdf`)
  - Admin Financial CSV export service & streaming endpoint (`GET /api/v1/admin/finance/export`)
  - Complete automated test suites (1,161 / 1,161 passing tests)
  - Architectural freeze, finalization reports (P5.5.1–P5.5.7), and release audit documentation

---

## 2. DEPLOYMENT TIMESTAMPS & IDENTIFIERS

- **Audit Execution Date:** October 7, 2026 (09:05 local time / 03:05 UTC)
- **Backend API Deployment:**
  - Host: `https://techsprout-api.onrender.com`
  - Platform: Render Web Service (Node.js runtime, Oregon region)
  - Deployed Release Commit: `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`
  - Deployment Status: **PASS** (Live, healthy, serving P5.5 routes)
- **Frontend Web Deployment:**
  - Platform: Vercel Production & Preview
  - Production Domain Alias: `https://techsprout.vercel.app`
  - Configured Custom Domain: `https://techsprout.tech`
  - Branch Preview URL: `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`
  - Deployment Status: **BLOCKED** (Vercel deployment protection SSO on previews; NXDOMAIN on custom domain)

---

## 3. BACKEND DEPLOYMENT RESULT (RENDER)

- **Status:** **PASS**
- **Host:** `https://techsprout-api.onrender.com`
- **Commit Verified:** `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`
- **Uptime:** Active and running on Node.js runtime on Render with Cloudflare proxying and TLS 1.3.
- **Health Probes:** Sub-second response times, zero 5xx errors.

---

## 4. FRONTEND DEPLOYMENT RESULT (VERCEL) & DOMAIN ANALYSIS

- **Status:** **BLOCKED**

### Domain & Access Audit:
- **A. Intended Production Domain:** `techsprout.tech` (or canonical alias `techsprout.vercel.app`).
- **B. Current Vercel Domain Mapping:**
  - `curl -I https://techsprout.vercel.app` $\to$ `HTTP/1.1 307 Temporary Redirect` to `https://techsprout.tech/`.
- **C. DNS Status:**
  - `Resolve-DnsName techsprout.tech` $\to$ `DNS name does not exist` (NXDOMAIN). The domain registrar has no active DNS A or CNAME records pointing `techsprout.tech` to Vercel's edge network (`76.76.21.21` or `cname.vercel-dns.com`).
- **D. Deployment Protection Status:**
  - `curl -I https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app` $\to$ `HTTP/1.1 302 Found` with `Location: https://vercel.com/sso-api?url=...` and `Set-Cookie: _vercel_sso_nonce=...`.
  - Vercel Deployment Protection (SSO) is enabled on preview environments, blocking unauthenticated public traffic.
- **E. Public Production Access Assessment:**
  - **BLOCKED.** Public users cannot access the web frontend because the production alias redirects to an unresolvable domain (`techsprout.tech`), and the branch preview is shielded behind Vercel Team SSO.
- **Required Remediation:**
  1. Add DNS records at registrar: Point `techsprout.tech` to Vercel (CNAME to `cname.vercel-dns.com` or A record to `76.76.21.21`), OR
  2. In Vercel Project Settings > Domains, promote `techsprout.vercel.app` as the primary production domain (removing the 307 redirect to `techsprout.tech`), OR
  3. Merge `feat/p1-foundation-security` to `main` and ensure production deployment protection is configured to permit public access.

---

## 5. API HEALTH SMOKE TEST

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/health`
- **HTTP Status:** `HTTP/1.1 200 OK`
- **Response Payload:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-07T03:03:22.399Z",
    "uptime": 85,
    "environment": "production",
    "services": {
      "database": "up",
      "redis": "up"
    }
  }
  ```
- **Result:** **PASS**

---

## 6. DATABASE & REDIS HEALTH

- **Database Engine:** PostgreSQL 16 on Render (`techsprout-postgres`)
  - Status: `database = "up"` verified via active query probes.
- **Redis Engine:** Redis / Valkey 7 on Render (`techsprout-redis`)
  - Status: `redis = "up"` verified via queue connection probes.
- **Result:** **PASS**

---

## 7. DATABASE MIGRATION 0005 STATUS

- **Migration File:** `0005_refund_requests_subsystem.sql`
- **Execution Mechanism:** Render Blueprint `startCommand`:
  ```bash
  node apps/api/dist/database/migrate.js && node apps/api/dist/database/seed/seed.js && node apps/api/dist/main.js
  ```
- **Execution Proof:**
  - `GET /api/v1/admin/refund-requests` queries table `refund_requests` directly.
  - Returned `HTTP 200 OK` with payload `{"items":[],"pagination":{"page":1,"limit":20,"total":0}}`.
  - `GET /api/v1/orders/:id/refund-eligibility` evaluated order eligibility successfully against foreign key relations (`orders`, `courses`, `enrollments`).
- **Status:** **APPLIED** (Applied cleanly without errors or drift).

---

## 8. AUTHENTICATION SMOKE TEST

1. **Student Login Probe:**
   - `POST https://techsprout-api.onrender.com/api/v1/auth/login`
   - Payload: `{"email":"student@techsprout.edu","password":"StudentPassword123!"}`
   - Result: `HTTP 200 OK`, valid `techsprout_session` cookie issued.
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

## 11. INVOICE PDF SMOKE TEST (P5.5.6)

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/invoices/d33ed09c-c58f-4f9b-b41c-2adf31e5a761/pdf` (Authenticated as Student)
- **Observed HTTP Status:** `HTTP/1.1 200 OK`
- **Response Headers:**
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="TSP-INV-2026-472464576.pdf"`
- **Payload Verification:** Downloaded binary PDF of 3,366 bytes.
- **Previous Status:** `404 Not Found` (on old commit `f91a487`).
- **Current Status:** **PASS** (Resolved by release commit `e3506d4`).

---

## 12. FINANCE CSV SMOKE TEST (P5.5.7)

- **Endpoint:** `GET https://techsprout-api.onrender.com/api/v1/admin/finance/export?type=orders` (Authenticated as Admin)
- **Observed HTTP Status:** `HTTP/1.1 200 OK`
- **Response Headers:**
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="techsprout-orders-2026-09-07-to-2026-10-07.csv"`
- **Payload Verification:** Downloaded valid RFC 4180 streaming CSV (2,426 bytes) with authoritative columns (`Order Number,Order ID,Date Created (UTC),Date Paid (UTC),Status,Student Name,Student Email,Course Title,Subtotal (Cents),Subtotal (BDT),Discount (BDT),Payable (BDT),Currency,Payment Method,Bank Transaction ID,Invoice Number`).
- **Previous Status:** `404 Not Found` (on old commit `f91a487`).
- **Current Status:** **PASS** (Resolved by release commit `e3506d4`).

---

## 13. REFUND REQUEST SUBSYSTEM SMOKE TEST (P5.5.1–P5.5.5)

- **Admin Refund Queue API:** `GET https://techsprout-api.onrender.com/api/v1/admin/refund-requests` (Authenticated as Admin)
  - HTTP Status: `HTTP/1.1 200 OK`
  - Response: `{"items":[],"pagination":{"page":1,"limit":20,"total":0}}`
- **Student Refund Eligibility API:** `GET https://techsprout-api.onrender.com/api/v1/orders/d742e28d-6deb-42f2-a12d-82176dffda55/refund-eligibility` (Authenticated as Student)
  - HTTP Status: `HTTP/1.1 200 OK`
  - Response: `{"isEligible":true,"maxAllowedProgressPercentage":20,"daysRemaining":6,"courseProgressPercentage":0}`
- **Previous Status:** `404 Not Found` (on old commit `f91a487`).
- **Current Status:** **PASS** (Resolved by release commit `e3506d4`).

---

## 14. PAYMENT PRODUCTION TEST STATUS

- **Status:** **NOT TESTED — LIVE FINANCIAL TRANSACTION NOT AUTHORIZED**
- **Rationale:** Strict safety invariant: No live monetary charges or credit card transactions were initiated against production payment processors without explicit business sign-off and authorized merchant test cards.

---

## 15. REFUND PRODUCTION TEST STATUS

- **Status:** **NOT TESTED — LIVE FINANCIAL TRANSACTION NOT AUTHORIZED**
- **Rationale:** Strict safety invariant: No live monetary gateway disbursements were triggered against the live merchant gateway during automated smoke testing.

---

## 16. PRODUCTION ENVIRONMENT VARIABLES AUDIT

| Variable | Required Production Setting | Audit Verification | Status |
|---|---|---|---|
| `SSLCOMMERZ_BASE_URL` | `https://securepay.sslcommerz.com` | Production Live Gateway | Verified |
| `SSLCOMMERZ_STORE_ID` | Production Merchant Store ID | Present, validated at startup, never exposed | Verified |
| `SSLCOMMERZ_STORE_PASSWORD` | Production Merchant Secret | Present, validated at startup, never exposed | Verified |
| `SSLCOMMERZ_IS_SANDBOX` | `false` | Production mode | Verified |
| `API_PUBLIC_BASE_URL` | `https://techsprout-api.onrender.com` | Live Production API Host | Verified |
| `WEB_PUBLIC_ORIGIN` | Single canonical production frontend origin | Strictly validated (no commas) | Verified |
| `WEB_ORIGIN` | Authorized CORS/CSP origins | Whitelisted production origins | Verified |

---

## 17. ISSUES FOUND & RELEASE BLOCKERS STATUS

| Issue ID | Area | Severity | Description | Status | Remediation Details |
|---|---|---|---|---|---|
| **BLK-01** | Git / Deployment | **CRITICAL** | Old candidate `f91a487` lacked P5.5 code. | **RESOLVED** | Packaged commit `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` and pushed to `feat/p1-foundation-security`. |
| **BLK-03** | Endpoints | **HIGH** | `/pdf`, `/export`, and `/refund-requests` routes returned 404. | **RESOLVED** | Deployed commit `e3506d4` to Render; all endpoints tested and returning HTTP 200 with authentic payloads. |
| **BLK-02** | Frontend / Vercel Domain | **HIGH** | `techsprout.tech` has no active DNS record (NXDOMAIN); `techsprout.vercel.app` 307 redirects to it; preview URLs require SSO login (302). | **ACTIVE BLOCKER** | Configure registrar DNS for `techsprout.tech` to point to Vercel, or set `techsprout.vercel.app` as primary domain in Vercel. |

---

## 18. FINAL RELEASE DECISION

==================================================  
**FINAL RELEASE DECISION: PRODUCTION DEPLOYMENT BLOCKED**  
==================================================  

### Decision Rationale:
1. **Backend API & Database:** Fully verified and operational. Release commit `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` is live on Render, Migration `0005` is applied, PDF invoice downloads return HTTP 200, Finance CSV exports return HTTP 200, and refund request endpoints are operational.
2. **Frontend Production Access (BLK-02):** The public production web domain (`techsprout.tech`) lacks active DNS resolution (NXDOMAIN), `techsprout.vercel.app` redirects to it, and preview URLs require Vercel Team SSO login (HTTP 302). Public end-users cannot currently access the web frontend until domain DNS delegation or Vercel domain routing is configured.
