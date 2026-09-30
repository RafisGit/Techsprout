# TechSprout School LMS — P3 Enrollment & Learning Progress REST API Specification

> **Phase Status:** P3.0 Architecture Freeze (Final Clarified Baseline)  
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
  "requestId": "req_84f9a012bcde4567",
  "timestamp": "2026-09-30T18:00:00.000Z"
}
```

### 1.2 Error Response Envelope
```json
{
  "success": false,
  "message": "Access denied: Enrollment required to view this lesson",
  "errorCode": "ENROLLMENT_REQUIRED",
  "statusCode": 403,
  "requestId": "req_84f9a012bcde4567",
  "timestamp": "2026-09-30T18:00:00.000Z",
  "details": null
}
```

---

## 2. Student Enrollment Endpoints

---

### `POST /api/v1/enrollments` (Self-Enrollment)
Enrolls the authenticated user (student or instructor) into a published course.
- **Security Rule:** `studentId` is derived strictly from `req.user.id`. The client cannot supply a `studentId`. Any client-supplied `studentId` in the request body is stripped/ignored to prevent IDOR attacks.
- **Idempotent:** Re-enrolling in an active course returns the existing record without error (`200 OK`).

#### Headers
- `Cookie: techsprout_session=<token>`

#### Request Body (`CreateEnrollmentDto`)
```json
{
  "courseId": "c1a2b3c4-1111-2222-3333-444455556666"
}
```

#### Response (`201 Created` or `200 OK`)
```json
{
  "success": true,
  "message": "Course enrollment successful",
  "data": {
    "id": "e1f2a3b4-5555-6666-7777-888899990000",
    "courseId": "c1a2b3c4-1111-2222-3333-444455556666",
    "studentId": "27fe90b9-f325-4a0b-9dbc-35c25472e648",
    "status": "ACTIVE",
    "enrolledAt": "2026-09-30T18:00:00.000Z",
    "startedAt": null,
    "completedAt": null,
    "progressPercentage": 0
  }
}
```

#### Error Codes
- `401 Unauthorized`: `UNAUTHENTICATED` (Missing or expired session).
- `404 Not Found`: `COURSE_NOT_FOUND` (Course does not exist or is in `DRAFT`).
- `422 Unprocessable Entity`: `COURSE_ARCHIVED` (Course is archived; new enrollments closed).

---

### `GET /api/v1/enrollments`
Lists all courses enrolled by the authenticated student, including progress percentage, completion status, and resume metadata. Includes archived courses that the student previously enrolled in.

#### Query Parameters
- `status` (`string`, optional): Filter by `ACTIVE`, `COMPLETED`, or `CANCELLED`.
- `page` (`integer`, optional, default `1`): 1-indexed page number.
- `limit` (`integer`, optional, default `12`, max `50`): Results per page.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Enrolled courses retrieved successfully",
  "data": {
    "items": [
      {
        "enrollmentId": "e1f2a3b4-5555-6666-7777-888899990000",
        "status": "ACTIVE",
        "enrolledAt": "2026-09-30T18:00:00.000Z",
        "startedAt": "2026-09-30T18:05:00.000Z",
        "completedAt": null,
        "progress": {
          "completedLessons": 6,
          "totalLessons": 24,
          "percentage": 25
        },
        "resumePoint": {
          "lessonId": "les-007",
          "moduleId": "mod-002",
          "lessonTitle": "Variables and Data Types in C#",
          "watchPositionSeconds": 340
        },
        "course": {
          "id": "c1a2b3c4-1111-2222-3333-444455556666",
          "title": "Complete Game Development with Unity",
          "slug": "complete-game-development-with-unity",
          "status": "PUBLISHED",
          "thumbnailUrl": "https://res.cloudinary.com/h6udu3ze/image/upload/v1/thumb.jpg",
          "category": {
            "id": "cat-001",
            "name": "Game Development",
            "slug": "game-development"
          },
          "instructor": {
            "id": "usr-002",
            "name": "Alex Mercer"
          }
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    }
  }
}
```

