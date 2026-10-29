import { Injectable, Inject, Optional, HttpStatus } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { lessons, modules, courses, enrollments } from '../../database/schema';
import { ApiException } from '../../common/errors/api-error';
import { UserContext } from '../courses/courses.service';
import {
  TutorCitationDto,
  TutorRetrievalResultDto,
  ContextChunkDto,
  IndexedChunkDto,
} from '@techsprout/contracts';
import { TutorIndexingService } from './tutor-indexing.service';
import { TutorEmbeddingService } from './tutor-embedding.service';

interface ScoredChunk {
  chunk: ContextChunkDto;
  score: number;
}

// ============================================================================
// STOP WORDS & TECHNICAL VOCABULARY SYNONYMS
// ============================================================================

export const RETRIEVAL_STOP_WORDS = new Set([
  'how', 'to', 'what', 'is', 'are', 'why', 'for', 'in', 'on', 'at', 'the', 'a',
  'an', 'of', 'with', 'and', 'or', 'does', 'differ', 'from', 'best', 'practices',
  'guide', 'strategy', 'strategies', 'setting', 'up', 'build', 'building', 'using',
  'prevent', 'implement', 'calculating', 'configuring', 'managing', 'under', 'across', 'end',
]);

export const TECHNICAL_SYNONYMS: Record<string, string[]> = {
  // Container & Cloud
  docker: ['container', 'image', 'dockerfile', 'alpine'],
  container: ['docker', 'image', 'pod'],
  k8s: ['kubernetes', 'cluster', 'pod', 'ingress'],
  kubernetes: ['k8s', 'cluster', 'orchestration', 'pod'],
  cluster: ['kubernetes', 'k8s', 'nodes'],
  ingress: ['controller', 'tls', 'routing', 'loadbalancer'],
  cicd: ['ci/cd', 'pipeline', 'github actions', 'automation'],
  'ci/cd': ['cicd', 'pipeline', 'github actions', 'continuous integration'],
  pipeline: ['ci/cd', 'github actions', 'workflow'],
  terraform: ['iac', 'infrastructure', 'provisioning'],

  // Database & Storage
  postgres: ['postgresql', 'psql', 'rdbms', 'sql'],
  postgresql: ['postgres', 'psql', 'rdbms', 'sql'],
  drizzle: ['orm', 'sql', 'query builder', 'schema'],
  orm: ['drizzle', 'database', 'sql'],
  index: ['indexes', 'indexing', 'btree', 'composite'],
  indexes: ['index', 'indexing', 'btree', 'composite'],
  composite: ['index', 'indexes', 'multi-column'],
  pool: ['pooling', 'connection pool', 'connections'],
  pooling: ['pool', 'connections', 'connection pool'],
  redis: ['cache', 'caching', 'eviction', 'bullmq'],
  cache: ['redis', 'caching', 'expiration', 'eviction'],

  // Backend & Architecture
  nestjs: ['nest', 'node.js', 'interceptors', 'guards', 'modules'],
  nest: ['nestjs', 'node.js'],
  node: ['nodejs', 'node.js', 'javascript'],
  nodejs: ['node', 'node.js', 'javascript'],
  'node.js': ['node', 'nodejs', 'javascript'],
  interceptor: ['interceptors', 'middleware', 'logging'],
  interceptors: ['interceptor', 'middleware', 'pipeline'],
  outbox: ['events', 'message queue', 'debezium', 'event-driven'],
  events: ['outbox', 'event-driven', 'pubsub', 'queue'],
  bullmq: ['queue', 'worker', 'redis', 'background'],

  // Frontend & React
  react: ['components', 'hooks', 'frontend', 'jsx'],
  hooks: ['usecallback', 'usememo', 'useeffect', 'usestate', 'lifecycle'],
  usecallback: ['hooks', 'memoization', 'dependency array'],
  context: ['state', 'reducer', 'state management'],
  reducer: ['context', 'state management', 'dispatch'],
  css: ['grid', 'flexbox', 'layout', 'tailwind', 'styling'],
  grid: ['css grid', 'layout', 'subgrid', 'flexbox'],
  flexbox: ['layout', 'css', 'alignment', 'grid'],
  svg: ['charts', 'visualization', 'accessible', 'graph'],

  // Security & Auth
  auth: ['authentication', 'jwt', 'session', 'guards', 'login'],
  authentication: ['auth', 'jwt', 'tokens', 'credentials'],
  jwt: ['tokens', 'refresh token', 'access token', 'bearer'],
  httponly: ['http-only', 'cookies', 'cookie', 'security'],
  'http-only': ['httponly', 'cookies', 'cookie', 'security'],
  cookie: ['cookies', 'httponly', 'http-only', 'session'],
  cookies: ['cookie', 'httponly', 'http-only', 'session'],
  xss: ['csrf', 'sanitization', 'security', 'cross-site'],
  csrf: ['xss', 'security', 'protection', 'tokens'],
  injection: ['sql injection', 'sanitization', 'parameterized'],

  // Payments & Finance
  sslcommerz: ['payment', 'gateway', 'ipn', 'checkout'],
  gateway: ['sslcommerz', 'payment', 'bkash', 'nagad'],
  payment: ['sslcommerz', 'gateway', 'checkout', 'transaction'],
  ledger: ['wallets', 'double-entry', 'accounting', 'poisha'],
  wallet: ['wallets', 'payout', 'balance', 'earnings'],
  payout: ['wallet', 'disbursement', 'settlement'],
};

