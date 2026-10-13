import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { AnalyticsCacheService } from '../modules/analytics/analytics.cache.service';
import type {
  InstructorAnalyticsOverviewDto,
  CourseAnalyticsDetailDto,
  AdminAnalyticsOverviewDto,
  StudentLearningEngagementDto,
} from '@techsprout/contracts';

describe('P6.3 — WP-02: Backend Analytics Engine & Scoped APIs Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let cacheService: AnalyticsCacheService;

  let adminCookies: string[];
  let instructor1Cookies: string[];
  let instructor2Cookies: string[];
  let studentCookies: string[];

  let adminId: string;
  let instructor1Id: string;
  let instructor2Id: string;
  let studentId: string;

  let categoryId: string;
  let course1: any; // Owned by Instructor 1
  let course2: any; // Owned by Instructor 2
  let module1: any;
  let lesson1: any;
  let lesson2: any;
  let quiz1: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // 1. Fetch seeded Instructor 1, Admin, and Student
    const [inst1User] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));
    instructor1Id = inst1User.id;

    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'));
    adminId = adminUser.id;

    const [studentUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentId = studentUser.id;

    // 2. Create Instructor 2 for multi-tenant isolation tests
    const [instructorRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'))
      .limit(1);

    const passwordHash2 = await CryptoUtil.hashPassword('Instructor2Password123!');
    const [inst2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Dr. John Von Neumann',
        username: 'instructor2',
        email: 'instructor2@techsprout.edu',
        passwordHash: passwordHash2,
        isVerified: true,
      })
      .returning();
    instructor2Id = inst2.id;

    await testDb.insert(schema.userRoles).values({
      userId: instructor2Id,
      roleId: instructorRole.id,
    });

    // 3. Create category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Algorithms & Data Structures',
        slug: 'algorithms-ds',
        description: 'Advanced algorithms course collection',
      })
      .returning();
    categoryId = cat.id;

    // 4. Create Course 1 (Instructor 1)
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Advanced Graph Algorithms',
        slug: 'advanced-graph-algorithms',
        description: 'Graph algorithms from BFS to Max-Flow',
        instructorId: instructor1Id,
        categoryId: cat.id,
        status: 'PUBLISHED',
        price: '4000.00',
        currency: 'BDT',
      })
      .returning();
    course1 = c1;

    // 5. Create Course 2 (Instructor 2)
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Quantum Computing Fundamentals',
        slug: 'quantum-computing-fundamentals',
        description: 'Qubits, quantum gates, and entanglement',
        instructorId: instructor2Id,
        categoryId: cat.id,
        status: 'PUBLISHED',
        price: '5000.00',
        currency: 'BDT',
      })
      .returning();
    course2 = c2;

    // 6. Add Module and Lessons to Course 1
    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course1.id,
        title: 'Module 1: Shortest Paths',
        position: 1,
      })
      .returning();
    module1 = m1;

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Lesson 1.1: Dijkstra Algorithm',
        position: 1,
        lessonType: 'VIDEO',
        durationSeconds: 900,
      })
      .returning();
    lesson1 = l1;

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Lesson 1.2: Bellman-Ford Algorithm',
        position: 2,
        lessonType: 'VIDEO',
        durationSeconds: 1200,
      })
      .returning();
    lesson2 = l2;

    // 7. Add Quiz to Course 1
    const [q1] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Shortest Paths Quiz',
        position: 1,
        passingScorePercentage: 70,
      })
      .returning();
    quiz1 = q1;

    // 8. Compile Testing Module
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        pool: testPool,
        db: testDb,
        onModuleDestroy: async () => {},
      })
      .overrideProvider(DRIZZLE_DB)
      .useValue(testDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    cacheService = moduleRef.get<AnalyticsCacheService>(AnalyticsCacheService);

    // 9. Login users to obtain authenticated session cookies
    const adminRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminRes.headers['set-cookie'] || [];

    const inst1Res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructor1Cookies = inst1Res.headers['set-cookie'] || [];

    const inst2Res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor2@techsprout.edu',
      password: 'Instructor2Password123!',
    });
    instructor2Cookies = inst2Res.headers['set-cookie'] || [];

    const studentRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = studentRes.headers['set-cookie'] || [];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // 1. INSTRUCTOR PORTFOLIO ANALYTICS OVERVIEW
  // =========================================================================

  describe('1. Instructor Portfolio Analytics Overview (GET /api/v1/instructor/analytics/overview)', () => {
    it('1.1 should return zero-safe metrics when an instructor has courses with 0 enrollments', async () => {
      // Clear cache to ensure clean state
      cacheService.clearMemoryCache();

      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/overview')
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data: InstructorAnalyticsOverviewDto = res.body.data;
      expect(data.totalUniqueStudents).toBe(0);
      expect(data.totalCourseCompletions).toBe(0);
      expect(data.portfolioCompletionRate).toBe(0);
      expect(data.activeLearners30d).toBe(0);
      expect(data.courseBreakdown.length).toBe(1);
      expect(data.courseBreakdown[0].courseId).toBe(course2.id);
      expect(data.courseBreakdown[0].totalEnrolled).toBe(0);
      expect(data.courseBreakdown[0].completionRate).toBe(0);
    });

    it('1.2 should accurately compute portfolio metrics with active and completed enrollments', async () => {
      cacheService.clearMemoryCache();

      // Create an enrollment in Course 1 for student
      const enrolledAtDate = new Date('2026-10-01T10:00:00.000Z');
      const completedAtDate = new Date('2026-10-10T15:00:00.000Z');

      const [enr1] = await testDb
        .insert(schema.enrollments)
        .values({
          courseId: course1.id,
          studentId,
          status: 'COMPLETED',
          enrolledAt: enrolledAtDate,
          completedAt: completedAtDate,
          lastAccessedAt: new Date(),
        })
        .returning();

      // Mark progress on lesson 1 and lesson 2
      await testDb.insert(schema.lessonProgress).values([
        {
          enrollmentId: enr1.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        {
          enrollmentId: enr1.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/overview')
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data: InstructorAnalyticsOverviewDto = res.body.data;
      expect(data.totalUniqueStudents).toBe(1);
      expect(data.totalCourseCompletions).toBe(1);
      expect(data.portfolioCompletionRate).toBe(100);
      expect(data.activeLearners30d).toBe(1);
      expect(data.courseBreakdown.length).toBe(1);
      expect(data.courseBreakdown[0].totalEnrolled).toBe(1);
      expect(data.courseBreakdown[0].completedCount).toBe(1);
      expect(data.courseBreakdown[0].completionRate).toBe(100);
      expect(data.courseBreakdown[0].averageProgressPercentage).toBe(100);
    });

    it('1.3 should maintain cross-instructor isolation (Instructor 2 cannot see Instructor 1 courses)', async () => {
      cacheService.clearMemoryCache();

      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/overview')
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(200);
      const data: InstructorAnalyticsOverviewDto = res.body.data;
      // Instructor 2 has zero enrollments on Course 2
      expect(data.totalUniqueStudents).toBe(0);
      expect(data.courseBreakdown.every((c) => c.courseId !== course1.id)).toBe(true);
    });
  });

  // =========================================================================
  // 2. INSTRUCTOR COURSE-LEVEL ANALYTICS DEEP DIVE
  // =========================================================================

  describe('2. Instructor Course Analytics Deep Dive (GET /api/v1/instructor/analytics/courses/:courseId)', () => {
    it('2.1 should return complete course analytics detail with trends, distribution, drop-off and quizzes', async () => {
      cacheService.clearMemoryCache();

      // Add a quiz attempt for quiz1
      await testDb.insert(schema.quizAttempts).values({
        quizId: quiz1.id,
        enrollmentId: (await testDb.select().from(schema.enrollments).where(eq(schema.enrollments.courseId, course1.id)))[0].id,
        studentId,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 85,
        totalPoints: 100,
        percentage: '85.00',
        isPassed: true,
        submittedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}?startDate=2026-10-01&endDate=2026-10-13&interval=day`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data: CourseAnalyticsDetailDto = res.body.data;

      // Metrics
      expect(data.courseId).toBe(course1.id);
      expect(data.courseTitle).toBe('Advanced Graph Algorithms');
      expect(data.metrics.totalEnrolled).toBe(1);
      expect(data.metrics.totalCompleted).toBe(1);
      expect(data.metrics.completionRate).toBe(100);
      expect(typeof data.metrics.averageDaysToComplete).toBe('number');
      expect(data.metrics.activeLearners30d).toBe(1);

      // Enrollment Trend (daily zero-filled)
      expect(data.enrollmentTrend.length).toBeGreaterThan(0);
      const oct1 = data.enrollmentTrend.find((p) => p.date === '2026-10-01');
      expect(oct1).toBeDefined();
      expect(oct1?.count).toBe(1);

      // Progress Distribution (1 student at 100%)
      expect(data.progressDistribution.length).toBe(6);
      const bucket100 = data.progressDistribution.find((b) => b.bracket === '100%');
      expect(bucket100?.studentCount).toBe(1);
      expect(bucket100?.percentage).toBe(100);

      // Lesson Drop-off
      expect(data.lessonDropOff.length).toBe(2);
      expect(data.lessonDropOff[0].lessonTitle).toBe('Lesson 1.1: Dijkstra Algorithm');
      expect(data.lessonDropOff[0].completedLearnersCount).toBe(1);
      expect(data.lessonDropOff[0].dropOffRateFromPrior).toBe(0);

      // Quiz Performance
      expect(data.quizPerformance.length).toBe(1);
      expect(data.quizPerformance[0].quizTitle).toBe('Shortest Paths Quiz');
      expect(data.quizPerformance[0].totalAttempts).toBe(1);
      expect(data.quizPerformance[0].uniqueStudents).toBe(1);
      expect(data.quizPerformance[0].passRate).toBe(100);
      expect(data.quizPerformance[0].averageScorePercentage).toBe(85);
    });

    it('2.2 should reject invalid date range where startDate > endDate', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}?startDate=2026-10-20&endDate=2026-10-01`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('2.3 should reject invalid course ID format with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/courses/not-a-valid-uuid')
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('2.4 should return HTTP 404 if course does not exist', async () => {
      const randomUuid = '00000000-0000-0000-0000-000000000099';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${randomUuid}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. MULTI-TENANT CONTEXTUAL AUTHORIZATION & OWNERSHIP ENFORCEMENT
  // =========================================================================

  describe('3. Multi-Tenant Authorization & Ownership Security Invariants', () => {
    it('3.1 should block Instructor 2 from accessing Instructor 1 course analytics with HTTP 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('3.2 should allow Administrator to access any course analytics (Superuser rule)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(course1.id);
    });

    it('3.3 should block students from accessing instructor analytics endpoints with HTTP 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/overview')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('3.4 should block unauthenticated requests with HTTP 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/instructor/analytics/overview');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 4. PLATFORM ADMINISTRATOR ANALYTICS
  // =========================================================================

  describe('4. Platform Administrator Analytics (GET /api/v1/admin/analytics/*)', () => {
    it('4.1 should return global platform metrics overview for administrator', async () => {
      cacheService.clearMemoryCache();

      // Seed a pending course review request
      await testDb.insert(schema.courseReviewRequests).values({
        courseId: course2.id,
        instructorId: instructor2Id,
        status: 'PENDING',
        submissionNotes: 'Ready for catalog review',
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/overview')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data: AdminAnalyticsOverviewDto = res.body.data;
      expect(data.totalPublishedCourses).toBeGreaterThanOrEqual(2);
      expect(data.totalRegisteredStudents).toBeGreaterThanOrEqual(1);
      expect(data.totalActiveInstructors).toBeGreaterThanOrEqual(2);
      expect(data.platformWideEnrollments).toBeGreaterThanOrEqual(1);
      expect(data.reviewQueue.pendingReviewsCount).toBe(1);
    });

    it('4.2 should return paginated course analytics with sorting and status filtering', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/courses?page=1&limit=10&status=PUBLISHED&sortBy=enrollments&sortOrder=desc')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('4.3 should deny non-admin users from accessing admin analytics with HTTP 403', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/overview')
        .set('Cookie', instructor1Cookies);
      expect(res1.status).toBe(403);

      const res2 = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/overview')
        .set('Cookie', studentCookies);
      expect(res2.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. STUDENT PERSONAL LEARNING ENGAGEMENT
  // =========================================================================

  describe('5. Student Personal Learning Engagement (GET /api/v1/learn/analytics/engagement)', () => {
    it('5.1 should return personal engagement counters for authenticated student', async () => {
      // Issue a certificate for the student in Course 1
      const [cert] = await testDb
        .insert(schema.certificates)
        .values({
          certificateNumber: 'CERT-2026-TEST-001',
          enrollmentId: (await testDb.select().from(schema.enrollments).where(eq(schema.enrollments.studentId, studentId)))[0].id,
          courseId: course1.id,
          studentId,
          studentName: 'Test Student',
          courseTitle: 'Advanced Graph Algorithms',
          instructorName: 'Dr. Sarah Mitchell',
          completedAt: new Date(),
          status: 'ACTIVE',
        })
        .returning();

      expect(cert).toBeDefined();

      const res = await request(app.getHttpServer())
        .get('/api/v1/learn/analytics/engagement')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data: StudentLearningEngagementDto = res.body.data;
      expect(data.enrolledCoursesCount).toBe(1);
      expect(data.completedCertificatesCount).toBe(1);
    });

    it('5.2 should reject unauthenticated requests to student engagement with HTTP 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/learn/analytics/engagement');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 6. CACHING & PERFORMANCE BEHAVIOR
  // =========================================================================

  describe('6. Analytics Caching & Resilience Behavior', () => {
    it('6.1 should serve cached overview on subsequent call without database mutations', async () => {
      cacheService.clearMemoryCache();

      // First call (cache miss)
      const res1 = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/overview')
        .set('Cookie', instructor1Cookies);
      expect(res1.status).toBe(200);

      // Verify item exists in cache
      const key = cacheService.buildInstructorOverviewKey(instructor1Id);
      const cached = await cacheService.get<InstructorAnalyticsOverviewDto>(key);
      expect(cached).toBeDefined();
      expect(cached?.totalUniqueStudents).toBe(res1.body.data.totalUniqueStudents);

      // Second call (cache hit)
      const res2 = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/overview')
        .set('Cookie', instructor1Cookies);
      expect(res2.status).toBe(200);
      expect(res2.body.data).toEqual(res1.body.data);
    });

    it('6.2 should fail-open gracefully when cache is cleared or invalidated', async () => {
      cacheService.clearMemoryCache();

      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/overview')
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('6.3 should handle default date ranges and weekly intervals without error', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}?interval=week`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollmentTrend).toBeDefined();
      expect(Array.isArray(res.body.data.enrollmentTrend)).toBe(true);
    });
  });

  // =========================================================================
  // 7. SANITIZED ERROR RESPONSES & SECURITY HYGIENE
  // =========================================================================

  describe('7. Sanitized Error Handling & Secret Protection', () => {
    it('7.1 should not leak database stack traces, SQL strings, or credentials on validation failure', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}?interval=invalid-interval`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('SELECT ');
      expect(bodyStr).not.toContain('FROM ');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('DATABASE_URL');
      expect(bodyStr).not.toContain('techsprout');
    });

    it('7.2 should support searching courses by title in admin course analytics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/courses?search=Graph')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].title).toBe('Advanced Graph Algorithms');
    });

    it('7.3 should support sorting courses by title and createdAt in admin course analytics', async () => {
      const resByTitle = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/courses?sortBy=title&sortOrder=asc')
        .set('Cookie', adminCookies);

      expect(resByTitle.status).toBe(200);
      expect(resByTitle.body.success).toBe(true);
      const items = resByTitle.body.data.items;
      if (items.length >= 2) {
        expect(items[0].title.localeCompare(items[1].title)).toBeLessThanOrEqual(0);
      }

      const resByDate = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/courses?sortBy=createdAt&sortOrder=desc')
        .set('Cookie', adminCookies);

      expect(resByDate.status).toBe(200);
      expect(resByDate.body.success).toBe(true);
    });
  });
});

