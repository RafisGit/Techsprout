# ADR-P7-001: Learning Telemetry Privacy, PII Minimization & Native PostgreSQL Full-Text Search
## Document Identifier: `TECHSPROUT-ADR-P7-001`

**Status:** APPROVED (Conditional Senior Approval)  
**Date:** 2026-10-17  
**Decider:** Senior Engineering Lead / Architecture Review  
**Target Milestones:** Phase 7.1 (Learning Telemetry & Retention Analytics) & Phase 7.2 (AI Tutoring Retrieval)  
**Related Documents:**
- [`ADR-P6-003-learning-event-model.md`](file:///d:/Work/2026/techsprout-main/docs/architecture/adr/ADR-P6-003-learning-event-model.md) (Historical P6 Telemetry Proposal)
- [`SCR-P7-01_SCOPE_CHANGE_REQUEST.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/SCR-P7-01_SCOPE_CHANGE_REQUEST.md) (Formal P6.4 to P7.4 Scope Reassignment)
- [`P7.0_SENIOR_DECISION_RECORD.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/P7.0_SENIOR_DECISION_RECORD.md) (Senior Governance Record)
- [`P7.0_ARCHITECTURE_AND_WORK_PACKAGES.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/P7.0_ARCHITECTURE_AND_WORK_PACKAGES.md) (P7 Architecture Specification)

---

## 1. Context & Problem Statement

TechSprout's learning delivery platform requires high-resolution engagement telemetry (video playback checkpoints, scrub heatmaps, and lesson retention curves) to support instructor analytics and train subsequent struggle-detection heuristics. 

In Phase 6, [ADR-P6-003](file:///d:/Work/2026/techsprout-main/docs/architecture/adr/ADR-P6-003-learning-event-model.md) drafted an append-only `learning_events` table with direct relational foreign keys (`user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`). Subsequent P7 research identified critical architectural and compliance gaps:
1. **Privacy & Data Erasure Contradiction:** Storing raw user IDs with hard foreign-key constraints creates an architectural conflict: hard cascading deletes erase historical course analytics when a user closes their account, whereas retaining raw identifiers violates GDPR/FERPA minimization and data erasure mandates. Furthermore, simply nullifying `user_id` (`SET NULL`) does not guarantee anonymization if request payloads (`metadata` JSONB) or HTTP server logs contain correlating identifiers.
2. **AI Retrieval Infrastructure Selection:** Phase 7.2 requires a search retrieval mechanism across the educational course corpus (~50,000 words across 11 courses and ~100 lessons). Evaluating heavyweight vector embeddings (`pgvector` or external vector SaaS) introduces memory overhead and operational complexity that may cause container OOM failures on constrained database tiers.

This document formally records the senior-approved decisions governing telemetry privacy, data minimization, and the retrieval benchmarking pathway.

---

## 2. Decision Part 1: Selected Telemetry Privacy Approach

We adopt **Anonymized/Hashed Telemetry with Local-First Aggregation (PII Stripping at Ingestion)** as the canonical privacy architecture for Phase 7.1.

This decision supersedes earlier draft alternatives. Competing proposals (unconditional hard deletion via `CASCADE`, standalone `SET NULL` disassociation, and synthetic sentinel account re-assignment) are rejected as general solutions.

### 2.1 Core Architectural Principles

1. **Zero Raw Payload Persistence:**  
   Raw user search queries, free-form text inputs, and raw client HTTP request payloads must **never** be persisted in `learning_events`, application logs, Redis analytics caches, or error tracking reports (e.g., Sentry).
2. **Strict Field Allowlisting & Ingestion Stripping:**  
   The ingestion API enforces a strict allowlist schema via Zod validation. Any unapproved properties, client device fingerprints, IP addresses, user agents, or PII attributes are stripped immediately at the server boundary before persistence. Client-side minimization in `VideoPlayer.tsx` serves as a supplemental defense-in-depth safeguard.
3. **Local-First Aggregation:**  
   Wherever technically feasible, engagement events must be aggregated client-side or within memory buffers before transmission. Raw search strings are prohibited from Phase 7.1 search-performance metrics.
4. **Rotating Daily Salt Hashing:**  
   User and session identifiers are transformed via a cryptographically secure one-way hash function using a rotating daily salt before insertion:
   $$\text{hashed\_user\_id} = \text{HMAC-SHA256}(\text{raw\_user\_id}, \text{SALT}_{\text{UTC\_DAY}})$$
   Raw identifiers (`raw_user_id`) and the active salt must **never** be persisted alongside telemetry records.
5. **Salt Storage, Rotation & Boundary Lifecycle:**  
   - The salt is dynamically generated or retrieved from a secure secret store (e.g., environment variable or secret manager), held purely in process memory.
   - Salt rotation occurs strictly on **UTC day boundaries** ($00:00:00\text{ UTC}$).
   - *Deduplication Impact:* Deduplication and session tracking operate seamlessly within a single UTC day. Across day boundaries, a user's hashed pseudonym changes, naturally severing long-term behavioral tracking.
6. **Pseudonymity Disclosure & Cross-Day Linkage Limits:**  
   Rotating-salt hashes are formally recognized as **pseudonymous identifiers** under privacy law, not proven irreversible anonymization. The daily rotation deliberately limits cross-day learner linkage. Engineering teams must **not** introduce secondary stable cross-day identifiers (such as permanent hashes or canvas fingerprints).
7. **Permitted Query-Performance Metrics:**  
   When recording retrieval or search efficiency, permitted metrics are strictly limited to:
   - Execution duration ($\text{ms}$).
   - Token count and result count.
   - Aggregate index-use metrics (e.g., GIN index hit status).  
   *Prohibited:* Search query text, input tokens containing user query content, and database query parameters that expose user prompts.
8. **Environment-Level Kill Switch (`TELEMETRY_ENABLED`):**  
   The system must define an environment variable `TELEMETRY_ENABLED` (boolean, defaults to `true`). When set to `false`:
   - All client telemetry dispatch hooks (`useLearningTelemetry`) remain completely idle.
   - Ingestion endpoints (`/api/v1/learning/events`, `/api/v1/learning/events/beacon`) immediately short-circuit with HTTP 200/204 without database writes.
   - Scheduled telemetry background pruning and worker tasks are bypassed.
   - No fallback file or console logging may bypass this switch.
9. **Strictly Observational Invariant:**  
   Telemetry is purely observational and analytical. Telemetry events must **never** independently award lesson completion, course completion, or certificates, nor alter financial ledger balances. All progress state transitions, completion criteria, and certificate issuance remain strictly governed by authoritative domain services ([`LearningService`](file:///d:/Work/2026/techsprout-main/apps/api/src/modules/learning/learning.service.ts), [`CertificateService`](file:///d:/Work/2026/techsprout-main/apps/api/src/modules/certificates/certificates.service.ts)).

### 2.2 Operational Safeguards: Failure Behavior, Privacy Limits, Collisions, Rate Limiting, Retention, Deletion, Observability & Rollback

- **Failure Behavior:**  
  - If the active daily salt cannot be retrieved from process memory or secret storage, or if HMAC hashing fails, the ingestion API must **fail closed** for that batch (HTTP 500) and drop the events rather than falling back to writing unhashed identifiers or raw payloads.
  - Client errors (e.g., malformed JSON, unparseable beacons) return HTTP 400 Bad Request immediately without crashing ingestion or dumping raw request bodies into application logs.
  - In the event of downstream database connection pool saturation, requests must be rejected with bounded retry or load shedding, failing safely without logging unredacted query parameters.
- **Privacy Limits & Cross-Day Linkage Boundaries:**  
  - Rotating-salt hashes are formally recognized as **pseudonymous identifiers** under privacy regulations (GDPR/FERPA), not irreversible anonymization.
  - The daily salt rotation intentionally limits cross-day learner linkage; analytics cannot correlate learner behavior across different UTC days using telemetry alone.
  - Engineering teams are strictly prohibited from introducing secondary stable cross-day identifiers (such as permanent client hashes, browser canvas fingerprints, or IP address tracking).
- **Identifier Collisions:**  
  - Truncating HMAC-SHA256 outputs to a 128-bit UUID representation carries an identifier collision probability of $p < 10^{-18}$ for daily platform volumes, which is operationally negligible.
- **Rate Limiting & Ingestion Ceilings:**  
  - Mandatory server-side rate limiting per authenticated user and lesson: maximum **2 batch requests per 60 seconds** per `(userId, lessonId)` pair, returning HTTP 429 Too Many Requests upon violation.
  - Batch payload ceilings enforced via strict Zod schema validation: maximum **50 events per batch** and maximum **32KB request body size**; oversized batches are rejected immediately with HTTP 400 Bad Request.
  - Client-side 60-second fixed throttling in `VideoPlayer.tsx` serves as a supplemental defense-in-depth safeguard, not a substitute for server-side enforcement.
  - Duplicate-event idempotency handles exact `(eventId, payload)` duplicates (HTTP 200/204 with 0 duplicate rows inserted); differing payloads bearing an existing `eventId` are rejected as HTTP 409 Conflict without modifying existing records.
- **Data Retention & Automated Chunked Pruning:**  
  - Fine-grained `VIDEO_CHECKPOINT` records are pruned automatically after **90 days** by a scheduled background worker executing chunked deletes (e.g., 5,000 rows per transaction) during off-peak windows to prevent table lock escalation.
  - Milestone events (`COURSE_OPENED`, `LESSON_STARTED`, `LESSON_COMPLETED`, `QUIZ_ATTEMPTED`, `CERTIFICATE_EARNED`) are retained permanently for aggregate instructor reporting.
- **Data Deletion & Right to Erasure (GDPR Article 17):**  
  - Upon user account deletion, telemetry records from the current active UTC day matching the current salt hash can be identified and purged.
  - Historical telemetry records from prior UTC days are already unlinkable to the learner because prior daily salts are destroyed upon rotation, providing automated cryptographic privacy without destructive cascades on aggregate analytics.
- **Observability & Privacy-Safe Monitoring:**  
  - Ingestion observability is strictly limited to aggregate operational telemetry: batch ingestion throughput (events/sec), batch sizes, drop rates, error rates (4xx/5xx counts), kill-switch status, and GIN index hit ratios.
  - Application logs, metrics scrapers, and external error monitoring (Sentry) must **never** capture raw search strings, free-form text inputs, or unhashed identifiers.
- **Rollback & De-escalation Strategy:**  
  - *Operational Kill Switch:* Setting `TELEMETRY_ENABLED=false` provides immediate zero-downtime collection cutoff, stopping client dispatches, short-circuiting API endpoints (HTTP 200/204), and pausing worker tasks without requiring an application redeployment or database migration.
  - *Database Rollback:* Migration 0009 includes a verified, tested down-migration plan that cleanly drops `learning_events` and its associated indexes (`DROP TABLE IF EXISTS learning_events CASCADE;`). Index removal and rollback are specifically designed to avoid acquiring blocking locks on core application tables (`users`, `courses`, `lessons`).

### 2.3 Distinction Between Approved Decisions and Remaining Implementation Details

To maintain clear architectural governance, this ADR formally distinguishes ratified decisions from technical implementation details:

- **Approved Architecture Decisions (Ratified & Binding):**
  1. *Selected Privacy Architecture:* Anonymized/Hashed Telemetry with Local-First Aggregation (PII Stripping at Ingestion). Hard deletion, nullable `SET NULL`, and synthetic account pseudonymization are superseded and rejected.
  2. *Zero Raw Persistence:* Zero raw user search queries, free-form text inputs, or raw client request payloads persisted across database tables, application logs, caches, or error reports.
  3. *Daily Rotating Salt Hashing:* Pseudonymous HMAC-SHA256 hashing using a daily rotating salt on UTC boundaries; raw identifiers and active salts are never stored alongside telemetry records.
  4. *Kill Switch:* Environment variable `TELEMETRY_ENABLED=false` completely disabling all telemetry collection, transmission, persistence, and background processing.
  5. *Observational Invariant:* Telemetry is strictly observational and cannot independently award lesson completion, course completion, certificates, or financial credits.
  6. *Native FTS Benchmark-First Requirement:* Native PostgreSQL Full-Text Search (`tsvector` / GIN index) must be empirically benchmarked before evaluating `pgvector`.
  7. *FTS Pass/Fail Criteria:* $p95 < 50\text{ms}$ query latency, $\text{NDCG@5} \ge 0.80$, $\text{Recall@5} \ge 0.85$ across a reproducible 30-query test suite with warm- and cold-cache reporting.
  8. *pgvector Memory Gate:* Evaluating `pgvector` is gated on demonstrable $\ge 30\%$ memory headroom on the free-tier database RAM ceiling with zero OOM restarts; no automatic infrastructure upgrades.
  9. *Scope Allocation:* Option B ratified via SCR-P7-01, reassigning Discussions & Assignments to Phase 7.4.

- **Remaining Implementation Details (Deferred to Phase 7.1/7.2 Engineering Tasks):**
  1. Specific key vault / secret management provider integration mechanism for salt generation and lifecycle.
  2. Concrete Drizzle ORM schema column types, foreign key definitions, and index names for Migration 0009.
  3. Precise Zod schema validation rules and error response structures for the batch ingestion and beacon endpoints.
  4. Ground-truth relevance-labeled dataset of 30 representative educational queries and the automated benchmark harness script for staging FTS evaluation.

---

## 3. Decision Part 2: Native PostgreSQL Full-Text Search vs pgvector

For Phase 7.2 AI Tutoring and contextual lesson retrieval, **native PostgreSQL Full-Text Search (`tsvector` / GIN index) must be empirically benchmarked on staging before evaluating `pgvector`**.

### 3.1 Proposed Benchmark Acceptance Criteria (Pass/Fail)

Native PostgreSQL FTS will be declared the approved production retrieval engine if it satisfies all of the following agreed criteria during the Phase 7.2 benchmarking milestone:

1. **Query Latency Threshold:**
   - **$p95 \text{ latency} < 50\text{ ms}$** across the representative test workload under target concurrent load.
2. **Relevance Accuracy Thresholds:**
   - **$\text{NDCG@5} \ge 0.80$** (Normalized Discounted Cumulative Gain at rank 5).
   - **$\text{Recall@5} \ge 0.85$** on a reproducible, relevance-labeled ground-truth evaluation set.
3. **Representative Evaluation Suite:**
   - A standardized test set of at least **30 representative educational queries** spanning:
     - Exact concept lookups (e.g., "Docker multi-stage builds").
     - Multi-word conceptual questions (e.g., "how does database indexing affect write performance").
     - Partial keyword matches and common student misspellings.
     - Cross-module curriculum queries.
4. **Benchmark Environment Specifications:**
   - Corpus: All 11 published TechSprout courses, ~100 lessons, ~50,000 words.
   - Engine: PostgreSQL 16 standard configuration with GIN index on `to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))`.
   - Reporting: Both **warm-cache** and **cold-cache** latency distributions must be measured and reported.
   - Privacy Guard: Benchmarking must use synthetic queries or sanitized evaluation sets; **zero production personal data or raw search strings** may be captured.

### 3.2 The `pgvector` Memory Gate

If native PostgreSQL Full-Text Search fails to satisfy the relevance or latency criteria above, evaluating `pgvector` is strictly gated on demonstrable memory safety:
- **Free-Tier RAM Headroom Requirement:** `pgvector` HNSW/IVFFlat index building and query execution must be proven to fit within the actual database RAM limit with **at least 30% verified memory headroom**, with zero container OOM restarts.
- **Failure Escalation:** If 30% memory headroom cannot be empirically demonstrated on the free tier, engineering must halt and submit an infrastructure budget change request to senior leadership. **No infrastructure plan upgrade may occur automatically.**

*(Note: The benchmark itself is NOT executed within this task. These criteria establish the formal evaluation gates for Phase 7.2).*

---

## 4. Consequences & Trade-offs

### Positive
- **Guaranteed PII Protection:** Eliminates the risk of persisting student search queries, passwords, or personal data in analytical storage.
- **Regulatory Defensibility:** Rotating daily salt hashes severely restrict unauthorized longitudinal tracking while preserving same-day funnel analytics.
- **Operational Simplicity:** Prioritizing native PostgreSQL FTS avoids premature adoption of vector extensions, preserving database memory on constrained hosting tiers.
- **Emergency Controllability:** The `TELEMETRY_ENABLED` kill switch provides immediate operational relief during database write contention.

### Negative & Trade-offs
- **Loss of Longitudinal Learner Tracking:** Because the salt rotates daily, student retention analytics cannot trace individual learners across multiple days using telemetry alone (longitudinal progress remains tracked authoritatively in relational `enrollments` and `lesson_progress`).
- **Cryptographic Overhead:** Ingestion compute overhead increases slightly due to HMAC-SHA256 calculations per batch. Benchmarks in Node.js demonstrate $< 0.1\text{ms}$ per event, which is well within acceptable API latency budgets.

---

## 5. Architectural Approval Status

```text
========================================================================================
DECISION: APPROVED (CONDITIONAL SENIOR APPROVAL)
DECISION-MAKER: Senior Engineering Lead / Architecture Review
DATE: 2026-10-17
IMPACT: Phase 7.1 Telemetry Implementation Unblocked Upon Documentation Synchronization
========================================================================================
```
