# ADR 003: Authentication Architecture (NestJS Identity Engine, Phone OTP, Google OAuth 2.0, and Session Strategy)

**Status:** Approved (Architecture Amendment Superceding Better Auth)  
**Date:** 2026-09-27  
**Deciders:** TechSprout Engineering Team & Architecture Review Board  

---

## 1. Context & Architectural Amendment Notice

### Supercession of Initial Better Auth Requirement
The initial high-level product guideline suggested using **Better Auth** as a turnkey authentication framework. However, upon technical evaluation during Phase P1 foundation design:
1. **NestJS Service Boundary:** TechSprout's architecture separates the client (`apps/web` running Next.js) from the business logic (`apps/api` running NestJS). Better Auth is optimized primarily for fullstack Node/Next.js runtimes with route handlers and does not cleanly integrate with NestJS dependency injection, custom execution context guards (`CanActivate`), custom parameter decorators, and Drizzle ORM module providers.
2. **Framework Lock-in vs Enterprise Customization:** Better Auth introduces external schema ownership and runtime magic. For enterprise LMS compliance, TechSprout requires 100% control over the Drizzle database schema, forward-only migrations, append-only audit logging, and custom multi-channel identity (Bangladeshi Phone OTP, Google OAuth, and corporate Email/Password).
3. **Cross-Platform Mobile Support:** Future mobile clients (Flutter) authenticate via `Authorization: Bearer <session_token>` while web browsers use secure `HttpOnly` cookies. A native NestJS session engine provides dual-mode session resolution natively without middleware impedance.

**Decision:** The engineering team has formally approved **Option B**: Superseding Better Auth with a custom, enterprise-grade NestJS Identity Engine adhering to OWASP ASVS Level 2 standards.

---

## 2. Authentication Architecture Specification

### 1. Multi-Channel Authentication Architecture

#### A. Email + Password
- **Password Hashing:** Passwords are hashed using Node.js `crypto.scrypt` with a 16-byte cryptographically secure pseudorandom salt (`crypto.randomBytes(16)`) and a 64-byte derived key length.
- **Timing Attack Prevention:** Password verification executes via `crypto.timingSafeEqual` over derived key buffers. Plaintext passwords are never logged, persisted, or returned.
- **Password Strength:** Minimum 8 characters, enforcing uppercase, lowercase, numbers, and special symbols via Zod schemas.
- **Uniqueness:** Email and username uniqueness are enforced by database unique constraints on the `users` table.

#### B. Phone Number + OTP Authentication & Session Issuance
- **Validation:** Bangladeshi phone number format validated via canonical regex `/^(?:\+8801|01)[3-9]\d{8}$/`.
- **OTP Generation:** Cryptographically random 6-digit numeric OTP generated via `crypto.randomInt(100000, 999999)`.
- **Keyed Hash Storage (Peppered HMAC):** To prevent precomputed rainbow table attacks on the 6-digit keyspace ($9 \times 10^5$ combinations), OTP codes are hashed using **HMAC-SHA256** using a high-entropy server-side pepper (`AUTH_SECRET`). Plaintext OTP is never stored in the database.
- **Atomic Verification & Race Condition Protection:** OTP verification is strictly atomic. The database consumes the OTP using an atomic SQL update:
  ```sql
  UPDATE otps 
  SET is_used = true, attempts = attempts + 1 
  WHERE id = ? AND is_used = false AND expires_at > NOW()
  RETURNING id;
  ```
  Only if exactly one row is updated does the verification succeed, preventing replay or concurrent execution race conditions.
- **Session Issuance:** Unlike simple phone verification, Phone OTP authentication finds or registers the user, records an `OTP_VERIFIED` audit log, establishes an authenticated session in the `sessions` table, and sets the secure `HttpOnly` session cookie.

#### C. Google OAuth 2.0 Flow & Account Linking
- **Flow:** Authorization Code Flow with PKCE (`code_verifier` / `code_challenge`) and cryptographic `state` token verification to prevent CSRF.
- **Account Linking:**
  - On callback, verifies Google ID Token or profile.
  - Matches Google subject ID against the `accounts` table (`provider = 'google'`).
  - If existing account found -> authenticates matching user.
  - If existing user with matching verified email found -> automatically links Google account to user in `accounts` table.
  - If new user -> creates new user record with default `student` role and links account.
- **Session Creation:** Issues standard session token and sets `HttpOnly` session cookie upon successful exchange.

---

### 2. Session and Token Management

- **Dual-Mode Resolution (`AuthGuard`):**
  1. **Browser Web Clients (`apps/web`):** Resolves session from `techsprout_session` cookie (`httpOnly: true`, `secure: production`, `sameSite: 'lax'`, `path: '/'`).
  2. **Mobile Clients:** Resolves session from `Authorization: Bearer <token>` header.
- **Database Backed Sessions:** Active session validated on every request against the `sessions` table (`expires_at > NOW()`).
- **Session Invalidation (Logout):** Calling `POST /api/v1/auth/logout` deletes the session from the database and clears the browser cookie. Revoked tokens immediately fail subsequent authorization checks.

---

### 3. Server-Controlled Authorization (RBAC)

- **Default Role:** Every user registration (via password, OTP, or OAuth) unconditionally receives the `student` role.
- **Mass-Assignment Defense:** Privileged request body properties (`role`, `isAdmin`) are stripped and rejected by controller Zod schemas.
- **Server Enforcement:** Role checks are never performed client-side. Endpoints are guarded by NestJS `@Roles('admin')` and `RolesGuard`, which resolves roles from the PostgreSQL `user_roles` join table.

---

## 3. Operational & Security Implications

- **OWASP ASVS Alignment:** Meets Level 2 requirements for password security, session management, and access control.
- **Auditability:** Every authentication lifecycle event (`USER_REGISTERED`, `USER_LOGIN`, `USER_LOGOUT`, `ROLE_ASSIGNED`, `OTP_SENT`, `OTP_VERIFIED`) writes to an immutable append-only `audit_logs` table.
- **Observability:** Centralized error handling and Sentry integration capture authentication anomalies without leaking credentials.
