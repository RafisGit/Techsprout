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
    preDeployCommand: pnpm --filter @techsprout/api db:migrate && pnpm --filter @techsprout/api db:seed
    startCommand: node apps/api/dist/main.js
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
   ✓ src/test/http-e2e.spec.ts (11 tests)
   ✓ src/test/security.spec.ts (18 tests)

   Test Files: 3 passed (3)
   Tests:      35 passed (35)
   Exit Code: 0 (Zero errors)
   ```
6. **Production Runtime Hardening**:
   - Explicitly patched `apps/api/src/modules/identity/identity.service.ts` to reject mock Google OAuth codes when `NODE_ENV === 'production'`.
   - Committed and pushed to `origin feat/p1-foundation-security` (commit `771a96f`).

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

### Part C: Live Render & Vercel Verification — BLOCKED / PENDING EXTERNAL DEPLOYMENT

Per requirements 18 and 19:
> *"Do not report PASS based only on local tests. Clearly separate: A. LOCAL VERIFICATION, B. LIVE RENDER VERIFICATION, C. LIVE VERCEL → RENDER VERIFICATION. If any live verification cannot be performed because credentials, Render access, Vercel access, or external configuration is unavailable, explicitly mark it BLOCKED/PENDING rather than PASS."*

1. **Render Cloud Access**:
   The automated agent does not have access to the user's private Render session credentials. The browser session at `https://dashboard.render.com` requires user login.
2. **Pending Actions to Complete Live Cloud Verification**:
   - **Step 1**: The user navigates to [Render Blueprints](https://dashboard.render.com/blueprints).
   - **Step 2**: Select repository `RafisGit/Techsprout`, branch `feat/p1-foundation-security`, blueprint `render.yaml`.
   - **Step 3**: Verify that `techsprout-api`, `techsprout-postgres`, and `techsprout-redis` all indicate **FREE** tier (zero credit card requested).
   - **Step 4**: Click **Apply Blueprint**.
   - **Step 5**: Once `techsprout-api` finishes provisioning, obtain its live HTTPS URL (e.g. `https://techsprout-api-xxxx.onrender.com`).
   - **Step 6**: Provide the live Render URL or configure it in Vercel:
     ```
     NEXT_PUBLIC_API_URL=https://<ACTUAL-RENDER-API-URL>
     ```
   - **Step 7**: Redeploy the Vercel Preview and run the live end-to-end health, BullMQ, database, and auth verification against the live Render API.

---

## 5. Free-Tier Operational Limitations & Boundaries

> [!WARNING]
> This infrastructure is exclusively intended for **P1 testing, staging, and feature verification**. It is NOT approved for real production LMS traffic.
> - **Render Free PostgreSQL**: 1 GB storage limit, expires automatically after 30 days, no automated backups.
> - **Render Free Key Value**: In-memory instance (25 MB) without disk persistence; queue state may reset on restart.
> - **Render Free Web Service**: Spins down on 15 minutes of inactivity; initial inbound requests may experience a 30–50 second cold-start latency.

---

## 6. Exact P1 Gate Status

**P1 LIVE VERIFICATION — BLOCKED**

*(Local verification is 100% PASS with all 35 tests, builds, and lint passing. Live cloud verification is BLOCKED solely pending the manual user trigger of "Apply Blueprint" in Render Dashboard and configuration of the resulting live URL in Vercel).*
