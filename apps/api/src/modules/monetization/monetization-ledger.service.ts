import { Injectable, Inject, HttpStatus, Logger, forwardRef } from '@nestjs/common';
import { eq, and, sql, desc, count, inArray, lte } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  instructorWallets,
  ledgerTransactions,
  ledgerEntries,
  orders,
  orderItems,
  courses,
  refunds,
  users,
  payoutRequests,
  InstructorWallet,
  LedgerTransaction,
  LedgerEntry,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import {
  Currency,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerTransactionType,
  LedgerTransactionDto,
  LedgerEntryDto,
  InstructorWalletDto,
  InstructorEarningsSummaryDto,
} from '@techsprout/contracts';

export const DEFAULT_PLATFORM_COMMISSION_PERCENT = 30; // 30% platform revenue share, 70% instructor net share
export const ESCROW_HOLD_PERIOD_DAYS = 14;

export interface PostEntryInput {
  accountType: LedgerAccountType;
  instructorId?: string | null;
  walletId?: string | null;
  direction: LedgerEntryDirection;
  amountCents: number;
  description: string;
}

export interface PostTransactionInput {
  transactionType: LedgerTransactionType;
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
  description: string;
  currency?: Currency;
  entries: PostEntryInput[];
}

@Injectable()
export class MonetizationLedgerService {
  private readonly logger = new Logger(MonetizationLedgerService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Helper to format Wallet DTO
   */
  public formatWalletDto(wallet: InstructorWallet): InstructorWalletDto {
    return {
      id: wallet.id,
      instructorId: wallet.instructorId,
      balanceCents: wallet.balanceCents,
      pendingBalanceCents: wallet.pendingBalanceCents,
      payoutHoldCents: wallet.payoutHoldCents,
      lifetimeEarningsCents: wallet.lifetimeEarningsCents,
      currency: wallet.currency as Currency,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  /**
   * Helper to format Ledger Entry DTO
   */
  public formatEntryDto(entry: LedgerEntry, transactionType?: LedgerTransactionType): LedgerEntryDto {
    return {
      id: entry.id,
      transactionId: entry.transactionId,
      transactionType: transactionType || 'COURSE_PURCHASE',
      accountType: entry.accountType as LedgerAccountType,
      instructorId: entry.instructorId ?? null,
      walletId: entry.walletId ?? null,
      direction: entry.direction as LedgerEntryDirection,
      amountCents: entry.amountCents,
      currency: entry.currency as Currency,
      balanceAfterCents: entry.balanceAfterCents ?? null,
      description: entry.description,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  /**
   * Helper to format Ledger Transaction DTO
   */
  public formatTransactionDto(
    txRecord: LedgerTransaction,
    entries: LedgerEntry[] = []
  ): LedgerTransactionDto {
    return {
      id: txRecord.id,
      transactionNumber: txRecord.transactionNumber,
      transactionType: txRecord.transactionType as LedgerTransactionType,
      idempotencyKey: txRecord.idempotencyKey,
      currency: txRecord.currency as Currency,
      totalAmountCents: txRecord.totalAmountCents,
      referenceType: txRecord.referenceType,
      referenceId: txRecord.referenceId,
      description: txRecord.description,
      postedAt: txRecord.postedAt.toISOString(),
      createdAt: txRecord.createdAt.toISOString(),
      entries: entries.map((e) => this.formatEntryDto(e, txRecord.transactionType as LedgerTransactionType)),
    };
  }

  /**
   * Resolve or initialize wallet for an instructor
   */
  async getOrCreateWallet(instructorId: string, txHandle?: any): Promise<InstructorWallet> {
    const executor = txHandle || this.db;

    const [existing] = await executor
      .select()
      .from(instructorWallets)
      .where(eq(instructorWallets.instructorId, instructorId))
      .limit(1);

    if (existing) {
      return existing;
    }

    try {
      const [created] = await executor
        .insert(instructorWallets)
        .values({
          instructorId,
          balanceCents: 0,
          pendingBalanceCents: 0,
          payoutHoldCents: 0,
          lifetimeEarningsCents: 0,
          currency: 'BDT',
        })
        .returning();
      return created;
    } catch (err: any) {
      // Handle potential race condition
      const [rechecked] = await executor
        .select()
        .from(instructorWallets)
        .where(eq(instructorWallets.instructorId, instructorId))
        .limit(1);
      if (rechecked) return rechecked;
      throw err;
    }
  }

  /**
   * Core Double-Entry Transaction Posting Engine
   * Validates:
   * 1. Total debits == Total credits
   * 2. Strict non-zero positive amounts
   * 3. Idempotent key preservation
   * 4. Wallet materialized balance updates under row-level lock
   * 5. Atomic database transaction
   */
  async postTransaction(
    input: PostTransactionInput,
    txHandle?: any
  ): Promise<LedgerTransactionDto> {
    const currency = input.currency || 'BDT';

    // 1. Double-Entry Invariant Validation: Sum(Debits) === Sum(Credits)
    if (!input.entries || input.entries.length < 2) {
      throw new ApiException(
        'A double-entry transaction must contain at least 2 entries',
        HttpStatus.BAD_REQUEST,
        'INVALID_LEDGER_ENTRIES'
      );
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of input.entries) {
      if (!Number.isInteger(entry.amountCents) || entry.amountCents <= 0) {
        throw new ApiException(
          `Invalid entry amount: ${entry.amountCents}. Must be a strictly positive integer minor unit`,
          HttpStatus.BAD_REQUEST,
          'INVALID_ENTRY_AMOUNT'
        );
      }

      if (entry.direction === 'DEBIT') {
        totalDebits += entry.amountCents;
      } else if (entry.direction === 'CREDIT') {
        totalCredits += entry.amountCents;
      } else {
        throw new ApiException(
          `Invalid entry direction: ${entry.direction}`,
          HttpStatus.BAD_REQUEST,
          'INVALID_ENTRY_DIRECTION'
        );
      }
    }

    if (totalDebits !== totalCredits) {
      this.logger.error(
        `[DOUBLE_ENTRY_UNBALANCED] Debits (${totalDebits}) !== Credits (${totalCredits}) for key: ${input.idempotencyKey}`
      );
      throw new ApiException(
        `Unbalanced ledger transaction: total debits (${totalDebits}) must equal total credits (${totalCredits})`,
        HttpStatus.BAD_REQUEST,
        'UNBALANCED_LEDGER_TRANSACTION'
      );
    }

    const executePosting = async (tx: any): Promise<LedgerTransactionDto> => {
      // 2. Idempotency Check
      const [existingTx] = await tx
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey))
        .limit(1);

      if (existingTx) {
        this.logger.log(
          `[IDEMPOTENT_LEDGER_POST] Transaction with idempotencyKey "${input.idempotencyKey}" already posted. Returning existing.`
        );
        const existingEntries = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.transactionId, existingTx.id));

        return this.formatTransactionDto(existingTx, existingEntries);
      }

      // Pre-flight validation & Row-level locks for all involved wallets
      const lockedWallets = new Map<string, InstructorWallet>();
      for (const entry of input.entries) {
        if (entry.instructorId) {
          let wallet: InstructorWallet | undefined = lockedWallets.get(entry.instructorId);
          if (!wallet) {
            const [w] = await tx
              .select()
              .from(instructorWallets)
              .where(eq(instructorWallets.instructorId, entry.instructorId))
              .for('update');
            const resolvedWallet: InstructorWallet = w || (await this.getOrCreateWallet(entry.instructorId, tx));
            wallet = resolvedWallet;
            lockedWallets.set(entry.instructorId, resolvedWallet);
          }

          if (entry.accountType === 'INSTRUCTOR_AVAILABLE' && entry.direction === 'DEBIT') {
            if (wallet.balanceCents < entry.amountCents) {
              throw new ApiException(
                `Insufficient available balance (${wallet.balanceCents}) for debit of ${entry.amountCents}`,
                HttpStatus.BAD_REQUEST,
                'INSUFFICIENT_FUNDS'
              );
            }
          } else if (entry.accountType === 'INSTRUCTOR_PENDING' && entry.direction === 'DEBIT') {
            if (wallet.pendingBalanceCents < entry.amountCents) {
              throw new ApiException(
                `Insufficient pending escrow balance (${wallet.pendingBalanceCents}) for debit of ${entry.amountCents}`,
                HttpStatus.BAD_REQUEST,
                'INSUFFICIENT_PENDING_BALANCE'
              );
            }
          } else if (entry.accountType === 'PAYOUT_CLEARING' && entry.direction === 'DEBIT') {
            if (wallet.payoutHoldCents < entry.amountCents) {
              throw new ApiException(
                `Insufficient payout hold balance (${wallet.payoutHoldCents}) for release of ${entry.amountCents}`,
                HttpStatus.BAD_REQUEST,
                'INSUFFICIENT_HOLD_BALANCE'
              );
            }
          }
        }
      }

      // 3. Create Transaction Header
      const transactionNumber = `LTX-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

      let header: LedgerTransaction;
      try {
        const [insertedHeader] = await tx
          .insert(ledgerTransactions)
          .values({
            transactionNumber,
            transactionType: input.transactionType,
            idempotencyKey: input.idempotencyKey,
            currency,
            totalAmountCents: totalDebits,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            description: input.description,
            postedAt: new Date(),
          })
          .returning();
        header = insertedHeader;
      } catch (insertErr: any) {
        if (
          insertErr?.message?.includes('duplicate key') ||
          insertErr?.message?.includes('unique constraint') ||
          insertErr?.message?.includes('ledger_transactions_idempotency_key_uq')
        ) {
          this.logger.log(
            `[CONCURRENT_IDEMPOTENT_POST] IdempotencyKey "${input.idempotencyKey}" collided during insert. Fetching existing.`
          );
          const [existingTx] = await tx
            .select()
            .from(ledgerTransactions)
            .where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey))
            .limit(1);

          if (existingTx) {
            const existingEntries = await tx
              .select()
              .from(ledgerEntries)
              .where(eq(ledgerEntries.transactionId, existingTx.id));
            return this.formatTransactionDto(existingTx, existingEntries);
          }
        }
        throw insertErr;
      }

      // 4. Process Entries & Mutate Materialized Wallet Balances under Row-Lock
      const insertedEntries: LedgerEntry[] = [];

      for (const entry of input.entries) {
        let balanceAfter: number | null = null;

        if (entry.instructorId) {
          // Lock wallet row for update
          let [wallet] = await tx
            .select()
            .from(instructorWallets)
            .where(eq(instructorWallets.instructorId, entry.instructorId))
            .for('update');

          if (!wallet) {
            wallet = await this.getOrCreateWallet(entry.instructorId, tx);
          }

          // Balance mutation logic based on entry account type and direction
          if (entry.accountType === 'INSTRUCTOR_PENDING') {
            if (entry.direction === 'CREDIT') {
              // Earned into escrow: pending balance increases
              const newPending = wallet.pendingBalanceCents + entry.amountCents;
              const newLifetime = wallet.lifetimeEarningsCents + entry.amountCents;
              await tx
                .update(instructorWallets)
                .set({
                  pendingBalanceCents: newPending,
                  lifetimeEarningsCents: newLifetime,
                  updatedAt: new Date(),
                })
                .where(eq(instructorWallets.id, wallet.id));
              balanceAfter = newPending;
            } else if (entry.direction === 'DEBIT') {
              // Clawback or settlement release: pending balance decreases
              if (wallet.pendingBalanceCents < entry.amountCents) {
                throw new ApiException(
                  `Insufficient pending escrow balance (${wallet.pendingBalanceCents}) for debit of ${entry.amountCents}`,
                  HttpStatus.BAD_REQUEST,
                  'INSUFFICIENT_PENDING_BALANCE'
                );
              }
              const newPending = wallet.pendingBalanceCents - entry.amountCents;
              // Lifetime earnings are only reduced on clawback, not on escrow settlement
              const newLifetime =
                input.transactionType === 'REFUND_CLAWBACK'
                  ? Math.max(0, wallet.lifetimeEarningsCents - entry.amountCents)
                  : wallet.lifetimeEarningsCents;

              await tx
                .update(instructorWallets)
                .set({
                  pendingBalanceCents: newPending,
                  lifetimeEarningsCents: newLifetime,
                  updatedAt: new Date(),
                })
                .where(eq(instructorWallets.id, wallet.id));
              balanceAfter = newPending;
            }
          } else if (entry.accountType === 'INSTRUCTOR_AVAILABLE') {
            if (entry.direction === 'CREDIT') {
              // Settlement or payout rejection reversal: available balance increases
              const newBalance = wallet.balanceCents + entry.amountCents;
              await tx
                .update(instructorWallets)
                .set({
                  balanceCents: newBalance,
                  updatedAt: new Date(),
                })
                .where(eq(instructorWallets.id, wallet.id));
              balanceAfter = newBalance;
            } else if (entry.direction === 'DEBIT') {
              // Payout request or post-settlement refund: available balance decreases
              if (wallet.balanceCents < entry.amountCents) {
                throw new ApiException(
                  `Insufficient available balance (${wallet.balanceCents}) for debit of ${entry.amountCents}`,
                  HttpStatus.BAD_REQUEST,
                  'INSUFFICIENT_FUNDS'
                );
              }
              const newBalance = wallet.balanceCents - entry.amountCents;
              const newLifetime =
                input.transactionType === 'REFUND_CLAWBACK'
                  ? Math.max(0, wallet.lifetimeEarningsCents - entry.amountCents)
                  : wallet.lifetimeEarningsCents;

              await tx
                .update(instructorWallets)
                .set({
                  balanceCents: newBalance,
                  lifetimeEarningsCents: newLifetime,
                  updatedAt: new Date(),
                })
                .where(eq(instructorWallets.id, wallet.id));
              balanceAfter = newBalance;
            }
          } else if (entry.accountType === 'PAYOUT_CLEARING') {
            if (entry.direction === 'CREDIT') {
              // Payout requested: hold increases
              const newHold = wallet.payoutHoldCents + entry.amountCents;
              await tx
                .update(instructorWallets)
                .set({
                  payoutHoldCents: newHold,
                  updatedAt: new Date(),
                })
                .where(eq(instructorWallets.id, wallet.id));
              balanceAfter = newHold;
            } else if (entry.direction === 'DEBIT') {
              // Payout settled or rejected: hold decreases
              if (wallet.payoutHoldCents < entry.amountCents) {
                throw new ApiException(
                  `Insufficient payout hold balance (${wallet.payoutHoldCents}) for release of ${entry.amountCents}`,
                  HttpStatus.BAD_REQUEST,
                  'INSUFFICIENT_HOLD_BALANCE'
                );
              }
              const newHold = wallet.payoutHoldCents - entry.amountCents;
              await tx
                .update(instructorWallets)
                .set({
                  payoutHoldCents: newHold,
                  updatedAt: new Date(),
                })
                .where(eq(instructorWallets.id, wallet.id));
              balanceAfter = newHold;
            }
          }
        }

        const [createdEntry] = await tx
          .insert(ledgerEntries)
          .values({
            transactionId: header.id,
            accountType: entry.accountType,
            instructorId: entry.instructorId || null,
            walletId: entry.walletId || null,
            direction: entry.direction,
            amountCents: entry.amountCents,
            currency,
            balanceAfterCents: balanceAfter,
            description: entry.description,
          })
          .returning();

        insertedEntries.push(createdEntry);
      }

      // 5. Audit Logging
      await this.auditService.record({
        actorId: undefined,
        action: 'LEDGER_TRANSACTION_POSTED',
        targetType: 'LEDGER_TRANSACTION',
        targetId: header.id,
        metadata: {
          transactionNumber: header.transactionNumber,
          transactionType: header.transactionType,
          idempotencyKey: header.idempotencyKey,
          totalAmountCents: header.totalAmountCents,
          referenceType: header.referenceType,
          referenceId: header.referenceId,
          entryCount: insertedEntries.length,
        },
      });

      return this.formatTransactionDto(header, insertedEntries);
    };

    if (txHandle) {
      return executePosting(txHandle);
    }
    return this.db.transaction(executePosting);
  }

  /**
   * Post Course Purchase Revenue Allocation
   * Split: Platform Commission (30%) + Instructor Escrow (70%)
   * Debits: PLATFORM_CASH (P)
   * Credits: PLATFORM_REVENUE (C), INSTRUCTOR_PENDING (I)
   */
  async postCoursePurchase(orderId: string, txHandle?: any): Promise<LedgerTransactionDto | null> {
    const executor = txHandle || this.db;

    const [order] = await executor
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      throw new ApiException('Order not found for revenue posting', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
    }

    if (order.payableCents <= 0) {
      this.logger.log(`Order ${order.id} has payableCents <= 0. Zero revenue ledger transaction skipped.`);
      return null;
    }

    const items = await executor
      .select({
        item: orderItems,
        instructorId: courses.instructorId,
      })
      .from(orderItems)
      .innerJoin(courses, eq(orderItems.courseId, courses.id))
      .where(eq(orderItems.orderId, order.id));

    if (!items || items.length === 0) {
      this.logger.warn(`No order items found for order ${order.id}. Skipping revenue ledger posting.`);
      return null;
    }

    const totalItemsPayable = items.reduce((sum: number, row: any) => sum + row.item.payableCents, 0);
    const targetPayable = order.payableCents;

    const entries: PostEntryInput[] = [];

    // Total cash received into platform
    entries.push({
      accountType: 'PLATFORM_CASH',
      direction: 'DEBIT',
      amountCents: targetPayable,
      description: `Student checkout payment for Order #${order.orderNumber}`,
    });

    let allocatedCredits = 0;

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const isLast = i === items.length - 1;

      const effectivePayable =
        totalItemsPayable > 0
          ? isLast
            ? targetPayable - allocatedCredits
            : Math.round((row.item.payableCents / totalItemsPayable) * targetPayable)
          : isLast
            ? targetPayable - allocatedCredits
            : Math.round(targetPayable / items.length);

      if (effectivePayable <= 0) continue;
      allocatedCredits += effectivePayable;

      const commissionCents = Math.round((effectivePayable * DEFAULT_PLATFORM_COMMISSION_PERCENT) / 100);
      const instructorShareCents = effectivePayable - commissionCents;

      // Platform revenue commission
      if (commissionCents > 0) {
        entries.push({
          accountType: 'PLATFORM_REVENUE',
          direction: 'CREDIT',
          amountCents: commissionCents,
          description: `Platform commission (${DEFAULT_PLATFORM_COMMISSION_PERCENT}%) on course "${row.item.courseTitle}" (Order #${order.orderNumber})`,
        });
      }

      // Instructor earnings into 14-day escrow pending balance
      if (instructorShareCents > 0) {
        entries.push({
          accountType: 'INSTRUCTOR_PENDING',
          instructorId: row.instructorId,
          direction: 'CREDIT',
          amountCents: instructorShareCents,
          description: `Instructor net earnings (70%) on course "${row.item.courseTitle}" held in escrow (Order #${order.orderNumber})`,
        });
      }
    }

