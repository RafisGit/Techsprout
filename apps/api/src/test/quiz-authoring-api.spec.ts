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
import { eq, and, desc } from 'drizzle-orm';
import { env } from '../config/env.config';

describe('P4.2 — Quiz & Question Authoring REST API Integration Test Suite', () => {
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

  let testCategory: any;
  let course1: any; // Owned by instructor 1
  let course2: any; // Owned by instructor 2
  let module1: any; // In course 1
  let module2: any; // In course 2

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // Seed Instructor 2
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

    // Retrieve seed users
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

    const [studentUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentId = studentUser.id;

    // Seed category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Web Engineering',
        slug: 'web-engineering',
        description: 'Frontend and Backend Web Architecture',
        isActive: true,
      })
      .returning();
    testCategory = cat;

    // Seed Course 1 (Instructor 1)
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Fullstack TypeScript Architecture',
        slug: 'fullstack-typescript-architecture',
        shortDescription: 'Modern TypeScript',
        description: 'End-to-end TypeScript mastery',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '49.99',
        currency: 'USD',
        level: 'INTERMEDIATE',
        language: 'English',
        durationMinutes: 1200,
        categoryId: testCategory.id,
        instructorId: instructor1Id,
      })
      .returning();
    course1 = c1;

    // Seed Course 2 (Instructor 2)
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Advanced Cryptography & Distributed Systems',
        slug: 'advanced-crypto-distributed-systems',
        shortDescription: 'Cryptography course',
        description: 'Zero Knowledge and Consensus',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '89.99',
        currency: 'USD',
        level: 'ADVANCED',
        language: 'English',
        durationMinutes: 900,
        categoryId: testCategory.id,
        instructorId: instructor2Id,
      })
      .returning();
    course2 = c2;

    // Seed Modules
    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course1.id,
        title: 'Module 1: Foundations',
        position: 1,
      })
      .returning();
    module1 = m1;

    const [m2] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course2.id,
        title: 'Module 1: Ciphers',
        position: 1,
      })
      .returning();
    module2 = m2;

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
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    // Authenticate users
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@techsprout.edu', password: 'AdminPassword123!' });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];

    const inst1Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'instructor@techsprout.edu', password: 'InstructorPassword123!' });
    instructor1Cookies = inst1Login.headers['set-cookie'] as unknown as string[];

    const inst2Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'instructor2@techsprout.edu', password: 'Instructor2Password123!' });
    instructor2Cookies = inst2Login.headers['set-cookie'] as unknown as string[];

    const studentLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'student@techsprout.edu', password: 'StudentPassword123!' });
    studentCookies = studentLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // =========================================================================
  // 1. Authentication, Authorization & IDOR Protection Matrix
  // =========================================================================
  describe('1. Authentication & Authorization Matrix', () => {
    it('1.1 should block unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .send({
          title: 'Unauthenticated Quiz',
          position: 1,
        });

      expect(res.status).toBe(401);
    });

    it('1.2 should block student with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', studentCookies)
        .send({
          title: 'Student Attempting Authoring',
          position: 1,
        });

      expect(res.status).toBe(403);
    });

    it('1.3 should block instructor from authoring in another instructor course (IDOR protection)', async () => {
      // Instructor 1 attempts to create quiz in Course 2 (owned by Instructor 2)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module2.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'IDOR Quiz Attack',
          position: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.4 should allow instructor to author in own course', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Module 1 Knowledge Check',
          description: 'Testing foundations',
          position: 1,
          quizType: 'KNOWLEDGE_CHECK',
          passingScorePercentage: 75,
          maxAttempts: 3,
          timeLimitMinutes: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe('Module 1 Knowledge Check');
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.passingScorePercentage).toBe(75);
    });

    it('1.5 should allow admin global authority across any course', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module2.id}/quizzes`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Admin Created Quiz in Course 2',
          position: 1,
          quizType: 'KNOWLEDGE_CHECK',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Admin Created Quiz in Course 2');
    });
  });

  // =========================================================================
  // 2. Quiz Creation, Validation & FINAL_EXAM Rules
  // =========================================================================
  describe('2. Quiz Creation, Validation & FINAL_EXAM Rules', () => {
    it('2.1 should reject missing title or invalid position (<= 0)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          position: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('2.2 should reject invalid passing score (< 1 or > 100)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Invalid Passing Score',
          position: 2,
          passingScorePercentage: 105,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('2.3 should reject position conflict within module', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Conflicting Position Quiz',
          position: 1, // Already taken in test 1.4
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_POSITION_EXISTS');
    });

    it('2.4 should create quiz with defaults when optional fields omitted', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Default Fields Quiz',
          position: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.quizType).toBe('KNOWLEDGE_CHECK');
      expect(res.body.data.passingScorePercentage).toBe(70);
      expect(res.body.data.maxAttempts).toBe(3);
      expect(res.body.data.timeLimitMinutes).toBeNull();
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('2.5 should enforce single FINAL_EXAM per course', async () => {
      // 1. Create first FINAL_EXAM in Course 1
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Course 1 Comprehensive Final Exam',
          position: 3,
          quizType: 'FINAL_EXAM',
        });
      expect(res1.status).toBe(201);

      // 2. Attempt to create a second FINAL_EXAM in Course 1 -> 409 FINAL_EXAM_CONFLICT
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Another Final Exam',
          position: 4,
          quizType: 'FINAL_EXAM',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.errorCode).toBe('FINAL_EXAM_CONFLICT');
    });

    it('2.6 should permit FINAL_EXAM in a different course', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module2.id}/quizzes`)
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Course 2 Final Exam',
          position: 2,
          quizType: 'FINAL_EXAM',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.quizType).toBe('FINAL_EXAM');
    });
  });

  // =========================================================================
  // 3. Quiz Retrieval, Listing & Reordering
  // =========================================================================
  describe('3. Quiz Retrieval, Listing & Reordering', () => {
    let createdQuizId: string;

    beforeAll(async () => {
      const [q] = await testDb
        .select()
        .from(schema.quizzes)
        .where(eq(schema.quizzes.moduleId, module1.id))
        .limit(1);
      createdQuizId = q.id;
    });

    it('3.1 should retrieve authoring quiz detail with module, course, ordered questions and options', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${createdQuizId}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdQuizId);
      expect(res.body.data.module).toBeDefined();
      expect(res.body.data.module.id).toBe(module1.id);
      expect(res.body.data.course).toBeDefined();
      expect(res.body.data.course.id).toBe(course1.id);
      expect(Array.isArray(res.body.data.questions)).toBe(true);
    });

    it('3.2 should block unauthorized instructor from reading quiz detail (IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${createdQuizId}`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('3.3 should list quizzes in module', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('3.4 should reorder quizzes safely without unique constraint collision', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies);

      const items = listRes.body.data.slice(0, 2);
      expect(items.length).toBe(2);

      // Swap positions
      const reorderPayload = {
        items: [
          { id: items[0].id, position: 2 },
          { id: items[1].id, position: 1 },
        ],
      };

      const reorderRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes/reorder`)
        .set('Cookie', instructor1Cookies)
        .send(reorderPayload);

      expect(reorderRes.status).toBe(200);
      expect(reorderRes.body.success).toBe(true);

      // Verify new order
      const q1 = await testDb.select().from(schema.quizzes).where(eq(schema.quizzes.id, items[0].id));
      const q2 = await testDb.select().from(schema.quizzes).where(eq(schema.quizzes.id, items[1].id));

      expect(q1[0].position).toBe(2);
      expect(q2[0].position).toBe(1);
    });
  });

  // =========================================================================
  // 4. Quiz Update & Lifecycle Protection
  // =========================================================================
  describe('4. Quiz Update & Lifecycle Protection', () => {
    let targetQuizId: string;

    beforeAll(async () => {
      const [q] = await testDb
        .select()
        .from(schema.quizzes)
        .where(and(eq(schema.quizzes.moduleId, module1.id), eq(schema.quizzes.quizType, 'KNOWLEDGE_CHECK')))
        .limit(1);
      targetQuizId = q.id;
    });

    it('4.1 should update quiz configuration fields', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${targetQuizId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Updated TypeScript Knowledge Check',
          passingScorePercentage: 80,
          timeLimitMinutes: 45,
          maxAttempts: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated TypeScript Knowledge Check');
      expect(res.body.data.passingScorePercentage).toBe(80);
      expect(res.body.data.timeLimitMinutes).toBe(45);
      expect(res.body.data.maxAttempts).toBe(5);
    });

    it('4.2 should prevent direct status mutation via PATCH', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${targetQuizId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          status: 'PUBLISHED', // Status is not in updateQuizSchema and must be ignored
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DRAFT'); // Status remains unchanged
    });

    it('4.3 should reject update causing FINAL_EXAM conflict', async () => {
      // Course 1 already has a FINAL_EXAM (created in 2.5)
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${targetQuizId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          quizType: 'FINAL_EXAM',
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('FINAL_EXAM_CONFLICT');
    });

    it('4.4 should reject cross-module FINAL_EXAM creation within the same course', async () => {
      const [mod1B] = await testDb
        .insert(schema.modules)
        .values({
          courseId: course1.id,
          title: 'Module 2: Advanced TypeScript',
          position: 2,
        })
        .returning();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${mod1B.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Module 2 Final Exam Attempt',
          position: 1,
          quizType: 'FINAL_EXAM',
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('FINAL_EXAM_CONFLICT');
    });

    it('4.5 should allow demoting FINAL_EXAM to KNOWLEDGE_CHECK and promoting another quiz', async () => {
      const [finalExam] = await testDb
        .select({ id: schema.quizzes.id })
        .from(schema.quizzes)
        .innerJoin(schema.modules, eq(schema.quizzes.moduleId, schema.modules.id))
        .where(
          and(
            eq(schema.modules.courseId, course1.id),
            eq(schema.quizzes.quizType, 'FINAL_EXAM')
          )
        )
        .limit(1);

      expect(finalExam).toBeDefined();

      const demoteRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${finalExam.id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          quizType: 'KNOWLEDGE_CHECK',
        });

      expect(demoteRes.status).toBe(200);
      expect(demoteRes.body.data.quizType).toBe('KNOWLEDGE_CHECK');

      const promoteRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${targetQuizId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          quizType: 'FINAL_EXAM',
        });

      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.data.quizType).toBe('FINAL_EXAM');

      // Revert back so targetQuizId is KNOWLEDGE_CHECK and finalExam is restored
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${targetQuizId}`)
        .set('Cookie', instructor1Cookies)
        .send({ quizType: 'KNOWLEDGE_CHECK' });

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${finalExam.id}`)
        .set('Cookie', instructor1Cookies)
        .send({ quizType: 'FINAL_EXAM' });
    });
  });

  // =========================================================================
  // 5. Question Creation & Validation Matrix
  // =========================================================================
  describe('5. Question Creation & Validation Matrix', () => {
    let authoringQuizId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Authoring Matrix Test Quiz',
          position: 10,
        });
      authoringQuizId = res.body.data.id;
    });

    it('5.1 should reject unsupported question type', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'What is an essay?',
          questionType: 'ESSAY',
          position: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('5.2 should reject SINGLE_CHOICE with 0 correct options', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Which keyword defines a constant?',
          questionType: 'SINGLE_CHOICE',
          position: 1,
          options: [
            { optionText: 'var', position: 1, isCorrect: false },
            { optionText: 'let', position: 2, isCorrect: false },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('QUESTION_INVALID');
    });

    it('5.3 should reject SINGLE_CHOICE with multiple correct options', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Which keyword defines a constant?',
          questionType: 'SINGLE_CHOICE',
          position: 1,
          options: [
            { optionText: 'const', position: 1, isCorrect: true },
            { optionText: 'readonly', position: 2, isCorrect: true },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('QUESTION_INVALID');
    });

    it('5.4 should create valid SINGLE_CHOICE question with options', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Which TypeScript keyword declares a block-scoped variable?',
          questionType: 'SINGLE_CHOICE',
          position: 1,
          points: 2,
          explanation: 'let and const provide block-scoped declarations.',
          options: [
            { optionText: 'var', position: 1, isCorrect: false },
            { optionText: 'let', position: 2, isCorrect: true },
            { optionText: 'global', position: 3, isCorrect: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.points).toBe(2);
      expect(res.body.data.options.length).toBe(3);
    });

    it('5.5 should reject MULTIPLE_CHOICE with 0 correct options', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Select primitive types in TypeScript',
          questionType: 'MULTIPLE_CHOICE',
          position: 2,
          options: [
            { optionText: 'string', position: 1, isCorrect: false },
            { optionText: 'number', position: 2, isCorrect: false },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('QUESTION_INVALID');
    });

    it('5.6 should create valid MULTIPLE_CHOICE with multiple correct options', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Which of the following are JavaScript primitives?',
          questionType: 'MULTIPLE_CHOICE',
          position: 2,
          points: 3,
          options: [
            { optionText: 'string', position: 1, isCorrect: true },
            { optionText: 'boolean', position: 2, isCorrect: true },
            { optionText: 'Object', position: 3, isCorrect: false },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.options.length).toBe(3);
    });

    it('5.7 should reject TRUE_FALSE with more than 2 options or invalid labels', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'TypeScript is statically typed.',
          questionType: 'TRUE_FALSE',
          position: 3,
          options: [
            { optionText: 'Yes', position: 1, isCorrect: true },
            { optionText: 'No', position: 2, isCorrect: false },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('QUESTION_INVALID');
    });

    it('5.8 should create valid TRUE_FALSE question', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'TypeScript compiles directly into binary machine code.',
          questionType: 'TRUE_FALSE',
          position: 3,
          points: 1,
          explanation: 'TypeScript transpiles to JavaScript, not machine code.',
          options: [
            { optionText: 'True', position: 1, isCorrect: false },
            { optionText: 'False', position: 2, isCorrect: true },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.options.length).toBe(2);
    });

    it('5.9 should reorder questions within quiz', async () => {
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${authoringQuizId}`)
        .set('Cookie', instructor1Cookies);

      const qs = qRes.body.data.questions;
      expect(qs.length).toBe(3);

      const reorderRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions/reorder`)
        .set('Cookie', instructor1Cookies)
        .send({
          items: [
            { id: qs[0].id, position: 2 },
            { id: qs[1].id, position: 1 },
          ],
        });

      expect(reorderRes.status).toBe(200);

      const q1 = await testDb.select().from(schema.quizQuestions).where(eq(schema.quizQuestions.id, qs[0].id));
      const q2 = await testDb.select().from(schema.quizQuestions).where(eq(schema.quizQuestions.id, qs[1].id));
      expect(q1[0].position).toBe(2);
      expect(q2[0].position).toBe(1);
    });

    it('5.10 should update question fields (points, explanation, text)', async () => {
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${authoringQuizId}`)
        .set('Cookie', instructor1Cookies);

      const questionId = qRes.body.data.questions[0].id;

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/questions/${questionId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Updated Question Text by Instructor',
          points: 5,
          explanation: 'Updated Explanation',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.questionText).toBe('Updated Question Text by Instructor');
      expect(updateRes.body.data.points).toBe(5);
      expect(updateRes.body.data.explanation).toBe('Updated Explanation');
    });

    it('5.11 should delete a question from a draft quiz', async () => {
      // Create a temporary question to delete
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Question to be deleted',
          questionType: 'SINGLE_CHOICE',
          position: 99,
        });

      const toDeleteId = createRes.body.data.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/admin/questions/${toDeleteId}`)
        .set('Cookie', instructor1Cookies);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.deleted).toBe(true);

      const check = await testDb
        .select()
        .from(schema.quizQuestions)
        .where(eq(schema.quizQuestions.id, toDeleteId));
      expect(check.length).toBe(0);
    });

    it('5.12 should support case-insensitive True/False option text', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${authoringQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'JavaScript is a compiled language.',
          questionType: 'TRUE_FALSE',
          position: 15,
          options: [
            { optionText: 'true', position: 1, isCorrect: false },
            { optionText: 'FALSE', position: 2, isCorrect: true },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.options.length).toBe(2);
    });
  });

  // =========================================================================
  // 6. Option Authoring & Management
  // =========================================================================
  describe('6. Option Authoring & Management', () => {
    let questionId: string;
    let quizId: string;

    beforeAll(async () => {
      const quizRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Option Authoring Quiz',
          position: 20,
        });
      quizId = quizRes.body.data.id;

      const qRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${quizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Single Choice for Option Testing',
          questionType: 'SINGLE_CHOICE',
          position: 1,
        });
      questionId = qRes.body.data.id;
    });

    it('6.1 should create individual option for question', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options`)
        .set('Cookie', instructor1Cookies)
        .send({
          optionText: 'First Option',
          position: 1,
          isCorrect: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.optionText).toBe('First Option');
      expect(res.body.data.isCorrect).toBe(true);
    });

    it('6.2 should reject option position conflict in question', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options`)
        .set('Cookie', instructor1Cookies)
        .send({
          optionText: 'Conflicting Option',
          position: 1,
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('OPTION_POSITION_EXISTS');
    });

    it('6.3 should update option text, position, and correctness', async () => {
      const opt2Res = await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options`)
        .set('Cookie', instructor1Cookies)
        .send({
          optionText: 'Second Option',
          position: 2,
          isCorrect: false,
        });
      const opt2Id = opt2Res.body.data.id;

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/options/${opt2Id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          optionText: 'Second Option Modified',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.optionText).toBe('Second Option Modified');
    });

    it('6.4 should reorder options in question', async () => {
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/questions/${questionId}`)
        .set('Cookie', instructor1Cookies);

      const opts = qRes.body.data.options;
      expect(opts.length).toBe(2);

      const reorderRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options/reorder`)
        .set('Cookie', instructor1Cookies)
        .send({
          items: [
            { id: opts[0].id, position: 2 },
            { id: opts[1].id, position: 1 },
          ],
        });

      expect(reorderRes.status).toBe(200);

      const opt1 = await testDb.select().from(schema.quizQuestionOptions).where(eq(schema.quizQuestionOptions.id, opts[0].id));
      const opt2 = await testDb.select().from(schema.quizQuestionOptions).where(eq(schema.quizQuestionOptions.id, opts[1].id));
      expect(opt1[0].position).toBe(2);
      expect(opt2[0].position).toBe(1);
    });

    it('6.5 should delete an option', async () => {
      // Add a third option and delete it
      const opt3Res = await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options`)
        .set('Cookie', instructor1Cookies)
        .send({
          optionText: 'Third Option to Delete',
          position: 3,
        });
      const opt3Id = opt3Res.body.data.id;

      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/admin/options/${opt3Id}`)
        .set('Cookie', instructor1Cookies);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deleted).toBe(true);
    });
  });

  // =========================================================================
  // 7. Quiz Publishing & Archiving State Transitions
  // =========================================================================
  describe('7. Quiz Publishing & Archiving State Transitions', () => {
    let lifecycleQuizId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lifecycle State Machine Quiz',
          position: 30,
        });
      lifecycleQuizId = res.body.data.id;
    });

    it('7.1 should reject publish when quiz has 0 questions', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/publish`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('QUIZ_INVALID_FOR_PUBLISH');
      expect(res.body.details.errors).toContain('Quiz must contain at least one question to be published');
    });

    it('7.2 should reject publish when question has incomplete options', async () => {
      // Add a question without options
      await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Empty Question',
          questionType: 'SINGLE_CHOICE',
          position: 1,
        });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/publish`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('QUIZ_INVALID_FOR_PUBLISH');
    });

    it('7.3 should successfully publish valid DRAFT quiz (DRAFT -> PUBLISHED)', async () => {
      // Add valid options to question 1
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${lifecycleQuizId}`)
        .set('Cookie', instructor1Cookies);
      const questionId = qRes.body.data.questions[0].id;

      await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options`)
        .set('Cookie', instructor1Cookies)
        .send({ optionText: 'Valid Correct Option', position: 1, isCorrect: true });

      await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options`)
        .set('Cookie', instructor1Cookies)
        .send({ optionText: 'Valid Incorrect Option', position: 2, isCorrect: false });

      const publishRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/publish`)
        .set('Cookie', instructor1Cookies);

      expect(publishRes.status).toBe(200);
      expect(publishRes.body.data.status).toBe('PUBLISHED');
    });

    it('7.4 should reject publish on already PUBLISHED quiz', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/publish`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_ALREADY_PUBLISHED');
    });

    it('7.5 should successfully archive PUBLISHED quiz (PUBLISHED -> ARCHIVED)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/archive`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ARCHIVED');
    });

    it('7.6 should reject archive on already ARCHIVED quiz', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/archive`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_ALREADY_ARCHIVED');
    });

    it('7.7 should reject direct archive transition from DRAFT', async () => {
      const draftRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Direct Archive Draft Test',
          position: 40,
        });
      const draftId = draftRes.body.data.id;

      const archiveRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${draftId}/archive`)
        .set('Cookie', instructor1Cookies);

      expect(archiveRes.status).toBe(400);
      expect(archiveRes.body.errorCode).toBe('INVALID_STATUS_TRANSITION');
    });

    it('7.8 should reject publishing an ARCHIVED quiz', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${lifecycleQuizId}/publish`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_ALREADY_ARCHIVED');
    });

    it('7.9 should reject modifying an ARCHIVED quiz', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${lifecycleQuizId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Attempted Title Update on Archived Quiz',
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_ALREADY_ARCHIVED');
    });

    it('7.10 should reject adding an option to a PUBLISHED quiz that violates question rules', async () => {
      // 1. Create a quiz, add a valid SINGLE_CHOICE question, and publish it
      const qRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({ title: 'Published Mutation Guard Quiz', position: 80 });
      const pubQuizId = qRes.body.data.id;

      const questionRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${pubQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Which keyword declares a variable?',
          questionType: 'SINGLE_CHOICE',
          position: 1,
          options: [
            { optionText: 'let', position: 1, isCorrect: true },
            { optionText: 'function', position: 2, isCorrect: false },
          ],
        });
      const questionId = questionRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${pubQuizId}/publish`)
        .set('Cookie', instructor1Cookies);

      // Attempt to add a second correct option to SINGLE_CHOICE -> 422 OPTION_INVALID
      const addOptRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/questions/${questionId}/options`)
        .set('Cookie', instructor1Cookies)
        .send({
          optionText: 'const',
          position: 3,
          isCorrect: true, // Violates SINGLE_CHOICE rule (would make 2 correct)
        });

      expect(addOptRes.status).toBe(422);
      expect(addOptRes.body.errorCode).toBe('OPTION_INVALID');
    });

    it('7.11 should reject deleting an option from a PUBLISHED quiz that would leave invalid options', async () => {
      const [quiz] = await testDb
        .select()
        .from(schema.quizzes)
        .where(eq(schema.quizzes.title, 'Published Mutation Guard Quiz'));
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${quiz.id}`)
        .set('Cookie', instructor1Cookies);
      const question = qRes.body.data.questions[0];
      const correctOpt = question.options.find((o: any) => o.isCorrect);

      // Deleting the only correct option leaves 0 correct options -> 422 OPTION_INVALID
      const delOptRes = await request(app.getHttpServer())
        .delete(`/api/v1/admin/options/${correctOpt.id}`)
        .set('Cookie', instructor1Cookies);

      expect(delOptRes.status).toBe(422);
      expect(delOptRes.body.errorCode).toBe('OPTION_INVALID');
    });

    it('7.12 should reject deleting the only question of a PUBLISHED quiz', async () => {
      const [quiz] = await testDb
        .select()
        .from(schema.quizzes)
        .where(eq(schema.quizzes.title, 'Published Mutation Guard Quiz'));
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${quiz.id}`)
        .set('Cookie', instructor1Cookies);
      const question = qRes.body.data.questions[0];

      const delQRes = await request(app.getHttpServer())
        .delete(`/api/v1/admin/questions/${question.id}`)
        .set('Cookie', instructor1Cookies);

      expect(delQRes.status).toBe(422);
      expect(delQRes.body.errorCode).toBe('QUIZ_INVALID_FOR_PUBLISH');
      expect(delQRes.body.message).toContain('Cannot delete the only question of a published quiz');
    });
  });

  // =========================================================================
  // 8. Quiz Deletion & Attempt Protection Rules
  // =========================================================================
  describe('8. Quiz Deletion & Attempt Protection Rules', () => {
    let disposableQuizId: string;
    let attemptedQuizId: string;
    let enrollmentId: string;

    beforeAll(async () => {
      // 1. Create a disposable draft quiz
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Disposable Draft Quiz',
          position: 50,
        });
      disposableQuizId = res.body.data.id;

      // 2. Create another quiz that will have an attempt
      const attQuizRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/modules/${module1.id}/quizzes`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Quiz with Attempts',
          position: 51,
        });
      attemptedQuizId = attQuizRes.body.data.id;

      // Add a question to attemptedQuizId
      const qRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${attemptedQuizId}/questions`)
        .set('Cookie', instructor1Cookies)
        .send({
          questionText: 'Test Question for Attempts',
          questionType: 'SINGLE_CHOICE',
          position: 1,
          options: [
            { optionText: 'Opt 1', position: 1, isCorrect: true },
            { optionText: 'Opt 2', position: 2, isCorrect: false },
          ],
        });

      // Create enrollment for student in course1
      const [enr] = await testDb
        .insert(schema.enrollments)
        .values({
          courseId: course1.id,
          studentId: studentId,
          status: 'ACTIVE',
        })
        .returning();
      enrollmentId = enr.id;

      // Create a student attempt on attemptedQuizId
      await testDb.insert(schema.quizAttempts).values({
        quizId: attemptedQuizId,
        enrollmentId: enrollmentId,
        studentId: studentId,
        attemptNumber: 1,
        status: 'IN_PROGRESS',
        score: 0,
        totalPoints: 1,
      });
    });

    it('8.1 should successfully delete DRAFT quiz with no attempts', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/quizzes/${disposableQuizId}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      const check = await testDb.select().from(schema.quizzes).where(eq(schema.quizzes.id, disposableQuizId));
      expect(check.length).toBe(0);
    });

    it('8.2 should block deleting quiz that has student attempts (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/quizzes/${attemptedQuizId}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_HAS_ATTEMPTS');
      expect(res.body.message).toContain('student attempt(s) have been recorded');
    });

    it('8.3 should block deleting questions from a quiz with attempts (409 Conflict)', async () => {
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${attemptedQuizId}`)
        .set('Cookie', instructor1Cookies);
      const questionId = qRes.body.data.questions[0].id;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/questions/${questionId}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_HAS_ATTEMPTS');
    });

    it('8.4 should block deleting options from a quiz with attempts (409 Conflict)', async () => {
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${attemptedQuizId}`)
        .set('Cookie', instructor1Cookies);
      const optionId = qRes.body.data.questions[0].options[0].id;

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/options/${optionId}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_HAS_ATTEMPTS');
    });

    it('8.5 should block structurally altering a question on a quiz with attempts (409 Conflict)', async () => {
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/quizzes/${attemptedQuizId}`)
        .set('Cookie', instructor1Cookies);
      const questionId = qRes.body.data.questions[0].id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/questions/${questionId}`)
        .set('Cookie', instructor1Cookies)
        .send({
          points: 5,
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_HAS_ATTEMPTS');
    });
  });

  // =========================================================================
  // 9. Audit Event Verification
  // =========================================================================
  describe('9. Audit Event Logging', () => {
    it('9.1 should verify audit logs emitted for quiz lifecycle events', async () => {
      const auditEntries = await testDb
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.targetType, 'QUIZ'))
        .orderBy(desc(schema.auditLogs.createdAt));

      const actions = auditEntries.map((a: any) => a.action);

      expect(actions).toContain('QUIZ_CREATED');
      expect(actions).toContain('QUIZ_UPDATED');
      expect(actions).toContain('QUIZ_PUBLISHED');
      expect(actions).toContain('QUIZ_ARCHIVED');
      expect(actions).toContain('QUIZ_DELETED');
    });
  });
});
