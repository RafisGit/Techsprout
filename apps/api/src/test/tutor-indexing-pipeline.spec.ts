import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TutorIndexingService } from '../modules/learning/tutor-indexing.service';
import { TutorEmbeddingService } from '../modules/learning/tutor-embedding.service';
import { TutorIndexingQueueService } from '../modules/learning/tutor-indexing-queue.service';
import { TutorRetrievalService } from '../modules/learning/tutor-retrieval.service';
import { AuditService } from '../modules/audit/audit.service';
import { createTestDatabase } from './test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../database/schema';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

describe('Phase 7.2 / WP-P7-05: Automated Chunk Indexing & Embedding Refresh Pipeline', () => {
  let db: any;
  let embeddingService: TutorEmbeddingService;
  let indexingService: TutorIndexingService;
  let auditService: AuditService;
  let queueService: TutorIndexingQueueService;
  let retrievalService: TutorRetrievalService;

  let mockInstructorId: string;
  let mockStudentId: string;
  let mockCategoryId: string;

  let courseAId: string;
  let moduleAId: string;
  let lessonA1Id: string;
  let lessonA2Id: string;

  let courseBId: string;
  let moduleBId: string;
  let lessonB1Id: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    embeddingService = new TutorEmbeddingService();
    indexingService = new TutorIndexingService(db, embeddingService);
    auditService = { record: vi.fn().mockResolvedValue(undefined) } as any;
    queueService = new TutorIndexingQueueService(indexingService, auditService);
    retrievalService = new TutorRetrievalService(db, indexingService, embeddingService);

    mockInstructorId = crypto.randomUUID();
    mockStudentId = crypto.randomUUID();
    mockCategoryId = crypto.randomUUID();

    // 1. Seed category and users
    await db.insert(categories).values({
      id: mockCategoryId,
      name: 'Web Development',
      slug: 'web-development',
    });

    await db.insert(users).values([
      {
        id: mockInstructorId,
        name: 'Instructor Indexer',
        username: 'inst_idx',
        email: 'instructor@techsprout.io',
        passwordHash: 'hashed',
        role: 'instructor',
      },
      {
        id: mockStudentId,
        name: 'Student Indexer',
        username: 'stud_idx',
        email: 'student@techsprout.io',
        passwordHash: 'hashed',
        role: 'student',
      },
    ]);

    // 2. Course A (Published)
    courseAId = crypto.randomUUID();
    await db.insert(courses).values({
      id: courseAId,
      categoryId: mockCategoryId,
      instructorId: mockInstructorId,
      title: 'Modern Next.js Architecture',
      slug: 'nextjs-arch',
      description: 'Full-stack Next.js course',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      price: '2000.00',
    });

    moduleAId = crypto.randomUUID();
    await db.insert(modules).values({
      id: moduleAId,
      courseId: courseAId,
      title: 'Deployment & CI/CD',
      position: 1,
    });

    lessonA1Id = crypto.randomUUID();
    lessonA2Id = crypto.randomUUID();
    await db.insert(lessons).values([
      {
        id: lessonA1Id,
        moduleId: moduleAId,
        title: 'Setting up GitHub Actions CI/CD',
        description: 'Automating tests with node.js and docker.',
        content: 'Comprehensive CI/CD setup with GitHub actions for next.js container deployment.',
        position: 1,
        durationSeconds: 600,
      },
      {
        id: lessonA2Id,
        moduleId: moduleAId,
        title: 'State Management with React Query',
        description: 'Handling server state.',
        content: 'React Query provides caching, deduping, and background updates.',
        position: 2,
        durationSeconds: 720,
      },
    ]);

    // 3. Course B (Draft / Unpublished)
    courseBId = crypto.randomUUID();
    await db.insert(courses).values({
      id: courseBId,
      categoryId: mockCategoryId,
      instructorId: mockInstructorId,
      title: 'Unreleased Go Backend',
      slug: 'go-backend',
      description: 'Draft Go course',
      status: 'DRAFT',
      visibility: 'PUBLIC',
      price: '1500.00',
    });

    moduleBId = crypto.randomUUID();
    await db.insert(modules).values({
      id: moduleBId,
      courseId: courseBId,
      title: 'Go Concurrency',
      position: 1,
    });

    lessonB1Id = crypto.randomUUID();
    await db.insert(lessons).values({
      id: lessonB1Id,
      moduleId: moduleBId,
      title: 'Goroutines and Channels',
      description: 'Concurrency fundamentals.',
      content: 'Understanding CSP model in Go.',
      position: 1,
      durationSeconds: 500,
    });

    // 4. Student enrollment in Course A
    await db.insert(enrollments).values({
      id: crypto.randomUUID(),
      studentId: mockStudentId,
      courseId: courseAId,
      status: 'ACTIVE',
    });
  });

  afterEach(async () => {
    indexingService.clearAll();
    await queueService.onModuleDestroy();
    await indexingService.onModuleDestroy();
  });

  // ============================================================================
  // 1. DETERMINISTIC CHUNK GENERATION & STABLE IDENTIFIERS
  // ============================================================================
  describe('1. Deterministic Chunk Generation & Metadata', () => {
    it('1.1 should generate stable chunk IDs and reproducible SHA-256 content hashes', async () => {
      const chunksFirstRun = await indexingService.generateLessonChunks(courseAId, {
        id: lessonA1Id,
        title: 'Setting up GitHub Actions CI/CD',
        description: 'Automating tests with node.js and docker.',
        content: 'Comprehensive CI/CD setup with GitHub actions.',
        moduleId: moduleAId,
        moduleTitle: 'Deployment & CI/CD',
      });

      const chunksSecondRun = await indexingService.generateLessonChunks(courseAId, {
        id: lessonA1Id,
        title: 'Setting up GitHub Actions CI/CD',
        description: 'Automating tests with node.js and docker.',
        content: 'Comprehensive CI/CD setup with GitHub actions.',
        moduleId: moduleAId,
        moduleTitle: 'Deployment & CI/CD',
      });

      expect(chunksFirstRun.length).toBeGreaterThanOrEqual(1);
      expect(chunksFirstRun[0].id).toBe(`${courseAId}:${moduleAId}:${lessonA1Id}:0`);
      expect(chunksFirstRun[0].contentHash).toBe(chunksSecondRun[0].contentHash);
      expect(chunksFirstRun[0].tokens).toContain('ci/cd');
      expect(chunksFirstRun[0].tokens).toContain('node.js');
    });

    it('1.2 should generate 768-dimensional normalized mock vector embeddings', async () => {
      const text = 'Next.js App Router and Server Components architecture';
      const embedding = await embeddingService.generateEmbedding(text);

      expect(embedding).toHaveLength(768);

      // Verify L2 normalization: sum of squares ≈ 1.0
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 3);
    });

    it('1.3 should compute cosine similarity properly between related and unrelated texts', async () => {
      const vecReact1 = await embeddingService.generateEmbedding('React state hooks and component lifecycle');
      const vecReact2 = await embeddingService.generateEmbedding('Managing state in React functional components');
      const vecUnrelated = await embeddingService.generateEmbedding('Cooking pasta in boiling water');

      const simSimilar = embeddingService.cosineSimilarity(vecReact1, vecReact2);
      const simUnrelated = embeddingService.cosineSimilarity(vecReact1, vecUnrelated);

      expect(simSimilar).toBeGreaterThan(simUnrelated);
      expect(simSimilar).toBeGreaterThan(0.60);
    });
  });

  // ============================================================================
  // 2. AUTOMATIC INDEXING JOBS & PUBLISHING LIFECYCLE
  // ============================================================================
  describe('2. Automatic Indexing & Course Publishing Lifecycle', () => {
    it('2.1 should index all published course lessons when course is published', async () => {
      const result = await queueService.processJob({
        courseId: courseAId,
        trigger: 'COURSE_PUBLISHED',
        timestamp: new Date().toISOString(),
      });

      expect(result.trigger).toBe('COURSE_PUBLISHED');
      expect(result.totalActiveChunks).toBe(2);
      expect(result.chunksCreated).toBe(2);

      const cachedChunks = await indexingService.getCourseChunks(courseAId);
      expect(cachedChunks).toHaveLength(2);
      expect(cachedChunks.map((c) => c.lessonId)).toContain(lessonA1Id);
      expect(cachedChunks.map((c) => c.lessonId)).toContain(lessonA2Id);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COURSE_CHUNKS_INDEXED',
          targetId: courseAId,
        })
      );
    });

    it('2.2 should purge chunks when a course is unpublished or archived', async () => {
      // First index course A
      await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');
      expect((await indexingService.getCourseChunks(courseAId)).length).toBe(2);

      // Unpublish course A
      const purgeResult = await queueService.processJob({
        courseId: courseAId,
        trigger: 'COURSE_UNPUBLISHED',
        timestamp: new Date().toISOString(),
      });

      expect(purgeResult.totalActiveChunks).toBe(0);
      const remainingChunks = await indexingService.getCourseChunks(courseAId);
      expect(remainingChunks).toHaveLength(0);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COURSE_INDEX_PURGED',
          targetId: courseAId,
        })
      );
    });

    it('2.3 should refuse to index unpublished draft courses', async () => {
      const result = await indexingService.indexCourse(courseBId, 'COURSE_PUBLISHED');
      expect(result.totalActiveChunks).toBe(0);

      const bChunks = await indexingService.getCourseChunks(courseBId);
      expect(bChunks).toHaveLength(0);
    });
  });

  // ============================================================================
  // 3. IDEMPOTENT PROCESSING & DIFFERENTIAL REFRESH
  // ============================================================================
  describe('3. Idempotent Processing & Differential Refresh', () => {
    it('3.1 should execute multiple indexing runs idempotently without creating duplicates', async () => {
      const run1 = await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');
      expect(run1.chunksCreated).toBe(2);
      expect(run1.chunksUpdated).toBe(0);
      expect(run1.chunksDeleted).toBe(0);

      // Re-run identical indexing
      const run2 = await indexingService.indexCourse(courseAId, 'MANUAL_REFRESH');
      expect(run2.chunksCreated).toBe(0);
      expect(run2.chunksUpdated).toBe(0);
      expect(run2.chunksDeleted).toBe(0);
      expect(run2.totalActiveChunks).toBe(2);

      const chunks = await indexingService.getCourseChunks(courseAId);
      expect(chunks).toHaveLength(2);
    });

    it('3.2 should perform differential re-indexing when single lesson content changes', async () => {
      await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');

      // Update lesson A1 content in DB
      await db
        .update(lessons)
        .set({
          content: 'Brand new expanded content about Docker compose, Kubernetes pods, and CI/CD automation pipelines.',
        })
        .where(eq(lessons.id, lessonA1Id));

      const refreshResult = await queueService.processJob({
        courseId: courseAId,
        lessonId: lessonA1Id,
        trigger: 'LESSON_UPDATED',
        timestamp: new Date().toISOString(),
      });

      expect(refreshResult.totalActiveChunks).toBe(2);

      const updatedChunks = await indexingService.getCourseChunks(courseAId);
      const chunkA1 = updatedChunks.find((c) => c.lessonId === lessonA1Id);
      expect(chunkA1?.content).toContain('Docker compose');
    });

    it('3.3 should remove orphaned chunks when a lesson is deleted from curriculum', async () => {
      await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');
      expect((await indexingService.getCourseChunks(courseAId)).length).toBe(2);

      // Delete lesson A2 from database
      await db.delete(lessons).where(eq(lessons.id, lessonA2Id));

      const res = await queueService.processJob({
        courseId: courseAId,
        lessonId: lessonA2Id,
        trigger: 'LESSON_UPDATED',
        timestamp: new Date().toISOString(),
      });

      expect(res.totalActiveChunks).toBe(1);

      const remainingChunks = await indexingService.getCourseChunks(courseAId);
      expect(remainingChunks).toHaveLength(1);
      expect(remainingChunks[0].lessonId).toBe(lessonA1Id);
    });
  });

  // ============================================================================
  // 4. RETRIEVAL INTEGRATION & BOUNDARY ISOLATION
  // ============================================================================
  describe('4. Retrieval Integration & Boundary Isolation', () => {
    it('4.1 should retrieve grounded citations using pre-indexed chunks with sub-millisecond scoring', async () => {
      await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');

      const start = performance.now();
      const result = await retrievalService.retrieveContext(
        courseAId,
        'How do I configure CI/CD pipelines with GitHub Actions?',
        3,
        { id: mockStudentId, role: 'student' }
      );
      const durationMs = performance.now() - start;

      expect(result.isGrounded).toBe(true);
      expect(result.citations.length).toBeGreaterThanOrEqual(1);
      expect(result.citations[0].lessonTitle).toContain('GitHub Actions');
      // Sub-50ms latency gate check
      expect(durationMs).toBeLessThan(50);
    });

    it('4.2 should prevent cross-course citation leakage', async () => {
      await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');

      // Attempt to retrieve using courseBId
      const result = await retrievalService.retrieveContext(
        courseBId,
        'GitHub Actions CI/CD setup',
        3
      );

      expect(result.isGrounded).toBe(false);
      expect(result.citations).toHaveLength(0);
    });

    it('4.3 should block un-enrolled students from accessing course tutor index', async () => {
      const unauthorizedStudent = crypto.randomUUID();
      await expect(
        retrievalService.retrieveContext(
          courseAId,
          'How do I use React Query?',
          3,
          { id: unauthorizedStudent, role: 'student' }
        )
      ).rejects.toThrow('Learner does not possess an active enrollment');
    });
  });

  // ============================================================================
  // 5. GATED VECTOR SEARCH & SEARCH ACCEPTANCE BENCHMARK VERIFICATION
  // ============================================================================
  describe('5. Search Quality & Gated Vector Integration Verification', () => {
    it('5.1 should verify that vector search remains safely gated under mock provider', () => {
      expect(embeddingService.isVectorSearchGated()).toBe(true);
    });

    it('5.2 should verify retrieval latency meets p95 < 50ms requirement across 20 iterations', async () => {
      await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');

      const latencies: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await retrievalService.retrieveContext(courseAId, 'GitHub Actions CI/CD setup', 3);
        latencies.push(performance.now() - start);
      }

      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      expect(p95).toBeLessThan(50);
    });

    it('5.3 should verify Recall@5 and NDCG@5 on curriculum evaluation queries', async () => {
      await indexingService.indexCourse(courseAId, 'COURSE_PUBLISHED');

      // Evaluation queries targeting course lessons
      const evaluationQueries = [
        { query: 'Setting up GitHub Actions CI/CD pipeline', targetLessonId: lessonA1Id },
        { query: 'React Query caching and background sync state', targetLessonId: lessonA2Id },
      ];

      let recallHits = 0;
      let ndcgSum = 0;

      for (const item of evaluationQueries) {
        const result = await retrievalService.retrieveContext(courseAId, item.query, 5);
        const top5LessonIds = result.citations.map((c) => c.lessonId);

        if (top5LessonIds.includes(item.targetLessonId)) {
          recallHits++;
          const rank = top5LessonIds.indexOf(item.targetLessonId) + 1;
          const dcg = 1 / Math.log2(rank + 1);
          ndcgSum += dcg;
        }
      }

      const recallAt5 = recallHits / evaluationQueries.length;
      const ndcgAt5 = ndcgSum / evaluationQueries.length;

      expect(recallAt5).toBeGreaterThanOrEqual(0.85);
      expect(ndcgAt5).toBeGreaterThanOrEqual(0.80);
    });
  });
});