---

### `GET /api/v1/courses/:courseId/enrollment`
Checks whether the authenticated student has an active or completed enrollment for the specified course.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Enrollment status retrieved",
  "data": {
    "isEnrolled": true,
    "enrollment": {
      "id": "e1f2a3b4-5555-6666-7777-888899990000",
      "status": "ACTIVE",
      "enrolledAt": "2026-09-30T18:00:00.000Z",
      "progressPercentage": 25
    }
  }
}
```
*(If student is not enrolled, `isEnrolled` is `false` and `enrollment` is `null`).*

---

### `POST /api/v1/enrollments/:id/cancel`
Cancels the student's enrollment in a course.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Enrollment cancelled successfully",
  "data": {
    "id": "e1f2a3b4-5555-6666-7777-888899990000",
    "status": "CANCELLED"
  }
}
```

---

## 3. Student Learning Workspace & Progress Endpoints

---

### `GET /api/v1/learn/courses/:courseId/resume`
Resolves the next logical study checkpoint ("Continue Learning") for the enrolled course. Operational for both `PUBLISHED` and `ARCHIVED` courses for enrolled students.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Resume point resolved",
  "data": {
    "lessonId": "les-007",
    "moduleId": "mod-002",
    "lessonTitle": "Variables and Data Types in C#",
    "lessonType": "VIDEO",
    "watchPositionSeconds": 340,
    "progressPercentage": 25,
    "isCourseCompleted": false
  }
}
```

---

### `GET /api/v1/learn/courses/:courseId/curriculum`
Fetches the full course curriculum with embedded progress indicators (completed checkmarks, watch positions) for the enrolled student.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Learning curriculum retrieved successfully",
  "data": {
    "courseId": "c1a2b3c4-1111-2222-3333-444455556666",
    "courseStatus": "PUBLISHED",
    "progressPercentage": 25,
    "completedLessonsCount": 6,
    "totalLessonsCount": 24,
    "modules": [
      {
        "id": "mod-001",
        "title": "Module 1: Getting Started",
        "position": 1,
        "lessons": [
          {
            "id": "les-001",
            "title": "Installation and Setup",
            "position": 1,
            "lessonType": "VIDEO",
            "durationSeconds": 600,
            "progress": {
              "status": "COMPLETED",
              "watchPositionSeconds": 580,
              "completedAt": "2026-09-30T18:15:00.000Z"
            }
          },
          {
            "id": "les-002",
            "title": "Unity Interface Overview",
            "position": 2,
            "lessonType": "VIDEO",
            "durationSeconds": 840,
            "progress": {
              "status": "IN_PROGRESS",
              "watchPositionSeconds": 320,
              "completedAt": null
            }
          }
        ]
      }
    ]
  }
}
```

---

