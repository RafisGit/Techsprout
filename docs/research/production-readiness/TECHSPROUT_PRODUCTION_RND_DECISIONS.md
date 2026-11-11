# TECHSPROUT LMS — PRODUCTION ARCHITECTURE & R&D DECISION REGISTER

**Document Version:** 2.2.2 (Reconciled Production Master)  
**Initial Date:** November 4, 2026  
**Revision Date:** November 5, 2026  
**Status:** Approved for Implementation Planning (DOCUMENTATION ONLY — No Implementation Authorized)  
**Auditor:** Antigravity Senior Staff Auditor  
**Repository:** `RafisGit/Techsprout`  
**Exchange Rate Baseline:** 1 USD = 122 BDT  

---

## Document Revision & Correction History

| Version | Date | Author | Description of Changes |
| :---: | :---: | :---: | :--- |
| **1.0.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Initial 7-pillar architectural decision register and cost modeling. |
| **2.0.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Elevated direct signed upload to P0; added Bangladesh domain analysis; preliminary cost reconciliations. |
| **2.1.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Re-evaluated Gemini models; separated legacy vs flexible Render plans; standardized 28-connection budget; detailed initial thinking-token rules. |
| **2.2.0** | 2026-11-04 | Antigravity Senior Staff Auditor | Formulated totals for Configurations A ($63.06/mo), B ($50.06/mo), and C ($0/mo); modeled thinking tokens; clarified staging DB expiration. |
| **2.2.1** | 2026-11-05 | Antigravity Senior Staff Auditor | Replaced live payment references with SSLCommerz sandbox IPN verification; restored logging, source map security, and SEO metadata. |
| **2.2.2** | 2026-11-05 | Antigravity Senior Staff Auditor | **Final Numerical & Reliability Correction (v2.2.2):**<br>1. **AI Fallback & Concurrency Architecture:** Removed invalid aggregate `FOR UPDATE` proposal; designed atomic PostgreSQL reservations using dedicated `ai_daily_budgets` row locking and transactional advisory locks (`pg_advisory_xact_lock`) under `READ COMMITTED` isolation with `UNIQUE(request_id)`.<br>2. **AI Outage & Crash Resilience:** Analyzed volatile Node memory buffer crashes; established Redis persistence (AOF / stream) as the durable operational ledger; mandated fail-closed behavior when safe accounting cannot be maintained.<br>3. **AI Provider Timeout Handling:** Replaced immediate reservation release on timeout with `UNKNOWN` / `RECONCILIATION_PENDING` status to prevent financial leakage from backend-generated tokens; defined conservative settlement procedures.<br>4. **Dynamic Reservation Calculation:** Reconciled $0.001 with $0.05 cap; formulated dynamic calculation based on bounded prompt tokens, configured max output/thinking tokens, and model rates; documented max possible concurrent overshoot ($0.0325).<br>5. **Client Disconnect Lifecycle & Missing Metadata:** Verified Node/NestJS socket event `res.on('close')`; established conservative token accounting when upstream stream aborts without emitting trailing `usage_metadata`.<br>6. **PostgreSQL Connection Model:** Clarified distinctions between `max_connections` (100), `superuser_reserved_connections` (3), `client_usable_connections` (97), steady-state allocation (25), rolling deployment overlap (41), and remaining headroom (72 steady / 56 deploy); verified Render plan dependencies; distinguished 50-VUser load test as a performance validation target rather than verified production capacity. |

---

## 1. Executive Summary & Decision Index

