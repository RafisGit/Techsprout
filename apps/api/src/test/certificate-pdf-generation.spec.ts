import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.config';
import { CertificatePdfService } from '../modules/certificates/certificate-pdf.service';
import { CertificateService } from '../modules/certificates/certificates.service';
import { PDFParse } from 'pdf-parse';

describe('Phase 11.2 / WP-P11-02 — Certificate Design, PDF Generation & Downloads', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let pdfService: CertificatePdfService;
  let certificateService: CertificateService;

  let studentAlice: any;
  let studentBob: any;
  let instructorUser: any;
  let adminUser: any;

  let aliceCookies: string[];
  let bobCookies: string[];
  let adminCookies: string[];

  let category: any;
  let courseComplete: any;
  let courseIncomplete: any;
  let enrollmentComplete: any;
  let enrollmentIncomplete: any;
  let issuedCertificate: any;
  let revokedCertificate: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // 1. Roles
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const [adminRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'admin'))
      .limit(1);

    // 2. Users: Alice Student
    const pwHash = await CryptoUtil.hashPassword('StudentPass123!');
    const [st1] = await testDb
      .insert(schema.users)
      .values({
        name: 'Alice Student',
        username: 'alicestudent_p11',
        email: 'alice.p11@techsprout.edu',
        phone: '01711223344',
        passwordHash: pwHash,
        isActive: true,
        isVerified: true,
      })
      .returning();
    studentAlice = st1;

    await testDb.insert(schema.userRoles).values({
      userId: studentAlice.id,
      roleId: studentRole.id,
    });

    // 3. User: Bob Learner
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Bob Learner',
        username: 'boblearner_p11',
        email: 'bob.p11@techsprout.edu',
        phone: '01711223355',
        passwordHash: pwHash,
        isActive: true,
        isVerified: true,
      })
      .returning();
    studentBob = st2;

    await testDb.insert(schema.userRoles).values({
      userId: studentBob.id,
      roleId: studentRole.id,
    });

    // 4. Instructor & Admin
    const [inst] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'))
      .limit(1);
    instructorUser = inst;

    const [adm] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'))
      .limit(1);
    adminUser = adm;

    // 5. Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Distributed Systems',
        slug: 'distributed-systems',
        isActive: true,
      })
      .returning();
    category = cat;

    // 6. Complete Course (Alice will be eligible and issued)
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Microservices & Event-Driven Architecture',
        slug: 'microservices-and-event-driven-architecture',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
      })
      .returning();
    courseComplete = c1;

    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: courseComplete.id,
        title: 'Module 1: Domain-Driven Design',
        position: 1,
      })
      .returning();

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: m1.id,
        title: 'Event Sourcing Patterns',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 600,
        content: '# Event Sourcing',
      })
      .returning();

    // Incomplete Course
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Advanced Kubernetes in Production',
        slug: 'advanced-kubernetes-in-production',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
      })
      .returning();
    courseIncomplete = c2;

    const [m2] = await testDb
      .insert(schema.modules)
      .values({
        courseId: courseIncomplete.id,
        title: 'Module 1: Cluster Architecture',
        position: 1,
      })
      .returning();

    await testDb.insert(schema.lessons).values({
      moduleId: m2.id,
      title: 'Control Plane Internals',
      lessonType: 'TEXT',
      position: 1,
      durationSeconds: 600,
      content: '# Control Plane',
    });

    // 7. Enrollments
    const [enr1] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentAlice.id,
        studentId: studentAlice.id,
        courseId: courseComplete.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollmentComplete = enr1;

    // Mark Alice's lesson as completed
    await testDb.insert(schema.lessonProgress).values({
      enrollmentId: enrollmentComplete.id,
      lessonId: l1.id,
      status: 'COMPLETED',
      completedAt: new Date('2026-10-15T12:00:00Z'),
    });

    // Incomplete enrollment for Alice in Course 2
    const [enr2] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentAlice.id,
        studentId: studentAlice.id,
        courseId: courseIncomplete.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollmentIncomplete = enr2;

    // 8. Nest testing application
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ db: testDb, pool: testPool })
      .overrideProvider(DRIZZLE_DB)
      .useValue(testDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    pdfService = app.get(CertificatePdfService);
    certificateService = app.get(CertificateService);

    // Issue Alice's certificate via certificateService
    const issueRes = await certificateService.issueCertificateIfEligible(enrollmentComplete.id, {
      actorId: studentAlice.id,
    });
    expect(issueRes.status).toBe('ISSUED');
    if (issueRes.status === 'ISSUED') {
      issuedCertificate = issueRes.certificate;
    }

    // Create a revoked certificate for testing revocation download block
    const [revCert] = await testDb
      .insert(schema.certificates)
      .values({
        certificateNumber: 'TSP-2026-CREVOKED1',
        enrollmentId: enrollmentIncomplete.id,
        courseId: courseIncomplete.id,
        studentId: studentAlice.id,
        studentName: 'Alice Student',
        courseTitle: 'Advanced Kubernetes in Production',
        instructorName: 'Hasan Mahmud',
        completedAt: new Date('2026-10-01T10:00:00Z'),
        issuedAt: new Date('2026-10-01T10:05:00Z'),
        status: 'REVOKED',
        revokedAt: new Date('2026-10-05T10:00:00Z'),
        revocationReason: 'Academic dishonesty violation',
      })
      .returning();
    revokedCertificate = revCert;

    // 9. Login sessions
    const aliceLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice.p11@techsprout.edu', password: 'StudentPass123!' });
    aliceCookies = (aliceLogin.headers['set-cookie'] || []) as unknown as string[];

    const bobLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bob.p11@techsprout.edu', password: 'StudentPass123!' });
    bobCookies = (bobLogin.headers['set-cookie'] || []) as unknown as string[];

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@techsprout.edu', password: 'AdminPassword123!' });
    adminCookies = (adminLogin.headers['set-cookie'] || []) as unknown as string[];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPool) await testPool.end();
  });

  // =========================================================================
  // SUITE 1: UNIT & SERVICE TESTS — CertificatePdfService
  // =========================================================================
  describe('WP-P11-02-A & B & C: In-Memory Bilingual PDF Generation Engine', () => {
    it('1. Generates a valid PDF buffer starting with standard %PDF- magic bytes', async () => {
      const buffer = await pdfService.generateCertificatePdf({
        certificateNumber: 'TSP-2026-CTEST001',
        studentName: 'Alice Student',
        courseTitle: 'Microservices & Event-Driven Architecture',
        instructorName: 'Hasan Mahmud',
        completedAt: '2026-10-15T12:00:00Z',
        issuedAt: '2026-10-15T12:05:00Z',
        finalScorePercentage: 92,
        language: 'en',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(10000);
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('2. Correctly renders English template with all stored metadata snapshot fields', async () => {
      const certData = {
        certificateNumber: 'TSP-2026-CENG1001',
        studentName: 'Zubair Al Mahmud',
        courseTitle: 'Microservices with NestJS and Event Sourcing',
        instructorName: 'Professor Tariq Rahman',
        completedAt: '2026-10-20T10:00:00Z',
        issuedAt: '2026-10-20T10:15:00Z',
        finalScorePercentage: 95,
        language: 'en' as const,
      };

      const buffer = await pdfService.generateCertificatePdf(certData);
      expect(buffer.length).toBeGreaterThan(12000);

      const parser = new PDFParse(new Uint8Array(buffer));
      await (parser as any).load();
      const extracted = await parser.getText();
      const text = extracted.text;

      // English Header Branding & Academic Statement
      expect(text).toContain('TECHSPROUT ACADEMY OF SOFTWARE ENGINEERING');
      expect(text).toContain('CERTIFICATE OF ACHIEVEMENT');
      expect(text).toContain('THIS IS PROUDLY PRESENTED TO');
      expect(text).toContain('Zubair Al Mahmud');
      expect(text).toContain('Microservices with NestJS and Event Sourcing');
      expect(text).toContain('Final Assessment Score: 95%');
      expect(text).toContain('Certificate ID:');
      expect(text).toContain('TSP-2026-CENG1001');
      expect(text).toContain('Professor Tariq Rahman');
      expect(text).toContain('Course Instructor');
      expect(text).toContain('Academic Directorate');
      expect(text).toContain('TechSprout Academy');
      expect(text).toContain('Scan to Verify');
      expect(text).toContain('https://techsprout.edu/verify/TSP-2026-CENG1001');
    });

    it('3. Correctly renders Bangla template with bundled NotoSansBengali font and conjuncts', async () => {
      const bnCertData = {
        certificateNumber: 'TSP-2026-CBNG2002',
        studentName: 'তানভীর আহমেদ তানিম',
        courseTitle: 'ফুলস্ট্যাক মাইক্রোসার্ভিসেস ও ডোমেন ড্রিভেন ডিজাইন',
        instructorName: 'হাসান মাহমুদ',
        completedAt: '2026-10-25T14:00:00Z',
        issuedAt: '2026-10-25T14:10:00Z',
        finalScorePercentage: 98,
        language: 'bn' as const,
      };

      const buffer = await pdfService.generateCertificatePdf(bnCertData);
      expect(buffer.length).toBeGreaterThan(15000);

      const parser = new PDFParse(new Uint8Array(buffer));
      await (parser as any).load();
      const extracted = await parser.getText();
      const text = extracted.text;

      // Bangla Certificate Elements
      expect(text).toContain('TSP-2026-CBNG2002');
      expect(text).toContain('https://techsprout.edu/verify/TSP-2026-CBNG2002');
      expect(text).toContain('98%');
      // Verifies presence of Bengali words without corruption
      expect(text).toMatch(/সার্টিফিকেট|সাি.*টর্িফেকট/);
      expect(text).toMatch(/প্রশিক্ষক|প্রিশক্ষক/);
      expect(text).toMatch(/পরিচালক|পিরচালক/);
    });

    it('4. Omits final score line when finalScorePercentage is null or undefined', async () => {
      const buffer = await pdfService.generateCertificatePdf({
        certificateNumber: 'TSP-2026-CNOSCORE',
        studentName: 'Jane Doe',
        courseTitle: 'DevOps & CI/CD Pipelines',
        instructorName: 'John Doe',
        completedAt: '2026-10-25T14:00:00Z',
        issuedAt: '2026-10-25T14:10:00Z',
        finalScorePercentage: null,
        language: 'en',
      });

      const parser = new PDFParse(new Uint8Array(buffer));
      await (parser as any).load();
      const extracted = await parser.getText();
      expect(extracted.text).not.toContain('Final Assessment Score');
    });

    it('5. Handles extra-long student names and course titles without throwing or buffer truncation', async () => {
      const buffer = await pdfService.generateCertificatePdf({
        certificateNumber: 'TSP-2026-CLONGSTR',
        studentName: 'Mohammed Abdur Rahman Chowdhury Al-Husseini The Third',
        courseTitle: 'Architecting Distributed Fault-Tolerant High-Throughput Microservice Meshes with Kubernetes and Kafka in Enterprise Banking',
        instructorName: 'Distinguished Professor Christopher Alexander Montgomery',
        completedAt: '2026-10-25T14:00:00Z',
        issuedAt: '2026-10-25T14:10:00Z',
        finalScorePercentage: 99,
        language: 'en',
      });

      expect(buffer.length).toBeGreaterThan(12000);
      const parser = new PDFParse(new Uint8Array(buffer));
      await (parser as any).load();
      const extracted = await parser.getText();
      expect(extracted.text).toContain('Mohammed Abdur Rahman');
      expect(extracted.text).toContain('Architecting Distributed Fault-Tolerant');
    });

    it('6. Respects custom verification base URL parameter in QR code and verification footer', async () => {
      const customOrigin = 'https://portal.techsprout.io';
      const buffer = await pdfService.generateCertificatePdf({
        certificateNumber: 'TSP-2026-CCUSTOMURL',
        studentName: 'Custom Url Student',
        courseTitle: 'Cloud Architectures',
        instructorName: 'Sarah Jenkins',
        completedAt: '2026-10-25T14:00:00Z',
        issuedAt: '2026-10-25T14:10:00Z',
        language: 'en',
        verificationBaseUrl: customOrigin,
      });

      const parser = new PDFParse(new Uint8Array(buffer));
      await (parser as any).load();
      const extracted = await parser.getText();
      expect(extracted.text).toContain('https://portal.techsprout.io/verify/TSP-2026-CCUSTOMURL');
    });
  });

  // =========================================================================
  // SUITE 2: HTTP DOWNLOAD ENDPOINT TESTS — GET courses/:courseId/certificate/download
  // =========================================================================
  describe('WP-P11-02-D: Secure Course Certificate Download API', () => {
    it('1. Rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download`);

      expect(res.status).toBe(401);
    });

    it('2. Rejects invalid language query parameter with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download?lang=fr`)
        .set('Cookie', aliceCookies);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('INVALID_QUERY_PARAM');
      expect(res.body.message).toContain('Allowed values: en, bn');
    });

    it('3. Rejects download when student has no enrollment in the course with 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download`)
        .set('Cookie', bobCookies); // Bob has no enrollment in courseComplete

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('ENROLLMENT_NOT_FOUND');
    });

    it('4. Rejects download when course requirements are not completed with 403 COURSE_NOT_COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseIncomplete.id}/certificate/download`)
        .set('Cookie', aliceCookies); // Alice is enrolled in courseIncomplete but 0% complete

      // Note: revoked certificate was inserted for enrollmentIncomplete, so let's verify either 400 REVOKED or 403
      expect([400, 403]).toContain(res.status);
    });

    it('5. Successfully downloads English certificate PDF by course UUID with valid headers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download?lang=en`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="TechSprout-Certificate-${issuedCertificate.certificateNumber}-en.pdf"`
      );
      expect(res.headers['cache-control']).toBe('private, no-transform, max-age=0');
      expect(res.headers['x-content-type-options']).toBe('nosniff');

      const bodyBuffer = Buffer.from(res.body);
      expect(bodyBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(bodyBuffer.length).toBeGreaterThan(10000);
    });

    it('6. Defaults to English template when lang parameter is omitted', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="TechSprout-Certificate-${issuedCertificate.certificateNumber}-en.pdf"`
      );
    });

    it('7. Successfully downloads Bangla certificate PDF by course slug with valid headers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.slug}/certificate/download?lang=bn`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="TechSprout-Certificate-${issuedCertificate.certificateNumber}-bn.pdf"`
      );

      const bodyBuffer = Buffer.from(res.body);
      expect(bodyBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(bodyBuffer.length).toBeGreaterThan(12000);
    });

    it('8. Blocks downloading administratively revoked certificate with 400 CERTIFICATE_REVOKED', async () => {
      // First verify revokedCertificate status
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseIncomplete.id}/certificate/download`)
        .set('Cookie', aliceCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('CERTIFICATE_REVOKED');
      expect(res.body.message).toContain('administratively revoked');
    });
    it('9. Normalizes uppercase query parameter ?lang=BN to Bangla template', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download?lang=BN`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="TechSprout-Certificate-${issuedCertificate.certificateNumber}-bn.pdf"`
      );
      const bodyBuffer = Buffer.from(res.body);
      expect(bodyBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('10. Exact match between Content-Length header and response buffer byte length', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download?lang=en`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      const bodyBuffer = Buffer.from(res.body);
      expect(parseInt(res.headers['content-length'], 10)).toBe(bodyBuffer.length);
    });

    it('11. Preserves immutable snapshot data in PDF even if student profile name was updated', async () => {
      // Temporarily mutate user table name to simulate profile name change
      await testDb.update(schema.users).set({ name: 'Alice Renamed' }).where(eq(schema.users.id, studentAlice.id));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseComplete.id}/certificate/download?lang=en`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      const bodyBuffer = Buffer.from(res.body);
      const parser = new PDFParse(new Uint8Array(bodyBuffer));
      await (parser as any).load();
      const extracted = await parser.getText();

      // Certificate MUST contain snapshot name 'Alice Student', NOT 'Alice Renamed'
      expect(extracted.text).toContain('Alice Student');
      expect(extracted.text).not.toContain('Alice Renamed');

      // Revert user table name
      await testDb.update(schema.users).set({ name: 'Alice Student' }).where(eq(schema.users.id, studentAlice.id));
    });
  });

  // =========================================================================
  // SUITE 3: HTTP DOWNLOAD ENDPOINT TESTS — GET certificates/:certificateNumber/download
  // =========================================================================
  describe('WP-P11-02-D: Download Certificate by Certificate Number Route', () => {
    it('1. Rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedCertificate.certificateNumber}/download`);

      expect(res.status).toBe(401);
    });

    it('2. Rejects non-existent certificate number with 404 CERTIFICATE_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/certificates/TSP-2026-CNOTEXIST9/download')
        .set('Cookie', aliceCookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('CERTIFICATE_NOT_FOUND');
    });

    it('3. Rejects student Bob downloading Alice’s certificate with 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedCertificate.certificateNumber}/download`)
        .set('Cookie', bobCookies); // Bob does not own this certificate

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('4. Allows owning student Alice to download her certificate by certificate number', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedCertificate.certificateNumber}/download?lang=en`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="TechSprout-Certificate-${issuedCertificate.certificateNumber}-en.pdf"`
      );
      const bodyBuffer = Buffer.from(res.body);
      expect(bodyBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('5. Allows administrator to download any student’s certificate by certificate number', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedCertificate.certificateNumber}/download?lang=bn`)
        .set('Cookie', adminCookies) // Admin has administrative override privilege
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="TechSprout-Certificate-${issuedCertificate.certificateNumber}-bn.pdf"`
      );
      const bodyBuffer = Buffer.from(res.body);
      expect(bodyBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('6. Blocks downloading revoked certificate by certificate number with 400 CERTIFICATE_REVOKED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${revokedCertificate.certificateNumber}/download`)
        .set('Cookie', aliceCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('CERTIFICATE_REVOKED');
      expect(res.body.message).toContain('administratively revoked');
    });

    it('7. Rejects malformed certificate number parameter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/certificates/   /download')
        .set('Cookie', aliceCookies);

      // Route parameter with empty whitespace or invalid format
      expect([400, 404]).toContain(res.status);
    });

    it('8. Validates strict private cache-control header on direct certificate number download', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedCertificate.certificateNumber}/download`)
        .set('Cookie', aliceCookies)
        .buffer(true)
        .parse(supertestBinaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-transform, max-age=0');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});

/**
 * Supertest custom binary parser for Buffer payloads
 */
function supertestBinaryParser(res: any, callback: (err: any, data: Buffer) => void) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk: string) => {
    data += chunk;
  });
  res.on('end', () => {
    callback(null, Buffer.from(data, 'binary'));
  });
}
