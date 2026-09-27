# P1 Comprehensive Test Plan

**Date:** 2026-09-27  
**Scope:** Foundation, Authentication, Security, RBAC, Database & E2E  

---

## 1. Test Levels & Strategy

1. **Unit Tests:**
   - Identity & Authentication Service: Password hashing, verification, OTP generation, validation.
   - RBAC Guards: Role evaluation, anonymous rejection, privilege check.
   - DTO Validation: Rejection of malformed, oversized, or unauthorized fields.
   - Error Filter: Proper formatting and exclusion of stack traces.
2. **Integration Tests:**
   - Database Migrations: Applying migrations from empty schema, verifying constraints (unique email, foreign keys).
   - API Controllers: Full HTTP cycle via Supertest / NestJS testing module.
   - Audit Log Service: Ensuring append-only records created upon actions.
3. **End-to-End (E2E) Tests:**
   - Synthetic registration flow -> Session creation -> Accessing protected routes -> Role enforcement -> Logout.

---

## 2. P1 Exit Gate Scenarios

| Scenario ID | Test Description | Expected Result |
|---|---|---|
| **SCENARIO A** | Anonymous user -> Registration -> Authentication -> Access protected route | PASS (200 OK, session cookie issued) |
| **SCENARIO B** | Student role -> Attempts to access `/api/v1/admin/*` | DENIED (403 Forbidden) |
| **SCENARIO C** | Student submits `{ "role": "admin" }` in registration body | SERVER MUST NOT grant admin (Created as student) |
| **SCENARIO D** | Malformed registration request (missing email/short password) | DENIED (400 Bad Request with field errors) |
| **SCENARIO E** | Expired OTP submitted for verification | DENIED (400 Bad Request: OTP expired) |
| **SCENARIO F** | Reused OTP submitted a second time | DENIED (400 Bad Request: OTP invalid or consumed) |
| **SCENARIO G** | User logs out -> Attempts accessing protected resource | DENIED (401 Unauthorized) |
| **SCENARIO H** | Forged client-side role token | DENIED (401 / 403 Forbidden) |
| **SCENARIO I** | Direct unauthenticated request to admin API | DENIED (401 Unauthorized) |
