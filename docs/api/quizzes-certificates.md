# TechSprout School LMS — P4 Quizzes & Certificates REST API Specification

> **Phase Status:** P4.0 Architecture Freeze (Final Clarified Baseline)  
> **Global Prefix:** `/api/v1`  
> **Authentication:** Requires `techsprout_session` HttpOnly session cookie unless explicitly marked `@Public()`.  
> **Response Envelope:** Follows standard `ApiSuccessResponse<T>` and `ApiErrorResponse` structures.

---

## 1. Response Envelope Formats

### 1.1 Success Response Envelope
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {},
  "requestId": "req_a1b2c3d4e5f67890",
  "timestamp": "2026-10-01T12:00:00.000Z"
}
```

### 1.2 Error Response Envelope
```json
{
  "success": false,
  "message": "Access denied: Enrollment required to access this assessment",
  "errorCode": "ENROLLMENT_REQUIRED",
  "statusCode": 403,
  "requestId": "req_a1b2c3d4e5f67890",
  "timestamp": "2026-10-01T12:00:00.000Z",
  "details": null
}
```

---

## 2. Admin & Instructor Quiz Authoring Endpoints

---

### `POST /api/v1/admin/modules/:moduleId/quizzes`
Creates a new quiz within a course module in `DRAFT` status.
- **Authorization:** `ADMIN` or `INSTRUCTOR` (must be author of the course).
- **Request Body (`CreateQuizDto`):**
```json
{
  "title": "Module 1 Assessment: TypeScript Foundations",
  "description": "Test your understanding of types, interfaces, and generics.",
  "quizType": "KNOWLEDGE_CHECK",
  "position": 3,
  "passingScorePercentage": 70,
  "maxAttempts": 3,
  "timeLimitMinutes": 30
}
```
- **Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Quiz created successfully",
  "data": {
    "id": "quiz-uuid-001",
    "moduleId": "mod-uuid-001",
    "title": "Module 1 Assessment: TypeScript Foundations",
    "description": "Test your understanding of types, interfaces, and generics.",
    "quizType": "KNOWLEDGE_CHECK",
    "position": 3,
    "passingScorePercentage": 70,
    "maxAttempts": 3,
    "timeLimitMinutes": 30,
    "status": "DRAFT",
    "createdAt": "2026-10-01T12:00:00.000Z"
  }
}
```

---

