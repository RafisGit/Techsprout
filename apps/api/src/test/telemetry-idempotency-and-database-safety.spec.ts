import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
  assertSafeDatabaseUrl,
  assertSafeTestDatabase,
  cleanupBenchmarkFixtures,
  isSafeTestDatabaseName,
  normalizeTestHost,
  ALLOWED_TEST_HOSTS,
  ALLOWED_TEST_DB_NAMES,
} from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { learningEvents } from '../database/schema/telemetry';
import { TelemetryService, areJsonValuesEqual } from '../modules/telemetry/telemetry.service';
import { telemetryMetadataSchema, telemetryEventSchema } from '../modules/telemetry/dto/telemetry.dto';

describe('P8.0.11 / P8.0.12: JSONB Equality, Idempotency & Strict Benchmark Database Safety', () => {
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
      if (testPool) {
        await testPool.end();
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
  // 4. BENCHMARK DATABASE SAFETY GUARD & STRICT ALLOWLIST ENFORCEMENT (P8.0.12)
  // =========================================================================
  describe('4. Strict Benchmark Database Safety Guard & Allowlist Hardening', () => {
    it('4.1 should strictly reject generic postgres and test database names', () => {
      // postgres must be rejected in URL and in server identity
      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:postgrespassword@localhost:5432/postgres');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/postgres',
          'postgres'
        );
      }).toThrow(/does not match test naming allowlist/);

      // generic 'test' must be rejected in URL and in server identity
      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:postgrespassword@localhost:5432/test');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/test',
          'test'
        );
      }).toThrow(/does not match test naming allowlist/);
    });

    it('4.2 should strictly reject 0.0.0.0, remote hosts, and staging/production databases', () => {
      // 0.0.0.0 must be rejected
      expect(() => {
        assertSafeDatabaseUrl('postgresql://user:pass@0.0.0.0:5432/techsprout_test');
      }).toThrow(/Host '0.0.0.0' is not a permitted local test host/);

      // Remote cloud hosts must be rejected
      expect(() => {
        assertSafeDatabaseUrl('postgresql://user:pass@production-db.render.com:5432/techsprout_test');
      }).toThrow(/permitted local test host/);

      expect(() => {
        assertSafeDatabaseUrl('postgresql://user:pass@db.aws.neon.tech:5432/techsprout_test');
      }).toThrow(/permitted local test host/);

      expect(() => {
        assertSafeDatabaseUrl('postgresql://user:pass@192.168.1.100:5432/techsprout_test');
      }).toThrow(/permitted local test host/);

      // Production & staging names must be rejected even on localhost
      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:pass@localhost:5432/techsprout');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:pass@127.0.0.1:5432/techsprout_prod');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:pass@localhost:5432/techsprout_staging');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:pass@localhost:5432/staging');
      }).toThrow(/does not match test naming allowlist/);

      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:pass@localhost:5432/production');
      }).toThrow(/does not match test naming allowlist/);
    });

    it('4.3 should correctly handle IPv6 loopback URL syntax (accepted and rejected forms)', () => {
      // Valid RFC bracketed IPv6 loopback forms:
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@[::1]:5432/techsprout_test',
          'techsprout_test'
        );
      }).not.toThrow();

      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@[0:0:0:0:0:0:0:1]:5432/techsprout_benchmark',
          'techsprout_benchmark'
        );
      }).not.toThrow();

      // Unbracketed IPv6 URL syntax is invalid under standard URL specification
      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:postgrespassword@::1:5432/techsprout_test');
      }).toThrow(/Invalid DATABASE_URL/);

      // Non-loopback IPv6 addresses must be rejected
      expect(() => {
        assertSafeDatabaseUrl('postgresql://postgres:pass@[2001:db8::1]:5432/techsprout_test');
      }).toThrow(/permitted local test host/);
    });

    it('4.4 should accept dedicated CI test and benchmark databases', () => {
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test',
          'techsprout_test'
        );
      }).not.toThrow();

      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@127.0.0.1:5432/techsprout_benchmark',
          'techsprout_benchmark'
        );
      }).not.toThrow();

      // Custom databases with _test or _benchmark suffix
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/telemetry_load_benchmark',
          'telemetry_load_benchmark'
        );
      }).not.toThrow();

      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/worker_integration_test',
          'worker_integration_test'
        );
      }).not.toThrow();
    });

    it('4.5 should reject when URL database name and server-reported database name differ', () => {
      // URL says techsprout_test, server reports techsprout_benchmark
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test',
          'techsprout_benchmark'
        );
      }).toThrow(/URL database name 'techsprout_test' does not match server-verified current_database\(\) 'techsprout_benchmark'/);

      // URL says techsprout_test, server reports techsprout
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test',
          'techsprout'
        );
      }).toThrow(/does not match test allowlist/);
    });

    it('4.6 should reject missing, null, empty, or whitespace-only connection identity before cleanup', () => {
      // Missing currentDatabaseName argument
      expect(() => {
        assertSafeTestDatabase('postgresql://postgres:postgrespassword@localhost:5432/techsprout_test');
      }).toThrow(/Server-verified database identity \(SELECT current_database\(\)\) is missing or empty/);

      // Empty string
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test',
          ''
        );
      }).toThrow(/Server-verified database identity.*is missing or empty/);

      // Whitespace string
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test',
          '   '
        );
      }).toThrow(/Server-verified database identity.*is missing or empty/);

      // Undefined or null
      expect(() => {
        assertSafeTestDatabase(
          'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test',
          undefined as any
        );
      }).toThrow(/Server-verified database identity.*is missing or empty/);
    });

    it('4.7 should prove that rejected configurations NEVER invoke destructive cleanup statements', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });

      // 1. Rejected target: production database name
      const mockDbProd = {
        delete: mockDelete,
        execute: vi.fn().mockResolvedValue({ rows: [{ current_database: 'techsprout' }] }),
      };

      await expect(
        cleanupBenchmarkFixtures(mockDbProd, {
          databaseUrl: 'postgresql://localhost:5432/techsprout',
          currentDatabaseName: 'techsprout',
        })
      ).rejects.toThrow(/does not match test/);
      expect(mockDelete).not.toHaveBeenCalled();

      // 2. Rejected target: generic postgres database
      const mockDbPostgres = {
        delete: mockDelete,
        execute: vi.fn().mockResolvedValue({ rows: [{ current_database: 'postgres' }] }),
      };

      await expect(
        cleanupBenchmarkFixtures(mockDbPostgres, {
          databaseUrl: 'postgresql://localhost:5432/postgres',
          currentDatabaseName: 'postgres',
        })
      ).rejects.toThrow(/does not match test/);
      expect(mockDelete).not.toHaveBeenCalled();

      // 3. Rejected target: 0.0.0.0 host
      const mockDbZeroHost = {
        delete: mockDelete,
        execute: vi.fn().mockResolvedValue({ rows: [{ current_database: 'techsprout_test' }] }),
      };

      await expect(
        cleanupBenchmarkFixtures(mockDbZeroHost, {
          databaseUrl: 'postgresql://0.0.0.0:5432/techsprout_test',
          currentDatabaseName: 'techsprout_test',
        })
      ).rejects.toThrow(/Host '0.0.0.0' is not a permitted local test host/);
      expect(mockDelete).not.toHaveBeenCalled();

      // 4. Rejected target: Mismatched URL vs server identity
      const mockDbMismatch = {
        delete: mockDelete,
        execute: vi.fn().mockResolvedValue({ rows: [{ current_database: 'techsprout_benchmark' }] }),
      };

      await expect(
        cleanupBenchmarkFixtures(mockDbMismatch, {
          databaseUrl: 'postgresql://localhost:5432/techsprout_test',
          currentDatabaseName: 'techsprout_benchmark',
        })
      ).rejects.toThrow(/does not match server-verified current_database/);
      expect(mockDelete).not.toHaveBeenCalled();

      // 5. Rejected target: Server identity query failure
      const mockDbFailedExec = {
        delete: mockDelete,
        execute: vi.fn().mockRejectedValue(new Error('Connection terminated')),
      };

      await expect(
        cleanupBenchmarkFixtures(mockDbFailedExec)
      ).rejects.toThrow(/Failed to verify server current_database/);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('4.8 should confirm fixture cleanup leaves unrelated learning events and courses untouched', async () => {
      // Set up in-memory database with test fixtures
      const mem = await createTestDatabase();
      const db = mem.db;

      // 1. Create a non-benchmark course and non-benchmark learning event
      const [category] = await db
        .insert(schema.categories)
        .values({
          name: 'Unrelated Production Category',
          slug: 'unrelated-prod-category',
          isActive: true,
        })
        .returning();

      const [instructor] = await db
        .insert(schema.users)
        .values({
          name: 'Regular Instructor',
          username: 'regular_instructor',
          email: 'regular@techsprout.edu',
          passwordHash: 'dummy-hash',
          isVerified: true,
        })
        .returning();

      const [nonBenchmarkCourse] = await db
        .insert(schema.courses)
        .values({
          title: 'Unrelated Machine Learning Course',
          slug: 'unrelated-ml-course',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: category.id,
          instructorId: instructor.id,
          price: '0.00',
        })
        .returning();

      const nonBenchmarkEventId = crypto.randomUUID();
      await db.insert(schema.learningEvents).values({
        id: nonBenchmarkEventId,
        userId: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        courseId: nonBenchmarkCourse.id,
        eventType: 'COURSE_OPENED',
        metadata: { watchPositionSeconds: 0 },
        occurredAt: new Date(),
      });

      // 2. Also create a benchmark event
      const [benchCat] = await db
        .insert(schema.categories)
        .values({
          name: 'Load Benchmark Category',
          slug: 'load-benchmark-category',
          isActive: true,
        })
        .returning();

      const [benchCourse] = await db
        .insert(schema.courses)
        .values({
          title: 'Concurrent Video Scrubbing Benchmark',
          slug: 'concurrent-video-scrubbing-benchmark',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: benchCat.id,
          instructorId: instructor.id,
          price: '0.00',
        })
        .returning();

      const benchEventId = crypto.randomUUID();
      await db.insert(schema.learningEvents).values({
        id: benchEventId,
        userId: '222233334444555566667777888899990000aaaabbbbccccddddeeeeffff1111',
        courseId: benchCourse.id,
        eventType: 'VIDEO_CHECKPOINT',
        metadata: { watchPositionSeconds: 30 },
        occurredAt: new Date(),
      });

      // 3. Execute cleanupBenchmarkFixtures
      await cleanupBenchmarkFixtures(db, { databaseUrl: null, currentDatabaseName: 'techsprout_test' });

      // 4. Verify benchmark records were removed
      const [checkBenchEvent] = await db
        .select()
        .from(schema.learningEvents)
        .where(eq(schema.learningEvents.id, benchEventId));
      expect(checkBenchEvent).toBeUndefined();

      const [checkBenchCourse] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, benchCourse.id));
      expect(checkBenchCourse).toBeUndefined();

      // 5. Verify non-benchmark records were preserved completely intact!
      const [checkNonBenchEvent] = await db
        .select()
        .from(schema.learningEvents)
        .where(eq(schema.learningEvents.id, nonBenchmarkEventId));
      expect(checkNonBenchEvent).toBeDefined();

      const [checkNonBenchCourse] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, nonBenchmarkCourse.id));
      expect(checkNonBenchCourse).toBeDefined();

      await mem.pool.end();
    });
  });
});
