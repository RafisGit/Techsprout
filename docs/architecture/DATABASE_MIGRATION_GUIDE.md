# Database Migration & Operational Guide

**Date:** 2026-09-27  
**Database Engine:** PostgreSQL 16+  
**ORM & Tooling:** Drizzle ORM (`drizzle-orm`) & Drizzle Kit (`drizzle-kit`)  

---

## 1. Principles & Policies

1. **Zero Auto-Sync in Production:** Under no circumstances should `drizzle-kit push` be run against staging or production databases. All schema updates must occur via pre-generated, peer-reviewed SQL migration files.
2. **Forward-Only, Non-Destructive Migrations:** Migrations must add nullable columns or defaults first. Dropping tables or columns requires an explicit deprecation and verification procedure.
3. **Idempotency & Transactional Safety:** All migration scripts must run inside PostgreSQL transactions (`BEGIN; ... COMMIT;`) where supported.

---

## 2. Directory Structure

```
apps/api/src/database/
├── schema/
│   ├── index.ts          # Central schema exports
│   ├── users.ts          # Users, Accounts, Sessions
│   ├── roles.ts          # Roles and User_Roles
│   ├── otps.ts           # OTP verification tokens
│   └── audit.ts          # Append-only audit logs
├── migrations/
│   ├── 0000_initial_schema.sql
│   └── meta/             # Drizzle migration journal
├── migrate.ts            # Migration runner script
└── seed/
    ├── seed.ts           # Development & test data seeder
    └── fixtures.ts       # Baseline roles and admin accounts
```

---

## 3. Migration Commands

From the workspace root or `apps/api`:

### Generate a new migration
```bash
pnpm --filter @techsprout/api db:generate
```
This inspects `schema/*.ts` against previous migrations in `migrations/` and generates the next sequenced SQL file.

### Apply pending migrations
```bash
pnpm --filter @techsprout/api db:migrate
```
Runs the automated migration runner which records executed migrations in the `__drizzle_migrations` table.

### Seed default roles and initial accounts
```bash
pnpm --filter @techsprout/api db:seed
```
Seeds:
- Default roles: `student`, `admin`
- Synthetic admin account (for local development/testing)
- Synthetic student account

---

## 4. Rollback and Disaster Recovery

1. If a migration fails during deployment:
   - Drizzle executes migrations in a transaction; uncommitted changes are rolled back automatically.
   - Inspect the logs for the specific SQL failure and correlation ID.
2. If a migration is applied but must be reverted:
   - Do NOT edit applied migration files.
   - Generate a compensating forward migration (e.g. `0002_revert_feature_x.sql`) that reverses the change safely.
