# TechSprout School LMS — P4 Quizzes & Certificates Acceptance Test Plan

> **Phase Status:** P4.0 Architecture Freeze (Final Clarified Baseline)  
> **Applicability:** Quality Assurance, Security Audits, and Test Acceptance Criteria for Phase P4.

---

## 1. Test Architecture & Acceptance Matrix

Phase P4 implementation must satisfy comprehensive integration test suites across database constraints, API security, grading logic, course completion, and certificate immutability.

---

## 2. Test Suites Specification

### Suite 1: Quiz & Question Authoring (Admin / Instructor)
1. **Quiz Creation (`POST /admin/modules/:id/quizzes`):**
   - Creates a quiz in `DRAFT` status with valid `passingScorePercentage`, `maxAttempts`, `timeLimitMinutes`, and `quizType` (`KNOWLEDGE_CHECK` or `FINAL_EXAM`, defaulting to `KNOWLEDGE_CHECK`).
   - Rejects quiz creation with invalid percentage ($< 1$ or $> 100$).
   - Enforces unique sequence position per module (`UNIQUE(module_id, position)`).
2. **Question Authoring (`POST /admin/quizzes/:id/questions`):**
   - Creates `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, and `TRUE_FALSE` questions.
   - Validates that `SINGLE_CHOICE` has exactly one option with `isCorrect = true`.
   - Validates that `MULTIPLE_CHOICE` has at least one option with `isCorrect = true`.
   - Validates that `TRUE_FALSE` has exactly two options with one marked correct.
3. **Publishing Invariant (`POST /admin/quizzes/:id/publish`):**
   - Rejects publishing an empty quiz with 0 questions (`422 Unprocessable Entity`).
   - Rejects publishing if any question has no correct options configured.
   - Verifies that publishing a quiz adds it to the active course completion denominator and reverts any `COMPLETED` enrollments to `ACTIVE`.
4. **Deletion & Archiving Protection:**
   - Allows deletion of draft quizzes without student attempts.
   - Rejects deletion of published quizzes with student attempts (`409 Conflict`, `QUIZ_HAS_STUDENT_ATTEMPTS`).
   - Verifies archiving a quiz removes it from the completion denominator and transactionally re-evaluates active enrollments.

---

### Suite 2: Anti-Cheat & Answer Security
1. **Student Question Stripping:**
   - Verify `GET /learn/quizzes/:quizId` strips `isCorrect` from every option in the response payload.
   - Verify `explanation` field is completely stripped from student payload before submission.
2. **Pre-Submission Review Protection:**
   - Attempting to access `GET /learn/quizzes/:quizId/attempts/:attemptId/review` while `status === 'IN_PROGRESS'` returns `403 Forbidden` (`ATTEMPT_IN_PROGRESS`).
3. **Post-Submission Disclosure:**
   - Verify review endpoint releases correct options and explanations **only** after the attempt has transitioned to `SUBMITTED`.

---

### Suite 3: Quiz Taking & Attempt Lifecycle
1. **Enrollment Boundary:**
   - Unenrolled users receive `403 Forbidden` (`ENROLLMENT_REQUIRED`) when attempting to start a quiz.
2. **Attempt Numbering & Limit:**
   - First attempt assigned `attemptNumber = 1`. Second attempt assigned `attemptNumber = 2`.
   - When attempt count reaches `maxAttempts` without passing, subsequent attempt requests return `422 Unprocessable Entity` (`MAX_ATTEMPTS_REACHED`).
3. **Auto-Saving:**
   - `PATCH /attempts/:id/answers` updates `lastSavedAt` and persists selections without grading.
4. **Double Submission Idempotency:**
   - Calling `POST .../submit` a second time on an already submitted attempt returns `409 Conflict` (`ATTEMPT_ALREADY_SUBMITTED`).

---

### Suite 4: Server-Side Grading Engine
1. **Single Choice Grading:**
   - Correct selection awards full question points. Incorrect selection awards 0 points.
2. **Multiple Choice Exact Set Match:**
   - If correct options are `[A, C]`:
     - Selecting `[A, C]` awards full points.
     - Selecting `[A]` awards 0 points.
     - Selecting `[A, B, C]` awards 0 points.
3. **Pass / Fail Evaluation:**
   - If total score percentage $\ge$ `passingScorePercentage`, `isPassed` evaluates to `true`.
   - If total score percentage $<$ `passingScorePercentage`, `isPassed` evaluates to `false`.

---

### Suite 5: Course Completion Invariant & Publishing Lifecycle
1. **Combined Curriculum Progress & Published Filter:**
   - Verifies that **only** quizzes with status `PUBLISHED` count toward the progress denominator:
     $$\text{Progress} = \text{round}\left( \frac{\text{Completed Lessons} + \text{Passed Quizzes}}{\text{Total Lessons} + \text{Published Quizzes}} \times 100 \right)$$
   - Verifies creating or editing a `DRAFT` quiz does **not** change student progress percentage or completion status.
2. **Atomic Enrollment Completion:**
   - When the student passes the final published quiz and all lessons are complete, `enrollments.status` transitions to `COMPLETED` and `enrollments.completedAt = NOW()`.
3. **Curricular Expansion Reversion & Historical Certificate Preservation:**
   - If a new quiz or lesson is published into a previously completed course, the student's enrollment reverts to `ACTIVE` with `completedAt = null`.
   - **Critical Verification:** Verifies that the already-issued historical certificate remains **valid** (`status = 'ACTIVE'`) and is **never** automatically revoked or invalidated.
4. **Quiz Archiving Transition:**
   - When a required quiz is archived, the denominator decreases, and active students who met all other requirements immediately transition to `COMPLETED` and receive their certificate.

---

### Suite 6: Certificate Issuance, Scoring & Immutability
1. **Automatic Certificate Issuance:**
   - Successful course completion atomically generates a certificate record.
   - Enforces `UNIQUE(enrollment_id)` constraint (exactly one certificate per enrollment).
2. **Historical Snapshot Verification & Scoring Rules:**
   - Verifies `studentName`, `courseTitle`, `instructorName`, `completedAt`, and `finalScorePercentage` are copied as immutable values.
   - If a designated `FINAL_EXAM` exists, verifies `finalScorePercentage` equals the student's highest passed score on that exam.
   - If no `FINAL_EXAM` exists, verifies `finalScorePercentage` equals the unweighted arithmetic mean of highest passed percentages across all published quizzes in the course.
   - Mutating `courses.title` or `users.name` afterwards does **not** alter the issued certificate.
3. **Standard Certificate Numbering:**
   - Verifies certificate numbers follow format `TSP-YYYY-CXXXXXXXXX`.
4. **Admin-Only Revocation:**
   - Only administrators may revoke certificates via `POST /admin/certificates/:id/revoke`. Adding curriculum or instructor changes never triggers revocation.

---

### Suite 7: Certificate Public Verification & Privacy
1. **Public Verification (`GET /certificates/verify/:number`):**
   - Returns `isValid: true`, student name, course title, completion date, and `finalScorePercentage` for active certificates without authentication.
2. **Revocation Verification:**
   - Returns `isValid: false`, `status: 'REVOKED'`, and `revocationReason` for revoked certificates.
3. **Zero PII Exposure:**
   - Confirms user ID, email, password hashes, and session cookies are absent from public responses.

---

### Suite 8: IDOR & Security Verification
1. **Student Isolation:**
   - Student A cannot view or submit Student B's attempt (`403 Forbidden`).
2. **Instructor Course Scoping:**
   - Instructor A cannot edit or delete quizzes in Instructor B's courses (`403 Forbidden`).
3. **HttpOnly Cookie Enforcement:**
   - All student and admin endpoints reject requests without a valid `techsprout_session` cookie.

---

## 3. Monorepo Regression Baseline

Every phase of P4 must verify that the 266 baseline tests remain green:
- **`apps/api`:** 201/201 tests passing.
- **`apps/web`:** 65/65 tests passing.
