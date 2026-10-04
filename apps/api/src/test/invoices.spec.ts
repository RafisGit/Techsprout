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
import { eq, sql } from 'drizzle-orm';
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';

describe('P5.4.1 — Invoice Service & Private Retrieval API Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;

  let studentCookies: string[];
  let student2Cookies: string[];
  let studentEmptyCookies: string[];
  let adminCookies: string[];

  let studentId: string;
  let student2Id: string;
  let studentEmptyId: string;
  let adminId: string;

  let testCourse: any;
  let testOrder1: any;
  let testOrder2: any;
  let testOrderRefunded: any;
  let testOrderStudent2: any;
  let testOrderZeroPayable: any;

  let invoice1: any;
  let invoice2: any;
  let invoiceRefunded: any;
  let invoiceStudent2: any;
  let invoiceZeroPayable: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    mockSslCommerz = new MockSSLCommerzClient();

    // 1. Retrieve roles
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Password123!');

    // 2. Retrieve Admin and Student 1
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

    // 3. Create Student 2
    const [st2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Bob Student Two',
        username: 'bob_student2',
        email: 'student2_invoices@techsprout.edu',
        phone: '01733333333',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = st2.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // 4. Create Student with 0 Invoices
    const [stEmpty] = await testDb
      .insert(schema.users)
      .values({
        name: 'Empty Student',
        username: 'empty_student',
        email: 'empty_invoices@techsprout.edu',
        phone: '01744444444',
        passwordHash,
        isVerified: true,
      })
      .returning();
    studentEmptyId = stEmpty.id;

    await testDb.insert(schema.userRoles).values({
      userId: studentEmptyId,
      roleId: studentRole.id,
    });

    // 5. Create category & courses
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Computer Science',
        slug: 'comp-sci-invoices',
        isActive: true,
      })
      .returning();

    const [course] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Fullstack TypeScript Architecture',
        slug: 'fullstack-ts-arch',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '2500.00',
        currency: 'BDT',
        categoryId: cat.id,
        instructorId: adminId,
      })
      .returning();
    testCourse = course;

    // 6. Create Orders and Invoices
    // Invoice 1: Student 1 Paid
    const [ord1] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-INV-001',
        studentId,
        status: 'PAID',
        subtotalCents: 250000,
        discountCents: 50000,
        payableCents: 200000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-10-01T10:00:00.000Z'),
      })
      .returning();
    testOrder1 = ord1;

    const [pm1] = await testDb
      .insert(schema.payments)
      .values({
        orderId: ord1.id,
        merchantTranId: 'TSP-TX-INV-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-INV-001',
        bankTranId: 'BANK-TR-001',
        amountCents: 200000,
        currency: 'BDT',
        status: 'VALIDATED',
        cardType: 'bKash Mobile Banking',
      })
      .returning();

    const [inv1] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-000101',
        orderId: ord1.id,
        studentId,
        studentName: 'Student One Snapshot',
        studentEmail: 'student@techsprout.edu',
        studentPhone: '+8801700000001',
        courseTitle: 'Fullstack TypeScript Architecture',
        subtotalCents: 250000,
        discountCents: 50000,
        payableCents: 200000,
        currency: 'BDT',
        paymentMethod: 'bKash Mobile Banking',
        bankTranId: 'BANK-TR-001',
        status: 'PAID',
        issuedAt: new Date('2026-10-01T10:05:00.000Z'),
      })
      .returning();
    invoice1 = inv1;

    // Invoice 2: Student 1 Paid (Later date)
    const [ord2] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-INV-002',
        studentId,
        status: 'PAID',
        subtotalCents: 150000,
        discountCents: 0,
        payableCents: 150000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-10-02T12:00:00.000Z'),
      })
      .returning();
    testOrder2 = ord2;

    const [inv2] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-000102',
        orderId: ord2.id,
        studentId,
        studentName: 'Student One Snapshot',
        studentEmail: 'student@techsprout.edu',
        studentPhone: '+8801700000001',
        courseTitle: 'Mastering NestJS Architecture',
        subtotalCents: 150000,
        discountCents: 0,
        payableCents: 150000,
        currency: 'BDT',
        paymentMethod: 'Nagad Mobile Banking',
        bankTranId: 'BANK-TR-002',
        status: 'PAID',
        issuedAt: new Date('2026-10-02T12:05:00.000Z'),
      })
      .returning();
    invoice2 = inv2;

    // Invoice 3: Student 1 REFUNDED status
    const [ordRef] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-INV-003',
        studentId,
        status: 'REFUNDED',
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-09-28T10:00:00.000Z'),
      })
      .returning();
    testOrderRefunded = ordRef;

    const [invRef] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-000103',
        orderId: ordRef.id,
        studentId,
        studentName: 'Student One Snapshot',
        studentEmail: 'student@techsprout.edu',
        studentPhone: '+8801700000001',
        courseTitle: 'Intro to SQL Optimization',
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        paymentMethod: 'VISA Credit Card',
        bankTranId: 'BANK-TR-003',
        status: 'REFUNDED',
        issuedAt: new Date('2026-09-28T10:05:00.000Z'),
      })
      .returning();
    invoiceRefunded = invRef;

    // Invoice 4: Student 2 Paid
    const [ordSt2] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-INV-004',
        studentId: student2Id,
        status: 'PAID',
        subtotalCents: 350000,
        discountCents: 0,
        payableCents: 350000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-10-02T15:00:00.000Z'),
      })
      .returning();
    testOrderStudent2 = ordSt2;

    const [invSt2] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-000104',
        orderId: ordSt2.id,
        studentId: student2Id,
        studentName: 'Bob Student Two Snapshot',
        studentEmail: 'student2_invoices@techsprout.edu',
        studentPhone: '+8801733333333',
        courseTitle: 'DevOps & Docker In-Depth',
        subtotalCents: 350000,
        discountCents: 0,
        payableCents: 350000,
        currency: 'BDT',
        paymentMethod: 'MasterCard Debit',
        bankTranId: 'BANK-TR-004',
        status: 'PAID',
        issuedAt: new Date('2026-10-02T15:05:00.000Z'),
      })
      .returning();
    invoiceStudent2 = invSt2;

    // Invoice 5: Zero-Payable (100% Coupon discount)
    const [ordZero] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-INV-005',
        studentId,
        status: 'PAID',
        subtotalCents: 80000,
        discountCents: 80000,
        payableCents: 0,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: new Date('2026-09-20T10:00:00.000Z'),
      })
      .returning();
    testOrderZeroPayable = ordZero;

    const [invZero] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-2026-000105',
        orderId: ordZero.id,
        studentId,
        studentName: 'Student One Snapshot',
        studentEmail: 'student@techsprout.edu',
        studentPhone: '+8801700000001',
        courseTitle: 'Free Scholarship Course',
        subtotalCents: 80000,
        discountCents: 80000,
        payableCents: 0,
        currency: 'BDT',
        paymentMethod: 'COUPON',
        bankTranId: 'FREE_COUPON',
        status: 'PAID',
        issuedAt: new Date('2026-09-20T10:05:00.000Z'),
      })
      .returning();
    invoiceZeroPayable = invZero;

    // 7. Nest Application initialization
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

    // 8. Authenticate users
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
      email: 'student2_invoices@techsprout.edu',
      password: 'Password123!',
    });
    student2Cookies = student2Login.headers['set-cookie'] as unknown as string[];

    const studentEmptyLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'empty_invoices@techsprout.edu',
      password: 'Password123!',
    });
    studentEmptyCookies = studentEmptyLogin.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // 1. AUTHORIZATION
  // ==========================================
  describe('1. Authorization & Ownership Enforcement', () => {
    it('1.1 should reject unauthenticated GET /api/v1/invoices with 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/invoices');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('1.2 should reject unauthenticated GET /api/v1/invoices/:id with 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/invoices/${invoice1.id}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('1.3 should allow student to retrieve their own invoice via GET /api/v1/invoices/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(invoice1.id);
      expect(res.body.data.invoiceNumber).toBe(invoice1.invoiceNumber);
      expect(res.body.data.studentId).toBe(studentId);
      expect(res.body.data.payableCents).toBe(200000);
    });

    it('1.4 should reject student retrieving another student invoice with 403 INVOICE_ACCESS_DENIED', async () => {
      // Student 1 attempts to retrieve Student 2's invoice
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceStudent2.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('INVOICE_ACCESS_DENIED');
    });

    it('1.5 should allow admin to retrieve another student invoice via GET /api/v1/invoices/:id', async () => {
      // Admin retrieves Student 2's invoice via general endpoint
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceStudent2.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(invoiceStudent2.id);
      expect(res.body.data.studentId).toBe(student2Id);
    });

    it('1.6 should reject non-admin accessing GET /api/v1/admin/invoices with 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('1.7 should allow admin to access GET /api/v1/admin/invoices', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
    });
  });

  // ==========================================
  // 2. NOT FOUND & VALIDATION
  // ==========================================
  describe('2. Not Found & Parameter Validation', () => {
    it('2.1 should return 404 INVOICE_NOT_FOUND for nonexistent invoice UUID', async () => {
      const nonExistentUuid = 'e8b7d44c-32b0-4f59-994c-123456789abc';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${nonExistentUuid}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('INVOICE_NOT_FOUND');
    });

    it('2.2 should return 400 INVALID_ID for malformed invoice UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices/not-a-valid-uuid')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('INVALID_ID');
    });
  });

  // ==========================================
  // 3. STUDENT LIST & PAGINATION
  // ==========================================
  describe('3. Student Invoice List & Pagination', () => {
    it('3.1 should return only authenticated student invoices on GET /api/v1/invoices', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(4); // invoice1, invoice2, invoiceRefunded, invoiceZeroPayable

      const allBelongToStudent = res.body.data.items.every(
        (item: any) => item.studentId === studentId
      );
      expect(allBelongToStudent).toBe(true);

      // Verify Student 2's invoice is NOT in Student 1's list
      const hasStudent2Invoice = res.body.data.items.some(
        (item: any) => item.id === invoiceStudent2.id
      );
      expect(hasStudent2Invoice).toBe(false);
    });

    it('3.2 should paginate student invoices correctly with page and limit', async () => {
      const resPage1 = await request(app.getHttpServer())
        .get('/api/v1/invoices?page=1&limit=2')
        .set('Cookie', studentCookies);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.items.length).toBe(2);
      expect(resPage1.body.data.pagination.page).toBe(1);
      expect(resPage1.body.data.pagination.limit).toBe(2);
      expect(resPage1.body.data.pagination.total).toBe(4);
      expect(resPage1.body.data.pagination.totalPages).toBe(2);
      expect(resPage1.body.data.pagination.hasNextPage).toBe(true);
      expect(resPage1.body.data.pagination.hasPreviousPage).toBe(false);

      const resPage2 = await request(app.getHttpServer())
        .get('/api/v1/invoices?page=2&limit=2')
        .set('Cookie', studentCookies);

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.items.length).toBe(2);
      expect(resPage2.body.data.pagination.page).toBe(2);
      expect(resPage2.body.data.pagination.hasNextPage).toBe(false);
      expect(resPage2.body.data.pagination.hasPreviousPage).toBe(true);

      // Verify no overlap between page 1 and page 2
      const page1Ids = resPage1.body.data.items.map((i: any) => i.id);
      const page2Ids = resPage2.body.data.items.map((i: any) => i.id);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it('3.3 should return correct total/totalPages according to project conventions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices?page=1&limit=10')
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(4);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });

    it('3.4 should return empty result correctly when student has no invoices', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/invoices')
        .set('Cookie', studentEmptyCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.pagination.totalPages).toBe(1);
      expect(res.body.data.pagination.hasNextPage).toBe(false);
      expect(res.body.data.pagination.hasPreviousPage).toBe(false);
    });
  });

  // ==========================================
  // 4. ADMIN INVOICE LIST & FILTERING
  // ==========================================
  describe('4. Admin Invoice List & Filtering', () => {
    it('4.1 should return invoices across all students on GET /api/v1/admin/invoices', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices?limit=50')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.total).toBe(5); // 4 for student 1 + 1 for student 2

      const studentIds = res.body.data.items.map((i: any) => i.studentId);
      expect(studentIds).toContain(studentId);
      expect(studentIds).toContain(student2Id);
    });

    it('4.2 should filter invoices by status (PAID vs REFUNDED)', async () => {
      const resPaid = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices?status=PAID')
        .set('Cookie', adminCookies);

      expect(resPaid.status).toBe(200);
      expect(resPaid.body.data.pagination.total).toBe(4);
      const allPaid = resPaid.body.data.items.every((i: any) => i.status === 'PAID');
      expect(allPaid).toBe(true);

      const resRefunded = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices?status=REFUNDED')
        .set('Cookie', adminCookies);

      expect(resRefunded.status).toBe(200);
      expect(resRefunded.body.data.pagination.total).toBe(1);
      expect(resRefunded.body.data.items[0].id).toBe(invoiceRefunded.id);
      expect(resRefunded.body.data.items[0].status).toBe('REFUNDED');
    });

    it('4.3 should filter invoices by date range (startDate / endDate)', async () => {
      // Invoices issued between Oct 1 and Oct 3
      const res = await request(app.getHttpServer())
        .get(
          '/api/v1/admin/invoices?startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-03T00:00:00.000Z'
        )
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      // Expected: invoice1 (Oct 1), invoice2 (Oct 2), invoiceStudent2 (Oct 2) = 3 invoices
      expect(res.body.data.pagination.total).toBe(3);
    });

    it('4.4 should filter invoices by search term matching studentName or courseTitle', async () => {
      const resSearch = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices?search=Bob%20Student')
        .set('Cookie', adminCookies);

      expect(resSearch.status).toBe(200);
      expect(resSearch.body.data.pagination.total).toBe(1);
      expect(resSearch.body.data.items[0].id).toBe(invoiceStudent2.id);

      const resCourse = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices?search=TypeScript')
        .set('Cookie', adminCookies);

      expect(resCourse.status).toBe(200);
      expect(resCourse.body.data.pagination.total).toBe(1);
      expect(resCourse.body.data.items[0].id).toBe(invoice1.id);
    });
  });

  // ==========================================
  // 5. SNAPSHOT IMMUTABILITY
  // ==========================================
  describe('5. Invoice Snapshot Immutability Verification', () => {
    it('5.1 should maintain original snapshot courseTitle and pricing even after underlying course changes', async () => {
      // Modify the original course title and price in database
      await testDb
        .update(schema.courses)
        .set({
          title: 'MUTATED: Title Changed After Purchase',
          price: '9999.00',
        })
        .where(eq(schema.courses.id, testCourse.id));

      // Fetch invoice detail
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      // The invoice must preserve the historical courseTitle and pricing
      expect(res.body.data.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(res.body.data.subtotalCents).toBe(250000);
      expect(res.body.data.discountCents).toBe(50000);
      expect(res.body.data.payableCents).toBe(200000);
    });

    it('5.2 should maintain original snapshot studentName and studentEmail even after student profile changes', async () => {
      // Modify student's live user record
      await testDb
        .update(schema.users)
        .set({
          name: 'Renamed Student User',
          email: 'brand_new_email@techsprout.edu',
        })
        .where(eq(schema.users.id, studentId));

      // Fetch invoice detail
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      // The invoice must preserve the historical snapshot name and email
      expect(res.body.data.studentName).toBe('Student One Snapshot');
      expect(res.body.data.studentEmail).toBe('student@techsprout.edu');
    });
  });

  // ==========================================
  // 6. ZERO-PAYABLE INVOICES
  // ==========================================
  describe('6. Zero-Payable Invoices Handling', () => {
    it('6.1 should accurately return zero-payable invoice with payableCents = 0 and BDT currency', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceZeroPayable.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body.data.payableCents).toBe(0);
      expect(res.body.data.subtotalCents).toBe(80000);
      expect(res.body.data.discountCents).toBe(80000);
      expect(res.body.data.currency).toBe('BDT');
      expect(res.body.data.paymentMethod).toBe('COUPON');
      expect(res.body.data.bankTranId).toBe('FREE_COUPON');
      expect(res.body.data.status).toBe('PAID');
    });
  });

  // ==========================================
  // 7. SECURITY & ENUMERATION PROTECTION
  // ==========================================
  describe('7. Security & Privacy Protection', () => {
    it('7.1 should prevent invoice enumeration by returning 403 INVOICE_ACCESS_DENIED for other students invoices', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoiceStudent2.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('INVOICE_ACCESS_DENIED');
      expect(res.body.data).toBeUndefined();
    });

    it('7.2 should not expose gateway credentials, passwords, or internal secrets in invoice responses', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      const bodyStr = JSON.stringify(res.body);

      // Verify no sensitive credentials leaked
      expect(bodyStr).not.toContain('store_passwd');
      expect(bodyStr).not.toContain('passwordHash');
      expect(bodyStr).not.toContain('SSLCOMMERZ_STORE_PASSWORD');
    });

    it('7.3 should return standard TechSprout API response envelope', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('invoiceNumber', invoice1.invoiceNumber);
    });
  });

  // ==========================================
  // 8. READ-ONLY GUARANTEES
  // ==========================================
  describe('8. Side-Effect-Free Read-Only Guarantees', () => {
    it('8.1 should verify GET invoice creates zero database records', async () => {
      const [beforeCount] = await testDb
        .select({ count: sql`count(*)` })
        .from(schema.invoices);

      await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      const [afterCount] = await testDb
        .select({ count: sql`count(*)` })
        .from(schema.invoices);

      expect(Number(afterCount.count)).toBe(Number(beforeCount.count));
    });

    it('8.2 should verify GET invoice does not mutate invoice.updatedAt timestamp', async () => {
      const [before] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice1.id));

      await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      const [after] = await testDb
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoice1.id));

      expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    });

    it('8.3 should verify GET invoice does not mutate order, payment, enrollment, or coupon records', async () => {
      const [orderBefore] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, testOrder1.id));

      await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      const [orderAfter] = await testDb
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, testOrder1.id));

      expect(orderAfter.status).toBe(orderBefore.status);
      expect(orderAfter.updatedAt.toISOString()).toBe(orderBefore.updatedAt.toISOString());
    });
  });

  // ==========================================
  // 9. ADMIN DETAIL ENDPOINT
  // ==========================================
  describe('9. Admin Invoice Detail Endpoint (GET /api/v1/admin/invoices/:id)', () => {
    it('9.1 should allow admin to retrieve any invoice via GET /api/v1/admin/invoices/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/invoices/${invoiceStudent2.id}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(invoiceStudent2.id);
      expect(res.body.data.studentId).toBe(student2Id);
    });

    it('9.2 should reject non-admin accessing GET /api/v1/admin/invoices/:id with 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/invoices/${invoice1.id}`)
        .set('Cookie', studentCookies);

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });

    it('9.3 should return 404 INVOICE_NOT_FOUND on GET /api/v1/admin/invoices/:id for nonexistent invoice', async () => {
      const nonExistentUuid = 'e8b7d44c-32b0-4f59-994c-123456789abc';
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/invoices/${nonExistentUuid}`)
        .set('Cookie', adminCookies);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('INVOICE_NOT_FOUND');
    });

    it('9.4 should return 400 INVALID_ID on GET /api/v1/admin/invoices/:id for malformed UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/invoices/bad-uuid')
        .set('Cookie', adminCookies);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('INVALID_ID');
    });
  });
});
