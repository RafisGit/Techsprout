# ADR 005: P3 Student Course Enrollment and Learning Progress Architecture

**Status:** Approved (Architecture Freeze — Final Clarified Baseline)  
**Date:** 2026-09-30  
**Phase:** P3.0 Architecture Freeze  
**Deciders:** TechSprout Engineering Team  
**Consulted:** TechSprout School LMS Architecture Review Board, P1 Security Baseline, P2 Catalog Architecture  

---

## 1. Context

In Phase P1 and Phase P2, TechSprout School LMS completed the foundational infrastructure, security baseline, and institutional course catalog:
- **P1:** Session-based authentication (Argon2id, HttpOnly secure cookies, PostgreSQL sessions, BullMQ queue, audit logging).
- **P2:** Institutional Course Catalog (hierarchical `Category` → `Course` → `Module` → `Lesson`), Cloudinary media integration, admin publishing state machine, and public discovery.

Phase P3 introduces the **Student Enrollment & Learning Progress Subsystem**, enabling authenticated students to enroll in courses, access protected curriculum content, record granular lesson progress, track video playback checkpoints, and compute course completion.

Before implementing migrations, API endpoints, or frontend workspaces, the architecture must be frozen to address key architectural questions:
1. **Enrollment Model:** Relational schema, state machine (`ACTIVE`, `COMPLETED`, `CANCELLED`), uniqueness constraints, and lifecycle idempotency.
2. **Access Control:** Server-side lesson authorization separating public previews (`isPreview = true`) from protected enrolled content.
3. **Progress Model:** Granular tracking across heterogeneous lesson types (`VIDEO`, `TEXT`, `PDF`) with lazy row allocation.
4. **Video Progress Strategy:** Practical heartbeat checkpointing and completion thresholding that prevents database write exhaustion.
5. **Course Progress Calculation:** Deterministic percentage calculation, completion invariants, and resume-learning heuristics.
6. **Curricular Mutation Resilience:** Progress integrity when instructors add, reorder, or archive course materials after student enrollment.
7. **Performance & Auditability:** Efficient PostgreSQL indexing, IDOR prevention, and targeted audit logging without high-frequency checkpoint spam.

---

## 2. Decision

We freeze the following architectural boundaries, schemas, and specifications for Phase P3:

### 2.1 Relational Domain Hierarchy

The enrollment and progress subsystem adds two core entities to the PostgreSQL relational model:

```
users (students)
  │ 1
  │
  │ *
enrollments ──────────────┐ 1
  │ 1                     │
  │                       │
  │ *                     │ *
lesson_progress ──────────┼───> courses
  │ *                     │
  ▼                       ▼
lessons                 modules
```

1. **`enrollments`:** Represents a formal learning commitment between a student (`users.id`) and a course (`courses.id`).
2. **`lesson_progress`:** Represents the atomic learning state of an enrolled student on a specific lesson (`lessons.id`), linked directly to the parent `enrollment`.

### 2.2 Relational Integrity & Deletion Rules

- **`enrollments.student_id` → `users.id` (`ON DELETE RESTRICT`):** Prevents deletion of student user accounts with active academic history.
- **`enrollments.course_id` → `courses.id` (`ON DELETE RESTRICT`):** Extends P2 governance. Published or archived courses with enrollments cannot be deleted.
- **`lesson_progress.enrollment_id` → `enrollments.id` (`ON DELETE CASCADE`):** If an enrollment is deleted, its progress history cascades.
- **`lesson_progress.lesson_id` → `lessons.id` (`ON DELETE RESTRICT`):** Prevents hard deletion of lessons containing student learning records.
- **Enrollment Uniqueness:** A student may have at most one enrollment record per course: `UNIQUE(student_id, course_id)`. Re-enrollment reactivates existing records.
- **Progress Uniqueness:** Exactly one progress record per lesson per enrollment: `UNIQUE(enrollment_id, lesson_id)`.

### 2.3 Enrollment State Machine

Enrollments follow an explicit, three-state lifecycle:

