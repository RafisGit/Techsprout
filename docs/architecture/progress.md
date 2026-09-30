# TechSprout School LMS — P3 Student Learning Progress Architecture Specification

> **Phase Status:** P3.0 Architecture Freeze (Final Clarified Baseline)  
> **Applicability:** Lesson Progress Tracking, Playback Position Resumption, Completion Semantics, and Course Progress Calculation.  
> **Prerequisites:** P1 Foundation & Security (Completed), P2 Course Catalog (Completed), P3 Enrollment Architecture (Frozen).  
> **No Implementation Permitted in P3.0:** This document specifies the frozen architectural blueprint for learning progress. Implementation begins in Phase P3.1 upon approval.

---

## 1. Domain Entity & Relational Schema

A **Lesson Progress** record tracks an enrolled student's interaction and completion status for an individual pedagogical lesson within a course curriculum.

```
┌──────────────────┐               ┌──────────────────┐
│   enrollments    │               │     lessons      │
│  (Student Cohort)│               │ (Video/Text/PDF) │
└────────┬─────────┘               └────────┬─────────┘
         │ 1                                │ 1
         │                                  │
         │ * (ON DELETE CASCADE)            │ * (ON DELETE RESTRICT)
┌────────▼──────────────────────────────────▼─────────┐
│                   lesson_progress                    │
│──────────────────────────────────────────────────────│
│  id: uuid (PK)                                       │
│  enrollment_id: uuid (FK -> enrollments.id, CASCADE) │
│  lesson_id: uuid (FK -> lessons.id, RESTRICT)        │
│  status: progress_status (IN_PROGRESS / COMPLETED)   │
│  watch_position_seconds: integer (default 0)         │
│  completed_at: timestamptz (NULLABLE)                │
│  last_accessed_at: timestamptz (NOT NULL)            │
│  created_at: timestamptz (NOT NULL)                  │
│  updated_at: timestamptz (NOT NULL)                  │
│                                                      │
│  CONSTRAINT: UNIQUE(enrollment_id, lesson_id)        │
└──────────────────────────────────────────────────────┘
```

---

## 2. Database Schema Specification (Drizzle ORM)

```typescript
import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { enrollments } from './enrollments';
import { lessons } from './lessons';

// --- ENUMS ---
export const lessonProgressStatusEnum = pgEnum('lesson_progress_status', [
  'IN_PROGRESS',
  'COMPLETED',
]);

// --- LESSON PROGRESS TABLE ---
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    enrollmentId: uuid('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    lessonId: uuid('lesson_id')
      .references(() => lessons.id, { onDelete: 'restrict' })
      .notNull(),
    status: lessonProgressStatusEnum('status').default('IN_PROGRESS').notNull(),
    watchPositionSeconds: integer('watch_position_seconds').default(0).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('lesson_progress_enrollment_lesson_uq').on(
      table.enrollmentId,
      table.lessonId
    ),
    index('lesson_progress_enrollment_id_idx').on(table.enrollmentId),
    index('lesson_progress_enrollment_status_idx').on(table.enrollmentId, table.status),
    index('lesson_progress_lesson_id_idx').on(table.lessonId),
    index('lesson_progress_last_accessed_idx').on(table.lastAccessedAt),
  ]
);

export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;
```

---

## 3. Relational Foreign Key Integrity & Protection Rules

1. **`enrollment_id` Reference (`enrollments.id`) — `ON DELETE CASCADE`:**
   - Deleting an enrollment record completely purges the associated lesson progress history.
2. **`lesson_id` Reference (`lessons.id`) — `ON DELETE RESTRICT`:**
   - **Critical Integrity Rule:** Instructors or administrators CANNOT delete a lesson if any student has an existing progress record on that lesson.
   - If a lesson must be retired, it must be deactivated or hidden, preserving student completion history and preventing broken progress percentages.
3. **Uniqueness Invariant:**
   - `UNIQUE(enrollment_id, lesson_id)` ensures a student has exactly one progress record per lesson.

---

## 4. Lesson Progress State Machine & Allocation Strategy

```
               ┌───────────────────────────────────────┐
               │              NOT_STARTED              │
               │   (Virtual state: No database row)    │
               └──────────────────┬────────────────────┘
                                  │
                                  │ First interaction (watch / view)
                                  ▼
                       ┌─────────────────────┐
                       │     IN_PROGRESS     │◄───────────────┐
                       └──────────┬──────────┘                │
                                  │                           │
                                  │ Threshold reached (90%)   │ Manual Unmark
                                  │ OR "Mark as Complete"     │ ("Mark Incomplete")
                                  ▼                           │
                       ┌─────────────────────┐                │
                       │      COMPLETED      │────────────────┘
                       └─────────────────────┘
```

