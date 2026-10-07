import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { PDFParse } from 'pdf-parse';
import { AppModule } from '../app.module';
import { DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, desc } from 'drizzle-orm';
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';
import { getStorageToken } from '@nestjs/throttler';
import { InvoicesService } from '../modules/invoices/invoices.service';
import { InvoicePdfService } from '../modules/invoices/invoice-pdf.service';

describe('P5.5.6 — Downloadable PDF Invoices Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;
  let invoicesService: InvoicesService;
  let invoicePdfService: InvoicePdfService;
  let throttlerStorage: any;

  let adminCookies: string[];
  let student1Cookies: string[];
  let student2Cookies: string[];

  let adminId: string;
  let student1Id: string;
  let student2Id: string;

  let testCourse: any;
  let order1: any;
  let invoice1: any;
  let orderRefunded: any;
  let invoiceRefunded: any;
  let orderStudent2: any;
  let invoiceStudent2: any;

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

    const passwordHash = await CryptoUtil.hashPassword('Password123!');

    const [adminUser] = await testDb
      .insert(schema.users)
      .values({
        email: 'pdf-admin@example.com',
        username: 'pdfadmin',
        name: 'PDF Admin User',
        passwordHash,
        isVerified: true,
      })
      .returning();
    adminId = adminUser.id;
    await testDb.insert(schema.userRoles).values({
      userId: adminId,
      roleId: adminRole.id,
    });

    const [student1User] = await testDb
      .insert(schema.users)
      .values({
        email: 'pdf-student1@example.com',
        username: 'pdfstudent1',
        name: 'Alice Student',
        phone: '+8801711111111',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student1Id = student1User.id;
    await testDb.insert(schema.userRoles).values({
      userId: student1Id,
      roleId: studentRole.id,
    });

    const [student2User] = await testDb
      .insert(schema.users)
      .values({
        email: 'pdf-student2@example.com',
        username: 'pdfstudent2',
        name: 'Bob Student',
        phone: '+8801722222222',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = student2User.id;
    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // 2. Seed Category & Course
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Software Engineering',
        slug: 'software-engineering-pdf',
        description: 'PDF test category',
      })
      .returning();

    const [c] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Full-Stack Web Development Bootcamp',
        slug: 'fullstack-web-dev-pdf',
        categoryId: cat.id,
        instructorId: adminId,
        priceCents: 100000,
        published: true,
      })
      .returning();
    testCourse = c;

    // 3. Build NestJS App
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

    invoicesService = moduleRef.get<InvoicesService>(InvoicesService);
    invoicePdfService = moduleRef.get<InvoicePdfService>(InvoicePdfService);
    try {
      throttlerStorage = moduleRef.get<any>(getStorageToken());
    } catch {}

    // 4. Authenticate sessions
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'pdf-admin@example.com', password: 'Password123!' });
    adminCookies = adminLoginRes.get('Set-Cookie') || [];

    const student1LoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'pdf-student1@example.com', password: 'Password123!' });
    student1Cookies = student1LoginRes.get('Set-Cookie') || [];

    const student2LoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'pdf-student2@example.com', password: 'Password123!' });
    student2Cookies = student2LoginRes.get('Set-Cookie') || [];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPool) await testPool.end();
  });

  beforeEach(async () => {
    // Reset throttler storage between tests
    if (throttlerStorage) {
      if (throttlerStorage._storage?.clear) {
        throttlerStorage._storage.clear();
      }
      if (throttlerStorage.hitExpirations?.clear) {
        throttlerStorage.hitExpirations.clear();
      }
      if (throttlerStorage.storage?.clear) {
        throttlerStorage.storage.clear();
      }
    }

    // Clean ephemeral test tables
    await testDb.delete(schema.auditLogs);
    await testDb.delete(schema.invoices);
    await testDb.delete(schema.payments);
    await testDb.delete(schema.orderItems);
    await testDb.delete(schema.orders);

    const paidAt = new Date('2026-10-05T08:00:00.000Z');

    // 1. Order 1 (PAID, Alice, discount applied)
    const [ord1] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-2026-ALICE-01',
        studentId: student1Id,
        subtotalCents: 100000,
        discountCents: 20000,
        payableCents: 80000,
        currency: 'BDT',
        status: 'PAID',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        paidAt,
      })
      .returning();
    order1 = ord1;

    await testDb.insert(schema.orderItems).values({
      orderId: order1.id,
      courseId: testCourse.id,
      courseTitle: testCourse.title,
      unitPriceCents: 100000,
      discountCents: 20000,
      payableCents: 80000,
    });

    const [inv1] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-ALICE-01',
        orderId: order1.id,
        studentId: student1Id,
        studentName: 'Alice Student',
        studentEmail: 'pdf-student1@example.com',
        studentPhone: '+8801711111111',
        courseTitle: testCourse.title,
        subtotalCents: 100000,
        discountCents: 20000,
        payableCents: 80000,
        currency: 'BDT',
        paymentMethod: 'BKASH-BKash',
        bankTranId: 'BANK-TRAN-ALICE-001',
        status: 'PAID',
        issuedAt: paidAt,
      })
      .returning();
    invoice1 = inv1;

    // 2. Order Refunded (Alice, refunded)
    const [ordRef] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-2026-ALICE-REF',
        studentId: student1Id,
        subtotalCents: 150000,
        discountCents: 0,
        payableCents: 150000,
        currency: 'BDT',
        status: 'REFUNDED',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        paidAt,
      })
      .returning();
    orderRefunded = ordRef;

    const [invRef] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-ALICE-REF',
        orderId: orderRefunded.id,
        studentId: student1Id,
        studentName: 'Alice Student',
        studentEmail: 'pdf-student1@example.com',
        studentPhone: '+8801711111111',
        courseTitle: testCourse.title,
        subtotalCents: 150000,
        discountCents: 0,
        payableCents: 150000,
        currency: 'BDT',
        paymentMethod: 'NAGAD-Nagad',
        bankTranId: 'BANK-TRAN-ALICE-REF',
        status: 'REFUNDED',
        issuedAt: paidAt,
      })
      .returning();
    invoiceRefunded = invRef;

    // 3. Order Student 2 (Bob)
    const [ord2] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-2026-BOB-01',
        studentId: student2Id,
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        status: 'PAID',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        paidAt,
      })
      .returning();
    orderStudent2 = ord2;

    const [inv2] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-BOB-01',
        orderId: orderStudent2.id,
        studentId: student2Id,
        studentName: 'Bob Student',
        studentEmail: 'pdf-student2@example.com',
        studentPhone: '+8801722222222',
        courseTitle: testCourse.title,
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        paymentMethod: 'SSLCOMMERZ',
        bankTranId: 'BANK-TRAN-BOB-001',
        status: 'PAID',
        issuedAt: paidAt,
      })
      .returning();
    invoiceStudent2 = inv2;
  });

  // Helper to extract text from PDF buffer
  async function extractPdfText(buf: Buffer): Promise<string> {
    const parser = new PDFParse(new Uint8Array(buf));
    await parser.load();
    const result = await parser.getText();
    return result.text;
  }

  // =========================================================================
  // 1. AUTHORIZATION & ACCESS CONTROL (IDOR)
  // =========================================================================
  describe('1. Authorization & IDOR Protection', () => {
    it('1. Authenticated owner can download invoice PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('TSP-INV-2026-ALICE-01.pdf');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(500);
    });

    it('2. Admin can download any student invoice PDF via standard route', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('TSP-INV-2026-ALICE-01.pdf');
    });

    it('2b. Admin can download student invoice PDF via admin route', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/invoices/${invoice1.id}/pdf`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('TSP-INV-2026-ALICE-01.pdf');
    });

    it('3. Unauthenticated request is rejected (401)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .expect(401);

      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('4. Student accessing another students invoice is strictly rejected (403 IDOR blocked)', async () => {
      // Bob attempts to download Alice's invoice
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student2Cookies)
        .expect(403);

      expect(res.body.errorCode).toBe('INVOICE_ACCESS_DENIED');
      expect(res.body.message).toContain('Access denied');
    });

    it('4b. Student accessing admin invoice PDF endpoint is rejected (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/admin/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(403);
    });

    it('5. Unknown invoice handled safely (404)', async () => {
      const nonExistentId = '11111111-2222-3333-4444-555555555555';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${nonExistentId}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(404);

      expect(res.body.errorCode).toBe('INVOICE_NOT_FOUND');
    });

    it('5b. Invalid UUID format is rejected (400)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices/not-a-uuid/pdf')
        .set('Cookie', student1Cookies)
        .expect(400);

      expect(res.body.errorCode).toBe('INVALID_ID');
    });
  });

  // =========================================================================
  // 2. HTTP HEADERS & BINARY INTEGRITY
  // =========================================================================
  describe('2. HTTP Headers & Binary Integrity', () => {
    it('6. Correct Content-Type application/pdf', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
    });

    it('7. Correct Content-Disposition with safe deterministic filename', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="TSP-INV-2026-ALICE-01.pdf"'
      );
    });

    it('8. PDF binary is valid with standard header and trailer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const buf = Buffer.from(res.body);
      const strStart = buf.slice(0, 8).toString('utf-8');
      expect(strStart).toContain('%PDF-');

      const strEnd = buf.slice(-128).toString('utf-8');
      expect(strEnd).toContain('%%EOF');
    });
  });

  // =========================================================================
  // 3. AUTHORITATIVE PDF CONTENT VALIDATION
  // =========================================================================
  describe('3. Authoritative PDF Content Validation', () => {
    it('9. Invoice number appears in PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('TSP-INV-2026-ALICE-01');
    });

    it('10. Order number appears in PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('TSP-ORD-2026-ALICE-01');
    });

    it('11. BDT monetary values appear correctly and never with dollar symbol', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('BDT 1,000.00');
      expect(text).toContain('BDT 800.00');
      expect(text).not.toContain('$');
    });

    it('12. Discount appears correctly', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('BDT 200.00');
      expect(text).toContain('Total Discount:');
    });

    it('13. Payable total appears correctly', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('Total Paid:');
      expect(text).toContain('BDT 800.00');
    });

    it('14. Payment method appears when present', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('Method: BKASH-BKash');
    });

    it('15. Transaction identifier appears in customer invoice', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('BANK-TRAN-ALICE-001');
    });

    it('16. Refunded invoice PDF correctly shows REFUNDED status and refund notice banner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceRefunded.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('REFUNDED');
      expect(text).toContain('OFFICIAL RECEIPT • REFUNDED');
      expect(text).toContain('NOTICE: This invoice was refunded');
    });

    it('17. Historical financial snapshot remains unchanged in refunded invoice PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceRefunded.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      // Historical values: subtotal 150000, payable 150000
      expect(text).toContain('BDT 1,500.00');
      expect(text).toContain('BANK-TRAN-ALICE-REF');
      expect(text).toContain('NAGAD-Nagad');
    });

    it('18. No synthetic VAT or tax calculations are invented', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies)
        .expect(200);

      const text = await extractPdfText(res.body);
      expect(text).toContain('Prices are inclusive as displayed.');
      expect(text).not.toContain('VAT 15%');
      expect(text).not.toContain('Tax:');
      expect(text).not.toContain('VAT Amount');
    });
  });

  // =========================================================================
  // 4. RATE LIMITING, AUDIT & CONCURRENCY
  // =========================================================================
  describe('4. Rate Limiting, Audit & Concurrency', () => {
    it('19. Rate limiting restricts excessive downloads (10 req/min limit)', async () => {
      // Send 10 downloads
      for (let i = 0; i < 10; i++) {
        const r = await request(app.getHttpServer())
          .get(`/api/v1/invoices/${invoice1.id}/pdf`)
          .set('Cookie', student1Cookies);
        expect(r.status).toBe(200);
      }

      // 11th request should be throttled (429)
      const throttled = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}/pdf`)
        .set('Cookie', student1Cookies);

      expect(throttled.status).toBe(429);
    });

    it('20. Audit event INVOICE_PDF_DOWNLOADED is recorded in database', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceStudent2.id}/pdf`)
        .set('Cookie', student2Cookies)
        .expect(200);

      const logs = await testDb
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'INVOICE_PDF_DOWNLOADED'))
        .orderBy(desc(schema.auditLogs.createdAt));

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const log = logs[0];
      expect(log.actorId).toBe(student2Id);
      expect(log.targetType).toBe('invoice');
      expect(log.targetId).toBe(invoiceStudent2.id);

      const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
      expect(meta.invoiceNumber).toBe(invoiceStudent2.invoiceNumber);
      expect(meta.orderNumber).toBe('TSP-ORD-2026-BOB-01');
    });

    it('21. No internal secrets or provider passwords leak into PDF or responses', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceStudent2.id}/pdf`)
        .set('Cookie', student2Cookies)
        .expect(200);

      const raw = res.body.toString('utf-8');
      expect(raw).not.toContain('store_passwd');
      expect(raw).not.toContain('SSLCOMMERZ_STORE_PASSWORD');
      expect(raw).not.toContain('adminNotes');
    });

    it('22. Concurrent downloads remain thread-safe and produce identical valid PDFs', async () => {
      const [resA, resB] = await Promise.all([
        invoicesService.getInvoicePdfBuffer(invoice1.id, { id: adminId, role: 'admin' }),
        invoicesService.getInvoicePdfBuffer(invoice1.id, { id: adminId, role: 'admin' }),
      ]);

      expect(resA.buffer.length).toBeGreaterThan(500);
      expect(resB.buffer.length).toBeGreaterThan(500);
      expect(resA.filename).toBe('TSP-INV-2026-ALICE-01.pdf');
      expect(resB.filename).toBe('TSP-INV-2026-ALICE-01.pdf');

      const textA = await extractPdfText(resA.buffer);
      const textB = await extractPdfText(resB.buffer);
      expect(textA).toBe(textB);
    });
  });
});
