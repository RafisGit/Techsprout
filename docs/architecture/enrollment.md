# TechSprout School LMS — P3 Student Enrollment Architecture Specification

> **Phase Status:** P3.0 Architecture Freeze (Final Clarified Baseline)  
> **Applicability:** Student Course Enrollment, Access Verification, and Cohort Membership.  
> **Prerequisites:** P1 Foundation & Security (Completed), P2 Course Catalog (Completed).  
> **No Implementation Permitted in P3.0:** This document specifies the frozen architectural blueprint for the enrollment domain. Implementation begins in Phase P3.1 upon approval.

---

## 1. Domain Entity & Relational Schema

An **Enrollment** represents a binding learning contract between an authenticated student (`users`) and an institutional course (`courses`).

```
┌──────────────────┐               ┌──────────────────┐
│      users       │               │     courses      │
│  (Student Role)  │               │ (Published Only) │
└────────┬─────────┘               └────────┬─────────┘
         │ 1                                │ 1
         │                                  │
         │ *                              * │
┌────────▼──────────────────────────────────▼─────────┐
│                     enrollments                      │
│──────────────────────────────────────────────────────│
│  id: uuid (PK)                                       │
│  student_id: uuid (FK -> users.id, RESTRICT)         │
│  course_id: uuid (FK -> courses.id, RESTRICT)        │
│  status: enrollment_status (ACTIVE/COMPLETED/CANC)   │
│  enrolled_at: timestamptz (NOT NULL)                 │
│  started_at: timestamptz (NULLABLE)                  │
│  completed_at: timestamptz (NULLABLE)                │
│  last_accessed_at: timestamptz (NULLABLE)            │
│  created_at: timestamptz (NOT NULL)                  │
│  updated_at: timestamptz (NOT NULL)                  │
│                                                      │
│  CONSTRAINT: UNIQUE(student_id, course_id)           │
└──────────────────────────┬───────────────────────────┘
                           │ 1
                           │
                           │ * (ON DELETE CASCADE)
┌──────────────────────────▼───────────────────────────┐
│                   lesson_progress                    │
└──────────────────────────────────────────────────────┘
```

---

## 2. Database Schema Specification (Drizzle ORM)

```typescript
import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { courses } from './courses';

// --- ENUMS ---
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
]);

// --- ENROLLMENTS TABLE ---
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'restrict' })
      .notNull(),
    status: enrollmentStatusEnum('status').default('ACTIVE').notNull(),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('enrollments_student_course_uq').on(table.studentId, table.courseId),
    index('enrollments_student_id_idx').on(table.studentId, table.status),
    index('enrollments_course_id_idx').on(table.courseId, table.status),
    index('enrollments_enrolled_at_idx').on(table.enrolledAt),
  ]
);

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
```

---

## 3. Relational Foreign Key Integrity

1. **`studentId` Reference (`users.id`) — `ON DELETE RESTRICT`:**
   - User deletion is prevented if enrollment history exists.
   - Preserves institutional academic auditing, attendance, and compliance records.
2. **`courseId` Reference (`courses.id`) — `ON DELETE RESTRICT`:**
   - Extends the P2 invariant (`courses.status` must be `DRAFT` for hard deletion).
   - Once a course has active or historical student enrollments, it can NEVER be hard-deleted from the database. It must be transitioned to `ARCHIVED` status.
3. **Child Progress Reference (`lesson_progress.enrollment_id`) — `ON DELETE CASCADE`:**
   - If an administrative purge of an enrollment record is executed, child lesson progress records cascade cleanly.

---

## 4. Enrollment State Machine & Lifecycle Transitions

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

### Transition Specifications:

