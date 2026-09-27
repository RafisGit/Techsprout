# P1 Repository Audit: TechSprout School LMS

**Date:** 2026-09-27  
**Phase:** P1 — Foundation & Security  
**Branch:** `feat/p1-foundation-security`  
**Repository:** `RafisGit/Techsprout`  

---

## 1. Existing Architecture

The current repository is a single Next.js monolithic application (`techsprout`) running on Next.js 16.2.12 with React 19 (Release Candidate) and Tailwind CSS v4. The application currently houses:
- Frontend pages under `src/app/` (marketing pages, courses, dashboard, auth)
- Backend API route handlers under `src/app/api/`
- Direct database connection management via Mongoose in `src/lib/db.ts`
- Mongoose document models under `src/models/`
- Static and in-memory mock datasets in `src/lib/mockData/`
- Stubbed authentication logic in `src/auth.ts`
- Client UI forms calling temporary or vulnerable endpoints

This violates the approved P0/P1 target architecture:
- Target Web: `apps/web` (Next.js 16 App Router frontend consuming NestJS API)
- Target API: `apps/api` (NestJS modular monolith with versioning `/api/v1`)
- Target Database: PostgreSQL 16+ with Drizzle ORM and SQL migrations
- Target Contracts: `packages/contracts` (OpenAPI contract specifications)

---

## 2. Existing Dependencies

An audit of `package.json` identifies the following dependency baseline:

### Production Dependencies (`dependencies`)
| Package | Version | Status in Target Architecture |
|---|---|---|
| `next` | `16.2.12` | Preserve for `apps/web` |
| `react` / `react-dom` | `19.0.0-rc.1` | Preserve for `apps/web` |
| `next-auth` | `5.0.0-beta.29` | **DEPRECATE & RETIRE** (rebuilt on NextAuth credentials stub; replaced by Better Auth) |
| `zod` | `^4.0.16` | Preserve for validation across monorepo |
| `@radix-ui/*` (various) | Various | Preserve for `apps/web` UI components |
| `react-hook-form` / `@hookform/resolvers` | `^7.62.0` / `^5.2.1` | Preserve for `apps/web` forms |
| `@tanstack/react-query` | `^5.85.0` | Preserve for `apps/web` data fetching |
| `axios` | `^1.11.0` | Preserve for `apps/web` HTTP client |
| `lucide-react` | `^0.525.0` | Preserve for UI icons |
| `zustand` | `^5.0.7` | Preserve for client UI state (e.g. OTP modal state) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Various | Preserve for component styling |
| `embla-carousel-*` | `^8.6.0` | Preserve for UI carousels |
| `input-otp` | `^1.4.2` | Preserve for OTP entry UI |
| `react-fast-marquee` | `^1.6.5` | Preserve for branding marquee UI |
| `immer` | `^10.1.1` | Preserve for state manipulation |

### Development Dependencies (`devDependencies`)
| Package | Version | Status in Target Architecture |
|---|---|---|
| `mongodb` | `^6.17.0` | **RETIRE** (legacy NoSQL layer) |
| `mongoose` | `^8.16.4` | **RETIRE** (legacy NoSQL layer) |
| `tailwindcss` / `@tailwindcss/postcss` | `^4` | Preserve for `apps/web` styling |
| `typescript` | `^5` | Strict TypeScript across monorepo |
| `eslint` / `eslint-config-next` / plugins | `^9` / `16.2.12` | Preserve and extend for monorepo linting |
| `prettier` / `prettier-plugin-tailwindcss` | `^3.6.2` | Preserve for code formatting |
| `tw-animate-css` | `^1.3.5` | Preserve for styling animations |

---

## 3. Existing Authentication

### Findings in `src/auth.ts`
```typescript
Credentials({
  id: 'credentials',
  name: 'Credentials',
  credentials: { email: {}, password: {} },
  authorize: async (credentials) => {
    const user = null;
    return user;
  },
})
```
- **Non-functional authentication:** `authorize()` unconditionally returns `null`. Login through NextAuth never succeeds.
- **Client login stub:** `src/components/forms/Login.tsx` does not even call `signIn` or any auth API; it logs form values via `console.log(userData)` and does nothing.
- **Session management:** Uses JWT strategy configured with fallback secret `process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET`.
- **Target Replacement:** Better Auth integrated with PostgreSQL, handling Email/Password, Phone OTP (Redis backed), and Google OAuth with secure cookie and Bearer session support.

---

## 4. Existing Database Layer

