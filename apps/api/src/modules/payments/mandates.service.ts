import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { paymentMandates, PaymentMandate } from '../../database/schema/subscriptions';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import {
  PaymentMandateDto,
  InitiateMandateDto,
  MandateCallbackDto,
} from '@techsprout/contracts';
import { encryptPaymentToken, decryptPaymentToken } from './payment-token-crypto';
import {
  assertRecurringPaymentsAvailable,
  RecurringPaymentCapabilityGate,
} from './recurring-capability-gate';
import {
  IRecurringPaymentAdapter,
  RECURRING_PAYMENT_ADAPTER,
  MandateRegistrationSession,
} from './recurring-adapter.interface';

const KEY_BYTES = 32;

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Resolves the 32-byte encryption key from environment configuration.
 *
 * Security Requirements:
 * 1. Must be loaded from secure operator-managed configuration (PAYMENT_TOKEN_ENCRYPTION_KEY).
 * 2. Fail closed if missing or empty: no default key.
 * 3. Fail closed if equal to AUTH_SECRET: strictly prohibit silent reuse.
 * 4. Must be exactly 32 bytes (raw or decoded from 64-character hex or base64).
 */
export function resolvePaymentTokenEncryptionKey(
  envOverride?: Record<string, string | undefined>
): Uint8Array {
  const envSource = envOverride ?? process.env;
  const keyString = envSource.PAYMENT_TOKEN_ENCRYPTION_KEY;
  const authSecret = envSource.AUTH_SECRET;

  if (!keyString || keyString.trim().length === 0) {
    throw new Error('PAYMENT_TOKEN_ENCRYPTION_KEY is required for payment mandate operations');
  }

  const trimmed = keyString.trim();

  // Prohibit silent reuse of AUTH_SECRET
  if (authSecret && trimmed === authSecret.trim()) {
    throw new Error('PAYMENT_TOKEN_ENCRYPTION_KEY must not reuse AUTH_SECRET');
  }

  let keyBuffer: Buffer | null = null;

  // 1. 64-character Hex string
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    keyBuffer = Buffer.from(trimmed, 'hex');
  } else if (/^[A-Za-z0-9+/=_-]{43,44}$/.test(trimmed)) {
    // 2. Base64 or Base64url
    const b64 = Buffer.from(trimmed, 'base64');
    if (b64.byteLength === KEY_BYTES) {
      keyBuffer = b64;
    }
  }

  // 3. String encodings (UTF-8 or binary Latin-1)
  if (!keyBuffer || keyBuffer.byteLength !== KEY_BYTES) {
    const utf8Buf = Buffer.from(trimmed, 'utf-8');
    if (utf8Buf.byteLength === KEY_BYTES) {
      keyBuffer = utf8Buf;
    } else {
      const latin1Buf = Buffer.from(trimmed, 'latin1');
      if (latin1Buf.byteLength === KEY_BYTES) {
        keyBuffer = latin1Buf;
      }
    }
  }

  if (!keyBuffer || keyBuffer.byteLength !== KEY_BYTES) {
    throw new Error('PAYMENT_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (or 64 hex characters)');
  }

  return new Uint8Array(keyBuffer);
}

/**
 * Formats a database PaymentMandate into a public DTO.
 * Strictly strips gatewayTokenCiphertext and raw tokens to prevent data leakage.
 */
export function formatPaymentMandateDto(mandate: PaymentMandate): PaymentMandateDto {
  return {
    id: mandate.id,
    studentId: mandate.studentId,
    provider: mandate.provider,
    maskedCardNumber: mandate.maskedCardNumber,
    cardBrand: mandate.cardBrand,
    cardExpiry: mandate.cardExpiry,
    status: mandate.status,
    createdAt: mandate.createdAt.toISOString(),
    updatedAt: mandate.updatedAt.toISOString(),
  };
}

@Injectable()
export class MandatesService {
  private readonly logger = new Logger(MandatesService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(RECURRING_PAYMENT_ADAPTER) private readonly adapter: IRecurringPaymentAdapter
  ) {}

  /**
   * Initiates payment mandate registration for a student.
   * Creates a PENDING database record and obtains a session from the adapter.
   */
  async initiateMandate(
    studentId: string,
    input: InitiateMandateDto,
    context: RequestContext = {}
  ): Promise<{ mandate: PaymentMandateDto; session: MandateRegistrationSession }> {
    const mandateId = randomUUID();
    const provider = input.provider || this.adapter.providerName || 'SSLCOMMERZ';

    const [mandate] = await this.db
      .insert(paymentMandates)
      .values({
        id: mandateId,
        studentId,
        provider,
        gatewayTokenCiphertext: 'PENDING_REGISTRATION',
        status: 'PENDING',
      })
      .returning();

    const session = await this.adapter.initiateMandateRegistration({
      mandateId,
      studentId,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });

    await this.auditService.record({
      actorId: studentId,
      action: 'MANDATE_INITIATED',
      targetType: 'PAYMENT_MANDATE',
      targetId: mandateId,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { provider, sessionId: session.sessionId },
    });

    return {
      mandate: formatPaymentMandateDto(mandate),
      session,
    };
  }

