import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAdminRefundRequests,
  fetchAdminRefundRequestById,
  approveRefundRequest,
  rejectRefundRequest,
  formatBDT,
} from '@/lib/api/finance';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  RefundRequestListItemDto,
  RefundRequestDto,
  PaginatedRefundRequestsData,
  RefundRequestStatus,
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

describe('P5.5.4 — Admin Refund Review Queue (Web Client Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. API Client Data Fetching', () => {
    it('1. fetches paginated admin refund requests list with query parameters', async () => {
      const mockList: PaginatedRefundRequestsData = {
        items: [
          {
            id: 'req-1',
            requestNumber: 'TSP-REQ-2026-001',
            orderId: 'ord-1',
            orderNumber: 'TSP-ORD-2026-001',
            studentId: 'stud-1',
            studentName: 'John Doe',
            studentEmail: 'john@example.com',
            courseId: 'crs-1',
            courseTitle: 'Full-Stack Next.js',
            payableCents: 450000,
            currency: 'BDT',
            reasonCategory: 'COURSE_CONTENT_MISMATCH',
            courseProgressAtRequest: 12,
            status: 'PENDING',
            refundStatus: null,
            createdAt: '2026-10-04T10:00:00.000Z',
            reviewedAt: null,
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

      const res = await fetchAdminRefundRequests({
        page: 1,
        limit: 10,
        status: 'PENDING',
        search: 'John',
      });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/refund-requests', {
        params: { page: 1, limit: 10, status: 'PENDING', search: 'John' },
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].requestNumber).toBe('TSP-REQ-2026-001');
      expect(res.items[0].studentEmail).toBe('john@example.com');
      expect(res.items[0].payableCents).toBe(450000);
      expect(res.pagination.total).toBe(1);
    });

    it('2. fetches full operational refund request detail by ID', async () => {
      const mockDetail: RefundRequestDto = {
        id: 'req-1',
        requestNumber: 'TSP-REQ-2026-001',
        orderId: 'ord-1',
        orderNumber: 'TSP-ORD-2026-001',
        studentId: 'stud-1',
        studentName: 'John Doe',
        studentEmail: 'john@example.com',
        courseId: 'crs-1',
        courseTitle: 'Full-Stack Next.js',
        enrollmentId: 'enr-1',
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Curriculum covers different tools than advertised in syllabus.',
        courseProgressAtRequest: 12,
        currentProgress: 15,
        status: 'PENDING',
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        rejectionReason: null,
        adminNotes: null,
        refundId: null,
        refundStatus: null,
        orderPaidAt: '2026-10-01T12:00:00.000Z',
        orderStatus: 'PAID',
        payableCents: 450000,
        subtotalCents: 450000,
        discountCents: 0,
        currency: 'BDT',
        invoiceId: 'inv-1',
        invoiceNumber: 'TSP-INV-2026-001',
        createdAt: '2026-10-04T10:00:00.000Z',
        updatedAt: '2026-10-04T10:00:00.000Z',
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockDetail },
      });

      const res = await fetchAdminRefundRequestById('req-1');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/refund-requests/req-1');
      expect(res.id).toBe('req-1');
      expect(res.courseProgressAtRequest).toBe(12);
      expect(res.currentProgress).toBe(15);
      expect(res.payableCents).toBe(450000);
      expect(res.invoiceNumber).toBe('TSP-INV-2026-001');
    });
  });

  describe('2. Admin Decision Mutations', () => {
    it('3. submits refund request approval with optional admin notes', async () => {
      const mockApprovedDto: RefundRequestDto = {
        id: 'req-1',
        requestNumber: 'TSP-REQ-2026-001',
        orderId: 'ord-1',
        studentId: 'stud-1',
        courseId: 'crs-1',
        enrollmentId: 'enr-1',
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Approved ticket reason details.',
        courseProgressAtRequest: 10,
        status: 'APPROVED',
        reviewedBy: 'admin-1',
        reviewedAt: '2026-10-05T12:00:00.000Z',
        adminNotes: 'Syllabus discrepancy verified by course instructor.',
        createdAt: '2026-10-04T10:00:00.000Z',
        updatedAt: '2026-10-05T12:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockApprovedDto },
      });

      const res = await approveRefundRequest('req-1', {
        adminNotes: 'Syllabus discrepancy verified by course instructor.',
      });

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/admin/refund-requests/req-1/approve',
        {
          adminNotes: 'Syllabus discrepancy verified by course instructor.',
        }
      );
      expect(res.status).toBe('APPROVED');
      expect(res.adminNotes).toBe('Syllabus discrepancy verified by course instructor.');
    });

    it('4. submits refund request rejection with mandatory rejection reason and optional notes', async () => {
      const mockRejectedDto: RefundRequestDto = {
        id: 'req-1',
        requestNumber: 'TSP-REQ-2026-001',
        orderId: 'ord-1',
        studentId: 'stud-1',
        courseId: 'crs-1',
        enrollmentId: 'enr-1',
        reasonCategory: 'PERSONAL_REASONS',
        reasonDetail: 'Student changed their mind.',
        courseProgressAtRequest: 18,
        status: 'REJECTED',
        reviewedBy: 'admin-1',
        reviewedAt: '2026-10-05T12:00:00.000Z',
        rejectionReason: 'Course progress exceeds allowable tolerance.',
        adminNotes: 'Student consulted prior to rejection.',
        createdAt: '2026-10-04T10:00:00.000Z',
        updatedAt: '2026-10-05T12:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockRejectedDto },
      });

      const res = await rejectRefundRequest('req-1', {
        rejectionReason: 'Course progress exceeds allowable tolerance.',
        adminNotes: 'Student consulted prior to rejection.',
      });

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/admin/refund-requests/req-1/reject',
        {
          rejectionReason: 'Course progress exceeds allowable tolerance.',
          adminNotes: 'Student consulted prior to rejection.',
        }
      );
      expect(res.status).toBe('REJECTED');
      expect(res.rejectionReason).toBe('Course progress exceeds allowable tolerance.');
    });
  });

  describe('3. Financial & Progress Formatting', () => {
    it('5. formats BDT currency correctly for minor units', () => {
      expect(formatBDT(500000)).toBe('BDT 5,000.00');
      expect(formatBDT(100000)).toBe('BDT 1,000.00');
      expect(formatBDT(0)).toBe('BDT 0.00');
      expect(formatBDT(null)).toBe('BDT 0.00');
      expect(formatBDT(undefined)).toBe('BDT 0.00');
    });

    it('6. clearly distinguishes snapshot progress from real-time progress', () => {
      const req: RefundRequestDto = {
        id: 'req-1',
        requestNumber: 'TSP-REQ-001',
        orderId: 'ord-1',
        studentId: 'stud-1',
        courseId: 'crs-1',
        enrollmentId: 'enr-1',
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Technical issue encountered.',
        courseProgressAtRequest: 10,
        currentProgress: 25,
        status: 'PENDING',
        createdAt: '2026-10-04T10:00:00.000Z',
        updatedAt: '2026-10-04T10:00:00.000Z',
      };

      expect(req.courseProgressAtRequest).toBe(10);
      expect(req.currentProgress).toBe(25);
      expect(req.courseProgressAtRequest).not.toBe(req.currentProgress);
    });
  });

  describe('4. Error Handling & Edge Cases', () => {
    it('7. propagates 409 conflict when request was already reviewed by another administrator', async () => {
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            success: false,
            error: {
              code: 'REFUND_REQUEST_ALREADY_REVIEWED',
              message: 'This refund request has already been reviewed (current status: APPROVED)',
            },
          },
        },
      });

      await expect(
        approveRefundRequest('req-1', { adminNotes: 'Duplicate approval' })
      ).rejects.toMatchObject({
        response: {
          status: 409,
          data: {
            error: {
              code: 'REFUND_REQUEST_ALREADY_REVIEWED',
            },
          },
        },
      });
    });

    it('8. handles server failure gracefully with error object', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchAdminRefundRequests()).rejects.toThrow('Network error');
    });
  });
});
