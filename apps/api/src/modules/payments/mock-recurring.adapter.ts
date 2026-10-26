import { Injectable } from '@nestjs/common';
import {
  IRecurringPaymentAdapter,
  InitiateMandateParams,
  MandateRegistrationSession,
  VerifyMandateParams,
  MandateVerificationResult,
  RevokeMandateParams,
  MandateRevocationResult,
  RecurringChargeParams,
  RecurringChargeResult,
} from './recurring-adapter.interface';
import { assertRecurringPaymentsAvailable } from './recurring-capability-gate';

@Injectable()
export class MockRecurringPaymentAdapter implements IRecurringPaymentAdapter {
  public readonly providerName = 'MOCK';

  async initiateMandateRegistration(
    params: InitiateMandateParams
  ): Promise<MandateRegistrationSession> {
    return {
      sessionId: `mock-sess-${params.mandateId}`,
      redirectUrl: `https://mock-gateway.techsprout.test/mandates/${params.mandateId}?return=${encodeURIComponent(
        params.returnUrl || ''
      )}`,
      provider: this.providerName,
    };
  }

  async verifyMandateRegistration(
    params: VerifyMandateParams
  ): Promise<MandateVerificationResult> {
    const { payload, mandateId } = params;

    if (payload.status === 'FAILED' || payload.status === 'CANCELLED') {
      return {
        status: 'FAILED',
        failureReason:
          typeof payload.failureReason === 'string'
            ? payload.failureReason
            : 'Provider reported registration failure',
        rawResponse: payload,
      };
    }

    const token =
      typeof payload.token === 'string' && payload.token.trim().length > 0
        ? payload.token.trim()
        : `mock-prov-tok-${mandateId.slice(0, 8)}-${Date.now()}`;

    return {
      status: 'ACTIVE',
      providerToken: token,
      maskedCardNumber:
        typeof payload.maskedCard === 'string' ? payload.maskedCard : '411111******1111',
      cardBrand: typeof payload.cardBrand === 'string' ? payload.cardBrand : 'VISA',
      cardExpiry: typeof payload.cardExpiry === 'string' ? payload.cardExpiry : '12/28',
      rawResponse: payload,
    };
  }

  async revokeMandate(params: RevokeMandateParams): Promise<MandateRevocationResult> {
    return {
      success: true,
      rawResponse: { revoked: true, mandateId: params.mandateId },
    };
  }

  async executeRecurringCharge(
    params: RecurringChargeParams
  ): Promise<RecurringChargeResult> {
    // Fail-closed gate: throws unless both feature flag and merchant-specific capability are explicitly verified
    assertRecurringPaymentsAvailable(params.gate);

    return {
      transactionId: `mock-rec-tx-${Date.now()}`,
      status: 'SUCCESS',
      amountCents: params.amountCents,
      currency: params.currency,
      rawResponse: { charged: true, mandateId: params.mandateId },
    };
  }
}