| Initial State | Target State | Trigger / Endpoint | Authority | Validations & Preconditions | Side Effects |
|---|---|---|---|---|---|
| `[None]` | `ACTIVE` | `POST /api/v1/enrollments` (Self-Enrollment) | Authenticated User (`student`, `instructor`, `admin`) | Course must be `PUBLISHED` & `PUBLIC`. Category active. `student_id` derived strictly from `req.user.id`. | Sets `enrolledAt = NOW()`. Logs `ENROLLMENT_CREATED` (`type: 'SELF'`). |
| `[None]` | `ACTIVE` | `POST /api/v1/admin/courses/:courseId/enrollments` (Admin-Assigned) | `admin` Only | Target `studentId` exists in `users`. Course is `PUBLISHED`. | Sets `enrolledAt = NOW()`. Logs `ENROLLMENT_CREATED` (`type: 'ADMIN_ASSIGNED'`, `enrolledBy: adminId`). |
| `ACTIVE` | `COMPLETED` | System Trigger (Progress calculation) | Automated Engine | All curriculum lessons marked `COMPLETED` (`completed == total`). | Sets `completedAt = NOW()`. Logs `ENROLLMENT_COMPLETED`. |
| `ACTIVE` | `CANCELLED` | `POST /api/v1/enrollments/:id/cancel` | Student or Admin | Student can only cancel own enrollment; Admin can cancel any enrollment. | Sets `updatedAt = NOW()`. Logs `ENROLLMENT_CANCELLED`. Access to protected lessons revoked. |
| `CANCELLED` | `ACTIVE` | `POST /api/v1/enrollments` (Self) or `POST /api/v1/admin/courses/:courseId/enrollments` (Admin) | Authenticated User or Admin | Course must still be `PUBLISHED`. | Reactivates record, sets `enrolledAt = NOW()`. Preserves previous progress. Logs `ENROLLMENT_CREATED`. |
| `COMPLETED` | `ACTIVE` | Curricular Expansion (New lesson added) | System Trigger | Admin/Instructor adds new required lesson to course. | Enrollment status reverts to `ACTIVE`, `completedAt` reset to `null` until new lesson is completed. Invariant preserved. |

---

## 5. Enrollment Uniqueness & Duplicate Handling

- **Database Invariant:** `UNIQUE(student_id, course_id)` enforced via `enrollments_student_course_uq`.
- **Idempotency Rule (Applies to both Self-Enrollment and Admin-Assigned Enrollment):**
  - **Case 1: Already Enrolled and Active (`status == 'ACTIVE'`):**
    - Self-Enrollment (`POST /api/v1/enrollments`) & Admin Enrollment (`POST /api/v1/admin/courses/:courseId/enrollments`):
      - The API returns `200 OK` with the existing `EnrollmentDto` and message `"Already enrolled in this course"`.
      - No duplicate row is created.
      - Zero database errors or conflict exceptions are exposed to the client.
  - **Case 2: Previously Cancelled (`status == 'CANCELLED'`):**
    - The API reactivates the record to `ACTIVE`, updates `enrolledAt = NOW()`, and returns `200 OK`.
    - Previous lesson progress is preserved, allowing the student to resume where they left off.
    - Audit log records reactivation.
  - **Case 3: Already Completed (`status == 'COMPLETED'`):**
    - The API returns `200 OK` with the existing `EnrollmentDto` and message `"Course already completed"`.

---

## 6. Enrollment Eligibility & Course State Invariants

### 6.1 Self-Enrollment Validations (`POST /api/v1/enrollments`)
1. **Authentication Guard:**
   - Request must contain a valid session cookie (`techsprout_session`).
   - Anonymous guests receive `401 Unauthorized` (`UNAUTHENTICATED`).
   - Permitted roles: `student`, `instructor`, `admin`.
2. **Identity Derivation:**
   - `student_id` is extracted strictly from `req.user.id`. Client cannot supply or override `studentId`.
3. **Course Existence & Status:**
   - Course must exist in PostgreSQL.
   - `courses.status` must equal `'PUBLISHED'`. If `DRAFT`, returns `404 Not Found`. If `ARCHIVED`, returns `422 Unprocessable Entity` (`COURSE_ARCHIVED`).
4. **Course Visibility:**
   - `courses.visibility` must equal `'PUBLIC'`. Private cohort-only courses require administrative assignment.
5. **Category Active State:**
   - Parent category must have `is_active = true`.

### 6.2 Admin-Assigned Enrollment Validations (`POST /api/v1/admin/courses/:courseId/enrollments`)
1. **Administrative Authorization Guard:**
   - Caller must possess `admin` role (`RolesGuard(['admin'])`).
   - Non-admin callers (students, instructors) receive `403 Forbidden` (`FORBIDDEN`).
2. **Target Student Validation:**
   - Client explicitly supplies `studentId` in the request body.
   - Target user must exist in the database (`users.id = studentId`). If not found, returns `404 Not Found` (`STUDENT_NOT_FOUND`).
   - Target user account must be active (not suspended/banned). If inactive, returns `422 Unprocessable Entity` (`STUDENT_INELIGIBLE`).
