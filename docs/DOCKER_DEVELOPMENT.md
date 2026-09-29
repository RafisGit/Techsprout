# TechSprout School LMS — Local Docker Development Environment

> **Deployment Architecture Notice:**  
> **Docker Compose** is specifically designed and maintained for **local development**, integration testing, and reproducible local environments.  
> **Production deployment architecture remains strictly unchanged:**
> - **Frontend (Next.js):** Vercel
> - **Backend (NestJS API):** Render (`render.yaml`)
> - **Primary Database:** Render Managed PostgreSQL 16
> - **Queue & Caching:** Render Managed Redis
> - **Media & Assets:** Cloudinary Media Platform

---

## 1. Architectural Overview

The local Docker environment orchestrates a multi-container stack connected through an isolated bridge network (`techsprout-network`):

```
                        Host Machine (Developer / Browser)
                                    |
                    +---------------+---------------+
                    |                               |
              localhost:3000                  localhost:3001
                    |                               |
             +------v-------+                +------v-------+
             |     web      |  Next.js SSR   |     api      |
             |   (Next.js)  | -------------> |   (NestJS)   |
             +--------------+   api:3001     +-------+------+
                                                     |
                             +-----------------------+-----------------------+
                             |                                               |
                     postgres:5432                                       redis:6379
                             |                                               |
                     +-------v--------+                              +-------v-------+
                     |    postgres    |                              |     redis     |
                     | (Postgres 16)  |                              |   (Redis 7)   |
                     +-------+--------+                              +-------+-------+
                             |                                               |
                     postgres_data (volume)                          redis_data (volume)
```

### Services Summary

| Service | Base Image | Internal Port | Host Port | Non-Root User | Persistence |
|---|---|---:|---:|---|---|
| `web` | `node:20-alpine` (multi-stage) | 3000 | 3000 | `nextjs:nodejs` (uid 1001) | Ephemeral |
| `api` | `node:20-alpine` (multi-stage) | 3001 | 3001 | `node:node` (uid 1000) | Ephemeral |
| `postgres` | `postgres:16-alpine` | 5432 | 5432 | `postgres` | Named volume (`postgres_data`) |
| `redis` | `redis:7-alpine` | 6379 | 6379 | `redis` | Named volume (`redis_data`) |

---

## 2. Prerequisites

1. **Docker Engine / Docker Desktop** (Docker 24+ and Docker Compose v2.20+)
2. **Node.js 20+** & **pnpm 9.15.4** (for local CLI tool execution outside containers)
3. **Hardware Virtualization / WSL 2** enabled on Windows

---

## 3. Environment Variables Classification

Sensitive credentials must never be baked into Docker image layers or committed to version control. The environment variables are categorized as follows:

### Frontend (`web`) Variables

| Variable | Scope | Target | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Public / Build & Runtime | Client Browser | Base URL for client-side API requests (`http://localhost:3001`) |
| `INTERNAL_API_URL` | Server-Only / Runtime | Next.js Server | Internal DNS URL for container-to-container SSR (`http://api:3001`) |
| `NEXT_PUBLIC_APP_URL` | Public / Build & Runtime | Client Browser | Web application origin (`http://localhost:3000`) |
| `AUTH_SECRET` | Server-Only / Runtime | Next.js Server | Session encryption secret (minimum 32 characters) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Public / Build & Runtime | Client Browser | Cloudinary cloud identifier (safe for public exposure) |

> [!WARNING]  
> Never expose `CLOUDINARY_API_SECRET`, `CLOUDINARY_API_KEY`, or `DATABASE_URL` to `web`.

### Backend (`api`) Variables

