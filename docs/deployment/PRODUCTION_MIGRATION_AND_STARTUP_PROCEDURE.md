# TECHSPROUT — PRODUCTION MIGRATION & STARTUP SAFETY PROCEDURE

## Operational Standard Operating Procedure (SOP-PROD-MIG-01)

**System:** TechSprout School LMS  
**Target Infrastructure:** Render (`techsprout-api`, `techsprout-postgres`)  
**Repository Branch:** `main`  
**Authoritative Blueprint:** [`render.yaml`](file:///d:/Work/2026/techsprout-main/render.yaml)  
**Status:** **ACTIVE OPERATIONAL STANDARD**

---

## 1. Executive Rationale & Architectural Decoupling

Historically, early prototype configurations coupled schema migration (`node apps/api/dist/database/migrate.js`) and database seeding (`node apps/api/dist/database/seed/seed.js`) directly into the web service's container `startCommand`.

### 1.1 Why Automated Seeding in Production Is Prohibited

1. **Data Corruption & Pollution Hazard:** Seeder scripts ([`apps/api/src/database/seed/seed.ts`](file:///d:/Work/2026/techsprout-main/apps/api/src/database/seed/seed.ts)) inject default test users (`admin@techsprout.edu`, `student@techsprout.edu`, `instructor@techsprout.edu`) with pre-configured static passwords, test categories, and fixture courses. Executing this against a live production database risks overwriting production entities, polluting educational catalogs, and creating critical security vulnerabilities.
2. **Cold Start & Health Check Timeouts:** Executing seeding loops on every container boot significantly increases cold start latency. On container restart or auto-recovery, delayed startup can trigger Render health-check probe timeouts (`/api/v1/health`), leading to unneeded container restarts and service flap.

### 1.2 Why Database Migrations Must Be Decoupled from Routine Process Startup

1. **Concurrency & Horizontal Scaling Locks:** If multiple web service containers spin up concurrently during zero-downtime deployments or autoscaling, simultaneous invocation of migration runners creates database lock contention, deadlocks on migration tables (`__drizzle_migrations`), or race conditions.
2. **Failure Containment:** If a migration fails during application startup, the web container enters a crash loop (`CrashLoopBackOff`), preventing operators from diagnosing the issue or serving read-only fallback traffic.
3. **Auditability & Preflight Verification:** Decoupling migrations enforces a human-in-the-loop or pipeline-gated preflight step where the migration ledger is inspected, table locks are evaluated, and database backups are confirmed before any DDL statements are executed.

---

## 2. Migration Runner Technical Audit

The application migration runner is implemented in [`apps/api/src/database/migrate.ts`](file:///d:/Work/2026/techsprout-main/apps/api/src/database/migrate.ts):

```typescript
// Excerpt from apps/api/src/database/migrate.ts
export async function runMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  try {
    const migrationsFolder = fs.existsSync(localMigrations) ? localMigrations : srcMigrations;
    await migrate(db, { migrationsFolder });
  } catch (error) {
    process.exit(1);
  } finally {
    await pool.end();
  }
}
```

### Key Technical Properties:

- **Transaction Isolation:** Drizzle ORM's migrator executes individual migration files within atomic transactions (`BEGIN ... COMMIT`). If any statement within a migration file fails, the entire transaction for that file is rolled back.
- **Ledger Tracking:** Migration state is recorded in the PostgreSQL table `__drizzle_migrations` (columns: `id`, `hash`, `created_at`). Drizzle compares disk migration files listed in `meta/_journal.json` against `__drizzle_migrations` and applies only unexecuted entries in ascending journal order.
- **Failure Exit Status:** Any unhandled DDL failure triggers the `catch` block, which logs the error stack and terminates the process with exit code `1` (`process.exit(1)`).
- **Resource Cleanup:** The `finally` block explicitly invokes `await pool.end()`, preventing orphaned or leaked database connections.

---

## 3. Explicit Production Preflight & Release Sequencing

Simply removing the migration command from `render.yaml` creates a hazard if new code is deployed before the underlying database schema has been migrated to support it. To avoid running the application against an incompatible schema, all future production deployments must adhere to the following 6-step release sequencing:

```
[ Step 1: Pre-Release Backup ]
              │
              ▼
[ Step 2: Database Identity & Ledger Audit ]
              │
              ▼
[ Step 3: Out-of-Band Migration Execution ]
              │
              ▼
[ Step 4: Post-Migration Ledger Verification ]
              │
              ▼
[ Step 5: Web API Service Deployment ]
              │
              ▼
[ Step 6: Post-Deployment Smoke Test & Health Check ]
```

---

### Step 1: Database Pre-Deployment Snapshot / Backup

Before executing any DDL on production:

1. Access the Render Dashboard $\rightarrow$ PostgreSQL Service (`techsprout-postgres`).
2. Trigger an on-demand manual snapshot / database backup.
3. Verify that the backup status is marked `COMPLETED` and note the backup timestamp.
4. If CLI access is available, verify export capability:
   ```bash
   pg_dump -Fc -v -d "$DATABASE_URL" -f "techsprout_backup_pre_deploy_$(date +%Y%m%d_%H%M%S).dump"
   ```

---

### Step 2: Target Database Identity & Ledger Preflight

To prevent accidental execution against the wrong environment (e.g., Staging vs. Production), verify database identity:

1. **Verify Database Identity:**

   ```sql
   SELECT current_database(), current_user, inet_server_addr(), version();
   ```

   - Must confirm `current_database()` is `techsprout`.
   - Must confirm `current_user` is `techsprout`.
   - Host must match the production Oregon VPC cluster.

2. **Inspect Applied Migration Ledger:**
   Query the Drizzle migration table to inspect all previously applied migrations:

   ```sql
   SELECT id, hash, to_timestamp(created_at / 1000) AS applied_at
   FROM __drizzle_migrations
   ORDER BY created_at ASC;
   ```

3. **Compare Against Codebase Journal:**
   Inspect [`apps/api/src/database/migrations/meta/_journal.json`](file:///d:/Work/2026/techsprout-main/apps/api/src/database/migrations/meta/_journal.json):
   - Confirm which migrations are already recorded in `__drizzle_migrations`.
   - Identify the exact pending migrations.
   - Verify that all pending migrations are backward-compatible with the currently running API version (e.g., purely additive columns, nullable fields, or secondary indexes).

---

### Step 3: Out-of-Band Migration Execution

Execute migrations in an isolated, one-off process prior to promoting the API web service:

- **Method A: Render One-Off Task (Recommended)**
  Run a one-off task in the Render private network environment using the production image:

  ```bash
  node apps/api/dist/database/migrate.js
  ```

  _(Or via pnpm: `pnpm --filter @techsprout/api db:migrate:prod`)_

- **Method B: Secure Bastion / Controlled Operator Session**
  With authenticated `DATABASE_URL` set in an isolated session:
  ```bash
  pnpm --filter @techsprout/api db:migrate:prod
  ```

---

### Step 4: Post-Migration Ledger Verification

Confirm that the migration succeeded and the ledger was updated:

```sql
SELECT id, hash, to_timestamp(created_at / 1000) AS applied_at
FROM __drizzle_migrations
ORDER BY created_at DESC
LIMIT 5;
```

Verify that:

- The newly applied migration entry matches the `when` timestamp and file tag in `_journal.json`.
- The number of applied rows matches the total entries in `_journal.json`.

---

### Step 5: Web API Service Deployment

Once the schema is verified and compatible:

1. Promote the code to `main` and trigger deployment of web service `techsprout-api`.
2. The web service executes its pure startup command:
   ```bash
   node apps/api/dist/main.js
   ```
3. The API boots immediately with zero migration or seeding overhead.

---

### Step 6: Health Check & Smoke Verification

1. Verify system health probe:
   ```bash
   curl -s https://techsprout-api.onrender.com/api/v1/health | jq
   ```

   - Must return HTTP `200 OK`.
   - `services.database` must be `"up"`.
   - `services.redis` must be `"up"`.
2. Verify readiness probe:
   ```bash
   curl -s https://techsprout-api.onrender.com/api/v1/health/ready | jq
   # Expected: { "ready": true }
   ```
3. Conduct smoke testing against critical platform routes (course catalog, authentication, user dashboard).

---

## 4. Environment-Specific Seeding Matrix

| Environment           | Seeding Behavior                                          | Justification                                                                         |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Local Development** | `pnpm --filter @techsprout/api db:seed` (Manual / Opt-in) | Developers populate mock accounts and courses as needed.                              |
| **Isolated Staging**  | Automated via `render.staging.yaml` `startCommand`        | Ephemeral pre-production testbed requires fresh QA fixtures.                          |
| **Production**        | **STRICTLY PROHIBITED**                                   | Immutable user data, production catalogs, and financial ledgers must never be seeded. |

---

## 5. Rollback & Emergency Contingency

If a deployment encounters issues after migration:

1. **Additive Schema Guarantee:** All production migrations must be additive (`ADD COLUMN ... NULL`, `CREATE INDEX IF NOT EXISTS`). If an API rollback is necessary, previous API versions remain fully compatible with the updated schema.
2. **Database Snapshot Restore:** If destructive corruption occurs, restore the snapshot captured in Step 1 through the Render PostgreSQL Dashboard.
