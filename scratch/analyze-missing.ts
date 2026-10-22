// scratch/analyze-missing.ts
import { TutorRetrievalService } from '../apps/api/src/modules/learning/tutor-retrieval.service';
import { createTestDatabase } from '../apps/api/src/test/test-helper';
import { courses, modules, lessons, enrollments, users, categories } from '../apps/api/src/database/schema';
import {
  BENCHMARK_COURSES,
  BENCHMARK_LESSONS,
  BENCHMARK_QUERIES,
} from '../apps/api/src/test/benchmark-curriculum.fixture';
import * as crypto from 'crypto';

async function main() {
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

  console.log('--- DETAILED QUERY-BY-QUERY ANALYSIS (TOP 5 vs TOP 10) ---');
  for (let i = 0; i < BENCHMARK_QUERIES.length; i++) {
    const q = BENCHMARK_QUERIES[i];
    const res = await service.retrieveContext(courseId, q.query, 15, { id: studentId, role: 'student' });
    const top5 = res.citations.slice(0, 5).map(c => uuidToNumId.get(c.lessonId)!);
    const top10 = res.citations.slice(0, 10).map(c => uuidToNumId.get(c.lessonId)!);
    const top15 = res.citations.slice(0, 15).map(c => uuidToNumId.get(c.lessonId)!);
    const expected = Object.entries(q.relevant).map(([id]) => Number(id));
    const inTop5 = expected.filter(id => top5.includes(id));
    const inTop10 = expected.filter(id => top10.includes(id));
    const inTop15 = expected.filter(id => top15.includes(id));
    const recall5 = inTop5.length / expected.length;
    const recall10 = inTop10.length / expected.length;
    const recall15 = inTop15.length / expected.length;

    if (recall5 < 0.85) {
      console.log(`\nQ${i + 1} [${q.category}] "${q.query}":`);
      console.log(`  Recall@5: ${recall5.toFixed(2)} (${inTop5.length}/${expected.length}) | Retrieved Top5: [${top5.join(', ')}]`);
      console.log(`  Recall@10: ${recall10.toFixed(2)} (${inTop10.length}/${expected.length}) | Recall@15: ${recall15.toFixed(2)}`);
      const missingFromTop5 = expected.filter(id => !top5.includes(id));
      for (const mId of missingFromTop5) {
        const l = BENCHMARK_LESSONS.find(x => x.id === mId);
        const rankInAll = top15.indexOf(mId) + 1;
        const rankStr = rankInAll > 0 ? `Rank ${rankInAll}` : 'Rank > 15';
        console.log(`    Missing: Lesson ${mId} (Course ${l?.courseId}, Module: "${l?.moduleTitle}", Pos: ${l?.id}) -> "${l?.title}" [${rankStr}]`);
      }
    }
  }
}

main().catch(console.error);
