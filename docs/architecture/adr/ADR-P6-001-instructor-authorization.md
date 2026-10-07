# ADR-P6-001: Contextual Resource-Level Authorization & Instructor Ownership Model
## Document Identifier: `TECHSPROUT-ADR-P6-001`
**Status:** PROPOSED (P6.0 Architecture Freeze Candidate)  
**Date:** 2026-10-07  
**Deciders:** TechSprout Engineering Team (Security Architect, Backend Architect, Principal Lead)  
**Target Milestone:** P6.1 / P6.2  

---

## 1. Context

TechSprout LMS Phase P1 established basic role-based access control (`RolesGuard`) which evaluates whether an authenticated user possesses a designated platform role (e.g., `admin`, `instructor`, `student`).

With the introduction of decentralized instructors who author their own courses, modules, lessons, and quizzes, **role-level authorization alone is insufficient**. If an endpoint only verifies `@Roles('instructor')`, any instructor on the platform could manipulate another instructor's curricular assets by guessing or intercepting UUIDs (Insecure Direct Object Reference / IDOR).

Currently, ownership verification is manually invoked inside specific service methods (e.g., `CoursesService.verifyCourseOwnership`, `ModulesService.resolveModuleOwnership`). However, manual service-level verification is error-prone:
1. Omitting the check in a single controller endpoint introduces a critical security vulnerability.
2. In `media.controller.ts`, any instructor can upload or reference media without asset-level ownership.
3. In `courses.controller.ts`, administrative state operations (`publish`, `unpublish`, `archive`) are admin-only, leaving instructors unable to transition courses through an approval lifecycle.

---

## 2. Decision

We establish the following architectural rules for Phase 6:

### 2.1 Multi-Level Contextual Authorization Guard (`ResourceOwnershipGuard`)
We introduce a declarative NestJS guard that executes after `AuthGuard` and `RolesGuard`. The guard inspects the target resource hierarchy and enforces ownership prior to executing controller business logic:

1. **Administrator Superuser Rule:** Users with `role === 'admin'` always bypass ownership checks. Administrators possess global institutional stewardship over all catalog assets.
2. **Instructor Ownership Chain Rule:** Users with `role === 'instructor'` must own the parent course associated with the target entity:
   - For `/admin/courses/:id`: `course.instructorId === req.user.id`
   - For `/admin/modules/:id`: `module.course.instructorId === req.user.id`
   - For `/admin/lessons/:id`: `lesson.module.course.instructorId === req.user.id`
   - For `/admin/quizzes/:id`: `quiz.module.course.instructorId === req.user.id`
3. **Fail-Closed Default:** If a resource does not exist, return `404 Not Found`. If a resource belongs to another instructor, return `403 Forbidden` with an audit log event `UNAUTHORIZED_RESOURCE_ACCESS_ATTEMPT`.

### 2.2 Media Entity Asset Scoping
We will update the `media` schema in P6 to include an explicit ownership column:
- `uploader_id` (uuid, references `users.id`, nullable for legacy assets, non-null for new uploads).
- When an instructor queries media or attaches media to a lesson, the system validates that the media was uploaded by that instructor or is marked as global platform media.

### 2.3 Segregated Instructor Controller Boundaries
In P6.2, we will introduce dedicated instructor controller routes under `/instructor/courses` rather than forcing instructors to interact with administrative endpoints under `/admin/courses`.

---

## 3. Consequences

### Positive:
- **Zero-Trust Security:** Guarantees protection against IDOR at the framework guard boundary before controller invocation.
- **Audit Traceability:** Unauthorized cross-instructor access attempts are consistently caught and audited.
- **Clean Developer Ergonomics:** Eliminates repetitive boilerplate checks across service methods.

### Negative / Trade-offs:
- Guard execution requires a database lookup to resolve the resource ownership chain. To mitigate latency, the guard resolves the entity and attaches it to `req.resource`, allowing the controller/service to reuse the fetched entity without duplicate database queries.
