import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import {
  createTestDatabase,
  setupTestCloudinaryConfig,
  assertSafeTestDatabase,
  cleanupBenchmarkFixtures,
} from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { learningEvents } from '../database/schema/telemetry';
import { TelemetryService, areJsonValuesEqual } from '../modules/telemetry/telemetry.service';
import { telemetryMetadataSchema, telemetryEventSchema } from '../modules/telemetry/dto/telemetry.dto';

describe('P8.0.11: JSONB Equality, Idempotency & Benchmark Database Safety', () => {
  // =========================================================================
  // 1. METADATA CONTRACT VALIDATION (SCALAR RESTRICTION ENFORCEMENT)
  // =========================================================================
  describe('1. Telemetry Metadata Contract & Scalar Restriction Enforcement', () => {
    it('1.1 should permit valid allowlisted scalar metadata fields', () => {
      const validMetadata = {
        watchPositionSeconds: 120.5,
        previousPositionSeconds: 60.0,
        totalDurationSeconds: 1800,
        playbackRate: 1.5,
        score: 95.5,
        passed: true,
        checkpointIndex: 3,
      };

      const result = telemetryMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.watchPositionSeconds).toBe(120.5);
        expect(result.data.passed).toBe(true);
      }
    });

    it('1.2 should strictly reject nested objects because metadata is restricted to scalars', () => {
      const nestedObjectMetadata = {
        watchPositionSeconds: 30,
        nestedDetails: {
          clientBitrate: 4500,
          resolution: '1080p',
        },
      };

      const result = telemetryMetadataSchema.safeParse(nestedObjectMetadata);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors.map((e) => e.message);
        expect(errors.some((m) => m.includes('unrecognized_keys') || m.includes('nestedDetails'))).toBe(true);
      }
    });

    it('1.3 should strictly reject arrays because metadata is restricted to scalars', () => {
      const arrayMetadata = {
        watchPositionSeconds: 30,
        tags: ['scrubbing', 'fast-forward'],
      };

      const result = telemetryMetadataSchema.safeParse(arrayMetadata);
      expect(result.success).toBe(false);
    });

    it('1.4 should strictly reject unapproved / arbitrary top-level fields via .strict()', () => {
      const piiMetadata = {
        watchPositionSeconds: 30,
        userEmail: 'student@example.com',
        ipAddress: '192.168.1.1',
      };

      const result = telemetryMetadataSchema.safeParse(piiMetadata);
      expect(result.success).toBe(false);
    });

    it('1.5 should reject type mismatches on scalar fields', () => {
      // String instead of number
      expect(telemetryMetadataSchema.safeParse({ watchPositionSeconds: '30' }).success).toBe(false);
      // String instead of boolean
      expect(telemetryMetadataSchema.safeParse({ passed: 'true' }).success).toBe(false);
      // Negative position
      expect(telemetryMetadataSchema.safeParse({ watchPositionSeconds: -5 }).success).toBe(false);
    });

    it('1.6 should accept empty object, null, or undefined as metadata', () => {
      expect(telemetryMetadataSchema.safeParse({}).success).toBe(true);
      expect(
        telemetryEventSchema.safeParse({
          eventId: crypto.randomUUID(),
          courseId: crypto.randomUUID(),
          eventType: 'COURSE_OPENED',
          occurredAt: new Date().toISOString(),
          metadata: null,
        }).success
      ).toBe(true);
      expect(
        telemetryEventSchema.safeParse({
          eventId: crypto.randomUUID(),
          courseId: crypto.randomUUID(),
          eventType: 'COURSE_OPENED',
          occurredAt: new Date().toISOString(),
        }).success
      ).toBe(true);
    });
  });

  // =========================================================================
  // 2. RECURSIVE SEMANTIC EQUALITY (areJsonValuesEqual & areMetadataEqual)
  // =========================================================================
  describe('2. Recursive Semantic Equality & Key Canonicalization', () => {
    it('2.1 should treat objects with reordered top-level keys as equal', () => {
      const obj1 = { a: 1, b: 2, c: 'hello', d: true };
      const obj2 = { d: true, b: 2, a: 1, c: 'hello' };
      expect(areJsonValuesEqual(obj1, obj2)).toBe(true);
    });

    it('2.2 should recursively treat nested objects with reordered keys as equal', () => {
      const nested1 = {
        meta: { watchPosition: 100, options: { autoplay: true, speed: 1.25 } },
        event: 'TEST',
      };
      const nested2 = {
        event: 'TEST',
        meta: { options: { speed: 1.25, autoplay: true }, watchPosition: 100 },
      };
      expect(areJsonValuesEqual(nested1, nested2)).toBe(true);
    });

    it('2.3 should treat objects inside arrays with reordered keys as equal', () => {
      const arrObj1 = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
      const arrObj2 = [{ name: 'A', id: 1 }, { name: 'B', id: 2 }];
      expect(areJsonValuesEqual(arrObj1, arrObj2)).toBe(true);
    });

    it('2.4 should strictly preserve array element ordering (order IS significant)', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [3, 2, 1];
      expect(areJsonValuesEqual(arr1, arr2)).toBe(false);

      const arrOfObjects1 = [{ id: 1 }, { id: 2 }];
      const arrOfObjects2 = [{ id: 2 }, { id: 1 }];
      expect(areJsonValuesEqual(arrOfObjects1, arrOfObjects2)).toBe(false);
    });

    it('2.5 should preserve type differences (no loose coercion)', () => {
      expect(areJsonValuesEqual({ val: 1 }, { val: '1' })).toBe(false);
      expect(areJsonValuesEqual({ val: true }, { val: 1 })).toBe(false);
      expect(areJsonValuesEqual({ val: false }, { val: 0 })).toBe(false);
      expect(areJsonValuesEqual({ val: null }, { val: false })).toBe(false);
      expect(areJsonValuesEqual({ val: null }, { val: 0 })).toBe(false);
      expect(areJsonValuesEqual({ val: null }, { val: '' })).toBe(false);
    });

    it('2.6 should distinguish missing keys from explicit null or undefined', () => {
      // Key present with null vs key missing
      expect(areJsonValuesEqual({ a: null }, {})).toBe(false);
      expect(areJsonValuesEqual({}, { a: null })).toBe(false);

      // Key present with undefined vs key missing
      expect(areJsonValuesEqual({ a: undefined }, {})).toBe(false);

      // Explicit null vs explicit undefined
      expect(areJsonValuesEqual({ a: null }, { a: undefined })).toBe(false);
    });

    it('2.7 should detect genuine payload differences', () => {
      expect(areJsonValuesEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
      expect(areJsonValuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(areJsonValuesEqual({ a: [1, 2] }, { a: [1, 2, 3] })).toBe(false);
    });

    it('2.8 should handle null, undefined, and empty objects correctly', () => {
      expect(areJsonValuesEqual(null, null)).toBe(true);
      expect(areJsonValuesEqual(undefined, undefined)).toBe(true);
      expect(areJsonValuesEqual(null, undefined)).toBe(false);
      expect(areJsonValuesEqual(null, {})).toBe(false);
      expect(areJsonValuesEqual({}, null)).toBe(false);
      expect(areJsonValuesEqual({}, {})).toBe(true);
    });
  });

  // =========================================================================
  // 3. TELEMETRY IDEMPOTENCY SERVICE REGRESSION SUITE
  // =========================================================================
  describe('3. Telemetry Ingestion Idempotency & Conflict Handling', () => {
    let app: INestApplication;
    let testDb: any;
    let testPool: any;
    let telemetryService: TelemetryService;
    let testCourse: any;
    let videoLesson: any;
    let studentUser: any;
    let studentCookie: string[];

    beforeAll(async () => {
      setupTestCloudinaryConfig();
      const mem = await createTestDatabase();
      testDb = mem.db;
      testPool = mem.pool;

      const [instructorRole] = await testDb
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.name, 'instructor'))
        .limit(1);

      const [studentRole] = await testDb
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.name, 'student'))
        .limit(1);

      const passHash = await CryptoUtil.hashPassword('Pass123456!');

      const [instructor] = await testDb
        .insert(schema.users)
        .values({
          name: 'Idempotency Instructor',
          username: 'idem_inst',
          email: 'idem_inst@techsprout.edu',
          phone: '01710009999',
          passwordHash: passHash,
          isVerified: true,
        })
        .returning();

      await testDb.insert(schema.userRoles).values({
        userId: instructor.id,
        roleId: instructorRole.id,
      });

      const [category] = await testDb
        .insert(schema.categories)
        .values({
          name: 'Idempotency Category',
          slug: 'idempotency-cat',
          isActive: true,
        })
        .returning();

      [testCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Idempotency Test Course',
          slug: 'idempotency-test-course',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: category.id,
          instructorId: instructor.id,
          price: '0.00',
        })
        .returning();

      const [mod] = await testDb
        .insert(schema.modules)
        .values({
          courseId: testCourse.id,
          title: 'Idempotency Module',
          position: 1,
        })
        .returning();

      [videoLesson] = await testDb
        .insert(schema.lessons)
        .values({
          moduleId: mod.id,
          title: 'Idempotency Lecture',
          lessonType: 'VIDEO',
          position: 1,
          durationSeconds: 1800,
        })
        .returning();

      [studentUser] = await testDb
        .insert(schema.users)
        .values({
          name: 'Idempotency Student',
          username: 'idem_student',
          email: 'idem_student@techsprout.edu',
          phone: '01710008888',
          passwordHash: passHash,
          isVerified: true,
        })
        .returning();

      await testDb.insert(schema.userRoles).values({
        userId: studentUser.id,
        roleId: studentRole.id,
      });

      await testDb.insert(schema.enrollments).values({
        studentId: studentUser.id,
        courseId: testCourse.id,
        status: 'ACTIVE',
      });

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

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'idem_student@techsprout.edu',
          password: 'Pass123456!',
        });
      studentCookie = loginRes.headers['set-cookie'] as unknown as string[];
    });

    afterAll(async () => {
      if (app) {
        await app.close();
      }
    });

    it('3.1 should idempotently accept duplicate submission with reordered metadata keys', async () => {
      const eventId = crypto.randomUUID();
      const occurredAt = new Date().toISOString();

      const initialBatch = {
        events: [
          {
            eventId,
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            occurredAt,
            metadata: {
              watchPositionSeconds: 45,
              totalDurationSeconds: 1800,
              playbackRate: 1.5,
              passed: true,
            },
          },
        ],
      };

      // 1. Initial submission
      telemetryService.resetRateLimits();
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookie)
        .send(initialBatch);

      expect(res1.status).toBe(200);
      expect(res1.body.data.ingestedCount).toBe(1);
      expect(res1.body.data.deduplicatedCount).toBe(0);

      // 2. Retry identical submission with reordered metadata keys
      telemetryService.resetRateLimits();
      const reorderedBatch = {
        events: [
          {
            eventId,
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            occurredAt,
            metadata: {
              passed: true,
              playbackRate: 1.5,
              totalDurationSeconds: 1800,
              watchPositionSeconds: 45,
            },
          },
        ],
      };

      const res2 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookie)
        .send(reorderedBatch);

      expect(res2.status).toBe(200);
      expect(res2.body.data.ingestedCount).toBe(0);
      expect(res2.body.data.deduplicatedCount).toBe(1);

      // 3. Ensure database has exactly 1 row
      const rows = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, eventId));
      expect(rows.length).toBe(1);
    });

    it('3.2 should reject duplicate eventId with conflicting metadata with HTTP 409 Conflict', async () => {
      const eventId = crypto.randomUUID();
      const occurredAt = new Date().toISOString();

      const initialBatch = {
        events: [
          {
            eventId,
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            occurredAt,
            metadata: {
              watchPositionSeconds: 30,
              totalDurationSeconds: 1800,
            },
          },
        ],
      };

      telemetryService.resetRateLimits();
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookie)
        .send(initialBatch);
      expect(res1.status).toBe(200);

      // Conflicting payload: altered watchPositionSeconds
      telemetryService.resetRateLimits();
      const conflictingBatch = {
        events: [
          {
            eventId,
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            occurredAt,
            metadata: {
              watchPositionSeconds: 90, // Conflicting!
              totalDurationSeconds: 1800,
            },
          },
        ],
      };

      const res2 = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookie)
        .send(conflictingBatch);

      expect(res2.status).toBe(409);
      expect(res2.body.errorCode).toBe('IDEMPOTENCY_CONFLICT');

      // Verify original DB record was NOT mutated
      const [record] = await testDb
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.id, eventId));
      expect((record.metadata as any).watchPositionSeconds).toBe(30);
    });

    it('3.3 should handle intra-batch duplicates with reordered keys', async () => {
      const eventId = crypto.randomUUID();
      const occurredAt = new Date().toISOString();

      const intraBatch = {
        events: [
          {
            eventId,
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            occurredAt,
            metadata: {
              watchPositionSeconds: 60,
              playbackRate: 1.0,
            },
          },
          {
            eventId,
            courseId: testCourse.id,
            lessonId: videoLesson.id,
            eventType: 'VIDEO_CHECKPOINT',
            occurredAt,
            metadata: {
              playbackRate: 1.0,
              watchPositionSeconds: 60,
            },
          },
        ],
      };

      telemetryService.resetRateLimits();
      const res = await request(app.getHttpServer())
        .post('/api/v1/learning/events')
        .set('Cookie', studentCookie)
        .send(intraBatch);

      expect(res.status).toBe(200);
      expect(res.body.data.ingestedCount).toBe(1);
      expect(res.body.data.deduplicatedCount).toBe(1);
    });
  });

  // =========================================================================
  // 4. BENCHMARK DATABASE SAFETY GUARD (assertSafeTestDatabase)
  // =========================================================================
  describe('4. Benchmark Database Safety Guard & Allowlist Enforcement', () => {
    it('4.1 should reject remote or production database hosts', () => {
      expect(() => {
        assertSafeTestDatabase('postgresql://user:pass@production-db.render.com:5432/techsprout_test');
      }).toThrow(/permitted local test host/);

      expect(() => {
        assertSafeTestDatabase('postgresql://user:pass@db.aws.neon.tech:5432/techsprout_test');
      }).toThrow(/permitted local test host/);
    });

    it('4.2 should reject production or non-test database names even on localhost', () => {
      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:pass@localhost:5432/techsprout');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:pass@127.0.0.1:5432/prod_db');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:pass@localhost:5432/techsprout_staging');
      }).toThrow(/does not match test naming allowlist/);
    });

    it('4.3 should reject if server-verified current_database() does not match test allowlist', () => {
      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:pass@localhost:5432/techsprout_test', 'techsprout');
      }).toThrow(/Verified server current_database.*does not match test allowlist/);

      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:pass@localhost:5432/techsprout_test', 'production_master');
      }).toThrow(/Verified server current_database.*does not match test allowlist/);
    });

    it('4.4 should reject missing, null, or malformed database URLs', () => {
      expect(() => {
        assertSafeTestDatabase('');
      }).toThrow(/missing or empty/);

      expect(() => {
        assertSafeTestDatabase('not-a-valid-url');
      }).toThrow(/Invalid DATABASE_URL/);
    });

    it('4.5 should permit valid local test and benchmark database configurations', () => {
      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:postgrespassword@localhost:5432/techsprout_test');
      }).not.toThrow();

      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test',
          'techsprout_test'
        );
      }).not.toThrow();

      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:postgrespassword@127.0.0.1:5432/techsprout_benchmark');
      }).not.toThrow();

      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:postgrespassword@localhost:5432/postgres');
      }).not.toThrow();
    });
  });
});
