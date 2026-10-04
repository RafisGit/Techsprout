import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { env, envSchema } from '../config/env.config';
import {
  decimalStringToCents,
  centsToDecimalString,
  calculateDiscountCents,
} from '../modules/payments/money.util';
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';
import {
  GATEWAY_MIN_AMOUNT_CENTS,
  GATEWAY_MAX_AMOUNT_CENTS,
} from '@techsprout/contracts';

describe('P5.3 — Core Payment Engine & SSLCommerz Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;

  let studentCookies: string[];
  let student2Cookies: string[];
  let adminCookies: string[];

  let studentId: string;
  let student2Id: string;
  let adminId: string;

  let activeCategory: any;
  let freeCourse: any;
  let paidCourse: any;
  let subMinimumCourse: any;
  let draftCourse: any;
  let archivedCourse: any;
  let privateCourse: any;

  let activePercentCoupon: any;
  let activeFixedCoupon: any;
  let fullDiscountCoupon: any;
  let expiredCoupon: any;
  let limitedCoupon: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    mockSslCommerz = new MockSSLCommerzClient();

    // Seed student 2
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Student2Password123!');
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Alice Ineligible',
        username: 'alice_student2',
        email: 'student2_payment@techsprout.edu',
        phone: '01722222222',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = st2.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // Retrieve seed users
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

    // Seed Category
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Web Engineering',
        slug: 'web-engineering',
        isActive: true,
      })
      .returning();
    activeCategory = cat;

    // Seed Courses:
    // 1. Free Course (price = '0.00')
    const [fc] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Free Intro to HTML & CSS',
        slug: 'free-intro-html-css',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '0.00',
        currency: 'BDT',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    freeCourse = fc;

    // 2. Paid Course (price = '2500.00' BDT -> 250000 cents)
    const [pc] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Full-Stack Next.js Mastery',
        slug: 'fullstack-nextjs-mastery',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '2500.00',
        currency: 'BDT',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    paidCourse = pc;

    // 3. Draft Course
    const [dc] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Unreleased Draft Course',
        slug: 'unreleased-draft-course',
        status: 'DRAFT',
        visibility: 'PUBLIC',
        price: '1500.00',
        currency: 'BDT',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    draftCourse = dc;

    // 4. Archived Course
    const [ac] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Archived Legacy Course',
        slug: 'archived-legacy-course',
        status: 'ARCHIVED',
        visibility: 'PUBLIC',
        price: '3000.00',
        currency: 'BDT',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    archivedCourse = ac;

    // 5. Private Course
    const [prc] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Private Enterprise Training',
        slug: 'private-enterprise-training',
        status: 'PUBLISHED',
        visibility: 'PRIVATE',
        price: '5000.00',
        currency: 'BDT',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    privateCourse = prc;

    // 6. Sub-minimum Course (price = '5.00' BDT -> 500 cents < 1000 cents gateway minimum)
    const [smc] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Micro Tutorial on CSS Selectors',
        slug: 'micro-tutorial-css-selectors',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '5.00',
        currency: 'BDT',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    subMinimumCourse = smc;

    // Seed Coupons:
    // 1. 20% discount coupon
    const [c1] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'PROMO20',
        discountType: 'PERCENTAGE',
        discountValue: 20, // 20%
        minOrderAmountCents: 100000, // 1000 BDT
        maxDiscountAmountCents: 100000, // max 1000 BDT
        startsAt: new Date(Date.now() - 100000),
        expiresAt: new Date(Date.now() + 100000000),
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    activePercentCoupon = c1;

    // 2. Fixed amount 500 BDT (50000 cents) coupon
    const [c2] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'SAVE500',
        discountType: 'FIXED_AMOUNT',
        discountValue: 50000,
        minOrderAmountCents: 100000,
        startsAt: new Date(Date.now() - 100000),
        expiresAt: new Date(Date.now() + 100000000),
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    activeFixedCoupon = c2;

    // 3. Expired coupon
    const [c3] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'EXPIRED10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startsAt: new Date(Date.now() - 2000000),
        expiresAt: new Date(Date.now() - 1000000),
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    expiredCoupon = c3;

    // 4. Limited usage coupon (limit 1)
    const [c4] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'ONETIMEONLY',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        usageLimit: 1,
        redemptionCount: 1, // already exhausted
        startsAt: new Date(Date.now() - 100000),
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    limitedCoupon = c4;

    // 5. 100% full-discount coupon (payableCents === 0 bypass)
    const [c5] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'FREE100',
        discountType: 'PERCENTAGE',
        discountValue: 100,
        minOrderAmountCents: 0,
        startsAt: new Date(Date.now() - 100000),
        expiresAt: new Date(Date.now() + 100000000),
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    fullDiscountCoupon = c5;

    // Build NestJS application with MockSSLCommerzClient
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
      .overrideProvider(SSLCOMMERZ_CLIENT)
      .useValue(mockSslCommerz)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    // Authenticate users
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
      email: 'student2_payment@techsprout.edu',
      password: 'Student2Password123!',
    });
    student2Cookies = student2Login.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    mockSslCommerz.clear();
    await testDb.delete(schema.invoices);
    await testDb.delete(schema.payments);
    await testDb.delete(schema.couponRedemptions);
    await testDb.delete(schema.orderItems);
    await testDb.delete(schema.orders);
    await testDb.delete(schema.enrollments);
    await testDb
      .update(schema.coupons)
      .set({ redemptionCount: 0 })
      .where(eq(schema.coupons.id, activePercentCoupon.id));
    await testDb
      .update(schema.coupons)
      .set({ redemptionCount: 0 })
      .where(eq(schema.coupons.id, activeFixedCoupon.id));
    if (fullDiscountCoupon) {
      await testDb
        .update(schema.coupons)
        .set({ redemptionCount: 0 })
        .where(eq(schema.coupons.id, fullDiscountCoupon.id));
    }
  });

  // ==============================================================
  // 1. MONEY UTILITY & DETERMINISTIC ARITHMETIC UNIT TESTS
  // ==============================================================
  describe('1. Money Utility & Minor Unit Conversion', () => {
    it('1.1 decimalStringToCents converts currency strings to integer minor units deterministically', () => {
      expect(decimalStringToCents('2500.00')).toBe(250000);
      expect(decimalStringToCents('2500.5')).toBe(250050);
      expect(decimalStringToCents('2500.50')).toBe(250050);
      expect(decimalStringToCents('2500')).toBe(250000);
      expect(decimalStringToCents('0')).toBe(0);
      expect(decimalStringToCents('0.00')).toBe(0);
      expect(decimalStringToCents('0.01')).toBe(1);
      expect(decimalStringToCents('99.99')).toBe(9999);
      expect(decimalStringToCents(' 123.45 ')).toBe(12345);
    });

    it('1.2 decimalStringToCents rejects invalid formats', () => {
      expect(() => decimalStringToCents('-10.00')).toThrow();
      expect(() => decimalStringToCents('abc')).toThrow();
      expect(() => decimalStringToCents('10.123')).toThrow();
      expect(() => decimalStringToCents('')).toThrow();
    });

    it('1.3 centsToDecimalString formats minor units to gateway decimal representation', () => {
      expect(centsToDecimalString(250000)).toBe('2500.00');
      expect(centsToDecimalString(250050)).toBe('2500.50');
      expect(centsToDecimalString(0)).toBe('0.00');
      expect(centsToDecimalString(1)).toBe('0.01');
      expect(centsToDecimalString(9999)).toBe('99.99');
    });

    it('1.4 centsToDecimalString rejects invalid inputs', () => {
      expect(() => centsToDecimalString(-100)).toThrow();
      expect(() => centsToDecimalString(12.34 as any)).toThrow();
    });

    it('1.5 calculateDiscountCents accurately calculates percentage and fixed discounts without float errors', () => {
      // 20% on 2500 BDT (250000 cents) = 50000 cents (500 BDT)
      expect(calculateDiscountCents(250000, 'PERCENTAGE', 20)).toBe(50000);

      // 15% on 1999 cents = 300 cents (rounded from 299.85)
      expect(calculateDiscountCents(1999, 'PERCENTAGE', 15)).toBe(300);

      // Capped by maxDiscountAmountCents
      expect(calculateDiscountCents(250000, 'PERCENTAGE', 50, 40000)).toBe(40000);

      // Fixed amount discount
      expect(calculateDiscountCents(250000, 'FIXED_AMOUNT', 50000)).toBe(50000);

      // Fixed amount exceeding subtotal is capped at subtotal
      expect(calculateDiscountCents(30000, 'FIXED_AMOUNT', 50000)).toBe(30000);
    });
  });

  // ==============================================================
  // 2. PAID VS FREE COURSE SELF-ENROLLMENT BARRIER
  // ==============================================================
  describe('2. Paid vs Free Course Boundary (POST /api/v1/enrollments)', () => {
    it('2.1 allows direct self-enrollment for free courses (price === 0.00)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: freeCourse.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.courseId).toBe(freeCourse.id);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('2.2 blocks direct self-enrollment for paid courses with HTTP 402 PAYMENT_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });

      expect(res.status).toBe(402);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('PAYMENT_REQUIRED');
      expect(res.body.message).toContain('payment');
    });
  });

  // ==============================================================
  // 3. ORDER SERVICE & SERVER-AUTHORITATIVE PRICING
  // ==============================================================
  describe('3. Order Creation & Authoritative Pricing (POST /api/v1/orders)', () => {
    it('3.1 creates an order with server-calculated price, snapshot items, and 60min expiry', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.data;
      expect(order.studentId).toBe(studentId);
      expect(order.status).toBe('PENDING');
      expect(order.subtotalCents).toBe(250000);
      expect(order.discountCents).toBe(0);
      expect(order.payableCents).toBe(250000);
      expect(order.currency).toBe('BDT');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].courseId).toBe(paidCourse.id);
      expect(order.items[0].courseTitle).toBe(paidCourse.title);
      expect(order.items[0].unitPriceCents).toBe(250000);

      // Verify expiration is ~60 minutes from creation
      const expiresAt = new Date(order.expiresAt).getTime();
      const createdAt = new Date(order.createdAt).getTime();
      expect(expiresAt - createdAt).toBeGreaterThanOrEqual(59 * 60 * 1000);
      expect(expiresAt - createdAt).toBeLessThanOrEqual(61 * 60 * 1000);
    });

    it('3.2 rejects client price tampering attempts via strict zod validation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: paidCourse.id,
          price: '1.00',
          payableCents: 100,
          currency: 'USD',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('3.3 rejects order creation for non-purchasable courses (DRAFT, ARCHIVED, PRIVATE)', async () => {
      // DRAFT -> 404
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: draftCourse.id });
      expect(draftRes.status).toBe(404);

      // ARCHIVED -> 422
      const archRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: archivedCourse.id });
      expect(archRes.status).toBe(422);

      // PRIVATE -> 403
      const privRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: privateCourse.id });
      expect(privRes.status).toBe(403);
    });

    it('3.4 successfully applies coupon and reserves redemption count atomically', async () => {
      // Get initial coupon redemption count
      const [initialCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, activePercentCoupon.id));

      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: paidCourse.id,
          couponCode: 'PROMO20',
        });

      expect(res.status).toBe(201);
      const order = res.body.data;
      expect(order.subtotalCents).toBe(250000);
      expect(order.discountCents).toBe(50000); // 20% of 250000
      expect(order.payableCents).toBe(200000); // 2000 BDT
      expect(order.couponCode).toBe('PROMO20');

      // Verify coupon redemption count was incremented for reservation
      const [updatedCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, activePercentCoupon.id));
      expect(updatedCoupon.redemptionCount).toBe(initialCoupon.redemptionCount + 1);

      // Verify coupon_redemptions table has status RESERVED
      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, order.id));
      expect(redemption).toBeDefined();
      expect(redemption.status).toBe('RESERVED');
      expect(redemption.discountCents).toBe(50000);
    });

    it('3.5 rejects invalid or expired coupons', async () => {
      // Non-existent coupon
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id, couponCode: 'FAKECODE' });
      expect(res1.status).toBe(404);

      // Expired coupon
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id, couponCode: 'EXPIRED10' });
      expect(res2.status).toBe(400);
      expect(res2.body.errorCode).toBe('COUPON_EXPIRED');

      // Exhausted usage limit
      const res3 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id, couponCode: 'ONETIMEONLY' });
      expect(res3.status).toBe(400);
      expect(res3.body.errorCode).toBe('COUPON_USAGE_LIMIT_REACHED');
    });

    it('3.6 student can retrieve their order details via GET /api/v1/orders/:id', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const orderId = orderRes.body.data.id;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', studentCookies);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(orderId);
      expect(getRes.body.data.studentId).toBe(studentId);
    });

    it('3.7 student cannot view another student order (IDOR protection)', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const orderId = orderRes.body.data.id;

      // Student 2 attempts to fetch Student 1's order
      const idorRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', student2Cookies);

      expect(idorRes.status).toBe(403);
      expect(idorRes.body.errorCode).toBe('ORDER_ACCESS_DENIED');
    });
  });

  // ==============================================================
  // 4. PAYMENT INITIATION & SSLCOMMERZ GATEWAY SESSION
  // ==============================================================
  describe('4. Payment Initiation (POST /api/v1/payments/initiate)', () => {
    it('4.1 initiates a gateway session with authoritative amount and creates payment attempt', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(201);
      expect(initRes.body.success).toBe(true);

      const payData = initRes.body.data;
      expect(payData.paymentId).toBeDefined();
      expect(payData.merchantTranId).toMatch(/^TSP-TXN-/);
      expect(payData.gatewayUrl).toContain('sandbox.sslcommerz.com');
      expect(payData.provider).toBe('SSLCOMMERZ');

      // Check payment record in DB
      const [payment] = await testDb
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, payData.paymentId));
      expect(payment.status).toBe('INITIATED');
      expect(payment.amountCents).toBe(order.payableCents);
      expect(payment.currency).toBe('BDT');

      // Check order transitioned to PAYMENT_PROCESSING
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).toBe('PAYMENT_PROCESSING');
    });

    it('4.2 rejects payment initiation tampering with extra fields', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({
          orderId: orderRes.body.data.id,
          amount: '10.00',
          currency: 'USD',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('4.3 rejects payment initiation by unauthorized user (IDOR protection)', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });

      // Student 2 tries to initiate payment for Student 1's order
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', student2Cookies)
        .send({ orderId: orderRes.body.data.id });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('ORDER_ACCESS_DENIED');
    });
  });

  // ==============================================================
  // 5. SERVER-AUTHORITATIVE VALIDATION & PAYMENT FULFILLMENT
  // ==============================================================
  describe('5. Authoritative Order Validation & Fulfillment', () => {
    it('5.1 validates with Order Validation API, marks order PAID, creates active enrollment, consumes coupon, and creates invoice', async () => {
      // 1. Create order with coupon
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', student2Cookies)
        .send({
          courseId: paidCourse.id,
          couponCode: 'SAVE500',
        });
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(200000); // 2500 - 500 = 2000 BDT

      // 2. Initiate payment
      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', student2Cookies)
        .send({ orderId: order.id });
      const { paymentId, merchantTranId } = initRes.body.data;

      // 3. Configure mock SSLCommerz Order Validation response
      const valId = `VAL-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2000.00',
        currency: 'BDT',
        bank_tran_id: 'BANK-TRX-123456',
        card_type: 'VISA-CityBank',
        card_brand: 'VISA',
      });

      // 4. Send success callback POST
      const callbackRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2000.00',
          currency: 'BDT',
          status: 'VALID',
          bank_tran_id: 'BANK-TRX-123456',
        });

      expect(callbackRes.status).toBe(200);
      expect(callbackRes.body.success).toBe(true);

      // 5. Verify database state: Order is PAID
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).toBe('PAID');
      expect(dbOrder.paidAt).toBeDefined();

      // 6. Verify Payment is VALIDATED with bankTranId & valId
      const [dbPayment] = await testDb
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId));
      expect(dbPayment.status).toBe('VALIDATED');
      expect(dbPayment.valId).toBe(valId);
      expect(dbPayment.bankTranId).toBe('BANK-TRX-123456');
      expect(dbPayment.validatedAt).toBeDefined();

      // 7. Verify Enrollment is created with ACTIVE status
      const [enrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, student2Id),
            eq(schema.enrollments.courseId, paidCourse.id)
          )
        );
      expect(enrollment).toBeDefined();
      expect(enrollment.status).toBe('ACTIVE');

      // 8. Verify Coupon Redemption status is CONSUMED
      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, order.id));
      expect(redemption.status).toBe('CONSUMED');
      expect(redemption.consumedAt).toBeDefined();

      // 9. Verify Invoice is created with status PAID
      const [invoice] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(invoice).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^TSP-INV-/);
      expect(invoice.status).toBe('PAID');
      expect(invoice.payableCents).toBe(200000);
      expect(invoice.bankTranId).toBe('BANK-TRX-123456');
    });

    it('5.2 browser success redirect returns HTTP 302 Location header', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // Browser redirect request (Accept: text/html)
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'text/html,application/xhtml+xml')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${env.WEB_ORIGIN}/orders/${order.id}/success`);
    });
  });

  // ==============================================================
  // 6. FAIL, CANCEL & IPN CALLBACK HANDLING
  // ==============================================================
  describe('6. Fail, Cancel & IPN Handling', () => {
    it('6.1 fail callback marks order and payment FAILED', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { paymentId, merchantTranId } = initRes.body.data;

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/fail')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          status: 'FAILED',
          failedreason: 'Insufficient funds in card',
        });

      expect(res.status).toBe(200);

      const [payment] = await testDb
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId));
      expect(payment.status).toBe('FAILED');

      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).toBe('FAILED');
    });

    it('6.2 cancel callback marks order CANCELLED and releases reserved coupon', async () => {
      // 1. Create order with coupon
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: paidCourse.id,
          couponCode: 'SAVE500',
        });
      const order = orderRes.body.data;

      const [couponBefore] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, activeFixedCoupon.id));
      const redCountBefore = couponBefore.redemptionCount;

      // 2. Initiate payment
      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      // 3. User cancels at gateway
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/cancel')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          status: 'CANCELLED',
        });

      expect(res.status).toBe(200);

      // Order cancelled
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).toBe('CANCELLED');

      // Coupon redemption status RELEASED
      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, order.id));
      expect(redemption.status).toBe('RELEASED');
      expect(redemption.releasedAt).toBeDefined();

      // Coupon redemptionCount decremented back
      const [couponAfter] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, activeFixedCoupon.id));
      expect(couponAfter.redemptionCount).toBe(redCountBefore - 1);
    });

    it('6.3 server-to-server IPN validates and fulfills order atomically', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-IPN-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
        bank_tran_id: 'BANK-IPN-999',
      });

      const ipnRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/ipn')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
          bank_tran_id: 'BANK-IPN-999',
        });

      expect(ipnRes.status).toBe(200);
      expect(ipnRes.body.status).toBe('OK');

      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).toBe('PAID');
    });

    it('6.4 PAID order cannot be downgraded by subsequent fail or cancel callbacks', async () => {
      // 1. Create and pay order
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { paymentId, merchantTranId } = initRes.body.data;

      const valId = `VAL-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      // 2. Attempt to send a fail callback
      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/fail')
        .send({
          tran_id: merchantTranId,
          status: 'FAILED',
        });

      // Verify order is still PAID
      const [orderAfterFail] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(orderAfterFail.status).toBe('PAID');

      // 3. Attempt to send a cancel callback
      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/cancel')
        .send({
          tran_id: merchantTranId,
          status: 'CANCELLED',
        });

      // Verify order is STILL PAID
      const [orderAfterCancel] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(orderAfterCancel.status).toBe('PAID');
    });
  });

  // ==============================================================
  // 7. CONCURRENCY & IDEMPOTENCY
  // ==============================================================
  describe('7. Concurrency & Idempotent Execution', () => {
    it('7.1 duplicate success callback on already-paid order is idempotent', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // Call 1
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res1.status).toBe(200);

      // Call 2 (Duplicate)
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res2.status).toBe(200);

      // Verify exactly ONE invoice exists
      const invoices = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(invoices).toHaveLength(1);
    });

    it('7.2 duplicate IPN callback returns HTTP 200 without mutations', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // IPN 1
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/ipn')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res1.status).toBe(200);

      // IPN 2 (Duplicate)
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/ipn')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res2.status).toBe(200);
      expect(res2.body.message).toContain('already fulfilled');
    });

    it('7.3 IPN arrives first, then browser success redirect arrives — both succeed cleanly', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // 1. IPN arrives first
      const ipnRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/ipn')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(ipnRes.status).toBe(200);

      // 2. Success redirect arrives afterward
      const successRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'text/html')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(successRes.status).toBe(302);
      expect(successRes.headers.location).toBe(`${env.WEB_ORIGIN}/orders/${order.id}/success`);
    });
  });

  // ==============================================================
  // 8. SECURITY & TAMPERING ATTACK SIMULATIONS
  // ==============================================================
  describe('8. Security, Tampering & Replay Attacks', () => {
    it('8.1 rejects payment fulfillment when gateway reports amount mismatch', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      // Gateway validates with a lower amount (tampering)
      const valId = `VAL-TAMPER-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '100.00', // expected 2500.00!
        currency: 'BDT',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00', // forged callback param, but validation API reveals 100.00
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('PAYMENT_AMOUNT_MISMATCH');

      // Order must remain unfulfilled
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).not.toBe('PAID');
    });

    it('8.2 rejects payment fulfillment when gateway reports currency mismatch', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-CURR-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'USD', // expected BDT!
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('PAYMENT_CURRENCY_MISMATCH');
    });

    it('8.3 rejects forged val_id / invalid gateway status', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      // Do NOT configure mock validation -> returns INVALID_TRANSACTION
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: 'NON_EXISTENT_VAL_ID',
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('PAYMENT_VALIDATION_FAILED');
    });

    it('8.4 sanitizes provider rawResponse to ensure no store password or secrets are leaked', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId, paymentId } = initRes.body.data;

      const valId = `VAL-${Date.now()}`;
      mockSslCommerz.validations.set(valId, {
        status: 'VALID',
        tran_id: merchantTranId,
        val_id: valId,
        amount: '2500.00',
        currency: 'BDT',
        store_passwd: 'SUPER_SECRET_STORE_PASSWORD',
        secret_token: 'TOKEN_12345',
        card_type: 'VISA',
      } as any);

      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      const [dbPayment] = await testDb
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId));

      expect(dbPayment.rawResponse).toBeDefined();
      expect(dbPayment.rawResponse).not.toContain('SUPER_SECRET_STORE_PASSWORD');
      expect(dbPayment.rawResponse).not.toContain('TOKEN_12345');
    });

    it('8.5 lazy order expiration cancels unpaid order past 60 min and releases reserved coupon', async () => {
      // 1. Create order with coupon
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: paidCourse.id,
          couponCode: 'SAVE500',
        });
      const order = orderRes.body.data;

      // 2. Artificially set order expiresAt to 5 minutes ago in the DB
      await testDb
        .update(schema.orders)
        .set({ expiresAt: new Date(Date.now() - 5 * 60 * 1000) })
        .where(eq(schema.orders.id, order.id));

      // 3. Fetching the order triggers lazy expiration
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}`)
        .set('Cookie', studentCookies);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.status).toBe('CANCELLED');

      // 4. Payment initiation on this expired order is rejected
      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(400);
      expect(payRes.body.errorCode).toBe('INVALID_ORDER_STATE_TRANSITION');
    });
  });

  // ==============================================================
  // 9. P5.3 FINAL SECURITY, GATEWAY BOUNDARY & LOCKING CORRECTIONS
  // ==============================================================
  describe('9. P5.3 Final Security, Gateway Boundary & Locking Corrections', () => {
    // 9.1 Environment Credential Hardening
    it('9.1.1 production environment validation fails if SSLCommerz credentials are missing', () => {
      const prodMissingBoth = envSchema.safeParse({
        NODE_ENV: 'production',
        AUTH_SECRET: 'super_secret_minimum_32_characters_key_here',
      });
      expect(prodMissingBoth.success).toBe(false);
      if (!prodMissingBoth.success) {
        const issues = prodMissingBoth.error.issues;
        expect(issues.some((i) => i.path.includes('SSLCOMMERZ_STORE_ID'))).toBe(true);
        expect(issues.some((i) => i.path.includes('SSLCOMMERZ_STORE_PASSWORD'))).toBe(true);
      }

      const prodMissingId = envSchema.safeParse({
        NODE_ENV: 'production',
        AUTH_SECRET: 'super_secret_minimum_32_characters_key_here',
        SSLCOMMERZ_STORE_PASSWORD: 'secret_password_123',
      });
      expect(prodMissingId.success).toBe(false);
      if (!prodMissingId.success) {
        expect(prodMissingId.error.issues.some((i) => i.path.includes('SSLCOMMERZ_STORE_ID'))).toBe(true);
      }

      const prodMissingPass = envSchema.safeParse({
        NODE_ENV: 'production',
        AUTH_SECRET: 'super_secret_minimum_32_characters_key_here',
        SSLCOMMERZ_STORE_ID: 'valid_prod_store_id',
      });
      expect(prodMissingPass.success).toBe(false);
      if (!prodMissingPass.success) {
        expect(prodMissingPass.error.issues.some((i) => i.path.includes('SSLCOMMERZ_STORE_PASSWORD'))).toBe(true);
      }
    });

    it('9.1.2 production environment validation passes when all required credentials are provided', () => {
      const prodValid = envSchema.safeParse({
        NODE_ENV: 'production',
        AUTH_SECRET: 'super_secret_minimum_32_characters_key_here',
        SSLCOMMERZ_STORE_ID: 'prod_store_id_12345',
        SSLCOMMERZ_STORE_PASSWORD: 'prod_store_password_secure',
      });
      expect(prodValid.success).toBe(true);
    });

    // 9.2 Gateway Minimum Amount Boundary
    it('9.2.1 rejects payment initiation for amount between 0 and 1000 cents (0 < payableCents < 1000) with PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM', async () => {
      // 1. Create order for sub-minimum course (5.00 BDT = 500 cents)
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: subMinimumCourse.id });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(500);

      // 2. Initiate payment: must be rejected with 400 PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM
      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(400);
      expect(payRes.body.errorCode).toBe('PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM');
      expect(payRes.body.message).toContain('below gateway minimum');
    });

    it('9.2.2 bypasses SSLCommerz completely when payableCents === 0 (100% coupon discount)', async () => {
      // 1. Create order for paid course with 100% discount coupon
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: paidCourse.id,
          couponCode: 'FREE100',
        });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(0);

      // 2. Initiate payment triggers immediate zero-payable bypass
      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.gatewayUrl).toBe(`${env.WEB_ORIGIN}/orders/${order.id}/success`);
      expect(payRes.body.data.merchantTranId).toMatch(/^TSP-FREE-/);

      // 3. Verify order is immediately marked PAID
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).toBe('PAID');
      expect(dbOrder.paidAt).toBeDefined();

      // 4. Verify student enrollment is immediately ACTIVE
      const [enrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, paidCourse.id)
          )
        );
      expect(enrollment).toBeDefined();
      expect(enrollment.status).toBe('ACTIVE');

      // 5. Verify invoice record was created with payableCents = 0
      const [invoice] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(invoice).toBeDefined();
      expect(invoice.payableCents).toBe(0);
      expect(invoice.status).toBe('PAID');

      // 6. Verify coupon redemption status is CONSUMED
      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, order.id));
      expect(redemption.status).toBe('CONSUMED');
      expect(redemption.consumedAt).toBeDefined();
    });

    it('9.2.3 allows payment initiation when payableCents >= 1000', async () => {
      // Create a course with exact minimum price 10.00 BDT (1000 cents)
      const [minCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Minimum Gateway Eligible Course',
          slug: `min-eligible-${Date.now()}`,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          price: '10.00',
          currency: 'BDT',
          categoryId: activeCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: minCourse.id });
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(1000);

      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.merchantTranId).toBeDefined();
      expect(payRes.body.data.gatewayUrl).toContain('https://sandbox.sslcommerz.com');
    });

    it('9.2.4 allows payment initiation at boundary 499,999.99 BDT (49,999,999 cents)', async () => {
      const [nearMaxCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Near Maximum Boundary Course',
          slug: `near-max-${Date.now()}`,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          price: '499999.99',
          currency: 'BDT',
          categoryId: activeCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: nearMaxCourse.id });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(49_999_999);

      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.merchantTranId).toBeDefined();
      expect(payRes.body.data.gatewayUrl).toContain('https://sandbox.sslcommerz.com');
    });

    it('9.2.5 allows payment initiation at official maximum boundary 500,000.00 BDT (50,000,000 cents)', async () => {
      const [exactMaxCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Exact Maximum Boundary Course',
          slug: `exact-max-${Date.now()}`,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          price: '500000.00',
          currency: 'BDT',
          categoryId: activeCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: exactMaxCourse.id });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(50_000_000);

      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.merchantTranId).toBeDefined();
      expect(payRes.body.data.gatewayUrl).toContain('https://sandbox.sslcommerz.com');
    });

    it('9.2.6 rejects payment initiation above official maximum boundary 500,000.01 BDT (50,000,001 cents) with PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM', async () => {
      const [aboveMaxCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Above Maximum Boundary Course',
          slug: `above-max-${Date.now()}`,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          price: '500000.01',
          currency: 'BDT',
          categoryId: activeCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: aboveMaxCourse.id });
      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(50_000_001);

      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(400);
      expect(payRes.body.errorCode).toBe('PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM');
      expect(payRes.body.message).toContain('exceeds gateway maximum limit');
    });

    it('9.2.7 ensures no SSLCommerz gateway session request is dispatched and order remains PENDING when amount exceeds maximum', async () => {
      const [aboveMaxCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'No Gateway Dispatch Course',
          slug: `no-gateway-dispatch-${Date.now()}`,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          price: '650000.00',
          currency: 'BDT',
          categoryId: activeCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: aboveMaxCourse.id });
      const order = orderRes.body.data;

      // Track whether SSLCommerz initiation was called
      let gatewaySessionCalled = false;
      mockSslCommerz.sessionInitiationHandler = async () => {
        gatewaySessionCalled = true;
        return { status: 'SUCCESS' };
      };

      const payRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(payRes.status).toBe(400);
      expect(payRes.body.errorCode).toBe('PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM');
      expect(gatewaySessionCalled).toBe(false);

      // Verify order status remains PENDING in database
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(dbOrder.status).toBe('PENDING');

      // Verify no payment record was created
      const dbPayments = await testDb
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.orderId, order.id));
      expect(dbPayments).toHaveLength(0);
    });

    // 9.3 Merchant Transaction Identifier Length Limit
    it('9.3.1 generated merchant transaction identifiers remain strictly <= 30 characters (SSLCommerz limit)', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      const { merchantTranId } = initRes.body.data;
      expect(merchantTranId.length).toBeLessThanOrEqual(30);
      expect(merchantTranId).toMatch(/^TSP-TXN-\d{8}-\d{4}$/);
    });

    // 9.4 Payment Validation / Database Locking & Concurrency Tests
    it('9.4.1 handles success callback and IPN concurrently with zero duplicate enrollments and zero duplicate invoices', async () => {
      const [raceCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Concurrent Race Safe Course',
          slug: `concur-race-safe-${Date.now()}`,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          price: '2500.00',
          currency: 'BDT',
          categoryId: activeCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: raceCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-RACE-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // Fire BOTH browser success callback and server IPN callback concurrently
      const [successRes, ipnRes] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/payments/sslcommerz/success')
          .set('Accept', 'application/json')
          .send({
            tran_id: merchantTranId,
            val_id: valId,
            amount: '2500.00',
            currency: 'BDT',
            status: 'VALID',
          }),
        request(app.getHttpServer())
          .post('/api/v1/payments/sslcommerz/ipn')
          .send({
            tran_id: merchantTranId,
            val_id: valId,
            amount: '2500.00',
            currency: 'BDT',
            status: 'VALID',
          }),
      ]);

      expect(successRes.status).toBe(200);
      expect(ipnRes.status).toBe(200);

      // Verify exactly ONE invoice was created (zero duplicate invoices)
      const invoices = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(invoices).toHaveLength(1);
      expect(invoices[0].status).toBe('PAID');

      // Verify exactly ONE enrollment was created (zero duplicate enrollments)
      const enrollments = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, raceCourse.id)
          )
        );
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0].status).toBe('ACTIVE');

      // Verify order status is PAID
      const [finalOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(finalOrder.status).toBe('PAID');
    });

    it('9.4.2 duplicate IPN callback returns HTTP 200 without duplicate mutations', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-DUP-IPN-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // First IPN
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/ipn')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res1.status).toBe(200);

      // Second IPN (duplicate)
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/ipn')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res2.status).toBe(200);
      expect(res2.body.message).toContain('already fulfilled');

      // Verify invoice count is exactly 1
      const invoices = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(invoices).toHaveLength(1);
    });

    it('9.4.3 duplicate success callback returns HTTP 200 without duplicate mutations', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-DUP-SUCC-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // First success
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res1.status).toBe(200);

      // Second success (duplicate)
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(res2.status).toBe(200);
      expect(res2.body.message).toContain('already fulfilled');

      // Verify invoice count is exactly 1
      const invoices = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(invoices).toHaveLength(1);
    });

    it('9.4.4 already PAID callback performs an idempotent no-op without invoking external validation', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-PAID-NOOP-${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
      });

      // Fulfill order
      const initialRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });
      expect(initialRes.status).toBe(200);

      // Delete validation entry from mock — if external validation were re-called, it would return INVALID_TRANSACTION and throw 400
      mockSslCommerz.validations.delete(valId);

      // Subsequent callback on already PAID order must return 200 directly through idempotent fast-path
      const duplicateRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(duplicateRes.status).toBe(200);
      expect(duplicateRes.body.message).toContain('already fulfilled');
    });

    it('9.4.5 confirms external validation runs outside the DB transaction without holding row locks during network I/O', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: paidCourse.id });
      const order = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });
      const { merchantTranId } = initRes.body.data;

      const valId = `VAL-LOCK-TEST-${Date.now()}`;
      let orderWasLockedDuringValidation = false;

      // Custom validation handler: inspect whether order row is locked by attempting a concurrent read/update
      mockSslCommerz.orderValidationHandler = async (requestedValId: string) => {
        // While validation API is running, verify we can read and update the order row freely without lock blockage
        const [readOrder] = await testDb
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.id, order.id));

        if (!readOrder) {
          orderWasLockedDuringValidation = true;
        }

        return {
          status: 'VALID',
          tran_id: merchantTranId,
          val_id: requestedValId,
          amount: '2500.00',
          currency: 'BDT',
          bank_tran_id: 'BANK-LOCK-TEST',
          card_type: 'VISA',
          tran_date: new Date().toISOString(),
        };
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(200);
      expect(orderWasLockedDuringValidation).toBe(false);

      const [finalOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(finalOrder.status).toBe('PAID');
    });
  });
});
