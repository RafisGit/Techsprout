# TECHSPROUT LMS — PRODUCTION LAUNCH BACKLOG

**Version:** 2.2.2 (Reconciled Production Master)  
**Initial Date:** November 4, 2026  
**Revision Date:** November 5, 2026  
**Status:** Approved for Implementation Planning (DOCUMENTATION ONLY — No Implementation Authorized)  
**Target Release:** Production Launch 1.0.0  

---

## Document Revision & Correction History

| Version | Date | Author | Description of Changes |
| :---: | :---: | :---: | :--- |
| **1.0.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Initial prioritized launch backlog across P0–P3. |
| **2.0.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Elevated direct signed upload to P0; added 24-point checklist coverage; preliminary cost reconciliations. |
| **2.1.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Reconciled connection pool allocation to `max: 8`; updated model recommendations and domain costs. |
| **2.2.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Formulated totals for Configurations A ($63.06/mo), B ($50.06/mo), and C ($0/mo); modeled thinking tokens; clarified staging DB expiration. |
| **2.2.1** | 2026-11-05 | Antigravity Senior Staff Auditor | Replaced live payment references with SSLCommerz sandbox IPN verification; restored logging, source map security, and SEO metadata. |
| **2.2.2** | 2026-11-05 | Antigravity Senior Staff Auditor | **Final Numerical & Reliability Correction (v2.2.2):**<br>1. **P0 Estimate Sum Reconciliation:** Reconciled summary and table totals to the exact row-level sum of the 18 P0 work packages: **56.5h – 104.0h, expected 79.5h (9.94 work days)**. Reconciled Monorepo Total across all 30 tasks: **97.5h – 175.5h, expected 135.0h (16.88 work days)**.<br>2. **AI Fallback & Concurrency Architecture:** Removed invalid aggregate `FOR UPDATE` proposal; designed atomic PostgreSQL reservations using dedicated `ai_daily_budgets` row locking and transactional advisory locks (`pg_advisory_xact_lock`) under `READ COMMITTED` isolation with `UNIQUE(request_id)`.<br>3. **AI Outage & Crash Resilience:** Analyzed volatile Node memory buffer crashes; established Redis persistence (AOF / stream) as the durable operational ledger; mandated fail-closed behavior when safe accounting cannot be maintained.<br>4. **AI Provider Timeout Handling:** Replaced immediate reservation release on timeout with `UNKNOWN` / `RECONCILIATION_PENDING` status to prevent financial leakage from backend-generated tokens; defined conservative settlement procedures.<br>5. **Dynamic Reservation Calculation:** Reconciled $0.001 with $0.05 cap; formulated dynamic calculation based on bounded prompt tokens, configured max output/thinking tokens, and model rates; documented max possible concurrent overshoot ($0.0325).<br>6. **Client Disconnect Lifecycle & Missing Metadata:** Verified Node/NestJS socket event `res.on('close')`; established conservative token accounting when upstream stream aborts without emitting trailing `usage_metadata`.<br>7. **PostgreSQL Connection Model:** Clarified distinctions between `max_connections` (100), `superuser_reserved_connections` (3), `client_usable_connections` (97), steady-state allocation (25), rolling deployment overlap (41), and remaining headroom (72 steady / 56 deploy); verified Render plan dependencies; distinguished 50-VUser load test as a performance validation target rather than verified production capacity. |

---

## 1. Complete Production Audit Finding Traceability Matrix

Every technical deficiency and risk identified during the comprehensive Production Launch Audit is mapped directly to a prioritized P0 work package, target implementation files, and verifiable acceptance criteria:

