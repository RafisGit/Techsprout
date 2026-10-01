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

describe('P4.4 — Curriculum Mixed Ordering & Quiz Discovery API Integration Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  let studentCookies: string[];
  let unenrolledStudentCookies: string[];
  let instructorCookies: string[];
  let adminCookies: string[];

  let studentId: string;
  let unenrolledStudentId: string;
  let instructorId: string;
  let adminId: string;

  let category: any;
  let publishedCourse: any;
  let archivedCourse: any;
  let module1: any;
  let module2: any;
  let archivedModule: any;

  let lessonM1L1: any; // position 1
  let lessonM1L2: any; // position 2
  let lessonM1L3: any; // position 3
  let quizM1Published: any; // position 1 (collides with lessonM1L1)
  let quizM1Draft: any; // position 2
  let quizM1Archived: any; // position 3
  let quizM1SecondPublished: any; // position 2 (collides with lessonM1L2)

  let lessonM2L1: any;
  let quizM2Published: any;

  let archivedLesson: any;
  let archivedQuiz: any;

  let studentEnrollment: any;
  let archivedEnrollment: any;

  let question1: any;
  let opt1Correct: any;
  let opt2Incorrect: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // Retrieve system roles
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const [instructorRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'))
      .limit(1);

    const [adminRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'admin'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Pass123456!');

    // 1. Instructor
    const [inst] = await testDb
      .insert(schema.users)
      .values({
        name: 'Alan Turing',
        username: 'alan_turing',
        email: 'turing@techsprout.edu',
        phone: '01710000001',
        passwordHash,
        isVerified: true,
      })
      .returning();
    instructorId = inst.id;
    await testDb.insert(schema.userRoles).values({ userId: inst.id, roleId: instructorRole.id });

    // 2. Admin
    const [adm] = await testDb
      .insert(schema.users)
      .values({
        name: 'Curriculum Admin',
        username: 'curriculum_admin',
        email: 'curriculum_admin@techsprout.edu',
        phone: '01710000002',
        passwordHash,
        isVerified: true,
      })
      .returning();
    adminId = adm.id;
    await testDb.insert(schema.userRoles).values({ userId: adm.id, roleId: adminRole.id });

    // 3. Enrolled Student
    const [st1] = await testDb
      .insert(schema.users)
      .values({
        name: 'Margaret Hamilton',
        username: 'margaret_hamilton',
        email: 'margaret@techsprout.edu',
        phone: '01710000003',
        passwordHash,
        isVerified: true,
      })
      .returning();
    studentId = st1.id;
    await testDb.insert(schema.userRoles).values({ userId: st1.id, roleId: studentRole.id });

    // 4. Unenrolled Student
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Unenrolled Observer',
        username: 'unenrolled_obs',
        email: 'observer@techsprout.edu',
        phone: '01710000004',
        passwordHash,
        isVerified: true,
      })
      .returning();
    unenrolledStudentId = st2.id;
    await testDb.insert(schema.userRoles).values({ userId: st2.id, roleId: studentRole.id });

    // Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Software Engineering',
        slug: 'software-engineering',
        description: 'Modern SE Practices',
        isActive: true,
      })
      .returning();
    category = cat;

    // Course 1 (Published)
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Full-Stack Curriculum Engineering',
        slug: 'fullstack-curriculum-engineering',
        shortDescription: 'Master modern full-stack workflows',
        description: 'Deep dive into full-stack architecture and curriculum sequencing',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '49.99',
        currency: 'USD',
        level: 'INTERMEDIATE',
        language: 'English',
        durationMinutes: 480,
        categoryId: category.id,
        instructorId,
      })
      .returning();
    publishedCourse = c1;

    // Course 2 (Archived)
    const [cArch] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Legacy Architecture',
        slug: 'legacy-architecture',
        shortDescription: 'Historical software systems',
        description: 'Retrospective on older computing architectures',
        status: 'ARCHIVED',
        visibility: 'PUBLIC',
        price: '19.99',
        currency: 'USD',
        level: 'BEGINNER',
        language: 'English',
        durationMinutes: 240,
        categoryId: category.id,
        instructorId,
      })
      .returning();
    archivedCourse = cArch;

    // Modules in Published Course
    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: publishedCourse.id,
        title: 'Module 1: Architecture Foundations',
        position: 1,
      })
      .returning();
    module1 = m1;

    const [m2] = await testDb
      .insert(schema.modules)
      .values({
        courseId: publishedCourse.id,
        title: 'Module 2: Advanced Topics',
        position: 2,
      })
      .returning();
    module2 = m2;

    // Module in Archived Course
    const [mArch] = await testDb
      .insert(schema.modules)
      .values({
        courseId: archivedCourse.id,
        title: 'Archived Module: Classic Systems',
        position: 1,
      })
      .returning();
    archivedModule = mArch;

    // Module 1 Lessons:
    // Lesson 1: raw position = 1
    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Introduction to Distributed Systems',
        position: 1,
        lessonType: 'VIDEO',
        durationSeconds: 600,
        isPreview: true,
      })
      .returning();
    lessonM1L1 = l1;

    // Lesson 2: raw position = 2
    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Consensus Protocols',
        position: 2,
        lessonType: 'VIDEO',
        durationSeconds: 900,
        isPreview: false,
      })
      .returning();
    lessonM1L2 = l2;

    // Lesson 3: raw position = 3
    const [l3] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Event-Driven Architectures',
        position: 3,
        lessonType: 'TEXT',
        durationSeconds: 450,
        isPreview: false,
      })
      .returning();
    lessonM1L3 = l3;

    // Module 1 Quizzes:
    // Published Quiz 1: raw position = 1 (COLLIDES with Lesson 1 position = 1!)
    const [q1] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Distributed Systems Checkpoint',
        description: 'Verify your understanding of distributed basics',
        position: 1,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        timeLimitMinutes: 15,
        maxAttempts: 3,
        status: 'PUBLISHED',
      })
      .returning();
    quizM1Published = q1;

    // Published Quiz 2: raw position = 2 (COLLIDES with Lesson 2 position = 2!)
    const [q1b] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Consensus Mastery Quiz',
        description: 'Raft and Paxos verification',
        position: 2,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 80,
        timeLimitMinutes: 20,
        maxAttempts: 2,
        status: 'PUBLISHED',
      })
      .returning();
    quizM1SecondPublished = q1b;

    // Draft Quiz: raw position = 4 (Must NOT be returned in student curriculum)
    const [qDraft] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Unpublished Draft Assessment',
        position: 4,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 75,
        status: 'DRAFT',
      })
      .returning();
    quizM1Draft = qDraft;

    // Archived Quiz: raw position = 5 (Must NOT be returned in student curriculum)
    const [qArch] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Deprecated Module 1 Quiz',
        position: 5,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 75,
        status: 'ARCHIVED',
      })
      .returning();
    quizM1Archived = qArch;

    // Questions and Options for Quiz 1
    const [q1Quest] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quizM1Published.id,
        questionText: 'What does the CAP theorem state is impossible in an asynchronous network with partitions?',
        questionType: 'SINGLE_CHOICE',
        position: 1,
        points: 20,
        explanation: 'A network partition forces a choice between Consistency and Availability.',
      })
      .returning();
    question1 = q1Quest;

    const [o1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: question1.id,
        optionText: 'Simultaneous Consistency and Availability',
        position: 1,
        isCorrect: true,
      })
      .returning();
    opt1Correct = o1;

    const [o2] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: question1.id,
        optionText: 'Linear scalability and zero latency',
        position: 2,
        isCorrect: false,
      })
      .returning();
    opt2Incorrect = o2;

    // Questions for Quiz 2
    const [q2Quest] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quizM1SecondPublished.id,
        questionText: 'In Raft, what role does a node hold before becoming a Leader?',
        questionType: 'SINGLE_CHOICE',
        position: 1,
        points: 10,
        explanation: 'Nodes transition from Follower to Candidate to Leader.',
      })
      .returning();

    await testDb.insert(schema.quizQuestionOptions).values([
      { questionId: q2Quest.id, optionText: 'Candidate', position: 1, isCorrect: true },
      { questionId: q2Quest.id, optionText: 'Master', position: 2, isCorrect: false },
    ]);

    // Module 2 Content: 1 lesson, 1 published quiz
    const [lM2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module2.id,
        title: 'Microservices & Service Meshes',
        position: 1,
        lessonType: 'VIDEO',
        durationSeconds: 700,
        isPreview: false,
      })
      .returning();
    lessonM2L1 = lM2;

    const [qM2] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module2.id,
        title: 'Module 2 Comprehensive Final Exam',
        position: 2,
        quizType: 'FINAL_EXAM',
        passingScorePercentage: 85,
        timeLimitMinutes: 45,
        maxAttempts: 1,
        status: 'PUBLISHED',
      })
      .returning();
    quizM2Published = qM2;

    const [qM2Quest] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quizM2Published.id,
        questionText: 'Does mTLS encrypt service-to-service communication?',
        questionType: 'TRUE_FALSE',
        position: 1,
        points: 50,
      })
      .returning();

    await testDb.insert(schema.quizQuestionOptions).values([
      { questionId: qM2Quest.id, optionText: 'True', position: 1, isCorrect: true },
      { questionId: qM2Quest.id, optionText: 'False', position: 2, isCorrect: false },
    ]);

    // Archived Course Content:
    const [lArch] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: archivedModule.id,
        title: 'Mainframe Job Control Language',
        position: 1,
        lessonType: 'TEXT',
        durationSeconds: 500,
      })
      .returning();
    archivedLesson = lArch;

    const [qArchCourse] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: archivedModule.id,
        title: 'JCL Fundamentals Check',
        position: 2,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        status: 'PUBLISHED',
      })
      .returning();
    archivedQuiz = qArchCourse;

    // Enrollments:
    // Student enrolled in publishedCourse
    const [enr1] = await testDb
      .insert(schema.enrollments)
      .values({
        courseId: publishedCourse.id,
        studentId,
        status: 'ACTIVE',
      })
      .returning();
    studentEnrollment = enr1;

    // Student enrolled in archivedCourse (pre-archival learner)
    const [enrArch] = await testDb
      .insert(schema.enrollments)
      .values({
        courseId: archivedCourse.id,
        studentId,
        status: 'ACTIVE',
      })
      .returning();
    archivedEnrollment = enrArch;

    // Create Nest Application
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
    const stLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'margaret@techsprout.edu', password: 'Pass123456!' });
    studentCookies = stLogin.headers['set-cookie'] as unknown as string[];

    const unenrolledLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'observer@techsprout.edu', password: 'Pass123456!' });
    unenrolledStudentCookies = unenrolledLogin.headers['set-cookie'] as unknown as string[];

    const instLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'turing@techsprout.edu', password: 'Pass123456!' });
    instructorCookies = instLogin.headers['set-cookie'] as unknown as string[];

    const admLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'curriculum_admin@techsprout.edu', password: 'Pass123456!' });
    adminCookies = admLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // =========================================================================
  // 1. Published Quizzes Appear in Student Curriculum
  // =========================================================================
  it('1. published quiz appears in student curriculum with required safe metadata', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();

    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);
    expect(m1).toBeDefined();
    expect(Array.isArray(m1.items)).toBe(true);

    const quizItem = m1.items.find((it: any) => it.id === quizM1Published.id);
    expect(quizItem).toBeDefined();
    expect(quizItem.type).toBe('QUIZ');
    expect(quizItem.title).toBe('Distributed Systems Checkpoint');
    expect(quizItem.quizType).toBe('KNOWLEDGE_CHECK');
    expect(quizItem.passingScorePercentage).toBe(70);
    expect(quizItem.timeLimitMinutes).toBe(15);
    expect(quizItem.totalPoints).toBe(20);
    expect(quizItem.questionsCount).toBe(1);
    expect(quizItem.maxAttempts).toBe(3);
    expect(quizItem.isPassed).toBe(false);
    expect(quizItem.userAttemptsCount).toBe(0);
    expect(quizItem.bestScorePercentage).toBeNull();
  });

  // =========================================================================
  // 2. Draft Quiz Does Not Appear
  // =========================================================================
  it('2. draft quiz does not appear in student curriculum items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);
    const draftItem = m1.items.find((it: any) => it.id === quizM1Draft.id);
    expect(draftItem).toBeUndefined();
  });

  // =========================================================================
  // 3. Archived Quiz Does Not Appear
  // =========================================================================
  it('3. archived quiz does not appear in student curriculum items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);
    const archivedItem = m1.items.find((it: any) => it.id === quizM1Archived.id);
    expect(archivedItem).toBeUndefined();
  });

  // =========================================================================
  // 4. Quiz Appears Under Correct Module
  // =========================================================================
  it('4. quiz appears under correct module in multi-module course', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);
    const m2 = res.body.data.modules.find((m: any) => m.id === module2.id);

    // Quiz 1 and Quiz 2 are in Module 1, NOT Module 2
    expect(m1.items.some((it: any) => it.id === quizM1Published.id)).toBe(true);
    expect(m1.items.some((it: any) => it.id === quizM1SecondPublished.id)).toBe(true);
    expect(m2.items.some((it: any) => it.id === quizM1Published.id)).toBe(false);

    // Quiz M2 is in Module 2, NOT Module 1
    expect(m2.items.some((it: any) => it.id === quizM2Published.id)).toBe(true);
    expect(m1.items.some((it: any) => it.id === quizM2Published.id)).toBe(false);
  });

  // =========================================================================
  // 5. Authoritative Mixed Curriculum Order & Position Collision Resolution
  // =========================================================================
  it('5. resolves separate position collisions deterministically with unified sequential position', async () => {
    // In Module 1:
    // Lesson 1 has raw position: 1
    // Quiz 1 has raw position: 1  --> COLLISION at position 1!
    // Lesson 2 has raw position: 2
    // Quiz 2 has raw position: 2  --> COLLISION at position 2!
    // Lesson 3 has raw position: 3
    //
    // The deterministic authoritative ordering rule specifies:
    // (a) Sort primary by rawPosition ASC
    // (b) At equal rawPosition, LESSON precedes QUIZ (instruction before assessment)
    // (c) Renumber sequentially: 1, 2, 3, 4, 5
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);

    // Expected sequence:
    // 1. Lesson 1 (type: LESSON, id: lessonM1L1.id, position: 1)
    // 2. Quiz 1   (type: QUIZ,   id: quizM1Published.id, position: 2)
    // 3. Lesson 2 (type: LESSON, id: lessonM1L2.id, position: 3)
    // 4. Quiz 2   (type: QUIZ,   id: quizM1SecondPublished.id, position: 4)
    // 5. Lesson 3 (type: LESSON, id: lessonM1L3.id, position: 5)
    expect(m1.items.length).toBe(5);

    expect(m1.items[0].id).toBe(lessonM1L1.id);
    expect(m1.items[0].type).toBe('LESSON');
    expect(m1.items[0].position).toBe(1);

    expect(m1.items[1].id).toBe(quizM1Published.id);
    expect(m1.items[1].type).toBe('QUIZ');
    expect(m1.items[1].position).toBe(2);

    expect(m1.items[2].id).toBe(lessonM1L2.id);
    expect(m1.items[2].type).toBe('LESSON');
    expect(m1.items[2].position).toBe(3);

    expect(m1.items[3].id).toBe(quizM1SecondPublished.id);
    expect(m1.items[3].type).toBe('QUIZ');
    expect(m1.items[3].position).toBe(4);

    expect(m1.items[4].id).toBe(lessonM1L3.id);
    expect(m1.items[4].type).toBe('LESSON');
    expect(m1.items[4].position).toBe(5);
  });

  // =========================================================================
  // 6. Lesson + Quiz + Lesson Ordering Pattern
  // =========================================================================
  it('6. verifies lesson -> quiz -> lesson alternating structure', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);

    // Items 0, 1, 2 represent [Lesson, Quiz, Lesson]
    expect(m1.items[0].type).toBe('LESSON');
    expect(m1.items[1].type).toBe('QUIZ');
    expect(m1.items[2].type).toBe('LESSON');
  });

  // =========================================================================
  // 7. Multiple Quizzes Ordering
  // =========================================================================
  it('7. verifies multiple quizzes in a single module maintain relative order', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);
    const quizzesOnly = m1.items.filter((it: any) => it.type === 'QUIZ');

    expect(quizzesOnly.length).toBe(2);
    expect(quizzesOnly[0].id).toBe(quizM1Published.id);
    expect(quizzesOnly[1].id).toBe(quizM1SecondPublished.id);
    expect(quizzesOnly[0].position).toBeLessThan(quizzesOnly[1].position);
  });

  // =========================================================================
  // 8. Quiz Completion / Passed Indicator
  // =========================================================================
  it('8. updates quiz completion/passed indicator and stats upon passing attempt', async () => {
    // 8.1 Before attempt: not passed, 0 attempts, bestScore null
    let res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);
    let m1 = res.body.data.modules.find((m: any) => m.id === module1.id);
    let qItem = m1.items.find((it: any) => it.id === quizM1Published.id);
    expect(qItem.isPassed).toBe(false);
    expect(qItem.userAttemptsCount).toBe(0);
    expect(qItem.bestScorePercentage).toBeNull();

    // 8.2 Start attempt and submit passing answer
    const startRes = await request(app.getHttpServer())
      .post(`/api/v1/learn/quizzes/${quizM1Published.id}/attempts`)
      .set('Cookie', studentCookies);
    expect(startRes.status).toBe(201);
    const attemptId = startRes.body.data.id;

    const subRes = await request(app.getHttpServer())
      .post(`/api/v1/learn/quizzes/${quizM1Published.id}/attempts/${attemptId}/submit`)
      .set('Cookie', studentCookies)
      .send({
        answers: [{ questionId: question1.id, selectedOptionIds: [opt1Correct.id] }],
      });
    expect(subRes.status).toBe(200);
    expect(subRes.body.data.isPassed).toBe(true);

    // 8.3 Curriculum now reflects isPassed: true and bestScorePercentage: 100
    res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);
    expect(res.status).toBe(200);
    m1 = res.body.data.modules.find((m: any) => m.id === module1.id);
    qItem = m1.items.find((it: any) => it.id === quizM1Published.id);

    expect(qItem.isPassed).toBe(true);
    expect(qItem.userAttemptsCount).toBe(1);
    expect(qItem.bestScorePercentage).toBe(100);
    expect(res.body.data.passedQuizzesCount).toBe(1);
  });

  // =========================================================================
  // 9. Student Cannot Receive Answer Keys Through Curriculum
  // =========================================================================
  it('9. strictly prevents answer keys, correct flags, or questions from leaking in curriculum', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const jsonString = JSON.stringify(res.body);

    // Assert sensitive assessment keys do NOT exist anywhere in payload
    expect(jsonString).not.toContain('"isCorrect"');
    expect(jsonString).not.toContain('"correctOptionId"');
    expect(jsonString).not.toContain('"correctOptionIds"');
    expect(jsonString).not.toContain('"explanation"');
    expect(jsonString).not.toContain('"questionText"');
    expect(jsonString).not.toContain('"options"');
  });

  // =========================================================================
  // 10. Existing P3 Lesson Curriculum Remains Unchanged (Backward Compatibility)
  // =========================================================================
  it('10. preserves existing P3 module.lessons array and lesson contract fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const m1 = res.body.data.modules.find((m: any) => m.id === module1.id);

    // module.lessons must remain present and contain only lessons
    expect(Array.isArray(m1.lessons)).toBe(true);
    expect(m1.lessons.length).toBe(3);

    for (const lesson of m1.lessons) {
      expect(lesson.id).toBeDefined();
      expect(lesson.title).toBeDefined();
      expect(typeof lesson.position).toBe('number');
      expect(lesson.lessonType).toBeDefined();
      expect(lesson.progress).toBeDefined();
      expect(lesson.progress.status).toBeDefined();
      expect(lesson.progress.watchPositionSeconds).toBeDefined();
    }
  });

  // =========================================================================
  // 11. Archived Course Learner Access Behavior Intact
  // =========================================================================
  it('11. allows enrolled learner on archived course to retrieve curriculum with published quizzes', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${archivedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    expect(res.body.data.courseStatus).toBe('ARCHIVED');
    expect(res.body.data.modules.length).toBe(1);

    const archMod = res.body.data.modules[0];
    expect(archMod.items.length).toBe(2); // 1 lesson + 1 published quiz
    expect(archMod.items[0].type).toBe('LESSON');
    expect(archMod.items[1].type).toBe('QUIZ');
    expect(archMod.items[1].id).toBe(archivedQuiz.id);
  });

  // =========================================================================
  // 12. Instructor and Admin Authorization Remains Intact
  // =========================================================================
  it('12. enforces authentication and enrollment authorization rules', async () => {
    // 12.1 Unauthenticated guest receives 401
    const unauthRes = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`);
    expect(unauthRes.status).toBe(401);

    // 12.2 Unenrolled student receives 403 ENROLLMENT_REQUIRED
    const unenrolledRes = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', unenrolledStudentCookies);
    expect(unenrolledRes.status).toBe(403);
    expect(unenrolledRes.body.errorCode).toBe('ENROLLMENT_REQUIRED');

    // 12.3 Course instructor receives 200 without requiring student enrollment
    const instRes = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', instructorCookies);
    expect(instRes.status).toBe(200);
    expect(instRes.body.data.modules.length).toBe(2);

    // 12.4 Platform admin receives 200 without requiring student enrollment
    const adminRes = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', adminCookies);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.modules.length).toBe(2);
  });

  // =========================================================================
  // 13. Case B: Lessons at positions 1, 2, 3 and single Quiz at position 2
  // =========================================================================
  it('13. correctly orders Case B: Lessons 1, 2, 3 and Quiz 2 -> Lesson 1, Lesson 2, Quiz, Lesson 3', async () => {
    // Create a dedicated module in publishedCourse with 3 lessons (pos 1, 2, 3) and 1 quiz (pos 2)
    const [mCaseB] = await testDb
      .insert(schema.modules)
      .values({
        courseId: publishedCourse.id,
        title: 'Module Case B: Ordering Verification',
        position: 10,
      })
      .returning();

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: mCaseB.id,
        title: 'Case B Lesson 1',
        position: 1,
        lessonType: 'VIDEO',
      })
      .returning();

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: mCaseB.id,
        title: 'Case B Lesson 2',
        position: 2,
        lessonType: 'VIDEO',
      })
      .returning();

    const [l3] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: mCaseB.id,
        title: 'Case B Lesson 3',
        position: 3,
        lessonType: 'TEXT',
      })
      .returning();

    const [qCaseB] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: mCaseB.id,
        title: 'Case B Mid-Module Quiz',
        position: 2, // Collides with Lesson 2 at position 2!
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        status: 'PUBLISHED',
      })
      .returning();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`)
      .set('Cookie', studentCookies);

    expect(res.status).toBe(200);
    const mod = res.body.data.modules.find((m: any) => m.id === mCaseB.id);
    expect(mod).toBeDefined();
    expect(mod.items.length).toBe(4);

    // Expected sequence:
    // 1. Lesson 1 (position 1)
    // 2. Lesson 2 (position 2) -> because at raw pos 2, LESSON precedes QUIZ
    // 3. Quiz     (position 3) -> because at raw pos 2, QUIZ follows LESSON
    // 4. Lesson 3 (position 4) -> raw pos 3
    expect(mod.items[0].id).toBe(l1.id);
    expect(mod.items[0].type).toBe('LESSON');
    expect(mod.items[0].position).toBe(1);

    expect(mod.items[1].id).toBe(l2.id);
    expect(mod.items[1].type).toBe('LESSON');
    expect(mod.items[1].position).toBe(2);

    expect(mod.items[2].id).toBe(qCaseB.id);
    expect(mod.items[2].type).toBe('QUIZ');
    expect(mod.items[2].position).toBe(3);

    expect(mod.items[3].id).toBe(l3.id);
    expect(mod.items[3].type).toBe('LESSON');
    expect(mod.items[3].position).toBe(4);
  });

  // =========================================================================
  // 14. Case E: Repeated calls against identical database state yield stable order
  // =========================================================================
  it('14. guarantees repeatable, idempotent, stable curriculum ordering across repeated calls', async () => {
    const runs = await Promise.all([
      request(app.getHttpServer()).get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`).set('Cookie', studentCookies),
      request(app.getHttpServer()).get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`).set('Cookie', studentCookies),
      request(app.getHttpServer()).get(`/api/v1/learn/courses/${publishedCourse.id}/curriculum`).set('Cookie', studentCookies),
    ]);

    const firstRunJson = JSON.stringify(runs[0].body.data.modules);
    for (let i = 1; i < runs.length; i++) {
      expect(JSON.stringify(runs[i].body.data.modules)).toBe(firstRunJson);
    }
  });
});
