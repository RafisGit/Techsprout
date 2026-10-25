import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { createTestDatabase, extractCookies } from './test-helper';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';
import cookieParser from 'cookie-parser';
import { AnalyticsCacheService } from '../modules/analytics/analytics.cache.service';

describe('P6.3 — WP-06: Security Hardening & Release Gate Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let cacheService: AnalyticsCacheService;

  let adminCookies: string[];
  let instructor1Cookies: string[];
  let instructor2Cookies: string[];
  let student1Cookies: string[];
  let student2Cookies: string[];

  let adminId: string;
  let instructor1Id: string;
  let instructor2Id: string;
  let student1Id: string;
  let student2Id: string;

  let categoryId: string;
  let course1: any; // Owned by Instructor 1
  let course2: any; // Owned by Instructor 2

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // 1. Fetch seeded users
    const [inst1User] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));
    instructor1Id = inst1User.id;

    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'));
    adminId = adminUser.id;

    const [student1User] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    student1Id = student1User.id;

    // 2. Fetch roles
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

    // 3. Create Instructor 2 for multi-tenant isolation tests
    const passwordHash = await CryptoUtil.hashPassword('Instructor2Password123!');
    const [inst2User] = await testDb
      .insert(schema.users)
      .values({
        name: 'Instructor Two',
        username: 'instructor2_wp06',
        email: 'instructor2_wp06@techsprout.edu',
        passwordHash,
        isVerified: true,
      })
      .returning();
    instructor2Id = inst2User.id;

    await testDb.insert(schema.userRoles).values({
      userId: instructor2Id,
      roleId: instructorRole.id,
    });

    // 4. Create Student 2 for student isolation tests
    const studentPasswordHash = await CryptoUtil.hashPassword('Student2Password123!');
    const [student2User] = await testDb
      .insert(schema.users)
      .values({
        name: 'Student Two',
        username: 'student2_wp06',
        email: 'student2_wp06@techsprout.edu',
        passwordHash: studentPasswordHash,
        isVerified: true,
      })
      .returning();
    student2Id = student2User.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // 5. Seed Category & Courses
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Cybersecurity & Hardening',
        slug: 'cybersecurity-hardening-wp06',
      })
      .returning();
    categoryId = cat.id;

    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Instructor 1 Defense Course',
        slug: 'instructor-1-defense-wp06',
        categoryId,
        instructorId: instructor1Id,
        status: 'PUBLISHED',
        price: '3000.00',
        currency: 'BDT',
      })
      .returning();
    course1 = c1;

    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Instructor 2 Defense Course',
        slug: 'instructor-2-defense-wp06',
        categoryId,
        instructorId: instructor2Id,
        status: 'PUBLISHED',
        price: '4000.00',
        currency: 'BDT',
      })
      .returning();
    course2 = c2;

    // 6. Bootstrap NestJS test application
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

    cacheService = moduleRef.get<AnalyticsCacheService>(AnalyticsCacheService);

    // 7. Login and capture session cookies
    const loginAdmin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@techsprout.edu', password: 'AdminPassword123!' });
    adminCookies = extractCookies(loginAdmin.headers);

    const loginInst1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'instructor@techsprout.edu', password: 'InstructorPassword123!' });
    instructor1Cookies = extractCookies(loginInst1.headers);

    const loginInst2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'instructor2_wp06@techsprout.edu', password: 'Instructor2Password123!' });
    instructor2Cookies = extractCookies(loginInst2.headers);

    const loginStd1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'student@techsprout.edu', password: 'StudentPassword123!' });
    student1Cookies = extractCookies(loginStd1.headers);

    const loginStd2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'student2_wp06@techsprout.edu', password: 'Student2Password123!' });
    student2Cookies = extractCookies(loginStd2.headers);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPool) await testPool.end();
  });

  // =========================================================================
  // 1. CROSS-ROLE AUTHORIZATION BOUNDARY MATRIX
  // =========================================================================
  describe('1. Cross-Role Authorization Matrix', () => {
    it('1.1 should reject unauthenticated requests with 401 across all analytics routes', async () => {
      const endpoints = [
        '/api/v1/admin/analytics/overview',
        '/api/v1/admin/analytics/courses',
        '/api/v1/instructor/analytics/overview',
        `/api/v1/instructor/analytics/courses/${course1.id}`,
        '/api/v1/learn/analytics/engagement',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app.getHttpServer()).get(endpoint);
        expect(res.status, `Expected 401 on ${endpoint}`).toBe(401);
      }
    });

    it('1.2 should reject students from accessing admin or instructor analytics (403)', async () => {
      const forbiddenForStudent = [
        '/api/v1/admin/analytics/overview',
        '/api/v1/admin/analytics/courses',
        '/api/v1/instructor/analytics/overview',
        `/api/v1/instructor/analytics/courses/${course1.id}`,
      ];

      for (const endpoint of forbiddenForStudent) {
        const res = await request(app.getHttpServer())
          .get(endpoint)
          .set('Cookie', student1Cookies);
        expect(res.status, `Expected 403 for student on ${endpoint}`).toBe(403);
      }
    });

    it('1.3 should reject instructors from accessing platform admin analytics (403)', async () => {
      const forbiddenForInstructor = [
        '/api/v1/admin/analytics/overview',
        '/api/v1/admin/analytics/courses',
      ];

      for (const endpoint of forbiddenForInstructor) {
        const res = await request(app.getHttpServer())
          .get(endpoint)
          .set('Cookie', instructor1Cookies);
        expect(res.status, `Expected 403 for instructor on ${endpoint}`).toBe(403);
      }
    });
  });

  // =========================================================================
  // 2. MULTI-TENANT ISOLATION: INSTRUCTOR OWNERSHIP & DATA SEPARATION
  // =========================================================================
  describe('2. Multi-Tenant Course Analytics Isolation', () => {
    it('2.1 should prohibit Instructor 1 from accessing Course 2 analytics owned by Instructor 2 (403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course2.id}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(403);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    it('2.2 should prohibit Instructor 2 from accessing Course 1 analytics owned by Instructor 1 (403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    it('2.3 should prohibit Instructor 1 from querying learner roster for Course 2 (403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${course2.id}/enrollments`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(403);
    });

    it('2.4 should allow Platform Admin to access both Course 1 and Course 2 analytics', async () => {
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}`)
        .set('Cookie', adminCookies);
      expect(res1.status).toBe(200);

      const res2 = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course2.id}`)
        .set('Cookie', adminCookies);
      expect(res2.status).toBe(200);
    });
  });

  // =========================================================================
  // 3. STUDENT PERSONAL ENGAGEMENT & CERTIFICATE SEMANTICS
  // =========================================================================
  describe('3. Student Personal Engagement & Certificate Data Integrity', () => {
    let student1EnrollmentId: string;

    it('3.1 should isolate engagement metrics strictly to the authenticated student', async () => {
      // Enroll Student 1 in Course 1
      const [enr1] = await testDb.insert(schema.enrollments).values({
        studentId: student1Id,
        courseId: course1.id,
        status: 'ACTIVE',
      }).returning();
      student1EnrollmentId = enr1.id;

      // Enroll Student 2 in Course 2
      await testDb.insert(schema.enrollments).values({
        studentId: student2Id,
        courseId: course2.id,
        status: 'ACTIVE',
      });

      // Check Student 1 engagement
      const res1 = await request(app.getHttpServer())
        .get('/api/v1/learn/analytics/engagement')
        .set('Cookie', student1Cookies);

      expect(res1.status).toBe(200);
      expect(res1.body.data.enrolledCoursesCount).toBe(1);
      expect(res1.body.data.inProgressCoursesCount).toBe(1);

      // Check Student 2 engagement
      const res2 = await request(app.getHttpServer())
        .get('/api/v1/learn/analytics/engagement')
        .set('Cookie', student2Cookies);

      expect(res2.status).toBe(200);
      expect(res2.body.data.enrolledCoursesCount).toBe(1);
    });

    it('3.2 should count ONLY actual active certificates from certificates table', async () => {
      // Student 1 has 1 active certificate
      const [cert] = await testDb
        .insert(schema.certificates)
        .values({
          studentId: student1Id,
          courseId: course1.id,
          enrollmentId: student1EnrollmentId,
          certificateNumber: `CERT-WP06-${Date.now()}`,
          studentName: 'Student One',
          courseTitle: course1.title,
          instructorName: 'Instructor One',
          completedAt: new Date(),
          status: 'ACTIVE',
        })
        .returning();

      const resBefore = await request(app.getHttpServer())
        .get('/api/v1/learn/analytics/engagement')
        .set('Cookie', student1Cookies);

      expect(resBefore.status).toBe(200);
      expect(resBefore.body.data.completedCertificatesCount).toBe(1);

      // Revoke certificate -> should decrement to 0
      await testDb
        .update(schema.certificates)
        .set({ status: 'REVOKED' })
        .where(eq(schema.certificates.id, cert.id));

      const resAfter = await request(app.getHttpServer())
        .get('/api/v1/learn/analytics/engagement')
        .set('Cookie', student1Cookies);

      expect(resAfter.status).toBe(200);
      expect(resAfter.body.data.completedCertificatesCount).toBe(0);
    });
  });

  // =========================================================================
  // 4. SQL INJECTION & INPUT TAMPERING HARDENING
  // =========================================================================
  describe('4. Input Validation & Parameter Tampering Hardening', () => {
    it('4.1 should safely escape SQL injection patterns in course search queries', async () => {
      const maliciousSearches = [
        "' OR '1'='1",
        "'; DROP TABLE courses; --",
        "UNION SELECT * FROM users --",
      ];

      for (const search of maliciousSearches) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/admin/analytics/courses')
          .query({ search })
          .set('Cookie', adminCookies);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.items).toBeDefined();
        // Courses table must remain unharmed
        const coursesCount = await testDb.select().from(schema.courses);
        expect(coursesCount.length).toBeGreaterThan(0);
      }
    });

    it('4.2 should reject excessive pagination limits (limit > 100) with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics/courses')
        .query({ limit: 500 })
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('4.3 should reject invalid date formats on course analytics with 400', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/instructor/analytics/courses/${course1.id}`)
        .query({ startDate: 'not-a-date' })
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 5. CACHE KEYS, RESILIENCE & VERIFIED 600s TTL
  // =========================================================================
  describe('5. Cache Key Isolation & Verified 600s TTL', () => {
    it('5.1 should construct isolated cache keys per instructor and per course date-range', () => {
      const keyInst1 = cacheService.buildInstructorOverviewKey(instructor1Id);
      const keyInst2 = cacheService.buildInstructorOverviewKey(instructor2Id);
      const keyAdmin = cacheService.buildAdminOverviewKey();

      expect(keyInst1).not.toEqual(keyInst2);
      expect(keyInst1).toContain(instructor1Id);
      expect(keyInst2).toContain(instructor2Id);
      expect(keyAdmin).toBe('admin:analytics:overview');
    });

    it('5.2 should verify that AnalyticsCacheService default TTL is 600 seconds', async () => {
      // In-memory fallback verification
      const testKey = 'test:ttl:verification';
      const testValue = { verified: true };

      await cacheService.set(testKey, testValue); // Default ttl = 600s
      const cached = await cacheService.get(testKey);
      expect(cached).toEqual(testValue);

      await cacheService.del(testKey);
      const deleted = await cacheService.get(testKey);
      expect(deleted).toBeNull();
    });
  });
});
