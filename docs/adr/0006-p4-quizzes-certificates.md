# ADR 006: P4 Quizzes, Assessments, Scoring, and Certificates Architecture

**Status:** Approved (Architecture Freeze — P4.0 Baseline)  
**Date:** 2026-10-01  
**Phase:** P4.0 Architecture & Scope Review  
**Deciders:** TechSprout Engineering Team  
**Consulted:** TechSprout School LMS Architecture Review Board, P1 Security Baseline, P2 Catalog Architecture, P3 Enrollment & Progress Subsystem  

---

## 1. Context

With the successful completion of Phase P1 (Foundation, Security, RBAC, Sessions), Phase P2 (Catalog, Media, Categories, Courses, Modules, Lessons), and Phase P3 (Enrollments, Granular Progress Tracking, Video Checkpointing, Completion Semantics, Student Learning Frontend), TechSprout School LMS requires a robust assessment and certification layer.

Phase P4 introduces:
1. **Interactive Quizzes & Assessments**: Knowledge checks and formal exams that validate student comprehension.
2. **Quiz Question & Option Management**: Authoring structured questions with designated correct answers and explanations.
3. **Student Quiz-Taking & Server-Side Grading**: Secure examination workflows where student answers are evaluated server-side without answer-key leakage.
4. **Attempt Tracking & Scoring Rules**: Attempt limits, attempt history, deterministic score calculations, and pass/fail thresholds.
5. **Harmonized Course Progress Integration**: Unifying lesson completion and quiz passing into the frozen P3 course completion invariant.
6. **Verifiable Certificates**: Automated issuance upon course completion, immutable historical snapshots, and privacy-preserving public verification.

Before any database migrations, backend services, or frontend components are created, this ADR freezes the architectural blueprint and operational constraints for Phase P4.

---

## 2. Architectural Decisions

### 2.1 Domain Entity Hierarchy & Relational Placement

We establish that a **Quiz** in TechSprout is a first-class curricular assessment unit positioned within a Course Module:

```
courses (1)
  └── modules (1..*)
        ├── lessons (1..*) [VIDEO | TEXT | PDF]
        └── quizzes (0..*) [KNOWLEDGE_CHECK | FINAL_EXAM]
              └── quiz_questions (1..*)
                    └── quiz_question_options (2..*)
```

#### Placement Evaluation & Rationale:
1. **Module-Level Placement (`modules.id` → `quizzes.module_id`):**
   - Quizzes are associated directly with a module and given a linear sequence `position`.
   - Supports **Module Quizzes** (e.g., at the end of Section 1) and **Comprehensive Final Exams** (e.g., in a dedicated "Final Examination" module).
   - Prevents conflating asynchronous lesson viewing (`watch_position_seconds`) with multi-question transactional assessment state machines.
2. **Relational Integrity Rules:**
   - `quizzes.module_id` → `modules.id` (`ON DELETE CASCADE`): Deleting an unpublished draft module cascades to its quizzes. Deleting a module with student attempts is protected by `ON DELETE RESTRICT` on attempt history.
   - `quiz_questions.quiz_id` → `quizzes.id` (`ON DELETE CASCADE`): Questions belong strictly to their parent quiz.
   - `quiz_question_options.question_id` → `quiz_questions.id` (`ON DELETE CASCADE`): Options belong strictly to their parent question.

---

### 2.2 Quiz Lifecycle & State Machine

Quizzes follow a 3-state lifecycle matching the course lifecycle:

```
┌─────────┐       Publish       ┌───────────┐       Archive       ┌──────────┐
│  DRAFT  ├────────────────────►│ PUBLISHED ├────────────────────►│ ARCHIVED │
└────┬────┘                     └─────┬─────┘                     └──────────┘
     │                                │                                │
     │ (Admin/Instructor Edit)        │ (Live Student Attempts)        │ (Read-Only Attempts)
```

1. **`DRAFT`:**
   - Authoring state. Questions and options can be added, updated, and reordered.
   - Inaccessible to students.
2. **`PUBLISHED`:**
   - Live state. Enrolled students can start and submit attempts.
   - Question structure is locked against destructive deletions if student attempts already exist.
3. **`ARCHIVED`:**
   - Retired assessment. Existing enrolled students may review past attempts or complete remaining attempts if course access is retained. New attempts may be restricted based on course policy.

---

### 2.3 MVP Question Model

To ensure reliability, determinism, and instant grading, Phase P4 MVP restricts supported question formats to three objective types:

