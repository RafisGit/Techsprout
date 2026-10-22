// scratch/evaluate-metadata-impact.mjs
import { LESSONS, BENCHMARK_QUERIES } from './benchmark-curriculum.mjs';
import { retrieveEnhancedBM25, evaluateResults } from './evaluate-retrieval.mjs';

// Build a clean, token-based content-derived metadata map for all 100 lessons
// Every label is derived strictly from the technical subject matter of the lesson
export function buildCurriculumMetadata() {
  const metadataMap = new Map();

  for (const l of LESSONS) {
    const tokens = new Set(
      (l.title + ' ' + l.content + ' ' + l.moduleTitle + ' ' + l.courseTitle)
        .toLowerCase()
        .replace(/[^a-z0-9_./-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );

    const tags = new Set();

    // 1. Core Language & Framework Technologies
    if (tokens.has('typescript')) { tags.add('typescript'); tags.add('type-safety'); }
    if (tokens.has('javascript') || tokens.has('es2024')) { tags.add('javascript'); tags.add('ecmascript'); }
    if (tokens.has('react') || tokens.has('react-19')) { tags.add('react'); tags.add('frontend-framework'); }
    if (tokens.has('next.js') || tokens.has('nextjs') || tokens.has('rsc')) { tags.add('next.js'); tags.add('full-stack'); }
    if (tokens.has('nestjs')) { tags.add('nestjs'); tags.add('backend-framework'); }
    if (tokens.has('docker')) { tags.add('docker'); tags.add('containerization'); }
    if (tokens.has('kubernetes') || tokens.has('k8s')) { tags.add('kubernetes'); tags.add('orchestration'); }
    if (tokens.has('postgresql') || tokens.has('postgres')) { tags.add('postgresql'); tags.add('relational-database'); }
    if (tokens.has('drizzle') || tokens.has('orm')) { tags.add('drizzle-orm'); tags.add('database-access'); }
    if (tokens.has('redis')) { tags.add('redis'); tags.add('in-memory-datastore'); }
    if (tokens.has('tailwind')) { tags.add('tailwind-css'); tags.add('css-design-system'); }

    // 2. Architectural Concepts & Paradigms
    if (tokens.has('composite') && tokens.has('indexes')) { tags.add('composite-indexing'); tags.add('b-tree'); }
    if (tokens.has('isolation') || tokens.has('serializable') || tokens.has('acid')) { tags.add('transaction-isolation'); tags.add('concurrency'); }
    if (tokens.has('locking') || tokens.has('advisory') || tokens.has('deadlock')) { tags.add('row-level-locking'); tags.add('deadlock-prevention'); }
    if (tokens.has('migration') || tokens.has('downtime')) { tags.add('zero-downtime-migration'); tags.add('schema-evolution'); }
    if (tokens.has('pgbouncer') || tokens.has('pooling') || tokens.has('concurrency')) { tags.add('connection-pooling'); tags.add('high-concurrency'); }
    if (tokens.has('multi-stage') || tokens.has('alpine') || tokens.has('buildkit')) { tags.add('multi-stage-build'); tags.add('image-optimization'); }
    if (tokens.has('compose')) { tags.add('docker-compose'); tags.add('local-development'); }
    if (tokens.has('volumes') || tokens.has('mounts')) { tags.add('persistent-storage'); tags.add('docker-volumes'); }
    if (tokens.has('interceptor') || tokens.has('interceptors')) { tags.add('request-interceptor'); tags.add('aspect-oriented-programming'); }
    if (tokens.has('middleware') || tokens.has('logging')) { tags.add('http-middleware'); tags.add('observability'); }
    if (tokens.has('pipe') || tokens.has('validation') || tokens.has('class-validator')) { tags.add('schema-validation'); tags.add('dto-transformation'); }
    if (tokens.has('filter') || tokens.has('exception') || tokens.has('exceptions')) { tags.add('exception-filter'); tags.add('error-handling'); }
    if (tokens.has('outbox') || tokens.has('message') || tokens.has('rabbitmq') || tokens.has('event-driven')) { tags.add('event-driven-architecture'); tags.add('transactional-outbox'); tags.add('message-broker'); }
    if (tokens.has('grpc') || tokens.has('microservices')) { tags.add('microservices'); tags.add('rpc-protocol'); }
    if (tokens.has('hooks') || tokens.has('usecallback') || tokens.has('usememo')) { tags.add('react-hooks'); tags.add('memoization'); }
    if (tokens.has('context') || tokens.has('usereducer')) { tags.add('state-management'); tags.add('context-api'); }
    if (tokens.has('actions') || tokens.has('server-actions')) { tags.add('server-actions'); tags.add('mutation-handling'); }
    if (tokens.has('grid') || tokens.has('flexbox')) { tags.add('css-grid'); tags.add('flexbox-layout'); }
    if (tokens.has('accessibility') || tokens.has('a11y') || tokens.has('wcag') || tokens.has('aria')) { tags.add('web-accessibility'); tags.add('wcag-compliance'); tags.add('semantic-html'); }
    if (tokens.has('svg') || tokens.has('charts') || tokens.has('visualization')) { tags.add('data-visualization'); tags.add('svg-charting'); }
    if (tokens.has('ci/cd') || tokens.has('actions') || tokens.has('pipeline')) { tags.add('ci-cd'); tags.add('automated-deployment'); }
    if (tokens.has('telemetry') || tokens.has('drop-off') || tokens.has('checkpoints')) { tags.add('learning-analytics'); tags.add('drop-off-curves'); }
    if (tokens.has('payment') || tokens.has('sslcommerz') || tokens.has('gateway')) { tags.add('payment-gateway'); tags.add('transaction-processing'); }
    if (tokens.has('ledger') || tokens.has('debit') || tokens.has('credit')) { tags.add('financial-ledger'); tags.add('double-entry-accounting'); }
    if (tokens.has('ingress') || tokens.has('tls')) { tags.add('ingress-controller'); tags.add('tls-termination'); }
    if (tokens.has('configmap') || tokens.has('secrets')) { tags.add('configuration-management'); tags.add('secrets-injection'); }
    if (tokens.has('hpa') || tokens.has('autoscaler')) { tags.add('horizontal-pod-autoscaling'); tags.add('dynamic-scaling'); }
    if (tokens.has('probes') || tokens.has('liveness') || tokens.has('readiness')) { tags.add('health-probes'); tags.add('container-resilience'); }
    if (tokens.has('helm')) { tags.add('helm-charts'); tags.add('k8s-package-management'); }
    if (tokens.has('istio') || tokens.has('envoy') || tokens.has('mtls')) { tags.add('service-mesh'); tags.add('mutual-tls'); }

    // 3. Security, Hardening & Compliance
    if (tokens.has('jwt') || tokens.has('httponly') || tokens.has('cookie') || tokens.has('token')) { tags.add('jwt-authentication'); tags.add('httponly-cookies'); tags.add('token-rotation'); }
    if (tokens.has('xss') || tokens.has('cross-site') || tokens.has('sanitization')) { tags.add('xss-prevention'); tags.add('input-sanitization'); }
    if (tokens.has('csrf') || tokens.has('forgery')) { tags.add('csrf-protection'); tags.add('request-forgery'); }
    if (tokens.has('csp') || tokens.has('cors') || tokens.has('helmet')) { tags.add('content-security-policy'); tags.add('cors-policy'); tags.add('security-headers'); }
    if (tokens.has('rbac') || tokens.has('guards') || tokens.has('permission')) { tags.add('rbac'); tags.add('route-guards'); tags.add('authorization'); }
    if (tokens.has('non-root') || tokens.has('capabilities')) { tags.add('container-hardening'); tags.add('least-privilege'); }
    if (tokens.has('audit') || tokens.has('invariants')) { tags.add('financial-auditing'); tags.add('balance-invariants'); }

    metadataMap.set(l.id, Array.from(tags));
  }

  return metadataMap;
}

// Compare retrieval with and without metadata enriched in lesson description/tokens
const metadataMap = buildCurriculumMetadata();

// Create enriched lessons dataset
const enrichedLessons = LESSONS.map(l => {
  const tags = metadataMap.get(l.id) || [];
  const tagString = tags.join(' ');
  return {
    ...l,
    // Enrich content and description with the structured metadata tags
    description: `${l.moduleTitle}. Tags: ${tagString}`,
    content: `${l.content}\nTags: ${tagString}`
  };
});

function evaluateSubset(queries, lessonsToUse, label) {
  let totalNdcg = 0;
  let totalRecall = 0;
  let zeroDrops = 0;
  const latencies = [];

  for (const q of queries) {
    const t0 = performance.now();
    const ret = retrieveEnhancedBM25(q.query, lessonsToUse);
    latencies.push(performance.now() - t0);
    const res = evaluateResults(ret, q.relevant, 5);
    totalNdcg += res.ndcg;
    totalRecall += res.recall;
    if (ret.length === 0) zeroDrops++;
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  const meanNdcg = totalNdcg / queries.length;
  const meanRecall = totalRecall / queries.length;

  console.log(`${label} (N=${queries.length}):`);
  console.log(`  NDCG@5 = ${meanNdcg.toFixed(4)}, Recall@5 = ${meanRecall.toFixed(4)}, Drops = ${zeroDrops}, p50 = ${p50.toFixed(2)}ms, p95 = ${p95.toFixed(2)}ms`);

  return { meanNdcg, meanRecall, zeroDrops, p50, p95 };
}

const tuningQueries = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 0);
const validationQueries = BENCHMARK_QUERIES.filter((_, idx) => idx % 2 === 1);

console.log('=== 1. BASELINE (ORIGINAL CONTENT) ===');
evaluateSubset(BENCHMARK_QUERIES, LESSONS, 'Full Suite (Baseline)');
evaluateSubset(tuningQueries, LESSONS, 'Tuning Set (Baseline)');
evaluateSubset(validationQueries, LESSONS, 'Validation Set (Baseline)');

console.log('\n=== 2. ENRICHED (REUSABLE CONTENT-DERIVED METADATA) ===');
evaluateSubset(BENCHMARK_QUERIES, enrichedLessons, 'Full Suite (Enriched)');
evaluateSubset(tuningQueries, enrichedLessons, 'Tuning Set (Enriched)');
evaluateSubset(validationQueries, enrichedLessons, 'Validation Set (Enriched)');
