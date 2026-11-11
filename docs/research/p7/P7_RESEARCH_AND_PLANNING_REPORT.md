# TECHSPROUT — PHASE 7.0 MASTER RESEARCH, SCOPE RECONCILIATION & ARCHITECTURE REVIEW

**Document Identifier:** `TECHSPROUT-P7.0-MASTER-REPORT`  
**Milestone Target:** Phase 7.0 Research, Scope Reconciliation & Architecture Review  
**Date:** 2026-10-15  
**Author:** Staff System Architect, Principal Data Infrastructure Lead, QA & Release Governance  
**Status:** **RESEARCH & PLANNING COMPLETE — IMPLEMENTATION FROZEN**  
**Repository Baseline:** `RafisGit/Techsprout` at commit `491b0d055f14a84bfcce45c0576c685f1017d661` (P6.3 Production Baseline)  
**Accepted Operational Waiver Reference:** `WVR-P6.3-CACHE-01`  
**Companion Artifacts:**
- Current-State Audit: [`P7.0_CURRENT_STATE_AUDIT.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_CURRENT_STATE_AUDIT.md)
- Scope Reconciliation & Boundaries: [`P7.0_SCOPE_RECONCILIATION_AND_BOUNDARIES.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_SCOPE_RECONCILIATION_AND_BOUNDARIES.md)
- Architecture & Risk Review: [`P7.0_ARCHITECTURE_AND_RISK_REVIEW.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_ARCHITECTURE_AND_RISK_REVIEW.md)
- Phasing & Implementation Plan: [`P7.0_PHASING_AND_IMPLEMENTATION_PLAN.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_PHASING_AND_IMPLEMENTATION_PLAN.md)

---

## 1. Executive Summary

Phase 6.3 (Analytics & Reporting) was successfully deployed and verified in production at commit `491b0d055f14a84bfcce45c0576c685f1017d661`, with all 45 recorded smoke tests passing and operational limitation `WVR-P6.3-CACHE-01` (Redis shell unobservability on Render Free plan) formally accepted.

This authoritative document establishes the master research, codebase audit, scope reconciliation, and architectural framework for **Phase 7 (Intelligent Learning, Telemetry & Platform Expansion)**.

### Core Strategic Findings:
1. **Current Codebase Readiness:** The monorepo possesses a robust transactional foundation (1,507 passing automated tests, zero-trust resource ownership, Drizzle ORM migrations 0000–0008, Cloudinary signed media, and SSLCommerz payments). However, client progress tracking currently overwrites state in place in `lesson_progress`, lacks a `navigator.sendBeacon()` exit handler, and has zero event history. The `learning_events` table is strictly absent.
2. **Scope Boundary Conflict Resolved:** The initial P7 draft report erroneously bundled **Interactive Discussions and Hands-on Assignments** into Phase 7 as WP-P7-03, describing them as "deferred P6.4 work." Codebase and roadmap inspection proves that Discussions and Assignments were formally chartered under **Milestone P6.4** in `TECHSPROUT-P6.0-SCOPE`. This report isolates this scope drift and recommends retaining P6.4 as an independent milestone or issuing a formal Scope Change Request (`SCR-P7-01`) rather than silently diluting Phase 7.
3. **Phased Architecture Over Monolithic Delivery:** Phase 7 is broken down into three focused, dependency-ordered sub-phases:
   - **Phase 7.1 — Learning Telemetry & Retention Analytics (6.5 – 9.5 Days) [RECOMMENDED FIRST]**
   - **Phase 7.2 — AI Tutoring & Contextual Learning Engine (6.0 – 9.0 Days)**
   - **Phase 7.3 — Instructor Monetization & Marketplace Ledger (5.5 – 8.0 Days)**
4. **Preservation of Financial Invariants:** TechSprout preserves its single-merchant SSLCommerz customer checkout model. Marketplace monetization (P7.3) is designed as an internal double-entry accounting ledger with a 14-day escrow hold period. No multi-merchant gateway routing is introduced.
5. **Infrastructure Realism:** Telemetry ingestion is architected to operate safely within Render Free tier limits for MVP (using Direct PostgreSQL batch inserts with connection pooling) while providing a clear upgrade path to Render Starter compute (~$7/mo) to guarantee 24/7 background worker uptime and resolve `WVR-P6.3-CACHE-01`.

