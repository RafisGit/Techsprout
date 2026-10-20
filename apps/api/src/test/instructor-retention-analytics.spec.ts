import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { AnalyticsCacheService } from '../modules/analytics/analytics.cache.service';
import type { VideoRetentionCurveDto } from '@techsprout/contracts';

describe('WP-P7-02: Video Playback Telemetry & Retention Analytics API Test Suite', () => {
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

  let course1: any; // Owned by Instructor 1
  let course2: any; // Owned by Instructor 2
  let module1: any;
  let lesson1: any; // 100s duration
  let lesson2: any; // 200s duration

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

    const [stdUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentId = stdUser.id;

    // 2. Create Instructor 2 (for resource-ownership boundary testing)
    instructor2Id = crypto.randomUUID();
    await testDb.insert(schema.users).values({
      id: instructor2Id,
      name: 'Second Instructor',
      username: 'instructor2',
      email: 'instructor2@techsprout.edu',
      passwordHash: await CryptoUtil.hashPassword('Instructor2Password123!'),
      authProvider: 'LOCAL',
    });

    const [instRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'));

    await testDb.insert(schema.userRoles).values({
      userId: instructor2Id,
      roleId: instRole.id,
    });

    // 3. Create Courses, Modules, Lessons
    let [cat] = await testDb.select().from(schema.categories).limit(1);
    if (!cat) {
      const [newCat] = await testDb
        .insert(schema.categories)
        .values({
          id: crypto.randomUUID(),
          name: 'Computer Science',
          slug: 'computer-science',
          isActive: true,
        })
        .returning();
      cat = newCat;
    }

    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        id: crypto.randomUUID(),
        instructorId: instructor1Id,
        categoryId: cat.id,
        title: 'Retention Test Course 1 (Instructor 1)',
        slug: 'retention-test-course-1',
        description: 'Testing video retention metrics',
        priceCents: 5000,
        currency: 'BDT',
        level: 'BEGINNER',
        status: 'PUBLISHED',
      })
      .returning();
    course1 = c1;

    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        id: crypto.randomUUID(),
        instructorId: instructor2Id,
        categoryId: cat.id,
        title: 'Retention Test Course 2 (Instructor 2)',
        slug: 'retention-test-course-2',
        description: 'Testing unowned course protection',
        priceCents: 5000,
        currency: 'BDT',
        level: 'BEGINNER',
        status: 'PUBLISHED',
      })
      .returning();
    course2 = c2;

    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        id: crypto.randomUUID(),
        courseId: course1.id,
        title: 'Module 1: Foundations',
        position: 1,
      })
      .returning();
    module1 = m1;

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        id: crypto.randomUUID(),
        moduleId: module1.id,
        title: 'Lesson 1: Intro to Retention (100s)',
        lessonType: 'VIDEO',
        position: 1,
        durationSeconds: 100,
      })
      .returning();
    lesson1 = l1;

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        id: crypto.randomUUID(),
        moduleId: module1.id,
        title: 'Lesson 2: Advanced Curves (200s)',
        lessonType: 'VIDEO',
        position: 2,
        durationSeconds: 200,
      })
      .returning();
    lesson2 = l2;

    // 4. Seed Telemetry Events for Course 1, Lesson 1
    // Learner 1: 95s / 100s (reaches 95% -> intervals 0..9)
    // Learner 2: 45s / 100s (reaches 45% -> intervals 0..4)
    // Learner 3: 15s / 100s (reaches 15% -> intervals 0..1)
    // Learner 4: 5s / 100s (reaches 5% -> interval 0)
    // Plus a rewind event at 35s (interval 3, 30-40%)
    const now = new Date();
    const hash1 = 'a'.repeat(64);
    const hash2 = 'b'.repeat(64);
    const hash3 = 'c'.repeat(64);
    const hash4 = 'd'.repeat(64);

    await testDb.insert(schema.learningEvents).values([
      // Learner 1 (started, checkpoint 50s, completed 95s)
      {
        id: crypto.randomUUID(),
        userId: hash1,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_STARTED',
        occurredAt: new Date(now.getTime() - 3000),
        metadata: { watchPositionSeconds: 0, totalDurationSeconds: 100 },
      },
      {
        id: crypto.randomUUID(),
        userId: hash1,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date(now.getTime() - 2000),
        metadata: { watchPositionSeconds: 50, totalDurationSeconds: 100 },
      },
      {
        id: crypto.randomUUID(),
        userId: hash1,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_COMPLETED',
        occurredAt: new Date(now.getTime() - 1000),
        metadata: { watchPositionSeconds: 95, totalDurationSeconds: 100 },
      },
      // Learner 2 (started, checkpoint 45s, and a rewind to 35s)
      {
        id: crypto.randomUUID(),
        userId: hash2,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_STARTED',
        occurredAt: new Date(now.getTime() - 4000),
        metadata: { watchPositionSeconds: 0, totalDurationSeconds: 100 },
      },
      {
        id: crypto.randomUUID(),
        userId: hash2,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date(now.getTime() - 2500),
        metadata: { watchPositionSeconds: 45, totalDurationSeconds: 100 },
      },
      {
        id: crypto.randomUUID(),
        userId: hash2,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_SEEKED',
        occurredAt: new Date(now.getTime() - 2000),
        metadata: { watchPositionSeconds: 35, previousPositionSeconds: 60, totalDurationSeconds: 100 },
      },
      // Learner 3 (checkpoint 15s)
      {
        id: crypto.randomUUID(),
        userId: hash3,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date(now.getTime() - 3500),
        metadata: { watchPositionSeconds: 15, totalDurationSeconds: 100 },
      },
      // Learner 4 (started, checkpoint 5s)
      {
        id: crypto.randomUUID(),
        userId: hash4,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_STARTED',
        occurredAt: new Date(now.getTime() - 5000),
        metadata: { watchPositionSeconds: 0, totalDurationSeconds: 100 },
      },
      {
        id: crypto.randomUUID(),
        userId: hash4,
        courseId: course1.id,
        moduleId: module1.id,
        lessonId: lesson1.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date(now.getTime() - 4500),
        metadata: { watchPositionSeconds: 5, totalDurationSeconds: 100 },
      },
    ]);

    // 5. Build NestJS App
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

    // 6. Login users to obtain valid authenticated session cookies
    const adminRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = (Array.isArray(adminRes.headers['set-cookie']) ? adminRes.headers['set-cookie'] : [adminRes.headers['set-cookie']].filter(Boolean)) as string[];

    const inst1Res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructor1Cookies = (Array.isArray(inst1Res.headers['set-cookie']) ? inst1Res.headers['set-cookie'] : [inst1Res.headers['set-cookie']].filter(Boolean)) as string[];

    const inst2Res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor2@techsprout.edu',
      password: 'Instructor2Password123!',
    });
    instructor2Cookies = (Array.isArray(inst2Res.headers['set-cookie']) ? inst2Res.headers['set-cookie'] : [inst2Res.headers['set-cookie']].filter(Boolean)) as string[];

    const studentRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = (Array.isArray(studentRes.headers['set-cookie']) ? studentRes.headers['set-cookie'] : [studentRes.headers['set-cookie']].filter(Boolean)) as string[];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPool) await testPool.end();
  });

  // =========================================================================
  // 1. AUTHENTICATION & ACCESS CONTROL
  // =========================================================================

  describe('1. Authentication & Role Authorization', () => {
    it('1.1 should reject unauthenticated requests with HTTP 401', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/instructor/analytics/courses/${course1.id}/retention`
      );

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('1.2 should reject student access with HTTP 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.3 should allow course owner (Instructor 1) with HTTP 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(course1.id);
    });

    it('1.4 should reject unowned course access (Instructor 2 accessing Course 1) with HTTP 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.5 should allow admin superuser access to any course with HTTP 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(course1.id);
    });
  });

  // =========================================================================
  // 2. INPUT VALIDATION & ROUTE HANDLING
  // =========================================================================

  describe('2. Input Validation & Route Handling', () => {
    it('2.1 should reject non-UUID course ID with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/analytics/courses/not-a-valid-uuid/retention')
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_ID');
    });

    it('2.2 should return HTTP 404 for non-existent course ID', async () => {
      const nonExistentId = crypto.randomUUID();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${nonExistentId}/retention`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('COURSE_NOT_FOUND');
    });

    it('2.3 should reject invalid date range format with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention?startDate=invalid-date`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('2.4 should reject non-existent lesson ID with HTTP 404', async () => {
      const nonExistentLesson = crypto.randomUUID();
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/instructor/analytics/courses/${course1.id}/retention?lessonId=${nonExistentLesson}`
        )
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('LESSON_NOT_FOUND');
    });
  });

  // =========================================================================
  // 3. RETENTION AGGREGATION & INTERVAL CALCULATION
  // =========================================================================

  describe('3. Retention Aggregation & 10% Interval Calculation', () => {
    it('3.1 should return empty retention structure for course with zero events', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course2.id}/retention`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(200);
      const data: VideoRetentionCurveDto = res.body.data;
      expect(data.courseId).toBe(course2.id);
      expect(data.totalUniqueViewers).toBe(0);
      expect(data.totalCheckpoints).toBe(0);
      expect(data.averageCompletionPercentage).toBe(0);
      expect(data.intervals).toHaveLength(10);
      expect(data.intervals[0].retentionPercentage).toBe(0);
      expect(data.intervals[0].viewerCount).toBe(0);
    });

    it('3.2 should correctly aggregate 10% retention curve and viewer counts', async () => {
      cacheService.clearMemoryCache();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention?lessonId=${lesson1.id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const data: VideoRetentionCurveDto = res.body.data;

      expect(data.courseId).toBe(course1.id);
      expect(data.lessonId).toBe(lesson1.id);
      expect(data.lessonTitle).toBe(lesson1.title);
      expect(data.totalUniqueViewers).toBe(4);
      expect(data.totalCheckpoints).toBe(4); // 4 VIDEO_CHECKPOINT events seeded

      // Verify 10 interval breakdown
      expect(data.intervals).toHaveLength(10);

      // Interval 0 (0-10%): all 4 learners reached >= 0% -> 4 viewers (100.0%)
      expect(data.intervals[0].intervalRange).toBe('0-10%');
      expect(data.intervals[0].viewerCount).toBe(4);
      expect(data.intervals[0].retentionPercentage).toBe(100.0);

      // Interval 1 (10-20%): learners 1, 2, 3 reached >= 10% -> 3 viewers (75.0%)
      expect(data.intervals[1].intervalRange).toBe('10-20%');
      expect(data.intervals[1].viewerCount).toBe(3);
      expect(data.intervals[1].retentionPercentage).toBe(75.0);

      // Interval 4 (40-50%): learners 1, 2 reached >= 40% -> 2 viewers (50.0%)
      expect(data.intervals[4].intervalRange).toBe('40-50%');
      expect(data.intervals[4].viewerCount).toBe(2);
      expect(data.intervals[4].retentionPercentage).toBe(50.0);

      // Interval 9 (90-100%): only learner 1 reached >= 90% (95s) -> 1 viewer (25.0%)
      expect(data.intervals[9].intervalRange).toBe('90-100%');
      expect(data.intervals[9].viewerCount).toBe(1);
      expect(data.intervals[9].retentionPercentage).toBe(25.0);

      // Verify average completion percentage: (100 [completed] + 45 + 15 + 5) / 4 = 165 / 4 = 41.3%
      expect(data.averageCompletionPercentage).toBe(41.3);
    });

    it('3.3 should record rewind heatmap count at the appropriate interval', async () => {
      cacheService.clearMemoryCache();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention?lessonId=${lesson1.id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const data: VideoRetentionCurveDto = res.body.data;

      // Rewind event was at 35s on 100s lesson (35% -> interval index 3, '30-40%')
      expect(data.intervals[3].intervalRange).toBe('30-40%');
      expect(data.intervals[3].rewindCount).toBe(1);

      // Intervals without rewinds have rewindCount 0
      expect(data.intervals[0].rewindCount).toBe(0);
      expect(data.intervals[9].rewindCount).toBe(0);
    });

    it('3.4 should serve cached retention metrics on repeat request', async () => {
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention?lessonId=${lesson1.id}`)
        .set('Cookie', instructor1Cookies);

      expect(res1.status).toBe(200);

      // Second identical request
      const res2 = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention?lessonId=${lesson1.id}`)
        .set('Cookie', instructor1Cookies);

      expect(res2.status).toBe(200);
      expect(res2.body.data).toEqual(res1.body.data);
    });
  });

  // =========================================================================
  // 4. PRIVACY, KILL SWITCH & OBSERVATIONAL SAFETY
  // =========================================================================

  describe('4. Privacy Controls & Observational Invariant', () => {
    it('4.1 should not leak pseudonymous user_id hashes or learner PII in retention response', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const responseString = JSON.stringify(res.body);

      // Check that none of the seeded 64-char hashes appear in the response payload
      expect(responseString).not.toContain('a'.repeat(64));
      expect(responseString).not.toContain('b'.repeat(64));
      expect(responseString).not.toContain('c'.repeat(64));
      expect(responseString).not.toContain('d'.repeat(64));
      expect(responseString).not.toContain(studentId);
    });

    it('4.2 should return zeroed safe retention metrics when TELEMETRY_ENABLED is false', async () => {
      const originalEnv = process.env.TELEMETRY_ENABLED;
      try {
        process.env.TELEMETRY_ENABLED = 'false';
        cacheService.clearMemoryCache();

        const res = await request(app.getHttpServer())
          .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention`)
          .set('Cookie', instructor1Cookies);

        expect(res.status).toBe(200);
        expect(res.body.data.telemetryEnabled).toBe(false);
        expect(res.body.data.totalUniqueViewers).toBe(0);
        expect(res.body.data.intervals).toHaveLength(10);
      } finally {
        process.env.TELEMETRY_ENABLED = originalEnv;
        cacheService.clearMemoryCache();
      }
    });

    it('4.3 should confirm retention queries do not mutate lesson_progress or certificates', async () => {
      const initialProgress = await testDb.select().from(schema.lessonProgress);
      const initialCerts = await testDb.select().from(schema.certificates);

      await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}/retention`)
        .set('Cookie', instructor1Cookies);

      const afterProgress = await testDb.select().from(schema.lessonProgress);
      const afterCerts = await testDb.select().from(schema.certificates);

      expect(afterProgress.length).toBe(initialProgress.length);
      expect(afterCerts.length).toBe(initialCerts.length);
    });
  });

  // =========================================================================
  // 5. FIX B: TRUE BACKWARD-SEEK DETECTION VS FORWARD-SEEK
  // =========================================================================

  describe('5. Fix B — True Backward-Seek vs Forward-Seek Detection', () => {
    let seekCourse: any;
    let seekModule: any;
    let seekLesson: any;

    beforeAll(async () => {
      const [sc] = await testDb
        .insert(schema.courses)
        .values({
          id: crypto.randomUUID(),
          instructorId: instructor1Id,
          categoryId: course1.categoryId,
          title: 'Seek Direction Test Course',
          slug: 'seek-direction-test-course',
          priceCents: 1000,
          currency: 'BDT',
          level: 'BEGINNER',
          status: 'PUBLISHED',
        })
        .returning();
      seekCourse = sc;

      const [sm] = await testDb
        .insert(schema.modules)
        .values({
          id: crypto.randomUUID(),
          courseId: seekCourse.id,
          title: 'Module Seek',
          position: 1,
        })
        .returning();
      seekModule = sm;

      const [sl] = await testDb
        .insert(schema.lessons)
        .values({
          id: crypto.randomUUID(),
          moduleId: seekModule.id,
          title: 'Lesson Seek (100s)',
          lessonType: 'VIDEO',
          position: 1,
          durationSeconds: 100,
        })
        .returning();
      seekLesson = sl;

      const testUserHash = 'seek-learner-' + 'x'.repeat(50);
      const now = new Date();

      await testDb.insert(schema.learningEvents).values([
        // 1. True backward seek: from 60s to 20s (lands in 20-30%, interval index 2)
        {
          id: crypto.randomUUID(),
          userId: testUserHash,
          courseId: seekCourse.id,
          moduleId: seekModule.id,
          lessonId: seekLesson.id,
          eventType: 'VIDEO_SEEKED',
          occurredAt: new Date(now.getTime() - 5000),
          metadata: { watchPositionSeconds: 20, previousPositionSeconds: 60, totalDurationSeconds: 100 },
        },
        // 2. Forward seek: from 20s to 80s (lands in 80-90%, interval index 8) - must NOT count as rewind
        {
          id: crypto.randomUUID(),
          userId: testUserHash,
          courseId: seekCourse.id,
          moduleId: seekModule.id,
          lessonId: seekLesson.id,
          eventType: 'VIDEO_SEEKED',
          occurredAt: new Date(now.getTime() - 4000),
          metadata: { watchPositionSeconds: 80, previousPositionSeconds: 20, totalDurationSeconds: 100 },
        },
        // 3. Seek with missing previousPositionSeconds: at 40s (interval index 4) - must NOT count as rewind
        {
          id: crypto.randomUUID(),
          userId: testUserHash,
          courseId: seekCourse.id,
          moduleId: seekModule.id,
          lessonId: seekLesson.id,
          eventType: 'VIDEO_SEEKED',
          occurredAt: new Date(now.getTime() - 3000),
          metadata: { watchPositionSeconds: 40, totalDurationSeconds: 100 },
        },
        // 4. Normal playback checkpoint (50s) - must NOT count as rewind
        {
          id: crypto.randomUUID(),
          userId: testUserHash,
          courseId: seekCourse.id,
          moduleId: seekModule.id,
          lessonId: seekLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          occurredAt: new Date(now.getTime() - 2000),
          metadata: { watchPositionSeconds: 50, totalDurationSeconds: 100 },
        },
      ]);
    });

    it('5.1 should increment rewindCount ONLY when previousPositionSeconds > watchPositionSeconds', async () => {
      cacheService.clearMemoryCache();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${seekCourse.id}/retention?lessonId=${seekLesson.id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const data: VideoRetentionCurveDto = res.body.data;

      // Backward seek landed in interval 2 (20-30%): rewindCount must be 1
      expect(data.intervals[2].rewindCount).toBe(1);

      // Forward seek landed in interval 8 (80-90%): rewindCount must be 0
      expect(data.intervals[8].rewindCount).toBe(0);

      // Missing previous-position seek landed in interval 4 (40-50%): rewindCount must be 0
      expect(data.intervals[4].rewindCount).toBe(0);

      // Checkpoint landed in interval 5 (50-60%): rewindCount must be 0
      expect(data.intervals[5].rewindCount).toBe(0);
    });
  });

  // =========================================================================
  // 6. MULTI-DAY VIEWER METRICS & DATE BOUNDARIES
  // =========================================================================

  describe('6. Multi-Day Viewer Metrics & Complete UTC Date Boundaries', () => {
    let multiDayCourse: any;
    let multiDayLesson: any;

    beforeAll(async () => {
      const [mc] = await testDb
        .insert(schema.courses)
        .values({
          id: crypto.randomUUID(),
          instructorId: instructor1Id,
          categoryId: course1.categoryId,
          title: 'Multi-Day Analytics Course',
          slug: 'multi-day-analytics-course',
          priceCents: 1000,
          currency: 'BDT',
          level: 'BEGINNER',
          status: 'PUBLISHED',
        })
        .returning();
      multiDayCourse = mc;

      const [mm] = await testDb
        .insert(schema.modules)
        .values({
          id: crypto.randomUUID(),
          courseId: multiDayCourse.id,
          title: 'Module Multi-Day',
          position: 1,
        })
        .returning();

      const [ml] = await testDb
        .insert(schema.lessons)
        .values({
          id: crypto.randomUUID(),
          moduleId: mm.id,
          title: 'Lesson Multi-Day (100s)',
          lessonType: 'VIDEO',
          position: 1,
          durationSeconds: 100,
        })
        .returning();
      multiDayLesson = ml;

      // Under ADR-P7-001 daily salt rotation, a single individual learner active across 2 UTC dates
      // produces two distinct pseudonyms: hashDay1 on 2026-10-15, hashDay2 on 2026-10-16
      const hashDay1 = 'user-hash-day1-' + '1'.repeat(48);
      const hashDay2 = 'user-hash-day2-' + '2'.repeat(48);

      await testDb.insert(schema.learningEvents).values([
        // Learner active on 2026-10-15
        {
          id: crypto.randomUUID(),
          userId: hashDay1,
          courseId: multiDayCourse.id,
          moduleId: mm.id,
          lessonId: multiDayLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          occurredAt: new Date('2026-10-15T14:30:00.000Z'),
          metadata: { watchPositionSeconds: 40, totalDurationSeconds: 100 },
        },
        // Same learner active on 2026-10-15 near the end of day (23:59:59.999Z)
        {
          id: crypto.randomUUID(),
          userId: hashDay1,
          courseId: multiDayCourse.id,
          moduleId: mm.id,
          lessonId: multiDayLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          occurredAt: new Date('2026-10-15T23:59:59.999Z'),
          metadata: { watchPositionSeconds: 60, totalDurationSeconds: 100 },
        },
        // Same learner active on 2026-10-16 with new rotated salt pseudonym
        {
          id: crypto.randomUUID(),
          userId: hashDay2,
          courseId: multiDayCourse.id,
          moduleId: mm.id,
          lessonId: multiDayLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          occurredAt: new Date('2026-10-16T10:00:00.000Z'),
          metadata: { watchPositionSeconds: 90, totalDurationSeconds: 100 },
        },
        // Event on next day (2026-10-17) - outside the 2-day query window
        {
          id: crypto.randomUUID(),
          userId: 'user-hash-day3-' + '3'.repeat(48),
          courseId: multiDayCourse.id,
          moduleId: mm.id,
          lessonId: multiDayLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          occurredAt: new Date('2026-10-17T00:00:00.000Z'),
          metadata: { watchPositionSeconds: 10, totalDurationSeconds: 100 },
        },
      ]);
    });

    it('6.1 should report Viewer-days and count 2 viewer-days for 1 learner active across 2 UTC dates', async () => {
      cacheService.clearMemoryCache();
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/instructor/analytics/courses/${multiDayCourse.id}/retention?lessonId=${multiDayLesson.id}&startDate=2026-10-15&endDate=2026-10-16`
        )
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const data: VideoRetentionCurveDto = res.body.data;

      // 1 person active on 2 UTC days contributes 2 viewer-days due to daily rotating salt
      expect(data.totalUniqueViewers).toBe(2);
      expect(data.viewerMetricLabel).toBe('Viewer-days');
      expect(data.isPartial).toBe(false);
    });

    it('6.2 should report Unique Viewers for single-day query', async () => {
      cacheService.clearMemoryCache();
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/instructor/analytics/courses/${multiDayCourse.id}/retention?lessonId=${multiDayLesson.id}&startDate=2026-10-15&endDate=2026-10-15`
        )
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const data: VideoRetentionCurveDto = res.body.data;

      expect(data.totalUniqueViewers).toBe(1);
      expect(data.viewerMetricLabel).toBe('Unique Viewers');
      // The event at 23:59:59.999Z was included (totalCheckpoints = 2 on that single day)
      expect(data.totalCheckpoints).toBe(2);
    });
  });

  // =========================================================================
  // 7. FIX C: BOUNDED 20,000 QUERY LIMIT & PARTIAL DATA INDICATOR
  // =========================================================================

  describe('7. Fix C — Defensible Bounded Query & Partial Data Indicator', () => {
    let boundedCourse: any;
    let boundedLesson: any;

    beforeAll(async () => {
      const [bc] = await testDb
        .insert(schema.courses)
        .values({
          id: crypto.randomUUID(),
          instructorId: instructor1Id,
          categoryId: course1.categoryId,
          title: 'Bounded Limit Test Course',
          slug: 'bounded-limit-test-course',
          priceCents: 1000,
          currency: 'BDT',
          level: 'BEGINNER',
          status: 'PUBLISHED',
        })
        .returning();
      boundedCourse = bc;

      const [bm] = await testDb
        .insert(schema.modules)
        .values({
          id: crypto.randomUUID(),
          courseId: boundedCourse.id,
          title: 'Module Bounded',
          position: 1,
        })
        .returning();

      const [bl] = await testDb
        .insert(schema.lessons)
        .values({
          id: crypto.randomUUID(),
          moduleId: bm.id,
          title: 'Lesson Bounded (100s)',
          lessonType: 'VIDEO',
          position: 1,
          durationSeconds: 100,
        })
        .returning();
      boundedLesson = bl;

      // Seed 20,005 events in chunks of 4,000 to test query bound
      const totalEventsToSeed = 20005;
      const chunkSize = 4000;
      const baseTime = Date.now();

      for (let offset = 0; offset < totalEventsToSeed; offset += chunkSize) {
        const count = Math.min(chunkSize, totalEventsToSeed - offset);
        const rows = Array.from({ length: count }, (_, idx) => ({
          id: crypto.randomUUID(),
          userId: `bounded-user-${(offset + idx) % 50}`,
          courseId: boundedCourse.id,
          moduleId: bm.id,
          lessonId: boundedLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          occurredAt: new Date(baseTime + (offset + idx) * 100),
          metadata: { watchPositionSeconds: 50, totalDurationSeconds: 100 },
        }));
        await testDb.insert(schema.learningEvents).values(rows);
      }
    }, 60_000);

    it('7.1 should mark isPartial: true, bound totalEventsScanned to 20,000, and include sampleNotice when exceeding limit', async () => {
      cacheService.clearMemoryCache();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${boundedCourse.id}/retention?lessonId=${boundedLesson.id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const data: VideoRetentionCurveDto = res.body.data;

      expect(data.isPartial).toBe(true);
      expect(data.totalEventsScanned).toBe(20000);
      expect(data.sampleNotice).toBeDefined();
      expect(data.sampleNotice).toContain('20,000');
      expect(data.totalCheckpoints).toBe(20000);
    });
  });
});
