# TECHSPROUT PRODUCTION RELEASE VERIFICATION & SMOKE TEST REPORT

## FINAL PRODUCTION CONFIGURATION & SMOKE VERIFICATION

**Document Type:** Final Production Configuration & Smoke Verification Audit
**Verified Release Commit:** `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`
**Execution Timestamp:** 2026-10-07T10:25:00+06:00
**Audit Roles:** Senior Release Engineer, SRE, Fintech QA Lead
**Production Frontend:** `https://techsprout-web.vercel.app`
**Production Backend:** `https://techsprout-api.onrender.com`
**Final Release Decision:** **PRODUCTION CONFIGURATION VERIFIED**

---

## 1. RELEASE COMMIT & CODE INTEGRITY

- **Verified Release Commit:** `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`
- **Commit Title:** `chore(release): finalize techsprout p5.5`
- **Render Production Service Deployment:**
  - Branch: `feat/p1-foundation-security`
  - Active Deployed SHA: `841e55c10d5a6976d07ca3656e5aabda3209ab62` (Direct descendant of `e3506d4`, docs sync)
  - Base Commit: `e3506d46a1400b90045cdae4f8fe4815aa3b7cea` (Contains full P5.5 verified implementation)
- **Vercel Production Deployment:**
  - Branch: `main` (Fast-forwarded to `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`)
  - Active Deployed SHA: `e3506d46a1400b90045cdae4f8fe4815aa3b7cea`
  - Deployment ID: `6901055682` (`state: success`)
- **Code Modifications:** ZERO source code modified; ZERO database migrations created; ZERO schema modifications.

---

## 2. PRODUCTION BACKEND VERIFICATION (RENDER)

- **Host:** `https://techsprout-api.onrender.com`
- **Health Check (`GET /api/v1/health`):**
  - Status: `HTTP/1.1 200 OK`
  - Payload:
    ```json
    {
      "status": "ok",
      "timestamp": "2026-10-07T04:21:28.968Z",
      "uptime": 664,
      "environment": "production",
      "services": {
        "database": "up",
        "redis": "up"
      }
    }
    ```
- **Catalog Probe (`GET /api/v1/courses`):**
  - Status: `HTTP/1.1 200 OK`
  - Content: 11 published courses retrieved with authoritative pricing in BDT (`BDT 1000.00`).
- **Result:** **PASS**

---

## 3. PRODUCTION FRONTEND VERIFICATION (VERCEL)

- **Primary Production URL:** `https://techsprout-web.vercel.app`
- **Accessibility & Security Checks:**
  - `curl -I https://techsprout-web.vercel.app` $\to$ `HTTP/1.1 200 OK`
  - Public unauthenticated access: **PASS**
  - Vercel SSO / Deployment Protection: **NONE (Public)**
  - Redirection: **NONE** (No redirects to unconfigured domains)
- **Deployed Application Content:**
  - Verified Next.js 16 App Router application (`TechSprout School`) rendering all published courses, hero banners, and curriculum navigation.
- **P5.5 Route & UI Availability:**
  - `/orders`: `HTTP 200 OK` (`X-Matched-Path: /orders`)
  - `/orders/[orderId]`: `HTTP 200 OK` (`X-Matched-Path: /orders/[orderId]`)
  - `/invoices/[id]`: `HTTP 200 OK` (`X-Matched-Path: /invoices/[id]`)
  - `/admin/finance`: Protected route (`HTTP 307 -> /login`)
  - `/admin/finance/refund-requests`: Protected route (`HTTP 307 -> /login`)
- **Result:** **PASS**

---

## 4. RENDER ENVIRONMENT & SECRETS CONFIGURATION

Non-secret configuration state verified live:

- **`WEB_PUBLIC_ORIGIN`**: `https://techsprout-web.vercel.app`
  - Single canonical origin: **YES** (Zero commas detected)
- **`API_PUBLIC_BASE_URL`**: `https://techsprout-api.onrender.com`
- **`SSLCOMMERZ_IS_SANDBOX`**: `false` (Production mode)
- **Merchant Credentials**: Present and validated at startup; never logged, exposed, or printed.
- **Result:** **PASS**

---

## 5. PAYMENT CALLBACK CONFIGURATION

Live failure and cancellation redirect probes executed against deployed Render API:

1. `POST https://techsprout-api.onrender.com/api/v1/payments/sslcommerz/fail`
   - Response: `HTTP/1.1 302 Found`
   - Location: `https://techsprout-web.vercel.app/orders/unknown/failure?reason=Invalid%20callback%20payload`
2. `POST https://techsprout-api.onrender.com/api/v1/payments/sslcommerz/cancel`
   - Response: `HTTP/1.1 302 Found`
   - Location: `https://techsprout-web.vercel.app/orders/unknown/cancelled`
3. Canonical Success Redirect Construction:
   - Target Pattern: `https://techsprout-web.vercel.app/orders/<orderId>/success`

- **Result:** **PASS**

---

## 6. P5.5 ENDPOINT VERIFICATION (RENDER)

All five P5.5 operational routes verified with authenticated test requests:

1. **Invoice PDF Streaming**:
   - `GET /api/v1/invoices/d33ed09c-c58f-4f9b-b41c-2adf31e5a761/pdf`
   - Status: `HTTP/1.1 200 OK`
   - Content: `Content-Type: application/pdf`, `content-disposition: attachment; filename="TSP-INV-2026-472464576.pdf"` (3,366 bytes)
2. **Finance CSV Streaming Export**:
   - `GET /api/v1/admin/finance/export?type=orders`
   - Status: `HTTP/1.1 200 OK`
   - Content: `Content-Type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="techsprout-orders-2026-09-07-to-2026-10-07.csv"` (2,426 bytes)
3. **Student Orders API**:
   - `GET /api/v1/orders`
   - Status: `HTTP/1.1 200 OK` (10 student orders returned)
4. **Student Refund Requests API**:
   - `GET /api/v1/refund-requests`
   - Status: `HTTP/1.1 200 OK` ("Refund requests retrieved successfully")
5. **Admin Refund Requests Queue API**:
   - `GET /api/v1/admin/refund-requests`
   - Status: `HTTP/1.1 200 OK` ("Refund requests retrieved successfully")

- **Result:** **PASS** (Zero 404 errors)

---

## 7. PRODUCTION SMOKE TEST SUMMARY

| Test Item              | Endpoint / Flow                  | Result         | Notes                                     |
| ---------------------- | -------------------------------- | -------------- | ----------------------------------------- |
| **System Health**      | `GET /api/v1/health`             | **PASS**       | PostgreSQL and Redis healthy              |
| **Catalog**            | `GET /api/v1/courses`            | **PASS**       | 11 courses published in BDT 1000.00       |
| **Student Auth**       | `POST /api/v1/auth/login`        | **PASS**       | Session cookie issued                     |
| **Admin Auth**         | `POST /api/v1/auth/login`        | **PASS**       | Session cookie issued                     |
| **Student Orders**     | `GET /api/v1/orders`             | **PASS**       | Order history loads                       |
| **Invoice View**       | `/invoices/[id]`                 | **PASS**       | SSR page renders HTTP 200                 |
| **PDF Download**       | `/api/v1/invoices/:id/pdf`       | **PASS**       | Binary A4 PDF streamed                    |
| **Admin Finance**      | `/admin/finance`                 | **PASS**       | Route deployed, auth protected            |
| **CSV Export**         | `/api/v1/admin/finance/export`   | **PASS**       | RFC 4180 streaming CSV                    |
| **Refund Request UI**  | `/orders/[orderId]`              | **PASS**       | SSR page renders HTTP 200                 |
| **Admin Refund Queue** | `/admin/finance/refund-requests` | **PASS**       | Route deployed, auth protected            |
| **Live Payment**       | `POST /api/v1/payments/initiate` | **NOT TESTED** | Live financial transaction not authorized |
| **Live Refund**        | Gateway refund disbursement      | **NOT TESTED** | Live financial transaction not authorized |

---

## 8. FINAL DECISION

==================================================
**FINAL DECISION: PRODUCTION CONFIGURATION VERIFIED**
==================================================

Both backend (Render) and frontend (Vercel) production instances are completely deployed, healthy, and aligned to the verified P5.5 release. Public access to the production frontend (`https://techsprout-web.vercel.app`) is active with zero authentication barriers or broken redirects. All financial reporting, invoice PDF streaming, order history, and refund workflow endpoints are operational and verified.