1. **`SINGLE_CHOICE`**: Multiple options presented via radio buttons; exactly one option is correct.
2. **`MULTIPLE_CHOICE`**: Multiple options presented via checkboxes; one or more options are correct.
3. **`TRUE_FALSE`**: Binary choice with two predefined options ("True" and "False"); exactly one is correct.

*Deferred:* Free text, short answer, coding labs, and file upload questions are deferred to subsequent phases to avoid subjective grading bottlenecks.

---

### 2.4 Strict Answer Security Invariant (Anti-Cheat Engine)

Under no circumstances may correct answers or grading keys be transmitted to a student prior to attempt evaluation:

1. **Student Question Payload (`StudentQuizQuestionDto`):**
   - Contains: `id`, `questionText`, `questionType`, `position`, `points`, `options: [{ id, text }]`.
   - **Excludes:** `isCorrect`, `explanation`, and scoring weights.
2. **Server-Side Grading Execution:**
   - Grading occurs inside a database transaction on `POST /api/v1/learn/quizzes/:quizId/attempts/:attemptId/submit`.
   - The student client submits only option selections: `{ answers: [{ questionId, selectedOptionIds }] }`.
   - The server queries authoritative correct answers from PostgreSQL, evaluates matches, and computes score and percentage.
3. **Post-Submission Review Payload (`StudentQuizAttemptReviewDto`):**
   - Transmitted **only after** the attempt has transitioned to `SUBMITTED`.
   - Discloses points earned, selected options, correct options, and educational explanations.

---

### 2.5 Quiz Attempts & Concurrency Management

Assessments are tracked via formal attempts bound to the student's active enrollment:

1. **Attempt Identity Boundary:**
   - `quiz_attempts` references `enrollment_id` (`ON DELETE CASCADE`), `quiz_id` (`ON DELETE RESTRICT`), and `student_id` (`ON DELETE RESTRICT`).
2. **Attempt Counter & Limits:**
   - Each attempt receives an incremental `attempt_number` per enrollment (`1, 2, ...`).
   - `quizzes.max_attempts` defines allowable attempts (default: 3; `null` = unlimited).
   - If `attempt_count >= max_attempts` and `is_passed = false`, new attempts are rejected with `422 Unprocessable Entity` (`MAX_ATTEMPTS_REACHED`).
3. **Double-Submission & Concurrency Protection:**
   - Submitting an attempt that is already `SUBMITTED` immediately returns `409 Conflict` (`ATTEMPT_ALREADY_SUBMITTED`).
   - In-progress attempts support auto-saving answers (`PATCH .../answers`) so connection drops or page refreshes preserve student selections.

---

### 2.6 Deterministic Scoring & Passing Threshold

1. **Authoritative Point Values:**
   - Each question has integer `points` (default: 1).
   - Total quiz points = $\sum \text{question.points}$.
2. **Grading Formulas:**
   - `SINGLE_CHOICE` / `TRUE_FALSE`: Award full points if selected option matches correct option; 0 otherwise.
   - `MULTIPLE_CHOICE`: Award full points if the selected set of option IDs exactly matches the correct set; 0 otherwise (no negative marking in MVP).
3. **Percentage & Passing Threshold:**
   $$\text{Score Percentage} = \text{round}\left( \frac{\text{Points Earned}}{\text{Total Points}} \times 100 \right)$$
   $$\text{isPassed} = (\text{Score Percentage} \ge \text{quizzes.passing_score_percentage})$$
   Default passing threshold is **70%** (configurable per quiz from 1% to 100%).

---

### 2.7 Course Progress & Completion Invariant Integration

Phase P3 established the strict completion invariant:
$$\text{enrollments.status} == \text{'COMPLETED'} \iff \text{progressPercentage} == 100 \iff \text{enrollments.completedAt} \neq \text{null}$$

Phase P4 expands progress calculation to incorporate both lessons and quizzes:

$$\text{Course Progress} = \text{round}\left( \frac{\text{Completed Lessons Count} + \text{Passed Quizzes Count}}{\text{Total Lessons Count} + \text{Published Quizzes Count}} \times 100 \right)$$

1. **Strict Inclusion Rule for Course Completion:**
   - **Only quizzes with status `PUBLISHED` count toward active student course progress and completion.**
   - Quizzes in `DRAFT` or `ARCHIVED` status are strictly excluded from the completion denominator and numerator.
   - A quiz counts as **Passed/Completed** for an enrollment if there exists at least one attempt with `status = 'SUBMITTED'` and `is_passed = true` on a currently `PUBLISHED` quiz.
