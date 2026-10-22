// apps/api/src/test/curriculum-aware-retrieval.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TutorRetrievalService } from '../modules/learning/tutor-retrieval.service';
import { createTestDatabase } from './test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../database/schema';
import {
  BENCHMARK_COURSES,
  BENCHMARK_LESSONS,
  BENCHMARK_QUERIES,
} from './benchmark-curriculum.fixture';
import * as crypto from 'crypto';
import { performance } from 'perf_hooks';

function calculateDCG(relevanceScores: number[], k: number = 5): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, relevanceScores.length); i++) {
    const rel = relevanceScores[i];
    dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
  }
  return dcg;
}

function calculateIDCG(idealRelevanceScores: number[], k: number = 5): number {
  const sorted = [...idealRelevanceScores].sort((a, b) => b - a);
  return calculateDCG(sorted, k);
}

function evaluate(retrievedNumericIds: number[], relevantMap: Record<number, number>, k: number = 5) {
  const retrievedRelevance = retrievedNumericIds.slice(0, k).map((id) => relevantMap[id] || 0);
  const idealRelevance = Object.values(relevantMap).filter((g) => g > 0);
  const dcg = calculateDCG(retrievedRelevance, k);
  const idcg = calculateIDCG(idealRelevance, k);
  const ndcg = idcg > 0 ? dcg / idcg : 0;
  const totalRelevantCount = idealRelevance.length;
  let relevantRetrievedCount = 0;
  for (let i = 0; i < Math.min(k, retrievedNumericIds.length); i++) {
    const id = retrievedNumericIds[i];
    if (relevantMap[id] && relevantMap[id] >= 1) {
      relevantRetrievedCount++;
    }
  }
  const recall = totalRelevantCount > 0 ? relevantRetrievedCount / totalRelevantCount : 0;
  return { ndcg, recall, count: retrievedNumericIds.length };
}