### Lazy Row Allocation Principle
- When a student enrolls in a 50-lesson course, **zero** progress rows are created initially.
- Pre-allocating rows for all lessons across thousands of enrollments causes database bloat and slow batch writes.
- A database row is created **lazily** only upon first user interaction:
  - Playing a video lesson.
  - Viewing a text or PDF lesson.
  - Clicking "Mark as Complete".
- For any lesson without a row in `lesson_progress`, the system computes:
  - `status: 'NOT_STARTED'`
  - `watchPositionSeconds: 0`
  - `completedAt: null`

---

## 5. Heterogeneous Lesson Progress Semantics

TechSprout supports three distinct lesson types, each with tailored progress mechanics:

### 5.1 VIDEO Lessons
1. **Single Authoritative Watch Position Tracking (`watchPositionSeconds`):**
   - Tracks the exact playback timestamp where the user left off.
   - Authoritative for player resume and progress restoration.
   - Seeking backward and forward is fully permitted; `watchPositionSeconds` always reflects the current playhead position.
2. **Heartbeat Checkpointing (Write Volume Mitigation):**
   - Writing to PostgreSQL on every video frame or second would overwhelm the database.
   - The frontend video player maintains local state and transmits checkpoints **only every 15 seconds** during continuous playback.
   - Immediate checkpoints are sent upon discrete events:
     - Player `pause`
     - Player `seeked`
     - Document `visibilitychange` (tab switch / window minimize)
     - Route transition / component unmount (`beforeunload`)
3. **Automatic Completion Threshold:**
   - When `watchPositionSeconds >= 0.90 * durationSeconds` (90% completion threshold):
     - The lesson transitions automatically to `status = 'COMPLETED'`.
     - `completedAt` is set to `NOW()`.
   - Students may also manually toggle "Mark as Complete" at any time.
4. **Resume Playback Mechanics:**
   - When a student returns to a video lesson, the player initializes at `watchPositionSeconds`.
   - **Loop-back Safety Rule:** If `watchPositionSeconds >= 0.95 * durationSeconds` (student watched to the very end), resume position resets to `0` so the student doesn't load into an ended state.

### 5.2 TEXT Lessons
1. **Initial State:** Opening the lesson creates a record with `status = 'IN_PROGRESS'`.
2. **Completion Trigger:** Requires explicit student action — clicking the **"Mark as Complete"** button.
3. **No Scroll-Triggered Completion:** Scroll-depth completion is avoided because fast scrolling causes false positives.

### 5.3 PDF Lessons
1. **Initial State:** Opening the PDF document viewer sets `status = 'IN_PROGRESS'`.
2. **Completion Trigger:** Requires explicit student action — clicking the **"Mark as Complete"** button.

---

## 6. Course Progress Calculation Formula

Overall course progress is dynamically computed via PostgreSQL aggregation:

$$\text{Progress Percentage} = \text{round}\left( \frac{\text{Completed Lessons Count}}{\text{Total Course Lessons Count}} \times 100 \right)$$

### Calculation Invariants:
1. **Total Course Lessons Count:**
   ```sql
   SELECT count(l.id)::int
   FROM lessons l
   INNER JOIN modules m ON l.module_id = m.id
   WHERE m.course_id = :courseId;
   ```
2. **Completed Lessons Count:**
   ```sql
   SELECT count(lp.id)::int
   FROM lesson_progress lp
   INNER JOIN lessons l ON lp.lesson_id = l.id
   INNER JOIN modules m ON l.module_id = m.id
   WHERE lp.enrollment_id = :enrollmentId
     AND m.course_id = :courseId
     AND lp.status = 'COMPLETED';
   ```
3. **Curricular Invariants:**
   - **Preview Lessons Count:** Preview lessons (`isPreview = true`) are full curricular items and count toward total progress.
   - **Equal Weighting:** Every lesson has equal weight (1 unit). Modules do not apply arbitrary weighting.
   - **Zero Lessons Edge Case:** If a course has 0 lessons, progress percentage evaluates to `0`.
   - **Rounding Standard:** Integer rounding via standard round half-up (`Math.round`). Clamped between `0` and `100`.
4. **Dynamic vs. Cached Execution:**
   - In Phase P3, progress is computed dynamically.
   - Indexed joins (`lesson_progress_enrollment_status_idx` and `modules_course_id_idx`) execute in `< 3ms` for any realistic course size.
   - Prevents stale counter bugs when lessons are added, reordered, or removed.

---

## 7. Course Completion Trigger & Invariants