```
        ┌────────────────────────────────────────────────────────┐
        │                                                        │
        ▼                                                        │
┌──────────────┐     100% lessons completed     ┌──────────────┐ │
│    ACTIVE    │───────────────────────────────>│  COMPLETED   │ │
└──────────────┘                                └──────────────┘ │
        │   ▲                                                    │
        │   │ Curricular Expansion (new lesson added)            │
        │   └────────────────────────────────────────────────────┼─┐
        │                                                        │ │
        │ cancel (Student / Admin)                               │ re-enroll
        ▼                                                        │ │
┌──────────────┐                                                 │ │
│  CANCELLED   │─────────────────────────────────────────────────┘ │
└──────────────┘                                                   │
        ▲                                                          │
        └──────────────────────────────────────────────────────────┘
```

- **`ACTIVE`:** Student has full access to the learning workspace and curriculum.
- **`COMPLETED`:** Student has completed 100% of required lessons. Retains permanent lifetime access to review course materials.
- **`CANCELLED`:** Enrollment was revoked or cancelled. Access to non-preview lessons is revoked.

### 2.4 Lesson Access & Delivery Model

Access control is strictly verified on the backend:
1. **Unenrolled Guest / Student:**
   - Public preview lessons (`isPreview: true`): Access permitted via public endpoints.
   - Non-preview lessons (`isPreview: false`): Access denied (`403 Forbidden`).
2. **Enrolled Student (`status IN ('ACTIVE', 'COMPLETED')`):**
   - Full access to all lessons in the course, including protected Cloudinary video streaming URLs and text/PDF content.
   - Enrolled students maintain uninterrupted access even if the course transitions to `ARCHIVED`.
3. **Course Author / Instructor:**
   - Authoring access via admin portal. Allowed to self-enroll as a learner to track personal learning progress and test student experience.
4. **Administrator:**
   - Universal institutional inspection authority.
   - Authorized to administratively enroll students into courses via `POST /api/v1/admin/courses/:courseId/enrollments` (`ADMIN_ENROLLS_STUDENT`).
5. **Enrollment Endpoint Separation:**
   - Self-Enrollment (`POST /api/v1/enrollments`): `studentId` derived strictly from `req.user.id` (Students and Instructors).
   - Admin Enrollment (`POST /api/v1/admin/courses/:courseId/enrollments`): Admin explicitly designates target `studentId`. Students cannot access this endpoint (`STUDENT_CANNOT_ENROLL_ANOTHER_STUDENT`).

### 2.5 Progress Semantics & Video Strategy

1. **Lazy Row Allocation:**
   - Lesson progress rows are created **lazily** on first user interaction. Unaccessed lessons have an implicit status of `NOT_STARTED` and consume zero database storage.
2. **Single Authoritative Playback Field:**
   - `watch_position_seconds` is the single authoritative field. `last_watched_position_seconds` is excluded to eliminate redundancy.
   - Free seeking backward and forward is permitted; `watch_position_seconds` stores where the student paused or left off.
3. **Video Checkpoint Strategy:**
   - Client sends debounced playback checkpoints every **15 seconds** during continuous playback, as well as on `pause`, `seeked`, `visibilitychange`, and navigation.
   - Checkpoints are saved in `lesson_progress` and are exempt from `audit_logs` to prevent database log bloat.
4. **Completion Thresholds:**
   - **`VIDEO` Lessons:** Automatically marked `COMPLETED` when `watch_position_seconds >= 0.90 * duration_seconds` (90% completion threshold). Students may also manually click "Mark Complete".
   - **`TEXT` / `PDF` Lessons:** Require explicit student acknowledgment by clicking "Mark as Complete".

### 2.6 Dynamic Course Progress Calculation & Invariant Consistency

Course progress is dynamically calculated via PostgreSQL aggregation:
$$\text{Progress \%} = \text{round}\left( \frac{\text{Count of Completed Lessons}}{\text{Total Course Lessons}} \times 100 \right)$$
- Strict Invariant:
  $$\text{enrollments.status} == \text{'COMPLETED'} \iff \text{progressPercentage} == 100 \iff \text{enrollments.completedAt} \neq \text{null}$$
- If an admin adds a new lesson to a previously completed course, progress drops below 100%, `status` reverts to `ACTIVE`, and `completedAt` resets to `null` until the new lesson is finished.

### 2.7 Resume Learning Heuristics

"Continue Learning" resolves the next logical study position:
1. Return the most recently accessed lesson with `status = 'IN_PROGRESS'` (ordered by `last_accessed_at DESC`).
2. If none in progress, return the first incomplete lesson in curricular sequence (`modules.position ASC, lessons.position ASC`).
3. If all lessons are completed, return the first lesson in the course with a completion banner.

---

## 3. Consequences

