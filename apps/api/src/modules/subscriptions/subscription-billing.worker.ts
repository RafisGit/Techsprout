import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';
import {
  SubscriptionBillingService,
  RenewalBatchResult,
  DunningBatchResult,
} from './subscription-billing.service';

export const SUBSCRIPTION_BILLING_QUEUE_NAME = 'techsprout-subscription-billing';
export const RENEWAL_SCHEDULER_ID = 'subscription-renewal-daily';
export const DUNNING_SCHEDULER_ID = 'subscription-dunning-retry';
export const RENEWAL_JOB_NAME = 'process-renewals';
export const DUNNING_JOB_NAME = 'process-dunning';
export const DAILY_RENEWAL_CRON = '0 2 * * *'; // 02:00 UTC daily
export const DAILY_DUNNING_CRON = '0 6 * * *'; // 06:00 UTC daily

export type BillingWorkerStatus = 'ready' | 'degraded' | 'disabled';

export interface BillingWorkerHealthDetails {
  status: BillingWorkerStatus;
  isConnected: boolean;
  isWorkerActive: boolean;
  isSchedulerRegistered: boolean;
  queueName: string;
  renewalCron: string;
  dunningCron: string;
  lastRenewalRun?: {
    timestamp: string;
    result: RenewalBatchResult;
  } | null;
  lastDunningRun?: {
    timestamp: string;
    result: DunningBatchResult;
  } | null;
}

