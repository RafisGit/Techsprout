import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';
import { TutorIndexingService } from './tutor-indexing.service';
import { AuditService } from '../audit/audit.service';
import {
  ChunkIndexingJobPayload,
  ChunkIndexingTrigger,
  ChunkIndexingResultDto,
} from '@techsprout/contracts';

export const TUTOR_INDEXING_QUEUE_NAME = 'techsprout-tutor-indexing';

@Injectable()
export class TutorIndexingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TutorIndexingQueueService.name);
  private redisConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isConnected = false;
  private isClosing = false;

  constructor(
    @Inject(TutorIndexingService) private readonly indexingService: TutorIndexingService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  onModuleInit() {
    this.initQueueAndWorker();
  }

  async onModuleDestroy() {
    this.isClosing = true;
    try {
      if (this.worker) {
        await this.worker.close();
      }
      if (this.queue) {
        await this.queue.close();
      }
      if (this.redisConnection) {
        await this.redisConnection.quit();
      }
    } catch {
      // Graceful shutdown
    }
  }

  private initQueueAndWorker() {
    try {
      this.redisConnection = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1500)),
        lazyConnect: true,
      });

      this.redisConnection.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Redis connected for BullMQ queue ${TUTOR_INDEXING_QUEUE_NAME}`);
      });

      this.redisConnection.on('error', (err) => {
        this.isConnected = false;
        this.logger.debug(`Redis queue standby: ${err.message}`);
      });

      this.redisConnection.connect().catch(() => {
        this.logger.debug('Redis queue connection deferred; operating in resilient standby.');
      });

      // 1. BullMQ Queue
      this.queue = new Queue(TUTOR_INDEXING_QUEUE_NAME, {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1500,
          },
          removeOnComplete: 100,
          removeOnFail: 50, // Bounded dead-letter retention prevents unbounded Redis memory growth on 25MB Free ceiling
        },
      });

      // 2. BullMQ Worker with concurrency = 2
      this.worker = new Worker(
        TUTOR_INDEXING_QUEUE_NAME,
        async (job: Job<ChunkIndexingJobPayload>) => {
          return this.processJob(job.data);
        },
        {
          connection: this.redisConnection,
          concurrency: 2,
        }
      );

      this.worker.on('completed', (job: Job) => {
        this.logger.log(`[TUTOR_INDEX_WORKER] Job completed successfully: id=${job.id}`);
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        this.logger.error(
          `[TUTOR_INDEX_WORKER] Job failed after retries: id=${job?.id} error=${err.message}`
        );
      });
    } catch (err: any) {
      this.logger.warn(`Tutor indexing queue setup in resilient standby: ${err.message}`);
    }
  }

  /**
   * Enqueue course indexing job.
   */
  public async enqueueIndexCourse(
    courseId: string,
    trigger: ChunkIndexingTrigger
  ): Promise<void> {
    const payload: ChunkIndexingJobPayload = {
      courseId,
      trigger,
      timestamp: new Date().toISOString(),
    };

    if (this.queue && this.isConnected && !this.isClosing) {
      try {
        // Deduplicate equivalent triggers within a five-second window, without
        // suppressing a distinct lifecycle event such as republishing after a purge.
        const windowKey = Math.floor(Date.now() / 5000);
        const jobId = `index-course:${courseId}:${trigger}:${windowKey}`;
        await this.queue.add('index-course', payload, { jobId });
        return;
      } catch (err: any) {
        this.logger.warn(`Queue dispatch failed, processing in direct fallback: ${err.message}`);
      }
    }

    // Direct fallback execution when Redis queue is offline
    await this.processJob(payload);
  }

  /**
   * Enqueue differential lesson indexing job.
   */
  public async enqueueIndexLesson(
    courseId: string,
    lessonId: string,
    trigger: ChunkIndexingTrigger
  ): Promise<void> {
    const payload: ChunkIndexingJobPayload = {
      courseId,
      lessonId,
      trigger,
      timestamp: new Date().toISOString(),
    };

    if (this.queue && this.isConnected && !this.isClosing) {
      try {
        const windowKey = Math.floor(Date.now() / 5000);
        const jobId = `index-lesson:${lessonId}:${windowKey}`;
        await this.queue.add('index-lesson', payload, { jobId });
        return;
      } catch (err: any) {
        this.logger.warn(`Queue dispatch failed, processing in direct fallback: ${err.message}`);
      }
    }

    // Direct fallback
    await this.processJob(payload);
  }

  /**
   * Enqueue course purge job (e.g. unpublish or archive).
   */
  public async enqueuePurgeCourse(
    courseId: string,
    trigger: ChunkIndexingTrigger
  ): Promise<void> {
    const payload: ChunkIndexingJobPayload = {
      courseId,
      trigger,
      timestamp: new Date().toISOString(),
    };

    if (this.queue && this.isConnected && !this.isClosing) {
      try {
        await this.queue.add('purge-course', payload);
        return;
      } catch (err: any) {
        this.logger.warn(`Queue dispatch failed, purging in direct fallback: ${err.message}`);
      }
    }

    await this.processJob(payload);
  }

  /**
   * Core job processing logic: idempotent, thread-safe, and observable.
   */
  public async processJob(payload: ChunkIndexingJobPayload): Promise<ChunkIndexingResultDto> {
    const { courseId, lessonId, trigger } = payload;

    if (trigger === 'COURSE_UNPUBLISHED' || trigger === 'COURSE_ARCHIVED') {
      await this.indexingService.purgeCourse(courseId);
      await this.auditService.record({
        action: 'COURSE_INDEX_PURGED',
        targetType: 'COURSE',
        targetId: courseId,
        metadata: { trigger },
      });
      return {
        courseId,
        trigger,
        chunksCreated: 0,
        chunksUpdated: 0,
        chunksDeleted: 0,
        totalActiveChunks: 0,
        durationMs: 0,
      };
    }

    let result: ChunkIndexingResultDto;

    if (lessonId && trigger === 'LESSON_UPDATED') {
      result = await this.indexingService.indexLesson(courseId, lessonId, trigger);
    } else {
      result = await this.indexingService.indexCourse(courseId, trigger);
    }

    await this.auditService.record({
      action: 'COURSE_CHUNKS_INDEXED',
      targetType: 'COURSE',
      targetId: courseId,
      metadata: {
        trigger,
        lessonId,
        activeChunks: result.totalActiveChunks,
        created: result.chunksCreated,
        updated: result.chunksUpdated,
        deleted: result.chunksDeleted,
        durationMs: result.durationMs,
      },
    });

    return result;
  }

  public getStatus() {
    return {
      queueName: TUTOR_INDEXING_QUEUE_NAME,
      isConnected: this.isConnected,
      hasWorker: !!this.worker,
    };
  }

  public async getQueueMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    if (this.queue && this.isConnected) {
      try {
        const [waiting, active, completed, failed] = await Promise.all([
          this.queue.getWaitingCount(),
          this.queue.getActiveCount(),
          this.queue.getCompletedCount(),
          this.queue.getFailedCount(),
        ]);
        return { waiting, active, completed, failed };
      } catch {
        // Fallback
      }
    }
    return { waiting: 0, active: 0, completed: 0, failed: 0 };
  }
}
