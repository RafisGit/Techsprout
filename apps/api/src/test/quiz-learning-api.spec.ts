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
import { eq, and, desc, ne, sql } from 'drizzle-orm';
import { env } from '../config/env.config';

describe('P4.3 — Student Quiz-Taking & Grading API Integration Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  let student1Cookies: string[];
  let student2Cookies: string[];
  let student3Cookies: string[];
  let instructorCookies: string[];

  let student1Id: string;
  let student2Id: string;
  let student3Id: string;
  let instructorId: string;

  let category: any;
  let course1: any;
  let course2: any;
  let archivedCourse: any;

  let module1: any;
  let module2: any;
  let lesson1: any;
  let lesson2: any;

  let enrollment1Student1: any;
  let enrollment1Student2: any;
  let enrollmentCancelled: any;
  let enrollmentArchived: any;

  let quiz1: any; // Published, 3 questions, maxAttempts: 2, untimed, passingScore: 70
  let q1Single: any; // 10 pts, single choice
  let q1SingleOpt1: any; // correct
  let q1SingleOpt2: any; // incorrect
  let q1Multiple: any; // 20 pts, multiple choice
  let q1MultiOpt1: any; // correct
  let q1MultiOpt2: any; // correct
  let q1MultiOpt3: any; // incorrect
  let q1TrueFalse: any; // 10 pts, true/false
  let q1TFOpt1: any; // correct (True)
  let q1TFOpt2: any; // incorrect (False)

  let quizDraft: any; // Draft quiz (unpublished)
  let quizTimed: any; // Timed quiz (1 min limit)
  let qTimed: any;
  let qTimedOpt1: any;
  let qTimedOpt2: any;

  let quizUnlimited: any; // maxAttempts: null
  let qUnlim: any;
  let qUnlimOpt1: any;
  let qUnlimOpt2: any;

  let quizCourse2: any; // Quiz in Course 2

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // Retrieve roles
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

    const passwordHash = await CryptoUtil.hashPassword('Pass123456!');

    // Seed Instructor
    const [inst] = await testDb
      .insert(schema.users)
      .values({
        name: 'Prof. Donald Knuth',
        username: 'instructor_knuth',
        email: 'knuth@techsprout.edu',
        phone: '01711111111',
        passwordHash,
        isVerified: true,
      })
      .returning();
    instructorId = inst.id;
    await testDb.insert(schema.userRoles).values({ userId: inst.id, roleId: instructorRole.id });

    // Seed Student 1
    const [st1] = await testDb
      .insert(schema.users)
      .values({
        name: 'Ada Lovelace',
        username: 'ada_lovelace',
        email: 'ada@techsprout.edu',
        phone: '01722222222',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student1Id = st1.id;
    await testDb.insert(schema.userRoles).values({ userId: st1.id, roleId: studentRole.id });

    // Seed Student 2
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Grace Hopper',
        username: 'grace_hopper',
        email: 'grace@techsprout.edu',
        phone: '01733333333',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = st2.id;
    await testDb.insert(schema.userRoles).values({ userId: st2.id, roleId: studentRole.id });

    // Seed Student 3 (For unenrollment/cancelled tests)
    const [st3] = await testDb
      .insert(schema.users)
      .values({
        name: 'Charles Babbage',
        username: 'charles_babbage',
        email: 'babbage@techsprout.edu',
        phone: '01744444444',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student3Id = st3.id;
    await testDb.insert(schema.userRoles).values({ userId: st3.id, roleId: studentRole.id });

    // Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Computer Science',
        slug: 'computer-science',
        description: 'CS Foundations',
        isActive: true,
      })
      .returning();
    category = cat;

    // Course 1 (Published)
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Algorithms & Data Structures',
        slug: 'algorithms-data-structures',
        shortDescription: 'Core CS concepts',
        description: 'Comprehensive study of algorithms',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '29.99',
        currency: 'USD',
        level: 'INTERMEDIATE',
        language: 'English',
        durationMinutes: 600,
        categoryId: category.id,
        instructorId,
      })
      .returning();
    course1 = c1;

    // Course 2 (Published)
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Operating Systems',
        slug: 'operating-systems',
        shortDescription: 'Kernel design',
        description: 'Processes, memory, and file systems',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '39.99',
        currency: 'USD',
        level: 'ADVANCED',
        language: 'English',
        durationMinutes: 800,
        categoryId: category.id,
        instructorId,
      })
      .returning();
    course2 = c2;

    // Archived Course
    const [cArchived] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Legacy Computing Systems',
        slug: 'legacy-computing-systems',
        shortDescription: 'Historical computing',
        description: 'Mainframes and punchcards',
        status: 'ARCHIVED',
        visibility: 'PUBLIC',
        price: '19.99',
        currency: 'USD',
        level: 'BEGINNER',
        language: 'English',
        durationMinutes: 300,
        categoryId: category.id,
        instructorId,
      })
      .returning();
    archivedCourse = cArchived;

    // Modules
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
        title: 'Module 1: OS Basics',
        position: 1,
      })
      .returning();
    module2 = m2;

    const [mArchived] = await testDb
      .insert(schema.modules)
      .values({
        courseId: archivedCourse.id,
        title: 'Module 1: Mainframes',
        position: 1,
      })
      .returning();

    // Lessons in Course 1
    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Big-O Notation',
        position: 1,
        lessonType: 'VIDEO',
        durationSeconds: 300,
        isPreview: false,
      })
      .returning();
    lesson1 = l1;

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Binary Trees',
        position: 2,
        lessonType: 'TEXT',
        durationSeconds: 200,
        isPreview: false,
      })
      .returning();
    lesson2 = l2;

    // Enrollments
    const [enr1] = await testDb
      .insert(schema.enrollments)
      .values({
        courseId: course1.id,
        studentId: student1Id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment1Student1 = enr1;

    const [enr2] = await testDb
      .insert(schema.enrollments)
      .values({
        courseId: course1.id,
        studentId: student2Id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment1Student2 = enr2;

    // Student 2 also enrolled in Course 2
    await testDb
      .insert(schema.enrollments)
      .values({
        courseId: course2.id,
        studentId: student2Id,
        status: 'ACTIVE',
      });

    // Student 3 has CANCELLED enrollment in Course 1
    const [enrCancelled] = await testDb
      .insert(schema.enrollments)
      .values({
        courseId: course1.id,
        studentId: student3Id,
        status: 'CANCELLED',
      })
      .returning();
    enrollmentCancelled = enrCancelled;

    // Student 1 has ACTIVE enrollment in Archived Course (pre-archival learner)
    const [enrArch] = await testDb
      .insert(schema.enrollments)
      .values({
        courseId: archivedCourse.id,
        studentId: student1Id,
        status: 'ACTIVE',
      })
      .returning();
    enrollmentArchived = enrArch;

    // Quiz 1: Published, 3 questions (40 total points, pass threshold 70% => need >= 28 pts)
    const [q1] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Algorithms Mastery Quiz',
        description: 'Test your understanding of Big-O and tree structures',
        position: 1,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        maxAttempts: 2,
        timeLimitMinutes: null,
        status: 'PUBLISHED',
      })
      .returning();
    quiz1 = q1;

    // Question 1: Single Choice (10 pts)
    const [q1s] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz1.id,
        questionText: 'What is the average time complexity of searching a balanced BST?',
        questionType: 'SINGLE_CHOICE',
        position: 1,
        points: 10,
        explanation: 'Balanced BST search takes O(log n) time on average and worst-case.',
      })
      .returning();
    q1Single = q1s;

    const [q1so1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: q1Single.id,
        optionText: 'O(log n)',
        position: 1,
        isCorrect: true,
      })
      .returning();
    q1SingleOpt1 = q1so1;

    const [q1so2] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: q1Single.id,
        optionText: 'O(n^2)',
        position: 2,
        isCorrect: false,
      })
      .returning();
    q1SingleOpt2 = q1so2;

    // Question 2: Multiple Choice (20 pts)
    const [q1m] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz1.id,
        questionText: 'Which of the following sorting algorithms have O(n log n) average time complexity?',
        questionType: 'MULTIPLE_CHOICE',
        position: 2,
        points: 20,
        explanation: 'Merge sort and Heapsort both run in O(n log n) average time.',
      })
      .returning();
    q1Multiple = q1m;

    const [q1mo1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: q1Multiple.id,
        optionText: 'Merge Sort',
        position: 1,
        isCorrect: true,
      })
      .returning();
    q1MultiOpt1 = q1mo1;

    const [q1mo2] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: q1Multiple.id,
        optionText: 'Heapsort',
        position: 2,
        isCorrect: true,
      })
      .returning();
    q1MultiOpt2 = q1mo2;

    const [q1mo3] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: q1Multiple.id,
        optionText: 'Bubble Sort',
        position: 3,
        isCorrect: false,
      })
      .returning();
    q1MultiOpt3 = q1mo3;

    // Question 3: True / False (10 pts)
    const [q1tf] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz1.id,
        questionText: 'A hash table provides O(1) expected lookup time.',
        questionType: 'TRUE_FALSE',
        position: 3,
        points: 10,
        explanation: 'Under simple uniform hashing, hash tables provide O(1) expected lookup.',
      })
      .returning();
    q1TrueFalse = q1tf;

    const [q1tfo1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: q1TrueFalse.id,
        optionText: 'True',
        position: 1,
        isCorrect: true,
      })
      .returning();
    q1TFOpt1 = q1tfo1;

    const [q1tfo2] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: q1TrueFalse.id,
        optionText: 'False',
        position: 2,
        isCorrect: false,
      })
      .returning();
    q1TFOpt2 = q1tfo2;

    // Quiz Draft (Unpublished)
    const [qDraft] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Draft Quiz in Preparation',
        position: 2,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 80,
        status: 'DRAFT',
      })
      .returning();
    quizDraft = qDraft;

    // Quiz Timed (1 min limit)
    const [qTime] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Speed Sorting Challenge',
        position: 3,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 50,
        timeLimitMinutes: 1,
        status: 'PUBLISHED',
      })
      .returning();
    quizTimed = qTime;

    const [qtq] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quizTimed.id,
        questionText: 'Quick question: Is QuickSort in-place?',
        questionType: 'TRUE_FALSE',
        position: 1,
        points: 10,
        explanation: 'Standard QuickSort is an in-place sort requiring O(log n) auxiliary stack space.',
      })
      .returning();
    qTimed = qtq;

    const [qto1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: qTimed.id,
        optionText: 'True',
        position: 1,
        isCorrect: true,
      })
      .returning();
    qTimedOpt1 = qto1;

    const [qto2] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: qTimed.id,
        optionText: 'False',
        position: 2,
        isCorrect: false,
      })
      .returning();
    qTimedOpt2 = qto2;

    // Quiz Unlimited (maxAttempts = null)
    const [qUnlimRec] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Practice Playground Quiz',
        position: 4,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 60,
        maxAttempts: null,
        status: 'PUBLISHED',
      })
      .returning();
    quizUnlimited = qUnlimRec;

    const [quq] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: quizUnlimited.id,
        questionText: 'Practice: 2 + 2 = ?',
        questionType: 'SINGLE_CHOICE',
        position: 1,
        points: 5,
        explanation: 'Basic math',
      })
      .returning();
    qUnlim = quq;

    const [quo1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: qUnlim.id,
        optionText: '4',
        position: 1,
        isCorrect: true,
      })
      .returning();
    qUnlimOpt1 = quo1;

    const [quo2] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: qUnlim.id,
        optionText: '5',
        position: 2,
        isCorrect: false,
      })
      .returning();
    qUnlimOpt2 = quo2;

    // Quiz in Course 2
    const [qc2] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module2.id,
        title: 'OS Scheduling Quiz',
        position: 1,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        status: 'PUBLISHED',
      })
      .returning();
    quizCourse2 = qc2;

    // Quiz in Archived Course
    await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: mArchived.id,
        title: 'Punchcard Basics',
        position: 1,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        status: 'PUBLISHED',
      });

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
    const st1Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ada@techsprout.edu', password: 'Pass123456!' });
    student1Cookies = st1Login.headers['set-cookie'] as unknown as string[];

    const st2Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'grace@techsprout.edu', password: 'Pass123456!' });
    student2Cookies = st2Login.headers['set-cookie'] as unknown as string[];

    const st3Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'babbage@techsprout.edu', password: 'Pass123456!' });
    student3Cookies = st3Login.headers['set-cookie'] as unknown as string[];

    const instLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'knuth@techsprout.edu', password: 'Pass123456!' });
    instructorCookies = instLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // =========================================================================
  // 1. Authentication, Enrollment Eligibility & Access Control (Tests 1-7)
  // =========================================================================
  describe('1. Authentication, Enrollment Eligibility & Access Control', () => {
    it('1.1 should block unauthenticated access to student quiz endpoint with 401', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}`);
      expect(res.status).toBe(401);
    });

    it('1.2 should block unenrolled student with 403', async () => {
      // Student 1 is not enrolled in Course 2 (which contains quizCourse2)
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quizCourse2.id}`)
        .set('Cookie', student1Cookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ENROLLMENT_REQUIRED');
    });

    it('1.3 should block cancelled enrollment with 403', async () => {
      // Student 3 has CANCELLED enrollment in Course 1
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}`)
        .set('Cookie', student3Cookies);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ENROLLMENT_CANCELLED');
    });

    it('1.4 should allow actively enrolled student to view published quiz', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}`)
        .set('Cookie', student1Cookies);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(quiz1.id);
      expect(res.body.data.title).toBe(quiz1.title);
      expect(res.body.data.questions).toHaveLength(3);
    });

    it('1.5 should allow student with COMPLETED enrollment status to access quiz', async () => {
      // Temporarily mark Student 2 enrollment as COMPLETED
      await testDb
        .update(schema.enrollments)
        .set({ status: 'COMPLETED' })
        .where(eq(schema.enrollments.id, enrollment1Student2.id));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}`)
        .set('Cookie', student2Cookies);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Revert back to ACTIVE
      await testDb
        .update(schema.enrollments)
        .set({ status: 'ACTIVE' })
        .where(eq(schema.enrollments.id, enrollment1Student2.id));
    });

    it('1.6 should allow existing learner in an archived course to view quiz', async () => {
      const [archQuiz] = await testDb
        .select()
        .from(schema.quizzes)
        .where(eq(schema.quizzes.title, 'Punchcard Basics'));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${archQuiz.id}`)
        .set('Cookie', student1Cookies);
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Punchcard Basics');
    });

    it('1.7 should block access to unpublished/draft quiz with 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quizDraft.id}`)
        .set('Cookie', student1Cookies);
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('QUIZ_NOT_FOUND');
    });
  });

  // =========================================================================
  // 2. Anti-Cheat & Answer-Key Security (Tests 8-10)
  // =========================================================================
  describe('2. Anti-Cheat & Answer-Key Security', () => {
    function recursivelyAssertKeyAbsence(obj: any, forbiddenKeys: string[], path = '') {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => recursivelyAssertKeyAbsence(item, forbiddenKeys, `${path}[${index}]`));
        return;
      }
      for (const key of Object.keys(obj)) {
        for (const forbidden of forbiddenKeys) {
          expect(key.toLowerCase(), `Found forbidden key "${key}" at path ${path}.${key}`).not.toBe(forbidden.toLowerCase());
        }
        recursivelyAssertKeyAbsence(obj[key], forbiddenKeys, `${path}.${key}`);
      }
    }

    it('2.1 should recursively strip isCorrect from GET /learn/quizzes/:quizId payload', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}`)
        .set('Cookie', student1Cookies);
      expect(res.status).toBe(200);
      recursivelyAssertKeyAbsence(res.body.data, ['isCorrect', 'is_correct']);
    });

    it('2.2 should recursively strip explanation from GET /learn/quizzes/:quizId payload', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}`)
        .set('Cookie', student1Cookies);
      expect(res.status).toBe(200);
      recursivelyAssertKeyAbsence(res.body.data, ['explanation']);
    });

    it('2.3 should recursively strip isCorrect and explanation from start attempt payload', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      expect(res.status).toBe(201);
      recursivelyAssertKeyAbsence(res.body.data, ['isCorrect', 'is_correct', 'explanation']);
    });

    it('2.4 should recursively verify attempt detail and autosave never leak isCorrect, explanation, correctOptionIds, or pointsAwarded', async () => {
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = startRes.body.data.id;

      // Check GET /attempts/:attemptId
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}`)
        .set('Cookie', student1Cookies);
      expect(detailRes.status).toBe(200);
      recursivelyAssertKeyAbsence(detailRes.body.data, [
        'isCorrect',
        'is_correct',
        'explanation',
        'correctOptionIds',
        'pointsAwarded',
      ]);

      // Check PATCH /attempts/:attemptId/answers
      const saveRes = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] }],
        });
      expect(saveRes.status).toBe(200);
      recursivelyAssertKeyAbsence(saveRes.body.data, [
        'isCorrect',
        'is_correct',
        'explanation',
        'correctOptionIds',
        'pointsAwarded',
      ]);
    });
  });

  // =========================================================================
  // 3. Attempt Lifecycle: Start, Resume & Limits (Tests 11-16)
  // =========================================================================
  describe('3. Attempt Lifecycle: Start, Resume & Limits', () => {
    let activeAttemptId: string;

    it('3.1 should start attempt with attemptNumber = 1, startedAt and IN_PROGRESS status', async () => {
      // Clean up previous attempts on quizUnlimited for fresh assertions
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quizUnlimited.id));

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(201);
      expect(res.body.data.attemptNumber).toBe(1);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.startedAt).toBeDefined();
      expect(res.body.data.savedAnswers).toEqual([]);
      activeAttemptId = res.body.data.id;
    });

    it('3.2 should resume existing IN_PROGRESS attempt without creating duplicate', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(activeAttemptId);
      expect(res.body.data.attemptNumber).toBe(1);
    });

    it('3.3 should restore saved answers when resuming an in-progress attempt', async () => {
      // Autosave an answer on active attempt
      await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${activeAttemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: qUnlim.id, selectedOptionIds: [qUnlimOpt1.id] }],
        });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(activeAttemptId);
      expect(res.body.data.savedAnswers).toHaveLength(1);
      expect(res.body.data.savedAnswers[0].selectedOptionIds).toEqual([qUnlimOpt1.id]);
    });

    it('3.4 should increment attemptNumber after submitting previous attempt', async () => {
      // Submit attempt 1
      await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${activeAttemptId}/submit`)
        .set('Cookie', student1Cookies);

      // Start attempt 2
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(201);
      expect(res.body.data.attemptNumber).toBe(2);
      expect(res.body.data.id).not.toBe(activeAttemptId);
    });

    it('3.5 should allow unlimited attempts when maxAttempts is null', async () => {
      // Can start attempt 2, submit it, start attempt 3
      const [currentActive] = await testDb
        .select()
        .from(schema.quizAttempts)
        .where(
          and(
            eq(schema.quizAttempts.quizId, quizUnlimited.id),
            eq(schema.quizAttempts.studentId, student1Id),
            eq(schema.quizAttempts.status, 'IN_PROGRESS')
          )
        );

      await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${currentActive.id}/submit`)
        .set('Cookie', student1Cookies);

      const res3 = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);

      expect(res3.status).toBe(201);
      expect(res3.body.data.attemptNumber).toBe(3);
    });

    it('3.6 should enforce maxAttempts limit and return 422 MAX_ATTEMPTS_REACHED', async () => {
      // quiz1 has maxAttempts: 2
      // Clean attempts on quiz1 for Student 2
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      // Attempt 1
      const a1 = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student2Cookies);
      expect(a1.status).toBe(201);

      await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${a1.body.data.id}/submit`)
        .set('Cookie', student2Cookies);

      // Attempt 2
      const a2 = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student2Cookies);
      expect(a2.status).toBe(201);

      await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${a2.body.data.id}/submit`)
        .set('Cookie', student2Cookies);

      // Attempt 3 -> should be rejected
      const a3 = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student2Cookies);

      expect(a3.status).toBe(422);
      expect(a3.body.errorCode).toBe('MAX_ATTEMPTS_REACHED');
    });
  });

  // =========================================================================
  // 4. Autosave Answer Operations & Validation (Tests 17-23)
  // =========================================================================
  describe('4. Autosave Answer Operations & Validation', () => {
    let attemptId: string;

    beforeAll(async () => {
      // Clean attempts on quiz1 for Student 1
      await testDb.delete(schema.quizAttempts).where(
        and(
          eq(schema.quizAttempts.quizId, quiz1.id),
          eq(schema.quizAttempts.studentId, student1Id)
        )
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      attemptId = res.body.data.id;
    });

    it('4.1 should successfully autosave single-choice answer selection', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Single.id,
              selectedOptionIds: [q1SingleOpt1.id],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lastSavedAt).toBeDefined();

      const [ans] = await testDb
        .select()
        .from(schema.quizAttemptAnswers)
        .where(
          and(
            eq(schema.quizAttemptAnswers.attemptId, attemptId),
            eq(schema.quizAttemptAnswers.questionId, q1Single.id)
          )
        );
      expect(ans.selectedOptionIds).toEqual([q1SingleOpt1.id]);
    });

    it('4.2 should successfully autosave multiple-choice answer selections', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Multiple.id,
              selectedOptionIds: [q1MultiOpt1.id, q1MultiOpt2.id],
            },
          ],
        });

      expect(res.status).toBe(200);

      const [ans] = await testDb
        .select()
        .from(schema.quizAttemptAnswers)
        .where(
          and(
            eq(schema.quizAttemptAnswers.attemptId, attemptId),
            eq(schema.quizAttemptAnswers.questionId, q1Multiple.id)
          )
        );
      expect(ans.selectedOptionIds).toEqual([q1MultiOpt1.id, q1MultiOpt2.id]);
    });

    it('4.3 should successfully autosave true/false answer selection', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1TrueFalse.id,
              selectedOptionIds: [q1TFOpt1.id],
            },
          ],
        });

      expect(res.status).toBe(200);

      const [ans] = await testDb
        .select()
        .from(schema.quizAttemptAnswers)
        .where(
          and(
            eq(schema.quizAttemptAnswers.attemptId, attemptId),
            eq(schema.quizAttemptAnswers.questionId, q1TrueFalse.id)
          )
        );
      expect(ans.selectedOptionIds).toEqual([q1TFOpt1.id]);
    });

    it('4.4 should reject single-choice question with more than 1 option selected', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Single.id,
              selectedOptionIds: [q1SingleOpt1.id, q1SingleOpt2.id],
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('INVALID_ANSWER_SELECTION');
    });

    it('4.5 should reject answer with option IDs that do not belong to the question', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Single.id,
              selectedOptionIds: [q1MultiOpt1.id], // Belongs to q1Multiple, not q1Single
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('INVALID_ANSWER_SELECTION');
    });

    it('4.6 should reject question ID that does not belong to the quiz', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: qUnlim.id, // Belongs to quizUnlimited
              selectedOptionIds: [qUnlimOpt1.id],
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.errorCode).toBe('INVALID_ANSWER_SELECTION');
    });

    it('4.7 should update lastSavedAt timestamp on every autosave', async () => {
      const [before] = await testDb
        .select()
        .from(schema.quizAttempts)
        .where(eq(schema.quizAttempts.id, attemptId));

      // Wait 15ms so clock advances
      await new Promise((r) => setTimeout(r, 15));

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Single.id,
              selectedOptionIds: [q1SingleOpt1.id],
            },
          ],
        });

      expect(res.status).toBe(200);

      const [after] = await testDb
        .select()
        .from(schema.quizAttempts)
        .where(eq(schema.quizAttempts.id, attemptId));

      expect(new Date(after.lastSavedAt).getTime()).toBeGreaterThanOrEqual(new Date(before.lastSavedAt).getTime());
    });
  });

  // =========================================================================
  // 5. Authoritative Server-Side Grading & Scoring Logic (Tests 24-34)
  // =========================================================================
  describe('5. Authoritative Server-Side Grading & Scoring Logic', () => {
    it('5.1 should award full points for correct single-choice answer', async () => {
      // Create fresh attempt on quiz1
      await testDb.delete(schema.quizAttempts).where(
        and(
          eq(schema.quizAttempts.quizId, quiz1.id),
          eq(schema.quizAttempts.studentId, student1Id)
        )
      );

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Submit only single-choice correct, others unanswered
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(10); // 10 out of 40
      expect(res.body.data.totalPoints).toBe(40);
      expect(res.body.data.percentage).toBe(25); // round((10/40)*100) = 25
      expect(res.body.data.isPassed).toBe(false); // 25 < 70
    });

    it('5.2 should award 0 points for incorrect single-choice answer', async () => {
      // Attempt 2 on quiz1 for Student 1
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: q1Single.id, selectedOptionIds: [q1SingleOpt2.id] }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(0);
      expect(res.body.data.percentage).toBe(0);
      expect(res.body.data.isPassed).toBe(false);
    });

    it('5.3 should award full points for exact match on multiple-choice question', async () => {
      // Clean attempts on quizUnlimited
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Multiple choice correct has both opt1 and opt2
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Multiple.id,
              selectedOptionIds: [q1MultiOpt1.id, q1MultiOpt2.id],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(20);
    });

    it('5.4 should award 0 points (no partial credit) if multiple-choice is partially correct', async () => {
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Only selected 1 of the 2 correct options
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Multiple.id,
              selectedOptionIds: [q1MultiOpt1.id], // Missing q1MultiOpt2
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(0);
    });

    it('5.5 should award 0 points if multiple-choice includes an incorrect option', async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Selected both correct + 1 incorrect
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1Multiple.id,
              selectedOptionIds: [q1MultiOpt1.id, q1MultiOpt2.id, q1MultiOpt3.id],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(0);
    });

    it('5.6 should award full points for correct true/false question', async () => {
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            {
              questionId: q1TrueFalse.id,
              selectedOptionIds: [q1TFOpt1.id],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(10);
    });

    it('5.7 should award 0 points for completely unanswered questions', async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Submit with empty answers
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({ answers: [] });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(0);
      expect(res.body.data.totalPoints).toBe(40);
      expect(res.body.data.percentage).toBe(0);
      expect(res.body.data.isPassed).toBe(false);
    });

    it('5.8 should accurately compute total score and round percentage', async () => {
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Answer single choice (10 pts) + multiple choice (20 pts) = 30 pts out of 40 = 75%
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            { questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] },
            { questionId: q1Multiple.id, selectedOptionIds: [q1MultiOpt1.id, q1MultiOpt2.id] },
            { questionId: q1TrueFalse.id, selectedOptionIds: [q1TFOpt2.id] }, // Incorrect TF
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(30);
      expect(res.body.data.totalPoints).toBe(40);
      expect(res.body.data.percentage).toBe(75);
      expect(res.body.data.isPassed).toBe(true); // 75 >= 70
    });

    it('5.9 should fail student when percentage is strictly below passingScorePercentage', async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // 20 pts out of 40 = 50% (< 70%)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            { questionId: q1Multiple.id, selectedOptionIds: [q1MultiOpt1.id, q1MultiOpt2.id] },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(20);
      expect(res.body.data.percentage).toBe(50);
      expect(res.body.data.isPassed).toBe(false);
    });

    it('5.10 should pass student when percentage exactly meets passingScorePercentage', async () => {
      // Use quizTimed which has 1 question (10 pts) and passingScorePercentage = 100
      await testDb
        .update(schema.quizzes)
        .set({ passingScorePercentage: 100 })
        .where(eq(schema.quizzes.id, quizTimed.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizTimed.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizTimed.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: qTimed.id, selectedOptionIds: [qTimedOpt1.id] }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(10);
      expect(res.body.data.percentage).toBe(100);
      expect(res.body.data.isPassed).toBe(true);
    });

    it('5.11 should completely ignore client-supplied score, points, and isPassed', async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Malicious client payload trying to forge score
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          score: 1000,
          totalPoints: 1000,
          percentage: 100,
          isPassed: true,
          answers: [
            {
              questionId: q1Single.id,
              selectedOptionIds: [q1SingleOpt2.id], // Incorrect
              pointsAwarded: 999,
              isCorrect: true,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(0); // Server calculated 0
      expect(res.body.data.percentage).toBe(0);
      expect(res.body.data.isPassed).toBe(false);
    });
  });

  // =========================================================================
  // 6. Submission & Attempt Immutability (Tests 35-37)
  // =========================================================================
  describe('6. Submission & Attempt Immutability', () => {
    let submittedAttemptId: string;

    beforeAll(async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      submittedAttemptId = a.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${submittedAttemptId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] }],
        });
    });

    it('6.1 should persist submitted status and submittedAt timestamp', async () => {
      const [att] = await testDb
        .select()
        .from(schema.quizAttempts)
        .where(eq(schema.quizAttempts.id, submittedAttemptId));

      expect(att.status).toBe('SUBMITTED');
      expect(att.submittedAt).toBeDefined();
    });

    it('6.2 should reject duplicate submission with 409 ATTEMPT_ALREADY_SUBMITTED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${submittedAttemptId}/submit`)
        .set('Cookie', student1Cookies)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('ATTEMPT_ALREADY_SUBMITTED');
    });

    it('6.3 should reject answer autosave on already-submitted attempt with 409', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${submittedAttemptId}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] }],
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('ATTEMPT_ALREADY_SUBMITTED');
    });
  });

  // =========================================================================
  // 7. Post-Submission Review Security & Exposure (Tests 38-41)
  // =========================================================================
  describe('7. Post-Submission Review Security & Exposure', () => {
    let inProgressAttemptId: string;
    let submittedAttemptId: string;

    beforeAll(async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quizUnlimited.id));

      // Attempt 1: Started and submitted
      const a1 = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);
      submittedAttemptId = a1.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${submittedAttemptId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: qUnlim.id, selectedOptionIds: [qUnlimOpt1.id] }],
        });

      // Attempt 2: In progress
      const a2 = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);
      inProgressAttemptId = a2.body.data.id;
    });

    it('7.1 should block review of IN_PROGRESS attempt with 403 ATTEMPT_IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${inProgressAttemptId}/review`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ATTEMPT_IN_PROGRESS');
    });

    it('7.2 should allow review of SUBMITTED attempt and expose correct option IDs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${submittedAttemptId}/review`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.questions).toHaveLength(1);

      const q = res.body.data.questions[0];
      expect(q.correctOptionIds).toEqual([qUnlimOpt1.id]);
      expect(q.selectedOptionIds).toEqual([qUnlimOpt1.id]);
      expect(q.isCorrect).toBe(true);
    });

    it('7.3 should include question explanation in post-submission review', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${submittedAttemptId}/review`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.questions[0].explanation).toBe('Basic math');
    });

    it('7.4 should include points awarded and total points in review', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${submittedAttemptId}/review`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.questions[0].points).toBe(5);
      expect(res.body.data.questions[0].pointsAwarded).toBe(5);
      expect(res.body.data.score).toBe(5);
      expect(res.body.data.totalPoints).toBe(5);
    });
  });

  // =========================================================================
  // 8. Timed Quizzes & Server-Authoritative Clock (Tests 42-45)
  // =========================================================================
  describe('8. Timed Quizzes & Server-Authoritative Clock', () => {
    it('8.1 should return null expiresAt for untimed quiz attempt', async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quizUnlimited.id));

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(201);
      expect(res.body.data.expiresAt).toBeNull();
      expect(res.body.data.timeLimitMinutes).toBeNull();
    });

    it('8.2 should return computed ISO expiresAt for timed quiz attempt', async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quizTimed.id));

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizTimed.id}/attempts`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(201);
      expect(res.body.data.expiresAt).toBeDefined();
      expect(res.body.data.timeLimitMinutes).toBe(1);

      const started = new Date(res.body.data.startedAt).getTime();
      const expires = new Date(res.body.data.expiresAt).getTime();
      expect(expires - started).toBe(60 * 1000); // exactly 1 minute
    });

    it('8.3 should reject answer autosave after time limit has expired (+ grace window)', async () => {
      // Find active attempt on quizTimed and artificially age startedAt by 2 minutes
      const [att] = await testDb
        .select()
        .from(schema.quizAttempts)
        .where(
          and(
            eq(schema.quizAttempts.quizId, quizTimed.id),
            eq(schema.quizAttempts.studentId, student1Id),
            eq(schema.quizAttempts.status, 'IN_PROGRESS')
          )
        );

      const past = new Date(Date.now() - 120000); // 2 minutes ago
      await testDb
        .update(schema.quizAttempts)
        .set({ startedAt: past })
        .where(eq(schema.quizAttempts.id, att.id));

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quizTimed.id}/attempts/${att.id}/answers`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: qTimed.id, selectedOptionIds: [qTimedOpt1.id] }],
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_TIME_EXPIRED');
    });

    it('8.4 should reject submission after time limit has expired (+ grace window)', async () => {
      const [att] = await testDb
        .select()
        .from(schema.quizAttempts)
        .where(
          and(
            eq(schema.quizAttempts.quizId, quizTimed.id),
            eq(schema.quizAttempts.studentId, student1Id),
            eq(schema.quizAttempts.status, 'IN_PROGRESS')
          )
        );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizTimed.id}/attempts/${att.id}/submit`)
        .set('Cookie', student1Cookies)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('QUIZ_TIME_EXPIRED');
    });
  });

  // =========================================================================
  // 9. Course Progress & Course Completion Integration (Tests 46-51)
  // =========================================================================
  describe('9. Course Progress & Course Completion Integration', () => {
    beforeAll(async () => {
      // Reset course1 learning state for student 1
      await testDb.delete(schema.lessonProgress).where(eq(schema.lessonProgress.enrollmentId, enrollment1Student1.id));
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.enrollmentId, enrollment1Student1.id));

      await testDb
        .update(schema.enrollments)
        .set({ status: 'ACTIVE', completedAt: null })
        .where(eq(schema.enrollments.id, enrollment1Student1.id));

      // Make sure course 1 has exactly 2 lessons and 1 published quiz (quiz1) for clean arithmetic
      // Archive other test quizzes in course1
      await testDb
        .update(schema.quizzes)
        .set({ status: 'ARCHIVED' })
        .where(
          and(
            eq(schema.quizzes.moduleId, module1.id),
            eq(schema.quizzes.status, 'PUBLISHED'),
            ne(schema.quizzes.id, quiz1.id)
          )
        );
    });

    it('9.1 should calculate course progress: (completedLessons + passedQuizzes) / (totalLessons + publishedQuizzes)', async () => {
      // Total items = 2 lessons + 1 published quiz = 3 items.
      // Complete lesson 1 -> completed items = 1/3 => 33%
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: enrollment1Student1.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date(),
        watchPositionSeconds: 300,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${course1.id}/curriculum`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.progressPercentage).toBe(33); // 1 / 3 * 100 = 33%
    });

    it('9.2 should NOT increase course progress if quiz attempt is submitted but FAILED', async () => {
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Submit failing attempt (0 pts)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({ answers: [] });

      expect(res.status).toBe(200);
      expect(res.body.data.isPassed).toBe(false);
      // Progress remains 33% (1 lesson complete, 0 quizzes passed out of 3 total items)
      expect(res.body.data.courseProgressPercentage).toBe(33);
      expect(res.body.data.isCourseCompleted).toBe(false);
    });

    it('9.3 should increase course progress when a published quiz is PASSED', async () => {
      // Clean attempts on quiz1
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.enrollmentId, enrollment1Student1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Submit passing attempt (40/40 pts = 100%)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            { questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] },
            { questionId: q1Multiple.id, selectedOptionIds: [q1MultiOpt1.id, q1MultiOpt2.id] },
            { questionId: q1TrueFalse.id, selectedOptionIds: [q1TFOpt1.id] },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isPassed).toBe(true);
      // Completed items: 1 lesson + 1 quiz = 2 / 3 => 67%
      expect(res.body.data.courseProgressPercentage).toBe(67);
      expect(res.body.data.isCourseCompleted).toBe(false);
    });

    it('9.4 should block course completion if all lessons are complete but required published quiz is NOT passed', async () => {
      // Complete lesson 2 as well, but remove passed quiz attempt
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: enrollment1Student1.id,
        lessonId: lesson2.id,
        status: 'COMPLETED',
        completedAt: new Date(),
        watchPositionSeconds: 200,
      });

      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.enrollmentId, enrollment1Student1.id));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${course1.id}/curriculum`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      // 2 lessons complete + 0 quizzes passed / 3 items = 67%
      expect(res.body.data.progressPercentage).toBe(67);

      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment1Student1.id));
      expect(enr.status).toBe('ACTIVE');
      expect(enr.completedAt).toBeNull();
    });

    it('9.5 should transition enrollment to COMPLETED when all lessons AND published quizzes are complete', async () => {
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      const attId = a.body.data.id;

      // Submit passing attempt (40/40 pts)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${attId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [
            { questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] },
            { questionId: q1Multiple.id, selectedOptionIds: [q1MultiOpt1.id, q1MultiOpt2.id] },
            { questionId: q1TrueFalse.id, selectedOptionIds: [q1TFOpt1.id] },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.courseProgressPercentage).toBe(100);
      expect(res.body.data.isCourseCompleted).toBe(true);

      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment1Student1.id));
      expect(enr.status).toBe('COMPLETED');
      expect(enr.completedAt).toBeDefined();
    });

    it('9.6 should revert COMPLETED enrollment to ACTIVE when a new quiz is published (curriculum mutation invariant)', async () => {
      // Currently enrollment is COMPLETED
      const [beforeEnr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment1Student1.id));
      expect(beforeEnr.status).toBe('COMPLETED');

      // Instructor creates a new draft quiz in module 1 with valid questions and publishes it
      const [newQuiz] = await testDb
        .insert(schema.quizzes)
        .values({
          moduleId: module1.id,
          title: 'Advanced Graph Algorithms',
          position: 10,
          quizType: 'KNOWLEDGE_CHECK',
          passingScorePercentage: 70,
          status: 'DRAFT',
        })
        .returning();

      const [nq] = await testDb
        .insert(schema.quizQuestions)
        .values({
          quizId: newQuiz.id,
          questionText: 'Is Dijkstra algorithm greedy?',
          questionType: 'TRUE_FALSE',
          position: 1,
          points: 10,
        })
        .returning();

      await testDb.insert(schema.quizQuestionOptions).values([
        { questionId: nq.id, optionText: 'True', position: 1, isCorrect: true },
        { questionId: nq.id, optionText: 'False', position: 2, isCorrect: false },
      ]);

      // Publish new quiz via admin/instructor endpoint
      const pubRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${newQuiz.id}/publish`)
        .set('Cookie', instructorCookies);

      expect(pubRes.status).toBe(200);

      // Verify enrollment reverted to ACTIVE with completedAt = null
      const [afterEnr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment1Student1.id));

      expect(afterEnr.status).toBe('ACTIVE');
      expect(afterEnr.completedAt).toBeNull();
    });

    it('9.7 should restore COMPLETED enrollment when newly added quiz is archived and remaining items are 100%', async () => {
      const [newQuiz] = await testDb
        .select()
        .from(schema.quizzes)
        .where(eq(schema.quizzes.title, 'Advanced Graph Algorithms'));

      // Archive newly added quiz
      const archRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/quizzes/${newQuiz.id}/archive`)
        .set('Cookie', instructorCookies);

      expect(archRes.status).toBe(200);

      // With that quiz archived, student 1 again has 2/2 lessons and 1/1 published quiz (100%)
      const [afterEnr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment1Student1.id));

      expect(afterEnr.status).toBe('COMPLETED');
      expect(afterEnr.completedAt).toBeDefined();
    });
  });

  // =========================================================================
  // 10. Security, IDOR Protection & Boundary Integrity (Tests 52-56)
  // =========================================================================
  describe('10. Security, IDOR Protection & Boundary Integrity', () => {
    let student1AttemptId: string;

    beforeAll(async () => {
      await testDb.delete(schema.quizAttempts).where(eq(schema.quizAttempts.quizId, quiz1.id));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student1Cookies);
      student1AttemptId = a.body.data.id;
    });

    it('10.1 should prevent Student 2 from viewing Student 1 attempt details (IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${student1AttemptId}`)
        .set('Cookie', student2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('10.2 should prevent Student 2 from modifying Student 1 answers (IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${student1AttemptId}/answers`)
        .set('Cookie', student2Cookies)
        .send({
          answers: [{ questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] }],
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('10.3 should prevent Student 2 from submitting Student 1 attempt (IDOR)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${student1AttemptId}/submit`)
        .set('Cookie', student2Cookies)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('10.4 should prevent Student 2 from reviewing Student 1 attempt after submission (IDOR)', async () => {
      // Student 1 submits attempt
      await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${student1AttemptId}/submit`)
        .set('Cookie', student1Cookies)
        .send({
          answers: [{ questionId: q1Single.id, selectedOptionIds: [q1SingleOpt1.id] }],
        });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quiz1.id}/attempts/${student1AttemptId}/review`)
        .set('Cookie', student2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('10.5 should ignore client-supplied studentId and always bind req.user.id', async () => {
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quiz1.id}/attempts`)
        .set('Cookie', student2Cookies)
        .send({ studentId: student1Id }); // Malicious spoof

      expect(a.status).toBe(201);
      const [rec] = await testDb
        .select()
        .from(schema.quizAttempts)
        .where(eq(schema.quizAttempts.id, a.body.data.id));

      expect(rec.studentId).toBe(student2Id); // Strictly Grace Hopper
    });

    it('10.6 should reject access when attemptId does not match quizId in route params', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/quizzes/${quizCourse2.id}/attempts/${student1AttemptId}`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_ATTEMPT');
    });
  });

  // =========================================================================
  // 11. Assessment Audit Logging (Tests 57-60)
  // =========================================================================
  describe('11. Assessment Audit Logging', () => {
    let auditAttemptId: string;

    it('11.1 should record QUIZ_ATTEMPT_STARTED audit event upon starting attempt', async () => {
      // Clean attempts on quizUnlimited for Student 2
      await testDb
        .update(schema.quizzes)
        .set({ status: 'PUBLISHED' })
        .where(eq(schema.quizzes.id, quizUnlimited.id));

      await testDb.delete(schema.quizAttempts).where(
        and(
          eq(schema.quizAttempts.quizId, quizUnlimited.id),
          eq(schema.quizAttempts.studentId, student2Id)
        )
      );

      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student2Cookies);

      expect(a.status).toBe(201);
      auditAttemptId = a.body.data.id;

      const [log] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'QUIZ_ATTEMPT_STARTED'),
            eq(schema.auditLogs.actorId, student2Id)
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);

      expect(log).toBeDefined();
      expect(log.targetType).toBe('QUIZ');
      expect(log.targetId).toBe(quizUnlimited.id);
      const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      expect(meta.attemptId).toBe(auditAttemptId);
    });

    it('11.2 should record QUIZ_ATTEMPT_SUBMITTED and QUIZ_PASSED audit events on passing submission', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${auditAttemptId}/submit`)
        .set('Cookie', student2Cookies)
        .send({
          answers: [{ questionId: qUnlim.id, selectedOptionIds: [qUnlimOpt1.id] }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isPassed).toBe(true);

      const [submittedLog] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'QUIZ_ATTEMPT_SUBMITTED'),
            eq(schema.auditLogs.actorId, student2Id)
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);

      expect(submittedLog).toBeDefined();
      const subMeta = typeof submittedLog.metadata === 'string' ? JSON.parse(submittedLog.metadata) : submittedLog.metadata;
      expect(subMeta.attemptId).toBe(auditAttemptId);
      expect(subMeta.isPassed).toBe(true);

      const [passedLog] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'QUIZ_PASSED'),
            eq(schema.auditLogs.actorId, student2Id)
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);

      expect(passedLog).toBeDefined();
      const passMeta = typeof passedLog.metadata === 'string' ? JSON.parse(passedLog.metadata) : passedLog.metadata;
      expect(passMeta.attemptId).toBe(auditAttemptId);
    });

    it('11.3 should record QUIZ_FAILED audit event on failing submission', async () => {
      // Start attempt 2
      const a = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts`)
        .set('Cookie', student2Cookies);
      const attId2 = a.body.data.id;

      // Submit incorrect answer
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learn/quizzes/${quizUnlimited.id}/attempts/${attId2}/submit`)
        .set('Cookie', student2Cookies)
        .send({
          answers: [{ questionId: qUnlim.id, selectedOptionIds: [qUnlimOpt2.id] }],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isPassed).toBe(false);

      const [failedLog] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'QUIZ_FAILED'),
            eq(schema.auditLogs.actorId, student2Id)
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);

      expect(failedLog).toBeDefined();
      const failMeta = typeof failedLog.metadata === 'string' ? JSON.parse(failedLog.metadata) : failedLog.metadata;
      expect(failMeta.attemptId).toBe(attId2);
      expect(failMeta.score).toBe(0);
    });
  });
});
