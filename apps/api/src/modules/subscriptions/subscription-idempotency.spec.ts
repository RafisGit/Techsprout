import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildGatewayWebhookIdempotencyKey,
  buildSubscriptionRenewalLockKey,
  buildSubscriptionEntitlementCacheKey,
  InMemoryIdempotencyStore,
} from './subscription-idempotency';

describe('Subscription Idempotency & Distributed Concurrency Guards', () => {
  describe('buildGatewayWebhookIdempotencyKey', () => {
    it('builds canonical composite key', () => {
      const key = buildGatewayWebhookIdempotencyKey('SSLCOMMERZ', 'IPN_RECURRING', 'VAL_998811');
      expect(key).toBe('sub_ipn:sslcommerz:ipn_recurring:VAL_998811');
    });

    it('normalizes provider and eventType to lowercase and trims whitespace', () => {
      const key = buildGatewayWebhookIdempotencyKey('  bKash  ', '  MANDATE_SUCCESS  ', '  AGR-1234  ');
      expect(key).toBe('sub_ipn:bkash:mandate_success:AGR-1234');
    });

    it('rejects empty or whitespace-only parameters', () => {
      expect(() => buildGatewayWebhookIdempotencyKey('', 'IPN', '123')).toThrow();
      expect(() => buildGatewayWebhookIdempotencyKey('sslcommerz', '  ', '123')).toThrow();
      expect(() => buildGatewayWebhookIdempotencyKey('sslcommerz', 'IPN', '')).toThrow();
    });
  });

  describe('buildSubscriptionRenewalLockKey', () => {
    it('builds distributed lock key with prefix', () => {
      const lockKey = buildSubscriptionRenewalLockKey('sub-uuid-4455');
      expect(lockKey).toBe('lock:subscription:renewal:sub-uuid-4455');
    });

    it('rejects empty subscription ID', () => {
      expect(() => buildSubscriptionRenewalLockKey('   ')).toThrow('subscriptionId cannot be empty');
    });
  });

  describe('buildSubscriptionEntitlementCacheKey', () => {
    it('builds cache key with prefix', () => {
      const cacheKey = buildSubscriptionEntitlementCacheKey('student-123');
      expect(cacheKey).toBe('cache:subscription:entitlement:student-123');
    });
  });

  describe('InMemoryIdempotencyStore', () => {
    let store: InMemoryIdempotencyStore;

  beforeEach(() => {
      store = new InMemoryIdempotencyStore();
    });

    it('acquires lock for new idempotency key', async () => {
      const { acquired, existing } = await store.acquire('test:key:1');
      expect(acquired).toBe(true);
      expect(existing).toBeUndefined();
    });

    it('rejects concurrent acquisition while processing', async () => {
      const first = await store.acquire('test:key:2');
      expect(first.acquired).toBe(true);

      const second = await store.acquire('test:key:2');
      expect(second.acquired).toBe(false);
      expect(second.existing?.status).toBe('PROCESSING');
    });

    it('returns completed result on replay of finished event', async () => {
      await store.acquire('test:key:3');
      await store.complete('test:key:3', { processed: true, invoiceId: 'inv-101' });

      const replay = await store.acquire('test:key:3');
      expect(replay.acquired).toBe(false);
      expect(replay.existing?.status).toBe('COMPLETED');
      expect(replay.existing?.result).toEqual({ processed: true, invoiceId: 'inv-101' });
    });

    it('records error state on failure', async () => {
      await store.acquire('test:key:4');
      await store.fail('test:key:4', 'Gateway connection timeout');

      // Failed events can be inspected
      const check = await store.acquire('test:key:4');
      expect(check.existing?.status).toBe('FAILED');
      expect(check.existing?.error).toBe('Gateway connection timeout');
    });
  });
});
