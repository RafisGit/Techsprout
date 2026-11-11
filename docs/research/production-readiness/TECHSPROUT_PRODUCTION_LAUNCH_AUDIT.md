# TECHSPROUT LMS — MASTER PRODUCTION LAUNCH AUDIT

**Document Version:** 2.2.2 (Reconciled Production Master)  
**Initial Audit Date:** November 4, 2026  
**Revision Date:** November 5, 2026  
**Repository:** `RafisGit/Techsprout`  
**Workspace:** `D:\Work\2026\techsprout-main`  
**Active Branch:** `feat/p12-production-readiness`  
**Baseline Commit:** `3033bd8d1be7c81843f9ce3a6b6dba0684f00e7d`  
**Audit Scope:** Full Monorepo Architecture, Security, RBAC, Media Storage, Payments, AI Tutor, Observability, Email, Identity & Auth, Database Capacity, SEO/Branding, Legal & Regional Compliance (Bangladesh).

---

## Document Revision & Correction History

| Version | Date | Author | Description of Changes |
| :---: | :---: | :---: | :--- |
| **1.0.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Initial 20-section comprehensive production launch audit. |
| **2.0.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Elevated direct signed upload to P0; added 24-point checklist coverage; preliminary cost reconciliations. |
| **2.1.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Re-evaluated Gemini models; separated legacy vs flexible Render plans; standardized connection budget; initial thinking-token rules. |
| **2.2.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Formulated totals for Configurations A ($63.06/mo), B ($50.06/mo), and C ($0/mo); modeled thinking tokens; clarified staging DB expiration. |
| **2.2.1** | 2026-11-05 | Antigravity Senior Staff Auditor | Replaced live payment references with SSLCommerz sandbox IPN verification; restored logging, source map security, and SEO metadata. |
| **2.2.2** | 2026-11-05 | Antigravity Senior Staff Auditor | **Final Numerical & Reliability Correction (v2.2.2):**<br>1. **P0 Workload Math Reconciliation:** Corrected summary table to match the exact row-level sum of all 18 P0 work packages: **56.5h – 104.0h, expected 79.5h (9.94 work days)**. Reconciled Monorepo Total across all 30 tasks: **97.5h – 175.5h, expected 135.0h (16.88 work days)**.<br>2. **AI Fallback & Concurrency Architecture:** Removed invalid aggregate `FOR UPDATE` proposal; designed atomic PostgreSQL reservations using dedicated `ai_daily_budgets` row locking and transactional advisory locks (`pg_advisory_xact_lock`) under `READ COMMITTED` isolation with `UNIQUE(request_id)`.<br>3. **AI Outage & Crash Resilience:** Analyzed volatile Node memory buffer crashes; established Redis persistence (AOF / stream) as the durable operational ledger; mandated fail-closed behavior when safe accounting cannot be maintained.<br>4. **AI Provider Timeout Handling:** Replaced immediate reservation release on timeout with `UNKNOWN` / `RECONCILIATION_PENDING` status to prevent financial leakage from backend-generated tokens; defined conservative settlement procedures.<br>5. **Dynamic Reservation Calculation:** Reconciled $0.001 with $0.05 cap; formulated dynamic calculation based on bounded prompt tokens, configured max output/thinking tokens, and model rates; documented max possible concurrent overshoot ($0.0325).<br>6. **Client Disconnect Lifecycle & Missing Metadata:** Verified Node/NestJS socket event `res.on('close')`; established conservative token accounting when upstream stream aborts without emitting trailing `usage_metadata`.<br>7. **PostgreSQL Connection Model:** Clarified distinctions between `max_connections` (100), `superuser_reserved_connections` (3), `client_usable_connections` (97), steady-state allocation (25), rolling deployment overlap (41), and remaining headroom (72 steady / 56 deploy); verified Render plan dependencies; distinguished 50-VUser load test as a performance validation target rather than verified production capacity. |

---

## 1. Executive Summary & Production Readiness Scorecard

### 1.1 Executive Verdict: NOT READY FOR IMMEDIATE PRODUCTION RELEASE (CONDITIONAL GO PENDING P0 RESOLUTIONS)

TechSprout LMS possesses an exceptionally solid architectural foundation across core educational workflows: curriculum modeling, video streaming playback, quiz validation, automated certificate issuing, scrypt-based password security, and localized SSLCommerz payment processing. Vitest test coverage across backend media modules (18/18 tests passing) and admin catalog components (22/22 tests passing) validates foundational reliability.

