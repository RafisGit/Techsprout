import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  submitCourseForReview,
  withdrawCourseReview,
  fetchCourseReviewStatus,
  fetchAdminReviewQueue,
  approveCourseReview,
  rejectCourseReview,
} from '@/lib/api/instructor';
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

describe('P6.2 — WP-04: Course Review Workflow & Admin Review Queue Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. INSTRUCTOR API CLIENT INTEGRATION
  // =========================================================================
  describe('1. Instructor Review API Client Functions', () => {
    it('1.1 should call submitCourseForReview with correct endpoint and payload', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 'req-1',
          courseId: 'course-101',
          status: 'PENDING',
          submissionNotes: 'Ready for final curriculum audit.',
          submittedAt: '2026-10-10T04:00:00.000Z',
        },
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({ data: mockResponse });

      const result = await submitCourseForReview('course-101', {
        submissionNotes: 'Ready for final curriculum audit.',
      });

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/instructor/courses/course-101/submit-for-review',
        { submissionNotes: 'Ready for final curriculum audit.' }
      );
      expect(result.id).toBe('req-1');
      expect(result.status).toBe('PENDING');
      expect(result.submissionNotes).toBe('Ready for final curriculum audit.');
    });

    it('1.2 should call withdrawCourseReview with correct endpoint', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 'req-1',
          courseId: 'course-101',
          status: 'CANCELLED',
          cancelledAt: '2026-10-10T04:30:00.000Z',
        },
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({ data: mockResponse });

      const result = await withdrawCourseReview('course-101');

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/instructor/courses/course-101/withdraw-review'
      );
      expect(result.id).toBe('req-1');
      expect(result.status).toBe('CANCELLED');
    });

    it('1.3 should call fetchCourseReviewStatus and return current review and history', async () => {
      const mockStatusResponse = {
        success: true,
        data: {
          courseId: 'course-101',
          currentStatus: 'DRAFT',
          latestReviewRequest: {
            id: 'req-prev',
            status: 'REJECTED',
            adminFeedback: 'Please provide higher resolution video for Lesson 3.',
            reviewedAt: '2026-10-09T18:00:00.000Z',
            reviewer: {
              id: 'admin-1',
              name: 'Institutional Auditor',
            },
          },
          history: [],
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: mockStatusResponse });

      const result = await fetchCourseReviewStatus('course-101');

      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/instructor/courses/course-101/review-status'
      );
      expect(result.courseId).toBe('course-101');
      expect(result.latestReviewRequest?.status).toBe('REJECTED');
      expect(result.latestReviewRequest?.adminFeedback).toBe(
        'Please provide higher resolution video for Lesson 3.'
      );
    });
  });

  // =========================================================================
  // 2. INSTRUCTOR COURSE PREFLIGHT CHECKLIST EVALUATION
  // =========================================================================
  describe('2. Course Review Preflight Checklist Engine', () => {
    // Pure validator matching CourseReviewModal implementation
    function evaluatePreflight(course: {
      title?: string | null;
      description?: string | null;
      thumbnailMediaId?: string | null;
      thumbnailUrl?: string | null;
      modules?: Array<{ lessons?: Array<any> }>;
    }) {
      const hasTitle = Boolean(course.title && course.title.trim().length > 0);
      const hasDescription = Boolean(course.description && course.description.trim().length > 0);
      const hasThumbnail = Boolean(course.thumbnailMediaId || course.thumbnailUrl);
      const moduleCount = course.modules?.length || 0;
      const hasModules = moduleCount > 0;
      const lessonCount =
        course.modules?.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) || 0;
      const hasLessons = lessonCount > 0;

      return {
        hasTitle,
        hasDescription,
        hasThumbnail,
        hasModules,
        hasLessons,
        moduleCount,
        lessonCount,
        isEligible: hasTitle && hasDescription && hasThumbnail && hasModules && hasLessons,
      };
    }

    it('2.1 should validate that a complete course passes all 5 preflight rules', () => {
      const validCourse = {
        title: 'Mastering Antigravity and Distributed Systems',
        description: 'Comprehensive graduate-level coursework on distributed architecture.',
        thumbnailMediaId: 'media-thumbnail-1',
        modules: [
          {
            lessons: [{ id: 'l1', title: 'Lesson 1' }, { id: 'l2', title: 'Lesson 2' }],
          },
          {
            lessons: [{ id: 'l3', title: 'Lesson 3' }],
          },
        ],
      };

      const result = evaluatePreflight(validCourse);

      expect(result.hasTitle).toBe(true);
      expect(result.hasDescription).toBe(true);
      expect(result.hasThumbnail).toBe(true);
      expect(result.hasModules).toBe(true);
      expect(result.hasLessons).toBe(true);
      expect(result.moduleCount).toBe(2);
      expect(result.lessonCount).toBe(3);
      expect(result.isEligible).toBe(true);
    });

    it('2.2 should reject submission if title is empty or only whitespace', () => {
      const invalidCourse = {
        title: '   ',
        description: 'Valid description',
        thumbnailMediaId: 'media-thumbnail-1',
        modules: [{ lessons: [{ id: 'l1' }] }],
      };

      const result = evaluatePreflight(invalidCourse);
      expect(result.hasTitle).toBe(false);
      expect(result.isEligible).toBe(false);
    });

    it('2.3 should reject submission if description is empty or missing', () => {
      const invalidCourse = {
        title: 'Valid Title',
        description: '',
        thumbnailMediaId: 'media-thumbnail-1',
        modules: [{ lessons: [{ id: 'l1' }] }],
      };

      const result = evaluatePreflight(invalidCourse);
      expect(result.hasDescription).toBe(false);
      expect(result.isEligible).toBe(false);
    });

    it('2.4 should reject submission if thumbnail media is missing', () => {
      const invalidCourse = {
        title: 'Valid Title',
        description: 'Valid Description',
        thumbnailMediaId: null,
        thumbnailUrl: null,
        modules: [{ lessons: [{ id: 'l1' }] }],
      };

      const result = evaluatePreflight(invalidCourse);
      expect(result.hasThumbnail).toBe(false);
      expect(result.isEligible).toBe(false);
    });

    it('2.5 should reject submission if course has zero modules', () => {
      const invalidCourse = {
        title: 'Valid Title',
        description: 'Valid Description',
        thumbnailMediaId: 'thumb-1',
        modules: [],
      };

      const result = evaluatePreflight(invalidCourse);
      expect(result.hasModules).toBe(false);
      expect(result.moduleCount).toBe(0);
      expect(result.isEligible).toBe(false);
    });

    it('2.6 should reject submission if course has modules but zero lessons', () => {
      const invalidCourse = {
        title: 'Valid Title',
        description: 'Valid Description',
        thumbnailMediaId: 'thumb-1',
        modules: [{ lessons: [] }, { lessons: [] }],
      };

      const result = evaluatePreflight(invalidCourse);
      expect(result.hasModules).toBe(true);
      expect(result.hasLessons).toBe(false);
      expect(result.lessonCount).toBe(0);
      expect(result.isEligible).toBe(false);
    });
  });

  // =========================================================================
  // 3. CONTEXT-SENSITIVE ACTIONS & REVIEW STATUS DISPLAY
  // =========================================================================
  describe('3. Context-Sensitive Actions & Review Status Engine', () => {
    function getAvailableInstructorActions(course: {
      status: string;
      latestReview?: { status: string };
    }) {
      const canSubmit = course.status === 'DRAFT';
      const canWithdraw = course.status === 'IN_REVIEW';
      const canViewLive = course.status === 'PUBLISHED';
      const isRevisionsRequested =
        course.status === 'DRAFT' && course.latestReview?.status === 'REJECTED';

      return {
        canSubmit,
        canWithdraw,
        canViewLive,
        isRevisionsRequested,
      };
    }

    it('3.1 should offer Submit for Review when course is DRAFT', () => {
      const actions = getAvailableInstructorActions({ status: 'DRAFT' });
      expect(actions.canSubmit).toBe(true);
      expect(actions.canWithdraw).toBe(false);
      expect(actions.canViewLive).toBe(false);
    });

    it('3.2 should offer Withdraw Review and lock curriculum editing when IN_REVIEW', () => {
      const actions = getAvailableInstructorActions({ status: 'IN_REVIEW' });
      expect(actions.canSubmit).toBe(false);
      expect(actions.canWithdraw).toBe(true);
      expect(actions.canViewLive).toBe(false);
    });

    it('3.3 should offer View Live and disable submission when course is PUBLISHED', () => {
      const actions = getAvailableInstructorActions({ status: 'PUBLISHED' });
      expect(actions.canSubmit).toBe(false);
      expect(actions.canWithdraw).toBe(false);
      expect(actions.canViewLive).toBe(true);
    });

    it('3.4 should distinguish revisions requested state with previous rejection', () => {
      const actions = getAvailableInstructorActions({
        status: 'DRAFT',
        latestReview: { status: 'REJECTED' },
      });
      expect(actions.canSubmit).toBe(true);
      expect(actions.isRevisionsRequested).toBe(true);
    });
  });

  // =========================================================================
  // 4. ADMINISTRATOR REVIEW QUEUE & ACTION CLIENTS
  // =========================================================================
  describe('4. Administrator Review Queue & Decisions', () => {
    it('4.1 should call fetchAdminReviewQueue with pagination parameters', async () => {
      const mockQueueResponse = {
        success: true,
        data: {
          items: [
            {
              id: 'req-1',
              courseId: 'c-100',
              status: 'PENDING',
              submissionNotes: 'All modules verified.',
              submittedAt: '2026-10-10T02:00:00.000Z',
              course: {
                id: 'c-100',
                title: 'Introduction to Cloud Native',
                price: '2000.00',
                currency: 'BDT',
              },
              instructor: {
                id: 'inst-1',
                name: 'Jane Educator',
                email: 'jane@techsprout.edu',
              },
            },
          ],
          pagination: {
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
          },
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: mockQueueResponse });

      const result = await fetchAdminReviewQueue({ page: 1, limit: 10, status: 'PENDING' });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/courses/review-queue', {
        params: { page: 1, limit: 10, status: 'PENDING' },
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].course.title).toBe('Introduction to Cloud Native');
      expect(result.items[0].instructor.email).toBe('jane@techsprout.edu');
    });

    it('4.2 should call approveCourseReview with course ID', async () => {
      const mockApproveResponse = {
        success: true,
        data: {
          id: 'req-1',
          courseId: 'c-100',
          status: 'APPROVED',
          reviewedAt: '2026-10-10T05:00:00.000Z',
        },
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({ data: mockApproveResponse });

      const result = await approveCourseReview('c-100');

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/admin/courses/c-100/approve-review'
      );
      expect(result.status).toBe('APPROVED');
    });

    it('4.3 should call rejectCourseReview with adminFeedback payload', async () => {
      const mockRejectResponse = {
        success: true,
        data: {
          id: 'req-1',
          courseId: 'c-100',
          status: 'REJECTED',
          adminFeedback: 'Please add at least 3 practice exercises.',
          reviewedAt: '2026-10-10T05:00:00.000Z',
        },
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({ data: mockRejectResponse });

      const result = await rejectCourseReview('c-100', {
        adminFeedback: 'Please add at least 3 practice exercises.',
      });

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/admin/courses/c-100/reject-review',
        { adminFeedback: 'Please add at least 3 practice exercises.' }
      );
      expect(result.status).toBe('REJECTED');
      expect(result.adminFeedback).toBe('Please add at least 3 practice exercises.');
    });

    it('4.4 should enforce client-side rejection feedback length invariant (min 5 characters)', () => {
      function validateRejectionFeedback(feedback: string): {
        isValid: boolean;
        trimmedLength: number;
        error?: string;
      } {
        const trimmed = feedback.trim();
        if (trimmed.length < 5) {
          return {
            isValid: false,
            trimmedLength: trimmed.length,
            error: 'Feedback must be at least 5 characters long.',
          };
        }
        if (trimmed.length > 2000) {
          return {
            isValid: false,
            trimmedLength: trimmed.length,
            error: 'Feedback cannot exceed 2000 characters.',
          };
        }
        return { isValid: true, trimmedLength: trimmed.length };
      }

      // 4 characters -> invalid
      expect(validateRejectionFeedback('No').isValid).toBe(false);
      expect(validateRejectionFeedback('Bad.').isValid).toBe(false);
      expect(validateRejectionFeedback('   No   ').isValid).toBe(false);

      // 5 characters -> valid
      expect(validateRejectionFeedback('Fix it').isValid).toBe(true);
      expect(validateRejectionFeedback('Detailed feedback explaining required changes.').isValid).toBe(
        true
      );
    });
  });

  // =========================================================================
  // 5. ROLE-BASED ACCESS & NAVIGATION ISOLATION
  // =========================================================================
  describe('5. Role-Based Navigation & Access Isolation', () => {
    function getAdminNavLinks(user: AuthUser | null) {
      const isAdmin = user?.role === 'admin';
      const navLinks = [
        {
          title: 'Overview',
          href: '/dashboard/admin/overview',
          show: isAdmin,
        },
        {
          title: 'Courses',
          href: '/admin/courses',
          show: true,
        },
        {
          title: 'Review Queue',
          href: '/admin/courses/review-queue',
          show: isAdmin,
        },
        {
          title: 'Categories',
          href: '/admin/categories',
          show: isAdmin,
        },
        {
          title: 'Finance',
          href: '/admin/finance',
          show: isAdmin,
        },
        {
          title: 'Coupons',
          href: '/admin/coupons',
          show: isAdmin,
        },
      ];
      return navLinks.filter((link) => link.show).map((l) => ({ title: l.title, href: l.href }));
    }

    it('5.1 should include Review Queue in AdminNav for admin users', () => {
      const adminUser: AuthUser = {
        id: 'admin-1',
        name: 'Super Admin',
        username: 'superadmin',
        email: 'admin@techsprout.edu',
        role: 'admin',
        isVerified: true,
      };

      const links = getAdminNavLinks(adminUser);
      const linkHrefs = links.map((l) => l.href);

      expect(linkHrefs).toContain('/admin/courses/review-queue');
      expect(links.find((l) => l.href === '/admin/courses/review-queue')?.title).toBe('Review Queue');
    });

    it('5.2 should strictly exclude Review Queue from AdminNav for instructors', () => {
      const instructorUser: AuthUser = {
        id: 'inst-1',
        name: 'Dr. John Doe',
        username: 'johndoe',
        email: 'john@techsprout.edu',
        role: 'instructor',
        isVerified: true,
      };

      const links = getAdminNavLinks(instructorUser);
      const linkHrefs = links.map((l) => l.href);

      expect(linkHrefs).not.toContain('/admin/courses/review-queue');
      expect(linkHrefs).toContain('/admin/courses');
    });

    it('5.3 should isolate active tab matching so /admin/courses/review-queue does not mark /admin/courses active', () => {
      function isTabActive(linkHref: string, pathname: string) {
        return (
          pathname === linkHref ||
          (linkHref === '/admin/courses'
            ? pathname.startsWith('/admin/courses') &&
              !pathname.startsWith('/admin/courses/review-queue')
            : linkHref !== '/dashboard/admin/overview' && pathname.startsWith(linkHref))
        );
      }

      // When on /admin/courses
      expect(isTabActive('/admin/courses', '/admin/courses')).toBe(true);
      expect(isTabActive('/admin/courses/review-queue', '/admin/courses')).toBe(false);

      // When on /admin/courses/c-123
      expect(isTabActive('/admin/courses', '/admin/courses/c-123')).toBe(true);
      expect(isTabActive('/admin/courses/review-queue', '/admin/courses/c-123')).toBe(false);

      // When on /admin/courses/review-queue
      expect(isTabActive('/admin/courses', '/admin/courses/review-queue')).toBe(false);
      expect(isTabActive('/admin/courses/review-queue', '/admin/courses/review-queue')).toBe(true);
    });
  });
});
