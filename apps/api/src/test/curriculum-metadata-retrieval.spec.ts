import { describe, it, expect, beforeEach } from 'vitest';
import { TutorRetrievalService } from '../modules/learning/tutor-retrieval.service';
import { createTestDatabase } from './test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../database/schema';
import * as crypto from 'crypto';
import {
  BENCHMARK_COURSES,
  BENCHMARK_LESSONS,
  BENCHMARK_QUERIES,
  BenchmarkLesson,
} from './benchmark-curriculum.fixture';

// ============================================================================
// EVALUATION METRICS HELPERS
// ============================================================================

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

function evaluateResults(
  retrievedNumericIds: number[],
  relevantMap: Record<number, number>,
  k: number = 5
) {
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
  return { ndcg, recall, retrievedCount: retrievedNumericIds.length };
}

// ============================================================================
// REUSABLE MULTI-LABEL METADATA DERIVATION (CONTENT-DERIVED ONLY)
// ============================================================================

export interface LessonContentMetadata {
  concepts: string[];
  technologies: string[];
  architecture: string[];
  security: string[];
}

export function deriveContentMetadata(lesson: BenchmarkLesson): LessonContentMetadata {
  const tokenSet = new Set(
    (lesson.title + ' ' + lesson.content + ' ' + lesson.moduleTitle + ' ' + lesson.courseTitle)
      .toLowerCase()
      .replace(/[^a-z0-9_./-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );

  const concepts = new Set<string>();
  const technologies = new Set<string>();
  const architecture = new Set<string>();
  const security = new Set<string>();

  // 1. Technologies & Languages
  if (tokenSet.has('typescript')) { technologies.add('typescript'); concepts.add('type-safety'); }
  if (tokenSet.has('javascript') || tokenSet.has('es2024')) { technologies.add('javascript'); concepts.add('ecmascript'); }
  if (tokenSet.has('react') || tokenSet.has('react-19')) { technologies.add('react'); concepts.add('frontend-components'); }
  if (tokenSet.has('next.js') || tokenSet.has('nextjs') || tokenSet.has('rsc')) { technologies.add('next.js'); architecture.add('server-side-rendering'); }
  if (tokenSet.has('nestjs')) { technologies.add('nestjs'); architecture.add('backend-architecture'); }
  if (tokenSet.has('docker')) { technologies.add('docker'); concepts.add('containerization'); }
  if (tokenSet.has('kubernetes') || tokenSet.has('k8s')) { technologies.add('kubernetes'); architecture.add('container-orchestration'); }
  if (tokenSet.has('postgresql') || tokenSet.has('postgres')) { technologies.add('postgresql'); technologies.add('sql'); }
  if (tokenSet.has('drizzle') || tokenSet.has('orm')) { technologies.add('drizzle-orm'); concepts.add('database-access'); }
  if (tokenSet.has('redis')) { technologies.add('redis'); architecture.add('caching'); }
  if (tokenSet.has('tailwind')) { technologies.add('tailwind-css'); concepts.add('responsive-styling'); }

  // 2. Concepts & Architecture
  if (tokenSet.has('composite') && tokenSet.has('indexes')) { concepts.add('composite-indexes'); concepts.add('b-tree'); }
  if (tokenSet.has('isolation') || tokenSet.has('serializable') || tokenSet.has('acid')) { concepts.add('transaction-isolation'); concepts.add('concurrency-control'); }
  if (tokenSet.has('locking') || tokenSet.has('advisory') || tokenSet.has('deadlock')) { concepts.add('row-level-locking'); architecture.add('deadlock-prevention'); }
  if (tokenSet.has('migration') || tokenSet.has('downtime')) { architecture.add('database-migrations'); architecture.add('zero-downtime'); }
  if (tokenSet.has('pgbouncer') || tokenSet.has('pooling') || tokenSet.has('concurrency')) { architecture.add('connection-pooling'); concepts.add('high-concurrency'); }
  if (tokenSet.has('multi-stage') || tokenSet.has('alpine') || tokenSet.has('buildkit')) { architecture.add('multi-stage-builds'); concepts.add('image-optimization'); }
  if (tokenSet.has('compose')) { technologies.add('docker-compose'); architecture.add('multi-container-environments'); }
  if (tokenSet.has('volumes') || tokenSet.has('mounts')) { concepts.add('persistent-storage'); concepts.add('docker-volumes'); }
  if (tokenSet.has('interceptor') || tokenSet.has('interceptors')) { architecture.add('interceptors'); architecture.add('request-pipeline'); }
  if (tokenSet.has('middleware') || tokenSet.has('logging')) { architecture.add('middleware'); architecture.add('logging-pipeline'); }
  if (tokenSet.has('pipe') || tokenSet.has('validation') || tokenSet.has('class-validator')) { concepts.add('validation-pipes'); concepts.add('dto-validation'); }
  if (tokenSet.has('filter') || tokenSet.has('exception') || tokenSet.has('exceptions')) { architecture.add('exception-filters'); concepts.add('error-handling'); }
  if (tokenSet.has('outbox') || tokenSet.has('message') || tokenSet.has('rabbitmq') || tokenSet.has('event-driven')) { architecture.add('event-driven-architecture'); architecture.add('transactional-outbox'); }
  if (tokenSet.has('grpc') || tokenSet.has('microservices')) { architecture.add('microservices'); architecture.add('rpc-protocol'); }
  if (tokenSet.has('hooks') || tokenSet.has('usecallback') || tokenSet.has('usememo')) { concepts.add('react-hooks'); concepts.add('memoization'); }
  if (tokenSet.has('context') || tokenSet.has('usereducer')) { concepts.add('react-context'); concepts.add('state-management'); }
  if (tokenSet.has('actions') || tokenSet.has('server-actions')) { architecture.add('server-actions'); concepts.add('mutations'); }
  if (tokenSet.has('grid') || tokenSet.has('flexbox')) { concepts.add('css-grid'); concepts.add('layout-systems'); }
  if (tokenSet.has('accessibility') || tokenSet.has('a11y') || tokenSet.has('wcag') || tokenSet.has('aria')) { concepts.add('web-accessibility'); concepts.add('wcag-compliance'); concepts.add('semantic-html'); }
  if (tokenSet.has('svg') || tokenSet.has('charts') || tokenSet.has('visualization')) { concepts.add('data-visualization'); concepts.add('svg-charts'); }
  if (tokenSet.has('ci/cd') || tokenSet.has('actions') || tokenSet.has('pipeline')) { architecture.add('ci-cd'); architecture.add('automated-deployments'); }
  if (tokenSet.has('telemetry') || tokenSet.has('drop-off') || tokenSet.has('checkpoints')) { concepts.add('learning-analytics'); concepts.add('student-retention'); }
  if (tokenSet.has('payment') || tokenSet.has('sslcommerz') || tokenSet.has('gateway')) { technologies.add('sslcommerz'); concepts.add('payment-gateways'); }
  if (tokenSet.has('ledger') || tokenSet.has('debit') || tokenSet.has('credit')) { architecture.add('financial-ledgers'); concepts.add('double-entry-accounting'); }
  if (tokenSet.has('ingress') || tokenSet.has('tls')) { architecture.add('ingress-controller'); architecture.add('tls-termination'); }
  if (tokenSet.has('configmap') || tokenSet.has('secrets')) { architecture.add('configuration-management'); security.add('secrets-management'); }
  if (tokenSet.has('hpa') || tokenSet.has('autoscaler')) { architecture.add('horizontal-pod-autoscaling'); concepts.add('autoscaling'); }
  if (tokenSet.has('probes') || tokenSet.has('liveness') || tokenSet.has('readiness')) { architecture.add('container-resilience'); concepts.add('health-probes'); }
  if (tokenSet.has('helm')) { technologies.add('helm-charts'); architecture.add('k8s-packaging'); }
  if (tokenSet.has('istio') || tokenSet.has('envoy') || tokenSet.has('mtls')) { technologies.add('service-mesh'); security.add('mutual-tls'); }

  // 3. Security Hardening
  if (tokenSet.has('jwt') || tokenSet.has('httponly') || tokenSet.has('cookie') || tokenSet.has('token')) { security.add('jwt-authentication'); security.add('httponly-cookies'); security.add('token-rotation'); }
  if (tokenSet.has('xss') || tokenSet.has('cross-site') || tokenSet.has('sanitization')) { security.add('xss-prevention'); security.add('input-sanitization'); }
  if (tokenSet.has('csrf') || tokenSet.has('forgery')) { security.add('csrf-protection'); security.add('request-forgery-defense'); }
  if (tokenSet.has('csp') || tokenSet.has('cors') || tokenSet.has('helmet')) { security.add('content-security-policy'); security.add('cors-policy'); }
  if (tokenSet.has('rbac') || tokenSet.has('guards') || tokenSet.has('permission')) { security.add('rbac'); security.add('route-guards'); security.add('authorization'); }
  if (tokenSet.has('non-root') || tokenSet.has('capabilities')) { security.add('container-hardening'); security.add('least-privilege'); }
  if (tokenSet.has('audit') || tokenSet.has('invariants')) { architecture.add('financial-auditing'); concepts.add('ledger-invariants'); }

  return {
    concepts: Array.from(concepts),
    technologies: Array.from(technologies),
    architecture: Array.from(architecture),
    security: Array.from(security),
  };
}

describe('WP-P7-12: Curriculum Content Enrichment & Retrieval Evaluation', () => {
  let db: any;
  let service: TutorRetrievalService;
  let studentId: string;
  let baselineCourseId: string;
  let enrichedCourseId: string;
  const numIdToUuidBase = new Map<number, string>();
  const uuidToNumIdBase = new Map<string, number>();
  const numIdToUuidEnriched = new Map<number, string>();
  const uuidToNumIdEnriched = new Map<string, number>();

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    service = new TutorRetrievalService(db);

    const instructorId = crypto.randomUUID();
    studentId = crypto.randomUUID();

    await db.insert(users).values([
      {
        id: instructorId,
        username: 'instructor_bench_p712',
        email: 'p712_inst@techsprout.edu',
        passwordHash: 'hash',
        name: 'P7.12 Benchmark Instructor',
        role: 'instructor',
      },
      {
        id: studentId,
        username: 'student_bench_p712',
        email: 'p712_stud@techsprout.edu',
        passwordHash: 'hash',
        name: 'P7.12 Benchmark Student',
        role: 'student',
      },
    ]);

    const categoryId = crypto.randomUUID();
    await db.insert(categories).values({
      id: categoryId,
      name: 'Computer Science',
      slug: 'cs-p712',
    });

    // 1. Create Baseline Course (Standard descriptions)
    baselineCourseId = crypto.randomUUID();
    await db.insert(courses).values({
      id: baselineCourseId,
      categoryId,
      instructorId,
      title: 'Full-Stack Software Engineering (Baseline Course)',
      slug: 'fullstack-se-baseline',
      price: '99.00',
      status: 'PUBLISHED',
    });
    await db.insert(enrollments).values({
      id: crypto.randomUUID(),
      studentId,
      courseId: baselineCourseId,
      status: 'ACTIVE',
    });

    // 2. Create Enriched Course (Content-derived metadata tags in description)
    enrichedCourseId = crypto.randomUUID();
    await db.insert(courses).values({
      id: enrichedCourseId,
      categoryId,
      instructorId,
      title: 'Full-Stack Software Engineering (Enriched Metadata Course)',
      slug: 'fullstack-se-enriched',
      price: '99.00',
      status: 'PUBLISHED',
    });
    await db.insert(enrollments).values({
      id: crypto.randomUUID(),
      studentId,
      courseId: enrichedCourseId,
      status: 'ACTIVE',
    });

    // Populate modules for both courses
    const baseModuleMap = new Map<number, string>();
    const enrichedModuleMap = new Map<number, string>();
    for (const c of BENCHMARK_COURSES) {
      const baseModId = crypto.randomUUID();
      baseModuleMap.set(c.id, baseModId);
      await db.insert(modules).values({
        id: baseModId,
        courseId: baselineCourseId,
        title: c.title,
        position: c.id,
      });

      const enrichedModId = crypto.randomUUID();
      enrichedModuleMap.set(c.id, enrichedModId);
      await db.insert(modules).values({
        id: enrichedModId,
        courseId: enrichedCourseId,
        title: c.title,
        position: c.id,
      });
    }

    // Populate lessons into baseline course
    numIdToUuidBase.clear();
    uuidToNumIdBase.clear();
    for (const l of BENCHMARK_LESSONS) {
      const lUuid = crypto.randomUUID();
      numIdToUuidBase.set(l.id, lUuid);
      uuidToNumIdBase.set(lUuid, l.id);

      await db.insert(lessons).values({
        id: lUuid,
        moduleId: baseModuleMap.get(l.courseId)!,
        title: l.title,
        description: l.moduleTitle, // Baseline standard
        content: l.content,
        position: l.id,
        durationSeconds: 600,
        isPreview: false,
      });
    }

    // Populate lessons into enriched course
    numIdToUuidEnriched.clear();
    uuidToNumIdEnriched.clear();
    for (const l of BENCHMARK_LESSONS) {
      const lUuid = crypto.randomUUID();
      numIdToUuidEnriched.set(l.id, lUuid);
      uuidToNumIdEnriched.set(lUuid, l.id);

      const meta = deriveContentMetadata(l);
      const tagTokens = [
        ...meta.technologies,
        ...meta.concepts,
        ...meta.architecture,
        ...meta.security,
      ].join(' ');

      await db.insert(lessons).values({
        id: lUuid,
        moduleId: enrichedModuleMap.get(l.courseId)!,
        title: l.title,
        description: `${l.moduleTitle}. Topics: ${tagTokens}`,
        content: l.content,
        position: l.id,
        durationSeconds: 600,
        isPreview: false,
      });
    }
  });

  describe('1. Baseline Provenance Verification', () => {
    it('1.1 should confirm authoritative baseline metrics on un-enriched corpus', async () => {
      let fullNdcg = 0;
      let fullRecall = 0;
      let zeroDrops = 0;
      const latencies: number[] = [];

      for (const q of BENCHMARK_QUERIES) {
        const t0 = performance.now();
        const res = await service.retrieveContext(baselineCourseId, q.query, 5, { id: studentId, role: 'student' });
        latencies.push(performance.now() - t0);
        const ids = res.citations.map((c) => uuidToNumIdBase.get(c.lessonId)!).filter(Boolean);
        const ev = evaluateResults(ids, q.relevant, 5);
        fullNdcg += ev.ndcg;
        fullRecall += ev.recall;
        if (res.citations.length === 0) zeroDrops++;
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      const meanFullNdcg = fullNdcg / BENCHMARK_QUERIES.length;
      const meanFullRecall = fullRecall / BENCHMARK_QUERIES.length;

      expect(meanFullNdcg).toBeCloseTo(0.8929, 2);
      expect(meanFullRecall).toBeCloseTo(0.7672, 2);
      expect(zeroDrops).toBe(0);
      expect(p95).toBeLessThan(50);
    });
  });

  describe('2. Metadata-Enriched Retrieval Evaluation', () => {
    it('2.1 should evaluate tuning vs frozen validation subsets independently (Zero Leakage)', async () => {
      const tuningQueries = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 0);
      const valQueries = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 1);

      // Evaluate Tuning Subset
      let tuneRecall = 0;
      let tuneNdcg = 0;
      for (const q of tuningQueries) {
        const res = await service.retrieveContext(enrichedCourseId, q.query, 5, { id: studentId, role: 'student' });
        const ids = res.citations.map((c) => uuidToNumIdEnriched.get(c.lessonId)!).filter(Boolean);
        const ev = evaluateResults(ids, q.relevant, 5);
        tuneRecall += ev.recall;
        tuneNdcg += ev.ndcg;
      }
      const meanTuneRecall = tuneRecall / tuningQueries.length;
      const meanTuneNdcg = tuneNdcg / tuningQueries.length;

      // Evaluate Frozen Validation Subset
      let valRecall = 0;
      let valNdcg = 0;
      let zeroDrops = 0;
      const latencies: number[] = [];

      for (const q of valQueries) {
        const t0 = performance.now();
        const res = await service.retrieveContext(enrichedCourseId, q.query, 5, { id: studentId, role: 'student' });
        latencies.push(performance.now() - t0);
        const ids = res.citations.map((c) => uuidToNumIdEnriched.get(c.lessonId)!).filter(Boolean);
        const ev = evaluateResults(ids, q.relevant, 5);
        valRecall += ev.recall;
        valNdcg += ev.ndcg;
        if (res.citations.length === 0) zeroDrops++;
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      const meanValRecall = valRecall / valQueries.length;
      const meanValNdcg = valNdcg / valQueries.length;
      const fullRecall = (tuneRecall + valRecall) / 32;
      const fullNdcg = (tuneNdcg + valNdcg) / 32;

      console.log('\n[WP-P7-12 Empirical Benchmark Results]');
      console.log(`Tuning Set (N=16):     NDCG@5 = ${meanTuneNdcg.toFixed(4)}, Recall@5 = ${meanTuneRecall.toFixed(4)}`);
      console.log(`Validation Set (N=16): NDCG@5 = ${meanValNdcg.toFixed(4)}, Recall@5 = ${meanValRecall.toFixed(4)}`);
      console.log(`Full Suite (N=32):     NDCG@5 = ${fullNdcg.toFixed(4)}, Recall@5 = ${fullRecall.toFixed(4)}`);
      console.log(`Validation Latency:    p50 = ${p50.toFixed(2)} ms, p95 = ${p95.toFixed(2)} ms, Zero Drops = ${zeroDrops}`);

      // Latency SLA passes (< 50ms)
      expect(p95).toBeLessThan(50);

      // Ranking Quality passes (NDCG@5 >= 0.80)
      expect(meanValNdcg).toBeGreaterThanOrEqual(0.80);

      // Zero-result drops pass (= 0)
      expect(zeroDrops).toBe(0);

      // Documented Gate Finding: Reusable metadata keyword enrichment fails the Recall@5 >= 0.85 threshold on validation set
      expect(meanValRecall).toBeLessThan(0.85);
    });

    it('2.2 should compute and display category-by-category breakdown for baseline vs enriched', async () => {
      const categories: ('Exact Concept' | 'Multi-Word Question' | 'Misspelling / Noisy' | 'Cross-Module/Concept')[] = [
        'Exact Concept',
        'Multi-Word Question',
        'Misspelling / Noisy',
        'Cross-Module/Concept',
      ];

      console.log('\n[WP-P7-12 Category Breakdown: Baseline vs Enriched]');
      for (const cat of categories) {
        const catQueries = BENCHMARK_QUERIES.filter((q) => q.category === cat);

        let baseRecall = 0;
        let baseNdcg = 0;
        let enrichedRecall = 0;
        let enrichedNdcg = 0;

        for (const q of catQueries) {
          const resBase = await service.retrieveContext(baselineCourseId, q.query, 5, { id: studentId, role: 'student' });
          const idsBase = resBase.citations.map((c) => uuidToNumIdBase.get(c.lessonId)!).filter(Boolean);
          const evBase = evaluateResults(idsBase, q.relevant, 5);
          baseRecall += evBase.recall;
          baseNdcg += evBase.ndcg;

          const resEnriched = await service.retrieveContext(enrichedCourseId, q.query, 5, { id: studentId, role: 'student' });
          const idsEnriched = resEnriched.citations.map((c) => uuidToNumIdEnriched.get(c.lessonId)!).filter(Boolean);
          const evEnriched = evaluateResults(idsEnriched, q.relevant, 5);
          enrichedRecall += evEnriched.recall;
          enrichedNdcg += evEnriched.ndcg;
        }

        const meanBaseRecall = baseRecall / catQueries.length;
        const meanBaseNdcg = baseNdcg / catQueries.length;
        const meanEnrichedRecall = enrichedRecall / catQueries.length;
        const meanEnrichedNdcg = enrichedNdcg / catQueries.length;

        console.log(`Category "${cat}" (N=${catQueries.length}):`);
        console.log(`  Baseline: Recall@5 = ${meanBaseRecall.toFixed(4)}, NDCG@5 = ${meanBaseNdcg.toFixed(4)}`);
        console.log(`  Enriched: Recall@5 = ${meanEnrichedRecall.toFixed(4)}, NDCG@5 = ${meanEnrichedNdcg.toFixed(4)}`);
      }
    });

    it('2.3 should preserve exact match priority and citation deduplication', async () => {
      const query = 'Docker multi-stage builds';
      const res = await service.retrieveContext(enrichedCourseId, query, 5, { id: studentId, role: 'student' });
      expect(res.citations.length).toBeGreaterThanOrEqual(1);

      // Rank 1 citation must be the exact match (Lesson 19)
      const rank1NumId = uuidToNumIdEnriched.get(res.citations[0].lessonId);
      expect(rank1NumId).toBe(19);

      // Unique lessonIds in citations
      const uniqueLessonIds = new Set(res.citations.map((c) => c.lessonId));
      expect(uniqueLessonIds.size).toBe(res.citations.length);
    });
  });
});