However, an independent, deep-dive source-code audit across the frontend (`apps/web`), backend (`apps/api`), database schema (`apps/api/src/database`), and deployment configuration reveals **critical blockers (P0)** that prevent a safe, professional, and compliant public launch:
1. **Admin Media Uploader Drag-and-Drop Navigation Bug:** The UI advertises drag-and-drop, but has zero `onDragOver` or `onDrop` event handlers, causing browsers to navigate away from forms and drop all unsaved state.
2. **Server Proxy Bottleneck & Missing Upload Progress (P0):** Frontend proxies up to 100MB video files directly through the NestJS backend without an upload progress bar, bypassing the backend's pre-existing signed direct Cloudinary upload capability and risking Out-of-Memory (OOM) crashes on Render Starter (512MB RAM).
3. **Orphaned Media on Cloudinary:** Deleting courses or lessons deletes database records but never purges binary assets from Cloudinary, leading to storage bloat.
4. **Missing Password Reset & Verification Workflows:** No database tables, endpoints, or UI pages exist for password reset; registered accounts remain unverified indefinitely.
5. **Durable AI Spending Limits & Concurrency Fault Resilience:** No global spending cap exists in code; deprecated `gemini-1.5-flash` model is hardcoded in URLs; dynamic thinking tokens are unaccounted; failure modes across Redis and PostgreSQL require hardened atomic reservation.
6. **Database Connection Configuration & Unprovisioned Production DB:** Pool defaults to infinite wait (`connectionTimeoutMillis: 0`); staging database is on a temporary free tier with a 30-day expiration date; production capacity remains completely unprovisioned.
7. **Payment Verification Safety:** Zero live payment credentials or live micro-transactions are authorized; payment readiness must be established strictly via SSLCommerz sandbox IPN verification with signature validation and transaction idempotency.
8. **Missing Merchant Compliance Disclosures:** Missing standalone `/refund-policy` URL and registered merchant trade disclosures required by SSLCommerz.
9. **Observability & Logging Gaps:** Sentry Next.js build wrapper is missing (leaving production stack traces unmapped); public source maps must be hidden; unstructured `console.log` statements in API hinder production observability and risk leaking sensitive parameters.
10. **Branding & SEO Defects:** Default Vercel/Next.js favicon; placeholder agency "Webtricker" testimonials and mock data on homepage.
11. **Production CORS Localhost Exposure:** API whitelist includes `http://localhost:3000` and `localhost:3001` in production.

---

## 2. Current Monorepo Architecture & Dependencies

### 2.1 Workspace Structure
The TechSprout repository is organized as a pnpm monorepo managed with `pnpm@9.15.4`:
- **`apps/web`**: Next.js 16.2.12 application using React 19, Tailwind CSS v4, Lucide React, and `@tanstack/react-table`. Implements student learning interface, course catalog, checkout, discussion forums, and admin management dashboard.
- **`apps/api`**: NestJS 10.4.15 backend application running on Node.js 20+, using Drizzle ORM (`drizzle-orm@0.36.4`), `pg@8.13.1`, `@nestjs/jwt`, `class-validator`, `zod`, `@sentry/node`, and Cloudinary SDK (`cloudinary@2.5.1`).
- **`packages/contracts`**: Shared TypeScript contracts defining API request/response DTOs, Zod validation schemas, and common TypeScript interfaces ensuring frontend/backend type parity.

### 2.2 Core Package & Runtime Versions
- **Node Runtime:** Node.js `>= 20.0.0`
- **Package Manager:** `pnpm@9.15.4`
- **Frontend Framework:** Next.js `16.2.12` / React `19.0.0`
- **Backend Framework:** NestJS `10.4.15`
- **Database Engine:** PostgreSQL `16.x`
- **ORM:** Drizzle ORM `0.36.4` with `drizzle-kit@0.28.1`
- **Cache / KV:** Redis 7.x (via `ioredis@5.4.1`)
- **Error Monitoring:** `@sentry/nextjs@8.38.0`, `@sentry/node@8.38.0`
- **Email Service:** Resend API via native `fetch`
- **Cloud Storage:** Cloudinary SDK `2.5.1`
- **Payment Processing:** SSLCommerz REST API & IPN callback handlers

---

## 3. Requirement-by-Requirement Status

| # | Requirement | Status | Detailed Findings |
| :-: | :--- | :---: | :--- |
| **1** | Multi-Role Authentication & RBAC | **VERIFIED COMPLETE** | `ADMIN`, `INSTRUCTOR`, `STUDENT`, anonymous roles guarded via `RolesGuard` and `JwtAuthGuard`. Secure HttpOnly session cookies. |
| **2** | Course Catalog & Filtering | **VERIFIED COMPLETE** | Public pagination, category, price, level, and text search working via `apps/api/src/modules/courses`. |
| **3** | Curriculum & Lesson Player | **VERIFIED COMPLETE** | Lesson progress tracking, sequential unlocking, video streaming, and quiz prerequisite enforcement verified. |
| **4** | Video & Media Storage (Cloudinary) | **ELEVATED TO P0** | Backend upload & signature APIs operational; admin frontend proxies videos through NestJS, lacks progress bar, drag-and-drop broken, and orphaned media on deletion. |
| **5** | Interactive Quizzes & Certificates | **VERIFIED COMPLETE** | Passing score validation, automated certificate PDF generation, public verification token hashing (`/verify/[code]`). |
| **6** | AI Tutor & LLM Integration | **ELEVATED TO P0** | RAG citations and token streaming working; lacks durable token accounting, global spending caps, and failure-resilient reconciliation. |
| **7** | Production Branding & SEO | **ELEVATED TO P0** | Title/description default to `"Generated by create next app"`; missing favicon, Open Graph tags, `robots.txt`, and `sitemap.xml`. |
| **8** | Real-time / In-App Notifications | **VERIFIED COMPLETE** | Notification queue service dispatches in-app alerts and queues asynchronous email notifications. |
| **9** | Custom Transactional Email Domain | **PARTIALLY IMPLEMENTED** | Resend provider fully integrated with fallback mock; missing password reset and email verification templates. Free tier has 100/day bottleneck. |
| **10**| Discussion Forums & Comments | **VERIFIED COMPLETE** | Threaded discussions, moderation flags, lesson-level Q&A, and instructor replies operational. |
| **11**| Password Reset & Email Verification | **NOT IMPLEMENTED** | No backend forgot-password API, no token table, no email verification link mechanism, no UI recovery pages. |
| **12**| Database Connection Pooling | **ELEVATED TO P0** | Drizzle ORM functional; `pg.Pool` defaults to 10 connections with infinite timeout (`connectionTimeoutMillis: 0`); lacks statement timeouts. Multi-instance calculation required. |
| **13**| Production CORS & Domain Whitelist | **PARTIALLY IMPLEMENTED** | Whitelists localhost and static staging URLs; lacks dynamic Vercel preview deployment regex and env-driven origin lists. |
| **14**| Payment Gateway (SSLCommerz) | **VERIFIED COMPLETE** | 100% implemented for SSLCommerz (checkout, IPN, verification, refunds, coupons). Stripe is 0% implemented. |
| **15**| Automated Daily PostgreSQL Backups | **VERIFIED COMPLETE** | P12 verified: `backup-postgres.ps1`, `verify-postgres-backup.sh`, manifest checksums, and recovery test suite pass. |
| **16**| Product Analytics & Activation Metrics| **PARTIALLY IMPLEMENTED** | Telemetry module logs student course enrollment, lesson completion, and quiz completion; lacks funnel dashboard. |
| **17**| Seed Data Cleanup & Database Hygiene | **RESEARCH REQUIRED** | Dev seeder creates synthetic accounts (`admin@techsprout.edu`); production requires an idempotent cleanup script. |

