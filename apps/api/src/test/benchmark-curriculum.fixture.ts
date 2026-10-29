// apps/api/src/test/benchmark-curriculum.fixture.ts
// Authoritative dataset of 100 lessons across 11 courses and 32 test queries with relevance ground truth

export interface BenchmarkCourse {
  id: number;
  title: string;
}

export interface BenchmarkLesson {
  id: number;
  courseId: number;
  courseTitle: string;
  moduleTitle: string;
  title: string;
  content: string;
}

export interface BenchmarkQuery {
  id: string;
  category: 'Exact Concept' | 'Multi-Word Question' | 'Misspelling / Noisy' | 'Cross-Module/Concept';
  query: string;
  relevant: Record<number, number>; // lesson ID -> grade (3, 2, 1)
}

export const BENCHMARK_COURSES: BenchmarkCourse[] = [
  { id: 1, title: 'Modern Full-Stack Web Development with TypeScript' },
  { id: 2, title: 'Advanced PostgreSQL: Indexing, Transactions & Performance' },
  { id: 3, title: 'Containerization & Docker for Full-Stack Developers' },
  { id: 4, title: 'Enterprise Backend Architecture with NestJS' },
  { id: 5, title: 'Modern Frontend Engineering with React 19' },
  { id: 6, title: 'Cloud Infrastructure, CI/CD & Production Engineering' },
  { id: 7, title: 'Learning Telemetry, Analytics & Data Engineering' },
  { id: 8, title: 'Web Security, OWASP & Secure Authentication' },
  { id: 9, title: 'Accessible UI, Design Systems & Data Visualization' },
  { id: 10, title: 'E-Commerce, Payment Gateways & Financial Ledgers' },
  { id: 11, title: 'Microservices Architecture & Kubernetes Orchestration' },
];