| Variable | Scope | Target | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Server-Only / Runtime | NestJS API | PostgreSQL connection string (`postgresql://postgres:postgres@postgres:5432/techsprout`) |
| `REDIS_URL` | Server-Only / Runtime | NestJS API | Redis connection string (`redis://redis:6379`) |
| `AUTH_SECRET` | Server-Only / Runtime | NestJS API | HMAC / Session signing secret (minimum 32 characters) |
| `WEB_ORIGIN` | Server-Only / Runtime | NestJS API | Whitelisted origin for CORS and CSP (`http://localhost:3000`) |
| `CLOUDINARY_CLOUD_NAME` | Server-Only / Runtime | NestJS API | Server-side Cloudinary credentials |
| `CLOUDINARY_API_KEY` | Server-Only / Runtime | NestJS API | Server-side Cloudinary credentials |
| `CLOUDINARY_API_SECRET` | Server-Only / Runtime | NestJS API | Server-side Cloudinary secret |
| `RUN_MIGRATIONS` | Server-Only / Runtime | Entrypoint Script | Idempotently apply database schema on startup (`true`/`false`) |
| `SEED_DATABASE` | Server-Only / Runtime | Entrypoint Script | Seed baseline dev users on startup (`true`/`false`) |

---

## 4. Lifecycle & Development Workflow

### Starting the Stack

```bash
# Build images and start all services in the foreground
docker compose up --build

# Or start in detached (background) mode
docker compose up -d --build
```

Startup sequence handled automatically by healthchecks and dependency trees:
1. `postgres` starts -> initializes database -> passes `pg_isready` healthcheck.
2. `redis` starts -> passes `redis-cli ping` healthcheck.
3. `api` starts after `postgres` and `redis` are healthy -> runs `docker/api-entrypoint.sh`:
   - Checks and applies Drizzle migrations (`apps/api/dist/database/migrate.js`)
   - Checks and seeds baseline users/roles (`apps/api/dist/database/seed/seed.js`)
   - Starts NestJS server on port 3001
   - Passes `/api/v1/health` HTTP probe.
4. `web` starts after `api` is healthy -> Next.js standalone server listens on port 3000 -> passes root health probe.

### Stopping the Stack

```bash
# Graceful shutdown (preserves all database and redis data)
docker compose down

# Stop and wipe persistent database volumes (reset to clean slate)
docker compose down -v
```

### Viewing Logs

```bash
# Stream all logs
docker compose logs -f

# Stream API logs only
docker compose logs -f api

# Stream Web logs only
docker compose logs -f web

# Stream Postgres logs only
docker compose logs -f postgres
```

### Checking Container Health

```bash
docker compose ps
```

---

## 5. Database Management & Migrations

Database migrations are managed by Drizzle ORM and designed to be **safe, idempotent, and non-destructive**:

### Automatic Startup Handling
When `RUN_MIGRATIONS=true` (the default in `docker-compose.yml`), the container entrypoint (`docker/api-entrypoint.sh`) executes:
```bash
node apps/api/dist/database/migrate.js
```
Drizzle records applied migrations in `__drizzle_migrations`. Subsequent restarts execute in milliseconds without modifying existing tables or data.

### Manual Migrations & Seeding

```bash
# Run migrations manually inside running API container
docker compose exec api node apps/api/dist/database/migrate.js

# Run database seeder manually
docker compose exec api node apps/api/dist/database/seed/seed.js
```

### Accessing Database Shell

```bash
# Direct interactive psql session
docker compose exec postgres psql -U postgres -d techsprout
```

### Checking Redis Connectivity

```bash
# Test Redis connection
docker compose exec redis redis-cli ping
```

---

## 6. Container Security & Production Hardening

1. **Non-Root Execution:**
   - `api` runs as unprivileged user `node` (UID 1000).
   - `web` runs as unprivileged user `nextjs` (UID 1001, GID 1001).
   - Neither container runs as `root`.
2. **Production Image Pruning:**
   - Multi-stage builds completely isolate development dependencies.
   - `vitest`, `typescript`, `supertest`, `tsx`, `pg-mem`, and type definitions are strictly excluded from the final API runtime image.
   - Next.js standalone tracing packs only the modules and packages required to render pages.
3. **No Secrets in Images:**
   - `.dockerignore` blocks `.env`, `.env.*`, and temporary credential files from being transferred to the Docker build context.
   - Secrets are injected strictly at runtime via environment variables.
4. **Network Isolation:**
   - Inter-container traffic communicates across the private `techsprout-network` bridge.
   - Database and Redis instances are only exposed to the host machine via explicit port mappings for developer convenience.
5. **Robust Health Checking:**
   - API container evaluates live HTTP responses (`/api/v1/health`), verifying database and Redis connectivity.
   - Web container checks HTTP responses on port 3000.
