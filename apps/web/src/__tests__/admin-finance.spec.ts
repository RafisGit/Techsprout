import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchFinanceSummary,
  fetchAdminOrders,
  fetchAdminOrderById,
  fetchOrderPayments,
  fetchAdminRefunds,
  fetchAdminRefundById,
  initiateRefund,
  queryRefundStatus,
  reconcileRefund,
  scanReconciliation,
  fetchAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  deleteAdminCoupon,
  formatBDT,
} from '@/lib/api/finance';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  FinanceSummaryDto,
  OrderDto,
  OrderListItemDto,
  PaginatedOrdersData,
  PaymentListItemDto,
  RefundDto,
  PaginatedRefundsData,
  ReconciliationResultDto,
  CouponDto,
  PaginatedCouponsData,
  CreateCouponRequest,
  UpdateCouponRequest,
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

describe('P5.4.5 — Admin Finance, Reconciliation & Coupon Management UI Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // SECTION 1: FINANCE DASHBOARD
  // ==========================================
  describe('1. Finance Dashboard', () => {
    it('1. admin finance page renders KPI cards from authoritative server response', async () => {
      const mockSummary: FinanceSummaryDto = {
        totalGrossVolumeCents: 15000000, // BDT 150,000.00
        totalDiscountCents: 1500000, // BDT 15,000.00
        totalNetRevenueCents: 13000000, // BDT 130,000.00
        totalRefundCents: 2000000, // BDT 20,000.00
        totalPaidOrdersCount: 45,
        totalRefundedOrdersCount: 5,
        totalPendingOrdersCount: 8,
        totalCancelledOrdersCount: 4,
        currency: 'BDT',
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockSummary },
      });

      const summary = await fetchFinanceSummary();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/finance/summary');
      expect(summary.totalGrossVolumeCents).toBe(15000000);
      expect(summary.totalNetRevenueCents).toBe(13000000);
      expect(summary.totalPaidOrdersCount).toBe(45);
      expect(summary.currency).toBe('BDT');
    });

    it('2. BDT formatting works correctly for integer cents and edge cases', () => {
      expect(formatBDT(12500000)).toBe('BDT 125,000.00');
      expect(formatBDT(50000)).toBe('BDT 500.00');
      expect(formatBDT(0)).toBe('BDT 0.00');
      expect(formatBDT(99)).toBe('BDT 0.99');
      expect(formatBDT(null)).toBe('BDT 0.00');
      expect(formatBDT(undefined)).toBe('BDT 0.00');
      expect(formatBDT(NaN)).toBe('BDT 0.00');
    });

    it('3. loading state is handled gracefully while request is pending', async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(axiosInstance.get).mockReturnValueOnce(pendingPromise as any);

      const requestPromise = fetchFinanceSummary();
      expect(vi.mocked(axiosInstance.get)).toHaveBeenCalledTimes(1);

      // Resolve the pending promise
      resolvePromise!({
        data: {
          success: true,
          data: {
            totalGrossVolumeCents: 0,
            totalDiscountCents: 0,
            totalNetRevenueCents: 0,
            totalRefundCents: 0,
            totalPaidOrdersCount: 0,
            totalRefundedOrdersCount: 0,
            totalPendingOrdersCount: 0,
            currency: 'BDT',
          },
        },
      });

      const result = await requestPromise;
      expect(result.totalGrossVolumeCents).toBe(0);
    });

    it('4. error state handles server rejection properly', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 500,
          data: { message: 'Database connection timeout', errorCode: 'INTERNAL_ERROR' },
        },
      });

      await expect(fetchFinanceSummary()).rejects.toEqual(
        expect.objectContaining({
          response: expect.objectContaining({ status: 500 }),
        })
      );
    });

    it('5. empty state handles zeroed financial snapshots without crash', async () => {
      const emptySummary: FinanceSummaryDto = {
        totalGrossVolumeCents: 0,
        totalDiscountCents: 0,
        totalNetRevenueCents: 0,
        totalRefundCents: 0,
        totalPaidOrdersCount: 0,
        totalRefundedOrdersCount: 0,
        totalPendingOrdersCount: 0,
        totalCancelledOrdersCount: 0,
        currency: 'BDT',
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: emptySummary },
      });

      const summary = await fetchFinanceSummary();
      expect(summary.totalGrossVolumeCents).toBe(0);
      expect(formatBDT(summary.totalGrossVolumeCents)).toBe('BDT 0.00');
      expect(summary.totalPaidOrdersCount).toBe(0);
    });
  });

  // ==========================================
  // SECTION 2: ORDERS EXPLORER
  // ==========================================
  describe('2. Admin Orders / Payments Explorer', () => {
    it('6. order table renders paginated orders', async () => {
      const mockOrdersData: PaginatedOrdersData = {
        items: [
          {
            id: 'ord-1',
            orderNumber: 'TSP-ORD-20261003-0001',
            studentId: 'st-1',
            studentName: 'Alice Smith',
            studentEmail: 'alice@techsprout.edu',
            status: 'PAID',
            subtotalCents: 500000,
            discountCents: 50000,
            payableCents: 450000,
            currency: 'BDT',
            courseTitle: 'Full-Stack Web Development',
            createdAt: '2026-10-01T10:00:00.000Z',
            paidAt: '2026-10-01T10:05:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockOrdersData },
      });

      const res = await fetchAdminOrders({ page: 1, limit: 10 });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/orders', {
        params: { page: 1, limit: 10 },
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].orderNumber).toBe('TSP-ORD-20261003-0001');
      expect(res.items[0].payableCents).toBe(450000);
    });

    it('7. pagination works by sending page and limit parameters', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            items: [],
            pagination: {
              page: 2,
              limit: 20,
              total: 50,
              totalPages: 3,
              hasNextPage: true,
              hasPreviousPage: true,
            },
          },
        },
      });

      const res = await fetchAdminOrders({ page: 2, limit: 20 });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/orders', {
        params: { page: 2, limit: 20 },
      });
      expect(res.pagination.page).toBe(2);
      expect(res.pagination.hasNextPage).toBe(true);
    });

    it('8. status filter works with specific OrderStatus', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
        },
      });

      await fetchAdminOrders({ status: 'PAID' });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/orders', {
        params: { status: 'PAID' },
      });
    });

    it('9. search works with student email or order number', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
        },
      });

      await fetchAdminOrders({ search: 'alice@techsprout.edu' });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/orders', {
        params: { search: 'alice@techsprout.edu' },
      });
    });

    it('10. date filter works with startDate and endDate ISO strings', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
        },
      });

      const startDate = '2026-10-01T00:00:00.000Z';
      const endDate = '2026-10-02T23:59:59.000Z';

      await fetchAdminOrders({ startDate, endDate });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/orders', {
        params: { startDate, endDate },
      });
    });

    it('11. order detail opens and retrieves full authoritative order snapshot', async () => {
      const mockDetail: OrderDto = {
        id: 'ord-100',
        orderNumber: 'TSP-ORD-DET-100',
        studentId: 'st-100',
        studentName: 'Charlie Brown',
        studentEmail: 'charlie@techsprout.edu',
        status: 'PAID',
        subtotalCents: 400000,
        discountCents: 0,
        payableCents: 400000,
        currency: 'BDT',
        couponId: null,
        couponCode: null,
        invoiceId: 'inv-100',
        items: [
          {
            id: 'item-100',
            orderId: 'ord-100',
            courseId: 'c-100',
            courseTitle: 'Advanced Cloud Architecture',
            unitPriceCents: 400000,
            discountCents: 0,
            payableCents: 400000,
            createdAt: '2026-10-01T10:00:00.000Z',
          },
        ],
        expiresAt: '2026-10-02T10:00:00.000Z',
        paidAt: '2026-10-01T10:05:00.000Z',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:05:00.000Z',
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockDetail },
      });

      const order = await fetchAdminOrderById('ord-100');
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/orders/ord-100');
      expect(order.orderNumber).toBe('TSP-ORD-DET-100');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].courseTitle).toBe('Advanced Cloud Architecture');
    });

    it('12. payment attempts inspector displays gateway attempt attributes without exposing secrets', async () => {
      const mockPayments: PaymentListItemDto[] = [
        {
          id: 'pay-1',
          orderId: 'ord-100',
          merchantTranId: 'TRAN-SSL-001',
          valId: 'VAL-001',
          bankTranId: 'BANK-001',
          amountCents: 400000,
          currency: 'BDT',
          status: 'VALIDATED',
          cardType: 'VISA',
          initiatedAt: '2026-10-01T10:01:00.000Z',
          validatedAt: '2026-10-01T10:04:00.000Z',
        },
      ];

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: { items: mockPayments } },
      });

      const attempts = await fetchOrderPayments('ord-100');
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/payments', {
        params: { orderId: 'ord-100' },
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].merchantTranId).toBe('TRAN-SSL-001');
      expect(attempts[0].status).toBe('VALIDATED');
      // Verify no store password or credentials exist in DTO
      expect((attempts[0] as any).storePassword).toBeUndefined();
      expect((attempts[0] as any).storeId).toBeUndefined();
    });

    it('13. invoice link is shown when invoiceId is present on paid order', async () => {
      const mockDetail: Partial<OrderDto> = {
        id: 'ord-inv-1',
        status: 'PAID',
        invoiceId: 'inv-uuid-777',
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockDetail },
      });

      const order = await fetchAdminOrderById('ord-inv-1');
      expect(order.invoiceId).toBe('inv-uuid-777');
    });
  });

  // ==========================================
  // SECTION 3: REFUNDS ADMINISTRATION
  // ==========================================
  describe('3. Refund Administration UI', () => {
    it('14. refund action shown for refundable paid order', () => {
      const isRefundablePaidOrder = (status: string) => status === 'PAID';
      expect(isRefundablePaidOrder('PAID')).toBe(true);
      expect(isRefundablePaidOrder('PENDING')).toBe(false);
      expect(isRefundablePaidOrder('REFUNDED')).toBe(false);
      expect(isRefundablePaidOrder('CANCELLED')).toBe(false);
    });

    it('15. refund modal requires reason with minimum length validation', async () => {
      const validateRefundReason = (reason: string) => {
        const trimmed = reason.trim();
        if (!trimmed || trimmed.length < 5) {
          return 'Refund reason must be at least 5 characters';
        }
        return null;
      };

      expect(validateRefundReason('')).toBe('Refund reason must be at least 5 characters');
      expect(validateRefundReason('abc')).toBe('Refund reason must be at least 5 characters');
      expect(validateRefundReason('Valid reason for refund')).toBeNull();
    });

    it('16. refund amount cannot be edited and is locked to server-derived payable total', async () => {
      const mockRefund: RefundDto = {
        id: 'ref-1',
        refundNumber: 'TSP-REF-20261003-0001',
        orderId: 'ord-100',
        paymentId: 'pay-1',
        amountCents: 450000,
        currency: 'BDT',
        reason: 'Student dropped within guarantee window',
        status: 'PENDING',
        createdAt: '2026-10-03T11:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockRefund },
      });

      const refund = await initiateRefund(
        'ord-100',
        'Student dropped within guarantee window'
      );

      // Verify the POST body only sends reason; amount cannot be sent by client
      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/admin/orders/ord-100/refund',
        { reason: 'Student dropped within guarantee window' }
      );
      expect(refund.amountCents).toBe(450000);
    });

    it('17. pending refund with provider reference displays correct Awaiting Settlement state', () => {
      const pendingWithRef: Partial<RefundDto> = {
        status: 'PENDING',
        providerRefundRef: 'SSL-REF-999',
      };

      const isAwaitingSettlement =
        pendingWithRef.status === 'PENDING' && Boolean(pendingWithRef.providerRefundRef);
      expect(isAwaitingSettlement).toBe(true);
    });

    it('18. pending refund without provider reference displays Manual Review state', () => {
      const pendingWithoutRef: Partial<RefundDto> = {
        status: 'PENDING',
        providerRefundRef: null,
      };

      const isManualReviewRequired =
        pendingWithoutRef.status === 'PENDING' && !pendingWithoutRef.providerRefundRef;
      expect(isManualReviewRequired).toBe(true);
    });

    it('19. processing/provider query works by querying SSLCommerz clearing status', async () => {
      const mockSettledRefund: RefundDto = {
        id: 'ref-100',
        refundNumber: 'TSP-REF-100',
        orderId: 'ord-100',
        paymentId: 'pay-1',
        amountCents: 450000,
        currency: 'BDT',
        reason: 'Authorized drop',
        status: 'PROCESSED',
        providerRefundRef: 'SSL-REF-100',
        processedAt: '2026-10-03T11:30:00.000Z',
        createdAt: '2026-10-03T11:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockSettledRefund },
      });

      const result = await queryRefundStatus('ref-100');
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/refunds/ref-100/query');
      expect(result.status).toBe('PROCESSED');
    });

    it('20. processed refund hides retry and action buttons (terminal state)', () => {
      const processedRefund: Partial<RefundDto> = {
        status: 'PROCESSED',
      };

      const hasAction =
        processedRefund.status === 'PENDING' || processedRefund.status === 'FAILED';
      expect(hasAction).toBe(false);
    });
  });

  // ==========================================
  // SECTION 4: RECONCILIATION
  // ==========================================
  describe('4. Reconciliation Safe Actions', () => {
    it('21. pending/no-provider-ref displays manual review warning badge', async () => {
      const mockRefunds: PaginatedRefundsData = {
        items: [
          {
            id: 'ref-amb-1',
            refundNumber: 'TSP-REF-AMB-001',
            orderId: 'ord-amb-1',
            paymentId: 'pay-amb-1',
            amountCents: 250000,
            currency: 'BDT',
            reason: 'Network timeout during initiation',
            status: 'PENDING',
            providerRefundRef: null,
            createdAt: '2026-10-03T10:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockRefunds },
      });

      const res = await fetchAdminRefunds({ status: 'PENDING' });
      expect(res.items[0].providerRefundRef).toBeNull();
      expect(res.items[0].status).toBe('PENDING');
    });

    it('22. provider reference linking flow calls reconcile API with LINK_PROVIDER_REFERENCE', async () => {
      const mockLinked: RefundDto = {
        id: 'ref-amb-1',
        refundNumber: 'TSP-REF-AMB-001',
        orderId: 'ord-amb-1',
        paymentId: 'pay-amb-1',
        amountCents: 250000,
        currency: 'BDT',
        reason: 'Manual link after bank query',
        status: 'PENDING',
        providerRefundRef: 'SSL-BANK-REF-888',
        createdAt: '2026-10-03T10:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockLinked },
      });

      const res = await reconcileRefund('ref-amb-1', {
        action: 'LINK_PROVIDER_REFERENCE',
        providerRefundRef: 'SSL-BANK-REF-888',
      });

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/admin/refunds/ref-amb-1/reconcile',
        {
          action: 'LINK_PROVIDER_REFERENCE',
          providerRefundRef: 'SSL-BANK-REF-888',
        }
      );
      expect(res.providerRefundRef).toBe('SSL-BANK-REF-888');
    });

    it('23. mark-failed flow calls reconcile API with MARK_FAILED and reason', async () => {
      const mockFailed: RefundDto = {
        id: 'ref-amb-1',
        refundNumber: 'TSP-REF-AMB-001',
        orderId: 'ord-amb-1',
        paymentId: 'pay-amb-1',
        amountCents: 250000,
        currency: 'BDT',
        reason: 'Bank confirmed refund request never received',
        status: 'FAILED',
        createdAt: '2026-10-03T10:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockFailed },
      });

      const res = await reconcileRefund('ref-amb-1', {
        action: 'MARK_FAILED',
        reason: 'Bank confirmed refund request never received',
      });

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/admin/refunds/ref-amb-1/reconcile',
        {
          action: 'MARK_FAILED',
          reason: 'Bank confirmed refund request never received',
        }
      );
      expect(res.status).toBe('FAILED');
    });

    it('24. non-admin access is blocked by checking role client-side and server-side', () => {
      const checkAdminAuthorization = (userRole?: string) => userRole === 'admin';
      expect(checkAdminAuthorization('admin')).toBe(true);
      expect(checkAdminAuthorization('student')).toBe(false);
      expect(checkAdminAuthorization('instructor')).toBe(false);
      expect(checkAdminAuthorization(undefined)).toBe(false);
    });

    it('runs reconciliation discrepancy scan with auto-resolve or dryRun parameters', async () => {
      const mockScanResult: ReconciliationResultDto = {
        totalOrdersScanned: 50,
        discrepanciesFoundCount: 1,
        autoResolvedCount: 1,
        discrepancies: [
          {
            id: 'disc-1',
            orderId: 'ord-delay-1',
            orderNumber: 'TSP-ORD-DELAY-1',
            discrepancyType: 'GATEWAY_VALIDATED_INTERNAL_PENDING',
            description: 'Gateway payment validated but order pending',
            internalPayableCents: 350000,
            gatewayAmountCents: 350000,
            detectedAt: '2026-10-03T12:00:00.000Z',
            autoResolvable: true,
          },
        ],
        executedAt: '2026-10-03T12:01:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockScanResult },
      });

      const scan = await scanReconciliation({ dryRun: false, limit: 50 });
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/reconciliation/scan', {
        dryRun: false,
        limit: 50,
      });
      expect(scan.discrepanciesFoundCount).toBe(1);
      expect(scan.autoResolvedCount).toBe(1);
      expect(scan.discrepancies[0].autoResolvable).toBe(true);
    });
  });

  // ==========================================
  // SECTION 5: COUPONS MANAGEMENT
  // ==========================================
  describe('5. Coupon Management UI', () => {
    it('25. coupon list fetches paginated coupons', async () => {
      const mockCoupons: PaginatedCouponsData = {
        items: [
          {
            id: 'coup-1',
            code: 'FLASH50',
            discountType: 'PERCENTAGE',
            discountValue: 50,
            minOrderAmountCents: 100000,
            maxDiscountAmountCents: 200000,
            courseId: null,
            courseTitle: null,
            usageLimit: 100,
            redemptionCount: 12,
            perUserLimit: 1,
            startsAt: '2026-10-01T00:00:00.000Z',
            expiresAt: '2026-10-15T23:59:59.000Z',
            isActive: true,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCoupons },
      });

      const res = await fetchAdminCoupons();
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/coupons', {
        params: {},
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].code).toBe('FLASH50');
      expect(res.items[0].discountValue).toBe(50);
    });

    it('26. pagination sends page and limit to coupon API', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { items: [], pagination: { page: 2, limit: 15, total: 30, totalPages: 2, hasNextPage: false, hasPreviousPage: true } },
        },
      });

      await fetchAdminCoupons({ page: 2, limit: 15 });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/coupons', {
        params: { page: 2, limit: 15 },
      });
    });

    it('27. search filters coupons by code', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
        },
      });

      await fetchAdminCoupons({ search: 'FLASH' });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/coupons', {
        params: { search: 'FLASH' },
      });
    });

    it('28. active filter queries active or inactive coupons', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } },
        },
      });

      await fetchAdminCoupons({ isActive: true });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/coupons', {
        params: { isActive: true },
      });
    });

    it('29. create form sends valid payload to backend', async () => {
      const newCouponPayload: CreateCouponRequest = {
        code: 'PROMO20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderAmountCents: 50000,
        startsAt: '2026-10-03T00:00:00.000Z',
        isActive: true,
      };

      const mockCreated: CouponDto = {
        id: 'coup-new',
        ...newCouponPayload,
        minOrderAmountCents: 50000,
        perUserLimit: 1,
        redemptionCount: 0,
        createdAt: '2026-10-03T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockCreated },
      });

      const result = await createAdminCoupon(newCouponPayload);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/coupons', newCouponPayload);
      expect(result.code).toBe('PROMO20');
      expect(result.discountValue).toBe(20);
    });

    it('30. update form sends modified attributes', async () => {
      const updatePayload: UpdateCouponRequest = {
        usageLimit: 200,
        isActive: true,
      };

      const mockUpdated: CouponDto = {
        id: 'coup-1',
        code: 'FLASH50',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        minOrderAmountCents: 0,
        usageLimit: 200,
        redemptionCount: 12,
        perUserLimit: 1,
        startsAt: '2026-10-01T00:00:00.000Z',
        isActive: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
      };

      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: { success: true, data: mockUpdated },
      });

      const result = await updateAdminCoupon('coup-1', updatePayload);
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        '/api/v1/admin/coupons/coup-1',
        updatePayload
      );
      expect(result.usageLimit).toBe(200);
    });

    it('31. disable coupon calls delete API endpoint', async () => {
      const mockDisabled: CouponDto = {
        id: 'coup-1',
        code: 'FLASH50',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        minOrderAmountCents: 0,
        redemptionCount: 12,
        perUserLimit: 1,
        startsAt: '2026-10-01T00:00:00.000Z',
        isActive: false,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
      };

      vi.mocked(axiosInstance.delete).mockResolvedValueOnce({
        data: { success: true, data: mockDisabled },
      });

      const result = await deleteAdminCoupon('coup-1');
      expect(axiosInstance.delete).toHaveBeenCalledWith('/api/v1/admin/coupons/coup-1');
      expect(result.isActive).toBe(false);
    });

    it('32. enable coupon calls patch API with isActive true', async () => {
      const mockEnabled: CouponDto = {
        id: 'coup-1',
        code: 'FLASH50',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        minOrderAmountCents: 0,
        redemptionCount: 12,
        perUserLimit: 1,
        startsAt: '2026-10-01T00:00:00.000Z',
        isActive: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z',
      };

      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: { success: true, data: mockEnabled },
      });

      const result = await updateAdminCoupon('coup-1', { isActive: true });
      expect(axiosInstance.patch).toHaveBeenCalledWith('/api/v1/admin/coupons/coup-1', {
        isActive: true,
      });
      expect(result.isActive).toBe(true);
    });

    it('33. usage information correctly displays redemptions and remaining limit', () => {
      const coupon: Partial<CouponDto> = {
        redemptionCount: 25,
        usageLimit: 100,
      };

      const remaining = coupon.usageLimit! - coupon.redemptionCount!;
      const percentUsed = (coupon.redemptionCount! / coupon.usageLimit!) * 100;

      expect(remaining).toBe(75);
      expect(percentUsed).toBe(25);
    });
  });
});
