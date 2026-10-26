# WP-P8-03 — Subscription Renewal Scheduling & Dunning Retries

**Date:** 2026-10-26  
**Status:** Completed (Code & Verification)  
**Branch:** `feat/p8-wp01-subscription-lifecycle`  
**Related Decisions:** DEC-P8-01 (Recurring Payment Capability Gate)  
**Scope:** Automated renewal batch scheduling, distributed idempotency & concurrency locking, fail-closed gate verification, bounded dunning retries, and comprehensive unit/monorepo test verification. Zero production migrations, zero deployments, and zero external payment network debits.

---

## 1. Architectural Summary & Requirements

WP-P8-03 establishes the automated lifecycle engine for subscription renewals and recovery from failed charges:
1. **Deterministic Scheduling:** BullMQ daily scheduled jobs for renewal execution (`0 2 * * *` UTC) and dunning retry processing (`0 6 * * *` UTC).
2. **Durable Idempotency & Concurrency:**
   - Distributed lock key (`buildSubscriptionRenewalLockKey(subscriptionId)`) preventing parallel worker contention and double-billing.
   - Cycle invoice idempotency: returns `IDEMPOTENT_NOOP` if the cycle invoice has already been paid, and reuses existing `PENDING` invoices to avoid duplicate billing records.
3. **Fail-Closed Capability Gate (DEC-P8-01):**
   - Recurring payment execution is disabled by default (`enabled: false, merchantCapabilityVerified: false`).
   - Every path capable of initiating recurring charges calls `assertRecurringPaymentsAvailable(gate)`.
   - When capability is unverified, charges fail closed with `FAILED_GATE_BLOCKED` without invoking provider adapters, and past-period subscriptions transition cleanly to `PAST_DUE`.
4. **Bounded Dunning Retries & Suspension:**
   - Enforces a maximum of 4 retry attempts (`MAX_DUNNING_ATTEMPTS = 4`) and a 7-day grace period (`DUNNING_GRACE_PERIOD_DAYS = 7`).
   - If either the retry limit or grace period is exceeded, the subscription transitions to `UNPAID` (access suspended) and status history is recorded.
   - Successful payment recovery resets `dunningAttempts` to 0, advances billing cycles forward, and returns subscription status to `ACTIVE`.
5. **No Database Migration Required:**
   - WP-P8-03 fully utilizes the existing schema in `apps/api/src/database/schema/subscriptions.ts` (`dunning_attempts`, `last_dunning_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `canceled_at`).

---

## 2. Implemented Components

### 2.1 `SubscriptionBillingService`
- **Location:** `apps/api/src/modules/subscriptions/subscription-billing.service.ts`
- **Core Methods:**
  - `addMonths(date, months)` / `addYears(date, years)`: Deterministic calendar period arithmetic.
  - `processDueRenewals(options)`: Queries active subscriptions within renewal window (`currentPeriodEnd <= now + 24h`) and processes renewals.
  - `processSubscriptionRenewal(subscriptionId, options)`: Single-subscription renewal with distributed lock, row lock (`FOR UPDATE`), cancel-at-period-end handling, invoice deduplication, gate assertion, provider adapter execution, and status transitions.
  - `processDunningRetries(options)`: Queries `PAST_DUE` subscriptions, enforces bounded retry count (<= 4) and grace period (<= 7 days), and attempts recovery or triggers suspension to `UNPAID`.

### 2.2 `SubscriptionBillingWorker`
- **Location:** `apps/api/src/modules/subscriptions/subscription-billing.worker.ts`
- **Queue:** `techsprout-subscription-billing`
- **Schedulers:**
  - `subscription-renewal-daily` (cron `0 2 * * *`)
  - `subscription-dunning-retry` (cron `0 6 * * *`)
- **Lifecycle & Resiliency:**
  - Resilient Redis connection management matching `TelemetryPruningWorker` conventions.
  - Backoff watchdog recovery timer (2s–30s) for non-blocking startup.
  - Concurrency: strictly single-worker concurrency (`concurrency: 1`) to guarantee deterministic batch sequencing.
  - Graceful teardown via `onModuleDestroy()`.

### 2.3 Integration & Health Monitoring
- **Module:** `SubscriptionsModule` (`apps/api/src/modules/subscriptions/subscriptions.module.ts`) registered in `AppModule`.
- **Health Check:** `HealthController` (`apps/api/src/common/health/health.controller.ts`) reports `services.billingWorker` status (`ready`, `degraded`, `disabled`) and execution telemetry.

---

## 3. Verification & Test Evidence

### 3.1 Unit Test Coverage
- `apps/api/src/modules/subscriptions/subscription-billing.service.spec.ts`: 15 tests covering:
  - Interval arithmetic (`addMonths`, `addYears`).
  - Ineligibility checks (`CANCELED`, `EXPIRED`, missing record).
  - Pre-cancellation at period end (`cancelAtPeriodEnd = true` transitions to `CANCELED` without renewal charge).
  - Concurrency and distributed locking (`SKIPPED_LOCKED`, lock release, stale lock recovery).
  - Idempotency deduplication (`IDEMPOTENT_NOOP` on already-paid cycle invoice).
  - Fail-closed gate enforcement (`FAILED_GATE_BLOCKED`, transition to `PAST_DUE` when expired).
  - Successful renewal under verified mock adapter.
  - Dunning retries: attempt tracking, retry limit exhaustion (`PAST_DUE` -> `UNPAID`), grace period expiration (`PAST_DUE` -> `UNPAID`), and payment recovery (`PAST_DUE` -> `ACTIVE`).
- `apps/api/src/modules/subscriptions/subscription-billing.worker.spec.ts`: 7 tests covering:
  - Queue and scheduler naming constants.
  - Job routing (`process-renewals`, `process-dunning`).
  - Unrecognized job handling.
  - BullMQ scheduler registration (`0 2 * * *`, `0 6 * * *`).
  - Health check status transitions (`degraded` -> `ready` -> `disabled`).
  - Ad-hoc trigger methods.

### 3.2 Monorepo Verification
- **Unit & Integration Suite:** 1,336 tests passed across 56 test files (`pnpm test`).
- **TypeScript Typecheck:** `@techsprout/contracts` and `@techsprout/api` typecheck passed with zero errors (`tsc --noEmit`).
- **Production Build:** `@techsprout/contracts` (tsc), `@techsprout/api` (tsc build), and `@techsprout/web` (Next.js 16.2.12 Turbopack production build) compiled cleanly with code 0.

---

## 4. Release Safety & Boundary Compliance

1. **Gate Invariant (DEC-P8-01):** Live automated debits remain disabled by default. No real requests are made to payment gateways.
2. **Draft PR Discipline:** PR #3 (`feat/p8-wp01-subscription-lifecycle`) and PR #4 (`reconcile/p6.3-main`) remain strictly as drafts pending human operator approval.
3. **Database Continuity:** Zero production migrations or seeds applied. The Render PostgreSQL database expiry (~36 hours remaining) remains an operator action.
