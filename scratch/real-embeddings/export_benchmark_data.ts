// scratch/real-embeddings/export_benchmark_data.ts
import { createTestDatabase } from '../../apps/api/src/test/test-helper';
import { TutorRetrievalService } from '../../apps/api/src/modules/learning/tutor-retrieval.service';
import { courses, modules, lessons, enrollments, users, categories } from '../../apps/api/src/database/schema';
import {
  BENCHMARK_COURSES,
  BENCHMARK_LESSONS,
  BENCHMARK_QUERIES
} from '../../apps/api/src/test/benchmark-curriculum.fixture';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

async function exportData() {
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

  // Pre-generate chunks exactly as TutorRetrievalService chunks them
  const allChunks = BENCHMARK_LESSONS.flatMap(l => service.chunkLesson(courseId, {
    id: numIdToUuid.get(l.id)!,
    title: l.title,
    description: l.moduleTitle,
    content: l.content,
    moduleId: moduleMap.get(l.courseId)!,
    moduleTitle: l.moduleTitle
  }));

  const chunksExport = allChunks.map(c => ({
    chunkId: c.id,
    lessonId: uuidToNumId.get(c.lessonId)!,
    lessonTitle: c.lessonTitle,
    moduleTitle: c.moduleTitle,
    content: c.content
  }));

  // Run BM25 for each benchmark query through the authoritative TutorRetrievalService
  const queryRuns = [];
  for (let i = 0; i < BENCHMARK_QUERIES.length; i++) {
    const q = BENCHMARK_QUERIES[i];
    const res = await service.retrieveContext(courseId, q.query, 100, { id: studentId, role: 'student' });
    const citations = res.citations.map(c => ({
      lessonId: uuidToNumId.get(c.lessonId)!,
      score: c.relevanceScore,
      title: c.lessonTitle
    }));
    queryRuns.push({
      queryIndex: i,
      query: q.query,
      category: q.category,
      relevant: q.relevant,
      bm25Citations: citations
    });
  }

  const exportPayload = {
    lessons: BENCHMARK_LESSONS,
    chunks: chunksExport,
    queries: queryRuns
  };

  const outPath = path.resolve(__dirname, 'benchmark_data.json');
  fs.writeFileSync(outPath, JSON.stringify(exportPayload, null, 2), 'utf-8');
  console.log(`Successfully exported benchmark data to ${outPath}`);
  console.log(`Lessons: ${BENCHMARK_LESSONS.length}, Chunks: ${chunksExport.length}, Queries: ${queryRuns.length}`);
}

exportData().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
