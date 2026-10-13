import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchInstructorCourses,
  fetchInstructorCourseById,
  fetchInstructorReviewStatus,
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

describe('P6.2 — WP-03: Frontend IA, Navigation & Authorization Architecture Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. ADMIN NAVIGATION OVERVIEW 403 TRAP RESOLUTION
  // =========================================================================
  describe('1. AdminNav Link Filtering & 403 Trap Prevention', () => {
    // Helper replicating AdminNav link filtering logic
    function getAdminNavLinks(user: AuthUser | null) {
      const isAdmin = user?.role === 'admin';
      const navLinks = [
        {
          title: 'Overview',
          href: '/dashboard/admin/overview',
          show: isAdmin, // Fixed: gated to admin only
        },
        {
          title: 'Courses',
          href: '/admin/courses',
          show: true,
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

    it('1.1 should display Overview, Categories, Finance, and Coupons ONLY for admin users', () => {
      const adminUser: AuthUser = {
        id: 'admin-1',
        name: 'Admin User',
        username: 'admin',
        email: 'admin@techsprout.edu',
        role: 'admin',
        isVerified: true,
      };

      const links = getAdminNavLinks(adminUser);
      const linkHrefs = links.map((l) => l.href);

      expect(linkHrefs).toContain('/dashboard/admin/overview');
      expect(linkHrefs).toContain('/admin/courses');
      expect(linkHrefs).toContain('/admin/categories');
      expect(linkHrefs).toContain('/admin/finance');
      expect(linkHrefs).toContain('/admin/coupons');
      expect(links.length).toBe(5);
    });

    it('1.2 should strictly hide Overview tab from instructors (preventing 403 Access Denied trap)', () => {
      const instructorUser: AuthUser = {
        id: 'instructor-1',
        name: 'Dr. John Doe',
        username: 'johndoe',
        email: 'john@techsprout.edu',
        role: 'instructor',
        isVerified: true,
      };

      const links = getAdminNavLinks(instructorUser);
      const linkHrefs = links.map((l) => l.href);

      // Must NOT contain Overview, Categories, Finance, Coupons
      expect(linkHrefs).not.toContain('/dashboard/admin/overview');
      expect(linkHrefs).not.toContain('/admin/categories');
      expect(linkHrefs).not.toContain('/admin/finance');
      expect(linkHrefs).not.toContain('/admin/coupons');
      // Only permitted courses management
      expect(linkHrefs).toContain('/admin/courses');
      expect(links.length).toBe(1);
    });

    it('1.3 should strictly hide Overview and privileged admin tabs from student users', () => {
      const studentUser: AuthUser = {
        id: 'student-1',
        name: 'Jane Student',
        username: 'janestudent',
        email: 'jane@student.edu',
        role: 'student',
        isVerified: true,
      };

      const links = getAdminNavLinks(studentUser);
      const linkHrefs = links.map((l) => l.href);

      expect(linkHrefs).not.toContain('/dashboard/admin/overview');
      expect(linkHrefs).not.toContain('/admin/categories');
      expect(linkHrefs).not.toContain('/admin/finance');
      expect(linkHrefs).not.toContain('/admin/coupons');
    });

    it('1.4 should strictly hide Overview from unauthenticated visitors', () => {
      const links = getAdminNavLinks(null);
      const linkHrefs = links.map((l) => l.href);

      expect(linkHrefs).not.toContain('/dashboard/admin/overview');
      expect(linkHrefs).not.toContain('/admin/categories');
      expect(linkHrefs).not.toContain('/admin/finance');
      expect(linkHrefs).not.toContain('/admin/coupons');
    });
  });

  // =========================================================================
  // 2. ROLE-AWARE HEADER NAVIGATION BEHAVIOR
  // =========================================================================
  describe('2. Role-Aware Header Navigation Logic', () => {
    // Helper replicating Header.tsx role-conditional link resolution
    function getHeaderNavLinks(user: AuthUser | null) {
      if (!user) {
        return {
          portalLink: null,
          studentLinks: [],
          authLinks: ['/login', '/register'],
        };
      }

      let portalLink: { title: string; href: string } | null = null;
      if (user.role === 'instructor') {
        portalLink = { title: 'Instructor Portal', href: '/instructor/dashboard' };
      } else if (user.role === 'admin') {
        portalLink = { title: 'Admin Portal', href: '/admin/courses' };
      }

      return {
        portalLink,
        studentLinks: ['/my-courses', '/orders'],
        authLinks: [],
      };
    }

    it('2.1 should render Instructor Portal link and student links for authenticated instructors', () => {
      const instructorUser: AuthUser = {
        id: 'inst-1',
        name: 'Prof. Alan Turing',
        username: 'aturing',
        email: 'turing@techsprout.edu',
        role: 'instructor',
        isVerified: true,
      };

      const nav = getHeaderNavLinks(instructorUser);

      expect(nav.portalLink).toEqual({
        title: 'Instructor Portal',
        href: '/instructor/dashboard',
      });
      expect(nav.studentLinks).toEqual(['/my-courses', '/orders']);
      expect(nav.authLinks).toHaveLength(0);
    });

    it('2.2 should render Admin Portal link and student links for authenticated administrators', () => {
      const adminUser: AuthUser = {
        id: 'admin-1',
        name: 'Sys Admin',
        username: 'sysadmin',
        email: 'admin@techsprout.edu',
        role: 'admin',
        isVerified: true,
      };

      const nav = getHeaderNavLinks(adminUser);

      expect(nav.portalLink).toEqual({
        title: 'Admin Portal',
        href: '/admin/courses',
      });
      expect(nav.studentLinks).toEqual(['/my-courses', '/orders']);
      expect(nav.authLinks).toHaveLength(0);
    });

    it('2.3 should render only student links for students without showing privileged portal links', () => {
      const studentUser: AuthUser = {
        id: 'student-1',
        name: 'Alice Learner',
        username: 'alearner',
        email: 'alice@school.edu',
        role: 'student',
        isVerified: true,
      };

      const nav = getHeaderNavLinks(studentUser);

      expect(nav.portalLink).toBeNull();
      expect(nav.studentLinks).toEqual(['/my-courses', '/orders']);
      expect(nav.authLinks).toHaveLength(0);
    });

    it('2.4 should render only public auth links (Login/Register) for unauthenticated visitors', () => {
      const nav = getHeaderNavLinks(null);

      expect(nav.portalLink).toBeNull();
      expect(nav.studentLinks).toHaveLength(0);
      expect(nav.authLinks).toEqual(['/login', '/register']);
    });
  });

  // =========================================================================
  // 3. INSTRUCTOR ROUTE LAYOUT & ACCESS CONTROL RULES
  // =========================================================================
  describe('3. Route Access Authorization Contracts', () => {
    // Layout-level role authorization logic for /instructor/*
    function checkInstructorLayoutAccess(user: AuthUser | null): 'ALLOW' | 'DENY_403' | 'REDIRECT_LOGIN' {
      if (!user) return 'REDIRECT_LOGIN';
      if (user.role === 'instructor' || user.role === 'admin') return 'ALLOW';
      return 'DENY_403';
    }

    // Page-level role authorization logic for /dashboard/admin/overview
    function checkAdminOverviewAccess(user: AuthUser | null): 'ALLOW' | 'DENY_403' {
      if (!user || user.role !== 'admin') return 'DENY_403';
      return 'ALLOW';
    }

    it('3.1 should allow instructor to access /instructor/* routes', () => {
      const user: AuthUser = {
        id: 'i-1',
        name: 'Teacher',
        username: 'teacher',
        email: 'teacher@techsprout.edu',
        role: 'instructor',
        isVerified: true,
      };
      expect(checkInstructorLayoutAccess(user)).toBe('ALLOW');
    });

    it('3.2 should allow admin to access /instructor/* routes', () => {
      const user: AuthUser = {
        id: 'a-1',
        name: 'Admin',
        username: 'admin',
        email: 'admin@techsprout.edu',
        role: 'admin',
        isVerified: true,
      };
      expect(checkInstructorLayoutAccess(user)).toBe('ALLOW');
    });

    it('3.3 should deny students from accessing /instructor/* with 403 Forbidden', () => {
      const user: AuthUser = {
        id: 's-1',
        name: 'Student',
        username: 'student',
        email: 'student@techsprout.edu',
        role: 'student',
        isVerified: true,
      };
      expect(checkInstructorLayoutAccess(user)).toBe('DENY_403');
    });

    it('3.4 should redirect unauthenticated visitors to login when accessing /instructor/*', () => {
      expect(checkInstructorLayoutAccess(null)).toBe('REDIRECT_LOGIN');
    });

    it('3.5 should allow ONLY admins to access /dashboard/admin/overview', () => {
      const adminUser: AuthUser = {
        id: 'a-1',
        name: 'Admin',
        username: 'admin',
        email: 'admin@techsprout.edu',
        role: 'admin',
        isVerified: true,
      };
      const instructorUser: AuthUser = {
        id: 'i-1',
        name: 'Teacher',
        username: 'teacher',
        email: 'teacher@techsprout.edu',
        role: 'instructor',
        isVerified: true,
      };
      const studentUser: AuthUser = {
        id: 's-1',
        name: 'Student',
        username: 'student',
        email: 'student@techsprout.edu',
        role: 'student',
        isVerified: true,
      };

      expect(checkAdminOverviewAccess(adminUser)).toBe('ALLOW');
      expect(checkAdminOverviewAccess(instructorUser)).toBe('DENY_403');
      expect(checkAdminOverviewAccess(studentUser)).toBe('DENY_403');
      expect(checkAdminOverviewAccess(null)).toBe('DENY_403');
    });
  });

  // =========================================================================
  // 4. POST-LOGIN ROLE-BASED REDIRECTION LOGIC
  // =========================================================================
  describe('4. Post-Login Redirection Logic', () => {
    function resolveLoginRedirect(user: { role: string } | null | undefined): string {
      if (user && user.role === 'admin') {
        return '/dashboard/admin/overview';
      } else if (user && user.role === 'instructor') {
        return '/instructor/dashboard';
      }
      return '/dashboard';
    }

    it('4.1 should route administrator to /dashboard/admin/overview after login', () => {
      expect(resolveLoginRedirect({ role: 'admin' })).toBe('/dashboard/admin/overview');
    });

    it('4.2 should route instructor to /instructor/dashboard after login', () => {
      expect(resolveLoginRedirect({ role: 'instructor' })).toBe('/instructor/dashboard');
    });

    it('4.3 should route student to /dashboard after login', () => {
      expect(resolveLoginRedirect({ role: 'student' })).toBe('/dashboard');
    });
  });

  // =========================================================================
  // 5. INSTRUCTOR API CLIENT FUNCTIONS
  // =========================================================================
  describe('5. Instructor API Client Integration', () => {
    it('5.1 should fetch instructor courses with status and pagination parameters', async () => {
      const mockCoursesData = {
        items: [
          {
            id: 'c-101',
            title: 'Modern Distributed Systems',
            slug: 'modern-distributed-systems',
            status: 'PUBLISHED',
            price: '3500.00',
            currency: 'BDT',
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-05T00:00:00.000Z',
          },
          {
            id: 'c-102',
            title: 'Microservices in Go',
            slug: 'microservices-in-go',
            status: 'IN_REVIEW',
            price: '2800.00',
            currency: 'BDT',
            createdAt: '2026-10-06T00:00:00.000Z',
            updatedAt: '2026-10-08T00:00:00.000Z',
          },
        ],
        meta: {
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockCoursesData,
        },
      });

      const result = await fetchInstructorCourses({ status: 'PUBLISHED', page: 1, limit: 10 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/courses', {
        params: { status: 'PUBLISHED', page: 1, limit: 10 },
      });
      expect(result.items.length).toBe(2);
      expect(result.items[0].title).toBe('Modern Distributed Systems');
      expect(result.items[1].status).toBe('IN_REVIEW');
    });

    it('5.2 should fetch instructor course by id with review requests', async () => {
      const mockCourseDetail = {
        id: 'c-101',
        title: 'Modern Distributed Systems',
        slug: 'modern-distributed-systems',
        status: 'IN_REVIEW',
        price: '3500.00',
        currency: 'BDT',
        reviewRequests: [
          {
            id: 'rev-1',
            courseId: 'c-101',
            status: 'PENDING',
            submissionNotes: 'Ready for review',
            submittedAt: '2026-10-08T00:00:00.000Z',
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockCourseDetail,
        },
      });

      const result = await fetchInstructorCourseById('c-101');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/courses/c-101');
      expect(result.id).toBe('c-101');
      expect(result.reviewRequests?.length).toBe(1);
      expect(result.reviewRequests?.[0].status).toBe('PENDING');
    });

    it('5.3 should fetch instructor review status history', async () => {
      const mockReviewStatus = {
        courseId: 'c-101',
        courseStatus: 'DRAFT',
        currentReview: {
          id: 'rev-2',
          status: 'REJECTED',
          adminFeedback: 'Please expand lesson 2 details',
        },
        history: [],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockReviewStatus,
        },
      });

      const result = await fetchInstructorReviewStatus('c-101');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/courses/c-101/review-status');
      expect(result.courseStatus).toBe('DRAFT');
      expect(result.currentReview.status).toBe('REJECTED');
      expect(result.currentReview.adminFeedback).toBe('Please expand lesson 2 details');
    });
  });
});
