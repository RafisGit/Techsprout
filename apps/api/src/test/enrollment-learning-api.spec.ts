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
import { env } from '../config/env.config';

describe('P3.2 — Enrollment & Learning REST API Integration Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  let adminCookies: string[];
  let studentCookies: string[];
  let student2Cookies: string[];
  let instructorCookies: string[];

  let adminId: string;
  let studentId: string;
  let student2Id: string;
  let instructorId: string;

  let testCategory: any;
  let inactiveCategory: any;
  let publishedCourse: any;
  let draftCourse: any;
  let archivedCourse: any;
  let privateCourse: any;

  let testModule: any;
  let videoLesson: any;
  let textLesson: any;
  let pdfLesson: any;
  let testMedia: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // Seed student2
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Student2Password123!');
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Bob Learner',
        username: 'student2',
        email: 'student2@techsprout.edu',
        phone: '01711111199',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = st2.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // Retrieve seed users
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

    const [instructorUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));
    instructorId = instructorUser.id;

    // Seed test media
    const [med] = await testDb
      .insert(schema.media)
      .values({
        storageProvider: 'CLOUDINARY',
        storageKey: 'techsprout/videos/lessons/game-dev-1',
        publicUrl: 'https://res.cloudinary.com/test/video/upload/game-dev-1.mp4',
        originalFilename: 'game-dev-1.mp4',
        mimeType: 'video/mp4',
        fileSize: 10485760,
        durationSeconds: 100,
      })
      .returning();
    testMedia = med;

    // Seed categories
    const [activeCat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Game Development',
        slug: 'game-development',
        isActive: true,
      })
      .returning();
    testCategory = activeCat;

    const [inactCat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Deprecated Category',
        slug: 'deprecated-category',
        isActive: false,
      })
      .returning();
    inactiveCategory = inactCat;

    // Seed courses
    const [pubCourse] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Mastering Unity 3D',
        slug: 'mastering-unity-3d',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: instructorId,
        thumbnailMediaId: testMedia.id,
      })
      .returning();
    publishedCourse = pubCourse;

    const [drCourse] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Unpublished Draft Course',
        slug: 'unpublished-draft-course',
        status: 'DRAFT',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: instructorId,
      })
      .returning();
    draftCourse = drCourse;

    const [arcCourse] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Legacy Archived Course',
        slug: 'legacy-archived-course',
        status: 'ARCHIVED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: instructorId,
      })
      .returning();
    archivedCourse = arcCourse;

    const [privCourse] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Private Executive Cohort Course',
        slug: 'private-executive-cohort-course',
        status: 'PUBLISHED',
        visibility: 'PRIVATE',
        categoryId: testCategory.id,
        instructorId: instructorId,
      })
      .returning();
    privateCourse = privCourse;

    // Seed module and lessons in published course
    const [mod1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: publishedCourse.id,
        title: 'Module 1: Foundations',
        position: 1,
      })
      .returning();
    testModule = mod1;

    // Lesson 1: VIDEO (100 seconds duration)
    const [les1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: testModule.id,
        title: 'Introduction to Unity Editor',
        lessonType: 'VIDEO',
        position: 1,
        durationSeconds: 100,
        mediaId: testMedia.id,
        isPreview: true,
      })
      .returning();
    videoLesson = les1;

    // Lesson 2: TEXT
    const [les2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: testModule.id,
        title: 'Unity Architecture & Lifecycle',
        lessonType: 'TEXT',
        position: 2,
        durationSeconds: 300,
        content: '# Unity Lifecycle Overview\n\nAwake -> OnEnable -> Start -> Update',
        isPreview: false,
      })
      .returning();
    textLesson = les2;

    // Lesson 3: PDF
    const [les3] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: testModule.id,
        title: 'Game Design Document Template',
        lessonType: 'PDF',
        position: 3,
        durationSeconds: 600,
        content: 'https://res.cloudinary.com/test/raw/upload/gdd-template.pdf',
        isPreview: false,
      })
      .returning();
    pdfLesson = les3;

    // Build NestJS application
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

    // Authenticate users
    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];

    const studentLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = studentLogin.headers['set-cookie'] as unknown as string[];

    const student2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student2@techsprout.edu',
      password: 'Student2Password123!',
    });
    student2Cookies = student2Login.headers['set-cookie'] as unknown as string[];

    const instLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructorCookies = instLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testPool) {
      await testPool.end();
    }
  });

  describe('1. Self-Enrollment & Eligibility (POST /api/v1/enrollments)', () => {
    it('should reject unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .send({ courseId: publishedCourse.id });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('should reject enrollment in a DRAFT course with 404 COURSE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: draftCourse.id });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('COURSE_NOT_FOUND');
    });

    it('should reject enrollment in an ARCHIVED course with 422 COURSE_ARCHIVED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: archivedCourse.id });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('COURSE_ARCHIVED');
    });

    it('should reject self-enrollment in a PRIVATE course with 403 PRIVATE_COURSE', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: privateCourse.id });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('PRIVATE_COURSE');
    });

    it('should reject enrollment if parent category is inactive with 404 COURSE_NOT_FOUND', async () => {
      // Create course in inactive category
      const [courseInInactiveCat] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Course with inactive category',
          slug: 'inactive-category-course',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: inactiveCategory.id,
          instructorId,
        })
        .returning();

      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: courseInInactiveCat.id });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('COURSE_NOT_FOUND');
    });

    it('should allow student to self-enroll in published course with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: publishedCourse.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(publishedCourse.id);
      expect(res.body.data.studentId).toBe(studentId);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.startedAt).toBeNull();
      expect(res.body.data.completedAt).toBeNull();
      expect(res.body.data.progressPercentage).toBe(0);

      // Verify audit log
      const [audit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'ENROLLMENT_CREATED'),
            eq(schema.auditLogs.targetId, res.body.data.id)
          )
        );
      expect(audit).toBeDefined();
      expect(audit.actorId).toBe(studentId);
    });

    it('should be idempotent: re-enrolling in ACTIVE course returns 200 OK without duplicate row', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: publishedCourse.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Already enrolled in this course');
      expect(res.body.data.status).toBe('ACTIVE');

      // Verify DB row count is still 1
      const rows = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, publishedCourse.id)
          )
        );
      expect(rows.length).toBe(1);
    });

    it('should strip client-supplied studentId on self-enrollment (no IDOR / impersonation)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', student2Cookies)
        .send({
          courseId: publishedCourse.id,
          studentId: adminId, // Attacker tries to enroll admin or another student
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // Must be enrolled as student2 (req.user.id), NOT admin
      expect(res.body.data.studentId).toBe(student2Id);
    });

    it('should allow instructors to self-enroll in published courses, including own authored course', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', instructorCookies)
        .send({ courseId: publishedCourse.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.studentId).toBe(instructorId);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should allow admin to self-enroll as learner in published course', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', adminCookies)
        .send({ courseId: publishedCourse.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.studentId).toBe(adminId);
    });
  });

  describe('2. Admin-Assigned Enrollment (POST /api/v1/admin/courses/:courseId/enrollments)', () => {
    it('should block non-admin students from calling admin enrollment endpoint with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${publishedCourse.id}/enrollments`)
        .set('Cookie', studentCookies)
        .send({ studentId: student2Id });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('should block instructors from calling admin enrollment endpoint with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${publishedCourse.id}/enrollments`)
        .set('Cookie', instructorCookies)
        .send({ studentId: student2Id });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('should reject admin enrollment if target student does not exist with 404 STUDENT_NOT_FOUND', async () => {
      const fakeStudentId = 'a0000000-0000-0000-0000-000000000099';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${publishedCourse.id}/enrollments`)
        .set('Cookie', adminCookies)
        .send({ studentId: fakeStudentId });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('STUDENT_NOT_FOUND');
    });

    it('should reject admin enrollment if target student is inactive with 422 STUDENT_INELIGIBLE', async () => {
      const [inactiveUser] = await testDb
        .insert(schema.users)
        .values({
          name: 'Inactive Learner',
          username: 'inactivestudent',
          email: 'inactive@techsprout.edu',
          isActive: false,
        })
        .returning();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${publishedCourse.id}/enrollments`)
        .set('Cookie', adminCookies)
        .send({ studentId: inactiveUser.id });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('STUDENT_INELIGIBLE');
    });

    it('should allow admin to assign enrollment to student into private course with 201 Created and audit', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${privateCourse.id}/enrollments`)
        .set('Cookie', adminCookies)
        .send({ studentId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(privateCourse.id);
      expect(res.body.data.studentId).toBe(studentId);

      // Verify audit trail
      const [audit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'ENROLLMENT_CREATED'),
            eq(schema.auditLogs.targetId, res.body.data.id)
          )
        );
      expect(audit).toBeDefined();
      expect(audit.actorId).toBe(adminId);
      const meta = JSON.parse(audit.metadata);
      expect(meta.type).toBe('ADMIN_ASSIGNED');
      expect(meta.enrolledBy).toBe(adminId);
    });

    it('should be idempotent on admin assignment for already enrolled student (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${privateCourse.id}/enrollments`)
        .set('Cookie', adminCookies)
        .send({ studentId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Student is already enrolled in this course');
    });
  });

  describe('3. Enrollment Cancellation & Reactivation (POST /api/v1/enrollments/:id/cancel)', () => {
    let student2EnrollmentId: string;

    beforeAll(async () => {
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, student2Id),
            eq(schema.enrollments.courseId, publishedCourse.id)
          )
        );
      student2EnrollmentId = enr.id;
    });

    it('should prevent student A from cancelling student B enrollment (403 Forbidden IDOR check)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/enrollments/${student2EnrollmentId}/cancel`)
        .set('Cookie', studentCookies) // Student 1 attempting to cancel Student 2's enrollment
        .send();

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('should allow student to cancel their own enrollment with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/enrollments/${student2EnrollmentId}/cancel`)
        .set('Cookie', student2Cookies)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');

      // Verify audit log
      const [audit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'ENROLLMENT_CANCELLED'),
            eq(schema.auditLogs.targetId, student2EnrollmentId)
          )
        );
      expect(audit).toBeDefined();
    });

    it('should reactivate a CANCELLED enrollment on re-enrollment with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', student2Cookies)
        .send({ courseId: publishedCourse.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
    });
  });

  describe('4. Enrollment Status & Listing Endpoints', () => {
    it('GET /api/v1/courses/:courseId/enrollment returns isEnrolled: true for enrolled student', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${publishedCourse.id}/enrollment`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEnrolled).toBe(true);
      expect(res.body.data.enrollment.status).toBe('ACTIVE');
    });

    it('GET /api/v1/courses/:courseId/enrollment returns isEnrolled: false for non-enrolled course', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${draftCourse.id}/enrollment`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEnrolled).toBe(false);
      expect(res.body.data.enrollment).toBeNull();
    });

    it('GET /api/v1/enrollments returns authenticated user enrolled courses list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);

      const pubItem = res.body.data.items.find((i: any) => i.course.id === publishedCourse.id);
      expect(pubItem).toBeDefined();
      expect(pubItem.enrollmentId).toBeDefined();
      expect(pubItem.course.title).toBeDefined();
      expect(pubItem.progress).toBeDefined();
      expect(pubItem.progress.totalLessons).toBe(3);
    });

    it('GET /api/v1/admin/courses/:id/enrollments returns course roster for admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${publishedCourse.id}/enrollments`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalEnrolled).toBeGreaterThanOrEqual(2);
      expect(res.body.data.items[0].student.email).toBeDefined();
    });

    it('GET /api/v1/admin/courses/:id/enrollments allows course instructor to view their own roster', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${publishedCourse.id}/enrollments`)
        .set('Cookie', instructorCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('5. Protected Learning Workspace Access Control', () => {
    it('unauthenticated guest requesting curriculum receives 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/learn/courses/${publishedCourse.id}/curriculum`
      );

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('unauthenticated guest requesting lesson content receives 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/learn/courses/${publishedCourse.id}/lessons/${videoLesson.id}`
      );

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('unenrolled student requesting curriculum receives 403 ENROLLMENT_REQUIRED', async () => {
      // Create fresh unenrolled course
      const [otherCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Unenrolled Advanced Course',
          slug: 'unenrolled-advanced-course',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId,
        })
        .returning();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${otherCourse.id}/curriculum`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ENROLLMENT_REQUIRED');
    });

    it('unenrolled student requesting protected lesson content receives 403 ENROLLMENT_REQUIRED', async () => {
      // Create fresh unenrolled course and lesson
      const [otherCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Other Course',
          slug: 'other-course-access',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId,
        })
        .returning();

      const [otherMod] = await testDb
        .insert(schema.modules)
        .values({
          courseId: otherCourse.id,
          title: 'Other Module',
          position: 1,
        })
        .returning();

      const [otherLes] = await testDb
        .insert(schema.lessons)
        .values({
          moduleId: otherMod.id,
          title: 'Other Lesson',
          position: 1,
          lessonType: 'VIDEO',
        })
        .returning();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${otherCourse.id}/lessons/${otherLes.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ENROLLMENT_REQUIRED');
    });

    it('cross-course IDOR: requesting lesson with incorrect courseId returns 404 LESSON_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${privateCourse.id}/lessons/${videoLesson.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('LESSON_NOT_FOUND');
    });

    it('enrolled student receives full curriculum with virtual NOT_STARTED progress', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(publishedCourse.id);
      expect(res.body.data.modules.length).toBe(1);
      expect(res.body.data.modules[0].lessons.length).toBe(3);

      // Verify lazy allocation: lessons have NOT_STARTED virtual status
      const l1 = res.body.data.modules[0].lessons[0];
      expect(l1.progress.status).toBe('NOT_STARTED');
    });

    it('enrolled student accessing lesson content receives mediaUrl, content, navigation, and sets startedAt', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${publishedCourse.id}/lessons/${videoLesson.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Introduction to Unity Editor');
      expect(res.body.data.mediaUrl).toBe(testMedia.publicUrl);
      expect(res.body.data.navigation.nextLessonId).toBe(textLesson.id);
      expect(res.body.data.progress.status).toBe('IN_PROGRESS');

      // Verify startedAt was recorded on the enrollment
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, publishedCourse.id)
          )
        );
      expect(enr.startedAt).toBeInstanceOf(Date);
    });

    it('archived course allows existing enrolled learners full access to study and resume', async () => {
      // First, enroll student2 in archivedCourse directly in DB (as if enrolled before archival)
      await testDb.insert(schema.enrollments).values({
        studentId: student2Id,
        courseId: archivedCourse.id,
        status: 'ACTIVE',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${archivedCourse.id}/curriculum`)
        .set('Cookie', student2Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseStatus).toBe('ARCHIVED');
    });
  });

  describe('6. Video Progress Checkpointing & Automatic Completion Threshold', () => {
    it('saves video progress checkpoint without creating an audit log (no checkpoint spam)', async () => {
      const auditCountBefore = (await testDb.select().from(schema.auditLogs)).length;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/courses/${publishedCourse.id}/lessons/${videoLesson.id}/progress`)
        .set('Cookie', studentCookies)
        .send({ watchPositionSeconds: 30 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.watchPositionSeconds).toBe(30);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.isCompleted).toBe(false);

      const auditCountAfter = (await testDb.select().from(schema.auditLogs)).length;
      expect(auditCountAfter).toBe(auditCountBefore); // NO AUDIT SPAM
    });

    it('automatically transitions VIDEO lesson to COMPLETED at >= 90% duration (90s / 100s)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/courses/${publishedCourse.id}/lessons/${videoLesson.id}/progress`)
        .set('Cookie', studentCookies)
        .send({ watchPositionSeconds: 90 }); // 90% of 100s duration

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.isCompleted).toBe(true);
      expect(res.body.data.courseProgressPercentage).toBe(33); // 1 out of 3 lessons = 33%

      // Verify audit was recorded for the completion milestone
      const [audit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'LESSON_COMPLETED'),
            eq(schema.auditLogs.targetId, videoLesson.id)
          )
        );
      expect(audit).toBeDefined();
      expect(audit.actorId).toBe(studentId);
    });
  });

  describe('7. Explicit Lesson Completion & Reversal (POST /api/v1/learn/.../complete)', () => {
    it('marks TEXT lesson complete via /complete endpoint and records audit', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/courses/${publishedCourse.id}/lessons/${textLesson.id}/complete`)
        .set('Cookie', studentCookies)
        .send({ completed: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.courseProgress.completedLessons).toBe(2);
      expect(res.body.data.courseProgress.percentage).toBe(67); // 2 out of 3 = 67%
      expect(res.body.data.courseProgress.isCourseCompleted).toBe(false);
    });

    it('marks PDF lesson complete, reaching 100% course completion and transitioning enrollment to COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/courses/${publishedCourse.id}/lessons/${pdfLesson.id}/complete`)
        .set('Cookie', studentCookies)
        .send({ completed: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.courseProgress.completedLessons).toBe(3);
      expect(res.body.data.courseProgress.totalLessons).toBe(3);
      expect(res.body.data.courseProgress.percentage).toBe(100);
      expect(res.body.data.courseProgress.isCourseCompleted).toBe(true);

      // Verify enrollment transitioned to COMPLETED in database
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, publishedCourse.id)
          )
        );
      expect(enr.status).toBe('COMPLETED');
      expect(enr.completedAt).toBeInstanceOf(Date);

      // Verify ENROLLMENT_COMPLETED audit log
      const [audit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'ENROLLMENT_COMPLETED'),
            eq(schema.auditLogs.targetId, enr.id)
          )
        );
      expect(audit).toBeDefined();
    });

    it('reverses completion: marking a lesson incomplete reverts enrollment to ACTIVE and completedAt to null', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/courses/${publishedCourse.id}/lessons/${pdfLesson.id}/complete`)
        .set('Cookie', studentCookies)
        .send({ completed: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.completedAt).toBeNull();
      expect(res.body.data.courseProgress.percentage).toBe(67);
      expect(res.body.data.courseProgress.isCourseCompleted).toBe(false);

      // Verify enrollment reverted to ACTIVE
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, publishedCourse.id)
          )
        );
      expect(enr.status).toBe('ACTIVE');
      expect(enr.completedAt).toBeNull();

      // Verify LESSON_UNCOMPLETED audit
      const [audit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'LESSON_UNCOMPLETED'),
            eq(schema.auditLogs.targetId, pdfLesson.id)
          )
        );
      expect(audit).toBeDefined();
    });
  });

  describe('8. Resume Learning Logic & Loop-back Safety', () => {
    it('returns the most recently accessed IN_PROGRESS lesson', async () => {
      // Access textLesson checkpoint to make it recently accessed
      await request(app.getHttpServer())
        .post(`/api/v1/learn/courses/${publishedCourse.id}/lessons/${pdfLesson.id}/progress`)
        .set('Cookie', studentCookies)
        .send({ watchPositionSeconds: 45 });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${publishedCourse.id}/resume`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lessonId).toBe(pdfLesson.id);
      expect(res.body.data.isCourseCompleted).toBe(false);
    });

    it('resets watchPositionSeconds to 0 if learner previously watched to >= 95% of duration', async () => {
      // Re-mark text and pdf complete so only video is tested
      // Set video progress to 96 seconds out of 100 seconds (96% >= 95%)
      await testDb
        .update(schema.lessonProgress)
        .set({ watchPositionSeconds: 96, status: 'IN_PROGRESS' })
        .where(and(eq(schema.lessonProgress.lessonId, videoLesson.id)));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${publishedCourse.id}/resume`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      if (res.body.data.lessonId === videoLesson.id) {
        expect(res.body.data.watchPositionSeconds).toBe(0); // Clamped to 0
      }
    });
  });

  describe('9. Curricular Expansion & Lesson Deletion Conflict Protection', () => {
    it('blocks lesson deletion when student progress records exist with 409 Conflict LESSON_HAS_STUDENT_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/lessons/${videoLesson.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('LESSON_HAS_STUDENT_PROGRESS');
      expect(res.body.details.progressCount).toBeGreaterThanOrEqual(1);
    });

    it('adding a new required lesson to a completed course reverts enrollment to ACTIVE with null completedAt', async () => {
      // First, complete all existing lessons for student2
      const [st2Enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, student2Id),
            eq(schema.enrollments.courseId, publishedCourse.id)
          )
        );

      await testDb
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: new Date() })
        .where(eq(schema.enrollments.id, st2Enr.id));

      // Now add a 4th lesson via admin API
      const addLessonRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${testModule.id}/lessons`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Bonus Lesson: Advanced Optimization',
          lessonType: 'TEXT',
          position: 4,
          durationSeconds: 400,
        });

      expect(addLessonRes.status).toBe(201);

      // Verify that student2 enrollment status was reverted from COMPLETED to ACTIVE
      const [revertedEnr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, st2Enr.id));

      expect(revertedEnr.status).toBe('ACTIVE');
      expect(revertedEnr.completedAt).toBeNull();
    });
  });
});