### `POST /api/v1/admin/quizzes/:quizId/questions`
Adds a question with options and designations of correct answers.
- **Request Body (`CreateQuestionDto`):**
```json
{
  "questionText": "Which TypeScript utility type constructs a type with all properties of T set to optional?",
  "questionType": "SINGLE_CHOICE",
  "position": 1,
  "points": 1,
  "explanation": "Partial<T> makes all properties in T optional.",
  "options": [
    { "optionText": "Required<T>", "isCorrect": false, "position": 1 },
    { "optionText": "Partial<T>", "isCorrect": true, "position": 2 },
    { "optionText": "Readonly<T>", "isCorrect": false, "position": 3 },
    { "optionText": "Pick<T, K>", "isCorrect": false, "position": 4 }
  ]
}
```
- **Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Question added successfully",
  "data": {
    "id": "q-uuid-001",
    "quizId": "quiz-uuid-001",
    "questionText": "Which TypeScript utility type constructs a type with all properties of T set to optional?",
    "questionType": "SINGLE_CHOICE",
    "position": 1,
    "points": 1,
    "explanation": "Partial<T> makes all properties in T optional.",
    "options": [
      { "id": "opt-1", "optionText": "Required<T>", "isCorrect": false, "position": 1 },
      { "id": "opt-2", "optionText": "Partial<T>", "isCorrect": true, "position": 2 },
      { "id": "opt-3", "optionText": "Readonly<T>", "isCorrect": false, "position": 3 },
      { "id": "opt-4", "optionText": "Pick<T, K>", "isCorrect": false, "position": 4 }
    ]
  }
}
```

---

### `POST /api/v1/admin/quizzes/:id/publish`
Transitions quiz status from `DRAFT` to `PUBLISHED`.
- **Validation:** Quiz must have at least 1 question, and every question must have at least one designated correct option.
- **Course Progress Side-Effect:**
  - Adds 1 required learning item to the active course completion denominator.
  - Any enrollment currently marked `COMPLETED` reverts to `ACTIVE` (with `completedAt = null`) as the student must now pass this newly published assessment to regain 100% completion.
  - Previously issued certificates remain valid historical records and are not invalidated or deleted.
- **Response (`200 OK`):** Updated quiz object with `status: "PUBLISHED"`.

---

### `POST /api/v1/admin/quizzes/:id/archive`
Retires a published quiz, changing status from `PUBLISHED` to `ARCHIVED`.
- **Course Progress Side-Effect:**
  - Removes the quiz from the course completion denominator.
  - Progress is transactionally recalculated for all active enrollments.
  - Active students who had completed all other requirements automatically transition to `COMPLETED` (`completedAt = NOW()`), triggering certificate issuance.
- **Response (`200 OK`):** Updated quiz object with `status: "ARCHIVED"`.

---

### `DELETE /api/v1/admin/quizzes/:id`
Deletes a quiz.
- **Conflict Protection:** If any student has started or completed attempts on this quiz, deletion is blocked:
```json
{
  "success": false,
  "message": "Cannot delete quiz: 8 student attempt(s) have been recorded. Archive the quiz to retire it without invalidating student academic records.",
  "errorCode": "QUIZ_HAS_ATTEMPTS",
  "statusCode": 409
}
```

---

### `GET /api/v1/admin/modules/:id/quizzes`
Lists all quizzes positioned inside a course module.
- **Authorization:** `ADMIN` or course `INSTRUCTOR`.
- **Response (`200 OK`):** Ordered list of quiz summaries.

---

### `GET /api/v1/admin/quizzes/:id`
Retrieves comprehensive authoring quiz detail including module, course, ordered questions, ordered options, and correct-answer metadata.
- **Authorization:** `ADMIN` or course `INSTRUCTOR`.
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Quiz retrieved successfully",
  "data": {
    "id": "quiz-uuid-001",
    "moduleId": "mod-uuid-001",
    "title": "Module 1 Assessment: TypeScript Foundations",
    "description": "Test your understanding of types, interfaces, and generics.",
    "quizType": "KNOWLEDGE_CHECK",
    "position": 1,
    "passingScorePercentage": 70,
    "maxAttempts": 3,
    "timeLimitMinutes": 30,
    "status": "DRAFT",
    "module": {
      "id": "mod-uuid-001",
      "title": "Module 1: Foundations",
      "courseId": "course-uuid-001"
    },
    "course": {
      "id": "course-uuid-001",
      "title": "Fullstack TypeScript Architecture"
    },
    "questionsCount": 1,
    "totalPoints": 1,
    "questions": [
      {
        "id": "q-uuid-001",
        "quizId": "quiz-uuid-001",
        "questionText": "Which TypeScript utility type constructs a type with all properties of T set to optional?",
        "questionType": "SINGLE_CHOICE",
        "position": 1,
        "points": 1,
        "explanation": "Partial<T> makes all properties in T optional.",
        "options": [
          { "id": "opt-1", "questionId": "q-uuid-001", "optionText": "Required<T>", "position": 1, "isCorrect": false },
          { "id": "opt-2", "questionId": "q-uuid-001", "optionText": "Partial<T>", "position": 2, "isCorrect": true }
        ]
      }
    ]
  }
}
```

---

### `PATCH /api/v1/admin/quizzes/:id`
Updates quiz metadata and configuration fields (`title`, `description`, `quizType`, `position`, `passingScorePercentage`, `maxAttempts`, `timeLimitMinutes`).
- **Authorization:** `ADMIN` or course `INSTRUCTOR`.
- **Immutability:** Direct mutation of `status` is rejected; lifecycle transitions require `/publish` or `/archive`.
- **Conflict Guard:** Rejects `quizType = 'FINAL_EXAM'` if another final exam is already designated in the parent course.

