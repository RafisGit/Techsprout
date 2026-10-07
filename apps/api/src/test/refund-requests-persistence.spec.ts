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
  refunds,
  payments,
} from '../database/schema';
import {
  createRefundRequestSchema,
  adminApproveRefundRequestSchema,
  adminRejectRefundRequestSchema,
  refundRequestListQuerySchema,
  REFUND_POLICY_WINDOW_DAYS,
  REFUND_POLICY_WINDOW_MS,
  REFUND_MAX_PROGRESS_PERCENTAGE,
  RefundRequestReasonCategory,
} from '@techsprout/contracts';

describe('P5.5.1: Refund Request Persistence & Shared Contracts', () => {
  let db: any;
  let pool: any;
  let testStudentId: string;
  let testAdminId: string;
  let testCourseId: string;
  let testEnrollmentId: string;
  let testOrderId: string;

  beforeEach(async () => {
    const mem = await createTestDatabase();
    db = mem.db;
    pool = mem.pool;

    // 1. Resolve student and admin
    const [student] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'student@techsprout.edu'))
      .limit(1);
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'admin@techsprout.edu'))
      .limit(1);

    testStudentId = student.id;
    testAdminId = admin.id;

    // 2. Create category and course
    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Web Engineering',
        slug: 'web-engineering',
        description: 'Web development track',
      })
      .returning();

    const [course] = await db
      .insert(courses)
      .values({
        categoryId: cat.id,
        instructorId: testAdminId,
        title: 'Fullstack Next.js & NestJS',
        slug: 'fullstack-next-nest',
        price: '1000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
      })
      .returning();
    testCourseId = course.id;

    // 3. Create enrollment
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        studentId: testStudentId,
        courseId: testCourseId,
        status: 'ACTIVE',
      })
      .returning();
    testEnrollmentId = enrollment.id;

    // 4. Create paid order
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: 'TSP-ORD-2026-TEST001',
        studentId: testStudentId,
        status: 'PAID',
        subtotalCents: 100000,
        discountCents: 0,
        payableCents: 100000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 3600000),
        paidAt: new Date(),
      })
      .returning();
    testOrderId = order.id;

    await db.insert(orderItems).values({
      orderId: testOrderId,
      courseId: testCourseId,
      courseTitle: course.title,
      unitPriceCents: 100000,
      payableCents: 100000,
    });
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Contract & Constant Invariants', () => {
    it('should expose frozen policy constants', () => {
      expect(REFUND_POLICY_WINDOW_DAYS).toBe(7);
      expect(REFUND_POLICY_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
      expect(REFUND_MAX_PROGRESS_PERCENTAGE).toBe(20);
    });

    it('should validate createRefundRequestSchema correctly', () => {
      const validPayload = {
        reasonCategory: 'COURSE_CONTENT_MISMATCH' as RefundRequestReasonCategory,
        reasonDetail: 'The syllabus contents do not match what was presented.',
      };
      const parsed = createRefundRequestSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      // Detail too short (< 10 chars)
      const shortPayload = {
        reasonCategory: 'TECHNICAL_ISSUES' as RefundRequestReasonCategory,
        reasonDetail: 'Too short',
      };
      const shortParsed = createRefundRequestSchema.safeParse(shortPayload);
      expect(shortParsed.success).toBe(false);

      // Invalid category
      const invalidCatPayload = {
        reasonCategory: 'INVALID_CATEGORY',
        reasonDetail: 'This detail is long enough, but category is bogus.',
      };
      const invalidCatParsed = createRefundRequestSchema.safeParse(invalidCatPayload);
      expect(invalidCatParsed.success).toBe(false);
    });

    it('should validate admin decision schemas', () => {
      // Approve schema
      const approveValid = adminApproveRefundRequestSchema.safeParse({
        adminNotes: 'Student called support, verified valid reason.',
      });
      expect(approveValid.success).toBe(true);

      // Reject schema - requires rejectionReason (min 5 chars)
      const rejectValid = adminRejectRefundRequestSchema.safeParse({
        rejectionReason: 'Course progress exceeds maximum allowable threshold.',
        adminNotes: 'Progress recorded was 45%.',
      });
      expect(rejectValid.success).toBe(true);

      const rejectMissingReason = adminRejectRefundRequestSchema.safeParse({
        adminNotes: 'Missing rejection reason',
      });
      expect(rejectMissingReason.success).toBe(false);

      const rejectShortReason = adminRejectRefundRequestSchema.safeParse({
        rejectionReason: 'No',
      });
      expect(rejectShortReason.success).toBe(false);
    });

    it('should validate refundRequestListQuerySchema', () => {
      const parsed = refundRequestListQuerySchema.safeParse({
        page: '2',
        limit: '15',
        status: 'PENDING',
        search: 'student@techsprout.edu',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(2);
        expect(parsed.data.limit).toBe(15);
        expect(parsed.data.status).toBe('PENDING');
      }
    });
  });

  describe('Database Persistence & Constraint Invariants', () => {
    it('should successfully persist a refund request with default PENDING status', async () => {
      const [req] = await db
        .insert(refundRequests)
        .values({
          requestNumber: 'TSP-REQ-2026-TEST01',
          orderId: testOrderId,
          studentId: testStudentId,
          courseId: testCourseId,
          enrollmentId: testEnrollmentId,
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Curriculum pace does not match requirements.',
          courseProgressAtRequest: 10,
        })
        .returning();

      expect(req.id).toBeDefined();
      expect(req.requestNumber).toBe('TSP-REQ-2026-TEST01');
      expect(req.status).toBe('PENDING');
      expect(req.courseProgressAtRequest).toBe(10);
      expect(req.reviewedBy).toBeNull();
      expect(req.reviewedAt).toBeNull();
      expect(req.refundId).toBeNull();
    });

    it('PD-3: should enforce exactly one ACTIVE request per order via partial unique index', async () => {
      // 1. Create first request (status = PENDING)
      await db.insert(refundRequests).values({
        requestNumber: 'TSP-REQ-2026-ACTIVE01',
        orderId: testOrderId,
        studentId: testStudentId,
        courseId: testCourseId,
        enrollmentId: testEnrollmentId,
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Video playback stuttering on my browser.',
        courseProgressAtRequest: 5,
        status: 'PENDING',
      });

      // 2. Attempt to create second request for the same order while first is PENDING -> must fail
      let duplicateError: any = null;
      try {
        await db.insert(refundRequests).values({
          requestNumber: 'TSP-REQ-2026-ACTIVE02',
          orderId: testOrderId,
          studentId: testStudentId,
          courseId: testCourseId,
          enrollmentId: testEnrollmentId,
          reasonCategory: 'PERSONAL_REASONS',
          reasonDetail: 'Another request for the exact same order.',
          courseProgressAtRequest: 5,
          status: 'PENDING',
        });
      } catch (err: any) {
        duplicateError = err;
      }

      expect(duplicateError).not.toBeNull();
      expect(duplicateError.message.toLowerCase()).toContain('unique');
    });

    it('PD-3: should allow resubmission after a previous request was REJECTED', async () => {
      // 1. Create initial request and transition it to REJECTED
      const [initialReq] = await db
        .insert(refundRequests)
        .values({
          requestNumber: 'TSP-REQ-2026-FIRST',
          orderId: testOrderId,
          studentId: testStudentId,
          courseId: testCourseId,
          enrollmentId: testEnrollmentId,
          reasonCategory: 'OTHER',
          reasonDetail: 'Initial request with vague details provided.',
          courseProgressAtRequest: 15,
          status: 'PENDING',
        })
        .returning();

      // Admin rejects the request
      await db
        .update(refundRequests)
        .set({
          status: 'REJECTED',
          reviewedBy: testAdminId,
          reviewedAt: new Date(),
          rejectionReason: 'Please elaborate on specific curriculum issues.',
        })
        .where(eq(refundRequests.id, initialReq.id));

      // 2. Student resubmits a new request with detailed information
      const [secondReq] = await db
        .insert(refundRequests)
        .values({
          requestNumber: 'TSP-REQ-2026-SECOND',
          orderId: testOrderId,
          studentId: testStudentId,
          courseId: testCourseId,
          enrollmentId: testEnrollmentId,
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Revised submission: lesson 3 covers React 17 instead of React 19 as promised.',
          courseProgressAtRequest: 15,
          status: 'PENDING',
        })
        .returning();

      expect(secondReq.id).toBeDefined();
      expect(secondReq.requestNumber).toBe('TSP-REQ-2026-SECOND');
      expect(secondReq.status).toBe('PENDING');

      // Both rows exist in history, but only one is ACTIVE
      const history = await db
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.orderId, testOrderId));
      expect(history.length).toBe(2);
      expect(history.filter((r: any) => r.status === 'PENDING').length).toBe(1);
      expect(history.filter((r: any) => r.status === 'REJECTED').length).toBe(1);
    });

    it('PD-3: should reject second request if previous request is APPROVED', async () => {
      // 1. Create request with status APPROVED
      await db.insert(refundRequests).values({
        requestNumber: 'TSP-REQ-2026-APP01',
        orderId: testOrderId,
        studentId: testStudentId,
        courseId: testCourseId,
        enrollmentId: testEnrollmentId,
        reasonCategory: 'ACCIDENTAL_PURCHASE',
        reasonDetail: 'Bought wrong course by mistake.',
        courseProgressAtRequest: 0,
        status: 'APPROVED',
        reviewedBy: testAdminId,
        reviewedAt: new Date(),
      });

      // 2. Second request must fail because APPROVED is active in partial unique index
      let error: any = null;
      try {
        await db.insert(refundRequests).values({
          requestNumber: 'TSP-REQ-2026-APP02',
          orderId: testOrderId,
          studentId: testStudentId,
          courseId: testCourseId,
          enrollmentId: testEnrollmentId,
          reasonCategory: 'OTHER',
          reasonDetail: 'Another request while one is already approved.',
          courseProgressAtRequest: 0,
          status: 'PENDING',
        });
      } catch (err: any) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message.toLowerCase()).toContain('unique');
    });

    it('should link to refunds table when gateway refund is initiated', async () => {
      // 1. Create payment for order
      const [payment] = await db
        .insert(payments)
        .values({
          orderId: testOrderId,
          merchantTranId: 'TSP-TX-2026-PAY001',
          bankTranId: 'BANK-2026-001',
          valId: 'VAL-2026-001',
          amountCents: 100000,
          currency: 'BDT',
          status: 'VALIDATED',
        })
        .returning();

      // 2. Create refund operation row
      const [refund] = await db
        .insert(refunds)
        .values({
          refundNumber: 'TSP-REF-2026-REF001',
          orderId: testOrderId,
          paymentId: payment.id,
          amountCents: 100000,
          currency: 'BDT',
          reason: 'Student refund request approved',
          status: 'PENDING',
          processedBy: testAdminId,
        })
        .returning();

      // 3. Create approved refund request linking to the refund operation
      const [req] = await db
        .insert(refundRequests)
        .values({
          requestNumber: 'TSP-REQ-2026-LINKED01',
          orderId: testOrderId,
          studentId: testStudentId,
          courseId: testCourseId,
          enrollmentId: testEnrollmentId,
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Curriculum did not match expectations.',
          courseProgressAtRequest: 8,
          status: 'APPROVED',
          reviewedBy: testAdminId,
          reviewedAt: new Date(),
          refundId: refund.id,
        })
        .returning();

      expect(req.refundId).toBe(refund.id);
      expect(req.status).toBe('APPROVED');
    });
  });
});
