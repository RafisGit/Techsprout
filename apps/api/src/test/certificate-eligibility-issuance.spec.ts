import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '../config/env.config';
import { CertificateService, CERTIFICATE_ALPHABET } from '../modules/certificates/certificates.service';
import cookieParser from 'cookie-parser';

describe('Phase 11.1 / WP-P11-01 — Certificate Eligibility & Automated Issuance Engine', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let certificateService: CertificateService;

  let studentUser: any;
  let studentBCredsUser: any;
  let instructorUser: any;
  let adminUser: any;

  let studentCookies: string[];
  let studentBCookies: string[];

  let category: any;
  let courseComplete: any;
  let courseIncomplete: any;
  let courseWithQuiz: any;
  let courseNoQuiz: any;

  let module1: any;
  let lesson1: any;
  let lesson2: any;

  let quizModule: any;
  let lessonQuizCourse: any;
  let publishedQuiz: any;
  let draftQuiz: any;

  let enrollmentComplete: any;
  let enrollmentIncomplete: any;
  let enrollmentWithQuiz: any;
  let enrollmentNoQuiz: any;
  let existingCert: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // Retrieve Roles
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    // Create primary Student
    const studentPasswordHash = await CryptoUtil.hashPassword('StudentPass123!');
    const [st1] = await testDb
      .insert(schema.users)
      .values({
        name: 'Alice Student',
        username: 'alicestudent',
        email: 'alice.student@techsprout.edu',
        phone: '01799887761',
        passwordHash: studentPasswordHash,
        isActive: true,
        isVerified: true,
      })
      .returning();
    studentUser = st1;

    await testDb.insert(schema.userRoles).values({
      userId: studentUser.id,
      roleId: studentRole.id,
    });

    // Create secondary Student B
    const studentBPasswordHash = await CryptoUtil.hashPassword('StudentBPass123!');
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Bob Learner',
        username: 'boblearner',
        email: 'bob.learner@techsprout.edu',
        phone: '01799887762',
        passwordHash: studentBPasswordHash,
        isActive: true,
        isVerified: true,
      })
      .returning();
    studentBCredsUser = st2;

    await testDb.insert(schema.userRoles).values({
      userId: studentBCredsUser.id,
      roleId: studentRole.id,
    });

    // Instructor and Admin
    const [inst] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'))
      .limit(1);
    instructorUser = inst;

    const [adm] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'))
      .limit(1);
    adminUser = adm;

    // Create Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Software Engineering',
        slug: 'software-engineering',
        isActive: true,
      })
      .returning();
    category = cat;

    // 1. Course with lessons only - Fully completed
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Mastering TypeScript Architecture',
        slug: 'mastering-typescript-architecture',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
      })
      .returning();
    courseComplete = c1;

    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: courseComplete.id,
        title: 'Module 1: Foundations',
        position: 1,
      })
      .returning();
    module1 = m1;

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'TypeScript Compiler Architecture',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 300,
        content: '# TS Architecture',
        isPreview: false,
      })
      .returning();
    lesson1 = l1;

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Advanced Type Guards',
        lessonType: 'TEXT',
        position: 2,
        durationSeconds: 400,
        content: '# Type Guards',
        isPreview: false,
      })
      .returning();
    lesson2 = l2;

    // 2. Course with lessons - Incomplete
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Reactive Microservices with NestJS',
        slug: 'reactive-microservices-nestjs',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
      })
      .returning();
    courseIncomplete = c2;

    const [m2] = await testDb
      .insert(schema.modules)
      .values({
        courseId: courseIncomplete.id,
        title: 'Module 1: Event Streams',
        position: 1,
      })
      .returning();

    const [l3] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: m2.id,
        title: 'Kafka & NestJS Microservices',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 500,
        content: '# Kafka Streams',
        isPreview: false,
      })
      .returning();

    // 3. Course with lessons + Published Quiz & Draft Quiz
    const [c3] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Cloud Native Systems',
        slug: 'cloud-native-systems',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
      })
      .returning();
    courseWithQuiz = c3;

    const [m3] = await testDb
      .insert(schema.modules)
      .values({
        courseId: courseWithQuiz.id,
        title: 'Module 1: Kubernetes Core',
        position: 1,
      })
      .returning();
    quizModule = m3;

    const [l4] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: quizModule.id,
        title: 'Pods, Deployments, and Services',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 400,
        content: '# K8s Objects',
        isPreview: false,
      })
      .returning();
    lessonQuizCourse = l4;

    const [qPub] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: quizModule.id,
        title: 'Kubernetes Foundations Assessment',
        position: 2,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 75,
        status: 'PUBLISHED',
      })
      .returning();
    publishedQuiz = qPub;

    // Insert questions and options for published quiz
    const [qq1] = await testDb
      .insert(schema.quizQuestions)
      .values({
        quizId: publishedQuiz.id,
        questionText: 'What is a Pod in Kubernetes?',
        questionType: 'SINGLE_CHOICE',
        position: 1,
        points: 10,
      })
      .returning();

    const [opt1] = await testDb
      .insert(schema.quizQuestionOptions)
      .values({
        questionId: qq1.id,
        optionText: 'The smallest deployable unit of computing',
        position: 1,
        isCorrect: true,
      })
      .returning();

    // Draft quiz (should be ignored for completion)
    const [qDraft] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: quizModule.id,
        title: 'Optional Draft Quiz',
        position: 3,
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        status: 'DRAFT',
      })
      .returning();
    draftQuiz = qDraft;

    // 4. Enrollments Setup
    // Enrollment 1: Alice in Course Complete - All lessons completed
    const completedAt1 = new Date('2026-10-10T10:00:00.000Z');
    const [enr1] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentUser.id,
        studentId: studentUser.id,
        courseId: courseComplete.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollmentComplete = enr1;

    await testDb.insert(schema.lessonProgress).values([
      {
        enrollmentId: enrollmentComplete.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: completedAt1,
      },
      {
        enrollmentId: enrollmentComplete.id,
        lessonId: lesson2.id,
        status: 'COMPLETED',
        completedAt: completedAt1,
      },
    ]);

    // Enrollment 2: Alice in Course Incomplete - Lesson 1 completed, but only 1 of 2 or incomplete
    const [enr2] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentUser.id,
        studentId: studentUser.id,
        courseId: courseIncomplete.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollmentIncomplete = enr2;
    // (No lesson progress inserted -> 0% complete)

    // Enrollment 3: Alice in Course with Quiz
    const [enr3] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentUser.id,
        studentId: studentUser.id,
        courseId: courseWithQuiz.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollmentWithQuiz = enr3;

    // Complete lesson in quiz course
    await testDb.insert(schema.lessonProgress).values({
      enrollmentId: enrollmentWithQuiz.id,
      lessonId: lessonQuizCourse.id,
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    // Quiz not passed yet!

    // Create Nest testing module
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ db: testDb, pool: testPool })
      .overrideProvider(DRIZZLE_DB)
      .useValue(testDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    certificateService = app.get(CertificateService);

    // Login Alice
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'alice.student@techsprout.edu',
        password: 'StudentPass123!',
      });
    studentCookies = (loginRes.headers['set-cookie'] || []) as unknown as string[];

    // Login Bob
    const loginBRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'bob.learner@techsprout.edu',
        password: 'StudentBPass123!',
      });
    studentBCookies = (loginBRes.headers['set-cookie'] || []) as unknown as string[];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPool) await testPool.end();
  });

  // ==========================================
  // SECTION A: ELIGIBILITY TESTS (1 - 9)
  // ==========================================

  describe('Eligibility Verification (Conditions 1-9)', () => {
    it('1. Fully completed course returns status: ELIGIBLE', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/eligibility`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ELIGIBLE');
      expect(res.body.data.isEligible).toBe(true);
      expect(res.body.data.totalLessons).toBe(2);
      expect(res.body.data.completedLessons).toBe(2);
      expect(res.body.data.progressPercentage).toBe(100);
      expect(res.body.data.hasUnpassedQuizzes).toBe(false);
      expect(res.body.data.hasUnpassedFinalExam).toBe(false);
    });

    it('2. Incomplete course with zero completed lessons returns status: COURSE_INCOMPLETE', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseIncomplete.id}/certificate/eligibility`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COURSE_INCOMPLETE');
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.completedLessons).toBe(0);
      expect(res.body.data.progressPercentage).toBe(0);
    });

    it('3. Required lesson not completed returns status: COURSE_INCOMPLETE', async () => {
      // Alice is in courseIncomplete with 1 total lesson and 0 completed
      const eligibility = await certificateService.getCertificateEligibility(
        courseIncomplete.id,
        studentUser.id
      );

      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.status).toBe('COURSE_INCOMPLETE');
      expect(eligibility.completedLessons).toBeLessThan(eligibility.totalLessons);
    });

    it('4. Required assessment not passed returns status: ASSESSMENT_INCOMPLETE', async () => {
      // Course with quiz: Alice completed the 1 lesson, but did not pass published quiz
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseWithQuiz.id}/certificate/eligibility`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ASSESSMENT_INCOMPLETE');
      expect(res.body.data.isEligible).toBe(false);
      expect(res.body.data.completedLessons).toBe(1);
      expect(res.body.data.publishedQuizzes).toBe(1);
      expect(res.body.data.passedQuizzes).toBe(0);
      expect(res.body.data.hasUnpassedQuizzes).toBe(true);
    });

    it('5. Optional / Draft assessment is excluded from required quizzes count', async () => {
      // courseWithQuiz has 1 PUBLISHED quiz and 1 DRAFT quiz
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseWithQuiz.id}/certificate/eligibility`)
        .set('Cookie', studentCookies);

      expect(res.body.data.publishedQuizzes).toBe(1); // DRAFT excluded!
    });

    it('6. No valid enrollment returns status: ENROLLMENT_REQUIRED', async () => {
      // Bob is not enrolled in courseComplete
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/eligibility`)
        .set('Cookie', studentBCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ENROLLMENT_REQUIRED');
      expect(res.body.data.isEligible).toBe(false);
    });

    it('7. Access to course certificate belonging to another student is rejected with 404 ENROLLMENT_NOT_FOUND', async () => {
      // Bob requests Alice's completed course certificate
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate`)
        .set('Cookie', studentBCookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('ENROLLMENT_NOT_FOUND');
    });

    it('8. Existing learning-completion rules calculate deterministic score snapshot', async () => {
      // When zero quizzes exist, final score percentage is 100
      const score = await certificateService.calculateFinalScore(
        courseComplete.id,
        enrollmentComplete.id
      );
      expect(score).toBe(100);
    });

    it('9. Course completion with valid historical progress returns ALREADY_ISSUED after issuance', async () => {
      // First issue certificate for courseComplete
      const certRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate`)
        .set('Cookie', studentCookies);

      expect(certRes.status).toBe(200);
      existingCert = certRes.body.data;
      expect(existingCert.certificateNumber).toMatch(/^TSP-\d{4}-C[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);

      // Now check eligibility again -> must return ALREADY_ISSUED
      const eligRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/eligibility`)
        .set('Cookie', studentCookies);

      expect(eligRes.status).toBe(200);
      expect(eligRes.body.data.status).toBe('ALREADY_ISSUED');
      expect(eligRes.body.data.isEligible).toBe(true);
      expect(eligRes.body.data.certificateNumber).toBe(existingCert.certificateNumber);
    });
  });

  // ==========================================
  // SECTION B: ISSUANCE TESTS (10 - 19)
  // ==========================================

  describe('Issuance & Concurrency Protections (Conditions 10-19)', () => {
    it('10. Successful first issuance produces valid active certificate snapshot', async () => {
      expect(existingCert).toBeDefined();
      expect(existingCert.status).toBe('ACTIVE');
      expect(existingCert.studentName).toBe('Alice Student');
      expect(existingCert.courseTitle).toBe('Mastering TypeScript Architecture');
      expect(existingCert.instructorName).toBe('Dr. Sarah Mitchell');
      expect(existingCert.finalScorePercentage).toBe(100);
      expect(existingCert.completedAt).toBeDefined();
      expect(existingCert.issuedAt).toBeDefined();
    });

    it('11. Repeated issuance returns the existing certificate idempotently', async () => {
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate`)
        .set('Cookie', studentCookies);

      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseComplete.id}/certificate/issue`)
        .set('Cookie', studentCookies);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.certificateNumber).toBe(existingCert.certificateNumber);
      expect(res2.body.data.certificateNumber).toBe(existingCert.certificateNumber);
      expect(res1.body.data.id).toBe(existingCert.id);
      expect(res2.body.data.id).toBe(existingCert.id);
    });

    it('12. Concurrent duplicate issuance requests resolve safely to the identical record', async () => {
      // Enroll Bob in courseComplete, complete all lessons
      const [bobEnr] = await testDb
        .insert(schema.enrollments)
        .values({
          userId: studentBCredsUser.id,
          studentId: studentBCredsUser.id,
          courseId: courseComplete.id,
          status: 'ACTIVE',
        })
        .returning();

      await testDb.insert(schema.lessonProgress).values([
        {
          enrollmentId: bobEnr.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        {
          enrollmentId: bobEnr.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      ]);

      // Fire 5 concurrent issuance requests simultaneously
      const results = await Promise.all([
        certificateService.issueCertificateIfEligible(bobEnr.id),
        certificateService.issueCertificateIfEligible(bobEnr.id),
        certificateService.issueCertificateIfEligible(bobEnr.id),
        certificateService.issueCertificateIfEligible(bobEnr.id),
        certificateService.issueCertificateIfEligible(bobEnr.id),
      ]);

      // All 5 must succeed (either ISSUED or ALREADY_EXISTS)
      for (const res of results) {
        expect(['ISSUED', 'ALREADY_EXISTS']).toContain(res.status);
      }

      // Exactly one unique certificate created in DB
      const allBobCerts = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, bobEnr.id));

      expect(allBobCerts.length).toBe(1);
    });

    it('13. Unique certificate identifier uses cryptographically secure alphabet', () => {
      const number = existingCert.certificateNumber;
      expect(number).toMatch(/^TSP-\d{4}-C[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);

      // Verify no ambiguous glyphs (0, O, 1, I, l)
      const token = number.split('-C')[1];
      expect(token).not.toMatch(/[01IOIl]/);
    });

    it('14. Database uniqueness constraint prevents duplicate certificates for the same enrollment', async () => {
      // Attempt manual raw insert for an enrollment that already has a certificate
      await expect(
        testDb.insert(schema.certificates).values({
          certificateNumber: 'TSP-2026-CFORCETEST1',
          enrollmentId: enrollmentComplete.id,
          courseId: courseComplete.id,
          studentId: studentUser.id,
          studentName: 'Alice Student',
          courseTitle: courseComplete.title,
          instructorName: instructorUser.name,
          completedAt: new Date(),
          issuedAt: new Date(),
          finalScorePercentage: 100,
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });

    it('15. Snapshot preserves original historical metadata even if user or course title later mutates', async () => {
      const originalTitle = courseComplete.title;

      // Mutate course title in courses table
      await testDb
        .update(schema.courses)
        .set({ title: 'Mutated New Course Title' })
        .where(eq(schema.courses.id, courseComplete.id));

      // Fetch certificate from API
      const certRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate`)
        .set('Cookie', studentCookies);

      expect(certRes.body.data.courseTitle).toBe(originalTitle);

      // Restore course title
      await testDb
        .update(schema.courses)
        .set({ title: originalTitle })
        .where(eq(schema.courses.id, courseComplete.id));
    });

    it('16. Correct issuance timestamps are preserved', async () => {
      expect(new Date(existingCert.issuedAt).getTime()).not.toBeNaN();
      expect(new Date(existingCert.completedAt).getTime()).not.toBeNaN();
    });

    it('17. Unauthorized issuance attempts without authentication are rejected (401)', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/courses/${courseComplete.id}/certificate`
      );

      expect(res.status).toBe(401);
    });

    it('18. Invalid course identifiers are rejected with 400 INVALID_ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses/not-a-valid-uuid-and-not-a-slug/certificate')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_ID');
    });

    it('19. Incomplete course issuance attempt is rejected with 403 COURSE_NOT_COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseIncomplete.id}/certificate`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('COURSE_NOT_COMPLETED');
    });
  });

  // ==========================================
  // SECTION C: INTEGRATION TESTS (20 - 25)
  // ==========================================

  describe('Integration & Bilingual Experience (Conditions 20-25)', () => {
    it('20. Authenticated API GET /api/v1/courses/:courseId/certificate/eligibility returns valid session data', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/eligibility`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.courseId).toBe(courseComplete.id);
      expect(res.body.data.courseTitle).toBe(courseComplete.title);
    });

    it('21. API contract validation: conforms to CertificateEligibilityDto', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/eligibility`)
        .set('Cookie', studentCookies);

      const data = res.body.data;
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('isEligible');
      expect(data).toHaveProperty('courseId');
      expect(data).toHaveProperty('courseTitle');
      expect(data).toHaveProperty('progressPercentage');
      expect(data).toHaveProperty('totalLessons');
      expect(data).toHaveProperty('completedLessons');
      expect(data).toHaveProperty('publishedQuizzes');
      expect(data).toHaveProperty('passedQuizzes');
      expect(data).toHaveProperty('hasUnpassedQuizzes');
      expect(data).toHaveProperty('hasUnpassedFinalExam');
    });

    it('22. POST /api/v1/courses/:courseId/certificate/issue returns newly issued or existing certificate', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseComplete.id}/certificate/issue`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.certificateNumber).toBe(existingCert.certificateNumber);
    });

    it('23. English success and failure messages are present in dictionary', () => {
      const fs = require('fs');
      const path = require('path');
      const enFile = fs.readFileSync(
        path.resolve(__dirname, '../../../web/src/i18n/messages/en.ts'),
        'utf8'
      );
      expect(enFile).toContain("eligibleTitle: 'Certificate Ready for Issuance'");
      expect(enFile).toContain("inProgressTitle: 'Certificate In Progress'");
      expect(enFile).toContain("claimCertificate: 'Claim Certificate'");
      expect(enFile).toContain("completionChecklist: 'Completion Checklist'");
    });

    it('24. Bangla success and failure messages are present in dictionary', () => {
      const fs = require('fs');
      const path = require('path');
      const bnFile = fs.readFileSync(
        path.resolve(__dirname, '../../../web/src/i18n/messages/bn.ts'),
        'utf8'
      );
      expect(bnFile).toContain("eligibleTitle: 'সার্টিফিকেট গ্রহণের জন্য প্রস্তুত'");
      expect(bnFile).toContain("inProgressTitle: 'সার্টিফিকেট প্রক্রিয়াধীন'");
      expect(bnFile).toContain("claimCertificate: 'সার্টিফিকেট গ্রহণ করুন'");
      expect(bnFile).toContain("completionChecklist: 'সমাপ্তির বিবরণ'");
    });

    it('25. Existing public certificate verification regression is preserved', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/verify/${existingCert.certificateNumber}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.certificateNumber).toBe(existingCert.certificateNumber);
      expect(res.body.data.studentName).toBe('Alice Student');
      expect(res.body.data.status).toBe('ACTIVE');
    });
  });
});
