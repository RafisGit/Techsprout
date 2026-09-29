# TechSprout School LMS — P2 Course Catalog Architecture Specification

> **Phase Status:** P2.0 Architecture Freeze  
> **Applicability:** Institutional Course Catalog, Categories, Modules, Lessons, and Media Integration.  
> **Prerequisites:** P1 Foundation & Security (Completed).  
> **No Implementation Permitted in P2.0:** This document specifies the frozen architectural blueprint for Phase P2. Implementation commences in Phase P2.1.

---

## 1. Executive Summary & Domain Scope

The Course Catalog subsystem is the core institutional academic management layer of TechSprout School LMS. It provides:
1. **Institutional Taxonomy:** Categorization of educational offerings.
2. **Structured Curricula:** Strict hierarchical containment of courses, curricular modules, and learning lessons.
3. **Audited Governance:** Strict state-machine-driven course publishing managed exclusively by institutional administrators.
4. **Scoped Authoring:** Delegated authoring privileges for verified instructors over their own courses.
5. **High-Performance Public Discovery:** Filterable, paginated catalog discovery optimized for search engines and students.

---

## 2. Domain Entity Relationships

```
┌─────────────────┐
│    Category     │
└────────┬────────┘
         │ 1
         │
         │ *
┌────────▼────────┐                 ┌─────────────────┐
│     Course      │────────*───────>│      Media      │
└────────┬────────┘ (thumbnail_id)  └────────▲────────┘
         │ 1                                 │
         │                                   │ *
         │ *                                 │ (media_id)
┌────────▼────────┐                          │
│     Module      │                          │
└────────┬────────┘                          │
         │ 1                                 │
         │                                   │
         │ *                                 │
┌────────▼────────┐                          │
│     Lesson      │──────────────────────────┘
└─────────────────┘
```

### Relational Hierarchy Rules
- A **Category** contains zero or more **Courses**. Deleting a category with active courses is prohibited (`ON DELETE RESTRICT`).
- A **Course** belongs to exactly one **Category** and one **Instructor** (`users.id`).
- A **Course** contains one or more sequenced **Modules**. Deleting a course cascades to its modules and lessons (`ON DELETE CASCADE`).
- A **Module** contains one or more sequenced **Lessons**. Deleting a module cascades to its lessons (`ON DELETE CASCADE`).
- A **Course** optionally references a **Media** record for its promotional thumbnail (`thumbnail_media_id`).
- A **Lesson** optionally references a **Media** record for video/PDF content (`media_id`).

---

## 3. Database Schema Specification (Drizzle ORM)

The database schema is defined for PostgreSQL 16 using `drizzle-orm/pg-core`.

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// --- ENUMS ---
export const courseStatusEnum = pgEnum('course_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const courseVisibilityEnum = pgEnum('course_visibility', ['PUBLIC', 'PRIVATE']);
export const courseLevelEnum = pgEnum('course_level', ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']);
export const lessonTypeEnum = pgEnum('lesson_type', ['VIDEO', 'TEXT', 'PDF']);
export const storageProviderEnum = pgEnum('storage_provider', ['CLOUDINARY', 'LOCAL', 'S3']);

// --- CATEGORIES TABLE ---
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('categories_name_uq').on(table.name),
    uniqueIndex('categories_slug_uq').on(table.slug),
    index('categories_is_active_idx').on(table.isActive),
  ]
);

// --- MEDIA TABLE ---
export const media = pgTable(
  'media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storageProvider: storageProviderEnum('storage_provider').default('CLOUDINARY').notNull(),
    storageKey: varchar('storage_key', { length: 255 }).notNull(), // Cloudinary public_id
    publicUrl: text('public_url').notNull(),                      // Cloudinary delivery URL
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),                      // In bytes
    durationSeconds: integer('duration_seconds'),                  // Video duration (if applicable)
    metadata: text('metadata'),                                    // JSON stringified technical attributes
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_storage_key_uq').on(table.storageKey),
    index('media_storage_provider_idx').on(table.storageProvider),
  ]
);

