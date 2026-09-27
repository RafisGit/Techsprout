# P1 Threat Model & Security Posture

**Date:** 2026-09-27  
**Methodology:** STRIDE & OWASP Top 10 / ASVS 4.0  
**Scope:** TechSprout School LMS (Foundation & Authentication Phase)  

---

## 1. STRIDE Threat Assessment

| Threat Category | Asset / Vector | Attack Scenario | P1 Mitigation |
|---|---|---|---|
| **Spoofing** | User Identity, Admin Sessions | Attacker forges session cookie or JWT payload to impersonate an admin. | Cryptographically signed session tokens stored in PostgreSQL `sessions` table. Verified against DB on every privileged request. |
| **Tampering** | Registration payload, User role | Attacker modifies HTTP request payload to inject `{ role: 'admin' }`. | Server ignores/strips client role fields. Roles assigned exclusively via server logic. |
| **Repudiation** | Privileged actions, Role elevation | Admin promotes another user or changes settings and denies it. | Append-only `audit_logs` table records actor ID, action, target, IP address, user agent, correlation ID, and timestamp. |
| **Information Disclosure** | Passwords, OTPs, DB stack traces | Database error prints SQL query or stack trace in HTTP response. | Global `AllExceptionsFilter` catches all errors and returns standardized error model `{ success: false, message, errorCode }`. Passwords and OTPs never logged. |
| **Denial of Service** | OTP SMS gateway, Registration API | Attacker floods `/api/v1/auth/otp/send` with requests to deplete SMS balance. | Redis sliding-window rate limiting per IP and per phone number (max 3 requests per 15 min). |
| **Elevation of Privilege** | Dashboard Admin endpoints | Student navigates directly to `/dashboard/admin` or calls `/api/v1/admin/*`. | NestJS `@Roles('admin')` guard and Next.js middleware check authenticated session role claims. |

---

## 2. Secrets Management & Credential Policy

1. **Zero Committed Secrets:** All credentials (`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`) are loaded via typed environment variables.
2. **Client Isolation:** `NEXT_PUBLIC_*` environment variables must NEVER contain private keys, database URLs, or signing secrets.
3. **Password Hashing:** Scrypt with high cost parameters and 32-byte cryptographically random salt.
4. **Disclose Prevention:** Error responses sanitize internal errors in production environments.