```
Student completes lesson
           │
           ▼
Update lesson_progress
(status = 'COMPLETED')
           │
           ▼
Calculate Total vs. Completed Lessons
           │
     ┌─────┴────────────────┐
     │                      │
Completed == Total     Completed < Total
     │                      │
     ▼                      ▼
Set enrollment:        Keep enrollment:
status = 'COMPLETED'   status = 'ACTIVE'
completed_at = NOW()
     │
     ▼
AuditService.record()
(ENROLLMENT_COMPLETED)
```

1. **Automatic Completion Rule:**
   - When the student marks the final incomplete lesson complete and `Completed == Total`, the system atomically updates the parent enrollment:
     - `enrollments.status = 'COMPLETED'`
     - `enrollments.completedAt = NOW()`
   - Emits `ENROLLMENT_COMPLETED` audit event.
2. **Reversibility Rule:**
   - If a student unmarks a lesson in a completed course:
     - `enrollments.status` reverts to `'ACTIVE'`.
     - `enrollments.completedAt` is set to `NULL`.
     - Emits `LESSON_UNCOMPLETED` audit event.
3. **Strict Invariant Equivalence:**
   $$\text{enrollments.status} == \text{'COMPLETED'} \iff \text{progressPercentage} == 100 \iff \text{enrollments.completedAt} \neq \text{null}$$

---

## 8. "Resume Learning" (Continue Learning) State Machine

When a student clicks **"Continue Learning"** on their dashboard or course page, the backend executes the following resolution sequence:

```
                      Query Lesson Progress for Enrollment
                                        │
                                        ▼
                  Any lesson with status == 'IN_PROGRESS'?
                                 │            │
                           Yes   │            │ No
                                 ▼            ▼
                   Return most recently       Find first lesson in sequence
                   accessed IN_PROGRESS       (modules.position, lessons.position)
                   lesson                     with status != 'COMPLETED'
                                              (or NOT_STARTED)
                                                     │
                                                     ▼
                                        All lessons COMPLETED?
                                               │         │
                                         Yes   │         │ No
                                               ▼         ▼
                                    Return 1st lesson    Return first
                                    with "Completed"     incomplete lesson
                                    banner
```

### Resume Response Contract:
```typescript
export interface ResumePointDto {
  lessonId: string;
  moduleId: string;
  lessonTitle: string;
  lessonType: 'VIDEO' | 'TEXT' | 'PDF';
  watchPositionSeconds: number;
  progressPercentage: number;
  isCourseCompleted: boolean;
}
```

---

## 9. Curricular Mutation Resilience

How the progress engine handles course updates by instructors/admins after students have enrolled:

| Mutation Scenario | Database & Engine Behavior | Student Progress Impact |
|---|---|---|
| **Add Lesson** | Lesson is inserted into module. Total lesson count increases. | Student progress denominator increases (e.g. 10/10 [100%] becomes 10/11 [91%]). Enrollment status reverts from `COMPLETED` to `ACTIVE`, and `completedAt` resets to `null` until the new lesson is completed. UI displays: *"Curriculum updated: 1 new lesson available."* |
| **Delete Lesson** | Application pre-check blocks deletion (`409 Conflict`, `LESSON_HAS_STUDENT_PROGRESS`) backed by DB `ON DELETE RESTRICT`. | Instructor must hide/unpublish rather than delete, preserving student progress records. |
| **Reorder Lesson** | Lesson `position` integer changes within module. | Zero impact on progress. Progress is keyed strictly by immutable `lesson_id` (UUID). |
| **Move Lesson between Modules** | `lessons.module_id` is updated. | Zero impact on progress. Lesson remains within parent course hierarchy. |
| **Replace Media** | Lesson `media_id` is updated with a new asset. | Existing watch position remains. If new video is shorter than previous watch position, player clamps position to `0`. |
| **Archive Course** | Course `status = 'ARCHIVED'`. | Existing enrolled students retain full learning workspace access, media streaming, progress updating, completion, and resume capabilities. New enrollments are blocked. |

---

## 10. Write Performance Strategy

1. **Write Debouncing:**
   - 15-second heartbeat intervals reduce database writes from 60/minute per student to 4/minute per student (93% reduction in write traffic).
2. **Selective Audit Logging:**
   - Video playback checkpoints (`watch_position_seconds`) are **NEVER** written to `audit_logs`.
   - Audit logging is reserved strictly for meaningful milestone transitions: `LESSON_COMPLETED`, `LESSON_UNCOMPLETED`, and `ENROLLMENT_COMPLETED`.
3. **Database Upsert Pattern:**
   - Progress checkpoints utilize PostgreSQL `ON CONFLICT (enrollment_id, lesson_id) DO UPDATE`:
   ```sql
   INSERT INTO lesson_progress (id, enrollment_id, lesson_id, status, watch_position_seconds, last_accessed_at, updated_at)
   VALUES ($1, $2, $3, 'IN_PROGRESS', $4, NOW(), NOW())
   ON CONFLICT (enrollment_id, lesson_id)
   DO UPDATE SET
     watch_position_seconds = EXCLUDED.watch_position_seconds,
     last_accessed_at = NOW(),
     updated_at = NOW();
   ```

