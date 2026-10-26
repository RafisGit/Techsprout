/**
 * Webhook idempotency and distributed concurrency guards for Phase 8.0 subscriptions.
 *
 * Enforces:
 * 1. Deterministic idempotency keying across gateway webhooks and IPN events.
 * 2. Distributed lock keys for recurring renewals to prevent concurrent double-billing.
 * 3. Event-deduplication records to reject replay attacks.
 */

export interface IdempotencyRecord<T = unknown> {
  key: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: T;
  error?: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Builds the canonical idempotency key for payment gateway IPN events.
 * Rejects whitespace and empty parameters.
 */
export function buildGatewayWebhookIdempotencyKey(
  provider: string,
  eventType: string,
  eventIdOrTranId: string
): string {
  const cleanProvider = provider.trim().toLowerCase();
  const cleanEventType = eventType.trim().toLowerCase();
  const cleanId = eventIdOrTranId.trim();

  if (!cleanProvider || !cleanEventType || !cleanId) {
    throw new Error('All idempotency parameters (provider, eventType, eventIdOrTranId) must be non-empty');
  }

  return `sub_ipn:${cleanProvider}:${cleanEventType}:${cleanId}`;
}

/**
 * Builds the Redis distributed lock key for subscription billing and renewal execution.
 * Ensures only one renewal worker or retry process can charge a subscription at a time.
 */
export function buildSubscriptionRenewalLockKey(subscriptionId: string): string {
  const cleanId = subscriptionId.trim();
  if (!cleanId) {
    throw new Error('subscriptionId cannot be empty');
  }
  return `lock:subscription:renewal:${cleanId}`;
}

/**
 * Builds the cache key for caching student active entitlement status in Redis.
 */
export function buildSubscriptionEntitlementCacheKey(studentId: string): string {
  const cleanId = studentId.trim();
  if (!cleanId) {
    throw new Error('studentId cannot be empty');
  }
  return `cache:subscription:entitlement:${cleanId}`;
}

/**
 * In-memory idempotency tracker used in unit tests and local execution environments.
 */
export class InMemoryIdempotencyStore {
  private readonly store = new Map<string, IdempotencyRecord>();

  get(key: string): IdempotencyRecord | undefined {
    return this.store.get(key);
  }

  async acquire(key: string, ttlMs: number = 60000): Promise<{ acquired: boolean; existing?: IdempotencyRecord }> {
    const existing = this.store.get(key);
    const now = new Date();

    if (existing && existing.expiresAt > now) {
      return { acquired: false, existing };
    }

    const record: IdempotencyRecord = {
      key,
      status: 'PROCESSING',
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };
    this.store.set(key, record);
    return { acquired: true };
  }

  async complete<T>(key: string, result: T): Promise<void> {
    const record = this.store.get(key);
    if (record) {
      record.status = 'COMPLETED';
      record.result = result;
    }
  }

  async fail(key: string, errorMessage: string): Promise<void> {
    const record = this.store.get(key);
    if (record) {
      record.status = 'FAILED';
      record.error = errorMessage;
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