This technical research and decision register documents the evaluated architectural alternatives, cost projections, trade-offs, and final staff recommendations across nine critical technical pillars:
1. **Payment Gateway Strategy** (SSLCommerz Sandbox Verification vs. Stripe vs. bKash Direct vs. Dual-Gateway)
2. **Transactional Email Architecture** (Resend API vs. SendGrid vs. AWS SES vs. Self-hosted SMTP)
3. **Application Observability & APM** (Sentry Cloud vs. Highlight.io vs. Self-hosted GlitchTip)
4. **AI Tutor LLM Provider & Durable Budget Controls** (`gemini-3.1-flash-lite` vs. `gemini-3.8-flash` vs. `gpt-4o-mini`)
5. **Runtime Feature Flags & Kill Switches** (Lightweight PostgreSQL vs. Unleash vs. LaunchDarkly)
6. **Database Connection Pooling & Capacity Budget** (Node-pg Pool Tuning vs. Dedicated PgBouncer)
7. **Administrator Media Architecture & Streaming** (Direct Signed Cloudinary Upload vs. Server Proxy)
8. **Bangladesh Domain Strategy** (BTCL `.edu.bd` vs. BTCL `.com.bd` vs. Cloudflare `.com`)
9. **Deployment Architecture Comparison** (Existing Vercel + Render vs. Single-Platform Render)

---

## 2. Decision 1: Payment Gateway Strategy

### 2.1 Context & Background
The LMS requires seamless payment collection in Bangladeshi Taka (BDT) supporting Mobile Financial Services (MFS: bKash, Nagad, Rocket, Upay), local debit/credit cards (Visa, Mastercard, UnionPay), and internet banking. While earlier project notes referred to Stripe, the TechSprout codebase has **zero Stripe code** and is **100% integrated with SSLCommerz**.

### 2.2 Alternatives Evaluated

| Dimension | Option A: 100% SSLCommerz (Selected) | Option B: Re-architect to Stripe | Option C: Direct bKash Tokenized API | Option D: Dual Gateway (SSLCommerz + Stripe) |
| :--- | :--- | :--- | :--- | :--- |
| **Code Readiness** | **100% Complete** in repository | 0% (Requires total rewrite) | ~15% (Requires separate integration) | ~40% (Stripe must be built from scratch) |
| **Bangladesh MFS Support**| Native (bKash, Nagad, Rocket, etc.)| None (No native bKash/Nagad in BDT)| bKash only (No cards, Nagad, or banks)| Both local MFS and international cards |
| **Setup / Onboarding**| Local trade license, TIN, BIN required| Requires foreign entity / Stripe Atlas | Direct merchant agreement with bKash | Requires both entities & merchant accounts|
| **Fixed Cost (Monthly)**| $0.00 (0 BDT/mo) | $0.00 (0 BDT/mo) | $0.00 (0 BDT/mo) | $0.00 (0 BDT/mo) |
| **Transaction Fees** | 2.5% Cards, 1.8% bKash/Nagad | 2.9% + $0.30 per transaction | 1.5% - 1.8% bKash | Split by gateway |
| **Implementation Effort**| **0 Hours** (Already tested & working)| **40–60 Hours** (5–7.5 Days) | **30–45 Hours** (3.75–5.6 Days) | **50–70 Hours** (6.25–8.75 Days) |

---

### 2.3 Strict Payment Safety & Sandbox IPN Verification Protocol
In strict adherence to the project completion master directive, **no live merchant credentials, live micro-transactions, or production payment activations are authorized in Phase P0 or P12**. Payment readiness is verified exclusively through the SSLCommerz Sandbox environment (`SSLCOMMERZ_IS_SANDBOX=true`):

1. **Sandbox Signature Validation:**
   - Incoming IPN POST callbacks to `/api/v1/payments/ipn` compute an MD5 hash of parameters concatenated with the sandbox store password and compare it against `verify_sign`.
   - Any signature mismatch immediately terminates processing and returns HTTP 400 Bad Request.
2. **Server-Side Verification API Call:**
   - The API makes an outbound server-to-server HTTP request to the SSLCommerz Sandbox Validation API (`https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?val_id=...&store_id=...&store_passwd=...&v=1&format=json`).
   - Payment status is only trusted if the server-to-server call returns `status: "VALID"` or `"VALIDATED"` and matches the expected currency (`BDT`) and exact payable amount.
3. **Idempotent Payment Processing & Duplicate Notification Protection:**
   - Database tables `orders` and `order_transactions` enforce a unique constraint on transaction ID (`tran_id`) and validation ID (`val_id`).
   - If an IPN notification is received for a transaction that is already marked `PAID` or `FAILED`, the API acknowledges receipt with HTTP 200 without executing duplicate database mutations or sending duplicate confirmation emails.