| Audit Finding ID | Audit Finding & Risk Summary | Priority | Work Package ID | Primary Target Implementation Files | Measurable Acceptance Criteria Summary |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **AUD-MEDIA-01** | Admin `MediaUploader.tsx` lacks drag-and-drop event handlers; dropping files triggers browser navigation and form state data loss. | **P0** | `P0-MEDIA-01` | `apps/web/src/components/admin/MediaUploader.tsx` | Drag-over visual feedback; `e.preventDefault()`; dropped files pass directly to MIME validation without page navigation. |
| **AUD-MEDIA-02** | 50MB–100MB video payloads proxied through NestJS trigger Node.js memory bloat and OOM crashes on Render Starter (512MB RAM). | **P0** | `P0-MEDIA-02` | `apps/web/src/lib/api/catalog.ts`, `apps/api/src/modules/media` | Direct signed client-to-Cloudinary upload via Axios; animated progress bar (0–100%); abort controller cancel button; zero backend video buffering. |
| **AUD-MEDIA-03** | Course and lesson deletions leave orphaned binary assets permanently on Cloudinary, causing uncontrolled cloud storage bloat. | **P0** | `P0-MEDIA-03` | `apps/api/src/modules/courses`, `apps/api/src/modules/lessons` | Asynchronous cascade deletion; confirms zero remaining entity references before issuing `CloudinaryService.destroy()`; database rows purged. |
| **AUD-AUTH-01** | Zero password reset endpoints, tokens, or UI pages exist, locking out users who forget their credentials. | **P0** | `P0-AUTH-01` | `apps/api/src/modules/identity`, `apps/web/src/app/(auth)` | Database `password_reset_tokens` table; 15-min expiry; constant-time response (anti-enumeration); scrypt password rehash; session invalidation. |
| **AUD-AUTH-02** | User accounts remain unverified indefinitely (`users.isVerified = false`), reducing email deliverability and account authenticity. | **P0** | `P0-AUTH-02` | `apps/api/src/modules/identity`, `apps/web/src/app/(auth)` | `email_verification_tokens` table; automated confirmation email on signup; token validation endpoint; dashboard unverified reminder banner. |
| **AUD-EMAIL-01** | Unverified custom email domain causes automatic spam filtering; free Resend plan has strict 100 emails/day dispatch ceiling. | **P0** | `P0-EMAIL-01` | `apps/api/src/modules/notifications`, Cloudflare DNS | SPF, DKIM (3 CNAMEs), and DMARC TXT records verified on Cloudflare DNS; `RESEND_FROM_EMAIL=notifications@techsprout.edu.bd`. |
| **AUD-AI-01** | Hardcoded deprecated `gemini-1.5-flash` model; unmetered AI spending risk; dynamic thinking tokens unaccounted; single-point-of-failure in budget tracking. | **P0** | `P0-AI-01` | `apps/api/src/modules/learning`, `ai_daily_budgets`, Redis | Parameterized model (`gemini-3.1-flash-lite`); atomic Redis reservations via Lua; dedicated Postgres `ai_daily_budgets` row locking fallback; bounded in-memory buffer with fail-closed behavior; timeout `UNKNOWN` handling; dynamic reservation math; disconnect conservative accounting. |
| **AUD-DB-01** | Unbounded connection wait times (`connectionTimeoutMillis: 0`); temporary free staging DB with 30-day expiration; production capacity unprovisioned. | **P0** | `P0-DB-01` | `apps/api/src/database/drizzle.provider.ts`, `env.config.ts` | Pool configured for 25 steady-state client connections, accommodating 41 connections during rolling deployment overlap on 97 client-usable connection limit (56 deploy headroom); 5s acquire timeout; 10s statement timeout; 50-VUser concurrency load test targets validated. |
| **AUD-PAY-01** | Checkout relies on sandbox credentials; lack of robust IPN signature verification, transaction idempotency, and duplicate notification protection. | **P0** | `P0-PAY-01` | `apps/api/src/modules/payments/sslcommerz.service.ts` | Sandbox IPN verification; MD5 signature validation; server-to-server validation call; idempotent transaction uniqueness constraint; enrollment strictly after payment. Zero live credentials. |
| **AUD-LEGAL-01** | Missing standalone Refund Policy page and mandatory Bangladesh registered merchant disclosures required by SSLCommerz. | **P0** | `P0-LEGAL-01` | `apps/web/src/app/refund-policy`, `Footer.tsx` | Standalone `/refund-policy` page; Bangladesh registered physical office address, support phone/email, Trade License/BIN notice, and BDT currency notice in footer. |
| **AUD-SENTRY-01**| Next.js build wrapper missing, causing unmapped production stack traces; lack of source map security; API telemetry lacks PII redaction. | **P0** | `P0-SENTRY-01` | `apps/web/next.config.ts`, `apps/api/src/common/observability` | Next.js build wrapped with `withSentryConfig`; source maps uploaded to Sentry and hidden from public client bundles; `beforeSend` scrubs passwords, tokens, cards, and OTPs. |
| **AUD-OPS-03** | Unstructured `console.log` statements in API hinder production observability and risk leaking sensitive parameters. | **P0** | `P0-OPS-03` | `apps/api/src/common/logger`, NestJS Logger | Structured JSON logging (Pino/Winston); distributed correlation IDs (`x-correlation-id`); log levels (`error`, `warn`, `info`, `debug`); automated PII masking. |
| **AUD-SEO-01** | Default Vercel/Next favicon; missing metadata, canonical URLs, and dynamic Open Graph social preview cards across public pages. | **P0** | `P0-SEO-01` | `apps/web/public/favicon.ico`, `apps/web/src/app/**` | Custom TechSprout branding and favicons; dynamic Open Graph / Twitter Card tags; meta titles, descriptions, and canonical links on all public routes. |
| **AUD-BRAND-01**| Homepage and blogs display external agency "Webtricker Web and Design Solution" testimonials and generic mock data. | **P0** | `P0-BRAND-01` | `apps/web/src/lib/mockData`, homepage components | Zero references to Webtricker; authentic localized TechSprout course testimonials; realistic statistics; localized FAQ answers. |
| **AUD-SEC-02** | Hardcoded `http://localhost:3000` and `localhost:3001` in production CORS configuration expose API to local browser hijacking. | **P0** | `P0-SEC-02` | `apps/api/src/main.ts`, `apps/web/src/lib/api/axios.ts` | Strict CORS origin whitelist driven by `CORS_ALLOWED_ORIGINS` in production; localhost strictly rejected in production; preview regex for staging. |
| **AUD-TEST-01** | No automated end-to-end regression test covers the full student lifecycle from registration through payment and lesson access. | **P0** | `P0-TEST-01` | Automated Playwright / Vitest E2E Suite | Automated signup -> email verification -> cart checkout -> sandbox IPN simulation -> database enrollment validation -> lesson stream unlock. |
| **AUD-SEC-03** | Lack of automated security test suite to detect token enumeration, timing attacks, replay attacks, or role privilege escalation. | **P0** | `P0-SEC-03` | `apps/api/src/test/security-regression.spec.ts` | Automated security tests for constant-time email lookups, token replay rejection, expired token rejection, and strict RBAC enforcement (`STUDENT` cannot access admin APIs). |
| **AUD-OPS-02** | Disaster recovery readiness requires verified database backup, SHA-256 manifest integrity, and clean container restoration. | **P0** | `P0-OPS-02` | `scripts/ops/backup-postgres.ps1`, `restore-postgres-local.ps1` | P12 verified scripts generate valid backup, confirm SHA-256 manifest checksum, and restore into clean PostgreSQL container with zero data loss. |

---

## 2. Complete 24-Point Production Checklist Coverage Matrix

Every item required for full production launch is explicitly mapped to a backlog task with complete acceptance criteria:

| # | Checklist Item | Priority | Explicit Task ID | Target Module / Area | Required Business Approval |
| :-: | :--- | :---: | :--- | :--- | :--- |
| **1** | **Error Monitoring & Source Map Security** | **P0** | `P0-SENTRY-01` | `apps/web/next.config.ts`, `apps/api/src/common/observability` | — |
| **2** | **Durable AI Spending Limits & Fault Resilience** | **P0** | `P0-AI-01` | `apps/api/src/modules/learning`, Redis | **Senior Owner ($5/day budget unapproved)** |
| **3** | **Custom Favicon & SEO Metadata** | **P0** | `P0-SEO-01` | `apps/web/public/favicon.ico`, `layout.tsx`, page routes | — |
| **4** | **Production Structured Logging & Console Cleanup**| **P0** | `P0-OPS-03` | `apps/api/src/common/logger`, API interceptors | — |
| **5** | **Custom Email Sender Domain (DNS)** | **P0** | `P0-EMAIL-01` | Resend API, Cloudflare DNS (SPF, DKIM, DMARC) | Domain Owner / Technical Lead |
| **6** | **Social Preview Images (Open Graph / Twitter)** | **P0** | `P0-SEO-01` | `apps/web/src/app`, Open Graph metadata | — |
| **7** | **SSLCommerz Sandbox IPN Verification** | **P0** | `P0-PAY-01` | `apps/api/src/modules/payments`, SSLCommerz Sandbox | **Managing Director / KYC (for live Day-2)** |
| **8** | **Uptime Alerts & Synthetic Monitoring** | **P1** | `P1-OPS-01` | External Synthetic Monitor (BetterStack/UptimeRobot)| — |
| **9** | **Password Reset Workflow** | **P0** | `P0-AUTH-01` | `apps/api/src/modules/identity`, `apps/web/src/app` | — |
| **10**| **Email Verification Workflow** | **P0** | `P0-AUTH-02` | `apps/api/src/modules/identity`, `apps/web/src/app` | — |
| **11**| **Connection Pooling & Concurrency Load Testing** | **P0** | `P0-DB-01` | `apps/api/src/database/drizzle.provider.ts` | — |
| **12**| **Metadata & Canonical Tags on All Public Pages** | **P0** | `P0-SEO-01` | `apps/web/src/app/**/page.tsx` | — |
| **13**| **Production Localhost URL Removal & CORS** | **P0** | `P0-SEC-02` | `apps/api/src/main.ts`, `apps/web/src/lib/api` | — |
| **14**| **Signup-to-Paid E2E Testing with Sandbox IPN** | **P0** | `P0-TEST-01` | Automated Playwright / Vitest E2E Suite | — |
| **15**| **Safe Test-Data Cleanup Script** | **P1** | `P1-DB-02` | `scripts/db/clean-seed-data.ts` | **Database Administrator** |
| **16**| **Signup and Activation Analytics**| **P1** | `P1-ANALYTICS-01`| `apps/api/src/modules/telemetry`, `admin/analytics`| — |
| **17**| **Lorem Ipsum & Mock-Data Removal (Webtricker)**| **P0** | `P0-BRAND-01` | `apps/web/src/lib/mockData`, homepage components | — |
| **18**| **Server-Enforced Feature Flags & Kill Switches** | **P1** | `P1-FLAGS-01` | `apps/api/src/modules/system/feature-flags` | — |
| **19**| **Admin Image Uploads & Drag-and-Drop Fix** | **P0** | `P0-MEDIA-01` | `apps/web/src/components/admin/MediaUploader.tsx` | — |
| **20**| **Direct Signed Video Uploads & Progress Bar** | **P0** | `P0-MEDIA-02` | Direct Signed Cloudinary Upload Workflow | — |
| **21**| **Cascade Cleanup of Orphaned Media Assets** | **P0** | `P0-MEDIA-03` | Cascade Cleanup, `CloudinaryService.destroy()` | — |
| **22**| **Security Testing Suite (RBAC, Replay, Anti-Enum)**| **P0** | `P0-SEC-03` | Automated Auth & Security Test Harness | — |
| **23**| **Backup & Disaster Recovery Verification** | **P0** | `P0-OPS-02` | P12 Verified Scripts (`backup-postgres.ps1`) | — |
| **24**| **Legal & Operational Readiness (Refunds / Disclosures)**| **P0** | `P0-LEGAL-01` | `/refund-policy`, SSLCommerz Disclosures | Legal / Managing Director |

---

## 3. Reconciled Workload & Timeline Summary

Estimates have been re-evaluated with explicit **Lower-Bound** (optimistic / experienced dev), **Upper-Bound** (including edge cases, unexpected test regressions, and multi-browser testing), and **Median/Expected** engineering effort.

The row-level estimates across all 18 P0 work packages have been independently recalculated, totaling:

$$\text{P0 Total Engineering Effort} = \mathbf{79.5\text{ Hours (9.94 Work Days)}}\quad [\text{Range: } 56.5\text{h} - 104.0\text{h}]$$

$$\text{Monorepo Total Engineering Workload} = \mathbf{135.0\text{ Hours (16.88 Work Days)}}\quad [\text{Range: } 97.5\text{h} - 175.5\text{h}]$$

| Priority Tier | Task Count | Lower Bound (Hours / Days) | Upper Bound (Hours / Days) | Expected Median (Hours / Days) |
| :--- | :---: | :---: | :---: | :---: |
| **P0 — Critical Launch Blockers** | 18 | 56.5 Hours (7.06 Days) | 104.0 Hours (13.00 Days) | **79.5 Hours (9.94 Days)** |
| **P1 — Launch Baseline Polish** | 5 | 11.5 Hours (1.44 Days) | 21.5 Hours (2.69 Days) | **16.0 Hours (2.00 Days)** |
| **P2 — Post-Launch Polish** | 4 | 10.5 Hours (1.31 Days) | 18.0 Hours (2.25 Days) | **14.0 Hours (1.75 Days)** |
| **P3 — Future Scale Roadmap** | 3 | 19.0 Hours (2.38 Days) | 32.0 Hours (4.00 Days) | **25.5 Hours (3.19 Days)** |
| **Total Engineering Workload** | **30 Tasks** | **97.5 Hours (12.19 Days)** | **175.5 Hours (21.94 Days)**| **135.0 Hours (16.88 Days)** |

---

## 4. Priority P0: Critical Launch Blockers (Must-Have Before Release)

---

### Task ID: P0-MEDIA-01 — Fix Admin MediaUploader Drag-and-Drop & Type Validation
- **Severity:** High (Data Loss & Form Interruption)
- **Estimates:** Lower Bound: 2.0h | Upper Bound: 4.0h | **Expected: 3.0h (0.375 Days)**
- **Target Files:**
  - `apps/web/src/components/admin/MediaUploader.tsx`
  - `apps/web/src/__tests__/admin-catalog.spec.ts`
- **Dependencies:** None
- **Problem Statement:**
  `MediaUploader.tsx` displays visual instructions asking users to drag and drop files, but lacks `onDragOver`, `onDragEnter`, `onDragLeave`, and `onDrop` event listeners. Dropping a file triggers the browser's default open/download action, immediately navigating away from the page and losing all entered course/lesson form data.
- **Acceptance Criteria:**
  1. Outer drop zone attaches `onDragOver`, `onDragEnter`, `onDragLeave`, and `onDrop` with `e.preventDefault()` and `e.stopPropagation()`.
  2. Visual active drag state (`border-primary bg-primary/10`) is activated during drag-over.
  3. Dropping an image or video file passes `e.dataTransfer.files[0]` directly into client-side MIME and size validation without triggering browser file navigation.
  4. Form state and previously entered inputs remain completely intact.
  5. Vitest unit tests in `admin-catalog.spec.ts` simulate drag-over and drop events, confirming zero unhandled page navigations.

---