3. **Course Existence & Status:**
   - Course must exist (`courses.id = courseId`). If not found, returns `404 Not Found` (`COURSE_NOT_FOUND`).
   - `courses.status` must equal `'PUBLISHED'`. If `ARCHIVED`, returns `422 Unprocessable Entity` (`COURSE_ARCHIVED`).
4. **Payment Independence (Phase P3 Rule):**
   - In Phase P3, course price is bypassed for both self-enrollment and admin assignment.

---

## 7. Enrollment Creation Flows

### 7.1 Student / Instructor Self-Enrollment Flow

```
Student Client                          NestJS API                           PostgreSQL
      │                                     │                                    │
      │─── POST /api/v1/enrollments ───────>│                                    │
      │    { courseId: "uuid" }             │                                    │
      │                                     │─── 1. Verify Session Cookie ──────>│
      │                                     │<── Session User (studentId) ───────│
      │                                     │                                    │
      │                                     │─── 2. Fetch Course & Category ────>│
      │                                     │<── Course (status, visibility) ────│
      │                                     │                                    │
      │                                     │    [Check: status == PUBLISHED]    │
      │                                     │    [Check: visibility == PUBLIC]   │
      │                                     │                                    │
      │                                     │─── 3. Check Existing Enrollment ──>│
      │                                     │<── Existing Row or null ───────────│
      │                                     │                                    │
      │                                     │    [If ACTIVE: Return 200 OK]      │
      │                                     │    [If CANCELLED: Reactivate]      │
      │                                     │    [If Null: Insert New Row] ─────>│
      │                                     │                                    │
      │                                     │─── 4. AuditService.record() ──────>│
      │                                     │    (type: 'SELF')                  │
      │                                     │                                    │
      │<── 201 Created (or 200 OK) ─────────│                                    │
      │    { success: true, data: Enrollment }                                   │
```

### 7.2 Admin-Assigned Enrollment Flow

```
Admin Client                            NestJS API                           PostgreSQL
      │                                     │                                    │
      │─── POST /api/v1/admin/courses/ ────>│                                    │
      │    :courseId/enrollments            │                                    │
      │    { studentId: "target-user-uuid" }│                                    │
      │                                     │─── 1. RolesGuard(['admin']) ──────>│
      │                                     │<── Session Verified (Admin) ───────│
      │                                     │                                    │
      │                                     │─── 2. Validate Target Student ────>│
      │                                     │<── Target User (exists & active) ──│
      │                                     │    [If not found: 404 Not Found]   │
      │                                     │                                    │
      │                                     │─── 3. Fetch Course & Category ────>│
      │                                     │<── Course (status, visibility) ────│
      │                                     │    [Check: status == PUBLISHED]    │
      │                                     │                                    │
      │                                     │─── 4. Check Existing Enrollment ──>│
      │                                     │<── Existing Row or null ───────────│
      │                                     │                                    │
      │                                     │    [If ACTIVE: Return 200 OK]      │
      │                                     │    [If CANCELLED: Reactivate]      │
      │                                     │    [If Null: Insert New Row] ─────>│
      │                                     │                                    │
      │                                     │─── 5. AuditService.record() ──────>│
      │                                     │    (type: 'ADMIN_ASSIGNED',        │
      │                                     │     enrolledBy: adminId)           │
      │                                     │                                    │
      │<── 201 Created (or 200 OK) ─────────│                                    │
      │    { success: true, data: Enrollment }                                   │
```

---

## 8. Authorization Matrix & IDOR Prevention

