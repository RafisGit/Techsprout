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
import { eq, and, sql } from 'drizzle-orm';
import { OrdersService } from '../modules/orders/orders.service';
import { RefundsService } from '../modules/refunds/refunds.service';
import { InvoicesService } from '../modules/invoices/invoices.service';
import { FinanceService } from '../modules/finance/finance.service';
import { CouponsService } from '../modules/coupons/coupons.service';
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';

describe('P5.4.6 — Final Integrated QA & Production Hardening Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;

  let ordersService: OrdersService;
  let refundsService: RefundsService;
  let invoicesService: InvoicesService;
  let financeService: FinanceService;
  let couponsService: CouponsService;

  let studentCookies: string[];
  let student2Cookies: string[];
  let adminCookies: string[];

  let studentId: string;
  let student2Id: string;
  let adminId: string;

  let testCategory: any;
  let freeCourse: any;
  let standardCourseA: any; // 4000.00 BDT = 400,000 cents
  let standardCourseB: any; // 6000.00 BDT = 600,000 cents
  let minBoundaryCourse: any; // 10.00 BDT = 1000 cents (min gateway allowed)
  let subMinCourse: any; // 5.00 BDT = 500 cents (sub-minimum)
  let maxBoundaryCourse: any; // 500,000.00 BDT = 50,000,000 cents (max gateway allowed)
  let aboveMaxCourse: any; // 500,000.01 BDT = 50,000,001 cents (above max)

  let percent25Coupon: any; // 25% off
  let free100Coupon: any; // 100% off (zero-payable)
  let singleUseCoupon: any; // usageLimit = 1

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;
    mockSslCommerz = new MockSSLCommerzClient();

    // 1. Fetch seeded roles & users
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
        name: 'Hardening Student 2',
        username: 'hardening_student2',
        email: 'hardening_student2@techsprout.edu',
        phone: '01711112222',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = st2.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // 2. Create Category & Test Courses
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'P5 Hardening Category',
        slug: 'p5-hardening-category',
        description: 'Hardening testing category',
        isActive: true,
      })
      .returning();
    testCategory = cat;

    // Free Course (0.00 BDT)
    const [cFree] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Open Source Starter',
        slug: 'open-source-starter',
        description: 'Free onboarding course',
        price: '0.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: adminId,
      })
      .returning();
    freeCourse = cFree;

    // Standard Course A (4000.00 BDT = 400,000 cents)
    const [cA] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Hardening Course Alpha',
        slug: 'hardening-course-alpha',
        description: 'Core Alpha Course',
        price: '4000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: adminId,
      })
      .returning();
    standardCourseA = cA;

    // Standard Course B (6000.00 BDT = 600,000 cents)
    const [cB] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Hardening Course Beta',
        slug: 'hardening-course-beta',
        description: 'Core Beta Course',
        price: '6000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: adminId,
      })
      .returning();
    standardCourseB = cB;

    // Boundary Courses
    const [cMin] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Minimum Gateway Course',
        slug: 'min-gateway-course',
        description: '10.00 BDT minimum allowed course',
        price: '10.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: adminId,
      })
      .returning();
    minBoundaryCourse = cMin;

    const [cSubMin] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Sub-Minimum Course',
        slug: 'sub-min-course',
        description: '5.00 BDT rejected course',
        price: '5.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: adminId,
      })
      .returning();
    subMinCourse = cSubMin;

    const [cMax] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Maximum Gateway Course',
        slug: 'max-gateway-course',
        description: '500,000.00 BDT maximum allowed course',
        price: '500000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: adminId,
      })
      .returning();
    maxBoundaryCourse = cMax;

    const [cAboveMax] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Above Maximum Course',
        slug: 'above-max-course',
        description: '500,000.01 BDT rejected course',
        price: '500000.01',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: testCategory.id,
        instructorId: adminId,
      })
      .returning();
    aboveMaxCourse = cAboveMax;

    // 3. Create Coupons
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneMonthLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [cp25] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'HARDEN25',
        discountType: 'PERCENTAGE',
        discountValue: 25,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    percent25Coupon = cp25;

    const [cp100] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'FREE100HARDEN',
        discountType: 'PERCENTAGE',
        discountValue: 100,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    free100Coupon = cp100;

    const [cpSingle] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'SINGLEUSELIMIT',
        discountType: 'FIXED_AMOUNT',
        discountValue: 50000, // 500 BDT off
        usageLimit: 1,
        redemptionCount: 0,
        perUserLimit: 1,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    singleUseCoupon = cpSingle;

    // 4. Build Testing Module
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
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    ordersService = moduleRef.get(OrdersService);
    refundsService = moduleRef.get(RefundsService);
    invoicesService = moduleRef.get(InvoicesService);
    financeService = moduleRef.get(FinanceService);
    couponsService = moduleRef.get(CouponsService);

    // Login users to obtain sessions
    const studentLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = studentLogin.headers['set-cookie'] as unknown as string[];

    const student2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'hardening_student2@techsprout.edu',
      password: 'Password123!',
    });
    student2Cookies = student2Login.headers['set-cookie'] as unknown as string[];

    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==================================================
  // SUITE 1: END-TO-END CHECKOUT SCENARIOS (A through E)
  // ==================================================
  describe('1. End-to-End Checkout Scenarios', () => {
    it('1.1 SCENARIO A: Free course allows direct enrollment without order or payment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/enrollments')
        .set('Cookie', studentCookies)
        .send({ courseId: freeCourse.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.courseId).toBe(freeCourse.id);

      // Verify no order was generated for free course
      const [order] = await testDb
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.courseId, freeCourse.id));
      expect(order).toBeUndefined();
    });

    it('1.2 SCENARIO B: Paid course with no coupon executes server-authoritative checkout and payment fulfillment', async () => {
      // Step 1: Create Order
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: standardCourseA.id });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.subtotalCents).toBe(400000); // 4000.00 BDT
      expect(order.discountCents).toBe(0);
      expect(order.payableCents).toBe(400000);
      expect(order.status).toBe('PENDING');

      // Step 2: Initiate Payment Session
      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(201);
      expect(initRes.body.data.gatewayUrl).toContain('sslcommerz.com');
      const merchantTranId = initRes.body.data.merchantTranId;

      // Register mock validation
      mockSslCommerz.setMockValidationSuccess('VAL-AUTH-SUCCESS-001', {
        tran_id: merchantTranId,
        amount: '4000.00',
        currency: 'BDT',
      });

      // Step 3: Browser return callback (validated by server against gateway)
      const successRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: 'VAL-AUTH-SUCCESS-001',
          amount: '4000.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.status).toBe('PAID');

      // Step 4: Verify Invoice exists and is immutable
      const [invoice] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(invoice).toBeDefined();
      expect(invoice.payableCents).toBe(400000);
      expect(invoice.status).toBe('PAID');

      // Step 5: Verify Enrollment is ACTIVE
      const [enrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, standardCourseA.id)
          )
        );
      expect(enrollment).toBeDefined();
      expect(enrollment.status).toBe('ACTIVE');
    });

    it('1.3 SCENARIO C: Partial discount coupon recalculates discount server-side and issues exact payable', async () => {
      // Preview coupon
      const previewRes = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .set('Cookie', student2Cookies)
        .send({ code: 'HARDEN25', courseId: standardCourseB.id });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.subtotalCents).toBe(600000);
      expect(previewRes.body.data.discountCents).toBe(150000); // 25% of 600,000 = 150,000
      expect(previewRes.body.data.payableCents).toBe(450000);

      // Create Order applying coupon
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', student2Cookies)
        .send({ courseId: standardCourseB.id, couponCode: 'HARDEN25' });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.subtotalCents).toBe(600000);
      expect(order.discountCents).toBe(150000);
      expect(order.payableCents).toBe(450000);
      expect(order.couponCode).toBe('HARDEN25');

      // Initiate payment
      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', student2Cookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(201);
      const merchantTranId = initRes.body.data.merchantTranId;

      mockSslCommerz.setMockValidationSuccess('VAL-AUTH-DISC-002', {
        tran_id: merchantTranId,
        amount: '4500.00',
        currency: 'BDT',
      });

      // Fulfill payment
      const fulfillRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: 'VAL-AUTH-DISC-002',
          amount: '4500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(fulfillRes.status).toBe(200);
      expect(fulfillRes.body.data.status).toBe('PAID');

      // Verify invoice snapshot
      const [inv] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(inv).toBeDefined();
      expect(inv.subtotalCents).toBe(600000);
      expect(inv.discountCents).toBe(150000);
      expect(inv.payableCents).toBe(450000);
    });

    it('1.4 SCENARIO D: 100% coupon completely bypasses SSLCommerz, marks order PAID, consumes coupon, and creates enrollment', async () => {
      // Create course for 100% coupon test
      const [c100] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Full Discount Target Course',
          slug: 'full-discount-target-course',
          description: 'Course for 100% test',
          price: '2000.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      // Create Order with 100% coupon
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: c100.id, couponCode: 'FREE100HARDEN' });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.subtotalCents).toBe(200000);
      expect(order.discountCents).toBe(200000);
      expect(order.payableCents).toBe(0);

      // Initiate payment: must trigger zero-payable internal fulfillment bypass
      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(201);
      expect(initRes.body.data.gatewayUrl).toContain(`/orders/${order.id}/success`);

      // Verify order is immediately PAID without gateway callback
      const [paidOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order.id));
      expect(paidOrder.status).toBe('PAID');

      // Verify coupon redemption is CONSUMED
      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.orderId, order.id));
      expect(redemption.status).toBe('CONSUMED');

      // Verify invoice issued with 0 payable
      const [inv] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order.id));
      expect(inv).toBeDefined();
      expect(inv.payableCents).toBe(0);
      expect(inv.status).toBe('PAID');

      // Verify student enrollment is ACTIVE
      const [enrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, c100.id)
          )
        );
      expect(enrollment.status).toBe('ACTIVE');
    });

    it('1.5 SCENARIO E: Invalid coupon blocks checkout without granting unauthorized discounts', async () => {
      // Test non-existent coupon
      const fakeRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: standardCourseB.id, couponCode: 'DOESNOTEXIST99' });

      expect(fakeRes.status).toBe(404);
      expect(fakeRes.body.errorCode).toBe('COUPON_NOT_FOUND');

      // Test tampered client price field rejected by strict schema
      const tamperRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardCourseB.id,
          priceCents: 100, // Attempted tampering
        });

      expect(tamperRes.status).toBe(400);
      expect(tamperRes.body.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  // ==================================================
  // SUITE 2: GATEWAY BOUNDARY TESTS (Item 3)
  // ==================================================
  describe('2. Gateway Boundary Enforcements', () => {
    it('2.1 rejects order payable between 1 and 999 cents before contacting gateway', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: subMinCourse.id });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(500); // 5.00 BDT

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(400);
      expect(initRes.body.errorCode).toBe('PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM');
    });

    it('2.2 permits exactly 1000 cents (10.00 BDT) as minimum gateway boundary', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: minBoundaryCourse.id });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(1000);

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(201);
      expect(initRes.body.data.gatewayUrl).toBeDefined();
    });

    it('2.3 permits exactly 50,000,000 cents (500,000.00 BDT) as maximum gateway boundary', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: maxBoundaryCourse.id });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(50000000);

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(201);
      expect(initRes.body.data.gatewayUrl).toBeDefined();
    });

    it('2.4 rejects order exceeding 50,000,000 cents (50,000,001 cents) before contacting gateway', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: aboveMaxCourse.id });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data;
      expect(order.payableCents).toBe(50000001);

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: order.id });

      expect(initRes.status).toBe(400);
      expect(initRes.body.errorCode).toBe('PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM');
    });
  });

  // ==================================================
  // SUITE 3: PAYMENT RETURN SECURITY (Item 4)
  // ==================================================
  describe('3. Payment Return Security', () => {
    let securityOrder: any;
    let validMerchantTranId: string;

    beforeAll(async () => {
      const [cSec] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Return Security Course',
          slug: 'return-security-course',
          description: 'Security testing course',
          price: '3500.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: cSec.id });

      securityOrder = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: securityOrder.id });

      validMerchantTranId = initRes.body.data.merchantTranId;
    });

    it('3.1 forged transaction ID in callback is rejected and does not produce PAID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: 'TSP-TXN-FORGED-FAKE-999',
          val_id: 'VAL-FORGED-001',
          amount: '3500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('PAYMENT_NOT_FOUND');

      const [order] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, securityOrder.id));
      expect(order.status).toBe('PAYMENT_PROCESSING');
    });

    it('3.2 forged validation status from gateway is rejected', async () => {
      mockSslCommerz.orderValidationHandler = async (valId: string) => ({
        status: 'INVALID_TRANSACTION',
        tran_id: validMerchantTranId,
        val_id: valId,
        amount: '3500.00',
        currency: 'BDT',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: validMerchantTranId,
          val_id: 'VAL-INVALID-SIM',
          amount: '3500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('PAYMENT_VALIDATION_FAILED');

      const [order] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, securityOrder.id));
      expect(order.status).toBe('PAYMENT_PROCESSING');
    });

    it('3.3 amount tampering between callback and internal order is rejected', async () => {
      mockSslCommerz.orderValidationHandler = undefined;
      mockSslCommerz.setMockValidationSuccess('VAL-TAMPER-AMOUNT', {
        tran_id: validMerchantTranId,
        amount: '100.00', // Mismatched (internal expects 3500.00)
        currency: 'BDT',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: validMerchantTranId,
          val_id: 'VAL-TAMPER-AMOUNT',
          amount: '100.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('PAYMENT_AMOUNT_MISMATCH');

      const [order] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, securityOrder.id));
      expect(order.status).toBe('PAYMENT_PROCESSING');
    });

    it('3.4 currency tampering between callback and internal order is rejected', async () => {
      mockSslCommerz.setMockValidationSuccess('VAL-TAMPER-CURRENCY', {
        tran_id: validMerchantTranId,
        amount: '3500.00',
        currency: 'USD', // Mismatched currency
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: validMerchantTranId,
          val_id: 'VAL-TAMPER-CURRENCY',
          amount: '3500.00',
          currency: 'USD',
          status: 'VALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('PAYMENT_CURRENCY_MISMATCH');
    });
  });

  // ==================================================
  // SUITE 4: PAYMENT IDEMPOTENCY & REPLAY (Item 5)
  // ==================================================
  describe('4. Payment Idempotency & Replay Protection', () => {
    let idempotentOrder: any;
    let merchantTranId: string;

    beforeAll(async () => {
      const [cIdem] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Idempotency Test Course',
          slug: 'idempotency-test-course',
          description: 'Idempotency testing course',
          price: '2800.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: cIdem.id });

      idempotentOrder = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: idempotentOrder.id });

      merchantTranId = initRes.body.data.merchantTranId;

      mockSslCommerz.setMockValidationSuccess('VAL-IDEM-001', {
        tran_id: merchantTranId,
        amount: '2800.00',
        currency: 'BDT',
      });
      mockSslCommerz.setMockValidationSuccess('VAL-IDEM-DUPLICATE', {
        tran_id: merchantTranId,
        amount: '2800.00',
        currency: 'BDT',
      });
      mockSslCommerz.setMockValidationSuccess('VAL-IDEM-IPN', {
        tran_id: merchantTranId,
        amount: '2800.00',
        currency: 'BDT',
      });
    });

    it('4.1 first callback fulfills payment; second duplicate callback returns idempotent success without duplicate invoices or enrollments', async () => {
      // 1. First fulfillment call
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: 'VAL-IDEM-001',
          amount: '2800.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.status).toBe('PAID');

      // 2. Second duplicate callback with same or different val_id
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: 'VAL-IDEM-DUPLICATE',
          amount: '2800.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.message).toContain('Payment already fulfilled');

      // Verify exactly ONE invoice exists for this order
      const invoicesList = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, idempotentOrder.id));
      expect(invoicesList.length).toBe(1);

      // Verify exactly ONE enrollment exists for this course/student
      const enrollmentsList = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, idempotentOrder.items[0].courseId)
          )
        );
      expect(enrollmentsList.length).toBe(1);
    });

    it('4.2 duplicate IPN callback is processed idempotently', async () => {
      const ipnRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/ipn')
        .send({
          tran_id: merchantTranId,
          val_id: 'VAL-IDEM-IPN',
          amount: '2800.00',
          currency: 'BDT',
          status: 'VALID',
        });

      expect(ipnRes.status).toBe(200);
      expect(ipnRes.body.message).toContain('Order already fulfilled');
    });

    it('4.3 simultaneous concurrent fulfillment requests execute cleanly without race conditions', async () => {
      // Create a new order for concurrent test
      const [cConc] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Concurrent Fulfillment Course',
          slug: 'concurrent-fulfillment-course',
          description: 'Testing concurrency in fulfillment',
          price: '2200.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', student2Cookies)
        .send({ courseId: cConc.id });

      const concOrder = orderRes.body.data;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', student2Cookies)
        .send({ orderId: concOrder.id });

      const concTranId = initRes.body.data.merchantTranId;

      mockSslCommerz.setMockValidationSuccess('VAL-CONC-001', {
        tran_id: concTranId,
        amount: '2200.00',
        currency: 'BDT',
      });
      mockSslCommerz.setMockValidationSuccess('VAL-CONC-002', {
        tran_id: concTranId,
        amount: '2200.00',
        currency: 'BDT',
      });

      // Fire 2 concurrent fulfillment requests
      const [p1, p2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/payments/sslcommerz/success')
          .set('Accept', 'application/json')
          .send({
            tran_id: concTranId,
            val_id: 'VAL-CONC-001',
            amount: '2200.00',
            currency: 'BDT',
            status: 'VALID',
          }),
        request(app.getHttpServer())
          .post('/api/v1/payments/sslcommerz/success')
          .set('Accept', 'application/json')
          .send({
            tran_id: concTranId,
            val_id: 'VAL-CONC-002',
            amount: '2200.00',
            currency: 'BDT',
            status: 'VALID',
          }),
      ]);

      expect(p1.status).toBe(200);
      expect(p2.status).toBe(200);

      // Exactly ONE invoice created
      const invoicesList = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, concOrder.id));
      expect(invoicesList.length).toBe(1);

      // Exactly ONE enrollment created
      const enrollmentsList = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, student2Id),
            eq(schema.enrollments.courseId, cConc.id)
          )
        );
      expect(enrollmentsList.length).toBe(1);
    });
  });

  // ==================================================
  // SUITE 5: COUPON CONCURRENCY & COUNTER INTEGRITY (Item 6)
  // ==================================================
  describe('5. Coupon Concurrency & Counter Integrity', () => {
    it('5.1 usageLimit = 1 allows exactly one reservation; subsequent order fails with COUPON_USAGE_LIMIT_REACHED', async () => {
      const [cLimit] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Limit Test Course',
          slug: 'limit-test-course',
          description: 'Course for coupon limit test',
          price: '5000.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      // First order succeeds and reserves the coupon
      const orderA = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({ courseId: cLimit.id, couponCode: 'SINGLEUSELIMIT' });

      expect(orderA.status).toBe(201);
      expect(orderA.body.data.couponCode).toBe('SINGLEUSELIMIT');

      // Second order with the same coupon fails because usage limit is reached
      const orderB = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', student2Cookies)
        .send({ courseId: cLimit.id, couponCode: 'SINGLEUSELIMIT' });

      expect(orderB.status).toBe(400);
      expect(orderB.body.errorCode).toBe('COUPON_USAGE_LIMIT_REACHED');

      // Verify coupon redemptionCount in database is strictly 1 (no overrun)
      const [cp] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'SINGLEUSELIMIT'));
      expect(cp.redemptionCount).toBe(1);
    });

    it('5.2 order cancellation/expiration transitions coupon redemption RESERVED -> RELEASED and decrements counter', async () => {
      // Find the order that acquired SINGLEUSELIMIT
      const [redemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(
          and(
            eq(schema.couponRedemptions.couponId, singleUseCoupon.id),
            eq(schema.couponRedemptions.status, 'RESERVED')
          )
        );

      expect(redemption).toBeDefined();

      // Trigger expiration
      const expired = await ordersService.expireOrderIfDue(redemption.orderId);
      expect(expired).toBe(true);

      // Verify redemption is RELEASED
      const [updatedRedemption] = await testDb
        .select()
        .from(schema.couponRedemptions)
        .where(eq(schema.couponRedemptions.id, redemption.id));
      expect(updatedRedemption.status).toBe('RELEASED');

      // Verify coupon redemption count was decremented back to 0
      const [couponRecord] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, singleUseCoupon.id));
      expect(couponRecord.redemptionCount).toBe(0);
    });

    it('5.3 coupon preview endpoint is strictly read-only and does not mutate database counters', async () => {
      const [beforeCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'HARDEN25'));
      const beforeCount = beforeCoupon.redemptionCount;

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/coupons/validate')
          .set('Cookie', studentCookies)
          .send({ code: 'HARDEN25', courseId: standardCourseB.id });
      }

      const [afterCoupon] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'HARDEN25'));
      expect(afterCoupon.redemptionCount).toBe(beforeCount);
    });
  });

  // ==================================================
  // SUITE 6: REFUND END-TO-END & SCOPED FINALIZATION (Items 7, 8, 9, 10)
  // ==================================================
  describe('6. Refund Operations & Scoped Reversal Security', () => {
    let studentMultiCourseA: any;
    let studentMultiCourseB: any;
    let paidOrderA: any;
    let paidOrderB: any;
    let certA: any;
    let certB: any;

    beforeAll(async () => {
      // Set up two distinct courses for student
      const [cA] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Student Multi Course A',
          slug: 'student-multi-course-a',
          description: 'A',
          price: '3000.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();
      studentMultiCourseA = cA;

      const [cB] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Student Multi Course B',
          slug: 'student-multi-course-b',
          description: 'B',
          price: '4500.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();
      studentMultiCourseB = cB;

      // Order & Pay Course A
      const oA = await ordersService.createOrder(studentId, { courseId: cA.id });
      paidOrderA = oA;
      const initA = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: oA.id });

      mockSslCommerz.setMockValidationSuccess('VAL-MULTI-A', {
        tran_id: initA.body.data.merchantTranId,
        amount: '3000.00',
        currency: 'BDT',
      });

      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .send({
          tran_id: initA.body.data.merchantTranId,
          val_id: 'VAL-MULTI-A',
          amount: '3000.00',
          currency: 'BDT',
          status: 'VALID',
        });

      // Order & Pay Course B
      const oB = await ordersService.createOrder(studentId, { courseId: cB.id });
      paidOrderB = oB;
      const initB = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: oB.id });

      mockSslCommerz.setMockValidationSuccess('VAL-MULTI-B', {
        tran_id: initB.body.data.merchantTranId,
        amount: '4500.00',
        currency: 'BDT',
      });

      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .send({
          tran_id: initB.body.data.merchantTranId,
          val_id: 'VAL-MULTI-B',
          amount: '4500.00',
          currency: 'BDT',
          status: 'VALID',
        });

      // Issue certificates for both courses
      const [enrA] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, cA.id)
          )
        );
      const [enrB] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, cB.id)
          )
        );

      const [crtA] = await testDb
        .insert(schema.certificates)
        .values({
          certificateNumber: 'TSP-CERT-AAA-001',
          enrollmentId: enrA.id,
          courseId: cA.id,
          studentId: studentId,
          studentName: 'Student TechSprout',
          courseTitle: cA.title,
          instructorName: 'Admin TechSprout',
          completedAt: new Date(),
          status: 'ACTIVE',
        })
        .returning();
      certA = crtA;

      const [crtB] = await testDb
        .insert(schema.certificates)
        .values({
          certificateNumber: 'TSP-CERT-BBB-002',
          enrollmentId: enrB.id,
          courseId: cB.id,
          studentId: studentId,
          studentName: 'Student TechSprout',
          courseTitle: cB.title,
          instructorName: 'Admin TechSprout',
          completedAt: new Date(),
          status: 'ACTIVE',
        })
        .returning();
      certB = crtB;
    });

    it('6.1 admin initiates refund -> provider accepts -> refund PENDING, order remains PAID, enrollment ACTIVE, cert ACTIVE', async () => {
      mockSslCommerz.refundInitiationHandler = async () => ({
        APIConnect: 'DONE',
        status: 'processing',
        refund_ref_id: 'SSL-REF-ALPHA-99',
      });

      const initRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${paidOrderA.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Student requested course A refund' });

      expect(initRes.status).toBe(200);
      expect(initRes.body.data.status).toBe('PENDING');
      expect(initRes.body.data.providerRefundRef).toBe('SSL-REF-ALPHA-99');

      // Order must remain PAID until gateway query confirms settlement
      const [order] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, paidOrderA.id));
      expect(order.status).toBe('PAID');

      // Enrollment must remain ACTIVE
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, studentMultiCourseA.id)
          )
        );
      expect(enr.status).toBe('ACTIVE');

      // Certificate must remain ACTIVE
      const [crt] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, certA.id));
      expect(crt.status).toBe('ACTIVE');
    });

    it('6.2 gateway status query returns "processing" -> refund remains PENDING, no local domain changes', async () => {
      const [refund] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, paidOrderA.id));

      mockSslCommerz.refundQueryHandler = async (refId: string) => ({
        APIConnect: 'DONE',
        status: 'processing',
        refund_ref_id: refId,
      });

      const queryRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refund.id}/query`)
        .set('Cookie', adminCookies)
        .send();

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.data.status).toBe('PENDING');

      const [order] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, paidOrderA.id));
      expect(order.status).toBe('PAID');
    });

    it('6.3 gateway query returns "refunded" -> atomic reversal finalizes strictly scoped: Order A REFUNDED, Invoice A REFUNDED, Enrollment A CANCELLED, Cert A REVOKED; Course B remains 100% ACTIVE', async () => {
      const [refund] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, paidOrderA.id));

      mockSslCommerz.refundQueryHandler = async (refId: string) => ({
        APIConnect: 'DONE',
        status: 'refunded',
        refund_ref_id: refId,
      });

      const finalizeRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refund.id}/query`)
        .set('Cookie', adminCookies)
        .send();

      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.data.status).toBe('PROCESSED');

      // 1. Order A is REFUNDED
      const [orderA] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, paidOrderA.id));
      expect(orderA.status).toBe('REFUNDED');

      // 2. Invoice A is REFUNDED
      const [invA] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, paidOrderA.id));
      expect(invA.status).toBe('REFUNDED');

      // 3. Enrollment A is CANCELLED
      const [enrA] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, studentMultiCourseA.id)
          )
        );
      expect(enrA.status).toBe('CANCELLED');

      // 4. Certificate A is REVOKED
      const [revokedCertA] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, certA.id));
      expect(revokedCertA.status).toBe('REVOKED');
      expect(revokedCertA.revocationReason).toBe('Order refunded');

      // 5. CRITICAL SCOPE CHECK: Course B enrollment & certificate MUST remain ACTIVE
      const [orderB] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, paidOrderB.id));
      expect(orderB.status).toBe('PAID');

      const [enrB] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, studentMultiCourseB.id)
          )
        );
      expect(enrB.status).toBe('ACTIVE');

      const [activeCertB] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, certB.id));
      expect(activeCertB.status).toBe('ACTIVE');
    });

    it('6.4 refund retry safety: processed refund cannot be retried', async () => {
      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${paidOrderA.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Attempt duplicate retry' });

      expect(retryRes.status).toBe(400);
      expect(retryRes.body.errorCode).toBe('REFUND_ALREADY_PROCESSED');
    });

    it('6.5 refund failure handling: provider rejection marks refund FAILED, order remains PAID, retry reuses singleton row', async () => {
      // Create Order C for failure test
      const [cFail] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Refund Failure Test Course',
          slug: 'refund-failure-test-course',
          description: 'Failure test',
          price: '3200.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      const oC = await ordersService.createOrder(studentId, { courseId: cFail.id });
      const initC = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: oC.id });

      mockSslCommerz.setMockValidationSuccess('VAL-FAIL-01', {
        tran_id: initC.body.data.merchantTranId,
        amount: '3200.00',
        currency: 'BDT',
      });

      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .send({
          tran_id: initC.body.data.merchantTranId,
          val_id: 'VAL-FAIL-01',
          amount: '3200.00',
          currency: 'BDT',
          status: 'VALID',
        });

      // Provider rejects initiation
      mockSslCommerz.refundInitiationHandler = async () => ({
        APIConnect: 'FAILED',
        status: 'failed',
        errorReason: 'Card issuer rejected refund',
      });

      const failInit = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${oC.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Initial refund attempt that fails' });

      expect(failInit.status).toBe(400);
      expect(failInit.body.errorCode).toBe('REFUND_PROVIDER_FAILED');

      // Verify refund status is FAILED and order is still PAID
      const [failedRefund] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, oC.id));
      expect(failedRefund.status).toBe('FAILED');
      const originalRefundNumber = failedRefund.refundNumber;

      const [orderStillPaid] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, oC.id));
      expect(orderStillPaid.status).toBe('PAID');

      // Admin retries the failed refund -> provider accepts
      mockSslCommerz.refundInitiationHandler = async () => ({
        APIConnect: 'DONE',
        status: 'processing',
        refund_ref_id: 'SSL-RETRY-REF-SUCCESS',
      });

      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${oC.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Retried refund with updated justification' });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.status).toBe('PENDING');

      // Assert it reused the exact same refund row and preserved refundNumber
      const [retriedRefund] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, oC.id));
      expect(retriedRefund.id).toBe(failedRefund.id);
      expect(retriedRefund.refundNumber).toBe(originalRefundNumber);
    });
  });

  // ==================================================
  // SUITE 7: INVOICE IMMUTABILITY (Item 11)
  // ==================================================
  describe('7. Invoice Immutability', () => {
    it('7.1 modifying course title, course price, and student profile does not alter invoice snapshot fields', async () => {
      // 1. Create a course, student order, and payment
      const [cInv] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Immutable Snapshot Course',
          slug: 'immutable-snapshot-course',
          description: 'Original description',
          price: '4200.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      const o = await ordersService.createOrder(studentId, { courseId: cInv.id });
      const init = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId: o.id });

      mockSslCommerz.setMockValidationSuccess('VAL-INV-IMMUTABLE', {
        tran_id: init.body.data.merchantTranId,
        amount: '4200.00',
        currency: 'BDT',
      });

      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .send({
          tran_id: init.body.data.merchantTranId,
          val_id: 'VAL-INV-IMMUTABLE',
          amount: '4200.00',
          currency: 'BDT',
          status: 'VALID',
        });

      // 2. Fetch original invoice
      const [originalInv] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, o.id));

      expect(originalInv).toBeDefined();
      expect(originalInv.courseTitle).toBe('Immutable Snapshot Course');
      expect(originalInv.payableCents).toBe(420000);
      expect(originalInv.studentName).toBe('Test Student');

      // 3. Mutate course title & price in catalog
      await testDb
        .update(schema.courses)
        .set({
          title: 'MUTATED Modern Next.js Course',
          price: '9999.00',
        })
        .where(eq(schema.courses.id, cInv.id));

      // 4. Mutate student profile
      await testDb
        .update(schema.users)
        .set({
          name: 'MUTATED Student Name',
          email: 'mutated_email@techsprout.edu',
        })
        .where(eq(schema.users.id, studentId));

      // 5. Fetch invoice through API as student
      const invApiRes = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${originalInv.id}`)
        .set('Cookie', studentCookies);

      expect(invApiRes.status).toBe(200);
      const fetched = invApiRes.body.data;

      // Verify all snapshot fields remain 100% identical to creation time
      expect(fetched.courseTitle).toBe('Immutable Snapshot Course');
      expect(fetched.payableCents).toBe(420000);
      expect(fetched.studentName).toBe('Test Student');
      expect(fetched.studentEmail).toBe('student@techsprout.edu');
    });
  });

  // ==================================================
  // SUITE 8: FINANCE AGGREGATIONS CORRECTNESS (Item 12)
  // ==================================================
  describe('8. Finance Aggregations Correctness', () => {
    it('8.1 verifies gross volume, total discounts, confirmed refunds, and net revenue strictly reconcile', async () => {
      const summary = await financeService.getFinanceSummary();

      // Database ground truth calculations
      const [finalizedOrders] = await testDb
        .select({
          expectedGross: sql<string>`COALESCE(SUM("payable_cents"), 0)`,
          expectedDiscounts: sql<string>`COALESCE(SUM("discount_cents"), 0)`,
        })
        .from(schema.orders)
        .where(sql`"status" IN ('PAID', 'REFUNDED')`);

      const [confirmedRefunds] = await testDb
        .select({
          expectedRefunds: sql<string>`COALESCE(SUM("amount_cents"), 0)`,
        })
        .from(schema.refunds)
        .where(eq(schema.refunds.status, 'PROCESSED'));

      const expectedGross = Number(finalizedOrders.expectedGross);
      const expectedDiscounts = Number(finalizedOrders.expectedDiscounts);
      const expectedRefunds = Number(confirmedRefunds.expectedRefunds);
      const expectedNetRevenue = expectedGross - expectedRefunds;

      expect(summary.totalGrossVolumeCents).toBe(expectedGross);
      expect(summary.totalDiscountCents).toBe(expectedDiscounts);
      expect(summary.totalRefundCents).toBe(expectedRefunds);
      expect(summary.totalNetRevenueCents).toBe(expectedNetRevenue);

      // Verify unconfirmed (failed / pending) refunds DO NOT reduce net revenue
      const [allRefunds] = await testDb
        .select({
          allRefundsTotal: sql<string>`COALESCE(SUM("amount_cents"), 0)`,
        })
        .from(schema.refunds);
      const allRefundsAmount = Number(allRefunds.allRefundsTotal);

      // If there are non-processed refunds in DB, totalRefundCents must strictly be less than all refunds
      if (allRefundsAmount > expectedRefunds) {
        expect(summary.totalRefundCents).toBeLessThan(allRefundsAmount);
      }
    });

    it('8.2 verifies finance metrics with mixed dataset (PAID, REFUNDED, PENDING, FAILED, CANCELLED, zero-payable, PROCESSED/PENDING/FAILED refunds)', async () => {
      const nowTs = Date.now();
      const [metricStudent] = await testDb
        .insert(schema.users)
        .values({
          name: 'Metric Test Student',
          username: `metric_student_${nowTs}`,
          email: `metric_student_${nowTs}@techsprout.edu`,
          passwordHash: 'dummy',
        })
        .returning();

      // Snapshot baseline before additions
      const baseline = await financeService.getFinanceSummary();

      // Order 1: PAID, standard 500000 cents (subtotal 500000, discount 0, payable 500000)
      const [ordPaid] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: `TSP-ORD-METRIC-PAID-${Date.now()}`,
          studentId: metricStudent.id,
          status: 'PAID',
          subtotalCents: 500000,
          discountCents: 0,
          payableCents: 500000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      // Order 2: PAID, discounted (subtotal 400000, discount 100000, payable 300000)
      const [ordDiscounted] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: `TSP-ORD-METRIC-DISC-${Date.now()}`,
          studentId: metricStudent.id,
          status: 'PAID',
          subtotalCents: 400000,
          discountCents: 100000,
          payableCents: 300000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      // Order 3: PAID, zero-payable (subtotal 200000, discount 200000, payable 0)
      await testDb
        .insert(schema.orders)
        .values({
          orderNumber: `TSP-ORD-METRIC-ZERO-${Date.now()}`,
          studentId: metricStudent.id,
          status: 'PAID',
          subtotalCents: 200000,
          discountCents: 200000,
          payableCents: 0,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        });

      // Order 4: REFUNDED, payable 350000 cents, with PROCESSED refund
      const [ordRefunded] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: `TSP-ORD-METRIC-REF-${Date.now()}`,
          studentId: metricStudent.id,
          status: 'REFUNDED',
          subtotalCents: 350000,
          discountCents: 0,
          payableCents: 350000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      const [payRefunded] = await testDb
        .insert(schema.payments)
        .values({
          orderId: ordRefunded.id,
          merchantTranId: `TRAN-METRIC-REF-${Date.now()}`,
          provider: 'SSLCOMMERZ',
          amountCents: 350000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      await testDb.insert(schema.refunds).values({
        refundNumber: `TSP-REF-METRIC-PROCESSED-${Date.now()}`,
        orderId: ordRefunded.id,
        paymentId: payRefunded.id,
        amountCents: 350000,
        currency: 'BDT',
        reason: 'Confirmed processed refund',
        status: 'PROCESSED',
        processedAt: new Date(),
      });

      // Order 5: PENDING (payable 600000) - must NOT be in gross volume
      await testDb.insert(schema.orders).values({
        orderNumber: `TSP-ORD-METRIC-PEND-${Date.now()}`,
        studentId: metricStudent.id,
        status: 'PENDING',
        subtotalCents: 600000,
        discountCents: 0,
        payableCents: 600000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Order 6: FAILED (payable 700000) - must NOT be in gross volume
      await testDb.insert(schema.orders).values({
        orderNumber: `TSP-ORD-METRIC-FAIL-${Date.now()}`,
        studentId: metricStudent.id,
        status: 'FAILED',
        subtotalCents: 700000,
        discountCents: 0,
        payableCents: 700000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Order 7: CANCELLED (payable 800000) - must NOT be in gross volume
      await testDb.insert(schema.orders).values({
        orderNumber: `TSP-ORD-METRIC-CANC-${Date.now()}`,
        studentId: metricStudent.id,
        status: 'CANCELLED',
        subtotalCents: 800000,
        discountCents: 0,
        payableCents: 800000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Add PENDING refund on Order 1 (150000) - must NOT reduce net revenue
      const [payPaid1] = await testDb
        .insert(schema.payments)
        .values({
          orderId: ordPaid.id,
          merchantTranId: `TRAN-METRIC-PAID-${Date.now()}`,
          provider: 'SSLCOMMERZ',
          amountCents: 500000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      await testDb.insert(schema.refunds).values({
        refundNumber: `TSP-REF-METRIC-PENDING-${Date.now()}`,
        orderId: ordPaid.id,
        paymentId: payPaid1.id,
        amountCents: 150000,
        currency: 'BDT',
        reason: 'Pending refund',
        status: 'PENDING',
      });

      // Add FAILED refund on Order 2 (200000) - must NOT reduce net revenue
      const [payPaid2] = await testDb
        .insert(schema.payments)
        .values({
          orderId: ordDiscounted.id,
          merchantTranId: `TRAN-METRIC-DISC-${Date.now()}`,
          provider: 'SSLCOMMERZ',
          amountCents: 300000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      await testDb.insert(schema.refunds).values({
        refundNumber: `TSP-REF-METRIC-FAILED-${Date.now()}`,
        orderId: ordDiscounted.id,
        paymentId: payPaid2.id,
        amountCents: 200000,
        currency: 'BDT',
        reason: 'Failed refund',
        status: 'FAILED',
      });

      const updated = await financeService.getFinanceSummary();

      // Delta calculations:
      // Gross Volume delta: 500000 (ordPaid) + 300000 (ordDiscounted) + 0 (ordZero) + 350000 (ordRefunded) = 1150000
      expect(updated.totalGrossVolumeCents - baseline.totalGrossVolumeCents).toBe(1150000);
      // Discount delta: 0 + 100000 + 200000 + 0 = 300000
      expect(updated.totalDiscountCents - baseline.totalDiscountCents).toBe(300000);
      // Confirmed Refund delta: PROCESSED only = 350000
      expect(updated.totalRefundCents - baseline.totalRefundCents).toBe(350000);
      // Net Revenue delta: 1150000 - 350000 = 800000
      expect(updated.totalNetRevenueCents - baseline.totalNetRevenueCents).toBe(800000);
      // Counts deltas
      expect(updated.totalPaidOrdersCount - baseline.totalPaidOrdersCount).toBe(3);
      expect(updated.totalRefundedOrdersCount - baseline.totalRefundedOrdersCount).toBe(1);
      expect(updated.totalPendingOrdersCount - baseline.totalPendingOrdersCount).toBe(1);
      expect((updated.totalCancelledOrdersCount ?? 0) - (baseline.totalCancelledOrdersCount ?? 0)).toBe(1);
    });
  });

  // ==================================================
  // SUITE 9: RECONCILIATION SAFETY & IDEMPOTENCY (Items 13, 14, 15)
  // ==================================================
  describe('9. Reconciliation Safety & Idempotent Repair', () => {
    it('9.1 GATEWAY_VALIDATED_INTERNAL_PENDING requires transaction identity to be auto-resolvable; missing val_id requires manual review', async () => {
      // Delayed order with missing bankTranId on payment
      const [ambigOrder] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-AMBIG-IDENTITY',
          studentId,
          status: 'PAYMENT_PROCESSING',
          subtotalCents: 300000,
          discountCents: 0,
          payableCents: 300000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      await testDb.insert(schema.orderItems).values({
        orderId: ambigOrder.id,
        courseId: standardCourseA.id,
        courseTitle: standardCourseA.title,
        unitPriceCents: 300000,
        discountCents: 0,
        payableCents: 300000,
      });

      // Insert payment with NULL bankTranId
      await testDb.insert(schema.payments).values({
        orderId: ambigOrder.id,
        merchantTranId: 'TRAN-AMBIG-IDENTITY',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-AMBIG-99',
        bankTranId: null, // MISSING
        amountCents: 300000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      const scanResult = await financeService.scanReconciliation({ dryRun: false });
      const disc = scanResult.discrepancies.find((d) => d.orderId === ambigOrder.id);

      expect(disc).toBeDefined();
      expect(disc?.discrepancyType).toBe('GATEWAY_VALIDATED_INTERNAL_PENDING');
      expect(disc?.autoResolvable).toBe(false); // Flagged for manual review!

      // Order must NOT have been auto-resolved to PAID
      const [orderCheck] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, ambigOrder.id));
      expect(orderCheck.status).toBe('PAYMENT_PROCESSING');
    });

    it('9.2 cancelled order with validated payment is flagged autoResolvable = false and never converted to PAID', async () => {
      const [cancOrder] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-CANCELLED-GATEWAY',
          studentId,
          status: 'CANCELLED',
          subtotalCents: 200000,
          discountCents: 0,
          payableCents: 200000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() - 3600000),
        })
        .returning();

      await testDb.insert(schema.payments).values({
        orderId: cancOrder.id,
        merchantTranId: 'TRAN-CANC-99',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-CANC-99',
        bankTranId: 'BANK-CANC-99',
        amountCents: 200000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      const scanResult = await financeService.scanReconciliation({ dryRun: false });
      const disc = scanResult.discrepancies.find((d) => d.orderId === cancOrder.id);

      expect(disc).toBeDefined();
      expect(disc?.autoResolvable).toBe(false);

      const [orderCheck] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, cancOrder.id));
      expect(orderCheck.status).toBe('CANCELLED');
    });

    it('9.3 PAID_WITHOUT_ENROLLMENT auto-repairs enrollment when payment is validated, and remains idempotent on repeated scans', async () => {
      // Create course & order in PAID status with validated payment, but enrollment intentionally deleted
      const [cRepair] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Enrollment Repair Course',
          slug: 'enrollment-repair-course',
          description: 'Repair test',
          price: '1500.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      const [repairOrder] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-ENR-REPAIR-01',
          studentId,
          status: 'PAID',
          subtotalCents: 150000,
          discountCents: 0,
          payableCents: 150000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      await testDb.insert(schema.orderItems).values({
        orderId: repairOrder.id,
        courseId: cRepair.id,
        courseTitle: cRepair.title,
        unitPriceCents: 150000,
        discountCents: 0,
        payableCents: 150000,
      });

      await testDb.insert(schema.payments).values({
        orderId: repairOrder.id,
        merchantTranId: 'TRAN-ENR-REPAIR-01',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-ENR-01',
        bankTranId: 'BANK-ENR-01',
        amountCents: 150000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      // First reconciliation scan: must detect and auto-repair missing enrollment
      const firstScan = await financeService.scanReconciliation({ dryRun: false });
      const repairDisc = firstScan.discrepancies.find((d) => d.orderId === repairOrder.id);
      expect(repairDisc).toBeDefined();
      expect(repairDisc?.discrepancyType).toBe('PAID_WITHOUT_ENROLLMENT');
      expect(repairDisc?.autoResolvable).toBe(true);

      // Verify enrollment now exists and is ACTIVE
      const [repairedEnrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, cRepair.id)
          )
        );
      expect(repairedEnrollment).toBeDefined();
      expect(repairedEnrollment.status).toBe('ACTIVE');

      // Second reconciliation scan: must be IDEMPOTENT (no duplicate repair, 0 discrepancies for this order)
      const secondScan = await financeService.scanReconciliation({ dryRun: false });
      const secondDisc = secondScan.discrepancies.find((d) => d.orderId === repairOrder.id);
      expect(secondDisc).toBeUndefined();
    });

    it('9.4 proves that an unrelated course cannot be auto-enrolled during reconciliation, and only the exact course linked to the order item is enrolled', async () => {
      // 1. Create two separate courses: Course Target vs Course Unrelated
      const [targetCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Target Reconciled Course',
          slug: `target-course-${Date.now()}`,
          description: 'Target',
          price: '2500.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      const [unrelatedCourse] = await testDb
        .insert(schema.courses)
        .values({
          title: 'Unrelated Course Not To Be Enrolled',
          slug: `unrelated-course-${Date.now()}`,
          description: 'Unrelated',
          price: '2500.00',
          currency: 'BDT',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          categoryId: testCategory.id,
          instructorId: adminId,
        })
        .returning();

      // Create a student
      const studentTs = Date.now();
      const [testStudent] = await testDb
        .insert(schema.users)
        .values({
          name: 'Strict Scope Student',
          username: `strict_student_${studentTs}`,
          email: `strict_student_${studentTs}@techsprout.edu`,
          passwordHash: 'dummy',
        })
        .returning();

      // 2. Create pending order for TARGET course only
      const [pendingOrder] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: `TSP-ORD-STRICT-${Date.now()}`,
          studentId: testStudent.id,
          status: 'PAYMENT_PROCESSING',
          subtotalCents: 250000,
          discountCents: 0,
          payableCents: 250000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      await testDb.insert(schema.orderItems).values({
        orderId: pendingOrder.id,
        courseId: targetCourse.id, // Strictly Target Course!
        courseTitle: targetCourse.title,
        unitPriceCents: 250000,
        discountCents: 0,
        payableCents: 250000,
      });

      await testDb.insert(schema.payments).values({
        orderId: pendingOrder.id,
        merchantTranId: `TRAN-STRICT-${Date.now()}`,
        provider: 'SSLCOMMERZ',
        valId: `VAL-STRICT-${Date.now()}`,
        bankTranId: `BANK-STRICT-${Date.now()}`,
        amountCents: 250000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      // 3. Run reconciliation scan with auto-resolve enabled
      const scanRes = await financeService.scanReconciliation({ dryRun: false });
      const disc = scanRes.discrepancies.find((d) => d.orderId === pendingOrder.id);
      expect(disc).toBeDefined();
      expect(disc?.autoResolvable).toBe(true);

      // 4. Verify TARGET course was enrolled
      const [targetEnrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, testStudent.id),
            eq(schema.enrollments.courseId, targetCourse.id)
          )
        );
      expect(targetEnrollment).toBeDefined();
      expect(targetEnrollment.status).toBe('ACTIVE');

      // 5. CRITICAL INVARIANT: UNRELATED course MUST NOT be enrolled
      const [unrelatedEnrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, testStudent.id),
            eq(schema.enrollments.courseId, unrelatedCourse.id)
          )
        );
      expect(unrelatedEnrollment).toBeUndefined();

      // 6. Verify total enrollments for student is EXACTLY 1
      const studentEnrollments = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.studentId, testStudent.id));
      expect(studentEnrollments.length).toBe(1);
    });

    it('9.5 rejects auto-resolve for GATEWAY_VALIDATED_INTERNAL_PENDING when order has ambiguous or missing order items', async () => {
      // Order with NO order items
      const [emptyOrder] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: `TSP-ORD-EMPTY-ITEMS-${Date.now()}`,
          studentId,
          status: 'PENDING',
          subtotalCents: 100000,
          discountCents: 0,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();

      await testDb.insert(schema.payments).values({
        orderId: emptyOrder.id,
        merchantTranId: `TRAN-EMPTY-${Date.now()}`,
        provider: 'SSLCOMMERZ',
        valId: `VAL-EMPTY-${Date.now()}`,
        bankTranId: `BANK-EMPTY-${Date.now()}`,
        amountCents: 100000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      const scanRes = await financeService.scanReconciliation({ dryRun: false });
      const disc = scanRes.discrepancies.find((d) => d.orderId === emptyOrder.id);

      expect(disc).toBeDefined();
      expect(disc?.discrepancyType).toBe('GATEWAY_VALIDATED_INTERNAL_PENDING');
      expect(disc?.autoResolvable).toBe(false); // Must be FALSE because no exact course item exists!

      // Order must NOT have been auto-resolved
      const [orderCheck] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, emptyOrder.id));
      expect(orderCheck.status).toBe('PENDING');
    });
  });

  // ==================================================
  // SUITE 10: ADMIN RBAC & FINANCIAL DATA LEAKAGE AUDIT (Items 16, 17)
  // ==================================================
  describe('10. Admin RBAC & Credential Leakage Audit', () => {
    it('10.1 rejects unauthenticated and student users across all P5 admin endpoints', async () => {
      const adminEndpoints = [
        { method: 'get', url: '/api/v1/admin/finance/summary' },
        { method: 'get', url: '/api/v1/admin/orders' },
        { method: 'get', url: `/api/v1/admin/orders/${freeCourse.id}` },
        { method: 'get', url: '/api/v1/admin/reconciliation' },
        { method: 'post', url: '/api/v1/admin/reconciliation/scan', body: { dryRun: true } },
        { method: 'get', url: '/api/v1/admin/refunds' },
        { method: 'get', url: '/api/v1/admin/coupons' },
        { method: 'get', url: '/api/v1/admin/invoices' },
      ];

      for (const ep of adminEndpoints) {
        // Unauthenticated -> 401
        let unauthReq: any = request(app.getHttpServer())[ep.method as 'get' | 'post'](ep.url);
        if (ep.body) unauthReq = unauthReq.send(ep.body);
        const unauthRes = await unauthReq;
        expect(unauthRes.status).toBe(401);

        // Student -> 403
        let studentReq: any = request(app.getHttpServer())
          [ep.method as 'get' | 'post'](ep.url)
          .set('Cookie', studentCookies);
        if (ep.body) studentReq = studentReq.send(ep.body);
        const studentRes = await studentReq;
        expect(studentRes.status).toBe(403);
      }
    });

    it('10.2 allows admin access to all P5 admin endpoints', async () => {
      const summaryRes = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/summary')
        .set('Cookie', adminCookies);
      expect(summaryRes.status).toBe(200);

      const ordersRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('Cookie', adminCookies);
      expect(ordersRes.status).toBe(200);

      const reconRes = await request(app.getHttpServer())
        .get('/api/v1/admin/reconciliation')
        .set('Cookie', adminCookies);
      expect(reconRes.status).toBe(200);

      const refundsRes = await request(app.getHttpServer())
        .get('/api/v1/admin/refunds')
        .set('Cookie', adminCookies);
      expect(refundsRes.status).toBe(200);

      const couponsRes = await request(app.getHttpServer())
        .get('/api/v1/admin/coupons')
        .set('Cookie', adminCookies);
      expect(couponsRes.status).toBe(200);

      const invoicesRes = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices')
        .set('Cookie', adminCookies);
      expect(invoicesRes.status).toBe(200);
    });

    it('10.3 verifies responses, DTOs, and audit logs never leak store_passwd or provider secrets', async () => {
      const summaryRes = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/summary')
        .set('Cookie', adminCookies);

      const ordersRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('Cookie', adminCookies);

      const refundsRes = await request(app.getHttpServer())
        .get('/api/v1/admin/refunds')
        .set('Cookie', adminCookies);

      const combinedResponses = JSON.stringify({
        summary: summaryRes.body,
        orders: ordersRes.body,
        refunds: refundsRes.body,
      });

      expect(combinedResponses).not.toContain('store_passwd');
      expect(combinedResponses).not.toContain('store_password');
      expect(combinedResponses).not.toContain('SSLCOMMERZ_STORE_PASSWORD');

      // Check database audit logs metadata
      const auditRows = await testDb.select().from(schema.auditLogs).limit(50);
      for (const row of auditRows) {
        const metadataStr = JSON.stringify(row.metadata || {});
        expect(metadataStr).not.toContain('store_passwd');
        expect(metadataStr).not.toContain('store_password');
      }
    });
  });
});