export const BENCHMARK_LESSONS: BenchmarkLesson[] = [
  // Course 1
  {
    id: 1, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'TypeScript & JavaScript Core',
    title: 'Modern JavaScript (ES2024) & TypeScript 5 Core Fundamentals',
    content: 'Mastering modern ES2024 language primitives, async/await event loop mechanisms, module resolution, and TypeScript 5 compiler options. Exploration of strict mode, let/const scoping, destructuring, and typing fundamentals.'
  },
  {
    id: 2, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'TypeScript & JavaScript Core',
    title: 'TypeScript Generic Constraints & Utility Types',
    content: 'In-depth exploration of generic functions, generic interfaces, generic type constraints extends, keyof indexing, Record, Partial, Pick, Omit, and custom utility types for type-safe applications.'
  },
  {
    id: 3, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'TypeScript & JavaScript Core',
    title: 'Advanced Types: Conditional, Mapped, and Template Literal Types',
    content: 'Mastering conditional type infer keywords, distributive conditional types, mapped type modifiers, template literal types, and type gymnastics for robust library design.'
  },
  {
    id: 4, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'React Fundamentals & Lifecycle',
    title: 'React Hooks Lifecycle & Dependency Array Discipline',
    content: 'Understanding React fiber reconciliation, useState, useEffect lifecycle timing, useCallback memoization, useMemo caching, and dependency array discipline to avoid stale closures and infinite re-renders.'
  },
  {
    id: 5, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'React Fundamentals & Lifecycle',
    title: 'Complex State Management with Context & Reducers',
    content: 'Managing complex application state across component hierarchies using React Context API and useReducer. Action dispatchers, state immutability, selectors, and performance optimization.'
  },
  {
    id: 6, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'React Fundamentals & Lifecycle',
    title: 'Next.js App Router Architecture, Server Components & Suspense',
    content: 'Deep dive into Next.js App Router, React Server Components (RSC), Suspense streaming boundaries, client component leaf nodes, layouts, and route handlers.'
  },
  {
    id: 7, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'Full-Stack Integration',
    title: 'Server Actions, Mutation Handling & Optimistic UI',
    content: 'Implementing Next.js Server Actions for secure database mutations without REST boilerplates. Managing pending states, form actions, revalidation tags, and optimistic UI updates.'
  },
  {
    id: 8, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'Full-Stack Integration',
    title: 'Tailwind CSS Architecture, Responsive Grid & Design Tokens',
    content: 'Building scalable modern user interfaces using Tailwind CSS utility classes, custom design tokens, responsive breakpoints, CSS grid systems, and dark mode theming.'
  },
  {
    id: 9, courseId: 1, courseTitle: BENCHMARK_COURSES[0].title, moduleTitle: 'Full-Stack Integration',
    title: 'Full-Stack Authentication Architecture: Frontend Cookies to Backend Guards',
    content: 'End-to-end full-stack authentication design. Managing JWT access tokens, HttpOnly secure cookies, refresh token rotation, cross-site request forgery protection, and NestJS backend route guards.'
  },

  // Course 2
  {
    id: 10, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Indexing Deep Dive',
    title: 'PostgreSQL B-Tree vs Composite Indexes',
    content: 'Deep architectural comparison of standard single-column B-tree indexes versus multi-column composite indexes. Leading column indexing rules, index selectivity, and column ordering strategies.'
  },
  {
    id: 11, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Indexing Deep Dive',
    title: 'Partial, Expression & Covering (INCLUDE) Indexes',
    content: 'Creating optimized partial indexes with WHERE filters, functional expression indexes (lower, jsonb extractions), and covering indexes with INCLUDE clauses for index-only scans in PostgreSQL.'
  },
  {
    id: 12, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Indexing Deep Dive',
    title: 'Understanding EXPLAIN ANALYZE & Query Planner Cost Models',
    content: 'Reading and analyzing PostgreSQL EXPLAIN ANALYZE execution plans. Interpreting sequential scans, index scans, bitmap heap scans, join types (hash join, nested loop, merge join), and cost models.'
  },
  {
    id: 13, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Transactions & Concurrency',
    title: 'Transaction Isolation Levels: Read Committed to Serializable',
    content: 'Understanding ACID guarantees and PostgreSQL isolation levels: Read Committed, Repeatable Read, and Serializable. Dirty reads, non-repeatable reads, phantom reads, and serialization anomalies.'
  },
  {
    id: 14, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Transactions & Concurrency',
    title: 'Row-Level Locking, Advisory Locks & Deadlock Avoidance',
    content: 'PostgreSQL explicit locking mechanisms: SELECT FOR UPDATE, FOR SHARE, NOWAIT, and SKIP LOCKED. Application-level distributed locks using pg_advisory_lock and deadlock prevention patterns.'
  },
  {
    id: 15, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Transactions & Concurrency',
    title: 'Database Migration Safety Strategies and Zero Downtime',
    content: 'Designing zero-downtime schema migrations. Safe column additions, multi-phase column renames, CREATE INDEX CONCURRENTLY, lock timeouts, and backward-compatible DDL workflows.'
  },
  {
    id: 16, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Performance & Scaling',
    title: 'Optimizing Database Connection Pooling under High Concurrency',
    content: 'Configuring PgBouncer and client connection pools for maximum throughput under high concurrency. Connection pool sizing, transaction vs session pooling modes, and connection exhaustion mitigation.'
  },
  {
    id: 17, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Performance & Scaling',
    title: 'Partitioning Large Tables: Range, List & Hash Partitioning',
    content: 'Designing declarative table partitioning in PostgreSQL for high-volume datasets. Range partitioning on timestamps, list partitioning on tenants, and hash partitioning with partition pruning.'
  },
  {
    id: 18, courseId: 2, courseTitle: BENCHMARK_COURSES[1].title, moduleTitle: 'Performance & Scaling',
    title: 'PostgreSQL Full-Text Search (FTS) with tsvector & GIN Indexes',
    content: 'Implementing native full-text search in PostgreSQL. Parsing text with to_tsvector, dictionary stemming, English stopword elimination, to_tsquery, ts_rank_cd relevance ranking, and GIN index acceleration.'
  },

  // Course 3
  {
    id: 19, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Docker Fundamentals & Images',
    title: 'Docker Multi-Stage Builds & Minimal Alpine Images',
    content: 'Optimizing container image size using Docker multi-stage builds. Separating compile-time toolchains from production runtime environments using minimal Alpine Linux and distroless base images.'
  },
  {
    id: 20, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Docker Fundamentals & Images',
    title: 'Docker Layer Caching Strategies & BuildKit Optimization',
    content: 'Structuring Dockerfile instructions to maximize layer cache hits. Ordering package manifest copies before source code, utilizing BuildKit cache mounts, and minimizing rebuild times.'
  },
  {
    id: 21, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Docker Fundamentals & Images',
    title: 'Container Networking: Bridge, Host & Overlay Networks',
    content: 'Deep dive into container networking drivers: default bridge networks, custom user-defined bridges, host networking, and multi-host overlay networks. DNS resolution between containers.'
  },
  {
    id: 22, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Local Development & Persistence',
    title: 'Docker Compose for Multi-Container Local Development',
    content: 'Orchestrating local full-stack development environments with Docker Compose. Defining services for NestJS API, PostgreSQL, Redis, and Next.js web with environment variable substitution and networks.'
  },
  {
    id: 23, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Local Development & Persistence',
    title: 'Managing Persistent Data with Docker Volumes and Bind Mounts',
    content: 'Configuring named Docker volumes for persistent database storage and bind mounts for live code hot-reloading. Volume drivers, permissions, and backup extraction strategies.'
  },
  {
    id: 24, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Local Development & Persistence',
    title: 'Security Hardening: Non-Root Containers & Read-Only Filesystems',
    content: 'Hardening Docker containers for production security. Creating dedicated non-root users, dropping Linux capabilities, running containers with read-only root filesystems, and avoiding privilege escalation.'
  },
  {
    id: 25, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Production Operations & Teardown',
    title: 'Container Health Checks, Restart Policies & Graceful Teardown',
    content: 'Defining container health check commands, restart policies (unless-stopped, on-failure), and container lifecycle management in production container runtimes.'
  },
  {
    id: 26, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Production Operations & Teardown',
    title: 'Graceful Shutdown & Signal Handling in Node.js Containers',
    content: 'Handling POSIX termination signals (SIGTERM, SIGINT) in Node.js and NestJS applications inside containers. Draining in-flight HTTP requests, closing database connection pools, and disconnecting queues cleanly.'
  },
  {
    id: 27, courseId: 3, courseTitle: BENCHMARK_COURSES[2].title, moduleTitle: 'Production Operations & Teardown',
    title: 'Container Registries, Image Signing & Vulnerability Scanning',
    content: 'Publishing production container images to secure container registries. Automated vulnerability scanning with Trivy, image digest immutability, and container signing with Cosign.'
  },

  // Course 4
  {
    id: 28, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'NestJS Architecture & DI',
    title: 'Dependency Injection & Modular Architecture in NestJS',
    content: 'Mastering NestJS inversion of control (IoC) and dependency injection (DI) container. Custom providers, factory providers, dynamic modules, module exports, and scope lifecycles.'
  },
  {
    id: 29, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'NestJS Architecture & DI',
    title: 'NestJS Middleware, Interceptors & Logging Pipelines',
    content: 'Implementing enterprise request-response pipelines in NestJS. Using HTTP middleware for request tracing, execution interceptors for response transformation and timing, and structured Winston logging.'
  },
  {
    id: 30, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'NestJS Architecture & DI',
    title: 'Validation Pipes, DTO Transformation & Class-Validator',
    content: 'Enforcing strict runtime schema validation in NestJS using ValidationPipe, class-validator decorators, and class-transformer. Stripping non-whitelisted payload properties and preventing prototype pollution.'
  },
  {
    id: 31, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'Error Handling & Data Access',
    title: 'Exception Filters, Custom Exceptions & RFC-7807 Error Responses',
    content: 'Centralized error handling with NestJS Exception Filters. Mapping domain exceptions to HTTP status codes, formatting RFC-7807 Problem Details error responses, and preventing internal stack leakages.'
  },
  {
    id: 32, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'Error Handling & Data Access',
    title: 'Database Integration with Drizzle ORM and PostgreSQL',
    content: 'Integrating Drizzle ORM with NestJS dependency injection. Defining relational schemas, query builders, relations, join queries, transaction management, and connection pooling providers.'
  },
  {
    id: 33, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'Error Handling & Data Access',
    title: 'Asynchronous Queues & Background Workers with BullMQ',
    content: 'Implementing background job processing with BullMQ and Redis in NestJS. Job queues, worker concurrency, retry backoff strategies, dead-letter queues, and event listeners.'
  },
  {
    id: 34, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'Distributed Systems & Patterns',
    title: 'Task Scheduling, Cron Jobs & Distributed Locks with Redis',
    content: 'Scheduling recurring cron jobs in NestJS with @nestjs/schedule and BullMQ repeatable jobs. Preventing duplicate execution across multiple replicas using Redis Redlock distributed locking.'
  },
  {
    id: 35, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'Distributed Systems & Patterns',
    title: 'Event-Driven Architecture using Outbox Pattern and Message Queues',
    content: 'Designing reliable event-driven systems using the Transactional Outbox pattern. Writing domain events within the same database transaction as business entities and dispatching to message brokers via polling or Debezium CDC.'
  },
  {
    id: 36, courseId: 4, courseTitle: BENCHMARK_COURSES[3].title, moduleTitle: 'Distributed Systems & Patterns',
    title: 'Microservices Communication: gRPC, RabbitMQ & Redis Pub/Sub',
    content: 'Evaluating inter-service communication protocols in modern microservice architectures. High-performance synchronous gRPC RPCs versus asynchronous message queuing with RabbitMQ and Redis Pub/Sub.'
  },

  // Course 5
  {
    id: 37, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'React 19 Deep Dive',
    title: 'React 19 Compiler, Actions & Server Component Boundaries',
    content: 'Exploring the React 19 architecture: automatic memoization via React Compiler, Server Action transitions, use server directives, and defining strict boundaries between Server and Client Components.'
  },
  {
    id: 38, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'React 19 Deep Dive',
    title: 'Concurrent React: useTransition, useDeferredValue & Suspense',
    content: 'Building ultra-responsive user interfaces with React Concurrent mode. Non-blocking UI updates using useTransition, deferred rendering with useDeferredValue, and nested Suspense fallbacks.'
  },
  {
    id: 39, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'React 19 Deep Dive',
    title: 'Form State Management with useActionState & useFormStatus',
    content: 'Managing complex form lifecycles natively in React 19 without external state libraries. Handling pending form submissions with useFormStatus and binding server action returns with useActionState.'
  },
  {
    id: 40, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'Advanced UI Engineering',
    title: 'Optimistic UI Updates with useOptimistic Hook',
    content: 'Implementing instantaneous client feedback using the React 19 useOptimistic hook. Updating UI state optimistically before server confirmation, with automatic rollback on server error.'
  },
  {
    id: 41, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'Advanced UI Engineering',
    title: 'Advanced Custom Hooks Architecture & Code Reusability',
    content: 'Designing robust custom hooks for browser event listeners, debounce/throttle coordination, WebSocket streaming connections, and data synchronization across browser tabs.'
  },
  {
    id: 42, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'Advanced UI Engineering',
    title: 'Frontend Performance Optimization & Bundle Splitting',
    content: 'Optimizing Core Web Vitals (LCP, FID/INP, CLS) in Next.js applications. Dynamic imports (next/dynamic), tree shaking, route-based code splitting, font optimization, and script loading strategies.'
  },
  {
    id: 43, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'Scalable UI Systems',
    title: 'Virtualized Lists & Infinite Scrolling for High-Volume Data',
    content: 'Rendering massive datasets without DOM bloat using windowing and virtualized lists (@tanstack/react-virtual). Fixed and dynamic item heights, scroll synchronization, and bidirectional infinite loading.'
  },
  {
    id: 44, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'Scalable UI Systems',
    title: 'Web Accessibility (a11y), ARIA Roles & Screen Reader Testing',
    content: 'Implementing WCAG 2.1 AA accessibility standards in web applications. Semantic landmarks, ARIA live regions, keyboard focus traps, screen reader testing with NVDA/VoiceOver, and automated axe-core audits.'
  },
  {
    id: 45, courseId: 5, courseTitle: BENCHMARK_COURSES[4].title, moduleTitle: 'Scalable UI Systems',
    title: 'Internationalization (i18n), RTL Layouts & Localization',
    content: 'Designing multi-lingual full-stack applications. Dynamic route localization, ICU message formatting, pluralization, RTL (right-to-left) CSS mirroring, and date/currency formatting for international users.'
  },

  // Course 6
  {
    id: 46, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'CI/CD & Infrastructure as Code',
    title: 'Automated CI/CD Pipelines with GitHub Actions',
    content: 'Building enterprise CI/CD pipelines with GitHub Actions. Automated linting, Vitest unit test execution, Docker build cache integration, artifact uploading, and branch deployment automation to Render.'
  },
  {
    id: 47, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'CI/CD & Infrastructure as Code',
    title: 'Infrastructure as Code (IaC) with Terraform & Render Blueprints',
    content: 'Managing declarative cloud infrastructure using Render Blueprints (render.yaml) and Terraform. Defining web services, managed PostgreSQL databases, Redis key-value stores, and environment variables.'
  },
  {
    id: 48, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'CI/CD & Infrastructure as Code',
    title: 'Zero-Downtime Blue-Green & Rolling Deployment Strategies',
    content: 'Architecting zero-downtime deployment pipelines. Comparing rolling container deployments with blue-green environments, traffic routing, health check validation, and automated instant rollbacks.'
  },
  {
    id: 49, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'Observability & Resilience',
    title: 'Production Observability: Structured Logging, Tracing & APM',
    content: 'Implementing production observability. JSON structured logging with correlation IDs, OpenTelemetry distributed tracing across HTTP microservices, error tracking with Sentry, and APM metrics.'
  },
  {
    id: 50, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'Observability & Resilience',
    title: 'Health Checks, Readiness Probes & Self-Healing Architecture',
    content: 'Designing multi-level health checks in web services. Liveness probes for process hangs, readiness probes verifying database and Redis connectivity, and orchestrator self-healing restarts.'
  },
  {
    id: 51, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'Observability & Resilience',
    title: 'TLS Certificates, HTTPS Configuration & DNS Management',
    content: 'Configuring modern transport layer security (TLS 1.3), automated Let’s Encrypt certificate issuance, DNS record types (A, CNAME, ALIAS), CAA records, and HTTP Strict Transport Security (HSTS).'
  },
  {
    id: 52, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'Edge Delivery & Security',
    title: 'CDN Edge Caching, Cache-Control Headers & Purge Invalidation',
    content: 'Accelerating global asset delivery with Content Delivery Networks (Vercel Edge, Cloudflare). Stale-While-Revalidate caching headers, surrogate keys, cache invalidation webhooks, and edge execution.'
  },
  {
    id: 53, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'Edge Delivery & Security',
    title: 'Secret Management, HashiCorp Vault & Runtime Environment Security',
    content: 'Safeguarding API secrets, database credentials, and cryptographic keys. Secret injection into container environments, dynamic secret rotation, auditing secret access, and avoiding repo leaks.'
  },
  {
    id: 54, courseId: 6, courseTitle: BENCHMARK_COURSES[5].title, moduleTitle: 'Edge Delivery & Security',
    title: 'Disaster Recovery, Database Backup Automation & RPO/RTO',
    content: 'Formulating disaster recovery strategies. Automated pg_dump snapshot cron jobs, encrypted off-site backup storage in S3/Cloud Storage, point-in-time recovery (PITR), and meeting RPO/RTO targets.'
  },

  // Course 7
  {
    id: 55, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Telemetry Ingestion Architecture',
    title: 'Event Streaming Architecture: Telemetry Beacons & Ingestion',
    content: 'Designing scalable learner telemetry event streaming. Schema definition for learning events, video playback tracking, quiz attempts, high-concurrency ingestion endpoints, and queue buffering.'
  },
  {
    id: 56, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Telemetry Ingestion Architecture',
    title: 'Client-Side Beacon Transport: sendBeacon & Page-Exit Lifecycle',
    content: 'Implementing reliable client-side telemetry transmission using navigator.sendBeacon and fetch keepalive during page unloads, visibility changes, and mobile browser tab closures.'
  },
  {
    id: 57, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Telemetry Ingestion Architecture',
    title: 'Data Privacy by Design: HMAC-SHA256 Pseudonymization & PII Stripping',
    content: 'Enforcing GDPR and strict student privacy in telemetry data. Daily rotating HMAC-SHA256 user pseudonymization, stripping PII, parameter allowlisting, and unauthenticated tracking rejection.'
  },
  {
    id: 58, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Analytics Data Pipelines',
    title: 'High-Throughput Batch Ingestion & Rate-Limiting Sliding Windows',
    content: 'Handling high-volume telemetry surges using batch insertion APIs and sliding-window rate limiters. Enforcing rate limits per enrolled learner to protect backend databases from DDOS.'
  },
  {
    id: 59, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Analytics Data Pipelines',
    title: 'Time-Series Aggregations & Window Functions in PostgreSQL',
    content: 'Writing high-performance SQL analytical queries over time-series learning events. Using window functions, lead/lag, cumulative distributions, and date_trunc for learner progress analytics.'
  },
  {
    id: 60, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Analytics Data Pipelines',
    title: 'Automated Data Retention, Pruning Workers & Table Partitioning',
    content: 'Managing database storage limits on cloud tiers using automated BullMQ pruning workers. Scheduled chunked deletion of high-frequency video checkpoints older than 90 days.'
  },
  {
    id: 61, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Analytics UI & Reporting',
    title: 'Calculating Student Drop-Off Curves with SQL Aggregations',
    content: 'Aggregating granular video playhead checkpoints to compute lesson drop-off curves. Calculating 10-percentile completion distributions and identifying student confusion hotspots.'
  },
  {
    id: 62, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Analytics UI & Reporting',
    title: 'Building Accessible Data Visualization Charts with SVG',
    content: 'Constructing performant, accessible data visualization charts in React using native SVG elements. Rendering video retention curves, area charts, screen reader data tables, and high-contrast modes.'
  },
  {
    id: 63, courseId: 7, courseTitle: BENCHMARK_COURSES[6].title, moduleTitle: 'Analytics UI & Reporting',
    title: 'Configuring Redis Cache Expiration and Eviction Policies',
    content: 'Optimizing Redis cache layers for analytics endpoints. Cache invalidation on new course enrollments, TTL expiration strategies, and configuring maxmemory-policy (allkeys-lru, noeviction).'
  },

  // Course 8
  {
    id: 64, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'OWASP Top 10 & Injection Defense',
    title: 'How to Prevent SQL Injection in Drizzle ORM',
    content: 'Securing database access against SQL injection attacks. Understanding parameterized queries in Drizzle ORM, avoiding raw SQL string concatenation, and validating user input with Zod schemas.'
  },
  {
    id: 65, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'OWASP Top 10 & Injection Defense',
    title: 'Securing RESTful APIs against Cross-Site Scripting (XSS) and Request Forgery (CSRF)',
    content: 'Mitigating XSS and CSRF in full-stack applications. Sanitizing user HTML content with DOMPurify, configuring SameSite cookie attributes, and validating anti-CSRF tokens in mutating endpoints.'
  },
  {
    id: 66, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'OWASP Top 10 & Injection Defense',
    title: 'Content Security Policy (CSP), CORS & Secure HTTP Headers',
    content: 'Configuring HTTP security headers using Helmet in NestJS and Next.js. Defining strict Content Security Policies, restricting cross-origin resource sharing (CORS), and blocking framing.'
  },
  {
    id: 67, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'Authentication & Session Security',
    title: 'How to Implement Refresh Token Rotation Securely',
    content: 'Implementing secure refresh token rotation to mitigate token theft. Storing hashed refresh tokens in PostgreSQL, detecting token reuse, revoking user sessions, and setting HttpOnly cookies.'
  },
  {
    id: 68, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'Authentication & Session Security',
    title: 'Multi-Factor Authentication (MFA) with TOTP & Recovery Codes',
    content: 'Implementing multi-factor authentication in web applications using Time-based One-Time Passwords (TOTP). Generating QR codes, verifying authenticator tokens, and hashing emergency recovery codes.'
  },
  {
    id: 69, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'Authentication & Session Security',
    title: 'Password Hashing with Argon2id & Bcrypt Salt Discipline',
    content: 'Evaluating cryptographic password hashing algorithms. Benchmarking Argon2id against Bcrypt, configuring memory cost and iteration parameters, generating unique salts, and constant-time verification.'
  },
  {
    id: 70, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'Authorization & Defensive Operations',
    title: 'Role-Based Access Control (RBAC) & Object-Level Permission Guards',
    content: 'Implementing granular authorization in NestJS. Role-based access control with custom decorators, object-level ownership guards, and multi-tenant resource isolation preventing IDOR vulnerabilities.'
  },
  {
    id: 71, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'Authorization & Defensive Operations',
    title: 'Rate Limiting, DDoS Mitigation & IP Reputation Filtering',
    content: 'Protecting public API endpoints from brute force and denial of service attacks. Configuring distributed rate limiting using Redis sliding logs (@nestjs/throttler) and Cloudflare IP firewalls.'
  },
  {
    id: 72, courseId: 8, courseTitle: BENCHMARK_COURSES[7].title, moduleTitle: 'Authorization & Defensive Operations',
    title: 'Security Auditing, Penetration Testing & Vulnerability Assessment',
    content: 'Conducting systematic security audits and automated vulnerability scans. Using OWASP ZAP for penetration testing, auditing npm dependencies with audit-ci, and implementing security disclosure policies.'
  },

  // Course 9
  {
    id: 73, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Responsive Design & Semantic HTML',
    title: 'Responsive Web Design Principles with Accessible Semantic HTML',
    content: 'Foundational responsive web design using accessible semantic HTML5 elements. Proper heading hierarchy, landmark roles, fluid container layouts, media queries, and mobile-first responsive design.'
  },
  {
    id: 74, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Responsive Design & Semantic HTML',
    title: 'Design System Tokens, CSS Variables & Dark Mode Theming',
    content: 'Architecting scalable design systems with design tokens. Defining semantic color palettes, typography scales, spacing tokens using CSS custom properties, and seamless dark mode transitions.'
  },
  {
    id: 75, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Responsive Design & Semantic HTML',
    title: 'Advanced Layout Grids: CSS Subgrid & Container Queries',
    content: 'Modern CSS layout engineering with CSS Grid Level 2 Subgrid and Container Queries (@container). Creating dynamic components that adapt based on parent container width rather than viewport.'
  },
  {
    id: 76, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Modern Layouts & CSS Grid',
    title: 'How Does CSS Grid Differ from Flexbox Layout',
    content: 'Architectural comparison between CSS Grid and Flexbox. One-dimensional content-driven layouts with Flexbox versus two-dimensional grid-based layouts with CSS Grid, alignment, and auto-placement.'
  },
  {
    id: 77, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Modern Layouts & CSS Grid',
    title: 'Fluid Typography, Dynamic Spacing & Scalable UI Design',
    content: 'Implementing fluid typography using CSS clamp() function and dynamic viewport units. Harmonious typographic scales that scale seamlessly between mobile viewports and 4K desktop screens.'
  },
  {
    id: 78, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Modern Layouts & CSS Grid',
    title: 'Accessible SVG Charts: Screen Reader Tables & High Contrast',
    content: 'Engineering accessible data visualizations. Accompanying visual SVG line and bar charts with hidden HTML data tables for screen reader users, keyboard focusable data points, and high contrast styling.'
  },
  {
    id: 79, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Interaction & Accessibility',
    title: 'Micro-Interactions, CSS Keyframe Animations & GPU Acceleration',
    content: 'Creating fluid user interface micro-interactions using CSS transforms and opacity for GPU acceleration. Managing animation performance, will-change, and respecting prefers-reduced-motion media query.'
  },
  {
    id: 80, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Interaction & Accessibility',
    title: 'Focus Management, Keyboard Navigation & Modal Accessibility',
    content: 'Building accessible modal dialogs, drawers, and popovers in React. Managing keyboard focus trapping, restoring focus on close, escape key dismissals, and aria-expanded attributes.'
  },
  {
    id: 81, courseId: 9, courseTitle: BENCHMARK_COURSES[8].title, moduleTitle: 'Interaction & Accessibility',
    title: 'Responsive Image Formats: WebP, AVIF & Srcset Optimization',
    content: 'Optimizing web images for fast load times. Next.js image optimization, modern compressed image formats (AVIF, WebP), responsive srcset attributes, and blur-up placeholder techniques.'
  },

  // Course 10
  {
    id: 82, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Payment Gateways & Integrations',
    title: 'SSLCommerz Payment Gateway Integration & IPN Verification',
    content: 'Integrating SSLCommerz payment gateway for Bangladesh payment processing (bKash, Nagad, Visa, Mastercard). Session creation, redirection, Instant Payment Notification (IPN) webhook validation, and hash verification.'
  },
  {
    id: 83, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Payment Gateways & Integrations',
    title: 'End-to-End Testing Strategy for Financial Payment Workflows',
    content: 'Designing reliable end-to-end testing suites for payment checkout workflows. Mocking third-party payment gateways, simulating sandbox IPN callbacks, payment cancellations, and failure recovery.'
  },
  {
    id: 84, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Payment Gateways & Integrations',
    title: 'Idempotent Payment Webhooks & Replay Attack Defense',
    content: 'Securing asynchronous payment webhooks against duplicate delivery and replay attacks. Enforcing database idempotency keys, verifying transaction numbers, and recording payment audit logs.'
  },
  {
    id: 85, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Monetization Ledger & Bookkeeping',
    title: 'Double-Entry Bookkeeping & Immutable Financial Ledger Architecture',
    content: 'Architecting an immutable financial ledger with double-entry bookkeeping principles. Balanced debits and credits per transaction, ledger account types (platform cash, revenue, instructor payable), and audit trails.'
  },
  {
    id: 86, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Monetization Ledger & Bookkeeping',
    title: 'Escrow Settlement, Refund Clawbacks & Multi-Source Reconciliation',
    content: 'Managing course purchase escrow holding periods (30 days), automatic escrow settlement, handling student refund clawbacks from instructor pending balances, and multi-source financial reconciliation.'
  },
  {
    id: 87, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Monetization Ledger & Bookkeeping',
    title: 'Floating-Point Error Prevention: Integer BDT Poisha Arithmetic',
    content: 'Eliminating rounding and precision bugs in financial systems. Storing all monetary amounts in integer BDT poisha cents (1 BDT = 100 poisha), exact integer division, and non-negative check constraints.'
  },
  {
    id: 88, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Instructor Wallets & Compliance',
    title: 'Instructor Wallet Architecture, Payout Holds & Clearance Cycles',
    content: 'Designing instructor monetization wallets. Available balance versus pending balance, payout request workflows, automated balance deduction, admin review approval, and settlement reference recording.'
  },
  {
    id: 89, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Instructor Wallets & Compliance',
    title: 'Invoice Generation, PDF Rendering & Tax Compliance',
    content: 'Automating tax-compliant invoice generation upon successful course checkout. Server-side PDF rendering using React-PDF, sequential invoice numbering, and customer receipt downloads.'
  },
  {
    id: 90, courseId: 10, courseTitle: BENCHMARK_COURSES[9].title, moduleTitle: 'Instructor Wallets & Compliance',
    title: 'Financial Auditing, Ledger Balance Invariants & Anomaly Detection',
    content: 'Implementing automated integrity checks for financial platforms. Verifying mathematical balance invariants (sum of debits == sum of credits), detecting anomalous transactions, and audit alerting.'
  },

  // Course 11
  {
    id: 91, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Kubernetes Core Concepts',
    title: 'Kubernetes Architecture: Control Plane, Nodes & Pod Scheduling',
    content: 'Understanding Kubernetes architectural building blocks. Control plane components (API server, etcd, controller manager, kube-scheduler), worker node kubelet, kube-proxy, and pod scheduling algorithms.'
  },
  {
    id: 92, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Kubernetes Core Concepts',
    title: 'Deployments, ReplicaSets & Declarative Pod Lifecycle',
    content: 'Managing container workloads with Kubernetes Deployments and ReplicaSets. Declarative pod specs, rolling update strategies, maxUnavailable/maxSurge parameters, and rollbacks.'
  },
  {
    id: 93, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Kubernetes Core Concepts',
    title: 'Services, ClusterIP, NodePort & LoadBalancer Networking',
    content: 'Kubernetes internal and external service networking. ClusterIP for internal service discovery, NodePort for external port mapping, and cloud LoadBalancer service integration.'
  },
  {
    id: 94, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Ingress, Config & Storage',
    title: 'Kubernetes Ingress Controller & TLS Termination',
    content: 'Routing external HTTP/HTTPS traffic to internal services using Kubernetes Ingress controllers (NGINX, Traefik). Path-based routing, host-based routing, and cert-manager automated TLS termination.'
  },
  {
    id: 95, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Ingress, Config & Storage',
    title: 'ConfigMaps, Secrets & Environment Injection in Kubernetes',
    content: 'Decoupling configuration and secrets from container images in Kubernetes. Mounting ConfigMaps and encrypted Secrets as environment variables or volume files into running pods.'
  },
  {
    id: 96, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Ingress, Config & Storage',
    title: 'Persistent Volumes (PV), Claims (PVC) & StatefulSet Storage',
    content: 'Managing stateful workloads in Kubernetes. PersistentVolumes (PV), PersistentVolumeClaims (PVC), storage classes, dynamic volume provisioning, and StatefulSets for databases.'
  },
  {
    id: 97, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Scaling, Resilience & Ecosystem',
    title: 'Horizontal Pod Autoscaler (HPA) & Metrics Server Integration',
    content: 'Autoscaling Kubernetes workloads dynamically based on CPU and memory utilization using Horizontal Pod Autoscaler (HPA). Configuring Metrics Server, target thresholds, and cooldown periods.'
  },
  {
    id: 98, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Scaling, Resilience & Ecosystem',
    title: 'Liveness, Readiness & Startup Probes for Container Resilience',
    content: 'Configuring Kubernetes container probes for zero-downtime reliability. Startup probes for slow-booting applications, liveness probes for deadlocks, and readiness probes for traffic routing.'
  },
  {
    id: 99, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Scaling, Resilience & Ecosystem',
    title: 'Helm Charts, Package Management & Templating for K8s',
    content: 'Packaging and deploying multi-service Kubernetes applications using Helm. Chart structure, values.yaml customization, Go template syntax, release versioning, and Helm rollback commands.'
  },
  {
    id: 100, courseId: 11, courseTitle: BENCHMARK_COURSES[10].title, moduleTitle: 'Scaling, Resilience & Ecosystem',
    title: 'Service Mesh Fundamentals: Envoy, Istio & Mutual TLS (mTLS)',
    content: 'Implementing enterprise service mesh architectures in Kubernetes using Istio and Envoy sidecars. Zero-trust mutual TLS (mTLS) encryption, traffic shifting, canary releases, and distributed tracing.'
  },
];

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // Category 1: Exact Concept (8 queries)
  {
    id: 'Q01', category: 'Exact Concept', query: 'Docker multi-stage builds',
    relevant: { 19: 3, 20: 2, 22: 2, 24: 1 }
  },
  {
    id: 'Q02', category: 'Exact Concept', query: 'PostgreSQL composite indexes',
    relevant: { 10: 3, 11: 2, 12: 2, 16: 1 }
  },
  {
    id: 'Q03', category: 'Exact Concept', query: 'NestJS interceptors',
    relevant: { 29: 3, 28: 2, 30: 2, 31: 1 }
  },
  {
    id: 'Q04', category: 'Exact Concept', query: 'JWT HttpOnly cookies',
    relevant: { 9: 3, 67: 2, 65: 2, 66: 1 }
  },
  {
    id: 'Q05', category: 'Exact Concept', query: 'SSLCommerz payment gateway',
    relevant: { 82: 3, 83: 2, 84: 2 }
  },
  {
    id: 'Q06', category: 'Exact Concept', query: 'Kubernetes ingress controller',
    relevant: { 94: 3, 93: 2, 91: 2 }
  },
  {
    id: 'Q07', category: 'Exact Concept', query: 'TypeScript generic constraints',
    relevant: { 2: 3, 1: 2, 3: 2 }
  },
  {
    id: 'Q08', category: 'Exact Concept', query: 'React useCallback dependency array',
    relevant: { 4: 3, 5: 2, 41: 2 }
  },

  // Category 2: Multi-Word Question (8 queries)
  {
    id: 'Q09', category: 'Multi-Word Question', query: 'how to prevent SQL injection in Drizzle ORM',
    relevant: { 64: 3, 32: 2, 10: 2 }
  },
  {
    id: 'Q10', category: 'Multi-Word Question', query: 'best practices for error handling in asynchronous Node.js',
    relevant: { 26: 3, 31: 2, 29: 2, 87: 1 }
  },
  {
    id: 'Q11', category: 'Multi-Word Question', query: 'how does CSS grid differ from flexbox layout',
    relevant: { 76: 3, 75: 2, 8: 2 }
  },
  {
    id: 'Q12', category: 'Multi-Word Question', query: 'optimizing database connection pooling under high concurrency',
    relevant: { 16: 3, 14: 2, 12: 2, 13: 1 }
  },
  {
    id: 'Q13', category: 'Multi-Word Question', query: 'how to implement refresh token rotation securely',
    relevant: { 67: 3, 9: 2, 65: 2 }
  },
  {
    id: 'Q14', category: 'Multi-Word Question', query: 'calculating student drop off curves with SQL aggregations',
    relevant: { 61: 3, 59: 2, 62: 2 }
  },
  {
    id: 'Q15', category: 'Multi-Word Question', query: 'configuring Redis cache expiration and eviction policies',
    relevant: { 63: 3, 34: 2, 33: 2 }
  },
  {
    id: 'Q16', category: 'Multi-Word Question', query: 'setting up automated CI CD pipelines with GitHub Actions',
    relevant: { 46: 3, 48: 2, 19: 2, 27: 1 }
  },

  // Category 3: Misspelling / Noisy (8 queries)
  {
    id: 'Q17', category: 'Misspelling / Noisy', query: 'dokker multistage build',
    relevant: { 19: 3, 20: 2, 22: 2 }
  },
  {
    id: 'Q18', category: 'Misspelling / Noisy', query: 'postgre composite indx',
    relevant: { 10: 3, 11: 2, 12: 2 }
  },
  {
    id: 'Q19', category: 'Misspelling / Noisy', query: 'typsecript generic constranits',
    relevant: { 2: 3, 3: 2 }
  },
  {
    id: 'Q20', category: 'Misspelling / Noisy', query: 'react useCalback dependancy',
    relevant: { 4: 3, 5: 2, 41: 2 }
  },
  {
    id: 'Q21', category: 'Misspelling / Noisy', query: 'sslcommerz paymnt gatway',
    relevant: { 82: 3, 83: 2, 84: 2 }
  },
  {
    id: 'Q22', category: 'Misspelling / Noisy', query: 'kubernets ingrs controler',
    relevant: { 94: 3, 93: 2, 91: 2 }
  },
  {
    id: 'Q23', category: 'Misspelling / Noisy', query: 'drizle sql injecton',
    relevant: { 64: 3, 32: 2, 10: 2 }
  },
  {
    id: 'Q24', category: 'Misspelling / Noisy', query: 'asynchronus nodejs error handlng',
    relevant: { 26: 3, 31: 2, 29: 2 }
  },

  // Category 4: Cross-Module/Concept (8 queries)
  {
    id: 'Q25', category: 'Cross-Module/Concept', query: 'full-stack authentication architecture from frontend cookies to backend guards',
    relevant: { 9: 3, 67: 2, 70: 2, 65: 1, 30: 1 }
  },
  {
    id: 'Q26', category: 'Cross-Module/Concept', query: 'database migration safety strategies and zero downtime deployment',
    relevant: { 15: 3, 48: 2, 14: 2, 32: 1 }
  },
  {
    id: 'Q27', category: 'Cross-Module/Concept', query: 'event-driven architecture using outbox pattern and message queues',
    relevant: { 35: 3, 33: 2, 36: 2 }
  },
  {
    id: 'Q28', category: 'Cross-Module/Concept', query: 'responsive web design principles with accessible semantic HTML',
    relevant: { 73: 3, 74: 2, 44: 2, 8: 1 }
  },
  {
    id: 'Q29', category: 'Cross-Module/Concept', query: 'building accessible data visualization charts with SVG',
    relevant: { 62: 3, 78: 2, 61: 2 }
  },
  {
    id: 'Q30', category: 'Cross-Module/Concept', query: 'securing RESTful APIs against cross-site scripting and request forgery',
    relevant: { 65: 3, 66: 2, 9: 2, 64: 1 }
  },
  {
    id: 'Q31', category: 'Cross-Module/Concept', query: 'managing state across complex React components with context and reducers',
    relevant: { 5: 3, 4: 2, 41: 2 }
  },
  {
    id: 'Q32', category: 'Cross-Module/Concept', query: 'end to end testing strategy for financial payment workflows',
    relevant: { 83: 3, 82: 2, 84: 2, 90: 1 }
  },
];