---

## 11. Security & IDOR Prevention

1. **Server-Side Enrollment Derivation:**
   - Progress update endpoints accept `lessonId` in path (`/api/v1/learn/courses/:courseId/lessons/:lessonId/progress`).
   - The server verifies:
     ```sql
     SELECT id FROM enrollments
     WHERE student_id = :authenticatedUserId
       AND course_id = :courseId
       AND status IN ('ACTIVE', 'COMPLETED');
     ```
   - If no valid enrollment is found, returns `403 Forbidden` (`NOT_ENROLLED`).
2. **No Client-Supplied Identifiers:**
   - The client CANNOT supply `enrollment_id` or `student_id` in request bodies. The server strictly uses the session identity.
3. **Cross-Course Isolation:**
   - The server verifies that `lesson_id` belongs to `course_id` through the module hierarchy before updating progress.

---

## 12. Architecture Clarifications — P3.0 Final Gate

### 12.1 Course Completion After Curriculum Changes
- **Authoritative Rule:** Absolute logical consistency between `Enrollment.status`, `progressPercentage`, and `completedAt`.
- When a new required lesson is added to a published course:
  - Any enrollment where `completedLessons < totalLessons` evaluates to `status = 'ACTIVE'` and `completedAt = null`.
  - If a student was previously `COMPLETED` (100%), adding a lesson reduces progress (e.g., 91%). The enrollment automatically transitions from `COMPLETED` back to `ACTIVE`, and `completedAt` is cleared.
  - When the student subsequently completes the new lesson(s), `status` transitions back to `COMPLETED` and `completedAt = NOW()`.
  - Invariant: `status === 'COMPLETED' <=> progressPercentage === 100 <=> completedAt !== null`.

### 12.2 Watch Position Model (`watchPositionSeconds` vs. `lastWatchedPositionSeconds`)
- **Authoritative Decision:** Single authoritative field model.
- `watchPositionSeconds` is the **ONLY** field in the schema. `lastWatchedPositionSeconds` is explicitly **REMOVED** from the future P3 schema.
- **Resume Authority:** Player resume position is 100% authoritative on `watchPositionSeconds`.
- **Seeking:** Free seeking backward and forward is permitted. `watchPositionSeconds` stores where the student paused or left off.
- **Loop-back Clamping:** If `watchPositionSeconds >= 0.95 * durationSeconds`, the resume point resets to `0` to prevent resuming into an ended video.

### 12.3 Archived Course Access
- Enrolled students (`status IN ('ACTIVE', 'COMPLETED')`) retain **full functional access** to archived courses:
  1. Can open lessons: **YES**
  2. Can stream lesson media: **YES**
  3. Can create/update progress: **YES**
  4. Can mark lessons complete: **YES**
  5. Can enrollment become `COMPLETED`: **YES**
  6. Can use Resume Learning: **YES**
- **What is blocked:** Only new enrollments (`POST /api/v1/enrollments` returns `422 Unprocessable Entity`, `COURSE_ARCHIVED`) and public catalog listing.

### 12.4 Lesson Deletion With Student Progress
- When an admin attempts `DELETE /api/v1/admin/lessons/:id` on a lesson with existing `lesson_progress` records:
  - **HTTP Status:** `409 Conflict`
  - **Error Code:** `LESSON_HAS_STUDENT_PROGRESS`
  - **User-Facing Message:** `"Cannot delete lesson: student(s) have recorded learning progress on this lesson. To retire this lesson without disrupting student history, remove it from the curriculum or mark it inactive."`
  - **Application Service Pre-Check:** `LessonsService.delete()` runs `SELECT count(*)::int FROM lesson_progress WHERE lesson_id = :id`. If count > 0, throws `ApiException` with 409 Conflict, preventing an unhandled database 500 error.
  - **Admin UI Expectation:** Admin catalog frontend shows an alert banner explaining that the lesson contains student records and cannot be permanently deleted.

### 12.5 Instructor Enrollment & Self-Learning
- **Self-Enrollment:** Users with role `instructor` are fully permitted to self-enroll in any published public course via `POST /api/v1/enrollments`.
- **Enrollment in Own Course:** Permitted via standard student enrollment. Allows instructors to preview the student learning workspace, test video playback, verify completion triggers, and experience the course exactly as learners do.
- **Separation of Concerns:**
  - Authoring & curriculum editing is governed by instructor role via `/admin/...`.
  - Personal learning progress is governed by student enrollment via `/learn/...`.
  - Zero role pollution; standard RBAC applies cleanly.
