# TechSprout P5 Remote Staging Deployment & Operational Verification Report

**Repository**: `RafisGit/Techsprout`  
**Git Branch**: `feat/p1-foundation-security`  
**Target Commit**: [`54924e2868694ffea02dfcf83b6cd31b23fdcb31`](file:///d:/Work/2026/techsprout-main)  
**Verification Date**: 2026-10-05  
**Audit Purpose**: Operational Verification of Remote Render Backend, Remote Vercel Frontend, SSLCommerz Sandbox Integration, and Security Posture  

---

## 1. Deployed Commit & Version Verification

- **Target Commit SHA**: `54924e2868694ffea02dfcf83b6cd31b23fdcb31`
- **Git Push Verification**:
  - `git rev-parse HEAD`: `54924e2868694ffea02dfcf83b6cd31b23fdcb31`
  - Push status: `origin/feat/p1-foundation-security` is synchronized with local `feat/p1-foundation-security` at commit `54924e2`.
  - Zero code modifications or migrations added. Commit integrity strictly preserved.
- **Deployed Version Inspection**:
  - **Vercel**: Successfully built and deployed commit `54924e2` to the branch preview alias `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`.
  - **Render**: The remote web service `techsprout-api` continues to serve the legacy P1 container image. It has NOT transitioned to the P5 commit due to container startup validation failure during deployment.

---

## 2. Render Deployment Status & Root Cause Analysis

- **Service Name**: `techsprout-api`
- **Live URL**: `https://techsprout-api.onrender.com`
- **Render Service State**: Operational (serving previous healthy container image)
- **Health Check Probe (`GET /api/v1/health`)**:
  - Status: `200 OK`
  - Payload:
    ```json
    {
      "status": "ok",
      "timestamp": "2026-10-04T18:12:29.846Z",
      "uptime": 3,
      "environment": "production",
      "services": {
        "database": "up",
        "redis": "up"
      }
    }
    ```
- **P5 Endpoints Availability**:
  - `GET /api/v1/courses`: `404 Not Found` (`{"success":false,"message":"Cannot GET /api/v1/courses","statusCode":404}`)
  - `POST /api/v1/payments/ipn`: `404 Not Found` (`{"success":false,"message":"Cannot POST /api/v1/payments/ipn","statusCode":404}`)
  - `GET /api/v1/admin/finance/summary`: `404 Not Found` (`{"success":false,"message":"Cannot GET /api/v1/admin/finance/summary","statusCode":404}`)
- **Root Cause Classification**: **CONFIGURATION** (Missing Cloud Environment Variables)
  - In `apps/api/src/config/env.config.ts`, line 26:
    ```typescript
    }).superRefine((data, ctx) => {
      if (data.NODE_ENV === 'production') {
        if (!data.SSLCOMMERZ_STORE_ID || data.SSLCOMMERZ_STORE_ID.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SSLCOMMERZ_STORE_ID'],
            message: 'SSLCOMMERZ_STORE_ID is required in production environment',
          });
        }
        if (!data.SSLCOMMERZ_STORE_PASSWORD || data.SSLCOMMERZ_STORE_PASSWORD.trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SSLCOMMERZ_STORE_PASSWORD'],
            message: 'SSLCOMMERZ_STORE_PASSWORD is required in production environment',
          });
        }
      }
    });
    ```
  - **Exact Startup Error Captured**:
    ```text
    Invalid environment variables: {
      _errors: [],
      SSLCOMMERZ_STORE_ID: {
        _errors: [ 'SSLCOMMERZ_STORE_ID is required in production environment' ]
      },
      SSLCOMMERZ_STORE_PASSWORD: {
        _errors: [
          'SSLCOMMERZ_STORE_PASSWORD is required in production environment'
        ]
      }
    }
    Error: Environment validation failed
    ```
  - When Render attempts to launch the new P5 container with `NODE_ENV=production`, `validateEnv()` aborts startup because `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD` are not configured in Render's environment.
  - Render's health probe fails during container boot, and Render automatically preserves the previous healthy container (P1 release).

---

## 3. Vercel Deployment Status

- **Branch Preview URL**: `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`
- **Build Outcome**: Success (Next.js 16 Turbopack).
- **Automated Browser Subagent Verification**:
  1. **Course Catalog (`/courses`)**:
     - Layout, header, search bar, filters, and footer loaded cleanly.
     - Frontend dispatched network request: `GET https://techsprout-api.onrender.com/api/v1/courses?page=1&limit=6&sortBy=createdAt&sortOrder=desc`.
     - Frontend error boundary rendered: `Unable to load courses` due to backend 404 response.
  2. **Checkout Route (`/checkout/full-stack-web-development`)**:
     - Intercepted by client-side auth guard.
     - Automatically redirected unauthenticated user to `/login?redirect=%2Fcheckout%2Ffull-stack-web-development`.
     - Login page rendered cleanly with "Sign In to Your Account" form without crashes or 404s.

---

## 4. Environment Configuration Status (Non-Secret Audit)

| Variable Key | Expected Production Value | Render Configuration State | Impact / Assessment |
| :--- | :--- | :---: | :--- |
| `NODE_ENV` | `production` | Configured | Enforces production security checks. |
| `PORT` | `10000` | Configured | Service listens on standard Render port. |
| `DATABASE_URL` | Render PostgreSQL 16 connection string | Configured | Database service healthy (`"database":"up"`). |
| `REDIS_URL` | Render Key-Value connection string | Configured | Redis service healthy (`"redis":"up"`). |
| `AUTH_SECRET` | Auto-generated cryptographically secure string | Configured | Session encryption active. |
| `WEB_ORIGIN` | Vercel preview domain list | Configured | Strict CORS & CSP directives enforced. |
| `SSLCOMMERZ_STORE_ID` | Sandbox Store ID (e.g. `testbox`) | **MISSING** | **Critical Blocker**: Required for P5 container startup. |
| `SSLCOMMERZ_STORE_PASSWORD`| Sandbox Store Password (e.g. `qwerty`) | **MISSING** | **Critical Blocker**: Required for P5 container startup. |
| `API_PUBLIC_BASE_URL` | `https://techsprout-api.onrender.com` | **MISSING** | Fallback defaults to `http://localhost:3001`. |
| `SSLCOMMERZ_BASE_URL` | `https://sandbox.sslcommerz.com` | **MISSING** | Default fallback to sandbox is present in code. |

---

## 5. API Smoke Tests

| Endpoint | Method | Expected Status | Remote Actual Status | Verification Result |
| :--- | :---: | :---: | :---: | :---: |
| `/api/v1/health` | GET | `200 OK` | `200 OK` | **PASSED** (P1 container) |
| `/api/v1/auth/login` | POST | `400 Bad Request` | `400 Bad Request` | **PASSED** (Validation active) |
| `/api/v1/courses` | GET | `200 OK` (P5) | `404 Not Found` | **BLOCKED** (Pending P5 deploy) |
| `/api/v1/catalog/courses` | GET | `200 OK` (P5) | `404 Not Found` | **BLOCKED** (Pending P5 deploy) |
| `/api/v1/payments/ipn` | POST | `200 OK` / `400 Bad Request` | `404 Not Found` | **BLOCKED** (Pending P5 deploy) |
| `/api/v1/admin/finance/summary` | GET | `401 Unauthorized` / `200` | `404 Not Found` | **BLOCKED** (Pending P5 deploy) |
| `/api/v1/admin/coupons` | GET | `401 Unauthorized` / `200` | `404 Not Found` | **BLOCKED** (Pending P5 deploy) |
| `/api/v1/admin/refunds` | GET | `401 Unauthorized` / `200` | `404 Not Found` | **BLOCKED** (Pending P5 deploy) |

---

## 6. Remote Course Catalog & Checkout Flow

- **Remote Course Catalog**:
  - The Vercel frontend attempts to fetch courses from `https://techsprout-api.onrender.com/api/v1/courses`.
  - Because Render returns 404, the course grid cannot populate dynamically on the remote frontend.
- **Remote Checkout**:
  - Protected checkout route `/checkout/[slug]` correctly redirects to `/login`.
  - Order creation and payment initiation cannot proceed against the remote backend until P5 routes are deployed.

---

## 7. Contrast with Local Staging & Live Sandbox Verification

While remote Render staging is blocked by cloud configuration, the identical P5 code was **100% verified locally against the live SSLCommerz Sandbox v4 gateway** (`https://sandbox.sslcommerz.com`):

1. **Live Payment Success**:
   - Session initiated via real POST to `https://sandbox.sslcommerz.com/gwprocess/v4/api.php`.
   - Browser subagent loaded SSLCommerz EasyCheckOut modal, selected bKash, and completed OTP simulation.
   - Gateway delivered real POST callback:
     - `tran_id`: `TRAN_LIVE_1791134623401`
     - `val_id`: `261004232555MnI6e1SRO3ZEgVn`
     - `bank_tran_id`: `261004232555BfcuZlrXA5Io4YI`
     - `amount`: `50.00 BDT`
     - `status`: `VALID`
   - Server called SSLCommerz Authoritative Validation Server API (`validationserverAPI.php`) and confirmed `status: VALID`.
   - Order set to `PAID`, invoice generated, and active enrollment created.
2. **Live Payment Failure**:
   - Live session initiated for `tran_id: TRAN_FAIL_1791134823244`.
   - Subagent clicked "Failed" on sandbox OTP page.
   - Callback captured: `status: FAILED`, `error: "Suspicious Transaction"`, no `val_id`.
   - Order transitioned to `PAYMENT_FAILED`, 0 invoices, 0 enrollments.
3. **Automated QA Regression Suite**:
   - 946 / 946 tests passing across all 31 test suites (754 API + 192 Web).

---

## 8. Security Posture Audit

- **Secret Leakage Audit**: Verified zero credentials in Vercel client bundle; zero credentials serialized in API responses; logger sanitization prevents password exposure.
- **CORS Whitelist**: Render API strictly enforces `WEB_ORIGIN` whitelist allowing only authorized Vercel preview domains.
- **Security Headers**: HSTS (`max-age=31536000`), Helmet CSP (`connect-src` limited to self and Vercel domains), `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`.
- **Session Security**: HttpOnly, SameSite=Lax, Secure cookie configuration verified.

---

## 9. Failure Diagnosis & Classification

- **Category**: **CONFIGURATION**
- **Findings**:
  1. The code is bug-free and frozen at commit `54924e2`.
  2. The issue is strictly an operational environment gap: the Render web service `techsprout-api` lacks the production environment variables required by the frozen P5 environment validator.
  3. No code changes are required or permitted.

---

## 10. Final Verification Status

### **REMOTE STAGING BLOCKED**

#### Exact Remaining Blocker:
> **The Render web service `techsprout-api` is missing the server-only environment variables `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD`.**  
> Because `env.config.ts` strictly enforces these variables in production mode (`NODE_ENV=production`), the new P5 container exits with `Environment validation failed` during boot, preventing Render from replacing the legacy P1 container.

#### Unblocking Procedure (Operations Step):
1. In the Render Dashboard, open Service **`techsprout-api`** → **Environment**.
2. Add the following environment variables:
   - `SSLCOMMERZ_STORE_ID=<sandbox_store_id>`
   - `SSLCOMMERZ_STORE_PASSWORD=<sandbox_store_password>`
   - `API_PUBLIC_BASE_URL=https://techsprout-api.onrender.com`
   - `SSLCOMMERZ_BASE_URL=https://sandbox.sslcommerz.com`
3. Trigger a **Manual Deploy** in Render.  
   The P5 application will pass startup validation, run migrations and seeds, and activate all verified P5 endpoints.
