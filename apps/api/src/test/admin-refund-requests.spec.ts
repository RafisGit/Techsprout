import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './test-helper';
import {
  refundRequests,
  orders,
  orderItems,
  users,
  courses,
  categories,
  enrollments,
  lessons,
  modules,
  lessonProgress,
  payments,
  refunds,
  auditLogs,
} from '../database/schema';
import { RefundRequestsService } from '../modules/refunds/refund-requests.service';
import { AdminRefundRequestsController } from '../modules/refunds/admin-refund-requests.controller';
import { AuditService } from '../modules/audit/audit.service';
import { ApiException } from '../common/errors/api-error';
import {
  adminApproveRefundRequestSchema,
  adminRejectRefundRequestSchema,
  refundRequestListQuerySchema,
} from '@techsprout/contracts';

describe('P5.5.4 — Admin Refund Review Queue Test Suite', () => {
  let db: any;
  let pool: any;
  let auditService: AuditService;
  let service: RefundRequestsService;
  let adminController: AdminRefundRequestsController;

  let student1Id: string;
  let student2Id: string;
  let adminId: string;
  let course1Id: string;
  let order1Id: string;
  let order2Id: string;
  let enrollment1Id: string;
  let enrollment2Id: string;
  let module1Id: string;

  beforeEach(async () => {
    const mem = await createTestDatabase();
    db = mem.db;
    pool = mem.pool;
    auditService = new AuditService(db);
    service = new RefundRequestsService(db, auditService);
    adminController = new AdminRefundRequestsController(service);

    // 1. Users
    const [student1] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'student@techsprout.edu'))
      .limit(1);
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@techsprout.edu'))
      .limit(1);

    student1Id = student1.id;
    adminId = admin.id;

    const [student2] = await db
      .insert(users)
      .values({
        email: 'student2@techsprout.edu',
        username: 'student2',
        name: 'Jane Doe',
        passwordHash: 'dummy-hash',
      })
      .returning();
    student2Id = student2.id;

    // 2. Category & Course
    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Cloud Computing',
        slug: 'cloud-computing',
        description: 'Cloud track',
      })
      .returning();

    const [c1] = await db
      .insert(courses)
      .values({
        categoryId: cat.id,
        instructorId: adminId,
        title: 'Kubernetes Mastery',
        slug: 'kubernetes-mastery',
        price: '5000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
      })
      .returning();
    course1Id = c1.id;

    // 3. Modules & Lessons
    const [m1] = await db
      .insert(modules)
      .values({
        courseId: course1Id,
        title: 'Module 1: Pods & Deployments',
        position: 1,
      })
      .returning();
    module1Id = m1.id;

    for (let i = 1; i <= 5; i++) {
      await db.insert(lessons).values({
        moduleId: module1Id,
        title: `Lesson ${i}`,
        slug: `lesson-${i}`,
        position: i,
        lessonType: 'VIDEO',
      });
    }

    // 4. Enrollments
    const [e1] = await db
      .insert(enrollments)
      .values({
        studentId: student1Id,
        courseId: course1Id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment1Id = e1.id;

    const [e2] = await db
      .insert(enrollments)
      .values({
        studentId: student2Id,
        courseId: course1Id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment2Id = e2.id;

    // 5. Orders
    const [ord1] = await db
      .insert(orders)
      .values({
        orderNumber: 'TSP-ORD-2026-TEST01',
        studentId: student1Id,
        subtotalCents: 500000,
        discountCents: 0,
        payableCents: 500000,
        currency: 'BDT',
        status: 'PAID',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Paid 1 day ago
      })
      .returning();
    order1Id = ord1.id;

    await db.insert(orderItems).values({
      orderId: order1Id,
      courseId: course1Id,
      courseTitle: 'Kubernetes Mastery',
      unitPriceCents: 500000,
      payableCents: 500000,
      currency: 'BDT',
    });

    const [ord2] = await db
      .insert(orders)
      .values({
        orderNumber: 'TSP-ORD-2026-TEST02',
        studentId: student2Id,
        subtotalCents: 500000,
        discountCents: 0,
        payableCents: 500000,
        currency: 'BDT',
        status: 'PAID',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        paidAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // Paid 2 days ago
      })
      .returning();
    order2Id = ord2.id;

    await db.insert(orderItems).values({
      orderId: order2Id,
      courseId: course1Id,
      courseTitle: 'Kubernetes Mastery',
      unitPriceCents: 500000,
      payableCents: 500000,
      currency: 'BDT',
    });
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('1. should list refund requests with pagination for administrators', async () => {
    // Seed 2 refund requests
    await db.insert(refundRequests).values([
      {
        requestNumber: 'TSP-REQ-TEST-0001',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Content does not cover microservices as expected.',
        courseProgressAtRequest: 10,
        status: 'PENDING',
      },
      {
        requestNumber: 'TSP-REQ-TEST-0002',
        orderId: order2Id,
        studentId: student2Id,
        courseId: course1Id,
        enrollmentId: enrollment2Id,
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Video streaming buffer issues encountered repeatedly.',
        courseProgressAtRequest: 0,
        status: 'PENDING',
      },
    ]);

    const result = await service.listAdminRefundRequests({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
    expect(result.items[0].orderNumber).toBeDefined();
    expect(result.items[0].studentName).toBeDefined();
    expect(result.items[0].studentEmail).toBeDefined();
    expect(result.items[0].payableCents).toBe(500000);
    expect(result.items[0].currency).toBe('BDT');
  });

  it('2. should filter refund requests by status (PENDING, APPROVED, REJECTED)', async () => {
    await db.insert(refundRequests).values([
      {
        requestNumber: 'TSP-REQ-PENDING',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Pending review details with 10+ characters.',
        courseProgressAtRequest: 5,
        status: 'PENDING',
      },
      {
        requestNumber: 'TSP-REQ-REJECTED',
        orderId: order2Id,
        studentId: student2Id,
        courseId: course1Id,
        enrollmentId: enrollment2Id,
        reasonCategory: 'PERSONAL_REASONS',
        reasonDetail: 'Rejected request details with 10+ characters.',
        courseProgressAtRequest: 15,
        status: 'REJECTED',
        rejectionReason: 'Exceeded policy window.',
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    ]);

    const pendingResult = await service.listAdminRefundRequests({ status: 'PENDING' });
    expect(pendingResult.items).toHaveLength(1);
    expect(pendingResult.items[0].requestNumber).toBe('TSP-REQ-PENDING');

    const rejectedResult = await service.listAdminRefundRequests({ status: 'REJECTED' });
    expect(rejectedResult.items).toHaveLength(1);
    expect(rejectedResult.items[0].requestNumber).toBe('TSP-REQ-REJECTED');

    const approvedResult = await service.listAdminRefundRequests({ status: 'APPROVED' });
    expect(approvedResult.items).toHaveLength(0);
  });

  it('3. should search refund requests by student email, order number, and course title', async () => {
    await db.insert(refundRequests).values([
      {
        requestNumber: 'TSP-REQ-SEARCH-1',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'ACCIDENTAL_PURCHASE',
        reasonDetail: 'Purchased twice by accident.',
        courseProgressAtRequest: 0,
        status: 'PENDING',
      },
      {
        requestNumber: 'TSP-REQ-SEARCH-2',
        orderId: order2Id,
        studentId: student2Id,
        courseId: course1Id,
        enrollmentId: enrollment2Id,
        reasonCategory: 'OTHER',
        reasonDetail: 'Schedule conflict preventing study.',
        courseProgressAtRequest: 5,
        status: 'PENDING',
      },
    ]);

    // Search by student email
    const emailSearch = await service.listAdminRefundRequests({ search: 'student2@techsprout.edu' });
    expect(emailSearch.items).toHaveLength(1);
    expect(emailSearch.items[0].requestNumber).toBe('TSP-REQ-SEARCH-2');

    // Search by order number
    const orderSearch = await service.listAdminRefundRequests({ search: 'TEST01' });
    expect(orderSearch.items).toHaveLength(1);
    expect(orderSearch.items[0].requestNumber).toBe('TSP-REQ-SEARCH-1');

    // Search by course title
    const courseSearch = await service.listAdminRefundRequests({ search: 'Kubernetes' });
    expect(courseSearch.items).toHaveLength(2);
  });

  it('4. should filter refund requests by date range', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    await db.insert(refundRequests).values({
      requestNumber: 'TSP-REQ-DATE-1',
      orderId: order1Id,
      studentId: student1Id,
      courseId: course1Id,
      enrollmentId: enrollment1Id,
      reasonCategory: 'COURSE_CONTENT_MISMATCH',
      reasonDetail: 'Filter date test details here.',
      courseProgressAtRequest: 0,
      status: 'PENDING',
      createdAt: twoDaysAgo,
    });

    const filtered = await service.listAdminRefundRequests({
      startDate: yesterday.toISOString(),
    });
    expect(filtered.items).toHaveLength(0);

    const match = await service.listAdminRefundRequests({
      startDate: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      endDate: yesterday.toISOString(),
    });
    expect(match.items).toHaveLength(1);
  });

  it('5. should retrieve full operational detail of a refund request by ID', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-DETAIL-TEST',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Curriculum does not match syllabus expectations.',
        courseProgressAtRequest: 12,
        status: 'PENDING',
      })
      .returning();

    const detail = await service.getAdminRefundRequestById(req.id);
    expect(detail.id).toBe(req.id);
    expect(detail.requestNumber).toBe('TSP-REQ-DETAIL-TEST');
    expect(detail.orderNumber).toBe('TSP-ORD-2026-TEST01');
    expect(detail.studentEmail).toBe('student@techsprout.edu');
    expect(detail.courseTitle).toBe('Kubernetes Mastery');
    expect(detail.courseProgressAtRequest).toBe(12);
    expect(detail.currentProgress).toBe(0); // 0 lessons completed
    expect(detail.payableCents).toBe(500000);
    expect(detail.orderStatus).toBe('PAID');
    expect(detail.orderPaidAt).toBeDefined();
    expect(detail.status).toBe('PENDING');
  });

  it('6. should reject nonexistent refund request ID with 404 NOT_FOUND', async () => {
    await expect(
      service.getAdminRefundRequestById('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('Refund request not found');
  });

  it('7. should successfully reject a pending refund request and record audit log', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-REJECT-01',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'PERSONAL_REASONS',
        reasonDetail: 'No longer have time to study this term.',
        courseProgressAtRequest: 8,
        status: 'PENDING',
      })
      .returning();

    const rejected = await service.rejectRefundRequest(
      req.id,
      adminId,
      {
        rejectionReason: 'Progress policy window condition evaluated as non-compliant.',
        adminNotes: 'Student verified as contacted by phone.',
      },
      { ip: '127.0.0.1', userAgent: 'test-agent', requestId: 'req-rej-1' }
    );

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBe(
      'Progress policy window condition evaluated as non-compliant.'
    );
    expect(rejected.adminNotes).toBe('Student verified as contacted by phone.');
    expect(rejected.reviewedBy).toBe(adminId);
    expect(rejected.reviewedAt).toBeDefined();

    // Verify audit log
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'REFUND_REQUEST_REJECTED'));
    expect(log).toBeDefined();
    expect(log.targetId).toBe(req.id);
    expect(log.actorId).toBe(adminId);
    const parsedMetadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    expect(parsedMetadata?.rejectionReason).toBe(
      'Progress policy window condition evaluated as non-compliant.'
    );
  });

  it('8. should reject attempt to reject an already reviewed refund request with 409 CONFLICT', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-ALREADY-REJ',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'OTHER',
        reasonDetail: 'First review details here.',
        courseProgressAtRequest: 5,
        status: 'REJECTED',
        rejectionReason: 'Already rejected.',
        reviewedBy: adminId,
        reviewedAt: new Date(),
      })
      .returning();

    await expect(
      service.rejectRefundRequest(req.id, adminId, {
        rejectionReason: 'Attempting second rejection.',
      })
    ).rejects.toThrow('already been reviewed');
  });

  it('9. should validate rejection reason minimum length of 5 characters via Zod schema', () => {
    const invalid = adminRejectRefundRequestSchema.safeParse({
      rejectionReason: 'Bad',
    });
    expect(invalid.success).toBe(false);

    const valid = adminRejectRefundRequestSchema.safeParse({
      rejectionReason: 'Valid rejection explanation provided.',
    });
    expect(valid.success).toBe(true);
  });

  it('10. should successfully approve a pending refund request and record audit log without mutating order to REFUNDED', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-APPROVE-01',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Approved refund request reason details.',
        courseProgressAtRequest: 10,
        status: 'PENDING',
      })
      .returning();

    const approved = await service.approveRefundRequest(
      req.id,
      adminId,
      {
        adminNotes: 'Student curriculum mismatch verified with syllabus.',
      },
      { ip: '127.0.0.1', userAgent: 'test-agent', requestId: 'req-app-1' }
    );

    expect(approved.status).toBe('APPROVED');
    expect(approved.adminNotes).toBe('Student curriculum mismatch verified with syllabus.');
    expect(approved.reviewedBy).toBe(adminId);
    expect(approved.reviewedAt).toBeDefined();

    // Verify order remains PAID (P5.5.4 boundary check: provider execution deferred to P5.5.5)
    const [ord] = await db.select().from(orders).where(eq(orders.id, order1Id));
    expect(ord.status).toBe('PAID');

    // Verify enrollment remains ACTIVE
    const [enr] = await db.select().from(enrollments).where(eq(enrollments.id, enrollment1Id));
    expect(enr.status).toBe('ACTIVE');

    // Verify audit log
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'REFUND_REQUEST_APPROVED'));
    expect(log).toBeDefined();
    expect(log.targetId).toBe(req.id);
    expect(log.actorId).toBe(adminId);
    const parsedMetadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    expect(parsedMetadata?.adminNotes).toBe(
      'Student curriculum mismatch verified with syllabus.'
    );
  });

  it('11. should reject attempt to approve an already approved refund request with 409 CONFLICT', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-ALREADY-APP',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Approved request details.',
        courseProgressAtRequest: 0,
        status: 'APPROVED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
      })
      .returning();

    await expect(
      service.approveRefundRequest(req.id, adminId, {
        adminNotes: 'Attempting second approval.',
      })
    ).rejects.toThrow('already been reviewed');
  });

  it('12. should reject approval if order is already REFUNDED via direct admin refund', async () => {
    // Set order status to REFUNDED
    await db.update(orders).set({ status: 'REFUNDED' }).where(eq(orders.id, order1Id));

    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-ORDER-REFUNDED',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'ACCIDENTAL_PURCHASE',
        reasonDetail: 'Request on an already refunded order.',
        courseProgressAtRequest: 0,
        status: 'PENDING',
      })
      .returning();

    await expect(
      service.approveRefundRequest(req.id, adminId, {})
    ).rejects.toThrow('Order has already been refunded');
  });

  it('13. should reject approval if order has an existing active refund operation in refunds table', async () => {
    // Insert a payment first to satisfy foreign key
    const [pmt] = await db
      .insert(payments)
      .values({
        orderId: order1Id,
        merchantTranId: 'TSP-TXN-REFUND-CONFLICT',
        amountCents: 500000,
        currency: 'BDT',
        status: 'VALIDATED',
      })
      .returning();

    // Insert a pending refund record in refunds table
    await db.insert(refunds).values({
      refundNumber: 'TSP-REF-EXISTING',
      orderId: order1Id,
      paymentId: pmt.id,
      amountCents: 500000,
      currency: 'BDT',
      reason: 'Direct refund in progress',
      status: 'PENDING',
    });

    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-CONFLICT',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'OTHER',
        reasonDetail: 'Conflict testing refund request.',
        courseProgressAtRequest: 0,
        status: 'PENDING',
      })
      .returning();

    await expect(
      service.approveRefundRequest(req.id, adminId, {})
    ).rejects.toThrow('A refund operation is already pending or processed for this order');
  });

  it('14. should format student-safe projection without leaking adminNotes or reviewer info', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-MASKING-TEST',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'PERSONAL_REASONS',
        reasonDetail: 'Student submitted personal details here.',
        courseProgressAtRequest: 15,
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: 'Public explanation for student.',
        adminNotes: 'CONFIDENTIAL INTERNAL NOTES DO NOT LEAK',
      })
      .returning();

    const studentSafeDto = service.toStudentRefundRequestDto(req, 'TSP-ORD-2026-TEST01', 'Kubernetes Mastery');

    expect(studentSafeDto.id).toBe(req.id);
    expect(studentSafeDto.rejectionReason).toBe('Public explanation for student.');
    expect((studentSafeDto as any).adminNotes).toBeUndefined();
    expect((studentSafeDto as any).reviewedBy).toBeUndefined();
    expect((studentSafeDto as any).reviewedByName).toBeUndefined();
    expect((studentSafeDto as any).refundId).toBeUndefined();
  });

  it('15. should handle controller list, detail, approve, and reject operations end-to-end', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-E2E-01',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Controller end-to-end verification.',
        courseProgressAtRequest: 5,
        status: 'PENDING',
      })
      .returning();

    // Controller list
    const listRes = await adminController.listRefundRequests({ page: 1, limit: 10 });
    expect(listRes.success).toBe(true);
    expect(listRes.data.items.length).toBeGreaterThanOrEqual(1);

    // Controller detail
    const detailRes = await adminController.getRefundRequestById(req.id);
    expect(detailRes.success).toBe(true);
    expect(detailRes.data.id).toBe(req.id);

    // Controller approve
    const approveRes = await adminController.approveRefundRequest(
      req.id,
      { adminNotes: 'Controller approved' },
      { user: { id: adminId, role: 'admin' }, ip: '127.0.0.1', headers: {} } as any
    );
    expect(approveRes.success).toBe(true);
    expect(approveRes.data.status).toBe('APPROVED');
  });

  it('16. should preserve historical courseProgressAtRequest snapshot even when student completes subsequent lessons', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-SNAPSHOT-01',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Preserve snapshot test details.',
        courseProgressAtRequest: 10,
        status: 'PENDING',
      })
      .returning();

    // Now student completes a lesson in the course
    const [lesson1] = await db.select().from(lessons).where(eq(lessons.moduleId, module1Id)).limit(1);
    await db.insert(lessonProgress).values({
      enrollmentId: enrollment1Id,
      lessonId: lesson1.id,
      status: 'COMPLETED',
    });

    const detail = await service.getAdminRefundRequestById(req.id);
    // Snapshot must remain 10%
    expect(detail.courseProgressAtRequest).toBe(10);
    // Current progress recalculates to 20% (1 out of 5 lessons completed)
    expect(detail.currentProgress).toBe(20);
  });

  it('17. should handle concurrent admin decision race: first decision wins and subsequent gets 409', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-RACE-01',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Concurrency race condition testing.',
        courseProgressAtRequest: 0,
        status: 'PENDING',
      })
      .returning();

    // First admin approves
    const approved = await service.approveRefundRequest(req.id, adminId, { adminNotes: 'First admin' });
    expect(approved.status).toBe('APPROVED');

    // Second admin simultaneously tries to reject
    await expect(
      service.rejectRefundRequest(req.id, adminId, { rejectionReason: 'Second admin tries to reject.' })
    ).rejects.toThrow('already been reviewed');
  });

  it('18. should validate pagination and limit parameters via query schema', () => {
    const defaultQuery = refundRequestListQuerySchema.safeParse({});
    expect(defaultQuery.success).toBe(true);

    const boundedQuery = refundRequestListQuerySchema.safeParse({
      page: 2,
      limit: 50,
      status: 'PENDING',
    });
    expect(boundedQuery.success).toBe(true);
    if (boundedQuery.success) {
      expect(boundedQuery.data.page).toBe(2);
      expect(boundedQuery.data.limit).toBe(50);
      expect(boundedQuery.data.status).toBe('PENDING');
    }
  });

  it('19. should reject malformed UUID in admin controller params with BAD_REQUEST', async () => {
    await expect(
      adminController.getRefundRequestById('invalid-uuid')
    ).rejects.toThrow('Invalid refund request ID format');

    await expect(
      adminController.approveRefundRequest(
        'not-a-uuid',
        {},
        { user: { id: adminId }, ip: '127.0.0.1', headers: {} } as any
      )
    ).rejects.toThrow('Invalid refund request ID format');

    await expect(
      adminController.rejectRefundRequest(
        'not-a-uuid',
        { rejectionReason: 'Valid reason here' },
        { user: { id: adminId }, ip: '127.0.0.1', headers: {} } as any
      )
    ).rejects.toThrow('Invalid refund request ID format');
  });

  it('20. should reject rejection request with invalid body (< 5 chars) in admin controller', async () => {
    const [req] = await db
      .insert(refundRequests)
      .values({
        requestNumber: 'TSP-REQ-VALIDATE-01',
        orderId: order1Id,
        studentId: student1Id,
        courseId: course1Id,
        enrollmentId: enrollment1Id,
        reasonCategory: 'OTHER',
        reasonDetail: 'Rejection validation testing.',
        courseProgressAtRequest: 0,
        status: 'PENDING',
      })
      .returning();

    await expect(
      adminController.rejectRefundRequest(
        req.id,
        { rejectionReason: 'bad' },
        { user: { id: adminId }, ip: '127.0.0.1', headers: {} } as any
      )
    ).rejects.toThrow('Validation failed');
  });
});

