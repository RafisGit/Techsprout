import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MonetizationLedgerService, DEFAULT_PLATFORM_COMMISSION_PERCENT } from '../modules/monetization/monetization-ledger.service';
import { PayoutsService } from '../modules/monetization/payouts.service';
import { AuditService } from '../modules/audit/audit.service';
import { createTestDatabase } from './test-helper';
import {
  users,
  categories,
  courses,
  orders,
  orderItems,
  payments,
  refunds,
  instructorWallets,
  ledgerTransactions,
  ledgerEntries,
  payoutRequests,
} from '../database/schema';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { ApiException } from '../common/errors/api-error';

describe('Phase 7.3 / WP-P7-06: Instructor Monetization & Marketplace Ledger', () => {
  let db: any;
  let ledgerService: MonetizationLedgerService;
  let payoutsService: PayoutsService;
  let auditService: AuditService;

  let mockAdminId: string;
  let mockInstructorAId: string;
  let mockInstructorBId: string;
  let mockStudentId: string;
  let mockCategoryId: string;

  let courseAId: string;
  let courseBId: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    auditService = { record: vi.fn().mockResolvedValue(undefined) } as any;
    ledgerService = new MonetizationLedgerService(db, auditService);
    payoutsService = new PayoutsService(db, ledgerService, auditService);

    mockAdminId = crypto.randomUUID();
    mockInstructorAId = crypto.randomUUID();
    mockInstructorBId = crypto.randomUUID();
    mockStudentId = crypto.randomUUID();
    mockCategoryId = crypto.randomUUID();

    // 1. Seed users
    await db.insert(users).values([
      {
        id: mockAdminId,
        name: 'Platform Admin',
        username: `admin_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        email: `admin_${Date.now()}@techsprout.edu`,
        passwordHash: 'hashed_pw',
        isVerified: true,
      },
      {
        id: mockInstructorAId,
        name: 'Instructor Alice',
        username: `alice_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        email: `alice_${Date.now()}@techsprout.edu`,
        passwordHash: 'hashed_pw',
        isVerified: true,
      },
      {
        id: mockInstructorBId,
        name: 'Instructor Bob',
        username: `bob_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        email: `bob_${Date.now()}@techsprout.edu`,
        passwordHash: 'hashed_pw',
        isVerified: true,
      },
      {
        id: mockStudentId,
        name: 'Student Charlie',
        username: `charlie_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        email: `charlie_${Date.now()}@techsprout.edu`,
        passwordHash: 'hashed_pw',
        isVerified: true,
      },
    ]);

    // 2. Seed category
    await db.insert(categories).values({
      id: mockCategoryId,
      name: 'Engineering',
      slug: `eng-${Date.now()}`,
    });

    // 3. Seed courses
    courseAId = crypto.randomUUID();
    courseBId = crypto.randomUUID();

    await db.insert(courses).values([
      {
        id: courseAId,
        categoryId: mockCategoryId,
        instructorId: mockInstructorAId,
        title: 'Full-Stack TypeScript & Financial Systems',
        slug: `fs-ts-${Date.now()}`,
        status: 'PUBLISHED',
        price: '100.00',
        currency: 'BDT',
      },
      {
        id: courseBId,
        categoryId: mockCategoryId,
        instructorId: mockInstructorBId,
        title: 'Distributed Systems & Database Transactions',
        slug: `dist-sys-${Date.now()}`,
        status: 'PUBLISHED',
        price: '200.00',
        currency: 'BDT',
      },
    ]);
  });

  describe('1. Double-Entry Accounting Invariants', () => {
    it('successfully posts a balanced double-entry transaction where sum(debits) === sum(credits)', async () => {
      const walletA = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletA.balanceCents).toBe(0);

      const txn = await ledgerService.postTransaction({
        transactionType: 'ADJUSTMENT',
        idempotencyKey: 'manual:adjustment:001',
        referenceType: 'SYSTEM',
        referenceId: 'init',
        description: 'Initial seed grant',
        entries: [
          {
            accountType: 'PLATFORM_CASH',
            direction: 'DEBIT',
            amountCents: 10000, // 100 BDT
            description: 'Seed deposit',
          },
          {
            accountType: 'INSTRUCTOR_AVAILABLE',
            instructorId: mockInstructorAId,
            walletId: walletA.id,
            direction: 'CREDIT',
            amountCents: 10000,
            description: 'Initial grant to Alice',
          },
        ],
      });

      expect(txn.id).toBeDefined();
      expect(txn.totalAmountCents).toBe(10000);
      expect(txn.entries).toHaveLength(2);

      const updatedWallet = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(updatedWallet.balanceCents).toBe(10000);
    });

    it('strictly rejects unbalanced journal entries where debits !== credits', async () => {
      await expect(
        ledgerService.postTransaction({
          transactionType: 'ADJUSTMENT',
          idempotencyKey: 'bad:unbalanced:001',
          referenceType: 'TEST',
          referenceId: 'bad',
          description: 'Unbalanced transaction',
          entries: [
            {
              accountType: 'PLATFORM_CASH',
              direction: 'DEBIT',
              amountCents: 10000,
              description: 'Debit 100 BDT',
            },
            {
              accountType: 'PLATFORM_REVENUE',
              direction: 'CREDIT',
              amountCents: 7000, // Only 70 BDT -> 30 BDT leak!
              description: 'Credit 70 BDT',
            },
          ],
        })
      ).rejects.toThrow(/Unbalanced ledger transaction/);

      // Verify zero transaction or entries persisted
      const allTxns = await db.select().from(ledgerTransactions);
      expect(allTxns).toHaveLength(0);
    });

    it('rejects non-positive, zero, or floating-point amounts', async () => {
      await expect(
        ledgerService.postTransaction({
          transactionType: 'ADJUSTMENT',
          idempotencyKey: 'bad:zero:001',
          referenceType: 'TEST',
          referenceId: 'bad',
          description: 'Zero amount entry',
          entries: [
            {
              accountType: 'PLATFORM_CASH',
              direction: 'DEBIT',
              amountCents: 0,
              description: 'Zero amount',
            },
            {
              accountType: 'PLATFORM_REVENUE',
              direction: 'CREDIT',
              amountCents: 0,
              description: 'Zero amount',
            },
          ],
        })
      ).rejects.toThrow(/strictly positive integer minor unit/);

      await expect(
        ledgerService.postTransaction({
          transactionType: 'ADJUSTMENT',
          idempotencyKey: 'bad:float:001',
          referenceType: 'TEST',
          referenceId: 'bad',
          description: 'Float amount entry',
          entries: [
            {
              accountType: 'PLATFORM_CASH',
              direction: 'DEBIT',
              amountCents: 100.5,
              description: 'Float amount',
            },
            {
              accountType: 'PLATFORM_REVENUE',
              direction: 'CREDIT',
              amountCents: 100.5,
              description: 'Float amount',
            },
          ],
        })
      ).rejects.toThrow(/strictly positive integer minor unit/);
    });

    it('guarantees atomicity: a failed transaction rolls back completely with zero partial entries', async () => {
      const walletA = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletA.balanceCents).toBe(0);

      // Attempt to debit more than available
      await expect(
        ledgerService.postTransaction({
          transactionType: 'PAYOUT_REQUEST',
          idempotencyKey: 'failed:atomicity:001',
          referenceType: 'TEST',
          referenceId: 'failed',
          description: 'Overdraw attempt',
          entries: [
            {
              accountType: 'INSTRUCTOR_AVAILABLE',
              instructorId: mockInstructorAId,
              walletId: walletA.id,
              direction: 'DEBIT',
              amountCents: 50000, // 500 BDT when balance is 0
              description: 'Overdraw debit',
            },
            {
              accountType: 'PAYOUT_CLEARING',
              instructorId: mockInstructorAId,
              walletId: walletA.id,
              direction: 'CREDIT',
              amountCents: 50000,
              description: 'Clearing credit',
            },
          ],
        })
      ).rejects.toThrow(/Insufficient available balance/);

      // Verify rollback: no transaction header or partial entries exist
      const allTxns = await db.select().from(ledgerTransactions);
      const allEntries = await db.select().from(ledgerEntries);
      expect(allTxns).toHaveLength(0);
      expect(allEntries).toHaveLength(0);

      const recheckedWallet = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(recheckedWallet.balanceCents).toBe(0);
    });

    it('enforces idempotent posting: retrying the same idempotencyKey returns existing without duplicating money movement', async () => {
      const input = {
        transactionType: 'ADJUSTMENT' as const,
        idempotencyKey: 'idempotent:key:001',
        referenceType: 'SEED',
        referenceId: 'test-1',
        description: 'Grant 50 BDT',
        entries: [
          {
            accountType: 'PLATFORM_CASH' as const,
            direction: 'DEBIT' as const,
            amountCents: 5000,
            description: 'Platform cash deposit',
          },
          {
            accountType: 'INSTRUCTOR_AVAILABLE' as const,
            instructorId: mockInstructorAId,
            direction: 'CREDIT' as const,
            amountCents: 5000,
            description: 'Credit Alice available balance',
          },
        ],
      };

      const firstResult = await ledgerService.postTransaction(input);
      expect(firstResult.id).toBeDefined();

      const walletAfterFirst = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletAfterFirst.balanceCents).toBe(5000);

      // Replay with identical idempotencyKey
      const secondResult = await ledgerService.postTransaction(input);
      expect(secondResult.id).toBe(firstResult.id);
      expect(secondResult.transactionNumber).toBe(firstResult.transactionNumber);

      // Balance MUST remain exactly 5000, NOT 10000
      const walletAfterSecond = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletAfterSecond.balanceCents).toBe(5000);

      const allTxns = await db.select().from(ledgerTransactions);
      expect(allTxns).toHaveLength(1);
    });
  });

  describe('2. Course Purchases & Escrow Revenue Allocation', () => {
    it('allocates 30% platform commission and 70% instructor net share to pending escrow upon purchase', async () => {
      const orderId = crypto.randomUUID();
      const orderItemId = crypto.randomUUID();

      // Create paid order of 10,000 poisha (100.00 BDT)
      await db.insert(orders).values({
        id: orderId,
        orderNumber: 'TSP-ORD-1001',
        studentId: mockStudentId,
        status: 'PAID',
        subtotalCents: 10000,
        discountCents: 0,
        payableCents: 10000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date(),
      });

      await db.insert(orderItems).values({
        id: orderItemId,
        orderId,
        courseId: courseAId,
        courseTitle: 'Full-Stack TypeScript & Financial Systems',
        unitPriceCents: 10000,
        discountCents: 0,
        payableCents: 10000,
      });

      const txn = await ledgerService.postCoursePurchase(orderId);
      expect(txn).not.toBeNull();
      expect(txn!.transactionType).toBe('COURSE_PURCHASE');
      expect(txn!.totalAmountCents).toBe(10000);

      // Verify wallet state: 7,000 poisha in pendingBalance, 0 in available balance
      const wallet = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(wallet.pendingBalanceCents).toBe(7000);
      expect(wallet.balanceCents).toBe(0);
      expect(wallet.lifetimeEarningsCents).toBe(7000);

      // Verify entries: DEBIT PLATFORM_CASH 10,000, CREDIT PLATFORM_REVENUE 3,000, CREDIT INSTRUCTOR_PENDING 7,000
      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.transactionId, txn!.id));

      expect(entries).toHaveLength(3);

      const cashEntry = entries.find((e: any) => e.accountType === 'PLATFORM_CASH');
      const revEntry = entries.find((e: any) => e.accountType === 'PLATFORM_REVENUE');
      const pendingEntry = entries.find((e: any) => e.accountType === 'INSTRUCTOR_PENDING');

      expect(cashEntry.direction).toBe('DEBIT');
      expect(cashEntry.amountCents).toBe(10000);

      expect(revEntry.direction).toBe('CREDIT');
      expect(revEntry.amountCents).toBe(3000);

      expect(pendingEntry.direction).toBe('CREDIT');
      expect(pendingEntry.amountCents).toBe(7000);
      expect(pendingEntry.instructorId).toBe(mockInstructorAId);

      // Mathematical exactness: 3000 + 7000 === 10000
      expect(revEntry.amountCents + pendingEntry.amountCents).toBe(cashEntry.amountCents);
    });

    it('settles escrow to available balance only after 14-day hold period has matured', async () => {
      const orderId = crypto.randomUUID();
      const orderItemId = crypto.randomUUID();
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

      await db.insert(orders).values({
        id: orderId,
        orderNumber: 'TSP-ORD-MATURED',
        studentId: mockStudentId,
        status: 'PAID',
        subtotalCents: 20000, // 200.00 BDT
        discountCents: 0,
        payableCents: 20000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: fifteenDaysAgo, // Matured!
      });

      await db.insert(orderItems).values({
        id: orderItemId,
        orderId,
        courseId: courseBId,
        courseTitle: 'Distributed Systems & Database Transactions',
        unitPriceCents: 20000,
        discountCents: 0,
        payableCents: 20000,
      });

      // Initial purchase allocation
      await ledgerService.postCoursePurchase(orderId);
      const walletBefore = await ledgerService.getOrCreateWallet(mockInstructorBId);
      expect(walletBefore.pendingBalanceCents).toBe(14000); // 70% of 200 BDT = 140 BDT
      expect(walletBefore.balanceCents).toBe(0);

      // Run escrow settlement
      const settledCount = await ledgerService.settleMaturedEscrow(new Date());
      expect(settledCount).toBe(1);

      // Funds must have transitioned from pending to available
      const walletAfter = await ledgerService.getOrCreateWallet(mockInstructorBId);
      expect(walletAfter.pendingBalanceCents).toBe(0);
      expect(walletAfter.balanceCents).toBe(14000);
      expect(walletAfter.lifetimeEarningsCents).toBe(14000);
    });
  });

  describe('3. Student Refunds & Clawback Reversals', () => {
    it('claws back pending escrow during the 14-day window without affecting available balance', async () => {
      const orderId = crypto.randomUUID();
      const orderItemId = crypto.randomUUID();
      const refundId = crypto.randomUUID();

      await db.insert(orders).values({
        id: orderId,
        orderNumber: 'TSP-ORD-REF-ESCROW',
        studentId: mockStudentId,
        status: 'PAID',
        subtotalCents: 10000,
        discountCents: 0,
        payableCents: 10000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date(), // Day 1 (still in escrow)
      });

      await db.insert(orderItems).values({
        id: orderItemId,
        orderId,
        courseId: courseAId,
        courseTitle: 'Full-Stack TypeScript & Financial Systems',
        unitPriceCents: 10000,
        discountCents: 0,
        payableCents: 10000,
      });

      await ledgerService.postCoursePurchase(orderId);

      const paymentId = crypto.randomUUID();
      await db.insert(payments).values({
        id: paymentId,
        orderId,
        merchantTranId: `MTX-${Date.now()}`,
        amountCents: 10000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      await db.insert(refunds).values({
        id: refundId,
        refundNumber: 'TSP-REF-1001',
        orderId,
        paymentId,
        amountCents: 10000,
        currency: 'BDT',
        reason: 'Course content mismatch within 14 days',
        status: 'PROCESSED',
      });

      // Execute refund clawback
      const clawbackTx = await ledgerService.postRefundClawback(refundId);
      expect(clawbackTx).not.toBeNull();
      expect(clawbackTx!.transactionType).toBe('REFUND_CLAWBACK');

      const wallet = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(wallet.pendingBalanceCents).toBe(0);
      expect(wallet.balanceCents).toBe(0);
      expect(wallet.lifetimeEarningsCents).toBe(0);
    });

    it('claws back available balance if refund occurs after escrow settlement', async () => {
      const orderId = crypto.randomUUID();
      const orderItemId = crypto.randomUUID();
      const refundId = crypto.randomUUID();
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

      await db.insert(orders).values({
        id: orderId,
        orderNumber: 'TSP-ORD-REF-SETTLED',
        studentId: mockStudentId,
        status: 'PAID',
        subtotalCents: 10000,
        discountCents: 0,
        payableCents: 10000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: fifteenDaysAgo,
      });

      await db.insert(orderItems).values({
        id: orderItemId,
        orderId,
        courseId: courseAId,
        courseTitle: 'Full-Stack TypeScript & Financial Systems',
        unitPriceCents: 10000,
        discountCents: 0,
        payableCents: 10000,
      });

      await ledgerService.postCoursePurchase(orderId);
      await ledgerService.settleMaturedEscrow(new Date());

      const walletSettled = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletSettled.balanceCents).toBe(7000);

      const paymentId = crypto.randomUUID();
      await db.insert(payments).values({
        id: paymentId,
        orderId,
        merchantTranId: `MTX-SETTLED-${Date.now()}`,
        amountCents: 10000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      await db.insert(refunds).values({
        id: refundId,
        refundNumber: 'TSP-REF-SETTLED',
        orderId,
        paymentId,
        amountCents: 10000,
        currency: 'BDT',
        reason: 'Post-settlement exception refund',
        status: 'PROCESSED',
      });

      await ledgerService.postRefundClawback(refundId);

      const walletClawedBack = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletClawedBack.balanceCents).toBe(0);
      expect(walletClawedBack.lifetimeEarningsCents).toBe(0);
    });
  });

  describe('4. Payout Approval Lifecycle & Double-Spending Protection', () => {
    beforeEach(async () => {
      // Seed Instructor A with 20,000 poisha (200.00 BDT) available balance
      await ledgerService.postTransaction({
        transactionType: 'ADJUSTMENT',
        idempotencyKey: `seed:funds:${mockInstructorAId}`,
        referenceType: 'TEST',
        referenceId: 'seed',
        description: 'Fund seed for payout tests',
        entries: [
          {
            accountType: 'PLATFORM_CASH',
            direction: 'DEBIT',
            amountCents: 20000,
            description: 'Seed cash',
          },
          {
            accountType: 'INSTRUCTOR_AVAILABLE',
            instructorId: mockInstructorAId,
            direction: 'CREDIT',
            amountCents: 20000,
            description: 'Seed available balance',
          },
        ],
      });
    });

    it('submits a payout request, immediately deducting from available balance into clearing hold', async () => {
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 15000, // 150.00 BDT
        payoutMethod: 'BKASH',
        accountDetails: 'bKash Personal: 01711000000',
      });

      expect(payout.id).toBeDefined();
      expect(payout.status).toBe('PENDING');
      expect(payout.amountCents).toBe(15000);

      // Verify wallet balance: available reduced from 20,000 to 5,000; payoutHold is 15,000
      const wallet = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(wallet.balanceCents).toBe(5000);
      expect(wallet.payoutHoldCents).toBe(15000);
    });

    it('rejects payout request exceeding available balance (insufficient funds)', async () => {
      await expect(
        payoutsService.requestPayout(mockInstructorAId, {
          amountCents: 30000, // 300.00 BDT when balance is 200.00 BDT
          payoutMethod: 'NAGAD',
          accountDetails: 'Nagad: 01800000000',
        })
      ).rejects.toThrow(/Insufficient available balance/);

      const wallet = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(wallet.balanceCents).toBe(20000);
      expect(wallet.payoutHoldCents).toBe(0);
    });

    it('prevents double spending: cannot request payouts concurrently that exceed available balance', async () => {
      // First request: 15,000 poisha (succeeds, 5,000 remaining)
      await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 15000,
        payoutMethod: 'BKASH',
        accountDetails: 'bKash: 01700000000',
      });

      // Second request: 10,000 poisha (fails because only 5,000 is left)
      await expect(
        payoutsService.requestPayout(mockInstructorAId, {
          amountCents: 10000,
          payoutMethod: 'BKASH',
          accountDetails: 'bKash: 01700000000',
        })
      ).rejects.toThrow(/Insufficient available balance/);

      const wallet = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(wallet.balanceCents).toBe(5000);
      expect(wallet.payoutHoldCents).toBe(15000);
    });

    it('prevents self-approval: an instructor cannot approve, reject, or settle their own payout', async () => {
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 5000,
        payoutMethod: 'BANK_TRANSFER',
        accountDetails: 'DBBL Acc 1234567890',
      });

      // Instructor A attempts to approve their own payout
      await expect(
        payoutsService.approvePayout(payout.id, mockInstructorAId, {
          adminNotes: 'Self approval attempt',
        })
      ).rejects.toThrow(/Instructors cannot approve their own payout requests/);

      // Instructor A attempts to reject their own payout
      await expect(
        payoutsService.rejectPayout(payout.id, mockInstructorAId, {
          rejectionReason: 'Self reject attempt',
        })
      ).rejects.toThrow(/Instructors cannot reject their own payout requests/);

      // Instructor A attempts to settle their own payout
      await expect(
        payoutsService.settlePayout(payout.id, mockInstructorAId, {
          settlementReference: 'SELF_REF_001',
        })
      ).rejects.toThrow(/Instructors cannot settle their own payout requests/);
    });

    it('executes full approval and settlement lifecycle with external reference', async () => {
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 10000,
        payoutMethod: 'BKASH',
        accountDetails: '01711223344',
      });

      // 1. Admin Approves (status -> APPROVED, funds still in hold)
      const approved = await payoutsService.approvePayout(payout.id, mockAdminId, {
        adminNotes: 'Verified instructor bKash KYC',
      });
      expect(approved.status).toBe('APPROVED');
      expect(approved.reviewedBy).toBe(mockAdminId);

      const walletAfterApprove = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletAfterApprove.balanceCents).toBe(10000);
      expect(walletAfterApprove.payoutHoldCents).toBe(10000);

      // 2. Admin Settles with external MFS transaction reference
      const settled = await payoutsService.settlePayout(payout.id, mockAdminId, {
        settlementReference: 'BKASH_TXN_987654321',
        adminNotes: 'Disbursed via bKash Merchant batch payout',
      });

      expect(settled.status).toBe('SETTLED');
      expect(settled.settlementReference).toBe('BKASH_TXN_987654321');
      expect(settled.disbursedAt).toBeDefined();

      // Wallet hold is released to zero, available balance remains unchanged
      const walletAfterSettle = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletAfterSettle.balanceCents).toBe(10000);
      expect(walletAfterSettle.payoutHoldCents).toBe(0);

      // Terminal state: settled payout cannot be approved or rejected again
      await expect(
        payoutsService.approvePayout(payout.id, mockAdminId, {})
      ).rejects.toThrow(/Invalid state transition/);

      await expect(
        payoutsService.rejectPayout(payout.id, mockAdminId, { rejectionReason: 'Cannot reject settled' })
      ).rejects.toThrow(/Invalid state transition/);
    });

    it('restores held funds back to available balance when payout is rejected', async () => {
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 10000,
        payoutMethod: 'BANK_TRANSFER',
        accountDetails: 'Invalid routing number',
      });

      const walletBeforeReject = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletBeforeReject.balanceCents).toBe(10000);
      expect(walletBeforeReject.payoutHoldCents).toBe(10000);

      const rejected = await payoutsService.rejectPayout(payout.id, mockAdminId, {
        rejectionReason: 'Invalid routing number provided. Please update your profile.',
      });

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toContain('Invalid routing number');

      // Funds restored: available balance back to 20,000, hold back to 0
      const walletAfterReject = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletAfterReject.balanceCents).toBe(20000);
      expect(walletAfterReject.payoutHoldCents).toBe(0);
    });
  });

  describe('5. Earnings Statement & Query Aggregation', () => {
    it('aggregates summary including wallet balances, transaction history, and settled totals', async () => {
      // 1. Initial grant
      await ledgerService.postTransaction({
        transactionType: 'ADJUSTMENT',
        idempotencyKey: `summary:grant:${mockInstructorAId}`,
        referenceType: 'SYSTEM',
        referenceId: 'init',
        description: 'Grant 300 BDT',
        entries: [
          {
            accountType: 'PLATFORM_CASH',
            direction: 'DEBIT',
            amountCents: 30000,
            description: 'Cash deposit',
          },
          {
            accountType: 'INSTRUCTOR_AVAILABLE',
            instructorId: mockInstructorAId,
            direction: 'CREDIT',
            amountCents: 30000,
            description: 'Grant available balance',
          },
        ],
      });

      // 2. Request and settle 100 BDT
      const po = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 10000,
        payoutMethod: 'BKASH',
        accountDetails: '01700000000',
      });
      await payoutsService.approvePayout(po.id, mockAdminId, {});
      await payoutsService.settlePayout(po.id, mockAdminId, { settlementReference: 'BKASH_123' });

      const summary = await ledgerService.getEarningsSummary(mockInstructorAId);
      expect(summary.wallet.balanceCents).toBe(20000); // 300 - 100 = 200 BDT
      expect(summary.settledPayoutsTotalCents).toBe(10000);
      expect(summary.recentTransactions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('6. Hardened Multi-Source Refund Clawbacks & Platform Absorption', () => {
    it('claws back from both available balance and in-flight payout hold when refund exceeds available balance', async () => {
      // 1. Order of 10,000 poisha (100 BDT)
      const orderId = crypto.randomUUID();
      const orderItemId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const refundId = crypto.randomUUID();
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

      await db.insert(orders).values({
        id: orderId,
        orderNumber: 'TSP-ORD-CLAWBACK-MULTI',
        studentId: mockStudentId,
        status: 'PAID',
        subtotalCents: 10000,
        discountCents: 0,
        payableCents: 10000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: fifteenDaysAgo,
      });

      await db.insert(orderItems).values({
        id: orderItemId,
        orderId,
        courseId: courseAId,
        courseTitle: 'Full-Stack TypeScript & Financial Systems',
        unitPriceCents: 10000,
        discountCents: 0,
        payableCents: 10000,
      });

      await ledgerService.postCoursePurchase(orderId);
      await ledgerService.settleMaturedEscrow(new Date());

      // Alice has 7,000 available balance
      const walletBefore = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletBefore.balanceCents).toBe(7000);

      // Alice requests payout of 5,000 poisha -> 2,000 available, 5,000 payout hold
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 5000,
        payoutMethod: 'BKASH',
        accountDetails: '01711111111',
      });
      expect(payout.status).toBe('PENDING');

      const walletWithHold = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletWithHold.balanceCents).toBe(2000);
      expect(walletWithHold.payoutHoldCents).toBe(5000);

      // Now student requests full refund of 10,000 poisha (7,000 instructor share + 3,000 platform share)
      await db.insert(payments).values({
        id: paymentId,
        orderId,
        merchantTranId: `MTX-CLAWBACK-MULTI-${Date.now()}`,
        amountCents: 10000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      await db.insert(refunds).values({
        id: refundId,
        refundNumber: 'TSP-REF-CLAWBACK-MULTI',
        orderId,
        paymentId,
        amountCents: 10000,
        currency: 'BDT',
        reason: 'Refund with pending payout in-flight',
        status: 'PROCESSED',
      });

      const clawbackTx = await ledgerService.postRefundClawback(refundId);
      expect(clawbackTx).not.toBeNull();
      expect(clawbackTx!.transactionType).toBe('REFUND_CLAWBACK');

      // Verify wallet state: available balance reduced to 0, hold reduced to 0
      const walletAfter = await ledgerService.getOrCreateWallet(mockInstructorAId);
      expect(walletAfter.balanceCents).toBe(0);
      expect(walletAfter.payoutHoldCents).toBe(0);

      // Verify in-flight payout request was cancelled because hold was clawed back
      const [updatedPayout] = await db
        .select()
        .from(payoutRequests)
        .where(eq(payoutRequests.id, payout.id));
      expect(updatedPayout.status).toBe('REJECTED');
      expect(updatedPayout.rejectionReason).toContain('clawed back');

      // Verify accounting integrity: sum of debits === sum of credits === 10,000 poisha
      expect(clawbackTx!.totalAmountCents).toBe(10000);
      const totalDebits = clawbackTx!.entries!
        .filter((e) => e.direction === 'DEBIT')
        .reduce((sum, e) => sum + e.amountCents, 0);
      const totalCredits = clawbackTx!.entries!
        .filter((e) => e.direction === 'CREDIT')
        .reduce((sum, e) => sum + e.amountCents, 0);
      expect(totalDebits).toBe(10000);
      expect(totalCredits).toBe(10000);
    });

    it('absorbs instructor share via platform revenue when instructor has already withdrawn all earnings', async () => {
      // 1. Order of 10,000 poisha
      const orderId = crypto.randomUUID();
      const orderItemId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const refundId = crypto.randomUUID();
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);

      await db.insert(orders).values({
        id: orderId,
        orderNumber: 'TSP-ORD-WITHDRAWN-REFUND',
        studentId: mockStudentId,
        status: 'PAID',
        subtotalCents: 10000,
        discountCents: 0,
        payableCents: 10000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: twentyDaysAgo,
      });

      await db.insert(orderItems).values({
        id: orderItemId,
        orderId,
        courseId: courseBId, // Instructor Bob
        courseTitle: 'Distributed Systems & Database Transactions',
        unitPriceCents: 10000,
        discountCents: 0,
        payableCents: 10000,
      });

      await ledgerService.postCoursePurchase(orderId);
      await ledgerService.settleMaturedEscrow(new Date());

      // Bob withdraws all 7,000 poisha
      const po = await payoutsService.requestPayout(mockInstructorBId, {
        amountCents: 7000,
        payoutMethod: 'BANK_TRANSFER',
        accountDetails: 'DBBL 123456789',
      });
      await payoutsService.approvePayout(po.id, mockAdminId, {});
      await payoutsService.settlePayout(po.id, mockAdminId, {
        settlementReference: 'EFT-BANK-REF-999',
      });

      const walletBob = await ledgerService.getOrCreateWallet(mockInstructorBId);
      expect(walletBob.balanceCents).toBe(0);
      expect(walletBob.payoutHoldCents).toBe(0);

      // Student gets exception refund
      await db.insert(payments).values({
        id: paymentId,
        orderId,
        merchantTranId: `MTX-WITHDRAWN-${Date.now()}`,
        amountCents: 10000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      await db.insert(refunds).values({
        id: refundId,
        refundNumber: 'TSP-REF-WITHDRAWN',
        orderId,
        paymentId,
        amountCents: 10000,
        currency: 'BDT',
        reason: 'Legal exception refund post-withdrawal',
        status: 'PROCESSED',
      });

      // Post refund clawback: instructor has 0 balance, so platform absorbs the 7,000 deficit
      const clawbackTx = await ledgerService.postRefundClawback(refundId);
      expect(clawbackTx).not.toBeNull();
      expect(clawbackTx!.totalAmountCents).toBe(10000);

      // Verify wallet did NOT go negative and is still 0
      const walletBobAfter = await ledgerService.getOrCreateWallet(mockInstructorBId);
      expect(walletBobAfter.balanceCents).toBe(0);

      // Verify debits: PLATFORM_REVENUE (10,000 = 3,000 fee + 7,000 absorption), Credit: PLATFORM_CASH (10,000)
      const platformRevenueDebits = clawbackTx!.entries!
        .filter((e) => e.accountType === 'PLATFORM_REVENUE' && e.direction === 'DEBIT')
        .reduce((sum, e) => sum + e.amountCents, 0);
      expect(platformRevenueDebits).toBe(10000);
    });
  });

  describe('7. Two-Phase Payout State Machine & Settlement Safeguards', () => {
    beforeEach(async () => {
      // Seed Instructor A with 20,000 poisha (200.00 BDT) available balance
      await ledgerService.postTransaction({
        transactionType: 'ADJUSTMENT',
        idempotencyKey: `seed:funds:payouts:${mockInstructorAId}:${Date.now()}`,
        referenceType: 'SYSTEM',
        referenceId: 'init',
        description: 'Seed 200 BDT',
        entries: [
          {
            accountType: 'PLATFORM_CASH',
            direction: 'DEBIT',
            amountCents: 20000,
            description: 'Platform cash deposit',
          },
          {
            accountType: 'INSTRUCTOR_AVAILABLE',
            instructorId: mockInstructorAId,
            direction: 'CREDIT',
            amountCents: 20000,
            description: 'Credit Alice available balance',
          },
        ],
      });
    });

    it('rejects direct settlement from PENDING status without prior approval', async () => {
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 5000,
        payoutMethod: 'BKASH',
        accountDetails: '01700000000',
      });
      expect(payout.status).toBe('PENDING');

      // Attempting to settle directly from PENDING must fail
      await expect(
        payoutsService.settlePayout(payout.id, mockAdminId, {
          settlementReference: 'MFS_TXN_VALID_REF',
        })
      ).rejects.toThrow(/Payout must be in APPROVED status to settle/);
    });

    it('rejects settlement with missing, null, or short (< 3 chars) settlement reference', async () => {
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 2000,
        payoutMethod: 'BKASH',
        accountDetails: '01700000000',
      });
      await payoutsService.approvePayout(payout.id, mockAdminId, {});

      await expect(
        payoutsService.settlePayout(payout.id, mockAdminId, {
          settlementReference: 'AB', // < 3 chars
        })
      ).rejects.toThrow(/valid external settlement reference/);

      await expect(
        payoutsService.settlePayout(payout.id, mockAdminId, {
          settlementReference: '   ', // whitespace only
        })
      ).rejects.toThrow(/valid external settlement reference/);
    });

    it('prevents instructors from approving or settling their own payouts even with admin credentials', async () => {
      const payout = await payoutsService.requestPayout(mockInstructorAId, {
        amountCents: 1000,
        payoutMethod: 'NAGAD',
        accountDetails: '01800000000',
      });

      // Self-approval attempt
      await expect(
        payoutsService.approvePayout(payout.id, mockInstructorAId, {})
      ).rejects.toThrow(/Instructors cannot approve their own payout requests/);

      // Self-rejection attempt
      await expect(
        payoutsService.rejectPayout(payout.id, mockInstructorAId, { rejectionReason: 'Cancel myself' })
      ).rejects.toThrow(/Instructors cannot reject their own payout requests/);

      // Approve by real admin
      await payoutsService.approvePayout(payout.id, mockAdminId, {});

      // Self-settlement attempt
      await expect(
        payoutsService.settlePayout(payout.id, mockInstructorAId, { settlementReference: 'TXN_123' })
      ).rejects.toThrow(/Instructors cannot settle their own payout requests/);
    });
  });

  describe('8. Wallet Balance Reconciliation & Discrepancy Detection', () => {
    it('verifies that wallet materialized balances reconcile 100% with double-entry ledger entries', async () => {
      // Verify initial reconciliation
      const recBefore = await ledgerService.reconcileWallet(mockInstructorAId);
      expect(recBefore.reconciled).toBe(true);
      expect(recBefore.discrepancies.pendingDiff).toBe(0);
      expect(recBefore.discrepancies.balanceDiff).toBe(0);
      expect(recBefore.discrepancies.payoutHoldDiff).toBe(0);

      // Add a course purchase and escrow maturity
      const ordId = crypto.randomUUID();
      const ordItemId = crypto.randomUUID();
      await db.insert(orders).values({
        id: ordId,
        orderNumber: 'TSP-ORD-RECONCILE',
        studentId: mockStudentId,
        status: 'PAID',
        subtotalCents: 10000,
        discountCents: 0,
        payableCents: 10000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
      });
      await db.insert(orderItems).values({
        id: ordItemId,
        orderId: ordId,
        courseId: courseAId,
        courseTitle: 'Full-Stack TypeScript & Financial Systems',
        unitPriceCents: 10000,
        discountCents: 0,
        payableCents: 10000,
      });

      await ledgerService.postCoursePurchase(ordId);
      await ledgerService.settleMaturedEscrow(new Date());

      const recAfter = await ledgerService.reconcileWallet(mockInstructorAId);
      expect(recAfter.reconciled).toBe(true);
      expect(recAfter.discrepancies.pendingDiff).toBe(0);
      expect(recAfter.discrepancies.balanceDiff).toBe(0);
      expect(recAfter.discrepancies.payoutHoldDiff).toBe(0);
    });
  });
});