> **STRICT SAFETY & GOVERNANCE INVARIANT:**  
> This package is strictly for research, architectural feasibility, and planning. **Zero production code, database migrations, or cloud infrastructure modifications have been performed or authorized.**

---

## 2. Current-State Audit Summary (Work Package 1)

Every architectural finding was inspected against the live codebase and classified into verified categories:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT-STATE AUDIT SUMMARY                               │
├────┬─────────────────────────────┬───────────────────┬─────────────────────────────────┤
│ #  │ Architectural Domain        │ Status            │ Key Symbols & References        │
├────┼─────────────────────────────┼───────────────────┼─────────────────────────────────┤
│ 1  │ Video Playback & Progress   │ VERIFIED          │ VideoPlayer.tsx, progress.ts    │
│ 2  │ Domain-Event Outbox         │ VERIFIED          │ outbox.service.ts, domain-event │
│ 3  │ BullMQ & Redis Queues       │ VERIFIED          │ queue.service.ts, 25MB limit    │
│ 4  │ PostgreSQL & Migrations     │ VERIFIED          │ migrate.ts, _journal.json (0-8) │
│ 5  │ Auth, RBAC & Ownership      │ VERIFIED          │ ResourceOwnershipGuard, Throttle│
│ 6  │ Cloudinary Media            │ VERIFIED          │ media.service.ts, commit 4e4f94e│
│ 7  │ Core Payments & Finance     │ VERIFIED          │ payments.service.ts, finance.ts │
│    │ Instructor Wallets / Ledger │ NOT IMPLEMENTED   │ Zero schema or services exist   │
│ 8  │ Tests & Deployment          │ VERIFIED          │ 1,507 tests, render.yaml        │
│    │ Live Redis Shell Access     │ UNKNOWN           │ Blocked by WVR-P6.3-CACHE-01    │
└────┴─────────────────────────────┴───────────────────┴─────────────────────────────────┘
```

- **Video Playback:** Checks progress every 15s; 90% threshold marks completed (`learning.service.ts:L794`). Performs in-place `onConflictDoUpdate` overwrite. Tab exits during unmount are unreliably handled via standard `Promise`. No time-series `learning_events` table exists.
- **Domain Events & Outbox:** `OutboxService` persists to `outbox_events` and enqueues to BullMQ `techsprout-notifications`. Suitable for low-frequency transactional events; completely unsuitable for high-frequency video heartbeats.
- **Queues & Redis:** Two BullMQ queues (`techsprout-queue`, `techsprout-notifications`) and one caching client (`AnalyticsCacheService`). Render Free Redis has a 25MB RAM limit with `noeviction`.
- **Database:** Drizzle ORM v0.39.3 with migrations 0000–0008. Migrations run in an atomic transaction; `CREATE INDEX CONCURRENTLY` cannot be used inside the runner.
- **Security & RBAC:** `JwtAuthGuard`, `RolesGuard`, `ResourceOwnershipGuard` (enforces instructor ownership across courses, modules, lessons, quizzes, media), and global `ThrottlerGuard`.
- **Media:** Cloudinary pre-signed uploads and proxy streams. Media ownership strictly enforced since commit `4e4f94e`.
- **Finance & Monetization:** Single-merchant SSLCommerz integration storing minor units (poisha). Reconciliation and formula-injection-safe CSV export active. Instructor wallets, revenue splits, and payout engines are **NOT IMPLEMENTED**.

*(For full file-by-file audit evidence, see [`P7.0_CURRENT_STATE_AUDIT.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_CURRENT_STATE_AUDIT.md)).*

---

## 3. Scope Reconciliation & Boundary Resolution (Work Package 2)

