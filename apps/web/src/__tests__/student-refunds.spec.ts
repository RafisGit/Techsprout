import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchOrderRefundEligibility,
  submitOrderRefundRequest,
  fetchStudentRefundRequests,
} from '@/lib/api/orders';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  RefundEligibilityDto,
  StudentRefundRequestDto,
  PaginatedStudentRefundRequestsData,
  RefundRequestReasonCategory,
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

describe('P5.5.3 — Student Refund Request Workflow (Web Client Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. ELIGIBILITY EVALUATION
  // ==========================================
  describe('1. Refund Eligibility Evaluation', () => {
    it('1. fetches eligibility from authoritative server endpoint', async () => {
      const mockEligibility: RefundEligibilityDto = {
        isEligible: true,
        reason: null,
        daysRemaining: 5,
        courseProgressPercentage: 10,
        maxAllowedProgressPercentage: 20,
        orderPaidAt: '2026-10-03T12:00:00.000Z',
        payableCents: 350000,
        currency: 'BDT',
        existingRequestId: null,
        existingRequestStatus: null,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockEligibility },
      });

      const res = await fetchOrderRefundEligibility('ord-123');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/orders/ord-123/refund-eligibility');
      expect(res.isEligible).toBe(true);
      expect(res.daysRemaining).toBe(5);
      expect(res.courseProgressPercentage).toBe(10);
      expect(res.maxAllowedProgressPercentage).toBe(20);
    });

    it('2. correctly returns ineligible status with reason when progress limit is exceeded', async () => {
      const ineligibleEligibility: RefundEligibilityDto = {
        isEligible: false,
        reason: 'Course progress (35%) exceeds the maximum allowable threshold (20%)',
        daysRemaining: 4,
        courseProgressPercentage: 35,
        maxAllowedProgressPercentage: 20,
        orderPaidAt: '2026-10-01T12:00:00.000Z',
        payableCents: 350000,
        currency: 'BDT',
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: ineligibleEligibility },
      });

      const res = await fetchOrderRefundEligibility('ord-progress-exceeded');

      expect(res.isEligible).toBe(false);
      expect(res.courseProgressPercentage).toBe(35);
      expect(res.reason).toContain('exceeds');
    });

    it('3. returns existing active request state when request is already pending', async () => {
      const pendingEligibility: RefundEligibilityDto = {
        isEligible: false,
        reason: 'An active refund request is already in progress for this order',
        daysRemaining: 4,
        courseProgressPercentage: 0,
        maxAllowedProgressPercentage: 20,
        orderPaidAt: '2026-10-01T12:00:00.000Z',
        payableCents: 350000,
        currency: 'BDT',
        existingRequestId: 'req-pending-1',
        existingRequestStatus: 'PENDING',
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: pendingEligibility },
      });

      const res = await fetchOrderRefundEligibility('ord-with-pending');

      expect(res.isEligible).toBe(false);
      expect(res.existingRequestStatus).toBe('PENDING');
      expect(res.existingRequestId).toBe('req-pending-1');
    });
  });

  // ==========================================
  // 2. SUBMITTING REFUND REQUEST
  // ==========================================
  describe('2. Submitting Refund Request', () => {
    it('4. calls POST /api/v1/orders/:id/refund-request with validated payload', async () => {
      const mockCreated: StudentRefundRequestDto = {
        id: 'req-new-001',
        requestNumber: 'TSP-REQ-ORD123-A1B2',
        orderId: 'ord-123',
        orderNumber: 'TSP-ORD-2026-001',
        courseId: 'crs-1',
        courseTitle: 'Fullstack Next.js & NestJS',
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'The content covers different architecture than expected',
        courseProgressAtRequest: 10,
        status: 'PENDING',
        rejectionReason: null,
        createdAt: '2026-10-05T12:00:00.000Z',
        reviewedAt: null,
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockCreated },
      });

      const res = await submitOrderRefundRequest('ord-123', {
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'The content covers different architecture than expected',
      });

      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/orders/ord-123/refund-request', {
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'The content covers different architecture than expected',
      });
      expect(res.id).toBe('req-new-001');
      expect(res.status).toBe('PENDING');
      expect(res.requestNumber).toBe('TSP-REQ-ORD123-A1B2');
    });

    it('5. all 5 approved reason categories are supported', async () => {
      const categories: RefundRequestReasonCategory[] = [
        'COURSE_CONTENT_MISMATCH',
        'TECHNICAL_ISSUES',
        'ACCIDENTAL_PURCHASE',
        'PERSONAL_REASONS',
        'OTHER',
      ];

      for (const cat of categories) {
        vi.mocked(axiosInstance.post).mockResolvedValueOnce({
          data: {
            success: true,
            data: {
              id: `req-${cat}`,
              requestNumber: `TSP-REQ-${cat}`,
              orderId: 'ord-123',
              reasonCategory: cat,
              reasonDetail: 'Valid explanation for refund request',
              courseProgressAtRequest: 0,
              status: 'PENDING',
              createdAt: '2026-10-05T12:00:00.000Z',
            },
          },
        });

        const res = await submitOrderRefundRequest('ord-123', {
          reasonCategory: cat,
          reasonDetail: 'Valid explanation for refund request',
        });
        expect(res.reasonCategory).toBe(cat);
      }
    });

    it('6. student safe DTO projection never exposes admin-only fields', async () => {
      const studentSafeDto: StudentRefundRequestDto = {
        id: 'req-safe-1',
        requestNumber: 'TSP-REQ-SAFE1',
        orderId: 'ord-123',
        courseId: 'crs-1',
        courseTitle: 'Fullstack Next.js',
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Cannot play videos on mobile browser',
        courseProgressAtRequest: 5,
        status: 'PENDING',
        createdAt: '2026-10-05T12:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: studentSafeDto },
      });

      const res = await submitOrderRefundRequest('ord-123', {
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Cannot play videos on mobile browser',
      });

      // Internal admin fields must not exist on the client DTO
      expect((res as any).adminNotes).toBeUndefined();
      expect((res as any).reviewedBy).toBeUndefined();
      expect((res as any).reviewedByName).toBeUndefined();
      expect((res as any).refundId).toBeUndefined();
      expect((res as any).providerRefundRef).toBeUndefined();
    });
  });

  // ==========================================
  // 3. STUDENT REFUND REQUEST LISTING
  // ==========================================
  describe('3. Student Refund Requests Listing', () => {
    it('7. queries GET /api/v1/refund-requests with pagination and status filter', async () => {
      const mockList: PaginatedStudentRefundRequestsData = {
        items: [
          {
            id: 'req-1',
            requestNumber: 'TSP-REQ-001',
            orderId: 'ord-1',
            orderNumber: 'TSP-ORD-001',
            courseId: 'crs-1',
            courseTitle: 'NextJS Masterclass',
            reasonCategory: 'ACCIDENTAL_PURCHASE',
            reasonDetail: 'Purchased twice by mistake',
            courseProgressAtRequest: 0,
            status: 'PENDING',
            createdAt: '2026-10-05T10:00:00.000Z',
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
        data: { success: true, data: mockList },
      });

      const res = await fetchStudentRefundRequests({ page: 1, limit: 10, status: 'PENDING' });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/refund-requests', {
        params: { page: 1, limit: 10, status: 'PENDING' },
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].status).toBe('PENDING');
    });
  });

  // ==========================================
  // 4. ERROR HANDLING
  // ==========================================
  describe('4. Error Handling & Ineligibility Conditions', () => {
    it('8. handles REFUND_REQUEST_ALREADY_ACTIVE safely', async () => {
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'REFUND_REQUEST_ALREADY_ACTIVE',
              message: 'An active refund request already exists for this order',
            },
          },
        },
      });

      await expect(
        submitOrderRefundRequest('ord-dup', {
          reasonCategory: 'OTHER',
          reasonDetail: 'Submitting duplicate request',
        })
      ).rejects.toMatchObject({
        response: {
          data: {
            error: {
              code: 'REFUND_REQUEST_ALREADY_ACTIVE',
            },
          },
        },
      });
    });

    it('9. handles REFUND_WINDOW_EXPIRED safely', async () => {
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'REFUND_WINDOW_EXPIRED',
              message: 'Refund policy window has expired (7 calendar days from purchase)',
            },
          },
        },
      });

      await expect(
        submitOrderRefundRequest('ord-expired', {
          reasonCategory: 'OTHER',
          reasonDetail: 'Late request after 8 days',
        })
      ).rejects.toMatchObject({
        response: {
          data: {
            error: {
              code: 'REFUND_WINDOW_EXPIRED',
            },
          },
        },
      });
    });

    it('10. handles REFUND_PROGRESS_LIMIT_EXCEEDED safely', async () => {
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'REFUND_PROGRESS_LIMIT_EXCEEDED',
              message: 'Course progress (25%) exceeds the 20% refund eligibility limit',
            },
          },
        },
      });

      await expect(
        submitOrderRefundRequest('ord-progress', {
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Completed 25% of the course',
        })
      ).rejects.toMatchObject({
        response: {
          data: {
            error: {
              code: 'REFUND_PROGRESS_LIMIT_EXCEEDED',
            },
          },
        },
      });
    });
  });
});
