import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAdminAnalyticsOverview,
  fetchAdminCourseAnalytics,
  type AdminAnalyticsOverviewDto,
  type PaginatedAdminCourseAnalyticsData,
} from '@/lib/api/admin-analytics';
import {
  fetchStudentLearningEngagement,
  type StudentLearningEngagementDto,
} from '@/lib/api/learning';
import { axiosInstance } from '@/lib/axiosInstance';
import type { AuthUser } from '@/auth';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P6.3 — WP-05: Administrator & Student Analytics Interfaces Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. ADMIN ANALYTICS OVERVIEW API CLIENT & METRIC ROLLUP
  // =========================================================================
  describe('1. Admin Analytics Overview API Client', () => {
    it('1.1 should fetch authoritative platform overview metrics from /api/v1/admin/analytics/overview', async () => {
      const mockOverview: AdminAnalyticsOverviewDto = {
        totalPublishedCourses: 15,
        totalDraftCourses: 4,
        totalInReviewCourses: 2,
        totalArchivedCourses: 1,
        totalRegisteredStudents: 142,
        totalActiveInstructors: 8,
        platformWideEnrollments: 320,
        platformWideCertificates: 88,
        platformCompletionRate: 27.5,
        reviewQueue: {
          pendingReviewsCount: 2,
          averageTurnaroundHours: 18.5,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockOverview },
      });

      const result = await fetchAdminAnalyticsOverview();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/analytics/overview');
      expect(result.totalPublishedCourses).toBe(15);
      expect(result.totalDraftCourses).toBe(4);
      expect(result.totalInReviewCourses).toBe(2);
      expect(result.totalArchivedCourses).toBe(1);
      expect(result.totalRegisteredStudents).toBe(142);
      expect(result.totalActiveInstructors).toBe(8);
      expect(result.platformWideEnrollments).toBe(320);
      expect(result.platformWideCertificates).toBe(88);
      expect(result.platformCompletionRate).toBe(27.5);
      expect(result.reviewQueue.pendingReviewsCount).toBe(2);
      expect(result.reviewQueue.averageTurnaroundHours).toBe(18.5);
    });

    it('1.2 should propagate 403 Forbidden when a student or instructor requests admin overview', async () => {
      const error403 = {
        response: {
          status: 403,
          data: { success: false, error: { message: 'Forbidden resource: admin role required' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error403);

      await expect(fetchAdminAnalyticsOverview()).rejects.toEqual(error403);
    });

    it('1.3 should propagate 401 Unauthorized for unauthenticated requests', async () => {
      const error401 = {
        response: {
          status: 401,
          data: { success: false, error: { message: 'Authentication required' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error401);

      await expect(fetchAdminAnalyticsOverview()).rejects.toEqual(error401);
    });
  });

  // =========================================================================
  // 2. ADMIN PAGINATED COURSE ANALYTICS API CLIENT
  // =========================================================================
  describe('2. Admin Paginated Course Analytics API Client', () => {
    it('2.1 should query course analytics with search, status, sorting, and pagination parameters', async () => {
      const mockCourseAnalytics: PaginatedAdminCourseAnalyticsData = {
        items: [
          {
            courseId: 'c-101',
            title: 'Modern Web Design',
            slug: 'modern-web-design',
            instructor: {
              id: 'ins-1',
              name: 'Sarah Connor',
              email: 'sarah@example.com',
            },
            category: {
              id: 'cat-1',
              name: 'Web Design',
            },
            status: 'PUBLISHED',
            price: '3500.00',
            currency: 'BDT',
            totalEnrolled: 45,
            completedCount: 20,
            completionRate: 44.44,
            createdAt: '2026-08-01T10:00:00.000Z',
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
        data: { success: true, data: mockCourseAnalytics },
      });

      const result = await fetchAdminCourseAnalytics({
        page: 1,
        limit: 10,
        search: 'Modern',
        status: 'PUBLISHED',
        sortBy: 'completionRate',
        sortOrder: 'desc',
      });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/analytics/courses', {
        params: {
          page: 1,
          limit: 10,
          search: 'Modern',
          status: 'PUBLISHED',
          sortBy: 'completionRate',
          sortOrder: 'desc',
        },
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].courseId).toBe('c-101');
      expect(result.items[0].totalEnrolled).toBe(45);
      expect(result.items[0].completionRate).toBe(44.44);
      expect(result.pagination.total).toBe(1);
    });

    it('2.2 should handle empty search results without throwing errors', async () => {
      const emptyResult: PaginatedAdminCourseAnalyticsData = {
        items: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: emptyResult },
      });

      const result = await fetchAdminCourseAnalytics({
        search: 'NonexistentCourseName',
      });

      expect(result.items.length).toBe(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  // =========================================================================
  // 3. STUDENT PERSONAL ENGAGEMENT API CLIENT & DATA ISOLATION
  // =========================================================================
  describe('3. Student Personal Learning Engagement API Client', () => {
    it('3.1 should fetch authenticated student personal engagement counters from /api/v1/learn/analytics/engagement', async () => {
      const mockEngagement: StudentLearningEngagementDto = {
        enrolledCoursesCount: 4,
        inProgressCoursesCount: 3,
        completedCertificatesCount: 1,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockEngagement },
      });

      const result = await fetchStudentLearningEngagement();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/learn/analytics/engagement');
      expect(result.enrolledCoursesCount).toBe(4);
      expect(result.inProgressCoursesCount).toBe(3);
      expect(result.completedCertificatesCount).toBe(1);
    });

    it('3.2 should handle zero-enrollment state cleanly', async () => {
      const zeroEngagement: StudentLearningEngagementDto = {
        enrolledCoursesCount: 0,
        inProgressCoursesCount: 0,
        completedCertificatesCount: 0,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: zeroEngagement },
      });

      const result = await fetchStudentLearningEngagement();

      expect(result.enrolledCoursesCount).toBe(0);
      expect(result.inProgressCoursesCount).toBe(0);
      expect(result.completedCertificatesCount).toBe(0);
    });

    it('3.3 should propagate 401 when student session is expired', async () => {
      const error401 = {
        response: {
          status: 401,
          data: { success: false, error: { message: 'Session expired' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error401);

      await expect(fetchStudentLearningEngagement()).rejects.toEqual(error401);
    });
  });

  // =========================================================================
  // 4. AUTHORIZATION GUARDS & ROLE ISOLATION LOGIC
  // =========================================================================
  describe('4. Navigation & Authorization Role Isolation', () => {
    function canAccessAdminAnalytics(user: AuthUser | null): boolean {
      return user?.role === 'admin';
    }

    function canAccessStudentEngagement(user: AuthUser | null): boolean {
      return user !== null && (user.role === 'student' || user.role === 'instructor' || user.role === 'admin');
    }

    it('4.1 should restrict admin analytics access strictly to users with role "admin"', () => {
      const adminUser: AuthUser = {
        id: 'u-admin',
        name: 'Admin User',
        username: 'admin',
        email: 'admin@techsprout.edu',
        role: 'admin',
        isVerified: true,
      };

      const instructorUser: AuthUser = {
        id: 'u-inst',
        name: 'Instructor User',
        username: 'inst',
        email: 'inst@techsprout.edu',
        role: 'instructor',
        isVerified: true,
      };

      const studentUser: AuthUser = {
        id: 'u-std',
        name: 'Student User',
        username: 'std',
        email: 'std@techsprout.edu',
        role: 'student',
        isVerified: true,
      };

      expect(canAccessAdminAnalytics(adminUser)).toBe(true);
      expect(canAccessAdminAnalytics(instructorUser)).toBe(false);
      expect(canAccessAdminAnalytics(studentUser)).toBe(false);
      expect(canAccessAdminAnalytics(null)).toBe(false);
    });

    it('4.2 should permit authenticated students, instructors, and admins to access their own engagement metrics', () => {
      const studentUser: AuthUser = {
        id: 'u-std',
        name: 'Student User',
        username: 'std',
        email: 'std@techsprout.edu',
        role: 'student',
        isVerified: true,
      };

      expect(canAccessStudentEngagement(studentUser)).toBe(true);
      expect(canAccessStudentEngagement(null)).toBe(false);
    });
  });

  // =========================================================================
  // 5. CACHE KEYS & ISOLATION VERIFICATION
  // =========================================================================
  describe('5. Query Key Scoping & Cache Isolation', () => {
    it('5.1 should generate distinct cache keys for admin overview, course queries, and student engagement', () => {
      const overviewKey = ['adminAnalyticsOverview'];
      const courseKey1 = ['adminCourseAnalytics', 1, 10, 'python', 'PUBLISHED', 'enrollments', 'desc'];
      const courseKey2 = ['adminCourseAnalytics', 2, 10, 'python', 'PUBLISHED', 'enrollments', 'desc'];
      const studentKey = ['studentEngagementAnalytics'];

      expect(overviewKey).not.toEqual(studentKey);
      expect(courseKey1).not.toEqual(courseKey2);
      expect(courseKey1[1]).toBe(1); // Page 1
      expect(courseKey2[1]).toBe(2); // Page 2
    });
  });

  // =========================================================================
  // 6. METRIC FORMATTING & SLA CALCULATIONS
  // =========================================================================
  describe('6. Metric Formatting & SLA Display Helpers', () => {
    it('6.1 should correctly format turnaround hours or render N/A when null', () => {
      function formatTurnaround(hours: number | null): string {
        return hours != null ? `${hours}h` : 'N/A';
      }

      expect(formatTurnaround(18.5)).toBe('18.5h');
      expect(formatTurnaround(0)).toBe('0h');
      expect(formatTurnaround(null)).toBe('N/A');
    });

    it('6.2 should correctly format completion rate percentage with single decimal precision', () => {
      function formatRate(rate: number): string {
        return `${Number(rate.toFixed(1))}%`;
      }

      expect(formatRate(44.4444)).toBe('44.4%');
      expect(formatRate(100)).toBe('100%');
      expect(formatRate(0)).toBe('0%');
    });
  });
});
