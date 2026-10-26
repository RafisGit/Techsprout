import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { eq, and, lte, gt, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  subscriptions,
  subscriptionPlans,
  subscriptionInvoices,
  subscriptionStatusHistory,
  Subscription,
  SubscriptionPlan,
  SubscriptionInvoice,
} from '../../database/schema/subscriptions';
import { AuditService } from '../audit/audit.service';
import {
  transitionSubscriptionStatus,
  canTransitionSubscriptionStatus,
} from './subscription-lifecycle';
import {
  buildSubscriptionRenewalLockKey,
  InMemoryIdempotencyStore,
} from './subscription-idempotency';
import {
  assertRecurringPaymentsAvailable,
  RecurringPaymentCapabilityGate,
  RecurringPaymentsUnavailableError,
} from '../payments/recurring-capability-gate';
import {
  IRecurringPaymentAdapter,
  RECURRING_PAYMENT_ADAPTER,
} from '../payments/recurring-adapter.interface';

export const MAX_DUNNING_ATTEMPTS = 4;
export const DUNNING_GRACE_PERIOD_DAYS = 7;
export const DEFAULT_RENEWAL_WINDOW_HOURS = 24;
export const DEFAULT_LOCK_TTL_MS = 60000; // 60 seconds

export interface ProcessRenewalsOptions {
  now?: Date;
  windowHours?: number;
  limit?: number;
  gate?: RecurringPaymentCapabilityGate;
  idempotencyStore?: InMemoryIdempotencyStore;
}

export interface ProcessSubscriptionOptions {
  now?: Date;
  gate?: RecurringPaymentCapabilityGate;
  idempotencyStore?: InMemoryIdempotencyStore;
}

export interface RenewalResult {
  subscriptionId: string;
  status:
    | 'RENEWED'
    | 'IDEMPOTENT_NOOP'
    | 'CANCELED_AT_PERIOD_END'
    | 'EXPIRED'
    | 'SKIPPED_INELIGIBLE'
    | 'SKIPPED_LOCKED'
    | 'FAILED_GATE_BLOCKED'
    | 'FAILED_CHARGE';
  reason?: string;
  invoiceId?: string;
  nextPeriodEnd?: Date;
}

export interface RenewalBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: RenewalResult[];
}

export interface ProcessDunningOptions {
  now?: Date;
  maxAttempts?: number;
  gracePeriodDays?: number;
  limit?: number;
  gate?: RecurringPaymentCapabilityGate;
  idempotencyStore?: InMemoryIdempotencyStore;
}

export interface DunningResult {
  subscriptionId: string;
  status:
    | 'RECOVERED_ACTIVE'
    | 'RETRIED_PAST_DUE'
    | 'SUSPENDED_UNPAID'
    | 'EXPIRED'
    | 'SKIPPED_INELIGIBLE'
    | 'SKIPPED_LOCKED'
    | 'FAILED_GATE_BLOCKED';
  attemptNumber?: number;
  reason?: string;
}

export interface DunningBatchResult {
  processed: number;
  recovered: number;
  retried: number;
  suspended: number;
  skipped: number;
  results: DunningResult[];
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

@Injectable()
export class SubscriptionBillingService {
  private readonly logger = new Logger(SubscriptionBillingService.name);
  private readonly defaultIdempotencyStore = new InMemoryIdempotencyStore();

  // Fail-closed gate: disabled and unverified by default per DEC-P8-01
  private capabilityGate: RecurringPaymentCapabilityGate = {
    enabled: false,
    merchantCapabilityVerified: false,
  };

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional()
    @Inject(RECURRING_PAYMENT_ADAPTER)
    private readonly adapter?: IRecurringPaymentAdapter
  ) {}

  /**
   * Configures the recurring capability gate (used in isolated testing).
   */
  public setCapabilityGate(gate: RecurringPaymentCapabilityGate): void {
    this.capabilityGate = gate;
  }

