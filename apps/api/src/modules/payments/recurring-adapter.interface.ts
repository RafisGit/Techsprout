import { RecurringPaymentCapabilityGate } from './recurring-capability-gate';

export interface InitiateMandateParams {
  mandateId: string;
  studentId: string;
  customerName?: string;
  customerEmail?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface MandateRegistrationSession {
  sessionId: string;
  redirectUrl: string;
  provider: string;
}

export interface VerifyMandateParams {
  mandateId: string;
  payload: Record<string, unknown>;
}

export interface MandateVerificationResult {
  status: 'ACTIVE' | 'FAILED';
  providerToken?: string;
  maskedCardNumber?: string;
  cardBrand?: string;
  cardExpiry?: string;
  failureReason?: string;
  rawResponse?: Record<string, unknown>;
}

export interface RevokeMandateParams {
  mandateId: string;
  gatewayTokenCiphertext?: string;
}

export interface MandateRevocationResult {
  success: boolean;
  rawResponse?: Record<string, unknown>;
}

export interface RecurringChargeParams {
  mandateId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  gate?: RecurringPaymentCapabilityGate;
}

export interface RecurringChargeResult {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED';
  amountCents: number;
  currency: string;
  rawResponse?: Record<string, unknown>;
}

export interface IRecurringPaymentAdapter {
  readonly providerName: string;

  initiateMandateRegistration(
    params: InitiateMandateParams
  ): Promise<MandateRegistrationSession>;

  verifyMandateRegistration(
    params: VerifyMandateParams
  ): Promise<MandateVerificationResult>;

  revokeMandate(params: RevokeMandateParams): Promise<MandateRevocationResult>;

  executeRecurringCharge(params: RecurringChargeParams): Promise<RecurringChargeResult>;
}

export const RECURRING_PAYMENT_ADAPTER = 'RECURRING_PAYMENT_ADAPTER';