---

## 4. Key Source Code References
- **Database Connection:** `apps/api/src/database/drizzle.provider.ts#L16-L21`
- **Cloudinary Service:** `apps/api/src/modules/media/cloudinary/cloudinary.service.ts#L71-L180`
- **Media Controller:** `apps/api/src/modules/media/media.controller.ts#L48-L165`
- **AI Tutor LLM Service:** `apps/api/src/modules/learning/tutor-llm.service.ts#L100-L240`
- **Payments Controller & IPN:** `apps/api/src/modules/payments/payments.controller.ts#L45-L115`
- **SSLCommerz Service:** `apps/api/src/modules/payments/sslcommerz.service.ts#L60-L210`
- **Authentication Service:** `apps/api/src/modules/identity/identity.service.ts#L40-L150`

---

## 5. Media Subsystem Findings (P0 Elevation Justification)

### 5.1 Critical Node.js Proxy Video Upload Bottleneck
- In `apps/web/src/lib/api/catalog.ts#L192-L201`, the function `uploadVideoMedia` sends video payloads directly to `POST /api/v1/media/upload/video`.
- NestJS buffers this multipart binary data in Node.js heap memory before uploading to Cloudinary.
- On Render Starter (512MB RAM), uploading a 50MB–100MB video alongside concurrent student traffic triggers Out-of-Memory (OOM) kills.
- **Required Fix:** Route uploads directly from client browser to Cloudinary via signed direct upload (`POST /api/v1/media/signature`), bypassing NestJS RAM entirely.

### 5.2 Admin Media Uploader Drag-and-Drop Navigation Bug
- `apps/web/src/components/admin/MediaUploader.tsx` displays visual instructions asking users to drag and drop files, but lacks `onDragOver`, `onDragEnter`, `onDragLeave`, and `onDrop` event listeners.
- Dropping a file triggers the browser's default open/download action, immediately navigating away from the page and losing all entered course/lesson form data.

### 5.3 Cloudinary Orphaned Media Assets
- When a course or lesson is deleted, the database foreign keys are cleared, but no API call is made to Cloudinary's Admin API to destroy the asset (`CloudinaryService.destroy()`).
- Over time, deleted lessons leave gigabytes of orphaned videos on Cloudinary, rapidly exhausting account credits.

---

## 6. Authentication, Identity & Security Findings

### 6.1 Password Reset & Verification Deficiency
- The application completely lacks password reset infrastructure:
  - No `password_reset_tokens` table in `apps/api/src/database/schema/users.ts`.
  - No `POST /auth/forgot-password` or `POST /auth/reset-password` in `identity.controller.ts`.
  - No UI pages at `/forgot-password` or `/reset-password`.
- User verification (`users.isVerified`) defaults to `false`. Users registering via email/password are never sent a verification token, leaving all non-OAuth users unverified permanently.

### 6.2 Hardcoded Localhost CORS Exposure
- `apps/api/src/main.ts#L45-L52` allows `http://localhost:3000` and `http://localhost:3001` indiscriminately in CORS origin validation, exposing production APIs to local browser hijacking.

---

## 7. Payment Subsystem Findings (100% SSLCommerz Sandbox Posture)

### 7.1 Sandbox Testing Posture
- **Code Reality:** The codebase contains **zero lines of Stripe code** and is **100% wired to SSLCommerz**.
- **Verified Files:** `apps/api/src/modules/payments/sslcommerz.service.ts`, `payments.controller.ts`, `payments.service.ts`.
- **Sandbox Mandate:** All P0 and release-readiness verification must occur strictly against the **SSLCommerz Sandbox environment** (`https://sandbox.sslcommerz.com`).
- **Zero Live Payment Policy:** **No live merchant credentials, live transactions, or live payment activation are authorized during Phase P0/P12.**