### 3.1 The P6.4 Conflict Analysis
- In `docs/qa/p6.0-scope.md`, **Interactive Discussions & Hands-on Project Assignments** were explicitly defined as **Milestone P6.4** ("SHOULD HAVE for Phase 6").
- The initial draft report `P7_RESEARCH_AND_PLANNING_REPORT.md` unilaterally moved Discussions and Assignments into Phase 7 (Track 3, WP-P7-03).
- **Impact of Conflict:**
  - Inflated Phase 7 into an unmanageable 33.5-day mega-phase.
  - Conflated data/telemetry infrastructure with pedagogical forum/grading workflows.
  - Bypassed formal release governance.

### 3.2 Formal Governance Recommendation
1. **Discussions and Assignments MUST NOT be silently imported into Phase 7.**
2. **Recommendation Option A (RECOMMENDED):** Retain Discussions and Assignments as **Milestone P6.4**, scheduled and executed as an independent release, allowing Phase 7 to proceed purely as an intelligent data and monetization platform.
3. **Recommendation Option B (Formal SCR-P7-01):** If leadership officially closes Phase 6 without P6.4, require formal approval of Scope Change Request `SCR-P7-01` to reassign Discussions and Assignments into a dedicated future sub-phase (**Phase 7.4**), keeping P7.1 through P7.3 clean.

### 3.3 Explicit Out-of-Scope Register for Phase 7
- **Discussions & Assignments:** Retained under P6.4 governance boundary.
- **Multi-Merchant Gateway Integration:** Excluded; single-merchant SSLCommerz invariant preserved.
- **Automated Real-Time Gateway Splits:** Excluded; SSLCommerz does not support split payouts.
- **Live Video Streaming Servers (WebRTC/RTMP):** Excluded; external meeting URLs remain standard.
- **SCORM / LTI Packaging:** Permanently excluded.
- **Recurring Subscriptions:** Deferred to Phase 8+.
- **External Data Warehouses (ClickHouse/Snowflake):** Excluded; operates within PostgreSQL 16 tier.

