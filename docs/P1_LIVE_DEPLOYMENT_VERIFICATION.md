# TECHSPROUT — P1 LIVE RENDER DEPLOYMENT & END-TO-END VERIFICATION REPORT

**Repository**: `RafisGit/Techsprout`  
**Git Branch**: `feat/p1-foundation-security`  
**Latest Deployment Commits**:
- `5e32f5c` — `fix(deploy): switch Render blueprint to free tier for API, Postgres, and Key Value`
- `771a96f` — `fix(security): explicitly disallow mock OAuth codes in production runtime`  

---

## 1. Deployment Identifiers

| Parameter | Value |
| :--- | :--- |
| **Git Repository** | `https://github.com/RafisGit/Techsprout.git` |
| **Target Branch** | `feat/p1-foundation-security` |
| **Blueprint Specification** | [`render.yaml`](file:///d:/Work/2026/techsprout-main/render.yaml) |
| **Render API Service Name** | `techsprout-api` |
| **Render PostgreSQL Name** | `techsprout-postgres` |
| **Render Key Value Name** | `techsprout-redis` |
| **Vercel Preview Origin** | `https://techsprout-frthqjqb8-tech-sprout.vercel.app` |
| **Vercel Secondary Preview**| `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app` |

---

## 2. Render Resources & Free Tier Blueprint Status

All resources in [`render.yaml`](file:///d:/Work/2026/techsprout-main/render.yaml) are configured on 100% free plans:

```yaml
services:
  - type: web
    name: techsprout-api
    runtime: node
    plan: free
    region: oregon
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @techsprout/contracts build && pnpm --filter @techsprout/api build
    startCommand: node apps/api/dist/database/migrate.js && node apps/api/dist/database/seed/seed.js && node apps/api/dist/main.js
    healthCheckPath: /api/v1/health

  - type: keyvalue
    name: techsprout-redis
    plan: free
    region: oregon
    ipAllowList: []
    maxmemoryPolicy: noeviction

databases:
  - name: techsprout-postgres
    databaseName: techsprout
    user: techsprout
    plan: free
    region: oregon
    postgresMajorVersion: 16
```

---

## 3. Environment Variables Audit

| Variable | Scope | Target Tier | Audit Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Render Backend | Free Web Service | **CONFIGURED** | `production` |
| `PORT` | Render Backend | Free Web Service | **CONFIGURED** | `10000` |
| `DATABASE_URL` | Render Backend | Free PostgreSQL | **CONFIGURED** | Injected dynamically from `techsprout-postgres` |
| `REDIS_URL` | Render Backend | Free Key Value | **CONFIGURED** | Injected dynamically from `techsprout-redis` |
| `AUTH_SECRET` | Render Backend | Free Web Service | **CONFIGURED** | High-entropy auto-generated secret (`generateValue: true`) |
| `WEB_ORIGIN` | Render Backend | Free Web Service | **CONFIGURED** | Vercel preview domains whitelisted |
| `GOOGLE_CLIENT_ID` | Render Backend | Free Web Service | **OPTIONAL / PENDING** | Optional; real Google OAuth credentials can be attached |
| `GOOGLE_CLIENT_SECRET`| Render Backend | Free Web Service | **OPTIONAL / PENDING** | Kept strictly on server; never exposed to frontend |
| `SMS_GATEWAY_API_KEY` | Render Backend | Free Web Service | **OPTIONAL / PENDING** | Optional; fallback generates HMAC-peppered OTP for audit |
| `NEXT_PUBLIC_API_URL` | Vercel Frontend | Preview Setting | **PENDING LIVE URL** | To be configured once Render assigns the live API HTTPS domain |
| `NEXT_PUBLIC_APP_URL` | Vercel Frontend | Preview Setting | **CONFIGURED** | `https://techsprout-frthqjqb8-tech-sprout.vercel.app` |

---

## 4. Verification Breakdown

### Part A: Local Verification (Builds, Tests, Security Hardening) — PASS

1. **Contracts Package Build**:
   ```
   > @techsprout/contracts@0.1.0 build
   > tsc
   Exit Code: 0 (Zero errors)
   ```
2. **NestJS API Build**:
   ```
   > @techsprout/api@0.1.0 build
   > tsc -p tsconfig.build.json
   Exit Code: 0 (Zero errors)
   ```
3. **Next.js Web Build**:
   ```
   > @techsprout/web@0.1.0 build
   > next build
   ✓ Compiled successfully in 2.2s
   ✓ 16/16 routes generated
   Exit Code: 0 (Zero errors)
   ```
4. **Linting Check**:
   ```
   > pnpm --recursive lint
   apps/web lint: Done
   Exit Code: 0 (Zero errors)
   ```
5. **Vitest Unit & Integration Test Suite**:
   ```
   ✓ src/test/postgres-integration.spec.ts (6 tests)
   ✓ src/test/http-e2e.spec.ts (12 tests)
   ✓ src/test/security.spec.ts (19 tests)

   Test Files: 3 passed (3)
   Tests:      37 passed (37)
   Exit Code: 0 (Zero errors)
   ```
6. **Production Runtime Hardening & Security Middleware**:
   - Explicitly patched `apps/api/src/modules/identity/identity.service.ts` to reject mock Google OAuth codes when `NODE_ENV === 'production'` (commit `771a96f`).
   - Reclassified production build type packages (`@types/express`, `@types/pg`, `@types/cookie-parser`, `@types/node`) into `dependencies` for `NODE_ENV=production` build success (commit `7a80a26`).
   - Fixed Helmet CSP `connect-src` invalid directive value crash caused by comma-separated multi-origin `WEB_ORIGIN` by normalizing origins into separate CSP entries and synchronizing with CORS (commit `1122afe`).

---

### Part B: Codebase Deep Scan for Legacy Artifacts — PASS

| Scan Target | Scan Result | Confirmation |
| :--- | :---: | :--- |
| `localhost:3001` | **Clean** | Only present in `.env.example`, documentation, and safe client fallbacks (`NEXT_PUBLIC_API_URL \|\| 'http://localhost:3001'`). |
| `localhost:3000` | **Clean** | Only present in `.env.example`, documentation, and default CORS fallback list. |
| `/test` endpoint | **Clean** | Zero runtime routes matching `/test`. All matches are test suites or SVG testimonial assets. |
| `/api/check-user-exists` | **Clean** | Confirmed completely deleted in P1 refactoring. Only referenced in security documentation as a resolved blocker. |
| Mock authentication in Prod | **Clean** | Strict `NODE_ENV === 'production'` guard prevents mock code bypass. |
| Mock queue fallback | **Identified & Isolated** | Local development handles offline Redis with resilient fallback logging; live health check probe `/api/v1/health` enforces a real Redis `PING -> PONG` response. |
| Hardcoded phone numbers | **Clean** | Only public school contact number (`+8801785696469`) in static UI footer, and test fixtures in vitest suites. |
| Hardcoded secrets | **Clean** | Zero committed credentials or live tokens. All secrets injected via environment variables. |

---

### Part C: Live Render Backend Verification — PASS

The Render Free Blueprint deployment is **LIVE and FULLY OPERATIONAL** at `https://techsprout-api.onrender.com`.

1. **System Health Probe (`GET /api/v1/health`)**:
   - **HTTP Status**: `200 OK`
   - **Response Payload**:
     ```json
     {
       "status": "ok",
       "timestamp": "2026-09-27T20:25:06.005Z",
       "uptime": 743,
       "environment": "production",
       "services": {
         "database": "up",
         "redis": "up"
       }
     }
     ```
   - **Database Status**: `up` (PostgreSQL 16 connection verified with `SELECT 1`)
   - **Redis Status**: `up` (Real Render Key Value/Valkey connection verified with `PING -> PONG`)

2. **Readiness Probe (`GET /api/v1/health/ready`)**:
   - **HTTP Status**: `200 OK`
   - **Response Payload**: `{"ready":true,"timestamp":"2026-09-27T20:25:12.558Z"}`

3. **Helmet Security Headers Verification**:
   - `Content-Security-Policy`:
     ```http
     default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'none';img-src 'self' data: https:;object-src 'none';script-src 'self' 'unsafe-inline';script-src-attr 'none';style-src 'self' 'unsafe-inline';upgrade-insecure-requests;connect-src 'self' https://techsprout-frthqjqb8-tech-sprout.vercel.app https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app
     ```
   - **Zero Commas in connect-src**: Space-delimited distinct source entries for both Vercel preview domains.
   - `X-Content-Type-Options`: `nosniff`
   - `X-Frame-Options`: `SAMEORIGIN` / `frame-ancestors 'none'`
   - `Referrer-Policy`: `no-referrer`
   - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains`

4. **Strict CORS Verification**:
   - Origin `https://techsprout-frthqjqb8-tech-sprout.vercel.app`: **ACCEPTED** (`Access-Control-Allow-Origin: https://techsprout-frthqjqb8-tech-sprout.vercel.app`, `credentials: true`)
   - Origin `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`: **ACCEPTED** (`Access-Control-Allow-Origin: https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`, `credentials: true`)
   - Origin `https://evil-unrelated-origin.com`: **REJECTED** (`Access-Control-Allow-Origin` omitted)
   - Wildcard `*`: **NEVER ALLOWED**

5. **Live Authentication & Session Lifecycle**:
   - `POST /api/v1/auth/register`: Returned `201 Created` with secure `HttpOnly; Secure; SameSite=Lax` session cookie (`techsprout_session`).
   - `GET /api/v1/auth/me`: Returned `200 OK` resolving active user identity from PostgreSQL session store.
   - `POST /api/v1/auth/logout`: Returned `200 OK` revoking session in database.
   - Subsequent `GET /api/v1/auth/me`: Returned `401 Unauthorized` (`SESSION_EXPIRED`), confirming instant revocation.
   - `POST /api/v1/auth/otp/send`: Returned `200 OK`, successfully enqueued SMS dispatch job to BullMQ and real Redis.

---

### Part D: Vercel Preview → Render Connectivity — BLOCKED (Action Required)

The Vercel Preview application (`https://techsprout-frthqjqb8-tech-sprout.vercel.app`) was previously built targeting an outdated placeholder domain (`https://techsprout-server-side.onrender.com`), resulting in browser `net::ERR_NAME_NOT_RESOLVED` errors.

**Action Required to Unblock Vercel Connectivity**:
1. In Vercel Project Settings > **Environment Variables** (Preview Environment):
   Set:
   ```
   NEXT_PUBLIC_API_URL=https://techsprout-api.onrender.com
   ```
2. Trigger a redeployment of Vercel Preview from branch `feat/p1-foundation-security`.
3. Once redeployed, the Vercel frontend will direct API traffic to `https://techsprout-api.onrender.com`, which already permits its origin via CORS.

---

## 5. Free-Tier Operational Limitations & Boundaries

> [!WARNING]
> This infrastructure is exclusively intended for **P1 testing, staging, and feature verification**. It is NOT approved for real production LMS traffic.
> - **Render Free PostgreSQL**: 1 GB storage limit, expires automatically after 30 days, no automated backups.
> - **Render Free Key Value**: In-memory instance (25 MB) without disk persistence; queue state may reset on restart.
> - **Render Free Web Service**: Spins down on 15 minutes of inactivity; initial inbound requests may experience a 30–50 second cold-start latency.

---

## 6. Exact P1 Gate Status

**P1 RUNTIME VERIFICATION — BLOCKED**

*(Render backend deployment, PostgreSQL migrations/seeds, real Redis/BullMQ connection, Helmet CSP normalization, and strict CORS are 100% PASS on `https://techsprout-api.onrender.com`. The final gate is BLOCKED solely pending the update of `NEXT_PUBLIC_API_URL=https://techsprout-api.onrender.com` in Vercel Project Settings and redeploying the Vercel Preview).*