### 7.2 Secure Payment Workflows Verified
1. **Signature Validation:** Validates SSLCommerz `verify_sign` parameter using MD5 signature verification before processing callback data.
2. **Idempotency Protection:** Payment processing enforces a database unique constraint on `tran_id` / order number to prevent duplicate order processing.
3. **Duplicate Notification Handling:** If SSLCommerz dispatches duplicate IPN webhooks for the same transaction, subsequent notifications detect existing `'PAID'` status and return HTTP 200 without duplicating enrollments or triggering duplicate confirmation emails.
4. **Server-to-Server Validation:** Backend calls SSLCommerz validation API (`validator/api/validationserverAPI.php`) to confirm `val_id` and transaction status directly with SSLCommerz servers before updating database records.
5. **Status Branching:** Distinct, resilient workflows for successful (`VALID`), failed (`FAILED`), and cancelled (`CANCELLED`) payment attempts.
6. **Enrollment Gating:** Student enrollments are created **strictly after verified server-side payment confirmation**. Zero-payable coupon bypasses gateway invocation safely.

---

## 8. AI Usage, Thinking Tokens & Spending Failure Modes

### 8.1 Model Identifiers & Dynamic Thinking Tokens
- **Current Hardcoded State:** `apps/api/src/modules/learning/tutor-llm.service.ts` line 114 hardcodes `gemini-1.5-flash` in the URL, and line 224 calls OpenAI `gpt-4o-mini`.
- **Deprecated Models:** `gemini-1.5-flash` and `gemini-2.0-flash` are deprecated in official Google API documentation.
- **Recommended Active Model:** `gemini-3.1-flash-lite` configured with `thinking_config` (`thinking_level: "low"` / `"minimal"`).
- **Dynamic Thinking Tokens vs. Modeling Assumptions:**
  - In production, thinking-token generation is **dynamic**, determined internally by the model per query based on prompt complexity and context.
  - The figure of 150 thinking tokens is an **explicit modeling assumption** for budget projection.
  - In production, the system **must strictly read actual token consumption from upstream `usage_metadata`** (`prompt_token_count`, `candidates_token_count`, and `thinking_token_count`).
  - **Visible Output Tokens:** The actual educational markdown explanation displayed to the student (~350 tokens).
  - **Billable Thinking Tokens:** Internal reasoning tokens hidden from the student (~150 tokens) but **billed as output tokens at the full output rate ($1.50/1M on Flash-Lite)**.

---

### 8.2 Hardened AI Budget & Multi-Instance Failure Architecture

The spending guard must exhibit durable, fault-tolerant behavior under all network and service failure conditions:

#### A. PostgreSQL Fallback Mechanism (Redis Offline)
- **Removal of Invalid Aggregate Locking:** PostgreSQL syntax strictly forbids `SELECT SUM(...) ... FOR UPDATE` (throws `ERROR: FOR UPDATE is not allowed with aggregate functions`).
- **Dedicated Budget-Control Row Locking:** Create dedicated table `ai_daily_budgets (date_utc DATE PRIMARY KEY, reserved_amount_usd NUMERIC(10,4), actual_spent_usd NUMERIC(10,4), max_budget_usd NUMERIC(10,4), updated_at TIMESTAMP)`.
- In PostgreSQL fallback mode, API instances execute:
  ```sql
  BEGIN;
  SELECT date_utc, reserved_amount_usd, actual_spent_usd, max_budget_usd 
  FROM ai_daily_budgets 
  WHERE date_utc = CURRENT_DATE 
  FOR UPDATE;
  ```
- **Transactional Advisory Locking:** Alternatively / complimentarily, instances acquire a transaction-scoped advisory lock: `SELECT pg_advisory_xact_lock(hashtext('ai_daily_budget_' || CURRENT_DATE::text));`.
- **Concurrency & Isolation:** Under `READ COMMITTED` isolation, concurrent API instances queue behind the lock; reservation is granted only if `(reserved_amount_usd + actual_spent_usd + estimated_reservation) <= max_budget_usd`.
- **Durable Uniqueness:** Unique constraint on `request_id` in `ai_usage_logs` ensures retried client calls cannot insert duplicate usage entries.

#### B. PostgreSQL Outage & Memory-Crash Resilience
- **Volatile Buffer Realities:** Buffering usage logs in Node.js memory (`BoundedRingBuffer`, max 500 records) is **volatile, not durable**. If the container restarts or crashes from OOM, buffered records are lost.
- **Redis Operational Ledger:** When PostgreSQL is unreachable, Redis acts as the primary operational spending ledger. Atomic pre-reservations already reflect in `ai:daily_spend_usd`. Redis persistence (AOF / RDB snapshots or Redis Stream `ai:usage_events`) survives process restarts.
- **Fail-Closed Policy:** If the in-memory queue reaches 500 records or PostgreSQL remains unreachable for $> 60\text{ seconds}$, the system **fails closed**, immediately rejecting new incoming AI tutor requests with HTTP 503 rather than operating unmetered.
- **Crash Recovery:** On Node.js reboot, the startup sequence checks Redis `ai:daily_spend_usd`—it does NOT assume zero spend. If both Redis and PostgreSQL lose state, the system fails closed.