  /**
   * Processes a provider callback for mandate confirmation.
   *
   * Security & Reliability guarantees:
   * 1. Uses a database transaction with SELECT ... FOR UPDATE for row-level locking.
   * 2. Idempotent: duplicate callbacks for already ACTIVE mandates return safely.
   * 3. Encrypts token with AES-256-GCM before updating DB; fail-closed on key errors.
   * 4. Never leaks token or ciphertext into logs, DTOs, or audit records.
   */
  async processMandateCallback(
    input: MandateCallbackDto,
    context: RequestContext = {}
  ): Promise<{ mandate: PaymentMandateDto; isDuplicate: boolean }> {
    return this.db.transaction(async (tx) => {
      const [mandate] = await tx
        .select()
        .from(paymentMandates)
        .where(eq(paymentMandates.id, input.mandateId))
        .for('update');

      if (!mandate) {
        throw new ApiException('Mandate not found', HttpStatus.NOT_FOUND, 'MANDATE_NOT_FOUND');
      }

      // Fast-path idempotency: if already ACTIVE, duplicate callback is a no-op
      if (mandate.status === 'ACTIVE') {
        this.logger.log(
          `[MANDATE_IDEMPOTENCY] Mandate ${mandate.id} is already ACTIVE. Skipping duplicate callback.`
        );
        return {
          mandate: formatPaymentMandateDto(mandate),
          isDuplicate: true,
        };
      }

      // Rejection: cannot activate a revoked or expired mandate
      if (mandate.status === 'REVOKED' || mandate.status === 'EXPIRED') {
        throw new ApiException(
          `Mandate is already terminated with status ${mandate.status}`,
          HttpStatus.CONFLICT,
          'MANDATE_ALREADY_TERMINATED'
        );
      }

      // Provider reported failure or cancellation
      if (input.status !== 'SUCCESS') {
        const [updated] = await tx
          .update(paymentMandates)
          .set({
            status: 'EXPIRED',
            updatedAt: new Date(),
          })
          .where(eq(paymentMandates.id, mandate.id))
          .returning();

        await this.auditService.record({
          actorId: mandate.studentId,
          action: 'MANDATE_REGISTRATION_FAILED',
          targetType: 'PAYMENT_MANDATE',
          targetId: mandate.id,
          ipAddress: context.ip,
          userAgent: context.userAgent,
          requestId: context.requestId,
          metadata: {
            status: input.status,
            reason: input.failureReason || 'Callback indicated unsuccessful registration',
          },
        });

        return {
          mandate: formatPaymentMandateDto(updated),
          isDuplicate: false,
        };
      }

      // Verify callback via adapter
      const verification = await this.adapter.verifyMandateRegistration({
        mandateId: mandate.id,
        payload: input as Record<string, unknown>,
      });

      if (verification.status !== 'ACTIVE' || !verification.providerToken) {
        const [updated] = await tx
          .update(paymentMandates)
          .set({
            status: 'EXPIRED',
            updatedAt: new Date(),
          })
          .where(eq(paymentMandates.id, mandate.id))
          .returning();

        await this.auditService.record({
          actorId: mandate.studentId,
          action: 'MANDATE_VERIFICATION_FAILED',
          targetType: 'PAYMENT_MANDATE',
          targetId: mandate.id,
          ipAddress: context.ip,
          userAgent: context.userAgent,
          requestId: context.requestId,
          metadata: { reason: verification.failureReason || 'Adapter rejected verification' },
        });

        return {
          mandate: formatPaymentMandateDto(updated),
          isDuplicate: false,
        };
      }

      // Resolve key and encrypt provider token (fails closed if missing or invalid)
      const encryptionKey = resolvePaymentTokenEncryptionKey();
      const ciphertext = encryptPaymentToken(verification.providerToken, encryptionKey);

      const [activated] = await tx
        .update(paymentMandates)
        .set({
          gatewayTokenCiphertext: ciphertext,
          maskedCardNumber: verification.maskedCardNumber || null,
          cardBrand: verification.cardBrand || null,
          cardExpiry: verification.cardExpiry || null,
          status: 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(paymentMandates.id, mandate.id))
        .returning();

      // Audit log does NOT include sensitive tokens
      await this.auditService.record({
        actorId: mandate.studentId,
        action: 'MANDATE_ACTIVATED',
        targetType: 'PAYMENT_MANDATE',
        targetId: mandate.id,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: {
          provider: activated.provider,
          maskedCardNumber: activated.maskedCardNumber,
          cardBrand: activated.cardBrand,
          cardExpiry: activated.cardExpiry,
        },
      });

      return {
        mandate: formatPaymentMandateDto(activated),
        isDuplicate: false,
      };
    });
  }

  /**
   * Revokes a payment mandate.
   * Enforces student ownership check (or admin authorization) and idempotency.
   */
  async revokeMandate(
    mandateId: string,
    studentId: string,
    context: RequestContext = {},
    isAdmin = false
  ): Promise<PaymentMandateDto> {
    return this.db.transaction(async (tx) => {
      const [mandate] = await tx
        .select()
        .from(paymentMandates)
        .where(eq(paymentMandates.id, mandateId))
        .for('update');

      if (!mandate) {
        throw new ApiException('Mandate not found', HttpStatus.NOT_FOUND, 'MANDATE_NOT_FOUND');
      }

      // Ownership enforcement
      if (!isAdmin && mandate.studentId !== studentId) {
        throw new ApiException(
          'Forbidden: You do not have permission to revoke this mandate',
          HttpStatus.FORBIDDEN,
          'FORBIDDEN'
        );
      }

      // Idempotency: already revoked
      if (mandate.status === 'REVOKED') {
        return formatPaymentMandateDto(mandate);
      }

      await this.adapter.revokeMandate({
        mandateId: mandate.id,
        gatewayTokenCiphertext: mandate.gatewayTokenCiphertext,
      });

      const [revoked] = await tx
        .update(paymentMandates)
        .set({
          status: 'REVOKED',
          updatedAt: new Date(),
        })
        .where(eq(paymentMandates.id, mandate.id))
        .returning();

      await this.auditService.record({
        actorId: studentId,
        action: 'MANDATE_REVOKED',
        targetType: 'PAYMENT_MANDATE',
        targetId: mandate.id,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { revokedBy: isAdmin ? 'ADMIN' : 'STUDENT' },
      });

      return formatPaymentMandateDto(revoked);
    });
  }

  /**
   * Lists all payment mandates for a student (public-safe DTOs only).
   */
  async getStudentMandates(studentId: string): Promise<PaymentMandateDto[]> {
    const list = await this.db
      .select()
      .from(paymentMandates)
      .where(eq(paymentMandates.studentId, studentId))
      .orderBy(desc(paymentMandates.createdAt));

    return list.map(formatPaymentMandateDto);
  }

  /**
   * Gets a specific mandate by ID, verifying student ownership or admin privilege.
   */
  async getMandateById(
    mandateId: string,
    studentId: string,
    isAdmin = false
  ): Promise<PaymentMandateDto> {
    const [mandate] = await this.db
      .select()
      .from(paymentMandates)
      .where(eq(paymentMandates.id, mandateId));

    if (!mandate) {
      throw new ApiException('Mandate not found', HttpStatus.NOT_FOUND, 'MANDATE_NOT_FOUND');
    }

    if (!isAdmin && mandate.studentId !== studentId) {
      throw new ApiException(
        'Forbidden: You do not have permission to view this mandate',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return formatPaymentMandateDto(mandate);
  }

  /**
   * Decrypts the gateway token for authorized internal charging workflows.
   * Fails closed: recurring charges must satisfy both enablement and capability verification.
   */
  async getDecryptedTokenForCharge(
    mandateId: string,
    gate?: RecurringPaymentCapabilityGate
  ): Promise<string> {
    // 1. Mandatory capability gate assertion
    assertRecurringPaymentsAvailable(gate);

    const [mandate] = await this.db
      .select()
      .from(paymentMandates)
      .where(eq(paymentMandates.id, mandateId));

    if (!mandate) {
      throw new ApiException('Mandate not found', HttpStatus.NOT_FOUND, 'MANDATE_NOT_FOUND');
    }

    if (mandate.status !== 'ACTIVE') {
      throw new ApiException(
        `Mandate is not active (status: ${mandate.status})`,
        HttpStatus.BAD_REQUEST,
        'MANDATE_NOT_ACTIVE'
      );
    }

    const encryptionKey = resolvePaymentTokenEncryptionKey();
    return decryptPaymentToken(mandate.gatewayTokenCiphertext, encryptionKey);
  }

  /**
   * Recurring charge execution entry point.
   * Fails closed unconditionally pending DEC-P8-01 written merchant confirmation.
   */
  async executeRecurringCharge(
    mandateId: string,
    amountCents: number,
    currency = 'BDT',
    gate?: RecurringPaymentCapabilityGate
  ): Promise<never> {
    // Fail-closed gate
    assertRecurringPaymentsAvailable(gate);

    throw new ApiException(
      'Merchant recurring-payment capability has not been verified (DEC-P8-01)',
      HttpStatus.FORBIDDEN,
      'RECURRING_PAYMENTS_UNVERIFIED'
    );
  }
}
