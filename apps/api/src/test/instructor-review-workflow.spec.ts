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
import { eq, desc } from 'drizzle-orm';
import { env } from '../config/env.config';
import { CloudinaryService } from '../modules/media/cloudinary/cloudinary.service';

describe('P6.2 — WP-02: Instructor Core API & Course Review State Machine Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  let adminCookies: string[];
  let instructor1Cookies: string[];
  let instructor2Cookies: string[];
  let studentCookies: string[];

  let adminId: string;
  let instructor1Id: string;
  let instructor2Id: string;
  let studentId: string;

  let categoryId: string;
  let thumbnailMediaId: string;

  let course1Id: string;
  let course2Id: string;
  let incompleteCourseId: string;

  let module1Id: string;
  let lesson1Id: string;
  let quiz1Id: string;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // 1. Roles
    const [instructorRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'))
      .limit(1);

    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    // 2. Users: Admin, Instructor 1, Instructor 2, Student
    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'));
    adminId = adminUser.id;

    const [inst1User] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));
    instructor1Id = inst1User.id;

    const inst2PassHash = await CryptoUtil.hashPassword('Instructor2Password123!');
    const [inst2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Prof. Tariq Rahman',
        username: 'prof_tariq',
        email: 'tariq@techsprout.edu',
        phone: '01711223344',
        passwordHash: inst2PassHash,
        isVerified: true,
      })
      .returning();
    instructor2Id = inst2.id;
    await testDb.insert(schema.userRoles).values({
      userId: instructor2Id,
      roleId: instructorRole.id,
    });

    const [stdUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentId = stdUser.id;

    // 3. Category & Media
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Computer Architecture',
        slug: 'computer-architecture',
        description: 'Systems design and CPU architecture',
        isActive: true,
      })
      .returning();
    categoryId = cat.id;

    const [med] = await testDb
      .insert(schema.media)
      .values({
        storageProvider: 'CLOUDINARY',
        storageKey: 'techsprout/thumbnails/comp-arch',
        publicUrl: 'https://res.cloudinary.com/test/image/upload/comp-arch.png',
        originalFilename: 'comp-arch.png',
        mimeType: 'image/png',
        fileSize: 102400,
        uploaderId: instructor1Id,
      })
      .returning();
    thumbnailMediaId = med.id;

    // 4. Seed Course 1 owned by Instructor 1 (complete curriculum)
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Advanced Computer Architecture',
        slug: 'advanced-computer-architecture',
        shortDescription: 'Modern microarchitectures, superscalar execution, pipelining.',
        description: 'Comprehensive study of pipelining, out-of-order execution, and branch prediction.',
        instructorId: instructor1Id,
        categoryId: categoryId,
        thumbnailMediaId,
        price: '4500.00',
        currency: 'BDT',
        level: 'ADVANCED',
        status: 'DRAFT',
      })
      .returning();
    course1Id = c1.id;

    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course1Id,
        title: 'Module 1: Instruction Pipelining',
        description: 'Classic 5-stage RISC pipelines and hazards',
        position: 1,
      })
      .returning();
    module1Id = m1.id;

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1Id,
        title: 'Lesson 1: Pipelining Fundamentals',
        lessonType: 'TEXT',
        position: 1,
        content: 'Pipeline registers, hazards, and branch penalties.',
        isPreview: true,
      })
      .returning();
    lesson1Id = l1.id;

    const [q1] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1Id,
        title: 'Quiz 1: Pipeline Hazards',
        position: 1,
        quizType: 'KNOWLEDGE_CHECK',
        status: 'DRAFT',
      })
      .returning();
    quiz1Id = q1.id;

    // 5. Seed Course 2 owned by Instructor 2
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Operating Systems Internals',
        slug: 'operating-systems-internals',
        shortDescription: 'Kernel structures and virtual memory.',
        description: 'Deep dive into virtual memory management and page faults.',
        instructorId: instructor2Id,
        categoryId: categoryId,
        thumbnailMediaId,
        price: '3800.00',
        currency: 'BDT',
        level: 'INTERMEDIATE',
        status: 'DRAFT',
      })
      .returning();
    course2Id = c2.id;

    const [m2] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course2Id,
        title: 'Module 1: Virtual Memory',
        position: 1,
      })
      .returning();

    await testDb.insert(schema.lessons).values({
      moduleId: m2.id,
      title: 'Lesson 1: Paging and TLB',
      position: 1,
      lessonType: 'TEXT',
      content: 'TLB hit/miss latency analysis.',
    });

    // 6. Seed Incomplete Course (owned by Instructor 1, 0 modules)
    const [cIncomplete] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Incomplete Course Without Modules',
        slug: 'incomplete-course-no-modules',
        shortDescription: 'Empty shell.',
        description: 'No curriculum added yet.',
        instructorId: instructor1Id,
        categoryId: categoryId,
        thumbnailMediaId,
        price: '1000.00',
        currency: 'BDT',
        level: 'BEGINNER',
        status: 'DRAFT',
      })
      .returning();
    incompleteCourseId = cIncomplete.id;

    // 7. Compile TestingModule
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
      .overrideProvider(CloudinaryService)
      .useValue({
        isConfigured: () => true,
        uploadStream: async () => ({
          public_id: 'techsprout/mock',
          secure_url: 'https://res.cloudinary.com/test/mock.png',
        }),
        destroy: async () => ({ result: 'ok' }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    // 8. Authenticate users
    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];

    const inst1Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructor1Cookies = inst1Login.headers['set-cookie'] as unknown as string[];

    const inst2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'tariq@techsprout.edu',
      password: 'Instructor2Password123!',
    });
    instructor2Cookies = inst2Login.headers['set-cookie'] as unknown as string[];

    const stdLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = stdLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // 1. INSTRUCTOR AUTHENTICATION & ROLE-BASED ACCESS CONTROL
  // =========================================================================
  describe('1. Authentication & Role-Based Access Control', () => {
    it('1.1 should reject unauthenticated request to /api/v1/instructor/courses with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/instructor/courses');
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('1.2 should reject student accessing /api/v1/instructor/courses with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/courses')
        .set('Cookie', studentCookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.3 should reject student attempting to submit course for review with 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/submit-for-review`)
        .set('Cookie', studentCookies)
        .send({ submissionNotes: 'Hacking review' });
      expect(res.status).toBe(403);
    });

    it('1.4 should reject instructor accessing admin review queue with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/courses/review-queue')
        .set('Cookie', instructor1Cookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.5 should reject instructor attempting to approve review with 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/approve-review`)
        .set('Cookie', instructor1Cookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.6 should reject instructor attempting to directly publish course with 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/publish`)
        .set('Cookie', instructor1Cookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 2. INSTRUCTOR COURSE RETRIEVAL & IDOR ISOLATION
  // =========================================================================
  describe('2. Instructor Course Retrieval & IDOR Isolation', () => {
    it('2.1 should list only courses owned by Instructor 1', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/courses')
        .set('Cookie', instructor1Cookies);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();

      const items = res.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2);
      for (const course of items) {
        expect(course.instructor.id).toBe(instructor1Id);
      }
    });

    it('2.2 should list only courses owned by Instructor 2', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/courses')
        .set('Cookie', instructor2Cookies);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].id).toBe(course2Id);
      expect(items[0].instructor.id).toBe(instructor2Id);
    });

    it('2.3 should allow Instructor 1 to retrieve full details of owned course', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/courses/${course1Id}`)
        .set('Cookie', instructor1Cookies);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(course1Id);
      expect(res.body.data.modules.length).toBe(1);
      expect(res.body.data.modules[0].lessons.length).toBe(1);
    });

    it('2.4 should deny Instructor 2 from retrieving details of Instructor 1 course (IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/courses/${course1Id}`)
        .set('Cookie', instructor2Cookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');

      // Verify audit log recorded
      const [auditLog] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'UNAUTHORIZED_RESOURCE_ACCESS_ATTEMPT'))
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);

      expect(auditLog).toBeDefined();
      expect(auditLog.actorId).toBe(instructor2Id);
      expect(auditLog.targetId).toBe(course1Id);
    });
  });

  // =========================================================================
  // 3. PREFLIGHT CURRICULUM VALIDATION & SUBMISSION
  // =========================================================================
  describe('3. Preflight Curriculum Validation & Submission', () => {
    it('3.1 should reject course with 0 modules with INCOMPLETE_CURRICULUM', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${incompleteCourseId}/submit-for-review`)
        .set('Cookie', instructor1Cookies)
        .send({ submissionNotes: 'Please review my course' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INCOMPLETE_CURRICULUM');
      expect(res.body.details?.missingRequirements).toContain('Course must have at least one module');
    });

    it('3.2 should reject course missing thumbnail image with INCOMPLETE_CURRICULUM', async () => {
      // Create course without thumbnail
      const [noThumb] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Course Without Thumbnail',
          slug: 'course-without-thumbnail',
          shortDescription: 'Missing image',
          description: 'No image provided',
          instructorId: instructor1Id,
          categoryId,
          thumbnailMediaId: null,
          price: '2000.00',
          currency: 'BDT',
          status: 'DRAFT',
        })
        .returning();

      // Add module and lesson
      const [m] = await testDb
        .insert(schema.modules)
        .values({ courseId: noThumb.id, title: 'Mod 1', position: 1 })
        .returning();
      await testDb
        .insert(schema.lessons)
        .values({ moduleId: m.id, title: 'Les 1', position: 1, content: 'Content' });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${noThumb.id}/submit-for-review`)
        .set('Cookie', instructor1Cookies)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INCOMPLETE_CURRICULUM');
      expect(res.body.details?.missingRequirements).toContain('Course thumbnail image is required');
    });

    it('3.3 should reject course where modules have 0 lessons with INCOMPLETE_CURRICULUM', async () => {
      const [emptyModCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Course With Empty Module',
          slug: 'course-with-empty-module',
          shortDescription: 'Module has no lessons',
          description: 'Empty lessons module',
          instructorId: instructor1Id,
          categoryId,
          thumbnailMediaId,
          price: '2000.00',
          currency: 'BDT',
          status: 'DRAFT',
        })
        .returning();

      await testDb
        .insert(schema.modules)
        .values({ courseId: emptyModCourse.id, title: 'Empty Module', position: 1 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${emptyModCourse.id}/submit-for-review`)
        .set('Cookie', instructor1Cookies)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INCOMPLETE_CURRICULUM');
      expect(res.body.details?.missingRequirements).toContain('Course must have at least one lesson');
    });

    it('3.4 should successfully submit eligible Course 1 for review', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/submit-for-review`)
        .set('Cookie', instructor1Cookies)
        .send({ submissionNotes: 'Complete curriculum with pipelining hazard analysis.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.course.status).toBe('IN_REVIEW');
      expect(res.body.data.reviewRequest.status).toBe('PENDING');
      expect(res.body.data.reviewRequest.submissionNotes).toBe(
        'Complete curriculum with pipelining hazard analysis.'
      );

      // Verify database state
      const [updatedCourse] = await testDb
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, course1Id));
      expect(updatedCourse.status).toBe('IN_REVIEW');

      // Verify outbox event emitted
      const [outboxEvent] = await testDb
        .select()
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.eventType, 'CourseSubmittedForReview'))
        .orderBy(desc(schema.outboxEvents.createdAt))
        .limit(1);

      expect(outboxEvent).toBeDefined();
      expect(outboxEvent.entityId).toBe(course1Id);
      expect(outboxEvent.actorId).toBe(instructor1Id);
    });

    it('3.5 should reject duplicate review submission while already IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/submit-for-review`)
        .set('Cookie', instructor1Cookies)
        .send({ submissionNotes: 'Trying again' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('ALREADY_IN_REVIEW');
    });

    it('3.6 should deny Instructor 2 from submitting Instructor 1 course (IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/submit-for-review`)
        .set('Cookie', instructor2Cookies)
        .send({ submissionNotes: 'Attacking ownership' });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 4. CURRICULUM IMMUTABILITY LOCK (COURSE_LOCKED_FOR_REVIEW)
  // =========================================================================
  describe('4. Curriculum Immutability Lock (COURSE_LOCKED_FOR_REVIEW)', () => {
    it('4.1 should reject course metadata updates while IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${course1Id}`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Hacked Title While Under Review' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.2 should reject deleting course while IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/courses/${course1Id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.3 should reject creating a new module while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/modules`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Module 2: Branch Prediction', position: 2 });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.4 should reject updating an existing module while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/modules/${module1Id}`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Modified Module Title' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.5 should reject deleting a module while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/modules/${module1Id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.6 should reject creating a lesson while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1Id}/lessons`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lesson 2: Data Forwarding',
          position: 2,
          lessonType: 'TEXT',
          content: 'Forwarding paths.',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.7 should reject updating an existing lesson while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/lessons/${lesson1Id}`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Modified Lesson Title' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.8 should reject deleting a lesson while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/lessons/${lesson1Id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.9 should reject creating a quiz while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1Id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Quiz 2: Forwarding Paths',
          position: 2,
          quizType: 'KNOWLEDGE_CHECK',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.10 should reject updating an existing quiz while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${quiz1Id}`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Modified Quiz Title' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });

    it('4.11 should reject deleting a quiz while course is IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/quizzes/${quiz1Id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_LOCKED_FOR_REVIEW');
    });
  });

  // =========================================================================
  // 5. REVIEW WITHDRAWAL & UNLOCK WORKFLOW
  // =========================================================================
  describe('5. Review Withdrawal & Unlock Workflow', () => {
    it('5.1 should deny Instructor 2 from withdrawing Instructor 1 review request (IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/withdraw-review`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('5.2 should allow Instructor 1 to withdraw pending review request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/withdraw-review`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.course.status).toBe('DRAFT');
      expect(res.body.data.reviewRequest.status).toBe('WITHDRAWN');

      // Check DB
      const [course] = await testDb
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, course1Id));
      expect(course.status).toBe('DRAFT');
    });

    it('5.3 should verify that course content can be edited again after withdrawal', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${course1Id}`)
        .set('Cookie', instructor1Cookies)
        .send({ shortDescription: 'Updated short description after withdrawal.' });

      expect(res.status).toBe(200);
      expect(res.body.data.shortDescription).toBe('Updated short description after withdrawal.');
    });

    it('5.4 should reject withdraw when course is already in DRAFT status', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/withdraw-review`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('CANNOT_WITHDRAW_NON_PENDING_REVIEW');
    });
  });

  // =========================================================================
  // 6. ADMIN REVIEW QUEUE, REJECTION & RESUBMISSION
  // =========================================================================
  describe('6. Admin Review Queue, Rejection & Resubmission', () => {
    beforeAll(async () => {
      // Resubmit Course 1 for review
      await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/submit-for-review`)
        .set('Cookie', instructor1Cookies)
        .send({ submissionNotes: 'Second submission after revising description.' });
    });

    it('6.1 should allow administrator to view the review queue with pending submission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/courses/review-queue')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();

      const items = res.body.data.items;
      const found = items.find((item: any) => item.courseId === course1Id);
      expect(found).toBeDefined();
      expect(found.status).toBe('PENDING');
      expect(found.course.title).toBe('Advanced Computer Architecture');
      expect(found.instructor.email).toBe('instructor@techsprout.edu');
    });

    it('6.2 should reject review decision without feedback when rejecting', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/reject-review`)
        .set('Cookie', adminCookies)
        .send({ adminFeedback: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('6.3 should reject review decision with short feedback (< 5 chars)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/reject-review`)
        .set('Cookie', adminCookies)
        .send({ adminFeedback: 'Bad' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('6.4 should successfully reject review with detailed administrative feedback', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/reject-review`)
        .set('Cookie', adminCookies)
        .send({
          adminFeedback:
            'Please add code examples and expand the explanation in Lesson 1 before publication.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.course.status).toBe('DRAFT');
      expect(res.body.data.reviewRequest.status).toBe('REJECTED');
      expect(res.body.data.reviewRequest.adminFeedback).toBe(
        'Please add code examples and expand the explanation in Lesson 1 before publication.'
      );

      // Verify outbox event emitted
      const [outboxEvent] = await testDb
        .select()
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.eventType, 'CourseReviewRejected'))
        .orderBy(desc(schema.outboxEvents.createdAt))
        .limit(1);

      expect(outboxEvent).toBeDefined();
      expect(outboxEvent.entityId).toBe(course1Id);
      expect(outboxEvent.actorId).toBe(adminId);
      const rejectedPayload = JSON.parse(outboxEvent.payload);
      expect(rejectedPayload.instructorId).toBe(instructor1Id);
    });

    it('6.5 should allow instructor to view review status and feedback history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/courses/${course1Id}/review-status`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.courseStatus).toBe('DRAFT');
      expect(res.body.data.currentReview.status).toBe('REJECTED');
      expect(res.body.data.currentReview.adminFeedback).toContain(
        'Please add code examples and expand the explanation'
      );
      expect(res.body.data.history.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 7. ADMIN APPROVAL & PUBLICATION WORKFLOW
  // =========================================================================
  describe('7. Admin Approval & Publication Workflow', () => {
    beforeAll(async () => {
      // Resubmit Course 1 for review after incorporating feedback
      await request(app.getHttpServer())
        .post(`/api/v1/instructor/courses/${course1Id}/submit-for-review`)
        .set('Cookie', instructor1Cookies)
        .send({ submissionNotes: 'Added code examples and expanded Lesson 1.' });
    });

    it('7.1 should allow administrator to approve review and publish course', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/approve-review`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.course.status).toBe('PUBLISHED');
      expect(res.body.data.course.publishedAt).toBeDefined();
      expect(res.body.data.reviewRequest.status).toBe('APPROVED');
      expect(res.body.data.reviewRequest.reviewedBy).toBe(adminId);

      // Verify DB status
      const [publishedCourse] = await testDb
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, course1Id));
      expect(publishedCourse.status).toBe('PUBLISHED');
      expect(publishedCourse.publishedAt).not.toBeNull();

      // Verify outbox event emitted
      const [outboxEvent] = await testDb
        .select()
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.eventType, 'CourseReviewApproved'))
        .orderBy(desc(schema.outboxEvents.createdAt))
        .limit(1);

      expect(outboxEvent).toBeDefined();
      expect(outboxEvent.entityId).toBe(course1Id);
      expect(outboxEvent.actorId).toBe(adminId);
      const approvedPayload = JSON.parse(outboxEvent.payload);
      expect(approvedPayload.instructorId).toBe(instructor1Id);
    });

    it('7.2 should reject approving an already published course with INVALID_REVIEW_STATE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/approve-review`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_REVIEW_STATE');
    });

    it('7.3 should reject rejecting an already published course with INVALID_REVIEW_STATE', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course1Id}/reject-review`)
        .set('Cookie', adminCookies)
        .send({ adminFeedback: 'Cannot reject published course' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_REVIEW_STATE');
    });
  });

  // =========================================================================
  // 8. ENROLLMENT ROSTER ACCESS & RESOURCE OWNERSHIP GUARD
  // =========================================================================
  describe('8. Enrollment Roster Access & Resource Ownership Guard', () => {
    it('8.1 should allow Instructor 1 to access enrollments for Course 1', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${course1Id}/enrollments`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(course1Id);
    });

    it('8.2 should deny Instructor 2 from accessing enrollments for Course 1 (IDOR protection)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${course1Id}/enrollments`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('8.3 should allow Administrator to access enrollments for any course', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${course1Id}/enrollments`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.courseId).toBe(course1Id);
    });
  });
});