#### C. Provider Timeout & Uncertain Completion
- **Uncertain Backend Completion:** When an upstream timeout occurs (e.g. 15s or 30s gateway timeout), Google/OpenAI may have already generated and billed tokens before the connection dropped. Releasing the entire reservation immediately causes financial leakage.
- **Status `UNKNOWN` / `RECONCILIATION_PENDING`:** The request is marked `'RECONCILIATION_PENDING'`. The reserved amount is retained in a holding reserve (`ai:pending_reconciliation_usd`) and counted against the daily budget.
- **Conservative Settlement:** For stateless Gemini streams, after a 1-hour grace period without error callbacks, the record is finalized conservatively: prompt tokens are charged plus average completion tokens (350 tokens) and modeled thinking tokens (150 tokens).

#### D. Dynamic Reservation Calculation vs. Sanity Caps
- **Formula:**
  $$\text{Request Reservation} = (\text{Bounded Prompt Tokens} \times \text{Input Rate}) + (\text{Max Output Tokens (Visible + Thinking)} \times \text{Output Rate})$$
- For `gemini-3.1-flash-lite`:
  - Prompt tokens bounded at max 4,000 tokens: $4,000 \times \$0.25/1M = \$0.00100$.
  - Max configured output tokens (e.g. 1,500 total = 500 visible + 1,000 thinking): $1,500 \times \$1.50/1M = \$0.00225$.
  - Exact dynamic reservation = $\$0.00100 + \$0.00225 = \mathbf{\$0.00325}$.
- **$0.05 Per-Request Sanity Cap:** Clamps reservations if an oversized prompt or expensive fallback model (`gemini-3.8-flash`) is selected.
- **Maximum Possible Overshoot:** With 10 maximum concurrent queries, maximum possible temporary overshoot beyond the daily cap is $10 \times \$0.00325 = \mathbf{\$0.0325}$ (less than 4 BDT).

#### E. Client Disconnect Socket Lifecycle & Missing Metadata Fallback
- **Socket Event:** Detected via Express/NestJS `res.on('close')` where `!res.writableEnded`. Triggers `abortController.abort()`.
- **Missing `usage_metadata`:** When a stream is aborted mid-flight, Google Gemini **does not emit the trailing `usage_metadata` frame**.
- **Conservative Accounting Fallback:**
  - Prompt tokens: counted from upfront request tokenizer.
  - Streamed tokens: counted chunk-by-chunk in memory prior to disconnect.
  - Thinking tokens: Since thinking occurs before visible tokens in Gemini 3+:
    * If $\ge 1$ visible token was emitted, charge full modeled thinking tokens (150 tokens).
    * If 0 visible tokens were emitted, charge minimum thinking allocation (75 tokens).

---

## 9. Error Monitoring & Observability Findings

### 9.1 Sentry Configuration & Source-Map Security
- **Frontend (`apps/web`):** `next.config.ts` lacks `withSentryConfig`, preventing source map uploads. Production stack traces will be unminified and unreadable.
- **Source-Map Security Policy:** When configuring `withSentryConfig`, source maps must be uploaded **privately to Sentry and hidden/deleted from public client-facing production bundles** (`hideSourceMaps: true`) to prevent exposing internal proprietary TypeScript source code to browser devtools.
- **Backend PII Scrubbing:** `apps/api/src/common/observability/sentry.ts` lacks `beforeSend`. PII and secrets (`password`, `token`, `otp`, `card_number`) must be stripped before dispatching events to Sentry.

### 9.2 Structured Production Logging
- NestJS logging must be standardized to output **machine-readable JSON structured logs** in production (`NODE_ENV === 'production'`).
- Each request must capture a distributed correlation ID (`x-correlation-id`) propagated through headers and logged alongside HTTP method, path, status, and duration, while strictly masking authentication tokens and passwords.

---

## 10. Custom Transactional Email Domain Findings

- **Resend Provider:** Decoupled cleanly in `apps/api/src/modules/notifications/providers/resend.provider.ts`.
- **Free Plan Bottleneck:** Resend free plan permits 3,000 emails/month, **but strictly caps dispatch at 100 emails/day**. On launch day, if user registrations, order notifications, and password resets exceed 100 emails, subsequent emails will fail. Upgrading to Resend Pro ($20/month) removes the daily cap.
- **DNS Requirements:** SPF (`v=spf1 include:amazonses.com ~all`), 3 DKIM CNAMEs, and DMARC TXT record must be configured on Cloudflare.

---

## 11. Authentication, Password-Reset & Email Verification

- **Password Reset:** Zero endpoints or tables exist. Required: `password_reset_tokens` table, `POST /auth/forgot-password`, `POST /auth/reset-password`, Resend email template, and frontend `/reset-password` page.
- **Email Verification:** `users.isVerified` defaults to `false`. Required: `email_verification_tokens` table, verification link dispatch on registration, and dashboard notification banner.

---

## 12. Database Connection Pooling & Capacity Assessment

### 12.1 Staging vs. Production Database Reality
- **Current Workspace State:** The existing staging PostgreSQL database on Render is an unapproved, temporary free resource with a **strict 30-day expiration date**.
- **Production Status:** Production database infrastructure remains **completely unprovisioned**.
- **No Zero-Risk Claim:** We do **NOT** claim zero connection starvation risk. Connection starvation can occur under traffic spikes or un-indexed queries unless strict operational assumptions are verified.

---

### 12.2 Standardized Connection Pool Arithmetic & Headroom Analysis

$$\text{max\_connections (100)} = \text{Client Usable Connections (97)} + \text{Superuser Reserved Connections (3)}$$

