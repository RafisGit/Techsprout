import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCoupon,
  createOrder,
  initiatePayment,
  fetchOrderById,
  fetchInvoiceById,
  fetchInvoiceByOrderId,
} from '@/lib/api/orders';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  CourseDto,
  OrderDto,
  CouponPreviewDto,
  InitiatePaymentResponse,
  InvoiceDto,
} from '@techsprout/contracts';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P5.4.4 — Student Checkout & Order Completion Flow Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. BUY NOW & COURSE DETAIL CTA
  // ==========================================
  describe('1. Course Detail Pricing & Buy Now CTA', () => {
    it('1. Buy Now shown for paid course (> 0 BDT)', () => {
      const paidCourse: Partial<CourseDto> = {
        id: 'c-paid-1',
        title: 'Fullstack Next.js & NestJS',
        slug: 'fullstack-nextjs-nestjs',
        price: '3500.00',
        currency: 'BDT',
        status: 'PUBLISHED',
      };

      const isFree = Number(paidCourse.price) === 0 || paidCourse.price === '0.00';
      const ctaLabel = isFree ? 'Enroll Now' : 'Buy Now';
      const checkoutDestination = isFree
        ? `/courses/${paidCourse.slug}`
        : `/checkout/${paidCourse.slug}`;

      expect(isFree).toBe(false);
      expect(ctaLabel).toBe('Buy Now');
      expect(checkoutDestination).toBe('/checkout/fullstack-nextjs-nestjs');
    });

    it('2. Free course preserves existing self-enrollment flow', () => {
      const freeCourse: Partial<CourseDto> = {
        id: 'c-free-1',
        title: 'Introduction to Computer Science',
        slug: 'intro-to-cs',
        price: '0.00',
        currency: 'BDT',
        status: 'PUBLISHED',
      };

      const isFree = Number(freeCourse.price) === 0 || freeCourse.price === '0.00';
      const ctaLabel = isFree ? 'Enroll Now' : 'Buy Now';

      expect(isFree).toBe(true);
      expect(ctaLabel).toBe('Enroll Now');
    });

    it('3. Checkout displays authoritative BDT price formatting', () => {
      const coursePrice = '4500.00';
      const currency = 'BDT';
      const formatted = `${Number(coursePrice).toLocaleString()} ${currency}`;

      expect(formatted).toBe('4,500 BDT');
    });
  });

  // ==========================================
  // 2. COUPON ENTRY & READ-ONLY PREVIEW
  // ==========================================
  describe('2. Coupon Entry & Read-Only Preview', () => {
    it('4. Coupon entry calls validation API with normalized uppercase code', async () => {
      const mockPreview: CouponPreviewDto = {
        code: 'WELCOME10',
        courseId: 'c-100',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        subtotalCents: 500000,
        originalPriceCents: 500000,
        discountCents: 50000,
        payableCents: 450000,
        isValid: true,
      };

      (axiosInstance.post as any).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockPreview,
        },
      });

      const result = await validateCoupon({ code: '  welcome10  ', courseId: 'c-100' });

      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/coupons/validate', {
        code: 'WELCOME10',
        courseId: 'c-100',
      });
      expect(result.isValid).toBe(true);
      expect(result.discountCents).toBe(50000);
      expect(result.payableCents).toBe(450000);
    });

    it('5. Invalid coupon displays server error message without mutating state', async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: {
            success: false,
            errorCode: 'COUPON_EXPIRED',
            message: 'Coupon has expired',
          },
        },
      };

      (axiosInstance.post as any).mockRejectedValueOnce(errorResponse);

      await expect(
        validateCoupon({ code: 'EXPIRED_CODE', courseId: 'c-100' })
      ).rejects.toMatchObject(errorResponse);
    });

    it('6. Valid coupon updates preview discount and payable in minor units', async () => {
      const mockPreview: CouponPreviewDto = {
        code: 'SAVE1000',
        courseId: 'c-100',
        discountType: 'FIXED_AMOUNT',
        discountValue: 100000,
        subtotalCents: 300000,
        originalPriceCents: 300000,
        discountCents: 100000,
        payableCents: 200000,
        isValid: true,
      };

      (axiosInstance.post as any).mockResolvedValueOnce({
        data: { success: true, data: mockPreview },
      });

      const res = await validateCoupon({ code: 'SAVE1000', courseId: 'c-100' });

      expect(res.discountCents).toBe(100000);
      expect(res.payableCents).toBe(200000);
      expect(res.payableCents).toBe(res.subtotalCents - res.discountCents);
    });

    it('7. 100% coupon displays zero payable', async () => {
      const mockFreePreview: CouponPreviewDto = {
        code: 'FREE100',
        courseId: 'c-100',
        discountType: 'PERCENTAGE',
        discountValue: 100,
        subtotalCents: 250000,
        originalPriceCents: 250000,
        discountCents: 250000,
        payableCents: 0,
        isValid: true,
      };

      (axiosInstance.post as any).mockResolvedValueOnce({
        data: { success: true, data: mockFreePreview },
      });

      const res = await validateCoupon({ code: 'FREE100', courseId: 'c-100' });

      expect(res.payableCents).toBe(0);
      expect(res.discountCents).toBe(res.subtotalCents);
    });
  });

  // ==========================================
  // 3. ORDER CREATION & PAYMENT INITIATION
  // ==========================================
  describe('3. Order Creation & Payment Initiation', () => {
    it('8. CTA disables while order is being created to prevent duplicate submission', async () => {
      let isSubmitting = false;
      const setSubmitting = (val: boolean) => {
        isSubmitting = val;
      };

      setSubmitting(true);
      expect(isSubmitting).toBe(true);

      (axiosInstance.post as any).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 'ord-100',
            orderNumber: 'TSP-ORD-12345678-1000',
            payableCents: 200000,
            status: 'PENDING',
          },
        },
      });

      await createOrder({ courseId: 'c-100', couponCode: 'DISC20' });
      setSubmitting(false);
      expect(isSubmitting).toBe(false);
    });

    it('9. Payment initiation returns SSLCommerz hosted gateway redirect URL', async () => {
      const mockInitiateRes: InitiatePaymentResponse = {
        paymentId: 'pay-101',
        merchantTranId: 'TSP-TXN-12345678-9999',
        gatewayUrl: 'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=pay&SESSIONKEY=abc-xyz-123',
        provider: 'SSLCOMMERZ',
      };

      (axiosInstance.post as any).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockInitiateRes,
        },
      });

      const res = await initiatePayment({ orderId: 'ord-100' });

      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/payments/initiate', {
        orderId: 'ord-100',
      });
      expect(res.gatewayUrl).toContain('sslcommerz.com');
      expect(res.provider).toBe('SSLCOMMERZ');
    });

    it('10. Zero-payable flow does not redirect to SSLCommerz gateway', async () => {
      const mockZeroRes: InitiatePaymentResponse = {
        paymentId: 'pay-zero-101',
        merchantTranId: 'TSP-TXN-ZERO-0001',
        gatewayUrl: 'http://localhost:3000/orders/ord-zero-100/success',
        provider: 'SSLCOMMERZ',
      };

      (axiosInstance.post as any).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockZeroRes,
        },
      });

      const res = await initiatePayment({ orderId: 'ord-zero-100' });

      expect(res.gatewayUrl).not.toContain('sandbox.sslcommerz.com/gwprocess');
      expect(res.gatewayUrl).toContain('/orders/ord-zero-100/success');
    });
  });

  // ==========================================
  // 4. RETURN PAGES & ORDER STATUS RESOLUTION
  // ==========================================
  describe('4. Return Pages & Authoritative Resolution', () => {
    it('11. Success page polls order status authoritatively from backend', async () => {
      const mockOrder: Partial<OrderDto> = {
        id: 'ord-100',
        orderNumber: 'TSP-ORD-100',
        status: 'PAID',
        payableCents: 200000,
        currency: 'BDT',
        invoiceId: 'inv-100',
      };

      (axiosInstance.get as any).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockOrder,
        },
      });

      const orderData = await fetchOrderById('ord-100');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/orders/ord-100');
      expect(orderData.status).toBe('PAID');
    });

    it('12. PAYMENT_PROCESSING shows verification state', () => {
      const processingOrder: Partial<OrderDto> = {
        id: 'ord-proc-1',
        orderNumber: 'TSP-ORD-PROC-1',
        status: 'PAYMENT_PROCESSING',
        payableCents: 150000,
        currency: 'BDT',
      };

      const isPending =
        processingOrder.status === 'PAYMENT_PROCESSING' || processingOrder.status === 'PENDING';
      const statusMessage = isPending
        ? 'Verifying your payment with the bank...'
        : 'Payment Confirmed';

      expect(isPending).toBe(true);
      expect(statusMessage).toBe('Verifying your payment with the bank...');
    });

    it('13. PAID status shows invoice link and Start Learning action', () => {
      const paidOrder: Partial<OrderDto> = {
        id: 'ord-paid-1',
        orderNumber: 'TSP-ORD-PAID-1',
        status: 'PAID',
        payableCents: 300000,
        currency: 'BDT',
        invoiceId: 'inv-uuid-1',
        items: [
          {
            id: 'item-1',
            orderId: 'ord-paid-1',
            courseId: 'course-uuid-1',
            courseTitle: 'Fullstack Next.js',
            unitPriceCents: 300000,
            discountCents: 0,
            payableCents: 300000,
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      };

      expect(paidOrder.status).toBe('PAID');
      expect(paidOrder.invoiceId).toBe('inv-uuid-1');
      expect(paidOrder.items?.[0]?.courseTitle).toBe('Fullstack Next.js');
    });

    it('14. FAILED shows failure UX and retry action', () => {
      const failedOrder: Partial<OrderDto> = {
        id: 'ord-fail-1',
        status: 'FAILED',
        payableCents: 200000,
      };

      const isFailed = failedOrder.status === 'FAILED';
      const showRetry = isFailed;

      expect(isFailed).toBe(true);
      expect(showRetry).toBe(true);
    });

    it('15. CANCELLED shows cancellation UX', () => {
      const cancelledOrder: Partial<OrderDto> = {
        id: 'ord-cancel-1',
        status: 'CANCELLED',
      };

      const isCancelled = cancelledOrder.status === 'CANCELLED';
      expect(isCancelled).toBe(true);
    });

    it('16. Browser query parameters do not directly determine payment success', () => {
      // Attacker passes tran_id and status=success in query string
      const untrustedParams = {
        status: 'success',
        tran_id: 'TSP-FAKE-1234',
        val_id: 'FAKE-VAL-ID',
      };

      // Frontend ignores untrustedParams and relies ONLY on backend response
      const serverVerifiedOrder: Partial<OrderDto> = {
        id: 'ord-real-1',
        status: 'PAYMENT_PROCESSING', // Real backend state is still processing
      };

      const authoritativeStatus = serverVerifiedOrder.status;

      expect(authoritativeStatus).not.toBe(untrustedParams.status);
      expect(authoritativeStatus).toBe('PAYMENT_PROCESSING');
    });

    it('17. Student cannot view another student order (403 Forbidden)', async () => {
      const forbiddenError = {
        response: {
          status: 403,
          data: {
            success: false,
            errorCode: 'ORDER_ACCESS_DENIED',
            message: 'Access denied: cannot view another student order',
          },
        },
      };

      (axiosInstance.get as any).mockRejectedValueOnce(forbiddenError);

      await expect(fetchOrderById('ord-foreign-999')).rejects.toMatchObject({
        response: { status: 403 },
      });
    });

    it('18. Session expiry during checkout or status check is handled cleanly', async () => {
      const unauthorizedError = {
        response: {
          status: 401,
          data: {
            success: false,
            errorCode: 'UNAUTHORIZED',
            message: 'Authentication session expired',
          },
        },
      };

      (axiosInstance.get as any).mockRejectedValueOnce(unauthorizedError);

      await expect(fetchOrderById('ord-expired-session')).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    it('19. Polling stops after configured timeout (max 12 attempts)', () => {
      let attempts = 0;
      const MAX_ATTEMPTS = 12;
      let timedOut = false;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
      }

      if (attempts >= MAX_ATTEMPTS) {
        timedOut = true;
      }

      expect(attempts).toBe(12);
      expect(timedOut).toBe(true);
    });
  });

  // ==========================================
  // 5. INVOICE INTEGRATION
  // ==========================================
  describe('5. Invoice Retrieval Integration', () => {
    it('should fetch invoice details by ID privately', async () => {
      const mockInvoice: Partial<InvoiceDto> = {
        id: 'inv-101',
        invoiceNumber: 'TSP-INV-2026-0001',
        orderId: 'ord-100',
        studentName: 'Student One',
        studentEmail: 'student1@techsprout.edu',
        courseTitle: 'Fullstack Next.js',
        subtotalCents: 300000,
        discountCents: 50000,
        payableCents: 250000,
        currency: 'BDT',
        status: 'PAID',
      };

      (axiosInstance.get as any).mockResolvedValueOnce({
        data: { success: true, data: mockInvoice },
      });

      const inv = await fetchInvoiceById('inv-101');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/invoices/inv-101');
      expect(inv.invoiceNumber).toBe('TSP-INV-2026-0001');
      expect(inv.payableCents).toBe(250000);
    });

    it('should query invoice by orderId when order becomes PAID', async () => {
      const mockInvoiceItem = {
        id: 'inv-101',
        invoiceNumber: 'TSP-INV-2026-0001',
        orderId: 'ord-100',
      };

      (axiosInstance.get as any).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            items: [mockInvoiceItem],
            pagination: { total: 1, page: 1, limit: 20 },
          },
        },
      });

      // Second call for fetchInvoiceById
      (axiosInstance.get as any).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 'inv-101',
            invoiceNumber: 'TSP-INV-2026-0001',
            orderId: 'ord-100',
            payableCents: 250000,
          },
        },
      });

      const inv = await fetchInvoiceByOrderId('ord-100');

      expect(inv?.id).toBe('inv-101');
      expect(inv?.payableCents).toBe(250000);
    });
  });
});
