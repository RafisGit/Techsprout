import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchCourseEnrollments,
  type CourseEnrollmentItem,
} from '@/lib/api/instructor';
import {
  escapeCsvField,
  serializeRosterToCsv,
  generateRosterCsvFilename,
} from '@/lib/roster-csv';
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

describe('P6.2 — WP-05: Learner Roster & Progress Tracking Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. API CLIENT & ENROLLMENT ROSTER DATA-FETCHING
  // =========================================================================
  describe('1. Course Enrollments Roster API Client', () => {
    it('1.1 should fetch course enrollments with correct route and default query parameters', async () => {
      const mockResponse = {
        success: true,
        data: {
          courseId: 'c-101',
          totalEnrolled: 2,
          completedCount: 1,
          items: [
            {
              enrollmentId: 'enr-1',
              student: {
                id: 'std-1',
                name: 'Alice Johnson',
                email: 'alice@example.com',
              },
              status: 'ACTIVE',
              enrolledAt: '2026-10-01T10:00:00.000Z',
              completedAt: null,
              lastAccessedAt: '2026-10-09T12:00:00.000Z',
              progressPercentage: 65,
            },
            {
              enrollmentId: 'enr-2',
              student: {
                id: 'std-2',
                name: 'Bob Smith',
                email: 'bob@example.com',
              },
              status: 'COMPLETED',
              enrolledAt: '2026-09-15T08:00:00.000Z',
              completedAt: '2026-10-05T14:30:00.000Z',
              lastAccessedAt: '2026-10-05T14:30:00.000Z',
              progressPercentage: 100,
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
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: mockResponse });

      const result = await fetchCourseEnrollments('c-101', { page: 1, limit: 10 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/courses/c-101/enrollments', {
        params: { page: 1, limit: 10 },
      });
      expect(result.courseId).toBe('c-101');
      expect(result.totalEnrolled).toBe(2);
      expect(result.completedCount).toBe(1);
      expect(result.items.length).toBe(2);
      expect(result.items[0].student.name).toBe('Alice Johnson');
      expect(result.items[0].progressPercentage).toBe(65);
    });

    it('1.2 should forward status filter parameter to API', async () => {
      const mockFilteredResponse = {
        success: true,
        data: {
          courseId: 'c-101',
          totalEnrolled: 1,
          completedCount: 1,
          items: [
            {
              enrollmentId: 'enr-2',
              student: { id: 'std-2', name: 'Bob Smith', email: 'bob@example.com' },
              status: 'COMPLETED',
              enrolledAt: '2026-09-15T08:00:00.000Z',
              completedAt: '2026-10-05T14:30:00.000Z',
              lastAccessedAt: null,
              progressPercentage: 100,
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
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({ data: mockFilteredResponse });

      const result = await fetchCourseEnrollments('c-101', {
        status: 'COMPLETED',
        page: 1,
        limit: 10,
      });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/courses/c-101/enrollments', {
        params: { status: 'COMPLETED', page: 1, limit: 10 },
      });
      expect(result.items[0].status).toBe('COMPLETED');
    });

    it('1.3 should propagate 403 Forbidden when instructor does not own the course', async () => {
      const error403 = {
        response: {
          status: 403,
          data: {
            success: false,
            message: 'Access denied: you do not own this course',
            errorCode: 'NOT_COURSE_OWNER',
          },
        },
      };

      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error403);

      await expect(fetchCourseEnrollments('c-unowned')).rejects.toEqual(error403);
    });
  });

  // =========================================================================
  // 2. RFC-4180 CSV SERIALIZER & SAFETY INVARIANTS
  // =========================================================================
  describe('2. RFC-4180 CSV Serializer & Formula Injection Protection', () => {
    it('2.1 should escape simple strings without wrapping unless needed', () => {
      expect(escapeCsvField('John Doe')).toBe('John Doe');
      expect(escapeCsvField(100)).toBe('100');
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('2.2 should wrap fields with commas in double quotes', () => {
      expect(escapeCsvField('Doe, Jane')).toBe('"Doe, Jane"');
    });

    it('2.3 should double internal double-quotes according to RFC-4180 Section 2.7', () => {
      expect(escapeCsvField('John "The Developer" Doe')).toBe('"John ""The Developer"" Doe"');
    });

    it('2.4 should wrap fields containing newlines or carriage returns', () => {
      expect(escapeCsvField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      expect(escapeCsvField('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"');
    });

    it('2.5 should neutralize spreadsheet formula injection (=, +, -, @, \\t, \\r)', () => {
      // Formula starting with =
      const eqResult = escapeCsvField('=SUM(1+2)');
      expect(eqResult).toBe("\"'=SUM(1+2)\"");

      // Formula starting with +
      const plusResult = escapeCsvField('+cmd|calc');
      expect(plusResult).toBe("\"'+cmd|calc\"");

      // Formula starting with -
      const minusResult = escapeCsvField('-1+1');
      expect(minusResult).toBe("\"'-1+1\"");

      // Formula starting with @
      const atResult = escapeCsvField('@echo off');
      expect(atResult).toBe("\"'@echo off\"");

      // Formula starting with tab
      const tabResult = escapeCsvField('\tcmd');
      expect(tabResult).toBe("\"'\tcmd\"");
    });

    it('2.6 should serialize complete roster array with UTF-8 BOM and correct headers', () => {
      const mockItems: CourseEnrollmentItem[] = [
        {
          enrollmentId: 'e-1',
          student: {
            id: 's-1',
            name: 'রফিকুল ইসলাম',
            email: 'rafiq@example.com',
          },
          status: 'ACTIVE',
          enrolledAt: '2026-10-01T00:00:00.000Z',
          completedAt: null,
          lastAccessedAt: null,
          progressPercentage: 45,
        },
        {
          enrollmentId: 'e-2',
          student: {
            id: 's-2',
            name: 'Smith, Jane "Dr."',
            email: 'jane.smith@example.com',
          },
          status: 'COMPLETED',
          enrolledAt: '2026-09-01T00:00:00.000Z',
          completedAt: '2026-10-08T00:00:00.000Z',
          lastAccessedAt: null,
          progressPercentage: 100,
        },
      ];

      const csv = serializeRosterToCsv(mockItems);

      // Verify UTF-8 BOM prefix
      expect(csv.startsWith('\uFEFF')).toBe(true);

      // Verify header row
      expect(csv).toContain(
        'Student Name,Email,Enrollment Status,Enrolled Date,Completion Date,Progress Percentage'
      );

      // Verify Unicode name preservation
      expect(csv).toContain('রফিকুল ইসলাম,rafiq@example.com,ACTIVE');

      // Verify quoted name with comma and doubled quotes
      expect(csv).toContain('"Smith, Jane ""Dr."""');

      // Verify progress formatting
      expect(csv).toContain('45%');
      expect(csv).toContain('100%');
    });

    it('2.7 should generate clean, standardized export filenames', () => {
      const fixedDate = new Date('2026-10-10T12:00:00.000Z');
      const filename = generateRosterCsvFilename('modern-web-development', fixedDate);

      expect(filename).toBe('techsprout-roster-modern-web-development-2026-10-10.csv');
    });

    it('2.8 should sanitize special characters in course slug for export filenames', () => {
      const fixedDate = new Date('2026-10-10T12:00:00.000Z');
      const filename = generateRosterCsvFilename('Course @ # 101 / Advanced!', fixedDate);

      expect(filename).toBe('techsprout-roster-course-101-advanced-2026-10-10.csv');
    });
  });

  // =========================================================================
  // 3. ROSTER SUMMARY METRICS & PROGRESS ENGINE
  // =========================================================================
  describe('3. Roster Summary Metrics & Progress Engine', () => {
    function computeRosterMetrics(totalEnrolled: number, completedCount: number) {
      const activeCount = Math.max(totalEnrolled - completedCount, 0);
      const completionRate =
        totalEnrolled > 0 ? Math.round((completedCount / totalEnrolled) * 100) : 0;

      return {
        totalEnrolled,
        completedCount,
        activeCount,
        completionRate,
      };
    }

    it('3.1 should correctly compute active counts and completion percentages', () => {
      const metrics = computeRosterMetrics(50, 20);
      expect(metrics.totalEnrolled).toBe(50);
      expect(metrics.completedCount).toBe(20);
      expect(metrics.activeCount).toBe(30);
      expect(metrics.completionRate).toBe(40);
    });

    it('3.2 should return 0% completion rate when total enrolled is zero', () => {
      const metrics = computeRosterMetrics(0, 0);
      expect(metrics.totalEnrolled).toBe(0);
      expect(metrics.completedCount).toBe(0);
      expect(metrics.activeCount).toBe(0);
      expect(metrics.completionRate).toBe(0);
    });

    it('3.3 should handle 100% completion correctly', () => {
      const metrics = computeRosterMetrics(15, 15);
      expect(metrics.activeCount).toBe(0);
      expect(metrics.completionRate).toBe(100);
    });
  });

  // =========================================================================
  // 4. CLIENT-SIDE SEARCH & FILTERING LOGIC
  // =========================================================================
  describe('4. Client-side Search & Query Matching', () => {
    const mockItems: CourseEnrollmentItem[] = [
      {
        enrollmentId: '1',
        student: { id: 's1', name: 'Alice Freeman', email: 'alice@mit.edu' },
        status: 'ACTIVE',
        enrolledAt: '2026-10-01',
        completedAt: null,
        lastAccessedAt: null,
        progressPercentage: 20,
      },
      {
        enrollmentId: '2',
        student: { id: 's2', name: 'Bob Dylan', email: 'bob@columbia.edu' },
        status: 'ACTIVE',
        enrolledAt: '2026-10-02',
        completedAt: null,
        lastAccessedAt: null,
        progressPercentage: 40,
      },
      {
        enrollmentId: '3',
        student: { id: 's3', name: 'Charlie Chaplin', email: 'charlie@arts.org' },
        status: 'COMPLETED',
        enrolledAt: '2026-09-10',
        completedAt: '2026-10-05',
        lastAccessedAt: null,
        progressPercentage: 100,
      },
    ];

    function filterRoster(items: CourseEnrollmentItem[], query: string) {
      if (!query.trim()) return items;
      const q = query.toLowerCase().trim();
      return items.filter(
        (item) =>
          item.student.name.toLowerCase().includes(q) ||
          item.student.email.toLowerCase().includes(q)
      );
    }

    it('4.1 should return all items when query is empty or whitespace', () => {
      expect(filterRoster(mockItems, '').length).toBe(3);
      expect(filterRoster(mockItems, '   ').length).toBe(3);
    });

    it('4.2 should filter items by student name case-insensitively', () => {
      const result = filterRoster(mockItems, 'alice');
      expect(result.length).toBe(1);
      expect(result[0].student.name).toBe('Alice Freeman');
    });

    it('4.3 should filter items by student email case-insensitively', () => {
      const result = filterRoster(mockItems, 'columbia.edu');
      expect(result.length).toBe(1);
      expect(result[0].student.email).toBe('bob@columbia.edu');
    });

    it('4.4 should return empty array when no students match the query', () => {
      const result = filterRoster(mockItems, 'Nonexistent Name');
      expect(result.length).toBe(0);
    });
  });

  // =========================================================================
  // 5. ROLE & ACCESS ISOLATION CHECKS
  // =========================================================================
  describe('5. Role Authorization & Access Guard Rules', () => {
    function canAccessInstructorRoster(user: AuthUser | null): boolean {
      if (!user) return false;
      return user.role === 'instructor' || user.role === 'admin';
    }

    it('5.1 should permit access for users with instructor role', () => {
      const instructor: AuthUser = {
        id: 'inst-1',
        name: 'Dr. John',
        username: 'john',
        email: 'john@techsprout.edu',
        role: 'instructor',
        isVerified: true,
      };
      expect(canAccessInstructorRoster(instructor)).toBe(true);
    });

    it('5.2 should permit access for administrative superusers', () => {
      const admin: AuthUser = {
        id: 'admin-1',
        name: 'Super Admin',
        username: 'admin',
        email: 'admin@techsprout.edu',
        role: 'admin',
        isVerified: true,
      };
      expect(canAccessInstructorRoster(admin)).toBe(true);
    });

    it('5.3 should deny access for students', () => {
      const student: AuthUser = {
        id: 'std-1',
        name: 'Student User',
        username: 'student',
        email: 'student@techsprout.edu',
        role: 'student',
        isVerified: true,
      };
      expect(canAccessInstructorRoster(student)).toBe(false);
    });

    it('5.4 should deny access for unauthenticated guests', () => {
      expect(canAccessInstructorRoster(null)).toBe(false);
    });
  });
});