### Positive
- **Deterministic Enrollment:** `UNIQUE(student_id, course_id)` prevents ambiguous learning states and duplicate enrollments.
- **Relational Integrity:** Foreign key `RESTRICT` prevents accidental deletion of courses or lessons that active students have completed.
- **Clean Lean Schema:** Single `watch_position_seconds` field removes redundant updates and ambiguous MAX logic.
- **Zero Frontend Leakage:** Protected media URLs and content are delivered exclusively through authenticated, enrollment-verified endpoints.
- **Clean Extension Path:** Independent of payments, quizzes, and certificates; fully forward-compatible with P4 and P5.

### Negative / Trade-offs
- Reordering modules or lessons updates sequences but maintains progress via UUID references; instructors must be mindful of sequence disruptions.
- High-frequency video playback requires client-side debouncing; network dropouts during continuous playback may delay the latest 15-second checkpoint.

---

## 4. Architectural Boundaries (Phase P3)

### In-Scope (Phase P3)
1. Student enrollment data model and APIs (Self-enrollment: `POST /api/v1/enrollments`, Admin-assigned: `POST /api/v1/admin/courses/:courseId/enrollments`, Enrolled course list: `GET /api/v1/enrollments`).
2. Student learning access guard (`GET /api/v1/learn/courses/:courseId/lessons/:lessonId`).
3. Lesson progress tracking (`IN_PROGRESS`, `COMPLETED`), single `watchPositionSeconds`, and resume state.
4. Dynamic course completion calculation and enrollment completion trigger.
5. Student learning frontend (`/my-courses`, `/learn/[courseSlug]/[lessonId]`).

### Explicitly Out-of-Scope (Deferred to Future Phases)
- **Phase P4:** Quizzes, exams, grading, certificates, and badges.
- **Phase P5:** Payments, checkout, subscriptions, discounts, and student reviews.
- **Phase P6:** Email/SMS notifications and cohort announcements.
- **Phase P7:** AI tutor, personalized recommendations, and AI assessment.
- **Infrastructure:** No new cloud providers or caching engines (pure PostgreSQL 16 + NestJS + Next.js).

---

## 5. Architecture Clarifications — P3.0 Final Gate

### 5.1 Course Completion After Curriculum Changes
- **Authoritative Rule:** Absolute logical consistency between `Enrollment.status`, `progressPercentage`, and `completedAt`.
- Adding a new required lesson increases the denominator, transitioning previously completed enrollments back to `status = 'ACTIVE'` and setting `completedAt = null` until the student finishes all new lesson(s).

### 5.2 Watch Position Model (`watchPositionSeconds`)
- `watchPositionSeconds` is the single authoritative field. `lastWatchedPositionSeconds` is explicitly excluded from the schema.
- Resumes strictly from `watchPositionSeconds`. Free seeking is allowed. Clamped to `0` if `>= 0.95 * durationSeconds`.

### 5.3 Archived Course Access
- Enrolled students retain full functional access to archived courses: open lessons (YES), stream media (YES), update progress (YES), mark complete (YES), complete enrollment (YES), resume learning (YES).
- Only new enrollments and public catalog listing are blocked.

### 5.4 Lesson Deletion With Student Progress
- `DELETE /api/v1/admin/lessons/:id` returns `409 Conflict` (`LESSON_HAS_STUDENT_PROGRESS`) when progress records exist, checked at the application layer before attempting DB deletion.

### 5.5 Instructor Enrollment & Self-Learning
- Instructors are fully permitted to self-enroll in published courses as standard learners via `POST /api/v1/enrollments`, including their own authored courses for testing and previewing student experiences. Authoring permissions (`/admin`) and student learning progress (`/learn`) remain completely decoupled.

### 5.6 Administrative Enrollment vs Self-Enrollment API Separation
- **Self-Enrollment:** `POST /api/v1/enrollments` accepts `{ courseId }`. `studentId` is strictly bound to `req.user.id`. Permitted for `STUDENT`, `INSTRUCTOR`, and `ADMIN`.
- **Admin Enrollment:** `POST /api/v1/admin/courses/:courseId/enrollments` accepts `{ studentId }`. Guarded by `RolesGuard(['admin'])`. Explicitly selects target student, validates target existence and eligibility, checks course eligibility, respects idempotency, and records audit trail with `type: 'ADMIN_ASSIGNED'`. Non-admins are blocked (`403 Forbidden`).
