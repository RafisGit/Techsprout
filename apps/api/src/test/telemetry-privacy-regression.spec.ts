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
import { eq, sql } from 'drizzle-orm';
import { TelemetryService } from '../modules/telemetry/telemetry.service';
import { TelemetryPrivacyService } from '../modules/telemetry/telemetry-privacy.service';
import * as crypto from 'crypto';

describe('P7.1 — Automated Telemetry Privacy & PII Minimization Regression Suite (CI Gate)', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let telemetryService: TelemetryService;
  let privacyService: TelemetryPrivacyService;

  let studentCookies: string[];
  let studentId: string;
  let testCourse: any;
  let videoLesson: any;

  // Synthetic Test Inputs for Privacy Regression Testing
  const SYNTHETIC_STUDENT_EMAIL = 'synthetic.gdpr.learner@techsprout.edu';
  const SYNTHETIC_STUDENT_NAME = 'Jane Confidential Student';
  const SYNTHETIC_STUDENT_PHONE = '+8801700999888';
  const SYNTHETIC_RAW_QUERY = 'SELECT * FROM users WHERE password_hash IS NOT NULL';
  const SYNTHETIC_PROMPT = 'how to cheat on the system security exam';

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // Seed dedicated student with known synthetic PII
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('ConfidentialPass123!');
    const [user] = await testDb
      .insert(schema.users)
      .values({
        name: SYNTHETIC_STUDENT_NAME,
        username: 'synthetic_gdpr_student',
        email: SYNTHETIC_STUDENT_EMAIL,
        phone: SYNTHETIC_STUDENT_PHONE,
        passwordHash,
        isVerified: true,
      })
      .returning();
    studentId = user.id;

    await testDb.insert(schema.userRoles).values({
      userId: studentId,
      roleId: studentRole.id,
    });

    // Seed Category, Instructor, Course, Lesson
    const [instructorUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));

    const [category] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Privacy Engineering',
        slug: 'privacy-engineering',
        isActive: true,
      })
      .returning();

    const [course] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Zero-Trust Telemetry Architecture',
        slug: 'zero-trust-telemetry-architecture',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
        price: '0.00',
      })
      .returning();
    testCourse = course;

    const [mod] = await testDb
      .insert(schema.modules)
      .values({
        courseId: testCourse.id,
        title: 'Module 1: Pseudonymity & Salt Rotation',
        position: 1,
      })
      .returning();

    const [les] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: mod.id,
        title: 'Cryptographic Salt Boundaries',
        lessonType: 'VIDEO',
        position: 1,
        durationSeconds: 180,
      })
      .returning();
    videoLesson = les;

    // Seed Active Enrollment
    await testDb.insert(schema.enrollments).values({
      studentId: studentId,
      courseId: testCourse.id,
      status: 'ACTIVE',
    });

    // Initialize NestJS app
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

    // Authenticate synthetic student
    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: SYNTHETIC_STUDENT_EMAIL,
      password: 'ConfidentialPass123!',
    });
    studentCookies = loginRes.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    telemetryService.resetRateLimits();
    privacyService.setSaltUnavailableForTesting(false);
  });

  // =========================================================================
  // 1. INGESTION BOUNDARY STRIPPING & ALLOWLIST ENFORCEMENT
  // =========================================================================

  describe('1. Ingestion Boundary Stripping & Allowlist Enforcement', () => {
    it('1.1 should reject payloads containing raw search queries at the API boundary', async () => {
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
                watchPositionSeconds: 30,
                searchQuery: SYNTHETIC_RAW_QUERY, // Prohibited!
              },
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('1.2 should reject payloads attempting to pass student prompts, notes, or PII attributes', async () => {
      const testCases = [
        { studentPrompt: SYNTHETIC_PROMPT },
        { userEmail: SYNTHETIC_STUDENT_EMAIL },
        { phoneNumber: SYNTHETIC_STUDENT_PHONE },
        { studentName: SYNTHETIC_STUDENT_NAME },
        { ipAddress: '192.168.1.100' },
        { deviceFingerprint: 'canvas_hash_987654' },
      ];

      for (const field of testCases) {
        telemetryService.resetRateLimits();
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
                  watchPositionSeconds: 10,
                  ...field,
                },
              },
            ],
          });

        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      }
    });
  });

  // =========================================================================
  // 2. STORAGE LEVEL PII SANITIZATION & ABSENCE ASSERTIONS
  // =========================================================================

  describe('2. Persistent Storage Privacy Verification', () => {
    it('2.1 should verify learning_events table contains ONLY 64-char HMAC hashes and ZERO raw PII', async () => {
      const eventId = crypto.randomUUID();
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookies)
        .send({
          events: [
            {
              eventId,
              courseId: testCourse.id,
              lessonId: videoLesson.id,
              eventType: 'VIDEO_CHECKPOINT',
              occurredAt: new Date().toISOString(),
              metadata: {
                watchPositionSeconds: 45,
                totalDurationSeconds: 180,
                playbackRate: 1.25,
              },
            },
          ],
        });

      expect(res.status).toBe(200);

      // Inspect persisted record directly from database
      const [record] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, eventId));

      expect(record).toBeDefined();

      // 1. user_id must be a 64-character hexadecimal HMAC-SHA256 string
      expect(record.userId).toMatch(/^[a-f0-9]{64}$/);

      // 2. user_id must NOT match the raw student UUID
      expect(record.userId).not.toBe(studentId);

      // 3. user_id must NOT match the raw student email
      expect(record.userId).not.toBe(SYNTHETIC_STUDENT_EMAIL);

      // 4. Assert ZERO presence of raw PII anywhere across all columns
      const serializedRecord = JSON.stringify(record);
      expect(serializedRecord).not.toContain(SYNTHETIC_STUDENT_EMAIL);
      expect(serializedRecord).not.toContain(SYNTHETIC_STUDENT_NAME);
      expect(serializedRecord).not.toContain(SYNTHETIC_STUDENT_PHONE);
      expect(serializedRecord).not.toContain(studentId);
      expect(serializedRecord).not.toContain(SYNTHETIC_RAW_QUERY);
      expect(serializedRecord).not.toContain(SYNTHETIC_PROMPT);
    });
  });

  // =========================================================================
  // 3. APPLICATION & DOWNSTREAM LOG STREAM PRIVACY AUDIT
  // =========================================================================

  describe('3. Application & Downstream Logging Privacy Audit', () => {
    it('3.1 should confirm zero raw student PII, queries, or salts appear in console or application logs', async () => {
      const capturedLogs: string[] = [];

      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      });
      const infoSpy = vi.spyOn(console, 'info').mockImplementation((...args) => {
        capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
        capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        capturedLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      });

      try {
        // Execute valid ingestion
        await request(app.getHttpServer())
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

        // Execute invalid ingestion with synthetic PII in body
        await request(app.getHttpServer())
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
                  watchPositionSeconds: 10,
                  prohibitedQuery: SYNTHETIC_RAW_QUERY,
                  prohibitedEmail: SYNTHETIC_STUDENT_EMAIL,
                },
              },
            ],
          });

        const allLogs = capturedLogs.join('\n');

        // Verify zero leakage of raw PII or queries into log streams
        expect(allLogs).not.toContain(SYNTHETIC_STUDENT_EMAIL);
        expect(allLogs).not.toContain(SYNTHETIC_STUDENT_NAME);
        expect(allLogs).not.toContain(SYNTHETIC_STUDENT_PHONE);
        expect(allLogs).not.toContain(SYNTHETIC_RAW_QUERY);
        expect(allLogs).not.toContain(SYNTHETIC_PROMPT);

        // Verify active salt is NEVER logged
        const currentSalt = privacyService.getDailySalt();
        expect(allLogs).not.toContain(currentSalt);
      } finally {
        logSpy.mockRestore();
        infoSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });

  // =========================================================================
  // 4. DAILY ROTATING SALT & CROSS-DAY LINKAGE SEVERANCE (ADR-P7-001)
  // =========================================================================

  describe('4. Daily Rotating Salt & Cross-Day Linkage Severance', () => {
    it('4.1 should produce different pseudonyms for the same learner across distinct UTC days', () => {
      const day1 = new Date('2026-10-18T10:00:00.000Z');
      const day2 = new Date('2026-10-19T10:00:00.000Z');
      const day3 = new Date('2026-10-20T10:00:00.000Z');

      const hashDay1 = privacyService.hashIdentifier(studentId, day1);
      const hashDay2 = privacyService.hashIdentifier(studentId, day2);
      const hashDay3 = privacyService.hashIdentifier(studentId, day3);

      // Hashes must be 64-char HMAC-SHA256 hex strings
      expect(hashDay1).toMatch(/^[a-f0-9]{64}$/);
      expect(hashDay2).toMatch(/^[a-f0-9]{64}$/);
      expect(hashDay3).toMatch(/^[a-f0-9]{64}$/);

      // Must be completely distinct across different UTC days
      expect(hashDay1).not.toBe(hashDay2);
      expect(hashDay2).not.toBe(hashDay3);
      expect(hashDay1).not.toBe(hashDay3);
    });

    it('4.2 should produce identical pseudonyms within the same UTC day for session tracking', () => {
      const morningTime = new Date('2026-10-18T08:15:00.000Z');
      const eveningTime = new Date('2026-10-18T21:45:00.000Z');

      const morningHash = privacyService.hashIdentifier(studentId, morningTime);
      const eveningHash = privacyService.hashIdentifier(studentId, eveningTime);

      expect(morningHash).toBe(eveningHash);
    });
  });

  // =========================================================================
  // 5. FAIL-CLOSED BEHAVIOR ON MISSING SALT (ADR-P7-001)
  // =========================================================================

  describe('5. Fail-Closed Privacy Enforcement', () => {
    it('5.1 should fail closed with HTTP 500 when salt is unavailable and write ZERO rows', async () => {
      privacyService.setSaltUnavailableForTesting(true);

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

      // Must fail closed with HTTP 500
      expect(res.status).toBe(500);
      expect(res.body.errorCode).toBe('TELEMETRY_SALT_UNAVAILABLE');

      // Verify ZERO rows were written to database
      const countAfter = await testDb
        .select({ count: sql<number>`count(*)` })
        .from(learningEvents);

      expect(Number(countAfter[0].count)).toBe(Number(countBefore[0].count));
    });
  });
});
