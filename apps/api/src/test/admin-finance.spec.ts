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
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';

describe('P5.4.5 — Admin Finance, Reconciliation & Order Explorer API Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;

  let adminCookies: string[];
  let studentCookies: string[];

  let adminId: string;
  let studentId: string;
  let student2Id: string;

  let testCourse: any;
  let paidOrder1: any;
  let paidOrder2: any;
  let pendingOrder: any;
  let cancelledOrder: any;
  let refundedOrder: any;
  let mismatchOrder: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    mockSslCommerz = new MockSSLCommerzClient();

    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Password123!');

    // 1. Admin and Student 1
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

    // 2. Student 2
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Jane Doe',
        username: 'janedoe_finance',
        email: 'janedoe@techsprout.edu',
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

    // 3. Category & Course
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Finance & Systems',
        slug: 'finance-systems',
        isActive: true,
      })
      .returning();

    const [course] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Enterprise Financial Systems',
        slug: 'enterprise-fin-sys',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '5000.00',
        currency: 'BDT',
        categoryId: cat.id,
        instructorId: adminId,
      })
      .returning();
    testCourse = course;

    // 4. Create Seed Orders
    // Order 1: PAID (student 1) - subtotal 500000, discount 50000, payable 450000
    const [ord1] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-FIN-001',
        studentId,
        status: 'PAID',
        subtotalCents: 500000,
        discountCents: 50000,
        payableCents: 450000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-10-01T10:00:00.000Z'),
        createdAt: new Date('2026-10-01T09:50:00.000Z'),
      })
      .returning();
    paidOrder1 = ord1;

    await testDb.insert(schema.orderItems).values({
      orderId: ord1.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 500000,
      discountCents: 50000,
      payableCents: 450000,
      createdAt: new Date('2026-10-01T09:50:00.000Z'),
    });

    const [pay1] = await testDb
      .insert(schema.payments)
      .values({
        orderId: ord1.id,
        merchantTranId: 'TRAN-FIN-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-FIN-001',
        bankTranId: 'BANK-FIN-001',
        amountCents: 450000,
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'VISA',
        initiatedAt: new Date('2026-10-01T09:52:00.000Z'),
        validatedAt: new Date('2026-10-01T09:55:00.000Z'),
      })
      .returning();

    // Order 2: PAID (student 2) - subtotal 300000, discount 0, payable 300000
    const [ord2] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-FIN-002',
        studentId: student2Id,
        status: 'PAID',
        subtotalCents: 300000,
        discountCents: 0,
        payableCents: 300000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-10-02T12:00:00.000Z'),
        createdAt: new Date('2026-10-02T11:50:00.000Z'),
      })
      .returning();
    paidOrder2 = ord2;

    await testDb.insert(schema.orderItems).values({
      orderId: ord2.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 300000,
      discountCents: 0,
      payableCents: 300000,
      createdAt: new Date('2026-10-02T11:50:00.000Z'),
    });

    const [pay2] = await testDb
      .insert(schema.payments)
      .values({
        orderId: ord2.id,
        merchantTranId: 'TRAN-FIN-002',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-FIN-002',
        bankTranId: 'BANK-FIN-002',
        amountCents: 300000,
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'BKASH',
        initiatedAt: new Date('2026-10-02T11:52:00.000Z'),
        validatedAt: new Date('2026-10-02T11:55:00.000Z'),
      })
      .returning();

    // Order 3: REFUNDED (student 1) - subtotal 200000, discount 0, payable 200000
    // With confirmed PROCESSED refund of 200000
    const [ordRef] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-FIN-REF',
        studentId,
        status: 'REFUNDED',
        subtotalCents: 200000,
        discountCents: 0,
        payableCents: 200000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-09-25T10:00:00.000Z'),
        createdAt: new Date('2026-09-25T09:50:00.000Z'),
      })
      .returning();
    refundedOrder = ordRef;

    await testDb.insert(schema.orderItems).values({
      orderId: ordRef.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 200000,
      discountCents: 0,
      payableCents: 200000,
      createdAt: new Date('2026-09-25T09:50:00.000Z'),
    });

    const [payRef] = await testDb
      .insert(schema.payments)
      .values({
        orderId: ordRef.id,
        merchantTranId: 'TRAN-FIN-REF',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-FIN-REF',
        bankTranId: 'BANK-FIN-REF',
        amountCents: 200000,
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'NAGAD',
        initiatedAt: new Date('2026-09-25T09:52:00.000Z'),
        validatedAt: new Date('2026-09-25T09:55:00.000Z'),
      })
      .returning();

    await testDb.insert(schema.refunds).values({
      refundNumber: 'TSP-REF-FIN-001',
      orderId: ordRef.id,
      paymentId: payRef.id,
      amountCents: 200000,
      currency: 'BDT',
      reason: 'Course dropped within trial period',
      status: 'PROCESSED',
      processedAt: new Date('2026-09-26T14:00:00.000Z'),
      createdAt: new Date('2026-09-26T13:00:00.000Z'),
    });

    // Order 4: PENDING with a PENDING unconfirmed refund (should NOT be counted in confirmed refunds)
    const [ordPend] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-FIN-PEND',
        studentId,
        status: 'PAYMENT_PROCESSING',
        subtotalCents: 150000,
        discountCents: 0,
        payableCents: 150000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date('2026-10-03T08:00:00.000Z'),
      })
      .returning();
    pendingOrder = ordPend;

    await testDb.insert(schema.orderItems).values({
      orderId: ordPend.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 150000,
      discountCents: 0,
      payableCents: 150000,
      createdAt: new Date('2026-10-03T08:00:00.000Z'),
    });

    const [payPend] = await testDb
      .insert(schema.payments)
      .values({
        orderId: ordPend.id,
        merchantTranId: 'TRAN-FIN-PEND',
        provider: 'SSLCOMMERZ',
        amountCents: 150000,
        currency: 'BDT',
        status: 'INITIATED',
        initiatedAt: new Date('2026-10-03T08:02:00.000Z'),
      })
      .returning();

    // Pending refund: unconfirmed refund row
    await testDb.insert(schema.refunds).values({
      refundNumber: 'TSP-REF-FIN-PEND',
      orderId: ordPend.id,
      paymentId: payPend.id,
      amountCents: 150000,
      currency: 'BDT',
      reason: 'Awaiting provider resolution',
      status: 'PENDING',
      createdAt: new Date('2026-10-03T08:05:00.000Z'),
    });

    // Order 5: CANCELLED order (with FAILED payment attempt)
    const [ordCanc] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-FIN-CANC',
        studentId: student2Id,
        status: 'CANCELLED',
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() - 3600000),
        cancelledAt: new Date('2026-09-20T10:00:00.000Z'),
        createdAt: new Date('2026-09-20T09:00:00.000Z'),
      })
      .returning();
    cancelledOrder = ordCanc;

    await testDb.insert(schema.orderItems).values({
      orderId: ordCanc.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 100000,
      discountCents: 0,
      payableCents: 100000,
      createdAt: new Date('2026-09-20T09:00:00.000Z'),
    });

    await testDb.insert(schema.payments).values({
      orderId: ordCanc.id,
      merchantTranId: 'TRAN-FIN-FAIL',
      provider: 'SSLCOMMERZ',
      amountCents: 100000,
      currency: 'BDT',
      status: 'FAILED',
      initiatedAt: new Date('2026-09-20T09:02:00.000Z'),
    });

    // Nest App init
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

    // Login Admin
    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'admin@techsprout.edu',
      password: 'AdminPassword123!',
    });
    adminCookies = adminLogin.headers['set-cookie'] as unknown as string[];

    // Login Student
    const studentLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    studentCookies = studentLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // 1. FINANCE SUMMARY API
  // ==========================================
  describe('1. Finance Summary API (GET /api/v1/admin/finance/summary)', () => {
    it('34. should reject unauthenticated and non-admin requests with 401/403', async () => {
      // Unauthenticated
      const unauth = await request(app.getHttpServer()).get('/api/v1/admin/finance/summary');
      expect(unauth.status).toBe(401);

      // Student
      const forbidden = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/summary')
        .set('Cookie', studentCookies);
      expect(forbidden.status).toBe(403);
    });

    it('35. should calculate authoritative financial aggregates accurately', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/summary')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const summary = res.body.data;

      // Expected values:
      // Orders in PAID or REFUNDED:
      // ord1: 450,000 payable, 50,000 discount
      // ord2: 300,000 payable, 0 discount
      // ordRef: 200,000 payable, 0 discount
      // Total Gross Volume: 450,000 + 300,000 + 200,000 = 950,000 poisha (9,500 BDT)
      expect(summary.totalGrossVolumeCents).toBe(950000);

      // Total Discounts: 50,000 poisha (500 BDT)
      expect(summary.totalDiscountCents).toBe(50000);

      // Total Confirmed Refunds (only PROCESSED): 200,000 poisha (2,000 BDT)
      expect(summary.totalRefundCents).toBe(200000);

      // Net Revenue = Gross Volume - Total Confirmed Refunds
      // 950,000 - 200,000 = 750,000 poisha (7,500 BDT)
      expect(summary.totalNetRevenueCents).toBe(750000);

      // Counts
      expect(summary.totalPaidOrdersCount).toBe(2);
      expect(summary.totalRefundedOrdersCount).toBe(1);
      expect(summary.totalPendingOrdersCount).toBe(1);
      expect(summary.totalCancelledOrdersCount).toBe(1);
      expect(summary.currency).toBe('BDT');
    });

    it('36. should exclude unconfirmed/pending refunds from confirmed refund totals', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/summary')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      // Pending refund of 150000 poisha is NOT in totalRefundCents (which is 200000, not 350000)
      expect(res.body.data.totalRefundCents).toBe(200000);
    });

    it('37. should exclude failed payment attempts and cancelled orders from gross volume', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/summary')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      // Cancelled order (100,000 payable) and Pending order (150,000 payable) are excluded from gross volume (950,000)
      expect(res.body.data.totalGrossVolumeCents).toBe(950000);
    });
  });

  // ==========================================
  // 2. ADMIN ORDERS EXPLORER API
  // ==========================================
  describe('2. Admin Orders Explorer API (GET /api/v1/admin/orders)', () => {
    it('should reject unauthenticated and non-admin requests', async () => {
      const unauth = await request(app.getHttpServer()).get('/api/v1/admin/orders');
      expect(unauth.status).toBe(401);

      const forbidden = await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('Cookie', studentCookies);
      expect(forbidden.status).toBe(403);
    });

    it('38. should support pagination with metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/orders?page=1&limit=2')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.total).toBe(5);
      expect(res.body.data.pagination.totalPages).toBe(3);
      expect(res.body.data.pagination.hasNextPage).toBe(true);
      expect(res.body.data.pagination.hasPreviousPage).toBe(false);
    });

    it('39. should filter orders by status and search terms', async () => {
      // Filter by status PAID
      const paidRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders?status=PAID')
        .set('Cookie', adminCookies);

      expect(paidRes.status).toBe(200);
      expect(paidRes.body.data.items).toHaveLength(2);
      paidRes.body.data.items.forEach((item: any) => {
        expect(item.status).toBe('PAID');
      });

      // Search by orderNumber
      const searchNumRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders?search=TSP-ORD-FIN-001')
        .set('Cookie', adminCookies);

      expect(searchNumRes.status).toBe(200);
      expect(searchNumRes.body.data.items).toHaveLength(1);
      expect(searchNumRes.body.data.items[0].orderNumber).toBe('TSP-ORD-FIN-001');

      // Search by student email
      const searchEmailRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders?search=janedoe@techsprout.edu')
        .set('Cookie', adminCookies);

      expect(searchEmailRes.status).toBe(200);
      expect(searchEmailRes.body.data.items).toHaveLength(2); // ord2 and ordCanc
    });

    it('40. should filter orders by date range', async () => {
      const dateRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders?startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-01T23:59:59.000Z')
        .set('Cookie', adminCookies);

      expect(dateRes.status).toBe(200);
      expect(dateRes.body.data.items).toHaveLength(1);
      expect(dateRes.body.data.items[0].orderNumber).toBe('TSP-ORD-FIN-001');
    });

    it('should fetch complete order details by ID for admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/orders/${paidOrder1.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(paidOrder1.id);
      expect(res.body.data.orderNumber).toBe('TSP-ORD-FIN-001');
      expect(res.body.data.studentEmail).toBe('student@techsprout.edu');
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.payableCents).toBe(450000);
    });
  });

  // ==========================================
  // 3. RECONCILIATION SCANNER & SAFE ACTIONS
  // ==========================================
  describe('3. Reconciliation Scanner & Safe Actions', () => {
    it('41. should reject unauthenticated and student reconciliation calls', async () => {
      const unauth = await request(app.getHttpServer()).get('/api/v1/admin/reconciliation');
      expect(unauth.status).toBe(401);

      const forbidden = await request(app.getHttpServer())
        .get('/api/v1/admin/reconciliation')
        .set('Cookie', studentCookies);
      expect(forbidden.status).toBe(403);
    });

    it('42. should detect and safely auto-resolve GATEWAY_VALIDATED_INTERNAL_PENDING discrepancy', async () => {
      // Create a delayed order where gateway validated payment but order remained PAYMENT_PROCESSING
      const [delayedOrder] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-DELAY-AUTO',
          studentId: student2Id,
          status: 'PAYMENT_PROCESSING',
          subtotalCents: 500000,
          discountCents: 0,
          payableCents: 500000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date('2026-10-03T10:00:00.000Z'),
        })
        .returning();

      await testDb.insert(schema.orderItems).values({
        orderId: delayedOrder.id,
        courseId: testCourse.id,
        courseTitle: testCourse.title,
        unitPriceCents: 500000,
        discountCents: 0,
        payableCents: 500000,
        createdAt: new Date('2026-10-03T10:00:00.000Z'),
      });

      await testDb.insert(schema.payments).values({
        orderId: delayedOrder.id,
        merchantTranId: 'TRAN-DELAY-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-DELAY-001',
        bankTranId: 'BANK-DELAY-001',
        amountCents: 500000, // Exactly matches payable amount
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'VISA',
        initiatedAt: new Date('2026-10-03T10:02:00.000Z'),
        validatedAt: new Date('2026-10-03T10:05:00.000Z'),
      });

      // 1. Dry run should report discrepancy with autoResolvable = true without mutating
      const dryRunRes = await request(app.getHttpServer())
        .post('/api/v1/admin/reconciliation/scan')
        .set('Cookie', adminCookies)
        .send({ dryRun: true });

      expect(dryRunRes.status).toBe(200);
      const dryDisc = dryRunRes.body.data.discrepancies.find(
        (d: any) => d.orderNumber === 'TSP-ORD-DELAY-AUTO'
      );
      expect(dryDisc).toBeDefined();
      expect(dryDisc.discrepancyType).toBe('GATEWAY_VALIDATED_INTERNAL_PENDING');
      expect(dryDisc.autoResolvable).toBe(true);
      expect(dryRunRes.body.data.autoResolvedCount).toBe(0);

      // Verify DB was NOT mutated during dry-run
      const [unresolvedOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, delayedOrder.id));
      expect(unresolvedOrder.status).toBe('PAYMENT_PROCESSING');

      // 2. Real scan (dryRun = false) should safely auto-resolve
      const scanRes = await request(app.getHttpServer())
        .post('/api/v1/admin/reconciliation/scan')
        .set('Cookie', adminCookies)
        .send({ dryRun: false });

      expect(scanRes.status).toBe(200);
      expect(scanRes.body.data.autoResolvedCount).toBeGreaterThanOrEqual(1);

      // Verify DB order was transitioned to PAID
      const [resolvedOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, delayedOrder.id));
      expect(resolvedOrder.status).toBe('PAID');
      expect(resolvedOrder.paidAt).toBeDefined();

      // Verify enrollment was safely generated
      const [resolvedEnrollment] = await testDb
        .select()
        .from(schema.enrollments)
        .where(
          eq(schema.enrollments.studentId, student2Id)
        );
      expect(resolvedEnrollment).toBeDefined();
      expect(resolvedEnrollment.status).toBe('ACTIVE');
    });

    it('43. should flag ambiguous discrepancy as non-auto-resolvable (AMOUNT_MISMATCH)', async () => {
      // Create an order with an amount mismatch
      const [mismatched] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-MISMATCH-001',
          studentId,
          status: 'PAYMENT_PROCESSING',
          subtotalCents: 500000,
          discountCents: 0,
          payableCents: 500000, // Payable is 500,000
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date('2026-10-03T11:00:00.000Z'),
        })
        .returning();

      await testDb.insert(schema.payments).values({
        orderId: mismatched.id,
        merchantTranId: 'TRAN-MISMATCH-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-MISMATCH-001',
        bankTranId: 'BANK-MISMATCH-001',
        amountCents: 300000, // Gateway amount is 300,000 (MISMATCH!)
        currency: 'BDT',
        status: 'VALIDATED',
        initiatedAt: new Date('2026-10-03T11:02:00.000Z'),
        validatedAt: new Date('2026-10-03T11:05:00.000Z'),
      });

      // Run scan without dryRun
      const scanRes = await request(app.getHttpServer())
        .post('/api/v1/admin/reconciliation/scan')
        .set('Cookie', adminCookies)
        .send({ dryRun: false });

      expect(scanRes.status).toBe(200);

      const mismatchDisc = scanRes.body.data.discrepancies.find(
        (d: any) => d.orderNumber === 'TSP-ORD-MISMATCH-001'
      );
      expect(mismatchDisc).toBeDefined();
      expect(mismatchDisc.discrepancyType).toBe('AMOUNT_MISMATCH');
      // Crucial: Must be marked FALSE for autoResolvable
      expect(mismatchDisc.autoResolvable).toBe(false);

      // Verify order was NOT marked PAID
      const [unmodifiedOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, mismatched.id));
      expect(unmodifiedOrder.status).toBe('PAYMENT_PROCESSING');
    });
  });
});
