# WP-P8-01 — Subscription Lifecycle Initial Slice

**Status:** Initial domain slice implemented; data-schema migration intentionally pending  
**Branch:** `feat/p8-wp01-subscription-lifecycle`  
**Scope:** Pure lifecycle transition guard and exhaustive transition tests  
**Production impact:** None. No database migration, seed, provider call, or deployment was performed.

## Implemented

The API now has a pure, I/O-free subscription status guard for the proposed statuses:

- `INCOMPLETE`
- `ACTIVE`
- `PAST_DUE`
- `CANCELED`
- `UNPAID`
- `EXPIRED`

Allowed transitions are explicitly enumerated and tested; every unlisted pair, including same-state transitions, is rejected. `EXPIRED` is terminal. `CANCELED` represents cancellation that has become effective under an approved business policy, not merely a cancellation request.

The guard deliberately does not implement payment capture, webhook idempotency, retry scheduling, grace-period timing, refunds, or cancellation effective-date rules.

## Migration sequencing gate

The current `main` migration journal ends at `0009_telemetry_foundation`. The existing `release/p6.3-candidate` branch is divergent from `main` (10 commits ahead, 2 behind) and introduces migrations `0010_monetization_ledger` and `0011_discussions_and_assignments`. Creating a subscription migration on the current main line before the release lineage is reconciled could make the migration order ambiguous or unsafe.

Therefore this initial slice does **not** add subscription tables to the Drizzle schema or change the migration journal. The next implementation step is to reconcile and validate the upstream release lineage, then add the subscription schema and a correctly sequenced additive migration against that resolved base.

## Decision boundaries retained

- Gateway support for server-to-server tokenized recurring charges must be evidence-based; this guard does not assume gateway capability.
- The business rules for cancellation/refunds and retry/grace periods must remain explicit configuration/domain policy, not hidden inside status transitions.
- Subscription records and billing events must be persisted transactionally with provider-event idempotency before enabling paid access.
- No production migration should run until the production database backup/retention and expiry risk has been addressed.
