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
  "errorCode": "QUIZ_HAS_STUDENT_ATTEMPTS",
  "statusCode": 409
}
```

---

## 3. Student Learning & Quiz-Taking Endpoints

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
- **Validation:**
  - Validates `userAttemptsCount < maxAttempts` (or `maxAttempts === null`).
  - Checks course enrollment is active.
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
- **Historical Invariant:** If additional lessons or quizzes were published after initial course completion (causing the active enrollment to return to `ACTIVE`), the student can still retrieve their historical certificate, as an already-issued certificate is an immutable historical record.
- **Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Certificate retrieved",
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
    "pdfUrl": "https://res.cloudinary.com/h6udu3ze/raw/upload/certificates/TSP-2026-CK7M9X2P.pdf"
  }
}
```
*(If student has never completed the course and no certificate exists, returns `404 Not Found` with `CERTIFICATE_NOT_FOUND` or `403 Forbidden` with `COURSE_NOT_COMPLETED`).*

---

### `GET /api/v1/certificates/verify/:certificateNumber` (`@Public()`)
Public verification route accessible to anyone with a certificate verification code.
- **Security:** Zero private student data (no email, user ID, or database keys) is returned.
- **Response (`200 OK`):**
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

---

### `POST /api/v1/admin/certificates/:id/revoke`
Administratively revokes an issued certificate.
- **Authorization:** `ADMIN` role only.
- **Request Body:**
```json
{
  "reason": "Academic dishonesty: unauthorized assessment assistance."
}
```
- **Response (`200 OK`):** Certificate status updated to `REVOKED`.
