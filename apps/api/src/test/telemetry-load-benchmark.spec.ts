import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { monitorEventLoopDelay } from 'perf_hooks';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import {
  createTestDatabase,
  setupTestCloudinaryConfig,
  assertSafeDatabaseUrl,
  assertSafeTestDatabase,
  cleanupBenchmarkFixtures,
  BENCHMARK_COURSE_SLUG,
} from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { learningEvents } from '../database/schema/telemetry';
import { eq, sql } from 'drizzle-orm';
import { TelemetryService } from '../modules/telemetry/telemetry.service';
import { TelemetryPrivacyService } from '../modules/telemetry/telemetry-privacy.service';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

/**
 * In dedicated benchmark execution (isolated runner), strictly enforce the p95 latency acceptance gate (< 250ms).
 * In concurrent full-suite CI execution, all functional, data integrity, privacy, rate limiting, and idempotency
 * assertions are fully enforced, while latency metrics are logged for diagnostics to separate algorithmic correctness
 * from runner CPU contention.
 */
const isStrictBenchmark =
  process.env.TELEMETRY_BENCHMARK_STRICT === 'true' ||
  process.env.npm_lifecycle_event === 'test:benchmark';

interface BenchmarkMetrics {
  totalRequests: number;
  totalEvents: number;
  wallClockMs: number;
  throughputReqPerSec: number;
  throughputEventsPerSec: number;
  latenciesMs: number[];
  minMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  eventLoopDelayMeanMs?: number;
  eventLoopDelayMaxMs?: number;
  eventLoopDelayP95Ms?: number;
}

function computeMetrics(
  latencies: number[],
  totalEvents: number,
  wallClockMs: number,
  eldMetrics?: { meanMs: number; maxMs: number; p95Ms: number }
): BenchmarkMetrics {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  const getPercentile = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * n), n - 1);
    return sorted[idx];
  };

  return {
    totalRequests: n,
    totalEvents,
    wallClockMs,
    throughputReqPerSec: Number(((n / (wallClockMs / 1000))).toFixed(2)),
    throughputEventsPerSec: Number(((totalEvents / (wallClockMs / 1000))).toFixed(2)),
    latenciesMs: sorted,
    minMs: Number(sorted[0].toFixed(2)),
    meanMs: Number((sum / n).toFixed(2)),
    p50Ms: Number(getPercentile(50).toFixed(2)),
    p95Ms: Number(getPercentile(95).toFixed(2)),
    p99Ms: Number(getPercentile(99).toFixed(2)),
    maxMs: Number(sorted[n - 1].toFixed(2)),
    eventLoopDelayMeanMs: eldMetrics ? Number(eldMetrics.meanMs.toFixed(2)) : undefined,
    eventLoopDelayMaxMs: eldMetrics ? Number(eldMetrics.maxMs.toFixed(2)) : undefined,
    eventLoopDelayP95Ms: eldMetrics ? Number(eldMetrics.p95Ms.toFixed(2)) : undefined,
  };
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

