import { describe, it, expect, beforeEach } from 'vitest';
import { TutorRateLimiterService } from '../modules/learning/tutor-rate-limiter.service';
import { TutorLlmService } from '../modules/learning/tutor-llm.service';
import { TutorRetrievalService } from '../modules/learning/tutor-retrieval.service';
import { LearningController } from '../modules/learning/learning.controller';
import { createTestDatabase } from './test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../database/schema';
import { ApiException } from '../common/errors/api-error';
import * as crypto from 'crypto';

describe('Phase 7.2 / WP-P7-04 Part 2: Streaming AI Tutor Chat & Rate Limiting', () => {
  let db: any;
  let retrievalService: TutorRetrievalService;
  let rateLimiterService: TutorRateLimiterService;
  let llmService: TutorLlmService;
  let controller: LearningController;

  let instructorId: string;
  let studentId: string;
  let unenrolledStudentId: string;
  let courseAId: string;
  let courseBId: string;
  let moduleAId: string;
  let lessonA1Id: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;

    retrievalService = new TutorRetrievalService(db);
    rateLimiterService = new TutorRateLimiterService();
    llmService = new TutorLlmService();

    // Create a mock LearningService stub for the controller
    const mockLearningService = {} as any;

    controller = new LearningController(
      mockLearningService,
      retrievalService,
      rateLimiterService,
      llmService
    );

    instructorId = crypto.randomUUID();
    studentId = crypto.randomUUID();
    unenrolledStudentId = crypto.randomUUID();

    // Seed users
    await db.insert(users).values([
      {
        id: instructorId,
        username: 'instructor_chat',
        email: 'instructor.chat@techsprout.edu',
        passwordHash: 'hash',
        name: 'Chat Instructor',
        role: 'instructor',
      },
      {
        id: studentId,
        username: 'student_chat',
        email: 'student.chat@techsprout.edu',
        passwordHash: 'hash',
        name: 'Enrolled Student',
        role: 'student',
      },
      {
        id: unenrolledStudentId,
        username: 'unenrolled_chat',
        email: 'unenrolled.chat@techsprout.edu',
        passwordHash: 'hash',
        name: 'Unenrolled Student',
        role: 'student',
      },
    ]);

    const categoryId = crypto.randomUUID();
    await db.insert(categories).values({
      id: categoryId,
      name: 'Cloud Computing',
      slug: 'cloud-computing',
    });

    courseAId = crypto.randomUUID();
    courseBId = crypto.randomUUID();

    await db.insert(courses).values([
      {
        id: courseAId,
        categoryId,
        title: 'Kubernetes Container Orchestration',
        slug: 'kubernetes-container-orchestration',
        description: 'Complete guide to Kubernetes pods, services, and deployments.',
        instructorId,
        price: '6000',
        status: 'PUBLISHED',
      },
      {
        id: courseBId,
        categoryId,
        title: 'Baking Artisan Sourdough Bread',
        slug: 'baking-artisan-sourdough',
        description: 'Fermentation and bread making.',
        instructorId,
        price: '3000',
        status: 'PUBLISHED',
      },
    ]);

    moduleAId = crypto.randomUUID();
    await db.insert(modules).values({
      id: moduleAId,
      courseId: courseAId,
      title: 'Cluster Architecture',
      position: 1,
    });

    lessonA1Id = crypto.randomUUID();
    await db.insert(lessons).values({
      id: lessonA1Id,
      moduleId: moduleAId,
      title: 'Kubernetes Pods and ReplicaSets',
      description: 'Understanding pod lifecycle and replica management.',
      content:
        'A Kubernetes pod is the smallest deployable computing unit. ReplicaSets ensure that a specified number of pod replicas are running at any given time for high availability.',
      position: 1,
      durationSeconds: 720,
      isPreview: false,
    });

    // Enroll studentId in Course A
    await db.insert(enrollments).values({
      id: crypto.randomUUID(),
      studentId,
      courseId: courseAId,
      status: 'ACTIVE',
    });
  });

  describe('1. Rate Limiting & Cost Controls (20 queries/day)', () => {
    it('1.1 should allow queries up to the daily limit of 20', async () => {
      const testUser = crypto.randomUUID();
      for (let i = 1; i <= 20; i++) {
        const result = await rateLimiterService.checkAndIncrement(testUser);
        expect(result.allowed).toBe(true);
        expect(result.currentCount).toBe(i);
        expect(result.limit).toBe(20);
      }
    });

    it('1.2 should block the 21st query and return retryAfterSeconds', async () => {
      const testUser = crypto.randomUUID();
      for (let i = 1; i <= 20; i++) {
        await rateLimiterService.checkAndIncrement(testUser);
      }

      const blockedResult = await rateLimiterService.checkAndIncrement(testUser);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.currentCount).toBe(21);
      expect(blockedResult.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('1.3 should handle concurrent requests safely without exceeding ceiling', async () => {
      const testUser = crypto.randomUUID();
      const promises = Array.from({ length: 25 }, () =>
        rateLimiterService.checkAndIncrement(testUser)
      );

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed).length;

      expect(allowedCount).toBe(20);
      expect(blockedCount).toBe(5);
    });
  });

  describe('2. LLM Streaming Service & Provider Abstraction', () => {
    it('2.1 should progressively yield tokens grounded in provided citations', async () => {
      const citations = [
        {
          lessonId: lessonA1Id,
          lessonTitle: 'Kubernetes Pods and ReplicaSets',
          moduleId: moduleAId,
          moduleTitle: 'Cluster Architecture',
          chunkSnippet:
            'A Kubernetes pod is the smallest deployable computing unit. ReplicaSets ensure replicas are running.',
          relevanceScore: 0.95,
        },
      ];

      const tokens: string[] = [];
      for await (const token of llmService.generateAnswerStream(
        'What is a pod?',
        citations
      )) {
        tokens.push(token);
      }

      const fullAnswer = tokens.join('');
      expect(fullAnswer).toContain('Kubernetes Pods and ReplicaSets');
      expect(fullAnswer).toContain('deployable computing unit');
      expect(tokens.length).toBeGreaterThan(5);
    });

    it('2.2 should handle client cancellation via AbortSignal cleanly', async () => {
      const citations = [
        {
          lessonId: lessonA1Id,
          lessonTitle: 'Kubernetes Pods',
          chunkSnippet: 'Pod description text',
          relevanceScore: 0.8,
        },
      ];

      const controller = new AbortController();
      controller.abort(); // Pre-aborted

      const tokens: string[] = [];
      for await (const token of llmService.generateAnswerStream(
        'What is a pod?',
        citations,
        controller.signal
      )) {
        tokens.push(token);
      }

      // Pre-aborted stream should yield nothing or terminate immediately
      expect(tokens.length).toBe(0);
    });

    it('2.3 should yield a clear refusal message if citations are empty', async () => {
      const tokens: string[] = [];
      for await (const token of llmService.generateAnswerStream('Some query', [])) {
        tokens.push(token);
      }

      const fullAnswer = tokens.join('');
      expect(fullAnswer).toContain('not covered in the curriculum of this course');
    });
  });

  describe('3. Streaming Endpoint Controller (POST :courseId/tutor/chat)', () => {
    function createMockResponse() {
      const headers: Record<string, string> = {};
      const writtenChunks: string[] = [];
      let isEnded = false;

      return {
        headers,
        writtenChunks,
        isEnded: () => isEnded,
        setHeader: (key: string, value: string) => {
          headers[key.toLowerCase()] = value;
        },
        write: (chunk: string) => {
          writtenChunks.push(chunk);
        },
        end: () => {
          isEnded = true;
        },
        flushHeaders: () => {},
      } as any;
    }

    function createMockRequest(user: any, closeHandler?: () => void) {
      return {
        user,
        on: (event: string, handler: () => void) => {
          if (event === 'close' && closeHandler) {
            // registered
          }
        },
      } as any;
    }

    it('3.1 should reject unenrolled student with 403 Forbidden before streaming', async () => {
      const mockReq = createMockRequest({ id: unenrolledStudentId, role: 'student' });
      const mockRes = createMockResponse();

      await expect(
        controller.streamTutorChat(
          courseAId,
          { question: 'What is a ReplicaSet in Kubernetes?' },
          mockReq,
          mockRes
        )
      ).rejects.toThrowError(/not possess an active enrollment/i);

      expect(mockRes.writtenChunks).toHaveLength(0);
    });

    it('3.2 should stream SSE citations, tokens, and done events for enrolled student', async () => {
      const mockReq = createMockRequest({ id: studentId, role: 'student' });
      const mockRes = createMockResponse();

      await controller.streamTutorChat(
        courseAId,
        { question: 'What is a ReplicaSet in Kubernetes?' },
        mockReq,
        mockRes
      );

      expect(mockRes.headers['content-type']).toContain('text/event-stream');
      expect(mockRes.headers['cache-control']).toContain('no-cache');

      const allOutput = mockRes.writtenChunks.join('');
      expect(allOutput).toContain('event: citations');
      expect(allOutput).toContain('Kubernetes Pods and ReplicaSets');
      expect(allOutput).toContain('event: token');
      expect(allOutput).toContain('event: done');
      expect(allOutput).toContain('"isGrounded":true');
      expect(mockRes.isEnded()).toBe(true);
    });

    it('3.3 should stream polite refusal token and ungrounded done event when concept is not in curriculum', async () => {
      const mockReq = createMockRequest({ id: studentId, role: 'student' });
      const mockRes = createMockResponse();

      await controller.streamTutorChat(
        courseAId,
        { question: 'How do I prune winter apple trees with pruning shears?' },
        mockReq,
        mockRes
      );

      const allOutput = mockRes.writtenChunks.join('');
      expect(allOutput).toContain('event: citations');
      expect(allOutput).toContain('event: token');
      expect(allOutput).toContain('This concept is not covered in this course curriculum');
      expect(allOutput).toContain('event: done');
      expect(allOutput).toContain('"isGrounded":false');
      expect(mockRes.isEnded()).toBe(true);
    });

    it('3.4 should reject request when daily student rate limit is reached', async () => {
      // Consume all 20 queries for studentId
      for (let i = 0; i < 20; i++) {
        await rateLimiterService.checkAndIncrement(studentId);
      }

      const mockReq = createMockRequest({ id: studentId, role: 'student' });
      const mockRes = createMockResponse();

      await expect(
        controller.streamTutorChat(
          courseAId,
          { question: 'What is a Kubernetes Pod?' },
          mockReq,
          mockRes
        )
      ).rejects.toThrowError(/Daily AI tutor query limit reached/i);
    });
  });
});
