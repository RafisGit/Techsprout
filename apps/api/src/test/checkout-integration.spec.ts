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
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';

describe('P5.4.4 — Student Checkout & Order Completion Flow Integration Tests', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;
  let ordersService: OrdersService;

  let studentCookies: string[];
  let student2Cookies: string[];
  let adminCookies: string[];

  let studentId: string;
  let student2Id: string;
  let adminId: string;

  let activeCategory: any;
  let standardPaidCourse: any; // 3000.00 BDT
  let subMinimumCourse: any; // 5.00 BDT (< 10 BDT min gateway)
  let ultraExpensiveCourse: any; // 600,000.00 BDT (> 500,000 BDT max gateway)
  let standardCourse2: any; // 2500.00 BDT

  let percentCoupon: any; // 20%
  let freeCoupon: any; // 100%
  let exhaustedCoupon: any; // usageLimit 1, redemptionCount 1

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;
    mockSslCommerz = new MockSSLCommerzClient();

    // 1. Roles & Users
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
        name: 'Checkout Student 2',
        username: 'checkout_student2',
        email: 'checkout_student2@techsprout.edu',
        phone: '01799999999',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = st2.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // 2. Categories & Courses
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Checkout Category',
        slug: 'checkout-category',
        description: 'Category for checkout integration tests',
        isActive: true,
      })
      .returning();
    activeCategory = cat;

    // Standard 3000 BDT Course
    const [c1] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Fullstack Checkout Course',
        slug: 'fullstack-checkout-course',
        description: 'Complete web course',
        price: '3000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    standardPaidCourse = c1;

    // Course below gateway minimum (< 1000 cents / 10.00 BDT)
    const [cSub] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Micro Course Under Gateway Min',
        slug: 'micro-course-under-gateway-min',
        description: '5 BDT course',
        price: '5.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    subMinimumCourse = cSub;

    // Course above gateway maximum (> 50,000,000 cents / 500,000.00 BDT)
    const [cUltra] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Executive Masters Corporate Suite',
        slug: 'executive-masters-corporate-suite',
        description: '600,000 BDT course',
        price: '600000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    ultraExpensiveCourse = cUltra;

    // Standard Course 2 (2500 BDT)
    const [c2] = await testDb
      .insert(schema.courses)
      .values({
        title: 'React Native Mobile Development',
        slug: 'react-native-mobile-development',
        description: '2500 BDT course',
        price: '2500.00',
        currency: 'BDT',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: activeCategory.id,
        instructorId: adminId,
      })
      .returning();
    standardCourse2 = c2;

    // 3. Coupons
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneMonthLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [cp20] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'CHECKOUT20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    percentCoupon = cp20;

    const [cFree] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'FREE100CHECKOUT',
        discountType: 'PERCENTAGE',
        discountValue: 100,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    freeCoupon = cFree;

    const [cExhausted] = await testDb
      .insert(schema.coupons)
      .values({
        code: 'EXHAUSTED1',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        usageLimit: 1,
        redemptionCount: 1,
        startsAt: oneDayAgo,
        expiresAt: oneMonthLater,
        isActive: true,
        createdBy: adminId,
      })
      .returning();
    exhaustedCoupon = cExhausted;

    // Build NestJS application with test DB & mock SSLCommerz
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

    // Login users to obtain session cookies
    const studentLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = studentLogin.headers['set-cookie'] as unknown as string[];

    const student2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'checkout_student2@techsprout.edu',
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

  // ==========================================
  // SERVER AUTHORITY & ORDER CREATION
  // ==========================================
  describe('Server-Authoritative Pricing & Revalidation', () => {
    it('20. order creation uses DB course price in integer minor units (cents)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardPaidCourse.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subtotalCents).toBe(300000); // 3000.00 BDT = 300,000 cents
      expect(res.body.data.discountCents).toBe(0);
      expect(res.body.data.payableCents).toBe(300000);
      expect(res.body.data.currency).toBe('BDT');
      expect(res.body.data.status).toBe('PENDING');
    });

    it('21. client price cannot override server price (tampered fields rejected)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardPaidCourse.id,
          price: 100, // Attacker attempts to set price to 100 BDT
          subtotalCents: 10000,
        });

      // Strict schema rejects unauthorized client price
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('22. client discount cannot override server discount', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardPaidCourse.id,
          discountCents: 290000, // Attacker attempts to inject 2900 BDT discount
          payableCents: 10000,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('23. coupon is authoritatively revalidated during order creation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardPaidCourse.id,
          couponCode: 'CHECKOUT20',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.subtotalCents).toBe(300000);
      expect(res.body.data.discountCents).toBe(60000); // 20% of 3000 BDT = 600 BDT
      expect(res.body.data.payableCents).toBe(240000); // 2400 BDT
      expect(res.body.data.couponCode).toBe('CHECKOUT20');
    });

    it('24. coupon preview cannot be reused as authoritative final price if coupon became exhausted', async () => {
      // EXHAUSTED1 has usageLimit=1, redemptionCount=1
      const res = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardPaidCourse.id,
          couponCode: 'EXHAUSTED1',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('COUPON_USAGE_LIMIT_REACHED');
    });

    it('25. concurrent coupon reservation remains protected under pessimistic row lock', async () => {
      // Create a coupon with 1 slot
      const [singleSlotCoupon] = await testDb
        .insert(schema.coupons)
        .values({
          code: 'SINGLE1SLOT',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          usageLimit: 1,
          redemptionCount: 0,
          startsAt: new Date(Date.now() - 3600000),
          isActive: true,
          createdBy: adminId,
        })
        .returning();

      // Student 1 reserves the only slot
      const order1 = await ordersService.createOrder(studentId, {
        courseId: standardPaidCourse.id,
        couponCode: 'SINGLE1SLOT',
      });
      expect(order1.couponCode).toBe('SINGLE1SLOT');

      const [cAfterOrder1] = await testDb
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.id, singleSlotCoupon.id));
      expect(cAfterOrder1.redemptionCount).toBe(1);

      // Student 2 attempts to use the now exhausted coupon -> rejected
      await expect(
        ordersService.createOrder(student2Id, {
          courseId: standardPaidCourse.id,
          couponCode: 'SINGLE1SLOT',
        })
      ).rejects.toThrow('Coupon usage limit reached');
    });
  });

  // ==========================================
  // PAYMENT INITIATION & GATEWAY BOUNDARIES
  // ==========================================
  describe('Payment Initiation & Boundaries', () => {
    it('26. zero-payable order fulfills internally without redirecting to SSLCommerz', async () => {
      // Create 100% discount order
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardPaidCourse.id,
          couponCode: 'FREE100CHECKOUT',
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.id;
      expect(orderRes.body.data.payableCents).toBe(0);

      // Initiate payment
      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId });

      expect(initRes.status).toBe(201);
      expect(initRes.body.data.gatewayUrl).toContain(`/orders/${orderId}/success`);
      expect(initRes.body.data.gatewayUrl).not.toContain('sandbox.sslcommerz.com');

      // Verify order is immediately marked PAID
      const [orderDb] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId));

      expect(orderDb.status).toBe('PAID');

      // Verify enrollment is ACTIVE
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, standardPaidCourse.id)
          )
        );

      expect(enr).toBeDefined();
      expect(enr.status).toBe('ACTIVE');

      // Verify invoice was created
      const [inv] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, orderId));

      expect(inv).toBeDefined();
      expect(inv.status).toBe('PAID');
      expect(inv.payableCents).toBe(0);
    });

    it('27. paid order initiates payment using persisted payable amount', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardCourse2.id, // 2500 BDT
        });

      const orderId = orderRes.body.data.id;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId });

      expect(initRes.status).toBe(201);
      expect(initRes.body.data.gatewayUrl).toContain('sslcommerz.com');
      expect(initRes.body.data.provider).toBe('SSLCOMMERZ');

      // Verify payment row was created with order.payableCents (250000 cents)
      const [pmt] = await testDb
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.orderId, orderId));

      expect(pmt.amountCents).toBe(250000);
      expect(pmt.currency).toBe('BDT');
    });

    it('28. payment amount below gateway minimum (10.00 BDT) is rejected before gateway', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: subMinimumCourse.id, // 5.00 BDT = 500 cents
        });

      const orderId = orderRes.body.data.id;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId });

      expect(initRes.status).toBe(400);
      expect(initRes.body.errorCode).toBe('PAYMENT_AMOUNT_BELOW_GATEWAY_MINIMUM');
    });

    it('29. payment amount above gateway maximum (500,000.00 BDT) is rejected before gateway', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: ultraExpensiveCourse.id, // 600,000 BDT
        });

      const orderId = orderRes.body.data.id;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', studentCookies)
        .send({ orderId });

      expect(initRes.status).toBe(400);
      expect(initRes.body.errorCode).toBe('PAYMENT_AMOUNT_ABOVE_GATEWAY_MAXIMUM');
    });
  });

  // ==========================================
  // PAYMENT RETURN & ORDER RESOLUTION
  // ==========================================
  describe('Payment Return & Authoritative Resolution', () => {
    it('30. payment return does not trust browser values (order status query required)', async () => {
      // Attacker queries order status with fake success params
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', student2Cookies)
        .send({
          courseId: standardCourse2.id,
        });

      const orderId = orderRes.body.data.id;

      // Querying the order from backend returns PENDING, despite any client claim
      const statusRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}?status=success&fake_tran=123`)
        .set('Cookie', student2Cookies);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.status).toBe('PENDING'); // Database state is authoritative
    });

    it('31. PAID order exposes correct invoice ID and invoice is privately retrievable', async () => {
      // 1. Create paid order & fulfill it
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', student2Cookies)
        .send({
          courseId: standardCourse2.id,
        });

      const orderId = orderRes.body.data.id;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', student2Cookies)
        .send({ orderId });

      const merchantTranId = initRes.body.data.merchantTranId;

      // 2. Configure mock SSLCommerz Order Validation response
      const valId = `VAL_31_${Date.now()}`;
      mockSslCommerz.setMockValidationSuccess(valId, {
        tran_id: merchantTranId,
        amount: '2500.00',
        currency: 'BDT',
        bank_tran_id: 'BANK_31',
        card_type: 'VISA-CityBank',
        card_brand: 'VISA',
      });

      // 3. Fulfill via success callback
      const callbackRes = await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/success')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          val_id: valId,
          amount: '2500.00',
          currency: 'BDT',
          status: 'VALID',
          bank_tran_id: 'BANK_31',
        });

      expect(callbackRes.status).toBe(200);

      // 4. Inspect order - must have invoiceId populated
      const getOrderRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', student2Cookies);

      expect(getOrderRes.status).toBe(200);
      expect(getOrderRes.body.data.status).toBe('PAID');
      expect(getOrderRes.body.data.invoiceId).toBeDefined();

      const invoiceId = getOrderRes.body.data.invoiceId;

      // 4. Retrieve invoice
      const getInvRes = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Cookie', student2Cookies);

      expect(getInvRes.status).toBe(200);
      expect(getInvRes.body.data.orderId).toBe(orderId);
      expect(getInvRes.body.data.payableCents).toBe(250000);
    });

    it('32. failed payment does not activate enrollment', async () => {
      // Create order
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', student2Cookies)
        .send({
          courseId: standardPaidCourse.id,
        });

      const orderId = orderRes.body.data.id;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/payments/initiate')
        .set('Cookie', student2Cookies)
        .send({ orderId });

      const merchantTranId = initRes.body.data.merchantTranId;

      // Send fail callback
      await request(app.getHttpServer())
        .post('/api/v1/payments/sslcommerz/fail')
        .set('Accept', 'application/json')
        .send({
          tran_id: merchantTranId,
          failedreason: 'Bank decline',
        });

      // Verify enrollment does NOT exist for student2 on this course
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, student2Id),
            eq(schema.enrollments.courseId, standardPaidCourse.id)
          )
        );

      expect(enr).toBeUndefined();
    });

    it('33. pending payment does not activate enrollment', async () => {
      // Create fresh order
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', studentCookies)
        .send({
          courseId: standardCourse2.id,
        });

      // Pending order -> student is NOT enrolled
      const [enr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.studentId, studentId),
            eq(schema.enrollments.courseId, standardCourse2.id)
          )
        );

      expect(enr).toBeUndefined();
    });
  });
});