    if (entries.length < 2) {
      this.logger.warn(`Insufficient entries generated for order ${order.id}. Skipping revenue ledger posting.`);
      return null;
    }

    return this.postTransaction(
      {
        transactionType: 'COURSE_PURCHASE',
        idempotencyKey: `order:purchase:${order.id}`,
        referenceType: 'ORDER',
        referenceId: order.id,
        description: `Course purchase revenue allocation for Order #${order.orderNumber}`,
        currency: order.currency as Currency,
        entries,
      },
      txHandle
    );
  }

  /**
   * Post Refund Clawback
   * Reverses revenue and instructor share:
   * Debits: PLATFORM_REVENUE (C), INSTRUCTOR_PENDING / INSTRUCTOR_AVAILABLE (I)
   * Credits: PLATFORM_CASH (P)
   */
  async postRefundClawback(refundId: string, txHandle?: any): Promise<LedgerTransactionDto | null> {
    const executor = txHandle || this.db;

    const [refund] = await executor
      .select()
      .from(refunds)
      .where(eq(refunds.id, refundId))
      .limit(1);

    if (!refund || refund.amountCents <= 0) {
      return null;
    }

    const [order] = await executor
      .select()
      .from(orders)
      .where(eq(orders.id, refund.orderId))
      .limit(1);

    if (!order || order.payableCents <= 0) {
      return null;
    }

    const items = await executor
      .select({
        item: orderItems,
        instructorId: courses.instructorId,
      })
      .from(orderItems)
      .innerJoin(courses, eq(orderItems.courseId, courses.id))
      .where(eq(orderItems.orderId, order.id));

    if (!items || items.length === 0) {
      this.logger.warn(`No order items found for refund ${refund.id}. Skipping ledger clawback.`);
      return null;
    }

    // Check if original purchase was posted to the ledger
    const [purchaseTx] = await executor
      .select()
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.referenceType, 'ORDER'),
          eq(ledgerTransactions.referenceId, order.id),
          eq(ledgerTransactions.transactionType, 'COURSE_PURCHASE')
        )
      )
      .limit(1);

    if (!purchaseTx) {
      this.logger.warn(`No original purchase ledger transaction found for order ${order.id}. Skipping refund clawback.`);
      return null;
    }

    const totalItemsPayable = items.reduce((sum: number, row: any) => sum + row.item.payableCents, 0);
    const targetRefund = refund.amountCents;

    // Check if original purchase has already been settled from escrow
    const [settledTx] = await executor
      .select()
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.referenceType, 'ORDER'),
          eq(ledgerTransactions.referenceId, order.id),
          eq(ledgerTransactions.transactionType, 'ESCROW_SETTLEMENT')
        )
      )
      .limit(1);

    const isSettled = !!settledTx;
    const entries: PostEntryInput[] = [];

    // Credit platform cash (disbursed back to student)
    entries.push({
      accountType: 'PLATFORM_CASH',
      direction: 'CREDIT',
      amountCents: targetRefund,
      description: `Student refund payout for Refund #${refund.refundNumber}`,
    });

    let allocatedDebits = 0;

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const isLast = i === items.length - 1;

      const itemRefundPortion =
        totalItemsPayable > 0
          ? isLast
            ? targetRefund - allocatedDebits
            : Math.round((row.item.payableCents / totalItemsPayable) * targetRefund)
          : isLast
            ? targetRefund - allocatedDebits
            : Math.round(targetRefund / items.length);

      if (itemRefundPortion <= 0) continue;
      allocatedDebits += itemRefundPortion;

      const commissionCents = Math.round((itemRefundPortion * DEFAULT_PLATFORM_COMMISSION_PERCENT) / 100);
      const instructorShareCents = itemRefundPortion - commissionCents;

      // Reverse platform commission
      if (commissionCents > 0) {
        entries.push({
          accountType: 'PLATFORM_REVENUE',
          direction: 'DEBIT',
          amountCents: commissionCents,
          description: `Reversal of platform commission on refunded course "${row.item.courseTitle}" (Refund #${refund.refundNumber})`,
        });
      }

      // Reverse instructor earnings from pending escrow, available balance, payout hold, or platform absorption
      if (instructorShareCents > 0) {
        let remainingClawback = instructorShareCents;
        const wallet = await this.getOrCreateWallet(row.instructorId, executor);

        // 1. Escrow hold: if not yet settled, debit pending escrow first
        if (!isSettled && wallet.pendingBalanceCents > 0) {
          const fromPending = Math.min(remainingClawback, wallet.pendingBalanceCents);
          if (fromPending > 0) {
            entries.push({
              accountType: 'INSTRUCTOR_PENDING',
              instructorId: row.instructorId,
              direction: 'DEBIT',
              amountCents: fromPending,
              description: `Clawback of instructor earnings on refunded course "${row.item.courseTitle}" (escrow hold)`,
            });
            remainingClawback -= fromPending;
          }
        }

        // 2. Available balance: debit available balance if settled or pending was insufficient
        if (remainingClawback > 0 && wallet.balanceCents > 0) {
          const fromAvailable = Math.min(remainingClawback, wallet.balanceCents);
          entries.push({
            accountType: 'INSTRUCTOR_AVAILABLE',
            instructorId: row.instructorId,
            direction: 'DEBIT',
            amountCents: fromAvailable,
            description: `Clawback of instructor earnings on refunded course "${row.item.courseTitle}" (available balance)`,
          });
          remainingClawback -= fromAvailable;
        }

        // 3. Payout hold: if funds are reserved for pending/approved payout
        if (remainingClawback > 0 && wallet.payoutHoldCents > 0) {
          const fromHold = Math.min(remainingClawback, wallet.payoutHoldCents);
          entries.push({
            accountType: 'PAYOUT_CLEARING',
            instructorId: row.instructorId,
            direction: 'DEBIT',
            amountCents: fromHold,
            description: `Clawback of instructor earnings on refunded course "${row.item.courseTitle}" (payout hold)`,
          });
          remainingClawback -= fromHold;

          // Adjust in-flight payout requests to keep them in sync with reduced hold
          const activePayouts = await executor
            .select()
            .from(payoutRequests)
            .where(
              and(
                eq(payoutRequests.instructorId, row.instructorId),
                inArray(payoutRequests.status, ['PENDING', 'APPROVED'])
              )
            )
            .orderBy(desc(payoutRequests.createdAt));

          let unappliedHold = fromHold;
          for (const po of activePayouts) {
            if (unappliedHold <= 0) break;
            if (po.amountCents <= unappliedHold) {
              unappliedHold -= po.amountCents;
              await executor
                .update(payoutRequests)
                .set({
                  status: 'REJECTED',
                  rejectionReason: `Cancelled: funds clawed back due to customer refund #${refund.refundNumber} on Order #${order.orderNumber}`,
                  updatedAt: new Date(),
                })
                .where(eq(payoutRequests.id, po.id));
            } else {
              const newAmount = po.amountCents - unappliedHold;
              unappliedHold = 0;
              await executor
                .update(payoutRequests)
                .set({
                  amountCents: newAmount,
                  adminNotes: `Amount adjusted from ${po.amountCents} to ${newAmount} poisha due to refund #${refund.refundNumber}`,
                  updatedAt: new Date(),
                })
                .where(eq(payoutRequests.id, po.id));
            }
          }
        }

        // 4. Platform absorption: if instructor already withdrew/settled funds and balance is 0
        if (remainingClawback > 0) {
          entries.push({
            accountType: 'PLATFORM_REVENUE',
            direction: 'DEBIT',
            amountCents: remainingClawback,
            description: `Platform absorption of uncollectible refund clawback for course "${row.item.courseTitle}" (instructor earnings already disbursed)`,
          });
        }
      }
    }

    if (entries.length < 2) {
      this.logger.warn(`Insufficient entries generated for refund ${refund.id}. Skipping ledger clawback.`);
      return null;
    }

    return this.postTransaction(
      {
        transactionType: 'REFUND_CLAWBACK',
        idempotencyKey: `refund:clawback:${refund.id}`,
        referenceType: 'REFUND',
        referenceId: refund.id,
        description: `Refund clawback reversal for Refund #${refund.refundNumber}`,
        currency: refund.currency as Currency,
        entries,
      },
      txHandle
    );
  }

  /**
   * Release Matured Escrow Funds to Available Balance
   * Moves funds from pending_balance to available_balance for orders older than 14 days without refunds.
   */
  async settleMaturedEscrow(asOfDate: Date = new Date(), txHandle?: any): Promise<number> {
    const executor = txHandle || this.db;
    const cutoffDate = new Date(asOfDate.getTime() - ESCROW_HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Find PAID orders paid before cutoff date that have not yet had escrow settled
    const eligibleOrders = await executor
      .select()
      .from(orders)
      .where(and(eq(orders.status, 'PAID'), lte(orders.paidAt, cutoffDate)));

    let settledCount = 0;

    for (const ord of eligibleOrders) {
      const idempotencyKey = `escrow:settle:${ord.id}`;
      const [alreadySettled] = await executor
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.idempotencyKey, idempotencyKey))
        .limit(1);

      if (alreadySettled) continue;

      const items = await executor
        .select({
          item: orderItems,
          instructorId: courses.instructorId,
        })
        .from(orderItems)
        .innerJoin(courses, eq(orderItems.courseId, courses.id))
        .where(eq(orderItems.orderId, ord.id));

      const entries: PostEntryInput[] = [];

      for (const row of items) {
        const payable = row.item.payableCents;
        if (payable <= 0) continue;

        const commissionCents = Math.round((payable * DEFAULT_PLATFORM_COMMISSION_PERCENT) / 100);
        const instructorShareCents = payable - commissionCents;

        entries.push({
          accountType: 'INSTRUCTOR_PENDING',
          instructorId: row.instructorId,
          direction: 'DEBIT',
          amountCents: instructorShareCents,
          description: `Release pending escrow for course "${row.item.courseTitle}" (Order #${ord.orderNumber})`,
        });

        entries.push({
          accountType: 'INSTRUCTOR_AVAILABLE',
          instructorId: row.instructorId,
          direction: 'CREDIT',
          amountCents: instructorShareCents,
          description: `Credit available balance for course "${row.item.courseTitle}" (Order #${ord.orderNumber})`,
        });
      }

      if (entries.length >= 2) {
        await this.postTransaction(
          {
            transactionType: 'ESCROW_SETTLEMENT',
            idempotencyKey,
            referenceType: 'ORDER',
            referenceId: ord.id,
            description: `14-day escrow hold matured for Order #${ord.orderNumber}`,
            currency: ord.currency as Currency,
            entries,
          },
          txHandle
        );
        settledCount++;
      }
    }

    return settledCount;
  }

  /**
   * Get Instructor Ledger Statement & Transaction History
   */
  async getInstructorLedger(
    instructorId: string,
    query?: { page?: number; limit?: number }
  ): Promise<{ entries: LedgerEntryDto[]; total: number }> {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(100, Math.max(1, query?.limit || 20));
    const offset = (page - 1) * limit;

    const [totalRow] = await this.db
      .select({ count: count(ledgerEntries.id) })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.instructorId, instructorId));

    const rows = await this.db
      .select({
        entry: ledgerEntries,
        tx: ledgerTransactions,
      })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(eq(ledgerEntries.instructorId, instructorId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      entries: rows.map((r) =>
        this.formatEntryDto(r.entry, r.tx.transactionType as LedgerTransactionType)
      ),
      total: Number(totalRow?.count || 0),
    };
  }

  /**
   * Get Instructor Earnings Summary
   */
  async getEarningsSummary(instructorId: string): Promise<InstructorEarningsSummaryDto> {
    const wallet = await this.getOrCreateWallet(instructorId);
    const ledger = await this.getInstructorLedger(instructorId, { limit: 10 });

    // Calculate settled payouts total
    const [settledAgg] = await this.db
      .select({
        totalSettled: sql<string>`COALESCE(SUM("amount_cents"), 0)`,
      })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(
        and(
          eq(ledgerEntries.instructorId, instructorId),
          eq(ledgerTransactions.transactionType, 'PAYOUT_SETTLED'),
          eq(ledgerEntries.accountType, 'PAYOUT_CLEARING'),
          eq(ledgerEntries.direction, 'DEBIT')
        )
      );

    return {
      wallet: this.formatWalletDto(wallet),
      recentTransactions: ledger.entries,
      pendingPayoutsCount: wallet.payoutHoldCents > 0 ? 1 : 0,
      settledPayoutsTotalCents: Number(settledAgg?.totalSettled || 0),
    };
  }

  /**
   * Reconcile instructor wallet materialized balances with immutable ledger entries.
   * Calculates ground-truth balance sums across all posted transactions and verifies
   * zero discrepancy against instructor_wallets table.
   */
  async reconcileWallet(instructorId: string, txHandle?: any): Promise<{
    reconciled: boolean;
    wallet: InstructorWallet;
    calculated: {
      pendingBalanceCents: number;
      balanceCents: number;
      payoutHoldCents: number;
    };
    discrepancies: {
      pendingDiff: number;
      balanceDiff: number;
      payoutHoldDiff: number;
    };
  }> {
    const executor = txHandle || this.db;
    const wallet = await this.getOrCreateWallet(instructorId, executor);

    const rows = await executor
      .select({
        accountType: ledgerEntries.accountType,
        direction: ledgerEntries.direction,
        totalCents: sql<string>`COALESCE(SUM("amount_cents"), 0)`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.instructorId, instructorId))
      .groupBy(ledgerEntries.accountType, ledgerEntries.direction);

    let pendingCredits = 0;
    let pendingDebits = 0;
    let availableCredits = 0;
    let availableDebits = 0;
    let holdCredits = 0;
    let holdDebits = 0;

    for (const row of rows) {
      const amount = Number(row.totalCents || 0);
      if (row.accountType === 'INSTRUCTOR_PENDING') {
        if (row.direction === 'CREDIT') pendingCredits += amount;
        else if (row.direction === 'DEBIT') pendingDebits += amount;
      } else if (row.accountType === 'INSTRUCTOR_AVAILABLE') {
        if (row.direction === 'CREDIT') availableCredits += amount;
        else if (row.direction === 'DEBIT') availableDebits += amount;
      } else if (row.accountType === 'PAYOUT_CLEARING') {
        if (row.direction === 'CREDIT') holdCredits += amount;
        else if (row.direction === 'DEBIT') holdDebits += amount;
      }
    }

    const calculated = {
      pendingBalanceCents: pendingCredits - pendingDebits,
      balanceCents: availableCredits - availableDebits,
      payoutHoldCents: holdCredits - holdDebits,
    };

    const discrepancies = {
      pendingDiff: wallet.pendingBalanceCents - calculated.pendingBalanceCents,
      balanceDiff: wallet.balanceCents - calculated.balanceCents,
      payoutHoldDiff: wallet.payoutHoldCents - calculated.payoutHoldCents,
    };

    const reconciled =
      discrepancies.pendingDiff === 0 &&
      discrepancies.balanceDiff === 0 &&
      discrepancies.payoutHoldDiff === 0;

    return {
      reconciled,
      wallet,
      calculated,
      discrepancies,
    };
  }
}
