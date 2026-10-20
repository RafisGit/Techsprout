import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { EventEmitter } from 'events';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import * as schema from '../database/schema';
import { learningEvents } from '../database/schema/telemetry';
import { eq, inArray } from 'drizzle-orm';
import { TelemetryService } from '../modules/telemetry/telemetry.service';
import { TelemetryPrivacyService } from '../modules/telemetry/telemetry-privacy.service';
import {
  TelemetryPruningWorker,
  PRUNING_SCHEDULER_ID,
  NIGHTLY_CRON_PATTERN,
  TELEMETRY_PRUNING_QUEUE_NAME,
  PRUNING_JOB_NAME,
} from '../modules/telemetry/telemetry-pruning.worker';
import * as crypto from 'crypto';

class MockRedisClient extends EventEmitter {
  public status = 'ready';
  public connect = vi.fn().mockResolvedValue(undefined);
  public disconnect = vi.fn().mockImplementation(() => {
    this.status = 'end';
    this.emit('end');
  });
  public ping = vi.fn().mockResolvedValue('PONG');
}

describe('TECHSPROUT P7.1 — Retention Worker Resilience & Lifecycle Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let telemetryService: TelemetryService;
  let privacyService: TelemetryPrivacyService;
  let telemetryPruningWorker: TelemetryPruningWorker;

  let testCourse: any;
  let videoLesson: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // Seed role, instructor, course, and lesson
    const [instructorRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'))
      .limit(1);

    const [instructor] = await testDb
      .insert(schema.users)
      .values({
        email: 'pruning-instructor@techsprout.edu',
        username: 'pruneinst',
        passwordHash: 'hashed_password_123',
        name: 'Pruning Lead Instructor',
        roleId: instructorRole.id,
      })
      .returning();

    const [category] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Data Architecture',
        slug: 'data-architecture',
      })
      .returning();

    [testCourse] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Retention Pruning Architecture',
        slug: 'retention-pruning-architecture',
        description: 'Testing 90-day retention pruning and worker resilience',
        instructorId: instructor.id,
        categoryId: category.id,
        price: '0.00',
        currency: 'USD',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      })
      .returning();

    const [moduleRecord] = await testDb
      .insert(schema.modules)
      .values({
        courseId: testCourse.id,
        title: 'Module 1: Worker Resilience',
        position: 1,
      })
      .returning();

    [videoLesson] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: moduleRecord.id,
        title: 'Lesson 1.1: BullMQ Architecture',
        slug: 'bullmq-architecture',
        lessonType: 'VIDEO',
        durationSeconds: 1800,
        position: 1,
      })
      .returning();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        pool: testPool,
        db: testDb,
        onModuleDestroy: async () => {},
      })
      .overrideProvider(DRIZZLE_DB)
      .useValue(testDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    telemetryService = moduleRef.get<TelemetryService>(TelemetryService);
    privacyService = moduleRef.get<TelemetryPrivacyService>(TelemetryPrivacyService);
    telemetryPruningWorker = moduleRef.get<TelemetryPruningWorker>(TelemetryPruningWorker);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    telemetryService.setTelemetryEnabledOverride(null);
  });

  // =========================================================================
  // 1. Redis unavailable on application startup, with the API remaining available
  // =========================================================================
  it('1. should handle Redis unavailable on application startup with the API remaining available', async () => {
    // When Redis is disconnected or standby on startup
    const workerStatus = telemetryPruningWorker.getStatus();
    expect(['degraded', 'ready', 'disabled']).toContain(workerStatus);

    // Core HTTP API /health endpoint returns 200 OK
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.database).toBe('up');
    expect(res.body.services.retentionWorker).toBeDefined();

    // Core readiness probe /health/ready returns 200 OK
    const readyRes = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.ready).toBe(true);
  });

  // =========================================================================
  // 2. Redis recovering after initial retries are exhausted
  // =========================================================================
  it('2. should handle Redis recovering after initial retries are exhausted', async () => {
    // Simulate terminal 'end' state where ioredis retry limit was exhausted
    const deadClient = new MockRedisClient();
    deadClient.status = 'end';

    (telemetryPruningWorker as any).redisConnection = deadClient;
    (telemetryPruningWorker as any).isConnected = false;
    (telemetryPruningWorker as any).isSchedulerRegistered = false;

    // In terminal state without recovery, worker status is degraded
    expect(telemetryPruningWorker.getStatus()).toBe('degraded');
    expect(telemetryPruningWorker.isWorkerReady()).toBe(false);

    // Simulate Redis recovery: reconstruct connection via recoverConnection()
    const recoveredClient = new MockRedisClient();
    recoveredClient.status = 'ready';

    const mockQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(true),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockWorker = {
      close: vi.fn().mockResolvedValue(undefined),
    };

    // Spy on createRedisConnection to return recoveredClient
    vi.spyOn(telemetryPruningWorker as any, 'createRedisConnection').mockReturnValue(
      recoveredClient
    );

    const recovered = await telemetryPruningWorker.recoverConnection();
    expect(recovered).toBe(true);

    // Simulate connect & setup
    (telemetryPruningWorker as any).queue = mockQueue;
    (telemetryPruningWorker as any).worker = mockWorker;
    (telemetryPruningWorker as any).isConnected = true;
    await telemetryPruningWorker.registerNightlySchedule();

    expect(telemetryPruningWorker.isWorkerReady()).toBe(true);
    expect(telemetryPruningWorker.getStatus()).toBe('ready');
  });

  // =========================================================================
  // 3. Redis disconnecting and recovering during operation
  // =========================================================================
  it('3. should handle Redis disconnecting and recovering during operation', async () => {
    const mockClient = new MockRedisClient();
    const mockQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(true),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockWorker = {
      close: vi.fn().mockResolvedValue(undefined),
    };

    telemetryPruningWorker.attachRedisListeners(mockClient as any);
    (telemetryPruningWorker as any).redisConnection = mockClient;
    (telemetryPruningWorker as any).queue = mockQueue;
    (telemetryPruningWorker as any).worker = mockWorker;
    (telemetryPruningWorker as any).isConnected = true;
    (telemetryPruningWorker as any).isSchedulerRegistered = true;

    expect(telemetryPruningWorker.getStatus()).toBe('ready');

    // Simulate Redis connection drop (error/close event)
    mockClient.emit('close');
    expect((telemetryPruningWorker as any).isConnected).toBe(false);
    expect(telemetryPruningWorker.getStatus()).toBe('degraded');

    // Simulate Redis reconnection (connect/ready event)
    mockClient.emit('connect');
    mockClient.emit('ready');

    expect((telemetryPruningWorker as any).isConnected).toBe(true);
    expect(telemetryPruningWorker.getStatus()).toBe('ready');
  });

  // =========================================================================
  // 4. Reconnection not creating duplicate workers or queues
  // =========================================================================
  it('4. should prevent duplicate Queue and Worker creation on reconnection', async () => {
    const mockClient = new MockRedisClient();
    const existingQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(true),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const existingWorker = {
      close: vi.fn().mockResolvedValue(undefined),
    };

    telemetryPruningWorker.attachRedisListeners(mockClient as any);
    (telemetryPruningWorker as any).redisConnection = mockClient;
    (telemetryPruningWorker as any).queue = existingQueue;
    (telemetryPruningWorker as any).worker = existingWorker;
    (telemetryPruningWorker as any).isConnected = true;
    (telemetryPruningWorker as any).isSchedulerRegistered = true;

    // Fire repeated connect events
    mockClient.emit('connect');
    mockClient.emit('connect');
    mockClient.emit('ready');

    // References must be strictly identical (no new instances instantiated)
    expect((telemetryPruningWorker as any).queue).toBe(existingQueue);
    expect((telemetryPruningWorker as any).worker).toBe(existingWorker);
  });

  // =========================================================================
  // 5. Repeated connection events not registering duplicate schedules
  // =========================================================================
  it('5. should ensure repeated connection events use deterministic scheduler ID without duplicates', async () => {
    const mockQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(true),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
    };

    (telemetryPruningWorker as any).queue = mockQueue;
    (telemetryPruningWorker as any).isConnected = true;

    // Register schedule multiple times
    await telemetryPruningWorker.registerNightlySchedule();
    await telemetryPruningWorker.registerNightlySchedule();
    await telemetryPruningWorker.registerNightlySchedule();

    // Verify all invocations use the exact deterministic PRUNING_SCHEDULER_ID
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledTimes(3);
    for (const call of mockQueue.upsertJobScheduler.mock.calls) {
      expect(call[0]).toBe(PRUNING_SCHEDULER_ID);
      expect(call[1]).toEqual({ pattern: NIGHTLY_CRON_PATTERN });
      expect(call[2].name).toBe(PRUNING_JOB_NAME);
    }
  });

  // =========================================================================
  // 6. Scheduler registration after a restart with telemetry enabled
  // =========================================================================
  it('6. should reliably register nightly scheduler after a restart with telemetry enabled', async () => {
    const mockQueue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(true),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
    };

    (telemetryPruningWorker as any).queue = mockQueue;
    (telemetryPruningWorker as any).isConnected = true;

    // Phase A: Previously disabled deployment
    telemetryService.setTelemetryEnabledOverride(false);
    const disabledResult = await telemetryPruningWorker.registerNightlySchedule();
    expect(disabledResult).toBe(false);
    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith(PRUNING_SCHEDULER_ID);

    // Phase B: Application restarted with telemetry enabled
    telemetryService.setTelemetryEnabledOverride(true);
    const enabledResult = await telemetryPruningWorker.registerNightlySchedule();
    expect(enabledResult).toBe(true);
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      PRUNING_SCHEDULER_ID,
      { pattern: '0 3 * * *' },
      expect.objectContaining({
        name: 'prune-video-checkpoints',
        data: { olderThanDays: 90, batchSize: 5000 },
      })
    );
  });

  // =========================================================================
  // 7. Disabled telemetry preventing schedule execution and database deletion
  // =========================================================================
  it('7. should skip pruning execution and prevent database deletion when TELEMETRY_ENABLED is false', async () => {
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const eventId = crypto.randomUUID();

    await testDb.insert(learningEvents).values({
      id: eventId,
      userId: privacyService.hashIdentifier('student_kill_switch', hundredDaysAgo),
      courseId: testCourse.id,
      lessonId: videoLesson.id,
      eventType: 'VIDEO_CHECKPOINT',
      metadata: { watchPositionSeconds: 15 },
      occurredAt: hundredDaysAgo,
    });

    // Enforce kill switch
    telemetryService.setTelemetryEnabledOverride(false);

    const result = await telemetryPruningWorker.processPruningJob({
      id: 'job_test_kill_switch',
      data: { olderThanDays: 90, batchSize: 5000 },
    } as any);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('TELEMETRY_DISABLED');
    expect(result.deletedCount).toBe(0);

    // Verify row was NOT deleted
    const [preserved] = await testDb
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.id, eventId));
    expect(preserved).toBeDefined();

    // Clean up
    await testDb.delete(learningEvents).where(eq(learningEvents.id, eventId));
  });

  // =========================================================================
  // 8. Scheduler state reporting ready, degraded, and disabled correctly
  // =========================================================================
  it('8. should report ready, degraded, and disabled states with non-sensitive health details', async () => {
    // 1. Disabled state
    telemetryService.setTelemetryEnabledOverride(false);
    expect(telemetryPruningWorker.getStatus()).toBe('disabled');
    const disabledHealth = telemetryPruningWorker.getHealthDetails();
    expect(disabledHealth.status).toBe('disabled');
    expect(disabledHealth.isTelemetryEnabled).toBe(false);

    // 2. Degraded state (telemetry enabled, but disconnected)
    telemetryService.setTelemetryEnabledOverride(true);
    (telemetryPruningWorker as any).isConnected = false;
    expect(telemetryPruningWorker.getStatus()).toBe('degraded');
    const degradedHealth = telemetryPruningWorker.getHealthDetails();
    expect(degradedHealth.status).toBe('degraded');

    // 3. Ready state
    const mockQueue = { upsertJobScheduler: vi.fn(), removeJobScheduler: vi.fn() };
    const mockWorker = { close: vi.fn() };
    (telemetryPruningWorker as any).isConnected = true;
    (telemetryPruningWorker as any).queue = mockQueue;
    (telemetryPruningWorker as any).worker = mockWorker;
    (telemetryPruningWorker as any).isSchedulerRegistered = true;
    expect(telemetryPruningWorker.getStatus()).toBe('ready');

    const readyHealth = telemetryPruningWorker.getHealthDetails();
    expect(readyHealth.status).toBe('ready');
    expect(readyHealth.schedulerId).toBe('telemetry-pruning-nightly');
    expect(readyHealth.pattern).toBe('0 3 * * *');
    expect(readyHealth.queueName).toBe('techsprout-telemetry-pruning');

    // Ensure zero secrets or sensitive credentials leaked
    const healthString = JSON.stringify(readyHealth);
    expect(healthString).not.toContain('password');
    expect(healthString).not.toContain('AUTH_SECRET');
    expect(healthString).not.toContain('redis://');
  });

  // =========================================================================
  // 9. Graceful shutdown during recovery
  // =========================================================================
  it('9. should gracefully cancel recovery timers and close resources on module destroy', async () => {
    const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
    const mockQueue = { close: vi.fn().mockResolvedValue(undefined) };
    const mockRedis = {
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
    };

    (telemetryPruningWorker as any).worker = mockWorker;
    (telemetryPruningWorker as any).queue = mockQueue;
    (telemetryPruningWorker as any).redisConnection = mockRedis;
    (telemetryPruningWorker as any).isConnected = true;

    // Simulate an active recovery watchdog timer
    (telemetryPruningWorker as any).watchdogTimer = setTimeout(() => {}, 60000);

    await telemetryPruningWorker.onModuleDestroy();

    // Verify timer was cleared
    expect((telemetryPruningWorker as any).watchdogTimer).toBeNull();
    expect(mockWorker.close).toHaveBeenCalledTimes(1);
    expect(mockQueue.close).toHaveBeenCalledTimes(1);
    expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
    expect(telemetryPruningWorker.isWorkerReady()).toBe(false);
  });

  // =========================================================================
  // 10. Failed initialization cleaning up partially created resources
  // =========================================================================
  it('10. should safely close partially created resources if initialization fails', async () => {
    const partiallyCreatedQueue = {
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    (telemetryPruningWorker as any).queue = partiallyCreatedQueue;
    (telemetryPruningWorker as any).worker = null;

    // Call cleanupResources
    await (telemetryPruningWorker as any).cleanupResources();

    expect(partiallyCreatedQueue.close).toHaveBeenCalledTimes(1);
    expect((telemetryPruningWorker as any).queue).toBeNull();
    expect((telemetryPruningWorker as any).worker).toBeNull();
  });

  // =========================================================================
  // 11. Scheduled job execution preserving chunked deletion and permanent milestone retention
  // =========================================================================
  it('11. should preserve chunked deletion and permanent retention of milestone records', async () => {
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const oldCheckpoint1 = crypto.randomUUID();
    const oldCheckpoint2 = crypto.randomUUID();
    const oldCheckpoint3 = crypto.randomUUID();
    const recentCheckpoint1 = crypto.randomUUID();
    const recentCheckpoint2 = crypto.randomUUID();
    const oldMilestone1 = crypto.randomUUID();
    const oldMilestone2 = crypto.randomUUID();

    await testDb.insert(learningEvents).values([
      // 3 old video checkpoints (> 90 days)
      {
        id: oldCheckpoint1,
        userId: privacyService.hashIdentifier('user1', hundredDaysAgo),
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 10 },
        occurredAt: hundredDaysAgo,
      },
      {
        id: oldCheckpoint2,
        userId: privacyService.hashIdentifier('user2', hundredDaysAgo),
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 20 },
        occurredAt: hundredDaysAgo,
      },
      {
        id: oldCheckpoint3,
        userId: privacyService.hashIdentifier('user3', hundredDaysAgo),
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 30 },
        occurredAt: hundredDaysAgo,
      },
      // 2 recent video checkpoints (< 90 days)
      {
        id: recentCheckpoint1,
        userId: privacyService.hashIdentifier('user4', tenDaysAgo),
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 10 },
        occurredAt: tenDaysAgo,
      },
      {
        id: recentCheckpoint2,
        userId: privacyService.hashIdentifier('user5', tenDaysAgo),
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 20 },
        occurredAt: tenDaysAgo,
      },
      // 2 milestone events (> 90 days)
      {
        id: oldMilestone1,
        userId: privacyService.hashIdentifier('user1', hundredDaysAgo),
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'COURSE_OPENED',
        metadata: {},
        occurredAt: hundredDaysAgo,
      },
      {
        id: oldMilestone2,
        userId: privacyService.hashIdentifier('user2', hundredDaysAgo),
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'LESSON_COMPLETED',
        metadata: {},
        occurredAt: hundredDaysAgo,
      },
    ]);

    // Prune with batchSize = 2 to verify multi-batch chunked deletion
    const pruneResult = await telemetryService.pruneOldCheckpoints(90, 2);

    expect(pruneResult.completed).toBe(true);
    expect(pruneResult.deletedCount).toBe(3);
    expect(pruneResult.batchesProcessed).toBe(2);

    // Verify 3 old checkpoints deleted
    const oldRows = await testDb
      .select()
      .from(learningEvents)
      .where(inArray(learningEvents.id, [oldCheckpoint1, oldCheckpoint2, oldCheckpoint3]));
    expect(oldRows.length).toBe(0);

    // Verify 2 recent checkpoints retained
    const recentRows = await testDb
      .select()
      .from(learningEvents)
      .where(inArray(learningEvents.id, [recentCheckpoint1, recentCheckpoint2]));
    expect(recentRows.length).toBe(2);

    // Verify 2 milestone events permanently retained
    const milestoneRows = await testDb
      .select()
      .from(learningEvents)
      .where(inArray(learningEvents.id, [oldMilestone1, oldMilestone2]));
    expect(milestoneRows.length).toBe(2);

    // Clean up retained test rows
    await testDb
      .delete(learningEvents)
      .where(
        inArray(learningEvents.id, [
          recentCheckpoint1,
          recentCheckpoint2,
          oldMilestone1,
          oldMilestone2,
        ])
      );
  });
});