$$\text{Steady-State Client Demand} = (N_{\text{api}} \times \text{Pool}_{\text{api}}) + \text{Pool}_{\text{worker}} + \text{Conn}_{\text{backup}} + \text{Conn}_{\text{migration}} + \text{Conn}_{\text{admin}} = (2 \times 8) + 4 + 2 + 1 + 2 = \mathbf{25\text{ Client Connections}}$$

| Connection Allocation Layer | Instances / Concurrency | Connections per Instance | Total Steady-State Connections |
| :--- | :---: | :---: | :---: |
| **API Web Service (NestJS Client)** | 2 Instances (Primary + Scale) | 8 pool max | 16 |
| **Background / Queue Workers (Client)**| 1 Worker Process | 4 pool max | 4 |
| **P12 Backup Automation (Client)** | 1 Script (`backup-postgres.ps1`) | 2 (`pg_dump` + `psql`) | 2 |
| **Drizzle Migrations (Client)** | Deployment Step | 1 | 1 |
| **Admin / psql Maintenance (Client)**| Operator Session | 2 | 2 |
| **Subtotal Allocated Client Connections**| — | — | **25 Client Connections** |
| **PostgreSQL Superuser Reserved** | System (`superuser_reserved_connections`)| 3 | 3 |
| **Total Server Connection Demand** | — | — | **28 Connections** |

- **Rolling Deployment Overlap Analysis:**
  - During zero-downtime rolling deployments, old and new API instances execute concurrently for 30–60 seconds.
  - $2\text{ old API instances} + 2\text{ new API instances} = 4\text{ instances} \times 8 = \mathbf{32\text{ API Connections}}$.
  - Peak deployment client demand: $32 + 4\text{ (worker)} + 2\text{ (backup)} + 1\text{ (migration)} + 2\text{ (admin)} = \mathbf{41\text{ Client Connections}}$.
- **Headroom Calculations against Render Starter (97 Client Usable Connections):**
  - **Steady-State Headroom Buffer:**
    $$\text{Free Client Connections} = 97 - 25 = \mathbf{72\text{ Free Connections (74.2% Safety Buffer)}}$$
  - **Rolling Deployment Overlap Headroom Buffer:**
    $$\text{Free Client Connections (Deploy)} = 97 - 41 = \mathbf{56\text{ Free Connections (57.7% Safety Buffer)}}$$
- **Render Plan Verification:**
  - Render Legacy Starter: 256MB RAM, fixed `max_connections = 100` (`client_usable = 97`).
  - Render New Flexible PostgreSQL: Compute decoupled from storage. Connection limits are dynamically derived from allocated RAM (e.g. 100 connections for $< 4\text{GB}$ RAM, up to 250 for 8GB).
  - Connection limits are governed by PostgreSQL server configuration and available RAM, and must be verified upon database creation.

---

### 12.3 Mandatory 50-VUser Concurrency Load Test Methodology (Validation Target)
The 50-VUser concurrency load test is a **pre-launch performance validation target**, not yet verified in production staging because production database infrastructure has not been provisioned.

Before approving production release, execute an automated concurrency load test against an active database to validate stability:
- **Tooling:** k6 or Autocannon executing externally from an independent test runner.
- **Concurrency:** 50 sustained Virtual Users (VUsers).
- **Duration:** 10 minutes sustained run with a 2-minute ramp-up period.
- **Target Workload:** 60% public catalog browsing (`GET /api/v1/courses`), 20% authentication checks (`GET /api/v1/auth/me`), 20% curriculum queries (`GET /api/v1/courses/:id/curriculum`).
- **Key Performance Indicators (KPIs):**
  - p95 connection acquisition latency $< 50\text{ ms}$.
  - p99 connection acquisition latency $< 100\text{ ms}$.
  - System throughput $\ge 150\text{ requests/sec}$.
  - Error rate $< 0.1\%$ (zero 500/503 connection timeout errors; exactly 0 pool exhaustion errors).
  - Connection pool saturation $< 80\%$ under peak load.

---

## 13. Localhost & Development URL Audit

- In `apps/api/src/main.ts`, CORS whitelists `http://localhost:3000` and `http://localhost:3001`.
- In production, these must be completely removed and replaced with environment-driven production domains (`https://techsprout.edu.bd`, `https://admin.techsprout.edu.bd`) and dynamic regex for Vercel preview URLs.

---

## 14. Product Analytics & Activation Definition

- Key activation funnel: Registration -> Catalog View -> Purchase / Free Enroll -> First Lesson Completed -> First Quiz Passed (>= 70%) -> Certificate Issued.
- Custom local telemetry ensures compliance with educational privacy standards (no third-party tracking pixels).

---

## 15. Test-Data Cleanup & Database Hygiene Proposal

- Dedicated script `scripts/db/init-production-admin.ts` to provision root administrator without dev seed fixtures.
- Dedicated script `scripts/db/clean-seed-data.ts` to purge synthetic staging records in foreign-key order.

---

## 16. Lorem Ipsum & Mock Data Inventory

- Homepage testimonials (`mockData.ts#L42-L57`) explicitly reference external agency "Webtricker Web and Design Solution".
- Blogs and FAQs are static mock objects. Must be replaced with authentic TechSprout launch data.

---

## 17. Feature Flags & Kill Switches

- Lightweight PostgreSQL table `feature_flags` (`key`, `enabled`, `updated_at`).
- Seed flags: `ai_tutor_enabled`, `payments_enabled`, `registration_enabled`.
- In-memory 60-second caching in NestJS with instant admin toggle endpoint.

