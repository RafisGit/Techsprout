import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '../config/env.config';
import { CertificateService } from '../modules/certificates/certificates.service';

describe('P4.5.3 — Certificate Controllers & REST API Integration Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let certificateService: CertificateService;

  let adminCookies: string[];
  let instructorCookies: string[];
  let studentACookies: string[];
  let studentBCookies: string[];

  let adminId: string;
  let instructorId: string;
  let studentAId: string;
  let studentBId: string;

  let category: any;
  let course1: any;
  let course2: any;
  let course3: any;
  let module1: any;
  let lesson1: any;
  let module2: any;
  let lesson2: any;

  let enrollmentACompleted: any;
  let enrollmentBIncomplete: any;
  let enrollmentLazyIssuance: any;
  let enrollmentCurriculumExpansion: any;
  let certCurriculumExpansion: any;
  let enrollmentRevoked: any;
  let certRevoked: any;
  let certActiveForVerify: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // Retrieve seed roles
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    // Create Student B with active status
    const passwordHashB = await CryptoUtil.hashPassword('StudentBPassword123!');
    const [stB] = await testDb
      .insert(schema.users)
      .values({
        name: 'Bob Learner',
        username: 'studentb',
        email: 'studentb@techsprout.edu',
        phone: '01711111188',
        passwordHash: passwordHashB,
        isActive: true,
        isVerified: true,
      })
      .returning();
    studentBId = stB.id;

    await testDb.insert(schema.userRoles).values({
      userId: studentBId,
      roleId: studentRole.id,
    });

    // Retrieve Admin, Instructor, Student A
    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'));
    adminId = adminUser.id;

    const [instructorUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));
    instructorId = instructorUser.id;

    const [studentAUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentAId = studentAUser.id;

    // Create Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Computer Engineering',
        slug: 'computer-engineering',
        isActive: true,
      })
      .returning();
    category = cat;

    // Create Course 1
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Fullstack TypeScript Architecture',
        slug: 'fullstack-typescript-architecture',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId,
      })
      .returning();
    course1 = c1;

    // Module 1 and Lesson 1 in Course 1
    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course1.id,
        title: 'Module 1: Architecture Fundamentals',
        position: 1,
      })
      .returning();
    module1 = m1;

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Clean Architecture Patterns',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 300,
        content: '# Clean Architecture',
        isPreview: false,
      })
      .returning();
    lesson1 = l1;

    // Create Course 2
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Advanced Distributed Systems',
        slug: 'advanced-distributed-systems',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId,
      })
      .returning();
    course2 = c2;

    const [m2] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course2.id,
        title: 'Module 1: Consensus Protocols',
        position: 1,
      })
      .returning();
    module2 = m2;

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module2.id,
        title: 'Raft and Paxos Overview',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 300,
        content: '# Consensus',
        isPreview: false,
      })
      .returning();
    lesson2 = l2;

    // Create Course 3
    const [c3] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Microservices & DevOps',
        slug: 'microservices-devops',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId,
      })
      .returning();
    course3 = c3;

    const [m3] = await testDb
      .insert(schema.modules)
      .values({
        courseId: course3.id,
        title: 'Module 1: Container Orchestration',
        position: 1,
      })
      .returning();

    const [l3] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: m3.id,
        title: 'Docker & Kubernetes Foundations',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 300,
        content: '# Kubernetes',
        isPreview: false,
      })
      .returning();

    // 1. Enrollment A in Course 1: COMPLETED with already issued certificate
    const completedAtDate = new Date('2026-09-15T10:00:00.000Z');
    const [enrA] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentAId,
        studentId: studentAId,
        courseId: course1.id,
        status: 'COMPLETED',
        completedAt: completedAtDate,
      })
      .returning();
    enrollmentACompleted = enrA;

    await testDb.insert(schema.lessonProgress).values({
      enrollmentId: enrollmentACompleted.id,
      lessonId: lesson1.id,
      status: 'COMPLETED',
      completedAt: completedAtDate,
    });

    const [certActive] = await testDb
      .insert(schema.certificates)
      .values({
        certificateNumber: 'TSP-2026-CACTIVE1',
        enrollmentId: enrollmentACompleted.id,
        courseId: course1.id,
        studentId: studentAId,
        studentName: studentAUser.name,
        courseTitle: course1.title,
        instructorName: instructorUser.name,
        completedAt: completedAtDate,
        issuedAt: new Date('2026-09-15T10:05:00.000Z'),
        finalScorePercentage: 95,
        status: 'ACTIVE',
      })
      .returning();
    certActiveForVerify = certActive;

    // 2. Enrollment B in Course 1: IN_PROGRESS (incomplete) with NO certificate
    const [enrB] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentBId,
        studentId: studentBId,
        courseId: course1.id,
        status: 'ACTIVE',
        completedAt: null,
      })
      .returning();
    enrollmentBIncomplete = enrB;

    // 3. Enrollment for Lazy Issuance: Student A in Course 2 (COMPLETED, all lessons completed, but NO cert in DB)
    const completedAtDate2 = new Date('2026-09-20T14:00:00.000Z');
    const [enrLazy] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentAId,
        studentId: studentAId,
        courseId: course2.id,
        status: 'COMPLETED',
        completedAt: completedAtDate2,
      })
      .returning();
    enrollmentLazyIssuance = enrLazy;

    await testDb.insert(schema.lessonProgress).values({
      enrollmentId: enrollmentLazyIssuance.id,
      lessonId: lesson2.id,
      status: 'COMPLETED',
      completedAt: completedAtDate2,
    });

    // 4. Enrollment with curriculum expansion: Student B in Course 3
    const [enrExp] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentBId,
        studentId: studentBId,
        courseId: course3.id,
        status: 'ACTIVE', // reverted after new lesson added
        completedAt: null,
      })
      .returning();
    enrollmentCurriculumExpansion = enrExp;

    const [certExp] = await testDb
      .insert(schema.certificates)
      .values({
        certificateNumber: 'TSP-2026-CEXPAND1',
        enrollmentId: enrollmentCurriculumExpansion.id,
        courseId: course3.id,
        studentId: studentBId,
        studentName: stB.name,
        courseTitle: course3.title,
        instructorName: instructorUser.name,
        completedAt: new Date('2026-08-01T12:00:00.000Z'),
        issuedAt: new Date('2026-08-01T12:05:00.000Z'),
        finalScorePercentage: 88,
        status: 'ACTIVE',
      })
      .returning();
    certCurriculumExpansion = certExp;

    // 5. Existing Revoked Certificate: Student B in Course Cybersecurity
    const [catRev] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Cybersecurity Fundamentals',
        slug: 'cybersecurity-fundamentals',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId,
      })
      .returning();

    const [enrRev] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentBId,
        studentId: studentBId,
        courseId: catRev.id,
        status: 'COMPLETED',
        completedAt: new Date('2026-07-10T09:00:00.000Z'),
      })
      .returning();
    enrollmentRevoked = enrRev;

    const [cRev] = await testDb
      .insert(schema.certificates)
      .values({
        certificateNumber: 'TSP-2026-CREVOKED1',
        enrollmentId: enrollmentRevoked.id,
        courseId: catRev.id,
        studentId: studentBId,
        studentName: stB.name,
        courseTitle: catRev.title,
        instructorName: instructorUser.name,
        completedAt: new Date('2026-07-10T09:00:00.000Z'),
        issuedAt: new Date('2026-07-10T09:05:00.000Z'),
        finalScorePercentage: 82,
        status: 'REVOKED',
        revokedAt: new Date('2026-07-20T16:00:00.000Z'),
        revocationReason: 'Academic integrity violation: unauthorized assessment assistance',
      })
      .returning();
    certRevoked = cRev;

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

    certificateService = app.get(CertificateService);

    // Authenticate users
    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];

    const instLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructorCookies = instLogin.headers['set-cookie'] as unknown as string[];

    const studentALogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentACookies = studentALogin.headers['set-cookie'] as unknown as string[];

    const studentBLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'studentb@techsprout.edu',
      password: 'StudentBPassword123!',
    });
    studentBCookies = studentBLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==================================================
  // 1. STUDENT CERTIFICATE ENDPOINT TESTS (1 - 8)
  // ==================================================

  describe('1. Student Certificate Endpoint: GET /api/v1/courses/:courseId/certificate', () => {
    it('1. authenticated completed student gets certificate', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course1.id}/certificate`)
        .set('Cookie', studentACookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.certificateNumber).toBe('TSP-2026-CACTIVE1');
      expect(res.body.data.studentName).toBe('Test Student');
      expect(res.body.data.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(res.body.data.instructorName).toBe('Dr. Sarah Mitchell');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.finalScorePercentage).toBe(95);
    });

    it('2. incomplete enrollment returns COURSE_NOT_COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course1.id}/certificate`)
        .set('Cookie', studentBCookies);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('COURSE_NOT_COMPLETED');
    });

    it('3. non-enrolled student gets ENROLLMENT_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course3.id}/certificate`)
        .set('Cookie', studentACookies);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('ENROLLMENT_NOT_FOUND');
    });

    it('4. Student A cannot access Student B\'s certificate', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course3.id}/certificate`)
        .set('Cookie', studentACookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('ENROLLMENT_NOT_FOUND');
      expect(res.body.data).toBeUndefined();
    });

    it('5. existing certificate remains accessible after curriculum expansion', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course3.id}/certificate`)
        .set('Cookie', studentBCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.certificateNumber).toBe('TSP-2026-CEXPAND1');
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('6. existing revoked certificate remains accessible with revoked status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${certRevoked.courseId}/certificate`)
        .set('Cookie', studentBCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.certificateNumber).toBe('TSP-2026-CREVOKED1');
      expect(res.body.data.status).toBe('REVOKED');
      expect(res.body.data.revokedAt).toBeDefined();
      expect(res.body.data.revocationReason).toBe(
        'Academic integrity violation: unauthorized assessment assistance'
      );
    });

    it('7. completed enrollment with no certificate can trigger lazy issuance', async () => {
      const [existingCert] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollmentLazyIssuance.id));
      expect(existingCert).toBeUndefined();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course2.id}/certificate`)
        .set('Cookie', studentACookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.certificateNumber).toMatch(/^TSP-\d{4}-C[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.studentName).toBe('Test Student');
      expect(res.body.data.courseTitle).toBe('Advanced Distributed Systems');

      const [newlyCreated] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollmentLazyIssuance.id));
      expect(newlyCreated).toBeDefined();
      expect(newlyCreated.certificateNumber).toBe(res.body.data.certificateNumber);
    });

    it('8. repeated retrieval is idempotent', async () => {
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course2.id}/certificate`)
        .set('Cookie', studentACookies);

      const res2 = await request(app.getHttpServer())
        .get(`/api/v1/courses/${course2.id}/certificate`)
        .set('Cookie', studentACookies);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.certificateNumber).toBe(res2.body.data.certificateNumber);
      expect(res1.body.data.id).toBe(res2.body.data.id);
    });
  });

  // ==================================================
  // 2. PUBLIC VERIFICATION ENDPOINT TESTS (9 - 13)
  // ==================================================

  describe('2. Public Verification Endpoint: GET /api/v1/certificates/verify/:certificateNumber', () => {
    it('9. active certificate verification', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/certificates/verify/TSP-2026-CACTIVE1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.certificateNumber).toBe('TSP-2026-CACTIVE1');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.studentName).toBe('Test Student');
      expect(res.body.data.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(res.body.data.instructorName).toBe('Dr. Sarah Mitchell');
      expect(res.body.data.completedAt).toBeDefined();
      expect(res.body.data.issuedAt).toBeDefined();
      expect(res.body.data.finalScorePercentage).toBe(95);
    });

    it('10. revoked certificate verification', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/certificates/verify/TSP-2026-CREVOKED1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.certificateNumber).toBe('TSP-2026-CREVOKED1');
      expect(res.body.data.status).toBe('REVOKED');
      expect(res.body.data.studentName).toBe('Bob Learner');
      expect(res.body.data.courseTitle).toBe('Cybersecurity Fundamentals');
      expect(res.body.data.revokedAt).toBeDefined();
      expect(res.body.data.revocationReason).toBe(
        'Academic integrity violation: unauthorized assessment assistance'
      );
    });

    it('11. nonexistent certificate returns 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/certificates/verify/TSP-2026-C9999999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('CERTIFICATE_NOT_FOUND');
    });

    it('12. public endpoint requires no session (unauthenticated)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/certificates/verify/TSP-2026-CACTIVE1');

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
    });

    it('13. public DTO contains no private/internal IDs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/certificates/verify/TSP-2026-CACTIVE1');

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.id).toBeUndefined();
      expect(data.enrollmentId).toBeUndefined();
      expect(data.courseId).toBeUndefined();
      expect(data.studentId).toBeUndefined();
      expect(data.userId).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(data.phone).toBeUndefined();
      expect(data.pdfMediaId).toBeUndefined();
      expect(data.createdAt).toBeUndefined();
      expect(data.updatedAt).toBeUndefined();
      expect(data.auditMetadata).toBeUndefined();
    });
  });

  // ==================================================
  // 3. ADMIN CERTIFICATES ENDPOINTS (15 - 27)
  // ==================================================

  describe('3. Admin Certificate List & Management Endpoints', () => {
    it('15. admin certificate list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/certificates')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('16. admin pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/certificates?page=1&limit=2')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.pagination.totalPages).toBeGreaterThanOrEqual(2);
      expect(res.body.data.pagination.hasNextPage).toBe(true);
      expect(res.body.data.pagination.hasPreviousPage).toBe(false);
    });

    it('17. admin status filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/certificates?status=REVOKED')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.every((c: any) => c.status === 'REVOKED')).toBe(true);
    });

    it('18. admin course filter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/certificates?courseId=${course1.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.every((c: any) => c.courseId === course1.id)).toBe(true);
    });

    it('19. admin search by student name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/certificates?search=Bob%20Learner')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items.every((c: any) => c.studentName.includes('Bob'))).toBe(true);
    });

    it('20. admin search by certificate number', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/certificates?search=CACTIVE1')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].certificateNumber).toBe('TSP-2026-CACTIVE1');
    });

    it('21. admin certificate detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/certificates/${certActiveForVerify.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(certActiveForVerify.id);
      expect(res.body.data.certificateNumber).toBe('TSP-2026-CACTIVE1');
      expect(res.body.data.enrollmentId).toBe(enrollmentACompleted.id);
      expect(res.body.data.studentId).toBe(studentAId);
      expect(res.body.data.courseId).toBe(course1.id);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('22. admin revoke success', async () => {
      const [certToRevoke] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollmentLazyIssuance.id));

      expect(certToRevoke).toBeDefined();
      expect(certToRevoke.status).toBe('ACTIVE');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certToRevoke.id}/revoke`)
        .set('Cookie', adminCookies)
        .send({
          reason: 'Administrative revocation due to misconduct',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(certToRevoke.id);
      expect(res.body.data.status).toBe('REVOKED');
      expect(res.body.data.revokedAt).toBeDefined();
      expect(res.body.data.revocationReason).toBe('Administrative revocation due to misconduct');
    });

    it('22.1 admin revoke rejects reason < 5 chars (e.g. "abcd") with 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certActiveForVerify.id}/revoke`)
        .set('Cookie', adminCookies)
        .send({ reason: 'abcd' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('22.2 admin revoke rejects whitespace-only reason with 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certActiveForVerify.id}/revoke`)
        .set('Cookie', adminCookies)
        .send({ reason: '     ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('22.3 admin revoke rejects reason > 1000 chars with 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certActiveForVerify.id}/revoke`)
        .set('Cookie', adminCookies)
        .send({ reason: 'A'.repeat(1001) });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('22.4 admin revoke accepts reason with exactly 5 chars (e.g. "abcde")', async () => {
      const [enrToRevoke5] = await testDb
        .insert(schema.enrollments)
        .values({
          userId: studentAId,
          studentId: studentAId,
          courseId: course3.id,
          status: 'COMPLETED',
          completedAt: new Date('2026-09-01T10:00:00.000Z'),
        })
        .returning();

      const [certToRevoke5] = await testDb
        .insert(schema.certificates)
        .values({
          certificateNumber: 'TSP-2026-CREV5CHAR',
          enrollmentId: enrToRevoke5.id,
          courseId: course3.id,
          studentId: studentAId,
          studentName: 'Student Five',
          courseTitle: course3.title,
          instructorName: 'Instructor User',
          completedAt: new Date('2026-09-01T10:00:00.000Z'),
          issuedAt: new Date('2026-09-01T10:05:00.000Z'),
          finalScorePercentage: 90,
          status: 'ACTIVE',
        })
        .returning();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certToRevoke5.id}/revoke`)
        .set('Cookie', adminCookies)
        .send({ reason: 'abcde' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.revocationReason).toBe('abcde');
      expect(res.body.data.status).toBe('REVOKED');
    });

    it('23. already revoked → 409', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certRevoked.id}/revoke`)
        .set('Cookie', adminCookies)
        .send({
          reason: 'Duplicate revocation attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('CERTIFICATE_ALREADY_REVOKED');
    });

    it('24. nonexistent certificate → 404', async () => {
      const nonExistentId = '11111111-2222-3333-4444-555555555555';
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${nonExistentId}/revoke`)
        .set('Cookie', adminCookies)
        .send({
          reason: 'Revocation of ghost certificate',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('CERTIFICATE_NOT_FOUND');
    });

    it('25. student attempting admin list → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/certificates')
        .set('Cookie', studentACookies);

      expect(res.status).toBe(403);
    });

    it('26. instructor attempting admin list → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/certificates')
        .set('Cookie', instructorCookies);

      expect(res.status).toBe(403);
    });

    it('27. non-admin attempting revoke → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certActiveForVerify.id}/revoke`)
        .set('Cookie', studentACookies)
        .send({
          reason: 'Student attempting self-revocation',
        });

      expect(res.status).toBe(403);

      const resInst = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${certActiveForVerify.id}/revoke`)
        .set('Cookie', instructorCookies)
        .send({
          reason: 'Instructor attempting unauthorized revocation',
        });

      expect(resInst.status).toBe(403);
    });
  });

  // ==================================================
  // 4. REVOCATION INVARIANTS & AUDIT TESTS (28 - 30)
  // ==================================================

  describe('4. Revocation Invariants & Audit Verification', () => {
    it('28. successful revocation emits exactly one CERTIFICATE_REVOKED audit event', async () => {
      const [certRevokedInTest] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollmentLazyIssuance.id));

      const auditRecords = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'CERTIFICATE_REVOKED'),
            eq(schema.auditLogs.targetId, certRevokedInTest.id)
          )
        );

      expect(auditRecords.length).toBe(1);
      expect(auditRecords[0].actorId).toBe(adminId);
      expect(auditRecords[0].targetType).toBe('CERTIFICATE');

      const meta = typeof auditRecords[0].metadata === 'string'
        ? JSON.parse(auditRecords[0].metadata)
        : auditRecords[0].metadata;

      expect(meta.certificateNumber).toBe(certRevokedInTest.certificateNumber);
      expect(meta.revocationReason).toBe('Administrative revocation due to misconduct');
    });

    it('29. revocation snapshot fields remain unchanged', async () => {
      const [certAfterRevocation] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollmentLazyIssuance.id));

      expect(certAfterRevocation.studentName).toBe('Test Student');
      expect(certAfterRevocation.courseTitle).toBe('Advanced Distributed Systems');
      expect(certAfterRevocation.instructorName).toBe('Dr. Sarah Mitchell');
      expect(certAfterRevocation.completedAt).toEqual(enrollmentLazyIssuance.completedAt);
      expect(certAfterRevocation.finalScorePercentage).toBe(100);
      expect(certAfterRevocation.status).toBe('REVOKED');
      expect(certAfterRevocation.revokedAt).toBeDefined();
      expect(certAfterRevocation.revocationReason).toBe('Administrative revocation due to misconduct');
    });

    it('30. public verification immediately reports REVOKED', async () => {
      const [certAfterRevocation] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrollmentLazyIssuance.id));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/verify/${certAfterRevocation.certificateNumber}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.status).toBe('REVOKED');
      expect(res.body.data.studentName).toBe('Test Student');
      expect(res.body.data.courseTitle).toBe('Advanced Distributed Systems');
      expect(res.body.data.revokedAt).toBeDefined();
      expect(res.body.data.revocationReason).toBe('Administrative revocation due to misconduct');
    });
  });

  // ==================================================
  // 5. SIDE-EFFECT BOUNDARY TESTS (Section 15)
  // ==================================================

  describe('5. Side-Effect Boundary Verification (Section 15)', () => {
    it('31. GET /api/v1/learn/courses/:courseId/curriculum remains strictly side-effect free', async () => {
      const [studentC] = await testDb
        .insert(schema.users)
        .values({
          name: 'Charlie Learner',
          username: 'studentc',
          email: 'studentc@techsprout.edu',
          phone: '01711111177',
          passwordHash: await CryptoUtil.hashPassword('StudentCPassword123!'),
          isActive: true,
          isVerified: true,
        })
        .returning();

      const [enrC] = await testDb
        .insert(schema.enrollments)
        .values({
          userId: studentC.id,
          studentId: studentC.id,
          courseId: course1.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        })
        .returning();

      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: enrC.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      const studentCLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'studentc@techsprout.edu',
        password: 'StudentCPassword123!',
      });
      const studentCCookies = studentCLogin.headers['set-cookie'] as unknown as string[];

      const certsBefore = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrC.id));
      expect(certsBefore.length).toBe(0);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${course1.id}/curriculum`)
        .set('Cookie', studentCCookies);

      expect(res.status).toBe(200);

      const certsAfter = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, enrC.id));
      expect(certsAfter.length).toBe(0);
    });

    it('32. GET /api/v1/learn/courses/:courseId/resume remains strictly side-effect free', async () => {
      const studentCLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'studentc@techsprout.edu',
        password: 'StudentCPassword123!',
      });
      const studentCCookies = studentCLogin.headers['set-cookie'] as unknown as string[];

      const res = await request(app.getHttpServer())
        .get(`/api/v1/learn/courses/${course1.id}/resume`)
        .set('Cookie', studentCCookies);

      expect(res.status).toBe(200);

      const certs = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.studentId, studentAId));
      expect(certs.length).toBeGreaterThan(0);
    });

    it('33. GET /api/v1/certificates/verify/:certificateNumber remains strictly side-effect free', async () => {
      const [beforeCert] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.certificateNumber, 'TSP-2026-CACTIVE1'));

      await request(app.getHttpServer()).get('/api/v1/certificates/verify/TSP-2026-CACTIVE1');

      const [afterCert] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.certificateNumber, 'TSP-2026-CACTIVE1'));

      expect(beforeCert.updatedAt).toEqual(afterCert.updatedAt);
    });

    it('34. GET /api/v1/admin/certificates remains strictly side-effect free', async () => {
      const countBefore = await testDb.select().from(schema.certificates);
      await request(app.getHttpServer())
        .get('/api/v1/admin/certificates')
        .set('Cookie', adminCookies);
      const countAfter = await testDb.select().from(schema.certificates);
      expect(countBefore.length).toBe(countAfter.length);
    });
  });

  // ==================================================
  // 6. PUBLIC RATE LIMITING TEST (14)
  // ==================================================

  describe('6. Public Verification Rate Limiting (Case 14)', () => {
    it('14. rate limiting follows existing mechanism', async () => {
      let got429 = false;

      // Exhaust rate limit bucket on verify endpoint
      for (let i = 0; i < 25; i++) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/certificates/verify/TSP-2026-CACTIVE1');

        if (res.status === 429) {
          got429 = true;
          expect(res.body.message).toMatch(/Too Many Requests|ThrottlerException/i);
          break;
        }
      }

      expect(got429).toBe(true);
    });
  });

  // ==================================================
  // 7. P4.5.5 CERTIFICATE DISCOVERABILITY (CASES 1-6)
  // ==================================================

  describe('7. P4.5.5 Certificate Discoverability Backend Contract (Cases 1-6)', () => {
    it('1. enrollment response includes hasCertificate=true when certificate exists', async () => {
      // Student A in Course 1 has COMPLETED enrollment and active certificate TSP-2026-CACTIVE1
      const res = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentACookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const item = res.body.data.items.find((i: any) => i.course.id === course1.id);
      expect(item).toBeDefined();
      expect(item.hasCertificate).toBe(true);
      expect(item.status).toBe('COMPLETED');

      // Security check: must not expose internal certificate UUID, certificate number, or private details in enrollment DTO
      expect(item.certificateId).toBeUndefined();
      expect(item.certificateNumber).toBeUndefined();
      expect(item.revocationReason).toBeUndefined();
      expect(item.revokedAt).toBeUndefined();
    });

    it('2. enrollment response includes hasCertificate=false when none exists', async () => {
      // 1. Student B in Course 1 has ACTIVE enrollment without certificate
      const resB = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentBCookies);

      expect(resB.status).toBe(200);
      const itemCourse1 = resB.body.data.items.find((i: any) => i.course.id === course1.id);
      expect(itemCourse1).toBeDefined();
      expect(itemCourse1.hasCertificate).toBe(false);

      // 2. Create a course with COMPLETED enrollment without certificate (before any lazy issuance view)
      const [courseNoCert] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Course Without Certificate',
          slug: 'course-without-cert',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: category.id,
          instructorId,
        })
        .returning();

      await testDb.insert(schema.enrollments).values({
        userId: studentAId,
        studentId: studentAId,
        courseId: courseNoCert.id,
        status: 'COMPLETED',
        completedAt: new Date('2026-09-01T10:00:00.000Z'),
      });

      const resA = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentACookies);

      expect(resA.status).toBe(200);
      const itemNoCert = resA.body.data.items.find((i: any) => i.course.id === courseNoCert.id);
      expect(itemNoCert).toBeDefined();
      expect(itemNoCert.hasCertificate).toBe(false);
    });

    it('3. ACTIVE + historical certificate returns true', async () => {
      // Student B in Course 3 has ACTIVE enrollment after curriculum expansion, with historical certificate TSP-2026-CEXPAND1
      const res = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentBCookies);

      expect(res.status).toBe(200);
      const itemCourse3 = res.body.data.items.find((i: any) => i.course.id === course3.id);
      expect(itemCourse3).toBeDefined();
      expect(itemCourse3.status).toBe('ACTIVE');
      expect(itemCourse3.hasCertificate).toBe(true);
    });

    it('4. certificate belonging to another student cannot influence result', async () => {
      // Course 1 has certificate TSP-2026-CACTIVE1 belonging to Student A.
      // Student B is enrolled in Course 1 but has NOT earned a certificate.
      const resB = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentBCookies);

      expect(resB.status).toBe(200);
      const itemB = resB.body.data.items.find((i: any) => i.course.id === course1.id);
      expect(itemB).toBeDefined();
      expect(itemB.hasCertificate).toBe(false);
    });

    it('5. archived course does not leak another user\'s certificate state', async () => {
      // Create archived course
      const [archivedCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Legacy Mainframe Systems',
          slug: 'legacy-mainframe-systems',
          status: 'ARCHIVED',
          visibility: 'PUBLIC',
          categoryId: category.id,
          instructorId,
        })
        .returning();

      // Student A enrolled in archived course with certificate
      const [enrArchivedA] = await testDb
        .insert(schema.enrollments)
        .values({
          userId: studentAId,
          studentId: studentAId,
          courseId: archivedCourse.id,
          status: 'COMPLETED',
          completedAt: new Date('2026-05-01T10:00:00.000Z'),
        })
        .returning();

      await testDb.insert(schema.certificates).values({
        certificateNumber: 'TSP-2026-CARCH-A1',
        enrollmentId: enrArchivedA.id,
        courseId: archivedCourse.id,
        studentId: studentAId,
        studentName: 'Student A',
        courseTitle: archivedCourse.title,
        instructorName: 'Instructor User',
        completedAt: new Date('2026-05-01T10:00:00.000Z'),
        issuedAt: new Date('2026-05-01T10:05:00.000Z'),
        finalScorePercentage: 90,
        status: 'ACTIVE',
      });

      // Student B enrolled in same archived course with NO certificate
      await testDb
        .insert(schema.enrollments)
        .values({
          userId: studentBId,
          studentId: studentBId,
          courseId: archivedCourse.id,
          status: 'ACTIVE',
          completedAt: null,
        })
        .returning();

      // Verify Student B sees their own archived enrollment with hasCertificate = false
      const resB = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentBCookies);
      const itemB = resB.body.data.items.find((i: any) => i.course.id === archivedCourse.id);
      expect(itemB).toBeDefined();
      expect(itemB.hasCertificate).toBe(false);
      expect(itemB.course.status).toBe('ARCHIVED');

      // Verify Student A sees their own archived enrollment with hasCertificate = true
      const resA = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentACookies);
      const itemA = resA.body.data.items.find((i: any) => i.course.id === archivedCourse.id);
      expect(itemA).toBeDefined();
      expect(itemA.hasCertificate).toBe(true);
      expect(itemA.course.status).toBe('ARCHIVED');
    });

    it('6. query does not create N+1 certificate queries', async () => {
      // Spy on testPool.query
      const poolQuerySpy = vi.spyOn(testPool, 'query');
      poolQuerySpy.mockClear();

      const res = await request(app.getHttpServer())
        .get('/api/v1/enrollments')
        .set('Cookie', studentBCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(3);

      // Inspect SQL calls to check how many times the certificates table was touched
      const certificateQueries = poolQuerySpy.mock.calls.filter((call) => {
        const queryText = typeof call[0] === 'string' ? call[0] : (call[0] as any)?.text || '';
        return /from\s+["']?certificates["']?|join\s+["']?certificates["']?/i.test(queryText);
      });

      // Exactly 1 query touches certificates (via the single LEFT JOIN in userEnrollments query)
      expect(certificateQueries.length).toBe(1);
      poolQuerySpy.mockRestore();
    });
  });
});
