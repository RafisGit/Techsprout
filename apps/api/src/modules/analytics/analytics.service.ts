import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import {
  eq,
  and,
  or,
  inArray,
  count,
  countDistinct,
  asc,
  desc,
  ilike,
  isNotNull,
  isNull,
} from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  courses,
  users,
  userRoles,
  roles,
  categories,
  modules,
  lessons,
  enrollments,
  lessonProgress,
  quizzes,
  quizAttempts,
  certificates,
  courseReviewRequests,
} from '../../database/schema';
import { ApiException } from '../../common/errors/api-error';
import { AnalyticsCacheService } from './analytics.cache.service';
import type {
  InstructorAnalyticsOverviewDto,
  CourseAnalyticsDetailDto,
  AdminAnalyticsOverviewDto,
  AdminCourseAnalyticsItemDto,
  PaginatedAdminCourseAnalyticsData,
  StudentLearningEngagementDto,
  EnrollmentTrendDataPoint,
  ProgressDistributionBucket,
  LessonDropOffItemDto,
} from '@techsprout/contracts';
import type { QueryAnalyticsDateRangeDto } from './dto/analytics-date-range.dto';
import type { QueryAdminCourseAnalyticsDto } from './dto/admin-course-analytics-query.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AnalyticsCacheService) private readonly cacheService: AnalyticsCacheService
  ) {}

  // =========================================================================
  // 1. INSTRUCTOR PORTFOLIO ANALYTICS OVERVIEW
  // =========================================================================

  async getInstructorOverview(instructorId: string): Promise<InstructorAnalyticsOverviewDto> {
    const cacheKey = this.cacheService.buildInstructorOverviewKey(instructorId);
    const cached = await this.cacheService.get<InstructorAnalyticsOverviewDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // 1. Fetch courses authored by this instructor
    const instructorCourses = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        status: courses.status,
      })
      .from(courses)
      .where(eq(courses.instructorId, instructorId));

    if (instructorCourses.length === 0) {
      const emptyResult: InstructorAnalyticsOverviewDto = {
        totalUniqueStudents: 0,
        totalCourseCompletions: 0,
        portfolioCompletionRate: 0,
        activeLearners30d: 0,
        courseBreakdown: [],
      };
      await this.cacheService.set(cacheKey, emptyResult, 600);
      return emptyResult;
    }

    const courseIds = instructorCourses.map((c) => c.id);

    // 2. Batch fetch all enrollments across instructor's courses
    const allEnrollments = await this.db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        courseId: enrollments.courseId,
        status: enrollments.status,
        lastAccessedAt: enrollments.lastAccessedAt,
        enrolledAt: enrollments.enrolledAt,
        completedAt: enrollments.completedAt,
      })
      .from(enrollments)
      .where(inArray(enrollments.courseId, courseIds));

    // Calculate portfolio-wide metrics
    const totalUniqueStudents = new Set(allEnrollments.map((e) => e.studentId)).size;
    const totalCourseCompletions = allEnrollments.filter((e) => e.status === 'COMPLETED').length;
    const totalEnrollmentsCount = allEnrollments.length;
    const portfolioCompletionRate =
      totalEnrollmentsCount > 0
        ? Math.round((totalCourseCompletions / totalEnrollmentsCount) * 100)
        : 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeLearners30d = new Set(
      allEnrollments
        .filter((e) => e.lastAccessedAt && new Date(e.lastAccessedAt) >= thirtyDaysAgo)
        .map((e) => e.studentId)
    ).size;

    // 3. Batch fetch total lesson counts per course
    const courseLessons = await this.db
      .select({
        courseId: modules.courseId,
        lessonId: lessons.id,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(inArray(modules.courseId, courseIds));

    const lessonCountByCourse = new Map<string, number>();
    for (const row of courseLessons) {
      lessonCountByCourse.set(row.courseId, (lessonCountByCourse.get(row.courseId) || 0) + 1);
    }

    // 4. Batch fetch completed lesson progress per enrollment
    const enrollmentIds = allEnrollments.map((e) => e.id);
    const completedProgressByEnrollment = new Map<string, number>();

    if (enrollmentIds.length > 0) {
      const progressRows = await this.db
        .select({
          enrollmentId: lessonProgress.enrollmentId,
          completedCount: count(lessonProgress.id),
        })
        .from(lessonProgress)
        .where(
          and(
            inArray(lessonProgress.enrollmentId, enrollmentIds),
            eq(lessonProgress.status, 'COMPLETED')
          )
        )
        .groupBy(lessonProgress.enrollmentId);

      for (const row of progressRows) {
        completedProgressByEnrollment.set(row.enrollmentId, Number(row.completedCount));
      }
    }

    // 5. Construct course breakdown
    const courseBreakdown = instructorCourses.map((course) => {
      const courseEnrs = allEnrollments.filter((e) => e.courseId === course.id);
      const totalEnrolled = courseEnrs.length;
      const completedCount = courseEnrs.filter((e) => e.status === 'COMPLETED').length;
      const completionRate =
        totalEnrolled > 0 ? Math.round((completedCount / totalEnrolled) * 100) : 0;
      const totalLessons = lessonCountByCourse.get(course.id) || 0;

      let averageProgressPercentage = 0;
      if (totalEnrolled > 0) {
        if (totalLessons === 0) {
          // If course has zero lessons, completed enrollments count as 100%, others 0%
          const sum = courseEnrs.reduce((acc, e) => acc + (e.status === 'COMPLETED' ? 100 : 0), 0);
          averageProgressPercentage = Math.round(sum / totalEnrolled);
        } else {
          const sum = courseEnrs.reduce((acc, e) => {
            if (e.status === 'COMPLETED') return acc + 100;
            const completedLessons = completedProgressByEnrollment.get(e.id) || 0;
            const pct = Math.min(100, Math.round((completedLessons / totalLessons) * 100));
            return acc + pct;
          }, 0);
          averageProgressPercentage = Math.round(sum / totalEnrolled);
        }
      }

      return {
        courseId: course.id,
        title: course.title,
        slug: course.slug,
        status: course.status,
        totalEnrolled,
        completedCount,
        completionRate,
        averageProgressPercentage,
      };
    });

    const result: InstructorAnalyticsOverviewDto = {
      totalUniqueStudents,
      totalCourseCompletions,
      portfolioCompletionRate,
      activeLearners30d,
      courseBreakdown,
    };

    await this.cacheService.set(cacheKey, result, 600);
    return result;
  }

  // =========================================================================
  // 2. INSTRUCTOR COURSE-LEVEL ANALYTICS DEEP DIVE
  // =========================================================================

  async getCourseAnalyticsDetail(
    courseId: string,
    query: QueryAnalyticsDateRangeDto,
    actor: { id: string; role: string }
  ): Promise<CourseAnalyticsDetailDto> {
    // 1. Verify course existence and permissions
    const [course] = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        instructorId: courses.instructorId,
      })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (actor.role === 'instructor' && course.instructorId !== actor.id) {
      throw new ApiException(
        'Access denied: you do not have permission to view analytics for this course',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    // 2. Parse and normalize date boundaries (UTC)
    const interval = query.interval || 'day';
    let startDateObj: Date;
    let endDateObj: Date;

    if (query.startDate && query.endDate) {
      startDateObj = new Date(`${query.startDate}T00:00:00.000Z`);
      endDateObj = new Date(`${query.endDate}T23:59:59.999Z`);
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        throw new ApiException('Invalid date format provided', HttpStatus.BAD_REQUEST, 'INVALID_DATE');
      }
      if (startDateObj > endDateObj) {
        throw new ApiException(
          'Invalid date range: startDate must be before or equal to endDate',
          HttpStatus.BAD_REQUEST,
          'INVALID_DATE_RANGE'
        );
      }
    } else if (query.startDate) {
      startDateObj = new Date(`${query.startDate}T00:00:00.000Z`);
      endDateObj = new Date();
      endDateObj.setUTCHours(23, 59, 59, 999);
      if (isNaN(startDateObj.getTime())) {
        throw new ApiException('Invalid startDate format', HttpStatus.BAD_REQUEST, 'INVALID_DATE');
      }
    } else if (query.endDate) {
      endDateObj = new Date(`${query.endDate}T23:59:59.999Z`);
      if (isNaN(endDateObj.getTime())) {
        throw new ApiException('Invalid endDate format', HttpStatus.BAD_REQUEST, 'INVALID_DATE');
      }
      startDateObj = new Date(endDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);
      startDateObj.setUTCHours(0, 0, 0, 0);
    } else {
      endDateObj = new Date();
      endDateObj.setUTCHours(23, 59, 59, 999);
      startDateObj = new Date(endDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);
      startDateObj.setUTCHours(0, 0, 0, 0);
    }

    const startIsoDate = startDateObj.toISOString().split('T')[0];
    const endIsoDate = endDateObj.toISOString().split('T')[0];
    const rangeHash = `${startIsoDate}_${endIsoDate}_${interval}`;

    const cacheKey = this.cacheService.buildCourseAnalyticsKey(courseId, rangeHash);
    const cached = await this.cacheService.get<CourseAnalyticsDetailDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // 3. Fetch all enrollments for this course
    const courseEnrollments = await this.db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        status: enrollments.status,
        enrolledAt: enrollments.enrolledAt,
        completedAt: enrollments.completedAt,
        lastAccessedAt: enrollments.lastAccessedAt,
      })
      .from(enrollments)
      .where(eq(enrollments.courseId, courseId));

    const totalEnrolled = courseEnrollments.length;
    const completedEnrs = courseEnrollments.filter((e) => e.status === 'COMPLETED');
    const totalCompleted = completedEnrs.length;
    const completionRate =
      totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeLearners30d = new Set(
      courseEnrollments
        .filter((e) => e.lastAccessedAt && new Date(e.lastAccessedAt) >= thirtyDaysAgo)
        .map((e) => e.studentId)
    ).size;

    // Average days to complete calculation
    let averageDaysToComplete: number | null = null;
    const completedWithTimestamps = completedEnrs.filter((e) => e.completedAt && e.enrolledAt);
    if (completedWithTimestamps.length > 0) {
      const totalDays = completedWithTimestamps.reduce((acc, e) => {
        const diffMs = new Date(e.completedAt!).getTime() - new Date(e.enrolledAt).getTime();
        return acc + diffMs / (1000 * 60 * 60 * 24);
      }, 0);
      averageDaysToComplete = Number((totalDays / completedWithTimestamps.length).toFixed(1));
    }

    // 4. Generate Enrollment Trend Series (zero-filled bucketed calendar dates)
    const enrollmentTrend = this.buildEnrollmentTrend(
      courseEnrollments,
      startDateObj,
      endDateObj,
      interval
    );

    // 5. Learner Progress Distribution
    const progressDistribution = await this.buildProgressDistribution(courseId, courseEnrollments);

    // 6. Lesson Completion & Drop-off Hotspots
    const lessonDropOff = await this.buildLessonDropOff(courseId, totalEnrolled);

    // 7. Quiz Performance Summaries
    const quizPerformance = await this.buildQuizPerformance(courseId);

    const result: CourseAnalyticsDetailDto = {
      courseId: course.id,
      courseTitle: course.title,
      dateRange: {
        startDate: startIsoDate,
        endDate: endIsoDate,
      },
      metrics: {
        totalEnrolled,
        totalCompleted,
        completionRate,
        averageDaysToComplete,
        activeLearners30d,
      },
      enrollmentTrend,
      progressDistribution,
      lessonDropOff,
      quizPerformance,
    };

    await this.cacheService.set(cacheKey, result, 600);
    return result;
  }

  // =========================================================================
  // 3. ADMIN ANALYTICS OVERVIEW
  // =========================================================================

  async getAdminOverview(): Promise<AdminAnalyticsOverviewDto> {
    const cacheKey = this.cacheService.buildAdminOverviewKey();
    const cached = await this.cacheService.get<AdminAnalyticsOverviewDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // 1. Course lifecycle counts
    const courseStatusRows = await this.db
      .select({
        status: courses.status,
        count: count(courses.id),
      })
      .from(courses)
      .groupBy(courses.status);

    let totalPublishedCourses = 0;
    let totalDraftCourses = 0;
    let totalInReviewCourses = 0;
    let totalArchivedCourses = 0;

    for (const row of courseStatusRows) {
      const c = Number(row.count);
      if (row.status === 'PUBLISHED') totalPublishedCourses = c;
      else if (row.status === 'DRAFT') totalDraftCourses = c;
      else if (row.status === 'IN_REVIEW') totalInReviewCourses = c;
      else if (row.status === 'ARCHIVED') totalArchivedCourses = c;
    }

    // 2. Total registered students
    const [studentsResult] = await this.db
      .select({ count: count(users.id) })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(or(eq(roles.name, 'student'), isNull(roles.name)));
    const totalRegisteredStudents = Number(studentsResult?.count || 0);

    // 3. Total active instructors (instructors with authored courses)
    const [instructorsResult] = await this.db
      .select({ count: countDistinct(courses.instructorId) })
      .from(courses);
    const totalActiveInstructors = Number(instructorsResult?.count || 0);

    // 4. Platform-wide enrollments & completion rate
    const [enrollmentStats] = await this.db
      .select({ total: count(enrollments.id) })
      .from(enrollments);
    const [completedStats] = await this.db
      .select({ completed: count(enrollments.id) })
      .from(enrollments)
      .where(eq(enrollments.status, 'COMPLETED'));

    const platformWideEnrollments = Number(enrollmentStats?.total || 0);
    const completedEnrollments = Number(completedStats?.completed || 0);
    const platformCompletionRate =
      platformWideEnrollments > 0
        ? Math.round((completedEnrollments / platformWideEnrollments) * 100)
        : 0;

    // 5. Platform-wide certificates issued
    const [certificatesStats] = await this.db
      .select({ count: count(certificates.id) })
      .from(certificates)
      .where(eq(certificates.status, 'ACTIVE'));
    const platformWideCertificates = Number(certificatesStats?.count || 0);

    // 6. Review queue SLA metrics
    const [pendingReviewsStats] = await this.db
      .select({ count: count(courseReviewRequests.id) })
      .from(courseReviewRequests)
      .where(eq(courseReviewRequests.status, 'PENDING'));
    const pendingReviewsCount = Number(pendingReviewsStats?.count || 0);

    const reviewedRequests = await this.db
      .select({
        submittedAt: courseReviewRequests.submittedAt,
        reviewedAt: courseReviewRequests.reviewedAt,
      })
      .from(courseReviewRequests)
      .where(
        and(
          inArray(courseReviewRequests.status, ['APPROVED', 'REJECTED']),
          isNotNull(courseReviewRequests.reviewedAt)
        )
      );

    let averageTurnaroundHours: number | null = null;
    if (reviewedRequests.length > 0) {
      const totalHours = reviewedRequests.reduce((acc, r) => {
        const diffMs = new Date(r.reviewedAt!).getTime() - new Date(r.submittedAt).getTime();
        return acc + diffMs / (1000 * 60 * 60);
      }, 0);
      averageTurnaroundHours = Number((totalHours / reviewedRequests.length).toFixed(1));
    }

    const result: AdminAnalyticsOverviewDto = {
      totalPublishedCourses,
      totalDraftCourses,
      totalInReviewCourses,
      totalArchivedCourses,
      totalRegisteredStudents,
      totalActiveInstructors,
      platformWideEnrollments,
      platformWideCertificates,
      platformCompletionRate,
      reviewQueue: {
        pendingReviewsCount,
        averageTurnaroundHours,
      },
    };

    await this.cacheService.set(cacheKey, result, 600);
    return result;
  }

  // =========================================================================
  // 4. ADMIN COURSE ANALYTICS (PAGINATED CATALOG ROLLUP)
  // =========================================================================

  async getAdminCourseAnalytics(
    query: QueryAdminCourseAnalyticsDto
  ): Promise<PaginatedAdminCourseAnalyticsData> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // 1. Build where conditions
    const whereConditions: any[] = [];
    if (query.status) {
      whereConditions.push(eq(courses.status, query.status));
    }
    if (query.search) {
      whereConditions.push(ilike(courses.title, `%${query.search}%`));
    }

    const combinedWhere = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // 2. Count total matching courses
    const [totalResult] = await this.db
      .select({ count: count(courses.id) })
      .from(courses)
      .where(combinedWhere);

    const total = Number(totalResult?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // 3. Fetch courses page
    const courseRows = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        status: courses.status,
        price: courses.price,
        currency: courses.currency,
        createdAt: courses.createdAt,
        instructorId: users.id,
        instructorName: users.name,
        instructorEmail: users.email,
        categoryId: categories.id,
        categoryName: categories.name,
      })
      .from(courses)
      .innerJoin(users, eq(courses.instructorId, users.id))
      .leftJoin(categories, eq(courses.categoryId, categories.id))
      .where(combinedWhere)
      .limit(limit)
      .offset(offset);

    if (courseRows.length === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    }

    const pageCourseIds = courseRows.map((c) => c.id);

    // 4. Batch query enrollments count and completions for this page
    const enrollmentStats = await this.db
      .select({
        courseId: enrollments.courseId,
        totalEnrolled: count(enrollments.id),
      })
      .from(enrollments)
      .where(inArray(enrollments.courseId, pageCourseIds))
      .groupBy(enrollments.courseId);

    const completionStats = await this.db
      .select({
        courseId: enrollments.courseId,
        completedCount: count(enrollments.id),
      })
      .from(enrollments)
      .where(
        and(inArray(enrollments.courseId, pageCourseIds), eq(enrollments.status, 'COMPLETED'))
      )
      .groupBy(enrollments.courseId);

    const enrolledMap = new Map<string, number>();
    for (const r of enrollmentStats) enrolledMap.set(r.courseId, Number(r.totalEnrolled));

    const completedMap = new Map<string, number>();
    for (const r of completionStats) completedMap.set(r.courseId, Number(r.completedCount));

    // 5. Assemble items
    let items: AdminCourseAnalyticsItemDto[] = courseRows.map((row) => {
      const totalEnrolled = enrolledMap.get(row.id) || 0;
      const completedCount = completedMap.get(row.id) || 0;
      const completionRate =
        totalEnrolled > 0 ? Math.round((completedCount / totalEnrolled) * 100) : 0;

      return {
        courseId: row.id,
        title: row.title,
        slug: row.slug,
        instructor: {
          id: row.instructorId,
          name: row.instructorName,
          email: row.instructorEmail,
        },
        category: {
          id: row.categoryId || '',
          name: row.categoryName || 'Uncategorized',
        },
        status: row.status,
        price: row.price,
        currency: row.currency,
        totalEnrolled,
        completedCount,
        completionRate,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    });

    // Sort items according to sortBy and sortOrder
    const sortBy = query.sortBy || 'enrollments';
    const sortOrder = query.sortOrder || 'desc';
    items.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'enrollments') comp = a.totalEnrolled - b.totalEnrolled;
      else if (sortBy === 'completionRate') comp = a.completionRate - b.completionRate;
      else if (sortBy === 'title') comp = a.title.localeCompare(b.title);
      else if (sortBy === 'createdAt')
        comp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

      return sortOrder === 'desc' ? -comp : comp;
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  // =========================================================================
  // 5. STUDENT LEARNING ENGAGEMENT
  // =========================================================================

  async getStudentEngagement(studentId: string): Promise<StudentLearningEngagementDto> {
    const studentEnrollments = await this.db
      .select({
        id: enrollments.id,
        status: enrollments.status,
      })
      .from(enrollments)
      .where(eq(enrollments.studentId, studentId));

    const enrolledCoursesCount = studentEnrollments.filter((e) => e.status !== 'CANCELLED').length;
    const inProgressCoursesCount = studentEnrollments.filter((e) => e.status === 'ACTIVE').length;

    const [certResult] = await this.db
      .select({ count: count(certificates.id) })
      .from(certificates)
      .where(and(eq(certificates.studentId, studentId), eq(certificates.status, 'ACTIVE')));

    const completedCertificatesCount = Number(certResult?.count || 0);

    return {
      enrolledCoursesCount,
      inProgressCoursesCount,
      completedCertificatesCount,
    };
  }

  // =========================================================================
  // HELPER METHODS: SUB-AGGREGATIONS & BUCKETING
  // =========================================================================

  private buildEnrollmentTrend(
    courseEnrollments: Array<{ enrolledAt: Date | string }>,
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week'
  ): EnrollmentTrendDataPoint[] {
    const countMap = new Map<string, number>();

    if (interval === 'day') {
      const cur = new Date(startDate);
      while (cur <= endDate) {
        const key = cur.toISOString().split('T')[0];
        countMap.set(key, 0);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      for (const enr of courseEnrollments) {
        const enrDate = new Date(enr.enrolledAt);
        if (enrDate >= startDate && enrDate <= endDate) {
          const key = enrDate.toISOString().split('T')[0];
          if (countMap.has(key)) {
            countMap.set(key, countMap.get(key)! + 1);
          }
        }
      }
    } else {
      // Weekly interval
      const cur = new Date(startDate);
      while (cur <= endDate) {
        const key = cur.toISOString().split('T')[0];
        countMap.set(key, 0);
        cur.setUTCDate(cur.getUTCDate() + 7);
      }

      const weekKeys = Array.from(countMap.keys());
      for (const enr of courseEnrollments) {
        const enrDate = new Date(enr.enrolledAt);
        if (enrDate >= startDate && enrDate <= endDate) {
          // Find matching week bucket
          let assignedKey = weekKeys[0];
          for (const k of weekKeys) {
            const bucketDate = new Date(`${k}T00:00:00.000Z`);
            if (enrDate >= bucketDate) {
              assignedKey = k;
            } else {
              break;
            }
          }
          if (countMap.has(assignedKey)) {
            countMap.set(assignedKey, countMap.get(assignedKey)! + 1);
          }
        }
      }
    }

    return Array.from(countMap.entries()).map(([date, countVal]) => ({
      date,
      count: countVal,
    }));
  }

  private async buildProgressDistribution(
    courseId: string,
    courseEnrollments: Array<{ id: string; status: string }>
  ): Promise<ProgressDistributionBucket[]> {
    const brackets: Record<
      ProgressDistributionBucket['bracket'],
      { count: number; bracket: ProgressDistributionBucket['bracket'] }
    > = {
      '0-19%': { count: 0, bracket: '0-19%' },
      '20-39%': { count: 0, bracket: '20-39%' },
      '40-59%': { count: 0, bracket: '40-59%' },
      '60-79%': { count: 0, bracket: '60-79%' },
      '80-99%': { count: 0, bracket: '80-99%' },
      '100%': { count: 0, bracket: '100%' },
    };

    const totalEnrolled = courseEnrollments.length;
    if (totalEnrolled === 0) {
      return Object.values(brackets).map((b) => ({
        bracket: b.bracket,
        studentCount: 0,
        percentage: 0,
      }));
    }

    const [totalLessonsResult] = await this.db
      .select({ count: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId));
    const totalLessons = Number(totalLessonsResult?.count || 0);

    const enrollmentIds = courseEnrollments.map((e) => e.id);
    const progressRows = await this.db
      .select({
        enrollmentId: lessonProgress.enrollmentId,
        completedCount: count(lessonProgress.id),
      })
      .from(lessonProgress)
      .where(
        and(
          inArray(lessonProgress.enrollmentId, enrollmentIds),
          eq(lessonProgress.status, 'COMPLETED')
        )
      )
      .groupBy(lessonProgress.enrollmentId);

    const completedProgressMap = new Map<string, number>();
    for (const r of progressRows) {
      completedProgressMap.set(r.enrollmentId, Number(r.completedCount));
    }

    for (const enr of courseEnrollments) {
      let pct = 0;
      if (enr.status === 'COMPLETED') {
        pct = 100;
      } else if (totalLessons > 0) {
        const completedCount = completedProgressMap.get(enr.id) || 0;
        pct = Math.min(100, Math.round((completedCount / totalLessons) * 100));
      }

      if (pct === 100) brackets['100%'].count++;
      else if (pct >= 80) brackets['80-99%'].count++;
      else if (pct >= 60) brackets['60-79%'].count++;
      else if (pct >= 40) brackets['40-59%'].count++;
      else if (pct >= 20) brackets['20-39%'].count++;
      else brackets['0-19%'].count++;
    }

    return Object.values(brackets).map((b) => ({
      bracket: b.bracket,
      studentCount: b.count,
      percentage: totalEnrolled > 0 ? Math.round((b.count / totalEnrolled) * 100) : 0,
    }));
  }

  private async buildLessonDropOff(
    courseId: string,
    totalEnrolled: number
  ): Promise<LessonDropOffItemDto[]> {
    const courseLessons = await this.db
      .select({
        lessonId: lessons.id,
        moduleId: modules.id,
        moduleTitle: modules.title,
        lessonTitle: lessons.title,
        position: lessons.position,
        lessonType: lessons.lessonType,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.position), asc(lessons.position));

    if (courseLessons.length === 0) {
      return [];
    }

    const lessonIds = courseLessons.map((l) => l.lessonId);
    const progressRows = await this.db
      .select({
        lessonId: lessonProgress.lessonId,
        completedCount: count(lessonProgress.enrollmentId),
      })
      .from(lessonProgress)
      .where(
        and(inArray(lessonProgress.lessonId, lessonIds), eq(lessonProgress.status, 'COMPLETED'))
      )
      .groupBy(lessonProgress.lessonId);

    const completersMap = new Map<string, number>();
    for (const r of progressRows) {
      completersMap.set(r.lessonId, Number(r.completedCount));
    }

    let priorCompleters: number | null = null;
    const items: LessonDropOffItemDto[] = [];

    for (const les of courseLessons) {
      const completedLearnersCount = completersMap.get(les.lessonId) || 0;
      const completionRate =
        totalEnrolled > 0 ? Math.round((completedLearnersCount / totalEnrolled) * 100) : 0;

      let dropOffRateFromPrior = 0;
      if (priorCompleters !== null && priorCompleters > 0) {
        dropOffRateFromPrior = Math.max(
          0,
          Math.round(((priorCompleters - completedLearnersCount) / priorCompleters) * 100)
        );
      }

      priorCompleters = completedLearnersCount;

      items.push({
        lessonId: les.lessonId,
        moduleId: les.moduleId,
        moduleTitle: les.moduleTitle,
        lessonTitle: les.lessonTitle,
        position: les.position,
        lessonType: les.lessonType,
        completedLearnersCount,
        completionRate,
        dropOffRateFromPrior,
      });
    }

    return items;
  }

  private async buildQuizPerformance(
    courseId: string
  ): Promise<
    Array<{
      quizId: string;
      quizTitle: string;
      totalAttempts: number;
      uniqueStudents: number;
      passRate: number;
      averageScorePercentage: number;
    }>
  > {
    const courseQuizzes = await this.db
      .select({
        quizId: quizzes.id,
        quizTitle: quizzes.title,
      })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .orderBy(asc(modules.position), asc(quizzes.position));

    if (courseQuizzes.length === 0) {
      return [];
    }

    const quizIds = courseQuizzes.map((q) => q.quizId);
    const attempts = await this.db
      .select({
        quizId: quizAttempts.quizId,
        studentId: quizAttempts.studentId,
        isPassed: quizAttempts.isPassed,
        percentage: quizAttempts.percentage,
      })
      .from(quizAttempts)
      .where(inArray(quizAttempts.quizId, quizIds));

    const attemptsByQuiz = new Map<string, typeof attempts>();
    for (const a of attempts) {
      if (!attemptsByQuiz.has(a.quizId)) attemptsByQuiz.set(a.quizId, []);
      attemptsByQuiz.get(a.quizId)!.push(a);
    }

    return courseQuizzes.map((q) => {
      const qAttempts = attemptsByQuiz.get(q.quizId) || [];
      const totalAttempts = qAttempts.length;
      const uniqueStudents = new Set(qAttempts.map((a) => a.studentId)).size;
      const passedCount = qAttempts.filter((a) => a.isPassed).length;
      const passRate = totalAttempts > 0 ? Math.round((passedCount / totalAttempts) * 100) : 0;
      const totalScore = qAttempts.reduce((acc, a) => acc + Number(a.percentage || 0), 0);
      const averageScorePercentage =
        totalAttempts > 0 ? Number((totalScore / totalAttempts).toFixed(1)) : 0;

      return {
        quizId: q.quizId,
        quizTitle: q.quizTitle,
        totalAttempts,
        uniqueStudents,
        passRate,
        averageScorePercentage,
      };
    });
  }
}
