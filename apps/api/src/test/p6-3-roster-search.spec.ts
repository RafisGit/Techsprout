import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase, extractCookies } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { EnrollmentsService } from '../modules/enrollments/enrollments.service';

describe('P6.3 — WP-03: Server-Side Learner Roster Search & Query Optimization (DEF-P6.2-UX-01)', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let enrollmentsService: EnrollmentsService;

  let adminCookies: string[];
  let instructor1Cookies: string[];
  let instructor2Cookies: string[];
  let studentCookies: string[];

  let adminId: string;
  let instructor1Id: string;
  let instructor2Id: string;
  let studentId: string;

  let testCourseId: string; // Owned by instructor 1
  let unownedCourseId: string; // Owned by instructor 2
  let emptyCourseId: string; // Owned by instructor 1, no learners

  let module1Id: string;
  let lesson1Id: string;
  let lesson2Id: string;

  const createdStudentIds: string[] = [];
  const createdEnrollmentIds: string[] = [];

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // 1. Fetch seed users
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

    const [studentUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    studentId = studentUser.id;

    // 2. Create Instructor 2 for IDOR testing
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

    const passwordHash2 = await CryptoUtil.hashPassword('Instructor2Password123!');
    const [inst2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Prof. Alan Turing',
        username: 'instructor_turing',
        email: 'turing@techsprout.edu',
        passwordHash: passwordHash2,
        isVerified: true,
      })
      .returning();
    instructor2Id = inst2.id;

    await testDb.insert(schema.userRoles).values({
      userId: instructor2Id,
      roleId: instructorRole.id,
    });

    // 3. Category
    const [category] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Systems Programming',
        slug: 'systems-programming',
        description: 'Low-level systems and distributed computing',
      })
      .returning();

    // 4. Create Test Course 1 (Instructor 1)
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Distributed Systems Mastery',
        slug: 'distributed-systems-mastery',
        description: 'Consensus protocols, Raft, Paxos, and Vector Clocks',
        instructorId: instructor1Id,
        categoryId: category.id,
        status: 'PUBLISHED',
        price: '4500.00',
        currency: 'BDT',
      })
      .returning();
    testCourseId = c1.id;

    // 5. Create Test Course 2 (Instructor 2)
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Quantum Cryptography',
        slug: 'quantum-cryptography',
        description: 'Post-quantum key exchange and BB84 protocol',
        instructorId: instructor2Id,
        categoryId: category.id,
        status: 'PUBLISHED',
        price: '6000.00',
        currency: 'BDT',
      })
      .returning();
    unownedCourseId = c2.id;

    // 6. Create Empty Course (Instructor 1)
    const [cEmpty] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Empty Course Demo',
        slug: 'empty-course-demo',
        description: 'A course with zero enrollments',
        instructorId: instructor1Id,
        categoryId: category.id,
        status: 'PUBLISHED',
        price: '1000.00',
        currency: 'BDT',
      })
      .returning();
    emptyCourseId = cEmpty.id;

    // 7. Add Module & Lessons to Course 1 (2 lessons total)
    const [m1] = await testDb
      .insert(schema.modules)
      .values({
        courseId: testCourseId,
        title: 'Module 1: Consensus Fundamentals',
        position: 1,
      })
      .returning();
    module1Id = m1.id;

    const [l1] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1Id,
        title: 'Lesson 1.1: Raft Protocol Leadership',
        position: 1,
        lessonType: 'VIDEO',
      })
      .returning();
    lesson1Id = l1.id;

    const [l2] = await testDb
      .insert(schema.lessons)
      .values({
        moduleId: module1Id,
        title: 'Lesson 1.2: Log Replication and Compaction',
        position: 2,
        lessonType: 'VIDEO',
      })
      .returning();
    lesson2Id = l2.id;

    // 8. Create a diverse cohort of 25 enrolled students for Course 1
    // Specific students with known names, emails, statuses, and progress:
    interface CohortStudentDef {
      name: string;
      username: string;
      email: string;
      status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      completedLessons: number;
      daysAgo: number;
      accessedDaysAgo: number | null;
    }
    const cohortDefinitions: CohortStudentDef[] = [
      {
        name: 'Alice Walker',
        username: 'alice_walker',
        email: 'alice.walker@example.com',
        status: 'ACTIVE' as const,
        completedLessons: 1, // 50%
        daysAgo: 10,
        accessedDaysAgo: 1,
      },
      {
        name: 'Bob Dylan',
        username: 'bob_dylan',
        email: 'bob.music@example.com',
        status: 'COMPLETED' as const,
        completedLessons: 2, // 100%
        daysAgo: 20,
        accessedDaysAgo: 5,
      },
      {
        name: 'Carol Danvers',
        username: 'carol_marvel',
        email: 'carol@cyberpunk.io',
        status: 'ACTIVE' as const,
        completedLessons: 0, // 0%
        daysAgo: 5,
        accessedDaysAgo: null,
      },
      {
        name: 'David Special_Char',
        username: 'david_special',
        email: 'david_user@wildcard.org',
        status: 'ACTIVE' as const,
        completedLessons: 1, // 50%
        daysAgo: 15,
        accessedDaysAgo: 2,
      },
      {
        name: 'Emma Percent%Name',
        username: 'emma_percent',
        email: 'emma%100@percent.com',
        status: 'ACTIVE' as const,
        completedLessons: 2, // 100%
        daysAgo: 8,
        accessedDaysAgo: 3,
      },
      {
        name: 'Frank Ocean',
        username: 'frank_ocean',
        email: 'frank@music.org',
        status: 'CANCELLED' as const,
        completedLessons: 0, // 0%
        daysAgo: 30,
        accessedDaysAgo: null,
      },
    ];

    // Add 19 more generic students to reach 25 learners for pagination testing
    for (let i = 7; i <= 25; i++) {
      cohortDefinitions.push({
        name: `Student Number ${i}`,
        username: `student_num_${i}`,
        email: `student_${i}@techsprout.edu`,
        status: i % 4 === 0 ? ('COMPLETED' as const) : ('ACTIVE' as const),
        completedLessons: i % 2 === 0 ? 2 : 1,
        daysAgo: 40 - i,
        accessedDaysAgo: i % 3 === 0 ? null : i,
      });
    }

    const defaultPasswordHash = await CryptoUtil.hashPassword('CohortPassword123!');

    for (const def of cohortDefinitions) {
      const [u] = await testDb
        .insert(schema.users)
        .values({
          name: def.name,
          username: def.username,
          email: def.email,
          passwordHash: defaultPasswordHash,
          isVerified: true,
        })
        .returning();
      createdStudentIds.push(u.id);

      await testDb.insert(schema.userRoles).values({
        userId: u.id,
        roleId: studentRole.id,
      });

      const enrolledAtDate = new Date(Date.now() - def.daysAgo * 86400000);
      const completedAtDate = def.status === 'COMPLETED' ? new Date(Date.now() - 86400000) : null;
      const lastAccessedAtDate =
        def.accessedDaysAgo !== null
          ? new Date(Date.now() - def.accessedDaysAgo * 86400000)
          : null;

      const [enr] = await testDb
        .insert(schema.enrollments)
        .values({
          studentId: u.id,
          courseId: testCourseId,
          status: def.status,
          enrolledAt: enrolledAtDate,
          completedAt: completedAtDate,
          lastAccessedAt: lastAccessedAtDate,
        })
        .returning();
      createdEnrollmentIds.push(enr.id);

      // Add lesson progress
      if (def.completedLessons >= 1) {
        await testDb.insert(schema.lessonProgress).values({
          enrollmentId: enr.id,
          lessonId: lesson1Id,
          status: 'COMPLETED',
          completedAt: new Date(),
        });
      }
      if (def.completedLessons >= 2) {
        await testDb.insert(schema.lessonProgress).values({
          enrollmentId: enr.id,
          lessonId: lesson2Id,
          status: 'COMPLETED',
          completedAt: new Date(),
        });
      }
    }

    // 9. Initialize Nest application
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ db: testDb, pool: testPool })
      .overrideProvider(DRIZZLE_DB)
      .useValue(testDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    enrollmentsService = moduleRef.get<EnrollmentsService>(EnrollmentsService);

    // 10. Login users to obtain session cookies
    const adminRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = extractCookies(adminRes.headers);

    const inst1Res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'instructor@techsprout.edu',
      password: 'InstructorPassword123!',
    });
    instructor1Cookies = extractCookies(inst1Res.headers);

    const inst2Res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'turing@techsprout.edu',
      password: 'Instructor2Password123!',
    });
    instructor2Cookies = extractCookies(inst2Res.headers);

    const studentRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = extractCookies(studentRes.headers);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // 1. ACCESS CONTROL & ROLE AUTHORIZATION TESTS
  // =========================================================================
  describe('1. Role Authorization and IDOR Defense', () => {
    it('1.1 should allow authorized course instructor to view their own course roster', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(testCourseId);
      expect(res.body.data.totalEnrolled).toBe(25);
      expect(res.body.data.items.length).toBe(10); // Default page limit 10
    });

    it('1.2 should deny cross-instructor access with 403 FORBIDDEN (IDOR defense)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments`)
        .set('Cookie', instructor2Cookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.3 should allow administrator to access roster for any course', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(testCourseId);
      expect(res.body.data.totalEnrolled).toBe(25);
    });

    it('1.4 should deny student access with 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
    });

    it('1.5 should deny unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/admin/courses/${testCourseId}/enrollments`
      );

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('1.6 should reject invalid course UUID with 400 INVALID_ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/courses/not-a-valid-uuid/enrollments')
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_ID');
    });

    it('1.7 should return 404 for non-existent course UUID', async () => {
      const randomUuid = '00000000-0000-0000-0000-000000000999';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${randomUuid}/enrollments`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('COURSE_NOT_FOUND');
    });
  });

  // =========================================================================
  // 2. SERVER-SIDE CASE-INSENSITIVE SEARCH TESTS
  // =========================================================================
  describe('2. Server-Side Case-Insensitive Search', () => {
    it('2.1 should match learner by name substring (case-insensitive: "alice")', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=alice`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].student.name).toBe('Alice Walker');
      expect(res.body.data.totalEnrolled).toBe(25); // Preserves total enrolled count
    });

    it('2.2 should match learner by name uppercase ("ALICE")', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=ALICE`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.items[0].student.name).toBe('Alice Walker');
    });

    it('2.3 should match learner by email substring ("CYBERPUNK")', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=CYBERPUNK`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.items[0].student.name).toBe('Carol Danvers');
      expect(res.body.data.items[0].student.email).toBe('carol@cyberpunk.io');
    });

    it('2.4 should handle empty or whitespace search by returning all results without filter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=%20%20%20`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(25);
      expect(res.body.data.items.length).toBe(10);
    });

    it('2.5 should return empty items array for unmatched search while maintaining totalEnrolled', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=NonExistentLearnerXYZ`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(0);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.pagination.totalPages).toBe(1);
      expect(res.body.data.totalEnrolled).toBe(25);
    });

    it('2.6 should safely handle SQL wildcard characters (% and _) as literal search characters', async () => {
      // Search for literal underscore "_" in "David Special_Char"
      const resUnderscore = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=_Char`)
        .set('Cookie', instructor1Cookies);

      expect(resUnderscore.status).toBe(200);
      expect(resUnderscore.body.data.pagination.total).toBe(1);
      expect(resUnderscore.body.data.items[0].student.name).toBe('David Special_Char');

      // Search for literal percent "%" in "Emma Percent%Name"
      const resPercent = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=%25Name`)
        .set('Cookie', instructor1Cookies);

      expect(resPercent.status).toBe(200);
      expect(resPercent.body.data.pagination.total).toBe(1);
      expect(resPercent.body.data.items[0].student.name).toBe('Emma Percent%Name');
    });
  });

  // =========================================================================
  // 3. STATUS FILTERING & COMPOSITE QUERY INTERACTIONS
  // =========================================================================
  describe('3. Status Filtering & Composite Query Interactions', () => {
    it('3.1 should filter by status=COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?status=COMPLETED`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      for (const item of res.body.data.items) {
        expect(item.status).toBe('COMPLETED');
        expect(item.completedAt).not.toBeNull();
      }
    });

    it('3.2 should filter by status=ACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?status=ACTIVE`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      for (const item of res.body.data.items) {
        expect(item.status).toBe('ACTIVE');
      }
    });

    it('3.3 should combine search and status filter simultaneously', async () => {
      // Bob is COMPLETED, Alice is ACTIVE
      const resBobCompleted = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=dylan&status=COMPLETED`)
        .set('Cookie', instructor1Cookies);

      expect(resBobCompleted.status).toBe(200);
      expect(resBobCompleted.body.data.pagination.total).toBe(1);
      expect(resBobCompleted.body.data.items[0].student.name).toBe('Bob Dylan');

      // Searching Bob with status=ACTIVE should return 0 results
      const resBobActive = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=dylan&status=ACTIVE`)
        .set('Cookie', instructor1Cookies);

      expect(resBobActive.status).toBe(200);
      expect(resBobActive.body.data.pagination.total).toBe(0);
      expect(resBobActive.body.data.items.length).toBe(0);
    });
  });

  // =========================================================================
  // 4. DETERMINISTIC SORTING & STABLE PAGINATION
  // =========================================================================
  describe('4. Deterministic Sorting & Stable Pagination', () => {
    it('4.1 should sort by name in ascending alphabetical order with tie-breaker', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?sortBy=name&sortOrder=asc&limit=5`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(5);
      expect(items[0].student.name).toBe('Alice Walker');
      expect(items[1].student.name).toBe('Bob Dylan');
      expect(items[2].student.name).toBe('Carol Danvers');
    });

    it('4.2 should sort by name in descending alphabetical order', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?sortBy=name&sortOrder=desc&limit=5`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.length).toBe(5);
      // Student Number 9 should appear before Student Number 8 in desc
      expect(items[0].student.name >= items[1].student.name).toBe(true);
    });

    it('4.3 should sort by enrolledAt ascending', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?sortBy=enrolledAt&sortOrder=asc&limit=10`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      for (let i = 0; i < items.length - 1; i++) {
        const d1 = new Date(items[i].enrolledAt).getTime();
        const d2 = new Date(items[i + 1].enrolledAt).getTime();
        expect(d1).toBeLessThanOrEqual(d2);
      }
    });

    it('4.4 should sort by enrolledAt descending (default sort)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?sortBy=enrolledAt&sortOrder=desc&limit=10`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      for (let i = 0; i < items.length - 1; i++) {
        const d1 = new Date(items[i].enrolledAt).getTime();
        const d2 = new Date(items[i + 1].enrolledAt).getTime();
        expect(d1).toBeGreaterThanOrEqual(d2);
      }
    });

    it('4.5 should sort by progressPercentage descending', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?sortBy=progressPercentage&sortOrder=desc&limit=10`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items[0].progressPercentage).toBe(100);
      for (let i = 0; i < items.length - 1; i++) {
        expect(items[i].progressPercentage).toBeGreaterThanOrEqual(items[i + 1].progressPercentage);
      }
    });

    it('4.6 should preserve page boundaries without duplicate rows across pages (deterministic tie-breaker)', async () => {
      const page1Res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?page=1&limit=10&sortBy=enrolledAt&sortOrder=desc`)
        .set('Cookie', instructor1Cookies);

      const page2Res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?page=2&limit=10&sortBy=enrolledAt&sortOrder=desc`)
        .set('Cookie', instructor1Cookies);

      expect(page1Res.body.data.items.length).toBe(10);
      expect(page2Res.body.data.items.length).toBe(10);

      const page1Ids = new Set(page1Res.body.data.items.map((i: any) => i.enrollmentId));
      const page2Ids = new Set(page2Res.body.data.items.map((i: any) => i.enrollmentId));

      // Disjoint sets: no learner should appear on both page 1 and page 2
      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }
    });
  });

  // =========================================================================
  // 5. ACCURATE PROGRESS & INVARIANT VERIFICATION
  // =========================================================================
  describe('5. Accurate Progress Calculation and Invariants', () => {
    it('5.1 should accurately calculate progress percentage for learners with 0, 1, and 2 completed lessons', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?limit=25`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      const items = res.body.data.items;

      const alice = items.find((i: any) => i.student.name === 'Alice Walker');
      expect(alice).toBeDefined();
      expect(alice.progressPercentage).toBe(50); // 1 of 2 lessons = 50%
      expect(alice.completedAt).toBeNull();

      const bob = items.find((i: any) => i.student.name === 'Bob Dylan');
      expect(bob).toBeDefined();
      expect(bob.progressPercentage).toBe(100); // 2 of 2 lessons = 100%
      expect(bob.completedAt).not.toBeNull();

      const carol = items.find((i: any) => i.student.name === 'Carol Danvers');
      expect(carol).toBeDefined();
      expect(carol.progressPercentage).toBe(0); // 0 of 2 lessons = 0%
    });

    it('5.2 should handle empty courses with 0 enrollments safely without division by zero', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${emptyCourseId}/enrollments`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.totalEnrolled).toBe(0);
      expect(res.body.data.completedCount).toBe(0);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });
  });

  // =========================================================================
  // 6. ELIMINATION OF N+1 QUERY PATTERN: CONSTANT QUERY COUNT PROOF
  // =========================================================================
  describe('6. Elimination of N+1 Queries: Constant Database Query Count Proof', () => {
    it('6.1 should execute constant O(1) database queries regardless of roster size', async () => {
      // We will count queries by instrumenting the database pool
      let queryCount = 0;
      const originalQuery = testPool.query;

      testPool.query = function (...args: any[]) {
        queryCount++;
        return originalQuery.apply(this, args);
      };

      try {
        // Test A: Fetch 2 learners (limit = 2)
        queryCount = 0;
        await enrollmentsService.getAdminCourseEnrollments(
          testCourseId,
          { id: instructor1Id, role: 'instructor' },
          { page: 1, limit: 2, sortBy: 'enrolledAt', sortOrder: 'desc' }
        );
        const queriesFor2Learners = queryCount;

        // Test B: Fetch 10 learners (limit = 10)
        queryCount = 0;
        await enrollmentsService.getAdminCourseEnrollments(
          testCourseId,
          { id: instructor1Id, role: 'instructor' },
          { page: 1, limit: 10, sortBy: 'enrolledAt', sortOrder: 'desc' }
        );
        const queriesFor10Learners = queryCount;

        // Test C: Fetch 20 learners (limit = 20)
        queryCount = 0;
        await enrollmentsService.getAdminCourseEnrollments(
          testCourseId,
          { id: instructor1Id, role: 'instructor' },
          { page: 1, limit: 20, sortBy: 'enrolledAt', sortOrder: 'desc' }
        );
        const queriesFor20Learners = queryCount;

        // Assertion: Query count for 2, 10, and 20 learners MUST be identical!
        // In an N+1 implementation, queriesFor20 would be 20 * 2 = 40+ queries,
        // whereas queriesFor2 would be only 4+ queries.
        expect(queriesFor2Learners).toBe(queriesFor10Learners);
        expect(queriesFor10Learners).toBe(queriesFor20Learners);

        // Assert query count is bounded by 5 queries max:
        // (1 course lookup, 1 total lessons count, 1 stats count, 1 rows query, 1 batch progress query)
        expect(queriesFor20Learners).toBeLessThanOrEqual(5);
      } finally {
        testPool.query = originalQuery;
      }
    });
  });

  // =========================================================================
  // 7. QUERY VALIDATION AND BOUNDARY HANDLING
  // =========================================================================
  describe('7. Query Validation and Boundary Handling', () => {
    it('7.1 should reject page <= 0 with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?page=0`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('7.2 should reject limit > 100 with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?limit=150`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('7.3 should reject invalid status with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?status=INVALID_STATUS`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('7.4 should reject invalid sortBy with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?sortBy=injected_field`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('7.5 should reject search string exceeding 100 characters with 400 VALIDATION_ERROR', async () => {
      const longString = 'a'.repeat(101);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=${longString}`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 8. CSV EXPORT REGRESSION COVERAGE
  // =========================================================================
  describe('8. CSV Export Dataset Consistency & Regression Coverage', () => {
    it('8.1 should return complete matching dataset without page truncation for export queries', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?limit=100`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(25);
      expect(res.body.data.pagination.total).toBe(25);
      expect(res.body.data.pagination.totalPages).toBe(1);

      // Verify each record contains required export fields
      for (const item of res.body.data.items) {
        expect(item.enrollmentId).toBeDefined();
        expect(item.student.name).toBeDefined();
        expect(item.student.email).toBeDefined();
        expect(item.status).toMatch(/^(ACTIVE|COMPLETED|CANCELLED)$/);
        expect(item.enrolledAt).toBeDefined();
        expect(typeof item.progressPercentage).toBe('number');
      }
    });

    it('8.2 should preserve active search filter when exporting matching cohort', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/courses/${testCourseId}/enrollments?search=Student&limit=100`)
        .set('Cookie', instructor1Cookies);

      expect(res.status).toBe(200);
      // We generated 19 generic students named "Student Number X"
      expect(res.body.data.items.length).toBe(19);
      for (const item of res.body.data.items) {
        expect(item.student.name).toContain('Student');
      }
    });
  });
});

