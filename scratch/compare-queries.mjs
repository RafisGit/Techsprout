// scratch/compare-queries.mjs
import { LESSONS, BENCHMARK_QUERIES } from './benchmark-curriculum.mjs';
import { retrieveEnhancedBM25, evaluateResults } from './evaluate-retrieval.mjs';
import { buildCurriculumMetadata } from './evaluate-metadata-impact.mjs';

const metadataMap = buildCurriculumMetadata();
const enrichedLessons = LESSONS.map(l => {
  const tags = metadataMap.get(l.id) || [];
  const tagString = tags.join(' ');
  return {
    ...l,
    description: `${l.moduleTitle}. Tags: ${tagString}`,
    content: `${l.content}\nTags: ${tagString}`
  };
});

const validationQueries = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 1);

console.log('=== VALIDATION SET QUERY-BY-QUERY COMPARISON ===\n');

for (const q of validationQueries) {
  const retBase = retrieveEnhancedBM25(q.query, LESSONS);
  const evalBase = evaluateResults(retBase, q.relevant, 5);

  const retEnriched = retrieveEnhancedBM25(q.query, enrichedLessons);
  const evalEnriched = evaluateResults(retEnriched, q.relevant, 5);

  const deltaRecall = evalEnriched.recall - evalBase.recall;
  const deltaNdcg = evalEnriched.ndcg - evalBase.ndcg;

  const flag = deltaRecall < 0 ? '❌ DEGRADED' : deltaRecall > 0 ? '✅ IMPROVED' : '⚪ NEUTRAL';

  console.log(`${q.id} [${q.category}] "${q.query}" -> ${flag}`);
  console.log(`  Base:     Recall@5 = ${evalBase.recall.toFixed(4)}, NDCG@5 = ${evalBase.ndcg.toFixed(4)} | Top 5: [${retBase.slice(0, 5).join(', ')}]`);
  console.log(`  Enriched: Recall@5 = ${evalEnriched.recall.toFixed(4)}, NDCG@5 = ${evalEnriched.ndcg.toFixed(4)} | Top 5: [${retEnriched.slice(0, 5).join(', ')}]`);
  console.log(`  Expected: [${Object.keys(q.relevant).join(', ')}]`);
  console.log(`  Delta Recall: ${deltaRecall > 0 ? '+' : ''}${deltaRecall.toFixed(4)}, Delta NDCG: ${deltaNdcg > 0 ? '+' : ''}${deltaNdcg.toFixed(4)}\n`);
}