@Injectable()
export class SubscriptionBillingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionBillingWorker.name);
  private redisConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isConnected = false;
  private isSchedulerRegistered = false;

  private isInitializing = false;
  private isClosing = false;

  private watchdogTimer: NodeJS.Timeout | null = null;
  private recoveryAttempts = 0;
  private readonly initialWatchdogDelayMs = 2000;
  private readonly maxWatchdogDelayMs = 30000;

  private lastRenewalRun: { timestamp: string; result: RenewalBatchResult } | null = null;
  private lastDunningRun: { timestamp: string; result: DunningBatchResult } | null = null;

  constructor(
    @Inject(SubscriptionBillingService)
    private readonly billingService: SubscriptionBillingService
  ) {}

  onModuleInit() {
    this.initWorker();
  }

  private initWorker() {
    if (this.isClosing) {
      return;
    }

    try {
      this.redisConnection = this.createRedisConnection();
      this.redisConnection.connect().catch((err) => {
        this.isConnected = false;
        this.logger.warn(
          `Initial Redis connection deferred for subscription billing worker: ${(err as Error).message}`
        );
        if (env.NODE_ENV !== 'test') {
          this.scheduleWatchdogRecovery();
        }
      });
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(
        `Subscription billing worker initialization deferred: ${(err as Error).message}`
      );
      if (env.NODE_ENV !== 'test') {
        this.scheduleWatchdogRecovery();
      }
    }
  }

  private createRedisConnection(): IORedis {
    const client = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (this.isClosing || env.NODE_ENV === 'test' || times > 3) {
          return null;
        }
        return Math.min(times * 150, 1500);
      },
      lazyConnect: true,
    });

    this.attachRedisListeners(client);
    return client;
  }

  public attachRedisListeners(client: IORedis): void {
    client.on('connect', async () => {
      this.isConnected = true;
      this.clearWatchdogTimer();
      this.recoveryAttempts = 0;
      this.logger.log(`Redis connection established for ${SUBSCRIPTION_BILLING_QUEUE_NAME}.`);
      await this.setupQueueAndWorker();
    });

    client.on('ready', async () => {
      this.isConnected = true;
      this.clearWatchdogTimer();
      this.recoveryAttempts = 0;
      await this.registerDailySchedulers();
    });

    client.on('error', (err) => {
      this.isConnected = false;
      this.logger.warn(`Redis connection error for subscription billing worker: ${err.message}`);
      if (!this.isClosing && env.NODE_ENV !== 'test') {
        this.scheduleWatchdogRecovery();
      }
    });

    client.on('close', () => {
      this.isConnected = false;
      this.logger.warn(`Redis connection closed for ${SUBSCRIPTION_BILLING_QUEUE_NAME}.`);
      if (!this.isClosing && env.NODE_ENV !== 'test') {
        this.scheduleWatchdogRecovery();
      }
    });
  }

  private scheduleWatchdogRecovery(): void {
    if (this.watchdogTimer || this.isClosing) {
      return;
    }
    const delay = Math.min(
      this.initialWatchdogDelayMs * Math.pow(1.5, this.recoveryAttempts),
      this.maxWatchdogDelayMs
    );
    this.recoveryAttempts++;

    this.watchdogTimer = setTimeout(async () => {
      this.watchdogTimer = null;
      if (!this.isClosing && !this.isConnected) {
        await this.recoverConnection();
      }
    }, delay);
  }

  public async recoverConnection(): Promise<boolean> {
    if (this.isClosing || this.isConnected) {
      return this.isConnected;
    }
    try {
      if (this.redisConnection) {
        this.redisConnection.removeAllListeners();
        this.redisConnection.disconnect();
        this.redisConnection = null;
      }
      this.redisConnection = this.createRedisConnection();
      await this.redisConnection.connect();
      return true;
    } catch {
      if (!this.isClosing && env.NODE_ENV !== 'test') {
        this.scheduleWatchdogRecovery();
      }
      return false;
    }
  }

  private clearWatchdogTimer(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  public async setupQueueAndWorker(): Promise<void> {
    if (this.isInitializing || this.isClosing || !this.redisConnection) {
      return;
    }
    this.isInitializing = true;

    try {
      if (!this.queue) {
        this.queue = new Queue(SUBSCRIPTION_BILLING_QUEUE_NAME, {
          connection: this.redisConnection,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        });
      }

      if (!this.worker) {
        this.worker = new Worker(
          SUBSCRIPTION_BILLING_QUEUE_NAME,
          async (job: Job) => {
            return this.processJob(job);
          },
          {
            connection: this.redisConnection,
            concurrency: 1, // Strictly single-threaded batch processing
          }
        );

        this.worker.on('completed', (job: Job) => {
          this.logger.log(`Billing job completed: ${job.name} (id: ${job.id})`);
        });

        this.worker.on('failed', (job: Job | undefined, err: Error) => {
          this.logger.error(`Billing job failed: ${job?.name} (id: ${job?.id}): ${err.message}`);
        });
      }

      await this.registerDailySchedulers();
    } catch (err) {
      this.logger.error(`Failed to setup billing queue and worker: ${(err as Error).message}`);
    } finally {
      this.isInitializing = false;
    }
  }

  public async registerDailySchedulers(): Promise<void> {
    if (!this.queue || !this.isConnected || this.isClosing) {
      return;
    }

    try {
      // 1. Daily renewal scheduler
      await this.queue.upsertJobScheduler(
        RENEWAL_SCHEDULER_ID,
        { pattern: DAILY_RENEWAL_CRON },
        {
          name: RENEWAL_JOB_NAME,
          data: {},
        }
      );

      // 2. Daily dunning scheduler
      await this.queue.upsertJobScheduler(
        DUNNING_SCHEDULER_ID,
        { pattern: DAILY_DUNNING_CRON },
        {
          name: DUNNING_JOB_NAME,
          data: {},
        }
      );

      this.isSchedulerRegistered = true;
      this.logger.log('Registered daily renewal and dunning job schedulers.');
    } catch (err) {
      this.logger.warn(`Failed to register job schedulers: ${(err as Error).message}`);
    }
  }

  public async processJob(job: Job): Promise<unknown> {
    if (job.name === RENEWAL_JOB_NAME) {
      this.logger.log('Starting daily subscription renewal batch job.');
      const result = await this.billingService.processDueRenewals();
      this.lastRenewalRun = { timestamp: new Date().toISOString(), result };
      return result;
    }

    if (job.name === DUNNING_JOB_NAME) {
      this.logger.log('Starting daily subscription dunning retry batch job.');
      const result = await this.billingService.processDunningRetries();
      this.lastDunningRun = { timestamp: new Date().toISOString(), result };
      return result;
    }

    this.logger.warn(`Unknown job name received: ${job.name}`);
    return { skipped: true, reason: 'Unknown job name' };
  }

  /**
   * Triggers an ad-hoc renewal batch execution.
   */
  public async triggerRenewalJob(): Promise<RenewalBatchResult> {
    return this.billingService.processDueRenewals();
  }

  /**
   * Triggers an ad-hoc dunning retry batch execution.
   */
  public async triggerDunningJob(): Promise<DunningBatchResult> {
    return this.billingService.processDunningRetries();
  }

  public getStatus(): BillingWorkerStatus {
    if (this.isClosing) {
      return 'disabled';
    }
    if (this.isConnected && this.worker) {
      return 'ready';
    }
    return 'degraded';
  }

  public getHealthDetails(): BillingWorkerHealthDetails {
    return {
      status: this.getStatus(),
      isConnected: this.isConnected,
      isWorkerActive: Boolean(this.worker),
      isSchedulerRegistered: this.isSchedulerRegistered,
      queueName: SUBSCRIPTION_BILLING_QUEUE_NAME,
      renewalCron: DAILY_RENEWAL_CRON,
      dunningCron: DAILY_DUNNING_CRON,
      lastRenewalRun: this.lastRenewalRun,
      lastDunningRun: this.lastDunningRun,
    };
  }

  async onModuleDestroy() {
    this.isClosing = true;
    this.clearWatchdogTimer();

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    if (this.redisConnection) {
      this.redisConnection.removeAllListeners();
      await this.redisConnection.quit().catch(() => {});
      this.redisConnection = null;
    }

    this.isConnected = false;
    this.isSchedulerRegistered = false;
  }
}