### Findings in `src/lib/db.ts` and `src/models/`
- Connection handled via `mongoose.connect(DB_URI)`.
- 9 Mongoose schemas exist:
  1. `User.model.ts`
  2. `Course.model.ts`
  3. `Order.model.ts`
  4. `Enrolment.model.ts`
  5. `Instructor.model.ts`
  6. `Review.model.ts`
  7. `Cart.model.ts`
  8. `Faq.model.ts`
  9. `Subcriber.model.ts`
- **Critical Flaws:**
  - No foreign key integrity, ACID relational constraints, or relational schema migrations.
  - Runtime schema creation with `User.create({ ...bodyData })`.
  - MongoDB models store unstructured and unvalidated fields.
- **Target Replacement:** PostgreSQL 16+ schema managed with Drizzle ORM and SQL migration files.

---

## 5. Existing API Routes

The repository contains only three Next.js API route handlers under `src/app/api/`:

| Route Path | Method | Purpose & Vulnerability |
|---|---|---|
| `/api/register` | `POST` | **CRITICAL VULNERABILITY**: Direct `User.create({ ...bodyData })`. Client can specify `role: 'admin'`, bypass verification, store plaintext passwords. |
| `/api/test` | `POST` | **CRITICAL VULNERABILITY**: Duplicate public endpoint executing arbitrary `User.create({ ...bodyData })` without authentication or validation. Form in `Register.tsx` directly targets this route. |
| `/api/check-user-exists` | `GET` | **SECURITY ISSUE**: Enumerates existing users by `username` and `email` without rate limiting or authentication. |
| `/api/[...nextauth]` | `GET`, `POST` | Bound to broken `src/auth.ts` stub. |

---

## 6. Existing Mock Data

Located in `src/lib/mockData/`:
- `mockData.ts` (61.9 KB): Comprehensive mock datasets containing `courses`, `users`, `reviews`, `blogs`, `brands`, `notifications`, `pricingPlans`, `transactions`.
- `mockApi.ts`: In-memory helper functions (`getCategories`, `getFeaturedCourses`, `getSingleCourse`, `getTopInstructor`, etc.).
- `mockDataTypes.ts`: TypeScript interfaces for mock entities.
- **Impact:** Frontend pages (such as `/courses`, `/courses/[course]`, `/`) import directly from `mockApi` and `mockData`.
- **Target Strategy:** Retain temporarily for static course view components in `apps/web` until P2, while transforming mock users into initial database seed fixtures for P1.

---

## 7. Existing Dashboards

### Routes:
- `/dashboard/layout.tsx`: Renders a Hero component and `{children}`. **Zero authentication checks or guards.**
- `/dashboard/admin/overview/page.tsx`: Static placeholder heading `<h2>Admin Overview</h2>`.
- `/dashboard/admin/courses/page.tsx`: Static placeholder heading `<h2>All courses</h2>`.
- **Critical Vulnerability:** There is no server-side route guard, middleware, or authorization check. Anyone navigating to `/dashboard/admin/overview` can view it directly.

---

## 8. Existing Tests

- **Status:** **Zero tests exist in the repository.**
- No unit tests, no integration tests, no E2E tests, no test runner configured in `package.json`.

---

## 9. Existing CI/CD

- **Status:** **Zero CI/CD configuration.**
- No `.github/workflows/`, no Dockerfile, no pre-commit hooks.

---

## 10. Security Vulnerabilities (Blocker Audit)

| Blocker # | Vulnerability | Location | Severity | Details |
|---|---|---|---|---|
| **BLOCKER 1** | Plaintext password storage | `src/app/api/(user)/register/route.ts`, `src/app/api/test/route.ts` | **CRITICAL** | `password` is stored as-is without hashing. |
| **BLOCKER 2** | Mass assignment / Role escalation | `src/app/api/(user)/register/route.ts`, `src/app/api/test/route.ts` | **CRITICAL** | `User.create({ ...bodyData })` allows client to submit `role: 'admin'`, `isVerified: true`. |
| **BLOCKER 3** | Broken authentication | `src/auth.ts`, `src/components/forms/Login.tsx` | **CRITICAL** | `authorize()` always returns `null`; login form does not execute authentication. |
| **BLOCKER 4** | Register confirm-password field bug | `src/components/forms/Register.tsx` | **HIGH** | Confirm Password input is bound to `name='name'`, failing form validation logic. |
| **BLOCKER 5** | Dangerous public `/test` user creation endpoint | `src/app/api/test/route.ts` | **CRITICAL** | Unprotected endpoint used by registration form to dump arbitrary unhashed records. |
| **BLOCKER 6** | Mock / Fake authentication flow | `src/components/forms/Login.tsx` | **HIGH** | Login prints `console.log(userData)` without any server session or token issuance. |
| **BLOCKER 7** | Unprotected dashboard / admin routes | `src/app/dashboard/*` | **CRITICAL** | Complete absence of server-side or middleware auth checks on `/dashboard/admin/*`. |
| **BLOCKER 8** | Client-controlled authorization assumptions | Client components | **HIGH** | Role rendering assumes UI hiding is security. |
| **BLOCKER 9** | Account enumeration | `src/app/api/(user)/check-user-exists/route.ts` | **MEDIUM** | Unauthenticated endpoint queries and confirms whether email or username exists. |
| **BLOCKER 10** | Unrestricted CORS & missing security headers | Global Next.js config | **MEDIUM** | Missing strict CSP, X-Content-Type-Options, HSTS, frame-ancestors, CORS restrictions. |

