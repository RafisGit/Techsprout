# TechSprout P5 Final Release Audit

**Release Milestone:** P5 Final Release Audit (Payment, Finance, Coupon, Invoice, Refund, Checkout & Reconciliation)  
**Repository:** `RafisGit/Techsprout`  
**Branch:** `feat/p1-foundation-security`  
**Execution Date:** October 4, 2026  
**Scope:** Comprehensive verification of P5.1 through P5.4.6 without feature expansion (P5.5 deferred).

---

## 1. P5 Scope Completed

The complete Phase 5 financial and e-commerce subsystem encompasses seven deeply integrated sub-modules and core workflows:

1. **P5.1 Database Foundation & Schema Integrity:** PostgreSQL tables, schemas, relations, and row constraints for `orders`, `order_items`, `payments`, `invoices`, `refunds`, `coupons`, and `coupon_redemptions`.
2. **P5.2 Financial Invariants & Server State Machine:** Strict integer minor-unit (`cents` / `poisha`) currency math, singleton state machines for orders, payments, and refunds, and transaction isolation (`SELECT FOR UPDATE`).
3. **P5.3 SSLCommerz Gateway Protocol & Fulfillment Engine:** Server-to-server Order Validation protocol, IPN and callback replay handling, zero-payable bypass for 100% discount coupons, automated enrollment provisioning, and immutable invoice snapshot generation.
4. **P5.4.1 Invoices & Billing Engine:** Immutable historical customer and pricing snapshots, sequence numbering (`TSP-INV-YYYY-XXXXXX`), student self-service invoice inspection, and admin invoice ledger.
5. **P5.4.2 Refunds & Settlement Clearing:** Administrative two-phase refund workflow (Initiation $\rightarrow$ Query settlement), singleton refund lifecycle, relation-scoped atomic domain reversals (`PAID` $\rightarrow$ `REFUNDED`), and active certificate/enrollment revocation.
6. **P5.4.3 Coupons & Promotion Engine:** Percentage and fixed discounts, coupon validity windows, minimum purchase thresholds, maximum discount caps, global usage limits, per-user limits, concurrency-safe row reservation, and authoritative checkout recalculation.
7. **P5.4.4 Student Checkout & Purchase Experience:** Buy Now checkout flow, dynamic pricing display in BDT, coupon validation and preview, idempotent polling, and SSLCommerz hosted gateway redirection.
8. **P5.4.5 Admin Finance Dashboard & Reconciliation Engine:** Server-side financial aggregation metrics (Gross Volume, Total Discounts, Confirmed Refunds, Net Revenue), discrepancy scanner (`GATEWAY_VALIDATED_INTERNAL_PENDING`, `PAID_WITHOUT_ENROLLMENT`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`), and relation-scoped safe auto-resolution.
9. **P5.4.6 Integration QA & System Hardening:** End-to-end integration test coverage, concurrency stress testing, tamper testing, security perimeter audit, and credential sanitization.

---

## 2. Final Test Baseline

The automated testing gate was executed across the entire monorepo. All test suites pass with zero failures, zero warnings, and zero type errors.

### Complete Monorepo Test Results

| Package / Workspace | Test Files | Total Tests | Status | Execution Time |
| :--- | :---: | :---: | :---: | :---: |
| `@techsprout/api` | 24 | 754 | **PASS** | ~20.5s |
| `@techsprout/web` | 7 | 192 | **PASS** | ~0.7s |
| **Combined Monorepo Total** | **31** | **946** | **PASS** | **100% Passed (0 Failures)** |

*Baseline progression: 943 $\rightarrow$ 946 tests (3 new regression test suites added during release audit).*

### Test Suite Distribution

- **Student Checkout & Order Creation:** 42 tests
- **Coupon Validation, Concurrency & Authority:** 37 tests
- **Payment Engine & SSLCommerz Integration:** 48 tests
- **Invoice Snapshot & Immutability:** 30 tests
- **Refund Lifecycle & Scoped Finalization:** 49 tests
- **Reconciliation Engine & Discrepancy Scanners:** 28 tests (+2 regression tests)
- **Admin Finance Dashboard & Metrics:** 35 tests (+1 regression test)
- **Admin RBAC & Credential Security:** 25 tests
- **Frontend Checkout Flow:** 21 tests
- **Frontend Admin Finance & Coupons UI:** 34 tests
- **Catalog, Quizzes, Certificates & Foundations:** 625 tests

---

## 3. Endpoint Consistency

An exhaustive audit of controllers, contracts, frontend clients, and documentation was conducted regarding public coupon preview and validation:

| Resource | Path | Method | Auth Level | Purpose |
| :--- | :--- | :---: | :---: | :--- |
| **Authoritative Endpoint** | `/api/v1/coupons/validate` | `POST` | Public / Optional JWT | Read-only coupon validation and discount preview |
| **Controller** | `CouponsController.validateCoupon` | `POST /validate` | Public | Validates applicability, calculating discount without mutating DB |
| **Contracts** | `validateCouponSchema` | Schema | Shared | Validates `{ code: string, courseId: string }` |
| **Frontend API Client** | `apps/web/src/lib/api/orders.ts` | Axios `post` | Client | Dispatches to `/api/v1/coupons/validate` |
| **Frontend Checkout UI** | `apps/web/src/app/checkout/[slug]/page.tsx` | UI Hook | Client | Invokes `validateCoupon` for preview |

**Audit Findings & Corrections:**
- The authoritative public endpoint is `POST /api/v1/coupons/validate`.
- No controller or route ever implemented `/api/v1/coupons/preview`.
- Two stale references in `docs/qa/p5.4.6-finalization.md` (lines 40 and 102) incorrectly mentioned `/api/v1/coupons/preview`. Both documentation references were corrected to point to `POST /api/v1/coupons/validate`.
- Zero duplicate endpoints were introduced.

---

## 4. Payment Authority

The architecture enforces strict server authority over all payment transitions:

1. **Browser Untrusted Return:**
   - Query parameters passed to `/orders/:orderId/success` or `/orders/:orderId/failure` (e.g., `status=VALID`, `val_id=...`, `tran_id=...`) are treated as untrusted client navigation hints.
   - Browser navigation *never* transitions orders to `PAID`, activates enrollments, or issues invoices.
2. **Server-to-Server Validation:**
   - Order transition to `PAID` requires authoritative server-side callback processing (`POST /api/v1/payments/sslcommerz/success`).
   - The backend validates the payment directly against SSLCommerz Order Validation API (`/validator/api/validationserverAPI.php`) using store credentials before updating database rows.
3. **Amount & Currency Invariants:**
   - Persisted order `payableCents` and `currency` are compared against provider-reported values.
   - Mismatched amounts or currencies abort fulfillment immediately (`PAYMENT_AMOUNT_MISMATCH` / `PAYMENT_CURRENCY_MISMATCH`).
4. **Boundary Enforcements:**
   - 0 BDT: Bypasses gateway via internal zero-payable fulfillment.
   - 1 – 999 Poisha (BDT 0.01 – 9.99): Rejected pre-gateway (`PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM`).
   - 1,000 – 50,000,000 Poisha (BDT 10.00 – 500,000.00): Permitted for gateway session creation.
   - > 50,000,000 Poisha: Rejected pre-gateway (`PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM`).

---

## 5. Coupon Authority

Coupon redemption and pricing rules strictly reside on the server:

1. **Read-Only Validation:**
   - `POST /api/v1/coupons/validate` only queries the database; it creates 0 rows in `orders` or `coupon_redemptions` and increments 0 counters.
2. **Authoritative Order Creation Recalculation:**
   - `POST /api/v1/orders` ignores any client-supplied prices, discounts, or totals (enforced via Zod `.strict()` schema rejection).
   - Order creation fetches current course price from `courses.price`, re-evaluates coupon eligibility, recalculates discount, and derives `payableCents = subtotalCents - discountCents`.
3. **Concurrency-Safe Usage Locking:**
   - Global usage limits are locked under row-level `SELECT ... FOR UPDATE` on the `coupons` table.
   - Parallel order creations exceeding `usageLimit` are rejected with `COUPON_USAGE_LIMIT_REACHED`.
4. **Per-User Limits:**
   - Verified against existing `RESERVED` and `CONSUMED` redemptions.
5. **Zero-Payable Flow:**
   - Orders with 100% discount (`payableCents = 0`) bypass the payment gateway, fulfill internally, consume coupon reservations, issue tax invoices, and activate student enrollments immediately.

---

## 6. Invoice Integrity

Invoices serve as legally binding, immutable financial records:

1. **Frozen Historical Snapshots:**
   - Invoices capture: `studentName`, `studentEmail`, `studentPhone`, `courseTitle`, `subtotalCents`, `discountCents`, `payableCents`, `currency`, `paymentMethod`, and `bankTranId`.
   - Subsequent modifications to student profile (`users`), course catalog pricing or title (`courses`), or coupon rules (`coupons`) have zero effect on existing invoice records.
2. **Unique Invariants:**
   - `uniqueIndex('invoices_invoice_number_uq')` ensures unique invoice numbers.
   - `uniqueIndex('invoices_order_id_uq')` strictly enforces a 1:1 relationship between order and invoice.
3. **Lifecycle Immutability:**
   - Only `status` transitions from `PAID` $\rightarrow$ `REFUNDED` upon confirmed refund execution. Historical financial values are never overwritten or deleted.

---

## 7. Refund Integrity

Refund operations follow an asynchronous, safe two-phase protocol:

1. **Singleton Refund Constraint:**
   - Database enforces `uniqueIndex('refunds_order_id_uq')`. Exactly one refund record can exist per order.
2. **Two-Phase Lifecycle:**
   - **Phase 1 (Initiation):** Admin submits `POST /api/v1/admin/orders/:id/refund`. On gateway acceptance, refund status becomes `PENDING` with `providerRefundRef`. Order remains `PAID`, enrollment remains `ACTIVE`, and certificate remains `ACTIVE`.
   - **Phase 2 (Query Settlement):** Admin or polling submits `POST /api/v1/admin/refunds/:id/query`. Only when gateway confirms `status === 'refunded'` does the system execute atomic finalization.
3. **Ambiguous Initiation Protection:**
   - If gateway initiation times out or network drops, status remains `PENDING` with `providerRefundRef: null`.
   - Further initiation attempts are blocked (`REFUND_MANUAL_REVIEW_REQUIRED`). No automatic second refund can be dispatched.
4. **Scoped Domain Finalization:**
   - SQL mutations target *only* the specific order, invoice, enrollment, and certificate:
     - `UPDATE orders SET status = 'REFUNDED' WHERE id = :orderId`
     - `UPDATE invoices SET status = 'REFUNDED' WHERE id = :invoiceId`
     - `UPDATE enrollments SET status = 'CANCELLED' WHERE id = :enrollmentId`
     - `UPDATE certificates SET status = 'REVOKED' WHERE id = :certificateId`
   - Regression test in `p5-hardening.spec.ts` (test 6.3) proves that when a student has multiple active enrollments and certificates across multiple courses, refunding Order A cancels only Enrollment A and Certificate A; Enrollment B and Certificate B remain 100% active.

---

## 8. Reconciliation Safety

The Finance Reconciliation engine (`FinanceService.scanReconciliation` and `executeSafeAutoResolve`) was audited and hardened against unintended auto-fulfillment:

1. **Authoritative Evidence Requirements for `GATEWAY_VALIDATED_INTERNAL_PENDING`:**
   Auto-resolve is permitted **only** when all of the following conditions are simultaneously verified:
   - Gateway payment status is `VALIDATED`.
   - Non-null provider transaction identity exists (`valId` and `bankTranId`).
   - Exact amount match (`validatedPayment.amountCents === order.payableCents`).
   - Exact currency match (`validatedPayment.currency === order.currency`).
   - Order status is `PENDING` or `PAYMENT_PROCESSING` (rejects `CANCELLED` and `REFUNDED`).
   - Exact course/order-item relationship exists (`items.length === 1` and course exists in `courses` table).
   - No conflicting active enrollment exists for that student and course.
   - No conflicting existing invoice exists for that order.
2. **Amount Match Alone Is Never Sufficient:**
   - If `bankTranId` or `valId` is missing, auto-resolve is disabled (`autoResolvable: false`).
   - If order items are missing or ambiguous (> 1), auto-resolve is disabled (`autoResolvable: false`).
   - If an active enrollment or invoice already exists, auto-resolve is disabled (`autoResolvable: false`).
3. **Safe Auto-Repair for `PAID_WITHOUT_ENROLLMENT`:**
   - Verifies single order item, valid referenced course, and positive payment evidence.
   - Derives enrollment strictly for `order.studentId` $\rightarrow$ `item.courseId`.
   - Regression test `p5-hardening.spec.ts` (test 9.4) proves that reconciliation for Order X enrolls student *only* in Course X and never auto-enrolls unrelated Course Y.

---

## 9. Finance Integrity

Database query logic for financial aggregations (`FinanceService.getFinanceSummary`) was verified against mixed datasets:

```sql
-- Gross Volume & Discounts (Finalized Orders Only)
SELECT COALESCE(SUM("payable_cents"), 0) AS "grossVolume",
       COALESCE(SUM("discount_cents"), 0) AS "totalDiscounts"
FROM "orders"
WHERE "status" IN ('PAID', 'REFUNDED');

-- Confirmed Refunds (PROCESSED Status Only)
SELECT COALESCE(SUM("amount_cents"), 0) AS "totalRefunds"
FROM "refunds"
WHERE "status" = 'PROCESSED';
```

- **Gross Volume:** Sum of payable cents across `PAID` and `REFUNDED` orders. Unfinalized orders (`PENDING`, `PAYMENT_PROCESSING`, `FAILED`, `CANCELLED`) are strictly excluded.
- **Total Discounts:** Sum of discount cents across finalized orders.
- **Confirmed Refunds:** Sum of amount cents for `PROCESSED` refunds only. Unconfirmed refunds (`PENDING`, `FAILED`) are excluded from refund totals.
- **Net Revenue:** Derived strictly as `Gross Volume - Confirmed Refunds`.
- **Regression Verification:** Test 8.2 verified mixed datasets containing `PAID`, `REFUNDED`, `PENDING`, `FAILED`, `CANCELLED`, zero-payable, discounted, and `PROCESSED`/`PENDING`/`FAILED` refunds with exact delta reconciliation and zero double-counting.

---

## 10. RBAC / Security Perimeter

All administrative financial and promotion endpoints are guarded by NestJS guards:

- `RolesGuard` requiring `ADMIN` role.
- Unauthenticated requests return HTTP 401 (`UNAUTHORIZED`).
- Student requests return HTTP 403 (`FORBIDDEN`).
- Audited endpoints:
  - `GET /api/v1/admin/finance/summary`
  - `GET /api/v1/admin/finance/orders`
  - `GET /api/v1/admin/reconciliation`
  - `POST /api/v1/admin/reconciliation/scan`
  - `GET /api/v1/admin/refunds`
  - `POST /api/v1/admin/orders/:id/refund`
  - `POST /api/v1/admin/refunds/:id/query`
  - `GET /api/v1/admin/coupons`
  - `POST /api/v1/admin/coupons`
  - `GET /api/v1/admin/invoices`

---

## 11. Secret Audit

Source code, environment configurations, and serialized responses were audited for credential leakage:

1. **Zero Secret Exposure in Client Bundles:**
   - `apps/web` contains no occurrences of `SSLCOMMERZ_STORE_PASSWORD`, gateway passwords, or private keys.
   - Frontend Next.js build verified: store credentials cannot leak to browser artifacts.
2. **Zero Secret Exposure in API Responses:**
   - DTOs and API responses sanitize raw gateway data. Gateway passwords and secret keys are never serialized.
3. **Audit Trail Sanitization:**
   - `audit_logs.metadata` serializes only non-sensitive transactional identifiers (`merchantTranId`, `valId`, `amountCents`, `status`).

---

## 12. Database Integrity

Schema constraints and relationships across PostgreSQL tables:

| Table | Constraint | Purpose |
| :--- | :--- | :--- |
| `refunds` | `uniqueIndex('refunds_order_id_uq')` | Singleton refund per order |
| `refunds` | `uniqueIndex('refunds_refund_number_uq')` | Unique refund reference |
| `invoices` | `uniqueIndex('invoices_order_id_uq')` | Exact 1:1 order-invoice relationship |
| `invoices` | `uniqueIndex('invoices_invoice_number_uq')` | Unique invoice sequence |
| `coupon_redemptions` | `uniqueIndex('coupon_redemptions_order_id_uq')` | Singleton redemption per order |
| `certificates` | `uniqueIndex('certificates_active_enrollment_uq')` | Unique active certificate per enrollment |
| `orders` | `check('orders_payable_lte_subtotal')` | Invariant: payable cannot exceed subtotal |
| `orders` | `references(() => users.id, { onDelete: 'restrict' })` | Prevents deleting student with orders |

*Zero unintended migrations exist.*

---

## 13. Performance Audit

1. **Server-Side Aggregations:** Financial metrics are computed entirely within PostgreSQL via SQL aggregates; no client-side or in-memory array summing of order tables.
2. **Bounded Reconciliation Scans:** `scanReconciliation` defaults to `limit: 50` (configurable), preventing unbounded table scans.
3. **Bounded Polling:** Client success page polling is strictly capped at `MAX_POLL_ATTEMPTS = 12` with 2500ms intervals (max 30 seconds). No infinite polling loops.
4. **List Query Pagination:** Admin list endpoints enforce `limit: z.coerce.number().max(100).default(20)`.

---

## 14. Live-Provider Limitation

> [!WARNING]
> **Provider Testing Limitation Disclosure**  
> All automated test suites and QA validations exclusively utilize `MockSSLCommerzClient` to simulate gateway interactions deterministically in CI/CD and local environments.  
> No live SSLCommerz production or sandbox banking credentials were used, and no live financial transactions across the Bangladesh National Payment Switch (NPSB), Visa, Mastercard, or bKash were conducted.

---

## 15. Defects Found During Audit

1. **Documentation Inconsistency:** `docs/qa/p5.4.6-finalization.md` referenced `POST /api/v1/coupons/preview` instead of the implemented and tested `POST /api/v1/coupons/validate`.
2. **Reconciliation Auto-Resolve Over-Broad Scope:** `scanReconciliation` marked `GATEWAY_VALIDATED_INTERNAL_PENDING` as auto-resolvable based on `valId` and `bankTranId` presence without verifying that an exact single order-item existed, that the referenced course existed, or that no active enrollment/invoice conflict was present.
3. **Refunded Order Handling in Discrepancy Scanner:** Discrepancy scanner lacked explicit classification for `REFUNDED` orders that have validated payments, potentially allowing ambiguity.
4. **Paid-Without-Enrollment Order-Item Scope:** `scanReconciliation` used `.limit(1)` on order items for `PAID_WITHOUT_ENROLLMENT` without rejecting orders with 0 or multiple (ambiguous) order items or non-existent course relationships.
5. **Production Readiness Language:** Document conclusion required qualification to prevent claims of live banking verification.

---

## 16. Defects Fixed During Audit

1. **Fixed Stale Coupon Endpoint References:** Updated lines 40 and 102 in `docs/qa/p5.4.6-finalization.md` to reference `POST /api/v1/coupons/validate`.
2. **Hardened `scanReconciliation` for `GATEWAY_VALIDATED_INTERNAL_PENDING`:** Added checks requiring exact single order item, existing course in `courses`, no active enrollment conflict, and no invoice conflict. If any condition fails, `autoResolvable` is set to `false`.
3. **Hardened `executeSafeAutoResolve`:** Added row-locked re-verification of exact single order item, course existence, and absence of active enrollment / invoice conflicts before committing state changes.
4. **Hardened `PAID_WITHOUT_ENROLLMENT`:** Replaced arbitrary `.limit(1)` with strict check: if `items.length !== 1` or course is missing, auto-repair is disabled (`autoResolvable: false`).
5. **Added Explicit `REFUNDED` Order Scanner Branch:** Flagged as non-auto-resolvable discrepancy requiring manual review.
6. **Added 3 New Comprehensive Regression Tests in `apps/api/src/test/p5-hardening.spec.ts`:**
   - Test 8.2: Mixed dataset metric reconciliation (`PAID`, `REFUNDED`, `PENDING`, `FAILED`, `CANCELLED`, zero-payable, discounted, `PROCESSED`/`PENDING`/`FAILED` refunds).
   - Test 9.4: Reconciliation course scoping (proves unrelated course cannot be auto-enrolled).
   - Test 9.5: Reconciliation ambiguous/missing order item rejection.
7. **Aligned Readiness Disclaimer:** Updated verdict statement in `p5.4.6-finalization.md` and release audit report.

---

## 17. Deferred Items (Out of Scope for P5)

The following items are intentionally out of scope for Phase 5 and deferred to post-P5 milestones:

- P5.5 / Post-P5: Multi-currency exchange rate handling.
- Student self-service refund request portal.
- Partial refund support.
- Recurring subscription billing and installment agreements.
- External accounting ERP ledger integrations.

---

## 18. Final Release Status

### APPLICATION QA STATUS:
**PASSED**  
(946 / 946 automated unit, integration, and E2E tests passing. Monorepo builds, TypeScript typechecks, and ESLint checks pass with 0 errors and 0 warnings.)

### LIVE SSLCommerz VERIFICATION STATUS:
**NOT LIVE-VERIFIED / REQUIRES STAGING VERIFICATION**  
(Application implementation and automated QA complete. Live SSLCommerz verification remains a staging/provider-network validation step.)