---

### `POST /api/v1/admin/modules/:id/quizzes/reorder`
Reorders quizzes within a module.
- **Request Body (`ReorderDto`):** `{ "items": [{ "id": "uuid", "position": 1 }, ...] }`
- **Response (`200 OK`):** `{ "success": true, "message": "Quizzes reordered successfully", "data": { "success": true, "count": 2 } }`

---

### `GET /api/v1/admin/questions/:id`
Retrieves question details along with all associated options and correct answers.
- **Authorization:** `ADMIN` or course `INSTRUCTOR`.

---

### `PATCH /api/v1/admin/questions/:id`
Updates question text, type, position, points, or explanation.
- **Protection:** Blocked with `409 Conflict` if recorded student attempts exist on the parent quiz.

---

### `DELETE /api/v1/admin/questions/:id`
Deletes a question from a quiz.
- **Protection:** Blocked with `409 Conflict` if recorded student attempts exist. Blocked with `422` if deleting would leave a published quiz with zero questions.

---

### `POST /api/v1/admin/quizzes/:quizId/questions/reorder`
Reorders questions within a quiz.
- **Request Body (`ReorderDto`):** `{ "items": [{ "id": "uuid", "position": 1 }, ...] }`
- **Response (`200 OK`):** Reorder confirmation.

---

### `POST /api/v1/admin/questions/:questionId/options`
Adds an individual option to an existing question.
- **Request Body (`CreateOptionDto`):** `{ "optionText": "True", "position": 1, "isCorrect": true }`
- **Constraints:** For `TRUE_FALSE`, option text must be "True" or "False", and at most two options are allowed.

---

### `PATCH /api/v1/admin/options/:id`
Updates an option's text, position, or correctness flag.
- **Protection:** Blocked with `409 Conflict` if recorded student attempts exist on the parent quiz.

---

### `DELETE /api/v1/admin/options/:id`
Deletes an option.
- **Protection:** Blocked with `409 Conflict` if recorded student attempts exist. Blocked if deleting would violate minimum required options on a published quiz.

---

### `POST /api/v1/admin/questions/:questionId/options/reorder`
Reorders options within a question.
- **Request Body (`ReorderDto`):** `{ "items": [{ "id": "uuid", "position": 1 }, ...] }`
- **Response (`200 OK`):** Reorder confirmation.


---

## 3. Student Learning & Quiz-Taking Endpoints

---

