# TechSprout School LMS — Phase P3 Acceptance Criteria & QA Test Plan

> **Phase Status:** P3.0 Architecture Freeze (Final Clarified Baseline)  
> **Target Subsystem:** Student Course Enrollment, Learning Progress Tracking, Lesson Access Guard, and Course Completion.  
> **Reference ADR:** [`docs/adr/0005-p3-enrollment-progress.md`](file:///d:/Work/2026/techsprout-main/docs/adr/0005-p3-enrollment-progress.md)

---

## 1. Enrollment Domain & Relational Integrity Acceptance Criteria

- [ ] **AC-ENROLL-DM-01 (Single Active Enrollment Invariant):** Database constraint `UNIQUE(student_id, course_id)` prevents creating multiple enrollment records for the same student on the same course. Attempting to insert a duplicate directly fails with a PostgreSQL unique constraint violation.
- [ ] **AC-ENROLL-DM-02 (Course Deletion Protection):** Attempting to delete a course with active or cancelled enrollments is blocked by foreign key constraint (`ON DELETE RESTRICT`) and fails with referential violation.
- [ ] **AC-ENROLL-DM-03 (Student Deletion Protection):** Attempting to delete a student account with existing enrollments is blocked by foreign key constraint (`ON DELETE RESTRICT`).
- [ ] **AC-ENROLL-DM-04 (Progress Cascade):** Deleting an enrollment cascades to all child `lesson_progress` records (`ON DELETE CASCADE`).
- [ ] **AC-ENROLL-DM-05 (Lesson Deletion Application Check):** Attempting to execute `DELETE /api/v1/admin/lessons/:id` on a lesson with existing `lesson_progress` records is intercepted by an application pre-check and returns `409 Conflict` (`LESSON_HAS_STUDENT_PROGRESS`) with a clear user message.
- [ ] **AC-ENROLL-DM-06 (Progress Uniqueness):** Database constraint `UNIQUE(enrollment_id, lesson_id)` ensures exactly one progress record per lesson per enrollment.

---

## 2. Enrollment Lifecycle & Eligibility Acceptance Criteria

- [ ] **AC-ENROLL-LC-01 (Unauthenticated Rejection):** Calling `POST /api/v1/enrollments` without a valid `techsprout_session` cookie returns `401 Unauthorized` (`UNAUTHENTICATED`).
- [ ] **AC-ENROLL-LC-02 (Draft Course Enrollment Blocked):** Attempting to enroll in a course with `status = 'DRAFT'` returns `404 Not Found` (`COURSE_NOT_FOUND`).
- [ ] **AC-ENROLL-LC-03 (Archived Course New Enrollment Blocked):** Attempting to enroll in a course with `status = 'ARCHIVED'` returns `422 Unprocessable Entity` (`COURSE_ARCHIVED`).
- [ ] **AC-ENROLL-LC-04 (Private Course Enrollment Blocked):** Attempting to self-enroll in a course with `visibility = 'PRIVATE'` returns `403 Forbidden` (`PRIVATE_COURSE`).
- [ ] **AC-ENROLL-LC-05 (Successful Initial Enrollment):** Enrolling in an eligible published course creates an enrollment record with `status = 'ACTIVE'`, `enrolledAt = NOW()`, `startedAt = null`, `completedAt = null`, returning `201 Created`.
- [ ] **AC-ENROLL-LC-06 (Enrollment Idempotency):** Calling `POST /api/v1/enrollments` for an already-enrolled course returns `200 OK` with the existing enrollment record without duplicating rows or raising errors.
- [ ] **AC-ENROLL-LC-07 (Re-enrollment Reactivation):** Re-enrolling in a previously `CANCELLED` course updates status back to `ACTIVE`, updates `enrolledAt = NOW()`, preserves prior progress history, and returns `200 OK`.
- [ ] **AC-ENROLL-LC-08 (Student Enrollment Self-Drop):** Calling `POST /api/v1/enrollments/:id/cancel` as the enrolled student transitions `status` to `CANCELLED` and returns `200 OK`.
- [ ] **AC-ENROLL-LC-09 (Instructor Self-Enrollment):** Instructors can self-enroll in any published course via `POST /api/v1/enrollments`, including their own authored courses, creating a regular enrollment to experience the student learning workspace.
- [ ] **AC-ENROLL-LC-10 (ADMIN_ENROLLS_STUDENT):** An authenticated administrator calling `POST /api/v1/admin/courses/:courseId/enrollments` with `{ studentId }` assigns and enrolls the target student into the course. The endpoint validates that the target student exists and is active, validates the course is published, creates the enrollment record with `status = 'ACTIVE'`, respects idempotency rules, and emits an `ENROLLMENT_CREATED` audit event with metadata `{ type: 'ADMIN_ASSIGNED', enrolledBy: adminId, studentId, courseId }`.
- [ ] **AC-ENROLL-LC-11 (STUDENT_CANNOT_ENROLL_ANOTHER_STUDENT):**
  - A student or instructor attempting to call `POST /api/v1/admin/courses/:courseId/enrollments` is blocked by `RolesGuard(['admin'])` and receives `403 Forbidden`.
  - A student attempting to supply `studentId` in `POST /api/v1/enrollments` has that property stripped/ignored by backend validation; the enrollment is created solely for the authenticated caller (`req.user.id`). Under no circumstances can a non-admin enroll another user.

---

## 3. Lesson Access & Content Delivery Acceptance Criteria

- [ ] **AC-ACC-01 (Guest Preview Access):** Unauthenticated guests can view lesson details and stream video only for lessons where `isPreview = true`.
- [ ] **AC-ACC-02 (Guest Non-Preview Blocked):** Unauthenticated guests requesting non-preview lessons (`isPreview = false`) receive `401 Unauthorized`.
- [ ] **AC-ACC-03 (Non-Enrolled Student Blocked):** Authenticated students who are NOT enrolled in a course receive `403 Forbidden` (`ENROLLMENT_REQUIRED`) when requesting non-preview lesson content.
- [ ] **AC-ACC-04 (Enrolled Student Full Access):** Authenticated students with `status = 'ACTIVE'` or `status = 'COMPLETED'` can retrieve full lesson content, Cloudinary media streaming URLs, and navigation links.
- [ ] **AC-ACC-05 (Cancelled Student Revocation):** When a student's enrollment is transitioned to `CANCELLED`, access to non-preview lessons is immediately blocked with `403 Forbidden`.
- [ ] **AC-ACC-06 (Archived Course Enrolled Access):** Students enrolled before archival maintain full access to open lessons, stream media, submit progress checkpoints, mark lessons complete, and use resume learning.

---

## 4. Lesson Progress & Video Heartbeat Acceptance Criteria

- [ ] **AC-PROG-01 (Lazy Row Allocation):** Creating an enrollment creates zero rows in `lesson_progress`. Querying curriculum progress for an unaccessed lesson returns virtual state `NOT_STARTED`.
- [ ] **AC-PROG-02 (First Access State):** Viewing a lesson for the first time creates a `lesson_progress` row with `status = 'IN_PROGRESS'` and updates `enrollments.startedAt = NOW()`.
- [ ] **AC-PROG-03 (Single Watch Position Field):** Checkpoint updates persist `watchPositionSeconds`. Seeking forward/backward is allowed, and `watchPositionSeconds` accurately reflects the playhead position.
- [ ] **AC-PROG-04 (Automatic Video Completion Threshold):** Sending a checkpoint with `watchPositionSeconds >= 0.90 * durationSeconds` automatically transitions the lesson status to `COMPLETED` and sets `completedAt = NOW()`.
- [ ] **AC-PROG-05 (Text / PDF Explicit Completion):** Text and PDF lessons transition to `COMPLETED` only when `POST /api/v1/learn/courses/:courseId/lessons/:lessonId/complete` is called with `{ "completed": true }`.
- [ ] **AC-PROG-06 (Reversible Completion):** Calling `/complete` with `{ "completed": false }` transitions status back to `IN_PROGRESS` and sets `completedAt = null`.
- [ ] **AC-PROG-07 (Loop-back Resume Safety):** If a student previously watched to `>= 0.95 * durationSeconds`, the resume endpoint resets playback position to `0`.

---

## 5. Course Progress Calculation & Completion Acceptance Criteria

- [ ] **AC-CALC-01 (Dynamic Progress Formula):** Progress percentage accurately reflects `round((completed_lessons / total_lessons) * 100)`.
- [ ] **AC-CALC-02 (Preview Lessons Included):** Preview lessons completed by an enrolled student are counted in the numerator.
- [ ] **AC-CALC-03 (Automatic Course Completion):** When the final lesson in a course transitions to `COMPLETED` (`completed == total`), `enrollments.status` automatically transitions to `COMPLETED` and `enrollments.completedAt = NOW()`.
- [ ] **AC-CALC-04 (Course Completion Reversal):** If a student marks a lesson incomplete in a completed course, `enrollments.status` reverts to `ACTIVE` and `completedAt = null`.
- [ ] **AC-CALC-05 (Resume Point Resolution):** Calling `GET /api/v1/learn/courses/:courseId/resume`:
  - Returns the latest in-progress lesson if any exist.
  - If none in-progress, returns the first incomplete lesson in course order.
  - If all completed, returns the first course lesson with `isCourseCompleted = true`.
- [ ] **AC-CALC-06 (Curriculum Expansion After Completion):** When a new lesson is added to a completed course, the enrollment status reverts to `ACTIVE`, and `completedAt` is cleared until the student completes all new lesson(s). Invariant `status === 'COMPLETED' <=> progressPercentage === 100 <=> completedAt !== null` is preserved.

---

## 6. IDOR Prevention & Security Acceptance Criteria

- [ ] **AC-SEC-01 (Student Isolation):** A student cannot record progress for another student. Server extracts student identity strictly from `req.user.id`.
- [ ] **AC-SEC-02 (Cross-Course Attack Blocked):** Calling progress endpoints with a `lessonId` that belongs to a different course returns `404 Not Found` or `400 Bad Request`.
- [ ] **AC-SEC-03 (Direct Progress Injection Blocked):** Clients cannot pass arbitrary `enrollmentId` or `studentId` in request bodies.
- [ ] **AC-SEC-04 (Instructor Progress Isolation):** An instructor cannot alter student progress records or mark lessons complete on behalf of students.
- [ ] **AC-SEC-05 (STUDENT_CANNOT_ENROLL_ANOTHER_STUDENT):** Student cannot supply a target `studentId` on `POST /api/v1/enrollments` or access `POST /api/v1/admin/courses/:courseId/enrollments`. The system prevents any non-admin actor from enrolling another user into a course.

---

## 7. Audit System Acceptance Criteria

- [ ] **AC-AUD-01 (Enrollment Audit):** `ENROLLMENT_CREATED` is recorded in `audit_logs` with `actor_id`, `courseId`, and timestamp.
- [ ] **AC-AUD-02 (Cancellation Audit):** `ENROLLMENT_CANCELLED` is recorded with actor ID and cancellation reason.
- [ ] **AC-AUD-03 (Completion Audit):** `ENROLLMENT_COMPLETED` is recorded when all lessons are completed.
- [ ] **AC-AUD-04 (Lesson Completion Audit):** `LESSON_COMPLETED` and `LESSON_UNCOMPLETED` are recorded on milestone completion toggles.
- [ ] **AC-AUD-05 (Zero Checkpoint Spam):** 15-second video playback checkpoints are **NOT** written to `audit_logs`, preventing table bloat.

---

## 8. Frontend User Experience Acceptance Criteria

- [ ] **AC-FE-01 (Course Detail CTA Alignment):**
  - Unauthenticated user viewing `/courses/[slug]`: CTA says "Enroll in Course", redirects to `/login?returnUrl=/courses/[slug]`.
  - Enrolled student viewing `/courses/[slug]`: CTA says "Continue Learning", links directly to `/learn/[slug]`.
  - Non-enrolled student viewing `/courses/[slug]`: CTA says "Enroll in Course", creates enrollment and redirects to `/learn/[slug]`.
- [ ] **AC-FE-02 (My Courses Dashboard):** `/my-courses` displays student's enrolled courses with dynamic progress bars, status badges (`In Progress`, `Completed`), and direct "Resume" buttons.
- [ ] **AC-FE-03 (Learning Workspace):** `/learn/[slug]/[lessonId]` displays collapsible curriculum sidebar with lesson checkmarks, video player with resume playback, and next/previous lesson navigation buttons.

---

## 9. Explicit Out-of-Scope Checklist (Phase P3 Verification)

Confirm that NONE of the following features are introduced or activated in Phase P3:
- [ ] No payment gateway integrations (Stripe, bKash, SSLCommerz).
- [ ] No checkout, cart, or order billing tables.
- [ ] No quizzes, exams, question banks, or grading engines.
- [ ] No certificates, badges, or PDF credential generation.
- [ ] No notifications, email alerts, or marketing SMS.
- [ ] No AI tutoring or recommendation systems.
- [ ] No mobile app (Flutter/React Native) code.

---

## 10. Architecture Clarifications — P3.0 Final Gate

### 10.1 Course Completion After Curriculum Changes
- **Authoritative Rule:** Logical and mathematical consistency across `Enrollment.status`, `progressPercentage`, and `completedAt`.
- Adding a new required lesson increases the denominator, transitioning previously completed enrollments back to `status = 'ACTIVE'` and setting `completedAt = null` until the student finishes all new lesson(s).

### 10.2 Watch Position Model (`watchPositionSeconds`)
- `watchPositionSeconds` is the single authoritative field. `lastWatchedPositionSeconds` is explicitly excluded from the schema.
- Resumes strictly from `watchPositionSeconds`. Free seeking is allowed. Clamped to `0` if `>= 0.95 * durationSeconds`.

### 10.3 Archived Course Access
- Enrolled students retain full functional access to archived courses: open lessons (YES), stream media (YES), update progress (YES), mark complete (YES), complete enrollment (YES), resume learning (YES).
- Only new enrollments and public catalog listing are blocked.

### 10.4 Lesson Deletion With Student Progress
- `DELETE /api/v1/admin/lessons/:id` returns `409 Conflict` (`LESSON_HAS_STUDENT_PROGRESS`) when progress records exist, checked at the application layer before attempting DB deletion.

### 10.5 Instructor Enrollment & Self-Learning
- Instructors are fully permitted to self-enroll in published courses as standard learners via `POST /api/v1/enrollments`, including their own authored courses for testing and previewing student experiences. Authoring permissions (`/admin`) and student learning progress (`/learn`) remain completely decoupled.

### 10.6 Administrative Enrollment vs Self-Enrollment API Separation
- **Self-Enrollment:** `POST /api/v1/enrollments` accepts `{ courseId }`. `studentId` is strictly bound to `req.user.id`. Permitted for `STUDENT`, `INSTRUCTOR`, and `ADMIN`.
- **Admin Enrollment:** `POST /api/v1/admin/courses/:courseId/enrollments` accepts `{ studentId }`. Guarded by `RolesGuard(['admin'])`. Explicitly selects target student, validates target existence and eligibility, checks course eligibility, respects idempotency, and records audit trail with `type: 'ADMIN_ASSIGNED'`. Covered by test cases `ADMIN_ENROLLS_STUDENT` (AC-ENROLL-LC-10) and `STUDENT_CANNOT_ENROLL_ANOTHER_STUDENT` (AC-ENROLL-LC-11, AC-SEC-05).
