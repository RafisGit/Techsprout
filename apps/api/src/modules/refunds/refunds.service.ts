import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  orders,
  payments,
  refunds,
  invoices,
  enrollments,
  certificates,
  orderItems,
  Refund,
  Enrollment,
  Certificate,
  Order,
  Payment,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import {
  ISSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../payments/sslcommerz.client';
import { centsToDecimalString } from '../payments/money.util';
import {
  AdminRefundOrderRequest,
  AdminReconcileRefundRequest,
  RefundDto,
  RefundListQuery,
  PaginatedRefundsData,
  Currency,
} from '@techsprout/contracts';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(SSLCOMMERZ_CLIENT) private readonly sslcommerzClient: ISSLCommerzClient,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  public formatRefundDto(refund: Refund, orderNumber?: string): RefundDto {
    return {
      id: refund.id,
      refundNumber: refund.refundNumber,
      orderId: refund.orderId,
      orderNumber: orderNumber,
      paymentId: refund.paymentId,
      amountCents: refund.amountCents,
      currency: refund.currency as Currency,
      reason: refund.reason,
      status: refund.status,
      processedBy: refund.processedBy ?? null,
      providerRefundRef: refund.providerRefundRef ?? null,
      processedAt: refund.processedAt ? refund.processedAt.toISOString() : null,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    };
  }

  /**
   * Phase 1: Initiate or retry refund operation for an order.
   * Short DB transaction to inspect order, check payment, and acquire/prepare the single refund row.
   * SSLCommerz external HTTP GET call is performed OUTSIDE database locks.
   */
  async initiateOrRetryRefund(
    orderId: string,
    adminId: string,
    input: AdminRefundOrderRequest,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RefundDto> {
    // 1. Acquire state and lock within short DB transaction
    let txResult: {
      refundRecord: Refund;
      paymentRecord: Payment;
      orderRecord: Order;
      isRetry: boolean;
    };

    try {
      txResult = await this.db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update');

        if (!order) {
          throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
        }

        if (order.status === 'REFUNDED') {
          throw new ApiException(
            'Order is already refunded',
            HttpStatus.BAD_REQUEST,
            'REFUND_ALREADY_PROCESSED'
          );
        }

        if (order.status !== 'PAID') {
          throw new ApiException(
            'Order is not in refundable status',
            HttpStatus.BAD_REQUEST,
            'ORDER_NOT_REFUNDABLE'
          );
        }

        if (order.payableCents <= 0) {
          throw new ApiException(
            'Zero-payable orders cannot be refunded via payment gateway',
            HttpStatus.BAD_REQUEST,
            'ORDER_NOT_REFUNDABLE'
          );
        }

        const [payment] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.orderId, order.id), eq(payments.status, 'VALIDATED')))
          .orderBy(desc(payments.createdAt))
          .limit(1);

        if (!payment || !payment.bankTranId) {
          throw new ApiException(
            'Payment is missing bank transaction ID',
            HttpStatus.BAD_REQUEST,
            'PAYMENT_MISSING_BANK_TRAN_ID'
          );
        }

        const [existingRefund] = await tx
          .select()
          .from(refunds)
          .where(eq(refunds.orderId, order.id))
          .for('update');

        let currentRefund: Refund;
        let retry = false;

        if (existingRefund) {
          if (existingRefund.status === 'PROCESSED') {
            throw new ApiException(
              'Refund already processed',
              HttpStatus.BAD_REQUEST,
              'REFUND_ALREADY_PROCESSED'
            );
          }
          if (existingRefund.status === 'PENDING') {
            if (existingRefund.providerRefundRef) {
              throw new ApiException(
                'Refund already pending with gateway. Use status query.',
                HttpStatus.CONFLICT,
                'REFUND_ALREADY_PENDING'
              );
            } else {
              throw new ApiException(
                'Refund requires manual review before retry',
                HttpStatus.CONFLICT,
                'REFUND_MANUAL_REVIEW_REQUIRED'
              );
            }
          }
          if (existingRefund.status === 'FAILED') {
            // Admin retrying previously failed refund operation: reuse same row and refundNumber
            retry = true;
            const [updated] = await tx
              .update(refunds)
              .set({
                status: 'PENDING',
                reason: input.reason,
                processedBy: adminId,
                providerRefundRef: null,
                updatedAt: new Date(),
              })
              .where(eq(refunds.id, existingRefund.id))
              .returning();
            currentRefund = updated;
          } else {
            currentRefund = existingRefund;
          }
        } else {
          // Singleton refund row creation
          const refundNumber = `TSP-REF-${order.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`;
          const [created] = await tx
            .insert(refunds)
            .values({
              refundNumber,
              orderId: order.id,
              paymentId: payment.id,
              amountCents: order.payableCents,
              currency: 'BDT',
              reason: input.reason,
              status: 'PENDING',
              processedBy: adminId,
              providerRefundRef: null,
            })
            .returning();
          currentRefund = created;
        }

        return {
          refundRecord: currentRefund,
          paymentRecord: payment,
          orderRecord: order,
          isRetry: retry,
        };
      });
    } catch (err: any) {
      if (err instanceof ApiException) {
        throw err;
      }
      if (err?.message?.includes('duplicate key') || err?.code === '23505') {
        throw new ApiException(
          'Refund already pending or initiated for this order',
          HttpStatus.CONFLICT,
          'REFUND_ALREADY_PENDING'
        );
      }
      throw err;
    }

    const { refundRecord, paymentRecord, orderRecord, isRetry } = txResult;

    // 2. External HTTP call to SSLCommerz (strictly OUTSIDE DB transaction / row locks)
    try {
      const refundAmount = centsToDecimalString(orderRecord.payableCents);
      const res = await this.sslcommerzClient.initiateRefund({
        bank_tran_id: paymentRecord.bankTranId!,
        refund_trans_id: refundRecord.refundNumber,
        refund_amount: refundAmount,
        refund_remarks: input.reason,
        refe_id: orderRecord.orderNumber,
      });

      if (res.status === 'success' || res.status === 'processing') {
        const providerRef = res.refund_ref_id ? String(res.refund_ref_id) : null;
        const [updated] = await this.db
          .update(refunds)
          .set({
            status: 'PENDING',
            providerRefundRef: providerRef,
            updatedAt: new Date(),
          })
          .where(eq(refunds.id, refundRecord.id))
          .returning();

        await this.auditService.record({
          actorId: adminId,
          action: isRetry ? 'REFUND_RETRIED' : 'REFUND_INITIATED',
          targetType: 'refund',
          targetId: refundRecord.id,
          metadata: {
            orderId: orderRecord.id,
            refundNumber: refundRecord.refundNumber,
            providerRefundRef: providerRef,
            amountCents: refundRecord.amountCents,
          },
          ipAddress: reqMeta?.ip,
          userAgent: reqMeta?.userAgent,
          requestId: reqMeta?.requestId,
        });

        return this.formatRefundDto(updated, orderRecord.orderNumber);
      } else {
        // Provider explicitly rejected the refund initiation
        const [failed] = await this.db
          .update(refunds)
          .set({
            status: 'FAILED',
            updatedAt: new Date(),
          })
          .where(eq(refunds.id, refundRecord.id))
          .returning();

        await this.auditService.record({
          actorId: adminId,
          action: 'REFUND_PROVIDER_FAILED',
          targetType: 'refund',
          targetId: refundRecord.id,
          metadata: {
            orderId: orderRecord.id,
            refundNumber: refundRecord.refundNumber,
            errorReason: res.errorReason,
          },
          ipAddress: reqMeta?.ip,
          userAgent: reqMeta?.userAgent,
          requestId: reqMeta?.requestId,
        });

        throw new ApiException(
          `Refund initiation rejected by gateway: ${res.errorReason || 'Provider rejected request'}`,
          HttpStatus.BAD_REQUEST,
          'REFUND_PROVIDER_FAILED'
        );
      }
    } catch (error: any) {
      if (error instanceof ApiException) {
        throw error;
      }

      // Timeout or network drop: keep PENDING, providerRefundRef remains null
      await this.auditService.record({
        actorId: adminId,
        action: 'REFUND_INITIATION_TIMEOUT',
        targetType: 'refund',
        targetId: refundRecord.id,
        metadata: {
          orderId: orderRecord.id,
          refundNumber: refundRecord.refundNumber,
          error: error?.message,
          manualReviewRequired: true,
        },
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
      });

      throw new ApiException(
        'Gateway timeout during refund initiation. Operation marked for manual review.',
        HttpStatus.GATEWAY_TIMEOUT,
        'REFUND_MANUAL_REVIEW_REQUIRED'
      );
    }
  }

  /**
   * Authoritatively query gateway refund settlement state.
   * If provider confirms 'refunded', executes atomic finalization.
   */
  async queryRefundStatus(
    refundId: string,
    adminId?: string,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RefundDto> {
    const [refundRecord] = await this.db
      .select()
      .from(refunds)
      .where(eq(refunds.id, refundId))
      .limit(1);

    if (!refundRecord) {
      throw new ApiException('Refund not found', HttpStatus.NOT_FOUND, 'REFUND_NOT_FOUND');
    }

    if (refundRecord.status === 'PROCESSED') {
      return this.formatRefundDto(refundRecord);
    }

    if (refundRecord.status === 'FAILED') {
      throw new ApiException(
        'Cannot query status of a failed refund. Retry initiation instead.',
        HttpStatus.BAD_REQUEST,
        'REFUND_PROVIDER_FAILED'
      );
    }

    if (!refundRecord.providerRefundRef) {
      throw new ApiException(
        'Refund is missing provider reference. Manual review required.',
        HttpStatus.BAD_REQUEST,
        'REFUND_MANUAL_REVIEW_REQUIRED'
      );
    }

    // Call SSLCommerz Query Refund API outside DB transaction
    let queryRes;
    try {
      queryRes = await this.sslcommerzClient.queryRefund(refundRecord.providerRefundRef);
    } catch (error: any) {
      throw new ApiException(
        `Gateway status query failed: ${error?.message}`,
        HttpStatus.GATEWAY_TIMEOUT,
        'REFUND_STATUS_QUERY_FAILED'
      );
    }

    if (queryRes.status === 'refunded') {
      // Execute atomic reversal
      return await this.atomicFinalizeRefund(refundRecord.id, refundRecord.orderId, adminId, reqMeta);
    } else if (queryRes.status === 'processing') {
      const [updated] = await this.db
        .update(refunds)
        .set({ updatedAt: new Date() })
        .where(eq(refunds.id, refundRecord.id))
        .returning();
      return this.formatRefundDto(updated);
    } else if (queryRes.status === 'failed' || queryRes.status === 'cancelled') {
      const [updated] = await this.db
        .update(refunds)
        .set({
          status: 'FAILED',
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, refundRecord.id))
        .returning();
      return this.formatRefundDto(updated);
    }

    return this.formatRefundDto(refundRecord);
  }

  /**
   * Atomic local domain finalization upon confirmed 'refunded' gateway status.
   * Scoped strictly to the exact affected order, invoice, enrollment, and certificate.
   */
  async atomicFinalizeRefund(
    refundId: string,
    orderId: string,
    adminId?: string,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RefundDto> {
    return this.db.transaction(async (tx) => {
      // 1. Lock order
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update');

      if (!order) {
        throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
      }

      // 2. Lock refund
      const [refund] = await tx
        .select()
        .from(refunds)
        .where(eq(refunds.id, refundId))
        .for('update');

      if (!refund) {
        throw new ApiException('Refund not found', HttpStatus.NOT_FOUND, 'REFUND_NOT_FOUND');
      }

      // Idempotency: if already processed or order refunded, safely return
      if (refund.status === 'PROCESSED' || order.status === 'REFUNDED') {
        return this.formatRefundDto(refund, order.orderNumber);
      }

      // 3. Find exact course for this order
      const [orderItem] = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))
        .limit(1);

      // 4. Find exact enrollment associated with this order/student/course
      let targetEnrollment: Enrollment | undefined;
      if (orderItem) {
        const [enr] = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.studentId, order.studentId),
              eq(enrollments.courseId, orderItem.courseId)
            )
          )
          .for('update')
          .limit(1);
        targetEnrollment = enr;
      }

      // 5. Find exact certificate associated with that enrollment
      let targetCert: Certificate | undefined;
      if (targetEnrollment) {
        const [cert] = await tx
          .select()
          .from(certificates)
          .where(
            and(
              eq(certificates.enrollmentId, targetEnrollment.id),
              eq(certificates.status, 'ACTIVE')
            )
          )
          .for('update')
          .limit(1);
        targetCert = cert;
      }

      // 6. Find exact invoice for this order
      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.orderId, order.id))
        .for('update')
        .limit(1);

      const now = new Date();

      // 7. Update refund: PENDING -> PROCESSED
      const [finalizedRefund] = await tx
        .update(refunds)
        .set({
          status: 'PROCESSED',
          processedAt: now,
          updatedAt: now,
        })
        .where(eq(refunds.id, refund.id))
        .returning();

      // 8. Update order: PAID -> REFUNDED
      await tx
        .update(orders)
        .set({
          status: 'REFUNDED',
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));

      // 9. Update invoice: PAID -> REFUNDED (historical snapshot fields unchanged)
      if (inv) {
        await tx
          .update(invoices)
          .set({
            status: 'REFUNDED',
            updatedAt: now,
          })
          .where(eq(invoices.id, inv.id));
      }

      // 10. Update enrollment: ACTIVE -> CANCELLED (strictly target enrollment)
      if (targetEnrollment) {
        await tx
          .update(enrollments)
          .set({
            status: 'CANCELLED',
            updatedAt: now,
          })
          .where(eq(enrollments.id, targetEnrollment.id));
      }

      // 11. Update certificate: ACTIVE -> REVOKED (strictly target certificate)
      if (targetCert) {
        await tx
          .update(certificates)
          .set({
            status: 'REVOKED',
            revokedAt: now,
            revocationReason: 'Order refunded',
            updatedAt: now,
          })
          .where(eq(certificates.id, targetCert.id));
      }

      await this.auditService.record({
        actorId: adminId || 'system',
        action: 'REFUND_FINALIZED',
        targetType: 'refund',
        targetId: refund.id,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          refundNumber: refund.refundNumber,
          amountCents: refund.amountCents,
          cancelledEnrollmentId: targetEnrollment?.id,
          revokedCertificateId: targetCert?.id,
          refundedInvoiceId: inv?.id,
        },
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
      });

      return this.formatRefundDto(finalizedRefund, order.orderNumber);
    });
  }

  /**
   * Manual administrative reconciliation for ambiguous refund operations.
   */
  async reconcileRefund(
    refundId: string,
    adminId: string,
    input: AdminReconcileRefundRequest,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RefundDto> {
    return this.db.transaction(async (tx) => {
      const [refund] = await tx
        .select()
        .from(refunds)
        .where(eq(refunds.id, refundId))
        .for('update');

      if (!refund) {
        throw new ApiException('Refund not found', HttpStatus.NOT_FOUND, 'REFUND_NOT_FOUND');
      }

      if (refund.status !== 'PENDING') {
        throw new ApiException(
          'Only pending refunds can be manually reconciled',
          HttpStatus.BAD_REQUEST,
          'REFUND_ALREADY_PROCESSED'
        );
      }

      const now = new Date();

      if (input.action === 'LINK_PROVIDER_REFERENCE') {
        if (refund.providerRefundRef) {
          throw new ApiException(
            'Refund already has a provider reference linked',
            HttpStatus.BAD_REQUEST,
            'REFUND_ALREADY_PENDING'
          );
        }

        const [updated] = await tx
          .update(refunds)
          .set({
            providerRefundRef: input.providerRefundRef,
            updatedAt: now,
          })
          .where(eq(refunds.id, refund.id))
          .returning();

        await this.auditService.record({
          actorId: adminId,
          action: 'REFUND_PROVIDER_REF_LINKED',
          targetType: 'refund',
          targetId: refund.id,
          metadata: {
            providerRefundRef: input.providerRefundRef,
          },
          ipAddress: reqMeta?.ip,
          userAgent: reqMeta?.userAgent,
          requestId: reqMeta?.requestId,
        });

        return this.formatRefundDto(updated);
      } else if (input.action === 'MARK_FAILED') {
        const [updated] = await tx
          .update(refunds)
          .set({
            status: 'FAILED',
            reason: `Manual reconciliation failure: ${input.reason}`,
            updatedAt: now,
          })
          .where(eq(refunds.id, refund.id))
          .returning();

        await this.auditService.record({
          actorId: adminId,
          action: 'REFUND_MANUALLY_MARKED_FAILED',
          targetType: 'refund',
          targetId: refund.id,
          metadata: {
            reason: input.reason,
          },
          ipAddress: reqMeta?.ip,
          userAgent: reqMeta?.userAgent,
          requestId: reqMeta?.requestId,
        });

        return this.formatRefundDto(updated);
      }

      throw new ApiException(
        'Invalid reconciliation action',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR'
      );
    });
  }

  /**
   * Get single refund by ID.
   */
  async getRefundById(refundId: string): Promise<RefundDto> {
    const [refund] = await this.db
      .select()
      .from(refunds)
      .where(eq(refunds.id, refundId))
      .limit(1);

    if (!refund) {
      throw new ApiException('Refund not found', HttpStatus.NOT_FOUND, 'REFUND_NOT_FOUND');
    }

    const [order] = await this.db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, refund.orderId))
      .limit(1);

    return this.formatRefundDto(refund, order?.orderNumber);
  }

  /**
   * List paginated refunds with optional filters.
   */
  async listRefunds(query: RefundListQuery): Promise<PaginatedRefundsData> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const whereConditions = [];

    if (query.status) {
      whereConditions.push(eq(refunds.status, query.status));
    }
    if (query.orderId) {
      whereConditions.push(eq(refunds.orderId, query.orderId));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [totalRes] = await this.db
      .select({ count: count(refunds.id) })
      .from(refunds)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await this.db
      .select()
      .from(refunds)
      .where(whereClause)
      .orderBy(desc(refunds.createdAt))
      .limit(limit)
      .offset(offset);

    const items = await Promise.all(
      rows.map(async (row) => {
        const [ord] = await this.db
          .select({ orderNumber: orders.orderNumber })
          .from(orders)
          .where(eq(orders.id, row.orderId))
          .limit(1);
        return this.formatRefundDto(row, ord?.orderNumber);
      })
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
