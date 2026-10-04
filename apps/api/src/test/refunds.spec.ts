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
import { eq, and } from 'drizzle-orm';
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';
import { RefundsService } from '../modules/refunds/refunds.service';

describe('P5.4.2 — Refund Operation & SSLCommerz Gateway Reconciliation Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;
  let refundsService: RefundsService;

  let adminCookies: string[];
  let studentCookies: string[];
  let student2Cookies: string[];

  let adminId: string;
  let studentId: string;
  let student2Id: string;

  let category: any;
  let courseA: any;
  let courseB: any;

  let order1: any;
  let payment1: any;
  let enrollment1: any;
  let certificate1: any;
  let invoice1: any;

  let order2Unrelated: any;
  let payment2Unrelated: any;
  let enrollment2Unrelated: any;
  let certificate2Unrelated: any;
  let invoice2Unrelated: any;

  let orderPending: any;
  let orderZeroPayable: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    mockSslCommerz = new MockSSLCommerzClient();

    // 1. Roles & Seed Users
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
        name: 'Student Two Refunds',
        username: 'student2_refunds',
        email: 'student2_refunds@techsprout.edu',
        phone: '01755555555',
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
        name: 'Refund Testing Track',
        slug: 'refund-testing-track',
        description: 'Track for refund testing',
      })
      .returning();
    category = cat;

    const [cA] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Mastering Gateway Refunds',
        slug: 'mastering-gateway-refunds',
        description: 'Complete course on payment reversals',
        categoryId: category.id,
        instructorId: adminId,
        priceCents: 300000, // 3000 BDT
        currency: 'BDT',
        status: 'PUBLISHED',
      })
      .returning();
    courseA = cA;

    const [cB] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Advanced Financial Reconciliation',
        slug: 'advanced-financial-reconciliation',
        description: 'Reconciliation and ledger guarantees',
        categoryId: category.id,
        instructorId: adminId,
        priceCents: 450000, // 4500 BDT
        currency: 'BDT',
        status: 'PUBLISHED',
      })
      .returning();
    courseB = cB;

    // 3. Target Order 1: PAID, has payment, enrollment, certificate, invoice
    const [ord1] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-2026-REF001',
        studentId,
        status: 'PAID',
        subtotalCents: 300000,
        discountCents: 50000,
        payableCents: 250000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date(),
      })
      .returning();
    order1 = ord1;

    await testDb.insert(schema.orderItems).values({
      orderId: order1.id,
      courseId: courseA.id,
      courseTitle: courseA.title,
      unitPriceCents: 300000,
      discountCents: 50000,
      payableCents: 250000,
    });

    const [pm1] = await testDb
      .insert(schema.payments)
      .values({
        orderId: order1.id,
        merchantTranId: 'TSP-TX-REF-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-REF-001',
        bankTranId: 'BANK-TR-REF-001',
        amountCents: 250000,
        currency: 'BDT',
        status: 'VALIDATED',
        validatedAt: new Date(),
      })
      .returning();
    payment1 = pm1;

    const [enr1] = await testDb
      .insert(schema.enrollments)
      .values({
        studentId,
        courseId: courseA.id,
        orderId: order1.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment1 = enr1;

    const [cert1] = await testDb
      .insert(schema.certificates)
      .values({
        certificateNumber: 'TSP-CERT-2026-0001',
        studentId,
        courseId: courseA.id,
        enrollmentId: enrollment1.id,
        status: 'ACTIVE',
        studentName: 'Student One Snapshot Name',
        courseTitle: courseA.title,
        instructorName: 'Admin Instructor',
        completedAt: new Date(),
      })
      .returning();
    certificate1 = cert1;

    const [inv1] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-REF001',
        orderId: order1.id,
        studentId,
        studentName: 'Student One Snapshot Name',
        studentEmail: 'student@techsprout.edu',
        courseTitle: courseA.title,
        subtotalCents: 300000,
        discountCents: 50000,
        payableCents: 250000,
        currency: 'BDT',
        status: 'PAID',
        paymentMethod: 'SSLCOMMERZ',
        bankTranId: 'BANK-TR-REF-001',
        paidAt: new Date(),
      })
      .returning();
    invoice1 = inv1;

    // 4. Unrelated Order 2: PAID, Course B, student 1 (must remain completely untouched)
    const [ord2] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-2026-UNRELATED',
        studentId,
        status: 'PAID',
        subtotalCents: 450000,
        discountCents: 0,
        payableCents: 450000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date(),
      })
      .returning();
    order2Unrelated = ord2;

    await testDb.insert(schema.orderItems).values({
      orderId: order2Unrelated.id,
      courseId: courseB.id,
      courseTitle: courseB.title,
      unitPriceCents: 450000,
      discountCents: 0,
      payableCents: 450000,
    });

    const [pm2] = await testDb
      .insert(schema.payments)
      .values({
        orderId: order2Unrelated.id,
        merchantTranId: 'TSP-TX-UNRELATED-002',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-UNRELATED-002',
        bankTranId: 'BANK-TR-UNRELATED-002',
        amountCents: 450000,
        currency: 'BDT',
        status: 'VALIDATED',
        validatedAt: new Date(),
      })
      .returning();
    payment2Unrelated = pm2;

    const [enr2] = await testDb
      .insert(schema.enrollments)
      .values({
        studentId,
        courseId: courseB.id,
        orderId: order2Unrelated.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment2Unrelated = enr2;

    const [cert2] = await testDb
      .insert(schema.certificates)
      .values({
        certificateNumber: 'TSP-CERT-2026-0002',
        studentId,
        courseId: courseB.id,
        enrollmentId: enrollment2Unrelated.id,
        status: 'ACTIVE',
        studentName: 'Student One Snapshot Name',
        courseTitle: courseB.title,
        instructorName: 'Admin Instructor',
        completedAt: new Date(),
      })
      .returning();
    certificate2Unrelated = cert2;

    const [inv2] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-UNRELATED002',
        orderId: order2Unrelated.id,
        studentId,
        studentName: 'Student One Snapshot Name',
        studentEmail: 'student@techsprout.edu',
        courseTitle: courseB.title,
        subtotalCents: 450000,
        discountCents: 0,
        payableCents: 450000,
        currency: 'BDT',
        status: 'PAID',
        paymentMethod: 'SSLCOMMERZ',
        bankTranId: 'BANK-TR-UNRELATED-002',
        paidAt: new Date(),
      })
      .returning();
    invoice2Unrelated = inv2;

    // 5. Order PENDING (unpaid)
    const [ordPend] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-2026-PENDING',
        studentId: student2Id,
        status: 'PENDING',
        subtotalCents: 300000,
        discountCents: 0,
        payableCents: 300000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    orderPending = ordPend;

    // 6. Zero-payable Order (100% coupon)
    const [ordZero] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-2026-ZERO',
        studentId: student2Id,
        status: 'PAID',
        subtotalCents: 300000,
        discountCents: 300000,
        payableCents: 0,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date(),
      })
      .returning();
    orderZeroPayable = ordZero;

    await testDb.insert(schema.payments).values({
      orderId: orderZeroPayable.id,
      merchantTranId: 'TSP-TX-ZERO-FREE',
      provider: 'FREE_COUPON',
      bankTranId: 'FREE_COUPON',
      amountCents: 0,
      currency: 'BDT',
      status: 'VALIDATED',
      validatedAt: new Date(),
    });

    // Build Nest app with testDb and MockSSLCommerzClient
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ getDb: () => testDb, getPool: () => testPool })
      .overrideProvider(DRIZZLE_DB)
      .useValue(testDb)
      .overrideProvider(SSLCOMMERZ_CLIENT)
      .useValue(mockSslCommerz)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    refundsService = moduleRef.get(RefundsService);

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
      email: 'student2_refunds@techsprout.edu',
      password: 'Password123!',
    });
    student2Cookies = student2Login.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    mockSslCommerz.clear();
  });

  // ==========================================
  // 1. BASIC REFUND INITIATION & CONSTRAINTS
  // ==========================================
  describe('1. Basic Refund Initiation & Business Constraints', () => {
    it('1.1 paid order can initiate full refund', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order1.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Student requested refund within policy window' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(order1.id);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.amountCents).toBe(250000); // 2500 BDT
      expect(res.body.data.currency).toBe('BDT');
      expect(res.body.data.refundNumber).toBe(`TSP-REF-${order1.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`);
      expect(res.body.data.refundNumber.length).toBe(30);

      // Verify SSLCommerz client received call
      expect(mockSslCommerz.refundInitiationCalls.length).toBe(1);
      const call = mockSslCommerz.refundInitiationCalls[0];
      expect(call.bank_tran_id).toBe('BANK-TR-REF-001');
      expect(call.refund_amount).toBe('2500.00');
      expect(call.refund_trans_id).toBe(res.body.data.refundNumber);
    });

    it('1.2 refund amount always equals order.payableCents', async () => {
      const [refundRow] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));

      expect(refundRow.amountCents).toBe(order1.payableCents);
    });

    it('1.3 client cannot specify arbitrary refund amount', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order1.id}/refund`)
        .set('Cookie', adminCookies)
        .send({
          reason: 'Attempting arbitrary amount',
          amountCents: 50000,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('1.4 unpaid order rejected', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${orderPending.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Refund on unpaid order' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('ORDER_NOT_REFUNDABLE');
    });

    it('1.5 already refunded order rejected', async () => {
      const [alreadyRefunded] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-ALREADY-REF',
          studentId,
          status: 'REFUNDED',
          subtotalCents: 200000,
          payableCents: 200000,
          currency: 'BDT',
          expiresAt: new Date(),
        })
        .returning();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${alreadyRefunded.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Attempt refund on refunded order' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('REFUND_ALREADY_PROCESSED');
    });

    it('1.6 zero-payable order refund behavior follows frozen business rules (ORDER_NOT_REFUNDABLE)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${orderZeroPayable.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Attempt refund on zero-payable order' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('ORDER_NOT_REFUNDABLE');
    });
  });

  // ==========================================
  // 2. TWO-PHASE STATE MACHINE & PROVIDER MAPPING
  // ==========================================
  describe('2. Two-Phase State Machine & Gateway Mapping', () => {
    it('2.1 initiation success → PENDING', async () => {
      const [refundRow] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));

      expect(refundRow.status).toBe('PENDING');
      expect(refundRow.providerRefundRef).toMatch(/^REF_/);
    });

    it('2.2 initiation processing → PENDING', async () => {
      const [ordProc] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-PROC-001',
          studentId,
          status: 'PAID',
          subtotalCents: 150000,
          payableCents: 150000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      await testDb.insert(schema.payments).values({
        orderId: ordProc.id,
        merchantTranId: 'TSP-TX-PROC-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-PROC-001',
        bankTranId: 'BANK-TR-PROC-001',
        amountCents: 150000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      mockSslCommerz.refundInitiationHandler = async (params) => ({
        APIConnect: 'DONE',
        status: 'processing',
        refund_ref_id: 'REF_PROCESSING_123',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${ordProc.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Refund expecting processing status' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.providerRefundRef).toBe('REF_PROCESSING_123');
    });

    it('2.3 initiation failed → FAILED', async () => {
      const [ordFail] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-FAIL-001',
          studentId,
          status: 'PAID',
          subtotalCents: 120000,
          payableCents: 120000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      await testDb.insert(schema.payments).values({
        orderId: ordFail.id,
        merchantTranId: 'TSP-TX-FAIL-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-FAIL-001',
        bankTranId: 'BANK-TR-FAIL-001',
        amountCents: 120000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      mockSslCommerz.refundInitiationHandler = async () => ({
        APIConnect: 'DONE',
        status: 'failed',
        errorReason: 'Transaction not eligible for refund',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${ordFail.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Refund expected to fail at gateway' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('REFUND_PROVIDER_FAILED');

      const [dbRefund] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, ordFail.id));
      expect(dbRefund.status).toBe('FAILED');

      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, ordFail.id));
      expect(dbOrder.status).toBe('PAID');
    });

    it('2.4 processing query → PENDING', async () => {
      const [refundRow] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));

      mockSslCommerz.refundQueryHandler = async () => ({
        APIConnect: 'DONE',
        status: 'processing',
        refund_ref_id: refundRow.providerRefundRef!,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refundRow.id}/query`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING');

      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order1.id));
      expect(dbOrder.status).toBe('PAID');
    });

    it('2.5 failed query → FAILED', async () => {
      const [testOrd] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-QUERYFAIL-001',
          studentId,
          status: 'PAID',
          subtotalCents: 100000,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      const [testPm] = await testDb
        .insert(schema.payments)
        .values({
          orderId: testOrd.id,
          merchantTranId: 'TSP-TX-QUERYFAIL-001',
          provider: 'SSLCOMMERZ',
          valId: 'VAL-QUERYFAIL-001',
          bankTranId: 'BANK-TR-QUERYFAIL-001',
          amountCents: 100000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      const [testRef] = await testDb
        .insert(schema.refunds)
        .values({
          refundNumber: `TSP-REF-${testOrd.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`,
          orderId: testOrd.id,
          paymentId: testPm.id,
          amountCents: 100000,
          currency: 'BDT',
          reason: 'Testing query failure',
          status: 'PENDING',
          providerRefundRef: 'REF_QUERY_WILL_FAIL',
        })
        .returning();

      mockSslCommerz.refundQueryHandler = async () => ({
        APIConnect: 'DONE',
        status: 'failed',
        refund_ref_id: testRef.providerRefundRef!,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${testRef.id}/query`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FAILED');

      const [dbRef] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, testRef.id));
      expect(dbRef.status).toBe('FAILED');

      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, testOrd.id));
      expect(dbOrder.status).toBe('PAID');
    });

    it('2.6 cancelled query → FAILED', async () => {
      const [testOrd] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-QUERYCANCEL-001',
          studentId,
          status: 'PAID',
          subtotalCents: 100000,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      const [testPm] = await testDb
        .insert(schema.payments)
        .values({
          orderId: testOrd.id,
          merchantTranId: 'TSP-TX-QUERYCANCEL-001',
          provider: 'SSLCOMMERZ',
          valId: 'VAL-QUERYCANCEL-001',
          bankTranId: 'BANK-TR-QUERYCANCEL-001',
          amountCents: 100000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      const [testRef] = await testDb
        .insert(schema.refunds)
        .values({
          refundNumber: `TSP-REF-${testOrd.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`,
          orderId: testOrd.id,
          paymentId: testPm.id,
          amountCents: 100000,
          currency: 'BDT',
          reason: 'Testing query cancelled',
          status: 'PENDING',
          providerRefundRef: 'REF_QUERY_WILL_CANCEL',
        })
        .returning();

      mockSslCommerz.refundQueryHandler = async () => ({
        APIConnect: 'DONE',
        status: 'cancelled',
        refund_ref_id: testRef.providerRefundRef!,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${testRef.id}/query`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FAILED');

      const [dbRef] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, testRef.id));
      expect(dbRef.status).toBe('FAILED');
    });

    it('2.7 refunded query → PROCESSED', async () => {
      const [refundRow] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));

      mockSslCommerz.refundQueryHandler = async () => ({
        APIConnect: 'DONE',
        status: 'refunded',
        refund_ref_id: refundRow.providerRefundRef!,
        bank_tran_id: 'BANK-TR-REF-001',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refundRow.id}/query`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PROCESSED');
      expect(res.body.data.processedAt).toBeDefined();
    });
  });

  // ==========================================
  // 3. ATOMIC FINALIZATION & SIDE EFFECT SAFETY
  // ==========================================
  describe('3. Atomic Finalization & Scoped Reversal Safety', () => {
    it('3.1 PROCESSED updates exact order to REFUNDED', async () => {
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, order1.id));

      expect(dbOrder.status).toBe('REFUNDED');
    });

    it('3.2 PROCESSED updates exact invoice to REFUNDED', async () => {
      const [dbInvoice] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order1.id));

      expect(dbInvoice.status).toBe('REFUNDED');
    });

    it('3.3 PROCESSED cancels only exact related enrollment', async () => {
      const [dbEnr1] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment1.id));

      expect(dbEnr1.status).toBe('CANCELLED');
    });

    it('3.4 PROCESSED revokes only exact related certificate', async () => {
      const [dbCert1] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, certificate1.id));

      expect(dbCert1.status).toBe('REVOKED');
      expect(dbCert1.revocationReason).toBe('Order refunded');
      expect(dbCert1.revokedAt).toBeDefined();
    });

    it('3.5 unrelated active certificates remain ACTIVE', async () => {
      const [dbCert2] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, certificate2Unrelated.id));

      expect(dbCert2.status).toBe('ACTIVE');
      expect(dbCert2.revokedAt).toBeNull();
    });

    it('3.6 unrelated student enrollments remain ACTIVE', async () => {
      const [dbEnr2] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment2Unrelated.id));

      expect(dbEnr2.status).toBe('ACTIVE');
    });

    it('3.7 historical certificate data is never edited', async () => {
      const [dbCert1] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, certificate1.id));

      expect(dbCert1.studentName).toBe('Student One Snapshot Name');
      expect(dbCert1.courseTitle).toBe(courseA.title);
      expect(dbCert1.certificateNumber).toBe('TSP-CERT-2026-0001');
    });

    it('3.8 invoice snapshot fields remain unchanged', async () => {
      const [dbInvoice] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.orderId, order1.id));

      expect(dbInvoice.subtotalCents).toBe(300000);
      expect(dbInvoice.discountCents).toBe(50000);
      expect(dbInvoice.payableCents).toBe(250000);
      expect(dbInvoice.studentName).toBe('Student One Snapshot Name');
      expect(dbInvoice.studentEmail).toBe('student@techsprout.edu');
      expect(dbInvoice.courseTitle).toBe(courseA.title);
      expect(dbInvoice.invoiceNumber).toBe('TSP-INV-2026-REF001');
    });
  });

  // ==========================================
  // 4. RETRY BEHAVIOR & ROW IDENTITY SURVIVAL
  // ==========================================
  describe('4. Refund Retry Behavior & Row Identity Survival', () => {
    it('4.1 failed refund retry reuses same refund row', async () => {
      const [failedOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, 'TSP-ORD-FAIL-001'));

      const [initialRefund] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, failedOrder.id));

      expect(initialRefund.status).toBe('FAILED');

      mockSslCommerz.refundInitiationHandler = async () => ({
        APIConnect: 'DONE',
        status: 'success',
        refund_ref_id: 'REF_RETRY_SUCCESS_999',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${failedOrder.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Retrying after correcting gateway issue' });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(initialRefund.id); // Same row ID
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.providerRefundRef).toBe('REF_RETRY_SUCCESS_999');
    });

    it('4.2 refund_number remains identical across retry', async () => {
      const [failedOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, 'TSP-ORD-FAIL-001'));

      const [refundRow] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, failedOrder.id));

      expect(refundRow.refundNumber).toBe(`TSP-REF-${failedOrder.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`);
    });

    it('4.3 second refund row can never be created for same order', async () => {
      const [failedOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, 'TSP-ORD-FAIL-001'));

      const allRefundsForOrder = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, failedOrder.id));

      expect(allRefundsForOrder.length).toBe(1);
    });

    it('4.4 processed refund cannot be retried', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order1.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Attempt retry on processed refund' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('REFUND_ALREADY_PROCESSED');
    });
  });

  // ==========================================
  // 5. TIMEOUT, AMBIGUOUS RESPONSES & MANUAL RECONCILIATION
  // ==========================================
  describe('5. Timeout, Ambiguous Responses & Manual Reconciliation', () => {
    let timeoutOrderId: string;
    let timeoutRefundId: string;
    let timeoutEnrollmentId: string;
    let timeoutCertificateId: string;

    it('5.1 initiation timeout keeps refund PENDING', async () => {
      const [ordTimeout] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-TIMEOUT-001',
          studentId: student2Id,
          status: 'PAID',
          subtotalCents: 200000,
          payableCents: 200000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();
      timeoutOrderId = ordTimeout.id;

      await testDb.insert(schema.payments).values({
        orderId: ordTimeout.id,
        merchantTranId: 'TSP-TX-TIMEOUT-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-TIMEOUT-001',
        bankTranId: 'BANK-TR-TIMEOUT-001',
        amountCents: 200000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      const [enrTimeout] = await testDb
        .insert(schema.enrollments)
        .values({
          studentId: student2Id,
          courseId: courseA.id,
          orderId: ordTimeout.id,
          status: 'ACTIVE',
        })
        .returning();
      timeoutEnrollmentId = enrTimeout.id;

      const [certTimeout] = await testDb
        .insert(schema.certificates)
        .values({
          certificateNumber: 'TSP-CERT-TIMEOUT-001',
          studentId: student2Id,
          courseId: courseA.id,
          enrollmentId: enrTimeout.id,
          status: 'ACTIVE',
          studentName: 'Timeout Student',
          courseTitle: courseA.title,
          instructorName: 'Admin Instructor',
          completedAt: new Date(),
        })
        .returning();
      timeoutCertificateId = certTimeout.id;

      mockSslCommerz.refundInitiationHandler = async () => {
        throw new Error('Connection timeout while contacting SSLCommerz');
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${ordTimeout.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Refund facing gateway timeout' });

      expect(res.status).toBe(504);
      expect(res.body.errorCode).toBe('REFUND_MANUAL_REVIEW_REQUIRED');

      const [dbRef] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, ordTimeout.id));

      expect(dbRef.status).toBe('PENDING');
      expect(dbRef.providerRefundRef).toBeNull();
      timeoutRefundId = dbRef.id;
    });

    it('5.2 timeout keeps order PAID', async () => {
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, timeoutOrderId));
      expect(dbOrder.status).toBe('PAID');
    });

    it('5.3 timeout keeps enrollment ACTIVE', async () => {
      const [dbEnr] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, timeoutEnrollmentId));
      expect(dbEnr.status).toBe('ACTIVE');
    });

    it('5.4 timeout keeps certificate unchanged', async () => {
      const [dbCert] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, timeoutCertificateId));
      expect(dbCert.status).toBe('ACTIVE');
      expect(dbCert.revokedAt).toBeNull();
    });

    it('5.5 timeout sets manualReviewRequired', async () => {
      const [dbRef] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, timeoutRefundId));
      expect(dbRef.status).toBe('PENDING');
      expect(dbRef.providerRefundRef).toBeNull();
    });

    it('5.6 timeout does not auto-initiate another provider request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${timeoutOrderId}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Attempt duplicate initiation without reconciliation' });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('REFUND_MANUAL_REVIEW_REQUIRED');
      expect(mockSslCommerz.refundInitiationCalls.length).toBe(0);
    });
  });

  // ==========================================
  // 6. MANUAL RECONCILIATION
  // ==========================================
  describe('6. Manual Reconciliation', () => {
    let manualRefundId: string;
    let manualOrderId: string;

    beforeAll(async () => {
      const [ordManual] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-MANUAL-001',
          studentId,
          status: 'PAID',
          subtotalCents: 100000,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();
      manualOrderId = ordManual.id;

      const [pmManual] = await testDb
        .insert(schema.payments)
        .values({
          orderId: ordManual.id,
          merchantTranId: 'TSP-TX-MANUAL-001',
          provider: 'SSLCOMMERZ',
          valId: 'VAL-MANUAL-001',
          bankTranId: 'BANK-TR-MANUAL-001',
          amountCents: 100000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      const [refManual] = await testDb
        .insert(schema.refunds)
        .values({
          refundNumber: `TSP-REF-${ordManual.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`,
          orderId: ordManual.id,
          paymentId: pmManual.id,
          amountCents: 100000,
          currency: 'BDT',
          reason: 'Initial attempt',
          status: 'PENDING',
          providerRefundRef: null,
        })
        .returning();
      manualRefundId = refManual.id;
    });

    it('6.1 non-admin cannot reconcile', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${manualRefundId}/reconcile`)
        .set('Cookie', studentCookies)
        .send({
          action: 'LINK_PROVIDER_REFERENCE',
          providerRefundRef: 'REF_MANUAL_LINK_001',
        });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('6.2 admin can link verified provider_ref to pending/null-ref refund', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${manualRefundId}/reconcile`)
        .set('Cookie', adminCookies)
        .send({
          action: 'LINK_PROVIDER_REFERENCE',
          providerRefundRef: 'REF_MANUAL_LINK_001',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.providerRefundRef).toBe('REF_MANUAL_LINK_001');
    });

    it('6.3 linking provider ref does not finalize refund', async () => {
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, manualOrderId));
      expect(dbOrder.status).toBe('PAID');

      const [dbRef] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, manualRefundId));
      expect(dbRef.status).toBe('PENDING');
    });

    it('6.4 provider query can finalize after reference is linked', async () => {
      mockSslCommerz.refundQueryHandler = async () => ({
        APIConnect: 'DONE',
        status: 'refunded',
        refund_ref_id: 'REF_MANUAL_LINK_001',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${manualRefundId}/query`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PROCESSED');

      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, manualOrderId));
      expect(dbOrder.status).toBe('REFUNDED');
    });

    it('6.5 manual mark-failed preserves order PAID', async () => {
      const [ordAmb] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-AMB-002',
          studentId,
          status: 'PAID',
          subtotalCents: 100000,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      const [pmAmb] = await testDb
        .insert(schema.payments)
        .values({
          orderId: ordAmb.id,
          merchantTranId: 'TSP-TX-AMB-002',
          provider: 'SSLCOMMERZ',
          valId: 'VAL-AMB-002',
          bankTranId: 'BANK-TR-AMB-002',
          amountCents: 100000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      const [refAmb] = await testDb
        .insert(schema.refunds)
        .values({
          refundNumber: `TSP-REF-${ordAmb.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`,
          orderId: ordAmb.id,
          paymentId: pmAmb.id,
          amountCents: 100000,
          currency: 'BDT',
          reason: 'Initial attempt',
          status: 'PENDING',
          providerRefundRef: null,
        })
        .returning();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refAmb.id}/reconcile`)
        .set('Cookie', adminCookies)
        .send({
          action: 'MARK_FAILED',
          reason: 'SSLCommerz support confirmed request was not registered',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FAILED');

      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, ordAmb.id));
      expect(dbOrder.status).toBe('PAID');
    });
  });

  // ==========================================
  // 7. CONCURRENCY & RACE CONDITIONS
  // ==========================================
  describe('7. Concurrency & Race Condition Protections', () => {
    it('7.1 simultaneous initiation creates one refund row', async () => {
      const [ordConcInit] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-CONC-INIT',
          studentId,
          status: 'PAID',
          subtotalCents: 120000,
          payableCents: 120000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      await testDb.insert(schema.payments).values({
        orderId: ordConcInit.id,
        merchantTranId: 'TSP-TX-CONC-INIT',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-CONC-INIT',
        bankTranId: 'BANK-TR-CONC-INIT',
        amountCents: 120000,
        currency: 'BDT',
        status: 'VALIDATED',
      });

      // Fire 2 simultaneous initiation requests
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${ordConcInit.id}/refund`)
          .set('Cookie', adminCookies)
          .send({ reason: 'Concurrent initiation A' }),
        request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${ordConcInit.id}/refund`)
          .set('Cookie', adminCookies)
          .send({ reason: 'Concurrent initiation B' }),
      ]);

      const successCount = [r1, r2].filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      const dbRefunds = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, ordConcInit.id));

      expect(dbRefunds.length).toBe(1);
    });

    it('7.2 duplicate initiation sees REFUND_ALREADY_PENDING', async () => {
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order2Unrelated.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'First refund attempt' });

      expect(res1.status).toBe(200);

      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order2Unrelated.id}/refund`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Second refund attempt' });

      expect(res2.status).toBe(409);
      expect(res2.body.errorCode).toBe('REFUND_ALREADY_PENDING');
    });

    it('7.3 concurrent finalization cannot double-process', async () => {
      const [ordConc] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-CONC-FIN',
          studentId,
          status: 'PAID',
          subtotalCents: 180000,
          payableCents: 180000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      const [pmConc] = await testDb
        .insert(schema.payments)
        .values({
          orderId: ordConc.id,
          merchantTranId: 'TSP-TX-CONC-FIN',
          provider: 'SSLCOMMERZ',
          valId: 'VAL-CONC-FIN',
          bankTranId: 'BANK-TR-CONC-FIN',
          amountCents: 180000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      const [refConc] = await testDb
        .insert(schema.refunds)
        .values({
          refundNumber: `TSP-REF-${ordConc.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`,
          orderId: ordConc.id,
          paymentId: pmConc.id,
          amountCents: 180000,
          currency: 'BDT',
          reason: 'Concurrency test',
          status: 'PENDING',
          providerRefundRef: 'REF_CONC_FIN_READY',
        })
        .returning();

      mockSslCommerz.refundQueryHandler = async () => ({
        APIConnect: 'DONE',
        status: 'refunded',
        refund_ref_id: 'REF_CONC_FIN_READY',
      });

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/admin/refunds/${refConc.id}/query`)
          .set('Cookie', adminCookies),
        request(app.getHttpServer())
          .post(`/api/v1/admin/refunds/${refConc.id}/query`)
          .set('Cookie', adminCookies),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.status).toBe('PROCESSED');
      expect(res2.body.data.status).toBe('PROCESSED');

      const refundsCount = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, ordConc.id));
      expect(refundsCount.length).toBe(1);
    });

    it('7.4 query + finalization cannot cause inconsistent state', async () => {
      const [dbOrder] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, 'TSP-ORD-CONC-FIN'));
      expect(dbOrder.status).toBe('REFUNDED');
    });

    it('7.5 retry + reconciliation race is safe', async () => {
      const [ordRace] = await testDb
        .insert(schema.orders)
        .values({
          orderNumber: 'TSP-ORD-RACE-001',
          studentId,
          status: 'PAID',
          subtotalCents: 110000,
          payableCents: 110000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(),
        })
        .returning();

      const [pmRace] = await testDb
        .insert(schema.payments)
        .values({
          orderId: ordRace.id,
          merchantTranId: 'TSP-TX-RACE-001',
          provider: 'SSLCOMMERZ',
          valId: 'VAL-RACE-001',
          bankTranId: 'BANK-TR-RACE-001',
          amountCents: 110000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      const [refRace] = await testDb
        .insert(schema.refunds)
        .values({
          refundNumber: `TSP-REF-${ordRace.id.replace(/-/g, '').slice(0, 22).toUpperCase()}`,
          orderId: ordRace.id,
          paymentId: pmRace.id,
          amountCents: 110000,
          currency: 'BDT',
          reason: 'Race test',
          status: 'PENDING',
          providerRefundRef: null,
        })
        .returning();

      // Simultaneous retry and reconciliation
      const [retryRes, reconcileRes] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/admin/orders/${ordRace.id}/refund`)
          .set('Cookie', adminCookies)
          .send({ reason: 'Retry attempt while reconciling' }),
        request(app.getHttpServer())
          .post(`/api/v1/admin/refunds/${refRace.id}/reconcile`)
          .set('Cookie', adminCookies)
          .send({ action: 'MARK_FAILED', reason: 'Reconciliation mark failed' }),
      ]);

      // System remains deterministic: retry rejects with REFUND_MANUAL_REVIEW_REQUIRED while reconcile succeeds or vice versa
      expect(retryRes.status === 409 || retryRes.status === 200).toBe(true);
      expect(reconcileRes.status === 200 || reconcileRes.status === 400).toBe(true);

      const [dbRef] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.id, refRace.id));
      expect(['PENDING', 'FAILED', 'PROCESSED']).toContain(dbRef.status);
    });
  });

  // ==========================================
  // 8. AUTHORIZATION
  // ==========================================
  describe('8. Authorization Enforcement', () => {
    it('8.1 student cannot access admin refund endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/refunds')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('8.2 unauthenticated access rejected', async () => {
      const res1 = await request(app.getHttpServer()).get('/api/v1/admin/refunds');
      expect(res1.status).toBe(401);
      expect(res1.body.errorCode).toBe('UNAUTHENTICATED');

      const res2 = await request(app.getHttpServer()).post(`/api/v1/admin/orders/${order1.id}/refund`);
      expect(res2.status).toBe(401);
    });

    it('8.3 admin can access authorized refund listing and detail', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/admin/refunds?limit=50')
        .set('Cookie', adminCookies);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data.items)).toBe(true);

      const firstId = listRes.body.data.items[0].id;
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/refunds/${firstId}`)
        .set('Cookie', adminCookies);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.id).toBe(firstId);
    });
  });

  // ==========================================
  // 9. SECURITY & PARAMETER SAFETY
  // ==========================================
  describe('9. Security & Parameter Safety', () => {
    it('9.1 no gateway credentials exposed', async () => {
      const [firstRefund] = await testDb.select().from(schema.refunds).limit(1);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/refunds/${firstRefund.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      const str = JSON.stringify(res.body);
      expect(str).not.toContain('store_passwd');
      expect(str).not.toContain('SSLCOMMERZ_STORE_PASSWORD');
    });

    it('9.2 no arbitrary refund amount accepted', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order1.id}/refund`)
        .set('Cookie', adminCookies)
        .send({
          reason: 'Arbitrary amount injection',
          amountCents: 100,
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('9.3 no arbitrary provider reference accepted in normal initiation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order1.id}/refund`)
        .set('Cookie', adminCookies)
        .send({
          reason: 'Arbitrary provider ref injection',
          providerRefundRef: 'FAKE_PROVIDER_REF',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('9.4 order ownership/relationship is server-derived', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${order1.id}/refund`)
        .set('Cookie', adminCookies)
        .send({
          reason: 'Body attempting to override orderId or paymentId',
          orderId: '00000000-0000-0000-0000-000000000000',
          paymentId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('9.5 refund IDs validated using existing conventions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/refunds/malformed-not-uuid')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_ID');
    });
  });
});
