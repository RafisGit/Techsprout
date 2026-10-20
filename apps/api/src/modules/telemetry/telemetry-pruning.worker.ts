import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.config';
import { TelemetryService, PruneResult } from './telemetry.service';

export const TELEMETRY_PRUNING_QUEUE_NAME = 'techsprout-telemetry-pruning';
export const PRUNING_SCHEDULER_ID = 'telemetry-pruning-nightly';
export const PRUNING_JOB_NAME = 'prune-video-checkpoints';
export const NIGHTLY_CRON_PATTERN = '0 3 * * *'; // 03:00 UTC daily

export type RetentionWorkerStatus = 'ready' | 'degraded' | 'disabled';

export interface PruningJobPayload {
  olderThanDays?: number;
  batchSize?: number;
}

export interface LastPruningRunInfo {
  timestamp: string;
  deletedCount: number;
  batchesProcessed: number;
  completed: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface RetentionWorkerHealthDetails {
  status: RetentionWorkerStatus;
  isTelemetryEnabled: boolean;
  isConnected: boolean;
  isWorkerActive: boolean;
  isSchedulerRegistered: boolean;
  schedulerId: string;
  pattern: string;
  queueName: string;
  jobName: string;
  lastPruningRun?: LastPruningRunInfo | null;
}

@Injectable()
export class TelemetryPruningWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryPruningWorker.name);
  private redisConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isConnected = false;
  private isSchedulerRegistered = false;

  // Lifecycle states preventing overlapping initialization / teardown
  private isInitializing = false;
  private isClosing = false;
  private lastLoggedStatus: RetentionWorkerStatus | null = null;

  // Bounded watchdog recovery
  private watchdogTimer: NodeJS.Timeout | null = null;
  private recoveryAttempts = 0;
  private readonly initialWatchdogDelayMs = 2000;
  private readonly maxWatchdogDelayMs = 30000;

  // Audit of most recent pruning execution
  private lastPruningRun: LastPruningRunInfo | null = null;

  constructor(@Inject(TelemetryService) private readonly telemetryService: TelemetryService) {}

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
        this.updateAndLogStatus();
        this.logger.warn(
          `Initial Redis connection deferred for telemetry pruning queue (${(err as Error).message}); operating in degraded standby.`
        );
        if (env.NODE_ENV !== 'test') {
          this.scheduleWatchdogRecovery();
        }
      });
    } catch (err) {
      this.isConnected = false;
      this.updateAndLogStatus();
      this.logger.warn(
        `Telemetry pruning worker initialization deferred: ${(err as Error).message}`
      );
      if (env.NODE_ENV !== 'test') {
        this.scheduleWatchdogRecovery();
      }
    }
  }

  /**
   * Constructs an IORedis client with a bounded-delay, recoverable reconnection strategy.
   * Event listeners are bound deterministically once per instance.
   */
  private createRedisConnection(): IORedis {
    const client = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (this.isClosing) {
          return null;
        }
        // Bounded delay: 250ms backoff, capped at 10,000ms
        const delay = Math.min(times * 250, 10000);
        return delay;
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
      this.logger.log(`Redis connection established for ${TELEMETRY_PRUNING_QUEUE_NAME} queue.`);
      await this.setupQueueAndWorker();
    });

    client.on('ready', async () => {
      this.isConnected = true;
      this.clearWatchdogTimer();
      this.recoveryAttempts = 0;
      // Reconcile scheduler state on ready
      await this.registerNightlySchedule();
      this.updateAndLogStatus();
    });

    client.on('error', (err) => {
      this.isConnected = false;
      this.updateAndLogStatus();
      this.logger.warn(
        `Redis notice: ${err.message}. Telemetry pruning queue operating in standby.`
      );
    });

    client.on('close', () => {
      this.isConnected = false;
      this.updateAndLogStatus();
      if (!this.isClosing && env.NODE_ENV !== 'test') {
        this.scheduleWatchdogRecovery();
      }
    });

    client.on('end', () => {
      this.isConnected = false;
      this.updateAndLogStatus();
      if (!this.isClosing) {
        this.logger.warn(
          `[TELEMETRY_PRUNING_WORKER] Redis client reached terminal end state. Watchdog will reconstruct connection.`
        );
        if (env.NODE_ENV !== 'test') {
          this.scheduleWatchdogRecovery();
        }
      }
    });
  }

  /**
   * Idempotent initialization of BullMQ Queue and Worker.
   * Prevents duplicate instances and listeners on repeated connect events.
   * Cleans up any partially created resources if initialization fails.
   */
  private async setupQueueAndWorker(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    if (this.isInitializing) {
      this.logger.debug('Setup already in progress; skipping concurrent initialization.');
      return;
    }

    // Idempotency: If queue and worker are already initialized and active, do not recreate!
    if (this.queue && this.worker) {
      this.logger.debug('Queue and worker already active. Reconciling schedule only.');
      await this.registerNightlySchedule();
      this.updateAndLogStatus();
      return;
    }

    if (!this.redisConnection) {
      return;
    }

    this.isInitializing = true;
    try {
      // Ensure partially initialized resources are closed safely before replacement
      await this.cleanupResources();

      this.queue = new Queue(TELEMETRY_PRUNING_QUEUE_NAME, {
        connection: this.redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 10,
          removeOnFail: false, // Dead-letter retention for audit & inspection
        },
      });

      this.worker = new Worker(
        TELEMETRY_PRUNING_QUEUE_NAME,
        async (job: Job<PruningJobPayload>) => {
          return this.processPruningJob(job);
        },
        {
          connection: this.redisConnection,
          concurrency: 1, // Strictly 1 job at a time to prevent overlapping executions
        }
      );

      this.queue.on('error', (err) => {
        this.logger.warn(`Queue error notice: ${err.message}`);
      });

      this.worker.on('error', (err) => {
        this.logger.warn(`Worker error notice: ${err.message}`);
      });

      this.worker.on('completed', (job: Job) => {
        this.logger.log(
          `[TELEMETRY_PRUNING_WORKER] Pruning job completed successfully: id=${job.id}`
        );
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        this.logger.error(
          `[TELEMETRY_PRUNING_WORKER] Pruning job failed (attempt ${job?.attemptsMade}): id=${job?.id} error=${err.message}`
        );
      });

      await this.registerNightlySchedule();
      this.updateAndLogStatus();
      this.logger.log(
        `BullMQ ${TELEMETRY_PRUNING_QUEUE_NAME} queue and worker initialized (concurrency=1).`
      );
    } catch (err) {
      this.logger.error(
        `Failed to setup telemetry pruning queue and worker: ${(err as Error).message}`,
        err
      );
      // Clean up partially initialized resources safely on failure
      await this.cleanupResources();
      this.isSchedulerRegistered = false;
      this.updateAndLogStatus();
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Bounded watchdog that reconstructs a failed/ended Redis connection and dependent worker resources.
   */
  public async recoverConnection(): Promise<boolean> {
    if (this.isClosing || this.isInitializing) {
      return false;
    }

    this.logger.log(
      `[TELEMETRY_PRUNING_WORKER] Watchdog reconstructing Redis connection and worker resources (attempt ${this.recoveryAttempts})...`
    );

    try {
      await this.cleanupResources();

      if (this.redisConnection) {
        if (typeof this.redisConnection.removeAllListeners === 'function') {
          this.redisConnection.removeAllListeners();
        }
        try {
          this.redisConnection.disconnect();
        } catch {
          // ignore disconnect error on closed connection
        }
        this.redisConnection = null;
      }

      this.redisConnection = this.createRedisConnection();
      await this.redisConnection.connect();
      this.logger.log('[TELEMETRY_PRUNING_WORKER] Watchdog connection recovery succeeded.');
      return true;
    } catch (err) {
      this.isConnected = false;
      this.updateAndLogStatus();
      this.logger.warn(
        `[TELEMETRY_PRUNING_WORKER] Watchdog recovery attempt ${this.recoveryAttempts} failed: ${(err as Error).message}. Operating in degraded standby.`
      );
      if (!this.isClosing) {
        this.scheduleWatchdogRecovery();
      }
      return false;
    }
  }

  /**
   * Schedules a bounded, exponential-backoff watchdog check.
   */
  private scheduleWatchdogRecovery(): void {
    if (this.isClosing || this.watchdogTimer) {
      return;
    }

    const delay = Math.min(
      this.initialWatchdogDelayMs * Math.pow(1.5, this.recoveryAttempts),
      this.maxWatchdogDelayMs
    );
    this.recoveryAttempts++;

    this.logger.warn(
      `[TELEMETRY_PRUNING_WORKER] Recovery watchdog scheduled in ${delay}ms (attempt ${this.recoveryAttempts}).`
    );

    this.watchdogTimer = setTimeout(async () => {
      this.watchdogTimer = null;
      await this.recoverConnection();
    }, delay);
  }

  private clearWatchdogTimer(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Registers or updates the repeatable nightly pruning job scheduler.
   * Uses upsertJobScheduler with deterministic ID to prevent duplicate recurring jobs on repeated startups.
   * If TELEMETRY_ENABLED is false, skips registration and removes any existing schedule.
   */
  public async registerNightlySchedule(): Promise<boolean> {
    if (!this.queue || !this.isConnected || this.isClosing) {
      this.isSchedulerRegistered = false;
      return false;
    }

    // Kill Switch Check at Registration Time
    if (!this.telemetryService.isTelemetryEnabled()) {
      this.logger.log('TELEMETRY_ENABLED is false: skipping nightly pruning schedule registration');
      try {
        await this.queue.removeJobScheduler(PRUNING_SCHEDULER_ID);
      } catch {
        // Ignore if scheduler was not registered
      }
      this.isSchedulerRegistered = false;
      return false;
    }

    try {
      await this.queue.upsertJobScheduler(
        PRUNING_SCHEDULER_ID,
        { pattern: NIGHTLY_CRON_PATTERN },
        {
          name: PRUNING_JOB_NAME,
          data: { olderThanDays: 90, batchSize: 5000 },
          opts: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            removeOnComplete: 10,
            removeOnFail: false,
          },
        }
      );
      this.isSchedulerRegistered = true;
      this.logger.log(
        `Nightly telemetry pruning schedule registered (${NIGHTLY_CRON_PATTERN} UTC) with ID: ${PRUNING_SCHEDULER_ID}`
      );
      return true;
    } catch (err) {
      this.isSchedulerRegistered = false;
      this.logger.error(
        `Failed to register nightly pruning schedule: ${(err as Error).message}`,
        err
      );
      return false;
    }
  }

  /**
   * Reconciles the recurring scheduler with the active TELEMETRY_ENABLED state.
   * If telemetry is disabled, removes the scheduler.
   * If telemetry is enabled, idempotently registers the scheduler.
   */
  public async reconcileScheduler(): Promise<boolean> {
    if (!this.queue || !this.isConnected || this.isClosing) {
      this.isSchedulerRegistered = false;
      this.updateAndLogStatus();
      return false;
    }

    const enabled = this.telemetryService.isTelemetryEnabled();
    if (!enabled) {
      try {
        await this.queue.removeJobScheduler(PRUNING_SCHEDULER_ID);
      } catch {
        // Ignore if not registered
      }
      this.isSchedulerRegistered = false;
      this.updateAndLogStatus();
      return false;
    }

    const registered = await this.registerNightlySchedule();
    this.updateAndLogStatus();
    return registered;
  }

  /**
   * Core pruning job execution handler invoked by BullMQ worker or manual dispatch.
   * Double-checks TELEMETRY_ENABLED kill switch before invoking domain pruning service.
   */
  public async processPruningJob(job?: Job<PruningJobPayload>): Promise<PruneResult> {
    this.logger.log(`[TELEMETRY_PRUNING_WORKER] Processing pruning job: id=${job?.id || 'manual'}`);

    // Kill Switch Check immediately before execution
    if (!this.telemetryService.isTelemetryEnabled()) {
      this.logger.log(`[TELEMETRY_PRUNING_WORKER] Pruning job skipped: TELEMETRY_ENABLED is false`);
      const skippedResult: PruneResult = {
        deletedCount: 0,
        batchesProcessed: 0,
        completed: true,
        skipped: true,
        reason: 'TELEMETRY_DISABLED',
      };
      this.lastPruningRun = {
        timestamp: new Date().toISOString(),
        deletedCount: 0,
        batchesProcessed: 0,
        completed: true,
        skipped: true,
        reason: 'TELEMETRY_DISABLED',
      };
      return skippedResult;
    }

    const olderThanDays = job?.data?.olderThanDays ?? 90;
    const batchSize = job?.data?.batchSize ?? 5000;

    try {
      const result = await this.telemetryService.pruneOldCheckpoints(olderThanDays, batchSize);
      this.lastPruningRun = {
        timestamp: new Date().toISOString(),
        deletedCount: result.deletedCount,
        batchesProcessed: result.batchesProcessed,
        completed: result.completed,
        skipped: result.skipped,
        reason: result.reason,
      };
      return result;
    } catch (err) {
      this.lastPruningRun = {
        timestamp: new Date().toISOString(),
        deletedCount: 0,
        batchesProcessed: 0,
        completed: false,
        reason: (err as Error).message,
      };
      throw err;
    }
  }

  /**
   * Triggers a manual pruning run on-demand (used for operator tasks or tests).
   */
  public async triggerManualPrune(olderThanDays = 90, batchSize = 5000): Promise<PruneResult> {
    return this.processPruningJob({
      id: `manual_${Date.now()}`,
      data: { olderThanDays, batchSize },
    } as Job<PruningJobPayload>);
  }

  public getSchedulerConfig() {
    return {
      schedulerId: PRUNING_SCHEDULER_ID,
      pattern: NIGHTLY_CRON_PATTERN,
      queueName: TELEMETRY_PRUNING_QUEUE_NAME,
      jobName: PRUNING_JOB_NAME,
    };
  }

  public isWorkerReady(): boolean {
    return (
      this.isConnected &&
      this.queue !== null &&
      this.worker !== null &&
      this.isSchedulerRegistered &&
      !this.isClosing
    );
  }

  public getStatus(): RetentionWorkerStatus {
    if (!this.telemetryService.isTelemetryEnabled()) {
      return 'disabled';
    }
    if (this.isWorkerReady()) {
      return 'ready';
    }
    return 'degraded';
  }

  public getHealthDetails(): RetentionWorkerHealthDetails {
    return {
      status: this.getStatus(),
      isTelemetryEnabled: this.telemetryService.isTelemetryEnabled(),
      isConnected: this.isConnected,
      isWorkerActive: this.worker !== null && !this.isClosing,
      isSchedulerRegistered: this.isSchedulerRegistered,
      schedulerId: PRUNING_SCHEDULER_ID,
      pattern: NIGHTLY_CRON_PATTERN,
      queueName: TELEMETRY_PRUNING_QUEUE_NAME,
      jobName: PRUNING_JOB_NAME,
      lastPruningRun: this.lastPruningRun,
    };
  }

  private updateAndLogStatus(): void {
    const currentStatus = this.getStatus();
    if (currentStatus !== this.lastLoggedStatus) {
      this.logger.log(
        `[TELEMETRY_PRUNING_WORKER] State transition: ${this.lastLoggedStatus ?? 'init'} -> ${currentStatus}`
      );
      this.lastLoggedStatus = currentStatus;
    }
  }

  private async cleanupResources(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.close();
      } catch (err) {
        this.logger.warn(`Worker close warning: ${(err as Error).message}`);
      }
      this.worker = null;
    }
    if (this.queue) {
      try {
        await this.queue.close();
      } catch (err) {
        this.logger.warn(`Queue close warning: ${(err as Error).message}`);
      }
      this.queue = null;
    }
  }

  async onModuleDestroy() {
    this.isClosing = true;
    this.clearWatchdogTimer();

    this.logger.log('Gracefully shutting down telemetry pruning worker and Redis connections...');

    await this.cleanupResources();

    if (this.redisConnection) {
      if (typeof this.redisConnection.removeAllListeners === 'function') {
        this.redisConnection.removeAllListeners();
      }
      try {
        this.redisConnection.disconnect();
      } catch {
        // ignore disconnect errors during shutdown
      }
      this.redisConnection = null;
    }

    this.isConnected = false;
    this.isSchedulerRegistered = false;
    this.updateAndLogStatus();
  }
}