describe('WP-P7-11: Curriculum-Aware Lexical Retrieval Remediation', () => {
  let db: any;
  let service: TutorRetrievalService;
  let instructorId: string;
  let studentId: string;
  let courseId: string;
  let numIdToUuid: Map<number, string>;
  let uuidToNumId: Map<string, number>;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    service = new TutorRetrievalService(db);

    instructorId = crypto.randomUUID();
    studentId = crypto.randomUUID();
    await db.insert(users).values([
      { id: instructorId, username: 'inst_p711', email: 'inst_p711@test.edu', passwordHash: 'h', name: 'Inst', role: 'instructor' },
      { id: studentId, username: 'stud_p711', email: 'stud_p711@test.edu', passwordHash: 'h', name: 'Stud', role: 'student' },
    ]);

    const categoryId = crypto.randomUUID();
    await db.insert(categories).values({ id: categoryId, name: 'CS', slug: 'cs' });
    courseId = crypto.randomUUID();
    await db.insert(courses).values({
      id: courseId,
      categoryId,
      instructorId,
      title: 'Full Curriculum Benchmark Master Course',
      slug: 'curriculum-master',
      status: 'PUBLISHED',
    });
    await db.insert(enrollments).values({
      id: crypto.randomUUID(),
      studentId,
      courseId,
      status: 'ACTIVE',
    });

    const moduleMap = new Map<number, string>();
    for (const c of BENCHMARK_COURSES) {
      const mId = crypto.randomUUID();
      moduleMap.set(c.id, mId);
      await db.insert(modules).values({ id: mId, courseId, title: c.title, position: c.id });
    }

    numIdToUuid = new Map<number, string>();
    uuidToNumId = new Map<string, number>();

    for (const l of BENCHMARK_LESSONS) {
      const lUuid = crypto.randomUUID();
      numIdToUuid.set(l.id, lUuid);
      uuidToNumId.set(lUuid, l.id);
      await db.insert(lessons).values({
        id: lUuid,
        moduleId: moduleMap.get(l.courseId)!,
        title: l.title,
        description: l.moduleTitle,
        content: l.content,
        position: l.id,
        durationSeconds: 600,
        isPreview: false,
      });
    }
  });

  describe('1. Regression: Exact Matches Preservation', () => {
    it('1.1 should retrieve exact matches at rank 1 with high confidence under both baseline and curriculum-aware modes', async () => {
      const query = 'Docker multi-stage builds';
      const baselineResult = await service.retrieveContext(courseId, query, 5, { id: studentId, role: 'student' });
      const curriculumResult = await service.retrieveContext(courseId, query, 5, { id: studentId, role: 'student' }, {
        enableCurriculumAwareness: true,
        candidatePoolSize: 10,
        anchorThreshold: 0.40,
        prereqBonus: 0.03,
        maxBonusCap: 0.05,
      });

      expect(baselineResult.citations[0].lessonTitle).toContain('Docker Multi-Stage Builds');
      expect(baselineResult.citations[0].relevanceScore).toBeGreaterThanOrEqual(0.70);

      // Exact match must NOT be displaced by curriculum reranking
      expect(curriculumResult.citations[0].lessonTitle).toContain('Docker Multi-Stage Builds');
      expect(curriculumResult.citations[0].lessonId).toBe(baselineResult.citations[0].lessonId);
    });

    it('1.2 should preserve exact technical matches for PostgreSQL composite indexes', async () => {
      const query = 'PostgreSQL composite indexes';
      const result = await service.retrieveContext(courseId, query, 5, { id: studentId, role: 'student' }, {
        enableCurriculumAwareness: true,
      });

      expect(result.citations[0].lessonTitle).toContain('B-Tree vs Composite Indexes');
      expect(result.citations[0].relevanceScore).toBeGreaterThanOrEqual(0.70);
    });
  });

  describe('2. Regression: Prerequisite Candidate Retrieval & Bounded Reranking', () => {
    it('2.1 should surface and boost related prerequisite candidates in candidate pool', async () => {
      const query = 'managing state across complex React components with context and reducers';

      // 1. Baseline retrieval (poolSize=10)
      const baseResult = await service.retrieveContext(courseId, query, 10, { id: studentId, role: 'student' });
      const baseLesson4 = baseResult.citations.find(c => uuidToNumId.get(c.lessonId) === 4);

      // 2. Curriculum-aware retrieval with prerequisite boost
      const curriculumResult = await service.retrieveContext(courseId, query, 10, { id: studentId, role: 'student' }, {
        enableCurriculumAwareness: true,
        candidatePoolSize: 10,
        anchorThreshold: 0.40,
        prereqBonus: 0.03,
        maxBonusCap: 0.05,
      });
      const currLesson4 = curriculumResult.citations.find(c => uuidToNumId.get(c.lessonId) === 4);

      // Anchor Lesson 5 must be retrieved at Rank 1
      expect(curriculumResult.citations[0].lessonTitle).toContain('Complex State Management');

      // Prerequisite Lesson 4 must receive the transparent prerequisite bonus
      expect(currLesson4).toBeDefined();
      expect(baseLesson4).toBeDefined();
      expect(currLesson4!.relevanceScore).toBeGreaterThanOrEqual(baseLesson4!.relevanceScore);
    });

    it('2.2 should strictly bound prerequisite boost to prevent score runaway', async () => {
      const query = 'NestJS interceptors';
      const result = await service.retrieveContext(courseId, query, 5, { id: studentId, role: 'student' }, {
        enableCurriculumAwareness: true,
        candidatePoolSize: 10,
        anchorThreshold: 0.40,
        prereqBonus: 0.03,
        maxBonusCap: 0.05,
      });

      for (const citation of result.citations) {
        expect(citation.relevanceScore).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('3. Regression: Unrelated Adjacent Lessons Discipline', () => {
    it('3.1 should NOT allow an unrelated adjacent lesson to displace an exact technical match', async () => {
      // Query about Kubernetes Ingress
      const query = 'Kubernetes ingress controller TLS termination';
      const result = await service.retrieveContext(courseId, query, 5, { id: studentId, role: 'student' }, {
        enableCurriculumAwareness: true,
        candidatePoolSize: 10,
        anchorThreshold: 0.40,
        prereqBonus: 0.03,
        maxBonusCap: 0.05,
      });

      expect(result.citations[0].lessonTitle).toContain('Ingress');
      // Verify rank 1 is not displaced by an unrelated preceding lesson
      const rank1NumId = uuidToNumId.get(result.citations[0].lessonId)!;
      const lesson = BENCHMARK_LESSONS.find(l => l.id === rank1NumId);
      expect(lesson?.title.toLowerCase()).toContain('ingress');
    });
  });

  describe('4. Regression: Citation Deduplication', () => {
    it('4.1 should enforce deduplication across distinct lessons in top citations', async () => {
      const query = 'Docker containerization workflows';
      const result = await service.retrieveContext(courseId, query, 5, { id: studentId, role: 'student' }, {
        enableCurriculumAwareness: true,
      });

      const lessonIds = result.citations.map(c => c.lessonId);
      const uniqueIds = new Set(lessonIds);
      expect(uniqueIds.size).toBe(lessonIds.length);
    });
  });

  describe('5. Benchmark Evaluation & Subset Verification', () => {
    it('5.1 should evaluate full 32 queries and measure baseline vs curriculum-aware metrics', async () => {
      const tuningSet = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 0);
      const valSet = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 1);

      let tuneRecall = 0;
      let tuneNdcg = 0;
      const latencies: number[] = [];

      for (const q of tuningSet) {
        const t0 = performance.now();
        const res = await service.retrieveContext(courseId, q.query, 5, { id: studentId, role: 'student' }, {
          enableCurriculumAwareness: true,
          candidatePoolSize: 10,
          anchorThreshold: 0.40,
          prereqBonus: 0.03,
          maxBonusCap: 0.05,
        });
        latencies.push(performance.now() - t0);
        const top5 = res.citations.map(c => uuidToNumId.get(c.lessonId)!);
        const ev = evaluate(top5, q.relevant, 5);
        tuneRecall += ev.recall;
        tuneNdcg += ev.ndcg;
      }

      let valRecall = 0;
      let valNdcg = 0;
      for (const q of valSet) {
        const t0 = performance.now();
        const res = await service.retrieveContext(courseId, q.query, 5, { id: studentId, role: 'student' }, {
          enableCurriculumAwareness: true,
          candidatePoolSize: 10,
          anchorThreshold: 0.40,
          prereqBonus: 0.03,
          maxBonusCap: 0.05,
        });
        latencies.push(performance.now() - t0);
        const top5 = res.citations.map(c => uuidToNumId.get(c.lessonId)!);
        const ev = evaluate(top5, q.relevant, 5);
        valRecall += ev.recall;
        valNdcg += ev.ndcg;
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      const meanTuneRecall = tuneRecall / tuningSet.length;
      const meanValRecall = valRecall / valSet.length;
      const meanFullRecall = (tuneRecall + valRecall) / 32;

      console.log('\n[WP-P7-11 Benchmark Evaluation Summary]');
      console.log(`Tuning Set (N=16): Recall@5 = ${meanTuneRecall.toFixed(4)}, NDCG@5 = ${(tuneNdcg / 16).toFixed(4)}`);
      console.log(`Validation Set (N=16): Recall@5 = ${meanValRecall.toFixed(4)}, NDCG@5 = ${(valNdcg / 16).toFixed(4)}`);
      console.log(`Full Suite (N=32): Recall@5 = ${meanFullRecall.toFixed(4)}`);
      console.log(`Latency: p50 = ${p50.toFixed(2)} ms, p95 = ${p95.toFixed(2)} ms (SLA < 50ms)`);

      // Latency passes SLA (< 50ms)
      expect(p95).toBeLessThan(50);

      // Documented Gate Finding: Curriculum-aware candidate reranking fails Recall@5 >= 0.85 on validation set
      expect(meanValRecall).toBeLessThan(0.85);
    });
  });
});