4. **State Machine Transitions:**
   - **`VALID` / `VALIDATED`:** Order status transitions atomically to `PAID`. An active student course enrollment is created in `enrollments` within the same database transaction.
   - **`FAILED`:** Order transitions to `FAILED`. Student cart is preserved for retry; zero enrollment is created.
   - **`CANCELLED`:** Order transitions to `CANCELLED`; zero enrollment is created.
5. **Day-2 Live Merchant Onboarding Requirements (Deferred to Business Operations):**
   - Corporate merchant KYC: Valid Trade License (current fiscal year), e-TIN Certificate, BIN (VAT) Certificate, Company Bank Account Statement, Managing Director NID.
   - Public disclosures: Terms (`/terms-and-condition`), Privacy (`/privacy-policy`), standalone Refund Policy (`/refund-policy`), registered Bangladesh office address, phone number, and BDT currency notice.

### 2.4 Staff Recommendation
> **DECISION:** **Standardize 100% on SSLCommerz Sandbox IPN Verification for Pre-Launch Validation.**  
> Fulfill all architectural and compliance requirements (sandbox signature validation, idempotent processing, `/refund-policy` page). Confirm zero live transactions or live credentials are used until business KYC is finalized. Defer Stripe to Phase 3 (international expansion).

---

## 3. Decision 2: Transactional Email Architecture

### 3.1 Context & Background
The platform requires transactional email delivery for order confirmations, refund status updates, certificate issuances, and forthcoming password reset / email verification workflows.

### 3.2 Alternatives Evaluated

| Dimension | Option A: Resend API (Selected) | Option B: Twilio SendGrid | Option C: Amazon SES | Option D: Self-Hosted Nodemailer / SMTP |
| :--- | :--- | :--- | :--- | :--- |
| **Code Readiness** | **100% Implemented** (`ResendEmailProvider`)| 0% (Requires SDK swap) | 0% (Requires AWS SDK swap) | 0% (Requires SMTP transport) |
| **Free Tier** | 3,000 emails/mo (**100/day limit**)| 100 emails/day | 62,000 emails/mo (if hosted in EC2) | 0 (Billed via host) |
| **Paid Tier Cost** | **$20/mo (~2,440 BDT)** for 50k emails | $19.95/mo for 50k emails | $0.10 per 1,000 emails (~$5.00/mo) | Variable VM cost |
| **Developer DX** | Modern REST API via native fetch | Legacy REST API / Web API v3 | Complex AWS IAM & DKIM console | Manual IP reputation management |
| **Spam / Deliverability**| Exceptional (powered by Amazon SES)| Good, but shared IP pools risk spam| High, requires manual warmup | Very Poor (frequent blacklisting) |

### 3.3 Free Tier Bottleneck Alert
The Resend free plan provides 3,000 emails/month, **but strictly caps dispatch at 100 emails/day**. On launch day, if student registrations, password resets, and order confirmations exceed 100 emails, subsequent dispatches will fail.
- **Action:** Launch with the Free Tier for closed alpha, but obtain business approval to upgrade to **Resend Pro ($20/month = 2,440 BDT/month)** upon public launch.

### 3.4 Staff Recommendation
> **DECISION:** **Standardize on Resend API.**  
> Verify custom DNS records (DKIM, SPF, DMARC) for `techsprout.edu.bd` on Cloudflare. Set `RESEND_FROM_EMAIL=notifications@techsprout.edu.bd`.

---

## 4. Decision 3: Application Observability & Error Monitoring

### 4.1 Context & Background
Production error visibility is vital for identifying unexpected client-side JavaScript crashes and NestJS unhandled exceptions before students report issues.

### 4.2 Alternatives Evaluated

| Dimension | Option A: Sentry Cloud (Selected) | Option B: Highlight.io | Option C: Self-Hosted GlitchTip |
| :--- | :--- | :--- | :--- |
| **Code Readiness** | **Installed in API & Web** | 0% | 0% (Compatible with Sentry DSN) |
| **Source Maps** | Native Webpack / Next.js plugin | Native source maps | Supported via Sentry CLI |
| **Cost (Launch)** | **$0.00 / mo** (Free: 5k errors, 5M spans) | $0.00 / mo (Free: 1k sessions) | $7.00 / mo (Render VM to host instance) |
| **Cost (Scale)** | $26.00 / mo billed yearly (~3,172 BDT) | $150.00+ / mo | $15.00 / mo (Postgres + Redis VM) |
| **PII Scrubbing** | Built-in `beforeSend` data sanitizer | Requires custom masking | Built-in `beforeSend` |

