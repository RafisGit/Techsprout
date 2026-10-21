import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import IORedis from 'ioredis';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { courses, modules, lessons } from '../../database/schema';
import { env } from '../../config/env.config';
import { TutorEmbeddingService } from './tutor-embedding.service';
import {
  IndexedChunkDto,
  ChunkIndexingResultDto,
  ChunkIndexingTrigger,
} from '@techsprout/contracts';

@Injectable()
export class TutorIndexingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TutorIndexingService.name);
  private redisClient: IORedis | null = null;
  private isRedisConnected = false;

  // In-memory index cache: courseId -> Map<chunkId, IndexedChunkDto>
  private readonly memoryStore = new Map<string, Map<string, IndexedChunkDto>>();

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(TutorEmbeddingService) private readonly embeddingService: TutorEmbeddingService
  ) {}

  onModuleInit() {
    this.initRedis();
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch {
        // Disconnect gracefully
      }
      this.redisClient = null;
    }
  }

  private initRedis() {
    try {
      this.redisClient = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1500)),
        lazyConnect: true,
      });

      this.redisClient.on('connect', () => {
        this.isRedisConnected = true;
        this.logger.log('Redis connected for TutorIndexingService chunk store.');
      });

      this.redisClient.on('error', () => {
        this.isRedisConnected = false;
      });

      this.redisClient.connect().catch(() => {
        // Standby fallback to memoryStore
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  /**
   * Technical token normalizer (Config C baseline).
   * Extracts compound technical tokens (e.g. "ci/cd", "node.js"), standard words, and constituent sub-tokens.
   */
  public tokenize(text: string): string[] {
    if (!text) return [];
    const normalized = text.toLowerCase();

    const technicalTokens = normalized.match(/[a-z0-9]+[./\-_][a-z0-9./\-_]*/g) || [];
    const standardWords = normalized.match(/[a-z0-9]+/g) || [];
    const subTokens = technicalTokens.flatMap((token) =>
      token.split(/[./\-_]/).filter((part) => part.length > 1)
    );

    const tokenSet = new Set<string>([...technicalTokens, ...standardWords, ...subTokens]);
    return Array.from(tokenSet);
  }

  /**
   * Generates deterministic, stable context chunks for a lesson.
   * Chunk ID format: `${courseId}:${moduleId || 'nomod'}:${lessonId}:${chunkIndex}`
   */
  public async generateLessonChunks(
    courseId: string,
    lesson: {
      id: string;
      title: string;
      description?: string | null;
      content?: string | null;
      moduleId?: string | null;
      moduleTitle?: string | null;
    }
  ): Promise<IndexedChunkDto[]> {
    const fullText = [lesson.description, lesson.content].filter(Boolean).join('\n\n');
    const chunks: IndexedChunkDto[] = [];
    const moduleIdStr = lesson.moduleId || 'nomod';

    if (!fullText.trim()) {
      const titleContent = `Lesson: ${lesson.title}. Module: ${lesson.moduleTitle || 'General'}.`;
      const hash = crypto.createHash('sha256').update(titleContent).digest('hex');
      const tokens = this.tokenize(`${lesson.title} ${lesson.moduleTitle || ''}`);
      const embedding = await this.embeddingService.generateEmbedding(titleContent);

      chunks.push({
        id: `${courseId}:${moduleIdStr}:${lesson.id}:0`,
        courseId,
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        chunkIndex: 0,
        content: titleContent,
        tokens,
        contentHash: hash,
        embedding,
        updatedAt: new Date().toISOString(),
      });
      return chunks;
    }

    // Split paragraphs into overlapping chunks of approx 150-200 words
    const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    let chunkIndex = 0;
    let currentChunkText = `Lesson: ${lesson.title}\n`;

    for (const p of paragraphs) {
      if ((currentChunkText + '\n' + p).split(/\s+/).length > 200 && currentChunkText.length > 100) {
        const textToSave = currentChunkText.trim();
        const hash = crypto.createHash('sha256').update(textToSave).digest('hex');
        const tokens = this.tokenize(`${lesson.title} ${lesson.moduleTitle || ''} ${textToSave}`);
        const embedding = await this.embeddingService.generateEmbedding(textToSave);

        chunks.push({
          id: `${courseId}:${moduleIdStr}:${lesson.id}:${chunkIndex++}`,
          courseId,
          moduleId: lesson.moduleId,
          moduleTitle: lesson.moduleTitle,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          chunkIndex: chunkIndex - 1,
          content: textToSave,
          tokens,
          contentHash: hash,
          embedding,
          updatedAt: new Date().toISOString(),
        });
        currentChunkText = `Lesson: ${lesson.title}\n${p}`;
      } else {
        currentChunkText += `\n${p}`;
      }
    }

    if (currentChunkText.trim().length > 0) {
      const textToSave = currentChunkText.trim();
      const hash = crypto.createHash('sha256').update(textToSave).digest('hex');
      const tokens = this.tokenize(`${lesson.title} ${lesson.moduleTitle || ''} ${textToSave}`);
      const embedding = await this.embeddingService.generateEmbedding(textToSave);

      chunks.push({
        id: `${courseId}:${moduleIdStr}:${lesson.id}:${chunkIndex}`,
        courseId,
        moduleId: lesson.moduleId,
        moduleTitle: lesson.moduleTitle,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        chunkIndex,
        content: textToSave,
        tokens,
        contentHash: hash,
        embedding,
        updatedAt: new Date().toISOString(),
      });
    }

    return chunks;
  }

  /**
   * Retrieves all active chunks for a course from memory or Redis.
   */
  public async getCourseChunks(courseId: string): Promise<IndexedChunkDto[]> {
    // 1. Check in-memory store
    const memCourse = this.memoryStore.get(courseId);
    if (memCourse && memCourse.size > 0) {
      return Array.from(memCourse.values());
    }

    // 2. Check Redis cache
    if (this.isRedisConnected && this.redisClient) {
      try {
        const raw = await this.redisClient.get(`tutor:index:course:${courseId}`);
        if (raw) {
          const parsed: Record<string, IndexedChunkDto> = JSON.parse(raw);
          const chunkMap = new Map<string, IndexedChunkDto>(Object.entries(parsed));
          this.memoryStore.set(courseId, chunkMap);
          return Array.from(chunkMap.values());
        }
      } catch (err: any) {
        this.logger.warn(`Failed reading Redis tutor chunks for course ${courseId}: ${err.message}`);
      }
    }

    return [];
  }

  /**
   * Idempotent full course indexing.
   * If course is NOT PUBLISHED, purges chunks to prevent stale curriculum leakage.
   */
  public async indexCourse(
    courseId: string,
    trigger: ChunkIndexingTrigger = 'MANUAL_REFRESH'
  ): Promise<ChunkIndexingResultDto> {
    const startTime = Date.now();

    // 1. Fetch course verification
    const [course] = await this.db
      .select({ id: courses.id, status: courses.status, title: courses.title })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course || course.status !== 'PUBLISHED') {
      await this.purgeCourse(courseId);
      return {
        courseId,
        trigger,
        chunksCreated: 0,
        chunksUpdated: 0,
        chunksDeleted: 0,
        totalActiveChunks: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Fetch all modules and lessons
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

    // 3. Existing chunks for diff comparison
    const existingChunks = await this.getCourseChunks(courseId);
    const existingMap = new Map<string, IndexedChunkDto>(existingChunks.map((c) => [c.id, c]));

    // 4. Generate new chunks
    const newChunksMap = new Map<string, IndexedChunkDto>();
    let chunksCreated = 0;
    let chunksUpdated = 0;

    for (const les of courseLessons) {
      const generated = await this.generateLessonChunks(courseId, les);
      for (const ch of generated) {
        newChunksMap.set(ch.id, ch);
        const existing = existingMap.get(ch.id);
        if (!existing) {
          chunksCreated++;
        } else if (existing.contentHash !== ch.contentHash) {
          chunksUpdated++;
        }
      }
    }

    // 5. Detect deleted chunks
    let chunksDeleted = 0;
    for (const oldId of existingMap.keys()) {
      if (!newChunksMap.has(oldId)) {
        chunksDeleted++;
      }
    }

    // 6. Persist to memory store
    this.memoryStore.set(courseId, newChunksMap);

    // 7. Persist to Redis
    if (this.isRedisConnected && this.redisClient) {
      try {
        const serialized = JSON.stringify(Object.fromEntries(newChunksMap));
        await this.redisClient.set(`tutor:index:course:${courseId}`, serialized);
      } catch (err: any) {
        this.logger.warn(`Failed persisting chunks to Redis for course ${courseId}: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `[TUTOR_INDEXER] Course indexed: courseId=${courseId} trigger=${trigger} activeChunks=${newChunksMap.size} created=${chunksCreated} updated=${chunksUpdated} deleted=${chunksDeleted} duration=${durationMs}ms`
    );

    return {
      courseId,
      trigger,
      chunksCreated,
      chunksUpdated,
      chunksDeleted,
      totalActiveChunks: newChunksMap.size,
      durationMs,
    };
  }

  /**
   * Differential single-lesson re-indexing.
   */
  public async indexLesson(
    courseId: string,
    lessonId: string,
    trigger: ChunkIndexingTrigger = 'LESSON_UPDATED'
  ): Promise<ChunkIndexingResultDto> {
    const startTime = Date.now();

    // Check course published status
    const [course] = await this.db
      .select({ id: courses.id, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course || course.status !== 'PUBLISHED') {
      await this.purgeCourse(courseId);
      return {
        courseId,
        trigger,
        chunksCreated: 0,
        chunksUpdated: 0,
        chunksDeleted: 0,
        totalActiveChunks: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Fetch lesson
    const [lessonRecord] = await this.db
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
      .where(eq(lessons.id, lessonId))
      .limit(1);

    const existingChunks = await this.getCourseChunks(courseId);
    const courseMap = new Map<string, IndexedChunkDto>(existingChunks.map((c) => [c.id, c]));

    let chunksCreated = 0;
    let chunksUpdated = 0;
    let chunksDeleted = 0;

    // Delete previous chunks for this lesson
    for (const [id, ch] of courseMap.entries()) {
      if (ch.lessonId === lessonId) {
        courseMap.delete(id);
        chunksDeleted++;
      }
    }

    if (lessonRecord) {
      const generated = await this.generateLessonChunks(courseId, lessonRecord);
      for (const ch of generated) {
        courseMap.set(ch.id, ch);
        chunksCreated++;
      }
    }

    // Persist
    this.memoryStore.set(courseId, courseMap);
    if (this.isRedisConnected && this.redisClient) {
      try {
        const serialized = JSON.stringify(Object.fromEntries(courseMap));
        await this.redisClient.set(`tutor:index:course:${courseId}`, serialized);
      } catch (err: any) {
        this.logger.warn(`Failed writing Redis chunks for lesson ${lessonId}: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      courseId,
      trigger,
      chunksCreated,
      chunksUpdated,
      chunksDeleted,
      totalActiveChunks: courseMap.size,
      durationMs,
    };
  }

  /**
   * Purges all cached chunks for a course (e.g. on unpublish or archive).
   */
  public async purgeCourse(courseId: string): Promise<void> {
    this.memoryStore.delete(courseId);

    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(`tutor:index:course:${courseId}`);
      } catch (err: any) {
        this.logger.warn(`Failed deleting Redis chunks for course ${courseId}: ${err.message}`);
      }
    }

    this.logger.log(`[TUTOR_INDEXER] Course chunks purged: courseId=${courseId}`);
  }

  /**
   * Clear all stores (used in unit tests).
   */
  public clearAll(): void {
    this.memoryStore.clear();
  }
}