2. **Curriculum Mutation & Lifecycle Transition Effects:**
   - **Creating a `DRAFT` Quiz:** Has zero effect on learner progress or completion status.
   - **Publishing a Quiz (`DRAFT` → `PUBLISHED`):**
     - Increases the course completion denominator by 1.
     - Any previously `COMPLETED` enrollment reverts to `ACTIVE` with `completed_at = null`, because the curriculum now requires passing this newly published assessment to regain 100% completion.
     - All `ACTIVE` enrollments have their `progress_percentage` re-evaluated transactionally.
   - **Archiving a Quiz (`PUBLISHED` → `ARCHIVED`):**
     - Decreases the completion denominator by 1.
     - Progress is recalculated transaction-safely for all active enrollments.
     - If an active learner previously completed all lessons and other quizzes, and was blocked only by this archived quiz, their progress now reaches 100%, automatically transitioning their enrollment to `COMPLETED` (`completed_at = NOW()`) and issuing their certificate.
3. **Atomic Course Completion Trigger:**
   - When the student passes the final remaining requirement, the backend atomically updates `enrollments.status = 'COMPLETED'` and `enrollments.completed_at = NOW()`.
   - Automatically queues/triggers certificate generation.

---

### 2.8 Certificate Architecture, Final Score & Immutability

1. **Issuance Criteria:**
   - Exactly one certificate is generated per successful course completion (`enrollments.status === 'COMPLETED'`).
   - Enforced by unique constraint `UNIQUE(enrollment_id)` on `certificates`.
2. **Historical Completion Record & Curriculum Mutation Invariant:**
   - **AN ALREADY-ISSUED CERTIFICATE IS A HISTORICAL COMPLETION RECORD.**
   - Adding new required lessons or quizzes later **MUST NOT** automatically revoke or invalidate a previously issued certificate.
   - When new content is published, the learner's current enrollment may return to `ACTIVE` (with `completed_at = null`) and require the new content for renewed course completion, while the historical certificate remains fully valid (`status = 'ACTIVE'`) unless an administrator explicitly revokes it.
3. **Exact Definition of `certificates.final_score_percentage`:**
   - `final_score_percentage` is a deterministic integer snapshot frozen at the moment of certificate issuance:
     - **Rule A:** If the course contains a published quiz designated as `FINAL_EXAM` (`quizzes.quiz_type = 'FINAL_EXAM'`), `final_score_percentage` = the highest passed score percentage achieved by the student on that `FINAL_EXAM` quiz.
     - **Rule B:** If there is **no** `FINAL_EXAM` quiz, `final_score_percentage` = the course's overall quiz score, computed as the unweighted arithmetic mean of the student's highest passed attempt percentages across all published quizzes in the course:
       $$\text{final\_score\_percentage} = \text{round}\left( \frac{\sum_{q \in \text{PublishedQuizzes}} \text{bestPassedPercentage}(q)}{|\text{PublishedQuizzes}|} \right)$$
     - **Rule C:** If the course contains zero quizzes (lessons only), `final_score_percentage` is set to `100` (representing 100% mastery of all required lessons).
   - Once issued, this value is permanently frozen in the certificate record and is never dynamically recomputed.
4. **Immutable Historical Fact Snapshot:**
   - A certificate captures the historical context at the exact moment of issuance:
     - `student_name`: string snapshot from `users.name`
     - `course_title`: string snapshot from `courses.title`
     - `instructor_name`: string snapshot from `instructor.name`
     - `completed_at`: timestamp from `enrollments.completed_at`
     - `final_score_percentage`: frozen integer score
     - `certificate_number`: unique public verification code (e.g., `TSP-2026-XXXXX`)
   - If a course is later renamed, instructor reassigned, or curriculum expanded, previously issued certificates remain 100% historically accurate and unchanged.
5. **Public Verification:**
   - Public route: `/verify/[certificateNumber]` calling `@Public()` API `GET /api/v1/certificates/verify/:certificateNumber`.
   - Returns verification validity, student name, course title, issue date, and certificate status (`ACTIVE` or `REVOKED`).
   - Zero private student data (no email, user ID, or session tokens) is exposed.

---

## 3. Consequences

### Positive
- **Integrity:** Server-side grading eliminates all client-side answer cheating vectors.
- **Architectural Cohesion:** Unifies lessons and quizzes into one coherent curriculum progress model without breaking P3 invariants.
- **Academic Reliability:** Immutable certificate snapshots preserve historical educational credentials.
- **Non-Destructive Evolution:** Extends relational schemas without altering existing P1, P2, or P3 tables.

### Negative / Trade-offs
- Subjective questions (essays, code reviews) must be deferred to post-MVP.
- If a course has both lessons and quizzes, students must pass all required quizzes to achieve 100% course completion and earn a certificate.
