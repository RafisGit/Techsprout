# TechSprout — P5 Remote Staging Remediation Report

**Date**: 2026-10-05  
**Branch**: `feat/p1-foundation-security`  
**Corrective Commit**: `142866cdb900ba763597caff4ef4e9c43e858189`  
**Status**: **REMOTE STAGING BLOCKED**

---

## 1. Defect 1 — Callback Redirect Origin

### Problem
In multi-environment deployments, Render configures `WEB_ORIGIN` with comma-separated origins (e.g., `https://techsprout-frthqjqb8-tech-sprout.vercel.app,https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`).
Payment callback handlers in `payments.controller.ts` constructed redirects using:
```typescript
`${env.WEB_ORIGIN}/orders/...`
```
This produced malformed URLs such as:
`https://techsprout-frthqjqb8-tech-sprout.vercel.app,https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app/orders/unknown/failure`
which browsers fail to resolve.

### Remediation
1. Introduced a dedicated environment variable: `WEB_PUBLIC_ORIGIN`.
   - **Purpose**: Canonical public frontend origin used exclusively for browser redirects.
   - **Default**: `http://localhost:3000` (development/test).
   - **Production Requirement**: Strictly validated in `env.config.ts` via Zod `superRefine` — rejects commas and enforces presence in production. Normalizes trailing slashes.
2. Updated configuration files:
   - `apps/api/src/config/env.config.ts`: Added `WEB_PUBLIC_ORIGIN` schema, single-origin check, and production requirement.
   - `.env.example` and `apps/api/.env.example`: Added placeholders and documentation for `WEB_PUBLIC_ORIGIN`.
   - `render.yaml`: Configured `WEB_PUBLIC_ORIGIN: https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`.
3. Updated browser redirects in `apps/api/src/modules/payments/payments.controller.ts`:
   - Success redirect: `${env.WEB_PUBLIC_ORIGIN}/orders/${result.order.id}/success`
   - Failure redirect: `${env.WEB_PUBLIC_ORIGIN}/orders/${result.orderId}/failure?reason=...`
   - Cancellation redirect: `${env.WEB_PUBLIC_ORIGIN}/orders/${result.orderId}/cancelled`
   - Invalid callback fallbacks: `${env.WEB_PUBLIC_ORIGIN}/orders/unknown/failure` and `${env.WEB_PUBLIC_ORIGIN}/orders/unknown/cancelled`
4. Audited all `WEB_ORIGIN` usages:
   - CORS / CSP whitelist: preserved `WEB_ORIGIN` (supports comma-separated origins).
   - Zero-payable bypass in `payments.service.ts`: updated to `env.WEB_PUBLIC_ORIGIN`.

---

## 2. Defect 2 — Failed Payment Initiation Order State

### Problem
In `PaymentsService.initiatePayment`, the order was transitioned to `PAYMENT_PROCESSING` prior to invoking the SSLCommerz API. If SSLCommerz returned an error (HTTP network failure or rejected session like `Store Credential Error Or Store is De-active`), the payment record was marked `FAILED` but the order remained stuck in `PAYMENT_PROCESSING`.
Because `initiatePayment` checks `order.status !== 'PENDING'`, students could not retry payment for that order.

### Remediation
1. Implemented transactional failure recovery helper `recoverFromFailedInitiation` in `PaymentsService`:
   - Payment attempt status marked `FAILED`.
   - Sanitized gateway response recorded without sensitive credentials (`passwd`, `password`, `store_id`, `secret`, `token`, `cvv`).
   - If no other live payment attempt exists (`INITIATED` or `VALIDATED`), the order status safely rolls back from `PAYMENT_PROCESSING` to `PENDING` (the existing retryable state).
2. Lifecycle guarantees preserved:
   - No new order states introduced (strictly using `PENDING`).
   - Coupon reservation is preserved in `RESERVED` status and remains tied to the pending order until normal expiry or cancellation occurs.
   - No invoice is generated.
   - No course enrollment is created.
   - Order cannot be marked `PAID`.
   - Successful payment flow (`initiateSession` returning `status: 'SUCCESS'`) is completely unaffected and leaves order in `PAYMENT_PROCESSING`.

---

## 3. Defect 3 — BDT Display Formatting

### Problem
Frontend course cards and tables rendered prices as `$1000.00 BDT`, displaying the USD dollar sign alongside the BDT currency code.

### Remediation
1. Created shared frontend utility `apps/web/src/lib/money.ts`:
   - `formatMoney(amount, currency = 'BDT')`: Renders standard formatted string (e.g., `BDT 1,000.00`).
   - `formatMinorUnits(minor, currency = 'BDT')`: Converts minor units (poisha/cents) to formatted string (e.g., `BDT 1,000.00`).
   - Never outputs `$` for BDT.
