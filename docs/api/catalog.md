# TechSprout School LMS — P2 REST API Contracts & Endpoint Specification

> **Phase Status:** P2.0 Architecture Freeze  
> **Global Prefix:** `/api/v1`  
> **Response Envelope:** Follows standard `ApiSuccessResponse<T>` and `ApiErrorResponse` structures.

---

## 1. Response Envelope Formats

### Standard Success Envelope
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {},
  "requestId": "req-1790673961-abc123",
  "timestamp": "2026-09-30T00:00:00.000Z"
}
```

### Standard Error Envelope
```json
{
  "success": false,
  "message": "Resource not found",
  "errorCode": "COURSE_NOT_FOUND",
  "statusCode": 404,
  "requestId": "req-1790673961-abc123",
  "timestamp": "2026-09-30T00:00:00.000Z",
  "details": null
}
```

---

## 2. Public Catalog Endpoints (Unauthenticated / Public)

Public catalog endpoints only return courses where `status = 'PUBLISHED'` and `visibility = 'PUBLIC'`.

---

### `GET /api/v1/courses`
Lists published, public courses with filtering, full-text search, sorting, and pagination.

#### Query Parameters (`GetCoursesQueryDto`)
| Parameter | Type | Required | Default | Description |
|---|---|:---:|---|---|
| `search` | `string` | No | - | Substring / full-text query matching `title` or `shortDescription`. |
| `categoryId` | `string` (UUID) | No | - | Filter by category ID. |
| `categorySlug` | `string` | No | - | Filter by category slug. |
| `level` | `enum` | No | - | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `ALL_LEVELS`. |
| `language` | `string` | No | - | Filter by language (e.g. `English`). |
| `minPrice` | `number` | No | - | Minimum price threshold. |
| `maxPrice` | `number` | No | - | Maximum price threshold. |
| `sortBy` | `string` | No | `createdAt` | `createdAt`, `price`, `title`. |
| `sortOrder` | `string` | No | `desc` | `asc`, `desc`. |
| `page` | `integer` | No | `1` | 1-indexed page number. |
| `limit` | `integer` | No | `12` | Results per page (max: `100`). |

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Courses retrieved successfully",
  "data": {
    "items": [
      {
        "id": "c1a2b3c4-1111-2222-3333-444455556666",
        "title": "Complete Game Development with Unity",
        "slug": "complete-game-development-with-unity",
        "shortDescription": "Master 2D and 3D game creation in Unity from scratch.",
        "price": "49.99",
        "currency": "USD",
        "level": "BEGINNER",
        "language": "English",
        "durationMinutes": 480,
        "thumbnailUrl": "https://res.cloudinary.com/h6udu3ze/image/upload/v1790673961/techsprout/images/courses/unity-thumb.jpg",
        "category": {
          "id": "cat-001",
          "name": "Game Development",
          "slug": "game-development"
        },
        "instructor": {
          "id": "usr-002",
          "name": "Alex Mercer"
        },
        "modulesCount": 4,
        "lessonsCount": 24,
        "publishedAt": "2026-09-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 35,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

---

### `GET /api/v1/courses/:slug`
Fetches a single published course by its SEO-friendly slug, including its curricular modules and previewable lessons.

#### Path Parameters
- `slug` (`string`, required): Unique course slug.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Course details retrieved successfully",
  "data": {
    "id": "c1a2b3c4-1111-2222-3333-444455556666",
    "title": "Complete Game Development with Unity",
    "slug": "complete-game-development-with-unity",
    "shortDescription": "Master 2D and 3D game creation in Unity from scratch.",
    "description": "Full markdown curriculum description...",
    "price": "49.99",
    "currency": "USD",
    "level": "BEGINNER",
    "language": "English",
    "durationMinutes": 480,
    "thumbnailUrl": "https://res.cloudinary.com/h6udu3ze/image/upload/v1790673961/techsprout/images/courses/unity-thumb.jpg",
    "category": {
      "id": "cat-001",
      "name": "Game Development",
      "slug": "game-development"
    },
    "instructor": {
      "id": "usr-002",
      "name": "Alex Mercer"
    },
    "publishedAt": "2026-09-01T12:00:00.000Z",
    "modules": [
      {
        "id": "mod-001",
        "title": "Introduction to the Unity Engine",
        "position": 1,
        "lessons": [
          {
            "id": "les-001",
            "title": "Installing Unity Hub & Setup",
            "position": 1,
            "lessonType": "VIDEO",
            "durationSeconds": 620,
            "isPreview": true,
            "mediaUrl": "https://res.cloudinary.com/h6udu3ze/video/upload/v1790673961/techsprout/videos/lessons/lesson-01.mp4"
          },
          {
            "id": "les-002",
            "title": "Understanding the Unity Interface",
            "position": 2,
            "lessonType": "VIDEO",
            "durationSeconds": 840,
            "isPreview": false,
            "mediaUrl": null
          }
        ]
      }
    ]
  }
}
```