### `GET /api/v1/learn/courses/:courseId/curriculum`
Fetches course curriculum, lesson progress, and published quiz assessments with authoritative mixed curriculum ordering.
- **Security Invariant:** Answer keys (`isCorrect`), option sets, and question details are **strictly excluded** from the curriculum payload. Only `status = 'PUBLISHED'` quizzes appear. Draft and archived quizzes are excluded.
- **Authoritative Ordering:** The backend unifies lessons and published quizzes per module into a single ordered `items` collection (`type: 'LESSON' | 'QUIZ'`). Separate lesson/quiz namespace collisions are deterministically resolved on the server (`rawPosition ASC`, then `LESSON` precedes `QUIZ`, then `createdAt ASC` / ID) and indexed sequentially `1..N`.
- **Backward Compatibility:** `module.lessons` is preserved for legacy P3 consumers, while P4.4 frontend must consume `module.items` for complete curriculum visualization and navigation.
- **Authorization:** `ACTIVE` or `COMPLETED` enrollment, course instructor, or platform admin.
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Curriculum loaded successfully",
  "data": {
    "courseId": "course-uuid-001",
    "courseStatus": "PUBLISHED",
    "progressPercentage": 33,
    "completedLessonsCount": 1,
    "totalLessonsCount": 2,
    "publishedQuizzesCount": 1,
    "passedQuizzesCount": 0,
    "modules": [
      {
        "id": "module-uuid-001",
        "title": "Module 1: Foundations",
        "position": 1,
        "lessons": [
          {
            "id": "lesson-uuid-001",
            "title": "Introduction to Architecture",
            "position": 1,
            "lessonType": "VIDEO",
            "durationSeconds": 300,
            "isPreview": true,
            "progress": {
              "status": "COMPLETED",
              "watchPositionSeconds": 300,
              "completedAt": "2026-10-01T12:00:00.000Z"
            }
          }
        ],
        "items": [
          {
            "type": "LESSON",
            "id": "lesson-uuid-001",
            "title": "Introduction to Architecture",
            "position": 1,
            "lessonType": "VIDEO",
            "durationSeconds": 300,
            "isPreview": true,
            "progress": {
              "status": "COMPLETED",
              "watchPositionSeconds": 300,
              "completedAt": "2026-10-01T12:00:00.000Z"
            }
          },
          {
            "type": "QUIZ",
            "id": "quiz-uuid-001",
            "title": "Module 1 Assessment: TypeScript Foundations",
            "position": 2,
            "quizType": "KNOWLEDGE_CHECK",
            "passingScorePercentage": 70,
            "timeLimitMinutes": 30,
            "totalPoints": 20,
            "questionsCount": 5,
            "maxAttempts": 3,
            "isPassed": false,
            "userAttemptsCount": 1,
            "bestScorePercentage": 60
          }
        ]
      }
    ]
  }
}
```

---

### `GET /api/v1/learn/quizzes/:quizId`
Fetches quiz overview and questions for an enrolled student.
- **Security Invariant:** Correct answers (`isCorrect`) and `explanation` are **strictly excluded** from the payload.
- **Authorization:** Student must have an `ACTIVE` or `COMPLETED` enrollment in the parent course.
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Quiz loaded",
  "data": {
    "id": "quiz-uuid-001",
    "title": "Module 1 Assessment: TypeScript Foundations",
    "description": "Test your understanding of types, interfaces, and generics.",
    "passingScorePercentage": 70,
    "maxAttempts": 3,
    "timeLimitMinutes": 30,
    "totalPoints": 5,
    "questionsCount": 5,
    "userAttemptsCount": 1,
    "bestScorePercentage": 60,
    "isPassed": false,
    "questions": [
      {
        "id": "q-uuid-001",
        "questionText": "Which TypeScript utility type constructs a type with all properties of T set to optional?",
        "questionType": "SINGLE_CHOICE",
        "position": 1,
        "points": 1,
        "options": [
          { "id": "opt-1", "optionText": "Required<T>" },
          { "id": "opt-2", "optionText": "Partial<T>" },
          { "id": "opt-3", "optionText": "Readonly<T>" },
          { "id": "opt-4", "optionText": "Pick<T, K>" }
        ]
      }
    ]
  }
}
```

---

### `POST /api/v1/learn/quizzes/:quizId/attempts`
Initiates a new quiz attempt.
- **Validation & Enrollment Semantics:**
  - **ACTIVE enrollment:** May access published quiz, start new attempts, and resume in-progress attempts.
  - **COMPLETED enrollment:** May access quiz overview, view attempt history, and review submitted attempts; may not start new attempts unless curriculum expansion reverts enrollment to `ACTIVE`.
  - **Max Attempts Guard:** Validates `userAttemptsCount < maxAttempts` (or `maxAttempts === null`). If attempt limit reached, returns `422 Unprocessable Entity` (`MAX_ATTEMPTS_REACHED`).
  - **Timing & Resumption:** If an active unexpired attempt exists, resumes the attempt without creating duplicate rows. If an active attempt expired past the 30s grace window, transitions to `ABANDONED` and counts toward `maxAttempts`.
  - Non-enrolled users return `403 Forbidden` (`ENROLLMENT_REQUIRED`).
