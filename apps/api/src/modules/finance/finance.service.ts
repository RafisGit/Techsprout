import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, sql, count, inArray, desc } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  orders,
  orderItems,
  payments,
  refunds,
  invoices,
  enrollments,
  courses,
  users,
  couponRedemptions,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import {
  FinanceSummaryDto,
  ReconciliationQuery,
  ReconciliationResultDto,
  ReconciliationDiscrepancyDto,
} from '@techsprout/contracts';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Authoritative Finance Aggregations
   * Returns server-authoritative financial summary calculated directly from DB snapshots.
   */
  async getFinanceSummary(): Promise<FinanceSummaryDto> {
    // 1. Authoritative Gross Volume & Discounts for Finalized (PAID or REFUNDED) Orders
    const [salesAgg] = await this.db
      .select({
        grossVolume: sql<string>`COALESCE(SUM("payable_cents"), 0)`,
        totalDiscounts: sql<string>`COALESCE(SUM("discount_cents"), 0)`,
      })
      .from(orders)
      .where(inArray(orders.status, ['PAID', 'REFUNDED']));

    // 2. Authoritative Confirmed Refunds (only PROCESSED refunds count toward refund totals)
    const [refundAgg] = await this.db
      .select({
        totalRefunds: sql<string>`COALESCE(SUM("amount_cents"), 0)`,
      })
      .from(refunds)
      .where(eq(refunds.status, 'PROCESSED'));

    // 3. Authoritative Order Counts by Status
    const orderCounts = await this.db
      .select({
        status: orders.status,
        count: count(orders.id),
      })
      .from(orders)
      .groupBy(orders.status);

    const countMap = new Map<string, number>();
    for (const row of orderCounts) {
      countMap.set(row.status, Number(row.count));
    }

    const totalGrossVolumeCents = Number(salesAgg?.grossVolume || 0);
    const totalDiscountCents = Number(salesAgg?.totalDiscounts || 0);
    const totalRefundCents = Number(refundAgg?.totalRefunds || 0);
    const totalNetRevenueCents = totalGrossVolumeCents - totalRefundCents;

    const totalPaidOrdersCount = countMap.get('PAID') || 0;
    const totalRefundedOrdersCount = countMap.get('REFUNDED') || 0;
    const totalPendingOrdersCount =
      (countMap.get('PENDING') || 0) + (countMap.get('PAYMENT_PROCESSING') || 0);
    const totalCancelledOrdersCount = countMap.get('CANCELLED') || 0;

    return {
      totalGrossVolumeCents,
      totalDiscountCents,
      totalNetRevenueCents,
      totalRefundCents,
      totalPaidOrdersCount,
      totalRefundedOrdersCount,
      totalPendingOrdersCount,
      totalCancelledOrdersCount,
      currency: 'BDT',
    };
  }

  /**
   * Reconciliation Scanner & Safe Resolver
   * Detects gateway-internal state discrepancies and performs safe auto-resolutions
   * only for deterministic cases. Ambiguous cases (such as amount/currency mismatch)
   * are flagged with autoResolvable = false for manual review.
   */
  async scanReconciliation(
    query: ReconciliationQuery,
    actorId?: string
  ): Promise<ReconciliationResultDto> {
    const limit = query.limit ?? 50;
    const dryRun = query.dryRun ?? false;

    // Scan recent orders
    const scannedOrders = await this.db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    const discrepancies: ReconciliationDiscrepancyDto[] = [];
    let autoResolvedCount = 0;

    for (const order of scannedOrders) {
      // 1. Check payments associated with this order
      const orderPayments = await this.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id));

      const validatedPayment = orderPayments.find((p) => p.status === 'VALIDATED');

      // Check: Currency Mismatch
      if (validatedPayment && validatedPayment.currency !== order.currency) {
        discrepancies.push({
          id: `disc-cur-${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          discrepancyType: 'CURRENCY_MISMATCH',
          description: `Payment currency (${validatedPayment.currency}) does not match order currency (${order.currency})`,
          internalPayableCents: order.payableCents,
          gatewayAmountCents: validatedPayment.amountCents,
          detectedAt: new Date().toISOString(),
          autoResolvable: false,
        });
        continue;
      }

      // Check: Amount Mismatch
      if (validatedPayment && validatedPayment.amountCents !== order.payableCents) {
        discrepancies.push({
          id: `disc-amt-${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          discrepancyType: 'AMOUNT_MISMATCH',
          description: `Gateway validated amount (${validatedPayment.amountCents} poisha) does not match internal payable amount (${order.payableCents} poisha)`,
          internalPayableCents: order.payableCents,
          gatewayAmountCents: validatedPayment.amountCents,
          detectedAt: new Date().toISOString(),
          autoResolvable: false,
        });
        continue;
      }

      // Check: GATEWAY_VALIDATED_INTERNAL_PENDING
      if (validatedPayment && ['PENDING', 'PAYMENT_PROCESSING'].includes(order.status)) {
        const hasRequiredIdentity = Boolean(validatedPayment.valId && validatedPayment.bankTranId);
        const hasAmountMatch = validatedPayment.amountCents === order.payableCents;
        const hasCurrencyMatch = validatedPayment.currency === order.currency;

        const items = await this.db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        const hasExactItem = items.length === 1 && Boolean(items[0].courseId);

        let courseExists = false;
        let hasActiveEnrollmentConflict = false;
        let hasInvoiceConflict = false;

        if (hasExactItem) {
          const [course] = await this.db
            .select()
            .from(courses)
            .where(eq(courses.id, items[0].courseId))
            .limit(1);
          courseExists = Boolean(course);

          const [activeEnrollment] = await this.db
            .select()
            .from(enrollments)
            .where(
              and(
                eq(enrollments.studentId, order.studentId),
                eq(enrollments.courseId, items[0].courseId),
                eq(enrollments.status, 'ACTIVE')
              )
            )
            .limit(1);
          hasActiveEnrollmentConflict = Boolean(activeEnrollment);

          const [existingInvoice] = await this.db
            .select()
            .from(invoices)
            .where(eq(invoices.orderId, order.id))
            .limit(1);
          hasInvoiceConflict = Boolean(existingInvoice);
        }

        const isAutoResolvable =
          hasRequiredIdentity &&
          hasAmountMatch &&
          hasCurrencyMatch &&
          hasExactItem &&
          courseExists &&
          !hasActiveEnrollmentConflict &&
          !hasInvoiceConflict;

        let description = `Gateway payment validated but order remains in status '${order.status}'`;
        if (!hasRequiredIdentity) {
          description = `Gateway payment validated but missing required provider transaction identity (val_id / bank_tran_id). Manual review required.`;
        } else if (!hasExactItem) {
          description = `Gateway payment validated but order has ${items.length === 0 ? 'no' : 'ambiguous'} order items. Manual review required.`;
        } else if (!courseExists) {
          description = `Gateway payment validated but referenced course does not exist. Manual review required.`;
        } else if (hasActiveEnrollmentConflict) {
          description = `Gateway payment validated but active enrollment already exists for student and course. Manual review required.`;
        } else if (hasInvoiceConflict) {
          description = `Gateway payment validated but invoice already exists for pending order. Manual review required.`;
        }

        const discrepancy: ReconciliationDiscrepancyDto = {
          id: `disc-pend-${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          discrepancyType: 'GATEWAY_VALIDATED_INTERNAL_PENDING',
          description,
          internalPayableCents: order.payableCents,
          gatewayAmountCents: validatedPayment.amountCents,
          detectedAt: new Date().toISOString(),
          autoResolvable: isAutoResolvable,
        };

        if (!dryRun && isAutoResolvable) {
          await this.executeSafeAutoResolve(order.id, validatedPayment.id, actorId);
          autoResolvedCount++;
        }

        discrepancies.push(discrepancy);
        continue;
      }

      // Check: Gateway validated payment on cancelled order
      if (validatedPayment && order.status === 'CANCELLED') {
        discrepancies.push({
          id: `disc-canc-${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          discrepancyType: 'GATEWAY_VALIDATED_INTERNAL_PENDING',
          description: `Gateway payment validated but target order is CANCELLED. Manual review required.`,
          internalPayableCents: order.payableCents,
          gatewayAmountCents: validatedPayment.amountCents,
          detectedAt: new Date().toISOString(),
          autoResolvable: false,
        });
        continue;
      }

      // Check: Gateway validated payment on refunded order
      if (validatedPayment && order.status === 'REFUNDED') {
        discrepancies.push({
          id: `disc-ref-${order.id}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          discrepancyType: 'GATEWAY_VALIDATED_INTERNAL_PENDING',
          description: `Gateway payment validated but target order is REFUNDED. Manual review required.`,
          internalPayableCents: order.payableCents,
          gatewayAmountCents: validatedPayment.amountCents,
          detectedAt: new Date().toISOString(),
          autoResolvable: false,
        });
        continue;
      }

      // Check: PAID_WITHOUT_ENROLLMENT
      if (order.status === 'PAID') {
        const items = await this.db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        if (items.length !== 1 || !items[0].courseId) {
          discrepancies.push({
            id: `disc-enr-${order.id}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            discrepancyType: 'PAID_WITHOUT_ENROLLMENT',
            description: `Order is marked PAID but has ${items.length === 0 ? 'no' : 'ambiguous'} order items. Manual review required.`,
            internalPayableCents: order.payableCents,
            gatewayAmountCents: order.payableCents,
            detectedAt: new Date().toISOString(),
            autoResolvable: false,
          });
          continue;
        }

        const item = items[0];
        const [course] = await this.db
          .select()
          .from(courses)
          .where(eq(courses.id, item.courseId))
          .limit(1);

        if (!course) {
          discrepancies.push({
            id: `disc-enr-${order.id}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            discrepancyType: 'PAID_WITHOUT_ENROLLMENT',
            description: `Order is marked PAID but referenced course does not exist. Manual review required.`,
            internalPayableCents: order.payableCents,
            gatewayAmountCents: order.payableCents,
            detectedAt: new Date().toISOString(),
            autoResolvable: false,
          });
          continue;
        }

        const [enrollment] = await this.db
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.studentId, order.studentId),
              eq(enrollments.courseId, item.courseId)
            )
          )
          .limit(1);

        if (!enrollment || enrollment.status === 'CANCELLED') {
          const hasValidPaymentEvidence = order.payableCents === 0 || Boolean(validatedPayment);
          const isAutoResolvable = hasValidPaymentEvidence;

          const discrepancy: ReconciliationDiscrepancyDto = {
            id: `disc-enr-${order.id}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            discrepancyType: 'PAID_WITHOUT_ENROLLMENT',
            description: isAutoResolvable
              ? `Order is marked PAID but student lacks an active enrollment for course '${item.courseTitle}'`
              : `Order is marked PAID without positive validated payment evidence. Manual review required.`,
            internalPayableCents: order.payableCents,
            gatewayAmountCents: order.payableCents,
            detectedAt: new Date().toISOString(),
            autoResolvable: isAutoResolvable,
          };

          if (!dryRun && isAutoResolvable) {
            await this.db
              .insert(enrollments)
              .values({
                studentId: order.studentId,
                courseId: item.courseId,
                status: 'ACTIVE',
                enrolledAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [enrollments.studentId, enrollments.courseId],
                set: {
                  status: 'ACTIVE',
                  enrolledAt: new Date(),
                  updatedAt: new Date(),
                },
              });

            await this.auditService.record({
              actorId: actorId || null,
              action: 'RECONCILIATION_AUTO_RESOLVED',
              targetType: 'ENROLLMENT',
              targetId: order.id,
              metadata: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                discrepancyType: 'PAID_WITHOUT_ENROLLMENT',
              },
            });

            autoResolvedCount++;
          }

          discrepancies.push(discrepancy);
        }
      }
    }

    return {
      totalOrdersScanned: scannedOrders.length,
      discrepanciesFoundCount: discrepancies.length,
      autoResolvedCount,
      discrepancies,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Helper: Execute atomic safe auto-resolution for GATEWAY_VALIDATED_INTERNAL_PENDING
   */
  private async executeSafeAutoResolve(orderId: string, paymentId: string, actorId?: string) {
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order || !['PENDING', 'PAYMENT_PROCESSING'].includes(order.status)) {
        return;
      }

      const [paymentRecord] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

      if (
        !paymentRecord ||
        paymentRecord.status !== 'VALIDATED' ||
        !paymentRecord.valId ||
        !paymentRecord.bankTranId ||
        paymentRecord.amountCents !== order.payableCents ||
        paymentRecord.currency !== order.currency
      ) {
        return;
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      if (items.length !== 1 || !items[0].courseId) {
        return;
      }

      const item = items[0];
      const [course] = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, item.courseId))
        .limit(1);

      if (!course) {
        return;
      }

      const [activeEnrollment] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentId, order.studentId),
            eq(enrollments.courseId, item.courseId),
            eq(enrollments.status, 'ACTIVE')
          )
        )
        .limit(1);

      if (activeEnrollment) {
        return;
      }

      const [existingInvoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.orderId, order.id))
        .limit(1);

      if (existingInvoice) {
        return;
      }

      // Transition order to PAID
      await tx
        .update(orders)
        .set({
          status: 'PAID',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      // Consume coupon redemption if exists
      if (order.couponId) {
        await tx
          .update(couponRedemptions)
          .set({
            status: 'CONSUMED',
            consumedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(couponRedemptions.orderId, order.id),
              eq(couponRedemptions.status, 'RESERVED')
            )
          );
      }

      // Create enrollment strictly for order.studentId and item.courseId
      await tx
        .insert(enrollments)
        .values({
          studentId: order.studentId,
          courseId: item.courseId,
          status: 'ACTIVE',
          enrolledAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [enrollments.studentId, enrollments.courseId],
          set: {
            status: 'ACTIVE',
            enrolledAt: new Date(),
            updatedAt: new Date(),
          },
        });

      const [student] = await tx
        .select()
        .from(users)
        .where(eq(users.id, order.studentId))
        .limit(1);

      const invoiceNumber = `TSP-INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

      await tx.insert(invoices).values({
        invoiceNumber,
        orderId: order.id,
        studentId: order.studentId,
        studentName: student?.name || 'TechSprout Student',
        studentEmail: student?.email || 'student@techsprout.edu',
        studentPhone: student?.phone || null,
        courseTitle: item.courseTitle || course.title,
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        payableCents: order.payableCents,
        currency: order.currency,
        paymentMethod: paymentRecord.cardType || 'SSLCOMMERZ',
        bankTranId: paymentRecord.bankTranId || 'AUTO-RECONCILED',
        status: 'PAID',
        issuedAt: new Date(),
      });

      await this.auditService.record({
        actorId: actorId || null,
        action: 'RECONCILIATION_AUTO_RESOLVED',
        targetType: 'ORDER',
        targetId: orderId,
        metadata: {
          orderId,
          paymentId,
          discrepancyType: 'GATEWAY_VALIDATED_INTERNAL_PENDING',
        },
      });
    });
  }
}