### 4.3 Staff Recommendation
> **DECISION:** **Complete Sentry Cloud Configuration with Source Map Security.**  
> Retain Sentry Cloud. Resolve the identified gaps:
> 1. Wrap `apps/web/next.config.ts` with `withSentryConfig` and enforce `hideSourceMaps: true` so source maps upload during `pnpm build` but are never publicly accessible to browser users.
> 2. Implement `beforeSend` in `apps/api/src/common/observability/sentry.ts` and `apps/web/sentry.client.config.ts` to redact sensitive fields (`password`, `token`, `otp`, `card_number`, `store_passwd`).
> 3. Note: On Sentry Developer Free tier, events exceeding 5,000/month are dropped rather than billed, protecting against surprise charges.

---

## 5. Decision 4: AI Tutor LLM Provider, Benchmarking & Cost Controls

### 5.1 Context & Background
TechSprout's AI Tutor answers student queries grounded in lesson notes and transcripts. The service must stream tokens progressively with sub-second latency while guaranteeing zero risk of runaway cloud API charges.

### 5.2 Model Identifiers in Code & Deprecation Notice
- `apps/api/src/modules/learning/tutor-llm.service.ts` line 114 currently hardcodes deprecated `gemini-1.5-flash` in the URL, and line 224 calls OpenAI `gpt-4o-mini`.
- **Correction:** Both `gemini-1.5-flash` and `gemini-2.0-flash` are deprecated and superseded in official Google documentation.
- **Recommended Active Models:**
  - `gemini-3.1-flash-lite`: Recommended primary model for citation-grounded educational retrieval (Input: ~$0.25/1M, Output: ~$1.50/1M).
  - `gemini-3.8-flash`: Advanced reasoning Flash model (Input: ~$0.75/1M, Output: ~$3.75/1M).
  - `gpt-4o-mini`: Verified OpenAI fallback (Input: $0.15/1M, Output: $0.60/1M).

---

### 5.3 Thinking-Token Architecture in Google Gemini 3+
In official Google documentation, newer Gemini models feature integrated reasoning governed by `thinking_config` (`thinking_level`: `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`):
1. **Dynamic Thinking Tokens:** The 150 thinking tokens figure is an **explicit modeling assumption** for financial projection. Actual internal reasoning token generation is dynamic and controlled upstream by Google's inference engine based on query complexity.
2. **Mandatory `usage_metadata` Accounting:** Production token accounting cannot rely on client-side approximations; it must parse Google's server response `usage_metadata` (`prompt_token_count`, `candidates_token_count`, `thinking_token_count`).
3. **Billable Thinking Token Pricing:** Internal thinking tokens are **billed as output tokens at the full output rate ($1.50/1M on `gemini-3.1-flash-lite`)**, even though the student never sees them in the chat UI.
4. **Effective Modeling Baseline:** $750\text{ input tokens} + 350\text{ visible output tokens} + 150\text{ modeled thinking tokens} = \mathbf{500\text{ billable output tokens / query}}$.

---

### 5.4 Representative Tutor Prompt Benchmark Plan
Before deploying live, an offline benchmark harness must evaluate representative TechSprout prompts without activating paid billing:
- **System Instruction:** ~100 tokens (Citation grounding rules, educational tone).
- **Curriculum Context (1–2 lesson chunks):** ~600 tokens (Lesson text, definitions, code blocks).
- **Student Question:** ~50 tokens.
- **Total Input Tokens:** **~750 tokens**.
- **Expected Output Answer:** **~350 tokens** + **~150 modeled thinking tokens** = **500 billable output tokens**.
- **Target Performance Metric:** Time-to-First-Token (TTFT) $< 300\text{ ms}$, streaming completed in $< 2.5\text{ s}$.

