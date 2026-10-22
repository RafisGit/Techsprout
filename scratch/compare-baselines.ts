// scratch/compare-baselines.ts
import { TutorRetrievalService } from '../apps/api/src/modules/learning/tutor-retrieval.service';
import { createTestDatabase } from '../apps/api/src/test/test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../apps/api/src/database/schema';
import * as crypto from 'crypto';
import {
  BENCHMARK_COURSES,
  BENCHMARK_LESSONS,
  BENCHMARK_QUERIES,
} from '../apps/api/src/test/benchmark-curriculum.fixture';
import { retrieveEnhancedBM25, evaluateResults } from './evaluate-retrieval.mjs';

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

function evalHelper(retrievedNumericIds: number[], relevantMap: Record<number, number>, k: number = 5) {
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

async function run() {
  const testDb = await createTestDatabase();
  const db = testDb.db;
  const service = new TutorRetrievalService(db);

  const instructorId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  await db.insert(users).values([
    { id: instructorId, username: 'inst', email: 'inst@test.edu', passwordHash: 'h', name: 'Inst', role: 'instructor' },
    { id: studentId, username: 'stud', email: 'stud@test.edu', passwordHash: 'h', name: 'Stud', role: 'student' },
  ]);
  const categoryId = crypto.randomUUID();
  await db.insert(categories).values({ id: categoryId, name: 'CS', slug: 'cs' });
  const courseId = crypto.randomUUID();
  await db.insert(courses).values({ id: courseId, categoryId, instructorId, title: 'Master', slug: 'master', status: 'PUBLISHED' });
  await db.insert(enrollments).values({ id: crypto.randomUUID(), studentId, courseId, status: 'ACTIVE' });

  const moduleMap = new Map<number, string>();
  for (const c of BENCHMARK_COURSES) {
    const mId = crypto.randomUUID();
    moduleMap.set(c.id, mId);
    await db.insert(modules).values({ id: mId, courseId, title: c.title, position: c.id });
  }

  const numIdToUuid = new Map<number, string>();
  const uuidToNumId = new Map<string, number>();

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

  console.log('Comparing TutorRetrievalService vs evaluate-retrieval.mjs on 32 queries:\n');
  let totNdcgService = 0, totRecallService = 0;
  let totNdcgScript = 0, totRecallScript = 0;

  for (let i = 0; i < BENCHMARK_QUERIES.length; i++) {
    const q = BENCHMARK_QUERIES[i];
    // 1. Service
    const sRes = await service.retrieveContext(courseId, q.query, 5, { id: studentId, role: 'student' });
    const sIds = sRes.citations.map(c => uuidToNumId.get(c.lessonId)!).filter(Boolean);
    const sEval = evalHelper(sIds, q.relevant, 5);
    totNdcgService += sEval.ndcg;
    totRecallService += sEval.recall;

    // 2. Script
    const scIds = retrieveEnhancedBM25(q.query, BENCHMARK_LESSONS);
    const scEval = evalHelper(scIds, q.relevant, 5);
    totNdcgScript += scEval.ndcg;
    totRecallScript += scEval.recall;

    const diffNdcg = Math.abs(sEval.ndcg - scEval.ndcg);
    const diffRecall = Math.abs(sEval.recall - scEval.recall);

    if (diffNdcg > 0.001 || diffRecall > 0.001) {
      console.log(`Diff at Q${i+1} [${q.query}]:`);
      console.log(`  Service: NDCG = ${sEval.ndcg.toFixed(4)}, Recall = ${sEval.recall.toFixed(4)}, Ids = [${sIds.join(', ')}]`);
      console.log(`  Script:  NDCG = ${scEval.ndcg.toFixed(4)}, Recall = ${scEval.recall.toFixed(4)}, Ids = [${scIds.join(', ')}]`);
    }
  }

  console.log('\n--- AGGREGATE SUMMARY ---');
  console.log(`TutorRetrievalService (Authoritative): NDCG@5 = ${(totNdcgService/32).toFixed(4)}, Recall@5 = ${(totRecallService/32).toFixed(4)}`);
  console.log(`Standalone evaluate-retrieval.mjs:     NDCG@5 = ${(totNdcgScript/32).toFixed(4)}, Recall@5 = ${(totRecallScript/32).toFixed(4)}`);
}

run().catch(console.error);