*(For detailed scope governance analysis, see [`P7.0_SCOPE_RECONCILIATION_AND_BOUNDARIES.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_SCOPE_RECONCILIATION_AND_BOUNDARIES.md)).*

---

## 4. Phase 7 Phasing & Work Package Sequence (Work Package 3)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PROPOSED PHASE 7 PHASING ROADMAP                          │
├───────────┬─────────────────────────────────────────────────┬──────────────┬───────────┤
│ Phase     │ Strategic Focus                                 │ Effort (Days)│ Risk Level│
├───────────┼─────────────────────────────────────────────────┼──────────────┼───────────┤
│ Phase 7.1 │ Learning Telemetry & Retention Analytics        │ 6.5 – 9.5    │ Low       │
│ Phase 7.2 │ AI Tutoring & Contextual Learning Engine        │ 6.0 – 9.0    │ Medium    │
│ Phase 7.3 │ Instructor Monetization & Marketplace Ledger    │ 5.5 – 8.0    │ Medium    │
├───────────┼─────────────────────────────────────────────────┼──────────────┼───────────┤
│ TOTAL     │ Progressive Intelligent LMS Platform            │ 18.0 – 26.5  │ Managed   │
└───────────┴─────────────────────────────────────────────────┴──────────────┴───────────┘
```

### Recommended First Implementation Milestone: Phase 7.1
**Phase 7.1 (Learning Telemetry & Retention Analytics)** is strongly recommended as the immediate first milestone because:
1. It establishes the append-only time-series data foundation required by AI struggle-detection models in P7.2.
2. It fixes the audited client-side data loss gaps in `VideoPlayer.tsx`.
3. It carries zero financial or transaction risk.
4. It can be delivered, tested, and promoted within 6.5 – 9.5 engineering days.

### Phase 7.1 Work Packages:
- **WP-P7.1-01:** Telemetry Schema (`learning_events`, Migration 0009), Batch Ingestion API, Zod Validation, Enrollment Guard, 90-Day Chunked Pruning Cron (3.0 – 4.5 Days).
- **WP-P7.1-02:** Client `useLearningTelemetry` Hook, `sendBeacon` Unload Transport, Retention Curve API, Accessible SVG Visualizations in Course Analytics (2.5 – 3.5 Days).
- **WP-P7.1-03:** Security Hardening, Ingestion Load Benchmark (500 events/sec), Staging Acceptance, Release Gate Report (1.5 – 2.5 Days).

*(For complete work package specifications and acceptance criteria, see [`P7.0_PHASING_AND_IMPLEMENTATION_PLAN.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_PHASING_AND_IMPLEMENTATION_PLAN.md)).*

---

## 5. Architecture Decisions Requiring Senior Approval (Work Package 4)

The following architectural decision records (ADRs) are submitted for senior engineering sign-off:

| ADR ID | Decision Title | Options Evaluated | Recommendation | Rationale |
|---|---|---|---|---|
| **DEC-P7-01** | Telemetry Ingestion Buffering | A. Direct Postgres INSERT<br>B. BullMQ Queue Buffer<br>C. In-Memory Node Buffer | **Option A (MVP) $\rightarrow$ Option B (Post-Upgrade)** | Free Redis (25MB limit) cannot safely buffer high-volume queues. Direct PostgreSQL batch insert is safe for MVP; transition to BullMQ once Starter Redis ($10/mo) is provisioned. |
| **DEC-P7-02** | Client Transport Protocol | A. Polling fetch()<br>B. navigator.sendBeacon()<br>C. WebSocket | **Option B: sendBeacon + fetch keepalive** | Solves unmount exit data loss during browser tab closures without thread blocking. |
| **DEC-P7-03** | Telemetry Data Retention | A. Infinite retention<br>B. 90-day pruning of checkpoints<br>C. Zero heartbeats | **Option B: 90-day checkpoint pruning** | Prevents disk bloat on Render PostgreSQL; milestone events (`COMPLETED`, `STARTED`) are kept permanently. |
| **DEC-P7-04** | AI Tutor Vector Storage | A. PostgreSQL `pgvector`<br>B. Serverless Vector SaaS<br>C. PostgreSQL Full-Text Search | **Benchmark C vs A in P7.2** | Verify `pgvector` extension availability and RAM overhead on Render before committing; use full-text search as fallback. |
| **DEC-P7-05** | Marketplace Settlement Model | A. Real-time split gateway<br>B. Internal double-entry ledger | **Option B: Internal ledger + batch payout** | SSLCommerz single-merchant invariant preserved. Gateway does not support real-time splits in Bangladesh. |
| **DEC-P7-06** | Escrow Refund Hold Period | A. Immediate payout<br>B. 14-day hold in pending balance | **Option B: 14-day escrow hold** | Protects platform from uncollectible debts if a student requests a refund after instructor payout. |
| **DEC-P7-07** | Migration Index Execution | A. Transactional standard index<br>B. Non-transactional runner | **Option A: Standard index off-peak** | Drizzle migrator runs inside transactions. New table `learning_events` is empty at migration time; lock duration $< 50\text{ms}$. |
| **DEC-P7-08** | Compute Tier Upgrade | A. Stay on Free ($0/mo)<br>B. Upgrade to Starter ($7/mo) | **Recommend Option B prior to P7.1 release** | Eliminates 15-min idle spin-down, guarantees continuous BullMQ worker execution, and closes `WVR-P6.3-CACHE-01`. |

*(For architectural diagrams, database schemas, and mathematical formulations, see [`P7.0_ARCHITECTURE_AND_RISK_REVIEW.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7.0_ARCHITECTURE_AND_RISK_REVIEW.md)).*

---

## 6. Security and Operational Risk Register

| Risk ID | Failure Scenario | Impact | Likelihood | Mitigation Strategy |
|---|---|:---:|:---:|---|
| **RSK-P7-01** | DB write lock spikes from video heartbeats | **HIGH** | **HIGH** | 60s client-side throttle; batch payload API; connection pooling; 90-day chunked pruning cron. |
| **RSK-P7-02** | Redis OOM crash on Render Free plan (25MB limit) | **HIGH** | **MED** | Keep telemetry off Redis during MVP; upgrade to Render Starter Redis ($10/mo) for queue buffering. |
| **RSK-P7-03** | Telemetry spoofing by malicious students | **MED** | **MED** | Ingestion endpoint verifies active course enrollment; validates timestamp and duration bounds via Zod. |
| **RSK-P7-04** | LLM hallucination or prompt injection in AI Tutor | **HIGH** | **HIGH** | Strict RAG prompt constraints; context similarity threshold $\ge 0.75$; system prompt declares ignorance if ungrounded. |
| **RSK-P7-05** | Financial discrepancies in instructor wallets | **CRITICAL** | **LOW** | Immutable double-entry ledger; DB check constraint `balance_cents >= 0`; integer minor units; wrapped DB transactions. |
| **RSK-P7-06** | Student refund processed after instructor funds disbursed | **HIGH** | **LOW** | 14-day escrow hold period; funds remain in `pending_balance_cents` until refund window closes. |
| **RSK-P7-07** | Worker stoppage during Render Free container spin-down | **HIGH** | **HIGH** | Catch-up queue drain on wake-up; recommend upgrading compute tier to Starter ($7/mo). |
| **RSK-P7-08** | Table lock spikes during Migration 0009 execution | **MED** | **LOW** | Table `learning_events` is empty at migration time; index creation lock completes in $< 50\text{ms}$. |

---

## 7. Infrastructure Evaluation & Cost Comparison

*Note: All monetary figures are non-binding estimates based on public Render cloud pricing and are subject to organizational billing agreements.*

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              INFRASTRUCTURE TIER COMPARISON                            │
├────────────────────┬─────────────────────────────┬─────────────────────────────────────┤
│ Component          │ Option 1: Render Free ($0)  │ Option 2: Recommended Starter (~$24)│
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ REST API Compute   │ Plan: Free ($0/mo)          │ Plan: Starter ($7/mo)               │
│                    │ 15m idle spin-down; no shell│ Always-on; full container terminal  │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Managed Redis      │ Plan: Free ($0/mo)          │ Plan: Starter ($10/mo)              │
│                    │ 25MB RAM; noeviction policy │ 256MB+ RAM; queue buffer safe       │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Managed PostgreSQL │ Plan: Free ($0/mo)          │ Plan: Starter ($7/mo)               │
│                    │ 1GB disk; 50 connections    │ Persistent disk; high connection pool│
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Monthly Cost       │ **$0.00 / month**           │ **~$24.00 / month**                 │
├────────────────────┼─────────────────────────────┼─────────────────────────────────────┤
│ Operational Impact │ Telemetry runs via direct DB│ Enables high-throughput BullMQ micro│
│                    │ writes; workers sleep idle; │ batching; 24/7 worker uptime; closes│
│                    │ WVR-P6.3-CACHE-01 remains.  │ waiver WVR-P6.3-CACHE-01.           │
└────────────────────┴─────────────────────────────┴─────────────────────────────────────┘
```

---

## 8. Senior Approval Checklist

Before any Phase 7 implementation work may be authorized, the following formal sign-offs are required:

- [ ] **Scope Reallocation Decision:** Formally approve retaining Discussions & Assignments as Milestone P6.4 (Option A) OR approve Scope Change Request `SCR-P7-01` reallocating them to Phase 7.4 (Option B).
- [ ] **Phased Milestone Sequence Approval:** Approve staging Phase 7 into P7.1 (Telemetry), P7.2 (AI), and P7.3 (Monetization).
- [ ] **Phase 7.1 Charter Sign-Off:** Authorize immediate kickoff of **Phase 7.1 (Learning Telemetry & Retention Analytics)** (estimated at 6.5 – 9.5 days).
- [ ] **Architectural Decisions Approval:** Formal approval of candidate decisions `DEC-P7-01` through `DEC-P7-08`.
- [ ] **Financial Invariant Confirmation:** Formal reaffirmation of the single-merchant SSLCommerz checkout invariant and 14-day escrow hold policy.
- [ ] **Infrastructure Upgrade Decision:** Determine whether to launch P7.1 on Render Free tier with direct DB ingestion ($0/mo) or authorize compute/Redis upgrade to Render Starter (~$7–$24/mo).

---

## 9. Review Conclusion & Formal Verdict

This research and planning package provides the complete, evidence-backed foundation required to transition TechSprout into Phase 7 with zero technical ambiguity and rigorous release discipline.

```text
========================================================================================
FINAL VERDICT: P7.0 RESEARCH READY FOR REVIEW
========================================================================================
```
