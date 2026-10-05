# TechSprout — Vercel P5 End-to-End Verification

**Date**: 2026-10-05 · **Mode**: verification-only (no code, env, DB, or Render changes)

## Environment
- Vercel: `https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app`
- Render: `https://techsprout-api.onrender.com`
- Deployed backend commit: `3847955` (P5 `54924e2` + build fix). `bf078d0` is docs only.
- Health: `status ok`, `environment production`, database up, redis up.

## Method and limitation
The real-browser flow was run partially by the browser subagent before its quota was exhausted (RESOURCE_EXHAUSTED 429, resets in about 2h). It covered the home page, `/courses` and the checkout auth-guard redirect. The remaining steps were verified by direct HTTP calls to Render using the Vercel `Origin` header. This is **not** a full browser E2E. Browser-only items are marked NOT EXECUTED.

## Test Matrix

| Step | Result | Evidence |
|------|--------|----------|
| Courses | PASS | Vercel `/courses` 200 (HSTS preload). `GET /api/v1/courses` 200 with `ACAO` equal to the Vercel origin (no CORS error). 11 courses. Browser rendered course cards with BDT prices. |
| Paid Course | PASS | Seeded courses cost `1000.00 BDT`. Prices are shown in BDT and no USD was observed in the API data. The browser check showed a `$` glyph before "BDT" on `/courses` (cosmetic, see Exact Errors). The detail page and Buy Now click were NOT EXECUTED in a browser. |
| Checkout | PARTIAL / NOT EXECUTED (browser) | Unauthenticated `/checkout/<slug>` redirects to `/login?redirect=...` (verified earlier). Authenticated checkout UI was not rendered because of the quota error. |
| Coupon | PASS (API) | Admin-created `PROMO20` (20%). `POST /api/v1/coupons/validate` returned subtotal 100000, discount 20000, payable 80000 cents. `POST /orders` with the coupon created an order with the same server-computed totals. Note: I created this coupon through the admin API with the seeded admin account, and it is test data on staging. |
| Order Creation | PASS | `POST /api/v1/orders` returned 201, order `e9741216-0a30-4ae6-a864-f7caf54fe41b`, payable 100000 cents, BDT, `PENDING`. The client sent only `courseId`. |
| Payment Initiation | **BLOCKED** | `POST /api/v1/payments/initiate` returned **502** `GATEWAY_ERROR`: "Payment gateway session rejected: Store Credential Error Or Store is De-active". Staging configuration blocker (Render SSLCommerz credentials). |
| SSLCommerz Sandbox | **BLOCKED** | No gateway session could be created, so the hosted sandbox UI was not reached. |
| Callback/IPN | PARTIAL | `POST /sslcommerz/ipn` with empty payload returned 400 (Zod validation, route exists). A forged `success` callback (fake `tran_id`/`val_id`) returned 302 to `/orders/unknown/failure?reason=Payment attempt not found...`, so a forged callback cannot fulfil an order. A real provider callback was NOT EXECUTED (blocked). |
| Server Validation | NOT EXECUTED | Needs a real `val_id` from the gateway. Covered by local live-sandbox verification in the earlier report (`status VALID`). |
| PAID | NOT EXECUTED | The order stays `PAYMENT_PROCESSING`, `invoiceId: null`. |
| Invoice | NOT EXECUTED | No invoice exists. |
| Enrollment | NOT EXECUTED | `GET /api/v1/enrollments` returned 0 items for the student. |
| Failure | PARTIAL | A forged fail callback with an invalid payload redirected to the failure page and created no PAID state. A real sandbox failure was not run (blocked). |
| Duplicate Callback | NOT EXECUTED | Needs a real callback. |
| Finance | PASS (API) | Admin `GET /admin/finance/summary` 200 with BDT metrics. A student gets 403. The finance UI (`/admin/finance`) was not opened in a browser. Orders were not PAID, so no revenue was expected. |
| Refund | NOT EXECUTED | No PAID order. |
| Security | PASS (partial) | The session cookie is `HttpOnly; Secure; SameSite=Lax`. HSTS preload is present. CORS is restricted to the Vercel origin. Admin endpoints return 401 unauthenticated and 403 for a student. Responses contained no SSLCommerz password, `AUTH_SECRET`, `DATABASE_URL` or `REDIS_URL`. A full network capture was not done. |

## Exact Errors

1. **Payment initiation blocked**
   - URL / endpoint: `POST https://techsprout-api.onrender.com/api/v1/payments/initiate`
   - HTTP status: 502, `GATEWAY_ERROR`
   - Response: "Payment gateway session rejected: Store Credential Error Or Store is De-active"
   - Likely cause: invalid or inactive `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` in Render. A direct call with the standard sandbox store succeeded earlier, so the integration itself is fine.
   - Side effect: the order is left in `PAYMENT_PROCESSING`, and the payment is marked FAILED. A student cannot retry that order, which is worth reviewing separately. I did not check this against retry semantics in the code.

2. **New defect: malformed callback redirect base URL**
   - Endpoints: `POST /api/v1/payments/sslcommerz/success` and `.../fail`
   - HTTP status: 302
   - Observed `Location`: `https://techsprout-frthqjqb8-tech-sprout.vercel.app,https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app/orders/unknown/failure?...`
   - Cause: the redirect base is built from the raw comma-separated `WEB_ORIGIN` list. Its first entry is not an origin, so the result is an invalid host that browsers cannot resolve.
   - Impact: after a real SSLCommerz payment, the browser would be redirected to a non-resolving URL, even though the IPN could still fulfil the order. This would break the E2E flow even with correct credentials.
   - Not fixed, per the mission rules. It needs a separate decision, either a code change or a dedicated single-origin variable, and a change to Render variables is out of scope.

3. **Cosmetic**: the `/courses` price renders as `$1000.00 BDT` (a `$` before BDT).

## Final Verdict

**VERCEL P5 E2E BLOCKED**

Blockers:
1. Render SSLCommerz credentials are rejected by the sandbox (502), so no payment session can be created.
2. The callback redirect base is built from the raw comma-separated `WEB_ORIGIN`, which will break the post-payment browser return even after the first blocker is cleared.
3. The browser subagent quota is exhausted, so the authenticated checkout UI, success page, invoice, learn, failure, finance and refund UI steps could not be run in a browser.