| Actor Role | Action | Target Resource | Permitted | Server-Side Enforcement Mechanism |
|---|---|---|:---:|---|
| **Guest** | Create Enrollment | Any Course | **Denied** | `AuthGuard` rejects with `401 Unauthorized` |
| **Student** | Self-Enroll (`POST /api/v1/enrollments`) | Published Public Course | **Allowed** | `student_id` extracted strictly from `req.user.id`; client cannot provide target `studentId` |
| **Student** | Enroll Another Student (`POST /api/v1/enrollments`) | Any Course | **Denied** | Request DTO has no `studentId` field; server enforces `req.user.id` |
| **Student** | Assign Enrollment via Admin Endpoint (`POST /api/v1/admin/courses/:id/enrollments`) | Any Course | **Denied** | `RolesGuard(['admin'])` rejects with `403 Forbidden` (`STUDENT_CANNOT_ENROLL_ANOTHER_STUDENT`) |
| **Student** | View Own Enrollments | Own Record | **Allowed** | `WHERE student_id = req.user.id` |
| **Student** | View Another Student's Enrollment | Other Student's Record | **Denied** | Endpoint queries enforce `WHERE student_id = req.user.id`; returns `404` or `403` |
| **Student** | Cancel Own Enrollment | Own Record | **Allowed** | Verifies `enrollment.studentId === req.user.id` |
| **Instructor**| Self-Enroll in Any Course (`POST /api/v1/enrollments`) | Published Public Course | **Allowed** | Standard learner enrollment via `req.user.id` |
| **Instructor**| Enroll in Own Authored Course (`POST /api/v1/enrollments`) | Own Course | **Allowed** | Standard learner enrollment to preview & test student learning workspace |
| **Instructor**| Assign Enrollment to Another Student (`POST /api/v1/admin/...`) | Any Course | **Denied** | `RolesGuard(['admin'])` rejects with `403 Forbidden` |
| **Instructor**| View Course Enrollees | Own Course | **Allowed** | `WHERE course.instructor_id = req.user.id` (aggregated student roster) |
| **Instructor**| View Course Enrollees | Other's Course | **Denied** | `403 Forbidden` (`NOT_COURSE_OWNER`) |
| **Admin** | Self-Enroll (`POST /api/v1/enrollments`) | Any Published Course | **Allowed** | Learner self-enrollment via `req.user.id` |
| **Admin** | Assign Enrollment to Another Student (`POST /api/v1/admin/courses/:id/enrollments`) | Target Student | **Allowed** | `ADMIN_ENROLLS_STUDENT`; validates target user and course eligibility; logs audit trail |
| **Admin** | View Institutional Enrollments| Any Course | **Allowed** | Unrestricted administrative query |
| **Admin** | Revoke/Cancel Any Enrollment | Any Student Record | **Allowed** | `RolesGuard(['admin'])` |

---

## 9. Privacy Boundaries & Data Isolation

1. **Public Catalog Isolation:**
   - Public course endpoints (`/api/v1/courses`, `/api/v1/courses/:slug`) NEVER return enrollees, student names, enrollment IDs, or learner contact details.
   - Aggregate enrolled count (e.g. `"studentsCount": 142`) may be exposed as an integer statistic, but individual records remain completely isolated.
2. **Student Dashboard Isolation:**
   - `GET /api/v1/enrollments` queries solely rows where `student_id = req.user.id`.
3. **Instructor Scoping:**
   - Instructors only access enrollment summaries for courses where `courses.instructor_id = req.user.id`. Student phone numbers and authentication details are masked.

---

## 10. Audit Logging Strategy

All enrollment lifecycle events integrate directly with the existing P1/P2 `AuditService`:

| Action | Target Type | Target ID | Metadata Recorded |
|---|---|---|---|
| `ENROLLMENT_CREATED` | `ENROLLMENT` | `enrollment.id` | `{ studentId, courseId, enrolledBy: actorId, type: 'SELF' \| 'ADMIN_ASSIGNED', enrolledAt, reactivated: boolean }` |
| `ENROLLMENT_CANCELLED` | `ENROLLMENT` | `enrollment.id` | `{ studentId, courseId, cancelledBy: actorId, reason }` |
| `ENROLLMENT_COMPLETED` | `ENROLLMENT` | `enrollment.id` | `{ studentId, courseId, completedAt, totalLessonsCount }` |

---

## 11. Forward-Compatibility with Phase P5 (Payments & Checkout)

In Phase P5, paid courses will introduce a payment verification gateway:
- P3 schema is **100% forward-compatible**:
  - `enrollments` table remains identical.
  - P5 will add an optional `order_id` or `payment_id` foreign key.
  - When P5 is introduced, `POST /api/v1/enrollments` for paid courses (`price > 0`) will redirect to checkout (`POST /api/v1/orders`), and enrollment creation will be triggered atomically upon payment webhook confirmation.
  - In Phase P3, this check is bypassed, allowing full testing of the learning engine.

---

## 12. Architecture Clarifications — P3.0 Final Gate