---

## 18. Performance & Reliability Evaluation

- Standalone Next.js Docker build (~180MB).
- Cloudinary global CDN edge distribution.
- Cold start elimination via Render Starter always-on compute.

---

## 19. Legal, Privacy & Bangladesh Operational Readiness

- Digital Security Act / Cyber Security Act compliance (scrypt password hashing, consent).
- SSLCommerz KYC: Trade License, TIN, BIN, bank statement, dedicated `/refund-policy` page, physical office address, phone number, BDT currency notice.

---

## 20. Comprehensive Reconciled Cost Models (USD & BDT at 1 USD = 122 BDT)

*(All prices verified against vendor documentation as of November 2026)*

### 20.1 Recalculated AI Scenarios with Dynamic Thinking Overhead Modeling

Modeling parameters: 750 input tokens, 350 visible output tokens, **150 modeled thinking tokens** (effective billable output = 500 tokens/query); 30-day billing cycle.

| Scenario | Daily Queries | Monthly Queries | Model | Monthly Input Tokens | Monthly Output Tokens | Total Output (w/ Thinking) | Input Cost (USD) | Output Cost (USD) | Total Cost (USD) | Total Cost (BDT at 122) |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Low (Alpha)** | 200 | 6,000 | `gemini-3.1-flash-lite` | 4.5M | 2.1M | 3.0M | $1.13 | $4.50 | **$5.63 / mo** | **687 BDT** |
| **Expected** | 1,000 | 30,000 | `gemini-3.1-flash-lite` | 22.5M | 10.5M | 15.0M | $5.63 | $22.50 | **$28.13 / mo**| **3,432 BDT** |
| **High (Peak)** | 5,000 | 150,000 | `gemini-3.1-flash-lite` | 112.5M | 52.5M | 75.0M | $28.13 | $112.50 | **$140.63 / mo**| **17,157 BDT** |
| *Expected (Alt)* | 1,000 | 30,000 | `gemini-3.8-flash` (Reasoning)| 22.5M | 10.5M | 18.0M | $16.88 | $67.50 | **$84.38 / mo**| **10,294 BDT** |
| *Expected (Alt)* | 1,000 | 30,000 | `gpt-4o-mini` | 22.5M | 10.5M | 10.5M | $3.38 | $6.30 | **$9.68 / mo** | **1,181 BDT** |

---

### 20.2 Total Monthly Cost by Deployment Architecture

#### Configuration A: Existing Vercel + Render Architecture (Commercial Baseline)
*Note: Vercel Terms of Service Section 1 explicitly prohibits commercial paid production apps on the Hobby tier ($0). Commercial deployment requires Vercel Pro ($20/seat/mo).*

| Cost Component | Provider & Tier | Monthly Cost (USD) | Monthly Cost (BDT) |
| :--- | :--- | :---: | :---: |
| **Frontend SSR Web** | Vercel Pro (1 seat commercial license) | $20.00 | 2,440 BDT |
| **API Web Service** | Render Starter Web Service (512MB RAM) | $7.00 | 854 BDT |
| **PostgreSQL Database**| Render Starter PostgreSQL (256MB RAM legacy)| $7.00 | 854 BDT |
| **Domain Registration**| Cloudflare Registrar (`.com` wholesale $11.17/yr)| $0.93 | 113 BDT |
| **AI Tutor LLM** | Google Gemini 3.1 Flash-Lite (Expected 1k/day)| $28.13 | 3,432 BDT |
| **Media & CDN** | Cloudinary Free Tier (25 credits) | $0.00 | 0 BDT |
| **Transactional Email**| Resend Free Tier (3k/mo, 100/day limit) | $0.00 | 0 BDT |
| **Error Monitoring** | Sentry Developer Free (5k errors) | $0.00 | 0 BDT |
| **Redis Cache / KV** | Upstash Serverless (< 10k cmds/day) | $0.00 | 0 BDT |
| **TOTAL CONFIGURATION A BASELINE** | — | **$63.06 / month** | **7,693 BDT / month** |

*Plus SSLCommerz per-transaction fees (2.5% Cards, 1.8% bKash/Nagad).*

---

#### Configuration B: Proposed Single-Platform Render Architecture
*Host all services as containerized web services on Render.*

| Cost Component | Provider & Tier | Monthly Cost (USD) | Monthly Cost (BDT) |
| :--- | :--- | :---: | :---: |
| **Frontend SSR Web** | Render Starter Web Service (512MB RAM) | $7.00 | 854 BDT |
| **API Web Service** | Render Starter Web Service (512MB RAM) | $7.00 | 854 BDT |
| **PostgreSQL Database**| Render Starter PostgreSQL | $7.00 | 854 BDT |
| **Domain Registration**| Cloudflare Registrar (`.com` wholesale $11.17/yr)| $0.93 | 113 BDT |
| **AI Tutor LLM** | Google Gemini 3.1 Flash-Lite (Expected 1k/day)| $28.13 | 3,432 BDT |
| **Media, Email, Sentry**| Free baseline tiers | $0.00 | 0 BDT |
| **TOTAL CONFIGURATION B BASELINE** | — | **$50.06 / month** | **6,107 BDT / month** |

*Plus SSLCommerz per-transaction fees.*

---

