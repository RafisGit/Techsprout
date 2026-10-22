// scratch/experiment-curriculum-retrieval.ts
import { TutorRetrievalService } from '../apps/api/src/modules/learning/tutor-retrieval.service';
import { createTestDatabase } from '../apps/api/src/test/test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../apps/api/src/database/schema';
import {
  BENCHMARK_COURSES,
  BENCHMARK_LESSONS,
  BENCHMARK_QUERIES,
  BenchmarkQuery
} from '../apps/api/src/test/benchmark-curriculum.fixture';
import * as crypto from 'crypto';
import { performance } from 'perf_hooks';

// DCG / IDCG / Recall metric functions
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

interface CurriculumConfig {
  candidatePoolSize: number; // e.g. 10, 15, 20
  anchorThreshold: number;   // minimum score to be considered anchor
  sameModuleBonus: number;   // bonus for being in same module as anchor
  prereqBonus: number;       // bonus for being prerequisite (lessonId == anchorId - 1)
  nextBonus: number;         // bonus for being successor (lessonId == anchorId + 1)
  dist2Bonus: number;        // bonus for distance 2 in same module
  maxBonusCap: number;       // maximum total bonus cap
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

  const tuningSet = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 0);
  const valSet = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 1);

  console.log(`Curriculum Retrieval Parameter Grid Search on Tuning Set (N=${tuningSet.length})...\n`);

  // Pre-fetch raw wide candidate pools for all queries to make grid search ultra fast
  const queryCandidatesMap = new Map<string, any[]>();
  for (const q of BENCHMARK_QUERIES) {
    const res = await service.retrieveContext(courseId, q.query, 25, { id: studentId, role: 'student' });
    queryCandidatesMap.set(q.query, res.citations.map(c => ({
      lessonId: uuidToNumId.get(c.lessonId)!,
      score: c.relevanceScore,
      lessonTitle: c.lessonTitle,
      moduleTitle: c.moduleTitle,
      courseId: BENCHMARK_LESSONS.find(l => l.id === uuidToNumId.get(c.lessonId)!)?.courseId,
    })));
  }

  function evaluateConfig(queries: BenchmarkQuery[], config: CurriculumConfig) {
    let totNdcg = 0, totRecall = 0, drops = 0;
    const catStats: Record<string, { ndcg: number[]; recall: number[] }> = {};

    for (const q of queries) {
      const candidates = (queryCandidatesMap.get(q.query) || []).slice(0, config.candidatePoolSize);
      if (candidates.length === 0) {
        drops++;
        continue;
      }

      // Identify anchors
      const anchors = candidates.filter(c => c.score >= config.anchorThreshold);

      // Calculate reranked scores
      const reranked = candidates.map(c => {
        let bonus = 0;
        const cLesson = BENCHMARK_LESSONS.find(l => l.id === c.lessonId)!;

        for (const a of anchors) {
          if (a.lessonId === c.lessonId) continue;
          const aLesson = BENCHMARK_LESSONS.find(l => l.id === a.lessonId)!;

          // Same module
          if (aLesson.courseId === cLesson.courseId && aLesson.moduleTitle === cLesson.moduleTitle) {
            bonus += config.sameModuleBonus;
            const dist = cLesson.id - aLesson.id;
            if (dist === -1) bonus += config.prereqBonus;
            else if (dist === 1) bonus += config.nextBonus;
            else if (Math.abs(dist) === 2) bonus += config.dist2Bonus;
          }
        }

        const effectiveBonus = Math.min(config.maxBonusCap, bonus);
        return {
          lessonId: c.lessonId,
          score: c.score + effectiveBonus
        };
      });

      reranked.sort((a, b) => b.score - a.score);
      const top5Ids = reranked.slice(0, 5).map(r => r.lessonId);
      const ev = evaluate(top5Ids, q.relevant, 5);
      totNdcg += ev.ndcg;
      totRecall += ev.recall;

      if (!catStats[q.category]) catStats[q.category] = { ndcg: [], recall: [] };
      catStats[q.category].ndcg.push(ev.ndcg);
      catStats[q.category].recall.push(ev.recall);
    }

    return {
      ndcg: totNdcg / queries.length,
      recall: totRecall / queries.length,
      drops,
      catStats
    };
  }

  // Grid sweep over parameters on TUNING SET
  let bestTuneRecall = -1;
  let bestConfig: CurriculumConfig | null = null;
  let bestTuneResult: any = null;

  const poolSizes = [5, 8, 10, 15, 20];
  const anchorThresholds = [0.4, 0.5, 0.6, 0.7];
  const sameModuleBonuses = [0.0, 0.02, 0.05];
  const prereqBonuses = [0.0, 0.03, 0.06, 0.10, 0.15];
  const nextBonuses = [0.0, 0.03, 0.06, 0.10, 0.15];
  const dist2Bonuses = [0.0, 0.02];
  const maxCaps = [0.05, 0.10, 0.15, 0.20];

  for (const candidatePoolSize of poolSizes) {
    for (const anchorThreshold of anchorThresholds) {
      for (const sameModuleBonus of sameModuleBonuses) {
        for (const prereqBonus of prereqBonuses) {
          for (const nextBonus of nextBonuses) {
            for (const dist2Bonus of dist2Bonuses) {
              for (const maxBonusCap of maxCaps) {
                const cfg: CurriculumConfig = {
                  candidatePoolSize,
                  anchorThreshold,
                  sameModuleBonus,
                  prereqBonus,
                  nextBonus,
                  dist2Bonus,
                  maxBonusCap
                };
                const res = evaluateConfig(tuningSet, cfg);
                if (res.recall > bestTuneRecall || (res.recall === bestTuneRecall && res.ndcg > (bestTuneResult?.ndcg || 0))) {
                  bestTuneRecall = res.recall;
                  bestConfig = cfg;
                  bestTuneResult = res;
                }
              }
            }
          }
        }
      }
    }
  }

  console.log('--- BEST CONFIGURATION FOUND ON TUNING SET ---');
  console.log(JSON.stringify(bestConfig, null, 2));
  console.log(`Tuning Set Results: Recall@5 = ${bestTuneResult.recall.toFixed(4)}, NDCG@5 = ${bestTuneResult.ndcg.toFixed(4)}\n`);

  // Now FREEZE configuration and evaluate on Validation Set
  console.log('--- EVALUATING FROZEN CONFIGURATION ON VALIDATION SET (N=16) ---');
  const valResult = evaluateConfig(valSet, bestConfig!);
  console.log(`Validation Set Results: Recall@5 = ${valResult.recall.toFixed(4)}, NDCG@5 = ${valResult.ndcg.toFixed(4)}, Drops = ${valResult.drops}\n`);

  // Full Suite Evaluation
  console.log('--- EVALUATING FROZEN CONFIGURATION ON FULL SUITE (N=32) ---');
  const fullResult = evaluateConfig(BENCHMARK_QUERIES, bestConfig!);
  console.log(`Full Suite Results: Recall@5 = ${fullResult.recall.toFixed(4)}, NDCG@5 = ${fullResult.ndcg.toFixed(4)}, Drops = ${fullResult.drops}\n`);

  // Category breakdown for full suite
  console.log('--- PER-CATEGORY BREAKDOWN (FULL SUITE) ---');
  for (const [cat, stats] of Object.entries(fullResult.catStats)) {
    const avgNdcg = stats.ndcg.reduce((a, b) => a + b, 0) / stats.ndcg.length;
    const avgRec = stats.recall.reduce((a, b) => a + b, 0) / stats.recall.length;
    console.log(`  ${cat.padEnd(25)}: NDCG@5 = ${avgNdcg.toFixed(4)}, Recall@5 = ${avgRec.toFixed(4)}`);
  }

  // Also evaluate baseline (poolSize=5, zero bonuses)
  const baselineConfig: CurriculumConfig = {
    candidatePoolSize: 5,
    anchorThreshold: 1.0,
    sameModuleBonus: 0,
    immediateAdjBonus: 0,
    dist2AdjBonus: 0,
    maxBonusCap: 0
  };
  const baseTune = evaluateConfig(tuningSet, baselineConfig);
  const baseVal = evaluateConfig(valSet, baselineConfig);
  const baseFull = evaluateConfig(BENCHMARK_QUERIES, baselineConfig);

  console.log('\n--- BASELINE VS CURRICULUM-AWARE COMPARISON TABLE ---');
  console.log('METRIC                 | BASELINE BM25 | CURRICULUM-AWARE | TARGET  | DELTA');
  console.log('-----------------------+---------------+------------------+---------+-------');
  console.log(`Tuning Recall@5        | ${baseTune.recall.toFixed(4)}        | ${bestTuneResult.recall.toFixed(4)}           | >= 0.85 | ${(bestTuneResult.recall - baseTune.recall >= 0 ? '+' : '')}${(bestTuneResult.recall - baseTune.recall).toFixed(4)}`);
  console.log(`Tuning NDCG@5          | ${baseTune.ndcg.toFixed(4)}        | ${bestTuneResult.ndcg.toFixed(4)}           | >= 0.80 | ${(bestTuneResult.ndcg - baseTune.ndcg >= 0 ? '+' : '')}${(bestTuneResult.ndcg - baseTune.ndcg).toFixed(4)}`);
  console.log(`Validation Recall@5    | ${baseVal.recall.toFixed(4)}        | ${valResult.recall.toFixed(4)}           | >= 0.85 | ${(valResult.recall - baseVal.recall >= 0 ? '+' : '')}${(valResult.recall - baseVal.recall).toFixed(4)}`);
  console.log(`Validation NDCG@5      | ${baseVal.ndcg.toFixed(4)}        | ${valResult.ndcg.toFixed(4)}           | >= 0.80 | ${(valResult.ndcg - baseVal.ndcg >= 0 ? '+' : '')}${(valResult.ndcg - baseVal.ndcg).toFixed(4)}`);
  console.log(`Full Suite Recall@5    | ${baseFull.recall.toFixed(4)}        | ${fullResult.recall.toFixed(4)}           | >= 0.85 | ${(fullResult.recall - baseFull.recall >= 0 ? '+' : '')}${(fullResult.recall - baseFull.recall).toFixed(4)}`);
  console.log(`Full Suite NDCG@5      | ${baseFull.ndcg.toFixed(4)}        | ${fullResult.ndcg.toFixed(4)}           | >= 0.80 | ${(fullResult.ndcg - baseFull.ndcg >= 0 ? '+' : '')}${(fullResult.ndcg - baseFull.ndcg).toFixed(4)}`);
}

run().catch(console.error);