- **Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Attempt started",
  "data": {
    "id": "att-uuid-001",
    "quizId": "quiz-uuid-001",
    "attemptNumber": 2,
    "status": "IN_PROGRESS",
    "startedAt": "2026-10-01T12:05:00.000Z",
    "expiresAt": "2026-10-01T12:35:00.000Z"
  }
}
```

---

### `GET /api/v1/learn/quizzes/:quizId/attempts/:attemptId`
Retrieves attempt details.
- For `IN_PROGRESS` attempts: restores active attempt state, questions (without answer keys or explanations), and previously autosaved answers.
- For `SUBMITTED` attempts: returns final score summary (without exposing review answers; full review is on `/review`).
- **Response (`200 OK` for IN_PROGRESS):**
```json
{
  "success": true,
  "message": "Attempt details retrieved",
  "data": {
    "id": "att-uuid-001",
    "quizId": "quiz-uuid-001",
    "attemptNumber": 2,
    "status": "IN_PROGRESS",
    "startedAt": "2026-10-01T12:05:00.000Z",
    "lastSavedAt": "2026-10-01T12:10:00.000Z",
    "expiresAt": "2026-10-01T12:35:00.000Z",
    "timeLimitMinutes": 30,
    "questions": [...],
    "savedAnswers": [
      { "questionId": "q-uuid-001", "selectedOptionIds": ["opt-2"] }
    ]
  }
}
```

---

### `PATCH /api/v1/learn/quizzes/:quizId/attempts/:attemptId/answers`
Auto-saves student answer selections as the student progresses.
- **Request Body:**
```json
{
  "answers": [
    { "questionId": "q-uuid-001", "selectedOptionIds": ["opt-2"] }
  ]
}
```
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Answers saved",
  "data": {
    "attemptId": "att-uuid-001",
    "lastSavedAt": "2026-10-01T12:10:00.000Z"
  }
}
```

---

