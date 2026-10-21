import { describe, it, expect, beforeEach } from 'vitest';
import { TutorRetrievalService } from '../modules/learning/tutor-retrieval.service';
import { createTestDatabase } from './test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../database/schema';
import * as crypto from 'crypto';

describe('Phase 7.2: AI Tutoring & Contextual Retrieval Engine (WP-P7-04)', () => {
  let db: any;
  let service: TutorRetrievalService;

  let instructorId: string;
  let studentId: string;
  let otherStudentId: string;

  let courseAId: string;
  let courseBId: string;

  let moduleAId: string;
  let moduleBId: string;

  let lessonA1Id: string;
  let lessonA2Id: string;
  let lessonB1Id: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    service = new TutorRetrievalService(db);

    instructorId = crypto.randomUUID();
    studentId = crypto.randomUUID();
    otherStudentId = crypto.randomUUID();

    // Create users
    await db.insert(users).values([
      {
        id: instructorId,
        username: 'instructor_p72',
        email: 'instructor.p72@techsprout.edu',
        passwordHash: 'hash',
        name: 'P7.2 Instructor',
        role: 'instructor',
      },
      {
        id: studentId,
        username: 'student_p72',
        email: 'student.p72@techsprout.edu',
        passwordHash: 'hash',
        name: 'P7.2 Enrolled Student',
        role: 'student',
      },
      {
        id: otherStudentId,
        username: 'other_p72',
        email: 'other.p72@techsprout.edu',
        passwordHash: 'hash',
        name: 'P7.2 Unenrolled Student',
        role: 'student',
      },
    ]);

    const categoryId = crypto.randomUUID();
    await db.insert(categories).values({
      id: categoryId,
      name: 'Software Engineering',
      slug: 'software-engineering',
    });

    courseAId = crypto.randomUUID();
    courseBId = crypto.randomUUID();

    // Create Course A (Full-Stack CI/CD and Node.js)
    await db.insert(courses).values([
      {
        id: courseAId,
        categoryId,
        title: 'Full-Stack CI/CD and Node.js Microservices',
        slug: 'fullstack-cicd-nodejs',
        description: 'Comprehensive course on Node.js pipelines, Docker, and CI/CD automation.',
        instructorId,
        price: '5000',
        status: 'PUBLISHED',
      },
      {
        id: courseBId,
        categoryId,
        title: 'Unrelated Organic Gardening 101',
        slug: 'organic-gardening-101',
        description: 'Planting seeds and composting fundamentals.',
        instructorId,
        price: '2000',
        status: 'PUBLISHED',
      },
    ]);

    moduleAId = crypto.randomUUID();
    moduleBId = crypto.randomUUID();

    await db.insert(modules).values([
      {
        id: moduleAId,
        courseId: courseAId,
        title: 'Deployment & Continuous Integration',
        position: 1,
      },
      {
        id: moduleBId,
        courseId: courseBId,
        title: 'Composting Basics',
        position: 1,
      },
    ]);

    lessonA1Id = crypto.randomUUID();
    lessonA2Id = crypto.randomUUID();
    lessonB1Id = crypto.randomUUID();

    await db.insert(lessons).values([
      {
        id: lessonA1Id,
        moduleId: moduleAId,
        title: 'Automated CI/CD Pipelines with GitHub Actions',
        description: 'Learn how to configure automated ci/cd workflows for node.js applications.',
        content:
          'Continuous integration and deployment (ci/cd) automates testing and container builds. Using GitHub Actions, every git push triggers test runners and builds a production Docker image.',
        position: 1,
        durationSeconds: 600,
        isPreview: false,
      },
      {
        id: lessonA2Id,
        moduleId: moduleAId,
        title: 'Secure JWT Authentication in Node.js and NestJS',
        description: 'Implementing stateless JWT access tokens and http-only cookies.',
        content:
          'JWT authentication provides stateless session verification. We store refresh tokens in secure http-only cookies to mitigate XSS vulnerabilities.',
        position: 2,
        durationSeconds: 900,
        isPreview: false,
      },
      {
        id: lessonB1Id,
        moduleId: moduleBId,
        title: 'Soil Microorganisms and Composting Workflows',
        description: 'Understanding organic decomposition and soil fertility.',
        content:
          'Soil bacteria require balanced nitrogen and carbon ratios. Decomposing organic matter generates high internal temperatures.',
        position: 1,
        durationSeconds: 500,
        isPreview: false,
      },
    ]);

    // Enroll studentId in Course A
    await db.insert(enrollments).values({
      id: crypto.randomUUID(),
      studentId,
      courseId: courseAId,
      status: 'ACTIVE',
    });
  });

  describe('1. Technical Token Normalization (Config C)', () => {
    it('1.1 should extract compound punctuated technical tokens and sub-tokens', () => {
      const tokens = service.tokenize('Configuring CI/CD in Node.js with HTTP-only cookies');
      expect(tokens).toContain('ci/cd');
      expect(tokens).toContain('ci');
      expect(tokens).toContain('cd');
      expect(tokens).toContain('node.js');
      expect(tokens).toContain('node');
      expect(tokens).toContain('js');
      expect(tokens).toContain('http-only');
      expect(tokens).toContain('http');
      expect(tokens).toContain('cookies');
    });

    it('1.2 should handle empty or null text safely', () => {
      expect(service.tokenize('')).toEqual([]);
      expect(service.tokenize(null as any)).toEqual([]);
    });
  });

  describe('2. Semantic Chunking & Metadata Context', () => {
    it('2.1 should generate context chunks with lesson and module identifiers', () => {
      const chunks = service.chunkLesson(courseAId, {
        id: lessonA1Id,
        title: 'Automated CI/CD Pipelines',
        description: 'Brief overview',
        content: 'Detailed lesson text explaining workflow dispatch.',
        moduleId: moduleAId,
        moduleTitle: 'Deployment & CI',
      });

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].courseId).toBe(courseAId);
      expect(chunks[0].lessonId).toBe(lessonA1Id);
      expect(chunks[0].moduleTitle).toBe('Deployment & CI');
      expect(chunks[0].tokens).toContain('ci/cd');
    });
  });

  describe('3. Course Boundary & Anti-Leakage Discipline', () => {
    it('3.1 should retrieve relevant citations strictly within the target course', async () => {
      const result = await service.retrieveContext(
        courseAId,
        'How does the CI/CD pipeline automate testing?',
        5,
        { id: studentId, role: 'student' }
      );

      expect(result.isGrounded).toBe(true);
      expect(result.citations.length).toBeGreaterThanOrEqual(1);
      expect(result.citations[0].lessonId).toBe(lessonA1Id);
      expect(result.citations[0].lessonTitle).toContain('CI/CD');
      expect(result.citations[0].relevanceScore).toBeGreaterThan(0.2);

      // Verify ZERO lessons from Course B are leaked
      const courseBLessonIds = result.citations.filter((c) => c.lessonId === lessonB1Id);
      expect(courseBLessonIds).toHaveLength(0);
    });

    it('3.2 should match technical terms like JWT and http-only cookies', async () => {
      const result = await service.retrieveContext(
        courseAId,
        'Where should JWT tokens and http-only cookies be stored?',
        5,
        { id: studentId, role: 'student' }
      );

      expect(result.isGrounded).toBe(true);
      expect(result.citations[0].lessonId).toBe(lessonA2Id);
      expect(result.citations[0].chunkSnippet).toContain('JWT');
    });
  });

  describe('4. Enrollment Verification & Access Control', () => {
    it('4.1 should reject unenrolled student with 403 Forbidden', async () => {
      await expect(
        service.retrieveContext(
          courseAId,
          'How does CI/CD work?',
          5,
          { id: otherStudentId, role: 'student' }
        )
      ).rejects.toThrowError(/not possess an active enrollment/i);
    });

    it('4.2 should permit course owner instructor access without explicit enrollment', async () => {
      const result = await service.retrieveContext(
        courseAId,
        'How does CI/CD work?',
        5,
        { id: instructorId, role: 'instructor' }
      );
      expect(result.isGrounded).toBe(true);
    });

    it('4.3 should permit admin access without explicit enrollment', async () => {
      const adminId = crypto.randomUUID();
      const result = await service.retrieveContext(
        courseAId,
        'How does CI/CD work?',
        5,
        { id: adminId, role: 'admin' }
      );
      expect(result.isGrounded).toBe(true);
    });
  });

  describe('5. Grounding Threshold & Polite Refusal', () => {
    it('5.1 should mark ungrounded with polite notice when concept is not in curriculum', async () => {
      const result = await service.retrieveContext(
        courseAId,
        'How do I prune bonsai trees in winter with shears?',
        5,
        { id: studentId, role: 'student' }
      );

      expect(result.isGrounded).toBe(false);
      expect(result.citations).toHaveLength(0);
      expect(result.groundingNotice).toBe('This concept is not covered in this course curriculum');
    });
  });
});
