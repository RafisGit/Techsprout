# P1 Local Development Setup Guide

**Date:** 2026-09-27  
**Prerequisites:** Node.js v20+ (v24 supported), pnpm v9+ (v11 supported)

---

## 1. Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Environment Configuration
Copy environment templates in both the root, `apps/api`, and `apps/web`:
```bash
cp .env.example .env.local
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### 3. Database & Migrations
Ensure PostgreSQL 16+ is running (or set `DATABASE_URL` in `apps/api/.env`).
Run migrations:
```bash
pnpm --filter @techsprout/api db:migrate
pnpm --filter @techsprout/api db:seed
```

### 4. Running the Development Monorepo
Start all applications concurrently:
```bash
pnpm dev
```
Or start individually:
```bash
# Start NestJS API on http://localhost:3001
pnpm --filter @techsprout/api dev

# Start Next.js Web on http://localhost:3000
pnpm --filter @techsprout/web dev
```

---

## 2. API Documentation (OpenAPI / Swagger)
Once the API is running, visit:
- Swagger UI: `http://localhost:3001/api/docs`
- OpenAPI JSON: `http://localhost:3001/api/docs-json`