### `GET /api/v1/learn/courses/:courseId/lessons/:lessonId`
Fetches the full learning content of a lesson. Validates that the caller is actively enrolled (or course author / admin). Operational for enrolled students on both `PUBLISHED` and `ARCHIVED` courses.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Lesson content retrieved successfully",
  "data": {
    "id": "les-002",
    "moduleId": "mod-001",
    "courseId": "c1a2b3c4-1111-2222-3333-444455556666",
    "title": "Unity Interface Overview",
    "lessonType": "VIDEO",
    "durationSeconds": 840,
    "mediaUrl": "https://res.cloudinary.com/h6udu3ze/video/upload/v1/unity-interface.mp4",
    "content": null,
    "progress": {
      "status": "IN_PROGRESS",
      "watchPositionSeconds": 320,
      "completedAt": null
    },
    "navigation": {
      "previousLessonId": "les-001",
      "nextLessonId": "les-003"
    }
  }
}
```

#### Error Codes
- `403 Forbidden`: `ENROLLMENT_REQUIRED` (User is authenticated but not enrolled in this course).
- `404 Not Found`: `LESSON_NOT_FOUND` (Lesson does not exist in this course).

---

### `POST /api/v1/learn/courses/:courseId/lessons/:lessonId/progress`
Records playback position checkpoint. Client calls every 15s or on pause/seek/unload. `watchPositionSeconds` is the single authoritative field.

#### Request Body (`UpdateProgressCheckpointDto`)
```json
{
  "watchPositionSeconds": 335
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Progress checkpoint saved",
  "data": {
    "lessonId": "les-002",
    "status": "IN_PROGRESS",
    "watchPositionSeconds": 335,
    "isCompleted": false,
    "courseProgressPercentage": 25
  }
}
```
*(If `watchPositionSeconds >= 0.90 * durationSeconds`, the engine automatically transitions `status` to `COMPLETED` and recalculates `courseProgressPercentage`).*

---

### `POST /api/v1/learn/courses/:courseId/lessons/:lessonId/complete`
Explicitly toggles lesson completion status (e.g. clicking "Mark Complete" or "Mark Incomplete").

#### Request Body (`ToggleLessonCompleteDto`)
```json
{
  "completed": true
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Lesson marked as complete",
  "data": {
    "lessonId": "les-002",
    "status": "COMPLETED",
    "completedAt": "2026-09-30T18:30:00.000Z",
    "courseProgress": {
      "completedLessons": 7,
      "totalLessons": 24,
      "percentage": 29,
      "isCourseCompleted": false
    }
  }
}
```

---

## 4. Admin Management & Conflict Handling

---

### `DELETE /api/v1/admin/lessons/:id` (Protected Against Progress History)
Deletes a lesson from the curriculum.

#### Error Response (`409 Conflict`)
If any student has recorded learning progress on this lesson, deletion is blocked:
```json
{
  "success": false,
  "message": "Cannot delete lesson: 12 student(s) have recorded learning progress on this lesson. To retire this lesson without disrupting student history, remove it from the curriculum or mark it inactive.",
  "errorCode": "LESSON_HAS_STUDENT_PROGRESS",
  "statusCode": 409,
  "requestId": "req_84f9a012bcde4567",
  "timestamp": "2026-09-30T18:00:00.000Z",
  "details": {
    "progressCount": 12
  }
}
```

---

### `POST /api/v1/admin/courses/:courseId/enrollments` (Admin-Assigned Enrollment)
Allows an Administrator to assign and enroll a specific target student into a course.
- **Authorization:** `ADMIN` role required (`RolesGuard(['admin'])`). Students and instructors receive `403 Forbidden`.
- **Validation:**
  - Validates target `studentId` exists in `users` and is eligible/active.
  - Validates `courseId` exists and is `PUBLISHED`.
  - Respects duplicate/idempotency rules (returns `200 OK` if already active; reactivates if `CANCELLED`).
  - Records an audit event using `AuditService` with `type: 'ADMIN_ASSIGNED'` and `enrolledBy: adminId`.

#### Headers
- `Cookie: techsprout_session=<admin_token>`

#### Route Parameters
- `courseId` (`uuid`, required): The target course ID.

#### Request Body (`AdminAssignEnrollmentDto`)
```json
{
  "studentId": "27fe90b9-f325-4a0b-9dbc-35c25472e648"
}
```

#### Response (`201 Created` or `200 OK`)
```json
{
  "success": true,
  "message": "Student successfully enrolled by administrator",
  "data": {
    "id": "e1f2a3b4-5555-6666-7777-888899990000",
    "courseId": "c1a2b3c4-1111-2222-3333-444455556666",
    "studentId": "27fe90b9-f325-4a0b-9dbc-35c25472e648",
    "status": "ACTIVE",
    "enrolledAt": "2026-09-30T18:00:00.000Z",
    "startedAt": null,
    "completedAt": null,
    "progressPercentage": 0
  }
}
```

#### Error Codes
- `401 Unauthorized`: `UNAUTHENTICATED` (Missing or expired session).
- `403 Forbidden`: `FORBIDDEN` (Caller does not have `admin` role).
- `404 Not Found`: `COURSE_NOT_FOUND` (Course ID does not exist).
- `404 Not Found`: `STUDENT_NOT_FOUND` (Target `studentId` does not exist in `users`).
- `422 Unprocessable Entity`: `STUDENT_INELIGIBLE` (Target user is suspended or inactive).
- `422 Unprocessable Entity`: `COURSE_ARCHIVED` (Course is archived; new enrollments closed).

---

### `GET /api/v1/admin/courses/:id/enrollments`
Lists enrollees and progress summaries for an institutional course (Admin or course Instructor).

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Course enrollments retrieved successfully",
  "data": {
    "courseId": "c1a2b3c4-1111-2222-3333-444455556666",
    "totalEnrolled": 142,
    "completedCount": 38,
    "items": [
      {
        "enrollmentId": "e1f2a3b4-5555-6666-7777-888899990000",
        "student": {
          "id": "usr-student-01",
          "name": "Rahim Ahmed",
          "email": "rahim@techsprout.edu"
        },
        "status": "ACTIVE",
        "enrolledAt": "2026-09-15T10:00:00.000Z",
        "completedAt": null,
        "lastAccessedAt": "2026-09-30T18:30:00.000Z",
        "progressPercentage": 45
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 142,
      "totalPages": 8,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

---

## 5. Architecture Clarifications — P3.0 Final Gate

### 5.1 Course Completion After Curriculum Changes
- Strict state synchronization: `status === 'COMPLETED' <=> progressPercentage === 100 <=> completedAt !== null`.
- When a new required lesson is added, an existing completed enrollment reverts to `ACTIVE` and `completedAt` resets to `null` until the student finishes all new lessons.

### 5.2 Watch Position Model
- `watchPositionSeconds` is the single authoritative field. `lastWatchedPositionSeconds` is excluded from the schema and DTOs.
- Resume position uses `watchPositionSeconds`. Free seeking is supported. Near-end playback resets to `0`.

### 5.3 Archived Course Access
- Enrolled students maintain 100% access to archived courses: open lessons, stream media, update progress checkpoints, mark complete, achieve completion, and resume learning.
- Only new enrollments are rejected with `422 Unprocessable Entity` (`COURSE_ARCHIVED`).

### 5.4 Lesson Deletion With Progress
- `DELETE /api/v1/admin/lessons/:id` returns `409 Conflict` (`LESSON_HAS_STUDENT_PROGRESS`) if progress rows exist. Handled via application pre-check.

### 5.5 Instructor Enrollment
- Instructors can self-enroll in published courses, including their own authored courses, via `POST /api/v1/enrollments` to experience the learning workspace as a student without impacting admin authoring tools.

### 5.6 Administrative Enrollment vs Self-Enrollment API Separation
- **Self-Enrollment:** `POST /api/v1/enrollments` accepts `{ courseId }`. `studentId` is strictly bound to `req.user.id`. Permitted for `STUDENT`, `INSTRUCTOR`, and `ADMIN`.
- **Admin Enrollment:** `POST /api/v1/admin/courses/:courseId/enrollments` accepts `{ studentId }`. Guarded by `RolesGuard(['admin'])`. Explicitly selects target student, validates target existence and eligibility, checks course eligibility, respects idempotency, and records audit trail with `type: 'ADMIN_ASSIGNED'`.

### 5.7 P3.2 Implementation Verification Status
- **Status:** Verified & Complete (Phase P3.2)
- **Adherence:** 100% match to frozen architectural contract.
- **Endpoints:** All 12 endpoints implemented with exact route paths, parameter validations, DTO constraints, response envelopes, error codes, and audit logging.
- **Contradictions:** None. Database schema, business rules, and API specifications operate in complete harmony.
