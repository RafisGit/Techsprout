# P1 Comprehensive Test Plan

**Date:** 2026-09-27  
**Scope:** Foundation, Authentication, Security, RBAC, Database & E2E  
**Status:** 100% Passing (35/35 automated tests)

---

## 1. Test Levels & Strategy

1. **Unit & Security Scenarios (`security.spec.ts` - 18 Tests):**
   - Identity & Authentication Service: Scrypt password hashing, timing-safe verification, OTP generation, HMAC peppered validation.
   - RBAC Guards: Role evaluation, anonymous rejection, privilege check, student forced role assignment.
   - Attack Defense: OTP timing-attacks, brute-force lockout after 3 attempts, concurrent verification race conditions.
   - OAuth 2.0 Security: CSRF state verification, authorization code replay defense, account linking without user duplication.
   - Account Lifecycle: Disabled account enforcement, correlation ID propagation (`X-Request-Id`), append-only audit trail immutability.
2. **Integration Tests (`postgres-integration.spec.ts` - 6 Tests):**
   - Database Migrations: Applying migrations from empty schema against real PostgreSQL 16.
   - Relational Constraints: Foreign keys, unique constraints on email and phone, cascade deletions on sessions.
   - Audit Log Service: Ensuring append-only records created upon actions and persist across transactions.
3. **End-to-End (E2E) Controller Tests (`http-e2e.spec.ts` - 11 Tests):**
   - Health probes (`/health`, `/health/ready`).
   - Registration -> Login -> Cookie issuance (`techsprout_session`).
   - Role-Based Access Control (`/admin/users` blocked for students, allowed for admins).
   - Phone OTP: Dispatch (`/auth/otp/send`) -> Verify (`/auth/otp/verify`) -> Session cookie -> Access `/auth/me`.
   - Google OAuth: Initiate (`/auth/google`) -> State cookie -> Callback (`/auth/google/callback`) -> Session issuance.
   - Logout: Invalidation of active session.

---

## 2. P1 Master Security & RBAC Scenarios

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
| **SCENARIO J** | OTP verification timing-attack resistance | PASS (timingSafeEqual comparison) |
| **SCENARIO K** | OTP brute-force lockout after 3 failed attempts | DENIED (400 Bad Request: max attempts reached) |
| **SCENARIO L** | Concurrent OTP verification race condition | PASS (Atomic SQL update ensures only 1 claim succeeds) |
| **SCENARIO M** | Google OAuth CSRF state forgery | DENIED (400 Bad Request: state mismatch) |
| **SCENARIO N** | Google OAuth account linking for existing email | PASS (Links account in `accounts` table without duplicate user) |
| **SCENARIO O** | Google OAuth authorization code replay | DENIED (400 Bad Request) |
| **SCENARIO P** | Disabled user account login and access blocked | DENIED (403 Forbidden: account disabled) |
| **SCENARIO Q** | Distributed correlation ID propagation (`X-Request-Id`) | PASS (Header preserved on request, response, and audit log) |
| **SCENARIO R** | Append-only security audit log immutability | PASS (All auth events recorded with actor, target, timestamp) |

---

## 3. Test Execution Summary

```bash
$ pnpm --filter @techsprout/api test

 RUN  v2.1.9 D:/Work/2026/techsprout-main/apps/api

 ✓ src/test/postgres-integration.spec.ts (6 tests)
 ✓ src/test/http-e2e.spec.ts (11 tests)
 ✓ src/test/security.spec.ts (18 tests)

 Test Files  3 passed (3)
      Tests  35 passed (35)
   Duration  2.44s
```
