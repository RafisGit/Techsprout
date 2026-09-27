# P1 Security Remediation Report

**Date:** 2026-09-27  
**Phase:** P1 — Foundation & Security  
**Standard:** OWASP ASVS 4.0 Level 2 Baseline  

---

## 1. Executive Summary of Remediations

This document tracks all 10 critical security blockers discovered during the repository audit and details the exact remediation implemented in the new architecture.

---

## 2. Security Blocker Remediation Matrix

### Blocker 1: Plaintext Password Storage
- **Vulnerability:** `src/app/api/(user)/register/route.ts` and `src/app/api/test/route.ts` accepted unhashed user passwords and stored them directly in the database.
- **Remediation:** All passwords are now hashed using modern cryptographic hashing algorithms (Scrypt / Argon2id with cryptographically random per-user salts) inside the NestJS Identity module before database insertion. Plaintext passwords are never stored, logged, or returned.

### Blocker 2: Mass Assignment / Role Escalation
- **Vulnerability:** Registration endpoints performed `User.create({ ...bodyData })`, allowing any anonymous caller to pass `{ role: 'admin' }` or `{ isVerified: true }`.
- **Remediation:** Strict DTO validation (`RegisterDto`) rejects or strips unknown and privileged fields. The API unconditionally assigns the default `student` role on the server side. Privileged role changes require an authenticated, authorized admin invocation with full audit logging.

### Blocker 3: Broken Authentication Stub
- **Vulnerability:** `src/auth.ts` NextAuth credentials provider had an empty `authorize()` returning `null`.
- **Remediation:** Retired legacy `src/auth.ts`. Implemented real authentication endpoints (`/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/otp/send`, `/api/v1/auth/otp/verify`, `/api/v1/auth/me`, `/api/v1/auth/logout`) with real credential verification and persistent session state.

### Blocker 4: Confirm-Password Field Binding Bug
- **Vulnerability:** `src/components/forms/Register.tsx` line 170 bound the Confirm Password input to `name='name'`.
- **Remediation:** Fixed the input field name to `name='passwordConfirmation'` and properly bound it to the Zod schema match validation.

### Blocker 5: Dangerous Public `/test` Registration Endpoint
- **Vulnerability:** `src/app/api/test/route.ts` was an unprotected public endpoint duplicating the mass-assignment vulnerability. `Register.tsx` directly targeted `/test`.
- **Remediation:** Completely removed `src/app/api/test/route.ts`. `Register.tsx` now calls the versioned, validated, rate-limited `/api/v1/auth/register` API.

### Blocker 6: Mock / Fake Authentication Flow
- **Vulnerability:** `Login.tsx` printed input values via `console.log` without issuing tokens or sessions.
- **Remediation:** Replaced fake login with real API call to `/api/v1/auth/login`, setting a secure `HttpOnly` session cookie and updating authentication state.

### Blocker 7: Unprotected Dashboard & Admin Routes
- **Vulnerability:** `/dashboard` and `/dashboard/admin/*` had no authentication or authorization checks.
- **Remediation:** Implemented server-side RBAC guards (`AuthGuard`, `RolesGuard`) in NestJS and Next.js middleware checking session tokens. Unauthorized users attempting to access `/dashboard/admin/*` receive HTTP 403 Forbidden or are redirected.

### Blocker 8: Client-Controlled Authorization Assumptions
- **Vulnerability:** Client components assumed UI hiding equals authorization.
- **Remediation:** Enforced server-side authorization on every endpoint. Client claims are never trusted; the server extracts the user identity and roles from the verified server-side session.

### Blocker 9: Account Enumeration
- **Vulnerability:** `/api/check-user-exists` allowed unbounded checking of arbitrary emails/usernames.
- **Remediation:** Deprecated the public unauthenticated enumeration endpoint. Registration uses generic messages ("If an account exists, a link/code was sent") or rate limits registration requests.

### Blocker 10: Missing Security Headers & Unrestricted CORS
- **Vulnerability:** Next.js had no security headers configured; CORS was unconstrained.
- **Remediation:** Configured NestJS Helmet middleware with strict CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and strict CORS whitelist limited to the web application origin.
