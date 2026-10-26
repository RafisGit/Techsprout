# WP-P8-02 — SSLCommerz Recurring Capability Gate & Safe Adapter Boundary

**Date:** 2026-10-26  
**Status:** Capability unverified — recurring charge execution disabled  
**Branch:** `feat/p8-wp01-subscription-lifecycle`  
**Related decision:** DEC-P8-01  
**Scope:** Read-only public-documentation review and safe development boundary. No merchant account was accessed, no provider support request was sent, and no payment request was made.

## 1. Evidence from public documentation

The public SSLCommerz v4 developer documentation describes the standard hosted/easy-checkout flow around:
- Session creation / payment initiation.
- IPN notification delivery.
- Server-side Order Validation API calls to verify transaction status and amount.
- EMI configuration fields, including instalment options.

Sources:
- SSLCommerz v4 developer docs: https://developer.sslcommerz.com/doc/v4/index.html
- SSLCommerz integration document: https://sslcommerz.com/integration-document/

A text search of the public v4 documentation did not find documented recurring-payment, mandate, subscription, or off-session card-token charging flows. The word `token` appears in an Easy Checkout example parameter, but that public example does not establish that an account has a reusable card-on-file token or that merchant-initiated charges are supported.

**Interpretation:** Public documentation reviewed here is insufficient to confirm or deny account-specific recurring-payment capability. EMI instalments are not evidence that TechSprout can initiate a new merchant-initiated subscription charge in a later billing period.

No claim is made that SSLCommerz has confirmed recurring capability for the TechSprout merchant.

## 2. Required written merchant confirmation (DEC-P8-01)

Before any real recurring charge is implemented or enabled, obtain written confirmation from the SSLCommerz account manager/support for the specific TechSprout merchant/store configuration addressing:

1. Whether merchant-initiated, server-to-server charges are supported without interactive OTP/customer authentication on each renewal.
2. Which supported card channels, acquiring banks, card types, and merchant categories qualify, plus any enrolment or approval requirements.
3. The documented API endpoints, request/response schemas, authentication/signature requirements, sandbox availability, and production activation process.
4. How initial customer consent/mandate registration works, how token or mandate identifiers are returned, whether the reference is reusable, its expiry/revocation behavior, and any token-rotation requirements.
5. The provider's authoritative callback/IPN events for mandate activation, renewal success/failure, charge status, refunds, and revocation, including validation and query endpoints.
6. Idempotency, retry, decline, timeout, reconciliation, settlement, refund, and chargeback expectations.
7. Required customer-facing consent wording, receipts, cancellation disclosures, applicable merchant terms, and any compliance or security obligations.

Retain the provider's written reply as a controlled decision artifact with secrets and personal data redacted.

## 3. Adapter boundary

WP-P8-02 may proceed with provider-independent domain contracts and test doubles. Any future adapter must isolate provider-specific mandate and charge behavior behind an interface and fail closed when capability is not verified or configuration is disabled.

The following actions remain prohibited until the gate is resolved:
- Initiating real off-session or recurring charges.
- Treating an ordinary checkout success, EMI selection, IPN notification, or validation response as proof of recurring authorization.
- Storing or returning a raw provider token in an API response.
- Retrying a charge without durable idempotency and an authoritative provider-status strategy.
- Enabling renewal workers or subscription entitlements from unverified payment events.

The existing `SSLCommerzClient` currently exposes standard session initiation, order validation, transaction query, and refund operations; it does not currently provide a documented recurring-mandate API. Do not invent endpoint paths, request fields, or cryptographic verification rules.

## 4. Token protection work in the current feature branch

The WP-P8-01 development branch now:
- Removes `gatewayToken` from the public `PaymentMandateDto`.
- Names the persistence column `gateway_token_ciphertext` to make the at-rest requirement explicit.
- Adds an AES-256-GCM helper that requires a caller-supplied 32-byte key, uses a fresh 96-bit IV per encryption, authenticates ciphertext, and provides no built-in/default key.
- Adds unit coverage for round-trip encryption, random IVs, invalid key sizes, malformed payloads, and tamper/wrong-key rejection.

**Integration status:** The encryption helper is not yet wired into a mandate persistence service because that service and the verified provider token lifecycle are not implemented. No mandate token has been stored by these changes. A future service must retrieve its key from a secret manager/secure environment, never commit it, never use `AUTH_SECRET` as an implicit substitute, encrypt before database persistence, decrypt only server-side when required, and never log the token or ciphertext unnecessarily.

Because migration `0012_subscription_foundation.sql` has not been applied to any environment, its new column definition can still be reviewed in development. If it is ever applied to an environment, subsequent changes must use a new reviewed migration rather than editing historical applied migration SQL.

### Fail-closed execution gate added

The feature branch now also contains `apps/api/src/modules/payments/recurring-capability-gate.ts` with an explicit two-part guard: the recurring feature must be enabled and the merchant-specific capability must be verified. Missing values fail closed. The accompanying unit tests cover missing configuration, disabled execution, unverified capability, and the positive case.

This guard is not yet wired into any controller, worker, checkout path, or provider adapter. Its presence alone does not make the live system safe or imply that recurring charges are implemented. Future charge/renewal entry points must invoke the guard and also enforce mandate state, durable idempotency, authorization, and reconciled transaction state before any provider request.

## 5. Acceptance criteria for completing WP-P8-02

- Written merchant-specific capability evidence is attached to DEC-P8-01, or the product explicitly adopts customer-initiated manual renewals/prepaid passes instead of auto-debit.
- Provider-facing interfaces are based on confirmed API documentation and do not invent unsupported operations.
- Mandate tokens are encrypted at rest and excluded from all public DTOs, logs, URLs, and telemetry.
- Mandate creation, confirmation, revocation, and charge attempts have explicit authorization, state transitions, audit events, and idempotency.
- Webhook/IPN handlers verify authenticity and transaction status through documented provider behavior; duplicated and reordered events are tested.
- Renewal retries are safe under concurrent workers and ambiguous provider timeouts.
- All tests pass on a reconciled branch base; no production charge is enabled without a separately reviewed release gate.

## 6. Current decision

**DEC-P8-01 remains PENDING.** Independent design and test work can continue, but the recurring-payment execution path must remain unavailable until merchant-specific evidence, secure token storage wiring, and the required release checks are complete.