---

### `GET /api/v1/categories`
Lists all active categories for navigation and filter sidebars.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Categories retrieved successfully",
  "data": [
    {
      "id": "cat-001",
      "name": "Game Development",
      "slug": "game-development",
      "description": "2D and 3D game design and programming.",
      "courseCount": 12
    }
  ]
}
```

---

### `GET /api/v1/categories/:slug/courses`
Lists published public courses strictly belonging to the specified category slug.

---

## 3. Admin & Instructor Management Endpoints

All endpoints in this section require authentication (`AuthGuard`) and authorization (`RolesGuard`).

---

### 3.1 Course Management

#### `POST /api/v1/admin/courses`
Creates a new draft course.
- **Roles:** `@Roles('admin', 'instructor')`
- **Request Body (`CreateCourseDto`):**
```json
{
  "title": "Mastering Unreal Engine 5",
  "slug": "mastering-unreal-engine-5",
  "shortDescription": "Industry-grade C++ and Blueprint development.",
  "description": "Comprehensive course syllabus...",
  "categoryId": "cat-001",
  "instructorId": "usr-002",
  "price": "59.99",
  "currency": "USD",
  "level": "INTERMEDIATE",
  "language": "English",
  "thumbnailMediaId": "med-001"
}
```
*Note:* If an `instructor` calls this endpoint, `instructorId` is automatically forced to the calling user's ID (`req.user.id`). Only `admin` can assign courses to other instructors.

#### `GET /api/v1/admin/courses`
Lists courses with administrative filters (including `DRAFT` and `ARCHIVED`).
- **Roles:** `@Roles('admin', 'instructor')`
- *Note:* Instructors only receive courses where `instructor_id = req.user.id`.

#### `GET /api/v1/admin/courses/:id`
Fetches full course details including draft/unreleased lessons.
- **Roles:** `@Roles('admin', 'instructor')` (with instructor ownership verification).

#### `PATCH /api/v1/admin/courses/:id`
Updates course metadata.
- **Roles:** `@Roles('admin', 'instructor')` (with instructor ownership verification).
- **Rule:** Status changes are **ignored** here; status must be mutated via dedicated lifecycle endpoints.

#### `DELETE /api/v1/admin/courses/:id`
Hard-deletes an unpublished draft course.
- **Roles:** `@Roles('admin', 'instructor')` (with instructor ownership verification).
- **Rule:** If `status !== 'DRAFT'`, returns `400 Bad Request` (`CANNOT_DELETE_NON_DRAFT`).

---

### 3.2 Course Lifecycle Endpoints

#### `POST /api/v1/admin/courses/:id/publish`
Publishes a draft course to make it visible in the public catalog.
- **Roles:** `@Roles('admin')` (Admin only).
- **Validation:**
  - Must have at least 1 module.
  - Every module must have at least 1 lesson.
  - Video lessons must have valid `mediaId`.
- **Response (`200 OK`):** Returns updated course with `status = 'PUBLISHED'`.

#### `POST /api/v1/admin/courses/:id/unpublish`
Reverts a published course to draft mode.
- **Roles:** `@Roles('admin')` (Admin only).
- **Response (`200 OK`):** Returns updated course with `status = 'DRAFT'`.

#### `POST /api/v1/admin/courses/:id/archive`
Retires a course, preventing new enrollments.
- **Roles:** `@Roles('admin')` (Admin only).
- **Response (`200 OK`):** Returns updated course with `status = 'ARCHIVED'`.

---

### 3.3 Module Management

#### `POST /api/v1/admin/courses/:id/modules`
Creates a new module in a course.
- **Roles:** `@Roles('admin', 'instructor')` (with course ownership check).
- **Body (`CreateModuleDto`):**
```json
{
  "title": "Module 1: Getting Started",
  "description": "Foundational concepts",
  "position": 1
}
```

#### `PATCH /api/v1/admin/modules/:id`
Updates module title, description, or position.
- **Roles:** `@Roles('admin', 'instructor')` (with ancestor course ownership check).

#### `DELETE /api/v1/admin/modules/:id`
Deletes a module and cascades to its lessons.
- **Roles:** `@Roles('admin', 'instructor')` (with ancestor course ownership check).

---

### 3.4 Lesson Management

#### `POST /api/v1/admin/modules/:id/lessons`
Creates a lesson inside a module.
- **Roles:** `@Roles('admin', 'instructor')` (with ancestor course ownership check).
- **Body (`CreateLessonDto`):**
```json
{
  "title": "Lesson 1.1: Environment Setup",
  "description": "Step-by-step installation instructions.",
  "lessonType": "VIDEO",
  "position": 1,
  "durationSeconds": 450,
  "isPreview": true,
  "mediaId": "med-001"
}
```

#### `PATCH /api/v1/admin/lessons/:id`
Updates lesson title, type, content, media attachment, or preview flag.
- **Roles:** `@Roles('admin', 'instructor')` (with ancestor course ownership check).

#### `DELETE /api/v1/admin/lessons/:id`
Deletes a lesson.
- **Roles:** `@Roles('admin', 'instructor')` (with ancestor course ownership check).

---

### 3.5 Category Management

#### `POST /api/v1/admin/categories`
- **Roles:** `@Roles('admin')`
- **Body:** `{ "name": "Cybersecurity", "slug": "cybersecurity", "description": "Information security courses." }`

#### `PATCH /api/v1/admin/categories/:id`
- **Roles:** `@Roles('admin')`

#### `DELETE /api/v1/admin/categories/:id`
- **Roles:** `@Roles('admin')`
- **Constraint:** Rejects with `409 Conflict` if courses are linked to the category.

---

### 3.6 Media Management

#### `POST /api/v1/media/signed-upload-params`
Generates Cloudinary-signed upload parameters for direct client video uploads.
- **Roles:** `@Roles('admin', 'instructor')`
- **Body:** `{ "folder": "techsprout/videos/lessons", "resourceType": "video" }`
- **Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "timestamp": 1790673961,
    "signature": "3f8e9a2b...",
    "apiKey": "662281431532656",
    "cloudName": "h6udu3ze",
    "folder": "techsprout/videos/lessons"
  }
}
```

#### `POST /api/v1/media/register`
Registers a directly uploaded Cloudinary asset into PostgreSQL.
- **Roles:** `@Roles('admin', 'instructor')`
- **Body:**
```json
{
  "storageKey": "techsprout/videos/lessons/lesson-01",
  "publicUrl": "https://res.cloudinary.com/h6udu3ze/video/upload/v1790673961/techsprout/videos/lessons/lesson-01.mp4",
  "originalFilename": "lesson-01.mp4",
  "mimeType": "video/mp4",
  "fileSize": 45829100,
  "durationSeconds": 840
}
```

#### `POST /api/v1/media/upload/image`
Proxied multipart upload for images/thumbnails <= 10MB.
- **Roles:** `@Roles('admin', 'instructor')`

#### `DELETE /api/v1/media/:id`
Deletes asset from Cloudinary and deletes record from PostgreSQL.
- **Roles:** `@Roles('admin', 'instructor')`
