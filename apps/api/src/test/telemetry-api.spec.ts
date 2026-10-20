import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { learningEvents } from '../database/schema/telemetry';
import { eq, and, sql } from 'drizzle-orm';
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

describe('P7.1 — Telemetry Schema & Ingestion API Integration Test Suite (WP-P7-01)', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let telemetryService: TelemetryService;
  let privacyService: TelemetryPrivacyService;
  let telemetryPruningWorker: TelemetryPruningWorker;

  let adminCookies: string[];
  let studentCookies: string[];
  let unenrolledStudentCookies: string[];
  let instructorCookies: string[];

  let adminId: string;
  let studentId: string;
  let unenrolledStudentId: string;
  let instructorId: string;

  let testCourse: any;
  let testModule: any;
  let videoLesson: any;
  let enrollment: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // Seed un-enrolled student
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('StudentUnenrolled123!');
    const [unSt] = await testDb
      .insert(schema.users)
      .values({
        name: 'Unenrolled Student',
        username: 'unenrolled_student',
        email: 'unenrolled@techsprout.edu',
        phone: '01799999901',
        passwordHash,
        isVerified: true,
      })
      .returning();
    unenrolledStudentId = unSt.id;

    await testDb.insert(schema.userRoles).values({
      userId: unenrolledStudentId,
      roleId: studentRole.id,
    });

    // Retrieve seed users
    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'));
    adminId = adminUser.id;

    const [studentUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentId = studentUser.id;

    const [instructorUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));
    instructorId = instructorUser.id;

    // Seed Category & Course
    const [category] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Telemetry Engineering',
        slug: 'telemetry-engineering',
        isActive: true,
      })
      .returning();

    const [course] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Distributed Systems Telemetry',
        slug: 'distributed-systems-telemetry',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorId,
        price: '0.00',
      })
      .returning();
    testCourse = course;

    // Seed Module & Lesson (120 seconds duration)
    const [mod] = await testDb
      .insert(schema.modules)
      .values({
        courseId: testCourse.id,
        title: 'Module 1: Time Series Analytics',
        position: 1,
      })
      .returning();
    testModule = mod;

    const [les] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: testModule.id,
        title: 'Video Heartbeat & Exit Transports',
        lessonType: 'VIDEO',
        position: 1,
        durationSeconds: 120, // 120-second video lesson
      })
      .returning();
    videoLesson = les;

    // Seed Active Enrollment for student
    const [enr] = await testDb
      .insert(schema.enrollments)
      .values({
        studentId: studentId,
        courseId: testCourse.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment = enr;

    // Build NestJS application
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

    // Authenticate users
    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];

    const studentLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = studentLogin.headers['set-cookie'] as unknown as string[];

    const unenrolledLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'unenrolled@techsprout.edu',
      password: 'StudentUnenrolled123!',
    });
    unenrolledStudentCookies = unenrolledLogin.headers['set-cookie'] as unknown as string[];

    const instructorLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructorCookies = instructorLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    telemetryService.resetRateLimits();
    telemetryService.setTelemetryEnabledOverride(null);
    privacyService.setSaltUnavailableForTesting(false);
  });

  // =========================================================================
  // 1. AUTHENTICATION & ENROLLMENT AUTHORIZATION (AC-P7-01-SEC-06)
  // =========================================================================

  describe('1. Authentication & Enrollment Authorization', () => {
    it('1.1 should reject unauthenticated requests with HTTP 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('1.2 should reject authenticated student lacking active course enrollment with HTTP 403 (AC-P7-01-SEC-06)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', unenrolledStudentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ENROLLMENT_REQUIRED');
    });

    it('1.3 should allow authenticated enrolled student with HTTP 200', async () => {
      const eventId = crypto.randomUUID();
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId,
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ingestedCount).toBe(1);
    });

    it('1.4 should allow course owner instructor and platform admin institutional access', async () => {
      const adminEventId = crypto.randomUUID();
      const adminRes = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', adminCookies)
        .send({
          events: [
            {
              eventId: adminEventId,
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: new Date().toISOString(),
            },
          ],
        });
      expect(adminRes.status).toBe(200);

      const instructorEventId = crypto.randomUUID();
      const instructorRes = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', instructorCookies)
        .send({
          events: [
            {
              eventId: instructorEventId,
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: new Date().toISOString(),
            },
          ],
        });
      expect(instructorRes.status).toBe(200);
    });
  });

  // =========================================================================
  // 2. FIELD ALLOWLISTING & PAYLOAD BOUNDING (AC-P7-01-SEC-07)
  // =========================================================================

  describe('2. Field Allowlisting & Payload Bounding', () => {
    it('2.1 should reject unapproved fields in metadata with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'VIDEO_CHECKPOINT',
              occurredAt: new Date().toISOString(),
              metadata: {
                watchPositionSeconds: 45,
                searchQuery: 'unapproved raw search string', // Strictly forbidden!
              },
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('2.2 should reject unapproved root properties with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: new Date().toISOString(),
              userEmail: 'student@techsprout.edu', // Forbidden raw PII!
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('2.3 should reject empty event batch with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('2.4 should reject batches exceeding 50 events ceiling with HTTP 400 (AC-P7-01-SEC-07)', async () => {
      const oversizedEvents = Array.from({ length: 51 }, () => ({
        eventId: crypto.randomUUID(),
        courseId: testCourse.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date().toISOString(),
      }));

      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: oversizedEvents,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('2.5 should reject request body exceeding 32KB ceiling with HTTP 400 (AC-P7-01-SEC-07)', async () => {
      // Craft a 33KB payload
      const paddedEvents = Array.from({ length: 40 }, () => ({
        eventId: crypto.randomUUID(),
        courseId: testCourse.id,
        moduleId: testModule.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date().toISOString(),
        metadata: {
          watchPositionSeconds: 60,
          totalDurationSeconds: 120,
          playbackRate: 1.0,
        },
        sessionId: 's'.repeat(60),
      }));

      // Add extra padding to push body over 32KB
      const largePayload = {
        events: paddedEvents,
        extraPadding: 'x'.repeat(33 * 1024),
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send(largePayload);

      expect(res.status).toBe(400);
      expect(['PAYLOAD_TOO_LARGE', 'VALIDATION_ERROR']).toContain(res.body.errorCode);
    });
  });

  // =========================================================================
  // 3. TEMPORAL & DURATION BOUNDING (AC-P7-01-SEC-04 & AC-P7-01-SEC-05)
  // =========================================================================

  describe('3. Temporal & Duration Bounding', () => {
    it('3.1 should reject events > 30s in future with HTTP 400 (AC-P7-01-SEC-04)', async () => {
      const futureTime = new Date(Date.now() + 60 * 1000).toISOString(); // 60s in future
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: futureTime,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('TEMPORAL_BOUND_FUTURE');
    });

    it('3.2 should reject events > 24 hours in past with HTTP 400 (AC-P7-01-SEC-04)', async () => {
      const pastTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours in past
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: pastTime,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('TEMPORAL_BOUND_PAST');
    });

    it('3.3 should reject watchPositionSeconds exceeding verified lesson video duration with HTTP 400 (AC-P7-01-SEC-05)', async () => {
      // videoLesson duration is 120s; submitting 150s
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              lessonId: videoLesson.id,
              eventType: 'VIDEO_CHECKPOINT',
              occurredAt: new Date().toISOString(),
              metadata: {
                watchPositionSeconds: 150, // Exceeds 120s!
              },
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('WATCH_POSITION_EXCEEDS_DURATION');
    });

    it('3.4 should accept watchPositionSeconds within verified lesson video duration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              lessonId: videoLesson.id,
              eventType: 'VIDEO_CHECKPOINT',
              occurredAt: new Date().toISOString(),
              metadata: {
                watchPositionSeconds: 110, // Within 120s
                totalDurationSeconds: 120,
              },
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ingestedCount).toBe(1);
    });
  });

  // =========================================================================
  // 4. DUPLICATE IDEMPOTENCY & CONFLICT HANDLING (AC-P7-01-SEC-01 & SEC-02)
  // =========================================================================

  describe('4. Duplicate Idempotency & Conflict Handling', () => {
    it('4.1 should idempotently accept duplicate with identical payload returning HTTP 200 with 0 duplicate rows (AC-P7-01-SEC-01)', async () => {
      const sharedEventId = crypto.randomUUID();
      const payload = {
        eventId: sharedEventId,
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date().toISOString(),
        metadata: {
          watchPositionSeconds: 30,
        },
      };

      // First submission
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({ events: [payload] });
      expect(res1.status).toBe(200);
      expect(res1.body.data.ingestedCount).toBe(1);

      // Duplicate submission with identical payload (reset rate limit so rate limiting doesn't mask idempotency)
      telemetryService.resetRateLimits();
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({ events: [payload] });

      expect(res2.status).toBe(200);
      expect(res2.body.data.ingestedCount).toBe(0);
      expect(res2.body.data.deduplicatedCount).toBe(1);

      // Verify DB row count has exactly 1 row for sharedEventId
      const rows = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, sharedEventId));
      expect(rows.length).toBe(1);
    });

    it('4.2 should reject duplicate with differing attributes with HTTP 409 Conflict without altering records (AC-P7-01-SEC-02)', async () => {
      const conflictEventId = crypto.randomUUID();
      const originalTime = new Date().toISOString();

      const originalPayload = {
        eventId: conflictEventId,
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: originalTime,
        metadata: {
          watchPositionSeconds: 15,
        },
      };

      // First submission
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({ events: [originalPayload] });
      expect(res1.status).toBe(200);

      // Conflicting submission with same eventId but altered watchPositionSeconds
      telemetryService.resetRateLimits();
      const conflictingPayload = {
        ...originalPayload,
        metadata: {
          watchPositionSeconds: 60, // Altered!
        },
      };

      const res2 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({ events: [conflictingPayload] });

      expect(res2.status).toBe(409);
      expect(res2.body.errorCode).toBe('IDEMPOTENCY_CONFLICT');

      // Verify original DB record was NOT mutated
      const [record] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, conflictEventId));
      expect((record.metadata as any).watchPositionSeconds).toBe(15);
    });
  });

  // =========================================================================
  // 5. SERVER-SIDE RATE LIMITING (AC-P7-01-SEC-03)
  // =========================================================================

  describe('5. Server-Side Rate Limiting', () => {
    it('5.1 should enforce max 2 requests per 60s per (userId, lessonId) and reject 3rd with HTTP 429 (AC-P7-01-SEC-03)', async () => {
      telemetryService.resetRateLimits();

      // Request 1: OK
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              lessonId: videoLesson.id,
              eventType: 'VIDEO_CHECKPOINT',
              occurredAt: new Date().toISOString(),
              metadata: { watchPositionSeconds: 10 },
            },
          ],
        });
      expect(res1.status).toBe(200);

      // Request 2: OK
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              lessonId: videoLesson.id,
              eventType: 'VIDEO_CHECKPOINT',
              occurredAt: new Date().toISOString(),
              metadata: { watchPositionSeconds: 20 },
            },
          ],
        });
      expect(res2.status).toBe(200);

      // Request 3 (with freshly generated event UUID to test that UUID generation cannot bypass rate limiting): HTTP 429
      const res3 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              lessonId: videoLesson.id,
              eventType: 'VIDEO_CHECKPOINT',
              occurredAt: new Date().toISOString(),
              metadata: { watchPositionSeconds: 30 },
            },
          ],
        });

      expect(res3.status).toBe(429);
      expect(res3.body.errorCode).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  // =========================================================================
  // 6. KILL SWITCH (TELEMETRY_ENABLED=false)
  // =========================================================================

  describe('6. Operational Kill Switch (TELEMETRY_ENABLED=false)', () => {
    it('6.1 should short-circuit with HTTP 200 and zero database writes when disabled', async () => {
      telemetryService.setTelemetryEnabledOverride(false);

      const countBefore = await testDb
        .select({ count: sql<number>`count(*)` })
        .from(learningEvents);

      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              eventType: 'COURSE_OPENED',
              occurredAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ingestedCount).toBe(0);
      expect(res.body.message).toContain('disabled');

      const countAfter = await testDb.select({ count: sql<number>`count(*)` }).from(learningEvents);

      expect(Number(countAfter[0].count)).toBe(Number(countBefore[0].count));
    });
  });

  // =========================================================================
  // 7. BEACON EXIT INGESTION ENDPOINT (POST /api/v1/learning/events/beacon)
  // =========================================================================

  describe('7. Exit Beacon Ingestion', () => {
    it('7.1 should accept single JSON event via beacon endpoint', async () => {
      const eventId = crypto.randomUUID();
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events/beacon')
        .set('Cookie', studentCookies)
        .send({
          eventId,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_PAUSED',
          occurredAt: new Date().toISOString(),
          metadata: { watchPositionSeconds: 50 },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ingestedCount).toBe(1);
    });

    it('7.2 should accept text/plain stringified JSON payload from navigator.sendBeacon', async () => {
      const eventId = crypto.randomUUID();
      const beaconPayload = JSON.stringify({
        eventId,
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        occurredAt: new Date().toISOString(),
        metadata: { watchPositionSeconds: 75 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events/beacon')
        .set('Cookie', studentCookies)
        .set('Content-Type', 'text/plain')
        .send(beaconPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ingestedCount).toBe(1);
    });

    it('7.3 should reject malformed text/plain beacon body with HTTP 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events/beacon')
        .set('Cookie', studentCookies)
        .set('Content-Type', 'text/plain')
        .send('not valid json {;;');

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_JSON');
    });
  });

  // =========================================================================
  // 8. 90-DAY RETENTION PRUNING & WORKER SCHEDULER
  // =========================================================================

  describe('8. 90-Day Retention Pruning & Worker Scheduler', () => {
    it('8.1 should delete VIDEO_CHECKPOINT records older than 90 days while preserving milestone records', async () => {
      const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
      const eightyDaysAgo = new Date(Date.now() - 80 * 24 * 60 * 60 * 1000);

      const oldCheckpointId = crypto.randomUUID();
      const recentCheckpointId = crypto.randomUUID();
      const oldMilestoneLessonCompletedId = crypto.randomUUID();
      const oldMilestoneCourseOpenedId = crypto.randomUUID();

      const hashedUser = privacyService.hashIdentifier(studentId, ninetyOneDaysAgo);

      // Insert directly to simulate historical rows
      await testDb.insert(learningEvents).values([
        {
          id: oldCheckpointId,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 20 },
          occurredAt: ninetyOneDaysAgo,
        },
        {
          id: recentCheckpointId,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 40 },
          occurredAt: eightyDaysAgo,
        },
        {
          id: oldMilestoneLessonCompletedId,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'LESSON_COMPLETED',
          metadata: null,
          occurredAt: ninetyOneDaysAgo,
        },
        {
          id: oldMilestoneCourseOpenedId,
          userId: hashedUser,
          courseId: testCourse.id,
          eventType: 'COURSE_OPENED',
          metadata: null,
          occurredAt: ninetyOneDaysAgo,
        },
      ]);

      // Execute 90-day pruning
      const pruneResult = await telemetryService.pruneOldCheckpoints(90);
      expect(pruneResult.deletedCount).toBeGreaterThanOrEqual(1);

      // Verify old checkpoint is pruned
      const [pruned] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, oldCheckpointId));
      expect(pruned).toBeUndefined();

      // Verify recent checkpoint is retained
      const [retained] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, recentCheckpointId));
      expect(retained).toBeDefined();

      // Verify historical milestone events are permanently retained
      const [milestone1] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, oldMilestoneLessonCompletedId));
      expect(milestone1).toBeDefined();

      const [milestone2] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, oldMilestoneCourseOpenedId));
      expect(milestone2).toBeDefined();
    });

    it('8.2 should execute chunked batch deletion across multiple batches when eligible records exceed batchSize', async () => {
      const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
      const hashedUser = privacyService.hashIdentifier(studentId, ninetyFiveDaysAgo);

      // Seed 12 old checkpoints
      const checkpointIds = Array.from({ length: 12 }, () => crypto.randomUUID());
      await testDb.insert(learningEvents).values(
        checkpointIds.map((id, idx) => ({
          id,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: idx * 10 },
          occurredAt: new Date(ninetyFiveDaysAgo.getTime() + idx * 1000),
        }))
      );

      // Run with batchSize = 5 -> should process in 3 batches (5 + 5 + 2)
      const result = await telemetryService.pruneOldCheckpoints(90, 5);

      expect(result.deletedCount).toBe(12);
      expect(result.batchesProcessed).toBe(3);
      expect(result.completed).toBe(true);

      // Verify all 12 are gone
      const remaining = await testDb
        .select()
        .from(learningEvents)
        .where(
          and(
            eq(learningEvents.eventType, 'VIDEO_CHECKPOINT'),
            sql`${learningEvents.occurredAt} < ${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)}`
          )
        );
      expect(remaining.length).toBe(0);
    });

    it('8.3 should handle exactly batchSize or fewer records in a single batch', async () => {
      const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
      const hashedUser = privacyService.hashIdentifier(studentId, ninetyFiveDaysAgo);

      const checkpointIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await testDb.insert(learningEvents).values(
        checkpointIds.map((id, idx) => ({
          id,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: idx * 5 },
          occurredAt: new Date(ninetyFiveDaysAgo.getTime() + idx * 1000),
        }))
      );

      // Run with batchSize = 10 -> exactly 1 batch
      const result = await telemetryService.pruneOldCheckpoints(90, 10);

      expect(result.deletedCount).toBe(3);
      expect(result.batchesProcessed).toBe(1);
      expect(result.completed).toBe(true);
    });

    it('8.4 should preserve recent checkpoints and all 5 milestone event types', async () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const hashedUser = privacyService.hashIdentifier(studentId, hundredDaysAgo);

      const oldCheckpoint = crypto.randomUUID();
      const recentCheckpoint = crypto.randomUUID();
      const courseOpened = crypto.randomUUID();
      const lessonStarted = crypto.randomUUID();
      const lessonCompleted = crypto.randomUUID();
      const quizAttempted = crypto.randomUUID();
      const certificateEarned = crypto.randomUUID();

      await testDb.insert(learningEvents).values([
        {
          id: oldCheckpoint,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 10 },
          occurredAt: hundredDaysAgo,
        },
        {
          id: recentCheckpoint,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 20 },
          occurredAt: thirtyDaysAgo,
        },
        {
          id: courseOpened,
          userId: hashedUser,
          courseId: testCourse.id,
          eventType: 'COURSE_OPENED',
          metadata: null,
          occurredAt: hundredDaysAgo,
        },
        {
          id: lessonStarted,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'LESSON_STARTED',
          metadata: null,
          occurredAt: hundredDaysAgo,
        },
        {
          id: lessonCompleted,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'LESSON_COMPLETED',
          metadata: null,
          occurredAt: hundredDaysAgo,
        },
        {
          id: quizAttempted,
          userId: hashedUser,
          courseId: testCourse.id,
          eventType: 'QUIZ_ATTEMPTED',
          metadata: null,
          occurredAt: hundredDaysAgo,
        },
        {
          id: certificateEarned,
          userId: hashedUser,
          courseId: testCourse.id,
          eventType: 'CERTIFICATE_EARNED',
          metadata: null,
          occurredAt: hundredDaysAgo,
        },
      ]);

      const result = await telemetryService.pruneOldCheckpoints(90, 5000);
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);

      // Verify old checkpoint is gone
      const [oldCp] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, oldCheckpoint));
      expect(oldCp).toBeUndefined();

      // Verify recent checkpoint is retained
      const [recentCp] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, recentCheckpoint));
      expect(recentCp).toBeDefined();

      // Verify all 5 milestones are retained
      const milestoneIds = [
        courseOpened,
        lessonStarted,
        lessonCompleted,
        quizAttempted,
        certificateEarned,
      ];
      for (const mId of milestoneIds) {
        const [mRow] = await testDb.select().from(learningEvents).where(eq(learningEvents.id, mId));
        expect(mRow).toBeDefined();
      }
    });

    it('8.5 should enforce exact 90-day cutoff boundaries', async () => {
      const now = Date.now();
      const ninetyDaysAndOneHourAgo = new Date(now - (90 * 24 + 1) * 60 * 60 * 1000);
      const eightyNineDaysAgo = new Date(now - 89 * 24 * 60 * 60 * 1000);

      const hashedUser = privacyService.hashIdentifier(studentId, ninetyDaysAndOneHourAgo);
      const idOlder = crypto.randomUUID();
      const idYounger = crypto.randomUUID();

      await testDb.insert(learningEvents).values([
        {
          id: idOlder,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 10 },
          occurredAt: ninetyDaysAndOneHourAgo,
        },
        {
          id: idYounger,
          userId: hashedUser,
          courseId: testCourse.id,
          lessonId: videoLesson.id,
          eventType: 'VIDEO_CHECKPOINT',
          metadata: { watchPositionSeconds: 15 },
          occurredAt: eightyNineDaysAgo,
        },
      ]);

      await telemetryService.pruneOldCheckpoints(90, 5000);

      const [rowOlder] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, idOlder));
      expect(rowOlder).toBeUndefined();

      const [rowYounger] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, idYounger));
      expect(rowYounger).toBeDefined();
    });

    it('8.6 should prevent overlapping pruning runs in the single-instance application', async () => {
      (telemetryService as any).isPruningActive = true;
      expect(telemetryService.isPruningInProgress()).toBe(true);

      const result = await telemetryService.pruneOldCheckpoints(90, 5000);

      expect(result.deletedCount).toBe(0);
      expect(result.completed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('ALREADY_IN_PROGRESS');

      (telemetryService as any).isPruningActive = false;
      expect(telemetryService.isPruningInProgress()).toBe(false);
    });

    it('8.7 should abort pruning and return early when TELEMETRY_ENABLED is false', async () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const hashedUser = privacyService.hashIdentifier(studentId, hundredDaysAgo);
      const testId = crypto.randomUUID();

      await testDb.insert(learningEvents).values({
        id: testId,
        userId: hashedUser,
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 10 },
        occurredAt: hundredDaysAgo,
      });

      telemetryService.setTelemetryEnabledOverride(false);

      const result = await telemetryService.pruneOldCheckpoints(90, 5000);

      expect(result.deletedCount).toBe(0);
      expect(result.completed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('TELEMETRY_DISABLED');

      const [retained] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, testId));
      expect(retained).toBeDefined();

      telemetryService.setTelemetryEnabledOverride(null);
    });

    it('8.8 should safely throw and not report full success when a batch operation fails', async () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const hashedUser = privacyService.hashIdentifier(studentId, hundredDaysAgo);
      const testId = crypto.randomUUID();

      await testDb.insert(learningEvents).values({
        id: testId,
        userId: hashedUser,
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 10 },
        occurredAt: hundredDaysAgo,
      });

      const originalDelete = testDb.delete;
      testDb.delete = () => {
        throw new Error('Simulated database deadlock during batch delete');
      };

      try {
        await expect(telemetryService.pruneOldCheckpoints(90, 5000)).rejects.toThrow(
          'Simulated database deadlock during batch delete'
        );
      } finally {
        testDb.delete = originalDelete;
      }

      expect(telemetryService.isPruningInProgress()).toBe(false);
    });

    it('8.9 should verify TelemetryPruningWorker registration and nightly 03:00 UTC schedule configuration', async () => {
      expect(telemetryPruningWorker).toBeDefined();

      const config = telemetryPruningWorker.getSchedulerConfig();
      expect(config.pattern).toBe('0 3 * * *');
      expect(config.schedulerId).toBe('telemetry-pruning-nightly');
      expect(config.queueName).toBe('techsprout-telemetry-pruning');
      expect(config.jobName).toBe('prune-video-checkpoints');

      const mockQueue = {
        upsertJobScheduler: vi.fn().mockResolvedValue(true),
        removeJobScheduler: vi.fn().mockResolvedValue(true),
      };

      (telemetryPruningWorker as any).queue = mockQueue;
      (telemetryPruningWorker as any).isConnected = true;

      const registered = await telemetryPruningWorker.registerNightlySchedule();
      expect(registered).toBe(true);
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        'telemetry-pruning-nightly',
        { pattern: '0 3 * * *' },
        expect.objectContaining({
          name: 'prune-video-checkpoints',
          data: { olderThanDays: 90, batchSize: 5000 },
          opts: expect.objectContaining({
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          }),
        })
      );

      // Verify that calling registerNightlySchedule repeatedly uses the exact same scheduler ID (no duplicates)
      await telemetryPruningWorker.registerNightlySchedule();
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledTimes(2);
      expect(mockQueue.upsertJobScheduler).toHaveBeenLastCalledWith(
        'telemetry-pruning-nightly',
        expect.anything(),
        expect.anything()
      );
    });

    it('8.10 should verify worker execution of scheduled job invoking pruning service', async () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const hashedUser = privacyService.hashIdentifier(studentId, hundredDaysAgo);
      const testId = crypto.randomUUID();

      await testDb.insert(learningEvents).values({
        id: testId,
        userId: hashedUser,
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 10 },
        occurredAt: hundredDaysAgo,
      });

      const jobResult = await telemetryPruningWorker.processPruningJob({
        id: 'job_nightly_123',
        data: { olderThanDays: 90, batchSize: 5000 },
      } as any);

      expect(jobResult.completed).toBe(true);
      expect(jobResult.deletedCount).toBeGreaterThanOrEqual(1);

      const [row] = await testDb.select().from(learningEvents).where(eq(learningEvents.id, testId));
      expect(row).toBeUndefined();
    });

    it('8.11 should skip scheduled job execution and registration when TELEMETRY_ENABLED is false', async () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const hashedUser = privacyService.hashIdentifier(studentId, hundredDaysAgo);
      const testId = crypto.randomUUID();

      await testDb.insert(learningEvents).values({
        id: testId,
        userId: hashedUser,
        courseId: testCourse.id,
        lessonId: videoLesson.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 10 },
        occurredAt: hundredDaysAgo,
      });

      telemetryService.setTelemetryEnabledOverride(false);

      // 1. Worker job execution is skipped
      const jobResult = await telemetryPruningWorker.processPruningJob({
        id: 'job_skipped_456',
        data: { olderThanDays: 90, batchSize: 5000 },
      } as any);

      expect(jobResult.skipped).toBe(true);
      expect(jobResult.reason).toBe('TELEMETRY_DISABLED');
      expect(jobResult.deletedCount).toBe(0);

      // Verify record is preserved
      const [row] = await testDb.select().from(learningEvents).where(eq(learningEvents.id, testId));
      expect(row).toBeDefined();

      // 2. Schedule registration removes job scheduler
      const mockQueue = {
        upsertJobScheduler: vi.fn(),
        removeJobScheduler: vi.fn().mockResolvedValue(true),
      };
      (telemetryPruningWorker as any).queue = mockQueue;
      (telemetryPruningWorker as any).isConnected = true;

      const registered = await telemetryPruningWorker.registerNightlySchedule();
      expect(registered).toBe(false);
      expect(mockQueue.upsertJobScheduler).not.toHaveBeenCalled();
      expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith('telemetry-pruning-nightly');

      telemetryService.setTelemetryEnabledOverride(null);
    });

    it('8.12 should close worker, queue, and redis resources on module destroy', async () => {
      const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
      const mockQueue = { close: vi.fn().mockResolvedValue(undefined) };
      const mockRedis = { disconnect: vi.fn() };

      (telemetryPruningWorker as any).worker = mockWorker;
      (telemetryPruningWorker as any).queue = mockQueue;
      (telemetryPruningWorker as any).redisConnection = mockRedis;
      (telemetryPruningWorker as any).isConnected = true;

      await telemetryPruningWorker.onModuleDestroy();

      expect(mockWorker.close).toHaveBeenCalledTimes(1);
      expect(mockQueue.close).toHaveBeenCalledTimes(1);
      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
      expect(telemetryPruningWorker.isWorkerReady()).toBe(false);
    });
  });

  // =========================================================================
  // 9. CORE-FLOW ISOLATION & SERVER-AUTHORITATIVE INVARIANTS (AC-P7-01-SEC-08)
  // =========================================================================

  describe('9. Core-Flow Isolation & Observational Invariant', () => {
    it('9.1 should confirm telemetry events never alter lesson_progress, certificates, or enrollments (AC-P7-01-SEC-08)', async () => {
      // Submitting a LESSON_COMPLETED telemetry event
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId: crypto.randomUUID(),
              courseId: testCourse.id,
              lessonId: videoLesson.id,
              eventType: 'LESSON_COMPLETED',
              occurredAt: new Date().toISOString(),
            },
          ],
        });

      expect(res.status).toBe(200);

      // Verify lesson_progress table has ZERO completed records for this lesson
      const progressRecords = await testDb
        .select()
        .from(schema.lessonProgress)
        .where(eq(schema.lessonProgress.lessonId, videoLesson.id));

      expect(progressRecords.length).toBe(0);

      // Verify certificates table has ZERO certificates issued
      const certRecords = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollment.id));

      expect(certRecords.length).toBe(0);
    });
  });
});
