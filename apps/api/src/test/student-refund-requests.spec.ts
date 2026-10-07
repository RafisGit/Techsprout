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
  quizzes,
  quizAttempts,
} from '../database/schema';
import { RefundRequestsService } from '../modules/refunds/refund-requests.service';
import { RefundRequestsController } from '../modules/refunds/refund-requests.controller';
import { OrdersController } from '../modules/orders/orders.controller';
import { AuditService } from '../modules/audit/audit.service';
import { ApiException } from '../common/errors/api-error';
import {
  createRefundRequestSchema,
  createRefundRequestWithOrderSchema,
  studentRefundRequestListQuerySchema,
  RefundRequestReasonCategory,
} from '@techsprout/contracts';

describe('P5.5.3 — Student Refund Request API & Workflow Test Suite', () => {
  let db: any;
  let pool: any;
  let auditService: AuditService;
  let service: RefundRequestsService;
  let refundRequestsController: RefundRequestsController;
  let ordersController: OrdersController;

  let student1Id: string;
  let student2Id: string;
  let adminId: string;
  let course1Id: string;
  let course2Id: string;
  let order1Id: string;
  let orderNumber1: string;
  let enrollment1Id: string;
  let module1Id: string;

  beforeEach(async () => {
    const mem = await createTestDatabase();
    db = mem.db;
    pool = mem.pool;
    auditService = new AuditService(db);
    service = new RefundRequestsService(db, auditService);
    refundRequestsController = new RefundRequestsController(service);

    const mockOrdersService: any = {
      createOrder: async () => ({}),
      getOrderById: async () => ({}),
      listStudentOrders: async () => ({ items: [], pagination: {} }),
    };
    ordersController = new OrdersController(mockOrdersService, service);

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

    // Create student 2 for ownership / IDOR tests
    const [student2] = await db
      .insert(users)
      .values({
        email: 'student2@techsprout.edu',
        username: 'student2',
        name: 'Second Student',
        passwordHash: 'dummy-hash',
      })
      .returning();
    student2Id = student2.id;

    // 2. Category & Courses
    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Backend Engineering',
        slug: 'backend-engineering',
        description: 'Backend track',
      })
      .returning();

    const [c1] = await db
      .insert(courses)
      .values({
        categoryId: cat.id,
        instructorId: adminId,
        title: 'Advanced NestJS Architecture',
        slug: 'advanced-nestjs-architecture',
        price: '3000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
      })
      .returning();
    course1Id = c1.id;

    const [c2] = await db
      .insert(courses)
      .values({
        categoryId: cat.id,
        instructorId: adminId,
        title: 'Microservices with RabbitMQ',
        slug: 'microservices-rabbitmq',
        price: '4000.00',
        currency: 'BDT',
        status: 'PUBLISHED',
      })
      .returning();
    course2Id = c2.id;

    // 3. Module & 10 Lessons for Course 1
    const [m1] = await db
      .insert(modules)
      .values({
        courseId: course1Id,
        title: 'Module 1: Architecture Core',
        position: 1,
      })
      .returning();
    module1Id = m1.id;

    for (let i = 1; i <= 10; i++) {
      await db.insert(lessons).values({
        moduleId: module1Id,
        title: `Lesson ${i}`,
        slug: `lesson-${i}`,
        position: i,
        lessonType: 'VIDEO',
      });
    }

    // 4. Student 1 Enrollment in Course 1 (ACTIVE, 0 progress initially)
    const [e1] = await db
      .insert(enrollments)
      .values({
        studentId: student1Id,
        courseId: course1Id,
        status: 'ACTIVE',
      })
      .returning();
    enrollment1Id = e1.id;

    // 5. Eligible Paid Order for Student 1 (Purchased 2 days ago = within 7 days)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const [ord1] = await db
      .insert(orders)
      .values({
        orderNumber: 'TSP-ORD-2026-TEST01',
        studentId: student1Id,
        status: 'PAID',
        subtotalCents: 300000,
        discountCents: 0,
        payableCents: 300000,
        currency: 'BDT',
        expiresAt: new Date(Date.now() + 86400000),
        paidAt: twoDaysAgo,
        createdAt: twoDaysAgo,
      })
      .returning();
    order1Id = ord1.id;
    orderNumber1 = ord1.orderNumber;

    // Order item
    await db.insert(orderItems).values({
      orderId: order1Id,
      courseId: course1Id,
      courseTitle: 'Advanced NestJS Architecture',
      unitPriceCents: 300000,
      discountCents: 0,
      payableCents: 300000,
    });
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  // ==========================================
  // SECTION 1: SUCCESSFUL REFUND CREATION
  // ==========================================
  describe('1. Successful Refund Request Creation', () => {
    it('1.1 creates a pending refund request with authoritative progress and student-safe projection', async () => {
      const result = await service.createRefundRequest(
        order1Id,
        student1Id,
        {
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Curriculum differs from published syllabus preview',
        },
        { ip: '127.0.0.1', userAgent: 'test-agent', requestId: 'req-001' }
      );

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.requestNumber).toMatch(/^TSP-REQ-/);
      expect(result.orderId).toBe(order1Id);
      expect(result.orderNumber).toBe(orderNumber1);
      expect(result.courseId).toBe(course1Id);
      expect(result.courseTitle).toBe('Advanced NestJS Architecture');
      expect(result.status).toBe('PENDING');
      expect(result.reasonCategory).toBe('COURSE_CONTENT_MISMATCH');
      expect(result.reasonDetail).toBe('Curriculum differs from published syllabus preview');
      expect(result.courseProgressAtRequest).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.reviewedAt).toBeNull();
      expect(result.rejectionReason).toBeNull();

      // Assert internal admin fields are NEVER exposed
      expect((result as any).adminNotes).toBeUndefined();
      expect((result as any).reviewedBy).toBeUndefined();
      expect((result as any).refundId).toBeUndefined();
      expect((result as any).providerRefundRef).toBeUndefined();
    });

    it('1.2 pre-flight eligibility check returns isEligible: true for eligible order', async () => {
      const eligibility = await service.evaluateEligibility(order1Id, student1Id);

      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.reason).toBeNull();
      expect(eligibility.daysRemaining).toBeGreaterThanOrEqual(4);
      expect(eligibility.courseProgressPercentage).toBe(0);
      expect(eligibility.maxAllowedProgressPercentage).toBe(20);
      expect(eligibility.payableCents).toBe(300000);
      expect(eligibility.currency).toBe('BDT');
    });
  });

  // ==========================================
  // SECTION 2: STUDENT OWNERSHIP & IDOR
  // ==========================================
  describe('2. Student Ownership & IDOR Protection', () => {
    it('2.1 rejects refund request creation when order belongs to another student', async () => {
      await expect(
        service.createRefundRequest(order1Id, student2Id, {
          reasonCategory: 'ACCIDENTAL_PURCHASE',
          reasonDetail: 'Wrong account purchased this course by mistake',
        })
      ).rejects.toMatchObject({
        errorCode: 'ORDER_ACCESS_DENIED',
      });
    });

    it('2.2 rejects eligibility check when order belongs to another student', async () => {
      await expect(service.evaluateEligibility(order1Id, student2Id)).rejects.toMatchObject({
        errorCode: 'ORDER_ACCESS_DENIED',
      });
    });

    it('2.3 rejects retrieving another student refund request by ID', async () => {
      const created = await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Video streaming failures during playback',
      });

      await expect(
        service.getStudentRefundRequestById(created.id, student2Id)
      ).rejects.toMatchObject({
        errorCode: 'ORDER_ACCESS_DENIED',
      });
    });

    it('2.4 listStudentRefundRequests returns only authenticated student requests', async () => {
      await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'PERSONAL_REASONS',
        reasonDetail: 'Unable to commit to the study schedule',
      });

      const student2List = await service.listStudentRefundRequests(student2Id, {});
      expect(student2List.items).toHaveLength(0);

      const student1List = await service.listStudentRefundRequests(student1Id, {});
      expect(student1List.items).toHaveLength(1);
      expect(student1List.items[0].orderId).toBe(order1Id);
    });
  });

  // ==========================================
  // SECTION 3: ORDER STATUS CHECKS
  // ==========================================
  describe('3. Order Status Integrity', () => {
    it('3.1 rejects refund request for PENDING order', async () => {
      const [pendingOrder] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-PENDING',
          studentId: student1Id,
          status: 'PENDING',
          subtotalCents: 100000,
          discountCents: 0,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
        })
        .returning();

      await expect(
        service.createRefundRequest(pendingOrder.id, student1Id, {
          reasonCategory: 'OTHER',
          reasonDetail: 'Order is not completed yet',
        })
      ).rejects.toMatchObject({
        errorCode: 'ORDER_NOT_REFUNDABLE',
      });
    });

    it('3.2 rejects refund request for CANCELLED order', async () => {
      const [cancelledOrder] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-CANCELLED',
          studentId: student1Id,
          status: 'CANCELLED',
          subtotalCents: 100000,
          discountCents: 0,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          cancelledAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      await expect(
        service.createRefundRequest(cancelledOrder.id, student1Id, {
          reasonCategory: 'OTHER',
          reasonDetail: 'Order was cancelled previously',
        })
      ).rejects.toMatchObject({
        errorCode: 'ORDER_NOT_REFUNDABLE',
      });
    });

    it('3.3 rejects refund request for already REFUNDED order', async () => {
      const [refundedOrder] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-REFUNDED',
          studentId: student1Id,
          status: 'REFUNDED',
          subtotalCents: 100000,
          discountCents: 0,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: new Date(Date.now() - 86400000),
          createdAt: new Date(Date.now() - 86400000),
        })
        .returning();

      await expect(
        service.createRefundRequest(refundedOrder.id, student1Id, {
          reasonCategory: 'OTHER',
          reasonDetail: 'Already refunded order request',
        })
      ).rejects.toMatchObject({
        errorCode: 'REFUND_ALREADY_PROCESSED',
      });
    });

    it('3.4 rejects refund request if paidAt is missing', async () => {
      const [missingPaidAtOrder] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-NO-PAIDAT',
          studentId: student1Id,
          status: 'PAID',
          subtotalCents: 100000,
          discountCents: 0,
          payableCents: 100000,
          currency: 'BDT',
          expiresAt: new Date(Date.now() + 86400000),
          paidAt: null,
          createdAt: new Date(),
        })
        .returning();

      await expect(
        service.createRefundRequest(missingPaidAtOrder.id, student1Id, {
          reasonCategory: 'OTHER',
          reasonDetail: 'Testing missing paidAt field',
        })
      ).rejects.toMatchObject({
        errorCode: 'ORDER_NOT_REFUNDABLE',
      });
    });
  });

  // ==========================================
  // SECTION 4: 7-DAY REFUND WINDOW (PD-1 BOUNDARY)
  // ==========================================
  describe('4. Refund Policy Window Boundaries (PD-1: 168 Hours)', () => {
    it('4.1 accepts request just before 168 hours (167 hours 59 minutes ago)', async () => {
      const justBeforeLimit = new Date(Date.now() - (167 * 60 + 59) * 60 * 1000);
      await db
        .update(orders)
        .set({ paidAt: justBeforeLimit })
        .where(eq(orders.id, order1Id));

      const result = await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Request submitted right before the 168-hour cutoff',
      });

      expect(result.status).toBe('PENDING');
    });

    it('4.2 rejects request just after 168 hours (168 hours 1 minute ago)', async () => {
      const justAfterLimit = new Date(Date.now() - (168 * 60 + 1) * 60 * 1000);
      await db
        .update(orders)
        .set({ paidAt: justAfterLimit })
        .where(eq(orders.id, order1Id));

      await expect(
        service.createRefundRequest(order1Id, student1Id, {
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Request submitted 1 minute past the 168-hour cutoff',
        })
      ).rejects.toMatchObject({
        errorCode: 'REFUND_WINDOW_EXPIRED',
      });
    });

    it('4.3 pre-flight eligibility reports daysRemaining: 0 and isEligible: false when window expired', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await db
        .update(orders)
        .set({ paidAt: eightDaysAgo })
        .where(eq(orders.id, order1Id));

      const eligibility = await service.evaluateEligibility(order1Id, student1Id);
      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.daysRemaining).toBe(0);
      expect(eligibility.reason).toContain('expired');
    });
  });

  // ==========================================
  // SECTION 5: COURSE PROGRESS BOUNDARIES (PD-2)
  // ==========================================
  describe('5. Course Progress Boundaries (PD-2: Strictly < 20%)', () => {
    it('5.1 accepts request with 0% progress', async () => {
      const result = await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Zero lessons completed, unable to access video player',
      });

      expect(result.courseProgressAtRequest).toBe(0);
      expect(result.status).toBe('PENDING');
    });

    it('5.2 accepts request with 10% progress (1 of 10 lessons completed < 20%)', async () => {
      const allLessons = await db
        .select()
        .from(lessons)
        .where(eq(lessons.moduleId, module1Id))
        .orderBy(lessons.position);

      // Complete 1 lesson = 10%
      await db.insert(lessonProgress).values({
        enrollmentId: enrollment1Id,
        lessonId: allLessons[0].id,
        status: 'COMPLETED',
      });

      const result = await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Completed 1 lesson and found content does not match',
      });

      expect(result.courseProgressAtRequest).toBe(10);
      expect(result.status).toBe('PENDING');
    });

    it('5.3 rejects request with exactly 20% progress (2 of 10 lessons completed)', async () => {
      const allLessons = await db
        .select()
        .from(lessons)
        .where(eq(lessons.moduleId, module1Id))
        .orderBy(lessons.position);

      // Complete 2 lessons = 20% (strictly < 20% rule)
      await db.insert(lessonProgress).values([
        {
          enrollmentId: enrollment1Id,
          lessonId: allLessons[0].id,
          status: 'COMPLETED',
        },
        {
          enrollmentId: enrollment1Id,
          lessonId: allLessons[1].id,
          status: 'COMPLETED',
        },
      ]);

      await expect(
        service.createRefundRequest(order1Id, student1Id, {
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Attempting refund with exactly 20% completion',
        })
      ).rejects.toMatchObject({
        errorCode: 'REFUND_PROGRESS_LIMIT_EXCEEDED',
      });
    });

    it('5.4 rejects request with >20% progress (e.g. 50% or 100%)', async () => {
      const allLessons = await db
        .select()
        .from(lessons)
        .where(eq(lessons.moduleId, module1Id))
        .orderBy(lessons.position);

      for (let i = 0; i < 5; i++) {
        await db.insert(lessonProgress).values({
          enrollmentId: enrollment1Id,
          lessonId: allLessons[i].id,
          status: 'COMPLETED',
        });
      }

      await expect(
        service.createRefundRequest(order1Id, student1Id, {
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Attempting refund after completing half the course',
        })
      ).rejects.toMatchObject({
        errorCode: 'REFUND_PROGRESS_LIMIT_EXCEEDED',
      });
    });
  });

  // ==========================================
  // SECTION 6: EXACT COURSE & ENROLLMENT SCOPING
  // ==========================================
  describe('6. Exact Course & Enrollment Matching', () => {
    it('6.1 rejects refund if student has no enrollment for the purchased course', async () => {
      // Delete the student enrollment
      await db.delete(enrollments).where(eq(enrollments.id, enrollment1Id));

      await expect(
        service.createRefundRequest(order1Id, student1Id, {
          reasonCategory: 'ACCIDENTAL_PURCHASE',
          reasonDetail: 'Accidental purchase without enrollment active',
        })
      ).rejects.toMatchObject({
        errorCode: 'ENROLLMENT_INELIGIBLE',
      });
    });

    it('6.2 rejects refund if student enrollment is CANCELLED', async () => {
      await db
        .update(enrollments)
        .set({ status: 'CANCELLED' })
        .where(eq(enrollments.id, enrollment1Id));

      await expect(
        service.createRefundRequest(order1Id, student1Id, {
          reasonCategory: 'ACCIDENTAL_PURCHASE',
          reasonDetail: 'Attempting refund on cancelled enrollment',
        })
      ).rejects.toMatchObject({
        errorCode: 'ENROLLMENT_INELIGIBLE',
      });
    });

    it('6.3 multi-course student scoping: only evaluates progress for the course purchased by that order', async () => {
      // Student has course 2 with 100% progress, but order is for course 1 with 0% progress
      const [m2] = await db
        .insert(modules)
        .values({
          courseId: course2Id,
          title: 'Module Course 2',
          position: 1,
        })
        .returning();

      const [l2] = await db
        .insert(lessons)
        .values({
          moduleId: m2.id,
          title: 'Lesson C2',
          slug: 'lesson-c2',
          position: 1,
          lessonType: 'VIDEO',
        })
        .returning();

      const [e2] = await db
        .insert(enrollments)
        .values({
          studentId: student1Id,
          courseId: course2Id,
          status: 'ACTIVE',
        })
        .returning();

      await db.insert(lessonProgress).values({
        enrollmentId: e2.id,
        lessonId: l2.id,
        status: 'COMPLETED',
      });

      // Course 1 has 0% progress
      const result = await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Course 1 has 0% progress and is completely eligible',
      });

      expect(result.courseProgressAtRequest).toBe(0);
      expect(result.status).toBe('PENDING');
    });
  });

  // ==========================================
  // SECTION 7: ONE ACTIVE REQUEST & RESUBMISSION (PD-3)
  // ==========================================
  describe('7. Concurrency & One Active Request Constraint (PD-3)', () => {
    it('7.1 rejects duplicate active request when a PENDING request exists', async () => {
      await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'ACCIDENTAL_PURCHASE',
        reasonDetail: 'Initial refund request submission',
      });

      await expect(
        service.createRefundRequest(order1Id, student1Id, {
          reasonCategory: 'ACCIDENTAL_PURCHASE',
          reasonDetail: 'Second attempt while first is still pending',
        })
      ).rejects.toMatchObject({
        errorCode: 'REFUND_REQUEST_ALREADY_ACTIVE',
      });
    });

    it('7.2 permits resubmission after previous request was REJECTED', async () => {
      // 1. First submission
      const first = await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'First request with incomplete explanation',
      });

      // 2. Admin rejects first request
      await db
        .update(refundRequests)
        .set({
          status: 'REJECTED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionReason: 'Please provide more details on specific lectures',
        })
        .where(eq(refundRequests.id, first.id));

      // 3. Student resubmits while still within 7 days and < 20% progress
      const second = await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'COURSE_CONTENT_MISMATCH',
        reasonDetail: 'Revised submission with detailed module comparison breakdown',
      });

      expect(second).toBeDefined();
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe('PENDING');
      expect(second.reasonDetail).toBe('Revised submission with detailed module comparison breakdown');
    });
  });

  // ==========================================
  // SECTION 8: REASON CATEGORIES & VALIDATION
  // ==========================================
  describe('8. Reason Categories & Length Validation', () => {
    const validCategories: RefundRequestReasonCategory[] = [
      'COURSE_CONTENT_MISMATCH',
      'TECHNICAL_ISSUES',
      'ACCIDENTAL_PURCHASE',
      'PERSONAL_REASONS',
      'OTHER',
    ];

    it('8.1 all 5 frozen reason categories are valid in schema and database', async () => {
      for (const cat of validCategories) {
        const parsed = createRefundRequestSchema.safeParse({
          reasonCategory: cat,
          reasonDetail: 'This is a valid refund reason explanation',
        });
        expect(parsed.success).toBe(true);
      }
    });

    it('8.2 invalid reason category is rejected by schema', () => {
      const parsed = createRefundRequestSchema.safeParse({
        reasonCategory: 'CHANGED_MY_MIND_RANDOM',
        reasonDetail: 'This reason category does not exist',
      });
      expect(parsed.success).toBe(false);
    });

    it('8.3 reason detail shorter than 10 characters is rejected', () => {
      const parsed = createRefundRequestSchema.safeParse({
        reasonCategory: 'OTHER',
        reasonDetail: 'too short', // 9 chars
      });
      expect(parsed.success).toBe(false);
    });

    it('8.4 reason detail longer than 1000 characters is rejected', () => {
      const longReason = 'a'.repeat(1001);
      const parsed = createRefundRequestSchema.safeParse({
        reasonCategory: 'OTHER',
        reasonDetail: longReason,
      });
      expect(parsed.success).toBe(false);
    });
  });

  // ==========================================
  // SECTION 9: CONTROLLER ENDPOINTS
  // ==========================================
  describe('9. Controller Endpoints Integration', () => {
    it('9.1 POST /refund-requests creates request via generic body with orderId', async () => {
      const req: any = {
        user: { id: student1Id },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'vitest' },
        id: 'req-ctr-1',
      };

      const res = await refundRequestsController.createRefundRequest(
        {
          orderId: order1Id,
          reasonCategory: 'COURSE_CONTENT_MISMATCH',
          reasonDetail: 'Submitted through generic refund-requests endpoint',
        },
        req
      );

      expect(res.success).toBe(true);
      expect(res.data.status).toBe('PENDING');
      expect(res.data.orderId).toBe(order1Id);
    });

    it('9.2 GET /refund-requests lists student requests with pagination', async () => {
      await service.createRefundRequest(order1Id, student1Id, {
        reasonCategory: 'TECHNICAL_ISSUES',
        reasonDetail: 'Listing endpoint test refund request',
      });

      const req: any = { user: { id: student1Id } };
      const res = await refundRequestsController.listMyRefundRequests({ page: 1, limit: 10 }, req);

      expect(res.success).toBe(true);
      expect(res.data.items).toHaveLength(1);
      expect(res.data.pagination.page).toBe(1);
      expect(res.data.pagination.total).toBe(1);
    });

    it('9.3 GET /orders/:id/refund-eligibility endpoint returns pre-flight analysis', async () => {
      const req: any = { user: { id: student1Id } };
      const res = await ordersController.getRefundEligibility(order1Id, req);

      expect(res.success).toBe(true);
      expect(res.data.isEligible).toBe(true);
      expect(res.data.daysRemaining).toBeGreaterThanOrEqual(4);
    });

    it('9.4 POST /orders/:id/refund-request endpoint creates order-scoped request', async () => {
      const req: any = {
        user: { id: student1Id },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'vitest' },
        id: 'req-ctr-2',
      };

      const res = await ordersController.submitRefundRequest(
        order1Id,
        {
          reasonCategory: 'ACCIDENTAL_PURCHASE',
          reasonDetail: 'Submitted through order-specific endpoint',
        },
        req
      );

      expect(res.success).toBe(true);
      expect(res.data.orderId).toBe(order1Id);
      expect(res.data.status).toBe('PENDING');
    });
  });
});
