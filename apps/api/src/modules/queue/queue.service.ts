import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';

export interface TestJobPayload {
  message: string;
  timestamp: string;
  deduplicationKey?: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private redisConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isConnected = false;

  onModuleInit() {
    this.initQueue();
  }

  private initQueue() {
    try {
      this.redisConnection = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis retry limit reached. Operating BullMQ queue in fallback mode.');
            return null;
          }
          return Math.min(times * 150, 1500);
        },
        lazyConnect: true,
      });

      this.redisConnection.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Redis connection established for BullMQ queue.');
      });

      this.redisConnection.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis notice: ${err.message}. Queue operating in resilient standby.`);
      });

      this.redisConnection.connect().catch(() => {
        this.logger.warn('Initial Redis connection deferred; queue in standby.');
      });

      // 1. Establish BullMQ Queue with exponential backoff & dead-letter retention
      this.queue = new Queue('techsprout-queue', {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false, // Dead-letter retention for audit & inspection
        },
      });

      // 2. Establish BullMQ Worker
      this.worker = new Worker(
        'techsprout-queue',
        async (job: Job) => {
          this.logger.log(`[QUEUE_WORKER] Processing job: id=${job.id} name=${job.name}`);
          if (job.name === 'ping-test' || job.name === 'sms-dispatch') {
            return { processed: true, data: job.data };
          }
          return { acknowledged: true };
        },
        { connection: this.redisConnection }
      );

      this.queue.on('error', (err) => {
        this.logger.warn(`Queue notice: ${err.message}. Operating in resilient standby.`);
      });

      this.worker.on('error', (err) => {
        this.logger.warn(`Worker notice: ${err.message}. Operating in resilient standby.`);
      });

      this.worker.on('completed', (job: Job) => {
        this.logger.log(`[QUEUE_WORKER] Job completed successfully: id=${job.id}`);
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        this.logger.error(`[QUEUE_WORKER] Job failed after retries: id=${job?.id} error=${err.message}`);
      });

      this.logger.log('BullMQ queue and worker lifecycle established.');
    } catch {
      this.logger.warn('Redis queue initialization deferred.');
    }
  }

  /**
   * Health check probe for Redis/BullMQ connection.
   */
  async isHealthy(): Promise<boolean> {
    if (!this.redisConnection || !this.isConnected) {
      return false;
    }
    try {
      const res = await this.redisConnection.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Dispatches a safe lifecycle job with idempotency/deduplication key support.
   */
  async dispatchTestJob(payload: TestJobPayload) {
    if (!this.queue || !this.isConnected) {
      this.logger.log(`[QUEUE_FALLBACK] Mock-processing job: ${payload.message}`);
      return { id: 'fallback-id', data: payload };
    }

    try {
      const jobId = payload.deduplicationKey || `job_${Date.now()}`;
      const job = await this.queue.add('ping-test', payload, {
        jobId,
      });
      return { id: job.id, data: job.data };
    } catch (err) {
      this.logger.warn(`Could not dispatch job to Redis: ${(err as Error).message}`);
      return { id: 'fallback-id', data: payload };
    }
  }

  async onModuleDestroy() {
    this.logger.log('Gracefully shutting down BullMQ workers and Redis connections...');
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
