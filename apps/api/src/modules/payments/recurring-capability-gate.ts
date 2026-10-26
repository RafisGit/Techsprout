/**
 * Fail-closed capability gate for any future recurring-payment execution path.
 *
 * This is a provider-independent guard only. It does not establish provider
 * capability, validate a mandate, or perform a charge. Callers must pass
 * explicit values derived from reviewed configuration and the recorded DEC-P8-01
 * evidence. Missing/false values must prevent execution.
 */
export interface RecurringPaymentCapabilityGate {
  enabled?: boolean;
  merchantCapabilityVerified?: boolean;
}

export class RecurringPaymentsUnavailableError extends Error {
  public readonly reason: 'DISABLED' | 'MERCHANT_CAPABILITY_UNVERIFIED';

  constructor(reason: 'DISABLED' | 'MERCHANT_CAPABILITY_UNVERIFIED') {
    super(
      reason === 'DISABLED'
        ? 'Recurring payment execution is disabled'
        : 'Merchant recurring-payment capability has not been verified'
    );
    this.name = 'RecurringPaymentsUnavailableError';
    this.reason = reason;
  }
}

/**
 * Throws unless both the explicit feature enablement and merchant-specific
 * capability verification are true. Missing configuration fails closed.
 */
export function assertRecurringPaymentsAvailable(
  gate?: RecurringPaymentCapabilityGate | null
): void {
  if (gate?.enabled !== true) {
    throw new RecurringPaymentsUnavailableError('DISABLED');
  }

  if (gate.merchantCapabilityVerified !== true) {
    throw new RecurringPaymentsUnavailableError('MERCHANT_CAPABILITY_UNVERIFIED');
  }
}