// ============================================================================
// FUZZY TRIGRAM MATCHING UTILITIES
// ============================================================================

export function getTrigrams(str: string): Set<string> {
  const padded = `  ${str.toLowerCase()} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

export function trigramSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);
  let intersection = 0;
  for (const tri of t1) {
    if (t2.has(tri)) intersection++;
  }
  return (2.0 * intersection) / (t1.size + t2.size);
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

@Injectable()
export class TutorRetrievalService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Optional() @Inject(TutorIndexingService) private readonly indexingService?: TutorIndexingService,
    @Optional() @Inject(TutorEmbeddingService) private readonly embeddingService?: TutorEmbeddingService
  ) {}

  /**
   * Technical token normalizer:
   * Splits compound punctuated technical identifiers (e.g., "ci/cd", "node.js", "http-only")
   * into both exact compound tokens and constituent word stems (Config C baseline).
   */
  public tokenize(text: string): string[] {
    if (!text) return [];
    const normalized = text.toLowerCase();

    // 1. Extract compound technical tokens (e.g. "ci/cd", "node.js", "next.js", "nest.js")
    const technicalTokens = normalized.match(/[a-z0-9]+[./\-_][a-z0-9./\-_]*/g) || [];

    // 2. Extract standard alphanumeric words
    const standardWords = normalized.match(/[a-z0-9]+/g) || [];

    // 3. Decompose technical tokens into sub-tokens (e.g., "node.js" -> ["node", "js"])
    const subTokens = technicalTokens.flatMap((token) =>
      token.split(/[./\-_]/).filter((part) => part.length > 1)
    );

    const tokenSet = new Set<string>([...technicalTokens, ...standardWords, ...subTokens]);
    return Array.from(tokenSet);
  }

  /**
   * Chunks lesson content into semantic segments with title and module context.
   */
  public chunkLesson(
    courseId: string,
    lesson: {
      id: string;
      title: string;
      description?: string | null;
      content?: string | null;
      moduleId?: string | null;
      moduleTitle?: string | null;
    }
  ): ContextChunkDto[] {
    const chunks: ContextChunkDto[] = [];
    const fullText = [lesson.description, lesson.content].filter(Boolean).join('\n\n');

    if (!fullText.trim()) {
      // Chunk from title only if body is empty
      chunks.push({
        id: `${lesson.id}-0`,
        courseId,
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        content: `Lesson: ${lesson.title}. Module: ${lesson.moduleTitle || 'General'}.`,
        tokens: this.tokenize(`${lesson.title} ${lesson.moduleTitle || ''}`),
      });
      return chunks;
    }

    // Split text into paragraphs / sections
    const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    let chunkIndex = 0;
    let currentChunkText = `Lesson: ${lesson.title}\n`;

    for (const p of paragraphs) {
      if ((currentChunkText + '\n' + p).split(/\s+/).length > 200 && currentChunkText.length > 100) {
        chunks.push({
          id: `${lesson.id}-${chunkIndex++}`,
          courseId,
          moduleId: lesson.moduleId,
          moduleTitle: lesson.moduleTitle,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          content: currentChunkText.trim(),
          tokens: this.tokenize(
            `${lesson.title} ${lesson.moduleTitle || ''} ${currentChunkText}`
          ),
        });
        currentChunkText = `Lesson: ${lesson.title}\n${p}`;
      } else {
        currentChunkText += `\n${p}`;
      }
    }

    if (currentChunkText.trim().length > 0) {
      chunks.push({
        id: `${lesson.id}-${chunkIndex}`,
        courseId,
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        content: currentChunkText.trim(),
        tokens: this.tokenize(
          `${lesson.title} ${lesson.moduleTitle || ''} ${currentChunkText}`
        ),
      });
    }

    return chunks;
  }

  /**
   * Verify learner authorization for the course before retrieval.
   */
  public async verifyAccess(courseId: string, user: UserContext): Promise<void> {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (user.role === 'admin' || (user.role === 'instructor' && course.instructorId === user.id)) {
      return;
    }

    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, user.id),
          eq(enrollments.courseId, courseId),
          eq(enrollments.status, 'ACTIVE')
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Learner does not possess an active enrollment in this course',
        HttpStatus.FORBIDDEN,
        'COURSE_NOT_ENROLLED'
      );
    }
  }

  /**
   * Grounded course context retrieval:
   * Retrieves relevant lesson citations strictly scoped to courseId with Okapi BM25 scoring,
   * field weighting, technical synonym expansion, and typo-tolerant trigram matching.
   */
  public async retrieveContext(
    courseId: string,
    question: string,
    maxCitations: number = 5,
    user?: UserContext
  ): Promise<TutorRetrievalResultDto> {
    if (user) {
      await this.verifyAccess(courseId, user);
    }

    // 1. Fetch pre-indexed chunks from TutorIndexingService if available
    let allChunks: (ContextChunkDto | IndexedChunkDto)[] = [];

    if (this.indexingService) {
      allChunks = await this.indexingService.getCourseChunks(courseId);
      if (allChunks.length === 0) {
        // Cold start: auto-index on first query
        const indexResult = await this.indexingService.indexCourse(courseId, 'MANUAL_REFRESH');
        if (indexResult.totalActiveChunks > 0) {
          allChunks = await this.indexingService.getCourseChunks(courseId);
        }
      }
    }

    // 2. Fallback to direct DB query if indexingService is not injected or empty
    if (allChunks.length === 0) {
      const courseLessons = await this.db
        .select({
          id: lessons.id,
          title: lessons.title,
          description: lessons.description,
          content: lessons.content,
          moduleId: lessons.moduleId,
          moduleTitle: modules.title,
        })
        .from(lessons)
        .innerJoin(modules, eq(lessons.moduleId, modules.id))
        .where(eq(modules.courseId, courseId));

      if (courseLessons.length === 0) {
        return {
          courseId,
          query: question,
          citations: [],
          totalCandidateCount: 0,
          isGrounded: false,
          groundingNotice: 'This concept is not covered in this course curriculum',
        };
      }

      allChunks = courseLessons.flatMap((l) => this.chunkLesson(courseId, l));
    }

    const rawQueryTokens = this.tokenize(question);
    if (rawQueryTokens.length === 0) {
      return {
        courseId,
        query: question,
        citations: [],
        totalCandidateCount: allChunks.length,
        isGrounded: false,
        groundingNotice: 'Query contained no searchable terms',
      };
    }

    // 3. Pre-compute Document Frequencies, Vocab, and Tokenized Fields for BM25
    const N = allChunks.length;
    const chunkTokensList = allChunks.map((chunk) => {
      const titleTokens = this.tokenize(chunk.lessonTitle || '');
      const moduleTokens = this.tokenize(chunk.moduleTitle || '');
      const contentTokens = this.tokenize(chunk.content || '');
      const allTokens = Array.from(new Set([...chunk.tokens, ...titleTokens, ...moduleTokens, ...contentTokens]));
      return {
        chunk,
        titleTokens,
        moduleTokens,
        contentTokens,
        allTokens,
        length: allTokens.length,
      };
    });

    const totalDocLen = chunkTokensList.reduce((acc, c) => acc + c.length, 0);
    const avgdl = N > 0 ? totalDocLen / N : 1;

    const dfMap = new Map<string, number>();
    const allVocab = new Set<string>();

    for (const c of chunkTokensList) {
      const uniqueInChunk = new Set(c.allTokens);
      for (const term of uniqueInChunk) {
        dfMap.set(term, (dfMap.get(term) || 0) + 1);
        allVocab.add(term);
      }
    }

    const vocabArray = Array.from(allVocab);

    // 4. Query term parsing, synonym expansion, and fuzzy trigram expansion
    interface QueryTerm {
      term: string;
      weight: number;
    }
    const queryTerms: QueryTerm[] = [];

    const substantiveTerms = rawQueryTokens.filter((t) => !RETRIEVAL_STOP_WORDS.has(t));
    const tokensToProcess = substantiveTerms.length > 0 ? substantiveTerms : rawQueryTokens;

    for (const token of tokensToProcess) {
      // Primary term
      queryTerms.push({ term: token, weight: 1.0 });

      // Synonym expansion
      const synonyms = TECHNICAL_SYNONYMS[token];
      if (synonyms) {
        for (const syn of synonyms) {
          queryTerms.push({ term: syn, weight: 0.75 });
        }
      }

      // Trigram fuzzy matching for typos/misspellings when term is not found in corpus
      const tokenDf = dfMap.get(token) || 0;
      if (tokenDf === 0 && token.length >= 4) {
        let bestMatch: string | null = null;
        let bestSim = 0;

        for (const vocabTerm of vocabArray) {
          if (Math.abs(vocabTerm.length - token.length) > 3) continue;
          const sim = trigramSimilarity(token, vocabTerm);
          if (sim > bestSim && sim >= 0.45) {
            bestSim = sim;
            bestMatch = vocabTerm;
          }
        }

        if (bestMatch && bestSim >= 0.45) {
          queryTerms.push({ term: bestMatch, weight: 0.60 * bestSim });
        }
      }
    }

    // 5. Semantic Embedding Generation (if hybrid vector search is configured)
    let queryEmbedding: number[] | null = null;
    if (this.embeddingService) {
      queryEmbedding = await this.embeddingService.generateEmbedding(question);
    }

    // 6. Okapi BM25 Field-Weighted Scoring
    const k1 = 1.2;
    const b = 0.75;
    const wTitle = 3.5;
    const wModule = 2.0;
    const wContent = 1.0;
    const exactPhraseBoost = 2.0;
    const queryLower = question.toLowerCase().trim();

    const scoredChunks: ScoredChunk[] = chunkTokensList
      .map((doc) => {
        let rawBm25 = 0;

        // Exact Title Phrase Match bonus
        const titleLower = doc.chunk.lessonTitle.toLowerCase();
        if (queryLower.length > 5 && titleLower.includes(queryLower)) {
          rawBm25 += exactPhraseBoost;
        }

        for (const { term, weight } of queryTerms) {
          const df = dfMap.get(term) || 0;
          if (df === 0) continue;

          // Robertson-Spärck Jones IDF
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

          // Field-weighted term frequency
          let fTitle = 0;
          let fModule = 0;
          let fContent = 0;

          for (const t of doc.titleTokens) if (t === term) fTitle++;
          for (const t of doc.moduleTokens) if (t === term) fModule++;
          for (const t of doc.contentTokens) if (t === term) fContent++;

          const fWeighted = wTitle * fTitle + wModule * fModule + wContent * fContent;
          if (fWeighted === 0) continue;

          // Okapi BM25 saturation with document length normalization
          const tf = (fWeighted * (k1 + 1)) / (fWeighted + k1 * (1 - b + b * (doc.length / avgdl)));

          rawBm25 += weight * idf * tf;
        }

        // Monotonic normalization: maps [0, inf) to [0, 1) preserving exact rank ordering
        const normalizedLexical = rawBm25 > 0 ? Math.min(1.0, rawBm25 / (rawBm25 + 2.5)) : 0;

        let finalScore = normalizedLexical;
        const indexedChunk = doc.chunk as IndexedChunkDto;
        if (
          queryEmbedding &&
          indexedChunk.embedding &&
          indexedChunk.embedding.length > 0 &&
          this.embeddingService
        ) {
          const semanticScore = this.embeddingService.cosineSimilarity(
            queryEmbedding,
            indexedChunk.embedding
          );
          // Hybrid blending: 0.6 lexical BM25 + 0.4 vector semantic
          finalScore = 0.6 * normalizedLexical + 0.4 * semanticScore;
        }

        return { chunk: doc.chunk, score: finalScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // 7. Grounding threshold: if top score < 0.20 or 0 matching chunks, reject as ungrounded
    const topScore = scoredChunks.length > 0 ? scoredChunks[0].score : 0;
    const isGrounded = topScore >= 0.20;

    if (!isGrounded) {
      return {
        courseId,
        query: question,
        citations: [],
        totalCandidateCount: scoredChunks.length,
        isGrounded: false,
        groundingNotice: 'This concept is not covered in this course curriculum',
      };
    }

    // 8. Extract top citations (deduplicated by lessonId when possible)
    const selectedLessons = new Set<string>();
    const citations: TutorCitationDto[] = [];

    for (const item of scoredChunks) {
      if (citations.length >= maxCitations) break;
      if (!selectedLessons.has(item.chunk.lessonId) || citations.length < 2) {
        selectedLessons.add(item.chunk.lessonId);
        citations.push({
          lessonId: item.chunk.lessonId,
          lessonTitle: item.chunk.lessonTitle,
          moduleId: item.chunk.moduleId,
          moduleTitle: item.chunk.moduleTitle,
          chunkSnippet: item.chunk.content.slice(0, 300).trim() + (item.chunk.content.length > 300 ? '...' : ''),
          relevanceScore: Math.round(item.score * 100) / 100,
        });
      }
    }

    return {
      courseId,
      query: question,
      citations,
      totalCandidateCount: scoredChunks.length,
      isGrounded: true,
      groundingNotice: null,
    };
  }
}