describe('P7.1 / WP-P7-06: Telemetry Ingestion Load Benchmark & Security Gate', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let isRealDb = false;
  let telemetryService: TelemetryService;
  let privacyService: TelemetryPrivacyService;

  const CONCURRENT_STUDENTS = 50;
  const studentCookies: string[][] = [];
  const studentIds: string[] = [];

  let testCourse: any;
  let testModule: any;
  let videoLesson: any;

  beforeAll(async () => {
    setupTestCloudinaryConfig();

    const usePostgres =
      process.env.TELEMETRY_BENCHMARK_USE_POSTGRES === 'true' &&
      !!process.env.DATABASE_URL;

    if (usePostgres) {
      // 1. Preflight URL safety check: fail closed if non-local or non-test database URL
      assertSafeDatabaseUrl(process.env.DATABASE_URL!);

      testPool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });

      // 2. Server-side identity check: verify current_database() from live PostgreSQL connection
      const identityRes = await testPool.query('SELECT current_database(), current_user');
      const currentDb = identityRes.rows[0]?.current_database;
      assertSafeTestDatabase(process.env.DATABASE_URL!, currentDb);

      testDb = drizzle(testPool, { schema });
      isRealDb = true;

      // 3. Fixture-scoped cleanup: removes ONLY benchmark records (never broad table delete)
      await cleanupBenchmarkFixtures(testDb, {
        databaseUrl: process.env.DATABASE_URL!,
      });
    } else {
      const mem = await createTestDatabase();
      testDb = mem.db;
      testPool = mem.pool;
      isRealDb = false;

      // Ensure clean benchmark state in in-memory database as well
      await cleanupBenchmarkFixtures(testDb);
    }

    // Seed Instructor
    let [instructorRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'))
      .limit(1);

    if (!instructorRole) {
      [instructorRole] = await testDb
        .insert(schema.roles)
        .values({
          name: 'instructor',
          description: 'Course instructor with curriculum authoring privileges',
        })
        .returning();
    }

    const instPasswordHash = await CryptoUtil.hashPassword('InstructorPass123!');
    const [instructorUser] = await testDb
      .insert(schema.users)
      .values({
        name: 'Benchmark Instructor',
        username: 'bench_instructor',
        email: 'bench_inst@techsprout.edu',
        phone: '01711000000',
        passwordHash: instPasswordHash,
        isVerified: true,
      })
      .returning();

    await testDb.insert(schema.userRoles).values({
      userId: instructorUser.id,
      roleId: instructorRole.id,
    });

    // Seed Category & Course
    const [category] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Load Benchmark Category',
        slug: 'load-benchmark-category',
        isActive: true,
      })
      .returning();

    const [course] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Concurrent Video Scrubbing Benchmark',
        slug: 'concurrent-video-scrubbing-benchmark',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
        price: '0.00',
      })
      .returning();
    testCourse = course;

    // Seed Module & Lesson (1800s video)
    const [mod] = await testDb
      .insert(schema.modules)
      .values({
        courseId: testCourse.id,
        title: 'High-Throughput Telemetry Module',
        position: 1,
      })
      .returning();
    testModule = mod;

    const [les] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: testModule.id,
        title: 'Load Test Video Lecture (30m)',
        lessonType: 'VIDEO',
        position: 1,
        durationSeconds: 1800,
      })
      .returning();
    videoLesson = les;

    // Seed 50 Concurrent Students & Active Enrollments
    let [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    if (!studentRole) {
      [studentRole] = await testDb
        .insert(schema.roles)
        .values({
          name: 'student',
          description: 'Enrolled student with standard course access',
        })
        .returning();
    }

    const studentPasswordHash = await CryptoUtil.hashPassword('BenchStudentPass123!');

    for (let i = 1; i <= CONCURRENT_STUDENTS; i++) {
      const pad = String(i).padStart(3, '0');
      const [st] = await testDb
        .insert(schema.users)
        .values({
          name: `Synthetic Student ${pad}`,
          username: `synth_student_${pad}`,
          email: `synth_student_${pad}@techsprout.edu`,
          phone: `01710000${pad}`,
          passwordHash: studentPasswordHash,
          isVerified: true,
        })
        .returning();

      studentIds.push(st.id);

      await testDb.insert(schema.userRoles).values({
        userId: st.id,
        roleId: studentRole.id,
      });

      // Active enrollment in test course
      await testDb.insert(schema.enrollments).values({
        studentId: st.id,
        courseId: testCourse.id,
        status: 'ACTIVE',
      });
    }

    // Build NestJS App
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
    await app.listen(0);

    telemetryService = moduleRef.get<TelemetryService>(TelemetryService);
    privacyService = moduleRef.get<TelemetryPrivacyService>(TelemetryPrivacyService);

    // Pre-authenticate all 50 students and capture authentication cookies
    for (let i = 1; i <= CONCURRENT_STUDENTS; i++) {
      const pad = String(i).padStart(3, '0');
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `synth_student_${pad}@techsprout.edu`,
          password: 'BenchStudentPass123!',
        });
      studentCookies.push(loginRes.headers['set-cookie'] as unknown as string[]);
    }

    // Pre-warm route handlers, Zod schema bytecode, and Drizzle query builder templates
    const warmupBatch = [
      {
        eventId: crypto.randomUUID(),
        courseId: testCourse.id,
        moduleId: testModule.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_STARTED',
        metadata: { watchPositionSeconds: 0, totalDurationSeconds: 1800, playbackRate: 1.0 },
        occurredAt: new Date().toISOString(),
      },
    ];
    await request(app.getHttpServer())
      .post('/api/v1/learning/events')
      .set('Cookie', studentCookies[0])
      .send({ events: warmupBatch });

    await request(app.getHttpServer())
      .post('/api/v1/learning/events/beacon')
      .set('Cookie', studentCookies[0])
      .set('Content-Type', 'text/plain;charset=UTF-8')
      .send(JSON.stringify({ events: warmupBatch }));

    // Clean up warmup rows and reset rate limits so benchmark starts clean
    if (isRealDb && process.env.DATABASE_URL && testPool) {
      const identityRes = await testPool.query('SELECT current_database()');
      const currentDb = identityRes.rows[0]?.current_database;
      assertSafeTestDatabase(process.env.DATABASE_URL, currentDb);
    }
    await testDb.delete(schema.learningEvents).where(
      sql`${schema.learningEvents.courseId} IN (
        SELECT id FROM ${schema.courses} WHERE slug = ${BENCHMARK_COURSE_SLUG}
      )`
    );
    telemetryService.resetRateLimits();
  }, 45000);

  afterAll(async () => {
    try {
      if (isRealDb && testDb && process.env.DATABASE_URL && testPool) {
        const identityRes = await testPool.query('SELECT current_database()');
        const currentDb = identityRes.rows[0]?.current_database;
        assertSafeTestDatabase(process.env.DATABASE_URL, currentDb);
        await cleanupBenchmarkFixtures(testDb, {
          databaseUrl: process.env.DATABASE_URL,
        });
      } else if (!isRealDb && testDb) {
        await cleanupBenchmarkFixtures(testDb);
      }
    } catch (err) {
      console.error('[Benchmark Teardown] Error during fixture cleanup:', err);
    } finally {
      if (app) {
        await app.close();
      }
      if (testPool) {
        await testPool.end();
      }
    }
  });

  beforeEach(() => {
    telemetryService.resetRateLimits();
    telemetryService.setTelemetryEnabledOverride(null);
    privacyService.setSaltUnavailableForTesting(false);
  });

  // =========================================================================
  // 1. BENCHMARK 1: CONCURRENT VIDEO SCRUBBING (50 CONCURRENT STUDENTS)
  // =========================================================================

  describe('1. Basic Telemetry Ingestion Load Benchmark (50 Concurrent Students)', () => {
    it('1.1 should ingest 50 concurrent student batches (500 events) with p95 latency < 250ms and 100% success', async () => {
      // Generate realistic video scrub event sequences for each student:
      // 10 events per student: STARTED, 2 CHECKPOINTS, 4 SEEKS, 2 PAUSES, 1 COMPLETED
      const studentBatches = studentIds.map((_, studentIdx) => {
        const events = [
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_STARTED',
            metadata: { watchPositionSeconds: 0, totalDurationSeconds: 1800, playbackRate: 1.0 },
            occurredAt: new Date(Date.now() - 600000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            metadata: { watchPositionSeconds: 60, totalDurationSeconds: 1800, playbackRate: 1.0 },
            occurredAt: new Date(Date.now() - 540000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_SEEKED',
            metadata: {
              watchPositionSeconds: 300,
              previousPositionSeconds: 60,
              totalDurationSeconds: 1800,
              playbackRate: 1.0,
            },
            occurredAt: new Date(Date.now() - 480000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_PAUSED',
            metadata: { watchPositionSeconds: 300, totalDurationSeconds: 1800, playbackRate: 1.0 },
            occurredAt: new Date(Date.now() - 420000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_SEEKED',
            metadata: {
              watchPositionSeconds: 150,
              previousPositionSeconds: 300,
              totalDurationSeconds: 1800,
              playbackRate: 1.0,
            },
            occurredAt: new Date(Date.now() - 360000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            metadata: { watchPositionSeconds: 210, totalDurationSeconds: 1800, playbackRate: 1.0 },
            occurredAt: new Date(Date.now() - 300000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_SEEKED',
            metadata: {
              watchPositionSeconds: 600,
              previousPositionSeconds: 210,
              totalDurationSeconds: 1800,
              playbackRate: 1.0,
            },
            occurredAt: new Date(Date.now() - 240000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_PAUSED',
            metadata: { watchPositionSeconds: 600, totalDurationSeconds: 1800, playbackRate: 1.0 },
            occurredAt: new Date(Date.now() - 180000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_SEEKED',
            metadata: {
              watchPositionSeconds: 550,
              previousPositionSeconds: 600,
              totalDurationSeconds: 1800,
              playbackRate: 1.0,
            },
            occurredAt: new Date(Date.now() - 120000).toISOString(),
          },
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            moduleId: testModule.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_COMPLETED',
            metadata: {
              watchPositionSeconds: 1800,
              totalDurationSeconds: 1800,
              playbackRate: 1.0,
              passed: true,
            },
            occurredAt: new Date(Date.now() - 60000).toISOString(),
          },
        ];
        return events;
      });

      const initialRows = await testDb.select().from(learningEvents);
      expect(initialRows).toHaveLength(0);

      // Concurrent Execution across 50 students with realistic concurrency pool (10 concurrent streams)
      const eld = monitorEventLoopDelay({ resolution: 10 });
      eld.enable();

      const startWallClock = performance.now();
      const responses = await runWithConcurrencyLimit(
        studentBatches,
        10,
        async (batch, idx) => {
          const reqStart = performance.now();
          const res = await request(app.getHttpServer())
            .post('/api/v1/learning/events')
            .set('Cookie', studentCookies[idx])
            .send({ events: batch });
          const reqEnd = performance.now();
          return {
            status: res.status,
            body: res.body,
            latencyMs: reqEnd - reqStart,
          };
        }
      );
      const endWallClock = performance.now();
      const wallClockMs = endWallClock - startWallClock;
      eld.disable();

      // 1. Verify 100% success rate
      for (const r of responses) {
        expect(r.status).toBe(200);
        expect(r.body.data.ingestedCount).toBe(10);
        expect(r.body.data.deduplicatedCount).toBe(0);
      }

      // 2. Compute performance metrics
      const latencies = responses.map((r) => r.latencyMs);
      const metrics = computeMetrics(latencies, 500, wallClockMs, {
        meanMs: eld.mean / 1e6,
        maxMs: eld.max / 1e6,
        p95Ms: eld.percentile(95) / 1e6,
      });

      // Log verified benchmark scorecard to test output
      console.log('=== P7.1 TELEMETRY INGESTION LOAD BENCHMARK SCORECARD (CONCURRENT POOL = 10) ===');
      console.log(`Database Adapter:        ${isRealDb ? 'PostgreSQL 16 (Provisioned Service)' : 'pg-mem (In-Memory Fallback)'}`);
      console.log(`Concurrent Students:     ${CONCURRENT_STUDENTS}`);
      console.log(`Total Requests:          ${metrics.totalRequests}`);
      console.log(`Total Ingested Events:   ${metrics.totalEvents}`);
      console.log(`Wall-Clock Duration:     ${metrics.wallClockMs.toFixed(2)} ms`);
      console.log(`Throughput (Req/sec):    ${metrics.throughputReqPerSec} req/s`);
      console.log(`Throughput (Events/sec): ${metrics.throughputEventsPerSec} events/s`);
      console.log(`Latency Min:             ${metrics.minMs} ms`);
      console.log(`Latency Mean:            ${metrics.meanMs} ms`);
      console.log(`Latency p50:             ${metrics.p50Ms} ms`);
      console.log(`Latency p95:             ${metrics.p95Ms} ms`);
      console.log(`Latency p99:             ${metrics.p99Ms} ms`);
      console.log(`Latency Max:             ${metrics.maxMs} ms`);
      if (metrics.eventLoopDelayP95Ms !== undefined) {
        console.log(`Event Loop Delay (p95):  ${metrics.eventLoopDelayP95Ms} ms`);
        console.log(`Event Loop Delay (Max):  ${metrics.eventLoopDelayMaxMs} ms`);
      }
      console.log('================================================================================');

      // 3. Assert Acceptance Criteria: Latency p95 must remain < 250ms under sustained concurrent load
      if (isStrictBenchmark) {
        expect(metrics.p95Ms).toBeLessThan(250);
      } else {
        console.log(
          `[BENCHMARK] Concurrent suite run: measured p95=${metrics.p95Ms} ms. Strict < 250ms gate enforced via dedicated benchmark command.`
        );
      }

      // 4. Verify Database Integrity: Exactly 500 rows inserted
      const persistedRows = await testDb.select().from(learningEvents);
      expect(persistedRows).toHaveLength(500);

      // 5. Verify Privacy Invariants under Load:
      for (const row of persistedRows) {
        // row.userId stores non-null 64-char hex HMAC-SHA256 (never raw UUID)
        expect(row.userId).toBeDefined();
        expect(row.userId).toHaveLength(64);
        expect(row.userId).toMatch(/^[0-9a-f]{64}$/);

        // Verify none of the raw student UUIDs match the stored hash
        expect(studentIds).not.toContain(row.userId);

        // Metadata strictly obeys allowlist
        const meta = row.metadata as Record<string, any>;
        const allowedKeys = new Set([
          'watchPositionSeconds',
          'totalDurationSeconds',
          'playbackRate',
          'previousPositionSeconds',
          'passed',
        ]);
        for (const k of Object.keys(meta)) {
          expect(allowedKeys.has(k)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // 2. BENCHMARK 2: CONCURRENT EXIT BEACON TRANSPORT (20 CONCURRENT STUDENTS)
  // =========================================================================

  describe('2. Concurrent Exit Beacon Transport (20 Concurrent Students)', () => {
    it('2.1 should process 20 concurrent beacon requests with p95 latency < 250ms and 100% success', async () => {
      // 20 students closing tabs simultaneously
      const beaconStudentsCount = 20;
      const beaconBatches = studentIds.slice(0, beaconStudentsCount).map(() => ({
        events: [
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            metadata: { watchPositionSeconds: 450, totalDurationSeconds: 1800, playbackRate: 1.0 },
            occurredAt: new Date().toISOString(),
          },
        ],
      }));

      const eld = monitorEventLoopDelay({ resolution: 10 });
      eld.enable();

      const startWallClock = performance.now();
      const responses = await Promise.all(
        beaconBatches.map(async (batch, idx) => {
          const reqStart = performance.now();
          const res = await request(app.getHttpServer())
            .post('/api/v1/learning/events/beacon')
            .set('Cookie', studentCookies[idx])
            .set('Content-Type', 'text/plain;charset=UTF-8')
            .send(JSON.stringify(batch));
          const reqEnd = performance.now();
          return {
            status: res.status,
            latencyMs: reqEnd - reqStart,
          };
        })
      );
      const wallClockMs = performance.now() - startWallClock;
      eld.disable();

      for (const r of responses) {
        expect(r.status).toBe(200);
      }

      const metrics = computeMetrics(
        responses.map((r) => r.latencyMs),
        beaconStudentsCount,
        wallClockMs,
        {
          meanMs: eld.mean / 1e6,
          maxMs: eld.max / 1e6,
          p95Ms: eld.percentile(95) / 1e6,
        }
      );

      console.log('=== P7.1 CONCURRENT EXIT BEACON BENCHMARK SCORECARD ===');
      console.log(`Database Adapter:        ${isRealDb ? 'PostgreSQL 16 (Provisioned Service)' : 'pg-mem (In-Memory Fallback)'}`);
      console.log(`Concurrent Exit Beacons: ${beaconStudentsCount}`);
      console.log(`Throughput (Req/sec):    ${metrics.throughputReqPerSec} req/s`);
      console.log(`Latency p50:             ${metrics.p50Ms} ms`);
      console.log(`Latency p95:             ${metrics.p95Ms} ms`);
      console.log(`Latency Max:             ${metrics.maxMs} ms`);
      if (metrics.eventLoopDelayP95Ms !== undefined) {
        console.log(`Event Loop Delay (p95):  ${metrics.eventLoopDelayP95Ms} ms`);
        console.log(`Event Loop Delay (Max):  ${metrics.eventLoopDelayMaxMs} ms`);
      }
      console.log('=======================================================');

      if (isStrictBenchmark) {
        expect(metrics.p95Ms).toBeLessThan(250);
      } else {
        console.log(
          `[BENCHMARK] Concurrent suite run: measured exit beacon p95=${metrics.p95Ms} ms. Strict < 250ms gate enforced via dedicated benchmark command.`
        );
      }
    });
  });

  // =========================================================================
  // 3. SECURITY GATE: RATE LIMITING, IDEMPOTENCY, & KILL SWITCH
  // =========================================================================

  describe('3. Security Gate & Resilience Review', () => {
    it('3.1 should enforce rate limit under concurrent request flood rejecting request 3 with HTTP 429', async () => {
      const studentIdx = 0;
      const lessonId = videoLesson.id;

      const makeBatch = () => ({
        events: [
          {
            eventId: crypto.randomUUID(),
            courseId: testCourse.id,
            lessonId,
            eventType: 'VIDEO_CHECKPOINT',
            metadata: { watchPositionSeconds: 10, totalDurationSeconds: 1800 },
            occurredAt: new Date().toISOString(),
          },
        ],
      });

      // Request 1: Allowed (200)
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies[studentIdx])
        .send(makeBatch());
      expect(res1.status).toBe(200);

      // Request 2: Allowed (200) - 2 requests per 60s window
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies[studentIdx])
        .send(makeBatch());
      expect(res2.status).toBe(200);

      // Request 3: Exceeds rate limit -> HTTP 429
      const res3 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies[studentIdx])
        .send(makeBatch());
      expect(res3.status).toBe(429);
      expect(res3.body.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('3.2 should deduplicate identical eventIds under concurrent retry without increasing database row count', async () => {
      const studentIdx = 1;
      const sharedEventId = crypto.randomUUID();

      const batch = {
        events: [
          {
            eventId: sharedEventId,
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_STARTED',
            metadata: { watchPositionSeconds: 0, totalDurationSeconds: 1800 },
            occurredAt: new Date().toISOString(),
          },
        ],
      };

      // Initial submission
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies[studentIdx])
        .send(batch);
      expect(res1.status).toBe(200);
      expect(res1.body.data.ingestedCount).toBe(1);
      expect(res1.body.data.deduplicatedCount).toBe(0);

      // Reset rate limit to simulate retry after cooldown or retry window
      telemetryService.resetRateLimits();

      // Retry identical batch
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies[studentIdx])
        .send(batch);
      expect(res2.status).toBe(200);
      expect(res2.body.data.ingestedCount).toBe(0);
      expect(res2.body.data.deduplicatedCount).toBe(1);
    });

    it('3.3 should short-circuit ingestion with HTTP 200 and zero writes when TELEMETRY_ENABLED kill switch is engaged', async () => {
      telemetryService.setTelemetryEnabledOverride(false);

      const countBefore = await testDb
        .select({ count: sql<number>`count(*)` })
        .from(learningEvents);

      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies[0])
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              metadata: {},
              occurredAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ingestedCount).toBe(0);
      expect(res.body.message).toContain('disabled');

      const countAfter = await testDb
        .select({ count: sql<number>`count(*)` })
        .from(learningEvents);

      expect(Number(countAfter[0].count)).toBe(Number(countBefore[0].count));
    });
  });
});
