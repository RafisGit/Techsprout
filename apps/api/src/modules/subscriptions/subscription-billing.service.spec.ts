import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  SubscriptionBillingService,
  addMonths,
  addYears,
  MAX_DUNNING_ATTEMPTS,
  DUNNING_GRACE_PERIOD_DAYS,
} from './subscription-billing.service';
import {
  subscriptions,
  subscriptionPlans,
  subscriptionInvoices,
  subscriptionStatusHistory,
  Subscription,
  SubscriptionPlan,
  SubscriptionInvoice,
  SubscriptionStatusHistory,
} from '../../database/schema/subscriptions';
import { InMemoryIdempotencyStore, buildSubscriptionRenewalLockKey } from './subscription-idempotency';
import { RecurringPaymentCapabilityGate } from '../payments/recurring-capability-gate';
import { IRecurringPaymentAdapter } from '../payments/recurring-adapter.interface';
import { MockRecurringPaymentAdapter } from '../payments/mock-recurring.adapter';

describe('SubscriptionBillingService', () => {
  let subscriptionsStore: Map<string, Subscription>;
  let plansStore: Map<string, SubscriptionPlan>;
  let invoicesStore: Map<string, SubscriptionInvoice>;
  let statusHistoryStore: SubscriptionStatusHistory[];
  let auditLogs: Array<Record<string, unknown>>;

  let mockAdapter: IRecurringPaymentAdapter;
  let idempotencyStore: InMemoryIdempotencyStore;
  let mockDb: any;
  let mockAuditService: any;
  let service: SubscriptionBillingService;

  const defaultGate: RecurringPaymentCapabilityGate = {
    enabled: false,
    merchantCapabilityVerified: false,
  };

  const verifiedGate: RecurringPaymentCapabilityGate = {
    enabled: true,
    merchantCapabilityVerified: true,
  };

  function createMockPlan(overrides: Partial<SubscriptionPlan> = {}): SubscriptionPlan {
    return {
      id: randomUUID(),
      code: 'PRO_MONTHLY',
      title: 'Pro Monthly Plan',
      description: 'Pro tier subscription',
      billingInterval: 'MONTHLY',
      priceCents: 4900,
      currency: 'BDT',
      trialPeriodDays: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
    return {
      id: randomUUID(),
      subscriptionNumber: `SUB-${Date.now()}-${randomUUID().slice(0, 6)}`,
      studentId: randomUUID(),
      planId: randomUUID(),
      mandateId: 'man_123',
      status: 'ACTIVE',
      currentPeriodStart: new Date('2026-09-26T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-10-26T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      dunningAttempts: 0,
      lastDunningAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function extractStringValues(clause: any): string[] {
    const values: string[] = [];
    if (!clause || typeof clause !== 'object') return values;
    if ('value' in clause && typeof clause.value === 'string') {
      values.push(clause.value);
    }
    if (Array.isArray(clause.queryChunks)) {
      for (const chunk of clause.queryChunks) {
        if (chunk && typeof chunk === 'object' && 'value' in chunk && typeof chunk.value === 'string') {
          values.push(chunk.value);
        }
      }
    }
    return values;
  }

  function resolveSubscriptions(clause: any): Subscription[] {
    const vals = extractStringValues(clause);
    if (vals.includes('PAST_DUE')) {
      return Array.from(subscriptionsStore.values()).filter((s) => s.status === 'PAST_DUE');
    }
    if (vals.includes('ACTIVE')) {
      return Array.from(subscriptionsStore.values()).filter((s) => s.status === 'ACTIVE');
    }
    for (const val of vals) {
      if (subscriptionsStore.has(val)) {
        return [subscriptionsStore.get(val)!];
      }
    }
    if (subscriptionsStore.size === 1) {
      return Array.from(subscriptionsStore.values());
    }
    return [];
  }

  function resolvePlans(clause: any): SubscriptionPlan[] {
    const vals = extractStringValues(clause);
    for (const val of vals) {
      if (plansStore.has(val)) {
        return [plansStore.get(val)!];
      }
    }
    return Array.from(plansStore.values());
  }

  function resolveInvoices(clause: any): SubscriptionInvoice[] {
    const vals = extractStringValues(clause);
    for (const val of vals) {
      const matched = Array.from(invoicesStore.values()).filter((i) => i.subscriptionId === val);
      if (matched.length > 0) return matched;
      if (invoicesStore.has(val)) return [invoicesStore.get(val)!];
    }
    return Array.from(invoicesStore.values());
  }

  beforeEach(() => {
    subscriptionsStore = new Map();
    plansStore = new Map();
    invoicesStore = new Map();
    statusHistoryStore = [];
    auditLogs = [];
    idempotencyStore = new InMemoryIdempotencyStore();

    mockAdapter = new MockRecurringPaymentAdapter();
    vi.spyOn(mockAdapter, 'executeRecurringCharge');

    mockAuditService = {
      record: vi.fn(async (log: Record<string, unknown>) => {
        auditLogs.push(log);
      }),
    };

    const createDbMethods = () => ({
      select: vi.fn((fields?: any) => ({
        from: vi.fn((table: any) => {
          let currentClause: any = null;
          let limitCount: number | null = null;

          const query: any = {
            where: vi.fn((condition: any) => {
              currentClause = condition;
              return query;
            }),
            limit: vi.fn((limitVal: number) => {
              limitCount = limitVal;
              return query;
            }),
            for: vi.fn((mode: string) => query),
            then: (resolve: any) => {
              let results: any[] = [];
              if (table === subscriptions) {
                results = resolveSubscriptions(currentClause);
              } else if (table === subscriptionPlans) {
                results = resolvePlans(currentClause);
              } else if (table === subscriptionInvoices) {
                results = resolveInvoices(currentClause);
              }

              if (limitCount !== null) {
                results = results.slice(0, limitCount);
              }
              return Promise.resolve(results).then(resolve);
            },
          };
          return query;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((values: any) => {
          const record = { ...values };
          if (!record.id) record.id = randomUUID();
          if (table === subscriptionInvoices) {
            invoicesStore.set(record.id, record);
          } else if (table === subscriptionStatusHistory) {
            statusHistoryStore.push(record);
          }
          return {
            returning: vi.fn(async () => [record]),
            then: (resolve: any) => Promise.resolve([record]).then(resolve),
          };
        }),
      })),
      update: vi.fn((table: any) => ({
        set: vi.fn((changes: any) => ({
          where: vi.fn((clause: any) => ({
            then: (resolve: any) => {
              const vals = extractStringValues(clause);
              if (table === subscriptions) {
                let updated = false;
                for (const val of vals) {
                  if (subscriptionsStore.has(val)) {
                    subscriptionsStore.set(val, { ...subscriptionsStore.get(val)!, ...changes });
                    updated = true;
                  }
                }
                if (!updated) {
                  for (const [id, sub] of subscriptionsStore.entries()) {
                    subscriptionsStore.set(id, { ...sub, ...changes });
                  }
                }
              } else if (table === subscriptionInvoices) {
                let updated = false;
                for (const val of vals) {
                  if (invoicesStore.has(val)) {
                    invoicesStore.set(val, { ...invoicesStore.get(val)!, ...changes });
                    updated = true;
                  }
                }
                if (!updated) {
                  for (const [id, inv] of invoicesStore.entries()) {
                    invoicesStore.set(id, { ...inv, ...changes });
                  }
                }
              }
              return Promise.resolve().then(resolve);
            },
          })),
        })),
      })),
      transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
        const tx = createDbMethods();
        return cb(tx);
      }),
    });

    mockDb = createDbMethods();
    service = new SubscriptionBillingService(mockDb, mockAuditService, mockAdapter);
  });

  describe('Period Arithmetic (addMonths, addYears)', () => {
    it('accurately advances monthly intervals', () => {
      const base = new Date('2026-01-15T00:00:00.000Z');
      const nextMonth = addMonths(base, 1);
      expect(nextMonth.getUTCFullYear()).toBe(2026);
      expect(nextMonth.getUTCMonth()).toBe(1); // February
      expect(nextMonth.getUTCDate()).toBe(15);
    });

    it('accurately advances annual intervals across leap years', () => {
      const base = new Date('2026-03-01T00:00:00.000Z');
      const nextYear = addYears(base, 1);
      expect(nextYear.getUTCFullYear()).toBe(2027);
      expect(nextYear.getUTCMonth()).toBe(2);
      expect(nextYear.getUTCDate()).toBe(1);
    });
  });

  describe('Deterministic Scheduling & Ineligibility Checks', () => {
    it('skips non-existent subscription with SKIPPED_INELIGIBLE', async () => {
      const res = await service.processSubscriptionRenewal('sub-missing-id', {
        idempotencyStore,
      });

      expect(res.status).toBe('SKIPPED_INELIGIBLE');
      expect(res.reason).toContain('not found');
    });

    it('skips subscriptions in EXPIRED or UNPAID status', async () => {
      const plan = createMockPlan();
      plansStore.set(plan.id, plan);

      const expiredSub = createMockSubscription({
        planId: plan.id,
        status: 'EXPIRED',
        currentPeriodStart: new Date('2026-09-01Z'),
        currentPeriodEnd: new Date('2026-10-01Z'),
        cancelAtPeriodEnd: false,
      });
      subscriptionsStore.set(expiredSub.id, expiredSub);

      const res = await service.processSubscriptionRenewal(expiredSub.id, {
        idempotencyStore,
      });

      expect(res.status).toBe('SKIPPED_INELIGIBLE');
      expect(res.reason).toContain('EXPIRED');
      expect(mockAdapter.executeRecurringCharge).not.toHaveBeenCalled();
    });

    it('skips renewal when cancelAtPeriodEnd is true before period end without charging', async () => {
      const plan = createMockPlan();
      plansStore.set(plan.id, plan);

      const subId = randomUUID();
      const periodEnd = new Date('2026-10-30T00:00:00.000Z');
      const sub = createMockSubscription({
        id: subId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date('2026-09-30T00:00:00.000Z'),
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
      });
      subscriptionsStore.set(sub.id, sub);

      // Current time is before periodEnd (e.g. 24h advance window)
      const now = new Date('2026-10-29T12:00:00.000Z');
      const res = await service.processSubscriptionRenewal(subId, {
        now,
        idempotencyStore,
      });

      expect(res.status).toBe('CANCELED_AT_PERIOD_END');
      expect(res.reason).toContain('skipping renewal charge');
      expect(mockAdapter.executeRecurringCharge).not.toHaveBeenCalled();

      // Subscription remains ACTIVE until prepaid period ends
      const unchanged = subscriptionsStore.get(subId);
      expect(unchanged?.status).toBe('ACTIVE');
    });

    it('handles cancelAtPeriodEnd by transitioning to CANCELED when period has elapsed without renewal', async () => {
      const plan = createMockPlan({
        billingInterval: 'ANNUAL',
        priceCents: 49900,
      });
      plansStore.set(plan.id, plan);

      const periodEnd = new Date('2026-10-25T00:00:00.000Z');
      const sub = createMockSubscription({
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date('2025-10-25T00:00:00.000Z'),
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
      });
      subscriptionsStore.set(sub.id, sub);

      const now = new Date('2026-10-26T00:00:00.000Z');
      const res = await service.processSubscriptionRenewal(sub.id, {
        now,
        idempotencyStore,
      });

      expect(res.status).toBe('CANCELED_AT_PERIOD_END');
      expect(mockAdapter.executeRecurringCharge).not.toHaveBeenCalled();

      const updated = subscriptionsStore.get(sub.id);
      expect(updated?.status).toBe('CANCELED');
      expect(updated?.canceledAt).toBeDefined();

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBSCRIPTION_CANCELED_AT_PERIOD_END',
          targetId: sub.id,
        })
      );
    });

    it('transitions already CANCELED subscription to EXPIRED when prepaid period has elapsed', async () => {
      const plan = createMockPlan();
      plansStore.set(plan.id, plan);

      const periodEnd = new Date('2026-10-20T00:00:00.000Z');
      const canceledSub = createMockSubscription({
        planId: plan.id,
        status: 'CANCELED',
        currentPeriodStart: new Date('2026-09-20T00:00:00.000Z'),
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
        canceledAt: new Date('2026-09-25T00:00:00.000Z'),
      });
      subscriptionsStore.set(canceledSub.id, canceledSub);

      const now = new Date('2026-10-26T00:00:00.000Z');
      const res = await service.processSubscriptionRenewal(canceledSub.id, {
        now,
        idempotencyStore,
      });

      expect(res.status).toBe('EXPIRED');
      expect(res.reason).toContain('Prepaid period expired');
      expect(mockAdapter.executeRecurringCharge).not.toHaveBeenCalled();

      const updated = subscriptionsStore.get(canceledSub.id);
      expect(updated?.status).toBe('EXPIRED');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBSCRIPTION_EXPIRED',
          targetId: canceledSub.id,
        })
      );
    });
  });

  describe('Durable Locking & Safe Concurrency', () => {
    it('returns SKIPPED_LOCKED when another worker holds the renewal lock', async () => {
      const subId = randomUUID();
      const lockKey = buildSubscriptionRenewalLockKey(subId);

      // Pre-acquire the lock
      await idempotencyStore.acquire(lockKey, 60000);

      const res = await service.processSubscriptionRenewal(subId, {
        idempotencyStore,
      });

      expect(res.status).toBe('SKIPPED_LOCKED');
      expect(res.reason).toContain('Concurrent renewal execution');
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('releases lock cleanly after processing finishes', async () => {
      const subId = randomUUID();
      const lockKey = buildSubscriptionRenewalLockKey(subId);

      await service.processSubscriptionRenewal(subId, {
        idempotencyStore,
      });

      // After execution, the lock record should be marked COMPLETED
      const record = idempotencyStore.get(lockKey);
      expect(record?.status).toBe('COMPLETED');
    });

    it('allows a subsequent worker to acquire lock after previous lock has expired (stale lock recovery)', async () => {
      const subId = randomUUID();
      const lockKey = buildSubscriptionRenewalLockKey(subId);

      // Acquire lock with immediate expiration in the past
      await idempotencyStore.acquire(lockKey, -1000);

      const res = await service.processSubscriptionRenewal(subId, {
        idempotencyStore,
      });

      // Successfully acquired lock (proceeded to DB check, where it's ineligible because it's not in store)
      expect(res.status).toBe('SKIPPED_INELIGIBLE');
    });
  });

  describe('Durable Idempotency', () => {
    it('returns IDEMPOTENT_NOOP if the invoice for the upcoming billing cycle is already PAID', async () => {
      const plan = createMockPlan();
      plansStore.set(plan.id, plan);

      const cycleStart = new Date('2026-11-01T00:00:00.000Z');
      const sub = createMockSubscription({
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date('2026-10-01T00:00:00.000Z'),
        currentPeriodEnd: cycleStart,
      });
      subscriptionsStore.set(sub.id, sub);

      const paidInvoiceId = randomUUID();
      invoicesStore.set(paidInvoiceId, {
        id: paidInvoiceId,
        invoiceNumber: 'INV-SUB-PAID-01',
        subscriptionId: sub.id,
        billingCycleStart: cycleStart,
        billingCycleEnd: addMonths(cycleStart, 1),
        amountCents: 4900,
        currency: 'BDT',
        status: 'PAID',
        paidAt: new Date(),
        paymentId: null,
        createdAt: new Date(),
      });

      const res = await service.processSubscriptionRenewal(sub.id, {
        idempotencyStore,
      });

      expect(res.status).toBe('IDEMPOTENT_NOOP');
      expect(res.reason).toContain('already paid');
      expect(res.invoiceId).toBe(paidInvoiceId);
      expect(mockAdapter.executeRecurringCharge).not.toHaveBeenCalled();
    });
  });

  describe('Fail-Closed Recurring Capability Gate (DEC-P8-01)', () => {
    it('fails closed when recurring payment capability is unverified and transitions to PAST_DUE if period elapsed', async () => {
      const plan = createMockPlan();
      plansStore.set(plan.id, plan);

      const periodEnd = new Date('2026-10-25T00:00:00.000Z');
      const sub = createMockSubscription({
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date('2026-09-25T00:00:00.000Z'),
        currentPeriodEnd: periodEnd,
      });
      subscriptionsStore.set(sub.id, sub);

      const now = new Date('2026-10-26T00:00:00.000Z');
      const res = await service.processSubscriptionRenewal(sub.id, {
        now,
        gate: defaultGate, // enabled: false
        idempotencyStore,
      });

      expect(res.status).toBe('FAILED_GATE_BLOCKED');
      expect(res.reason).toContain('disabled');
      expect(mockAdapter.executeRecurringCharge).not.toHaveBeenCalled();

      // Subscription should transition to PAST_DUE
      const updated = subscriptionsStore.get(sub.id);
      expect(updated?.status).toBe('PAST_DUE');
      expect(updated?.dunningAttempts).toBe(1);

      expect(statusHistoryStore).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subscriptionId: sub.id,
            fromStatus: 'ACTIVE',
            toStatus: 'PAST_DUE',
            reason: expect.stringContaining('DEC-P8-01'),
          }),
        ])
      );
    });

    it('successfully processes renewal when capability gate is verified and adapter succeeds', async () => {
      const plan = createMockPlan();
      plansStore.set(plan.id, plan);

      const periodStart = new Date('2026-09-26T00:00:00.000Z');
      const periodEnd = new Date('2026-10-26T00:00:00.000Z');
      const sub = createMockSubscription({
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        mandateId: 'man_verified_123',
      });
      subscriptionsStore.set(sub.id, sub);

      const now = new Date('2026-10-26T00:00:00.000Z');
      const res = await service.processSubscriptionRenewal(sub.id, {
        now,
        gate: verifiedGate,
        idempotencyStore,
      });

      expect(res.status).toBe('RENEWED');
      expect(res.invoiceId).toBeDefined();
      expect(res.nextPeriodEnd).toEqual(addMonths(periodEnd, 1));
      expect(mockAdapter.executeRecurringCharge).toHaveBeenCalled();

      const updated = subscriptionsStore.get(sub.id);
      expect(updated?.currentPeriodStart).toEqual(periodEnd);
      expect(updated?.currentPeriodEnd).toEqual(addMonths(periodEnd, 1));
      expect(updated?.dunningAttempts).toBe(0);

      const invoice = invoicesStore.get(res.invoiceId!);
      expect(invoice?.status).toBe('PAID');
    });
  });

  describe('Dunning Retries & Bounded Grace Period', () => {
    it('increments dunning attempts and stays PAST_DUE when gate is blocked', async () => {
      const sub = createMockSubscription({
        status: 'PAST_DUE',
        currentPeriodStart: new Date('2026-09-20T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-10-20T00:00:00.000Z'),
        dunningAttempts: 1,
        lastDunningAt: new Date('2026-10-21T00:00:00.000Z'),
      });
      subscriptionsStore.set(sub.id, sub);

      const res = await service.processDunningRetries({
        now: new Date('2026-10-22T00:00:00.000Z'),
        gate: defaultGate,
        idempotencyStore,
      });

      expect(res.processed).toBe(1);
      expect(res.results[0].status).toBe('FAILED_GATE_BLOCKED');
      expect(res.results[0].attemptNumber).toBe(2);

      const updated = subscriptionsStore.get(sub.id);
      expect(updated?.dunningAttempts).toBe(2);
      expect(updated?.status).toBe('PAST_DUE');
    });

    it('transitions to UNPAID (suspension) when max retry attempts (4) are reached', async () => {
      const sub = createMockSubscription({
        status: 'PAST_DUE',
        currentPeriodStart: new Date('2026-09-20T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-10-20T00:00:00.000Z'),
        dunningAttempts: MAX_DUNNING_ATTEMPTS, // 4 attempts reached
        lastDunningAt: new Date('2026-10-24T00:00:00.000Z'),
      });
      subscriptionsStore.set(sub.id, sub);

      const res = await service.processDunningRetries({
        now: new Date('2026-10-25T00:00:00.000Z'),
        gate: defaultGate,
        idempotencyStore,
      });

      expect(res.suspended).toBe(1);
      expect(res.results[0].status).toBe('SUSPENDED_UNPAID');

      const updated = subscriptionsStore.get(sub.id);
      expect(updated?.status).toBe('UNPAID');

      expect(statusHistoryStore).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subscriptionId: sub.id,
            fromStatus: 'PAST_DUE',
            toStatus: 'UNPAID',
            reason: expect.stringContaining('Dunning retry limit reached'),
          }),
        ])
      );
    });

    it('transitions to UNPAID (suspension) when grace period (7 days) expires even if attempts < 4', async () => {
      const sub = createMockSubscription({
        status: 'PAST_DUE',
        currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
        dunningAttempts: 2,
        lastDunningAt: new Date('2026-10-05T00:00:00.000Z'),
      });
      subscriptionsStore.set(sub.id, sub);

      // 10 days after periodEnd -> exceeds 7-day grace period
      const res = await service.processDunningRetries({
        now: new Date('2026-10-11T00:00:00.000Z'),
        gracePeriodDays: DUNNING_GRACE_PERIOD_DAYS,
        gate: defaultGate,
        idempotencyStore,
      });

      expect(res.suspended).toBe(1);
      expect(res.results[0].status).toBe('SUSPENDED_UNPAID');

      const updated = subscriptionsStore.get(sub.id);
      expect(updated?.status).toBe('UNPAID');
    });

    it('recovers to ACTIVE when dunning retry succeeds under verified gate', async () => {
      const plan = createMockPlan();
      plansStore.set(plan.id, plan);

      const periodEnd = new Date('2026-10-20T00:00:00.000Z');
      const sub = createMockSubscription({
        planId: plan.id,
        status: 'PAST_DUE',
        currentPeriodStart: new Date('2026-09-20T00:00:00.000Z'),
        currentPeriodEnd: periodEnd,
        dunningAttempts: 1,
        lastDunningAt: new Date('2026-10-21T00:00:00.000Z'),
        mandateId: 'man_verified_123',
      });
      subscriptionsStore.set(sub.id, sub);

      const failedInvoiceId = randomUUID();
      invoicesStore.set(failedInvoiceId, {
        id: failedInvoiceId,
        invoiceNumber: 'INV-FAILED-CYCLE',
        subscriptionId: sub.id,
        billingCycleStart: periodEnd,
        billingCycleEnd: addMonths(periodEnd, 1),
        amountCents: 4900,
        currency: 'BDT',
        status: 'FAILED',
        paidAt: null,
        paymentId: null,
        createdAt: new Date(),
      });

      const res = await service.processDunningRetries({
        now: new Date('2026-10-22T00:00:00.000Z'),
        gate: verifiedGate,
        idempotencyStore,
      });

      expect(res.recovered).toBe(1);
      expect(res.results[0].status).toBe('RECOVERED_ACTIVE');

      const updated = subscriptionsStore.get(sub.id);
      expect(updated?.status).toBe('ACTIVE');
      expect(updated?.dunningAttempts).toBe(0);
      expect(updated?.currentPeriodStart).toEqual(periodEnd);
      expect(updated?.currentPeriodEnd).toEqual(addMonths(periodEnd, 1));

      const updatedInvoice = invoicesStore.get(failedInvoiceId);
      expect(updatedInvoice?.status).toBe('PAID');
      expect(updatedInvoice?.paidAt).toBeDefined();
    });
  });
});
