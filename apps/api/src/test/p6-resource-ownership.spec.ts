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

import { CloudinaryService } from '../modules/media/cloudinary/cloudinary.service';

describe('P6.1 — Pillar B: Contextual Resource Ownership & Zero-Trust Authorization Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  let adminCookies: string[];
  let instructor1Cookies: string[];
  let instructor2Cookies: string[];

  let adminId: string;
  let instructor1Id: string;
  let instructor2Id: string;

  let course1: any;
  let course2: any;
  let module1: any;
  let lesson1: any;
  let quiz1: any;
  let question1: any;
  let option1: any;
  let media1: any;

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
        name: 'Dr. Jane Hopper',
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

    // Seed Admin, Instructor 1, Instructor 2
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

    // Seed Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Cloud Computing',
        slug: 'cloud-computing',
        description: 'Cloud Infrastructure & Distributed Systems',
        isActive: true,
      })
      .returning();

    // Seed Course 1 owned by Instructor 1
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Distributed Systems & Cloud Architecture',
        slug: 'distributed-systems-cloud',
        description: 'Production systems engineering with microservices.',
        instructorId: instructor1Id,
        categoryId: cat.id,
        difficultyLevel: 'ADVANCED',
        priceCents: 150000,
        status: 'PUBLISHED',
      })
      .returning();
    course1 = c1;

    // Seed Course 2 owned by Instructor 2
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Kubernetes in Action',
        slug: 'kubernetes-in-action',
        description: 'Container orchestration fundamentals.',
        instructorId: instructor2Id,
        categoryId: cat.id,
        difficultyLevel: 'INTERMEDIATE',
        priceCents: 120000,
        status: 'PUBLISHED',
      })
      .returning();
    course2 = c2;

    // Seed Module 1 under Course 1
    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course1.id,
        title: 'Module 1: Consensus Protocols',
        description: 'Paxos and Raft consensus mechanics',
        position: 1,
      })
      .returning();
    module1 = m1;

    // Seed Lesson 1 under Module 1
    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Lesson 1: Raft Leader Election',
        position: 1,
        lessonType: 'TEXT',
        content: 'Understanding raft leader heartbeats and term counters.',
        isPreview: false,
      })
      .returning();
    lesson1 = l1;

    // Seed Quiz 1 under Module 1
    const [q1] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Quiz 1: Raft Consensus Mastery',
        description: 'Evaluate raft election mechanics',
        position: 1,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 80,
        maxAttempts: 3,
        timeLimitMinutes: 20,
        status: 'DRAFT',
      })
      .returning();
    quiz1 = q1;

    // Seed Question 1 under Quiz 1
    const [quest1] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz1.id,
        questionText: 'What happens when a follower experiences a heartbeat timeout?',
        position: 1,
        points: 10,
        explanation: 'It transitions to candidate and starts an election term.',
      })
      .returning();
    question1 = quest1;

    // Seed Option 1 under Question 1
    const [opt1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: question1.id,
        optionText: 'It increments its current term and transitions to candidate state.',
        isCorrect: true,
        position: 1,
      })
      .returning();
    option1 = opt1;

    // Seed Media uploaded by Instructor 1
    const [med1] = await testDb
      .insert(schema.media)
      .values({
        storageProvider: 'CLOUDINARY',
        storageKey: 'techsprout/images/raft-diagram',
        publicUrl: 'https://res.cloudinary.com/test/image/upload/raft-diagram.png',
        originalFilename: 'raft-diagram.png',
        mimeType: 'image/png',
        fileSize: 204800,
        uploaderId: instructor1Id,
      })
      .returning();
    media1 = med1;

    // Compile TestingModule
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
        uploadStream: async (_buf: any, opts: any) => ({
          public_id: opts?.public_id || 'techsprout/images/raft-diagram-replaced',
          secure_url: 'https://res.cloudinary.com/test/image/upload/raft-diagram-replaced.png',
          resource_type: opts?.resource_type || 'image',
          format: 'png',
          bytes: 1024,
          created_at: new Date().toISOString(),
        }),
        destroy: async () => ({ result: 'ok' }),
      })
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

  // =========================================================================
  // 1. COURSE OWNERSHIP
  // =========================================================================
  describe('Course Resource Ownership', () => {
    it('allows course owner (Instructor 1) to update their own course', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${course1.id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Distributed Systems & Cloud Architecture (Updated)',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Distributed Systems & Cloud Architecture (Updated)');
    });

    it('rejects unrelated instructor (Instructor 2) attempting to update Course 1 with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${course1.id}`)
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Malicious Hijack Attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('allows Admin to bypass course ownership and update Course 1', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${course1.id}`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Distributed Systems — Admin Moderated',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Distributed Systems — Admin Moderated');
    });
  });

  // =========================================================================
  // 2. MODULE OWNERSHIP (Chain: module -> course)
  // =========================================================================
  describe('Module Resource Ownership', () => {
    it('allows parent course owner (Instructor 1) to update module', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/modules/${module1.id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Module 1: Raft & Paxos Consensus (Updated)',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Module 1: Raft & Paxos Consensus (Updated)');
    });

    it('rejects unrelated instructor (Instructor 2) from updating module under Course 1 with 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/modules/${module1.id}`)
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Unauthorized Module Rename',
        });

      expect(res.status).toBe(403);
    });

    it('allows Admin to update module under any course', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/modules/${module1.id}`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Module 1: Admin Verified Title',
        });

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // 3. LESSON OWNERSHIP (Chain: lesson -> module -> course)
  // =========================================================================
  describe('Lesson Resource Ownership', () => {
    it('allows parent course owner (Instructor 1) to update lesson', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/lessons/${lesson1.id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Lesson 1: Raft Leader Election & Split Votes (Updated)',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Lesson 1: Raft Leader Election & Split Votes (Updated)');
    });

    it('rejects unrelated instructor (Instructor 2) from updating lesson with 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/lessons/${lesson1.id}`)
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Tampered Lesson Content',
        });

      expect(res.status).toBe(403);
    });

    it('allows Admin to update lesson under any module/course', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/lessons/${lesson1.id}`)
        .set('Cookie', adminCookies)
        .send({
          title: 'Lesson 1: Admin Approved Version',
        });

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // 4. QUIZ OWNERSHIP (Chain: quiz -> module -> course)
  // =========================================================================
  describe('Quiz Resource Ownership', () => {
    it('allows parent course owner (Instructor 1) to update quiz', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${quiz1.id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          title: 'Quiz 1: Raft Consensus Mastery (Updated)',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Quiz 1: Raft Consensus Mastery (Updated)');
    });

    it('rejects unrelated instructor (Instructor 2) from updating quiz with 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/quizzes/${quiz1.id}`)
        .set('Cookie', instructor2Cookies)
        .send({
          title: 'Altered Quiz Title',
        });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. QUESTION & OPTION OWNERSHIP (Chain: question -> quiz -> module -> course)
  // =========================================================================
  describe('Quiz Question & Option Resource Ownership', () => {
    it('allows parent course owner (Instructor 1) to update quiz question', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/questions/${question1.id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          explanation: 'Updated detailed explanation of heartbeat intervals.',
        });

      expect(res.status).toBe(200);
    });

    it('rejects unrelated instructor (Instructor 2) from updating quiz question with 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/questions/${question1.id}`)
        .set('Cookie', instructor2Cookies)
        .send({
          explanation: 'Malicious question alteration.',
        });

      expect(res.status).toBe(403);
    });

    it('allows parent course owner (Instructor 1) to update quiz option', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/options/${option1.id}`)
        .set('Cookie', instructor1Cookies)
        .send({
          optionText: 'It increments its current term and initiates leader election.',
        });

      expect(res.status).toBe(200);
    });

    it('rejects unrelated instructor (Instructor 2) from updating quiz option with 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/options/${option1.id}`)
        .set('Cookie', instructor2Cookies)
        .send({
          optionText: 'Tampered option text.',
        });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 6. MEDIA OWNERSHIP (media.uploaderId === req.user.id)
  // =========================================================================
  describe('Media Resource Ownership', () => {
    it('rejects unrelated instructor (Instructor 2) from replacing media uploaded by Instructor 1 with 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/media/replace?oldPublicId=${media1.storageKey}`)
        .set('Cookie', instructor2Cookies)
        .field('oldPublicId', media1.storageKey)
        .field('resourceType', 'image')
        .attach('file', Buffer.from('mock-image-bytes'), 'replacement.png');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('allows uploader (Instructor 1) to replace their own media', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/media/replace?oldPublicId=${media1.storageKey}`)
        .set('Cookie', instructor1Cookies)
        .field('oldPublicId', media1.storageKey)
        .field('resourceType', 'image')
        .attach('file', Buffer.from('mock-image-bytes'), 'replacement.png');

      expect([200, 201]).toContain(res.status);
    });

    it('allows Admin to replace any media regardless of uploader', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/media/replace?oldPublicId=${media1.storageKey}`)
        .set('Cookie', adminCookies)
        .field('oldPublicId', media1.storageKey)
        .field('resourceType', 'image')
        .attach('file', Buffer.from('mock-image-bytes'), 'replacement.png');

      expect([200, 201]).toContain(res.status);
    });
  });

  // =========================================================================
  // 7. AUDIT LOGGING OF UNAUTHORIZED ATTEMPTS
  // =========================================================================
  describe('Audit Logging of Unauthorized Resource Attempts', () => {
    it('records an audit log entry when an unauthorized instructor attempts access', async () => {
      // Trigger an unauthorized attempt on course 1 by instructor 2
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/courses/${course1.id}`)
        .set('Cookie', instructor2Cookies)
        .send({ title: 'Audit Test Attempt' });

      // Inspect audit_logs table
      const auditEntries = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'UNAUTHORIZED_RESOURCE_ACCESS_ATTEMPT'),
            eq(schema.auditLogs.actorId, instructor2Id)
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt));

      expect(auditEntries.length).toBeGreaterThan(0);
      const latest = auditEntries[0];
      expect(latest.targetType).toBe('COURSE');
      expect(latest.targetId).toBe(course1.id);
    });
  });
});
