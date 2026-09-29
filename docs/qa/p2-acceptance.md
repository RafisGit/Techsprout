# TechSprout School LMS — Phase P2 Acceptance Criteria & QA Test Plan

> **Phase Status:** P2.0 Architecture Freeze  
> **Target Subsystem:** Course Catalog, Curricular Modules, Lessons, and Cloudinary Media Management.  
> **Reference ADR:** [`docs/adr/0004-p2-catalog-media.md`](file:///d:/Work/2026/techsprout-main/docs/adr/0004-p2-catalog-media.md)

---

## 1. Domain Model & Relational Integrity Acceptance Criteria

- [ ] **AC-DM-01 (Category Uniqueness):** Attempting to insert a category with an existing `name` or `slug` returns `409 Conflict` (`CATEGORY_ALREADY_EXISTS`).
- [ ] **AC-DM-02 (Category Deletion Restrict):** Attempting to delete a category containing linked courses is blocked by foreign key constraint (`ON DELETE RESTRICT`) and returns `409 Conflict` (`CATEGORY_HAS_COURSES`).
- [ ] **AC-DM-03 (Course Slug Uniqueness):** Course slugs are strictly unique. Attempting to create or update a course with a duplicate slug returns `409 Conflict`.
- [ ] **AC-DM-04 (Module Position Uniqueness):** Within a given course, `UNIQUE(course_id, position)` prevents duplicate module positions. Creating or reordering a module to an existing position fails with a database unique violation unless handled in a reorder transaction.
- [ ] **AC-DM-05 (Lesson Position Uniqueness):** Within a given module, `UNIQUE(module_id, position)` prevents duplicate lesson positions.
- [ ] **AC-DM-06 (Lesson Types Whitelist):** `lesson_type` accepts only `VIDEO`, `TEXT`, and `PDF`. Any other type (including quizzes or assessments) is rejected by schema validation.
- [ ] **AC-DM-07 (Cascade Deletion):** Deleting a course cleanly cascades to its modules and lessons. Deleting a module cleanly cascades to its lessons.

---

## 2. Course State Machine Acceptance Criteria

- [ ] **AC-SM-01 (Default Draft Status):** Newly created courses always default to `status = 'DRAFT'`.
- [ ] **AC-SM-02 (Generic Status Mutation Blocked):** Sending `PATCH /api/v1/admin/courses/:id` with `{ "status": "PUBLISHED" }` ignores the status field; course status remains unchanged.
- [ ] **AC-SM-03 (Publishing Preconditions):** `POST /api/v1/admin/courses/:id/publish` validates that:
  - Course has title, slug, description, category, and price.
  - Course contains at least 1 module.
  - Every module contains at least 1 lesson.
  - All video lessons have a valid attached `media_id`.
  - Violations return `422 Unprocessable Entity` with specific missing prerequisite details.
- [ ] **AC-SM-04 (Publishing Authority):** `POST /api/v1/admin/courses/:id/publish` is restricted exclusively to `admin`. Calling with an `instructor` or `student` session returns `403 Forbidden`.
- [ ] **AC-SM-05 (Unpublishing):** Calling `POST /api/v1/admin/courses/:id/unpublish` transitions `PUBLISHED` → `DRAFT`. The course immediately disappears from public catalog endpoints.
- [ ] **AC-SM-06 (Archiving):** Calling `POST /api/v1/admin/courses/:id/archive` transitions `PUBLISHED` → `ARCHIVED`. The course is removed from active public discovery.
- [ ] **AC-SM-07 (Hard Deletion Protection):** Attempting to execute `DELETE /api/v1/admin/courses/:id` on a course with `status = 'PUBLISHED'` or `status = 'ARCHIVED'` returns `400 Bad Request` (`CANNOT_DELETE_NON_DRAFT`). Only `DRAFT` courses may be deleted.

---

## 3. Instructor Scoping & IDOR Prevention Acceptance Criteria

- [ ] **AC-AUTH-01 (Instructor Creation Scope):** When an instructor creates a course, `instructor_id` is automatically set to `req.user.id`. Any `instructorId` provided in the body is overwritten.
- [ ] **AC-AUTH-02 (Instructor Edit Boundary):** An instructor attempting to `PATCH` or `DELETE` a course owned by another instructor receives `403 Forbidden` (`FORBIDDEN_NOT_COURSE_OWNER`).
- [ ] **AC-AUTH-03 (Instructor Module Boundary):** An instructor cannot create, edit, or delete modules in a course they do not own.
- [ ] **AC-AUTH-04 (Instructor Lesson Boundary):** An instructor cannot create, edit, or delete lessons in a module belonging to a course they do not own.
- [ ] **AC-AUTH-05 (Admin Universal Access):** An institutional administrator can view, update, and manage modules/lessons for any course across the system.
- [ ] **AC-AUTH-06 (Instructor Reassignment):** Only an administrator can reassign a course to a different instructor via `PATCH /api/v1/admin/courses/:id` with `{ "instructorId": "new-uuid" }`.

---

## 4. Public Catalog & Search Acceptance Criteria

- [ ] **AC-PUB-01 (Strict Visibility Filter):** `GET /api/v1/courses` never returns draft or archived courses, regardless of query parameters. Only records satisfying `status = 'PUBLISHED' AND visibility = 'PUBLIC'` are returned.
- [ ] **AC-PUB-02 (Slug Lookup):** `GET /api/v1/courses/:slug` fetches the published course and its curriculum. Requesting a draft or archived course by slug as an unauthenticated guest returns `404 Not Found`.
- [ ] **AC-PUB-03 (Search Filter):** Searching with `?search=unity` returns courses containing "unity" (case-insensitive) in either `title` or `shortDescription`.
- [ ] **AC-PUB-04 (Category Filter):** Filtering with `?categorySlug=game-development` returns only courses belonging to that category.
- [ ] **AC-PUB-05 (Sorting Verification):**
  - `?sortBy=price&sortOrder=asc` sorts courses from lowest to highest price.
  - `?sortBy=price&sortOrder=desc` sorts courses from highest to lowest price.
  - Default sort without parameters orders by `createdAt DESC`.
- [ ] **AC-PUB-06 (Pagination Boundaries):**
  - Returns `items`, `page`, `limit`, `total`, `totalPages`, `hasNextPage`, and `hasPreviousPage`.
  - Setting `?limit=150` clamps to `100` (max limit).
- [ ] **AC-PUB-07 (Lesson Previews):** Public course detail queries return lesson `mediaUrl` only for lessons where `isPreview = true`. For non-preview lessons, `mediaUrl` is `null`.

---

## 5. Media & Cloudinary Integration Acceptance Criteria

- [ ] **AC-MED-01 (Backend Secret Isolation):** `CLOUDINARY_API_SECRET` and `CLOUDINARY_API_KEY` are never returned in any API response or exposed to the client bundle.
- [ ] **AC-MED-02 (Image Upload):** `POST /api/v1/media/upload/image` accepts valid JPEG/PNG/WebP under 10MB, uploads to `techsprout/images/courses`, and returns a saved `Media` record with UUID.
- [ ] **AC-MED-03 (Video Signed Parameters):** `POST /api/v1/media/signed-upload-params` generates a valid HMAC-SHA1 signature and timestamp expiring in 15 minutes.
- [ ] **AC-MED-04 (Media Registration):** `POST /api/v1/media/register` registers a direct video upload in PostgreSQL, validating against duplicate `storageKey`.
- [ ] **AC-MED-05 (Media Deletion Consistency):** `DELETE /api/v1/media/:id` invokes `cloudinary.uploader.destroy` and removes the PostgreSQL record.
- [ ] **AC-MED-06 (Media In-Use Protection):** Attempting to delete a media record actively linked as a course thumbnail or lesson media returns `409 Conflict` (`MEDIA_IN_USE`).

---

## 6. Audit System Acceptance Criteria

- [ ] **AC-AUD-01 (Course Audit):** `COURSE_CREATED`, `COURSE_UPDATED`, `COURSE_PUBLISHED`, `COURSE_UNPUBLISHED`, and `COURSE_ARCHIVED` actions are logged in `audit_logs` with `actor_id`, `request_id`, and metadata.
- [ ] **AC-AUD-02 (Module Audit):** `MODULE_CREATED`, `MODULE_UPDATED`, and `MODULE_DELETED` actions are recorded.
- [ ] **AC-AUD-03 (Lesson Audit):** `LESSON_CREATED`, `LESSON_UPDATED`, and `LESSON_DELETED` actions are recorded.
- [ ] **AC-AUD-04 (Category Audit):** `CATEGORY_CREATED`, `CATEGORY_UPDATED`, and `CATEGORY_DELETED` actions are recorded.
- [ ] **AC-AUD-05 (Media Audit):** `MEDIA_IMAGE_UPLOADED` and `MEDIA_DELETED` actions are recorded.

---

## 7. Explicit Out-of-Scope Checklist (P2 Verification)

Confirm that NONE of the following have been started or enabled in Phase P2:
- [ ] No Student Enrollment tables or endpoints.
- [ ] No Lesson Progress Tracking tables or endpoints.
- [ ] No Quizzes, Questions, or Exam tables.
- [ ] No Certificate Generation or Badges.
- [ ] No Stripe, SSLCommerz, or Payment Gateways.
- [ ] No Student Review or Comment submission endpoints.
- [ ] No AI Tutor or AI Course Generation endpoints.
- [ ] No Elasticsearch containers or services.