// --- COURSES TABLE ---
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    instructorId: uuid('instructor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 250 }).notNull(),
    shortDescription: varchar('short_description', { length: 500 }),
    description: text('description'),
    status: courseStatusEnum('status').default('DRAFT').notNull(),
    visibility: courseVisibilityEnum('visibility').default('PUBLIC').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).default('0.00').notNull(),
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    level: courseLevelEnum('level').default('BEGINNER').notNull(),
    language: varchar('language', { length: 50 }).default('English').notNull(),
    durationMinutes: integer('duration_minutes').default(0).notNull(),
    thumbnailMediaId: uuid('thumbnail_media_id')
      .references(() => media.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('courses_slug_uq').on(table.slug),
    index('courses_category_id_idx').on(table.categoryId),
    index('courses_instructor_id_idx').on(table.instructorId),
    index('courses_status_visibility_idx').on(table.status, table.visibility),
    index('courses_public_catalog_idx').on(table.status, table.visibility, table.createdAt),
    index('courses_price_idx').on(table.price),
  ]
);

// --- MODULES TABLE ---
export const modules = pgTable(
  'modules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('modules_course_position_uq').on(table.courseId, table.position),
    index('modules_course_id_idx').on(table.courseId),
  ]
);

// --- LESSONS TABLE ---
export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .references(() => modules.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    lessonType: lessonTypeEnum('lesson_type').default('VIDEO').notNull(),
    position: integer('position').notNull(),
    durationSeconds: integer('duration_seconds').default(0).notNull(),
    isPreview: boolean('is_preview').default(false).notNull(),
    mediaId: uuid('media_id')
      .references(() => media.id, { onDelete: 'set null' }),
    content: text('content'), // For TEXT-based lessons
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('lessons_module_position_uq').on(table.moduleId, table.position),
    index('lessons_module_id_idx').on(table.moduleId),
    index('lessons_is_preview_idx').on(table.isPreview),
  ]
);
```

---

## 4. Database Indexing Matrix

| Index Name | Target Table | Columns | Query Purpose |
|---|---|---|---|
| `categories_slug_uq` | `categories` | `(slug)` UNIQUE | URL route matching (`/categories/:slug/courses`). |
| `categories_name_uq` | `categories` | `(name)` UNIQUE | Prevent duplicate category creation. |
| `courses_slug_uq` | `courses` | `(slug)` UNIQUE | URL route matching (`/courses/:slug`). |
| `courses_category_id_idx` | `courses` | `(category_id)` | Filtering catalog courses by category ID. |
| `courses_instructor_id_idx`| `courses` | `(instructor_id)` | Instructor dashboard query: fetch courses owned by user. |
| `courses_status_visibility_idx` | `courses` | `(status, visibility)` | Primary filter predicate for all public catalog listings. |
| `courses_public_catalog_idx` | `courses` | `(status, visibility, created_at DESC)` | Composite index covering default sorted public catalog listing. |
| `modules_course_position_uq` | `modules` | `(course_id, position)` UNIQUE | Enforces unique sequence ordering of modules in a course. |
| `lessons_module_position_uq` | `lessons` | `(module_id, position)` UNIQUE | Enforces unique sequence ordering of lessons in a module. |
| `media_storage_key_uq` | `media` | `(storage_key)` UNIQUE | Idempotent mapping to Cloudinary `public_id`. |

---

## 5. Course State Machine & Lifecycle Governance

Courses follow an explicit, auditable finite state machine.

```
       ┌────────────────────────┐
       │         DRAFT          │◄──────────────┐
       └───────────┬────────────┘               │
                   │                            │
                   │ publish (Admin only)       │ unpublish (Admin only)
                   ▼                            │
       ┌────────────────────────┐               │
       │       PUBLISHED        │───────────────┘
       └───────────┬────────────┘
                   │
                   │ archive (Admin only)
                   ▼
       ┌────────────────────────┐
       │        ARCHIVED        │
       └────────────────────────┘
