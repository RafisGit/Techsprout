# ADR 003: Authentication Architecture (Better Auth, Phone OTP, Google OAuth, and Session Strategy)

**Status:** Approved  
**Date:** 2026-09-27  
**Deciders:** TechSprout Engineering Team  

---

## 1. Context

Authentication in the legacy repository was severely broken:
- `src/auth.ts` contained an empty NextAuth credentials authorize function returning `null`.
- `Login.tsx` printed input values to `console.log` without authenticating.
- `Register.tsx` posted unhashed credentials directly to a public `/test` route.
- Bangladeshi students predominantly use mobile phones and require OTP-based authentication, while corporate learners and administrators require secure Email + Password, and casual users prefer Google OAuth.

---

## 2. Decision

We implement a unified, multi-channel authentication architecture powered by **Better Auth** / NestJS Identity Services meeting OWASP ASVS Level 2 standards:

### 1. Multi-Channel Authentication
- **Email + Password:**
  - Password hashed using Scrypt/Argon2id with salt. Plaintext passwords never persisted or logged.
  - Strict strength validation: minimum 8 characters, requiring uppercase, lowercase, numbers, and symbols.
  - Email uniqueness enforced at database constraint level.
- **Phone Number + OTP:**
  - Bangladeshi phone validation regex: `/^01[3-9]\d{8}$/` (or canonical `+8801[3-9]\d{8}`).
  - Cryptographically secure 6-digit numeric OTP generation (`crypto.randomInt`).
  - Stored in Redis (or disposable store) with strict 180-second TTL.
  - Rate limited to max 3 attempts per 15 minutes.
  - Single-use only; immediately invalidated upon verification or expiry.
  - OTP never logged in plaintext.
- **Google OAuth 2.0:**
  - Standard OAuth2/OIDC flow with PKCE and state verification.
  - Automatic account linking on verified email match.

### 2. Session and Token Management
- **Browser Web Clients (`apps/web`):**
  - Secure, `HttpOnly`, `SameSite=Lax` (or `Strict`), `Secure` (in production) cookies.
  - Server-side session verification against `sessions` table.
- **Mobile Clients (Flutter):**
  - Authorization Header: `Bearer <session_token>`.
  - Enables seamless cross-platform API consumption without cookie dependencies.

### 3. Server-Controlled Authorization (RBAC)
- Default registration role is unconditionally `student`.
- Client requests submitting `role: 'admin'` or any privileged parameters are strictly rejected or stripped.
- Roles are verified server-side on every privileged endpoint (`@Roles('admin')`).

---

## 3. Consequences

### Positive
- Fully functional, resilient, production-ready authentication.
- Zero plaintext password leaks or client-side privilege escalation.
- Native alignment with the Bangladeshi market (Phone OTP) and enterprise requirements.
- Future-proof for Flutter mobile app via Bearer tokens.
