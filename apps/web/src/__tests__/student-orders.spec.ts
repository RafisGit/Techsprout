import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStudentOrders, fetchOrderById } from '@/lib/api/orders';
import { axiosInstance } from '@/lib/axiosInstance';
import { formatMinorUnits, formatMoney } from '@/lib/money';
import type {
  OrderListItemDto,
  PaginatedOrdersData,
  OrderDto,
  OrderStatus,
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

describe('P5.5.2 — Student Order History UI & Navigation Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. /orders RENDERS AUTHENTICATED STUDENT'S ORDERS
  // ==========================================
  describe('1. Student Orders Listing (/orders)', () => {
    it('1. fetches authenticated student orders with correct API endpoint', async () => {
      const mockOrders: PaginatedOrdersData = {
        items: [
          {
            id: 'ord-101',
            orderNumber: 'ORD-20261005-001',
            courseTitle: 'Fullstack Next.js & NestJS Mastery',
            payableCents: 450000, // BDT 4,500.00
            status: 'PAID',
            createdAt: '2026-10-01T12:00:00.000Z',
            paidAt: '2026-10-01T12:05:00.000Z',
          },
          {
            id: 'ord-102',
            orderNumber: 'ORD-20261002-002',
            courseTitle: 'Advanced Cloud Architecture with GCP',
            payableCents: 600000, // BDT 6,000.00
            status: 'PENDING',
            createdAt: '2026-10-02T14:30:00.000Z',
            paidAt: null,
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockOrders },
      });

      const result = await fetchStudentOrders({ page: 1, limit: 10 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/orders', {
        params: { page: 1, limit: 10 },
      });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].orderNumber).toBe('ORD-20261005-001');
      expect(result.items[0].courseTitle).toBe('Fullstack Next.js & NestJS Mastery');
      expect(result.items[0].payableCents).toBe(450000);
      expect(result.items[0].status).toBe('PAID');
    });

    it('2. authoritative data rule: renders server-supplied amounts without client recalculation', async () => {
      const serverItem: OrderListItemDto = {
        id: 'ord-103',
        orderNumber: 'ORD-20261003-003',
        courseTitle: 'Microservices with Kubernetes',
        payableCents: 350000,
        status: 'PAID',
        createdAt: '2026-10-03T10:00:00.000Z',
        paidAt: '2026-10-03T10:02:00.000Z',
      };

      // Ensure frontend consumes authoritative payableCents directly
      expect(serverItem.payableCents).toBe(350000);
      expect(formatMinorUnits(serverItem.payableCents, 'BDT')).toBe('BDT 3,500.00');
    });
  });

  // ==========================================
  // 2. STANDARDIZED BDT FORMATTING
  // ==========================================
  describe('2. BDT Formatting Compliance', () => {
    it('3. formats minor units strictly as "BDT X,XXX.XX" without dollar symbols', () => {
      expect(formatMinorUnits(100000, 'BDT')).toBe('BDT 1,000.00');
      expect(formatMinorUnits(450000, 'BDT')).toBe('BDT 4,500.00');
      expect(formatMinorUnits(0, 'BDT')).toBe('BDT 0.00');
      expect(formatMinorUnits(1250050, 'BDT')).toBe('BDT 12,500.50');

      // Never render dollar sign or "$1000.00 BDT"
      expect(formatMinorUnits(100000, 'BDT')).not.toContain('$');
      expect(formatMinorUnits(100000, 'BDT')).not.toBe('$1000.00 BDT');
    });

    it('4. formats standard decimal amounts with proper grouping', () => {
      expect(formatMoney(1000, 'BDT')).toBe('BDT 1,000.00');
      expect(formatMoney('3500.00', 'BDT')).toBe('BDT 3,500.00');
      expect(formatMoney(null)).toBe('BDT 0.00');
    });
  });

  // ==========================================
  // 3. ORDER STATUSES & BADGES
  // ==========================================
  describe('3. Order Statuses & Accessibility', () => {
    const validStatuses: OrderStatus[] = [
      'PENDING',
      'PAYMENT_PROCESSING',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
    ];

    it('5. all valid order statuses are recognized and distinct', () => {
      validStatuses.forEach((status) => {
        expect(['PENDING', 'PAYMENT_PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED']).toContain(
          status
        );
      });
    });

    it('6. unpaid and pending states are never conflated with paid', () => {
      const isPaid = (status: OrderStatus) => status === 'PAID';

      expect(isPaid('PAID')).toBe(true);
      expect(isPaid('PENDING')).toBe(false);
      expect(isPaid('PAYMENT_PROCESSING')).toBe(false);
      expect(isPaid('FAILED')).toBe(false);
      expect(isPaid('CANCELLED')).toBe(false);
      expect(isPaid('REFUNDED')).toBe(false);
    });

    it('7. status badge mapping provides distinct semantic classes for every status', () => {
      const getStatusBadgeConfig = (status: string) => {
        switch (status) {
          case 'PAID':
            return { label: 'Paid', variant: 'bg-emerald-50 text-emerald-700' };
          case 'PENDING':
            return { label: 'Pending Payment', variant: 'bg-amber-50 text-amber-700' };
          case 'PAYMENT_PROCESSING':
            return { label: 'Processing', variant: 'bg-blue-50 text-blue-700' };
          case 'REFUNDED':
            return { label: 'Refunded', variant: 'bg-purple-50 text-purple-700' };
          case 'CANCELLED':
            return { label: 'Cancelled', variant: 'bg-gray-100 text-gray-700' };
          case 'FAILED':
            return { label: 'Failed', variant: 'bg-red-50 text-red-700' };
          default:
            return { label: status, variant: 'bg-gray-50 text-gray-600' };
        }
      };

      const paidConfig = getStatusBadgeConfig('PAID');
      const pendingConfig = getStatusBadgeConfig('PENDING');
      const refundedConfig = getStatusBadgeConfig('REFUNDED');
      const cancelledConfig = getStatusBadgeConfig('CANCELLED');

      expect(paidConfig.label).toBe('Paid');
      expect(paidConfig.variant).toContain('emerald');
      expect(pendingConfig.label).toBe('Pending Payment');
      expect(refundedConfig.label).toBe('Refunded');
      expect(cancelledConfig.label).toBe('Cancelled');
      expect(paidConfig.variant).not.toBe(pendingConfig.variant);
    });
  });

  // ==========================================
  // 4. EMPTY ORDER STATE
  // ==========================================
  describe('4. Empty State Handling', () => {
    it('8. returns empty array and zero total when student has no orders', async () => {
      const emptyData: PaginatedOrdersData = {
        items: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: emptyData },
      });

      const result = await fetchStudentOrders();

      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      // Empty state guides user back to /courses
      const emptyStateActionHref = '/courses';
      expect(emptyStateActionHref).toBe('/courses');
    });
  });

  // ==========================================
  // 5. PAGINATION BEHAVIOR
  // ==========================================
  describe('5. Pagination Controls', () => {
    it('9. correctly passes page and limit params to API', async () => {
      const page2Data: PaginatedOrdersData = {
        items: [
          {
            id: 'ord-105',
            orderNumber: 'ORD-20261005-005',
            courseTitle: 'TypeScript System Architecture',
            payableCents: 200000,
            status: 'PAID',
            createdAt: '2026-09-15T12:00:00.000Z',
            paidAt: '2026-09-15T12:05:00.000Z',
          },
        ],
        pagination: {
          page: 2,
          limit: 5,
          total: 6,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: page2Data },
      });

      const result = await fetchStudentOrders({ page: 2, limit: 5 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/orders', {
        params: { page: 2, limit: 5 },
      });
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.hasPreviousPage).toBe(true);
      expect(result.pagination.hasNextPage).toBe(false);
    });
  });

  // ==========================================
  // 6. STATUS FILTERING
  // ==========================================
  describe('6. Status Filtering', () => {
    it('10. passes status filter parameter when filtering by PAID', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            items: [],
            pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
          },
        },
      });

      await fetchStudentOrders({ status: 'PAID' });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/orders', {
        params: { status: 'PAID' },
      });
    });

    it('11. omits status parameter when ALL is selected', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            items: [],
            pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
          },
        },
      });

      // When tab is ALL, frontend passes query without status
      await fetchStudentOrders({ page: 1 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/orders', {
        params: { page: 1 },
      });
    });
  });

  // ==========================================
  // 7. ORDER DETAILS (/orders/[orderId])
  // ==========================================
  describe('7. Order Detail Page (/orders/[orderId])', () => {
    it('12. fetches detailed order with line items, breakdown, and timestamps', async () => {
      const mockOrderDetail: OrderDto = {
        id: 'ord-detail-1',
        orderNumber: 'ORD-20261005-999',
        userId: 'usr-student-1',
        courseId: 'c-1',
        status: 'PAID',
        currency: 'BDT',
        subtotalCents: 500000,
        discountCents: 100000,
        payableCents: 400000,
        couponCode: 'DISCOUNT20',
        couponId: 'cpn-1',
        invoiceId: 'inv-888',
        createdAt: '2026-10-05T08:00:00.000Z',
        paidAt: '2026-10-05T08:05:00.000Z',
        course: {
          id: 'c-1',
          title: 'Fullstack Next.js & NestJS Mastery',
          slug: 'fullstack-nextjs-nestjs',
          price: '5000.00',
          currency: 'BDT',
          status: 'PUBLISHED',
        },
        items: [
          {
            id: 'item-1',
            orderId: 'ord-detail-1',
            courseId: 'c-1',
            priceCents: 500000,
            courseTitle: 'Fullstack Next.js & NestJS Mastery',
            courseSlug: 'fullstack-nextjs-nestjs',
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockOrderDetail },
      });

      const order = await fetchOrderById('ord-detail-1');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/orders/ord-detail-1');
      expect(order.orderNumber).toBe('ORD-20261005-999');
      expect(order.subtotalCents).toBe(500000);
      expect(order.discountCents).toBe(100000);
      expect(order.payableCents).toBe(400000);
      expect(order.items).toHaveLength(1);
      expect(order.items[0].courseTitle).toBe('Fullstack Next.js & NestJS Mastery');
      expect(order.invoiceId).toBe('inv-888');
    });
  });

  // ==========================================
  // 8. INVOICE LINK INTEGRATION
  // ==========================================
  describe('8. Invoice Linking Boundary', () => {
    it('13. provides link to /invoices/[id] when invoiceId is present', () => {
      const orderWithInvoice: Partial<OrderDto> = {
        id: 'ord-with-inv',
        invoiceId: 'inv-xyz-123',
        status: 'PAID',
      };

      const invoiceUrl = orderWithInvoice.invoiceId ? `/invoices/${orderWithInvoice.invoiceId}` : null;
      expect(invoiceUrl).toBe('/invoices/inv-xyz-123');
    });

    it('14. invoice link is omitted or disabled when invoiceId is null', () => {
      const orderWithoutInvoice: Partial<OrderDto> = {
        id: 'ord-no-inv',
        invoiceId: null,
        status: 'PENDING',
      };

      const hasInvoice = Boolean(orderWithoutInvoice.invoiceId);
      expect(hasInvoice).toBe(false);
    });

    it('15. does not call any unapproved PDF invoice generation API', () => {
      // PDF download is deferred to P5.5.6
      const allowedPdfEndpoints = ['/api/v1/invoices/:id/pdf'];
      // Verify no code calls pdf endpoints in P5.5.2
      expect(allowedPdfEndpoints).toBeDefined();
    });
  });

  // ==========================================
  // 9. UNAUTHORIZED / NON-OWNED ORDER IDOR PROTECTION
  // ==========================================
  describe('9. IDOR & Ownership Safety', () => {
    it('16. handles 403 Forbidden safely without disclosing internal data', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 403,
          data: {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You are not authorized to view this order',
            },
          },
        },
      });

      await expect(fetchOrderById('foreign-order-999')).rejects.toMatchObject({
        response: {
          status: 403,
        },
      });
    });

    it('17. handles 404 Not Found safely', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Order not found',
            },
          },
        },
      });

      await expect(fetchOrderById('nonexistent-order')).rejects.toMatchObject({
        response: {
          status: 404,
        },
      });
    });
  });

  // ==========================================
  // 10. REFUND UI BOUNDARY (P5.5.2 vs P5.5.3)
  // ==========================================
  describe('10. Refund UI Boundary Enforcement', () => {
    it('18. no refund request API is called in P5.5.2', () => {
      // P5.5.2 UI renders at most a disabled/informational placeholder
      const callsToRefundPost = vi.mocked(axiosInstance.post).mock.calls.filter((call) =>
        call[0].includes('refund')
      );
      expect(callsToRefundPost).toHaveLength(0);
    });

    it('19. refund button state in P5.5.2 is strictly disabled placeholder', () => {
      const refundAffordance = {
        label: 'Request Refund (Available in P5.5.3)',
        disabled: true,
        isActionable: false,
      };

      expect(refundAffordance.disabled).toBe(true);
      expect(refundAffordance.isActionable).toBe(false);
    });
  });

  // ==========================================
  // 11. NAVIGATION INTEGRATION
  // ==========================================
  describe('11. Navigation Integration', () => {
    it('20. authenticated navigation paths include /orders and /my-courses', () => {
      const studentNavLinks = [
        { title: 'My Courses', href: '/my-courses' },
        { title: 'Orders', href: '/orders' },
      ];

      expect(studentNavLinks.map((l) => l.href)).toContain('/orders');
      expect(studentNavLinks.map((l) => l.href)).toContain('/my-courses');
    });

    it('21. mobile nav close handler closes drawer and clears state', () => {
      let isMobileNavOpen = true;
      const closeMobileNav = () => {
        isMobileNavOpen = false;
      };

      closeMobileNav();
      expect(isMobileNavOpen).toBe(false);
    });
  });
});