---

### 5.5 Detailed Financial Model Across 3 Usage Scenarios

Baseline Parameters: Average input = 750 tokens; Billable output (including modeled thinking) = 500 tokens; 30-day billing cycle.

| Scenario | Daily Queries | Monthly Queries | Model | Monthly Input Tokens | Monthly Output Tokens | Total Output (w/ Thinking) | Input Cost (USD) | Output Cost (USD) | Total Cost (USD) | Total Cost (BDT at 122) |
| :--- | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Low (Alpha)** | 200 | 6,000 | `gemini-3.1-flash-lite` | 4.5M | 2.1M | 3.0M | $1.13 | $4.50 | **$5.63 / mo** | **687 BDT** |
| **Expected** | 1,000 | 30,000 | `gemini-3.1-flash-lite` | 22.5M | 10.5M | 15.0M | $5.63 | $22.50 | **$28.13 / mo**| **3,432 BDT** |
| **High (Peak)** | 5,000 | 150,000 | `gemini-3.1-flash-lite` | 112.5M | 52.5M | 75.0M | $28.13 | $112.50 | **$140.63 / mo**| **17,157 BDT** |
| *Expected (Alt)* | 1,000 | 30,000 | `gemini-3.8-flash` (Reasoning)| 22.5M | 10.5M | 18.0M | $16.88 | $67.50 | **$84.38 / mo**| **10,294 BDT** |
| *Expected (Alt)* | 1,000 | 30,000 | `gpt-4o-mini` | 22.5M | 10.5M | 10.5M | $3.38 | $6.30 | **$9.68 / mo** | **1,181 BDT** |

---

### 5.6 Comprehensive AI Budget Enforcement & Multi-Instance Failure Matrix

The spending guard must exhibit durable, fault-tolerant behavior across multiple API instances and under all service degradation conditions:

#### 1. PostgreSQL Fallback Concurrency Architecture (Redis Offline)
- **Removal of Invalid Aggregate Locking:** PostgreSQL strictly forbids `SELECT SUM(...) ... FOR UPDATE` (throws `ERROR: FOR UPDATE is not allowed with aggregate functions`).
- **Dedicated Budget-Control Row Locking:** Create dedicated table:
  ```sql
  CREATE TABLE ai_daily_budgets (
    date_utc DATE PRIMARY KEY,
    reserved_amount_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    actual_spent_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    max_budget_usd NUMERIC(10, 4) NOT NULL DEFAULT 5.0000,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  );
  ```
- In PostgreSQL fallback mode, API instances initiate a transaction:
  ```sql
  BEGIN;
  SELECT date_utc, reserved_amount_usd, actual_spent_usd, max_budget_usd 
  FROM ai_daily_budgets 
  WHERE date_utc = CURRENT_DATE 
  FOR UPDATE;
  ```
- **Transactional Advisory Locking:** Alternatively, instances acquire transaction advisory lock: `SELECT pg_advisory_xact_lock(hashtext('ai_daily_budget_' || CURRENT_DATE::text));`.
- **Isolation & Uniqueness:** Under `READ COMMITTED` isolation, concurrent API instances queue behind the lock; reservation is granted only if `(reserved_amount_usd + actual_spent_usd + estimated_reservation) <= max_budget_usd`.
- **Durable Uniqueness:** Unique constraint on `request_id` in `ai_usage_logs` ensures retried client calls cannot insert duplicate usage entries.

#### 2. PostgreSQL Outage & Memory-Crash Resilience
- **Volatile Buffer Realities:** Buffering usage logs in Node.js memory (`BoundedRingBuffer`, max 500 records) is **volatile, not durable**. If the container restarts or crashes from OOM, buffered records are lost.
- **Redis Operational Ledger:** When PostgreSQL is unreachable, Redis acts as the primary operational spending ledger. Atomic pre-reservations already reflect in `ai:daily_spend_usd`. Redis persistence (AOF / RDB snapshots or Redis Stream `ai:usage_events`) survives process restarts.
- **Fail-Closed Policy:** If the in-memory queue reaches 500 records or PostgreSQL remains unreachable for $> 60\text{ seconds}$, the system **fails closed**, immediately rejecting new incoming AI tutor requests with HTTP 503 rather than operating unmetered.
- **Crash Recovery:** On Node.js reboot, the startup sequence checks Redis `ai:daily_spend_usd`—it does NOT assume zero spend. If both Redis and PostgreSQL lose state, the system fails closed.

