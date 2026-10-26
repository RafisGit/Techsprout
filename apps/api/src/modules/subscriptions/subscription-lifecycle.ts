/**
 * Pure subscription lifecycle guard for WP-P8-01.
 *
 * This module validates status changes only. It intentionally does not decide
 * cancellation effective dates, grace periods, retry counts, or payment-gateway
 * behavior; those policies must be applied by the caller after the corresponding
 * business decision and verified payment event.
 */
export const SUBSCRIPTION_STATUSES = [
  'INCOMPLETE',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'UNPAID',
  'EXPIRED',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Allowed lifecycle transitions.
 *
 * CANCELED means cancellation has become effective under the approved policy;
 * a cancellation request alone must not call this transition. EXPIRED is
 * terminal. Re-subscribing after cancellation/expiry should create a new record.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>>
> = {
  INCOMPLETE: new Set(['ACTIVE', 'CANCELED', 'EXPIRED']),
  ACTIVE: new Set(['PAST_DUE', 'CANCELED']),
  PAST_DUE: new Set(['ACTIVE', 'CANCELED', 'UNPAID', 'EXPIRED']),
  CANCELED: new Set(['EXPIRED']),
  UNPAID: new Set(['ACTIVE', 'CANCELED', 'EXPIRED']),
  EXPIRED: new Set(),
};

export class InvalidSubscriptionTransitionError extends Error {
  public readonly from: SubscriptionStatus;
  public readonly to: SubscriptionStatus;

  constructor(from: SubscriptionStatus, to: SubscriptionStatus) {
    super(`Invalid subscription status transition: ${from} -> ${to}`);
    this.name = 'InvalidSubscriptionTransitionError';
    this.from = from;
    this.to = to;
  }
}

/**
 * Returns whether a lifecycle status change is allowed.
 *
 * Same-state transitions are rejected so callers cannot mistake a no-op for a
 * processed lifecycle event. Idempotency of gateway webhooks belongs in the
 * payment-event handler, not this pure state-machine function.
 */
export function canTransitionSubscriptionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): boolean {
  return from !== to && ALLOWED_TRANSITIONS[from].has(to);
}

/**
 * Validate a proposed state change and return its destination status.
 * This function performs no I/O and has no side effects.
 */
export function transitionSubscriptionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): SubscriptionStatus {
  if (!canTransitionSubscriptionStatus(from, to)) {
    throw new InvalidSubscriptionTransitionError(from, to);
  }

  return to;
}
