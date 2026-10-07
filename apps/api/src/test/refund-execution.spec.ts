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
import { eq, and } from 'drizzle-orm';
import {
  MockSSLCommerzClient,
  SSLCOMMERZ_CLIENT,
} from '../modules/payments/sslcommerz.client';
import { RefundsService } from '../modules/refunds/refunds.service';
import { RefundRequestsService } from '../modules/refunds/refund-requests.service';

describe('P5.5.5 — Refund Execution, Provider Integration & Authoritative Finalization Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let mockSslCommerz: MockSSLCommerzClient;
  let refundsService: RefundsService;
  let refundRequestsService: RefundRequestsService;

  let adminCookies: string[];
  let studentCookies: string[];
  let student2Cookies: string[];

  let adminId: string;
  let studentId: string;
  let student2Id: string;

  let courseA: any;
  let courseB: any;

  let order1: any;
  let payment1: any;
  let enrollment1: any;
  let certificate1: any;
  let invoice1: any;
  let orderItem1: any;

  let order2: any;
  let payment2: any;
  let enrollment2: any;
  let certificate2: any;
  let invoice2: any;
  let orderItem2: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    mockSslCommerz = new MockSSLCommerzClient();

    // 1. Seed Roles & Users
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
        email: 'p555-admin@example.com',
        username: 'p555admin',
        name: 'P555 Admin User',
        passwordHash,
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
        email: 'p555-student1@example.com',
        username: 'p555student1',
        name: 'P555 Student One',
        passwordHash,
        isVerified: true,
      })
      .returning();
    studentId = studentUser.id;
    await testDb.insert(schema.userRoles).values({
      userId: studentId,
      roleId: studentRole.id,
    });

    const [student2User] = await testDb
      .insert(schema.users)
      .values({
        email: 'p555-student2@example.com',
        username: 'p555student2',
        name: 'P555 Student Two',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = student2User.id;
    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // 2. Seed Category & Courses
    const [cat] = await testDb
      .insert(schema.categories)
      .values({
        name: 'P555 Engineering',
        slug: 'p555-engineering',
        description: 'P555 test category',
      })
      .returning();

    const [cA] = await testDb
      .insert(schema.courses)
      .values({
        title: 'P555 Microservices Architecture',
        slug: 'p555-microservices',
        categoryId: cat.id,
        instructorId: adminId,
        priceCents: 100000,
        published: true,
      })
      .returning();
    courseA = cA;

    const [cB] = await testDb
      .insert(schema.courses)
      .values({
        title: 'P555 Distributed Systems',
        slug: 'p555-distributed',
        categoryId: cat.id,
        instructorId: adminId,
        priceCents: 200000,
        published: true,
      })
      .returning();
    courseB = cB;

    // 3. Build NestJS App with MockSSLCommerzClient & testDb
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

    refundsService = moduleRef.get<RefundsService>(RefundsService);
    refundRequestsService = moduleRef.get<RefundRequestsService>(RefundRequestsService);

    // 4. Authenticate sessions
    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'p555-admin@example.com', password: 'Password123!' });
    adminCookies = adminLoginRes.get('Set-Cookie') || [];

    const studentLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'p555-student1@example.com', password: 'Password123!' });
    studentCookies = studentLoginRes.get('Set-Cookie') || [];

    const student2LoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'p555-student2@example.com', password: 'Password123!' });
    student2Cookies = student2LoginRes.get('Set-Cookie') || [];
  });

  afterAll(async () => {
    if (app) await app.close();
    if (testPool) await testPool.end();
  });

  beforeEach(async () => {
    mockSslCommerz.clear();

    // Clean ephemeral test tables
    await testDb.delete(schema.auditLogs);
    await testDb.delete(schema.refundRequests);
    await testDb.delete(schema.refunds);
    await testDb.delete(schema.invoices);
    await testDb.delete(schema.certificates);
    await testDb.delete(schema.enrollments);
    await testDb.delete(schema.payments);
    await testDb.delete(schema.orderItems);
    await testDb.delete(schema.orders);

    // Seed baseline Order 1 (Paid, Course A, Student 1)
    const paidAt = new Date(Date.now() - 3600 * 1000 * 24); // 1 day ago
    const [ord1] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-P555-001',
        studentId,
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        status: 'PAID',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        paidAt,
      })
      .returning();
    order1 = ord1;

    const [item1] = await testDb
      .insert(schema.orderItems)
      .values({
        orderId: order1.id,
        courseId: courseA.id,
        courseTitle: courseA.title,
        unitPriceCents: 100000,
        discountCents: 0,
        payableCents: 100000,
      })
      .returning();
    orderItem1 = item1;

    const [pay1] = await testDb
      .insert(schema.payments)
      .values({
        orderId: order1.id,
        merchantTranId: 'TSP-TXN-P555-001',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-P555-001',
        bankTranId: 'BANK-TRAN-P555-001',
        amountCents: 100000,
        currency: 'BDT',
        status: 'VALIDATED',
        validatedAt: paidAt,
      })
      .returning();
    payment1 = pay1;

    const [enr1] = await testDb
      .insert(schema.enrollments)
      .values({
        studentId,
        courseId: courseA.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment1 = enr1;

    const [cert1] = await testDb
      .insert(schema.certificates)
      .values({
        enrollmentId: enrollment1.id,
        courseId: courseA.id,
        studentId,
        studentName: 'P555 Student One',
        courseTitle: courseA.title,
        instructorName: 'Admin Instructor',
        completedAt: new Date(),
        certificateNumber: 'TSP-CERT-P555-001',
        status: 'ACTIVE',
      })
      .returning();
    certificate1 = cert1;

    const [inv1] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-P555-001',
        orderId: order1.id,
        studentId,
        studentName: 'P555 Student One',
        studentEmail: 'p555-student1@example.com',
        courseTitle: courseA.title,
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        paymentMethod: 'SSLCOMMERZ',
        bankTranId: 'BANK-TRAN-P555-001',
        status: 'PAID',
      })
      .returning();
    invoice1 = inv1;

    // Seed baseline Order 2 (Paid, Course B, Student 2)
    const [ord2] = await testDb
      .insert(schema.orders)
      .values({
        orderNumber: 'TSP-ORD-P555-002',
        studentId: student2Id,
        subtotalCents: 200000,
        discountCents: 0,
        payableCents: 200000,
        currency: 'BDT',
        status: 'PAID',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        paidAt,
      })
      .returning();
    order2 = ord2;

    const [item2] = await testDb
      .insert(schema.orderItems)
      .values({
        orderId: order2.id,
        courseId: courseB.id,
        courseTitle: courseB.title,
        unitPriceCents: 200000,
        discountCents: 0,
        payableCents: 200000,
      })
      .returning();
    orderItem2 = item2;

    const [pay2] = await testDb
      .insert(schema.payments)
      .values({
        orderId: order2.id,
        merchantTranId: 'TSP-TXN-P555-002',
        provider: 'SSLCOMMERZ',
        valId: 'VAL-P555-002',
        bankTranId: 'BANK-TRAN-P555-002',
        amountCents: 200000,
        currency: 'BDT',
        status: 'VALIDATED',
        validatedAt: paidAt,
      })
      .returning();
    payment2 = pay2;

    const [enr2] = await testDb
      .insert(schema.enrollments)
      .values({
        studentId: student2Id,
        courseId: courseB.id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment2 = enr2;

    const [cert2] = await testDb
      .insert(schema.certificates)
      .values({
        enrollmentId: enrollment2.id,
        courseId: courseB.id,
        studentId: student2Id,
        studentName: 'P555 Student Two',
        courseTitle: courseB.title,
        instructorName: 'Admin Instructor',
        completedAt: new Date(),
        certificateNumber: 'TSP-CERT-P555-002',
        status: 'ACTIVE',
      })
      .returning();
    certificate2 = cert2;

    const [inv2] = await testDb
      .insert(schema.invoices)
      .values({
        invoiceNumber: 'TSP-INV-P555-002',
        orderId: order2.id,
        studentId: student2Id,
        studentName: 'P555 Student Two',
        studentEmail: 'p555-student2@example.com',
        courseTitle: courseB.title,
        subtotalCents: 200000,
        discountCents: 0,
        payableCents: 200000,
        currency: 'BDT',
        paymentMethod: 'SSLCOMMERZ',
        bankTranId: 'BANK-TRAN-P555-002',
        status: 'PAID',
      })
      .returning();
    invoice2 = inv2;
  });

  // Helper to create an APPROVED refund request for order1
  async function createApprovedRequest(orderId = order1.id, stId = studentId, cId = courseA.id, enrId = enrollment1.id) {
    const [req] = await testDb
      .insert(schema.refundRequests)
      .values({
        requestNumber: `TSP-REQ-${Date.now().toString(36).toUpperCase()}`,
        orderId,
        studentId: stId,
        courseId: cId,
        enrollmentId: enrId,
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Approved refund request for testing P5.5.5 execution',
        courseProgressAtRequest: 10,
        status: 'APPROVED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        adminNotes: 'Admin approved for provider refund',
      })
      .returning();
    return req;
  }

  // =========================================================================
  // 1. HAPPY PATH (Tests 1 - 4)
  // =========================================================================
  describe('1. Happy Path Execution & Provider Finalization', () => {
    it('1. APPROVED request + PAID order -> refund operation initiated', async () => {
      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.orderId).toBe(order1.id);
      expect(res.body.data.amountCents).toBe(100000);
      expect(res.body.data.currency).toBe('BDT');

      // Verify SSLCommerz client received initiateRefund call
      expect(mockSslCommerz.refundInitiationCalls).toHaveLength(1);
      expect(mockSslCommerz.refundInitiationCalls[0].bank_tran_id).toBe('BANK-TRAN-P555-001');
    });

    it('2. refund request gets correct refund_id associated safely', async () => {
      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      const refundId = res.body.data.id;
      expect(refundId).toBeDefined();

      // Verify persisted in database
      const [updatedReq] = await testDb
        .select()
        .from(schema.refundRequests)
        .where(eq(schema.refundRequests.id, req.id));

      expect(updatedReq.refundId).toBe(refundId);
      expect(updatedReq.status).toBe('APPROVED');
    });

    it('3. existing P5 RefundsService is invoked and audit event recorded', async () => {
      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      // Verify audit logs from RefundsService and RefundRequestsService
      const logs = await testDb.select().from(schema.auditLogs);
      const actions = logs.map((l: any) => l.action);
      expect(actions).toContain('REFUND_INITIATED');
      expect(actions).toContain('REFUND_REQUEST_REFUND_INITIATED');
    });

    it('4. provider completion reaches authoritative atomicFinalizeRefund', async () => {
      const req = await createApprovedRequest();

      const execRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      const refundId = execRes.body.data.id;

      // Simulate provider settling the refund: query status confirms 'refunded'
      mockSslCommerz.refundQueries.set(`REF_${execRes.body.data.refundNumber}`, {
        status: 'refunded',
        refund_ref_id: `REF_${execRes.body.data.refundNumber}`,
      });

      const queryRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/refunds/${refundId}/query`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(queryRes.body.data.status).toBe('PROCESSED');

      // Verify domain entities transitioned atomically
      const [finalOrder] = await testDb.select().from(schema.orders).where(eq(schema.orders.id, order1.id));
      expect(finalOrder.status).toBe('REFUNDED');

      const [finalInvoice] = await testDb.select().from(schema.invoices).where(eq(schema.invoices.id, invoice1.id));
      expect(finalInvoice.status).toBe('REFUNDED');

      const [finalEnrollment] = await testDb.select().from(schema.enrollments).where(eq(schema.enrollments.id, enrollment1.id));
      expect(finalEnrollment.status).toBe('CANCELLED');

      const [finalCertificate] = await testDb.select().from(schema.certificates).where(eq(schema.certificates.id, certificate1.id));
      expect(finalCertificate.status).toBe('REVOKED');
      expect(finalCertificate.revocationReason).toBe('Order refunded');

      // Verify unrelated Order 2 / Student 2 remained untouched
      const [order2Check] = await testDb.select().from(schema.orders).where(eq(schema.orders.id, order2.id));
      expect(order2Check.status).toBe('PAID');
      const [enrollment2Check] = await testDb.select().from(schema.enrollments).where(eq(schema.enrollments.id, enrollment2.id));
      expect(enrollment2Check.status).toBe('ACTIVE');
    });
  });

  // =========================================================================
  // 2. EXISTING DIRECT ADMIN REFUND (Tests 5 - 7)
  // =========================================================================
  describe('2. Existing Direct Admin Refund Race Handling', () => {
    it('5. APPROVED request + REFUNDED order -> link existing refund', async () => {
      // Direct admin refund was executed previously on order1
      const refundDto = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Direct administrative refund override',
      });
      await refundsService.atomicFinalizeRefund(refundDto.id, order1.id, adminId);

      // Now create an approved student request for this order (e.g. approved prior to sync)
      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(refundDto.id);
      expect(res.body.data.status).toBe('PROCESSED');

      // Verify request is linked
      const [updatedReq] = await testDb
        .select()
        .from(schema.refundRequests)
        .where(eq(schema.refundRequests.id, req.id));
      expect(updatedReq.refundId).toBe(refundDto.id);
    });

    it('6. no second provider call when linking existing direct refund', async () => {
      const refundDto = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Direct refund',
      });
      await refundsService.atomicFinalizeRefund(refundDto.id, order1.id, adminId);

      const callsBefore = mockSslCommerz.refundInitiationCalls.length;
      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(mockSslCommerz.refundInitiationCalls.length).toBe(callsBefore);
    });

    it('7. audit event recorded indicating link to direct refund', async () => {
      const refundDto = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Direct refund',
      });
      await refundsService.atomicFinalizeRefund(refundDto.id, order1.id, adminId);

      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      const [linkAudit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'REFUND_REQUEST_LINKED_TO_DIRECT_REFUND'));

      expect(linkAudit).toBeDefined();
      expect(linkAudit.targetId).toBe(req.id);
      expect(linkAudit.actorId).toBe(adminId);
    });
  });

  // =========================================================================
  // 3. EXISTING PENDING REFUND (Tests 8 - 10)
  // =========================================================================
  describe('3. Existing Pending Refund Operation Handling', () => {
    it('8. APPROVED request + PENDING refund -> reuse existing operation and link', async () => {
      // Prior pending refund exists
      const existingRefund = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Previous pending refund operation',
      });

      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.data.id).toBe(existingRefund.id);
      expect(res.body.data.status).toBe('PENDING');

      const [updatedReq] = await testDb
        .select()
        .from(schema.refundRequests)
        .where(eq(schema.refundRequests.id, req.id));
      expect(updatedReq.refundId).toBe(existingRefund.id);
    });

    it('9. no duplicate refund row created when pending refund exists', async () => {
      await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Previous pending refund',
      });

      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      const allRefunds = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));
      expect(allRefunds).toHaveLength(1);
    });

    it('10. no blind second provider initiation when pending refund exists', async () => {
      await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Previous pending refund',
      });
      const callsBefore = mockSslCommerz.refundInitiationCalls.length;

      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(mockSslCommerz.refundInitiationCalls.length).toBe(callsBefore);
    });
  });

  // =========================================================================
  // 4. EXISTING FAILED REFUND (Tests 11 - 13)
  // =========================================================================
  describe('4. Existing Failed Refund Operation Retry', () => {
    it('11. APPROVED request + FAILED refund -> existing row retried in place', async () => {
      // Simulate failed prior refund
      mockSslCommerz.refundInitiationHandler = async () => ({
        status: 'failed',
        errorReason: 'Bank network rejection',
      });

      await expect(
        refundsService.initiateOrRetryRefund(order1.id, adminId, {
          reason: 'Initial attempt that fails',
        })
      ).rejects.toThrow();

      // Now reset provider to succeed
      mockSslCommerz.refundInitiationHandler = undefined;

      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
    });

    it('12. refund ID and refund number preserved during retry', async () => {
      mockSslCommerz.refundInitiationHandler = async () => ({
        status: 'failed',
        errorReason: 'Temporary merchant issue',
      });

      await expect(
        refundsService.initiateOrRetryRefund(order1.id, adminId, {
          reason: 'Initial attempt',
        })
      ).rejects.toThrow();

      const [failedRow] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));
      const originalRefundId = failedRow.id;
      const originalRefundNumber = failedRow.refundNumber;

      mockSslCommerz.refundInitiationHandler = undefined;

      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.data.id).toBe(originalRefundId);
      expect(res.body.data.refundNumber).toBe(originalRefundNumber);
    });

    it('13. no second refund row created when retrying failed refund', async () => {
      mockSslCommerz.refundInitiationHandler = async () => ({
        status: 'failed',
        errorReason: 'Temporary merchant issue',
      });

      await expect(
        refundsService.initiateOrRetryRefund(order1.id, adminId, {
          reason: 'Initial attempt',
        })
      ).rejects.toThrow();

      mockSslCommerz.refundInitiationHandler = undefined;
      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      const allRefunds = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));
      expect(allRefunds).toHaveLength(1);
    });
  });

  // =========================================================================
  // 5. EXISTING PROCESSED REFUND (Tests 14 - 15)
  // =========================================================================
  describe('5. Existing Processed Refund Handling', () => {
    it('14. APPROVED request + PROCESSED refund -> link existing refund', async () => {
      const refundDto = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Direct prior refund',
      });
      await refundsService.atomicFinalizeRefund(refundDto.id, order1.id, adminId);

      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.data.id).toBe(refundDto.id);
      expect(res.body.data.status).toBe('PROCESSED');
    });

    it('15. no provider call made when linking already processed refund', async () => {
      const refundDto = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Direct prior refund',
      });
      await refundsService.atomicFinalizeRefund(refundDto.id, order1.id, adminId);

      const callsBefore = mockSslCommerz.refundInitiationCalls.length;
      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(mockSslCommerz.refundInitiationCalls.length).toBe(callsBefore);
    });
  });

  // =========================================================================
  // 6. INVALID ORDER STATES (Tests 16 - 18)
  // =========================================================================
  describe('6. Invalid Order States Safe Rejection', () => {
    it('16. APPROVED request + PENDING order -> safe manual-review rejection', async () => {
      await testDb.update(schema.orders).set({ status: 'PENDING' }).where(eq(schema.orders.id, order1.id));
      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(400);

      expect(res.body.errorCode).toBe('ORDER_NOT_REFUNDABLE');
      expect(mockSslCommerz.refundInitiationCalls).toHaveLength(0);

      // Verify audit log recorded for investigation
      const [audit] = await testDb
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'REFUND_REQUEST_ORDER_STATE_INVALID'));
      expect(audit).toBeDefined();
    });

    it('17. APPROVED request + CANCELLED order -> safe manual-review rejection', async () => {
      await testDb.update(schema.orders).set({ status: 'CANCELLED' }).where(eq(schema.orders.id, order1.id));
      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(400);

      expect(res.body.errorCode).toBe('ORDER_NOT_REFUNDABLE');
      expect(mockSslCommerz.refundInitiationCalls).toHaveLength(0);
    });

    it('18. APPROVED request + FAILED order -> safe manual-review rejection', async () => {
      await testDb.update(schema.orders).set({ status: 'FAILED' }).where(eq(schema.orders.id, order1.id));
      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(400);

      expect(res.body.errorCode).toBe('ORDER_NOT_REFUNDABLE');
      expect(mockSslCommerz.refundInitiationCalls).toHaveLength(0);
    });
  });

  // =========================================================================
  // 7. CONCURRENCY REQUIREMENTS (Tests 19 - 23)
  // =========================================================================
  describe('7. Concurrency & Parallel Worker Execution', () => {
    it('19. two concurrent executions of same approved request do not crash', async () => {
      const req = await createApprovedRequest();

      const [res1, res2] = await Promise.all([
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
      ]);

      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
    });

    it('20. exactly one refund row created under concurrent execution', async () => {
      const req = await createApprovedRequest();

      await Promise.all([
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
      ]);

      const allRefunds = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));
      expect(allRefunds).toHaveLength(1);
    });

    it('21. exactly one provider initiation call under concurrent execution', async () => {
      const req = await createApprovedRequest();

      await Promise.all([
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
      ]);

      expect(mockSslCommerz.refundInitiationCalls).toHaveLength(1);
    });

    it('22. both concurrent executions converge on the same refund record', async () => {
      const req = await createApprovedRequest();

      const [res1, res2] = await Promise.all([
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
      ]);

      const [refundRow] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));

      expect(res1.id).toBe(refundRow.id);
      expect(res2.id).toBe(refundRow.id);

      const [updatedReq] = await testDb
        .select()
        .from(schema.refundRequests)
        .where(eq(schema.refundRequests.id, req.id));
      expect(updatedReq.refundId).toBe(refundRow.id);
    });

    it('23. no duplicate finalization: concurrent finalizations remain idempotent', async () => {
      const req = await createApprovedRequest();

      const res = await refundRequestsService.executeApprovedRefundRequest(req.id, adminId);

      const [final1, final2] = await Promise.all([
        refundsService.atomicFinalizeRefund(res.id, order1.id, adminId),
        refundsService.atomicFinalizeRefund(res.id, order1.id, adminId),
      ]);

      expect(final1.status).toBe('PROCESSED');
      expect(final2.status).toBe('PROCESSED');

      const [finalOrder] = await testDb.select().from(schema.orders).where(eq(schema.orders.id, order1.id));
      expect(finalOrder.status).toBe('REFUNDED');

      const [finalEnrollment] = await testDb.select().from(schema.enrollments).where(eq(schema.enrollments.id, enrollment1.id));
      expect(finalEnrollment.status).toBe('CANCELLED');
    });
  });

  // =========================================================================
  // 8. RACE CONDITIONS (Tests 24 - 26)
  // =========================================================================
  describe('8. Race Conditions & Interleaving', () => {
    it('24. direct admin refund races with student-request execution', async () => {
      const req = await createApprovedRequest();

      // Admin directly initiates refund right as worker starts
      const directRefund = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Direct admin override',
      });

      // Worker executes approved request
      const workerRes = await refundRequestsService.executeApprovedRefundRequest(req.id, adminId);

      expect(workerRes.id).toBe(directRefund.id);
      const allRefunds = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));
      expect(allRefunds).toHaveLength(1);
    });

    it('25. reconciliation races with P5.5.5 execution', async () => {
      const req = await createApprovedRequest();

      // Refund operation already initiated and pending with gateway
      const refundDto = await refundsService.initiateOrRetryRefund(order1.id, adminId, {
        reason: 'Pending gateway refund',
      });

      // Status query marks settled
      mockSslCommerz.refundQueries.set(`REF_${refundDto.refundNumber}`, {
        status: 'refunded',
        refund_ref_id: `REF_${refundDto.refundNumber}`,
      });

      const [reconciled, executed] = await Promise.all([
        refundsService.queryRefundStatus(refundDto.id, adminId),
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId),
      ]);

      expect(reconciled.status).toBe('PROCESSED');
      expect(executed.id).toBe(refundDto.id);

      const [reqCheck] = await testDb
        .select()
        .from(schema.refundRequests)
        .where(eq(schema.refundRequests.id, req.id));
      expect(reqCheck.refundId).toBe(refundDto.id);
    });

    it('26. provider timeout creates no second refund attempt automatically', async () => {
      const req = await createApprovedRequest();

      // Gateway times out during initiation
      mockSslCommerz.refundInitiationHandler = async () => {
        throw new Error('SSLCommerz gateway timeout');
      };

      await expect(
        refundRequestsService.executeApprovedRefundRequest(req.id, adminId)
      ).rejects.toThrow();

      // Verify refund row exists in PENDING state
      const [pendingRefund] = await testDb
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.orderId, order1.id));
      expect(pendingRefund).toBeDefined();
      expect(pendingRefund.status).toBe('PENDING');

      // Verify request is linked to the pending operation
      const [reqCheck] = await testDb
        .select()
        .from(schema.refundRequests)
        .where(eq(schema.refundRequests.id, req.id));
      expect(reqCheck.refundId).toBe(pendingRefund.id);

      const callsBefore = mockSslCommerz.refundInitiationCalls.length;

      // Now reset provider to normal; subsequent execute must NOT issue second call
      mockSslCommerz.refundInitiationHandler = undefined;
      const retryRes = await refundRequestsService.executeApprovedRefundRequest(req.id, adminId);

      expect(retryRes.id).toBe(pendingRefund.id);
      expect(mockSslCommerz.refundInitiationCalls.length).toBe(callsBefore);
    });
  });

  // =========================================================================
  // 9. SECURITY & RBAC (Tests 27 - 30)
  // =========================================================================
  describe('9. Security & Authorization Guarantees', () => {
    it('27. student cannot execute refund (403 Forbidden)', async () => {
      const req = await createApprovedRequest();

      await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', studentCookies)
        .expect(403);
    });

    it('28. student cannot access admin batch execution endpoint (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/refund-requests/process-approved')
        .set('Cookie', studentCookies)
        .expect(403);
    });

    it('29. refund request/order/course/enrollment scoping remains exact', async () => {
      const req = await createApprovedRequest();

      const execRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      // Finalize refund
      await refundsService.atomicFinalizeRefund(execRes.body.data.id, order1.id, adminId);

      // Check Student 1, Enrollment 1: cancelled
      const [enr1] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment1.id));
      expect(enr1.status).toBe('CANCELLED');

      // Check Student 2, Enrollment 2: remains active
      const [enr2] = await testDb
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.id, enrollment2.id));
      expect(enr2.status).toBe('ACTIVE');

      // Check Student 2, Certificate 2: remains active
      const [cert2] = await testDb
        .select()
        .from(schema.certificates)
        .where(eq(schema.certificates.id, certificate2.id));
      expect(cert2.status).toBe('ACTIVE');
    });

    it('30. no internal provider secrets exposed in responses or audit logs', async () => {
      const req = await createApprovedRequest();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/refund-requests/${req.id}/execute`)
        .set('Cookie', adminCookies)
        .expect(200);

      const strResponse = JSON.stringify(res.body);
      expect(strResponse).not.toContain('SSLCOMMERZ_STORE_PASSWORD');
      expect(strResponse).not.toContain('store_passwd');

      const logs = await testDb.select().from(schema.auditLogs);
      const strLogs = JSON.stringify(logs);
      expect(strLogs).not.toContain('SSLCOMMERZ_STORE_PASSWORD');
      expect(strLogs).not.toContain('store_passwd');
    });
  });

  // =========================================================================
  // 10. BATCH DISCOVERY & PROCESSING
  // =========================================================================
  describe('10. Batch Discovery & Processing', () => {
    it('31. discovers approved unprocessed requests and processes in batch', async () => {
      const req1 = await createApprovedRequest(order1.id, studentId, courseA.id, enrollment1.id);
      const req2 = await createApprovedRequest(order2.id, student2Id, courseB.id, enrollment2.id);

      // Call discover endpoint
      const discoverRes = await request(app.getHttpServer())
        .get('/api/v1/admin/refund-requests/approved-unprocessed')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(discoverRes.body.data.length).toBeGreaterThanOrEqual(2);

      // Call batch process endpoint
      const batchRes = await request(app.getHttpServer())
        .post('/api/v1/admin/refund-requests/process-approved')
        .send({ limit: 10 })
        .set('Cookie', adminCookies)
        .expect(200);

      expect(batchRes.body.success).toBe(true);
      expect(batchRes.body.data.processed).toBe(2);
      expect(batchRes.body.data.results).toHaveLength(2);

      // Subsequent discovery returns 0 unprocessed
      const discoverAfter = await request(app.getHttpServer())
        .get('/api/v1/admin/refund-requests/approved-unprocessed')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(discoverAfter.body.data).toHaveLength(0);
    });
  });
});
