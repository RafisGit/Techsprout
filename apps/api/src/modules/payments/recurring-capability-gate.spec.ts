import { describe, expect, it } from 'vitest';
import {
  assertRecurringPaymentsAvailable,
  RecurringPaymentsUnavailableError,
} from './recurring-capability-gate';

describe('recurring-payment capability gate', () => {
  it('fails closed when the gate is missing', () => {
    expect(() => assertRecurringPaymentsAvailable()).toThrow(
      RecurringPaymentsUnavailableError
    );
  });

  it('fails closed when enablement is absent or false', () => {
    expect(() => assertRecurringPaymentsAvailable({ merchantCapabilityVerified: true })).toThrow(
      'Recurring payment execution is disabled'
    );
    expect(() =>
      assertRecurringPaymentsAvailable({ enabled: false, merchantCapabilityVerified: true })
    ).toThrow('Recurring payment execution is disabled');
  });

  it('fails closed when merchant-specific capability is unverified', () => {
    expect(() => assertRecurringPaymentsAvailable({ enabled: true })).toThrow(
      'Merchant recurring-payment capability has not been verified'
    );
    expect(() =>
      assertRecurringPaymentsAvailable({
        enabled: true,
        merchantCapabilityVerified: false,
      })
    ).toThrow('Merchant recurring-payment capability has not been verified');
  });

  it('allows a caller through only when both explicit gates are true', () => {
    expect(() =>
      assertRecurringPaymentsAvailable({
        enabled: true,
        merchantCapabilityVerified: true,
      })
    ).not.toThrow();
  });

  it('preserves a machine-readable reason for blocked requests', () => {
    try {
      assertRecurringPaymentsAvailable({ enabled: true, merchantCapabilityVerified: false });
      throw new Error('Expected gate to reject unverified merchant capability');
    } catch (error) {
      expect(error).toBeInstanceOf(RecurringPaymentsUnavailableError);
      expect((error as RecurringPaymentsUnavailableError).reason).toBe(
        'MERCHANT_CAPABILITY_UNVERIFIED'
      );
    }
  });
});