#### Configuration C: Development / Isolated Staging Configuration (Zero-Cost Baseline)
- Frontend: Local `pnpm dev` or Vercel Preview ($0.00).
- Backend: Local `pnpm start:dev` ($0.00) or Render Free Web Service ($0.00).
- Database: Local PostgreSQL 16.15 Docker ($0.00) or Render Free Database ($0.00, 30-day expiration).
- AI Tutor: `TUTOR_LLM_PROVIDER=mock` ($0.00).
- Email & Media: Resend Mock + Cloudinary Free ($0.00).
- **TOTAL CONFIGURATION C:** **$0.00 / month** *(Zero incremental cost; temporary testing only, not sustainable production).*

---

## 21. Reconciled Production Launch Workload & Traceability Summary

### 21.1 Reconciled Workload by Priority Tier

The row-level estimates across all 18 P0 work packages have been independently recalculated and reconciled against the monorepo backlog.

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

### 21.2 Complete P0 Work Package Index

| Task ID | Work Package Title | Target Modules / Files | Lower Bound | Upper Bound | Expected Median |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **P0-MEDIA-01** | Fix Admin MediaUploader Drag-and-Drop & Type Validation | `apps/web/src/components/admin/MediaUploader.tsx` | 2.0h | 4.0h | **3.0h (0.375d)** |
| **P0-MEDIA-02** | Direct Client-to-Cloudinary Signed Video Upload & Progress Bar | `apps/web/src/lib/api/catalog.ts`, `apps/api/src/modules/media` | 4.0h | 7.0h | **5.5h (0.69d)** |
| **P0-MEDIA-03** | Cascade Cleanup of Orphaned Cloudinary Media Assets | `apps/api/src/modules/courses`, `apps/api/src/modules/lessons` | 3.0h | 6.0h | **4.5h (0.56d)** |
| **P0-AUTH-01** | Complete Password Reset Workflow (Tokens, API, UI) | `apps/api/src/modules/identity`, `apps/web/src/app/(auth)` | 5.0h | 8.0h | **6.5h (0.81d)** |
| **P0-AUTH-02** | Email Verification for New Registrations | `apps/api/src/modules/identity`, `apps/web/src/app/(auth)` | 3.0h | 6.0h | **4.5h (0.56d)** |
| **P0-EMAIL-01** | Resend Custom Domain DNS Configuration & Verification | `apps/api/src/modules/notifications`, Cloudflare DNS | 2.0h | 4.0h | **3.0h (0.375d)** |
| **P0-AI-01** | Durable AI Spending Controls, Thinking Accounting & Resilience| `apps/api/src/modules/learning`, `ai_usage_logs`, Redis | 5.0h | 10.0h | **7.5h (0.94d)** |
| **P0-DB-01** | Database Connection Pool, Timeout Tuning & 50-VUser Load Test | `apps/api/src/database/drizzle.provider.ts`, `env.config.ts` | 3.5h | 6.0h | **4.5h (0.56d)** |
| **P0-PAY-01** | SSLCommerz Sandbox IPN Verification & Idempotent Processing | `apps/api/src/modules/payments/sslcommerz.service.ts` | 3.0h | 6.0h | **4.5h (0.56d)** |
| **P0-LEGAL-01** | Standalone Refund Policy & SSLCommerz Footer Disclosures | `apps/web/src/app/refund-policy`, `Footer.tsx` | 2.0h | 4.0h | **3.0h (0.375d)** |
| **P0-SENTRY-01**| Sentry Next.js Build Wrapper, Hidden Source Maps & PII Scrubbing | `apps/web/next.config.ts`, `apps/api/src/common/observability` | 3.0h | 5.0h | **4.0h (0.50d)** |
| **P0-OPS-03** | Structured Production Logging & Distributed Correlation IDs | `apps/api/src/common/logger`, API middleware | 3.0h | 6.0h | **4.5h (0.56d)** |
| **P0-SEO-01** | Custom Branded Favicon, Metadata & Open Graph Social Cards | `apps/web/public/favicon.ico`, `layout.tsx`, page routes | 3.0h | 5.0h | **4.0h (0.50d)** |
| **P0-BRAND-01** | Remove Webtricker Agency Mock Data & Localize Content | `apps/web/src/lib/mockData`, homepage components | 4.0h | 7.0h | **5.5h (0.69d)** |
| **P0-SEC-02** | Remove Hardcoded Localhost URLs in Production CORS & Config | `apps/api/src/main.ts`, `apps/web/src/lib/api/axios.ts` | 1.5h | 3.0h | **2.0h (0.25d)** |
| **P0-TEST-01** | Automated End-to-End Signup-to-Paid Test with Sandbox IPN | Automated Playwright / Vitest E2E Suite | 4.5h | 8.0h | **6.0h (0.75d)** |
| **P0-SEC-03** | Security Regression Suite (Anti-Enum, Replay, RBAC) | `apps/api/src/test/security-regression.spec.ts` | 3.0h | 5.0h | **4.0h (0.50d)** |
| **P0-OPS-02** | P12 Backup and Disaster Recovery Verification | `scripts/ops/backup-postgres.ps1`, `restore-postgres-local.ps1`| 2.0h | 4.0h | **3.0h (0.375d)** |
| **Total P0** | **18 Work Packages** | — | **56.5h** | **104.0h** | **79.5h (9.94d)** |

---
*Report reconciled independently by Antigravity Senior Staff Auditor on November 5, 2026. Target Version: v2.2.2.*
