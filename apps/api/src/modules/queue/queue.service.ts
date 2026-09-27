import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';

export interface TestJobPayload {
  message: string;
  timestamp: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private redisConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  onModuleInit() {
    this.initQueue();
  }

  private initQueue() {
    try {
      this.redisConnection = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis connection retry limit reached. Operating queue in standby mode.');
            return null; // Stop retrying
          }
          return Math.min(times * 100, 2000);
        },
        lazyConnect: true,
      });

      this.redisConnection.on('error', (err) => {
        this.logger.warn(`Redis notice: ${err.message}. Queue running in degraded/resilient mode.`);
      });

      // 1. Establish BullMQ Queue with retry & dead-letter settings
      this.queue = new Queue('techsprout-queue', {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false, // Preserves failed jobs for dead-letter inspection
        },
      });

      // 2. Establish Worker
      this.worker = new Worker(
        'techsprout-queue',
        async (job: Job) => {
          this.logger.log(`[QUEUE_WORKER] Processing job: id=${job.id} name=${job.name}`);
          if (job.name === 'ping-test') {
            return { processed: true, echo: job.data };
          }
          return { acknowledged: true };
        },
        { connection: this.redisConnection }
      );

      this.worker.on('completed', (job: Job) => {
        this.logger.log(`[QUEUE_WORKER] Job completed successfully: id=${job.id}`);
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        this.logger.error(`[QUEUE_WORKER] Job failed after retries: id=${job?.id} error=${err.message}`);
      });

      this.logger.log('Queue and worker foundation established successfully.');
    } catch (error) {
      this.logger.warn('Redis queue initialization deferred (Redis offline).');
    }
  }

  /**
   * Dispatches a safe lifecycle test job.
   */
  async dispatchTestJob(payload: TestJobPayload) {
    if (!this.queue) {
      this.logger.warn('Queue unavailable; mock-processing test job.');
      return { id: 'mock-test-id', data: payload };
    }

    try {
      const job = await this.queue.add('ping-test', payload, {
        jobId: `test_${Date.now()}`,
      });
      return { id: job.id, data: job.data };
    } catch (err) {
      this.logger.warn(`Could not dispatch to Redis: ${(err as Error).message}`);
      return { id: 'fallback-id', data: payload };
    }
  }

  async onModuleDestroy() {
    this.logger.log('Gracefully shutting down queues and workers...');
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    if (this.redisConnection) {
      this.redisConnection.disconnect();
    }
  }
}
