import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  MandatesService,
  resolvePaymentTokenEncryptionKey,
  formatPaymentMandateDto,
} from './mandates.service';
import { MockRecurringPaymentAdapter } from './mock-recurring.adapter';
import { PaymentMandate } from '../../database/schema/subscriptions';
import { decryptPaymentToken } from './payment-token-crypto';
import { RecurringPaymentsUnavailableError } from './recurring-capability-gate';
import { ApiException } from '../../common/errors/api-error';

describe('MandatesService and Payment Token Security', () => {
  const validHexKey = randomBytes(32).toString('hex');
  const valid32ByteKey = randomBytes(32).toString('latin1');
  const studentId = randomUUID();
  const anotherStudentId = randomUUID();

  describe('resolvePaymentTokenEncryptionKey', () => {
    it('fails closed when PAYMENT_TOKEN_ENCRYPTION_KEY is missing or empty', () => {
      expect(() => resolvePaymentTokenEncryptionKey({})).toThrow(
        'PAYMENT_TOKEN_ENCRYPTION_KEY is required for payment mandate operations'
      );
      expect(() =>
        resolvePaymentTokenEncryptionKey({ PAYMENT_TOKEN_ENCRYPTION_KEY: '   ' })
      ).toThrow('PAYMENT_TOKEN_ENCRYPTION_KEY is required for payment mandate operations');
    });

    it('fails closed and prohibits silent reuse of AUTH_SECRET', () => {
      const secret = 'super-secret-auth-key-32-chars-long!';
      expect(() =>
        resolvePaymentTokenEncryptionKey({
          AUTH_SECRET: secret,
          PAYMENT_TOKEN_ENCRYPTION_KEY: secret,
        })
      ).toThrow('PAYMENT_TOKEN_ENCRYPTION_KEY must not reuse AUTH_SECRET');
    });

    it('fails closed when key length is invalid', () => {
      expect(() =>
        resolvePaymentTokenEncryptionKey({
          PAYMENT_TOKEN_ENCRYPTION_KEY: 'too-short',
        })
      ).toThrow('PAYMENT_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes');
    });

    it('successfully parses 64-character hex key', () => {
      const key = resolvePaymentTokenEncryptionKey({
        PAYMENT_TOKEN_ENCRYPTION_KEY: validHexKey,
      });
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.byteLength).toBe(32);
    });

    it('successfully parses raw 32-byte key', () => {
      const key = resolvePaymentTokenEncryptionKey({
        PAYMENT_TOKEN_ENCRYPTION_KEY: valid32ByteKey,
      });
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.byteLength).toBe(32);
    });
  });

  describe('formatPaymentMandateDto', () => {
    it('never exposes gatewayTokenCiphertext or raw secrets in public DTO', () => {
      const mockRecord: PaymentMandate = {
        id: randomUUID(),
        studentId,
        provider: 'SSLCOMMERZ',
        gatewayTokenCiphertext: 'v1.fakeiv.faketag.fakeciphertext',
        maskedCardNumber: '411111******1111',
        cardBrand: 'VISA',
        cardExpiry: '12/28',
        status: 'ACTIVE',
        createdAt: new Date('2026-10-26T12:00:00Z'),
        updatedAt: new Date('2026-10-26T12:00:00Z'),
      };

      const dto = formatPaymentMandateDto(mockRecord);

      expect(dto).not.toHaveProperty('gatewayTokenCiphertext');
      expect((dto as unknown as Record<string, unknown>).gatewayTokenCiphertext).toBeUndefined();
      expect(dto).toEqual({
        id: mockRecord.id,
        studentId: mockRecord.studentId,
        provider: 'SSLCOMMERZ',
        maskedCardNumber: '411111******1111',
        cardBrand: 'VISA',
        cardExpiry: '12/28',
        status: 'ACTIVE',
        createdAt: '2026-10-26T12:00:00.000Z',
        updatedAt: '2026-10-26T12:00:00.000Z',
      });
    });
  });

  describe('MandatesService lifecycle workflows', () => {
    let mandatesStore: Map<string, PaymentMandate>;
    let auditLogs: Array<Record<string, unknown>>;
    let mockAdapter: MockRecurringPaymentAdapter;
    let service: MandatesService;
    let mockDb: unknown;
    let mockAuditService: unknown;

    const extractIdFromClause = (clause: unknown): string | null => {
      if (!clause || typeof clause !== 'object') return null;
      const anyClause = clause as Record<string, unknown>;
      if (Array.isArray(anyClause.queryChunks)) {
        for (const chunk of anyClause.queryChunks) {
          if (
            chunk &&
            typeof chunk === 'object' &&
            'value' in chunk &&
            typeof (chunk as any).value === 'string'
          ) {
            return (chunk as any).value;
          }
        }
      }
      if ('value' in anyClause && typeof anyClause.value === 'string') {
        return anyClause.value;
      }
      return null;
    };

    const getRecord = (clause: unknown): PaymentMandate | undefined => {
      const targetId = extractIdFromClause(clause);
      if (targetId && mandatesStore.has(targetId)) {
        return mandatesStore.get(targetId);
      }
      if (targetId) {
        for (const m of mandatesStore.values()) {
          if (m.studentId === targetId) return m;
        }
      }
      if (mandatesStore.size === 1) {
        return Array.from(mandatesStore.values())[0];
      }
      return undefined;
    };

    beforeEach(() => {
      process.env.PAYMENT_TOKEN_ENCRYPTION_KEY = validHexKey;
      process.env.AUTH_SECRET = 'separate-auth-secret-for-jwt-session-tokens-only';

      mandatesStore = new Map();
      auditLogs = [];
      mockAdapter = new MockRecurringPaymentAdapter();

      mockAuditService = {
        record: vi.fn(async (log: Record<string, unknown>) => {
          auditLogs.push(log);
        }),
      };

      const createQueryBuilder = (records: PaymentMandate[]) => {
        const builder = {
          where: vi.fn((clause: unknown) => {
            const found = getRecord(clause);
            return createQueryBuilder(found ? [found] : []);
          }),
          orderBy: vi.fn((_clause: unknown) => builder),
          limit: vi.fn((_limit: number) => builder),
          for: vi.fn((_mode: string) => Promise.resolve(records)),
          then: (resolve: (val: PaymentMandate[]) => void) => resolve(records),
          [Symbol.asyncIterator]: async function* () {
            for (const item of records) yield item;
          },
        };
        return builder;
      };

      mockDb = {
        insert: vi.fn(() => ({
          values: vi.fn((val: Partial<PaymentMandate>) => {
            const row: PaymentMandate = {
              id: val.id || randomUUID(),
              studentId: val.studentId!,
              provider: val.provider || 'SSLCOMMERZ',
              gatewayTokenCiphertext: val.gatewayTokenCiphertext || 'PENDING_REGISTRATION',
              maskedCardNumber: val.maskedCardNumber || null,
              cardBrand: val.cardBrand || null,
              cardExpiry: val.cardExpiry || null,
              status: val.status || 'PENDING',
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mandatesStore.set(row.id, row);
            return {
              returning: vi.fn(async () => [row]),
            };
          }),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn((clause: unknown) => {
              const rec = getRecord(clause);
              return createQueryBuilder(rec ? [rec] : []);
            }),
            orderBy: vi.fn(() => createQueryBuilder(Array.from(mandatesStore.values()))),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((patch: Partial<PaymentMandate>) => ({
            where: vi.fn((clause: unknown) => ({
              returning: vi.fn(async () => {
                const rec = getRecord(clause);
                if (rec) {
                  const updated: PaymentMandate = {
                    ...rec,
                    ...patch,
                    updatedAt: new Date(),
                  };
                  mandatesStore.set(rec.id, updated);
                  return [updated];
                }
                return [];
              }),
            })),
          })),
        })),
        transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn((clause: unknown) => {
                  const rec = getRecord(clause);
                  return {
                    for: vi.fn((_lock: string) => Promise.resolve(rec ? [rec] : [])),
                  };
                }),
              })),
            })),
            update: vi.fn(() => ({
              set: vi.fn((patch: Partial<PaymentMandate>) => ({
                where: vi.fn((clause: unknown) => ({
                  returning: vi.fn(async () => {
                    const rec = getRecord(clause);
                    if (rec) {
                      const updated: PaymentMandate = {
                        ...rec,
                        ...patch,
                        updatedAt: new Date(),
                      };
                      mandatesStore.set(rec.id, updated);
                      return [updated];
                    }
                    return [];
                  }),
                })),
              })),
            })),
          };
          return cb(tx);
        }),
      };

      service = new MandatesService(mockDb as any, mockAuditService as any, mockAdapter);
    });

    it('initiates mandate registration with PENDING status and audit record', async () => {
      const result = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
        returnUrl: 'https://techsprout.test/success',
      });

      expect(result.mandate.status).toBe('PENDING');
      expect(result.mandate.studentId).toBe(studentId);
      expect(result.session.sessionId).toContain(result.mandate.id);
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('MANDATE_INITIATED');
      expect(auditLogs[0].targetId).toBe(result.mandate.id);
    });

    it('processes successful callback: encrypts token with AES-256-GCM and marks ACTIVE', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      const callbackResult = await service.processMandateCallback({
        mandateId: mandate.id,
        status: 'SUCCESS',
        token: 'secret-provider-card-token-xyz',
        maskedCard: '411111******1111',
        cardBrand: 'VISA',
        cardExpiry: '12/28',
      });

      expect(callbackResult.isDuplicate).toBe(false);
      expect(callbackResult.mandate.status).toBe('ACTIVE');
      expect(callbackResult.mandate.maskedCardNumber).toBe('411111******1111');

      // Verify database record has encrypted ciphertext, NOT plaintext
      const stored = mandatesStore.get(mandate.id)!;
      expect(stored.status).toBe('ACTIVE');
      expect(stored.gatewayTokenCiphertext).not.toContain('secret-provider-card-token-xyz');
      expect(stored.gatewayTokenCiphertext.startsWith('v1.')).toBe(true);

      // Verify token can be decrypted with the proper key
      const key = resolvePaymentTokenEncryptionKey();
      const decrypted = decryptPaymentToken(stored.gatewayTokenCiphertext, key);
      expect(decrypted).toBe('secret-provider-card-token-xyz');

      // Verify audit log has no sensitive token
      const activateAudit = auditLogs.find((l) => l.action === 'MANDATE_ACTIVATED');
      expect(activateAudit).toBeDefined();
      expect(JSON.stringify(activateAudit)).not.toContain('secret-provider-card-token-xyz');
      expect(JSON.stringify(activateAudit)).not.toContain(stored.gatewayTokenCiphertext);
    });

    it('fails closed when encryption key is missing during callback processing', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      delete process.env.PAYMENT_TOKEN_ENCRYPTION_KEY;

      await expect(
        service.processMandateCallback({
          mandateId: mandate.id,
          status: 'SUCCESS',
          token: 'token-without-encryption-key',
        })
      ).rejects.toThrow('PAYMENT_TOKEN_ENCRYPTION_KEY is required for payment mandate operations');

      // Verify plaintext token was NEVER written to the database
      const stored = mandatesStore.get(mandate.id)!;
      expect(stored.status).toBe('PENDING');
      expect(stored.gatewayTokenCiphertext).toBe('PENDING_REGISTRATION');
    });

    it('handles duplicate callback idempotently without re-encrypting or erroring', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      // First callback: activates
      await service.processMandateCallback({
        mandateId: mandate.id,
        status: 'SUCCESS',
        token: 'token-xyz',
      });

      // Second duplicate callback: idempotent no-op
      const duplicateResult = await service.processMandateCallback({
        mandateId: mandate.id,
        status: 'SUCCESS',
        token: 'token-xyz',
      });

      expect(duplicateResult.isDuplicate).toBe(true);
      expect(duplicateResult.mandate.status).toBe('ACTIVE');
    });

    it('transitions to EXPIRED on unsuccessful callback', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      const failedResult = await service.processMandateCallback({
        mandateId: mandate.id,
        status: 'FAILED',
        failureReason: 'Customer card declined by bank',
      });

      expect(failedResult.isDuplicate).toBe(false);
      expect(failedResult.mandate.status).toBe('EXPIRED');

      const failedAudit = auditLogs.find((l) => l.action === 'MANDATE_REGISTRATION_FAILED');
      expect(failedAudit).toBeDefined();
    });

    it('rejects callbacks on terminated mandates with 409 conflict', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      // Revoke the mandate first
      const stored = mandatesStore.get(mandate.id)!;
      stored.status = 'REVOKED';

      await expect(
        service.processMandateCallback({
          mandateId: mandate.id,
          status: 'SUCCESS',
          token: 'late-token',
        })
      ).rejects.toThrow(ApiException);
    });

    it('enforces ownership checks when revoking a mandate', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      const existing = mandatesStore.get(mandate.id)!;
      mandatesStore.set(anotherStudentId, {
        ...existing,
        id: anotherStudentId,
        studentId: anotherStudentId,
      });

      // Another student cannot revoke this mandate
      await expect(
        service.revokeMandate(mandate.id, anotherStudentId, {}, false)
      ).rejects.toThrow('Forbidden');

      // Owning student can revoke
      const revoked = await service.revokeMandate(mandate.id, studentId, {}, false);
      expect(revoked.status).toBe('REVOKED');

      // Idempotent revocation returns cleanly
      const revokedAgain = await service.revokeMandate(mandate.id, studentId, {}, false);
      expect(revokedAgain.status).toBe('REVOKED');
    });

    it('admin can revoke any mandate', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      const revoked = await service.revokeMandate(mandate.id, anotherStudentId, {}, true);
      expect(revoked.status).toBe('REVOKED');
    });

    it('fails closed on recurring charge execution unconditionally (DEC-P8-01)', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      // 1. Without gate: throws RecurringPaymentsUnavailableError
      await expect(service.executeRecurringCharge(mandate.id, 5000)).rejects.toThrow(
        RecurringPaymentsUnavailableError
      );

      // 2. With gate enabled but unverified capability: throws RecurringPaymentsUnavailableError
      await expect(
        service.executeRecurringCharge(mandate.id, 5000, 'BDT', {
          enabled: true,
          merchantCapabilityVerified: false,
        })
      ).rejects.toThrow(RecurringPaymentsUnavailableError);

      // 3. With gate enabled and capability true: fails closed with DEC-P8-01 unverified error
      await expect(
        service.executeRecurringCharge(mandate.id, 5000, 'BDT', {
          enabled: true,
          merchantCapabilityVerified: true,
        })
      ).rejects.toThrow('Merchant recurring-payment capability has not been verified (DEC-P8-01)');
    });

    it('getDecryptedTokenForCharge fails closed unless recurring capability is explicitly verified', async () => {
      const { mandate } = await service.initiateMandate(studentId, {
        provider: 'SSLCOMMERZ',
      });

      // Default: unverified
      await expect(service.getDecryptedTokenForCharge(mandate.id)).rejects.toThrow(
        RecurringPaymentsUnavailableError
      );

      // With capability verified: decrypts successfully
      await service.processMandateCallback({
        mandateId: mandate.id,
        status: 'SUCCESS',
        token: 'active-token-secret-123',
      });

      const decrypted = await service.getDecryptedTokenForCharge(mandate.id, {
        enabled: true,
        merchantCapabilityVerified: true,
      });
      expect(decrypted).toBe('active-token-secret-123');
    });
  });
});