2. Audited and updated P5 components:
   - `apps/web/src/components/cards/CourseCard.tsx`: Uses `formatMoney(course.price, course.currency || 'BDT')`.
   - `apps/web/src/app/courses/[slug]/page.tsx`: Uses `formatMoney(course.price, currency)`.
   - `apps/web/src/app/checkout/[slug]/page.tsx`: Uses `formatMinorUnits(...)` for subtotal, discount, payable, and coupon savings.
   - `apps/web/src/app/orders/[orderId]/success/page.tsx`: Uses `formatMinorUnits(...)`.
   - `apps/web/src/app/orders/[orderId]/failure/page.tsx`: Uses `formatMinorUnits(...)`.
   - `apps/web/src/app/orders/[orderId]/cancelled/page.tsx`: Uses `formatMinorUnits(...)`.
   - `apps/web/src/app/invoices/[id]/page.tsx`: Uses `formatMinorUnits(...)`.
   - `apps/web/src/app/admin/courses/page.tsx`: Uses `formatMoney(...)`.

---

## 4. Files Changed

| File | Change Description |
| :--- | :--- |
| `apps/api/src/config/env.config.ts` | Added `WEB_PUBLIC_ORIGIN` schema, comma prohibition, production enforcement, and trailing slash normalization |
| `render.yaml` | Added `WEB_PUBLIC_ORIGIN: https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app` |
| `.env.example` | Documented `WEB_PUBLIC_ORIGIN` |
| `apps/api/.env.example` | Documented `WEB_PUBLIC_ORIGIN` |
| `apps/api/src/modules/payments/payments.controller.ts` | Switched callback redirects from `env.WEB_ORIGIN` to `env.WEB_PUBLIC_ORIGIN` |
| `apps/api/src/modules/payments/payments.service.ts` | Added `recoverFromFailedInitiation` for order rollback to `PENDING` upon gateway failure |
| `apps/api/src/test/payment-engine.spec.ts` | Added 8 regression tests covering redirect origin, comma exclusion, and initiation failure recovery |
| `apps/web/src/lib/money.ts` | Created canonical BDT money formatting helpers (`formatMoney`, `formatMinorUnits`) |
| `apps/web/src/components/cards/CourseCard.tsx` | Replaced `$price BDT` formatting with `formatMoney` |
| `apps/web/src/app/courses/[slug]/page.tsx` | Replaced `$price BDT` formatting with `formatMoney` |
| `apps/web/src/app/checkout/[slug]/page.tsx` | Replaced raw string formatting with `formatMinorUnits` |
| `apps/web/src/app/invoices/[id]/page.tsx` | Replaced raw string formatting with `formatMinorUnits` |
| `apps/web/src/app/orders/[orderId]/success/page.tsx` | Replaced raw string formatting with `formatMinorUnits` |
| `apps/web/src/app/orders/[orderId]/failure/page.tsx` | Replaced raw string formatting with `formatMinorUnits` |
| `apps/web/src/app/orders/[orderId]/cancelled/page.tsx` | Replaced raw string formatting with `formatMinorUnits` |
| `apps/web/src/app/admin/courses/page.tsx` | Replaced `$price BDT` formatting with `formatMoney` |
| `apps/web/src/__tests__/bdt-formatting.spec.ts` | Added 4 unit tests verifying BDT formatting and absence of `$` |

---

## 5. Tests Added

### API Regression Suite (`apps/api/src/test/payment-engine.spec.ts`)
- `10.1.1`: Success redirect uses exactly `WEB_PUBLIC_ORIGIN` without commas.
- `10.1.2`: Failure redirect uses exactly `WEB_PUBLIC_ORIGIN` (both valid and invalid payloads).
- `10.1.3`: Cancellation redirect uses exactly `WEB_PUBLIC_ORIGIN` (both valid and invalid payloads).
- `10.1.4`: Comma-separated `WEB_ORIGIN` never appears in any redirect `Location` header.
- `10.1.5`: `envSchema` rejects comma-separated `WEB_PUBLIC_ORIGIN` and requires it in production.
- `10.2.1`: Explicit gateway rejection marks payment `FAILED`, returns order to `PENDING`, and leaves zero invoices, enrollments, or paid states.
- `10.2.2`: Network transport failure leaves a consistent retryable `PENDING` state and subsequent retry succeeds.
- `10.2.3`: Successful initiation leaves order in `PAYMENT_PROCESSING` and payment in `INITIATED`.

### Web Regression Suite (`apps/web/src/__tests__/bdt-formatting.spec.ts`)
- `10`: BDT values never render with a `$` symbol across `formatMoney`, `formatMinorUnits`, and `formatBDT`.
- `11`: Example output is formatted as `BDT 1,000.00`.
- Missing / invalid values safely default to `BDT 0.00`.
- Large numbers properly include thousands separators (e.g., `BDT 125,000.00`).

