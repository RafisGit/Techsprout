import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import { eq, and, desc, sql, count, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  orders,
  orderItems,
  payments,
  users,
  enrollments,
  coupons,
  couponRedemptions,
  invoices,
  Payment,
  Order,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from '../orders/orders.service';
import { ApiException } from '../../common/errors/api-error';
import { env } from '../../config/env.config';
import {
  decimalStringToCents,
  centsToDecimalString,
} from './money.util';
import {
  ISSLCommerzClient,
  SSLCOMMERZ_CLIENT,
  SSLCommerzOrderValidationResponse,
} from './sslcommerz.client';
import {
  InitiatePaymentRequest,
  InitiatePaymentResponse,
  PaymentDto,
  PaymentListQuery,
  GATEWAY_MIN_AMOUNT_CENTS,
  GATEWAY_MAX_AMOUNT_CENTS,
} from '@techsprout/contracts';

export interface UserContext {
  id: string;
  role: string;
  name?: string;
  email?: string;
}

export interface NormalizedValidationResult {
  valId: string;
  tranId: string;
  amountCents: number;
  currency: string;
  status: 'VALID' | 'VALIDATED';
  bankTranId?: string;
  cardType?: string;
  cardBrand?: string;
  gatewayFeeCents?: number;
  rawResponse: Record<string, unknown>;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(SSLCOMMERZ_CLIENT) private readonly sslcommerzClient: ISSLCommerzClient
  ) {}

  public formatPaymentDto(payment: Payment): PaymentDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      merchantTranId: payment.merchantTranId,
      provider: payment.provider,
      valId: payment.valId,
      bankTranId: payment.bankTranId,
      amountCents: payment.amountCents,
      currency: payment.currency as 'BDT',
      status: payment.status,
      cardType: payment.cardType,
      cardBrand: payment.cardBrand,
      gatewayFeeCents: payment.gatewayFeeCents,
      initiatedAt: payment.initiatedAt.toISOString(),
      validatedAt: payment.validatedAt ? payment.validatedAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
    };
  }

  private sanitizeGatewayData(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeywords = ['passwd', 'password', 'store_id', 'secret', 'token', 'cvv', 'cvc'];
    const sanitized: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (sensitiveKeywords.some((s) => lower.includes(s))) {
        continue;
      }
      sanitized[key] = val;
    }

    return sanitized;
  }

  /**
   * Initiate Gateway Payment Session
   * POST /api/v1/payments/initiate
   */
  async initiatePayment(
    studentId: string,
    input: InitiatePaymentRequest,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<InitiatePaymentResponse> {
    // 1. Fetch order
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);

    if (!order) {
      throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
    }

    // 2. Ownership verification
    if (order.studentId !== studentId) {
      throw new ApiException(
        'Access denied: cannot initiate payment for another student order',
        HttpStatus.FORBIDDEN,
        'ORDER_ACCESS_DENIED'
      );
    }

    // 3. Expiration verification
    if (order.expiresAt < new Date()) {
      await this.ordersService.expireOrderIfDue(order.id);
      throw new ApiException('Order has expired', HttpStatus.BAD_REQUEST, 'INVALID_ORDER_STATE_TRANSITION');
    }

    // 4. Order state verification
    if (order.status === 'PAID') {
      throw new ApiException(
        'Order is already paid',
        HttpStatus.BAD_REQUEST,
        'INVALID_ORDER_STATE_TRANSITION'
      );
    }

    if (order.status === 'CANCELLED') {
      throw new ApiException(
        'Order is cancelled',
        HttpStatus.BAD_REQUEST,
        'INVALID_ORDER_STATE_TRANSITION'
      );
    }

    if (order.status === 'REFUNDED') {
      throw new ApiException(
        'Order is refunded',
        HttpStatus.BAD_REQUEST,
        'INVALID_ORDER_STATE_TRANSITION'
      );
    }

    // 5. Amount & Minimum/Maximum Gateway Boundary Check
    if (order.payableCents === 0) {
      // Rule: payableCents === 0 -> bypass SSLCommerz completely
      const zeroBypass = await this.fulfillZeroPayableOrder(order, reqMeta);
      return {
        paymentId: zeroBypass.paymentId,
        merchantTranId: zeroBypass.merchantTranId,
        gatewayUrl: `${env.WEB_ORIGIN}/orders/${order.id}/success`,
        provider: 'SSLCOMMERZ',
      };
    }

    if (order.payableCents < GATEWAY_MIN_AMOUNT_CENTS) {
      // Rule: 1 <= payableCents < 1000 -> reject payment initiation
      // SSLCommerz V4 requires minimum total_amount = 10.00 BDT (1000 cents/poisha)
      throw new ApiException(
        'Payment amount is below gateway minimum of 10.00 BDT',
        HttpStatus.BAD_REQUEST,
        'PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM'
      );
    }

    if (order.payableCents > GATEWAY_MAX_AMOUNT_CENTS) {
      // Rule: payableCents > 50_000_000 -> reject BEFORE contacting SSLCommerz
      // SSLCommerz V4 specifies maximum total_amount = 500,000.00 BDT (50,000,000 cents/poisha)
      throw new ApiException(
        'Payment amount exceeds gateway maximum limit of 500,000.00 BDT',
        HttpStatus.BAD_REQUEST,
        'PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM'
      );
    }

    // 6. Fetch course title & student profile
    const [item] = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .limit(1);

    const [student] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    const courseTitle = item?.courseTitle || 'TechSprout Course';
    const merchantTranId = `TSP-TXN-${Date.now().toString().slice(-8)}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 7. Atomic creation of payment attempt & order transition
    const payment = await this.db.transaction(async (tx) => {
      // Transition order to PAYMENT_PROCESSING
      await tx
        .update(orders)
        .set({
          status: 'PAYMENT_PROCESSING',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      const [newPayment] = await tx
        .insert(payments)
        .values({
          orderId: order.id,
          merchantTranId,
          provider: 'SSLCOMMERZ',
          amountCents: order.payableCents,
          currency: order.currency,
          status: 'INITIATED',
          initiatedAt: new Date(),
        })
        .returning();

      return newPayment;
    });

    // 8. Gateway session initiation with authoritative server parameters
    const totalAmountStr = centsToDecimalString(order.payableCents);
    const apiPublicBase = env.API_PUBLIC_BASE_URL.replace(/\/+$/, '');

    let gatewaySession;
    try {
      gatewaySession = await this.sslcommerzClient.initiateSession({
        total_amount: totalAmountStr,
        currency: order.currency,
        tran_id: merchantTranId,
        success_url: `${apiPublicBase}/api/v1/payments/sslcommerz/success`,
        fail_url: `${apiPublicBase}/api/v1/payments/sslcommerz/fail`,
        cancel_url: `${apiPublicBase}/api/v1/payments/sslcommerz/cancel`,
        ipn_url: `${apiPublicBase}/api/v1/payments/sslcommerz/ipn`,
        cus_name: student?.name || 'TechSprout Student',
        cus_email: student?.email || 'student@techsprout.edu',
        cus_phone: student?.phone || '01700000000',
        product_name: courseTitle,
        product_category: 'Education',
      });
    } catch (err) {
      // Gateway error: update payment to FAILED
      await this.db
        .update(payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      throw new ApiException(
        'Failed to establish session with payment gateway',
        HttpStatus.BAD_GATEWAY,
        'GATEWAY_ERROR'
      );
    }

    if (gatewaySession.status !== 'SUCCESS' || !gatewaySession.GatewayPageURL) {
      await this.db
        .update(payments)
        .set({
          status: 'FAILED',
          rawResponse: JSON.stringify(this.sanitizeGatewayData(gatewaySession)),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      throw new ApiException(
        `Payment gateway session rejected: ${gatewaySession.failedreason || 'Gateway error'}`,
        HttpStatus.BAD_GATEWAY,
        'GATEWAY_ERROR'
      );
    }

    // Save provider session key
    await this.db
      .update(payments)
      .set({
        providerSessionKey: gatewaySession.sessionkey || null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    // Audit event
    await this.auditService.record({
      actorId: studentId,
      action: 'PAYMENT_INITIATED',
      targetType: 'PAYMENT',
      targetId: payment.id,
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        merchantTranId,
        amountCents: order.payableCents,
        currency: order.currency,
      },
    });

    return {
      paymentId: payment.id,
      merchantTranId,
      gatewayUrl: gatewaySession.GatewayPageURL,
      provider: 'SSLCOMMERZ',
    };
  }

  /**
   * Server-Authoritative SSLCommerz Validation
   * Calls Order Validation API and verifies tran_id, status, amount, and currency.
   */
  async validateWithSslCommerz(
    payment: Payment,
    valId: string
  ): Promise<NormalizedValidationResult> {
    const gatewayRes: SSLCommerzOrderValidationResponse =
      await this.sslcommerzClient.validateOrder(valId);

    // 1. Status verification
    if (gatewayRes.status !== 'VALID' && gatewayRes.status !== 'VALIDATED') {
      this.logger.warn(
        `Authoritative validation status invalid for tran_id=${payment.merchantTranId} val_id=${valId}: status=${gatewayRes.status}`
      );
      throw new ApiException(
        `Payment validation failed: gateway status is ${gatewayRes.status}`,
        HttpStatus.BAD_REQUEST,
        'PAYMENT_VALIDATION_FAILED'
      );
    }

    // 2. Transaction ID verification
    if (gatewayRes.tran_id !== payment.merchantTranId) {
      this.logger.warn(
        `Transaction ID mismatch: expected ${payment.merchantTranId}, got ${gatewayRes.tran_id}`
      );
      throw new ApiException(
        'Transaction identifier mismatch',
        HttpStatus.BAD_REQUEST,
        'PAYMENT_VALIDATION_FAILED'
      );
    }

    // 3. Currency verification
    if (gatewayRes.currency.toUpperCase() !== payment.currency.toUpperCase()) {
      this.logger.warn(
        `Currency mismatch: expected ${payment.currency}, got ${gatewayRes.currency}`
      );
      throw new ApiException(
        `Payment currency mismatch: expected ${payment.currency}, got ${gatewayRes.currency}`,
        HttpStatus.BAD_REQUEST,
        'PAYMENT_CURRENCY_MISMATCH'
      );
    }

    // 4. Amount verification
    let authAmountCents: number;
    try {
      authAmountCents = decimalStringToCents(gatewayRes.amount);
    } catch {
      throw new ApiException(
        'Invalid amount format returned by payment gateway',
        HttpStatus.BAD_REQUEST,
        'PAYMENT_AMOUNT_MISMATCH'
      );
    }

    if (authAmountCents !== payment.amountCents) {
      this.logger.warn(
        `Amount mismatch for tran_id=${payment.merchantTranId}: expected ${payment.amountCents}, got ${authAmountCents}`
      );
      throw new ApiException(
        `Payment amount mismatch: expected ${payment.amountCents} minor units, got ${authAmountCents}`,
        HttpStatus.BAD_REQUEST,
        'PAYMENT_AMOUNT_MISMATCH'
      );
    }

    // 5. Calculate gateway fee if store_amount is provided
    let gatewayFeeCents: number | undefined;
    if (gatewayRes.store_amount) {
      try {
        const storeAmountCents = decimalStringToCents(gatewayRes.store_amount);
        gatewayFeeCents = Math.max(0, authAmountCents - storeAmountCents);
      } catch {
        gatewayFeeCents = undefined;
      }
    }

    return {
      valId,
      tranId: gatewayRes.tran_id,
      amountCents: authAmountCents,
      currency: gatewayRes.currency.toUpperCase(),
      status: gatewayRes.status as 'VALID' | 'VALIDATED',
      bankTranId: gatewayRes.bank_tran_id || undefined,
      cardType: gatewayRes.card_type || undefined,
      cardBrand: gatewayRes.card_brand || undefined,
      gatewayFeeCents,
      rawResponse: this.sanitizeGatewayData(gatewayRes),
    };
  }

  /**
   * Internal fulfillment for zero-payable orders (e.g. 100% coupon)
   * Completely bypasses SSLCommerz gateway
   */
  async fulfillZeroPayableOrder(
    order: Order,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ paymentId: string; merchantTranId: string }> {
    const merchantTranId = `TSP-FREE-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await this.db.transaction(async (tx) => {
      // 1. Lock order row
      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .for('update');

      if (!lockedOrder) {
        throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
      }

      if (lockedOrder.status === 'PAID') {
        const [existingPayment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.orderId, lockedOrder.id))
          .limit(1);
        return {
          paymentId: existingPayment?.id || 'existing',
          merchantTranId: existingPayment?.merchantTranId || merchantTranId,
        };
      }

      // 2. Insert validated internal payment record
      const [newPayment] = await tx
        .insert(payments)
        .values({
          orderId: lockedOrder.id,
          merchantTranId,
          provider: 'SSLCOMMERZ',
          amountCents: 0,
          currency: lockedOrder.currency,
          status: 'VALIDATED',
          cardType: '100% DISCOUNT COUPON',
          bankTranId: 'FREE_COUPON',
          initiatedAt: new Date(),
          validatedAt: new Date(),
        })
        .returning();

      // 3. Mark order PAID
      await tx
        .update(orders)
        .set({
          status: 'PAID',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, lockedOrder.id));

      // 4. Enrollment fulfillment
      const [item] = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, lockedOrder.id))
        .limit(1);

      if (item) {
        const [existingEnrollment] = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.studentId, lockedOrder.studentId),
              eq(enrollments.courseId, item.courseId)
            )
          )
          .limit(1);

        try {
          if (!existingEnrollment) {
            await tx.insert(enrollments).values({
              studentId: lockedOrder.studentId,
              courseId: item.courseId,
              status: 'ACTIVE',
              enrolledAt: new Date(),
            });
          } else if (existingEnrollment.status === 'CANCELLED') {
            await tx
              .update(enrollments)
              .set({
                status: 'ACTIVE',
                enrolledAt: new Date(),
                completedAt: null,
                updatedAt: new Date(),
              })
              .where(eq(enrollments.id, existingEnrollment.id));
          }
        } catch (err: any) {
          if (
            !err?.message?.includes('duplicate key') &&
            !err?.message?.includes('unique constraint') &&
            !err?.message?.includes('enrollments_pkey')
          ) {
            throw err;
          }
        }
      }

      // 5. Coupon fulfillment: RESERVED -> CONSUMED
      if (lockedOrder.couponId) {
        await tx
          .update(couponRedemptions)
          .set({
            status: 'CONSUMED',
            consumedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(couponRedemptions.orderId, lockedOrder.id),
              eq(couponRedemptions.status, 'RESERVED')
            )
          );
      }

      // 6. Invoice generation
      const invoiceNumber = `TSP-INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
      const [student] = await tx
        .select()
        .from(users)
        .where(eq(users.id, lockedOrder.studentId))
        .limit(1);

      try {
        await tx.insert(invoices).values({
          invoiceNumber,
          orderId: lockedOrder.id,
          studentId: lockedOrder.studentId,
          studentName: student?.name || 'TechSprout Student',
          studentEmail: student?.email || 'student@techsprout.edu',
          studentPhone: student?.phone || null,
          courseTitle: item?.courseTitle || 'Course Purchase',
          subtotalCents: lockedOrder.subtotalCents,
          discountCents: lockedOrder.discountCents,
          payableCents: 0,
          currency: lockedOrder.currency,
          paymentMethod: 'COUPON',
          bankTranId: 'FREE_COUPON',
          status: 'PAID',
          issuedAt: new Date(),
        });
      } catch (err: any) {
        if (
          !err?.message?.includes('duplicate key') &&
          !err?.message?.includes('unique constraint') &&
          !err?.message?.includes('invoices_order_id_uq')
        ) {
          throw err;
        }
      }

      return { paymentId: newPayment.id, merchantTranId };
    });

    // Audit logs
    await this.auditService.record({
      actorId: order.studentId,
      action: 'PAYMENT_VALIDATED',
      targetType: 'PAYMENT',
      targetId: result.paymentId,
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        merchantTranId: result.merchantTranId,
        amountCents: 0,
        currency: order.currency,
        isZeroPayableBypass: true,
      },
    });

    if (order.couponId) {
      await this.auditService.record({
        actorId: order.studentId,
        action: 'COUPON_REDEEMED',
        targetType: 'COUPON',
        targetId: order.couponId,
        metadata: {
          orderId: order.id,
          couponCode: order.couponCode,
          discountCents: order.discountCents,
        },
      });
    }

    return result;
  }

  /**
   * Authoritative Payment Fulfillment Operation
   * Enforces server-authoritative Order Validation API check BEFORE database locking,
   * short transaction window, row-level locking, idempotent transitions, enrollment
   * activation, coupon consumption, and invoice generation.
   */
  async processPaymentFulfillment(
    merchantTranId: string,
    valId: string,
    rawCallback: Record<string, unknown>,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ order: Order; isDuplicate: boolean }> {
    // 1. Resolve payment attempt outside transaction
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.merchantTranId, merchantTranId))
      .limit(1);

    if (!payment) {
      throw new ApiException(
        `Payment attempt not found for tran_id: ${merchantTranId}`,
        HttpStatus.NOT_FOUND,
        'PAYMENT_NOT_FOUND'
      );
    }

    // 2. Resolve order outside transaction
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, payment.orderId))
      .limit(1);

    if (!order) {
      throw new ApiException('Order record not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
    }

    // Fast-path idempotent check: if order is already PAID, skip external HTTP call
    if (order.status === 'PAID') {
      this.logger.log(
        `[IDEMPOTENT_FULFILLMENT] Order ${order.id} is already PAID. Skipping external validation call.`
      );
      await this.auditService.record({
        actorId: order.studentId,
        action: 'PAYMENT_REPLAY_DETECTED',
        targetType: 'PAYMENT',
        targetId: payment.id,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          merchantTranId,
          valId,
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
      });
      return { order, isDuplicate: true };
    }

    // 3. Call SSLCommerz server-side validation API OUTSIDE of DB transaction
    // ZERO database locks are held during this network call!
    const validated = await this.validateWithSslCommerz(payment, valId);

    // 4. BEGIN short-lived DB Transaction to apply verified result with row-level locks
    const fulfillment = await this.db.transaction(async (tx) => {
      // 5. Lock payment and order rows using SELECT FOR UPDATE
      const [lockedPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id))
        .for('update');

      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .for('update');

      if (!lockedOrder || !lockedPayment) {
        throw new ApiException(
          'Order or payment record missing during lock',
          HttpStatus.NOT_FOUND,
          'ORDER_NOT_FOUND'
        );
      }

      // 6. Re-check state and transaction identity under lock
      if (lockedPayment.merchantTranId !== validated.tranId) {
        throw new ApiException(
          'Transaction identity mismatch during lock',
          HttpStatus.BAD_REQUEST,
          'PAYMENT_VALIDATION_FAILED'
        );
      }

      // 7. If order became PAID while waiting for the lock: idempotent no-op!
      if (lockedOrder.status === 'PAID') {
        this.logger.log(
          `[IDEMPOTENT_FULFILLMENT] Order ${lockedOrder.id} was fulfilled concurrently. Idempotent no-op.`
        );
        return { order: lockedOrder, payment: lockedPayment, isDuplicate: true };
      }

      // 8. Update payment to VALIDATED
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: 'VALIDATED',
          valId: validated.valId,
          bankTranId: validated.bankTranId || null,
          cardType: validated.cardType || null,
          cardBrand: validated.cardBrand || null,
          gatewayFeeCents: validated.gatewayFeeCents || null,
          validatedAt: new Date(),
          rawResponse: JSON.stringify(validated.rawResponse),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, lockedPayment.id))
        .returning();

      // 9. Update order to PAID
      const [updatedOrder] = await tx
        .update(orders)
        .set({
          status: 'PAID',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, lockedOrder.id))
        .returning();

      // 10. Enrollment fulfillment
      const [item] = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, lockedOrder.id))
        .limit(1);

      if (item) {
        const [existingEnrollment] = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.studentId, lockedOrder.studentId),
              eq(enrollments.courseId, item.courseId)
            )
          )
          .limit(1);

        try {
          if (!existingEnrollment) {
            await tx.insert(enrollments).values({
              studentId: lockedOrder.studentId,
              courseId: item.courseId,
              status: 'ACTIVE',
              enrolledAt: new Date(),
            });
          } else if (existingEnrollment.status === 'CANCELLED') {
            // Reactivate cancelled enrollment per repurchase architecture
            await tx
              .update(enrollments)
              .set({
                status: 'ACTIVE',
                enrolledAt: new Date(),
                completedAt: null,
                updatedAt: new Date(),
              })
              .where(eq(enrollments.id, existingEnrollment.id));
          }
        } catch (err: any) {
          if (
            !err?.message?.includes('duplicate key') &&
            !err?.message?.includes('unique constraint') &&
            !err?.message?.includes('enrollments_pkey')
          ) {
            throw err;
          }
        }
        // If ACTIVE or COMPLETED, do not duplicate
      }

      // 11. Coupon fulfillment: RESERVED -> CONSUMED
      if (lockedOrder.couponId) {
        await tx
          .update(couponRedemptions)
          .set({
            status: 'CONSUMED',
            consumedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(couponRedemptions.orderId, lockedOrder.id),
              eq(couponRedemptions.status, 'RESERVED')
            )
          );
      }

      // 12. Invoice generation (exactly ONE immutable invoice record per order)
      const [existingInvoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.orderId, lockedOrder.id))
        .limit(1);

      if (!existingInvoice) {
        const [student] = await tx
          .select()
          .from(users)
          .where(eq(users.id, lockedOrder.studentId))
          .limit(1);

        const invoiceNumber = `TSP-INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

        try {
          await tx.insert(invoices).values({
            invoiceNumber,
            orderId: lockedOrder.id,
            studentId: lockedOrder.studentId,
            studentName: student?.name || 'TechSprout Student',
            studentEmail: student?.email || 'student@techsprout.edu',
            studentPhone: student?.phone || null,
            courseTitle: item?.courseTitle || 'Course Purchase',
            subtotalCents: lockedOrder.subtotalCents,
            discountCents: lockedOrder.discountCents,
            payableCents: lockedOrder.payableCents,
            currency: lockedOrder.currency,
            paymentMethod: validated.cardType || 'SSLCOMMERZ',
            bankTranId: validated.bankTranId || 'N/A',
            status: 'PAID',
            issuedAt: new Date(),
          });
        } catch (err: any) {
          if (
            !err?.message?.includes('duplicate key') &&
            !err?.message?.includes('unique constraint') &&
            !err?.message?.includes('invoices_order_id_uq')
          ) {
            throw err;
          }
        }
      }

      return { order: updatedOrder, payment: updatedPayment, isDuplicate: false };
    });

    // 13. Audit logging
    if (fulfillment.isDuplicate) {
      await this.auditService.record({
        actorId: fulfillment.order.studentId,
        action: 'PAYMENT_REPLAY_DETECTED',
        targetType: 'PAYMENT',
        targetId: fulfillment.payment.id,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          merchantTranId,
          valId,
          orderId: fulfillment.order.id,
          orderNumber: fulfillment.order.orderNumber,
        },
      });
    } else {
      await this.auditService.record({
        actorId: fulfillment.order.studentId,
        action: 'PAYMENT_VALIDATED',
        targetType: 'PAYMENT',
        targetId: fulfillment.payment.id,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          merchantTranId,
          valId,
          orderId: fulfillment.order.id,
          orderNumber: fulfillment.order.orderNumber,
          amountCents: fulfillment.payment.amountCents,
          currency: fulfillment.payment.currency,
        },
      });

      if (fulfillment.order.couponId) {
        await this.auditService.record({
          actorId: fulfillment.order.studentId,
          action: 'COUPON_REDEEMED',
          targetType: 'COUPON',
          targetId: fulfillment.order.couponId,
          metadata: {
            orderId: fulfillment.order.id,
            couponCode: fulfillment.order.couponCode,
            discountCents: fulfillment.order.discountCents,
          },
        });
      }
    }

    return { order: fulfillment.order, isDuplicate: fulfillment.isDuplicate };
  }

  /**
   * Fail Callback Handling
   * PAYMENT_PROCESSING -> FAILED
   * Rejects downgrade if order is already PAID
   */
  async handleFailCallback(
    merchantTranId: string,
    failedReason?: string,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ orderId: string }> {
    const result = await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.merchantTranId, merchantTranId))
        .for('update');

      if (!payment) {
        throw new ApiException('Payment not found', HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND');
      }

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, payment.orderId))
        .for('update');

      if (!order) {
        throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
      }

      // DO NOT DOWNGRADE if already paid
      if (order.status === 'PAID') {
        this.logger.warn(`Attempted fail callback on already PAID order: ${order.id}`);
        return { orderId: order.id, downgraded: false };
      }

      await tx
        .update(payments)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      await tx
        .update(orders)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      return { orderId: order.id, downgraded: true, paymentId: payment.id };
    });

    if (result.downgraded) {
      await this.auditService.record({
        action: 'PAYMENT_FAILED',
        targetType: 'PAYMENT',
        targetId: result.paymentId,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          merchantTranId,
          orderId: result.orderId,
          reason: failedReason || 'Gateway failure',
        },
      });
    }

    return { orderId: result.orderId };
  }

  /**
   * Cancel Callback Handling
   * PAYMENT_PROCESSING -> CANCELLED
   * Releases coupon reservation exactly once.
   * Rejects downgrade if order is already PAID.
   */
  async handleCancelCallback(
    merchantTranId: string,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ orderId: string }> {
    const result = await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.merchantTranId, merchantTranId))
        .for('update');

      if (!payment) {
        throw new ApiException('Payment not found', HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND');
      }

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, payment.orderId))
        .for('update');

      if (!order) {
        throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
      }

      // DO NOT DOWNGRADE if already paid
      if (order.status === 'PAID') {
        this.logger.warn(`Attempted cancel callback on already PAID order: ${order.id}`);
        return { orderId: order.id, cancelled: false };
      }

      await tx
        .update(payments)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      await tx
        .update(orders)
        .set({
          status: 'CANCELLED',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      // Release reserved coupon
      if (order.couponId) {
        const [redemption] = await tx
          .select()
          .from(couponRedemptions)
          .where(
            and(
              eq(couponRedemptions.orderId, order.id),
              eq(couponRedemptions.status, 'RESERVED')
            )
          )
          .for('update');

        if (redemption) {
          await tx
            .update(couponRedemptions)
            .set({
              status: 'RELEASED',
              releasedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(couponRedemptions.id, redemption.id));

          await tx
            .update(coupons)
            .set({
              redemptionCount: sql`GREATEST(0, "redemption_count" - 1)`,
              updatedAt: new Date(),
            })
            .where(eq(coupons.id, redemption.couponId));
        }
      }

      return { orderId: order.id, cancelled: true, paymentId: payment.id };
    });

    if (result.cancelled) {
      await this.auditService.record({
        action: 'ORDER_CANCELLED',
        targetType: 'ORDER',
        targetId: result.orderId,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          merchantTranId,
          orderId: result.orderId,
          reason: 'User cancelled payment at gateway',
        },
      });
    }

    return { orderId: result.orderId };
  }

  /**
   * Get Payment by ID
   */
  async getPaymentById(paymentId: string, user: UserContext): Promise<PaymentDto> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!payment) {
      throw new ApiException('Payment not found', HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND');
    }

    if (user.role !== 'admin') {
      const [order] = await this.db
        .select()
        .from(orders)
        .where(eq(orders.id, payment.orderId))
        .limit(1);

      if (!order || order.studentId !== user.id) {
        throw new ApiException(
          'Access denied: cannot view payment for another student',
          HttpStatus.FORBIDDEN,
          'ORDER_ACCESS_DENIED'
        );
      }
    }

    return this.formatPaymentDto(payment);
  }

  /**
   * List Payments with pagination
   */
  async listPayments(user: UserContext, query: PaymentListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    let baseWhere = query.status ? eq(payments.status, query.status) : undefined;

    if (query.orderId) {
      baseWhere = baseWhere ? and(baseWhere, eq(payments.orderId, query.orderId)) : eq(payments.orderId, query.orderId);
    }

    // If not admin, restrict to user's orders
    if (user.role !== 'admin') {
      const userOrders = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.studentId, user.id));

      const orderIds = userOrders.map((o) => o.id);
      if (orderIds.length === 0) {
        return {
          items: [],
          pagination: { page, limit, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        };
      }

      baseWhere = baseWhere ? and(baseWhere, inArray(payments.orderId, orderIds)) : inArray(payments.orderId, orderIds);
    }

    const [totalResult] = await this.db
      .select({ count: count(payments.id) })
      .from(payments)
      .where(baseWhere);

    const total = Number(totalResult?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await this.db
      .select()
      .from(payments)
      .where(baseWhere)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      merchantTranId: p.merchantTranId,
      valId: p.valId,
      bankTranId: p.bankTranId,
      amountCents: p.amountCents,
      currency: p.currency as 'BDT',
      status: p.status,
      cardType: p.cardType,
      initiatedAt: p.initiatedAt.toISOString(),
      validatedAt: p.validatedAt ? p.validatedAt.toISOString() : null,
    }));

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
