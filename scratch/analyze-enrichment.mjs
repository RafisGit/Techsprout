import { LESSONS, BENCHMARK_QUERIES } from './benchmark-curriculum.mjs';
import { retrieveEnhancedBM25, evaluateResults } from './evaluate-retrieval.mjs';

console.log('=== MISSING LESSON ANALYSIS ===\n');

for (let i = 0; i < BENCHMARK_QUERIES.length; i++) {
  const q = BENCHMARK_QUERIES[i];
  const ret = retrieveEnhancedBM25(q.query, LESSONS);
  const evalRes = evaluateResults(ret, q.relevant, 5);

  const top5 = ret.slice(0, 5);
  const expected = Object.entries(q.relevant).map(([id]) => Number(id));
  const missing = expected.filter(id => !top5.includes(id));

  if (missing.length > 0) {
    const isTuning = (i % 2 === 0) ? 'TUNING' : 'VALIDATION';
    console.log(`[${isTuning}] Q${i+1} (${q.id}) [${q.category}] "${q.query}"`);
    console.log(`  Recall@5: ${evalRes.recall.toFixed(2)}, NDCG@5: ${evalRes.ndcg.toFixed(2)}`);
    console.log(`  Retrieved top 5: [${top5.join(', ')}]`);
    console.log(`  Expected: [${expected.join(', ')}]`);
    console.log(`  Missing: [${missing.join(', ')}]`);
    for (const mId of missing) {
      const l = LESSONS.find(x => x.id === mId);
      const grade = q.relevant[mId];
      const rank = ret.indexOf(mId) + 1;
      const rankStr = rank > 0 ? `Rank ${rank}` : 'Not in top results';
      console.log(`    - Lesson ${mId} (G${grade}) [${rankStr}] in Course "${l.courseTitle}" / Module "${l.moduleTitle}":`);
      console.log(`      Title: "${l.title}"`);
      console.log(`      Content snippet: "${l.content.slice(0, 160)}..."`);
    }
    console.log('');
  }
}