### `POST /api/v1/learn/quizzes/:quizId/attempts/:attemptId/submit`
Submits the attempt for final server-side grading.
- **Double Submission Guard:** If `attempt.status === 'SUBMITTED'`, returns `409 Conflict` (`ATTEMPT_ALREADY_SUBMITTED`).
- **Expiration Guard:** If submitted after expiration + 30s grace window, returns `409 Conflict` (`QUIZ_TIME_EXPIRED`).
- **Zero Points Anomaly Guard:** If `totalPoints <= 0` or quiz has no questions, returns `422 Unprocessable Entity` (`QUIZ_INVALID_FOR_ATTEMPT`).
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Quiz attempt graded successfully",
  "data": {
    "attemptId": "att-uuid-001",
    "status": "SUBMITTED",
    "score": 4,
    "totalPoints": 5,
    "percentage": 80.00,
    "isPassed": true,
    "submittedAt": "2026-10-01T12:20:00.000Z",
    "courseProgressPercentage": 100,
    "isCourseCompleted": true
  }
}
```

---

### `GET /api/v1/learn/quizzes/:quizId/attempts/:attemptId/review`
Provides complete post-submission review with questions, selected answers, correct answers, and explanations.
- **Authorization:** Only accessible if `attempt.status === 'SUBMITTED'`. If still `IN_PROGRESS`, returns `403 Forbidden` (`ATTEMPT_IN_PROGRESS`).

---

## 4. Certificates & Verification Endpoints

---

### `GET /api/v1/courses/:courseId/certificate`
Retrieves the issued certificate for the authenticated student upon course completion.
- **Authentication & Security:**
  - Requires authenticated session cookie (`techsprout_session`) or Bearer token.
  - Student identity is derived strictly from `req.user.id`. Client-supplied user/student IDs are never accepted.
  - Secure tenant isolation: Student A can never access Student B's certificate.
- **Side-Effect Boundary & Lazy-Issuance Exception:**
  - While standard query endpoints (`GET /api/v1/learn/courses/:courseId/curriculum`, `GET /api/v1/learn/courses/:courseId/resume`) are strictly read-only and side-effect free, this student certificate endpoint contains an intentional, authorized lazy-issuance exception:
  - If a student completed all course requirements and their enrollment status is `COMPLETED`, but no certificate record exists in the database, this endpoint invokes `CertificateService.issueCertificateIfEligible(...)` to atomically generate the certificate snapshot.
- **Frozen Precedence Contract:**
  1. **Case A (Unenrolled Student):**
     - Returns `404 Not Found` (`ENROLLMENT_NOT_FOUND`).
     - Does not leak whether another student holds a certificate for this course.
  2. **Case B (Certificate Already Exists):**
     - Certificate existence takes absolute precedence over current enrollment status.
     - Returns `200 OK` with the existing historical certificate snapshot regardless of whether current enrollment is `COMPLETED`, reverted to `ACTIVE` due to curriculum expansion, or marked `REVOKED`.
  3. **Case C (Enrollment COMPLETED + No Certificate Exists):**
     - Invokes `CertificateService.issueCertificateIfEligible(...)`.
     - Returns `200 OK` with the newly minted certificate DTO.
     - If curriculum criteria are unsatisfied, returns `403 Forbidden` (`COURSE_NOT_COMPLETED`).
  4. **Case D (Enrollment Not COMPLETED + No Certificate Exists):**
     - Returns `403 Forbidden` (`COURSE_NOT_COMPLETED`, message: "You have not completed all requirements for this course. Complete all lessons and assessments to earn your certificate.").
     - No certificate is created.
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Certificate retrieved successfully",
  "data": {
    "id": "cert-uuid-001",
    "certificateNumber": "TSP-2026-CK7M9X2P",
    "studentName": "Jane Doe",
    "courseTitle": "Fullstack Web Development with NestJS & Next.js",
    "instructorName": "Prof. Alan Turing",
    "completedAt": "2026-10-01T12:20:00.000Z",
    "issuedAt": "2026-10-01T12:20:02.000Z",
    "finalScorePercentage": 85,
    "status": "ACTIVE",
    "pdfUrl": null
  }
}
```

---

### `GET /api/v1/certificates/verify/:certificateNumber` (`@Public()`)
Public verification route accessible to anyone with a certificate verification code.
- **Side-Effect Boundary:** Strictly read-only and side-effect free.
- **Session Policy:** Completely public (`@Public()`). No authentication cookies, sessions, or headers required.
- **Rate Limiting:** Enforced via TechSprout's established NestJS Throttler infrastructure (`@Throttle({ default: { limit: 20, ttl: 60000 } })`). Rapid automated requests exceeding the threshold return `429 Too Many Requests`.
- **Privacy Boundary:** Zero private student data is returned. Excludes internal UUIDs (`id`, `enrollmentId`, `courseId`, `studentId`, `userId`), emails, phone numbers, PDF media IDs, creation/update timestamps, and audit metadata.
- **Active Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Certificate verification successful",
  "data": {
    "isValid": true,
    "certificateNumber": "TSP-2026-CK7M9X2P",
    "status": "ACTIVE",
    "studentName": "Jane Doe",
    "courseTitle": "Fullstack Web Development with NestJS & Next.js",
    "instructorName": "Prof. Alan Turing",
    "completedAt": "2026-10-01T12:20:00.000Z",
    "issuedAt": "2026-10-01T12:20:02.000Z",
    "finalScorePercentage": 85
  }
}
```
- **Revoked Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Certificate has been administratively revoked",
  "data": {
    "isValid": false,
    "certificateNumber": "TSP-2026-CK7M9X2P",
    "status": "REVOKED",
    "studentName": "Jane Doe",
    "courseTitle": "Fullstack Web Development with NestJS & Next.js",
    "instructorName": "Prof. Alan Turing",
    "revokedAt": "2026-10-15T08:00:00.000Z",
    "revocationReason": "Academic dishonesty: unauthorized assessment assistance."
  }
}
```
- **Not Found Response (`404 Not Found`):**
```json
{
  "success": false,
  "message": "Certificate not found",
  "errorCode": "CERTIFICATE_NOT_FOUND"
}
```

