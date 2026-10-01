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
import { eq } from 'drizzle-orm';
import { env } from '../config/env.config';

describe('P2.2 — Catalog API Foundation E2E Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  let adminCookies: string[];
  let studentCookies: string[];
  let instructor1Cookies: string[];
  let instructor2Cookies: string[];

  let instructor1Id: string;
  let instructor2Id: string;
  let adminId: string;

  let testMediaId: string;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // Seed a second instructor
    const [instructorRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Instructor2Password123!');
    const [inst2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Dr. Alan Turing',
        username: 'instructor2',
        email: 'instructor2@techsprout.edu',
        phone: '01700000099',
        passwordHash,
        isVerified: true,
      })
      .returning();

    await testDb.insert(schema.userRoles).values({
      userId: inst2.id,
      roleId: instructorRole.id,
    });

    // Create a media record for tests
    const [med] = await testDb
      .insert(schema.media)
      .values({
        storageProvider: 'CLOUDINARY',
        storageKey: 'techsprout/videos/lessons/demo-video-1',
        publicUrl: 'https://res.cloudinary.com/test/video/upload/demo-video-1.mp4',
        originalFilename: 'demo-video-1.mp4',
        mimeType: 'video/mp4',
        fileSize: 1048576,
        durationSeconds: 120,
      })
      .returning();
    testMediaId = med.id;

    // Retrieve user IDs
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
    instructor2Id = inst2.id;

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

    const inst1Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructor1Cookies = inst1Login.headers['set-cookie'] as unknown as string[];

    const inst2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor2@techsprout.edu',
      password: 'Instructor2Password123!',
    });
    instructor2Cookies = inst2Login.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testPool) {
      await testPool.end();
    }
  });

  // ============================================================================
  // SUITE 1: CATEGORY MANAGEMENT API
  // ============================================================================
  describe('1. Category Management API', () => {
    let createdCategoryId: string;

    it('1.1 Admin can create a new category', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({
          name: 'Cloud Computing',
          slug: 'cloud-computing',
          description: 'Cloud infrastructure and architecture courses.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('Cloud Computing');
      expect(res.body.data.slug).toBe('cloud-computing');
      createdCategoryId = res.body.data.id;
    });

    it('1.2 Reject category creation with duplicate name (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({
          name: 'Cloud Computing',
          slug: 'cloud-computing-2',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('CATEGORY_NAME_EXISTS');
    });

    it('1.3 Reject category creation with duplicate slug (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({
          name: 'Different Cloud Name',
          slug: 'cloud-computing',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('CATEGORY_SLUG_EXISTS');
    });

    it('1.4 Student and instructor cannot mutate categories (403 Forbidden)', async () => {
      const studentRes = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', studentCookies)
        .send({ name: 'Robotics 2', slug: 'robotics-2' });
      expect(studentRes.status).toBe(403);

      const instRes = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', instructor1Cookies)
        .send({ name: 'Robotics 2', slug: 'robotics-2' });
      expect(instRes.status).toBe(403);
    });

    it('1.5 Admin can list and retrieve category by ID', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/admin/categories')
        .set('Cookie', adminCookies);
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.some((c: any) => c.id === createdCategoryId)).toBe(true);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Cookie', adminCookies);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(createdCategoryId);
    });

    it('1.6 Admin can update a category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Cookie', adminCookies)
        .send({
          description: 'Updated cloud infrastructure syllabus.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Updated cloud infrastructure syllabus.');
    });

    it('1.7 Public can view active categories with course count', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const cat = res.body.data.find((c: any) => c.id === createdCategoryId);
      expect(cat).toBeDefined();
      expect(typeof cat.courseCount).toBe('number');
    });

    it('1.8 Admin can delete category when no courses reference it', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it is gone
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Cookie', adminCookies);
      expect(getRes.status).toBe(404);
    });
  });

  // ============================================================================
  // SUITE 2: COURSE CREATION & OWNERSHIP ENFORCEMENT
  // ============================================================================
  describe('2. Course Creation & Ownership Enforcement', () => {
    let testCatId: string;
    let instructor1CourseId: string;

    beforeAll(async () => {
      const catRes = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({ name: 'Web Dev Mastery', slug: 'web-dev-mastery' });
      testCatId = catRes.body.data.id;
    });

    it('2.1 Admin can create a course assigning any instructor', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', adminCookies)
        .send({
          title: 'Full Stack TypeScript',
          slug: 'full-stack-typescript',
          shortDescription: 'From NestJS to Next.js',
          categoryId: testCatId,
          instructorId: instructor2Id,
          price: '49.99',
          level: 'INTERMEDIATE',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.instructorId).toBe(instructor2Id);
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('2.2 Instructor creates course: instructorId is forced to req.user.id', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Deep Learning with Python',
          slug: 'deep-learning-python',
          shortDescription: 'Neural networks from scratch',
          categoryId: testCatId,
          instructorId: adminId, // Attempt to assign to admin
          price: '89.99',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.instructorId).toBe(instructor1Id); // Enforced server-side
      expect(res.body.data.instructorId).not.toBe(adminId);
      instructor1CourseId = res.body.data.id;
    });

    it('2.3 Reject course creation with invalid category (404)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', adminCookies)
        .send({
          title: 'Bad Category Course',
          categoryId: '00000000-0000-0000-0000-000000000999',
          instructorId: instructor1Id,
        });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('CATEGORY_NOT_FOUND');
    });

    it('2.4 Reject course creation with duplicate slug (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', adminCookies)
        .send({
          title: 'Another Full Stack',
          slug: 'full-stack-typescript',
          categoryId: testCatId,
          instructorId: instructor1Id,
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('COURSE_SLUG_EXISTS');
    });

    it('2.5 Category deletion blocked if courses reference it (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/categories/${testCatId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('CATEGORY_HAS_COURSES');
    });

    it('2.6 Instructor can update own course', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${instructor1CourseId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          shortDescription: 'Updated deep learning neural syllabus',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.shortDescription).toBe('Updated deep learning neural syllabus');
    });

    it('2.7 IDOR Protection: Instructor cannot update another instructor’s course (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${instructor1CourseId}`)
        .set('Cookie', instructor2Cookies) // Different instructor
        .send({
          title: 'Hacked Title By Competitor',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('2.8 Instructor cannot reassign instructor ownership via PATCH (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${instructor1CourseId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          instructorId: instructor2Id,
        });

      expect(res.status).toBe(403);
    });

    it('2.9 Status mutation via PATCH is ignored (status remains DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${instructor1CourseId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          status: 'PUBLISHED', // Attempt to bypass state machine
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DRAFT');
    });
  });

  // ============================================================================
  // SUITE 3: COURSE STATE MACHINE & DELETION RULES
  // ============================================================================
  describe('3. Course State Machine & Deletion Rules', () => {
    let courseId: string;
    let moduleId: string;
    let catId: string;

    beforeAll(async () => {
      const cat = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({ name: 'State Machine Testing', slug: 'state-machine-testing' });
      catId = cat.body.data.id;

      const course = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', adminCookies)
        .send({
          title: 'State Machine Course',
          slug: 'state-machine-course',
          shortDescription: 'Testing state transitions',
          description: 'Full course syllabus description',
          categoryId: catId,
          price: '29.99',
        });
      courseId = course.body.data.id;
    });

    it('3.1 Instructor cannot publish course (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/publish`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('3.2 Admin publish fails if course has 0 modules (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/publish`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_PUBLISH_VALIDATION_FAILED');
    });

    it('3.3 Admin publish fails if module has 0 lessons (400 Bad Request)', async () => {
      // Add a module with no lessons
      const modRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/modules`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Module 1: Foundations',
          position: 1,
        });
      moduleId = modRes.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/publish`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_PUBLISH_VALIDATION_FAILED');
    });

    it('3.4 Admin publish fails if video lesson lacks mediaId (400 Bad Request)', async () => {
      // Add a video lesson without mediaId
      const lesRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${moduleId}/lessons`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Lesson 1: Intro Video Without Media',
          lessonType: 'VIDEO',
          position: 1,
        });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/publish`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_PUBLISH_VALIDATION_FAILED');

      // Update lesson with valid mediaId
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/lessons/${lesRes.body.data.id}`)
        .set('Cookie', adminCookies)
        .send({ mediaId: testMediaId, isPreview: true });
    });

    it('3.5 Admin successfully publishes course (DRAFT -> PUBLISHED)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/publish`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PUBLISHED');
      expect(res.body.data.publishedAt).toBeDefined();
    });

    it('3.6 Published course CANNOT be hard-deleted (400 CANNOT_DELETE_NON_DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/courses/${courseId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('CANNOT_DELETE_NON_DRAFT');
    });

    it('3.7 Admin unpublishes course (PUBLISHED -> DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/unpublish`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('3.8 Invalid transition rejected: Cannot archive a DRAFT course (400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/archive`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_STATUS_TRANSITION');
    });

    it('3.9 Publish then archive course (PUBLISHED -> ARCHIVED)', async () => {
      // First publish
      await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/publish`)
        .set('Cookie', adminCookies);

      // Then archive
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${courseId}/archive`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ARCHIVED');
    });

    it('3.10 Archived course CANNOT be hard-deleted (400 CANNOT_DELETE_NON_DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/courses/${courseId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('CANNOT_DELETE_NON_DRAFT');
    });
  });

  // ============================================================================
  // SUITE 4: MODULE API & HIERARCHICAL IDOR PROTECTION
  // ============================================================================
  describe('4. Module API & Hierarchical IDOR Protection', () => {
    let inst1CourseId: string;
    let inst2CourseId: string;
    let module1Id: string;

    beforeAll(async () => {
      const cat = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({ name: 'Module Hierarchy Cat', slug: 'module-hierarchy-cat' });

      const c1 = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Instructor 1 Course for Modules',
          slug: 'inst1-course-modules',
          categoryId: cat.body.data.id,
        });
      inst1CourseId = c1.body.data.id;

      const c2 = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Instructor 2 Course for Modules',
          slug: 'inst2-course-modules',
          categoryId: cat.body.data.id,
        });
      inst2CourseId = c2.body.data.id;
    });

    it('4.1 Instructor 1 creates module in own course', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${inst1CourseId}/modules`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Module 1: Getting Started',
          position: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Module 1: Getting Started');
      module1Id = res.body.data.id;
    });

    it('4.2 Enforce unique position (courseId, position) -> 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${inst1CourseId}/modules`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Duplicate Position Module',
          position: 1, // Same position
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('MODULE_POSITION_EXISTS');
    });

    it('4.3 IDOR: Instructor 2 cannot create module in Instructor 1 course (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${inst1CourseId}/modules`)
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Intruder Module',
          position: 2,
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('4.4 IDOR: Instructor 2 cannot update Instructor 1 module (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/modules/${module1Id}`)
        .set('Cookie', instructor2Cookies)
        .send({ title: 'Hacked Module' });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('4.5 IDOR: Instructor 2 cannot delete Instructor 1 module (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/modules/${module1Id}`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('4.6 Instructor 1 can update own module', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/modules/${module1Id}`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Module 1: Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Module 1: Updated Title');
    });
  });

  // ============================================================================
  // SUITE 5: LESSON API & ANCESTOR OWNERSHIP RESOLUTION
  // ============================================================================
  describe('5. Lesson API & Ancestor Ownership Resolution', () => {
    let inst1ModuleId: string;
    let lesson1Id: string;

    beforeAll(async () => {
      const cat = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({ name: 'Lesson Cat', slug: 'lesson-cat' });

      const course = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lesson Testing Course',
          slug: 'lesson-testing-course',
          categoryId: cat.body.data.id,
        });

      const mod = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${course.body.data.id}/modules`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lesson Module 1',
          position: 1,
        });
      inst1ModuleId = mod.body.data.id;
    });

    it('5.1 Owner can create VIDEO lesson', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${inst1ModuleId}/lessons`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lesson 1.1: Video Overview',
          lessonType: 'VIDEO',
          position: 1,
          durationSeconds: 300,
          isPreview: true,
          mediaId: testMediaId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Lesson 1.1: Video Overview');
      expect(res.body.data.lessonType).toBe('VIDEO');
      expect(res.body.data.isPreview).toBe(true);
      lesson1Id = res.body.data.id;
    });

    it('5.2 Owner can create TEXT and PDF lessons', async () => {
      const textRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${inst1ModuleId}/lessons`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lesson 1.2: Reading Material',
          lessonType: 'TEXT',
          position: 2,
          content: 'Here is the detailed reading material markdown.',
        });
      expect(textRes.status).toBe(201);
      expect(textRes.body.data.lessonType).toBe('TEXT');

      const pdfRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${inst1ModuleId}/lessons`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lesson 1.3: Reference PDF',
          lessonType: 'PDF',
          position: 3,
        });
      expect(pdfRes.status).toBe(201);
      expect(pdfRes.body.data.lessonType).toBe('PDF');
    });

    it('5.3 Reject invalid lesson type (e.g. QUIZ, EXAM) -> 400 Validation Error', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${inst1ModuleId}/lessons`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Quiz 1',
          lessonType: 'QUIZ',
          position: 4,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('5.4 Reject duplicate lesson position within module -> 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${inst1ModuleId}/lessons`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Duplicate Position Lesson',
          position: 1, // Same as Lesson 1.1
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('LESSON_POSITION_EXISTS');
    });

    it('5.5 IDOR: Instructor 2 cannot create lesson in Instructor 1 module (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${inst1ModuleId}/lessons`)
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Intruder Lesson',
          position: 5,
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('5.6 IDOR: Instructor 2 cannot update Instructor 1 lesson (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/lessons/${lesson1Id}`)
        .set('Cookie', instructor2Cookies)
        .send({ title: 'Hacked Lesson Title' });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('5.7 IDOR: Instructor 2 cannot delete Instructor 1 lesson (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/lessons/${lesson1Id}`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('5.8 Owner can update own lesson', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/lessons/${lesson1Id}`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Lesson 1.1: Updated Video Overview' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Lesson 1.1: Updated Video Overview');
    });
  });

  // ============================================================================
  // SUITE 6: PUBLIC CATALOG DISCOVERY & MEDIA PRIVACY
  // ============================================================================
  describe('6. Public Catalog Discovery & Media Privacy', () => {
    let pubCourseSlug: string;

    beforeAll(async () => {
      const cat = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Cookie', adminCookies)
        .send({ name: 'Public Discovery Cat', slug: 'public-discovery-cat' });

      // 1. Create a published public course
      const pubCourse = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', adminCookies)
        .send({
          title: 'Public Masterclass Course',
          slug: 'public-masterclass-course',
          shortDescription: 'Discoverable by all students',
          description: 'Full course syllabus text',
          categoryId: cat.body.data.id,
          price: '39.99',
          visibility: 'PUBLIC',
        });
      pubCourseSlug = pubCourse.body.data.slug;

      const mod = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${pubCourse.body.data.id}/modules`)
        .set('Cookie', adminCookies)
        .send({ title: 'Public Module 1', position: 1 });

      // Lesson 1: preview = true
      await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${mod.body.data.id}/lessons`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Public Preview Lesson',
          lessonType: 'VIDEO',
          position: 1,
          isPreview: true,
          mediaId: testMediaId,
        });

      // Lesson 2: preview = false
      await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${mod.body.data.id}/lessons`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Protected Lesson',
          lessonType: 'VIDEO',
          position: 2,
          isPreview: false,
          mediaId: testMediaId,
        });

      // Publish the course
      await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${pubCourse.body.data.id}/publish`)
        .set('Cookie', adminCookies);

      // 2. Create a DRAFT course
      await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', adminCookies)
        .send({
          title: 'Secret Draft Course',
          slug: 'secret-draft-course',
          categoryId: cat.body.data.id,
          status: 'DRAFT',
          visibility: 'PUBLIC',
        });

      // 3. Create a PRIVATE published course
      const privCourse = await request(app.getHttpServer())
        .post('/api/v1/admin/courses')
        .set('Cookie', adminCookies)
        .send({
          title: 'Private Enterprise Course',
          slug: 'private-enterprise-course',
          categoryId: cat.body.data.id,
          visibility: 'PRIVATE',
        });
      const privMod = await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${privCourse.body.data.id}/modules`)
        .set('Cookie', adminCookies)
        .send({ title: 'Enterprise Module', position: 1 });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${privMod.body.data.id}/lessons`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Enterprise Lesson',
          lessonType: 'TEXT',
          position: 1,
          content: 'Secret content',
        });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/courses/${privCourse.body.data.id}/publish`)
        .set('Cookie', adminCookies);
    });

    it('6.1 GET /api/v1/courses returns only PUBLISHED + PUBLIC courses', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/courses');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const slugs = res.body.data.items.map((c: any) => c.slug);

      expect(slugs).toContain(pubCourseSlug);
      expect(slugs).not.toContain('secret-draft-course');
      expect(slugs).not.toContain('private-enterprise-course');
    });

    it('6.2 GET /api/v1/courses/:slug returns public detail with preview media rule', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/courses/${pubCourseSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Public Masterclass Course');
      expect(res.body.data.category).toBeDefined();
      expect(res.body.data.instructor.name).toBeDefined();

      const lessonsList = res.body.data.modules[0].lessons;
      const previewLesson = lessonsList.find((l: any) => l.isPreview === true);
      const protectedLesson = lessonsList.find((l: any) => l.isPreview === false);

      // Rule: isPreview: true exposes mediaUrl
      expect(previewLesson.mediaUrl).toBeDefined();
      expect(previewLesson.mediaUrl).toContain('cloudinary.com');

      // Rule: isPreview: false hides mediaUrl (null)
      expect(protectedLesson.mediaUrl).toBeNull();
    });

    it('6.3 Public lookup for draft course slug returns 404', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/courses/secret-draft-course');
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('COURSE_NOT_FOUND');
    });

    it('6.4 Public lookup for private course slug returns 404', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/courses/private-enterprise-course');
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('COURSE_NOT_FOUND');
    });
  });

  // ============================================================================
  // SUITE 7: SEARCH, FILTER, SORT & PAGINATION
  // ============================================================================
  describe('7. Search, Filtering, Sorting & Pagination', () => {
    it('7.1 Search matches title via ILIKE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ search: 'Masterclass' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.every((c: any) => c.title.toLowerCase().includes('masterclass'))).toBe(true);
    });

    it('7.2 Search matches short description via ILIKE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ search: 'discoverable' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('7.3 Filter by categorySlug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ categorySlug: 'public-discovery-cat' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((c: any) => c.category.slug === 'public-discovery-cat')).toBe(true);
    });

    it('7.4 Sort by price ascending and descending', async () => {
      const ascRes = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ sortBy: 'price', sortOrder: 'asc' });
      expect(ascRes.status).toBe(200);

      const descRes = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ sortBy: 'price', sortOrder: 'desc' });
      expect(descRes.status).toBe(200);
    });

    it('7.5 Pagination returns correct metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ page: 1, limit: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagination.totalPages).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.length).toBe(1);
    });

    it('7.6 Pagination enforces max limit of 100', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .query({ limit: 1000 }); // Exceeds 100

      // Schema caps limit with .max(100)
      expect(res.status).toBe(400);
    });
  });

  // ============================================================================
  // SUITE 8: SECURITY & AUDIT EVENT VERIFICATION
  // ============================================================================
  describe('8. Security & Audit Event Verification', () => {
    it('8.1 Unauthenticated requests to /api/v1/admin/courses rejected (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/admin/courses');
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('8.2 Student requests to /api/v1/admin/courses rejected (403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/courses')
        .set('Cookie', studentCookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('8.3 Audit log records catalog lifecycle events', async () => {
      const auditRes = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Cookie', adminCookies);

      expect(auditRes.status).toBe(200);
      const actions = auditRes.body.data.map((l: any) => l.action);

      expect(actions).toContain('CATEGORY_CREATED');
      expect(actions).toContain('COURSE_CREATED');
      expect(actions).toContain('COURSE_PUBLISHED');
      expect(actions).toContain('MODULE_CREATED');
      expect(actions).toContain('LESSON_CREATED');
    });

    it('8.4 Public course endpoint does not leak sensitive fields', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/courses');
      expect(res.status).toBe(200);

      const itemsStr = JSON.stringify(res.body.data.items);
      expect(itemsStr).not.toContain('passwordHash');
      expect(itemsStr).not.toContain('password_hash');
      expect(itemsStr).not.toContain('test-api-secret');
      expect(itemsStr).not.toContain('session');
    });
  });
});
