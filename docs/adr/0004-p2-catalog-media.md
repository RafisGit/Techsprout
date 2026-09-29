# ADR 004: P2 Course Catalog Domain Model and Cloudinary Media Architecture

**Status:** Approved (Architecture Freeze)  
**Date:** 2026-09-30  
**Phase:** P2.0 Architecture Freeze  
**Deciders:** TechSprout Engineering Team  
**Consulted:** TechSprout School LMS Product Research & Development Guidelines, P1 Security Architecture  

---

## 1. Context

In Phase P1, TechSprout School LMS established the foundational security, authentication, and deployment infrastructure:
- NestJS API with session-based authentication (Argon2id, HttpOnly cookies, session management).
- PostgreSQL 16 persistence via Drizzle ORM.
- Redis / BullMQ queue infrastructure.
- Cloudinary media asset integration.
- Multi-container Docker local development environment.
- Dual deployment architecture: Vercel (Next.js) + Render (NestJS API, PostgreSQL, Redis).

The existing frontend currently relies on legacy client-side mock data (`apps/web/src/lib/mockData/`), which was created with flat MongoDB-like object shapes, embedded arrays, and unsecured direct state mutations.

Phase P2 introduces the **Institutional Course Catalog and Media Management** subsystem. Before writing implementation code, database migrations, or UI views, the architecture must be frozen to ensure:
1. Strict relational modeling in PostgreSQL via Drizzle ORM.
2. A formal state machine for course publishing.
3. Role-based institutional authorization separating Admin and Instructor authorities.
4. A centralized, storage-provider-abstracted media service backed by Cloudinary.
5. High-performance indexing and pagination for the public catalog.
6. Complete auditability across all mutation and lifecycle operations.

---

## 2. Decision

We freeze the following architectural boundaries and specifications for Phase P2:

### 2.1 Relational Domain Hierarchy
The course catalog domain is strictly structured into four primary hierarchical entities and one supporting media abstraction entity:
```
Category
   │
   └─── Course
           │
           └─── Module
                   │
                   └─── Lesson
                           │
             (Course & Lesson reference Media)
```
- **Category:** Categorical classification with unique slugs.
- **Course:** Core learning offering with metadata, pricing, language, level, and lifecycle status (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
- **Module:** Curricular container within a course, strictly sequenced via `UNIQUE(course_id, position)`.
- **Lesson:** Atomic pedagogical unit (`VIDEO`, `TEXT`, `PDF`), strictly sequenced via `UNIQUE(module_id, position)`.
- **Media:** Persistent storage metadata record abstracting Cloudinary assets (`CLOUDINARY`, `storage_key`, `public_url`).

### 2.2 Role & Permission Model
We adhere strictly to the existing P1 role-based access control system (`users`, `roles`, `user_roles`) without introducing a secondary permission system:
- **`ADMIN`:** Full institutional catalog authority.
  - Can create, view, update, delete (drafts only), and archive any course.
  - **Exclusive publishing authority:** Only administrators can transition courses between `DRAFT`, `PUBLISHED`, and `ARCHIVED`.
  - Full management of categories, modules, lessons, and media.
  - Authority to reassign course instructor ownership.
- **`INSTRUCTOR`:** Scoped authoring authority.
  - Can create new courses and manage own courses.
  - Can create and modify modules, lessons, and media associated with own courses.
  - Can delete own draft courses.
  - **Cannot publish or archive courses.** Courses authored by instructors must be reviewed and published by an administrator.
- **`STUDENT` & `GUEST`:** Read-only access to published public courses (`status = 'PUBLISHED'` AND `visibility = 'PUBLIC'`).

### 2.3 Course Lifecycle State Machine
Arbitrary status changes via generic `PATCH` endpoints are strictly forbidden. Course lifecycle transitions must proceed through dedicated, auditable endpoints:
- `POST /api/v1/admin/courses/:id/publish`: `DRAFT` → `PUBLISHED` (requires minimum 1 module and 1 lesson).
- `POST /api/v1/admin/courses/:id/unpublish`: `PUBLISHED` → `DRAFT`.
- `POST /api/v1/admin/courses/:id/archive`: `PUBLISHED` → `ARCHIVED`.
- Soft Archival Rule: Once a course is published, it cannot be hard-deleted from the database. It must be archived to preserve historical integrity. Hard deletion is restricted to unpublished `DRAFT` courses.

### 2.4 Cloudinary Media Architecture
Binary assets are stored in Cloudinary; metadata and relationships are maintained in PostgreSQL:
1. **Frontend Isolation:** `CLOUDINARY_API_SECRET` and `CLOUDINARY_API_KEY` are strictly server-side. The frontend only receives the public cloud name (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`).
2. **Two-Tier Upload Strategy:**
   - **Proxy Uploads (Images <= 10MB):** Handled via `POST /api/v1/media/upload/image` for server-side validation and immediate processing.
   - **Signed Direct Uploads (Videos <= 100MB):** Client requests signed upload parameters via `POST /api/v1/media/signed-upload-params`, uploads directly to Cloudinary, and finalizes the record via `POST /api/v1/media/register`. This prevents video binaries from exhausting API server memory.
3. **Storage Abstraction:** The `media` table maintains `storage_provider = 'CLOUDINARY'`, allowing future migration to S3 or Google Cloud Storage without breaking entity foreign keys.

### 2.5 Search, Filtering, and Pagination
- **PostgreSQL Native:** Search utilizes PostgreSQL full-text and `ILIKE` pattern matching across `title` and `short_description`. Elasticsearch is explicitly out of scope.
- **Composite Indexing:** Public catalog queries are optimized via composite indexes: `(status, visibility, created_at DESC)` and `(category_id, status, visibility)`.
- **Pagination Standard:** Offset-based pagination with standardized query DTOs (`page`, `limit` max 100, `sortBy`, `sortOrder`).

### 2.6 Audit Logging
All catalog mutations are logged through the existing P1 `AuditService`:
- `COURSE_CREATED`, `COURSE_UPDATED`, `COURSE_PUBLISHED`, `COURSE_UNPUBLISHED`, `COURSE_ARCHIVED`
- `MODULE_CREATED`, `MODULE_UPDATED`, `MODULE_DELETED`
- `LESSON_CREATED`, `LESSON_UPDATED`, `LESSON_DELETED`
- `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_DELETED`
- `MEDIA_UPLOADED`, `MEDIA_DELETED`

---

## 3. Consequences

### Positive
- **Rock-solid Data Integrity:** Enforced by PostgreSQL composite unique constraints and foreign keys.
- **Institutional Governance:** Strict admin publishing prevents unverified content from entering the public catalog.
- **Scalable Media Delivery:** Video uploads do not block the Node.js event loop or overload the Render API tier.
- **Zero Additional Infrastructure Overhead:** Leverages existing PostgreSQL, Redis, Cloudinary, and Docker components.
- **Clean OpenAPI Contracts:** Prepares typed contracts for web frontend and future mobile integration.

### Negative / Trade-offs
- Instructors cannot self-publish courses without administrator intervention (deliberate institutional quality requirement).
- Video transcoding progress is asynchronous in Cloudinary; frontend must handle pending video readiness states.
- Mock data in `apps/web` must be converted into backend Drizzle database seed scripts during P2.1.

---

## 4. Architectural Boundaries

- **P2 Boundary:** Covers Course Catalog, Categories, Modules, Lessons, and Cloudinary Media Management.
- **Strictly Out of Scope:** Student enrollment, course progress, quizzes/exams, certificates, payments, reviews, and AI features are deferred to P3+.