### Task ID: P0-MEDIA-02 — Direct Client-to-Cloudinary Signed Video Upload & Progress Bar
- **Severity:** Critical (Server Memory Exhaustion / OOM Crashes)
- **Estimates:** Lower Bound: 4.0h | Upper Bound: 7.0h | **Expected: 5.5h (0.69 Days)**
- **Target Files:**
  - `apps/web/src/components/admin/MediaUploader.tsx`
  - `apps/web/src/lib/api/catalog.ts`
  - `apps/api/src/modules/media/media.controller.ts`
  - `apps/api/src/modules/media/cloudinary/cloudinary.service.ts`
- **Dependencies:** Cloudinary API Credentials (`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- **Problem Statement:**
  Currently, `uploadVideoMedia()` in `apps/web/src/lib/api/catalog.ts` routes 50MB–100MB video payloads directly through the NestJS backend. Node.js buffers this multipart binary data in RAM, which will trigger Out-Of-Memory (OOM) process termination on Render Starter (512MB RAM). Furthermore, admins see only an indefinite spinning loader with no progress percentage or cancellation control.
- **Acceptance Criteria:**
  1. Frontend requests upload signature from `POST /api/v1/media/signature` with `{ folder: 'techsprout/videos/lessons', resourceType: 'video', expectedBytes }`.
  2. Browser uploads binary directly to `https://api.cloudinary.com/v1_1/<cloud_name>/video/upload` via Axios/XHR.
  3. Axios hooks into `onUploadProgress` to drive an animated Tailwind progress bar showing exact percentage (`0%` to `100%`) and loaded MB.
  4. Red "Cancel" button triggers `AbortController.abort()`, cleanly aborting network transmission.
  5. Upon Cloudinary upload completion, frontend calls `POST /api/v1/media/confirm` to verify and record the asset in the `media` table.
  6. NestJS backend memory usage remains flat during 100MB video uploads.

---

### Task ID: P0-MEDIA-03 — Cascade Cleanup of Orphaned Cloudinary Media Assets
- **Severity:** High (Storage Bloat & Financial Leakage)
- **Estimates:** Lower Bound: 3.0h | Upper Bound: 6.0h | **Expected: 4.5h (0.56 Days)**
- **Target Files:**
  - `apps/api/src/modules/courses/courses.service.ts`
  - `apps/api/src/modules/lessons/lessons.service.ts`
  - `apps/api/src/modules/media/media.service.ts`
  - `apps/api/src/database/schema/media.ts`
- **Dependencies:** None
- **Problem Statement:**
  Deleting a course or lesson deletes database rows or sets FK to `NULL`, but never calls `CloudinaryService.destroy()`. Assets remain stored on Cloudinary permanently, exhausting account credits.
- **Acceptance Criteria:**
  1. `CoursesService.delete()` checks for `thumbnailMediaId` and issues deletion intent.
  2. `LessonsService.delete()` checks for attached `mediaId` and issues deletion intent.
  3. Deletion logic confirms zero other active entities reference the target `storageKey` before issuing `CloudinaryService.destroy()`.
  4. Assets marked for deletion are processed asynchronously or cleanly unlinked, and `media` database rows are purged.
  5. Integration tests verify that deleting a lesson with a mock Cloudinary asset successfully triggers `cloudinaryClient.uploader.destroy()`.

---

### Task ID: P0-AUTH-01 — Complete Password Reset Workflow
- **Severity:** Critical (User Account Lockout)
- **Estimates:** Lower Bound: 5.0h | Upper Bound: 8.0h | **Expected: 6.5h (0.81 Days)**
- **Target Files:**
  - `apps/api/src/database/schema/users.ts` (new table `password_reset_tokens`)
  - `apps/api/src/modules/identity/identity.controller.ts`
  - `apps/api/src/modules/identity/identity.service.ts`
  - `apps/api/src/modules/notifications/templates/email-templates.ts`
  - `apps/web/src/app/(authentication)/forgot-password/page.tsx`
  - `apps/web/src/app/(authentication)/reset-password/page.tsx`
- **Dependencies:** Resend Email Provider (`P0-EMAIL-01`)
- **Problem Statement:**
  Zero password reset endpoints or UI pages exist. Forgotten passwords require direct database intervention.
- **Acceptance Criteria:**
  1. Database migration creates `password_reset_tokens` (`id`, `user_id`, `token_hash`, `expires_at`, `used_at`).
  2. `POST /api/v1/auth/forgot-password` generates high-entropy token, stores SHA-256 hash, and dispatches reset email with 15-minute expiration. Returns generic success to prevent email enumeration.
  3. `POST /api/v1/auth/reset-password` validates token hash, verifies `expires_at`, hashes new password with scrypt salt, marks token used, and invalidates all active user sessions.
  4. Resend email template `passwordReset` renders responsive reset button.
  5. Frontend pages for requesting reset and submitting new password are fully wired with client validation.
  6. Unit and integration tests verify token expiry, invalid token rejection, and replay prevention.

---

### Task ID: P0-AUTH-02 — Email Verification for New Registrations
- **Severity:** High (Deliverability & User Authenticity)
- **Estimates:** Lower Bound: 3.0h | Upper Bound: 6.0h | **Expected: 4.5h (0.56 Days)**
- **Target Files:**
  - `apps/api/src/database/schema/users.ts` (table `email_verification_tokens`)
  - `apps/api/src/modules/identity/identity.controller.ts`
  - `apps/api/src/modules/identity/identity.service.ts`
  - `apps/api/src/modules/notifications/templates/email-templates.ts`
  - `apps/web/src/app/(authentication)/verify-email/page.tsx`
- **Dependencies:** Resend Email Provider (`P0-EMAIL-01`)
- **Problem Statement:**
  `users.isVerified` defaults to `false`. Email/password users have no confirmation mechanism, leaving registered accounts unverified indefinitely.
- **Acceptance Criteria:**
  1. `POST /api/v1/auth/register` creates an email verification token and queues a confirmation email via Resend.
  2. `POST /api/v1/auth/verify-email` verifies token and marks `isVerified = true`.
  3. Student dashboard shows a non-intrusive reminder banner if their account is unverified with a "Resend Verification Email" button.

---

### Task ID: P0-EMAIL-01 — Resend Custom Domain DNS Configuration & Verification
- **Severity:** Critical (Spam Deliverability Blocker)
- **Estimates:** Lower Bound: 2.0h | Upper Bound: 4.0h | **Expected: 3.0h (0.375 Days)**
- **Target Files:**
  - `apps/api/src/modules/notifications/providers/resend.provider.ts`
  - Cloudflare DNS Records
- **Dependencies:** Domain Control & Resend Account
- **Business Approval:** Domain Owner / Technical Lead
- **Problem Statement:**
  Sending transactional emails from unverified or placeholder domains causes automatic spam filtering or rejection by Gmail/Yahoo. The free Resend plan also enforces a strict 100 emails/day cap.
- **Acceptance Criteria:**
  1. Custom domain `techsprout.edu.bd` (or `mail.techsprout.edu.bd`) configured in Resend.
  2. Cloudflare DNS records verified: SPF (`v=spf1 include:amazonses.com ~all`), 3 DKIM CNAMEs, and DMARC TXT record.
  3. `RESEND_FROM_EMAIL` set to official `notifications@techsprout.edu.bd`.
  4. Test email dispatch passes SPF and DKIM validation in Google Workspace / Gmail headers.

---

### Task ID: P0-AI-01 — Durable AI Spending Controls, Thinking Accounting & Multi-Instance Resilience
- **Severity:** Critical (Uncapped Financial Risk & Provider Failure Handling)
- **Estimates:** Lower Bound: 5.0h | Upper Bound: 10.0h | **Expected: 7.5h (0.94 Days)**
- **Target Files:**
  - `apps/api/src/database/schema/learning.ts` (new table `ai_usage_logs`, table `ai_daily_budgets`)
  - `apps/api/src/modules/learning/tutor-llm.service.ts`
  - `apps/api/src/modules/learning/tutor-rate-limiter.service.ts`
  - `apps/api/src/modules/learning/learning.controller.ts`
- **Dependencies:** Redis Connection
- **Business Approval:** **Senior Business Owner (Proposed $5.00/day platform budget ceiling remains UNAPPROVED)**
- **Problem Statement:**
  AI rate limiting currently only caps individual students to 20 queries/day. There is no global spending cap, no database token accounting table, deprecated models are hardcoded in URLs, and there is zero failure resilience if Redis, PostgreSQL, or upstream AI providers fail.
- **Acceptance Criteria:**
  1. Database migration creates table `ai_usage_logs` (`id`, `user_id`, `course_id`, `provider`, `model`, `prompt_tokens`, `completion_tokens`, `thinking_tokens`, `estimated_cost_usd`, `latency_ms`, `created_at`) with `UNIQUE(request_id)`.
  2. Database migration creates dedicated budget table `ai_daily_budgets` (`date_utc DATE PRIMARY KEY`, `reserved_amount_usd NUMERIC(10,4)`, `actual_spent_usd NUMERIC(10,4)`, `max_budget_usd NUMERIC(10,4)`, `updated_at TIMESTAMP`).
  3. **Privacy Guarantee:** Raw prompt text and student questions are **never stored** in database logs or telemetry.
  4. **Dynamic Thinking-Token Accounting:**
     - Acknowledges that 150 thinking tokens is an explicit modeling assumption; actual generation is dynamic and controlled upstream.
     - Sets `thinking_config: { thinking_level: "low" }` (or `"minimal"` where supported).
     - Actual consumption is recorded strictly from upstream `usage_metadata` (`candidates_token_count`, `prompt_token_count`, `thinking_token_count`).
     - Distinguishes visible output tokens (~350) from billable thinking tokens (~150); calculates cost recognizing that thinking tokens are billed at the full output rate ($1.50/1M on `gemini-3.1-flash-lite`).
  5. **Multi-Instance Pre-Request Atomic Reservation Formula:**
     - Computes reservation amount dynamically: $\text{Reservation} = (\text{Bounded Prompt Tokens} \times \text{Rate}_{\text{in}}) + (\text{Max Output Tokens (Visible + Thinking)} \times \text{Rate}_{\text{out}})$.
     - Evaluates approx. $0.00325 for `gemini-3.1-flash-lite` (max 4k input + 1.5k max output/thinking).
     - Hard sanity cap of **$0.05** per request prevents reservation corruption.
     - Maximum possible concurrent overshoot is bounded to $10\text{ concurrent requests} \times \$0.00325 = \mathbf{\$0.0325}$.
     - Redis atomic Lua script evaluates `ai:daily_spend_usd` against platform cap and reserves estimated query cost via `INCRBYFLOAT` before invoking LLM API.
  6. **Hardened Multi-Instance Failure Modes:**
     - **PostgreSQL Fallback:** When Redis is down, acquires row-level lock on `ai_daily_budgets` for `CURRENT_DATE` (`FOR UPDATE`) or transaction advisory lock `pg_advisory_xact_lock` under `READ COMMITTED` isolation, preventing concurrent overspending across instances.
     - **PostgreSQL Outage & Volatile Buffer:** When PostgreSQL is unreachable, Redis acts as operational ledger. In-memory queue is bounded at 500 records. If buffer fills or outage exceeds 60s, system **fails closed**, returning HTTP 503 rather than operating unmetered.
     - **Process Crash Recovery:** Server restart checks Redis `ai:daily_spend_usd`; does not reset spend to zero. If Redis lost, startup recalculates spend from PostgreSQL ledger.
     - **Upstream Timeout / 504:** Catches timeout, marks request `'RECONCILIATION_PENDING'`, and holds reservation in reserve to prevent financial leakage from backend-generated tokens.
     - **Client Disconnect Lifecycle:** Detects `res.on('close')` where `!res.writableEnded`. Triggers `abortController.abort()`. If upstream omits trailing `usage_metadata`, applies conservative token accounting (prompt tokens + emitted tokens + 150 thinking tokens).
  7. **Kill-Switch Behavior (`AI_TUTOR_ENABLED=false`):**
     - Evaluated before reservation and before provider invocation.
     - **New requests:** Rejected immediately with HTTP 503.
     - **Running requests:** Gracefully stream to completion or abort based on shutdown timeout.
     - **Unreconciled requests:** Reconciled by background worker.
     - **Recovered requests:** Evaluated against kill switch on reboot.
  8. Parameterize model identifier (`GEMINI_MODEL_NAME=gemini-3.1-flash-lite` or `gemini-3.8-flash`) instead of hardcoding in URLs.

---

### Task ID: P0-DB-01 — Database Connection Pool, Timeout Tuning & 50-VUser Concurrency Testing
- **Severity:** High (Database Exhaustion / Connection Hangs)
- **Estimates:** Lower Bound: 3.5h | Upper Bound: 6.0h | **Expected: 4.5h (0.56 Days)**
- **Target Files:**
  - `apps/api/src/database/drizzle.provider.ts`
  - `apps/api/src/config/env.config.ts`
  - `apps/api/src/test/connection-pool-load.spec.ts`
- **Dependencies:** None
- **Problem Statement:**
  `pg.Pool` currently uses default settings: infinite connection wait (`connectionTimeoutMillis: 0`), default 10 connections, and no statement timeout. The current staging database is a temporary free instance with a 30-day expiration date, and production capacity remains completely unprovisioned.
- **Acceptance Criteria:**
  1. Pool configured with: `max: 8` per API instance, `connectionTimeoutMillis: 5000` (fail after 5s if no connection available), `idleTimeoutMillis: 10000`, `statement_timeout: 10000` (abort queries exceeding 10s).
  2. **Standardized Connection Breakdown & Overlap Analysis:**
     - 2 API Instances (Steady-State): $2 \times 8 = 16$ client connections.
     - Background / Queue Worker: 4 client connections.
     - P12 Automated Backup Script: 2 client connections (`pg_dump` + `psql`).
     - Drizzle Migrations: 1 client connection.
     - Admin Maintenance / Operator Sessions: 2 client connections.
     - **Subtotal Steady-State Client Allocation:** **25 client connections**.
     - **Rolling Deployment Overlap:** During rolling updates, 2 old + 2 new API instances run concurrently for 30–60s = 32 API connections; total deployment client demand = **41 client connections**.
     - **Server Connections & Headroom:** PostgreSQL `max_connections = 100` (`client_usable = 97`, `superuser_reserved = 3`).
     - **Steady-State Headroom:** $97 - 25 = \mathbf{72\text{ Free Client Connections (74.2% Buffer)}}$.
     - **Deployment Overlap Headroom:** $97 - 41 = \mathbf{56\text{ Free Client Connections (57.7% Buffer)}}$.
  3. **Mandatory 50-VUser Concurrency Load Testing (Performance Validation Target):**
     - Execute automated load test using k6 or autocannon simulating 50 concurrent virtual users hitting public catalog (`GET /api/v1/courses`) and authentication endpoints for 10 minutes.
     - Performance targets: p95 latency < 50ms, p99 latency < 100ms, throughput $\ge 150\text{ req/s}$, error rate < 0.1%, exactly 0 connection pool exhaustion errors.
     - Document that 50-VUser test is a pre-launch validation target, not verified capacity, because production database capacity has not been provisioned.

---

### Task ID: P0-PAY-01 — SSLCommerz Sandbox IPN Handshake Verification & Idempotent Processing
- **Severity:** Critical (Revenue Collection & Financial Integrity Blocker)
- **Estimates:** Lower Bound: 3.0h | Upper Bound: 6.0h | **Expected: 4.5h (0.56 Days)**
- **Target Files:**
  - `apps/api/src/modules/payments/sslcommerz.service.ts`
  - `apps/api/src/modules/payments/payments.controller.ts`
  - `apps/api/src/database/schema/orders.ts`
  - `apps/api/src/test/sslcommerz-sandbox-ipn.spec.ts`
- **Dependencies:** SSLCommerz Sandbox Account (`SSLCOMMERZ_IS_SANDBOX=true`)
- **Business Approval:** **Managing Director / SSLCommerz KYC Approval (for Day-2 Live Activation)**
- **Problem Statement:**
  Payment processing requires comprehensive sandbox verification of server-to-server IPN callbacks, MD5 signature validation, transaction idempotency, and enrollment protection before any production activation can be contemplated. Live credentials, transactions, or production payment activation are strictly prohibited in Phase P0/P12.
- **Acceptance Criteria:**
  1. Environment strictly configured for sandbox verification: `SSLCOMMERZ_IS_SANDBOX=true` with sandbox store ID and password.
  2. Public IPN endpoint (`POST /api/v1/payments/ipn`) accepts SSLCommerz callback and validates request payload:
     - Calculates MD5 verify hash using parameters and store password; compares against incoming `verify_sign`.
     - Validates transaction via server-to-server call to SSLCommerz validation API (`https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php`).
  3. **Idempotent Payment Processing & Duplicate Protection:**
     - Database enforces unique constraint on transaction ID (`tran_id`) and validation ID (`val_id`).
     - Duplicate IPN notifications for an already processed transaction are safely acknowledged with HTTP 200 without executing duplicate database mutations.
  4. **State Machine Handling:**
     - Successful payment (`VALID` / `VALIDATED`): Updates order status to `PAID`, records transaction metadata, and creates active course enrollment within a single atomic database transaction.
     - Failed payment (`FAILED`): Marks order `FAILED`; preserves cart state for reattempt; zero enrollment created.
     - Cancelled payment (`CANCELLED`): Marks order `CANCELLED`; logs telemetry; zero enrollment created.
  5. Automated Vitest test suite (`sslcommerz-sandbox-ipn.spec.ts`) simulates valid, tampered, duplicate, and failed IPN payloads.
  6. Documentation explicitly confirms: **Zero live merchant credentials, zero live micro-transactions, and zero production payment activation in Phase P0/P12.**

---

### Task ID: P0-LEGAL-01 — Standalone Refund Policy & SSLCommerz Footer Disclosures
- **Severity:** High (Merchant Compliance Blocker)
- **Estimates:** Lower Bound: 2.0h | Upper Bound: 4.0h | **Expected: 3.0h (0.375 Days)**
- **Target Files:**
  - `apps/web/src/app/refund-policy/page.tsx`
  - `apps/web/src/components/shared/Footer.tsx`
  - `apps/web/src/app/terms-and-condition/page.tsx`
- **Dependencies:** None
- **Business Approval:** Legal / Managing Director
- **Problem Statement:**
  SSLCommerz requires a standalone Refund Policy URL, explicit BDT currency notice, and registered merchant address/trade disclosures for live merchant account activation.
- **Acceptance Criteria:**
  1. Standalone page at `/refund-policy` stating 7–10 day turnaround, eligibility criteria, and deduction details.
  2. Footer displays physical company address in Bangladesh, support email, phone number, and Trade License/BIN notice.
  3. Navigation footer links to Terms, Privacy, and Refund Policy.
  4. Currency explicitly formatted and displayed as **BDT** throughout checkout.

---

### Task ID: P0-SENTRY-01 — Sentry Next.js Build Wrapper, Hidden Source Maps & API PII Scrubbing
- **Severity:** High (Production Observability & Security Blocker)
- **Estimates:** Lower Bound: 3.0h | Upper Bound: 5.0h | **Expected: 4.0h (0.50 Days)**
- **Target Files:**
  - `apps/web/next.config.ts`
  - `apps/api/src/common/observability/sentry.ts`
  - `apps/web/sentry.client.config.ts`
- **Dependencies:** Sentry Production Project DSN
- **Problem Statement:**
  `apps/web/next.config.ts` lacks `withSentryConfig`, preventing source map uploads and leaving production client stack traces obfuscated. Publicly exposing source maps leaks proprietary source code. The API lacks data scrubbing in `beforeSend`, risking PII leakage into error logs.
- **Acceptance Criteria:**
  1. `apps/web/next.config.ts` wraps `nextConfig` in `withSentryConfig`.
  2. Source maps are generated and uploaded to Sentry during build, but configured with `hideSourceMaps: true` so `.map` files are **never publicly accessible** in browser developer tools.
  3. `apps/api/src/common/observability/sentry.ts` implements `beforeSend` to scrub passwords, session tokens, OTPs, credit cards, bank account numbers, and email addresses from error payloads.
  4. Sentry test event successfully resolves to TypeScript source files in dashboard with zero exposed secrets.

---

### Task ID: P0-OPS-03 — Structured Production Logging, Correlation IDs & Log Level Discipline
- **Severity:** High (Production Troubleshooting & Security Risk)
- **Estimates:** Lower Bound: 3.0h | Upper Bound: 6.0h | **Expected: 4.5h (0.56 Days)**
- **Target Files:**
  - `apps/api/src/common/logger/structured-logger.service.ts`
  - `apps/api/src/common/middleware/correlation-id.middleware.ts`
  - `apps/api/src/main.ts`
- **Dependencies:** None
- **Problem Statement:**
  Current logging relies on unstructured `console.log` statements throughout the API. In production, this makes distributed request tracing impossible, prevents log aggregation in Render/Datadog, and risks accidentally logging sensitive authentication tokens or user data.
- **Acceptance Criteria:**
  1. Implement structured JSON logger (using Pino or Winston) formatting output as machine-readable JSON in production (`timestamp`, `level`, `correlationId`, `context`, `message`, `metadata`).
  2. Middleware assigns or extracts `x-correlation-id` UUID header on incoming requests; propagates ID across asynchronous execution contexts and attaches to every log line.
  3. Automatic PII redaction filter masks sensitive keys (`password`, `token`, `secret`, `authorization`, `cookie`, `card`).
  4. Enforces strict log level discipline: `debug` disabled in production; `error` logs include structured stack traces.
  5. API response headers return `x-correlation-id` to client for customer support tracing.

---

### Task ID: P0-SEO-01 — Custom Branded Favicon, Metadata & Open Graph Social Cards
- **Severity:** High (Brand Credibility & Social Distribution Blocker)
- **Estimates:** Lower Bound: 3.0h | Upper Bound: 5.0h | **Expected: 4.0h (0.50 Days)**
- **Target Files:**
  - `apps/web/public/favicon.ico`
  - `apps/web/public/apple-touch-icon.png`
  - `apps/web/src/app/layout.tsx`
  - `apps/web/src/app/**/page.tsx`
- **Dependencies:** Branded SVG / PNG assets
- **Problem Statement:**
  The frontend currently displays the default Next.js/Vercel favicon. Public pages lack consistent Open Graph / Twitter Card social preview images and metadata, resulting in broken or unbranded previews when shared on Facebook, LinkedIn, or WhatsApp.
- **Acceptance Criteria:**
  1. Replace default icons with official TechSprout favicons (`favicon.ico`, `icon.png`, `apple-touch-icon.png`) in `apps/web/public/`.
  2. Root `layout.tsx` defines base metadata: `title`, `description`, `metadataBase: new URL('https://techsprout.edu.bd')`, and Open Graph defaults.
  3. Dynamic course pages (`/courses/[slug]`) generate route-specific Open Graph titles, course summaries, and Cloudinary thumbnail URLs.
  4. Social sharing preview verified via Facebook Sharing Debugger and Twitter Card Validator.

---

### Task ID: P0-BRAND-01 — Remove Webtricker Agency Mock Data & Localize TechSprout Content
- **Severity:** High (Brand Credibility Failure)
- **Estimates:** Lower Bound: 4.0h | Upper Bound: 7.0h | **Expected: 5.5h (0.69 Days)**
- **Target Files:**
  - `apps/web/src/lib/mockData/mockData.ts`
  - `apps/web/src/components/home/Testimonial.tsx`
  - `apps/web/src/components/home/Brands.tsx`
  - `apps/web/src/components/home/Discover.tsx`
  - `apps/web/src/app/blogs/page.tsx`
  - `apps/web/src/app/faq/page.tsx`
- **Dependencies:** Authentic marketing copy from TechSprout team
- **Problem Statement:**
  Homepage testimonials cite external template agency "Webtricker Web and Design Solution". Blogs and FAQs use generic agency mock data, destroying institutional credibility.
- **Acceptance Criteria:**
  1. Replace "Webtricker" testimonials with authentic TechSprout student learning testimonials or localized partner reviews.
  2. Update "Discover" statistics to reflect realistic launch baseline or connect to backend public statistics endpoint.
  3. Localize FAQ page with actual TechSprout platform questions (enrollment, SSLCommerz payment, certificates, AI tutor).
  4. Ensure zero references to external template agencies remain in user-facing code.

---

### Task ID: P0-SEC-02 — Remove Hardcoded Localhost URLs in Production CORS & Config
- **Severity:** High (Security & CORS Posture)
- **Estimates:** Lower Bound: 1.5h | Upper Bound: 3.0h | **Expected: 2.0h (0.25 Days)**
- **Target Files:**
  - `apps/api/src/main.ts`
  - `apps/web/src/lib/api/axios.ts`
- **Dependencies:** None
- **Problem Statement:**
  `main.ts` currently whitelists `http://localhost:3000` and `http://localhost:3001` in CORS indiscriminately.
- **Acceptance Criteria:**
  1. In production (`NODE_ENV === 'production'`), `localhost` origins are strictly rejected.
  2. Allowed origins are populated strictly via `CORS_ALLOWED_ORIGINS` environment variable (e.g. `https://techsprout.edu.bd,https://admin.techsprout.edu.bd`).
  3. In staging/preview, dynamic regex allows approved Vercel preview URLs (`https://techsprout-*.vercel.app`).

---

### Task ID: P0-TEST-01 — Automated End-to-End Signup-to-Paid Enrollment Test with Sandbox IPN
- **Severity:** Critical (Core Business Flow Assurance)
- **Estimates:** Lower Bound: 4.5h | Upper Bound: 8.0h | **Expected: 6.0h (0.75 Days)**
- **Target Files:**
  - `apps/web/playwright.config.ts` or `apps/api/src/test/e2e-signup-to-paid.spec.ts`
- **Dependencies:** Complete P0-AUTH and P0-PAY workflows
- **Problem Statement:**
  No automated end-to-end test validates the complete student journey from registration through payment and first lesson streaming.
- **Acceptance Criteria:**
  1. Automated test registers new student with unique email.
  2. Dispatches and verifies email confirmation token.
  3. Adds course to cart, triggers SSLCommerz sandbox checkout.
  4. Simulates sandbox IPN callback, verifies database transaction creates active enrollment.
  5. Navigates to `/learn/[courseId]` and verifies lesson video playback unlocks.

---

### Task ID: P0-SEC-03 — Security Regression Suite (Token Enumeration & Brute-Force Testing)
- **Severity:** High (Vulnerability Gate)
- **Estimates:** Lower Bound: 3.0h | Upper Bound: 5.0h | **Expected: 4.0h (0.50 Days)**
- **Target Files:**
  - `apps/api/src/test/security-regression.spec.ts`
- **Dependencies:** P0-AUTH-01, P0-AUTH-02
- **Problem Statement:**
  Password reset, login, and verification tokens must be hardened against timing attacks, token enumeration, and replay vulnerabilities.
- **Acceptance Criteria:**
  1. Automated test suite verifies password reset returns constant-time response for existing vs non-existing emails.
  2. Expired tokens (older than 15 minutes) are strictly rejected with HTTP 400.
  3. Replay attacks using already-consumed tokens are rejected.
  4. Privilege escalation test verifies `STUDENT` cannot mutate courses or access `/api/v1/admin/*`.

---

### Task ID: P0-OPS-02 — P12 Backup and Disaster Recovery Verification
- **Severity:** High (Data Loss Prevention)
- **Estimates:** Lower Bound: 2.0h | Upper Bound: 4.0h | **Expected: 3.0h (0.375 Days)**
- **Target Files:**
  - `scripts/ops/backup-postgres.ps1`
  - `scripts/ops/verify-postgres-backup.sh`
  - `scripts/ops/restore-postgres-local.ps1`
- **Dependencies:** None
- **Problem Statement:**
  Disaster recovery readiness requires confirmed end-to-end backup creation, SHA-256 manifest verification, and clean restoration into a clean container before production launch.
- **Acceptance Criteria:**
  1. `backup-postgres.ps1` executes offline dry-run and generates valid manifest.
  2. Manifest checksum verification passes via `verify-postgres-backup.sh`.
  3. Restoration test confirms zero data loss and valid database schema.

---

## 5. Priority P1: Launch Baseline Polish (Day-1 Readiness)

The remaining 5 tasks in Priority P1 provide operational polish and post-launch resilience:

| Task ID | Task Description | Target Files | Lower Bound | Upper Bound | Expected Median |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **P1-CLEAN-02** | Production Console-Log Cleanup & Minification | `apps/web/next.config.ts`, client bundles | 1.5h | 3.0h | **2.0h (0.25d)** |
| **P1-OPS-01** | External Uptime Monitoring & Health Alerting | Synthetic Monitor (BetterStack/UptimeRobot)| 1.5h | 3.0h | **2.0h (0.25d)** |
| **P1-FLAGS-01** | Database-Backed Feature Flag Service | `apps/api/src/modules/system/feature-flags` | 3.0h | 5.0h | **4.0h (0.50d)** |
| **P1-ANALYTICS-01**| Student Activation Funnel Telemetry Dashboard | `apps/api/src/modules/telemetry`, `admin/analytics`| 3.0h | 6.0h | **4.5h (0.56d)** |
| **P1-DB-02** | Safe Test-Data Cleanup Script (DBA Approval) | `scripts/db/clean-seed-data.ts` | 2.5h | 4.5h | **3.5h (0.44d)** |
| **Total P1** | **5 Tasks** | — | **11.5h** | **21.5h** | **16.0h (2.00d)** |

---

## 6. Priority P2 & P3: Post-Launch Polish & Future Scale

- **P2-PERF-01:** Redis Response Caching for Public Catalog Endpoints (3.0h - 5.0h, Expected: 4.0h)
- **P2-EMAIL-01:** Automated Student Welcome & Onboarding Email Sequence (2.0h - 4.0h, Expected: 3.0h)
- **P2-MEDIA-04:** Inline Video Player Preview in MediaUploader (1.5h - 3.0h, Expected: 2.0h)
- **P2-SEC-04:** Dedicated Login Brute-Force Rate Limiter (4.0h - 6.0h, Expected: 5.0h)
- **P3-ORG-01:** Multi-tenant School / Institution Subscriptions (8.0h - 14.0h, Expected: 11.0h)
- **P3-LIVE-01:** Live Interactive Webinar & Video Meeting Integration (6.0h - 10.0h, Expected: 8.0h)
- **P3-APP-01:** React Native / Expo Mobile App Foundation (5.0h - 8.0h, Expected: 6.5h)

---

## 7. Outstanding Senior Approvals & External Blockers

| Domain / Item | Nature of Blocker | Impacted Task ID | Required Approver | Status & Action |
| :--- | :--- | :--- | :--- | :--- |
| **AI Platform Daily Spending Cap** | Financial Policy | `P0-AI-01` | Senior Business Owner | **UNAPPROVED.** Proposed $5.00/day limit awaits formal sign-off. |
| **SSLCommerz Corporate Merchant KYC**| Regulatory Compliance| `P0-PAY-01` | Managing Director | **AWAITING SUBMISSION.** Requires Trade License, TIN, BIN, bank statement. |
| **Primary Domain Selection** | Brand / Legal | `P0-EMAIL-01` | Managing Director | **AWAITING DECISION.** BTCL `.edu.bd` (needs educational NOC) vs Cloudflare `.com`. |
| **Commercial Vercel Pro License** | Hosting Policy | Config A Deployment | Technical Lead | Required if frontend remains on Vercel for paid commercial launch. |
| **Production Seed Data Cleanup** | Data Integrity | `P1-DB-02` | Database Administrator | Written authorization required before running `clean-seed-data.ts`. |

---
*Backlog reconciled independently by Antigravity Senior Staff Auditor on November 5, 2026. Target Version: v2.2.2.*