#### 3. Provider Timeout & Uncertain Completion
- **Uncertain Backend Completion:** When an upstream timeout occurs (e.g. 15s or 30s gateway timeout), Google/OpenAI may have already generated and billed tokens before the connection dropped. Releasing the entire reservation immediately causes financial leakage.
- **Status `UNKNOWN` / `RECONCILIATION_PENDING`:** The request is marked `'RECONCILIATION_PENDING'`. The reserved amount is retained in a holding reserve (`ai:pending_reconciliation_usd`) and counted against the daily budget.
- **Conservative Settlement:** For stateless Gemini streams, after a 1-hour grace period without error callbacks, the record is finalized conservatively: prompt tokens are charged plus average completion tokens (350 tokens) and modeled thinking tokens (150 tokens).

#### 4. Dynamic Reservation Calculation vs. Sanity Caps
- **Formula:**
  $$\text{Request Reservation} = (\text{Bounded Prompt Tokens} \times \text{Input Rate}) + (\text{Max Output Tokens (Visible + Thinking)} \times \text{Output Rate})$$
- For `gemini-3.1-flash-lite`:
  - Prompt tokens bounded at max 4,000 tokens: $4,000 \times \$0.25/1M = \$0.00100$.
  - Max configured output tokens (e.g. 1,500 total = 500 visible + 1,000 thinking): $1,500 \times \$1.50/1M = \$0.00225$.
  - Exact dynamic reservation = $\$0.00100 + \$0.00225 = \mathbf{\$0.00325}$.
- **$0.05 Per-Request Sanity Cap:** Clamps reservations if an oversized prompt or expensive fallback model (`gemini-3.8-flash`) is selected.
- **Maximum Possible Overshoot:** With 10 maximum concurrent queries, maximum possible temporary overshoot beyond the daily cap is $10 \times \$0.00325 = \mathbf{\$0.0325}$ (less than 4 BDT).

#### 5. Client Disconnect Socket Lifecycle & Missing Metadata Fallback
- **Socket Event:** Detected via Express/NestJS `res.on('close')` where `!res.writableEnded`. Triggers `abortController.abort()`.
- **Missing `usage_metadata`:** When a stream is aborted mid-flight, Google Gemini **does not emit the trailing `usage_metadata` frame**.
- **Conservative Accounting Fallback:**
  - Prompt tokens: counted from upfront request tokenizer.
  - Streamed tokens: counted chunk-by-chunk in memory prior to disconnect.
  - Thinking tokens: Since thinking occurs before visible tokens in Gemini 3+:
    * If $\ge 1$ visible token was emitted, charge full modeled thinking tokens (150 tokens).
    * If 0 visible tokens were emitted, charge minimum thinking allocation (75 tokens).

#### 6. Emergency Kill-Switch Behavior (`AI_TUTOR_ENABLED=false`)
- **Evaluation Order:** Evaluated before reservation and before provider dispatch.
- **New requests:** Rejected immediately with HTTP 503 Service Unavailable.
- **Running requests:** Gracefully stream to completion or abort based on shutdown timeout.
- **Unreconciled requests:** Reconciled by background worker against provider usage.
- **Recovered requests:** Evaluated against kill switch on reboot.

*Disclaimer: The proposed architecture does NOT guarantee a mathematically strict spending ceiling under cascading multi-system network partitions until empirically demonstrated in staging load tests. The proposed $5.00/day limit remains UNAPPROVED awaiting senior owner sign-off.*

---

## 6. Decision 5: Runtime Feature Flags & Emergency Kill Switches

### 6.1 Context & Background
Production operators need the capability to disable high-risk features (e.g. AI Tutor during upstream API degradation, or payment processing during database maintenance) without executing a git push and waiting 10 minutes for a container redeploy.

