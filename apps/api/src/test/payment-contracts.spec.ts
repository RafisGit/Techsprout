import { describe, it, expect } from 'vitest';
import {
  // Enums & Types
  type OrderStatus,
  type PaymentStatus,
  type CouponDiscountType,
  type CouponRedemptionStatus,
  type InvoiceStatus,
  type RefundStatus,
  type Currency,
  type ReconciliationDiscrepancyType,

  // Constants
  COUPON_CODE_MIN_LENGTH,
  COUPON_CODE_MAX_LENGTH,
  REFUND_REASON_MIN_LENGTH,
  REFUND_REASON_MAX_LENGTH,
  GATEWAY_MIN_AMOUNT_CENTS,
  GATEWAY_MAX_AMOUNT_CENTS,

  // Order Contracts
  type CreateOrderRequest,
  type OrderDto,
  type OrderItemDto,
  type OrderListItemDto,
  type OrderListQuery,
  type PaginatedOrdersData,

  // Payment Contracts
  type InitiatePaymentRequest,
  type InitiatePaymentResponse,
  type PaymentDto,
  type PaymentListItemDto,
  type PaymentListQuery,

  // Callback Contracts
  type SSLCommerzSuccessCallback,
  type SSLCommerzFailCallback,
  type SSLCommerzCancelCallback,
  type SSLCommerzIpnCallback,

  // Coupon Contracts
  type ValidateCouponRequest,
  type CouponPreviewDto,
  type CouponDto,
  type CreateCouponRequest,
  type UpdateCouponRequest,
  type CouponRedemptionDto,
  type CouponListQuery,

  // Invoice Contracts
  type InvoiceDto,
  type InvoiceListItemDto,
  type InvoiceListQuery,

  // Refund Contracts
  type AdminRefundOrderRequest,
  type RefundDto,
  type RefundListQuery,

  // Finance & Reconciliation Contracts
  type FinanceSummaryDto,
  type ReconciliationDiscrepancyDto,
  type ReconciliationResultDto,
  type ReconciliationQuery,

  // Error Codes
  type PaymentErrorCode,

  // Shared Zod Schemas exported from @techsprout/contracts
  moneyCentsSchema,
  currencySchema,
  orderStatusSchema,
  paymentStatusSchema,
  couponDiscountTypeSchema,
  couponRedemptionStatusSchema,
  invoiceStatusSchema,
  refundStatusSchema,
  reconciliationDiscrepancyTypeSchema,
  paginationQuerySchema,
  createOrderSchema,
  orderListQuerySchema,
  initiatePaymentSchema,
  paymentListQuerySchema,
  sslcommerzSuccessCallbackSchema,
  sslcommerzFailCallbackSchema,
  sslcommerzCancelCallbackSchema,
  sslcommerzIpnCallbackSchema,
  validateCouponSchema,
  createCouponSchema,
  updateCouponSchema,
  couponListQuerySchema,
  adminRefundOrderSchema,
  refundListQuerySchema,
  invoiceListQuerySchema,
  reconciliationQuerySchema,
} from '../../../../packages/contracts/src';