```

### Transition Invariants
1. **`DRAFT` → `PUBLISHED` (`POST /api/v1/admin/courses/:id/publish`):**
   - **Authority:** Administrator only (`@Roles('admin')`).
   - **Validation Rules:**
     - Course must possess a non-empty `title`, `slug`, `description`, `price`, `level`, and `categoryId`.
     - Course must contain at least **1 Module**.
     - Each Module must contain at least **1 Lesson**.
     - All video lessons must have an attached `mediaId`.
   - **Side Effects:** Sets `status = 'PUBLISHED'` and `publishedAt = NOW()`.
   - **Audit Action:** `COURSE_PUBLISHED`.

2. **`PUBLISHED` → `DRAFT` (`POST /api/v1/admin/courses/:id/unpublish`):**
   - **Authority:** Administrator only (`@Roles('admin')`).
   - **Effect:** Sets `status = 'DRAFT'`. Immediately removes the course from public catalog queries.
   - **Audit Action:** `COURSE_UNPUBLISHED`.

3. **`PUBLISHED` → `ARCHIVED` (`POST /api/v1/admin/courses/:id/archive`):**
   - **Authority:** Administrator only (`@Roles('admin')`).
   - **Effect:** Sets `status = 'ARCHIVED'`. Prevents any future enrollments while preserving historical access.
   - **Audit Action:** `COURSE_ARCHIVED`.

4. **Deletion Rules:**
   - **Hard Delete (`DELETE /api/v1/admin/courses/:id`):** Allowed **only** if `status == 'DRAFT'`.
   - Published or Archived courses **cannot be hard-deleted** to protect relational referential integrity.

---

## 6. Role & Permission Matrix

The catalog strictly reuses the existing P1 authentication and authorization foundation (`AuthGuard`, `RolesGuard`, `@Roles('admin', 'instructor')`).

| Operation | Admin | Instructor | Student / Guest | Enforcement Layer |
|---|:---:|:---:|:---:|---|
| **Browse Public Courses** | Full | Full | Read (Published & Public only) | DB Query Filter (`WHERE status = 'PUBLISHED' AND visibility = 'PUBLIC'`) |
| **View Course Details** | Full | Full | Read (Published only) | DB Query Filter |
| **Create Course** | Allowed | Allowed | Denied | `RolesGuard(['admin', 'instructor'])` |
| **Edit Course Details** | Any Course | Own Courses Only | Denied | `RolesGuard` + Ownership Guard (`course.instructorId === user.id`) |
| **Delete Draft Course** | Any Course | Own Courses Only | Denied | `RolesGuard` + Ownership Guard + Status Guard (`DRAFT` only) |
| **Publish Course** | Allowed | **Denied** | Denied | `RolesGuard(['admin'])` |
| **Unpublish Course** | Allowed | **Denied** | Denied | `RolesGuard(['admin'])` |
| **Archive Course** | Allowed | **Denied** | Denied | `RolesGuard(['admin'])` |
| **Reassign Instructor**| Allowed | **Denied** | Denied | `RolesGuard(['admin'])` |
| **Create/Edit Module** | Any Course | Own Courses Only | Denied | `RolesGuard` + Parent Course Ownership Check |
| **Delete Module** | Any Course | Own Courses Only | Denied | `RolesGuard` + Parent Course Ownership Check |
| **Create/Edit Lesson** | Any Module | Own Modules Only | Denied | `RolesGuard` + Ancestor Course Ownership Check |
| **Delete Lesson** | Any Module | Own Modules Only | Denied | `RolesGuard` + Ancestor Course Ownership Check |
| **Manage Categories** | Full CRUD | Read-only | Read-only (Active only) | `RolesGuard(['admin'])` |
| **Upload Course Media**| Allowed | Own Courses Only | Denied | `RolesGuard(['admin', 'instructor'])` |

---

## 7. Search, Filtering, and Pagination

The public catalog leverages native PostgreSQL querying. **Elasticsearch is explicitly out of scope for Phase P2.**

### Query Parameters Specification (`GetCoursesQueryDto`)
```typescript
export interface GetCoursesQueryDto {
  search?: string;        // Text search matching title OR short_description (ILIKE)
  categoryId?: string;    // UUID of target category
  categorySlug?: string;  // Slug of target category
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
  language?: string;      // e.g. "English", "Spanish"
  minPrice?: number;      // Numeric filter
  maxPrice?: number;      // Numeric filter
  sortBy?: 'createdAt' | 'price' | 'title'; // Default: 'createdAt'
  sortOrder?: 'asc' | 'desc';               // Default: 'desc'
  page?: number;                            // 1-indexed, default: 1
  limit?: number;                           // Items per page, default: 12, max: 100
}
```

### Search Execution Strategy
```sql
SELECT c.*, cat.name as category_name, cat.slug as category_slug, u.name as instructor_name
FROM courses c
INNER JOIN categories cat ON c.category_id = cat.id
INNER JOIN users u ON c.instructor_id = u.id
WHERE c.status = 'PUBLISHED'
  AND c.visibility = 'PUBLIC'
  AND (
    $1::text IS NULL OR 
    c.title ILIKE '%' || $1 || '%' OR 
    c.short_description ILIKE '%' || $1 || '%'
  )
  AND ($2::uuid IS NULL OR c.category_id = $2)
  AND ($3::course_level IS NULL OR c.level = $3)
  AND ($4::numeric IS NULL OR c.price >= $4)
  AND ($5::numeric IS NULL OR c.price <= $5)
