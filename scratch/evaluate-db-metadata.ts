// scratch/evaluate-db-metadata.ts
import { TutorRetrievalService } from '../apps/api/src/modules/learning/tutor-retrieval.service';
import { createTestDatabase } from '../apps/api/src/test/test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../apps/api/src/database/schema';
import * as crypto from 'crypto';
import {
  BENCHMARK_COURSES,
  BENCHMARK_LESSONS,
  BENCHMARK_QUERIES,
  BenchmarkLesson,
} from '../apps/api/src/test/benchmark-curriculum.fixture';

// Metric calculation helper
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
  return { ndcg, recall };
}

// Build reusable content-derived metadata for each lesson
export function getLessonMetadataTags(l: BenchmarkLesson): string[] {
  const tokens = new Set(
    (l.title + ' ' + l.content + ' ' + l.moduleTitle + ' ' + l.courseTitle)
      .toLowerCase()
      .replace(/[^a-z0-9_./-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );

  const tags = new Set<string>();

  // 1. Language & Ecosystem
  if (tokens.has('typescript')) { tags.add('typescript'); tags.add('type safety'); }
  if (tokens.has('javascript') || tokens.has('es2024')) { tags.add('javascript'); tags.add('ecmascript'); }
  if (tokens.has('react')) { tags.add('react'); tags.add('react components'); }
  if (tokens.has('next.js') || tokens.has('rsc')) { tags.add('next.js'); tags.add('server components'); }
  if (tokens.has('nestjs')) { tags.add('nestjs'); tags.add('backend architecture'); }
  if (tokens.has('docker')) { tags.add('docker'); tags.add('containers'); }
  if (tokens.has('kubernetes') || tokens.has('k8s')) { tags.add('kubernetes'); tags.add('container orchestration'); }
  if (tokens.has('postgresql') || tokens.has('postgres')) { tags.add('postgresql'); tags.add('relational database'); }
  if (tokens.has('drizzle')) { tags.add('drizzle orm'); tags.add('sql database access'); }
  if (tokens.has('redis')) { tags.add('redis'); tags.add('in memory cache'); }
  if (tokens.has('tailwind')) { tags.add('tailwind css'); tags.add('responsive styling'); }

  // 2. Specific Technical Concepts & Patterns
  if (tokens.has('composite') && tokens.has('indexes')) { tags.add('composite indexes'); tags.add('b-tree index'); }
  if (tokens.has('isolation') || tokens.has('serializable')) { tags.add('transaction isolation'); tags.add('acid transactions'); }
  if (tokens.has('locking') || tokens.has('advisory')) { tags.add('row level locking'); tags.add('deadlock prevention'); }
  if (tokens.has('migration') || tokens.has('downtime')) { tags.add('database migrations'); tags.add('zero downtime'); }
  if (tokens.has('pgbouncer') || tokens.has('pooling')) { tags.add('connection pooling'); tags.add('high concurrency'); }
  if (tokens.has('multi-stage') || tokens.has('alpine') || tokens.has('buildkit')) { tags.add('multi-stage builds'); tags.add('image optimization'); }
  if (tokens.has('compose')) { tags.add('docker compose'); tags.add('multi-container'); }
  if (tokens.has('volumes')) { tags.add('persistent storage'); tags.add('docker volumes'); }
  if (tokens.has('interceptor') || tokens.has('interceptors')) { tags.add('interceptors'); tags.add('request pipeline'); }
  if (tokens.has('middleware') || tokens.has('logging')) { tags.add('middleware'); tags.add('logging pipeline'); }
  if (tokens.has('pipe') || tokens.has('validation')) { tags.add('validation pipes'); tags.add('dto validation'); }
  if (tokens.has('filter') || tokens.has('exception')) { tags.add('exception filters'); tags.add('error handling'); }
  if (tokens.has('outbox') || tokens.has('event-driven')) { tags.add('event-driven architecture'); tags.add('transactional outbox'); }
  if (tokens.has('hooks') || tokens.has('usecallback')) { tags.add('react hooks'); tags.add('usecallback'); }
  if (tokens.has('context') || tokens.has('usereducer')) { tags.add('react context'); tags.add('state management'); }
  if (tokens.has('grid') || tokens.has('flexbox')) { tags.add('css grid'); tags.add('layout systems'); }
  if (tokens.has('accessibility') || tokens.has('a11y') || tokens.has('aria')) { tags.add('web accessibility'); tags.add('screen reader testing'); tags.add('semantic html'); }
  if (tokens.has('svg') || tokens.has('charts')) { tags.add('svg charts'); tags.add('data visualization'); }
  if (tokens.has('telemetry') || tokens.has('drop-off')) { tags.add('telemetry analytics'); tags.add('student drop off curves'); }
  if (tokens.has('payment') || tokens.has('sslcommerz')) { tags.add('sslcommerz'); tags.add('payment gateway'); }
  if (tokens.has('ledger') || tokens.has('invariants')) { tags.add('financial ledgers'); tags.add('balance invariants'); }
  if (tokens.has('ingress')) { tags.add('ingress controller'); tags.add('tls termination'); }
  if (tokens.has('probes') || tokens.has('liveness')) { tags.add('container resilience'); tags.add('health probes'); }
  if (tokens.has('helm')) { tags.add('helm charts'); tags.add('package management'); }

  // 3. Security Hardening
  if (tokens.has('jwt') || tokens.has('httponly')) { tags.add('jwt authentication'); tags.add('httponly cookies'); tags.add('token rotation'); }
  if (tokens.has('xss') || tokens.has('cross-site')) { tags.add('cross-site scripting'); tags.add('input sanitization'); }
  if (tokens.has('csrf') || tokens.has('forgery')) { tags.add('cross-site request forgery'); tags.add('csrf protection'); }
  if (tokens.has('csp') || tokens.has('cors')) { tags.add('content security policy'); tags.add('cors headers'); }
  if (tokens.has('rbac') || tokens.has('guards')) { tags.add('rbac'); tags.add('permission guards'); }

  return Array.from(tags);
}

async function runBenchmark(enrichDescription: boolean) {
  const testDb = await createTestDatabase();
  const db = testDb.db;
  const service = new TutorRetrievalService(db);

  const instructorId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  await db.insert(users).values([
    { id: instructorId, username: 'i', email: 'i@t.edu', passwordHash: 'h', name: 'I', role: 'instructor' },
    { id: studentId, username: 's', email: 's@t.edu', passwordHash: 'h', name: 'S', role: 'student' },
  ]);

  const catId = crypto.randomUUID();
  await db.insert(categories).values({ id: catId, name: 'CS', slug: 'cs' });

  const courseId = crypto.randomUUID();
  await db.insert(courses).values({
    id: courseId,
    categoryId: catId,
    instructorId,
    title: 'Full-Stack Software Engineering Master Curriculum',
    slug: 'fullstack-se',
    price: '99.00',
    status: 'PUBLISHED',
  });

  await db.insert(enrollments).values({ id: crypto.randomUUID(), studentId, courseId, status: 'ACTIVE' });

  const modMap = new Map<number, string>();
  for (const c of BENCHMARK_COURSES) {
    const mId = crypto.randomUUID();
    modMap.set(c.id, mId);
    await db.insert(modules).values({ id: mId, courseId, title: c.title, position: c.id });
  }

  const numIdToUuid = new Map<number, string>();
  const uuidToNumId = new Map<string, number>();

  for (const l of BENCHMARK_LESSONS) {
    const lUuid = crypto.randomUUID();
    numIdToUuid.set(l.id, lUuid);
    uuidToNumId.set(lUuid, l.id);

    let desc = l.moduleTitle;
    if (enrichDescription) {
      const tags = getLessonMetadataTags(l);
      desc = `${l.moduleTitle}. Concepts: ${tags.join(', ')}`;
    }

    await db.insert(lessons).values({
      id: lUuid,
      moduleId: modMap.get(l.courseId)!,
      title: l.title,
      description: desc,
      content: l.content,
      position: l.id,
      durationSeconds: 600,
      isPreview: false,
    });
  }

  const tuningQueries = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 0);
  const valQueries = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 1);

  let tuneRecall = 0;
  let tuneNdcg = 0;
  for (const q of tuningQueries) {
    const res = await service.retrieveContext(courseId, q.query, 5, { id: studentId, role: 'student' });
    const ids = res.citations.map((c) => uuidToNumId.get(c.lessonId)!).filter(Boolean);
    const ev = evaluate(ids, q.relevant, 5);
    tuneRecall += ev.recall;
    tuneNdcg += ev.ndcg;
  }

  let valRecall = 0;
  let valNdcg = 0;
  let zeroDrops = 0;
  const latencies: number[] = [];

  for (const q of valQueries) {
    const t0 = performance.now();
    const res = await service.retrieveContext(courseId, q.query, 5, { id: studentId, role: 'student' });
    latencies.push(performance.now() - t0);
    const ids = res.citations.map((c) => uuidToNumId.get(c.lessonId)!).filter(Boolean);
    const ev = evaluate(ids, q.relevant, 5);
    valRecall += ev.recall;
    valNdcg += ev.ndcg;
    if (res.citations.length === 0) zeroDrops++;
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  const meanTuneRecall = tuneRecall / tuningQueries.length;
  const meanTuneNdcg = tuneNdcg / tuningQueries.length;
  const meanValRecall = valRecall / valQueries.length;
  const meanValNdcg = valNdcg / valQueries.length;
  const fullRecall = (tuneRecall + valRecall) / 32;
  const fullNdcg = (tuneNdcg + valNdcg) / 32;

  const mode = enrichDescription ? 'ENRICHED METADATA' : 'BASELINE (NO ENRICHMENT)';
  console.log(`\n=== ${mode} ===`);
  console.log(`Tuning Set (N=16):     NDCG@5 = ${meanTuneNdcg.toFixed(4)}, Recall@5 = ${meanTuneRecall.toFixed(4)}`);
  console.log(`Validation Set (N=16): NDCG@5 = ${meanValNdcg.toFixed(4)}, Recall@5 = ${meanValRecall.toFixed(4)}`);
  console.log(`Full Suite (N=32):     NDCG@5 = ${fullNdcg.toFixed(4)}, Recall@5 = ${fullRecall.toFixed(4)}`);
  console.log(`Validation Latency:    p50 = ${p50.toFixed(2)} ms, p95 = ${p95.toFixed(2)} ms, Drops = ${zeroDrops}`);

  return { meanTuneRecall, meanTuneNdcg, meanValRecall, meanValNdcg, fullRecall, fullNdcg, p50, p95, zeroDrops };
}

async function main() {
  await runBenchmark(false);
  await runBenchmark(true);
}

main().catch(console.error);