### 6.2 Alternatives Evaluated
- **Option A: Third-Party SaaS (LaunchDarkly / Statsig):** Adds recurring subscription overhead ($10–$50/mo) and client bundle size.
- **Option B: Self-Hosted Unleash:** Requires running a separate Docker container and PostgreSQL instance ($7–$14/mo on Render).
- **Option C: Lightweight PostgreSQL `feature_flags` Table (Selected):** Zero infrastructure cost. Stored in existing database with in-memory 60-second caching in NestJS. Modifiable via admin dashboard or simple SQL query.

### 6.3 Staff Recommendation
> **DECISION:** **Implement Lightweight PostgreSQL `feature_flags` Service.**  
> Create a table `feature_flags (key varchar PK, enabled boolean, updated_at timestamp)`. Cache flags in NestJS memory with a 60-second TTL. Expose an admin toggle endpoint for `ai_tutor_enabled`, `payments_enabled`, and `registration_enabled`.

---

## 7. Decision 6: Database Connection Pooling & Capacity Assessment

### 7.1 Render PostgreSQL Plan Details (Legacy vs. Flexible)
Render has two distinct generations of PostgreSQL plans:
1. **Legacy Starter Plan:** Fixed bundle of **256 MB RAM / 0.1 CPU and 1 GB storage** at $7.00/month. (Describing it as 1 GB RAM / 10 GB storage was incorrect!). Connection limit: **97 user connections** (100 total connections including 3 superuser reserved).
2. **New Flexible Plans:** Compute decoupled from storage. Entry-level `0.1c-256mb` is $6.00/month; storage is billed separately at **$0.30 per GB per month**. Connection limit: **100 connections** (< 8GB RAM).
3. **Free Database:** Capped at 1GB, 100 connections, and **strictly expires after 30 days**. Unusable for production.
4. **Current Status & Spending Constraint:** The existing staging database is a temporary free instance with a 30-day expiration date; production capacity remains **completely unprovisioned**. The user has explicitly prohibited additional Render spending without approval. **No new Render expense is marked as approved.**

---

### 7.2 Standardized Connection Pool Arithmetic & Headroom Analysis

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

### 7.3 Mandatory 50-VUser Concurrency Load Testing Methodology (Validation Target)
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

## 8. Decision 7: Administrator Media Architecture & Streaming (P0)

### 8.1 Elevation Justification
`apps/web/src/lib/api/catalog.ts#L192-L201` (`uploadVideoMedia`) streams 50MB–100MB files through the NestJS process. On Render Starter (512MB RAM), Node.js buffers these streams, triggering Out-Of-Memory (OOM) kills. **Direct signed client-to-Cloudinary upload is therefore a P0 production launch blocker.**

### 8.2 Complete 9-Part Target Media Architecture
1. **Upload Signature Generation:** Server endpoint `POST /api/v1/media/signature` accepts `{ folder, resourceType, expectedBytes, mimeType }`, validates role (`ADMIN`/`INSTRUCTOR`), whitelists folder, pre-creates `media` record with status `'uploading'`, and returns HMAC-SHA1 signature.
2. **Type and Size Validation:** Images max 5MB (`jpeg`, `png`, `webp`); Videos max 100MB (`mp4`, `webm`). Validated on client and enforced via signature parameters.
3. **Drag-and-Drop Handling:** `MediaUploader.tsx` attaches `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` with `e.preventDefault()`. Visual active hover state (`border-primary bg-primary/10`). Drops route directly to file validation without triggering browser file navigation.
4. **Upload Progress & Cancellation:** Axios hooks into `onUploadProgress` to drive an animated progress bar (0% - 100%). Red "Cancel" button triggers `AbortController.abort()`.
5. **Preview and Playback:** Images render Next.js `<Image>`; videos render embedded HTML5 `<video src={secureUrl} controls className="w-full max-h-48 rounded-lg" preload="metadata" />`.
6. **Replacement Workflow:** Replacing an asset preserves old `mediaId` until new upload is verified; old asset is then queued for deletion.
7. **Reliable Media Deletion (Asynchronous):** Deleting course/lesson sets FK to NULL and queues job in `media_cleanup_queue`. Asynchronous cron verifies zero other entities reference the `media_id` and executes `CloudinaryService.destroy()`.
8. **Retry and Failure Recovery:** Aborted or failed uploads remain in status `'uploading'` and are automatically purged after 24 hours by reconciliation worker.
9. **Cloudinary Cost Posture:**
   - Free Tier: 25 credits/month (~25GB storage/bandwidth).
   - Plus Tier: $89/month billed annually ($1,068/year) or $99/month billed monthly for 225 credits.
   - Action: Launch on Free tier; upgrade to Plus tier upon reaching 80% credit threshold.

