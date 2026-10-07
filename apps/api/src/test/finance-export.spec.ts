import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, desc, and } from 'drizzle-orm';
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';
import { getStorageToken } from '@nestjs/throttler';
import { FinanceService } from '../modules/finance/finance.service';
import {
  FinanceCsvService,
  ORDERS_CSV_HEADERS,
  REFUNDS_CSV_HEADERS,
  RECONCILIATION_CSV_HEADERS,
} from '../modules/finance/finance-csv.service';

describe('P5.5.7 — Admin Financial CSV Export Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;
  let financeService: FinanceService;
  let financeCsvService: FinanceCsvService;
  let throttlerStorage: any;

  let adminCookies: string[];
  let studentCookies: string[];

  let adminId: string;
  let studentId: string;

  let testCourse: any;
  let orderPaid: any;
  let orderRefunded: any;
  let refundProcessed: any;

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

    const [adminRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'admin'))
      .limit(1);

    const pwdHash = await CryptoUtil.hashPassword('Password123!');

    const [adminUser] = await testDb
      .insert(schema.users)
      .values({
        email: 'finance-admin@techsprout.edu',
        username: 'financeadmin',
        passwordHash: pwdHash,
        name: 'Finance Admin User',
        roleId: adminRole.id,
        isVerified: true,
      })
      .returning();
    adminId = adminUser.id;
    await testDb.insert(schema.userRoles).values({
      userId: adminId,
      roleId: adminRole.id,
    });

    const [studentUser] = await testDb
      .insert(schema.users)
      .values({
        email: 'student-buyer@techsprout.edu',
        username: 'studentbuyer',
        passwordHash: pwdHash,
        name: 'Arafat Rahman, Jr.', // Contains comma to test RFC 4180
        roleId: studentRole.id,
        isVerified: true,
      })
      .returning();
    studentId = studentUser.id;
    await testDb.insert(schema.userRoles).values({
      userId: studentId,
      roleId: studentRole.id,
    });

    // 2. Category & Course with Unicode / Special Characters
    const [category] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Web Engineering & Fintech',
        slug: 'web-fintech-' + Date.now(),
        isActive: true,
      })
      .returning();

    const [course] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Fullstack Next.js, NestJS & "Cloud" Architecture (বাংলা)', // Contains quotes, comma, Bangla
        slug: 'fullstack-mastery-' + Date.now(),
        categoryId: category.id,
        instructorId: adminId,
        priceCents: 500000, // 5,000.00 BDT
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      })
      .returning();
    testCourse = course;

    // 3. Paid Order & Invoice
    const [ordPaid] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'ORD-20261001-001',
        studentId: studentId,
        status: 'PAID',
        subtotalCents: 500000,
        discountCents: 50000, // 500.00 BDT
        payableCents: 450000,  // 4,500.00 BDT
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-10-01T12:00:00.000Z'),
        createdAt: new Date('2026-10-01T11:55:00.000Z'),
      })
      .returning();
    orderPaid = ordPaid;

    await testDb.insert(schema.orderItems).values({
      orderId: orderPaid.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 500000,
      discountCents: 50000,
      payableCents: 450000,
    });

    await testDb.insert(schema.invoices).values({
      invoiceNumber: 'TSP-INV-2026-0001',
      orderId: orderPaid.id,
      studentId: studentId,
      studentName: studentUser.name,
      studentEmail: studentUser.email,
      courseTitle: testCourse.title,
      subtotalCents: 500000,
      discountCents: 50000,
      payableCents: 450000,
      currency: 'BDT',
      paymentMethod: 'BKASH',
      bankTranId: 'TRX_BKASH_998811',
      status: 'PAID',
      issuedAt: new Date('2026-10-01T12:00:00.000Z'),
    });

    const [pmtPaid] = await testDb
      .insert(schema.payments)
      .values({
        orderId: orderPaid.id,
        merchantTranId: 'MTX_' + Date.now(),
        provider: 'SSLCOMMERZ',
        valId: 'VAL_TEST_001',
        bankTranId: 'TRX_BKASH_998811',
        amountCents: 450000,
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'BKASH',
        validatedAt: new Date('2026-10-01T12:00:00.000Z'),
      })
      .returning();

    // 4. Refunded Order, Refund Record & Invoice
    const [ordRef] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'ORD-20261002-002',
        studentId: studentId,
        status: 'REFUNDED',
        subtotalCents: 600000,
        discountCents: 0,
        payableCents: 600000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-10-02T10:00:00.000Z'),
        createdAt: new Date('2026-10-02T09:50:00.000Z'),
      })
      .returning();
    orderRefunded = ordRef;

    await testDb.insert(schema.orderItems).values({
      orderId: orderRefunded.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 600000,
      discountCents: 0,
      payableCents: 600000,
    });

    await testDb.insert(schema.invoices).values({
      invoiceNumber: 'TSP-INV-2026-0002',
      orderId: orderRefunded.id,
      studentId: studentId,
      studentName: studentUser.name,
      studentEmail: studentUser.email,
      courseTitle: testCourse.title,
      subtotalCents: 600000,
      discountCents: 0,
      payableCents: 600000,
      currency: 'BDT',
      paymentMethod: 'VISA',
      bankTranId: 'TRX_VISA_774411',
      status: 'REFUNDED',
      issuedAt: new Date('2026-10-02T10:00:00.000Z'),
    });

    const [pmtRef] = await testDb
      .insert(schema.payments)
      .values({
        orderId: orderRefunded.id,
        merchantTranId: 'MTX_REF_' + Date.now(),
        provider: 'SSLCOMMERZ',
        valId: 'VAL_TEST_002',
        bankTranId: 'TRX_VISA_774411',
        amountCents: 600000,
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'VISA',
        validatedAt: new Date('2026-10-02T10:00:00.000Z'),
      })
      .returning();

    const [refRecord] = await testDb
      .insert(schema.refunds)
      .values({
        refundNumber: 'TSP-REF-2026-0001',
        orderId: orderRefunded.id,
        paymentId: pmtRef.id,
        amountCents: 600000,
        currency: 'BDT',
        reason: 'Student dropped course due to schedule conflict, "requesting full return"', // Quotes & comma
        status: 'PROCESSED',
        processedBy: adminId,
        providerRefundRef: 'SSL_REF_889922',
        processedAt: new Date('2026-10-03T15:00:00.000Z'),
        createdAt: new Date('2026-10-03T14:30:00.000Z'),
      })
      .returning();
    refundProcessed = refRecord;

    // 5. Initialize Testing Module
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
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

    financeService = app.get(FinanceService);
    financeCsvService = app.get(FinanceCsvService);

    try {
      throttlerStorage = app.get(getStorageToken());
    } catch {
      throttlerStorage = null;
    }

    // Authenticate Admin Session
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'finance-admin@techsprout.edu', password: 'Password123!' });
    adminCookies = adminLoginRes.headers['set-cookie'] || [];

    // Authenticate Student Session
    const studentLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'student-buyer@techsprout.edu', password: 'Password123!' });
    studentCookies = studentLoginRes.headers['set-cookie'] || [];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPool) await testPool.end();
  });

  beforeEach(() => {
    if (throttlerStorage) {
      if (throttlerStorage._storage && typeof throttlerStorage._storage.clear === 'function') {
        throttlerStorage._storage.clear();
      }
      if (throttlerStorage.hitExpirations && typeof throttlerStorage.hitExpirations.clear === 'function') {
        throttlerStorage.hitExpirations.clear();
      }
    }
  });

  // ==========================================
  // 1. RBAC & AUTHORIZATION ENFORCEMENT
  // ==========================================
  describe('1. RBAC & Authorization', () => {
    it('1. rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/admin/finance/export?type=orders');
      expect(res.status).toBe(401);
    });

    it('2. rejects authenticated student requests with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders')
        .set('Cookie', studentCookies);
      expect(res.status).toBe(403);
    });

    it('3. allows authenticated administrators to access export', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  // ==========================================
  // 2. QUERY PARAMETER & DATE VALIDATIONS
  // ==========================================
  describe('2. Query Parameter & Date Boundary Validations', () => {
    it('4. rejects requests without export type with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('5. rejects invalid export type with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=invalid_type')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('6. rejects invalid startDate format with 400 INVALID_DATE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=not-a-date')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_DATE');
    });

    it('7. rejects invalid endDate format with 400 INVALID_DATE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=invalid')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_DATE');
    });

    it('8. rejects startDate > endDate with 400 INVALID_DATE_RANGE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-10&endDate=2026-10-01')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_DATE_RANGE');
    });

    it('9. rejects date range exceeding 90 days with 400 DATE_RANGE_EXCEEDED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-01-01&endDate=2026-06-01')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('DATE_RANGE_EXCEEDED');
    });

    it('10. accepts valid date range within 90 days', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-09-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);
      expect(res.status).toBe(200);
    });
  });

  // ==========================================
  // 3. ORDERS EXPORT CONTENT & FORMATTING
  // ==========================================
  describe('3. Orders Export Content & Headers', () => {
    it('11. exports orders CSV with text/csv content type and safe attachment filename', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="techsprout-orders-2026-10-01-to-2026-10-06\.csv"/);
    });

    it('12. contains UTF-8 BOM (\\uFEFF) at beginning of output', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      expect(res.text.startsWith('\uFEFF')).toBe(true);
    });

    it('13. orders CSV has stable deterministic headers matching architecture', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      const cleanText = res.text.replace(/^\uFEFF/, '');
      const firstLine = cleanText.split('\r\n')[0];
      const expectedHeaderLine = ORDERS_CSV_HEADERS.join(',');
      expect(firstLine).toBe(expectedHeaderLine);
    });

    it('14. orders CSV includes authoritative order details, integer cents and formatted BDT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      const text = res.text;
      expect(text).toContain('ORD-20261001-001');
      expect(text).toContain('500000'); // Subtotal minor units
      expect(text).toContain('BDT 5,000.00'); // Subtotal BDT
      expect(text).toContain('BDT 500.00');   // Discount BDT
      expect(text).toContain('BDT 4,500.00');  // Payable BDT
      expect(text).toContain('BKASH');
      expect(text).toContain('TRX_BKASH_998811');
      expect(text).toContain('TSP-INV-2026-0001');

      // Strict check: Dollar sign never used for BDT
      expect(text).not.toContain('$');
    });

    it('15. refunded orders accurately reflect REFUNDED status in export', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      expect(res.text).toContain('ORD-20261002-002');
      expect(res.text).toContain('REFUNDED');
      expect(res.text).toContain('TSP-INV-2026-0002');
    });
  });

  // ==========================================
  // 4. REFUNDS EXPORT CONTENT & FORMATTING
  // ==========================================
  describe('4. Refunds Export Content & Headers', () => {
    it('16. exports refunds CSV with correct headers and Content-Disposition', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=refunds&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="techsprout-refunds-2026-10-01-to-2026-10-06\.csv"/);

      const cleanText = res.text.replace(/^\uFEFF/, '');
      const firstLine = cleanText.split('\r\n')[0];
      expect(firstLine).toBe(REFUNDS_CSV_HEADERS.join(','));
    });

    it('17. refunds CSV includes refund number, status, provider ref, and formatted amounts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=refunds&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      const text = res.text;
      expect(text).toContain('TSP-REF-2026-0001');
      expect(text).toContain('ORD-20261002-002');
      expect(text).toContain('PROCESSED');
      expect(text).toContain('600000');
      expect(text).toContain('BDT 6,000.00');
      expect(text).toContain('SSL_REF_889922');
      expect(text).toContain('Finance Admin User');
    });
  });

  // ==========================================
  // 5. RECONCILIATION EXPORT
  // ==========================================
  describe('5. Reconciliation Export', () => {
    it('18. exports reconciliation scan discrepancies as CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=reconciliation&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="techsprout-reconciliation-2026-10-01-to-2026-10-06\.csv"/);

      const cleanText = res.text.replace(/^\uFEFF/, '');
      const firstLine = cleanText.split('\r\n')[0];
      expect(firstLine).toBe(RECONCILIATION_CSV_HEADERS.join(','));
    });

    it('19. reconciliation export is read-only and does not mutate orders or payments', async () => {
      const [orderBefore] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderPaid.id))
        .limit(1);

      await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=reconciliation')
        .set('Cookie', adminCookies);

      const [orderAfter] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderPaid.id))
        .limit(1);

      expect(orderAfter.status).toBe(orderBefore.status);
      expect(orderAfter.payableCents).toBe(orderBefore.payableCents);
    });
  });

  // ==========================================
  // 6. RFC 4180 ESCAPING & UNICODE HANDLING
  // ==========================================
  describe('6. RFC 4180 Escaping & Unicode Compliance', () => {
    it('20. properly escapes cells containing commas, double quotes, and preserves Bangla text', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      const text = res.text;
      // Name containing comma: "Arafat Rahman, Jr."
      expect(text).toContain('"Arafat Rahman, Jr."');
      // Title containing double quotes and Bangla: "Fullstack Next.js, NestJS & ""Cloud"" Architecture (বাংলা)"
      expect(text).toContain('বাংলা');
      expect(text).toContain('""Cloud""');
    });

    it('21. escapes refund reason containing quotes and commas correctly', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=refunds&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      // Reason: 'Student dropped course due to schedule conflict, "requesting full return"'
      expect(res.text).toContain('"Student dropped course due to schedule conflict, ""requesting full return"""');
    });
  });

  // ==========================================
  // 7. SECURITY & DATA LEAKAGE PREVENTION
  // ==========================================
  describe('7. Data Leakage & Secrets Protection', () => {
    it('22. CSV export does not leak database password hashes, session keys, or store passwords', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      const text = res.text;
      expect(text).not.toContain('Password123!');
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('techsprout_session');
      expect(text).not.toContain('STORE_PASS');
      expect(text).not.toContain('providerSessionKey');
    });
  });

  // ==========================================
  // 8. AUDIT LOGGING & RESOURCE PROTECTION
  // ==========================================
  describe('8. Audit Logging & Resource Protection', () => {
    it('23. records FINANCE_CSV_EXPORTED audit event upon successful export', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders&startDate=2026-10-01&endDate=2026-10-06')
        .set('Cookie', adminCookies);

      const [auditLog] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'FINANCE_CSV_EXPORTED'),
            eq(schema.auditLogs.actorId, adminId)
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);

      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe('FINANCE_CSV_EXPORTED');
      expect(auditLog.targetType).toBe('finance_export');
      expect(auditLog.targetId).toBe('orders');
      const meta = typeof auditLog.metadata === 'string' ? JSON.parse(auditLog.metadata) : auditLog.metadata;
      expect(meta.exportType).toBe('orders');
      expect(meta.recordCount).toBeGreaterThanOrEqual(1);
    });

    it('24. rate limiting protects export endpoint against abusive rapid scraping', async () => {
      // 10 requests allowed
      for (let i = 0; i < 10; i++) {
        const r = await request(app.getHttpServer())
          .get('/api/v1/admin/finance/export?type=orders')
          .set('Cookie', adminCookies);
        expect(r.status).toBe(200);
      }

      // 11th request must be rejected with 429
      const blockedRes = await request(app.getHttpServer())
        .get('/api/v1/admin/finance/export?type=orders')
        .set('Cookie', adminCookies);
      expect(blockedRes.status).toBe(429);
    });
  });
});