ORDER BY
  CASE WHEN $6 = 'price' AND $7 = 'asc' THEN c.price END ASC,
  CASE WHEN $6 = 'price' AND $7 = 'desc' THEN c.price END DESC,
  CASE WHEN $6 = 'title' AND $7 = 'asc' THEN c.title END ASC,
  CASE WHEN $6 = 'title' AND $7 = 'desc' THEN c.title END DESC,
  c.created_at DESC
LIMIT $8 OFFSET $9;
```

---

## 8. Audit Event Definitions

All catalog mutations integrate with `AuditService.record()`:

| Action Name | Target Type | Target ID | Metadata Schema |
|---|---|---|---|
| `COURSE_CREATED` | `COURSE` | `course.id` | `{ title, slug, categoryId, instructorId }` |
| `COURSE_UPDATED` | `COURSE` | `course.id` | `{ updatedFields: string[] }` |
| `COURSE_PUBLISHED` | `COURSE` | `course.id` | `{ publishedAt, modulesCount, lessonsCount }` |
| `COURSE_UNPUBLISHED` | `COURSE` | `course.id` | `{ previousStatus: 'PUBLISHED' }` |
| `COURSE_ARCHIVED` | `COURSE` | `course.id` | `{ archivedAt }` |
| `COURSE_DELETED` | `COURSE` | `course.id` | `{ title, slug, instructorId }` |
| `MODULE_CREATED` | `MODULE` | `module.id` | `{ courseId, title, position }` |
| `MODULE_UPDATED` | `MODULE` | `module.id` | `{ courseId, updatedFields: string[] }` |
| `MODULE_DELETED` | `MODULE` | `module.id` | `{ courseId, title, position }` |
| `LESSON_CREATED` | `LESSON` | `lesson.id` | `{ moduleId, title, lessonType, position }` |
| `LESSON_UPDATED` | `LESSON` | `lesson.id` | `{ moduleId, updatedFields: string[] }` |
| `LESSON_DELETED` | `LESSON` | `lesson.id` | `{ moduleId, title, position }` |
| `CATEGORY_CREATED` | `CATEGORY` | `category.id` | `{ name, slug }` |
| `CATEGORY_UPDATED` | `CATEGORY` | `category.id` | `{ updatedFields: string[] }` |
| `CATEGORY_DELETED` | `CATEGORY` | `category.id` | `{ name, slug }` |

---

## 9. Phase P2 Boundary: Explicit Out-of-Scope Items

The following features are **explicitly excluded** from Phase P2:
- **No Student Enrollments** (Deferred to P3).
- **No Progress Tracking or Completion State** (Deferred to P3).
- **No Quizzes, Exams, Question Banks, or Assessments** (Deferred to P4).
- **No Certificates or Badges** (Deferred to P4).
- **No Payment Gateways or Checkout** (Deferred to P5).
- **No Student Reviews or Rating Submission** (Deferred to P5).
- **No Notifications or Email Subscriptions** (Deferred to P6).
- **No AI Tutor or Recommendation Engines** (Deferred to P7).
- **No Elasticsearch or External Search Services** (Native PostgreSQL only).
- **No Infrastructure Changes:** Retains Vercel + Render + Cloudinary.