### 12.1 Course Completion After Curriculum Changes
- **Authoritative Rule:** Logical and mathematical consistency across `Enrollment.status`, `progressPercentage`, and `completedAt`.
- If a new required lesson is added to a published course:
  - If an enrollment was previously marked `COMPLETED` (100%), adding a lesson reduces progress (e.g. from 100% to 91%).
  - The enrollment automatically transitions from `COMPLETED` back to `ACTIVE`, and `completedAt` is set to `null` until the student completes all new lesson(s).
  - Once the student completes all remaining lessons, `status` returns to `COMPLETED` and `completedAt = NOW()`.
  - Invariant: `status === 'COMPLETED' <=> progressPercentage === 100 <=> completedAt !== null`.

### 12.2 Watch Position Model (`watchPositionSeconds`)
- `watchPositionSeconds` is the single authoritative field. `lastWatchedPositionSeconds` is explicitly excluded from the schema.
- Player resume position is 100% authoritative on `watchPositionSeconds`. Seeking forward/backward is fully permitted; `watchPositionSeconds` captures where playback stopped.
- If `watchPositionSeconds >= 0.95 * durationSeconds`, resume resets to `0` to prevent resuming into an ended video.

### 12.3 Archived Course Access
- Enrolled students (`status IN ('ACTIVE', 'COMPLETED')`) maintain **uninterrupted access** to archived courses:
  - Can open lessons: **YES**
  - Can stream lesson media: **YES**
  - Can update progress / send checkpoints: **YES**
  - Can mark lessons complete: **YES**
  - Can enrollment become `COMPLETED`: **YES**
  - Can use Resume Learning: **YES**
- **What is blocked:** Only new enrollments (`422 Unprocessable Entity`, `COURSE_ARCHIVED`) and public catalog listing.

### 12.4 Lesson Deletion With Student Progress
- When an admin attempts `DELETE /api/v1/admin/lessons/:id` on a lesson with existing student progress:
  - **HTTP Status:** `409 Conflict`
  - **Error Code:** `LESSON_HAS_STUDENT_PROGRESS`
  - **Message:** `"Cannot delete lesson: student(s) have recorded learning progress on this lesson. To retire this lesson without disrupting student history, remove it from the curriculum or mark it inactive."`
  - Handled cleanly via application pre-check in `LessonsService.delete()`, preventing raw database 500 errors.

### 12.5 Instructor Enrollment & Self-Learning
- **Self-Enrollment:** Users with role `instructor` are fully permitted to enroll in courses as learners via `POST /api/v1/enrollments`.
- **Enrollment in Own Course:** Allowed via standard student enrollment. Enables instructors to experience the course as a student, verify player and completion mechanics, without affecting admin authoring permissions.
- Complete separation of concerns: `/admin` for authoring, `/learn` for student progress.

### 12.6 Administrative Enrollment vs. Self-Enrollment API Separation
- **Architectural Contradiction Resolved:** Prevents IDOR vulnerabilities while supporting institutional administrative cohort assignment:
  - **Self-Enrollment Endpoint (`POST /api/v1/enrollments`):**
    - Body: `{ courseId: string }`.
    - Authorization: `STUDENT`, `INSTRUCTOR`, `ADMIN`.
    - Security Constraint: `student_id` is extracted strictly from `req.user.id`. The client cannot provide or override a target student ID. Any client-supplied `studentId` property is stripped and ignored.
  - **Admin-Assigned Enrollment Endpoint (`POST /api/v1/admin/courses/:courseId/enrollments`):**
    - Path Param: `:courseId`. Body: `{ studentId: string }`.
    - Authorization: Restricted strictly to `ADMIN` (`RolesGuard(['admin'])`).
    - Validations:
      1. Validates caller is an authenticated `admin`.
      2. Validates target user (`studentId`) exists in PostgreSQL and is eligible/active (`STUDENT_NOT_FOUND` / `STUDENT_INELIGIBLE`).
      3. Validates course exists and is `PUBLISHED` (`COURSE_NOT_FOUND` / `COURSE_ARCHIVED`).
      4. Respects `UNIQUE(student_id, course_id)` idempotency (returns `200 OK` if already active; reactivates if cancelled).
      5. Records audit event via existing `AuditService` with metadata `{ type: 'ADMIN_ASSIGNED', enrolledBy: adminId, studentId, courseId }`.

