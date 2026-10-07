# ADR-P6-003: Append-Only Learning Event Model & Analytics Architecture
## Document Identifier: `TECHSPROUT-ADR-P6-003`
**Status:** PROPOSED (P6.0 Architecture Freeze Candidate)  
**Date:** 2026-10-07  
**Deciders:** TechSprout Engineering Team (Data Architect, Backend Architect, Product Lead)  
**Target Milestone:** P6.3  

---

## 1. Context

In Phase P3, TechSprout implemented granular lesson progress tracking (`lesson_progress` table) and course completion calculation (`enrollments.progress_percentage`).

While this model is effective for the student classroom player (showing progress bars and resume points), it stores only the **current state snapshot**. It does not capture historical event telemetry:
- Instructors cannot see where learners drop off in video lectures or which lessons cause student abandonment.
- Platform administrators cannot measure learner daily/weekly engagement streaks or retention curves.
- Future AI tutor and recommendation models lack sequential interaction data to generate personalized interventions.

We evaluated three architectural approaches:
- **Option A:** Query existing transactional tables directly (`lesson_progress`, `quiz_attempts`, `enrollments`).
- **Option B:** Introduce a lean, append-only PostgreSQL `learning_events` table within the existing database.
- **Option C:** Deploy a dedicated analytics warehouse (BigQuery, ClickHouse, or Snowflake) with event streaming (Kafka/Segment).

---

## 2. Decision

We decide to adopt **Option B: An Append-Only PostgreSQL `learning_events` Model** for Phase 6.

### 2.1 Rationale for Option B:
1. **Rejection of Option A:** Transactional tables overwrite state (e.g., `watch_position_seconds` is updated in-place). They cannot reconstruct student engagement funnels or time-of-day activity.
2. **Rejection of Option C:** A distributed event warehouse is massive overengineering for TechSprout's current catalog and learner scale. It introduces substantial hosting expenses, multi-system operational overhead, and synchronization lag.
3. **Suitability of Option B:** A single append-only PostgreSQL table in Render PostgreSQL provides full historical auditability, supports fast indexed analytical rollups for instructor dashboards, and requires zero additional cloud services.

### 2.2 Relational Design of `learning_events`
```sql
CREATE TABLE learning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE SET NULL,
    lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'COURSE_OPENED', 'LESSON_STARTED', 'VIDEO_CHECKPOINT', 'LESSON_COMPLETED', 'QUIZ_ATTEMPTED'
    metadata JSONB, -- { "watchPositionSeconds": 180, "score": 85, "device": "mobile" }
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX learning_events_user_idx ON learning_events(user_id, occurred_at DESC);
CREATE INDEX learning_events_course_idx ON learning_events(course_id, event_type, occurred_at DESC);
CREATE INDEX learning_events_lesson_idx ON learning_events(lesson_id, event_type);
```

### 2.3 Throttle & Checkpoint Invariant
To prevent video heartbeat telemetry from flooding the database with hundreds of events per second:
1. Video progress heartbeats are dispatched from the client at a maximum frequency of **once every 60 seconds** (or on video pause/seek/finish).
2. The endpoint `POST /api/v1/learning/events` enforces a strict rate-limit per student per lesson using NestJS `@Throttle`.

### 2.4 Aggregated Analytical Views
Rather than scanning millions of raw rows on every instructor dashboard visit, daily analytical rollups (daily active learners, completion counts per lesson) will be computed into lightweight cache keys in Redis (TTL 15 minutes) or rolled up via scheduled background worker jobs.

---

## 3. Consequences

### Positive:
- **Historical Telemetry:** Provides instructors with actionable pedagogical analytics (video drop-off curves, lesson difficulty).
- **Zero External Infrastructure:** Operates entirely within the existing NestJS and PostgreSQL stack.
- **AI-Ready Foundation:** Clean sequential event logs provide the exact data structure required for future P7 personalized learning models.

### Negative / Trade-offs:
- Requires data retention policies. A scheduled worker will archive or prune fine-grained `VIDEO_CHECKPOINT` events older than 90 days while preserving milestone events (`LESSON_COMPLETED`, `QUIZ_ATTEMPTED`, `CERTIFICATE_EARNED`) permanently.
