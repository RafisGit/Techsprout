# ADR-P6-002: Decoupled Asynchronous Notification Architecture & Transactional Outbox
## Document Identifier: `TECHSPROUT-ADR-P6-002`
**Status:** PROPOSED (P6.0 Architecture Freeze Candidate)  
**Date:** 2026-10-07  
**Deciders:** TechSprout Engineering Team (Backend Architect, Payments Lead, Infrastructure Lead)  
**Target Milestone:** P6.1  

---

## 1. Context

TechSprout LMS has frozen its core financial and transactional engines (Orders, SSLCommerz Payments, Two-Phase Refunds, Invoices, and Certificates).

A major gap identified in the P6.0 audit is the complete absence of a notification subsystem. Currently:
- Students receive no confirmation emails when orders succeed or refund requests are adjudicated.
- There is no in-app notification center to alert learners of course updates or certificate awards.
- BullMQ queue exists in `apps/api/src/modules/queue/` connected to Redis/Valkey on Render, but is only configured for dummy pings.

**Critical Architectural Risk:**
If notifications are sent synchronously within domain transaction handlers (e.g., calling an email API like Resend or SendGrid inside the SSLCommerz payment callback or admin refund approval method), any third-party HTTP timeout or network failure will:
1. Block database connection pool threads.
2. Risk rolling back or delaying payment settlement and refund status updates.
3. Cause payment gateway timeout errors, triggering redundant callback retries and potential race conditions.

---

## 2. Decision

We establish the following architectural rules for Phase 6 Notification Architecture:

### 2.1 Decoupled Outbox / Event Emission Pattern
All notification-triggering domain operations must emit asynchronous events rather than invoking notification dispatch directly:
1. **Transaction Isolation:** Domain services (e.g., `PaymentsService`, `RefundsService`, `LearningService`) commit their database changes first.
2. **Asynchronous Enqueueing:** Upon successful commit (or via an Outbox table), a notification job is enqueued to BullMQ on the `techsprout-notifications` queue.
3. **Non-Blocking Guarantee:** Zero external network calls to email or SMS providers are permitted inside PostgreSQL database transactions.

### 2.2 Dedicated BullMQ Notification Worker
We will implement a resilient BullMQ worker dedicated to notification processing:
- **Queue Name:** `techsprout-notifications`
- **Concurrency:** Configurable (default 5 concurrent jobs).
- **Retry Strategy:** Exponential backoff (3 attempts, initial delay 2,000ms, backoff factor 2).
- **Dead-Letter Handling:** Failed jobs after 3 attempts are retained in Redis and recorded with status `FAILED` in the `notification_deliveries` table for administrator review.

### 2.3 Dual-Channel Delivery Pipeline
For each dispatched event:
1. **In-App Notification:** Always written to the `notifications` table immediately so it appears in the student/instructor web header.
2. **Email Delivery:** Rendered via typed email templates and dispatched through an external provider (e.g., Resend).
3. **Preference Check:** The worker evaluates `notification_preferences` before sending emails. Transactional emails (order confirmation, refund decision, password reset) bypass user opt-outs and are mandatory.

### 2.4 Idempotency & Deduplication
Every notification job must supply a deterministic `jobId`:
- Format: `notif_${userId}_${eventType}_${entityId}`
- Example: `notif_u123_ORDER_PAID_o456`
- Prevents duplicate email dispatch if payment webhooks are retried by SSLCommerz.

---

## 3. Consequences

### Positive:
- **Resilience:** Payment gateway callbacks and checkout operations remain sub-second without waiting for external email APIs.
- **Auditability:** Complete delivery tracking (`PENDING`, `SENT`, `FAILED`) in `notification_deliveries`.
- **Extensibility:** Adding new delivery channels (such as SMS for Bangladesh mobile networks) requires only adding a worker transport channel without modifying business logic.

### Negative / Trade-offs:
- Requires reliable Redis/Valkey uptime. To protect against temporary Redis unavailability, the worker must employ resilient retry handlers and graceful degradation.
