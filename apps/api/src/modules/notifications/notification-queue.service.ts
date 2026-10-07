import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';
import { DomainEvent } from '../events/domain-event.interface';
import { NotificationsService } from './notifications.service';

export const NOTIFICATION_QUEUE_NAME = 'techsprout-notifications';

@Injectable()
export class NotificationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private redisConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isConnected = false;

  constructor(
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService
  ) {}

  onModuleInit() {
    this.initQueue();
  }

  private initQueue() {
    if (env.NODE_ENV === 'test') {
      this.logger.log('Test environment detected. Operating notification queue in standby mode.');
      return;
    }

    try {
      this.redisConnection = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn(
              'Redis retry limit reached. Operating notification queue in standby mode.'
            );
            return null;
          }
          return Math.min(times * 150, 1500);
        },
        lazyConnect: true,
      });

      this.redisConnection.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Redis connection established for ${NOTIFICATION_QUEUE_NAME} queue.`);
      });

      this.redisConnection.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis notice: ${err.message}. Operating in resilient standby.`);
      });

      this.redisConnection.connect().catch(() => {
        this.logger.warn('Initial Redis connection deferred for notification queue; operating in standby.');
      });

      // 1. Establish BullMQ Queue with exponential backoff & dead-letter retention
      this.queue = new Queue(NOTIFICATION_QUEUE_NAME, {
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

      // 2. Establish BullMQ Worker with concurrency = 5
      this.worker = new Worker(
        NOTIFICATION_QUEUE_NAME,
        async (job: Job<DomainEvent>) => {
          this.logger.log(
            `[NOTIFICATION_WORKER] Processing job: id=${job.id} type=${job.data?.eventType}`
          );
          if (!job.data || !job.data.eventType) {
            this.logger.error(`[NOTIFICATION_WORKER] Non-retryable error: malformed event job ${job.id}`);
            return { processed: false, reason: 'MALFORMED_JOB_PAYLOAD' };
          }

          await this.notificationsService.processNotificationEvent(job.data);
          return { processed: true, eventId: job.data.eventId };
        },
        {
          connection: this.redisConnection,
          concurrency: 5,
        }
      );

      this.queue.on('error', (err) => {
        this.logger.warn(`Queue error notice: ${err.message}`);
      });

      this.worker.on('error', (err) => {
        this.logger.warn(`Worker error notice: ${err.message}`);
      });

      this.worker.on('completed', (job: Job) => {
        this.logger.log(`[NOTIFICATION_WORKER] Job completed successfully: id=${job.id}`);
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        this.logger.error(
          `[NOTIFICATION_WORKER] Job failed (attempt ${job?.attemptsMade}): id=${job?.id} error=${err.message}`
        );
      });

      this.logger.log(`BullMQ ${NOTIFICATION_QUEUE_NAME} queue and worker initialized (concurrency=5).`);
    } catch {
      this.logger.warn('Redis notification queue initialization deferred.');
    }
  }

  /**
   * Enqueue a domain event to the BullMQ notification queue.
   * If Redis is unavailable, mock-process or fallback gracefully.
   */
  async enqueueNotificationJob(event: DomainEvent): Promise<{ id: string }> {
    const targetUserId =
      event.targetUserId ||
      (event.payload as any)?.userId ||
      (event.payload as any)?.studentId ||
      event.actorUserId ||
      'sys';

    const jobId = `notif_${targetUserId}_${event.eventType}_${event.entityId}_${event.eventId}`;

    if (!this.queue || !this.isConnected) {
      this.logger.log(`[QUEUE_STANDBY] Processing event synchronously in standby mode: ${event.eventType}`);
      await this.notificationsService.processNotificationEvent(event);
      return { id: `standby_${event.eventId}` };
    }

    try {
      const job = await this.queue.add(event.eventType, event, {
        jobId,
      });
      return { id: job.id || jobId };
    } catch (err: any) {
      this.logger.warn(`Could not dispatch job to Redis (${err.message}). Falling back to standby processing.`);
      await this.notificationsService.processNotificationEvent(event);
      return { id: `fallback_${event.eventId}` };
    }
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down notification queue worker and connections...');
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