---

## 6. Full Test Count

| Package | Passed | Failed | Total Tests | Test Files | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `@techsprout/api` | 762 | 0 | 762 | 24 | **PASS** |
| `@techsprout/web` | 196 | 0 | 196 | 8 | **PASS** |
| **Combined** | **958** | **0** | **958** | **32** | **PASS** |

*(Previous baseline: 946 / 946 tests. Net increase: +12 tests).*

---

## 7. Build, Typecheck & Lint Results

- `pnpm --filter @techsprout/contracts build`: **0 errors**
- `pnpm --filter @techsprout/api typecheck`: **0 errors**
- `pnpm lint`: **0 errors, 0 warnings**
- `pnpm build:api`: **0 errors (compiled successfully to `dist/`)**
- `pnpm build:web`: **0 errors (compiled Next.js production build)**

---

## 8. Commit & Push Result

- **Commit Hash**: `142866cdb900ba763597caff4ef4e9c43e858189`
- **Commit Message**: `fix(platform): harden remote payment redirects and failure recovery`
- **Git Push**:
  ```text
  bf078d0..142866c  feat/p1-foundation-security -> feat/p1-foundation-security
  ```
- **Ancestry**: Direct child of `bf078d0`, preserving commit `54924e2868694ffea02dfcf83b6cd31b23fdcb31`. No force push used.

---

## 9. Render Deployed Commit

- **Render Service**: `techsprout-api`
- **Deployed Commit**: `142866cdb900ba763597caff4ef4e9c43e858189`
- **Deployment Status**: Live and serving requests.

---

## 10. Remote API Verification

Live checks executed against `https://techsprout-api.onrender.com`:

1. `GET /api/v1/health`  
   **Status**: `200 OK`  
   ```json
   {
     "status": "ok",
     "timestamp": "2026-10-05T03:27:52.999Z",
     "uptime": 386,
     "environment": "production",
     "services": {
       "database": "up",
       "redis": "up"
     }
   }
   ```

2. `GET /api/v1/courses`  
   **Status**: `200 OK`  
   Returned 11 published courses.

3. Live Callback Redirect Test (Defect 1 verification):
   - `POST /api/v1/payments/sslcommerz/cancel`  
     -> `Status: 302`  
     -> `Location: https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app/orders/unknown/cancelled`
   - `POST /api/v1/payments/sslcommerz/fail`  
     -> `Status: 302`  
     -> `Location: https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app/orders/unknown/failure?reason=Invalid%20callback%20payload`
   - `POST /api/v1/payments/sslcommerz/success`  
     -> `Status: 302`  
     -> `Location: https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app/orders/unknown/failure?reason=Invalid%20callback%20payload`

   **Verification Result**: Zero comma-separated strings. Redirect URLs cleanly and exclusively use `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`.

---

## 11. Remote SSLCommerz Result & Failure Recovery Verification

Live test executed against `https://techsprout-api.onrender.com`:
1. Authenticated as student (`student@techsprout.edu`).
2. Created order for paid course (`8a9b18f7-9ff6-47fc-a0e8-2909e7e81b85`):
   - Order ID: `069b701c-7bcd-4bf4-a7ab-693750ea5219`
   - Initial Status: `PENDING`
3. Executed `POST /api/v1/payments/initiate` with `orderId: 069b701c-7bcd-4bf4-a7ab-693750ea5219`:
   - **HTTP Status**: `502 Bad Gateway`
   - **Response Payload**:
     ```json
     {
       "success": false,
       "message": "Payment gateway session rejected: Store Credential Error Or Store is De-active",
       "errorCode": "GATEWAY_ERROR",
       "statusCode": 502,
       "timestamp": "2026-10-05T03:28:25.979Z",
       "requestId": "req_2a4d5d7adbbe4b85"
     }
     ```
4. Checked order status following failed initiation (Defect 2 verification):
   - `GET /api/v1/orders/069b701c-7bcd-4bf4-a7ab-693750ea5219`
   - **Order Status**: `PENDING`

**Verification Result**:
- The remote Render API confirmed Defect 2 remediation in production.
- Rather than leaving the order trapped in `PAYMENT_PROCESSING`, the failed initiation cleanly rolled the order back to `PENDING`.
- The order is immediately retryable by the student.

---

## 12. Remaining Blockers

1. **Remote SSLCommerz Store Credentials Inactive**:
   - The remote Render environment variable `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` is currently configured with store credentials that SSLCommerz rejects with `Store Credential Error Or Store is De-active`.
   - Active SSLCommerz sandbox credentials must be provided in the Render service environment settings.
   - Per verification requirements, `REMOTE STAGING VERIFIED` cannot be claimed until the remote host successfully establishes an active SSLCommerz session.

---

## 13. Final Status

**REMOTE STAGING BLOCKED**
