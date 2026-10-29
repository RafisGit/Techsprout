import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  payoutRequests,
  instructorWallets,
  users,
  PayoutRequest,
} from '../../database/schema';
import { MonetizationLedgerService } from './monetization-ledger.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import {
  RequestPayoutDto,
  ApprovePayoutDto,
  RejectPayoutDto,
  SettlePayoutDto,
  PayoutRequestDto,
  PayoutListQuery,
  PaginatedPayoutsDto,
  Currency,
  PayoutMethod,
  PayoutStatus,
} from '@techsprout/contracts';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(MonetizationLedgerService) private readonly ledgerService: MonetizationLedgerService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  public formatPayoutDto(
    payout: PayoutRequest,
    instructor?: { name: string; email: string }
  ): PayoutRequestDto {
    return {
      id: payout.id,
      requestNumber: payout.requestNumber,
      instructorId: payout.instructorId,
      instructorName: instructor?.name ?? null,
      instructorEmail: instructor?.email ?? null,
      walletId: payout.walletId,
      amountCents: payout.amountCents,
      currency: payout.currency as Currency,
      payoutMethod: payout.payoutMethod as PayoutMethod,
      accountDetails: payout.accountDetails,
      status: payout.status as PayoutStatus,
      requestedAt: payout.requestedAt.toISOString(),
      reviewedBy: payout.reviewedBy ?? null,
      reviewedAt: payout.reviewedAt ? payout.reviewedAt.toISOString() : null,
      adminNotes: payout.adminNotes ?? null,
      rejectionReason: payout.rejectionReason ?? null,
      disbursedAt: payout.disbursedAt ? payout.disbursedAt.toISOString() : null,
      settlementReference: payout.settlementReference ?? null,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
    };
  }

  /**
   * Submit Payout Request (Instructor)
   * Atomic available-balance verification and in-flight reservation.
   */
  async requestPayout(
    instructorId: string,
    input: RequestPayoutDto,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<PayoutRequestDto> {
    return this.db.transaction(async (tx) => {
      // 1. Acquire row lock on instructor wallet
      const [wallet] = await tx
        .select()
        .from(instructorWallets)
        .where(eq(instructorWallets.instructorId, instructorId))
        .for('update');

      if (!wallet) {
        throw new ApiException(
          'Instructor wallet not found. Must have active course earnings before requesting payout.',
          HttpStatus.NOT_FOUND,
          'WALLET_NOT_FOUND'
        );
      }

      // 2. Validate Available Balance
      if (wallet.balanceCents < input.amountCents) {
        throw new ApiException(
          `Insufficient available balance (${wallet.balanceCents} poisha). Cannot request ${input.amountCents} poisha.`,
          HttpStatus.BAD_REQUEST,
          'INSUFFICIENT_FUNDS'
        );
      }

      // 3. Generate Request Number
      const requestNumber = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

      // 4. Create Payout Request Row
      const [payout] = await tx
        .insert(payoutRequests)
        .values({
          requestNumber,
          instructorId,
          walletId: wallet.id,
          amountCents: input.amountCents,
          currency: wallet.currency,
          payoutMethod: input.payoutMethod,
          accountDetails: input.accountDetails,
          status: 'PENDING',
          requestedAt: new Date(),
        })
        .returning();

      // 5. Post Balanced Double-Entry Journal for Payout Hold
      // Debit: INSTRUCTOR_AVAILABLE, Credit: PAYOUT_CLEARING
      await this.ledgerService.postTransaction(
        {
          transactionType: 'PAYOUT_REQUEST',
          idempotencyKey: input.idempotencyKey || `payout:request:${payout.id}`,
          referenceType: 'PAYOUT_REQUEST',
          referenceId: payout.id,
          description: `Payout request #${payout.requestNumber} for ${payout.amountCents} poisha via ${payout.payoutMethod}`,
          currency: wallet.currency as Currency,
          entries: [
            {
              accountType: 'INSTRUCTOR_AVAILABLE',
              instructorId,
              walletId: wallet.id,
              direction: 'DEBIT',
              amountCents: input.amountCents,
              description: `Debit available balance for payout request #${payout.requestNumber}`,
            },
            {
              accountType: 'PAYOUT_CLEARING',
              instructorId,
              walletId: wallet.id,
              direction: 'CREDIT',
              amountCents: input.amountCents,
              description: `Hold funds in clearing for payout request #${payout.requestNumber}`,
            },
          ],
        },
        tx
      );

      // 6. Audit Logging
      await this.auditService.record({
        actorId: instructorId,
        action: 'PAYOUT_REQUEST_SUBMITTED',
        targetType: 'PAYOUT_REQUEST',
        targetId: payout.id,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          requestNumber: payout.requestNumber,
          amountCents: payout.amountCents,
          payoutMethod: payout.payoutMethod,
          walletId: wallet.id,
        },
      });

      return this.formatPayoutDto(payout);
    });
  }

  /**
   * Approve Payout Request (Admin)
   * Validates authorization, self-approval prevention, and state transition.
   */
  async approvePayout(
    payoutId: string,
    adminId: string,
    input: ApprovePayoutDto,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<PayoutRequestDto> {
    return this.db.transaction(async (tx) => {
      const [payout] = await tx
        .select()
        .from(payoutRequests)
        .where(eq(payoutRequests.id, payoutId))
        .for('update');

      if (!payout) {
        throw new ApiException('Payout request not found', HttpStatus.NOT_FOUND, 'PAYOUT_NOT_FOUND');
      }

      // Self-Approval Prevention
      if (payout.instructorId === adminId) {
        throw new ApiException(
          'Instructors cannot approve their own payout requests',
          HttpStatus.FORBIDDEN,
          'SELF_APPROVAL_FORBIDDEN'
        );
      }

      // State Transition Check: PENDING -> APPROVED
      if (payout.status !== 'PENDING') {
        throw new ApiException(
          `Invalid state transition. Cannot approve payout with status: ${payout.status}`,
          HttpStatus.BAD_REQUEST,
          'INVALID_PAYOUT_STATE_TRANSITION'
        );
      }

      const now = new Date();
      const [updated] = await tx
        .update(payoutRequests)
        .set({
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: now,
          adminNotes: input.adminNotes || payout.adminNotes,
          updatedAt: now,
        })
        .where(eq(payoutRequests.id, payout.id))
        .returning();

      await this.auditService.record({
        actorId: adminId,
        action: 'PAYOUT_REQUEST_APPROVED',
        targetType: 'PAYOUT_REQUEST',
        targetId: payout.id,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          requestNumber: payout.requestNumber,
          amountCents: payout.amountCents,
          adminNotes: input.adminNotes,
        },
      });

      return this.formatPayoutDto(updated);
    });
  }

  /**
   * Reject Payout Request (Admin)
   * Restores held funds back to instructor's available balance.
   */
  async rejectPayout(
    payoutId: string,
    adminId: string,
    input: RejectPayoutDto,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<PayoutRequestDto> {
    return this.db.transaction(async (tx) => {
      const [payout] = await tx
        .select()
        .from(payoutRequests)
        .where(eq(payoutRequests.id, payoutId))
        .for('update');

      if (!payout) {
        throw new ApiException('Payout request not found', HttpStatus.NOT_FOUND, 'PAYOUT_NOT_FOUND');
      }

      // Self-Approval Prevention
      if (payout.instructorId === adminId) {
        throw new ApiException(
          'Instructors cannot reject their own payout requests',
          HttpStatus.FORBIDDEN,
          'SELF_APPROVAL_FORBIDDEN'
        );
      }

      // State Transition Check: PENDING or APPROVED -> REJECTED
      if (payout.status !== 'PENDING' && payout.status !== 'APPROVED') {
        throw new ApiException(
          `Invalid state transition. Cannot reject payout with status: ${payout.status}`,
          HttpStatus.BAD_REQUEST,
          'INVALID_PAYOUT_STATE_TRANSITION'
        );
      }

      const now = new Date();

      // Post Balanced Reversal Transaction:
      // Debit: PAYOUT_CLEARING, Credit: INSTRUCTOR_AVAILABLE
      await this.ledgerService.postTransaction(
        {
          transactionType: 'PAYOUT_REJECTED',
          idempotencyKey: `payout:reject:${payout.id}`,
          referenceType: 'PAYOUT_REQUEST',
          referenceId: payout.id,
          description: `Payout #${payout.requestNumber} rejected: ${input.rejectionReason}`,
          currency: payout.currency as Currency,
          entries: [
            {
              accountType: 'PAYOUT_CLEARING',
              instructorId: payout.instructorId,
              walletId: payout.walletId,
              direction: 'DEBIT',
              amountCents: payout.amountCents,
              description: `Release payout hold for rejected payout #${payout.requestNumber}`,
            },
            {
              accountType: 'INSTRUCTOR_AVAILABLE',
              instructorId: payout.instructorId,
              walletId: payout.walletId,
              direction: 'CREDIT',
              amountCents: payout.amountCents,
              description: `Restore available balance from rejected payout #${payout.requestNumber}`,
            },
          ],
        },
        tx
      );

      const [updated] = await tx
        .update(payoutRequests)
        .set({
          status: 'REJECTED',
          reviewedBy: adminId,
          reviewedAt: now,
          rejectionReason: input.rejectionReason,
          adminNotes: input.adminNotes || payout.adminNotes,
          updatedAt: now,
        })
        .where(eq(payoutRequests.id, payout.id))
        .returning();

      await this.auditService.record({
        actorId: adminId,
        action: 'PAYOUT_REQUEST_REJECTED',
        targetType: 'PAYOUT_REQUEST',
        targetId: payout.id,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          requestNumber: payout.requestNumber,
          amountCents: payout.amountCents,
          rejectionReason: input.rejectionReason,
        },
      });

      return this.formatPayoutDto(updated);
    });
  }

  /**
   * Settle Confirmed Payout (Admin)
   * Disburses funds externally via MFS / Bank, records reference, and releases platform cash.
   * State Transition: APPROVED or PENDING -> SETTLED
   */
  async settlePayout(
    payoutId: string,
    adminId: string,
    input: SettlePayoutDto,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<PayoutRequestDto> {
    return this.db.transaction(async (tx) => {
      const [payout] = await tx
        .select()
        .from(payoutRequests)
        .where(eq(payoutRequests.id, payoutId))
        .for('update');

      if (!payout) {
        throw new ApiException('Payout request not found', HttpStatus.NOT_FOUND, 'PAYOUT_NOT_FOUND');
      }

      // Self-Approval Prevention
      if (payout.instructorId === adminId) {
        throw new ApiException(
          'Instructors cannot settle their own payout requests',
          HttpStatus.FORBIDDEN,
          'SELF_APPROVAL_FORBIDDEN'
        );
      }

      // Terminal State Check
      if (payout.status === 'SETTLED') {
        throw new ApiException(
          'Payout request is already settled',
          HttpStatus.BAD_REQUEST,
          'PAYOUT_ALREADY_SETTLED'
        );
      }

      if (payout.status !== 'APPROVED') {
        throw new ApiException(
          `Invalid state transition. Payout must be in APPROVED status to settle (current: ${payout.status})`,
          HttpStatus.BAD_REQUEST,
          'INVALID_PAYOUT_STATE_TRANSITION'
        );
      }

      if (
        !input.settlementReference ||
        typeof input.settlementReference !== 'string' ||
        input.settlementReference.trim().length < 3
      ) {
        throw new ApiException(
          'A valid external settlement reference (at least 3 characters) is required to settle a payout',
          HttpStatus.BAD_REQUEST,
          'INVALID_SETTLEMENT_REFERENCE'
        );
      }

      const now = new Date();

      // Post Balanced Settlement Transaction:
      // Debit: PAYOUT_CLEARING, Credit: PLATFORM_CASH
      await this.ledgerService.postTransaction(
        {
          transactionType: 'PAYOUT_SETTLED',
          idempotencyKey: `payout:settle:${payout.id}`,
          referenceType: 'PAYOUT_REQUEST',
          referenceId: payout.id,
          description: `Disbursement of Payout #${payout.requestNumber} via ${payout.payoutMethod} (Ref: ${input.settlementReference})`,
          currency: payout.currency as Currency,
          entries: [
            {
              accountType: 'PAYOUT_CLEARING',
              instructorId: payout.instructorId,
              walletId: payout.walletId,
              direction: 'DEBIT',
              amountCents: payout.amountCents,
              description: `Release clearing hold for settled payout #${payout.requestNumber}`,
            },
            {
              accountType: 'PLATFORM_CASH',
              direction: 'CREDIT',
              amountCents: payout.amountCents,
              description: `Disbursement from platform funds for payout #${payout.requestNumber} (Ref: ${input.settlementReference})`,
            },
          ],
        },
        tx
      );

      const [updated] = await tx
        .update(payoutRequests)
        .set({
          status: 'SETTLED',
          reviewedBy: adminId,
          reviewedAt: payout.reviewedAt || now,
          disbursedAt: now,
          settlementReference: input.settlementReference,
          adminNotes: input.adminNotes || payout.adminNotes,
          updatedAt: now,
        })
        .where(eq(payoutRequests.id, payout.id))
        .returning();

      await this.auditService.record({
        actorId: adminId,
        action: 'PAYOUT_REQUEST_SETTLED',
        targetType: 'PAYOUT_REQUEST',
        targetId: payout.id,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          requestNumber: payout.requestNumber,
          amountCents: payout.amountCents,
          settlementReference: input.settlementReference,
          payoutMethod: payout.payoutMethod,
        },
      });

      return this.formatPayoutDto(updated);
    });
  }

  /**
   * List Payouts for an Instructor
   */
  async getInstructorPayouts(
    instructorId: string,
    query?: { page?: number; limit?: number }
  ): Promise<PaginatedPayoutsDto> {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(100, Math.max(1, query?.limit || 20));
    const offset = (page - 1) * limit;

    const [totalRow] = await this.db
      .select({ count: count(payoutRequests.id) })
      .from(payoutRequests)
      .where(eq(payoutRequests.instructorId, instructorId));

    const total = Number(totalRow?.count || 0);

    const rows = await this.db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.instructorId, instructorId))
      .orderBy(desc(payoutRequests.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((r) => this.formatPayoutDto(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * List All Payouts (Admin)
   */
  async getAdminPayouts(query?: PayoutListQuery): Promise<PaginatedPayoutsDto> {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(100, Math.max(1, query?.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (query?.status) {
      conditions.push(eq(payoutRequests.status, query.status));
    }
    if (query?.instructorId) {
      conditions.push(eq(payoutRequests.instructorId, query.instructorId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await this.db
      .select({ count: count(payoutRequests.id) })
      .from(payoutRequests)
      .where(whereClause);

    const total = Number(totalRow?.count || 0);

    const rows = await this.db
      .select({
        payout: payoutRequests,
        instructor: {
          name: users.name,
          email: users.email,
        },
      })
      .from(payoutRequests)
      .innerJoin(users, eq(payoutRequests.instructorId, users.id))
      .where(whereClause)
      .orderBy(desc(payoutRequests.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((r) => this.formatPayoutDto(r.payout, r.instructor)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get Specific Payout by ID (Access-Controlled)
   */
  async getPayoutById(
    payoutId: string,
    requestingUser: { id: string; role: string }
  ): Promise<PayoutRequestDto> {
    const [row] = await this.db
      .select({
        payout: payoutRequests,
        instructor: {
          name: users.name,
          email: users.email,
        },
      })
      .from(payoutRequests)
      .innerJoin(users, eq(payoutRequests.instructorId, users.id))
      .where(eq(payoutRequests.id, payoutId))
      .limit(1);

    if (!row) {
      throw new ApiException('Payout request not found', HttpStatus.NOT_FOUND, 'PAYOUT_NOT_FOUND');
    }

    // Authorization: instructor can only view their own payout
    if (requestingUser.role !== 'admin' && row.payout.instructorId !== requestingUser.id) {
      throw new ApiException(
        'Access denied: cannot view another instructor payout request',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return this.formatPayoutDto(row.payout, row.instructor);
  }
}
