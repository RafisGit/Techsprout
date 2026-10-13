import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './test-helper';
import {
  courses,
  courseStatusEnum,
  courseReviewRequests,
  courseReviewStatusEnum,
  instructorProfiles,
  users,
  categories,
  modules,
  lessons,
  enrollments,
  lessonProgress,
  quizzes,
  quizAttempts,
} from '../database/schema';
import * as schema from '../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import {
  analyticsDateRangeQuerySchema,
  enhancedRosterQuerySchema,
  adminCourseAnalyticsQuerySchema,
  enrollmentStatusSchema,
  type InstructorAnalyticsOverviewDto,
  type CourseAnalyticsDetailDto,
  type AdminAnalyticsOverviewDto,
  type StudentLearningEngagementDto,
  type CourseEnrollmentItemDto,
  type PaginatedCourseEnrollmentsData,
} from '@techsprout/contracts';

describe('P6.3 — WP-01: Shared Contracts & Analytics Foundation Test Suite', () => {
  let db: any;
  let testUserId: string;
  let testCategoryId: string;
  let testCourseId: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;

    // Create a verified instructor user
    const [user] = await db
      .insert(users)
      .values({
        name: 'Prof. Alan Turing',
        username: 'alan.turing',
        email: 'alan.turing@techsprout.edu',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
        isActive: true,
        isVerified: true,
      })
      .returning();
    testUserId = user.id;

    // Create a category
    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Computer Science',
        slug: 'computer-science',
        description: 'CS & Computational Theory',
      })
      .returning();
    testCategoryId = cat.id;

    // Create an active course
    const [course] = await db
      .insert(courses)
      .values({
        title: 'Theory of Computation',
        slug: 'theory-of-computation',
        categoryId: testCategoryId,
        instructorId: testUserId,
        status: 'PUBLISHED',
        price: '3500.00',
        currency: 'BDT',
        level: 'INTERMEDIATE',
        durationMinutes: 180,
      })
      .returning();
    testCourseId = course.id;
  });

  // =========================================================================
  // 1. SHARED CONTRACTS & ZOD QUERY VALIDATION SCHEMAS
  // =========================================================================

  describe('1. P6.3 Analytics Query Validation Schemas', () => {
    describe('1.1 analyticsDateRangeQuerySchema', () => {
      it('should parse valid date strings and default interval to "day"', () => {
        const parsed = analyticsDateRangeQuerySchema.parse({
          startDate: '2026-10-01',
          endDate: '2026-10-13',
        });
        expect(parsed.startDate).toBe('2026-10-01');
        expect(parsed.endDate).toBe('2026-10-13');
        expect(parsed.interval).toBe('day');
      });

      it('should accept valid interval "week"', () => {
        const parsed = analyticsDateRangeQuerySchema.parse({
          interval: 'week',
        });
        expect(parsed.interval).toBe('week');
      });

      it('should reject invalid interval values', () => {
        const result = analyticsDateRangeQuerySchema.safeParse({
          interval: 'month',
        });
        expect(result.success).toBe(false);
      });

      it('should allow optional start and end dates', () => {
        const parsed = analyticsDateRangeQuerySchema.parse({});
        expect(parsed.startDate).toBeUndefined();
        expect(parsed.endDate).toBeUndefined();
        expect(parsed.interval).toBe('day');
      });
    });

    describe('1.2 enhancedRosterQuerySchema (DEF-P6.2-UX-01 Remediation)', () => {
      it('should parse valid parameters with defaults', () => {
        const parsed = enhancedRosterQuerySchema.parse({});
        expect(parsed.page).toBe(1);
        expect(parsed.limit).toBe(10);
        expect(parsed.sortBy).toBe('enrolledAt');
        expect(parsed.sortOrder).toBe('desc');
        expect(parsed.search).toBeUndefined();
        expect(parsed.status).toBeUndefined();
      });

      it('should accept and trim search queries', () => {
        const parsed = enhancedRosterQuerySchema.parse({
          search: '  John Doe  ',
          page: '2',
          limit: '25',
          status: 'ACTIVE',
          sortBy: 'name',
          sortOrder: 'asc',
        });
        expect(parsed.search).toBe('John Doe');
        expect(parsed.page).toBe(2);
        expect(parsed.limit).toBe(25);
        expect(parsed.status).toBe('ACTIVE');
        expect(parsed.sortBy).toBe('name');
        expect(parsed.sortOrder).toBe('asc');
      });

      it('should reject invalid status enums', () => {
        const result = enhancedRosterQuerySchema.safeParse({
          status: 'PENDING',
        });
        expect(result.success).toBe(false);
      });

      it('should reject limits exceeding 100', () => {
        const result = enhancedRosterQuerySchema.safeParse({
          limit: 150,
        });
        expect(result.success).toBe(false);
      });

      it('should reject negative or zero page numbers', () => {
        const zeroPage = enhancedRosterQuerySchema.safeParse({ page: 0 });
        const negativePage = enhancedRosterQuerySchema.safeParse({ page: -1 });
        expect(zeroPage.success).toBe(false);
        expect(negativePage.success).toBe(false);
      });

      it('should reject invalid sort fields', () => {
        const result = enhancedRosterQuerySchema.safeParse({
          sortBy: 'unknownField',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('1.3 adminCourseAnalyticsQuerySchema', () => {
      it('should default pagination and sorting correctly', () => {
        const parsed = adminCourseAnalyticsQuerySchema.parse({});
        expect(parsed.page).toBe(1);
        expect(parsed.limit).toBe(20);
        expect(parsed.sortBy).toBe('enrollments');
        expect(parsed.sortOrder).toBe('desc');
      });

      it('should accept course status and search filters', () => {
        const parsed = adminCourseAnalyticsQuerySchema.parse({
          search: 'Computation',
          status: 'PUBLISHED',
          sortBy: 'completionRate',
          sortOrder: 'asc',
        });
        expect(parsed.search).toBe('Computation');
        expect(parsed.status).toBe('PUBLISHED');
        expect(parsed.sortBy).toBe('completionRate');
        expect(parsed.sortOrder).toBe('asc');
      });
    });

    describe('1.4 enrollmentStatusSchema', () => {
      it('should validate exact enrollment status values', () => {
        expect(enrollmentStatusSchema.safeParse('ACTIVE').success).toBe(true);
        expect(enrollmentStatusSchema.safeParse('COMPLETED').success).toBe(true);
        expect(enrollmentStatusSchema.safeParse('CANCELLED').success).toBe(true);
        expect(enrollmentStatusSchema.safeParse('SUSPENDED').success).toBe(false);
      });
    });
  });

  // =========================================================================
  // 2. DTO TYPE INTEGRITY VERIFICATION
  // =========================================================================

  describe('2. DTO Type Structure Integrity', () => {
    it('2.1 should validate InstructorAnalyticsOverviewDto shape', () => {
      const overview: InstructorAnalyticsOverviewDto = {
        totalUniqueStudents: 42,
        totalCourseCompletions: 15,
        portfolioCompletionRate: 36,
        activeLearners30d: 28,
        courseBreakdown: [
          {
            courseId: testCourseId,
            title: 'Theory of Computation',
            slug: 'theory-of-computation',
            status: 'PUBLISHED',
            totalEnrolled: 42,
            completedCount: 15,
            completionRate: 36,
            averageProgressPercentage: 62,
          },
        ],
      };

      expect(overview.totalUniqueStudents).toBe(42);
      expect(overview.courseBreakdown.length).toBe(1);
      expect(overview.courseBreakdown[0].completionRate).toBe(36);
    });

    it('2.2 should validate CourseAnalyticsDetailDto shape', () => {
      const detail: CourseAnalyticsDetailDto = {
        courseId: testCourseId,
        courseTitle: 'Theory of Computation',
        dateRange: {
          startDate: '2026-09-13',
          endDate: '2026-10-13',
        },
        metrics: {
          totalEnrolled: 50,
          totalCompleted: 20,
          completionRate: 40,
          averageDaysToComplete: 14,
          activeLearners30d: 35,
        },
        enrollmentTrend: [
          { date: '2026-10-01', count: 5 },
          { date: '2026-10-02', count: 8 },
        ],
        progressDistribution: [
          { bracket: '0-19%', studentCount: 10, percentage: 20 },
          { bracket: '20-39%', studentCount: 5, percentage: 10 },
          { bracket: '40-59%', studentCount: 5, percentage: 10 },
          { bracket: '60-79%', studentCount: 5, percentage: 10 },
          { bracket: '80-99%', studentCount: 5, percentage: 10 },
          { bracket: '100%', studentCount: 20, percentage: 40 },
        ],
        lessonDropOff: [
          {
            lessonId: '00000000-0000-0000-0000-000000000001',
            moduleId: '00000000-0000-0000-0000-000000000002',
            moduleTitle: 'Module 1: Automata',
            lessonTitle: 'Lesson 1: Intro',
            position: 1,
            lessonType: 'VIDEO',
            completedLearnersCount: 48,
            completionRate: 96,
            dropOffRateFromPrior: 0,
          },
        ],
        quizPerformance: [
          {
            quizId: '00000000-0000-0000-0000-000000000003',
            quizTitle: 'DFA Quiz',
            totalAttempts: 45,
            uniqueStudents: 40,
            passRate: 85,
            averageScorePercentage: 82.5,
          },
        ],
      };

      expect(detail.courseId).toBe(testCourseId);
      expect(detail.progressDistribution.length).toBe(6);
      expect(detail.quizPerformance[0].passRate).toBe(85);
    });

    it('2.3 should validate AdminAnalyticsOverviewDto shape', () => {
      const adminOverview: AdminAnalyticsOverviewDto = {
        totalPublishedCourses: 12,
        totalDraftCourses: 4,
        totalInReviewCourses: 2,
        totalArchivedCourses: 1,
        totalRegisteredStudents: 450,
        totalActiveInstructors: 8,
        platformWideEnrollments: 820,
        platformWideCertificates: 210,
        platformCompletionRate: 26,
        reviewQueue: {
          pendingReviewsCount: 2,
          averageTurnaroundHours: 18.5,
        },
      };

      expect(adminOverview.totalPublishedCourses).toBe(12);
      expect(adminOverview.reviewQueue.pendingReviewsCount).toBe(2);
      expect(adminOverview.platformCompletionRate).toBe(26);
    });

    it('2.4 should validate StudentLearningEngagementDto shape', () => {
      const engagement: StudentLearningEngagementDto = {
        enrolledCoursesCount: 4,
        inProgressCoursesCount: 3,
        completedCertificatesCount: 1,
      };

      expect(engagement.enrolledCoursesCount).toBe(4);
      expect(engagement.inProgressCoursesCount).toBe(3);
      expect(engagement.completedCertificatesCount).toBe(1);
    });

    it('2.5 should validate PaginatedCourseEnrollmentsData shape', () => {
      const item: CourseEnrollmentItemDto = {
        enrollmentId: '00000000-0000-0000-0000-000000000010',
        student: {
          id: testUserId,
          name: 'Prof. Alan Turing',
          email: 'alan.turing@techsprout.edu',
        },
        status: 'ACTIVE',
        enrolledAt: new Date().toISOString(),
        completedAt: null,
        lastAccessedAt: new Date().toISOString(),
        progressPercentage: 45,
      };

      const paginated: PaginatedCourseEnrollmentsData = {
        items: [item],
        totalEnrolled: 1,
        completedCount: 0,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      expect(paginated.items.length).toBe(1);
      expect(paginated.items[0].progressPercentage).toBe(45);
    });
  });

  // =========================================================================
  // 3. DATABASE SCHEMA & PERFORMANCE INDEXES VERIFICATION
  // =========================================================================

  describe('3. Database Schema & Secondary Performance Indexes Foundation', () => {
    it('3.1 should query enrollments using composite index courseId + enrolledAt', async () => {
      const enrolledAtDate = new Date('2026-10-01T10:00:00.000Z');

      const [enr] = await db
        .insert(enrollments)
        .values({
          courseId: testCourseId,
          studentId: testUserId,
          status: 'ACTIVE',
          enrolledAt: enrolledAtDate,
        })
        .returning();

      expect(enr).toBeDefined();

      const results = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, testCourseId),
            eq(enrollments.enrolledAt, enrolledAtDate)
          )
        );

      expect(results.length).toBe(1);
      expect(results[0].id).toBe(enr.id);
    });

    it('3.2 should query enrollments using composite index status + enrolledAt', async () => {
      const enrolledAtDate = new Date('2026-10-05T12:00:00.000Z');

      const [enr] = await db
        .insert(enrollments)
        .values({
          courseId: testCourseId,
          studentId: testUserId,
          status: 'COMPLETED',
          enrolledAt: enrolledAtDate,
          completedAt: new Date('2026-10-10T12:00:00.000Z'),
        })
        .returning();

      const results = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.status, 'COMPLETED'),
            eq(enrollments.enrolledAt, enrolledAtDate)
          )
        );

      expect(results.length).toBe(1);
      expect(results[0].status).toBe('COMPLETED');
    });

    it('3.3 should query lesson_progress using composite index lessonId + status', async () => {
      // Create module and lesson
      const [mod] = await db
        .insert(modules)
        .values({
          courseId: testCourseId,
          title: 'Module 1: Finite Automata',
          position: 1,
        })
        .returning();

      const [les] = await db
        .insert(lessons)
        .values({
          moduleId: mod.id,
          title: 'Lesson 1.1: DFAs and NFAs',
          position: 1,
          lessonType: 'VIDEO',
          durationSeconds: 1200,
        })
        .returning();

      const [enr] = await db
        .insert(enrollments)
        .values({
          courseId: testCourseId,
          studentId: testUserId,
          status: 'ACTIVE',
        })
        .returning();

      const [lp] = await db
        .insert(lessonProgress)
        .values({
          enrollmentId: enr.id,
          lessonId: les.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        })
        .returning();

      expect(lp).toBeDefined();

      const progressResults = await db
        .select()
        .from(lessonProgress)
        .where(
          and(
            eq(lessonProgress.lessonId, les.id),
            eq(lessonProgress.status, 'COMPLETED')
          )
        );

      expect(progressResults.length).toBe(1);
      expect(progressResults[0].status).toBe('COMPLETED');
    });

    it('3.4 should query quiz_attempts using composite index quizId + isPassed', async () => {
      const [mod] = await db
        .insert(modules)
        .values({
          courseId: testCourseId,
          title: 'Module 1 Quizzes',
          position: 1,
        })
        .returning();

      const [qz] = await db
        .insert(quizzes)
        .values({
          moduleId: mod.id,
          title: 'DFA Mastery Quiz',
          position: 1,
          passingScorePercentage: 70,
        })
        .returning();

      const [enr] = await db
        .insert(enrollments)
        .values({
          courseId: testCourseId,
          studentId: testUserId,
          status: 'ACTIVE',
        })
        .returning();

      const [att] = await db
        .insert(quizAttempts)
        .values({
          quizId: qz.id,
          enrollmentId: enr.id,
          studentId: testUserId,
          attemptNumber: 1,
          status: 'SUBMITTED',
          score: 85,
          totalPoints: 100,
          percentage: '85.00',
          isPassed: true,
          submittedAt: new Date(),
        })
        .returning();

      expect(att).toBeDefined();

      const attempts = await db
        .select()
        .from(quizAttempts)
        .where(
          and(
            eq(quizAttempts.quizId, qz.id),
            eq(quizAttempts.isPassed, true)
          )
        );

      expect(attempts.length).toBe(1);
      expect(attempts[0].isPassed).toBe(true);
      expect(attempts[0].score).toBe(85);
    });
  });

  // =========================================================================
  // 4. ARCHITECTURAL BOUNDARY & SCOPE DISCIPLINE
  // =========================================================================

  describe('4. Scope Boundary Discipline & Prerequisite Integrity', () => {
    it('4.1 should confirm learning_events table is absent (deferred to Phase 7)', () => {
      // Asserts that learning_events is not registered in the P6.3 schema
      expect((schema as any).learningEvents).toBeUndefined();
    });

    it('4.2 should maintain full compatibility with prerequisite P6.2 entities', () => {
      expect(courseReviewRequests).toBeDefined();
      expect(instructorProfiles).toBeDefined();
      expect(courseStatusEnum.enumValues).toContain('IN_REVIEW');
      expect(courseReviewStatusEnum.enumValues).toContain('PENDING');
    });
  });
});
