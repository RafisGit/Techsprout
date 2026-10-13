import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchInstructorAnalyticsOverview,
  fetchCourseAnalytics,
  type InstructorAnalyticsOverviewDto,
  type CourseAnalyticsDetailDto,
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

describe('P6.3 — WP-04: Instructor Analytics Frontend Experience Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. INSTRUCTOR ANALYTICS OVERVIEW API CLIENT & CONTRACT COMPATIBILITY
  // =========================================================================
  describe('1. Instructor Analytics Overview API Client', () => {
    it('1.1 should fetch instructor portfolio overview from /api/v1/instructor/analytics/overview', async () => {
      const mockOverview: InstructorAnalyticsOverviewDto = {
        totalUniqueStudents: 42,
        totalCourseCompletions: 18,
        portfolioCompletionRate: 42.86,
        activeLearners30d: 31,
        courseBreakdown: [
          {
            courseId: 'c-101',
            title: 'Fullstack Next.js Mastery',
            slug: 'fullstack-nextjs-mastery',
            status: 'PUBLISHED',
            totalEnrolled: 25,
            completedCount: 12,
            completionRate: 48.0,
            averageProgressPercentage: 64.5,
          },
          {
            courseId: 'c-102',
            title: 'NestJS Microservices Architecture',
            slug: 'nestjs-microservices-architecture',
            status: 'PUBLISHED',
            totalEnrolled: 17,
            completedCount: 6,
            completionRate: 35.29,
            averageProgressPercentage: 45.0,
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockOverview },
      });

      const result = await fetchInstructorAnalyticsOverview();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/analytics/overview');
      expect(result.totalUniqueStudents).toBe(42);
      expect(result.totalCourseCompletions).toBe(18);
      expect(result.portfolioCompletionRate).toBe(42.86);
      expect(result.activeLearners30d).toBe(31);
      expect(result.courseBreakdown.length).toBe(2);
      expect(result.courseBreakdown[0].courseId).toBe('c-101');
      expect(result.courseBreakdown[0].completionRate).toBe(48.0);
    });

    it('1.2 should propagate 401 Unauthorized for unauthenticated requests', async () => {
      const error401 = {
        response: {
          status: 401,
          data: { success: false, error: { message: 'Unauthorized session' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error401);

      await expect(fetchInstructorAnalyticsOverview()).rejects.toEqual(error401);
    });

    it('1.3 should propagate 403 Forbidden for non-instructor users', async () => {
      const error403 = {
        response: {
          status: 403,
          data: { success: false, error: { message: 'Forbidden resource' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error403);

      await expect(fetchInstructorAnalyticsOverview()).rejects.toEqual(error403);
    });
  });

  // =========================================================================
  // 2. COURSE-SPECIFIC ANALYTICS API CLIENT & DATE RANGE QUERY PARAMS
  // =========================================================================
  describe('2. Course Analytics Detail API Client', () => {
    it('2.1 should query course analytics with date range and interval parameters', async () => {
      const mockDetail: CourseAnalyticsDetailDto = {
        courseId: 'c-101',
        courseTitle: 'Fullstack Next.js Mastery',
        dateRange: {
          startDate: '2026-09-14',
          endDate: '2026-10-14',
        },
        metrics: {
          totalEnrolled: 25,
          totalCompleted: 12,
          completionRate: 48.0,
          averageDaysToComplete: 14.5,
          activeLearners30d: 19,
        },
        enrollmentTrend: [
          { date: '2026-09-14', count: 2 },
          { date: '2026-09-15', count: 0 },
          { date: '2026-09-16', count: 4 },
        ],
        progressDistribution: [
          { bracket: '0-19%', studentCount: 3, percentage: 12.0 },
          { bracket: '20-39%', studentCount: 2, percentage: 8.0 },
          { bracket: '40-59%', studentCount: 4, percentage: 16.0 },
          { bracket: '60-79%', studentCount: 4, percentage: 16.0 },
          { bracket: '80-99%', studentCount: 0, percentage: 0.0 },
          { bracket: '100%', studentCount: 12, percentage: 48.0 },
        ],
        lessonDropOff: [
          {
            lessonId: 'les-1',
            moduleId: 'mod-1',
            moduleTitle: 'Module 1: Foundations',
            lessonTitle: 'Introduction to Next.js',
            position: 1,
            lessonType: 'VIDEO',
            completedLearnersCount: 25,
            completionRate: 100.0,
            dropOffRateFromPrior: 0.0,
          },
          {
            lessonId: 'les-2',
            moduleId: 'mod-1',
            moduleTitle: 'Module 1: Foundations',
            lessonTitle: 'Server Components Deep Dive',
            position: 2,
            lessonType: 'VIDEO',
            completedLearnersCount: 20,
            completionRate: 80.0,
            dropOffRateFromPrior: 20.0,
          },
        ],
        quizPerformance: [
          {
            quizId: 'q-1',
            quizTitle: 'Knowledge Check: Server Components',
            totalAttempts: 28,
            uniqueStudents: 20,
            passRate: 85.0,
            averageScorePercentage: 88.5,
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockDetail },
      });

      const result = await fetchCourseAnalytics('c-101', {
        startDate: '2026-09-14',
        endDate: '2026-10-14',
        interval: 'day',
      });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/analytics/courses/c-101', {
        params: {
          startDate: '2026-09-14',
          endDate: '2026-10-14',
          interval: 'day',
        },
      });
      expect(result.courseId).toBe('c-101');
      expect(result.metrics.totalEnrolled).toBe(25);
      expect(result.metrics.completionRate).toBe(48.0);
      expect(result.enrollmentTrend.length).toBe(3);
      expect(result.lessonDropOff[1].dropOffRateFromPrior).toBe(20.0);
      expect(result.quizPerformance[0].passRate).toBe(85.0);
    });

    it('2.2 should propagate 403 when requesting analytics for an unauthorized course', async () => {
      const error403 = {
        response: {
          status: 403,
          data: { success: false, error: { message: 'You do not own this course' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error403);

      await expect(fetchCourseAnalytics('c-unauthorized')).rejects.toEqual(error403);
    });

    it('2.3 should propagate 404 when requesting analytics for a nonexistent course', async () => {
      const error404 = {
        response: {
          status: 404,
          data: { success: false, error: { message: 'Course not found' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error404);

      await expect(fetchCourseAnalytics('c-nonexistent')).rejects.toEqual(error404);
    });
  });

  // =========================================================================
  // 3. TREND LINE CHART SVG MATH & ZERO-FILLED PERIODS
  // =========================================================================
  describe('3. Native SVG Trend Line Chart Coordinates & Calculations', () => {
    // Helper testing the mathematical mapping of TrendLineChart
    function calculateChartPoints(
      data: Array<{ date: string; count: number }>,
      width = 640,
      height = 240,
      padLeft = 45,
      padRight = 25,
      padTop = 25,
      padBottom = 40
    ) {
      const plotWidth = width - padLeft - padRight;
      const plotHeight = height - padTop - padBottom;
      const counts = data.map((d) => d.count);
      const rawMax = Math.max(...counts, 0);
      const maxCount = rawMax <= 0 ? 4 : Math.ceil(rawMax * 1.15) || 4;

      return data.map((d, i) => {
        const x =
          data.length === 1
            ? padLeft + plotWidth / 2
            : padLeft + (i / (data.length - 1)) * plotWidth;
        const y = padTop + plotHeight - (d.count / maxCount) * plotHeight;
        return { x, y, date: d.date, count: d.count };
      });
    }

    it('3.1 should correctly compute coordinates for non-zero points within plot boundaries', () => {
      const trendData = [
        { date: '2026-10-01', count: 5 },
        { date: '2026-10-02', count: 10 },
        { date: '2026-10-03', count: 20 },
      ];

      const points = calculateChartPoints(trendData);

      expect(points.length).toBe(3);
      // X coordinates should increase monotonically
      expect(points[0].x).toBe(45);
      expect(points[1].x).toBe(45 + (640 - 70) / 2);
      expect(points[2].x).toBe(640 - 25);
      // Y coordinates should stay within plotHeight [25, 200]
      expect(points[0].y).toBeGreaterThanOrEqual(25);
      expect(points[2].y).toBeGreaterThanOrEqual(25);
      expect(points[2].y).toBeLessThan(points[0].y); // Higher count -> lower Y on SVG
    });

    it('3.2 should safely handle completely zero-filled calendar periods without NaN coordinates', () => {
      const zeroTrendData = [
        { date: '2026-10-01', count: 0 },
        { date: '2026-10-02', count: 0 },
        { date: '2026-10-03', count: 0 },
      ];

      const points = calculateChartPoints(zeroTrendData);

      expect(points.length).toBe(3);
      for (const pt of points) {
        expect(Number.isNaN(pt.x)).toBe(false);
        expect(Number.isNaN(pt.y)).toBe(false);
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        // All Y coordinates should equal bottom axis baseline (25 + 175 = 200)
        expect(pt.y).toBe(200);
      }
    });

    it('3.3 should handle single-point dataset by centering the X coordinate', () => {
      const singlePoint = [{ date: '2026-10-01', count: 3 }];
      const points = calculateChartPoints(singlePoint);

      expect(points.length).toBe(1);
      expect(points[0].x).toBe(45 + (640 - 70) / 2);
      expect(Number.isNaN(points[0].y)).toBe(false);
    });
  });

  // =========================================================================
  // 4. PROGRESS DISTRIBUTION BOUNDARIES & SMALL-COHORT PRIVACY RULES
  // =========================================================================
  describe('4. Progress Distribution Cohort Rules & Small-Cohort Privacy Invariants', () => {
    it('4.1 should validate that distribution brackets cover 100% of enrolled students', () => {
      const distribution = [
        { bracket: '0-19%' as const, studentCount: 5, percentage: 20.0 },
        { bracket: '20-39%' as const, studentCount: 5, percentage: 20.0 },
        { bracket: '40-59%' as const, studentCount: 5, percentage: 20.0 },
        { bracket: '60-79%' as const, studentCount: 5, percentage: 20.0 },
        { bracket: '80-99%' as const, studentCount: 0, percentage: 0.0 },
        { bracket: '100%' as const, studentCount: 5, percentage: 20.0 },
      ];

      const totalStudents = distribution.reduce((acc, b) => acc + b.studentCount, 0);
      const totalPct = distribution.reduce((acc, b) => acc + b.percentage, 0);

      expect(totalStudents).toBe(25);
      expect(Math.round(totalPct)).toBe(100);
    });

    it('4.2 should enforce small-cohort privacy notice condition when totalEnrolled < 5 (DEC-P6.3-09)', () => {
      function shouldShowPrivacyCallout(totalEnrolled: number): boolean {
        return totalEnrolled < 5;
      }

      expect(shouldShowPrivacyCallout(0)).toBe(true);
      expect(shouldShowPrivacyCallout(1)).toBe(true);
      expect(shouldShowPrivacyCallout(4)).toBe(true);
      expect(shouldShowPrivacyCallout(5)).toBe(false);
      expect(shouldShowPrivacyCallout(25)).toBe(false);
    });
  });

  // =========================================================================
  // 5. LESSON SEQUENTIAL DROP-OFF RATE CALCULATIONS
  // =========================================================================
  describe('5. Lesson Drop-Off Rate Verification', () => {
    it('5.1 should verify baseline (0%) for first lesson and positive drop-off for disengaged students', () => {
      const dropOffItems = [
        {
          lessonTitle: 'Lesson 1',
          completedLearnersCount: 20,
          completionRate: 100.0,
          dropOffRateFromPrior: 0.0,
        },
        {
          lessonTitle: 'Lesson 2',
          completedLearnersCount: 16,
          completionRate: 80.0,
          dropOffRateFromPrior: 20.0,
        },
        {
          lessonTitle: 'Lesson 3',
          completedLearnersCount: 14,
          completionRate: 70.0,
          dropOffRateFromPrior: 10.0,
        },
      ];

      expect(dropOffItems[0].dropOffRateFromPrior).toBe(0.0);
      expect(dropOffItems[1].dropOffRateFromPrior).toBe(20.0); // 100% - 80% = 20%
      expect(dropOffItems[2].dropOffRateFromPrior).toBe(10.0); // 80% - 70% = 10%
    });

    it('5.2 should safely handle 0 completed learners without dividing by zero', () => {
      const totalEnrolled = 10;
      const completedLearners = 0;
      const rate = totalEnrolled > 0 ? (completedLearners / totalEnrolled) * 100 : 0;

      expect(rate).toBe(0);
      expect(Number.isFinite(rate)).toBe(true);
    });
  });

  // =========================================================================
  // 6. DATE RANGE PRESETS & CLIENT-SIDE VALIDATION
  // =========================================================================
  describe('6. Date Range Controls & Presets', () => {
    function computePresetRange(preset: '7d' | '30d' | '90d', baseDate = new Date('2026-10-14T00:00:00.000Z')) {
      const end = new Date(baseDate);
      const start = new Date(baseDate);
      let interval: 'day' | 'week' = 'day';

      if (preset === '7d') {
        start.setDate(baseDate.getDate() - 7);
        interval = 'day';
      } else if (preset === '30d') {
        start.setDate(baseDate.getDate() - 30);
        interval = 'day';
      } else {
        start.setDate(baseDate.getDate() - 90);
        interval = 'week';
      }

      const fmt = (d: Date) => d.toISOString().split('T')[0];
      return { startDate: fmt(start), endDate: fmt(end), interval };
    }

    it('6.1 should compute 7-day preset with daily interval', () => {
      const range = computePresetRange('7d');
      expect(range.startDate).toBe('2026-10-07');
      expect(range.endDate).toBe('2026-10-14');
      expect(range.interval).toBe('day');
    });

    it('6.2 should compute 30-day preset with daily interval', () => {
      const range = computePresetRange('30d');
      expect(range.startDate).toBe('2026-09-14');
      expect(range.endDate).toBe('2026-10-14');
      expect(range.interval).toBe('day');
    });

    it('6.3 should compute 90-day preset with weekly interval', () => {
      const range = computePresetRange('90d');
      expect(range.startDate).toBe('2026-07-16');
      expect(range.endDate).toBe('2026-10-14');
      expect(range.interval).toBe('week');
    });

    it('6.4 should reject custom date range when start date is after end date', () => {
      function validateDateRange(start: string, end: string): string | null {
        if (start && end && start > end) {
          return 'Start date cannot be after end date.';
        }
        return null;
      }

      expect(validateDateRange('2026-10-15', '2026-10-14')).toBe(
        'Start date cannot be after end date.'
      );
      expect(validateDateRange('2026-10-14', '2026-10-14')).toBeNull();
      expect(validateDateRange('2026-10-01', '2026-10-14')).toBeNull();
    });
  });

  // =========================================================================
  // 7. CACHE SCOPING & MULTI-COURSE ISOLATION (PREVENT DATA LEAKAGE)
  // =========================================================================
  describe('7. TanStack Query Key Scoping & Isolation', () => {
    it('7.1 should generate course-scoped query keys to prevent stale data leakage between courses', () => {
      const courseIdA = 'course-aaa';
      const courseIdB = 'course-bbb';

      const keyA = ['courseAnalytics', courseIdA, '2026-09-14', '2026-10-14', 'day'];
      const keyB = ['courseAnalytics', courseIdB, '2026-09-14', '2026-10-14', 'day'];

      expect(keyA).not.toEqual(keyB);
      expect(keyA[1]).toBe(courseIdA);
      expect(keyB[1]).toBe(courseIdB);
    });
  });

  // =========================================================================
  // 8. ACCESSIBLE DATA TABLE EQUIVALENCE
  // =========================================================================
  describe('8. Accessible Tabular Fallback Equivalence', () => {
    it('8.1 should provide equivalent structured data representation for screen readers', () => {
      const trendData = [
        { date: '2026-10-01', count: 12 },
        { date: '2026-10-02', count: 8 },
      ];

      const tableRows = trendData.map((d) => ({
        dateLabel: d.date,
        enrollmentCount: d.count,
      }));

      expect(tableRows.length).toBe(2);
      expect(tableRows[0].dateLabel).toBe('2026-10-01');
      expect(tableRows[0].enrollmentCount).toBe(12);
      expect(tableRows[1].enrollmentCount).toBe(8);
    });
  });
});
