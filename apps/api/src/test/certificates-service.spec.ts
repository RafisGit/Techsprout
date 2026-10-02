import { describe, it, expect, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { createTestDatabase } from './test-helper';
import * as schema from '../database/schema';
import { AuditService } from '../modules/audit/audit.service';
import {
  CertificateService,
  generateCertificateNumber,
  CERTIFICATE_ALPHABET,
} from '../modules/certificates/certificates.service';
import { LearningService } from '../modules/learning/learning.service';
import { StudentQuizzesService } from '../modules/quizzes/student-quizzes.service';

describe('P4.5.2 — CertificateService & Automated Issuance Business Logic Test Suite', () => {
  let db: any;
  let pool: any;
  let auditService: AuditService;
  let certificateService: CertificateService;
  let learningService: LearningService;
  let studentQuizzesService: StudentQuizzesService;

  let studentUser: any;
  let instructorUser: any;
  let category: any;
  let course: any;
  let moduleRecord: any;
  let lesson1: any;
  let lesson2: any;
  let enrollment: any;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    pool = testDb.pool;

    auditService = new AuditService(db);
    certificateService = new CertificateService(db, auditService);
    learningService = new LearningService(db, auditService, certificateService);
    studentQuizzesService = new StudentQuizzesService(db, auditService, certificateService);

    // Retrieve seeded student and instructor
    const [student] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, 'student'))
      .limit(1);
    studentUser = student;

    const [instructor] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, 'instructor'))
      .limit(1);
    instructorUser = instructor;

    // Create Category
    const [cat] = await db
      .insert(schema.categories)
      .values({
        name: 'Computer Science',
        slug: 'computer-science',
      })
      .returning();
    category = cat;

    // Create Course
    const [crs] = await db
      .insert(schema.courses)
      .values({
        categoryId: category.id,
        instructorId: instructorUser.id,
        title: 'Fullstack TypeScript Architecture',
        slug: 'fullstack-ts-architecture',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      })
      .returning();
    course = crs;

    // Create Module
    const [mod] = await db
      .insert(schema.modules)
      .values({
        courseId: course.id,
        title: 'Module 1: Foundations',
        position: 1,
      })
      .returning();
    moduleRecord = mod;

    // Create Lessons
    const [l1] = await db
      .insert(schema.lessons)
      .values({
        moduleId: moduleRecord.id,
        title: 'Lesson 1: Introduction',
        position: 1,
        lessonType: 'TEXT',
      })
      .returning();
    lesson1 = l1;

    const [l2] = await db
      .insert(schema.lessons)
      .values({
        moduleId: moduleRecord.id,
        title: 'Lesson 2: Advanced Topics',
        position: 2,
        lessonType: 'TEXT',
      })
      .returning();
    lesson2 = l2;

    // Create Active Enrollment
    const [enr] = await db
      .insert(schema.enrollments)
      .values({
        studentId: studentUser.id,
        courseId: course.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment = enr;
  });

  // ==========================================
  // 1. ELIGIBILITY DETERMINATION
  // ==========================================
  describe('1. Eligibility Evaluation', () => {
    it('1.1 should determine completed lessons-only course is eligible for certificate issuance', async () => {
      // Complete lesson 1 and 2
      const completedTime = new Date('2026-10-01T12:00:00Z');
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      // Set enrollment to COMPLETED
      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));

      const eligibility = await certificateService.checkEligibility(enrollment.id, course.id);
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.totalLessons).toBe(2);
      expect(eligibility.completedLessons).toBe(2);
      expect(eligibility.publishedQuizzes).toBe(0);

      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(result.status).toBe('ISSUED');
      expect(result.issued).toBe(true);
    });

    it('1.2 should reject certificate issuance if lessons are incomplete', async () => {
      // Complete only 1 of 2 lessons
      await db.insert(schema.lessonProgress).values({
        enrollmentId: enrollment.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(result.status).toBe('NOT_ELIGIBLE');
      expect(result.issued).toBe(false);
      expect((result as any).reason).toBeDefined();
    });

    it('1.3 should reject certificate issuance if published quiz is not passed', async () => {
      // Complete all lessons
      const completedTime = new Date();
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      // Add a published quiz
      const [quiz] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Quiz 1',
          position: 3,
          quizType: 'KNOWLEDGE_CHECK',
          status: 'PUBLISHED',
          passingScorePercentage: 70,
        })
        .returning();

      // Enrollment marked COMPLETED prematurely (or active)
      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));

      // Attempt without passing quiz
      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(result.status).toBe('NOT_ELIGIBLE');
      expect(result.issued).toBe(false);
      expect((result as any).details?.hasUnpassedQuizzes).toBe(true);
    });

    it('1.4 should exclude DRAFT quizzes from certificate eligibility requirement', async () => {
      // Complete all lessons
      const completedTime = new Date();
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      // Add a DRAFT quiz (not published)
      await db.insert(schema.quizzes).values({
        moduleId: moduleRecord.id,
        title: 'Draft Assessment',
        position: 3,
        quizType: 'KNOWLEDGE_CHECK',
        status: 'DRAFT',
      });

      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));

      const eligibility = await certificateService.checkEligibility(enrollment.id, course.id);
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.publishedQuizzes).toBe(0);

      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(result.status).toBe('ISSUED');
      expect(result.issued).toBe(true);
    });

    it('1.5 should exclude ARCHIVED quizzes from certificate eligibility requirement', async () => {
      const completedTime = new Date();
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      // Add an ARCHIVED quiz
      await db.insert(schema.quizzes).values({
        moduleId: moduleRecord.id,
        title: 'Retired Assessment',
        position: 3,
        quizType: 'KNOWLEDGE_CHECK',
        status: 'ARCHIVED',
      });

      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));

      const eligibility = await certificateService.checkEligibility(enrollment.id, course.id);
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.publishedQuizzes).toBe(0);

      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(result.status).toBe('ISSUED');
      expect(result.issued).toBe(true);
    });

    it('1.6 should require published FINAL_EXAM to be passed', async () => {
      const completedTime = new Date();
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      // Add regular quiz and FINAL_EXAM quiz
      const [kcQuiz] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Knowledge Check 1',
          position: 3,
          quizType: 'KNOWLEDGE_CHECK',
          status: 'PUBLISHED',
          passingScorePercentage: 70,
        })
        .returning();

      const [finalExam] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Comprehensive Final Exam',
          position: 4,
          quizType: 'FINAL_EXAM',
          status: 'PUBLISHED',
          passingScorePercentage: 80,
        })
        .returning();

      // Student passed KC quiz only
      await db.insert(schema.quizAttempts).values({
        quizId: kcQuiz.id,
        enrollmentId: enrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 80,
        totalPoints: 100,
        percentage: '80.00',
        isPassed: true,
      });

      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));

      const eligibility = await certificateService.checkEligibility(enrollment.id, course.id);
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.hasUnpassedFinalExam).toBe(true);

      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(result.status).toBe('NOT_ELIGIBLE');

      // Now pass the final exam
      await db.insert(schema.quizAttempts).values({
        quizId: finalExam.id,
        enrollmentId: enrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 85,
        totalPoints: 100,
        percentage: '85.00',
        isPassed: true,
      });

      const eligibleResult = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(eligibleResult.status).toBe('ISSUED');
      expect(eligibleResult.issued).toBe(true);
    });
  });

  // ==========================================
  // 2. FINAL SCORE CALCULATION
  // ==========================================
  describe('2. Authoritative Final Score Calculation', () => {
    it('2.1 Rule A: should use highest passed percentage among passed FINAL_EXAM attempts', async () => {
      const [finalExam] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Final Exam',
          position: 3,
          quizType: 'FINAL_EXAM',
          status: 'PUBLISHED',
        })
        .returning();

      // Attempt 1: 75% passed
      await db.insert(schema.quizAttempts).values({
        quizId: finalExam.id,
        enrollmentId: enrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 75,
        totalPoints: 100,
        percentage: '75.00',
        isPassed: true,
      });

      // Attempt 2: 92% passed
      await db.insert(schema.quizAttempts).values({
        quizId: finalExam.id,
        enrollmentId: enrollment.id,
        studentId: studentUser.id,
        attemptNumber: 2,
        status: 'SUBMITTED',
        score: 92,
        totalPoints: 100,
        percentage: '92.00',
        isPassed: true,
      });

      const score = await certificateService.calculateFinalScore(course.id, enrollment.id);
      expect(score).toBe(92);
    });

    it('2.2 Rule A: should ignore failed attempts when calculating FINAL_EXAM score', async () => {
      const [finalExam] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Final Exam',
          position: 3,
          quizType: 'FINAL_EXAM',
          status: 'PUBLISHED',
        })
        .returning();

      // Attempt 1: 85% passed
      await db.insert(schema.quizAttempts).values({
        quizId: finalExam.id,
        enrollmentId: enrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 85,
        totalPoints: 100,
        percentage: '85.00',
        isPassed: true,
      });

      // Attempt 2: 40% failed
      await db.insert(schema.quizAttempts).values({
        quizId: finalExam.id,
        enrollmentId: enrollment.id,
        studentId: studentUser.id,
        attemptNumber: 2,
        status: 'SUBMITTED',
        score: 40,
        totalPoints: 100,
        percentage: '40.00',
        isPassed: false,
      });

      const score = await certificateService.calculateFinalScore(course.id, enrollment.id);
      expect(score).toBe(85);
    });

    it('2.3 Rule B: should calculate unweighted arithmetic mean of best passed percentages across quizzes', async () => {
      const [q1] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Quiz 1',
          position: 3,
          quizType: 'KNOWLEDGE_CHECK',
          status: 'PUBLISHED',
        })
        .returning();

      const [q2] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Quiz 2',
          position: 4,
          quizType: 'KNOWLEDGE_CHECK',
          status: 'PUBLISHED',
        })
        .returning();

      // Quiz 1: best passed = 80
      await db.insert(schema.quizAttempts).values({
        quizId: q1.id,
        enrollmentId: enrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 80,
        totalPoints: 100,
        percentage: '80.00',
        isPassed: true,
      });

      // Quiz 2: attempt 1 = 70% passed, attempt 2 = 90% passed (best = 90)
      await db.insert(schema.quizAttempts).values([
        {
          quizId: q2.id,
          enrollmentId: enrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
          status: 'SUBMITTED',
          score: 70,
          totalPoints: 100,
          percentage: '70.00',
          isPassed: true,
        },
        {
          quizId: q2.id,
          enrollmentId: enrollment.id,
          studentId: studentUser.id,
          attemptNumber: 2,
          status: 'SUBMITTED',
          score: 90,
          totalPoints: 100,
          percentage: '90.00',
          isPassed: true,
        },
      ]);

      // Mean: (80 + 90) / 2 = 85
      const score = await certificateService.calculateFinalScore(course.id, enrollment.id);
      expect(score).toBe(85);
    });

    it('2.4 Rule B: should round mean to nearest integer result', async () => {
      const [q1] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Quiz 1',
          position: 3,
          quizType: 'KNOWLEDGE_CHECK',
          status: 'PUBLISHED',
        })
        .returning();

      const [q2] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Quiz 2',
          position: 4,
          quizType: 'KNOWLEDGE_CHECK',
          status: 'PUBLISHED',
        })
        .returning();

      // Quiz 1 = 85, Quiz 2 = 86 -> Mean = 85.5 -> Round = 86
      await db.insert(schema.quizAttempts).values([
        {
          quizId: q1.id,
          enrollmentId: enrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
          status: 'SUBMITTED',
          score: 85,
          totalPoints: 100,
          percentage: '85.00',
          isPassed: true,
        },
        {
          quizId: q2.id,
          enrollmentId: enrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
          status: 'SUBMITTED',
          score: 86,
          totalPoints: 100,
          percentage: '86.00',
          isPassed: true,
        },
      ]);

      const score = await certificateService.calculateFinalScore(course.id, enrollment.id);
      expect(score).toBe(86);
    });

    it('2.5 Rule C: should assign final score 100 for lessons-only courses with zero quizzes', async () => {
      const score = await certificateService.calculateFinalScore(course.id, enrollment.id);
      expect(score).toBe(100);
    });
  });

  // ==========================================
  // 3. IMMUTABLE SNAPSHOT PERSISTENCE
  // ==========================================
  describe('3. Immutable Certificate Snapshot', () => {
    beforeEach(async () => {
      const completedTime = new Date('2026-10-01T10:00:00Z');
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));
    });

    it('3.1 should snapshot student name, course title, and instructor name at issuance', async () => {
      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(result.status).toBe('ISSUED');
      const cert = (result as any).certificate;

      expect(cert.studentName).toBe(studentUser.name);
      expect(cert.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(cert.instructorName).toBe(instructorUser.name);
      expect(cert.completedAt).toBeDefined();
      expect(cert.issuedAt).toBeDefined();
      expect(cert.finalScorePercentage).toBe(100);
      expect(cert.status).toBe('ACTIVE');
    });

    it('3.2 should freeze snapshot fields permanently even if course or users mutate later', async () => {
      const result = await certificateService.issueCertificateIfEligible(enrollment.id);
      const originalCert = (result as any).certificate;

      // Mutate course title and instructor name in database
      await db
        .update(schema.courses)
        .set({ title: 'Mutated Course Title 2027' })
        .where(eq(schema.courses.id, course.id));

      await db
        .update(schema.users)
        .set({ name: 'Renamed Instructor' })
        .where(eq(schema.users.id, instructorUser.id));

      await db
        .update(schema.users)
        .set({ name: 'Renamed Student' })
        .where(eq(schema.users.id, studentUser.id));

      // Reload certificate
      const cert = await certificateService.getCertificateById(originalCert.id);
      expect(cert).toBeDefined();
      expect(cert?.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(cert?.instructorName).toBe(instructorUser.name);
      expect(cert?.studentName).toBe(studentUser.name);
      expect(cert?.finalScorePercentage).toBe(100);
    });

    it('3.3 should fail safely and report error if instructor user record is missing', async () => {
      const [orphanCourse] = await db
        .insert(schema.courses)
        .values({
          categoryId: category.id,
          instructorId: instructorUser.id,
          title: 'Orphan Course',
          slug: 'orphan-course',
        })
        .returning();

      const [orphanMod] = await db
        .insert(schema.modules)
        .values({
          courseId: orphanCourse.id,
          title: 'Orphan Module',
          position: 1,
        })
        .returning();

      const [orphanLesson] = await db
        .insert(schema.lessons)
        .values({
          moduleId: orphanMod.id,
          title: 'Orphan Lesson',
          position: 1,
          lessonType: 'TEXT',
        })
        .returning();

      const completedTime = new Date();
      const [orphanEnrollment] = await db
        .insert(schema.enrollments)
        .values({
          studentId: studentUser.id,
          courseId: orphanCourse.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        })
        .returning();

      await db.insert(schema.lessonProgress).values({
        enrollmentId: orphanEnrollment.id,
        lessonId: orphanLesson.id,
        status: 'COMPLETED',
        completedAt: completedTime,
      });

      // Temporarily update course instructor to empty / invalid name user
      const [dummyUser] = await db
        .insert(schema.users)
        .values({
          name: '',
          username: 'no-name-instructor',
          email: 'no-name@techsprout.edu',
        })
        .returning();

      await db
        .update(schema.courses)
        .set({ instructorId: dummyUser.id })
        .where(eq(schema.courses.id, orphanCourse.id));

      const res = await certificateService.issueCertificateIfEligible(orphanEnrollment.id);
      expect(res.status).toBe('INVALID_DOMAIN_STATE');
      expect(res.issued).toBe(false);
    });
  });

  // ==========================================
  // 4. CERTIFICATE NUMBER GENERATION & FORMAT
  // ==========================================
  describe('4. Certificate Number Generation', () => {
    it('4.1 should conform to TSP-YYYY-CXXXXXXXX format with exactly 8 unambiguous characters', () => {
      const certNumber = generateCertificateNumber(2026);
      expect(certNumber).toMatch(/^TSP-2026-C[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
      expect(certNumber.length).toBe(18);
    });

    it('4.2 should only contain characters from the frozen unambiguous alphabet', () => {
      for (let i = 0; i < 50; i++) {
        const certNumber = generateCertificateNumber();
        const token = certNumber.slice(10); // After 'TSP-YYYY-C'
        expect(token.length).toBe(8);
        for (const char of token) {
          expect(CERTIFICATE_ALPHABET).toContain(char);
          // Verify excluded glyphs
          expect(['0', '1', 'O', 'I', 'l']).not.toContain(char);
        }
      }
    });

    it('4.3 should generate unique random numbers across repeated invocations', () => {
      const generated = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const num = generateCertificateNumber();
        expect(generated.has(num)).toBe(false);
        generated.add(num);
      }
    });
  });

  // ==========================================
  // 5. ISSUANCE IDEMPOTENCY & AUDIT LOGGING
  // ==========================================
  describe('5. Issuance Idempotency & Audit Trails', () => {
    beforeEach(async () => {
      const completedTime = new Date('2026-10-01T10:00:00Z');
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));
    });

    it('5.1 should issue certificate exactly once and return ALREADY_EXISTS on duplicate call', async () => {
      const first = await certificateService.issueCertificateIfEligible(enrollment.id, {
        actorId: studentUser.id,
      });
      expect(first.status).toBe('ISSUED');
      expect(first.issued).toBe(true);
      const firstCert = (first as any).certificate;

      const second = await certificateService.issueCertificateIfEligible(enrollment.id, {
        actorId: studentUser.id,
      });
      expect(second.status).toBe('ALREADY_EXISTS');
      expect(second.issued).toBe(false);
      const secondCert = (second as any).certificate;

      expect(secondCert.id).toBe(firstCert.id);
      expect(secondCert.certificateNumber).toBe(firstCert.certificateNumber);
    });

    it('5.2 should emit CERTIFICATE_ISSUED audit event exactly once', async () => {
      await certificateService.issueCertificateIfEligible(enrollment.id, {
        actorId: studentUser.id,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 TestBrowser',
        requestId: 'req_test_123',
      });

      // Duplicate call
      await certificateService.issueCertificateIfEligible(enrollment.id, {
        actorId: studentUser.id,
      });

      // Check audit logs
      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'CERTIFICATE_ISSUED'),
            eq(schema.auditLogs.targetType, 'CERTIFICATE')
          )
        );

      expect(logs.length).toBe(1);
      const log = logs[0];
      expect(log.actorId).toBe(studentUser.id);
      expect(log.ipAddress).toBe('192.168.1.1');
      expect(log.userAgent).toBe('Mozilla/5.0 TestBrowser');
      expect(log.requestId).toBe('req_test_123');

      const metadata = JSON.parse(log.metadata);
      expect(metadata.certificateId).toBeDefined();
      expect(metadata.certificateNumber).toBeDefined();
      expect(metadata.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(metadata.studentName).toBe(studentUser.name);
      expect(metadata.instructorName).toBe(instructorUser.name);
    });

    it('5.3 should handle concurrent issuance attempts safely producing exactly 1 certificate', async () => {
      // Fire 5 concurrent issuance requests
      const promises = [
        certificateService.issueCertificateIfEligible(enrollment.id, { actorId: studentUser.id }),
        certificateService.issueCertificateIfEligible(enrollment.id, { actorId: studentUser.id }),
        certificateService.issueCertificateIfEligible(enrollment.id, { actorId: studentUser.id }),
        certificateService.issueCertificateIfEligible(enrollment.id, { actorId: studentUser.id }),
        certificateService.issueCertificateIfEligible(enrollment.id, { actorId: studentUser.id }),
      ];

      const results = await Promise.all(promises);

      // Exactly one should be newly issued
      const issuedResults = results.filter((r) => r.status === 'ISSUED');
      const alreadyExistsResults = results.filter((r) => r.status === 'ALREADY_EXISTS');

      expect(issuedResults.length).toBe(1);
      expect(alreadyExistsResults.length).toBe(4);

      // Verify DB row count
      const allCerts = await db
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollment.id));
      expect(allCerts.length).toBe(1);

      // Verify audit events: exactly 1 CERTIFICATE_ISSUED emitted
      const auditRecords = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'CERTIFICATE_ISSUED'));
      expect(auditRecords.length).toBe(1);
    });
  });

  // ==========================================
  // 6. CURRICULUM EVOLUTION & HISTORICAL INVARIANT
  // ==========================================
  describe('6. Curriculum Evolution Invariant', () => {
    let issuedCert: any;

    beforeEach(async () => {
      const completedTime = new Date('2026-10-01T10:00:00Z');
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));

      const res = await certificateService.issueCertificateIfEligible(enrollment.id);
      issuedCert = (res as any).certificate;
    });

    it('6.1 publishing a new quiz later should NOT revoke or mutate existing certificate', async () => {
      // Instructor publishes a new quiz
      await db.insert(schema.quizzes).values({
        moduleId: moduleRecord.id,
        title: 'New Quiz Added Later',
        position: 3,
        quizType: 'KNOWLEDGE_CHECK',
        status: 'PUBLISHED',
      });

      // Enrollment may revert to ACTIVE via curriculum sync
      await db
        .update(schema.enrollments)
        .set({ status: 'ACTIVE', completedAt: null })
        .where(eq(schema.enrollments.id, enrollment.id));

      // Query certificate
      const cert = await certificateService.getCertificateById(issuedCert.id);
      expect(cert).toBeDefined();
      expect(cert?.status).toBe('ACTIVE');
      expect(cert?.certificateNumber).toBe(issuedCert.certificateNumber);

      // Re-invoking issuance detects existing certificate and returns it intact
      const reIssuance = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(reIssuance.status).toBe('ALREADY_EXISTS');
      expect((reIssuance as any).certificate.id).toBe(issuedCert.id);
    });

    it('6.2 archiving the course should NOT invalidate or mutate issued certificates', async () => {
      // Archive course
      await db
        .update(schema.courses)
        .set({ status: 'ARCHIVED' })
        .where(eq(schema.courses.id, course.id));

      const cert = await certificateService.getCertificateById(issuedCert.id);
      expect(cert).toBeDefined();
      expect(cert?.status).toBe('ACTIVE');
      expect(cert?.certificateNumber).toBe(issuedCert.certificateNumber);
    });
  });

  // ==========================================
  // 7. SECURITY & PRIVACY GOVERNANCE
  // ==========================================
  describe('7. Security & Privacy Boundary', () => {
    it('7.1 should never log password, session tokens, or quiz answer keys in certificate audit log', async () => {
      const completedTime = new Date();
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: completedTime })
        .where(eq(schema.enrollments.id, enrollment.id));

      await certificateService.issueCertificateIfEligible(enrollment.id, {
        actorId: studentUser.id,
      });

      const [log] = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'CERTIFICATE_ISSUED'));

      expect(log).toBeDefined();
      const rawMetadata = log.metadata;
      expect(rawMetadata).not.toContain('password');
      expect(rawMetadata).not.toContain('hash');
      expect(rawMetadata).not.toContain('token');
      expect(rawMetadata).not.toContain('session');
      expect(rawMetadata).not.toContain('selectedOptionIds');
      expect(rawMetadata).not.toContain('isCorrect');
    });
  });

  // ==========================================
  // 8. CALLING SERVICES INTEGRATION
  // ==========================================
  describe('8. Calling Services Integration', () => {
    it('8.1 LearningService: completing final lesson automatically triggers certificate issuance', async () => {
      // Complete lesson 1 first
      await db.insert(schema.lessonProgress).values({
        enrollmentId: enrollment.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      // Complete lesson 2 via LearningService toggleLessonComplete
      const res = await learningService.toggleLessonComplete(
        course.id,
        lesson2.id,
        true,
        { id: studentUser.id, role: 'student' }
      );

      expect(res.courseProgress.isCourseCompleted).toBe(true);

      // Verify certificate automatically exists in database
      const cert = await certificateService.getCertificateByEnrollment(enrollment.id);
      expect(cert).toBeDefined();
      expect(cert?.status).toBe('ACTIVE');
      expect(cert?.studentName).toBe(studentUser.name);
      expect(cert?.courseTitle).toBe(course.title);
      expect(cert?.finalScorePercentage).toBe(100);
    });

    it('8.2 StudentQuizzesService: submitting passing attempt for final assessment triggers certificate issuance', async () => {
      // Complete all lessons first
      const completedTime = new Date();
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);

      // Add Quiz with question & option
      const [quiz] = await db
        .insert(schema.quizzes)
        .values({
          moduleId: moduleRecord.id,
          title: 'Final Knowledge Check',
          position: 3,
          quizType: 'KNOWLEDGE_CHECK',
          status: 'PUBLISHED',
          passingScorePercentage: 70,
        })
        .returning();

      const [q] = await db
        .insert(schema.quizQuestions)
        .values({
          quizId: quiz.id,
          questionText: 'What is TypeScript?',
          questionType: 'SINGLE_CHOICE',
          position: 1,
          points: 10,
        })
        .returning();

      const [correctOpt] = await db
        .insert(schema.quizQuestionOptions)
        .values({
          questionId: q.id,
          optionText: 'A typed superset of JavaScript',
          position: 1,
          isCorrect: true,
        })
        .returning();

      await db
        .insert(schema.quizQuestionOptions)
        .values({
          questionId: q.id,
          optionText: 'A database system',
          position: 2,
          isCorrect: false,
        });

      // Start attempt
      const attemptRes = await studentQuizzesService.startOrResumeAttempt(
        quiz.id,
        { id: studentUser.id, role: 'student' }
      );

      // Submit attempt with correct answer
      const submitRes = await studentQuizzesService.submitAttempt(
        quiz.id,
        attemptRes.id,
        {
          answers: [
            {
              questionId: q.id,
              selectedOptionIds: [correctOpt.id],
            },
          ],
        },
        { id: studentUser.id, role: 'student' },
        '127.0.0.1',
        'Vitest Integration Agent',
        'req_test_final_quiz'
      );

      expect(submitRes.isPassed).toBe(true);
      expect(submitRes.isCourseCompleted).toBe(true);

      // Verify certificate automatically created and persisted
      const cert = await certificateService.getCertificateByEnrollment(enrollment.id);
      expect(cert).toBeDefined();
      expect(cert?.status).toBe('ACTIVE');
      expect(cert?.finalScorePercentage).toBe(100);
      expect(cert?.certificateNumber).toMatch(/^TSP-\d{4}-C/);
    });
  });

  // ==========================================
  // 9. READ ENDPOINTS SIDE-EFFECT FREEDOM
  // ==========================================
  describe('9. Read Endpoints Side-Effect Freedom & Boundary Governance', () => {
    beforeEach(async () => {
      // Set all lessons to completed in progress table
      const completedTime = new Date();
      await db.insert(schema.lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: lesson1.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
        {
          enrollmentId: enrollment.id,
          lessonId: lesson2.id,
          status: 'COMPLETED',
          completedAt: completedTime,
        },
      ]);
    });

    it('9.1 getCurriculum() must NOT issue a certificate', async () => {
      // Call getCurriculum (GET endpoint)
      const curriculum = await learningService.getCurriculum(course.id, {
        id: studentUser.id,
        role: 'student',
      });

      expect(curriculum).toBeDefined();

      // Verify NO certificate exists
      const cert = await certificateService.getCertificateByEnrollment(enrollment.id);
      expect(cert).toBeNull();
    });

    it('9.2 getResumePoint() must NOT issue a certificate', async () => {
      // Call getResumePoint (GET endpoint)
      const resume = await learningService.getResumePoint(course.id, {
        id: studentUser.id,
        role: 'student',
      });

      expect(resume).toBeDefined();

      // Verify NO certificate exists
      const cert = await certificateService.getCertificateByEnrollment(enrollment.id);
      expect(cert).toBeNull();
    });

    it('9.3 repeated GET requests must create zero certificates and zero CERTIFICATE_ISSUED audit logs', async () => {
      // Fire multiple GET curriculum and resume calls
      for (let i = 0; i < 5; i++) {
        await learningService.getCurriculum(course.id, {
          id: studentUser.id,
          role: 'student',
        });
        await learningService.getResumePoint(course.id, {
          id: studentUser.id,
          role: 'student',
        });
      }

      // Assert 0 certificate records
      const certs = await db
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollment.id));
      expect(certs.length).toBe(0);

      // Assert 0 CERTIFICATE_ISSUED audit records
      const auditLogs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'CERTIFICATE_ISSUED'));
      expect(auditLogs.length).toBe(0);
    });

    it('9.4 saveProgressCheckpoint() video threshold completion triggers certificate issuance', async () => {
      // Create a video lesson in module
      const [videoLesson] = await db
        .insert(schema.lessons)
        .values({
          moduleId: moduleRecord.id,
          title: 'Lesson 3: Final Video',
          position: 3,
          lessonType: 'VIDEO',
          durationSeconds: 100,
        })
        .returning();

      // Call saveProgressCheckpoint at 90% threshold (90s / 100s)
      const checkpointRes = await learningService.saveProgressCheckpoint(
        course.id,
        videoLesson.id,
        90,
        { id: studentUser.id, role: 'student' }
      );

      expect(checkpointRes.isCompleted).toBe(true);
      expect(checkpointRes.courseProgressPercentage).toBe(100);

      // Verify certificate created via this legitimate mutation trigger
      const cert = await certificateService.getCertificateByEnrollment(enrollment.id);
      expect(cert).toBeDefined();
      expect(cert?.status).toBe('ACTIVE');
      expect(cert?.courseTitle).toBe(course.title);
    });
  });

  // ==========================================
  // 10. ADMINISTRATIVE REVOCATION & VALIDATION
  // ==========================================
  describe('10. CertificateService.revokeCertificate validation & governance', () => {
    let certToRevoke: any;

    beforeEach(async () => {
      // Complete lesson 1 and 2
      await db.insert(schema.lessonProgress).values({
        enrollmentId: enrollment.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      });
      await db.insert(schema.lessonProgress).values({
        enrollmentId: enrollment.id,
        lessonId: lesson2.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      });
      await db
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: new Date() })
        .where(eq(schema.enrollments.id, enrollment.id));

      const res = await certificateService.issueCertificateIfEligible(enrollment.id);
      expect(res.status).toBe('ISSUED');
      if (res.status === 'ISSUED') {
        certToRevoke = res.certificate;
      }
    });

    it('10.1 rejects revocation reason shorter than 5 chars (e.g. "abcd")', async () => {
      await expect(
        certificateService.revokeCertificate(certToRevoke.id, 'abcd')
      ).rejects.toThrow('Revocation reason must be between 5 and 1000 characters');
    });

    it('10.2 rejects whitespace-only revocation reason', async () => {
      await expect(
        certificateService.revokeCertificate(certToRevoke.id, '     ')
      ).rejects.toThrow('Revocation reason must be between 5 and 1000 characters');
    });

    it('10.3 rejects revocation reason exceeding 1000 characters', async () => {
      await expect(
        certificateService.revokeCertificate(certToRevoke.id, 'X'.repeat(1001))
      ).rejects.toThrow('Revocation reason must be between 5 and 1000 characters');
    });

    it('10.4 accepts revocation reason with exactly 5 characters (e.g. "abcde")', async () => {
      const revoked = await certificateService.revokeCertificate(certToRevoke.id, 'abcde');
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revocationReason).toBe('abcde');
      expect(revoked.revokedAt).toBeDefined();
    });
  });
});