---

## 11. Migration Strategy

1. **Monorepo Structure:**
   - Migrate root to pnpm workspace with `apps/web`, `apps/api`, `packages/contracts`.
   - Preserve existing Next.js app in `apps/web`.
2. **NestJS API (`apps/api`):**
   - Create NestJS application listening on port 3001 with `/api/v1` prefix.
   - Establish modules: `identity`, `users`, `roles`, `audit`.
   - Setup Drizzle ORM connecting to PostgreSQL with relational schemas (`users`, `roles`, `user_roles`, `sessions`, `otps`, `audit_logs`).
   - Setup BullMQ queue & Redis worker for asynchronous tasks.
3. **Authentication Layer:**
   - Integrate Better Auth / secure password hashing (Argon2id / Scrypt), Phone OTP (Redis backed, 6 digits, 3-minute TTL, rate limited), Google OAuth adapter.
   - Session management supporting secure HttpOnly cookies and Bearer token compatibility.
4. **Security Controls & RBAC:**
   - Role guard enforcing `student` vs `admin`.
   - Audit logging for all privileged and auth actions.
   - Request correlation ID middleware (`X-Request-Id`).
   - Global exception filter returning unified RFC-compliant error format.
5. **Frontend Adaptation (`apps/web`):**
   - Fix `Register.tsx` confirm password field binding (`name='passwordConfirmation'`).
   - Wire `Register.tsx` and `Login.tsx` to the new `/api/v1/auth` endpoints.
   - Implement protected route middleware guarding `/dashboard` and `/dashboard/admin`.
   - Deprecate `/api/test` and direct Next.js API registration.
6. **Testing & CI:**
   - Add unit, integration, and Playwright E2E tests validating the full matrix.
   - Setup GitHub Actions workflow validating build, lint, types, tests, and migrations.

---

## 12. Files That Will Be Preserved

- `src/components/cards/*` (UI cards for courses, reviews, blogs)
- `src/components/header/*` (Navigation bar, search, mobile menu)
- `src/components/sections/*` (Hero, stats, categories, instructors)
- `src/components/ui/*` (Radix / Tailwind UI primitives)
- `src/components/Footer.tsx`, `Hero.tsx`, `RouteLoader.tsx`, `Offer.tsx`
- `src/app/courses/*`, `src/app/blogs/*`, `src/app/about-us/*`, `src/app/contact/*`, `src/app/faq/*`
- `src/lib/mockData/*` (retained for public catalog rendering during P1; seeded into DB for P2)
- `src/schemas/*` (retained and updated for client-side form validation)

---

## 13. Files That Will Be Deprecated

- `src/auth.ts` (replaced by NestJS / Better Auth API authentication)
- `src/lib/db.ts` (Mongoose connection cache; retired in favor of PostgreSQL Drizzle client)
- `src/models/*.ts` (Mongoose models retired in favor of Drizzle schema in `apps/api`)
- `src/proxy.ts` (unused stub)

---

## 14. Files That Will Be Removed / Replaced

- `src/app/api/test/route.ts` (**REMOVED**: dangerous insecure endpoint)
- `src/app/api/(user)/register/route.ts` (**DEPRECATED/REPLACED**: routed to NestJS `/api/v1/auth/register`)
- `src/app/api/[...nextauth]/route.ts` (**RETIRED**: superseded by API session handler)

---

## 15. Files That Require Migration / Modification

- `package.json` (Root monorepo workspace configuration)
- `pnpm-workspace.yaml` (Workspace package definitions)
- `src/components/forms/Register.tsx` (Fix field binding, point to `/api/v1/auth/register`, add safe error handling)
- `src/components/forms/Login.tsx` (Connect to `/api/v1/auth/login`, handle real sessions)
- `src/components/OtpModal.tsx` (Wire to `/api/v1/auth/otp/verify`)
- `src/app/dashboard/layout.tsx` (Add session guard and unauthorized redirect)
- `src/app/dashboard/admin/overview/page.tsx` & `courses/page.tsx` (Add RBAC admin role verification)