---

## 9. Decision 8: Bangladesh Domain Strategy

### 9.1 Context & Regulatory Constraints
1. **BTCL `.edu.bd` Domain:** Strictly requires a government educational accreditation certificate (Ministry of Education / UGC / Technical Education Board approval letter / NOC). If TechSprout is registered as a private edtech company (Private Limited or Sole Proprietorship), BTCL **will reject** the `.edu.bd` application! Cost: 1,725 BDT for 2 years (~$0.59/mo).
2. **BTCL `.com.bd` Domain:** Available to any commercial entity with a valid Bangladesh Trade License, e-TIN, and NID. Cost: 1,725 BDT for 2 years.
3. **Commercial `.com` (Cloudflare Registrar):** Instant global registration, at-cost wholesale pricing ($11.17/year = ~$0.93/mo = ~113 BDT/mo).

### 9.2 Staff Recommendation
> **DECISION:** **Primary Domain: `techsprout.edu.bd` (if educational accreditation exists) OR `techsprout.com` (commercial edtech fallback).**  
> Register `techsprout.com` via Cloudflare Registrar immediately for international reach and DNS DDoS protection. Simultaneously submit Trade License documents to BTCL for `techsprout.com.bd` or `techsprout.edu.bd` as local brand protection.

---

## 10. Decision 9: Deployment Architecture & Monthly Financial Models

The user has explicitly prohibited unapproved spending or migrations. We present both the existing baseline architecture and the proposed alternative:

### 10.1 Configuration A: Existing Vercel + Render Architecture (Commercial Baseline)
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

### 10.2 Configuration B: Proposed Single-Platform Render Architecture
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

### 10.3 Configuration C: Development / Isolated Staging Configuration (Zero-Cost Baseline)
- Frontend: Local `pnpm dev` or Vercel Preview ($0.00).
- Backend: Local `pnpm start:dev` ($0.00) or Render Free Web Service ($0.00).
- Database: Local PostgreSQL 16.15 Docker ($0.00) or Render Free Database ($0.00, 30-day expiration).
- AI Tutor: `TUTOR_LLM_PROVIDER=mock` ($0.00).
- Email & Media: Resend Mock + Cloudinary Free ($0.00).
- **TOTAL CONFIGURATION C:** **$0.00 / month** *(Zero incremental cost; temporary testing only, not guaranteed sustainable production hosting due to 30-day staging DB expiration, Resend 100/day limit, and Cloudinary 25 credits cap).*

---

## 11. Summary Matrix & Senior Approvals

| Decision / Spending Item | Status | Approver Required | Next Action |
| :--- | :--- | :--- | :--- |
| **AI Platform Daily Budget ($5.00/day)**| **AWAITING APPROVAL** | Senior Business Owner | Approve or adjust budget cap before P0-AI-01 execution. |
| **SSLCommerz Corporate Merchant KYC** | **AWAITING SUBMISSION**| Managing Director | Submit Trade License, BIN, TIN, bank statement for Day-2 live processing. |
| **Commercial Vercel Pro ($20.00/mo)** | **AWAITING APPROVAL** | Technical Lead | Required if frontend remains on Vercel for paid commercial launch. |
| **Primary Domain Selection** | **AWAITING DECISION** | Managing Director | Decide between BTCL `.edu.bd` (needs educational NOC) vs Cloudflare `.com`. |
| **Production Seed Data Purge** | **AWAITING APPROVAL** | Database Administrator | Approve execution of `clean-seed-data.ts`. |

---
*Register reconciled independently by Antigravity Senior Staff Auditor on November 5, 2026. Target Version: v2.2.2.*
