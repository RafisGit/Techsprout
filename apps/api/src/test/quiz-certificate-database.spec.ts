import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './test-helper';
import {
  quizzes,
  quizQuestions,
  quizQuestionOptions,
  quizAttempts,
  quizAttemptAnswers,
  certificates,
  enrollments,
  courses,
  modules,
  lessons,
  users,
  media,
} from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { seedCatalog } from '../database/seed/catalog.seeder';
import { seedQuizzes } from '../database/seed/quiz.seeder';

describe('P4.1 — Quizzes & Certificates Database Foundation Test Suite', () => {
  let db: any;
  let pool: any;
  let studentUser: any;
  let instructorUser: any;
  let testCourse: any;
  let testModule: any;
  let testLesson: any;
  let testEnrollment: any;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    pool = testDb.pool;

    // Seed baseline catalog
    await seedCatalog(db);

    // Retrieve seeded student user
    const [student] = await db
      .select()
      .from(users)
      .where(eq(users.username, 'student'))
      .limit(1);
    studentUser = student;

    // Retrieve seeded instructor user
    const [instructor] = await db
      .select()
      .from(users)
      .where(eq(users.username, 'instructor'))
      .limit(1);
    instructorUser = instructor;

    // Retrieve first seeded course and its first module
    const [course] = await db.select().from(courses).limit(1);
    testCourse = course;

    const [mod] = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, testCourse.id))
      .limit(1);
    testModule = mod;

    const [les] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.moduleId, testModule.id))
      .limit(1);
    testLesson = les;

    // Create an active test enrollment for student
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        studentId: studentUser.id,
        courseId: testCourse.id,
        status: 'ACTIVE',
      })
      .returning();
    testEnrollment = enrollment;
  });

  describe('1. Quizzes Schema, Enums & Creation', () => {
    it('1.1 should create a valid quiz record with default values', async () => {
      const [quiz] = await db
        .insert(quizzes)
        .values({
          moduleId: testModule.id,
          title: 'Module 1 Knowledge Check',
          description: 'A test knowledge check for module 1',
          position: 1,
        })
        .returning();

      expect(quiz).toBeDefined();
      expect(quiz.id).toBeDefined();
      expect(quiz.moduleId).toBe(testModule.id);
      expect(quiz.title).toBe('Module 1 Knowledge Check');
      expect(quiz.quizType).toBe('KNOWLEDGE_CHECK');
      expect(quiz.passingScorePercentage).toBe(70);
      expect(quiz.maxAttempts).toBe(3);
      expect(quiz.timeLimitMinutes).toBeNull();
      expect(quiz.status).toBe('DRAFT');
      expect(quiz.createdAt).toBeInstanceOf(Date);
      expect(quiz.updatedAt).toBeInstanceOf(Date);
    });

    it('1.2 should support both KNOWLEDGE_CHECK and FINAL_EXAM quiz types', async () => {
      const [kcQuiz] = await db
        .insert(quizzes)
        .values({
          moduleId: testModule.id,
          title: 'Module Knowledge Check',
          quizType: 'KNOWLEDGE_CHECK',
          position: 1,
        })
        .returning();

      const [feQuiz] = await db
        .insert(quizzes)
        .values({
          moduleId: testModule.id,
          title: 'Comprehensive Final Exam',
          quizType: 'FINAL_EXAM',
          position: 2,
        })
        .returning();

      expect(kcQuiz.quizType).toBe('KNOWLEDGE_CHECK');
      expect(feQuiz.quizType).toBe('FINAL_EXAM');
    });

    it('1.3 should reject invalid quiz_type enum value', async () => {
      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Invalid Quiz Type',
          quizType: 'INVALID_TYPE' as any,
          position: 1,
        })
      ).rejects.toThrow();
    });

    it('1.4 should support all quiz_status enum values (DRAFT, PUBLISHED, ARCHIVED)', async () => {
      const statuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
      for (let i = 0; i < statuses.length; i++) {
        const [quiz] = await db
          .insert(quizzes)
          .values({
            moduleId: testModule.id,
            title: `Quiz Status ${statuses[i]}`,
            status: statuses[i],
            position: i + 1,
          })
          .returning();

        expect(quiz.status).toBe(statuses[i]);
      }
    });

    it('1.5 should reject invalid quiz_status enum value', async () => {
      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Invalid Status Quiz',
          status: 'UNPUBLISHED' as any,
          position: 1,
        })
      ).rejects.toThrow();
    });

    it('1.6 should enforce UNIQUE(module_id, position) constraint', async () => {
      await db.insert(quizzes).values({
        moduleId: testModule.id,
        title: 'Quiz at Position 1',
        position: 1,
      });

      // Attempt duplicate position in the same module
      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Another Quiz at Position 1',
          position: 1,
        })
      ).rejects.toThrow();
    });

    it('1.7 should enforce check constraints on quiz attributes', async () => {
      // Position must be positive (> 0)
      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Zero Position Quiz',
          position: 0,
        })
      ).rejects.toThrow();

      // Passing score must be >= 1 and <= 100
      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Zero Percentage Quiz',
          position: 1,
          passingScorePercentage: 0,
        })
      ).rejects.toThrow();

      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Excessive Percentage Quiz',
          position: 1,
          passingScorePercentage: 101,
        })
      ).rejects.toThrow();

      // Max attempts must be null or > 0
      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Zero Max Attempts Quiz',
          position: 1,
          maxAttempts: 0,
        })
      ).rejects.toThrow();

      // Time limit must be null or > 0
      await expect(
        db.insert(quizzes).values({
          moduleId: testModule.id,
          title: 'Zero Time Limit Quiz',
          position: 1,
          timeLimitMinutes: 0,
        })
      ).rejects.toThrow();
    });
  });

  describe('2. Quiz Questions & Options Schema & Constraints', () => {
    let testQuiz: any;

    beforeEach(async () => {
      const [q] = await db
        .insert(quizzes)
        .values({
          moduleId: testModule.id,
          title: 'Test Quiz for Questions',
          position: 1,
        })
        .returning();
      testQuiz = q;
    });

    it('2.1 should create questions with valid question_type enum values', async () => {
      const types = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'] as const;

      for (let i = 0; i < types.length; i++) {
        const [question] = await db
          .insert(quizQuestions)
          .values({
            quizId: testQuiz.id,
            questionText: `Question ${i + 1} of type ${types[i]}`,
            questionType: types[i],
            position: i + 1,
            points: 2,
            explanation: `Explanation for ${types[i]}`,
          })
          .returning();

        expect(question).toBeDefined();
        expect(question.questionType).toBe(types[i]);
        expect(question.points).toBe(2);
        expect(question.position).toBe(i + 1);
      }
    });

    it('2.2 should reject invalid question_type enum value', async () => {
      await expect(
        db.insert(quizQuestions).values({
          quizId: testQuiz.id,
          questionText: 'Invalid Question Type',
          questionType: 'ESSAY' as any,
          position: 1,
        })
      ).rejects.toThrow();
    });

    it('2.3 should enforce UNIQUE(quiz_id, position) for questions', async () => {
      await db.insert(quizQuestions).values({
        quizId: testQuiz.id,
        questionText: 'Question at Position 1',
        position: 1,
      });

      await expect(
        db.insert(quizQuestions).values({
          quizId: testQuiz.id,
          questionText: 'Duplicate Question at Position 1',
          position: 1,
        })
      ).rejects.toThrow();
    });

    it('2.4 should enforce check constraints on question points and position', async () => {
      // Question position must be > 0
      await expect(
        db.insert(quizQuestions).values({
          quizId: testQuiz.id,
          questionText: 'Zero Position Question',
          position: 0,
        })
      ).rejects.toThrow();

      // Points must be > 0
      await expect(
        db.insert(quizQuestions).values({
          quizId: testQuiz.id,
          questionText: 'Zero Points Question',
          position: 1,
          points: 0,
        })
      ).rejects.toThrow();
    });

    it('2.5 should create question options with is_correct flag and position', async () => {
      const [question] = await db
        .insert(quizQuestions)
        .values({
          quizId: testQuiz.id,
          questionText: 'What is 2 + 2?',
          questionType: 'SINGLE_CHOICE',
          position: 1,
        })
        .returning();

      const [opt1] = await db
        .insert(quizQuestionOptions)
        .values({
          questionId: question.id,
          optionText: '3',
          position: 1,
          isCorrect: false,
        })
        .returning();

      const [opt2] = await db
        .insert(quizQuestionOptions)
        .values({
          questionId: question.id,
          optionText: '4',
          position: 2,
          isCorrect: true,
        })
        .returning();

      expect(opt1.isCorrect).toBe(false);
      expect(opt2.isCorrect).toBe(true);
      expect(opt1.position).toBe(1);
      expect(opt2.position).toBe(2);
    });

    it('2.6 should enforce UNIQUE(question_id, position) for options', async () => {
      const [question] = await db
        .insert(quizQuestions)
        .values({
          quizId: testQuiz.id,
          questionText: 'Sample Question',
          position: 1,
        })
        .returning();

      await db.insert(quizQuestionOptions).values({
        questionId: question.id,
        optionText: 'Option A',
        position: 1,
      });

      await expect(
        db.insert(quizQuestionOptions).values({
          questionId: question.id,
          optionText: 'Option B at duplicate position 1',
          position: 1,
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Quiz Attempts & Attempt Answers Schema & Integrity', () => {
    let testQuiz: any;
    let testQuestion: any;
    let testOption1: any;
    let testOption2: any;

    beforeEach(async () => {
      const [q] = await db
        .insert(quizzes)
        .values({
          moduleId: testModule.id,
          title: 'Quiz for Attempt Testing',
          position: 1,
        })
        .returning();
      testQuiz = q;

      const [quest] = await db
        .insert(quizQuestions)
        .values({
          quizId: testQuiz.id,
          questionText: 'Which HTTP method creates a resource?',
          questionType: 'SINGLE_CHOICE',
          position: 1,
          points: 1,
        })
        .returning();
      testQuestion = quest;

      const [opt1] = await db
        .insert(quizQuestionOptions)
        .values({
          questionId: testQuestion.id,
          optionText: 'GET',
          position: 1,
          isCorrect: false,
        })
        .returning();
      testOption1 = opt1;

      const [opt2] = await db
        .insert(quizQuestionOptions)
        .values({
          questionId: testQuestion.id,
          optionText: 'POST',
          position: 2,
          isCorrect: true,
        })
        .returning();
      testOption2 = opt2;
    });

    it('3.1 should create a valid quiz attempt in IN_PROGRESS status', async () => {
      const [attempt] = await db
        .insert(quizAttempts)
        .values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
        })
        .returning();

      expect(attempt).toBeDefined();
      expect(attempt.id).toBeDefined();
      expect(attempt.attemptNumber).toBe(1);
      expect(attempt.status).toBe('IN_PROGRESS');
      expect(attempt.score).toBe(0);
      expect(attempt.totalPoints).toBe(0);
      expect(attempt.isPassed).toBe(false);
      expect(attempt.startedAt).toBeInstanceOf(Date);
      expect(attempt.submittedAt).toBeNull();
      expect(attempt.lastSavedAt).toBeInstanceOf(Date);
    });

    it('3.2 should enforce UNIQUE(enrollment_id, quiz_id, attempt_number)', async () => {
      await db.insert(quizAttempts).values({
        quizId: testQuiz.id,
        enrollmentId: testEnrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
      });

      // Duplicate attempt number for same enrollment and quiz must fail
      await expect(
        db.insert(quizAttempts).values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
        })
      ).rejects.toThrow();

      // Next attempt number (2) must succeed
      const [attempt2] = await db
        .insert(quizAttempts)
        .values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 2,
        })
        .returning();

      expect(attempt2.attemptNumber).toBe(2);
    });

    it('3.3 should persist attempt answers with array of selected option IDs', async () => {
      const [attempt] = await db
        .insert(quizAttempts)
        .values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
        })
        .returning();

      const [answer] = await db
        .insert(quizAttemptAnswers)
        .values({
          attemptId: attempt.id,
          questionId: testQuestion.id,
          selectedOptionIds: [testOption2.id],
          isCorrect: true,
          pointsAwarded: 1,
        })
        .returning();

      expect(answer).toBeDefined();
      expect(answer.selectedOptionIds).toEqual([testOption2.id]);
      expect(answer.isCorrect).toBe(true);
      expect(answer.pointsAwarded).toBe(1);
    });

    it('3.4 should enforce UNIQUE(attempt_id, question_id) in answers', async () => {
      const [attempt] = await db
        .insert(quizAttempts)
        .values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
        })
        .returning();

      await db.insert(quizAttemptAnswers).values({
        attemptId: attempt.id,
        questionId: testQuestion.id,
        selectedOptionIds: [testOption1.id],
      });

      // Second answer for same question in same attempt must fail
      await expect(
        db.insert(quizAttemptAnswers).values({
          attemptId: attempt.id,
          questionId: testQuestion.id,
          selectedOptionIds: [testOption2.id],
        })
      ).rejects.toThrow();
    });

    it('3.5 should enforce check constraints on attempt scores and percentages', async () => {
      // Attempt number must be > 0
      await expect(
        db.insert(quizAttempts).values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 0,
        })
      ).rejects.toThrow();

      // Score cannot be negative
      await expect(
        db.insert(quizAttempts).values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
          score: -1,
        })
      ).rejects.toThrow();

      // Percentage cannot exceed 100
      await expect(
        db.insert(quizAttempts).values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
          percentage: '101.00',
        })
      ).rejects.toThrow();
    });
  });

  describe('4. Certificates Schema & Historical Snapshots', () => {
    it('4.1 should create an authentic certificate with frozen historical snapshot fields', async () => {
      const completionTime = new Date('2026-10-01T12:00:00Z');
      const certNumber = 'TSP-2026-CK7M9X2P';

      const [cert] = await db
        .insert(certificates)
        .values({
          certificateNumber: certNumber,
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: completionTime,
          finalScorePercentage: 92,
        })
        .returning();

      expect(cert).toBeDefined();
      expect(cert.id).toBeDefined();
      expect(cert.certificateNumber).toBe(certNumber);
      expect(cert.studentName).toBe(studentUser.name);
      expect(cert.courseTitle).toBe(testCourse.title);
      expect(cert.instructorName).toBe(instructorUser.name);
      expect(cert.finalScorePercentage).toBe(92);
      expect(cert.status).toBe('ACTIVE');
      expect(cert.issuedAt).toBeInstanceOf(Date);
      expect(cert.revokedAt).toBeNull();
      expect(cert.revocationReason).toBeNull();
    });

    it('4.2 should enforce UNIQUE(enrollment_id) constraint', async () => {
      await db.insert(certificates).values({
        certificateNumber: 'TSP-2026-CERT-001',
        enrollmentId: testEnrollment.id,
        courseId: testCourse.id,
        studentId: studentUser.id,
        studentName: studentUser.name,
        courseTitle: testCourse.title,
        instructorName: instructorUser.name,
        completedAt: new Date(),
      });

      // Issuing a second certificate for the same enrollment must fail
      await expect(
        db.insert(certificates).values({
          certificateNumber: 'TSP-2026-CERT-002',
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: new Date(),
        })
      ).rejects.toThrow();
    });

    it('4.3 should enforce UNIQUE(certificate_number) constraint', async () => {
      // Create second enrollment for a different course to test cert number uniqueness
      const [course2] = await db
        .select()
        .from(courses)
        .where(eq(courses.slug, 'ai-with-python-building-smart-applications'))
        .limit(1);

      const [enrollment2] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: course2.id,
          status: 'COMPLETED',
        })
        .returning();

      await db.insert(certificates).values({
        certificateNumber: 'TSP-2026-SHARED-NUM',
        enrollmentId: testEnrollment.id,
        courseId: testCourse.id,
        studentId: studentUser.id,
        studentName: studentUser.name,
        courseTitle: testCourse.title,
        instructorName: instructorUser.name,
        completedAt: new Date(),
      });

      // Inserting duplicate certificate number on another enrollment must fail
      await expect(
        db.insert(certificates).values({
          certificateNumber: 'TSP-2026-SHARED-NUM',
          enrollmentId: enrollment2.id,
          courseId: course2.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: course2.title,
          instructorName: instructorUser.name,
          completedAt: new Date(),
        })
      ).rejects.toThrow();
    });

    it('4.4 should verify certificate snapshot remains immutable when original course/user mutate', async () => {
      const originalCourseTitle = testCourse.title;
      const originalStudentName = studentUser.name;

      const [cert] = await db
        .insert(certificates)
        .values({
          certificateNumber: 'TSP-2026-IMMUTABLE-01',
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: originalStudentName,
          courseTitle: originalCourseTitle,
          instructorName: instructorUser.name,
          completedAt: new Date(),
          finalScorePercentage: 88,
        })
        .returning();

      // Mutate the original course title and student name in their primary tables
      await db
        .update(courses)
        .set({ title: 'BRAND NEW RENAMED COURSE TITLE' })
        .where(eq(courses.id, testCourse.id));

      await db
        .update(users)
        .set({ name: 'RENAMED STUDENT PERSON' })
        .where(eq(users.id, studentUser.id));

      // Reload certificate and verify historical snapshot values did not change
      const [reloadedCert] = await db
        .select()
        .from(certificates)
        .where(eq(certificates.id, cert.id));

      expect(reloadedCert.courseTitle).toBe(originalCourseTitle);
      expect(reloadedCert.studentName).toBe(originalStudentName);
      expect(reloadedCert.finalScorePercentage).toBe(88);
    });

    it('4.5 should support certificate revocation and reason', async () => {
      const [cert] = await db
        .insert(certificates)
        .values({
          certificateNumber: 'TSP-2026-REVOKE-TEST',
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: new Date(),
        })
        .returning();

      const revokeDate = new Date();
      const [revokedCert] = await db
        .update(certificates)
        .set({
          status: 'REVOKED',
          revokedAt: revokeDate,
          revocationReason: 'Academic integrity policy violation.',
        })
        .where(eq(certificates.id, cert.id))
        .returning();

      expect(revokedCert.status).toBe('REVOKED');
      expect(revokedCert.revokedAt).toBeInstanceOf(Date);
      expect(revokedCert.revocationReason).toBe('Academic integrity policy violation.');
    });
  });

  describe('5. Foreign Key Integrity & Deletion Protections', () => {
    let testQuiz: any;
    let testQuestion: any;

    beforeEach(async () => {
      const [q] = await db
        .insert(quizzes)
        .values({
          moduleId: testModule.id,
          title: 'Quiz for FK Tests',
          position: 1,
        })
        .returning();
      testQuiz = q;

      const [quest] = await db
        .insert(quizQuestions)
        .values({
          quizId: testQuiz.id,
          questionText: 'Test Question',
          position: 1,
        })
        .returning();
      testQuestion = quest;

      await db.insert(quizQuestionOptions).values({
        questionId: testQuestion.id,
        optionText: 'Test Option',
        position: 1,
      });
    });

    it('5.1 should cascade delete from quizzes to quiz_questions and options', async () => {
      // Questions and options exist
      const qBefore = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, testQuiz.id));
      expect(qBefore.length).toBe(1);

      // Delete quiz
      await db.delete(quizzes).where(eq(quizzes.id, testQuiz.id));

      // Questions and options must be cascade deleted
      const qAfter = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, testQuiz.id));
      expect(qAfter.length).toBe(0);

      const optAfter = await db
        .select()
        .from(quizQuestionOptions)
        .where(eq(quizQuestionOptions.questionId, testQuestion.id));
      expect(optAfter.length).toBe(0);
    });

    it('5.2 should restrict deleting a quiz that has student attempts (ON DELETE RESTRICT)', async () => {
      // Create student attempt
      await db.insert(quizAttempts).values({
        quizId: testQuiz.id,
        enrollmentId: testEnrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
      });

      // Attempting to delete the quiz must fail due to ON DELETE RESTRICT on quiz_attempts
      await expect(
        db.delete(quizzes).where(eq(quizzes.id, testQuiz.id))
      ).rejects.toThrow();
    });

    it('5.3 should restrict deleting student user when attempts exist (ON DELETE RESTRICT)', async () => {
      await db.insert(quizAttempts).values({
        quizId: testQuiz.id,
        enrollmentId: testEnrollment.id,
        studentId: studentUser.id,
        attemptNumber: 1,
      });

      await expect(
        db.delete(users).where(eq(users.id, studentUser.id))
      ).rejects.toThrow();
    });

    it('5.4 should restrict deleting course or enrollment when certificates exist (ON DELETE RESTRICT)', async () => {
      await db.insert(certificates).values({
        certificateNumber: 'TSP-2026-RESTRICT-DEL',
        enrollmentId: testEnrollment.id,
        courseId: testCourse.id,
        studentId: studentUser.id,
        studentName: studentUser.name,
        courseTitle: testCourse.title,
        instructorName: instructorUser.name,
        completedAt: new Date(),
      });

      // Deleting course must be blocked
      await expect(
        db.delete(courses).where(eq(courses.id, testCourse.id))
      ).rejects.toThrow();

      // Deleting enrollment must be blocked
      await expect(
        db.delete(enrollments).where(eq(enrollments.id, testEnrollment.id))
      ).rejects.toThrow();
    });

    it('5.5 should set null on pdf_media_id when referenced media record is deleted', async () => {
      // Insert test media item
      const [certPdfMedia] = await db
        .insert(media)
        .values({
          storageProvider: 'CLOUDINARY',
          storageKey: 'certificates/TSP-TEST.pdf',
          publicUrl: 'https://res.cloudinary.com/test/raw/upload/certificates/TSP-TEST.pdf',
          originalFilename: 'TSP-TEST.pdf',
          mimeType: 'application/pdf',
          fileSize: 45000,
        })
        .returning();

      const [cert] = await db
        .insert(certificates)
        .values({
          certificateNumber: 'TSP-2026-MEDIA-FK',
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: new Date(),
          pdfMediaId: certPdfMedia.id,
          pdfUrl: certPdfMedia.publicUrl,
        })
        .returning();

      expect(cert.pdfMediaId).toBe(certPdfMedia.id);

      // Delete media record
      await db.delete(media).where(eq(media.id, certPdfMedia.id));

      // Reload certificate - pdfMediaId should be set to null, certificate itself preserved
      const [reloadedCert] = await db
        .select()
        .from(certificates)
        .where(eq(certificates.id, cert.id));

      expect(reloadedCert.pdfMediaId).toBeNull();
      expect(reloadedCert.certificateNumber).toBe('TSP-2026-MEDIA-FK');
    });

    it('5.6 should cascade delete attempts when enrollment is purged', async () => {
      const [attempt] = await db
        .insert(quizAttempts)
        .values({
          quizId: testQuiz.id,
          enrollmentId: testEnrollment.id,
          studentId: studentUser.id,
          attemptNumber: 1,
        })
        .returning();

      await db.insert(quizAttemptAnswers).values({
        attemptId: attempt.id,
        questionId: testQuestion.id,
        selectedOptionIds: ['some-opt-id'],
      });

      // Delete enrollment
      await db.delete(enrollments).where(eq(enrollments.id, testEnrollment.id));

      // Attempts and answers must be gone
      const attemptsAfter = await db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.id, attempt.id));
      expect(attemptsAfter.length).toBe(0);

      const answersAfter = await db
        .select()
        .from(quizAttemptAnswers)
        .where(eq(quizAttemptAnswers.attemptId, attempt.id));
      expect(answersAfter.length).toBe(0);
    });
  });

  describe('6. P4 Seed Fixtures Verification', () => {
    it('6.1 should seed quizzes, questions, and options idempotently', async () => {
      const seedResult = await seedQuizzes(db);

      expect(seedResult.quizzesSeeded).toBeGreaterThanOrEqual(2);
      expect(seedResult.questionsSeeded).toBeGreaterThanOrEqual(6);
      expect(seedResult.optionsSeeded).toBeGreaterThanOrEqual(18);

      // Verify Knowledge Check quiz was seeded
      const [kcQuiz] = await db
        .select()
        .from(quizzes)
        .where(eq(quizzes.quizType, 'KNOWLEDGE_CHECK'))
        .limit(1);

      expect(kcQuiz).toBeDefined();
      expect(kcQuiz.title).toContain('Knowledge Check');
      expect(kcQuiz.status).toBe('PUBLISHED');

      // Verify Final Exam quiz was seeded
      const [feQuiz] = await db
        .select()
        .from(quizzes)
        .where(eq(quizzes.quizType, 'FINAL_EXAM'))
        .limit(1);

      expect(feQuiz).toBeDefined();
      expect(feQuiz.title).toContain('Final Examination');
      expect(feQuiz.status).toBe('PUBLISHED');

      // Verify questions for Knowledge Check quiz include all three types
      const kcQuestions = await db
        .select()
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, kcQuiz.id));

      const types = kcQuestions.map((q: any) => q.questionType);
      expect(types).toContain('SINGLE_CHOICE');
      expect(types).toContain('MULTIPLE_CHOICE');
      expect(types).toContain('TRUE_FALSE');

      // Idempotency check: running seed again should insert 0 new items
      const secondSeed = await seedQuizzes(db);
      expect(secondSeed.quizzesSeeded).toBe(0);
      expect(secondSeed.questionsSeeded).toBe(0);
      expect(secondSeed.optionsSeeded).toBe(0);
    });
  });
});
