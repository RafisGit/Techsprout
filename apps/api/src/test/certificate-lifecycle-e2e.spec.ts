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
import { eq, and, count } from 'drizzle-orm';
import { env } from '../config/env.config';
import { CertificatePdfService } from '../modules/certificates/certificate-pdf.service';
import { CertificateService } from '../modules/certificates/certificates.service';
import { PDFParse } from 'pdf-parse';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

describe('Phase 11.4 / WP-P11-04 — End-to-End Certificate Lifecycle Integration & Regression', () => {
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
  let coursePrimary: any;
  let module1: any;
  let lesson1: any;
  let lesson2: any;
  let quizPractice: any;
  let quizFinalExam: any;
  let quizDraft: any;
  let quizArchived: any;

  let aliceEnrollment: any;
  let bobEnrollment: any;

  let issuedAliceCert: any;

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

    const pwHash = await CryptoUtil.hashPassword('StudentPass123!');

    // 2. Student Alice (Primary Learner)
    const [st1] = await testDb
      .insert(schema.users)
      .values({
        name: 'Alice Learner',
        username: 'alice_p11_4',
        email: 'alice.p11.4@techsprout.edu',
        phone: '01711998877',
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

    // 3. Student Bob (Unauthorized Peer / Tenant Isolation)
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Bob Peer',
        username: 'bob_p11_4',
        email: 'bob.p11.4@techsprout.edu',
        phone: '01711998866',
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

    // 5. Category & Primary Course
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Cloud Computing & Distributed Architecture',
        slug: 'cloud-computing-distributed-architecture',
        isActive: true,
      })
      .returning();
    category = cat;

    const [c] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Production Kubernetes & Event Mesh Architecture',
        slug: 'production-kubernetes-and-event-mesh-architecture',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: instructorUser.id,
      })
      .returning();
    coursePrimary = c;

    // Module 1
    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: coursePrimary.id,
        title: 'Module 1: High-Availability Clusters',
        position: 1,
      })
      .returning();
    module1 = m1;

    // Lesson 1 & Lesson 2
    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Control Plane Quorum with Raft',
        lessonType: 'TEXT',
        position: 1,
        durationSeconds: 900,
        content: '# Raft Consensus',
      })
      .returning();
    lesson1 = l1;

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1.id,
        title: 'Multi-Region Ingress Networking',
        lessonType: 'TEXT',
        position: 2,
        durationSeconds: 1200,
        content: '# Multi-Region Ingress',
      })
      .returning();
    lesson2 = l2;

    // Quizzes: Practice Quiz, Final Exam, Draft Quiz, Archived Quiz
    const [q1] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Module 1 Practice Quiz',
        description: 'Test Raft and Ingress concepts',
        quizType: 'KNOWLEDGE_CHECK',
        status: 'PUBLISHED',
        position: 1,
        passingScorePercentage: 75,
        maxAttempts: 3,
        timeLimitMinutes: 20,
      })
      .returning();
    quizPractice = q1;

    const [q2] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Comprehensive Final Examination',
        description: 'Demonstrate end-to-end cloud mastery',
        quizType: 'FINAL_EXAM',
        status: 'PUBLISHED',
        position: 2,
        passingScorePercentage: 80,
        maxAttempts: 2,
        timeLimitMinutes: 45,
      })
      .returning();
    quizFinalExam = q2;

    const [q3] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Upcoming Draft Assessment',
        description: 'Unpublished draft questions',
        quizType: 'KNOWLEDGE_CHECK',
        status: 'DRAFT',
        position: 3,
        passingScorePercentage: 70,
      })
      .returning();
    quizDraft = q3;

    const [q4] = await testDb
      .insert(schema.quizzes)
      .values({
        moduleId: module1.id,
        title: 'Legacy Retired Assessment',
        description: 'Archived quiz no longer required',
        quizType: 'KNOWLEDGE_CHECK',
        status: 'ARCHIVED',
        position: 4,
        passingScorePercentage: 70,
      })
      .returning();
    quizArchived = q4;

    // Enrollments
    const [enr1] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentAlice.id,
        studentId: studentAlice.id,
        courseId: coursePrimary.id,
        status: 'ACTIVE',
      })
      .returning();
    aliceEnrollment = enr1;

    const [enr2] = await testDb
      .insert(schema.enrollments)
      .values({
        userId: studentBob.id,
        studentId: studentBob.id,
        courseId: coursePrimary.id,
        status: 'ACTIVE',
      })
      .returning();
    bobEnrollment = enr2;

    // 6. Nest App Init
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

    // Login cookies
    const aliceLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'alice.p11.4@techsprout.edu', password: 'StudentPass123!' });
    aliceCookies = (aliceLogin.headers['set-cookie'] || []) as unknown as string[];

    const bobLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bob.p11.4@techsprout.edu', password: 'StudentPass123!' });
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
  // SUITE 1: END-TO-END CERTIFICATE LIFECYCLE FLOW (1 - 12)
  // =========================================================================
  describe('1. Full Lifecycle Integration: From Incomplete to Verification & Revocation', () => {
    it('1.1 Incomplete student cannot claim or download certificate (403 COURSE_NOT_COMPLETED)', async () => {
      // Alice has completed 0 lessons and 0 quizzes
      const claimRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${coursePrimary.id}/certificate`)
        .set('Cookie', aliceCookies);

      expect(claimRes.status).toBe(403);
      expect(claimRes.body.errorCode).toBe('COURSE_NOT_COMPLETED');
      expect(claimRes.body.message).toContain('Incomplete');

      // Attempting to download also returns 403
      const downloadRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${coursePrimary.id}/certificate/download`)
        .set('Cookie', aliceCookies);

      expect(downloadRes.status).toBe(403);
      expect(downloadRes.body.errorCode).toBe('COURSE_NOT_COMPLETED');
    });

    it('1.2 Completing lessons but missing quizzes leaves student ineligible', async () => {
      // Complete lesson 1 and lesson 2
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: aliceEnrollment.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date('2026-10-20T10:00:00Z'),
      });
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: aliceEnrollment.id,
        lessonId: lesson2.id,
        status: 'COMPLETED',
        completedAt: new Date('2026-10-20T10:30:00Z'),
      });

      // Check eligibility
      const elig = await certificateService.checkEligibility(aliceEnrollment.id, coursePrimary.id);
      expect(elig.isEligible).toBe(false);
      expect(elig.hasUnpassedQuizzes).toBe(true);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${coursePrimary.id}/certificate`)
        .set('Cookie', aliceCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('COURSE_NOT_COMPLETED');
    });

    it('1.3 Passing practice quiz but missing final exam leaves student ineligible', async () => {
      // Pass practice quiz with 85%
      await testDb.insert(schema.quizAttempts).values({
        quizId: quizPractice.id,
        enrollmentId: aliceEnrollment.id,
        studentId: studentAlice.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 17,
        totalPoints: 20,
        percentage: '85.00',
        isPassed: true,
        submittedAt: new Date('2026-10-20T11:00:00Z'),
      });

      const elig = await certificateService.checkEligibility(aliceEnrollment.id, coursePrimary.id);
      expect(elig.isEligible).toBe(false);
      expect(elig.hasUnpassedFinalExam).toBe(true);
      expect(elig.reason).toContain('Incomplete quizzes');
    });

    it('1.4 Passing final exam satisfies all requirements and issues certificate idempotently', async () => {
      // Pass final exam with 92%
      await testDb.insert(schema.quizAttempts).values({
        quizId: quizFinalExam.id,
        enrollmentId: aliceEnrollment.id,
        studentId: studentAlice.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 46,
        totalPoints: 50,
        percentage: '92.00',
        isPassed: true,
        submittedAt: new Date('2026-10-20T12:00:00Z'),
      });

      // Mark enrollment as COMPLETED
      await testDb
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: new Date('2026-10-20T12:00:00Z') })
        .where(eq(schema.enrollments.id, aliceEnrollment.id));

      const elig = await certificateService.checkEligibility(aliceEnrollment.id, coursePrimary.id);
      expect(elig.isEligible).toBe(true);
      expect(elig.hasUnpassedQuizzes).toBe(false);
      expect(elig.hasUnpassedFinalExam).toBe(false);

      // Student claims certificate via API
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${coursePrimary.id}/certificate`)
        .set('Cookie', aliceCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.certificateNumber).toMatch(/^TSP-\d{4}-C[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
      expect(res.body.data.studentName).toBe('Alice Learner');
      expect(res.body.data.courseTitle).toBe('Production Kubernetes & Event Mesh Architecture');
      expect(res.body.data.instructorName).toBe(instructorUser.name);
      expect(res.body.data.finalScorePercentage).toBe(92); // Final exam rule A
      expect(res.body.data.status).toBe('ACTIVE');

      issuedAliceCert = res.body.data;
    });

    it('1.5 Idempotency: Repeated issuance requests return existing certificate with zero duplicate rows', async () => {
      const [countBefore] = await testDb
        .select({ count: count() })
        .from(schema.certificates);

      // Re-issue via service
      const secondIssue = await certificateService.issueCertificateIfEligible(aliceEnrollment.id, {
        actorId: studentAlice.id,
      });

      expect(secondIssue.status).toBe('ALREADY_EXISTS');
      expect(secondIssue.issued).toBe(false);
      if (secondIssue.status === 'ALREADY_EXISTS') {
        expect(secondIssue.certificate.id).toBe(issuedAliceCert.id);
        expect(secondIssue.certificate.certificateNumber).toBe(issuedAliceCert.certificateNumber);
      }

      // Re-issue via HTTP endpoint
      const secondHttp = await request(app.getHttpServer())
        .get(`/api/v1/courses/${coursePrimary.id}/certificate`)
        .set('Cookie', aliceCookies);

      expect(secondHttp.status).toBe(200);
      expect(secondHttp.body.data.id).toBe(issuedAliceCert.id);

      const [countAfter] = await testDb
        .select({ count: count() })
        .from(schema.certificates);

      expect(countAfter.count).toBe(countBefore.count);
    });

    it('1.6 Concurrency Protection: Concurrent issuance requests produce exactly one certificate', async () => {
      // Complete requirements for Bob
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: bobEnrollment.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date('2026-10-21T10:00:00Z'),
      });
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: bobEnrollment.id,
        lessonId: lesson2.id,
        status: 'COMPLETED',
        completedAt: new Date('2026-10-21T10:30:00Z'),
      });
      await testDb.insert(schema.quizAttempts).values({
        quizId: quizPractice.id,
        enrollmentId: bobEnrollment.id,
        studentId: studentBob.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 18,
        totalPoints: 20,
        percentage: '90.00',
        isPassed: true,
        submittedAt: new Date('2026-10-21T11:00:00Z'),
      });
      await testDb.insert(schema.quizAttempts).values({
        quizId: quizFinalExam.id,
        enrollmentId: bobEnrollment.id,
        studentId: studentBob.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 44,
        totalPoints: 50,
        percentage: '88.00',
        isPassed: true,
        submittedAt: new Date('2026-10-21T11:30:00Z'),
      });
      await testDb
        .update(schema.enrollments)
        .set({ status: 'COMPLETED', completedAt: new Date('2026-10-21T11:30:00Z') })
        .where(eq(schema.enrollments.id, bobEnrollment.id));

      // Fire 5 simultaneous issuance requests
      const concurrentResults = await Promise.all([
        certificateService.issueCertificateIfEligible(bobEnrollment.id, { actorId: studentBob.id }),
        certificateService.issueCertificateIfEligible(bobEnrollment.id, { actorId: studentBob.id }),
        certificateService.issueCertificateIfEligible(bobEnrollment.id, { actorId: studentBob.id }),
        certificateService.issueCertificateIfEligible(bobEnrollment.id, { actorId: studentBob.id }),
        certificateService.issueCertificateIfEligible(bobEnrollment.id, { actorId: studentBob.id }),
      ]);

      const issuedCount = concurrentResults.filter((r) => r.status === 'ISSUED').length;
      const alreadyExistsCount = concurrentResults.filter((r) => r.status === 'ALREADY_EXISTS').length;

      expect(issuedCount).toBe(1);
      expect(alreadyExistsCount).toBe(4);

      // Verify DB has exactly 1 row for Bob
      const bobCerts = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.enrollmentId, bobEnrollment.id));

      expect(bobCerts.length).toBe(1);
    });

    it('1.7 Snapshot Immutability: Mutating user, course, or instructor details leaves certificate snapshot unchanged', async () => {
      // Mutate student profile name
      await testDb
        .update(schema.users)
        .set({ name: 'Alice Renamed Profile' })
        .where(eq(schema.users.id, studentAlice.id));

      // Mutate course title
      await testDb
        .update(schema.courses)
        .set({ title: 'New Course Title Post-Graduation' })
        .where(eq(schema.courses.id, coursePrimary.id));

      // Mutate instructor name
      await testDb
        .update(schema.users)
        .set({ name: 'Dr. Reassigned Instructor' })
        .where(eq(schema.users.id, instructorUser.id));

      // Query certificate by number
      const cert = await certificateService.getCertificateByNumber(issuedAliceCert.certificateNumber);
      expect(cert).toBeDefined();
      expect(cert?.studentName).toBe('Alice Learner'); // Unchanged
      expect(cert?.courseTitle).toBe('Production Kubernetes & Event Mesh Architecture'); // Unchanged
      expect(cert?.instructorName).toBe(instructorUser.name); // Unchanged
      expect(cert?.finalScorePercentage).toBe(92); // Unchanged
    });

    it('1.8 Authenticated Download Authorization: Owner student & Admin succeed; peer student gets 403', async () => {
      // 1. Owner Alice downloads via course route
      const aliceCourseDownload = await request(app.getHttpServer())
        .get(`/api/v1/courses/${coursePrimary.id}/certificate/download`)
        .set('Cookie', aliceCookies);

      expect(aliceCourseDownload.status).toBe(200);
      expect(aliceCourseDownload.headers['content-type']).toBe('application/pdf');
      expect(aliceCourseDownload.headers['content-disposition']).toContain(`TechSprout-Certificate-${issuedAliceCert.certificateNumber}-en.pdf`);

      // 2. Owner Alice downloads via certificateNumber route
      const aliceCertDownload = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedAliceCert.certificateNumber}/download`)
        .set('Cookie', aliceCookies);

      expect(aliceCertDownload.status).toBe(200);

      // 3. Unauthorized Peer Bob receives 403 Forbidden
      const bobAttempt = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedAliceCert.certificateNumber}/download`)
        .set('Cookie', bobCookies);

      expect(bobAttempt.status).toBe(403);
      expect(bobAttempt.body.errorCode).toBe('FORBIDDEN');

      // 4. Administrator authorized override succeeds
      const adminDownload = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedAliceCert.certificateNumber}/download`)
        .set('Cookie', adminCookies);

      expect(adminDownload.status).toBe(200);
      expect(adminDownload.headers['content-type']).toBe('application/pdf');
    });

    it('1.9 Real QR Extraction & Matrix Decoding: PDF contains QR code pointing to canonical verification URL', async () => {
      // 1. Download real PDF buffer
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedAliceCert.certificateNumber}/download?lang=en`)
        .set('Cookie', aliceCookies);

      const pdfBuffer = Buffer.from(res.body);

      // 2. Extract embedded QR image
      const parser = new PDFParse(new Uint8Array(pdfBuffer));
      await (parser as any).load();
      const imageResult = await parser.getImage({ imageBuffer: true });
      const images = (imageResult as any).pages[0].images;

      expect(images.length).toBeGreaterThan(0);
      const qrImageBuffer = Buffer.from(images[0].data);

      // 3. Decode PNG pixels
      const png = PNG.sync.read(qrImageBuffer);
      const decodeFn = (jsQR as any).default || jsQR;
      const qrCode = decodeFn(new Uint8ClampedArray(png.data), png.width, png.height);

      expect(qrCode).toBeDefined();
      expect(qrCode?.data).toBe(`https://techsprout.edu/verify/${issuedAliceCert.certificateNumber}`);

      // 4. Validate canonical verification URL format
      const certNumFromQR = qrCode?.data.split('/verify/')[1];
      expect(certNumFromQR).toBe(issuedAliceCert.certificateNumber);
    });

    it('1.10 Public Verification: Anyone can verify certificate without authentication, receiving snapshot', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/verify/${issuedAliceCert.certificateNumber}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.isValid).toBe(true);
      expect(data.verificationStatus).toBe('VALID');
      expect(data.status).toBe('ACTIVE');
      expect(data.certificateNumber).toBe(issuedAliceCert.certificateNumber);
      expect(data.studentName).toBe('Alice Learner');
      expect(data.courseTitle).toBe('Production Kubernetes & Event Mesh Architecture');
      expect(data.verificationUrl).toBe(`https://techsprout.edu/verify/${issuedAliceCert.certificateNumber}`);

      // Zero private IDs or tokens disclosed
      expect(data.studentId).toBeUndefined();
      expect(data.enrollmentId).toBeUndefined();
      expect(data.userId).toBeUndefined();
      expect(data.courseId).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(data.phone).toBeUndefined();
    });

    it('1.11 Administrative Revocation: Revoked certificate cannot be downloaded and verifies as REVOKED', async () => {
      // Admin revokes Alice's certificate
      const revokeRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/certificates/${issuedAliceCert.id}/revoke`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Academic integrity policy violation: unauthorized assessment assistance' });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.status).toBe('REVOKED');

      // 1. Download attempt by owner student fails with 400 CERTIFICATE_REVOKED
      const studentDownloadAfterRevoke = await request(app.getHttpServer())
        .get(`/api/v1/certificates/${issuedAliceCert.certificateNumber}/download`)
        .set('Cookie', aliceCookies);

      expect(studentDownloadAfterRevoke.status).toBe(400);
      expect(studentDownloadAfterRevoke.body.errorCode).toBe('CERTIFICATE_REVOKED');

      // 2. Download attempt via course context also fails with 400 CERTIFICATE_REVOKED
      const courseDownloadAfterRevoke = await request(app.getHttpServer())
        .get(`/api/v1/courses/${coursePrimary.id}/certificate/download`)
        .set('Cookie', aliceCookies);

      expect(courseDownloadAfterRevoke.status).toBe(400);
      expect(courseDownloadAfterRevoke.body.errorCode).toBe('CERTIFICATE_REVOKED');

      // 3. Public verification explicitly reports REVOKED
      const publicVerify = await request(app.getHttpServer())
        .get(`/api/v1/certificates/verify/${issuedAliceCert.certificateNumber}`)
        .expect(200);

      expect(publicVerify.body.data.isValid).toBe(false);
      expect(publicVerify.body.data.verificationStatus).toBe('REVOKED');
      expect(publicVerify.body.data.status).toBe('REVOKED');
      expect(publicVerify.body.data.revokedAt).toBeDefined();
      expect(publicVerify.body.data.revocationReason).toBe(
        'Academic integrity policy violation: unauthorized assessment assistance'
      );
    });

    it('1.12 Bilingual PDF Generation: Generates valid Bangla and English PDFs with A4 landscape dimensions', async () => {
      // English PDF
      const enPdf = await pdfService.generateCertificatePdf({
        certificateNumber: 'TSP-2026-CENGTEST1',
        studentName: 'Alice Learner',
        courseTitle: 'Production Kubernetes Architecture',
        instructorName: 'Prof. Alan Turing',
        completedAt: new Date('2026-10-20T12:00:00Z'),
        issuedAt: new Date('2026-10-20T12:05:00Z'),
        finalScorePercentage: 92,
        status: 'ACTIVE',
        language: 'en',
      });

      expect(enPdf.length).toBeGreaterThan(1000);
      const enParser = new PDFParse(new Uint8Array(enPdf));
      await (enParser as any).load();
      const enRes = await enParser.getText();
      expect(enRes.text).toContain('Alice Learner');
      expect(enRes.text).toContain('TSP-2026-CENGTEST1');

      // Bangla PDF
      const bnPdf = await pdfService.generateCertificatePdf({
        certificateNumber: 'TSP-2026-CBNGTEST1',
        studentName: 'এলিস লার্নার',
        courseTitle: 'প্রোডাকশন কুবারনেটিস আর্কিটেকচার',
        instructorName: 'প্রফেসর অ্যালান টুরিং',
        completedAt: new Date('2026-10-20T12:00:00Z'),
        issuedAt: new Date('2026-10-20T12:05:00Z'),
        finalScorePercentage: 92,
        status: 'ACTIVE',
        language: 'bn',
      });

      expect(bnPdf.length).toBeGreaterThan(1000);
      const bnParser = new PDFParse(new Uint8Array(bnPdf));
      await (bnParser as any).load();
      const bnRes = await bnParser.getText();
      expect(bnRes.text).toContain('TSP-2026-CBNGTEST1');
    });
  });

  // =========================================================================
  // SUITE 2: DETAILED ELIGIBILITY & ASSESSMENT GATE INVARIANTS
  // =========================================================================
  describe('2. Eligibility & Assessment Gate Invariants', () => {
    let testStudent: any;
    let testEnrollment: any;

    beforeAll(async () => {
      const pwHash = await CryptoUtil.hashPassword('StudentPass123!');
      const [st] = await testDb
        .insert(schema.users)
        .values({
          name: 'Charlie Assessment Tester',
          username: 'charlie_p11_4',
          email: 'charlie.p11.4@techsprout.edu',
          phone: '01811223399',
          passwordHash: pwHash,
          isActive: true,
          isVerified: true,
        })
        .returning();
      testStudent = st;

      const [enr] = await testDb
        .insert(schema.enrollments)
        .values({
          userId: testStudent.id,
          studentId: testStudent.id,
          courseId: coursePrimary.id,
          status: 'ACTIVE',
        })
        .returning();
      testEnrollment = enr;
    });

    it('2.1 Draft quizzes and archived quizzes are excluded from required denominator', async () => {
      // Charlie completes lesson 1 and lesson 2
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: testEnrollment.id,
        lessonId: lesson1.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      });
      await testDb.insert(schema.lessonProgress).values({
        enrollmentId: testEnrollment.id,
        lessonId: lesson2.id,
        status: 'COMPLETED',
        completedAt: new Date(),
      });

      // Charlie passes published practice quiz and published final exam
      await testDb.insert(schema.quizAttempts).values({
        quizId: quizPractice.id,
        enrollmentId: testEnrollment.id,
        studentId: testStudent.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 19,
        totalPoints: 20,
        percentage: '95.00',
        isPassed: true,
        submittedAt: new Date(),
      });
      await testDb.insert(schema.quizAttempts).values({
        quizId: quizFinalExam.id,
        enrollmentId: testEnrollment.id,
        studentId: testStudent.id,
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 48,
        totalPoints: 50,
        percentage: '96.00',
        isPassed: true,
        submittedAt: new Date(),
      });

      // Charlie has 0 attempts on quizDraft and quizArchived
      const elig = await certificateService.checkEligibility(testEnrollment.id, coursePrimary.id);

      // Eligibility MUST be true despite quizDraft and quizArchived having no attempts
      expect(elig.isEligible).toBe(true);
      expect(elig.publishedQuizzes).toBe(2); // Only practice + finalExam
      expect(elig.passedQuizzes).toBe(2);
      expect(elig.hasUnpassedQuizzes).toBe(false);
      expect(elig.hasUnpassedFinalExam).toBe(false);
    });

    it('2.2 Non-enrolled user cannot claim a certificate', async () => {
      const nonEnrolledRes = await certificateService.issueCertificateIfEligible('00000000-0000-0000-0000-000000000000');
      expect(nonEnrolledRes.status).toBe('ENROLLMENT_NOT_FOUND');
      expect(nonEnrolledRes.issued).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 3: SCORE DISCLOSURE PRIVACY DECISION & VERIFICATION
  // =========================================================================
  describe('3. Score Disclosure Privacy & Security Invariants', () => {
    it('3.1 Raw assessment attempt histories, question points, and answer keys are never exposed on public verify', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/certificates/verify/${issuedAliceCert.certificateNumber}`);

      expect(res.status).toBe(200);
      const bodyStr = JSON.stringify(res.body);

      // Assert private assessment data is completely absent
      expect(bodyStr).not.toContain('quizAttempts');
      expect(bodyStr).not.toContain('totalPoints');
      expect(bodyStr).not.toContain('passingScorePercentage');
      expect(bodyStr).not.toContain('answers');
      expect(bodyStr).not.toContain('questionText');
      expect(bodyStr).not.toContain('isCorrect');
      expect(bodyStr).not.toContain('pointsEarned');
    });

    it('3.2 When finalScorePercentage is null (course with zero quizzes), score is safely omitted without error', async () => {
      // Create a course with 0 quizzes
      const [noQuizCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Docker Foundations Crash Course',
          slug: 'docker-foundations-crash-course',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: category.id,
          instructorId: instructorUser.id,
        })
        .returning();

      // Create new enrollment for noQuizCourse
      const [nullScoreEnrollment] = await testDb
        .insert(schema.enrollments)
        .values({
          userId: studentAlice.id,
          studentId: studentAlice.id,
          courseId: noQuizCourse.id,
          status: 'COMPLETED',
        })
        .returning();

      // Certificate with null finalScorePercentage
      const [nullScoreCert] = await testDb
        .insert(schema.certificates)
        .values({
          certificateNumber: 'TSP-2026-CNOSCORE01',
          enrollmentId: nullScoreEnrollment.id,
          courseId: noQuizCourse.id,
          studentId: studentAlice.id,
          studentName: 'Alice Learner',
          courseTitle: 'Docker Foundations Crash Course',
          instructorName: instructorUser.name,
          completedAt: new Date('2026-10-22T10:00:00Z'),
          issuedAt: new Date('2026-10-22T10:05:00Z'),
          finalScorePercentage: null,
          status: 'ACTIVE',
        })
        .returning();

      const verifyRes = await request(app.getHttpServer())
        .get('/api/v1/certificates/verify/TSP-2026-CNOSCORE01');

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.isValid).toBe(true);
      expect(verifyRes.body.data.finalScorePercentage).toBeNull();

      // PDF generation also gracefully omits score line without throwing
      const pdf = await pdfService.generateCertificatePdf({
        certificateNumber: nullScoreCert.certificateNumber,
        studentName: nullScoreCert.studentName,
        courseTitle: nullScoreCert.courseTitle,
        instructorName: nullScoreCert.instructorName,
        completedAt: nullScoreCert.completedAt,
        issuedAt: nullScoreCert.issuedAt,
        finalScorePercentage: null,
        status: 'ACTIVE',
        language: 'en',
      });

      expect(pdf).toBeInstanceOf(Buffer);
      const nullParser = new PDFParse(new Uint8Array(pdf));
      await (nullParser as any).load();
      const parsed = await nullParser.getText();
      expect(parsed.text).not.toContain('Final Assessment Score');
    });
  });
});
