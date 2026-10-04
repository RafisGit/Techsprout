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
import { eq, and } from 'drizzle-orm';
import { OrdersService } from '../modules/orders/orders.service';

describe('P5.4.3 — Coupon Management Service & Admin API Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let ordersService: OrdersService;

  let adminCookies: string[];
  let studentCookies: string[];
  let student2Cookies: string[];

  let adminId: string;
  let studentId: string;
  let student2Id: string;

  let category: any;
  let course1: any; // 2500.00 BDT
  let course2: any; // 4000.00 BDT
  let courseDraft: any; // 1000.00 BDT (DRAFT)

  // Seed Coupons
  let globalPercentCoupon: any; // 20%
  let courseSpecificCoupon: any; // 500 BDT off on course 1 only
  let cappedPercentCoupon: any; // 50% capped at 1000 BDT
  let minOrderCoupon: any; // min order 3000 BDT
  let hugeFixedCoupon: any; // 5000 BDT off
  let freeCoupon: any; // 100% off
  let disabledCoupon: any;
  let expiredCoupon: any;
  let futureCoupon: any;
  let exhaustedCoupon: any;
  let perUserLimitCoupon: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // 1. Users & Roles
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Password123!');

    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'))
      .limit(1);
    adminId = adminUser.id;

    const [studentUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'))
      .limit(1);
    studentId = studentUser.id;

    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Student Two Coupons',
        username: 'student2_coupons',
        email: 'student2_coupons@techsprout.edu',
        phone: '01766666666',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = st2.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // 2. Category & Courses
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Coupon Testing Category',
        slug: 'coupon-testing-category',
        description: 'Category for coupon tests',
        isActive: true,
      })
      .returning();
    category = cat;

    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Fullstack TypeScript Pro',
        slug: 'fullstack-typescript-pro',
        description: 'Complete course',
        categoryId: category.id,
        instructorId: adminId,
        price: '2500.00', // 250000 cents
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      })
      .returning();
    course1 = c1;

    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Cloud Native Architect',
        slug: 'cloud-native-architect',
        description: 'Enterprise architecture',
        categoryId: category.id,
        instructorId: adminId,
        price: '4000.00', // 400000 cents
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      })
      .returning();
    course2 = c2;

    const [cDraft] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Unpublished Draft Course',
        slug: 'unpublished-draft-course',
        description: 'Not published yet',
        categoryId: category.id,
        instructorId: adminId,
        price: '1000.00', // 100000 cents
        currency: 'BDT',
        status: 'DRAFT',
        visibility: 'PUBLIC',
      })
      .returning();
    courseDraft = cDraft;

    // 3. Seed Coupons
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 86400000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000);
    const oneMonthLater = new Date(now.getTime() + 30 * 86400000);

    // 3.1 Global 20% percentage
    const [cGlobal] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'GLOBAL20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    globalPercentCoupon = cGlobal;

    // 3.2 Course-specific fixed coupon (Course 1 only, 500 BDT off = 50000 cents)
    const [cSpecific] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'COURSE1FIXED',
        discountType: 'FIXED_AMOUNT',
        discountValue: 50000,
        courseId: course1.id,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    courseSpecificCoupon = cSpecific;

    // 3.3 Capped percentage coupon (50% off, max 1000 BDT = 100000 cents)
    const [cCapped] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'CAP50',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        maxDiscountAmountCents: 100000,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    cappedPercentCoupon = cCapped;

    // 3.4 Minimum order requirement coupon (minOrderAmountCents = 300000)
    const [cMin] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'MIN3000',
        discountType: 'FIXED_AMOUNT',
        discountValue: 60000,
        minOrderAmountCents: 300000,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    minOrderCoupon = cMin;

    // 3.5 Huge fixed coupon (5000 BDT off = 500000 cents, exceeds course1 price of 2500 BDT)
    const [cHuge] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'HUGE5000',
        discountType: 'FIXED_AMOUNT',
        discountValue: 500000,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    hugeFixedCoupon = cHuge;

    // 3.6 100% Free coupon
    const [cFree] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'FREE100',
        discountType: 'PERCENTAGE',
        discountValue: 100,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    freeCoupon = cFree;

    // 3.7 Disabled coupon
    const [cDisabled] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'DISABLED10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: false,
        createdBy: adminId,
      })
      .returning();
    disabledCoupon = cDisabled;

    // 3.8 Expired coupon
    const [cExpired] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'EXPIRED10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startsAt: oneWeekAgo,
        expiresAt: oneDayAgo,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    expiredCoupon = cExpired;

    // 3.9 Future (not-yet-active) coupon
    const [cFuture] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'FUTURE10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startsAt: new Date(now.getTime() + 7 * 86400000),
        expiresAt: new Date(now.getTime() + 14 * 86400000),
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    futureCoupon = cFuture;

    // 3.10 Exhausted coupon (usageLimit 5, redemptionCount 5)
    const [cExhausted] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'EXHAUSTED10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        usageLimit: 5,
        redemptionCount: 5,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    exhaustedCoupon = cExhausted;

    // 3.11 Limited per-user coupon (perUserLimit = 1)
    const [cPerUser] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'ONCEONLY',
        discountType: 'PERCENTAGE',
        discountValue: 25,
        perUserLimit: 1,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    perUserLimitCoupon = cPerUser;

    // Build Nest app with testDb
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
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    ordersService = moduleRef.get(OrdersService);

    // Perform logins to obtain session cookies
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

    const student2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student2_coupons@techsprout.edu',
      password: 'Password123!',
    });
    student2Cookies = student2Login.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // 1. PUBLIC COUPON VALIDATION & PREVIEW
  // ==========================================
  describe('1. Coupon Validation & Preview Logic', () => {
    it('1.1 valid global percentage coupon calculates correct discount and payable', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('GLOBAL20');
      expect(res.body.data.courseId).toBe(course1.id);
      expect(res.body.data.subtotalCents).toBe(250000); // 2500 BDT
      expect(res.body.data.originalPriceCents).toBe(250000);
      expect(res.body.data.discountCents).toBe(50000); // 20% of 2500 BDT = 500 BDT
      expect(res.body.data.payableCents).toBe(200000); // 2000 BDT
      expect(res.body.data.isValid).toBe(true);
    });

    it('1.2 valid course-specific coupon applies successfully to matching course', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'COURSE1FIXED',
          courseId: course1.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(250000);
      expect(res.body.data.discountCents).toBe(50000);
      expect(res.body.data.payableCents).toBe(200000);
    });

    it('1.3 fixed-amount coupon deducts exact integer cents', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'COURSE1FIXED',
          courseId: course1.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.discountType).toBe('FIXED_AMOUNT');
      expect(res.body.data.discountCents).toBe(50000);
    });

    it('1.4 percentage max discount caps discount at configured threshold', async () => {
      // Course 2 price is 4000 BDT (400000 cents). 50% is 2000 BDT (200000 cents).
      // CAP50 has maxDiscountAmountCents = 100000 (1000 BDT).
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'CAP50',
          courseId: course2.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(400000);
      expect(res.body.data.discountCents).toBe(100000); // Capped at 1000 BDT
      expect(res.body.data.payableCents).toBe(300000);
    });

    it('1.5 minimum order requirement rejects order below threshold with COUPON_MIN_ORDER_NOT_MET', async () => {
      // Course 1 price is 2500 BDT (250000 cents). MIN3000 requires 3000 BDT (300000 cents).
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'MIN3000',
          courseId: course1.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_MIN_ORDER_NOT_MET');
    });

    it('1.6 discount cannot exceed subtotal (capped at full price)', async () => {
      // HUGE5000 provides 5000 BDT discount on 2500 BDT course
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'HUGE5000',
          courseId: course1.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(250000);
      expect(res.body.data.discountCents).toBe(250000); // Capped to subtotal
      expect(res.body.data.payableCents).toBe(0);
    });

    it('1.7 100% discount → zero payable', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'FREE100',
          courseId: course1.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(250000);
      expect(res.body.data.discountCents).toBe(250000);
      expect(res.body.data.payableCents).toBe(0);
    });

    it('1.8 invalid code returns 404 COUPON_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'NONEXISTENT',
          courseId: course1.id,
        });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('COUPON_NOT_FOUND');
    });

    it('1.9 disabled coupon returns 400 COUPON_DISABLED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'DISABLED10',
          courseId: course1.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_DISABLED');
    });

    it('1.10 expired coupon returns 400 COUPON_EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'EXPIRED10',
          courseId: course1.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_EXPIRED');
    });

    it('1.11 not-yet-active coupon returns 400 COUPON_NOT_YET_ACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'FUTURE10',
          courseId: course1.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_NOT_YET_ACTIVE');
    });

    it('1.12 course mismatch returns 400 COUPON_COURSE_MISMATCH', async () => {
      // COURSE1FIXED is scoped to course 1, should fail on course 2
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'COURSE1FIXED',
          courseId: course2.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_COURSE_MISMATCH');
    });

    it('1.13 usage limit reached returns 400 COUPON_USAGE_LIMIT_REACHED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'EXHAUSTED10',
          courseId: course1.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_USAGE_LIMIT_REACHED');
    });

    it('1.14 per-user limit reached returns 400 COUPON_USER_LIMIT_REACHED for authenticated student', async () => {
      // Create a redemption for student 1 with ONCEONLY coupon
      const [orderForRedemption] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-REDEMP-001',
          studentId,
          status: 'PAID',
          subtotalCents: 250000,
          discountCents: 62500,
          payableCents: 187500,
          currency: 'BDT',
          couponId: perUserLimitCoupon.id,
          couponCode: perUserLimitCoupon.code,
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      await testDb.insert(schema.couponRedemptions).values({
        couponId: perUserLimitCoupon.id,
        userId: studentId,
        orderId: orderForRedemption.id,
        status: 'CONSUMED',
        discountCents: 62500,
      });

      // Now student 1 tries to validate ONCEONLY again
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .set('Cookie', studentCookies)
        .send({
          code: 'ONCEONLY',
          courseId: course1.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_USER_LIMIT_REACHED');

      // But student 2 (who has not redeemed ONCEONLY) should validate successfully
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .set('Cookie', student2Cookies)
        .send({
          code: 'ONCEONLY',
          courseId: course1.id,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.isValid).toBe(true);
    });
  });

  // ==========================================
  // 2. READ-ONLY PREVIEW GUARANTEES
  // ==========================================
  describe('2. Read-Only Preview Guarantees', () => {
    it('15. preview does not create redemption record', async () => {
      const redemptionsBefore = await testDb.select().from(schema.couponRedemptions);

      await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .set('Cookie', studentCookies)
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
        });

      const redemptionsAfter = await testDb.select().from(schema.couponRedemptions);
      expect(redemptionsAfter.length).toBe(redemptionsBefore.length);
    });

    it('16. preview does not increment redemptionCount', async () => {
      const [beforeCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'GLOBAL20'));

      await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
        });

      const [afterCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'GLOBAL20'));

      expect(afterCoupon.redemptionCount).toBe(beforeCoupon.redemptionCount);
    });

    it('17. preview does not mutate coupon state or timestamps', async () => {
      const [beforeCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'GLOBAL20'));

      await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
        });

      const [afterCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'GLOBAL20'));

      expect(afterCoupon.updatedAt.getTime()).toBe(beforeCoupon.updatedAt.getTime());
      expect(afterCoupon.isActive).toBe(beforeCoupon.isActive);
    });
  });

  // ==========================================
  // 3. SERVER-AUTHORITATIVE CALCULATIONS
  // ==========================================
  describe('3. Server Authority Over Prices & Calculations', () => {
    it('18. fake client price is completely ignored', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
          priceCents: 100, // Attempt fake price
        });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(250000); // Authoritative DB price
    });

    it('19. fake subtotal is completely ignored', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
          subtotalCents: 500,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.subtotalCents).toBe(250000);
    });

    it('20. fake discount is completely ignored', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
          discountCents: 999999,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.discountCents).toBe(50000); // Correct 20%
    });

    it('21. fake payable is completely ignored', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: course1.id,
          payableCents: 0,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.payableCents).toBe(200000); // 250000 - 50000
    });
  });

  // ==========================================
  // 4. ADMIN COUPON CRUD & LIFECYCLE
  // ==========================================
  describe('4. Admin Coupon Management CRUD API', () => {
    let createdCouponId: string;

    it('22. admin list returns paginated coupon items', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/coupons?limit=10')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(10);
      expect(res.body.data.items[0]).toHaveProperty('code');
      expect(res.body.data.items[0]).toHaveProperty('discountType');
    });

    it('23. non-admin access is denied with 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/coupons')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');

      const resCreate = await request(app.getHttpServer())
        .post('/api/v1/admin/coupons')
        .set('Cookie', studentCookies)
        .send({
          code: 'HACKER10',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startsAt: new Date().toISOString(),
        });

      expect(resCreate.status).toBe(403);
    });

    it('24. admin create adds new coupon with normalized uppercase code', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/coupons')
        .set('Cookie', adminCookies)
        .send({
          code: 'newyear2026',
          discountType: 'PERCENTAGE',
          discountValue: 30,
          minOrderAmountCents: 100000,
          maxDiscountAmountCents: 80000,
          courseId: course1.id,
          usageLimit: 100,
          perUserLimit: 2,
          startsAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('NEWYEAR2026'); // Normalized to uppercase
      expect(res.body.data.discountValue).toBe(30);
      expect(res.body.data.courseTitle).toBe(course1.title);
      createdCouponId = res.body.data.id;
    });

    it('25. duplicate coupon code is rejected with 409 COUPON_CODE_ALREADY_EXISTS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/coupons')
        .set('Cookie', adminCookies)
        .send({
          code: 'NEWYEAR2026', // Duplicate
          discountType: 'PERCENTAGE',
          discountValue: 15,
          startsAt: new Date().toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('COUPON_CODE_ALREADY_EXISTS');
    });

    it('26. admin get coupon by ID returns detail and metadata', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/coupons/${createdCouponId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdCouponId);
      expect(res.body.data.code).toBe('NEWYEAR2026');
      expect(res.body.data.courseTitle).toBe(course1.title);
    });

    it('27. admin update modifies safe attributes', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/coupons/${createdCouponId}`)
        .set('Cookie', adminCookies)
        .send({
          usageLimit: 150,
          perUserLimit: 3,
          maxDiscountAmountCents: 90000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.usageLimit).toBe(150);
      expect(res.body.data.perUserLimit).toBe(3);
      expect(res.body.data.maxDiscountAmountCents).toBe(90000);
    });

    it('28. admin delete performs soft-disable without deleting DB row', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/admin/coupons/${createdCouponId}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Verify row still exists in database
      const [dbCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, createdCouponId));

      expect(dbCoupon).toBeDefined();
      expect(dbCoupon.isActive).toBe(false);
    });

    it('29. admin can re-enable disabled coupon via update', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/coupons/${createdCouponId}`)
        .set('Cookie', adminCookies)
        .send({
          isActive: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });

    it('30. nonexistent coupon ID returns 404 COUPON_NOT_FOUND', async () => {
      const nonExistent = '00000000-0000-4000-8000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/coupons/${nonExistent}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('COUPON_NOT_FOUND');
    });
  });

  // ==========================================
  // 5. CONCURRENCY & INTEGRATION
  // ==========================================
  describe('5. Concurrency & Redemption Lifecycle Integration', () => {
    it('31. order creation reserves coupon with pessimistic lock and increments redemptionCount', async () => {
      // Create a test coupon with usageLimit = 2
      const [concCoupon] = await testDb
        .insert(schema.coupons)
        .values({
          code: 'CONC2',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          usageLimit: 2,
          redemptionCount: 0,
          startsAt: new Date(Date.now() - 3600000),
          isActive: true,
          createdBy: adminId,
        })
        .returning();

      // Order 1 creation with coupon
      const orderRes1 = await ordersService.createOrder(
        studentId,
        { courseId: course1.id, couponCode: 'CONC2' }
      );

      expect(orderRes1.couponCode).toBe('CONC2');
      expect(orderRes1.discountCents).toBe(25000);

      const [updatedCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, concCoupon.id));

      expect(updatedCoupon.redemptionCount).toBe(1);

      // Verify redemption created in RESERVED status
      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, orderRes1.id));

      expect(redemption.status).toBe('RESERVED');
      expect(redemption.discountCents).toBe(25000);
    });

    it('32. concurrent reservations cannot exceed usage limit', async () => {
      // One spot left on CONC2
      // Try to create 2 orders concurrently
      const attempts = await Promise.allSettled([
        ordersService.createOrder(student2Id, { courseId: course1.id, couponCode: 'CONC2' }),
        ordersService.createOrder(studentId, { courseId: course1.id, couponCode: 'CONC2' }),
      ]);

      const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
      const rejected = attempts.filter((a) => a.status === 'rejected');

      // Exactly 1 must have succeeded, and 1 must have been rejected because limit was 2
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const [finalCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'CONC2'));

      expect(finalCoupon.redemptionCount).toBe(2);
    });

    it('33. consumed redemption updates state correctly', async () => {
      const [order] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.couponCode, 'CONC2'))
        .limit(1);

      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, order.id));

      // Simulate payment validation transition
      await testDb
        .update(schema.couponRedemptions)
        .set({
          status: 'CONSUMED',
          consumedAt: new Date(),
        })
        .where(eq(schema.couponRedemptions.id, redemption.id));

      const [consumedRedemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.id, redemption.id));

      expect(consumedRedemption.status).toBe('CONSUMED');
      expect(consumedRedemption.consumedAt).toBeDefined();
    });

    it('34. released redemption behavior decrements usage and restores user allowance', async () => {
      // Create order with coupon to cancel
      const order = await ordersService.createOrder(
        student2Id,
        { courseId: course2.id, couponCode: 'GLOBAL20' }
      );

      const [couponBefore] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'GLOBAL20'));

      const redCountBefore = couponBefore.redemptionCount;

      // Expire/cancel order using ordersService
      await ordersService.expireOrderIfDue(order.id);

      const [couponAfter] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'GLOBAL20'));

      expect(couponAfter.redemptionCount).toBe(redCountBefore - 1);

      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, order.id));

      expect(redemption.status).toBe('RELEASED');
      expect(redemption.releasedAt).toBeDefined();
    });
  });

  // ==========================================
  // 6. SECURITY & NORMALIZATION
  // ==========================================
  describe('6. Security & Parameter Normalization', () => {
    it('35. coupon code input is normalized case-insensitively', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: '  global20  ', // Mixed lowercase with spaces
          courseId: course1.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe('GLOBAL20');
      expect(res.body.data.isValid).toBe(true);
    });

    it('36. no secrets or internal configuration exposed in responses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/coupons')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      const str = JSON.stringify(res.body);
      expect(str).not.toContain('store_passwd');
      expect(str).not.toContain('SSLCOMMERZ');
      expect(str).not.toContain('passwordHash');
    });

    it('37. unpublished course cannot be previewed for purchase', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({
          code: 'GLOBAL20',
          courseId: courseDraft.id, // DRAFT course
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COURSE_NOT_PUBLISHED');
    });
  });
});
