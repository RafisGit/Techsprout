import { describe, expect, it } from 'vitest';
import {
  canTransitionSubscriptionStatus,
  InvalidSubscriptionTransitionError,
  SUBSCRIPTION_STATUSES,
  transitionSubscriptionStatus,
  type SubscriptionStatus,
} from './subscription-lifecycle';

const allowed: ReadonlyArray<readonly [SubscriptionStatus, SubscriptionStatus]> = [
  ['INCOMPLETE', 'ACTIVE'],
  ['INCOMPLETE', 'CANCELED'],
  ['INCOMPLETE', 'EXPIRED'],
  ['ACTIVE', 'PAST_DUE'],
  ['ACTIVE', 'CANCELED'],
  ['PAST_DUE', 'ACTIVE'],
  ['PAST_DUE', 'CANCELED'],
  ['PAST_DUE', 'UNPAID'],
  ['PAST_DUE', 'EXPIRED'],
  ['CANCELED', 'EXPIRED'],
  ['UNPAID', 'ACTIVE'],
  ['UNPAID', 'CANCELED'],
  ['UNPAID', 'EXPIRED'],
];

describe('subscription lifecycle transition guard', () => {
  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransitionSubscriptionStatus(from, to)).toBe(true);
    expect(transitionSubscriptionStatus(from, to)).toBe(to);
  });

  it('rejects all transitions not explicitly listed', () => {
    const allowedKeys = new Set(allowed.map(([from, to]) => `${from}->${to}`));

    for (const from of SUBSCRIPTION_STATUSES) {
      for (const to of SUBSCRIPTION_STATUSES) {
        if (allowedKeys.has(`${from}->${to}`)) {
          continue;
        }

        expect(canTransitionSubscriptionStatus(from, to)).toBe(false);
        expect(() => transitionSubscriptionStatus(from, to)).toThrow(
          InvalidSubscriptionTransitionError
        );
      }
    }
  });

  it('rejects same-state transitions', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(canTransitionSubscriptionStatus(status, status)).toBe(false);
    }
  });

  it('preserves the source and destination on transition errors', () => {
    try {
      transitionSubscriptionStatus('EXPIRED', 'ACTIVE');
      throw new Error('Expected transition to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSubscriptionTransitionError);
      expect((error as InvalidSubscriptionTransitionError).from).toBe('EXPIRED');
      expect((error as InvalidSubscriptionTransitionError).to).toBe('ACTIVE');
    }
  });
});
