# ADR 001: Separation of Next.js Web Frontend and NestJS API Monolith

**Status:** Approved  
**Date:** 2026-09-27  
**Deciders:** TechSprout Engineering Team  
**Consulted:** Product & Security Guidelines  

---

## 1. Context

The initial prototype of TechSprout School LMS coupled frontend rendering and backend logic inside a single Next.js project using Route Handlers (`src/app/api/`) and Mongoose. This architecture created critical problems:
1. **Security Vulnerabilities:** Direct object creation (`User.create({ ...bodyData })`) bypassed business validation and authorization.
2. **Coupled Business Logic:** Serverless route handlers mixed HTTP transport with persistence and domain logic.
3. **Multi-Client Incompatibility:** Next.js route handlers cannot natively serve the upcoming Flutter mobile client with clean OpenAPI contract generation, versioned endpoints, and high-performance concurrency.
4. **Maintenance Overhead:** Lack of dependency injection, modular boundaries, and structured interceptors made testing and auditing difficult.

---

## 2. Decision

We separate the system into a **pnpm monorepo** consisting of:
- **`apps/web`**: Next.js 16 App Router application strictly responsible for SSR, SEO, marketing pages, and student/admin UI presentation.
- **`apps/api`**: NestJS modular monolith responsible for all business logic, data persistence, authentication, authorization, queues, and background processing.
- **`packages/contracts`**: Versioned OpenAPI 3.1 specifications establishing the single source of truth for all API consumers (Web, mobile, and third-party integrations).

### Strict Boundary Rules
1. Next.js must NEVER directly connect to the PostgreSQL database.
2. All data fetching for dynamic and authenticated operations must traverse the NestJS `/api/v1` REST interface.
3. Next.js Route Handlers must not contain new business logic.
4. The API is a modular monolith, avoiding premature distributed microservices overhead.

---

## 3. Consequences

### Positive
- Strict isolation of business logic and authorization behind NestJS guards and services.
- Clean OpenAPI generation for typed client consumption in TypeScript (web) and Dart (Flutter).
- Independent scaling and deployment profiling for compute-heavy API workers versus edge-rendered web pages.
- Comprehensive auditability and OWASP ASVS compliance at the API perimeter.

### Negative / Trade-offs
- Monorepo orchestration requires workspace tooling (`pnpm`).
- Cross-origin configuration (CORS, HttpOnly cookie domain sharing) must be explicitly managed between `apps/web` (port 3000) and `apps/api` (port 3001).