describe('P5.1 — Payments & Admin Shared Contracts & Reusable Zod Schemas Test Suite', () => {
  // ==========================================
  // 1. SHARED ENUMS VALIDATION
  // ==========================================
  describe('1. P5 Shared Enums', () => {
    it('1.1 should validate OrderStatus enum values and reject PARTIALLY_REFUNDED', () => {
      const validStatuses: OrderStatus[] = [
        'PENDING',
        'PAYMENT_PROCESSING',
        'PAID',
        'FAILED',
        'CANCELLED',
        'REFUNDED',
      ];

      for (const status of validStatuses) {
        expect(orderStatusSchema.safeParse(status).success).toBe(true);
      }

      // Explicitly reject PARTIALLY_REFUNDED (P5 is full-refund-only)
      const invalidStatus = 'PARTIALLY_REFUNDED';
      const parsed = orderStatusSchema.safeParse(invalidStatus);
      expect(parsed.success).toBe(false);
    });

    it('1.2 should validate PaymentStatus enum values and reject unknown values', () => {
      const validStatuses: PaymentStatus[] = ['INITIATED', 'VALIDATED', 'FAILED', 'CANCELLED'];
      for (const status of validStatuses) {
        expect(paymentStatusSchema.safeParse(status).success).toBe(true);
      }
      expect(paymentStatusSchema.safeParse('COMPLETED').success).toBe(false);
      expect(paymentStatusSchema.safeParse('PENDING').success).toBe(false);
    });

    it('1.3 should validate CouponDiscountType enum values', () => {
      expect(couponDiscountTypeSchema.safeParse('PERCENTAGE').success).toBe(true);
      expect(couponDiscountTypeSchema.safeParse('FIXED_AMOUNT').success).toBe(true);
      expect(couponDiscountTypeSchema.safeParse('FLAT').success).toBe(false);
    });

    it('1.4 should validate CouponRedemptionStatus enum values (RESERVED, CONSUMED, RELEASED)', () => {
      const validStatuses: CouponRedemptionStatus[] = ['RESERVED', 'CONSUMED', 'RELEASED'];
      for (const status of validStatuses) {
        expect(couponRedemptionStatusSchema.safeParse(status).success).toBe(true);
      }
      expect(couponRedemptionStatusSchema.safeParse('ACTIVE').success).toBe(false);
    });

    it('1.5 should validate InvoiceStatus enum values', () => {
      expect(invoiceStatusSchema.safeParse('PAID').success).toBe(true);
      expect(invoiceStatusSchema.safeParse('REFUNDED').success).toBe(true);
      expect(invoiceStatusSchema.safeParse('VOID').success).toBe(true);
      expect(invoiceStatusSchema.safeParse('PENDING').success).toBe(false);
    });

    it('1.6 should validate RefundStatus enum values', () => {
      expect(refundStatusSchema.safeParse('PENDING').success).toBe(true);
      expect(refundStatusSchema.safeParse('PROCESSED').success).toBe(true);
      expect(refundStatusSchema.safeParse('FAILED').success).toBe(true);
      expect(refundStatusSchema.safeParse('APPROVED').success).toBe(false);
    });
  });

  // ==========================================
  // 2. MONEY CONTRACT & CURRENCY
  // ==========================================
  describe('2. Monetary Minor-Unit (Poisha/Cents) Conventions', () => {
    it('2.1 should accept valid integer minor units (nonnegative poisha)', () => {
      expect(moneyCentsSchema.safeParse(0).success).toBe(true);
      expect(moneyCentsSchema.safeParse(250000).success).toBe(true); // 2500.00 BDT
      expect(moneyCentsSchema.safeParse(5000).success).toBe(true); // 50.00 BDT
    });

    it('2.2 should reject negative money amounts', () => {
      const parsed = moneyCentsSchema.safeParse(-100);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('cannot be negative');
      }
    });

    it('2.3 should reject floating-point decimals to prevent IEEE 754 precision drift', () => {
      const parsed = moneyCentsSchema.safeParse(2500.5);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('must be an integer minor unit');
      }
    });

    it('2.4 should strictly enforce BDT as the launch currency', () => {
      expect(currencySchema.safeParse('BDT').success).toBe(true);
      expect(currencySchema.safeParse('USD').success).toBe(false);
      expect(currencySchema.safeParse('EUR').success).toBe(false);
    });
  });

  // ==========================================
  // 3. ORDER CONTRACTS & TAMPER RESISTANCE
  // ==========================================
  describe('3. Order Contracts & Tamper Resistance', () => {
    it('3.1 should validate a valid CreateOrderRequest with courseId and optional coupon', () => {
      const payload: CreateOrderRequest = {
        courseId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
        couponCode: 'eid2026',
      };

      const parsed = createOrderSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.courseId).toBe('439a3f29-23c2-49aa-9bc9-a764d0bb0e1b');
        expect(parsed.data.couponCode).toBe('EID2026'); // Automatically uppercase normalized
      }
    });

    it('3.2 should validate a valid CreateOrderRequest without a couponCode', () => {
      const payload: CreateOrderRequest = {
        courseId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
      };

      const parsed = createOrderSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.couponCode).toBeUndefined();
      }
    });

    it('3.3 should reject invalid UUID in CreateOrderRequest', () => {
      const payload = {
        courseId: 'not-a-valid-uuid',
      };

      const parsed = createOrderSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('Invalid course ID format');
      }
    });

    it('3.4 should strictly reject client-submitted price tampering attempts', () => {
      // Attacker attempts to pass a custom payable amount or price
      const tamperedPayload = {
        courseId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
        price: 10,
        payableCents: 100,
        subtotalCents: 100,
      };

      const parsed = createOrderSchema.safeParse(tamperedPayload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('Client-submitted pricing');
      }
    });

    it('3.5 should verify OrderDto contract shape and immutable snapshot properties', () => {
      const orderDto: OrderDto = {
        id: 'order-uuid-001',
        orderNumber: 'TSP-ORD-20261003-ABC123',
        studentId: 'student-uuid-001',
        studentName: 'Test Student',
        studentEmail: 'student@techsprout.edu',
        status: 'PAID',
        subtotalCents: 250000,
        discountCents: 50000,
        payableCents: 200000,
        currency: 'BDT',
        couponId: 'coupon-uuid-001',
        couponCode: 'EID2026',
        items: [
          {
            id: 'item-uuid-001',
            orderId: 'order-uuid-001',
            courseId: 'course-uuid-001',
            courseTitle: 'Fullstack TypeScript Architecture',
            unitPriceCents: 250000,
            discountCents: 50000,
            payableCents: 200000,
            createdAt: '2026-10-03T10:00:00.000Z',
          },
        ],
        expiresAt: '2026-10-03T11:00:00.000Z',
        paidAt: '2026-10-03T10:15:00.000Z',
        cancelledAt: null,
        createdAt: '2026-10-03T10:00:00.000Z',
        updatedAt: '2026-10-03T10:15:00.000Z',
      };

      expect(orderDto.payableCents).toBe(orderDto.subtotalCents - orderDto.discountCents);
      expect(orderDto.currency).toBe('BDT');
      expect(orderDto.items).toHaveLength(1);
      expect(orderDto.items[0].courseTitle).toBe('Fullstack TypeScript Architecture');
    });

    it('3.6 should parse and validate OrderListQuery with search and status filters', () => {
      const query = {
        page: '2',
        limit: '15',
        status: 'PAID',
        search: 'Fullstack',
      };

      const parsed = orderListQuerySchema.safeParse(query);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(2);
        expect(parsed.data.limit).toBe(15);
        expect(parsed.data.status).toBe('PAID');
        expect(parsed.data.search).toBe('Fullstack');
      }
    });
  });

  // ==========================================
  // 4. PAYMENT CONTRACTS
  // ==========================================
  describe('4. Payment Contracts & Gateway Transition Shapes', () => {
    it('4.1 should validate InitiatePaymentRequest accepting only orderId', () => {
      const payload: InitiatePaymentRequest = {
        orderId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
      };

      const parsed = initiatePaymentSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });

    it('4.2 should reject InitiatePaymentRequest attempting to pass amount or currency', () => {
      const tamperedPayload = {
        orderId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
        amount: 100,
        currency: 'USD',
      };

      const parsed = initiatePaymentSchema.safeParse(tamperedPayload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain(
          'Payment amount and currency must be derived server-side'
        );
      }
    });

    it('4.3 should structure InitiatePaymentResponse with SSLCommerz gateway URL', () => {
      const response: InitiatePaymentResponse = {
        paymentId: 'pay-uuid-001',
        merchantTranId: 'TSP-TXN-1727950000000-X7K2',
        gatewayUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/testboxa1b2c3d4',
        provider: 'SSLCOMMERZ',
      };

      expect(response.provider).toBe('SSLCOMMERZ');
      expect(response.gatewayUrl).toContain('sslcommerz.com');
      expect(response.merchantTranId).toMatch(/^TSP-TXN-/);
    });

    it('4.4 should structure PaymentDto with gateway fees and card brand references', () => {
      const payment: PaymentDto = {
        id: 'pay-uuid-001',
        orderId: 'order-uuid-001',
        merchantTranId: 'TSP-TXN-1727950000000-X7K2',
        provider: 'SSLCOMMERZ',
        valId: '261003101500X9Y8Z7',
        bankTranId: 'BANK-TR-998877',
        amountCents: 200000,
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'BKASH-bKash',
        cardBrand: 'bKash Mobile Banking',
        gatewayFeeCents: 3000, // 30.00 BDT MDR
        initiatedAt: '2026-10-03T10:10:00.000Z',
        validatedAt: '2026-10-03T10:15:00.000Z',
        createdAt: '2026-10-03T10:10:00.000Z',
      };

      expect(payment.status).toBe('VALIDATED');
      expect(payment.valId).toBeDefined();
      expect(payment.cardType).toBe('BKASH-bKash');
    });

    it('4.5 should parse and validate PaymentListQuery parameters', () => {
      const query = {
        page: '1',
        limit: '50',
        status: 'VALIDATED',
        orderId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
      };

      const parsed = paymentListQuerySchema.safeParse(query);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe('VALIDATED');
        expect(parsed.data.limit).toBe(50);
      }
    });
  });

  // ==========================================
  // 5. SSLCOMMERZ CALLBACK CONTRACTS
  // ==========================================
  describe('5. SSLCommerz External Callback Contracts', () => {
    it('5.1 should validate SSLCommerzSuccessCallback via shared schema', () => {
      const callback: SSLCommerzSuccessCallback = {
        tran_id: 'TSP-TXN-1727950000000-X7K2',
        val_id: '261003101500X9Y8Z7',
        amount: '2000.00',
        currency: 'BDT',
        bank_tran_id: 'BANK-TR-998877',
        card_type: 'VISA-City Bank',
        card_brand: 'VISA',
        status: 'VALID',
        store_amount: '1940.00',
        tran_date: '2026-10-03 10:15:20',
      };

      const parsed = sslcommerzSuccessCallbackSchema.safeParse(callback);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe('VALID');
        expect(parsed.data.val_id).toBe('261003101500X9Y8Z7');
      }
    });

    it('5.2 should validate SSLCommerzFailCallback and SSLCommerzCancelCallback via shared schemas', () => {
      const failCallback: SSLCommerzFailCallback = {
        tran_id: 'TSP-TXN-1727950000000-FAIL',
        status: 'FAILED',
        failedreason: 'Insufficient funds in customer card',
      };

      const cancelCallback: SSLCommerzCancelCallback = {
        tran_id: 'TSP-TXN-1727950000000-CANCEL',
        status: 'CANCELLED',
      };

      expect(sslcommerzFailCallbackSchema.safeParse(failCallback).success).toBe(true);
      expect(sslcommerzCancelCallbackSchema.safeParse(cancelCallback).success).toBe(true);
    });

    it('5.3 should reject callback payloads with missing required tran_id or status', () => {
      const invalidPayload = {
        amount: '2000.00',
        currency: 'BDT',
      };

      expect(sslcommerzSuccessCallbackSchema.safeParse(invalidPayload).success).toBe(false);
      expect(sslcommerzFailCallbackSchema.safeParse(invalidPayload).success).toBe(false);
      expect(sslcommerzCancelCallbackSchema.safeParse(invalidPayload).success).toBe(false);
    });
  });

  // ==========================================
  // 6. COUPON CONTRACTS & CONSTRAINTS
  // ==========================================
  describe('6. Coupon Contracts, Limits & Normalization', () => {
    it('6.1 should validate ValidateCouponRequest with code normalization', () => {
      const payload: ValidateCouponRequest = {
        code: '  sprout20  ',
        courseId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
      };

      const parsed = validateCouponSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.code).toBe('SPROUT20');
      }
    });

    it('6.2 should validate a valid percentage coupon creation request via createCouponSchema', () => {
      const payload: CreateCouponRequest = {
        code: 'welcome20',
        discountType: 'PERCENTAGE',
        discountValue: 20, // 20%
        minOrderAmountCents: 100000, // 1,000 BDT minimum
        maxDiscountAmountCents: 50000, // 500 BDT max discount cap
        startsAt: '2026-10-01T00:00:00.000Z',
        expiresAt: '2026-12-31T23:59:59.000Z',
        usageLimit: 100,
        perUserLimit: 1,
        isActive: true,
      };

      const parsed = createCouponSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.code).toBe('WELCOME20');
        expect(parsed.data.discountValue).toBe(20);
      }
    });

    it('6.3 should reject percentage coupon exceeding 100% discount', () => {
      const payload = {
        code: 'invalid105',
        discountType: 'PERCENTAGE',
        discountValue: 105,
        startsAt: '2026-10-01T00:00:00.000Z',
      };

      const parsed = createCouponSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('between 1 and 100');
      }
    });

    it('6.4 should reject percentage coupon with 0% discount', () => {
      const payload = {
        code: 'zero_percent',
        discountType: 'PERCENTAGE',
        discountValue: 0,
        startsAt: '2026-10-01T00:00:00.000Z',
      };

      const parsed = createCouponSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('6.5 should validate a valid fixed amount coupon creation request via createCouponSchema', () => {
      const payload: CreateCouponRequest = {
        code: 'eid500',
        discountType: 'FIXED_AMOUNT',
        discountValue: 50000, // 500 BDT in poisha
        startsAt: '2026-10-01T00:00:00.000Z',
      };

      const parsed = createCouponSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.code).toBe('EID500');
        expect(parsed.data.discountValue).toBe(50000);
      }
    });

    it('6.6 should validate UpdateCouponRequest allowing partial adjustments', () => {
      const updatePayload: UpdateCouponRequest = {
        usageLimit: 250,
        isActive: false,
        maxDiscountAmountCents: 75000,
      };

      const parsed = updateCouponSchema.safeParse(updatePayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.usageLimit).toBe(250);
        expect(parsed.data.isActive).toBe(false);
      }
    });

    it('6.7 should verify CouponRedemptionDto status representation (RESERVED, CONSUMED, RELEASED)', () => {
      const redemption: CouponRedemptionDto = {
        id: 'redemption-uuid-001',
        couponId: 'coupon-uuid-001',
        couponCode: 'EID500',
        userId: 'student-uuid-001',
        orderId: 'order-uuid-001',
        status: 'RESERVED',
        discountCents: 50000,
        reservedAt: '2026-10-03T10:00:00.000Z',
        consumedAt: null,
        releasedAt: null,
      };

      expect(redemption.status).toBe('RESERVED');
      expect(redemption.consumedAt).toBeNull();
    });

    it('6.8 should validate CouponListQuery filter parameters', () => {
      const query: CouponListQuery = {
        page: 1,
        limit: 20,
        isActive: true,
        search: 'EID',
      };

      const parsed = couponListQuerySchema.safeParse(query);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.isActive).toBe(true);
        expect(parsed.data.search).toBe('EID');
      }
    });
  });

  // ==========================================
  // 7. INVOICE CONTRACTS & PRIVACY
  // ==========================================
  describe('7. Invoice Contracts & Privacy Boundaries', () => {
    it('7.1 should structure an InvoiceDto with all mandatory immutable financial snapshot fields', () => {
      const invoice: InvoiceDto = {
        id: 'inv-uuid-001',
        invoiceNumber: 'TSP-INV-2026-00042',
        orderId: 'order-uuid-001',
        studentId: 'student-uuid-001',
        studentName: 'Jane Doe',
        studentEmail: 'jane@techsprout.edu',
        studentPhone: '+8801700000002',
        courseTitle: 'Fullstack TypeScript Architecture',
        subtotalCents: 250000,
        discountCents: 50000,
        payableCents: 200000,
        currency: 'BDT',
        paymentMethod: 'bKash Mobile Banking',
        bankTranId: 'BKASH-TR-998877',
        status: 'PAID',
        issuedAt: '2026-10-03T10:15:00.000Z',
        createdAt: '2026-10-03T10:15:00.000Z',
      };

      expect(invoice.invoiceNumber).toMatch(/^TSP-INV-\d{4}-\d+$/);
      expect(invoice.payableCents).toBe(200000);
      expect(invoice.currency).toBe('BDT');
      expect(invoice.status).toBe('PAID');
    });

    it('7.2 should structure InvoiceListItemDto for student and admin query lists', () => {
      const listItem: InvoiceListItemDto = {
        id: 'inv-uuid-001',
        invoiceNumber: 'TSP-INV-2026-00042',
        orderId: 'order-uuid-001',
        studentName: 'Jane Doe',
        studentEmail: 'jane@techsprout.edu',
        courseTitle: 'Fullstack TypeScript Architecture',
        payableCents: 200000,
        currency: 'BDT',
        status: 'PAID',
        issuedAt: '2026-10-03T10:15:00.000Z',
      };

      expect(listItem.payableCents).toBe(200000);
      expect(listItem.status).toBe('PAID');
    });

    it('7.3 should parse InvoiceListQuery with status and date range', () => {
      const query = {
        page: '1',
        limit: '25',
        status: 'PAID',
        startDate: '2026-10-01T00:00:00.000Z',
      };

      const parsed = invoiceListQuerySchema.safeParse(query);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe('PAID');
        expect(parsed.data.limit).toBe(25);
      }
    });
  });

  // ==========================================
  // 8. REFUND CONTRACTS & FULL-REFUND ENFORCEMENT
  // ==========================================
  describe('8. Refund Contracts & Full-Refund Enforcement', () => {
    it('8.1 should validate AdminRefundOrderRequest with valid 5-1000 character reason', () => {
      const payload: AdminRefundOrderRequest = {
        reason: 'Student purchased accidental duplicate course during enrollment.',
      };

      const parsed = adminRefundOrderSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.reason).toBe(payload.reason);
      }
    });

    it('8.2 should reject AdminRefundOrderRequest with reason shorter than 5 characters', () => {
      const payload = {
        reason: 'bad',
      };

      const parsed = adminRefundOrderSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('at least 5 characters');
      }
    });

    it('8.3 should strictly reject AdminRefundOrderRequest containing an arbitrary amount field', () => {
      // P5 is full-refund-only. Any attempt to submit a partial amount must be rejected at contract level.
      const tamperedPayload = {
        reason: 'Authorized partial fee adjustment request.',
        amount: 500,
        amountCents: 50000,
      };

      const parsed = adminRefundOrderSchema.safeParse(tamperedPayload);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('Arbitrary refund amounts are rejected');
      }
    });

    it('8.4 should structure RefundDto with refund tracking references', () => {
      const refund: RefundDto = {
        id: 'refund-uuid-001',
        refundNumber: 'TSP-REF-2026-00001',
        orderId: 'order-uuid-001',
        orderNumber: 'TSP-ORD-20261003-ABC123',
        paymentId: 'pay-uuid-001',
        amountCents: 200000, // Exactly equals original order.payableCents
        currency: 'BDT',
        reason: 'Student purchased accidental duplicate course during enrollment.',
        status: 'PROCESSED',
        processedBy: 'admin-uuid-001',
        providerRefundRef: 'SSL-REF-776655',
        processedAt: '2026-10-03T12:00:00.000Z',
        createdAt: '2026-10-03T12:00:00.000Z',
      };

      expect(refund.status).toBe('PROCESSED');
      expect(refund.amountCents).toBe(200000);
      expect(refund.providerRefundRef).toBe('SSL-REF-776655');
    });

    it('8.5 should validate RefundListQuery with orderId filter', () => {
      const query = {
        status: 'PROCESSED',
        orderId: '439a3f29-23c2-49aa-9bc9-a764d0bb0e1b',
      };

      const parsed = refundListQuerySchema.safeParse(query);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe('PROCESSED');
      }
    });
  });

  // ==========================================
  // 9. FINANCE & RECONCILIATION CONTRACTS
  // ==========================================
  describe('9. Finance & Reconciliation Contracts', () => {
    it('9.1 should structure FinanceSummaryDto with aggregate KPI counts and volumes', () => {
      const summary: FinanceSummaryDto = {
        totalGrossVolumeCents: 10000000, // 100,000 BDT
        totalDiscountCents: 1500000, // 15,000 BDT
        totalNetRevenueCents: 8500000, // 85,000 BDT
        totalRefundCents: 500000, // 5,000 BDT
        totalPaidOrdersCount: 40,
        totalRefundedOrdersCount: 2,
        totalPendingOrdersCount: 5,
        currency: 'BDT',
      };

      expect(summary.totalGrossVolumeCents - summary.totalDiscountCents).toBe(
        summary.totalNetRevenueCents
      );
      expect(summary.currency).toBe('BDT');
    });

    it('9.2 should validate ReconciliationDiscrepancyType enum', () => {
      const validTypes: ReconciliationDiscrepancyType[] = [
        'PAID_WITHOUT_ENROLLMENT',
        'GATEWAY_VALIDATED_INTERNAL_PENDING',
        'AMOUNT_MISMATCH',
        'CURRENCY_MISMATCH',
        'ABANDONED_SESSION',
      ];

      for (const type of validTypes) {
        expect(reconciliationDiscrepancyTypeSchema.safeParse(type).success).toBe(true);
      }
      expect(reconciliationDiscrepancyTypeSchema.safeParse('UNKNOWN_ERROR').success).toBe(false);
    });

    it('9.3 should structure ReconciliationResultDto', () => {
      const discrepancy: ReconciliationDiscrepancyDto = {
        id: 'disc-uuid-001',
        orderId: 'order-uuid-002',
        orderNumber: 'TSP-ORD-20261003-DELAY1',
        discrepancyType: 'GATEWAY_VALIDATED_INTERNAL_PENDING',
        description: 'Gateway has validated status but internal order is still PAYMENT_PROCESSING',
        internalPayableCents: 250000,
        gatewayAmountCents: 250000,
        detectedAt: '2026-10-03T11:00:00.000Z',
        autoResolvable: true,
      };

      const result: ReconciliationResultDto = {
        totalOrdersScanned: 50,
        discrepanciesFoundCount: 1,
        autoResolvedCount: 1,
        discrepancies: [discrepancy],
        executedAt: '2026-10-03T11:01:00.000Z',
      };

      expect(result.discrepanciesFoundCount).toBe(1);
      expect(result.autoResolvedCount).toBe(1);
      expect(result.discrepancies[0].autoResolvable).toBe(true);
    });

    it('9.4 should validate ReconciliationQuery with limit and dryRun parameters', () => {
      const query = {
        limit: '100',
        dryRun: 'true',
      };

      const parsed = reconciliationQuerySchema.safeParse({
        limit: 100,
        dryRun: true,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.limit).toBe(100);
        expect(parsed.data.dryRun).toBe(true);
      }
    });
  });

  // ==========================================
  // 10. ERROR CODES & STANDARDIZATION
  // ==========================================
  describe('10. Standardized P5 Error Codes', () => {
    it('10.1 should verify that all required P5 error codes conform to PaymentErrorCode union', () => {
      const errorCodes: PaymentErrorCode[] = [
        'PAYMENT_REQUIRED',
        'ORDER_NOT_FOUND',
        'ORDER_ACCESS_DENIED',
        'INVALID_ORDER_STATE_TRANSITION',
        'PAYMENT_NOT_FOUND',
        'PAYMENT_VALIDATION_FAILED',
        'PAYMENT_AMOUNT_MISMATCH',
        'PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM',
        'PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM',
        'PAYMENT_CURRENCY_MISMATCH',
        'PAYMENT_REPLAY_DETECTED',
        'COUPON_NOT_FOUND',
        'COUPON_INVALID',
        'COUPON_EXPIRED',
        'COUPON_USAGE_LIMIT_REACHED',
        'COUPON_USER_LIMIT_REACHED',
        'INVOICE_NOT_FOUND',
        'INVOICE_ACCESS_DENIED',
        'REFUND_NOT_ALLOWED',
        'REFUND_ALREADY_PROCESSED',
        'PARTIAL_REFUNDS_NOT_SUPPORTED',
        'RECONCILIATION_FAILED',
      ];

      expect(errorCodes).toHaveLength(22);
      for (const code of errorCodes) {
        expect(typeof code).toBe('string');
      }
    });

    it('10.2 should verify official SSLCommerz V4 transaction amount boundaries', () => {
      expect(GATEWAY_MIN_AMOUNT_CENTS).toBe(1000); // 10.00 BDT
      expect(GATEWAY_MAX_AMOUNT_CENTS).toBe(50_000_000); // 500,000.00 BDT
    });
  });

  // ==========================================
  // 11. PAGINATION CONVENTIONS
  // ==========================================
  describe('11. Pagination Conventions', () => {
    it('11.1 should parse valid pagination parameters with defaults', () => {
      const parsed = paginationQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(1);
        expect(parsed.data.limit).toBe(20);
      }
    });

    it('11.2 should reject pagination limit exceeding 100', () => {
      const parsed = paginationQuerySchema.safeParse({ limit: 150 });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('cannot exceed 100');
      }
    });
  });
});