---

### `GET /api/v1/admin/certificates`
Paginated administrative list of all issued certificates.
- **Authorization:** `ADMIN` role only (`@UseGuards(RolesGuard)`, `@Roles('admin')`). Non-admin attempts return `403 Forbidden`.
- **Side-Effect Boundary:** Strictly read-only and side-effect free.
- **Query Parameters (Validated via `AdminQueryCertificatesDto`):**
  - `page`: integer >= 1 (default 1)
  - `limit`: integer 1-100 (default 20)
  - `status`: `ACTIVE` | `REVOKED` (optional)
  - `courseId`: UUID (optional)
  - `search`: string up to 100 characters (matches student name or certificate number)
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Certificates retrieved successfully",
  "data": {
    "items": [
      {
        "id": "c1111111-2222-3333-4444-555555555555",
        "certificateNumber": "TSP-2026-CK7M9X2P",
        "enrollmentId": "e1111111-2222-3333-4444-555555555555",
        "courseId": "d1111111-2222-3333-4444-555555555555",
        "studentId": "u1111111-2222-3333-4444-555555555555",
        "studentName": "Jane Doe",
        "courseTitle": "Fullstack Web Development with NestJS & Next.js",
        "instructorName": "Prof. Alan Turing",
        "completedAt": "2026-10-01T12:20:00.000Z",
        "issuedAt": "2026-10-01T12:20:02.000Z",
        "finalScorePercentage": 85,
        "status": "ACTIVE",
        "revokedAt": null,
        "revocationReason": null,
        "pdfMediaId": null,
        "pdfUrl": null,
        "createdAt": "2026-10-01T12:20:02.000Z",
        "updatedAt": "2026-10-01T12:20:02.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

---

### `GET /api/v1/admin/certificates/:id`
Retrieves detailed administrative certificate view by internal primary key UUID.
- **Authorization:** `ADMIN` role only.
- **Side-Effect Boundary:** Strictly read-only and side-effect free.
- **Response (`200 OK`):** Single `AdminCertificateDto` with administrative IDs.
- **Not Found (`404 Not Found`):** Returns `CERTIFICATE_NOT_FOUND` if certificate does not exist.

---

### `POST /api/v1/admin/certificates/:id/revoke`
Administratively revokes an issued certificate.
- **Authorization:** `ADMIN` role only (`@Roles('admin')`). Non-admin attempts return `403 Forbidden`.
- **Request Body (Validated via `RevokeCertificateDto`):**
  - `reason`: required string, 5–1000 characters (trimmed).
```json
{
  "reason": "Academic dishonesty: unauthorized assessment assistance."
}
```
- **Business Logic & Audit Delegation:**
  - Revocation is delegated exclusively to `CertificateService.revokeCertificate(id, reason, context)`.
  - The controller never directly mutates database certificate fields.
  - `CertificateService` atomically updates `status = 'REVOKED'`, `revokedAt = NOW()`, `revocationReason = reason`, `updatedAt = NOW()`.
  - Historical snapshot fields (`studentName`, `courseTitle`, `instructorName`, `completedAt`, `issuedAt`, `finalScorePercentage`, `certificateNumber`) remain strictly untouched and immutable.
  - `CertificateService` emits exactly one `CERTIFICATE_REVOKED` event to `audit_logs` capturing actor, target, timestamp, and rationale.
- **Response Codes:**
  - `200 OK`: Successful revocation, returning the updated `AdminCertificateDto`.
  - `400 Bad Request`: Validation failure on `reason` (`VALIDATION_ERROR`).
  - `404 Not Found`: Certificate not found (`CERTIFICATE_NOT_FOUND`).
  - `409 Conflict`: Certificate already revoked (`CERTIFICATE_ALREADY_REVOKED`).