  /**
   * Processes all active subscriptions due for renewal within the configured time window.
   */
  async processDueRenewals(
    options: ProcessRenewalsOptions = {}
  ): Promise<RenewalBatchResult> {
    const now = options.now ?? new Date();
    const windowHours = options.windowHours ?? DEFAULT_RENEWAL_WINDOW_HOURS;
    const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

    const dueSubscriptions = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'ACTIVE'),
          lte(subscriptions.currentPeriodEnd, windowEnd)
        )
      )
      .limit(options.limit ?? 50);

    const results: RenewalResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const sub of dueSubscriptions) {
      const res = await this.processSubscriptionRenewal(sub.id, {
        now,
        gate: options.gate ?? this.capabilityGate,
        idempotencyStore: options.idempotencyStore ?? this.defaultIdempotencyStore,
      });

      results.push(res);
      if (res.status === 'RENEWED' || res.status === 'IDEMPOTENT_NOOP') {
        succeeded++;
      } else if (
        res.status === 'FAILED_GATE_BLOCKED' ||
        res.status === 'FAILED_CHARGE'
      ) {
        failed++;
      } else {
        skipped++;
      }
    }

    return {
      processed: dueSubscriptions.length,
      succeeded,
      failed,
      skipped,
      results,
    };
  }

  /**
   * Renews an individual subscription with durable locking, idempotency, and fail-closed security.
   */
  async processSubscriptionRenewal(
    subscriptionId: string,
    options: ProcessSubscriptionOptions = {}
  ): Promise<RenewalResult> {
    const now = options.now ?? new Date();
    const gate = options.gate ?? this.capabilityGate;
    const idempotencyStore =
      options.idempotencyStore ?? this.defaultIdempotencyStore;

    // 1. Acquire distributed renewal lock to prevent concurrent double-billing
    const lockKey = buildSubscriptionRenewalLockKey(subscriptionId);
    const lockAcquired = await idempotencyStore.acquire(lockKey, DEFAULT_LOCK_TTL_MS);
    if (!lockAcquired.acquired) {
      this.logger.warn(
        `[RENEWAL_LOCKED] Subscription ${subscriptionId} is currently being processed by another worker.`
      );
      return {
        subscriptionId,
        status: 'SKIPPED_LOCKED',
        reason: 'Concurrent renewal execution in progress',
      };
    }

    try {
      return await this.db.transaction(async (tx) => {
        // 2. Row-level lock inside database transaction
        const [sub] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, subscriptionId))
          .for('update');

        if (!sub) {
          return {
            subscriptionId,
            status: 'SKIPPED_INELIGIBLE',
            reason: 'Subscription record not found',
          };
        }

        // 3. Handle already CANCELED subscription: transition to EXPIRED when period ends
        if (sub.status === 'CANCELED' && now >= sub.currentPeriodEnd) {
          if (canTransitionSubscriptionStatus('CANCELED', 'EXPIRED')) {
            const nextStatus = transitionSubscriptionStatus('CANCELED', 'EXPIRED');
            await tx
              .update(subscriptions)
              .set({
                status: nextStatus,
                updatedAt: now,
              })
              .where(eq(subscriptions.id, sub.id));

            await tx.insert(subscriptionStatusHistory).values({
              id: randomUUID(),
              subscriptionId: sub.id,
              fromStatus: 'CANCELED',
              toStatus: nextStatus,
              reason: 'Canceled subscription prepaid period has expired',
            });

            await this.auditService.record({
              actorId: sub.studentId,
              action: 'SUBSCRIPTION_EXPIRED',
              targetType: 'SUBSCRIPTION',
              targetId: sub.id,
            });
          }

          return {
            subscriptionId,
            status: 'EXPIRED',
            reason: 'Prepaid period expired; subscription marked EXPIRED',
          };
        }

        // 3b. Handle ACTIVE subscription with cancel-at-period-end: transition to CANCELED when period ends, or skip renewal if still within prepaid period
        if (sub.cancelAtPeriodEnd) {
          if (now >= sub.currentPeriodEnd) {
            const fromStatus = sub.status;
            if (fromStatus === 'ACTIVE' && canTransitionSubscriptionStatus(fromStatus, 'CANCELED')) {
              const nextStatus = transitionSubscriptionStatus(fromStatus, 'CANCELED');
              await tx
                .update(subscriptions)
                .set({
                  status: nextStatus,
                  canceledAt: now,
                  updatedAt: now,
                })
                .where(eq(subscriptions.id, sub.id));

              await tx.insert(subscriptionStatusHistory).values({
                id: randomUUID(),
                subscriptionId: sub.id,
                fromStatus,
                toStatus: nextStatus,
                reason: 'Subscription canceled at period end per customer request',
              });

              await this.auditService.record({
                actorId: sub.studentId,
                action: 'SUBSCRIPTION_CANCELED_AT_PERIOD_END',
                targetType: 'SUBSCRIPTION',
                targetId: sub.id,
              });
            }

            return {
              subscriptionId,
              status: 'CANCELED_AT_PERIOD_END',
              reason: 'Prepaid period ended; subscription canceled without renewal',
            };
          }

          // If still within prepaid period, do not generate invoices or charge renewals
          return {
            subscriptionId,
            status: 'CANCELED_AT_PERIOD_END',
            reason: 'Subscription scheduled for cancellation at period end; skipping renewal charge',
          };
        }

        // 4. Ineligible status check
        if (sub.status !== 'ACTIVE') {
          return {
            subscriptionId,
            status: 'SKIPPED_INELIGIBLE',
            reason: `Subscription in ${sub.status} status is not eligible for renewal`,
          };
        }

        // 5. Fetch plan to determine pricing and interval
        const [plan] = await tx
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, sub.planId));

        if (!plan) {
          return {
            subscriptionId,
            status: 'SKIPPED_INELIGIBLE',
            reason: `Associated plan ${sub.planId} not found`,
          };
        }

        const cycleStart = sub.currentPeriodEnd;
        const cycleEnd =
          plan.billingInterval === 'ANNUAL'
            ? addYears(cycleStart, 1)
            : addMonths(cycleStart, 1);

        // 6. Idempotency check: see if invoice for this cycle was already generated
        const existingInvoices = await tx
          .select()
          .from(subscriptionInvoices)
          .where(
            and(
              eq(subscriptionInvoices.subscriptionId, sub.id),
              eq(subscriptionInvoices.billingCycleStart, cycleStart)
            )
          );

        const paidInvoice = existingInvoices.find((inv) => inv.status === 'PAID');
        if (paidInvoice) {
          return {
            subscriptionId,
            status: 'IDEMPOTENT_NOOP',
            reason: 'Billing cycle already paid',
            invoiceId: paidInvoice.id,
          };
        }

        // 7. Get or create PENDING invoice for the upcoming cycle
        let currentInvoice = existingInvoices.find((inv) => inv.status === 'PENDING');
        if (!currentInvoice) {
          const invoiceNumber = `INV-SUB-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
          const [created] = await tx
            .insert(subscriptionInvoices)
            .values({
              id: randomUUID(),
              invoiceNumber,
              subscriptionId: sub.id,
              billingCycleStart: cycleStart,
              billingCycleEnd: cycleEnd,
              amountCents: plan.priceCents,
              currency: plan.currency,
              status: 'PENDING',
            })
            .returning();
          currentInvoice = created;
        }

        // 8. Mandatory Fail-Closed Recurring Capability Gate Check
        try {
          assertRecurringPaymentsAvailable(gate);
        } catch (gateError) {
          const reason =
            gateError instanceof RecurringPaymentsUnavailableError
              ? gateError.reason
              : 'RECURRING_CAPABILITY_UNVERIFIED';

          this.logger.warn(
            `[RENEWAL_GATE_BLOCKED] Subscription ${sub.id} renewal blocked by capability gate: ${reason}`
          );

          // If the prepaid period has elapsed and payment cannot be executed, transition to PAST_DUE
          if (now >= sub.currentPeriodEnd && canTransitionSubscriptionStatus(sub.status, 'PAST_DUE')) {
            const nextStatus = transitionSubscriptionStatus(sub.status, 'PAST_DUE');
            await tx
              .update(subscriptions)
              .set({
                status: nextStatus,
                dunningAttempts: 1,
                lastDunningAt: now,
                updatedAt: now,
              })
              .where(eq(subscriptions.id, sub.id));

            await tx.insert(subscriptionStatusHistory).values({
              id: randomUUID(),
              subscriptionId: sub.id,
              fromStatus: sub.status,
              toStatus: nextStatus,
              reason: 'Renewal debit blocked: recurring payment capability unverified (DEC-P8-01)',
            });
          }

          await this.auditService.record({
            actorId: sub.studentId,
            action: 'SUBSCRIPTION_RENEWAL_GATE_BLOCKED',
            targetType: 'SUBSCRIPTION',
            targetId: sub.id,
            metadata: { reason },
          });

          return {
            subscriptionId,
            status: 'FAILED_GATE_BLOCKED',
            reason: (gateError as Error).message,
            invoiceId: currentInvoice.id,
          };
        }

        // 9. Execute recurring charge via provider adapter (only reached if capability is verified)
        if (!this.adapter || !sub.mandateId) {
          return {
            subscriptionId,
            status: 'FAILED_CHARGE',
            reason: 'No recurring adapter or mandate configured',
            invoiceId: currentInvoice.id,
          };
        }

        try {
          const chargeResult = await this.adapter.executeRecurringCharge({
            mandateId: sub.mandateId,
            amountCents: plan.priceCents,
            currency: plan.currency,
            idempotencyKey: `sub_charge:${sub.id}:${cycleStart.getTime()}`,
            gate,
          });

          if (chargeResult.status === 'SUCCESS') {
            // Update invoice to PAID
            await tx
              .update(subscriptionInvoices)
              .set({
                status: 'PAID',
                paidAt: now,
              })
              .where(eq(subscriptionInvoices.id, currentInvoice.id));

            // Extend subscription period forward
            await tx
              .update(subscriptions)
              .set({
                currentPeriodStart: cycleStart,
                currentPeriodEnd: cycleEnd,
                dunningAttempts: 0,
                updatedAt: now,
              })
              .where(eq(subscriptions.id, sub.id));

            await this.auditService.record({
              actorId: sub.studentId,
              action: 'SUBSCRIPTION_RENEWED',
              targetType: 'SUBSCRIPTION',
              targetId: sub.id,
              metadata: {
                invoiceId: currentInvoice.id,
                amountCents: plan.priceCents,
                nextPeriodEnd: cycleEnd.toISOString(),
              },
            });

            return {
              subscriptionId,
              status: 'RENEWED',
              invoiceId: currentInvoice.id,
              nextPeriodEnd: cycleEnd,
            };
          }

          // Provider charge declined
          await tx
            .update(subscriptionInvoices)
            .set({ status: 'FAILED' })
            .where(eq(subscriptionInvoices.id, currentInvoice.id));

          if (canTransitionSubscriptionStatus(sub.status, 'PAST_DUE')) {
            const nextStatus = transitionSubscriptionStatus(sub.status, 'PAST_DUE');
            await tx
              .update(subscriptions)
              .set({
                status: nextStatus,
                dunningAttempts: 1,
                lastDunningAt: now,
                updatedAt: now,
              })
              .where(eq(subscriptions.id, sub.id));

            await tx.insert(subscriptionStatusHistory).values({
              id: randomUUID(),
              subscriptionId: sub.id,
              fromStatus: sub.status,
              toStatus: nextStatus,
              reason: 'Payment provider declined recurring renewal charge',
            });
          }

          return {
            subscriptionId,
            status: 'FAILED_CHARGE',
            reason: 'Provider declined charge',
            invoiceId: currentInvoice.id,
          };
        } catch (err) {
          return {
            subscriptionId,
            status: 'FAILED_CHARGE',
            reason: (err as Error).message,
            invoiceId: currentInvoice.id,
          };
        }
      });
    } finally {
      await idempotencyStore.complete(lockKey, { completedAt: new Date() });
    }
  }

  /**
   * Processes dunning retries for past-due subscriptions.
   * Enforces 7-day grace period, maximum 4 retry attempts, and transitions to UNPAID when exhausted.
   */
  async processDunningRetries(
    options: ProcessDunningOptions = {}
  ): Promise<DunningBatchResult> {
    const now = options.now ?? new Date();
    const maxAttempts = options.maxAttempts ?? MAX_DUNNING_ATTEMPTS;
    const gracePeriodDays = options.gracePeriodDays ?? DUNNING_GRACE_PERIOD_DAYS;
    const gate = options.gate ?? this.capabilityGate;

    const pastDueSubscriptions = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.status, 'PAST_DUE'))
      .limit(options.limit ?? 50);

    const results: DunningResult[] = [];
    let recovered = 0;
    let retried = 0;
    let suspended = 0;
    let skipped = 0;

    for (const sub of pastDueSubscriptions) {
      const lockKey = buildSubscriptionRenewalLockKey(sub.id);
      const store = options.idempotencyStore ?? this.defaultIdempotencyStore;
      const lock = await store.acquire(lockKey, DEFAULT_LOCK_TTL_MS);

      if (!lock.acquired) {
        skipped++;
        results.push({
          subscriptionId: sub.id,
          status: 'SKIPPED_LOCKED',
          reason: 'Concurrent dunning execution in progress',
        });
        continue;
      }

      try {
        const res = await this.db.transaction(async (tx) => {
          const [lockedSub] = await tx
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, sub.id))
            .for('update');

          if (!lockedSub || lockedSub.status !== 'PAST_DUE') {
            return {
              subscriptionId: sub.id,
              status: 'SKIPPED_INELIGIBLE' as const,
              reason: 'Subscription no longer in PAST_DUE status',
            };
          }

          const gracePeriodEnd = new Date(
            lockedSub.currentPeriodEnd.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000
          );

          // Bounded retry check: if retry limit or grace period exceeded -> suspend to UNPAID
          if (lockedSub.dunningAttempts >= maxAttempts || now > gracePeriodEnd) {
            const nextStatus = transitionSubscriptionStatus('PAST_DUE', 'UNPAID');
            await tx
              .update(subscriptions)
              .set({
                status: nextStatus,
                updatedAt: now,
              })
              .where(eq(subscriptions.id, lockedSub.id));

            await tx.insert(subscriptionStatusHistory).values({
              id: randomUUID(),
              subscriptionId: lockedSub.id,
              fromStatus: 'PAST_DUE',
              toStatus: nextStatus,
              reason: `Dunning retry limit reached (${lockedSub.dunningAttempts}/${maxAttempts}) or grace period expired; access suspended`,
            });

            await this.auditService.record({
              actorId: lockedSub.studentId,
              action: 'SUBSCRIPTION_SUSPENDED_UNPAID',
              targetType: 'SUBSCRIPTION',
              targetId: lockedSub.id,
              metadata: {
                dunningAttempts: lockedSub.dunningAttempts,
                maxAttempts,
              },
            });

            return {
              subscriptionId: lockedSub.id,
              status: 'SUSPENDED_UNPAID' as const,
              reason: 'Dunning retry limit or grace period expired',
            };
          }

          // Fail-closed gate check before retry attempt
          try {
            assertRecurringPaymentsAvailable(gate);
          } catch (gateError) {
            // Capability unverified: increment attempt counter to bound retention window
            const nextAttempts = lockedSub.dunningAttempts + 1;
            await tx
              .update(subscriptions)
              .set({
                dunningAttempts: nextAttempts,
                lastDunningAt: now,
                updatedAt: now,
              })
              .where(eq(subscriptions.id, lockedSub.id));

            return {
              subscriptionId: lockedSub.id,
              status: 'FAILED_GATE_BLOCKED' as const,
              attemptNumber: nextAttempts,
              reason: (gateError as Error).message,
            };
          }

          // If gate is verified in test doubles, attempt charge
          if (!this.adapter || !lockedSub.mandateId) {
            return {
              subscriptionId: lockedSub.id,
              status: 'RETRIED_PAST_DUE' as const,
              reason: 'No adapter or mandate configured',
            };
          }

          const [plan] = await tx
            .select()
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.id, lockedSub.planId));

          const chargeResult = await this.adapter.executeRecurringCharge({
            mandateId: lockedSub.mandateId,
            amountCents: plan.priceCents,
            currency: plan.currency,
            idempotencyKey: `sub_dunning:${lockedSub.id}:${lockedSub.dunningAttempts}:${now.getTime()}`,
            gate,
          });

          if (chargeResult.status === 'SUCCESS') {
            const nextStatus = transitionSubscriptionStatus('PAST_DUE', 'ACTIVE');
            const cycleStart = lockedSub.currentPeriodEnd;
            const cycleEnd =
              plan.billingInterval === 'ANNUAL'
                ? addYears(cycleStart, 1)
                : addMonths(cycleStart, 1);

            // Update associated cycle invoice to PAID for financial consistency
            const [cycleInvoice] = await tx
              .select()
              .from(subscriptionInvoices)
              .where(
                and(
                  eq(subscriptionInvoices.subscriptionId, lockedSub.id),
                  eq(subscriptionInvoices.billingCycleStart, cycleStart)
                )
              );

            if (cycleInvoice) {
              await tx
                .update(subscriptionInvoices)
                .set({
                  status: 'PAID',
                  paidAt: now,
                })
                .where(eq(subscriptionInvoices.id, cycleInvoice.id));
            }

            await tx
              .update(subscriptions)
              .set({
                status: nextStatus,
                currentPeriodStart: cycleStart,
                currentPeriodEnd: cycleEnd,
                dunningAttempts: 0,
                updatedAt: now,
              })
              .where(eq(subscriptions.id, lockedSub.id));

            await tx.insert(subscriptionStatusHistory).values({
              id: randomUUID(),
              subscriptionId: lockedSub.id,
              fromStatus: 'PAST_DUE',
              toStatus: nextStatus,
              reason: 'Payment recovered via dunning retry',
            });

            return {
              subscriptionId: lockedSub.id,
              status: 'RECOVERED_ACTIVE' as const,
              attemptNumber: lockedSub.dunningAttempts + 1,
            };
          }

          // Failed retry attempt
          const nextAttempts = lockedSub.dunningAttempts + 1;
          await tx
            .update(subscriptions)
            .set({
              dunningAttempts: nextAttempts,
              lastDunningAt: now,
              updatedAt: now,
            })
            .where(eq(subscriptions.id, lockedSub.id));

          return {
            subscriptionId: lockedSub.id,
            status: 'RETRIED_PAST_DUE' as const,
            attemptNumber: nextAttempts,
            reason: 'Provider declined dunning retry',
          };
        });

        results.push(res);
        if (res.status === 'RECOVERED_ACTIVE') recovered++;
        else if (res.status === 'SUSPENDED_UNPAID') suspended++;
        else if (res.status === 'RETRIED_PAST_DUE' || res.status === 'FAILED_GATE_BLOCKED')
          retried++;
        else skipped++;
      } finally {
        await store.complete(lockKey, { completedAt: new Date() });
      }
    }

    return {
      processed: pastDueSubscriptions.length,
      recovered,
      retried,
      suspended,
      skipped,
      results,
    };
  }
}
