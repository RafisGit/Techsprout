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
import { CloudinaryService } from '../modules/media/cloudinary/cloudinary.service';

describe('P6.2 — WP-06: Instructor Profile Management & Catalog Bio API Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  let adminCookies: string[];
  let instructor1Cookies: string[];
  let instructor2Cookies: string[];
  let studentCookies: string[];

  let adminId: string;
  let instructor1Id: string;
  let instructor2Id: string;
  let studentId: string;

  let categoryId: string;
  let inst1MediaId: string;
  let inst2MediaId: string;
  let courseWithProfileSlug: string;
  let courseWithoutProfileSlug: string;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    env.CLOUDINARY_API_KEY = 'test-api-key';
    env.CLOUDINARY_API_SECRET = 'test-api-secret-12345';

    // 1. Roles
    const [instructorRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'instructor'))
      .limit(1);

    // 2. Users
    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'));
    adminId = adminUser.id;

    const [inst1User] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'instructor@techsprout.edu'));
    instructor1Id = inst1User.id;

    const inst2PassHash = await CryptoUtil.hashPassword('Instructor2Password123!');
    const [inst2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Prof. Sabiha Khatun',
        username: 'prof_sabiha',
        email: 'sabiha@techsprout.edu',
        phone: '01811223344',
        passwordHash: inst2PassHash,
        isVerified: true,
      })
      .returning();
    instructor2Id = inst2.id;
    await testDb.insert(schema.userRoles).values({
      userId: instructor2Id,
      roleId: instructorRole.id,
    });

    const [stdUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentId = stdUser.id;

    // 3. Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Computer Architecture & Systems',
        slug: 'comp-arch-systems-wp06',
        description: 'Systems and computing curriculum',
        isActive: true,
      })
      .returning();
    categoryId = cat.id;

    // 4. Media owned by Instructor 1 and Instructor 2
    const [m1] = await testDb
      .insert(schema.media)
      .values({
        storageProvider: 'CLOUDINARY',
        storageKey: 'techsprout/avatars/inst1-avatar',
        publicUrl: 'https://res.cloudinary.com/test/avatars/inst1-avatar.jpg',
        originalFilename: 'inst1-avatar.jpg',
        mimeType: 'image/jpeg',
        fileSize: 120400,
        uploaderId: instructor1Id,
      })
      .returning();
    inst1MediaId = m1.id;

    const [m2] = await testDb
      .insert(schema.media)
      .values({
        storageProvider: 'CLOUDINARY',
        storageKey: 'techsprout/avatars/inst2-avatar',
        publicUrl: 'https://res.cloudinary.com/test/avatars/inst2-avatar.jpg',
        originalFilename: 'inst2-avatar.jpg',
        mimeType: 'image/jpeg',
        fileSize: 130500,
        uploaderId: instructor2Id,
      })
      .returning();
    inst2MediaId = m2.id;

    // 5. Seed published courses (one owned by inst1, one owned by inst2 without profile)
    courseWithProfileSlug = 'modern-computer-architecture-wp06';
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Modern Computer Architecture',
        slug: courseWithProfileSlug,
        shortDescription: 'Master instruction sets and pipelining.',
        description: 'Comprehensive graduate course on computer systems.',
        instructorId: instructor1Id,
        categoryId: categoryId,
        thumbnailMediaId: inst1MediaId,
        price: '4500.00',
        currency: 'BDT',
        level: 'ADVANCED',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      })
      .returning();

    courseWithoutProfileSlug = 'distributed-systems-no-bio-wp06';
    await testDb
      .insert(schema.courses)
      .values({
        title: 'Distributed Systems Without Bio',
        slug: courseWithoutProfileSlug,
        shortDescription: 'Consensus, replication, and fault tolerance.',
        description: 'In-depth distributed systems course.',
        instructorId: instructor2Id,
        categoryId: categoryId,
        thumbnailMediaId: inst2MediaId,
        price: '5000.00',
        currency: 'BDT',
        level: 'INTERMEDIATE',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      })
      .returning();

    // 6. Testing module compilation
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
      .overrideProvider(CloudinaryService)
      .useValue({
        isConfigured: () => true,
        uploadStream: async () => ({
          public_id: 'techsprout/mock',
          secure_url: 'https://res.cloudinary.com/test/mock.png',
        }),
        destroy: async () => ({ result: 'ok' }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    // 7. Authenticate users
    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];

    const inst1Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructor1Cookies = inst1Login.headers['set-cookie'] as unknown as string[];

    const inst2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'sabiha@techsprout.edu',
      password: 'Instructor2Password123!',
    });
    instructor2Cookies = inst2Login.headers['set-cookie'] as unknown as string[];

    const stdLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = stdLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Authentication & Role Gate Enforcement', () => {
    it('rejects unauthenticated GET /api/v1/instructor/profile with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/instructor/profile');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('rejects student GET /api/v1/instructor/profile with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/profile')
        .set('Cookie', studentCookies);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('rejects unauthenticated PUT /api/v1/instructor/profile with 401', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .send({ headline: 'Staff Engineer' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('rejects student PUT /api/v1/instructor/profile with 403', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', studentCookies)
        .send({ headline: 'Staff Engineer' });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });
  });

  describe('2. Initial State & Profile Lifecycle', () => {
    it('returns data: null when instructor has no profile record yet', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('creates profile on first PUT when none exists', async () => {
      const payload = {
        headline: 'Principal Systems Architect & Professor',
        bio: 'Dr. Tariq is a veteran systems architect with 15+ years researching high-throughput computing architectures and distributed protocols.',
        credentials: 'Ph.D. in Computer Engineering, Stanford University',
        expertiseAreas: ['Computer Architecture', 'RISC-V', 'Distributed Systems'],
        websiteUrl: 'https://techsprout.edu/faculty/tariq',
        linkedinUrl: 'https://linkedin.com/in/tariq-architect',
        githubUrl: 'https://github.com/tariq-systems',
        avatarMediaId: inst1MediaId,
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.headline).toBe(payload.headline);
      expect(res.body.data.bio).toBe(payload.bio);
      expect(res.body.data.credentials).toBe(payload.credentials);
      expect(res.body.data.expertiseAreas).toEqual(payload.expertiseAreas);
      expect(res.body.data.websiteUrl).toBe(payload.websiteUrl);
      expect(res.body.data.linkedinUrl).toBe(payload.linkedinUrl);
      expect(res.body.data.githubUrl).toBe(payload.githubUrl);
      expect(res.body.data.avatarMediaId).toBe(inst1MediaId);
      expect(res.body.data.avatarUrl).toBe('https://res.cloudinary.com/test/avatars/inst1-avatar.jpg');
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.id).toBe(instructor1Id);
    });

    it('subsequent GET /api/v1/instructor/profile returns populated profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.headline).toBe('Principal Systems Architect & Professor');
      expect(res.body.data.expertiseAreas).toEqual(['Computer Architecture', 'RISC-V', 'Distributed Systems']);
      expect(res.body.data.avatarUrl).toBe('https://res.cloudinary.com/test/avatars/inst1-avatar.jpg');
    });

    it('subsequent PUT updates existing profile idempotently without creating duplicates', async () => {
      const updatePayload = {
        headline: 'Lead Systems Engineer & Visiting Faculty',
        bio: 'Updated bio with additional publications.',
        expertiseAreas: ['FPGA Design', 'Computer Architecture', 'Verilog'],
      };

      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.headline).toBe('Lead Systems Engineer & Visiting Faculty');
      expect(res.body.data.bio).toBe('Updated bio with additional publications.');
      expect(res.body.data.expertiseAreas).toEqual(['FPGA Design', 'Computer Architecture', 'Verilog']);
      // Unspecified fields should retain previous values
      expect(res.body.data.websiteUrl).toBe('https://techsprout.edu/faculty/tariq');
      expect(res.body.data.avatarMediaId).toBe(inst1MediaId);

      // Verify only 1 row exists in DB for this user
      const rows = await testDb
        .select()
        .from(schema.instructorProfiles)
        .where(eq(schema.instructorProfiles.userId, instructor1Id));
      expect(rows.length).toBe(1);
    });

    it('POST /api/v1/instructor/profile acts as an alias to PUT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ headline: 'Staff Infrastructure Fellow' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.headline).toBe('Staff Infrastructure Fellow');
    });
  });

  describe('3. Validation Pipeline & Bounds Enforcement', () => {
    it('rejects headline exceeding 150 characters with 400', async () => {
      const longHeadline = 'A'.repeat(151);
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ headline: longHeadline });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('rejects bio exceeding 2000 characters with 400', async () => {
      const longBio = 'B'.repeat(2001);
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ bio: longBio });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('rejects credentials exceeding 500 characters with 400', async () => {
      const longCreds = 'C'.repeat(501);
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ credentials: longCreds });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid URL syntax for website, linkedin, or github', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ websiteUrl: 'invalid-not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('allows clearing URLs with empty string or null', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ websiteUrl: '', githubUrl: null });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.websiteUrl).toBeNull();
      expect(res.body.data.githubUrl).toBeNull();
    });
  });

  describe('4. Media Ownership & IDOR Security Checks', () => {
    it('rejects non-existent avatarMediaId with 400', async () => {
      const fakeMediaId = '00000000-0000-0000-0000-000000009999';
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ avatarMediaId: fakeMediaId });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('MEDIA_NOT_FOUND');
    });

    it('rejects avatarMediaId owned by another instructor (IDOR prevention)', async () => {
      // Instructor 1 attempts to claim Instructor 2's media asset
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ avatarMediaId: inst2MediaId });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('MEDIA_OWNERSHIP_DENIED');
    });

    it('allows unlinking avatar by setting avatarMediaId to null', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ avatarMediaId: null });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatarMediaId).toBeNull();
      expect(res.body.data.avatarUrl).toBeNull();
    });

    it('re-attaching owned media asset succeeds', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/instructor/profile')
        .set('Cookie', instructor1Cookies)
        .send({ avatarMediaId: inst1MediaId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatarMediaId).toBe(inst1MediaId);
      expect(res.body.data.avatarUrl).toBe('https://res.cloudinary.com/test/avatars/inst1-avatar.jpg');
    });
  });

  describe('5. Public Course Catalog Bio Projection & Privacy Safeguards', () => {
    it('public course endpoint GET /api/v1/courses/:slug projects instructor profile info', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseWithProfileSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const course = res.body.data;
      expect(course).toBeDefined();

      const instructor = course.instructor;
      expect(instructor).toBeDefined();
      expect(instructor.id).toBe(instructor1Id);
      expect(instructor.name).toBe('Dr. Sarah Mitchell');
      expect(instructor.headline).toBe('Staff Infrastructure Fellow');
      expect(instructor.bio).toBeDefined();
      expect(instructor.expertiseAreas).toEqual(['FPGA Design', 'Computer Architecture', 'Verilog']);
      expect(instructor.avatarUrl).toBe('https://res.cloudinary.com/test/avatars/inst1-avatar.jpg');

      // CRITICAL PRIVACY CHECKS:
      // Sensitive fields must NEVER be projected to anonymous public catalog consumers
      expect(instructor.email).toBeUndefined();
      expect(instructor.passwordHash).toBeUndefined();
      expect(instructor.role).toBeUndefined();
      expect(instructor.avatarMediaId).toBeUndefined();
      expect(course.instructorId).toBeUndefined();
    });

    it('public course endpoint degrades gracefully when instructor has no profile', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseWithoutProfileSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const course = res.body.data;

      const instructor = course.instructor;
      expect(instructor).toBeDefined();
      expect(instructor.id).toBe(instructor2Id);
      expect(instructor.name).toBe('Prof. Sabiha Khatun');
      expect(instructor.headline).toBeNull();
      expect(instructor.bio).toBeNull();
      expect(instructor.credentials).toBeNull();
      expect(instructor.expertiseAreas).toEqual([]);
      expect(instructor.avatarUrl).toBeNull();
      expect(instructor.websiteUrl).toBeNull();

      // Privacy checks
      expect(instructor.email).toBeUndefined();
      expect(instructor.passwordHash).toBeUndefined();
      expect(instructor.role).toBeUndefined();
    });
  });
});
