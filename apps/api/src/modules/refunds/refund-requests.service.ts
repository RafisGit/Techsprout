import { Injectable, Inject, HttpStatus, Logger, forwardRef, Optional } from '@nestjs/common';
import { eq, and, desc, count, inArray, or, ilike, gte, lte, isNull, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  orders,
  orderItems,
  enrollments,
  lessons,
  modules,
  lessonProgress,
  quizzes,
  quizAttempts,
  refundRequests,
  RefundRequest,
  courses,
  users,
  refunds,
  invoices,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { ApiException } from '../../common/errors/api-error';
import { RefundsService } from './refunds.service';
import {
  StudentRefundRequestDto,
  PaginatedStudentRefundRequestsData,
  RefundEligibilityDto,
  CreateRefundRequestRequest,
  StudentRefundRequestListQuery,
  RefundRequestDto,
  RefundRequestListItemDto,
  RefundRequestListQuery,
  PaginatedRefundRequestsData,
  AdminApproveRefundRequestRequest,
  AdminRejectRefundRequestRequest,
  OrderStatus,
  Currency,
  RefundDto,
  ProcessApprovedRefundsResultDto,
  ProcessApprovedRefundItemResultDto,
  RefundProcessingOutcome,
} from '@techsprout/contracts';

const MAX_REFUND_WINDOW_HOURS = 168; // 7 calendar days (PD-1)
const MAX_REFUND_WINDOW_MS = MAX_REFUND_WINDOW_HOURS * 60 * 60 * 1000;
const MAX_ALLOWED_PROGRESS_PERCENTAGE = 20; // Strictly < 20% (PD-2)

@Injectable()
export class RefundRequestsService {
  private readonly logger = new Logger(RefundRequestsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(forwardRef(() => RefundsService)) private readonly refundsService: RefundsService,
    @Optional() @Inject(OutboxService) private readonly outboxService?: OutboxService
  ) {}

  /**
   * Transforms internal database entity into student-safe DTO.
   * Internal admin fields (adminNotes, reviewedBy, refundId) are strictly omitted.
   */
  public toStudentRefundRequestDto(
    req: RefundRequest,
    orderNumber?: string,
    courseTitle?: string
  ): StudentRefundRequestDto {
    return {
      id: req.id,
      requestNumber: req.requestNumber,
      orderId: req.orderId,
      orderNumber: orderNumber,
      courseId: req.courseId,
      courseTitle: courseTitle,
      reasonCategory: req.reasonCategory,
      reasonDetail: req.reasonDetail,
      courseProgressAtRequest: req.courseProgressAtRequest,
      status: req.status,
      rejectionReason: req.rejectionReason ?? null,
      createdAt: req.createdAt.toISOString(),
      reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
    };
  }

  /**
   * Helper: Calculates current curriculum progress percentage for a student's enrollment.
   * Progress = (completedLessons + passedQuizzes) / (totalLessons + publishedQuizzes)
   */
  public async calculateCourseProgress(
    dbOrTx: any,
    courseId: string,
    enrollmentId: string
  ): Promise<number> {
    const [totalLessonsResult] = await dbOrTx
      .select({ count: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId));

    const totalLessons = Number(totalLessonsResult?.count || 0);

    const [completedLessonsResult] = await dbOrTx
      .select({ count: count(lessonProgress.id) })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(lessonProgress.enrollmentId, enrollmentId),
          eq(modules.courseId, courseId),
          eq(lessonProgress.status, 'COMPLETED')
        )
      );

    const completedLessons = Number(completedLessonsResult?.count || 0);

    const [publishedQuizzesResult] = await dbOrTx
      .select({ count: count(quizzes.id) })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED')
        )
      );

    const publishedQuizzes = Number(publishedQuizzesResult?.count || 0);

    const passedQuizzesRes = await dbOrTx
      .select({ quizId: quizAttempts.quizId })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(quizAttempts.enrollmentId, enrollmentId),
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED'),
          eq(quizAttempts.status, 'SUBMITTED'),
          eq(quizAttempts.isPassed, true)
        )
      )
      .groupBy(quizAttempts.quizId);

    const passedQuizzes = passedQuizzesRes.length;

    const totalItems = totalLessons + publishedQuizzes;
    const completedItems = completedLessons + passedQuizzes;
    return totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
  }

  /**
   * Pre-flight / informational check for refund eligibility.
   * Client-side display only; final eligibility is always evaluated server-side upon creation.
   */
  async evaluateEligibility(orderId: string, studentId: string): Promise<RefundEligibilityDto> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!order) {
      throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
    }

    if (order.studentId !== studentId) {
      throw new ApiException('You do not own this order', HttpStatus.FORBIDDEN, 'ORDER_ACCESS_DENIED');
    }

    // Default base structure
    const baseResponse: Omit<RefundEligibilityDto, 'isEligible' | 'reason' | 'daysRemaining' | 'courseProgressPercentage'> = {
      maxAllowedProgressPercentage: MAX_ALLOWED_PROGRESS_PERCENTAGE,
      orderPaidAt: order.paidAt ? order.paidAt.toISOString() : null,
      payableCents: order.payableCents,
      currency: order.currency as Currency,
    };

    if (order.status === 'REFUNDED') {
      return {
        ...baseResponse,
        isEligible: false,
        reason: 'Order has already been refunded',
        daysRemaining: 0,
        courseProgressPercentage: 0,
      };
    }

    if (order.status !== 'PAID' || !order.paidAt) {
      return {
        ...baseResponse,
        isEligible: false,
        reason: 'Only fully paid orders are eligible for refund',
        daysRemaining: 0,
        courseProgressPercentage: 0,
      };
    }

    // Evaluate 7-day window (PD-1)
    const paidAtMs = new Date(order.paidAt).getTime();
    const nowMs = Date.now();
    const elapsedMs = nowMs - paidAtMs;
    const msRemaining = Math.max(0, (paidAtMs + MAX_REFUND_WINDOW_MS) - nowMs);
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    if (elapsedMs > MAX_REFUND_WINDOW_MS) {
      return {
        ...baseResponse,
        isEligible: false,
        reason: 'Refund policy window has expired (7 days from payment)',
        daysRemaining: 0,
        courseProgressPercentage: 0,
      };
    }

    // Evaluate existing active request (PD-3)
    const [existingActiveRequest] = await this.db
      .select()
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.orderId, order.id),
          inArray(refundRequests.status, ['PENDING', 'APPROVED'])
        )
      )
      .limit(1);

    if (existingActiveRequest) {
      return {
        ...baseResponse,
        isEligible: false,
        reason: 'An active refund request is already in progress for this order',
        daysRemaining,
        courseProgressPercentage: existingActiveRequest.courseProgressAtRequest,
        existingRequestId: existingActiveRequest.id,
        existingRequestStatus: existingActiveRequest.status,
      };
    }

    // Exact course and student enrollment scoping
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    if (items.length === 0) {
      return {
        ...baseResponse,
        isEligible: false,
        reason: 'Order has no associated course items',
        daysRemaining,
        courseProgressPercentage: 0,
      };
    }

    const purchasedItem = items[0];

    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.courseId, purchasedItem.courseId)
        )
      );

    if (!enrollment || enrollment.status !== 'ACTIVE') {
      return {
        ...baseResponse,
        isEligible: false,
        reason: 'Student does not have an active enrollment for the purchased course',
        daysRemaining,
        courseProgressPercentage: 0,
      };
    }

    // Calculate progress (PD-2)
    const progressPercentage = await this.calculateCourseProgress(
      this.db,
      purchasedItem.courseId,
      enrollment.id
    );

    if (progressPercentage >= MAX_ALLOWED_PROGRESS_PERCENTAGE) {
      return {
        ...baseResponse,
        isEligible: false,
        reason: `Course progress (${progressPercentage}%) exceeds the maximum allowable threshold (${MAX_ALLOWED_PROGRESS_PERCENTAGE}%)`,
        daysRemaining,
        courseProgressPercentage: progressPercentage,
      };
    }

    return {
      ...baseResponse,
      isEligible: true,
      reason: null,
      daysRemaining,
      courseProgressPercentage: progressPercentage,
    };
  }

  /**
   * Creates a formal student refund request inside an atomic database transaction.
   * Strictly enforces all policy criteria, row locking, and concurrency protection.
   */
  async createRefundRequest(
    orderId: string,
    studentId: string,
    input: CreateRefundRequestRequest,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<StudentRefundRequestDto> {
    try {
      const result = await this.db.transaction(async (tx) => {
        // 1. Acquire order with row-lock to prevent race conditions
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update');

        if (!order) {
          throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
        }

        // 2. Enforce student ownership
        if (order.studentId !== studentId) {
          throw new ApiException(
            'You are not authorized to request a refund for this order',
            HttpStatus.FORBIDDEN,
            'ORDER_ACCESS_DENIED'
          );
        }

        // 3. Enforce paid status
        if (order.status === 'REFUNDED') {
          throw new ApiException(
            'Order has already been refunded',
            HttpStatus.BAD_REQUEST,
            'REFUND_ALREADY_PROCESSED'
          );
        }

        if (order.status !== 'PAID' || !order.paidAt) {
          throw new ApiException(
            'Only paid orders are eligible for a refund request',
            HttpStatus.BAD_REQUEST,
            'ORDER_NOT_REFUNDABLE'
          );
        }

        // 4. Enforce 7-day refund window (PD-1: exactly 168 hours in UTC)
        const paidAtMs = new Date(order.paidAt).getTime();
        const nowMs = Date.now();
        const elapsedMs = nowMs - paidAtMs;
        if (elapsedMs > MAX_REFUND_WINDOW_MS) {
          throw new ApiException(
            'Refund policy window has expired (7 calendar days from purchase)',
            HttpStatus.BAD_REQUEST,
            'REFUND_WINDOW_EXPIRED'
          );
        }

        // 5. Enforce single active refund request per order (PD-3)
        const [existingActive] = await tx
          .select()
          .from(refundRequests)
          .where(
            and(
              eq(refundRequests.orderId, order.id),
              inArray(refundRequests.status, ['PENDING', 'APPROVED'])
            )
          )
          .limit(1);

        if (existingActive) {
          throw new ApiException(
            'An active refund request already exists for this order',
            HttpStatus.BAD_REQUEST,
            'REFUND_REQUEST_ALREADY_ACTIVE'
          );
        }

        // 6. Fetch exact purchased item
        const items = await tx
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        if (items.length === 0) {
          throw new ApiException(
            'Order does not contain any course items',
            HttpStatus.BAD_REQUEST,
            'ORDER_NOT_REFUNDABLE'
          );
        }

        const purchasedItem = items[0];

        // 7. Enforce exact student enrollment
        const [enrollment] = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.studentId, studentId),
              eq(enrollments.courseId, purchasedItem.courseId)
            )
          );

        if (!enrollment || enrollment.status !== 'ACTIVE') {
          throw new ApiException(
            'Active enrollment not found for the purchased course',
            HttpStatus.BAD_REQUEST,
            'ENROLLMENT_INELIGIBLE'
          );
        }

        // 8. Enforce course progress limit (PD-2: strictly < 20%)
        const progressPercentage = await this.calculateCourseProgress(
          tx,
          purchasedItem.courseId,
          enrollment.id
        );

        if (progressPercentage >= MAX_ALLOWED_PROGRESS_PERCENTAGE) {
          throw new ApiException(
            `Course progress (${progressPercentage}%) exceeds the 20% refund eligibility limit`,
            HttpStatus.BAD_REQUEST,
            'REFUND_PROGRESS_LIMIT_EXCEEDED'
          );
        }

        // 9. Generate unique request number
        const requestNumber = `TSP-REQ-${order.id.replace(/-/g, '').slice(0, 10).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

        // 10. Insert refund request
        const [newRequest] = await tx
          .insert(refundRequests)
          .values({
            requestNumber,
            orderId: order.id,
            studentId,
            courseId: purchasedItem.courseId,
            enrollmentId: enrollment.id,
            reasonCategory: input.reasonCategory,
            reasonDetail: input.reasonDetail.trim(),
            courseProgressAtRequest: progressPercentage,
            status: 'PENDING',
          })
          .returning();

        // 11. Record append-only audit log
        await this.auditService.record({
          actorId: studentId,
          action: 'REFUND_REQUEST_SUBMITTED',
          targetType: 'refund_request',
          targetId: newRequest.id,
          ipAddress: reqMeta?.ip,
          userAgent: reqMeta?.userAgent,
          requestId: reqMeta?.requestId,
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            requestNumber,
            courseId: purchasedItem.courseId,
            courseTitle: purchasedItem.courseTitle,
            reasonCategory: input.reasonCategory,
            courseProgressAtRequest: progressPercentage,
          },
        });

        return this.toStudentRefundRequestDto(
          newRequest,
          order.orderNumber,
          purchasedItem.courseTitle
        );
      });

      if (this.outboxService) {
        this.outboxService.emit({
          eventType: 'RefundRequested',
          entityType: 'REFUND_REQUEST',
          entityId: result.requestNumber,
          targetUserId: studentId,
          actorUserId: studentId,
          payload: {
            requestId: result.id,
            requestNumber: result.requestNumber,
            orderId: result.orderId,
            orderNumber: result.orderNumber,
            reason: result.reasonDetail || result.reasonCategory,
            userId: studentId,
          },
        }).catch((err) => {
          // resilient
        });
      }

      return result;
    } catch (error: any) {
      if (error instanceof ApiException) {
        throw error;
      }

      // Handle duplicate race condition caught by Postgres partial unique index
      if (error?.code === '23505' && String(error?.detail || '').includes('refund_requests_active_order_uq')) {
        throw new ApiException(
          'An active refund request already exists for this order',
          HttpStatus.BAD_REQUEST,
          'REFUND_REQUEST_ALREADY_ACTIVE'
        );
      }

      this.logger.error('Failed to create refund request:', error);
      throw new ApiException(
        'Failed to submit refund request',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR'
      );
    }
  }

  /**
   * Retrieves paginated list of refund requests submitted by the authenticated student.
   */
  async listStudentRefundRequests(
    studentId: string,
    query: StudentRefundRequestListQuery
  ): Promise<PaginatedStudentRefundRequestsData> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const offset = (page - 1) * limit;

    const baseWhereConditions = [eq(refundRequests.studentId, studentId)];
    if (query.status) {
      baseWhereConditions.push(eq(refundRequests.status, query.status));
    }

    const whereClause = and(...baseWhereConditions);

    const [totalRes] = await this.db
      .select({ count: count(refundRequests.id) })
      .from(refundRequests)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);

    const rows = await this.db
      .select({
        request: refundRequests,
        orderNumber: orders.orderNumber,
        courseTitle: courses.title,
      })
      .from(refundRequests)
      .innerJoin(orders, eq(refundRequests.orderId, orders.id))
      .innerJoin(courses, eq(refundRequests.courseId, courses.id))
      .where(whereClause)
      .orderBy(desc(refundRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map((r) =>
      this.toStudentRefundRequestDto(r.request, r.orderNumber, r.courseTitle)
    );

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Retrieves single student refund request by ID with strict ownership validation.
   */
  async getStudentRefundRequestById(
    requestId: string,
    studentId: string
  ): Promise<StudentRefundRequestDto> {
    const [row] = await this.db
      .select({
        request: refundRequests,
        orderNumber: orders.orderNumber,
        courseTitle: courses.title,
      })
      .from(refundRequests)
      .innerJoin(orders, eq(refundRequests.orderId, orders.id))
      .innerJoin(courses, eq(refundRequests.courseId, courses.id))
      .where(eq(refundRequests.id, requestId));

    if (!row) {
      throw new ApiException(
        'Refund request not found',
        HttpStatus.NOT_FOUND,
        'REFUND_REQUEST_NOT_FOUND'
      );
    }

    if (row.request.studentId !== studentId) {
      throw new ApiException(
        'You do not have permission to view this refund request',
        HttpStatus.FORBIDDEN,
        'ORDER_ACCESS_DENIED'
      );
    }

    return this.toStudentRefundRequestDto(row.request, row.orderNumber, row.courseTitle);
  }

  /**
   * Retrieves paginated list of refund requests for the administrative review queue.
   */
  async listAdminRefundRequests(
    query: RefundRequestListQuery
  ): Promise<PaginatedRefundRequestsData> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const offset = (page - 1) * limit;

    const whereConditions = [];

    if (query.status) {
      whereConditions.push(eq(refundRequests.status, query.status));
    }

    if (query.startDate) {
      whereConditions.push(gte(refundRequests.createdAt, new Date(query.startDate)));
    }

    if (query.endDate) {
      whereConditions.push(lte(refundRequests.createdAt, new Date(query.endDate)));
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      whereConditions.push(
        or(
          ilike(orders.orderNumber, term),
          ilike(refundRequests.requestNumber, term),
          ilike(users.email, term),
          ilike(users.name, term),
          ilike(courses.title, term)
        )
      );
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [totalRes] = await this.db
      .select({ count: count(refundRequests.id) })
      .from(refundRequests)
      .innerJoin(orders, eq(refundRequests.orderId, orders.id))
      .innerJoin(users, eq(refundRequests.studentId, users.id))
      .innerJoin(courses, eq(refundRequests.courseId, courses.id))
      .where(whereClause);

    const total = Number(totalRes?.count || 0);

    const rows = await this.db
      .select({
        request: refundRequests,
        order: orders,
        student: users,
        course: courses,
        refund: refunds,
      })
      .from(refundRequests)
      .innerJoin(orders, eq(refundRequests.orderId, orders.id))
      .innerJoin(users, eq(refundRequests.studentId, users.id))
      .innerJoin(courses, eq(refundRequests.courseId, courses.id))
      .leftJoin(refunds, eq(refundRequests.refundId, refunds.id))
      .where(whereClause)
      .orderBy(desc(refundRequests.createdAt))
      .limit(limit)
      .offset(offset);

    const items: RefundRequestListItemDto[] = rows.map((r) => ({
      id: r.request.id,
      requestNumber: r.request.requestNumber,
      orderId: r.request.orderId,
      orderNumber: r.order.orderNumber,
      studentId: r.request.studentId,
      studentName: r.student.name,
      studentEmail: r.student.email,
      courseId: r.request.courseId,
      courseTitle: r.course.title,
      payableCents: r.order.payableCents,
      currency: r.order.currency as Currency,
      reasonCategory: r.request.reasonCategory,
      courseProgressAtRequest: r.request.courseProgressAtRequest,
      status: r.request.status,
      refundStatus: r.refund?.status ?? null,
      createdAt: r.request.createdAt.toISOString(),
      reviewedAt: r.request.reviewedAt ? r.request.reviewedAt.toISOString() : null,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Retrieves full operational refund request detail for admin review.
   */
  async getAdminRefundRequestById(requestId: string): Promise<RefundRequestDto> {
    const reviewerUser = alias(users, 'reviewer_user');
    const [row] = await this.db
      .select({
        request: refundRequests,
        order: orders,
        student: users,
        course: courses,
        reviewer: reviewerUser,
        refund: refunds,
        invoice: invoices,
      })
      .from(refundRequests)
      .innerJoin(orders, eq(refundRequests.orderId, orders.id))
      .innerJoin(users, eq(refundRequests.studentId, users.id))
      .innerJoin(courses, eq(refundRequests.courseId, courses.id))
      .leftJoin(reviewerUser, eq(refundRequests.reviewedBy, reviewerUser.id))
      .leftJoin(refunds, eq(refundRequests.refundId, refunds.id))
      .leftJoin(invoices, eq(invoices.orderId, orders.id))
      .where(eq(refundRequests.id, requestId));

    if (!row) {
      throw new ApiException(
        'Refund request not found',
        HttpStatus.NOT_FOUND,
        'REFUND_REQUEST_NOT_FOUND'
      );
    }

    const currentProgress = await this.calculateCourseProgress(
      this.db,
      row.request.courseId,
      row.request.enrollmentId
    );

    return {
      id: row.request.id,
      requestNumber: row.request.requestNumber,
      orderId: row.request.orderId,
      orderNumber: row.order.orderNumber,
      studentId: row.request.studentId,
      studentName: row.student.name,
      studentEmail: row.student.email,
      courseId: row.request.courseId,
      courseTitle: row.course.title,
      enrollmentId: row.request.enrollmentId,
      reasonCategory: row.request.reasonCategory,
      reasonDetail: row.request.reasonDetail,
      courseProgressAtRequest: row.request.courseProgressAtRequest,
      currentProgress,
      status: row.request.status,
      reviewedBy: row.request.reviewedBy ?? null,
      reviewedByName: row.reviewer?.name ?? null,
      reviewedAt: row.request.reviewedAt ? row.request.reviewedAt.toISOString() : null,
      rejectionReason: row.request.rejectionReason ?? null,
      adminNotes: row.request.adminNotes ?? null,
      refundId: row.request.refundId ?? null,
      refundStatus: row.refund?.status ?? null,
      orderPaidAt: row.order.paidAt ? row.order.paidAt.toISOString() : null,
      orderStatus: row.order.status as OrderStatus,
      payableCents: row.order.payableCents,
      subtotalCents: row.order.subtotalCents,
      discountCents: row.order.discountCents,
      currency: row.order.currency as Currency,
      invoiceId: row.invoice?.id ?? null,
      invoiceNumber: row.invoice?.invoiceNumber ?? null,
      createdAt: row.request.createdAt.toISOString(),
      updatedAt: row.request.updatedAt.toISOString(),
    };
  }

  /**
   * Rejects a pending student refund request.
   */
  async rejectRefundRequest(
    requestId: string,
    adminId: string,
    input: AdminRejectRefundRequestRequest,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RefundRequestDto> {
    await this.db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.id, requestId))
        .for('update');

      if (!reqRow) {
        throw new ApiException(
          'Refund request not found',
          HttpStatus.NOT_FOUND,
          'REFUND_REQUEST_NOT_FOUND'
        );
      }

      if (reqRow.status !== 'PENDING') {
        throw new ApiException(
          `Refund request has already been reviewed (current status: ${reqRow.status})`,
          HttpStatus.CONFLICT,
          'REFUND_REQUEST_ALREADY_REVIEWED'
        );
      }

      await tx
        .update(refundRequests)
        .set({
          status: 'REJECTED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionReason: input.rejectionReason.trim(),
          adminNotes: input.adminNotes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(refundRequests.id, requestId));

      await this.auditService.record({
        actorId: adminId,
        action: 'REFUND_REQUEST_REJECTED',
        targetType: 'refund_request',
        targetId: requestId,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          orderId: reqRow.orderId,
          requestNumber: reqRow.requestNumber,
          rejectionReason: input.rejectionReason.trim(),
          adminNotes: input.adminNotes?.trim() || null,
        },
      });
    });

    const updatedDto = await this.getAdminRefundRequestById(requestId);

    if (this.outboxService) {
      this.outboxService.emit({
        eventType: 'RefundRejected',
        entityType: 'REFUND_REQUEST',
        entityId: updatedDto.requestNumber,
        targetUserId: updatedDto.studentId,
        actorUserId: adminId,
        payload: {
          requestId: updatedDto.id,
          requestNumber: updatedDto.requestNumber,
          orderId: updatedDto.orderId,
          orderNumber: updatedDto.orderNumber,
          reason: input.rejectionReason.trim(),
          userId: updatedDto.studentId,
        },
      }).catch((err) => {
        // resilient
      });
    }

    return updatedDto;
  }

  /**
   * Approves a pending student refund request.
   * Review transition only in P5.5.4; provider execution occurs in P5.5.5.
   */
  async approveRefundRequest(
    requestId: string,
    adminId: string,
    input: AdminApproveRefundRequestRequest,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RefundRequestDto> {
    await this.db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.id, requestId))
        .for('update');

      if (!reqRow) {
        throw new ApiException(
          'Refund request not found',
          HttpStatus.NOT_FOUND,
          'REFUND_REQUEST_NOT_FOUND'
        );
      }

      if (reqRow.status !== 'PENDING') {
        throw new ApiException(
          `Refund request has already been reviewed (current status: ${reqRow.status})`,
          HttpStatus.CONFLICT,
          'REFUND_REQUEST_ALREADY_REVIEWED'
        );
      }

      // Check target order
      const [orderRow] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, reqRow.orderId))
        .for('update');

      if (!orderRow) {
        throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
      }

      if (orderRow.status === 'REFUNDED') {
        throw new ApiException(
          'Order has already been refunded',
          HttpStatus.BAD_REQUEST,
          'ORDER_NOT_REFUNDABLE'
        );
      }

      if (orderRow.status !== 'PAID') {
        throw new ApiException(
          'Order is not in PAID state',
          HttpStatus.BAD_REQUEST,
          'ORDER_NOT_REFUNDABLE'
        );
      }

      // Check if an existing refund row is already active for this order
      const [activeRefund] = await tx
        .select()
        .from(refunds)
        .where(
          and(
            eq(refunds.orderId, reqRow.orderId),
            inArray(refunds.status, ['PENDING', 'PROCESSED'])
          )
        )
        .limit(1);

      if (activeRefund) {
        throw new ApiException(
          'A refund operation is already pending or processed for this order',
          HttpStatus.CONFLICT,
          activeRefund.status === 'PROCESSED' ? 'REFUND_ALREADY_PROCESSED' : 'REFUND_ALREADY_PENDING'
        );
      }

      await tx
        .update(refundRequests)
        .set({
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          adminNotes: input.adminNotes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(refundRequests.id, requestId));

      await this.auditService.record({
        actorId: adminId,
        action: 'REFUND_REQUEST_APPROVED',
        targetType: 'refund_request',
        targetId: requestId,
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
        metadata: {
          orderId: reqRow.orderId,
          requestNumber: reqRow.requestNumber,
          adminNotes: input.adminNotes?.trim() || null,
        },
      });
    });

    const updatedDto = await this.getAdminRefundRequestById(requestId);

    if (this.outboxService) {
      this.outboxService.emit({
        eventType: 'RefundApproved',
        entityType: 'REFUND_REQUEST',
        entityId: updatedDto.requestNumber,
        targetUserId: updatedDto.studentId,
        actorUserId: adminId,
        payload: {
          requestId: updatedDto.id,
          requestNumber: updatedDto.requestNumber,
          orderId: updatedDto.orderId,
          orderNumber: updatedDto.orderNumber,
          amountCents: updatedDto.payableCents || 0,
          userId: updatedDto.studentId,
        },
      }).catch((err) => {
        // resilient
      });
    }

    return updatedDto;
  }

  /**
   * Discovers APPROVED student refund requests awaiting authoritative refund execution.
   * Invariant: MUST NOT filter by orders.status = 'PAID' (Discovery Rule: an approved request
   * can legitimately remain APPROVED + refund_id NULL if a separate direct admin refund
   * already caused the order to become REFUNDED).
   */
  async discoverApprovedRefundRequests(limit: number = 50): Promise<RefundRequest[]> {
    const rows = await this.db
      .select({ request: refundRequests })
      .from(refundRequests)
      .innerJoin(orders, eq(refundRequests.orderId, orders.id))
      .where(
        and(
          eq(refundRequests.status, 'APPROVED'),
          isNull(refundRequests.refundId)
        )
      )
      .orderBy(asc(refundRequests.reviewedAt))
      .limit(limit);

    return rows.map((r) => r.request);
  }

  /**
   * Executes authoritative refund operation for an approved student refund request.
   * Concurrency-safe, two-phase transaction model:
   * - Short DB transaction locks request, order, and existing refund to validate state.
   * - External SSLCommerz gateway call is strictly executed OUTSIDE DB transactions/locks.
   * - Finalization remains atomic and idempotent via RefundsService.
   */
  async executeApprovedRefundRequest(
    requestId: string,
    adminId: string,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RefundDto> {
    type InspectResult =
      | { action: 'ALREADY_LINKED'; refundId: string }
      | { action: 'LINKED_DIRECT_REFUND'; refund: any; order: any; request: any }
      | { action: 'LINKED_EXISTING_REFUND'; refund: any; order: any; request: any }
      | { action: 'INVALID_ORDER_STATE'; order: any; request: any }
      | { action: 'RELATIONSHIP_MISMATCH'; order: any; request: any }
      | { action: 'RETRY_REFUND'; order: any; request: any; existingRefund: any }
      | { action: 'INITIATE_REFUND'; order: any; request: any };

    // Phase 1: Short DB transaction to inspect and lock state
    const inspectResult = await this.db.transaction(async (tx): Promise<InspectResult> => {
      const [req] = await tx
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.id, requestId))
        .for('update');

      if (!req) {
        throw new ApiException(
          'Refund request not found',
          HttpStatus.NOT_FOUND,
          'REFUND_REQUEST_NOT_FOUND'
        );
      }

      if (req.status !== 'APPROVED') {
        throw new ApiException(
          `Refund request is in '${req.status}' status. Only APPROVED requests can be executed.`,
          HttpStatus.BAD_REQUEST,
          'REFUND_REQUEST_NOT_APPROVED'
        );
      }

      if (req.refundId) {
        return { action: 'ALREADY_LINKED', refundId: req.refundId };
      }

      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, req.orderId))
        .for('update');

      if (!order) {
        throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
      }

      // CASE B — ORDER IS ALREADY REFUNDED
      if (order.status === 'REFUNDED') {
        const [existingRefund] = await tx
          .select()
          .from(refunds)
          .where(eq(refunds.orderId, order.id))
          .for('update');

        if (existingRefund) {
          await tx
            .update(refundRequests)
            .set({
              refundId: existingRefund.id,
              updatedAt: new Date(),
            })
            .where(eq(refundRequests.id, req.id));

          return {
            action: 'LINKED_DIRECT_REFUND',
            refund: existingRefund,
            order,
            request: req,
          };
        }

        throw new ApiException(
          'Order is marked REFUNDED but authoritative refund operation is missing',
          HttpStatus.INTERNAL_SERVER_ERROR,
          'INTERNAL_ERROR'
        );
      }

      // CASE C — ORDER IS IN ANOTHER STATE (PENDING, PAYMENT_PROCESSING, FAILED, CANCELLED)
      if (order.status !== 'PAID') {
        return {
          action: 'INVALID_ORDER_STATE',
          order,
          request: req,
        };
      }

      // CASE A — ORDER IS PAID
      // Exact student/order/course/enrollment relationship verification
      const [orderItem] = await tx
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.orderId, order.id), eq(orderItems.courseId, req.courseId)))
        .limit(1);

      const [enrollment] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.id, req.enrollmentId),
            eq(enrollments.studentId, req.studentId),
            eq(enrollments.courseId, req.courseId)
          )
        )
        .limit(1);

      if (!orderItem || !enrollment) {
        return {
          action: 'RELATIONSHIP_MISMATCH',
          order,
          request: req,
        };
      }

      // Inspect existing refund operation in refunds table
      const [existingRefund] = await tx
        .select()
        .from(refunds)
        .where(eq(refunds.orderId, order.id))
        .for('update');

      if (existingRefund) {
        // PROCESSED or PENDING refund operation: DO NOT create second refund row or issue second provider refund
        if (existingRefund.status === 'PROCESSED' || existingRefund.status === 'PENDING') {
          await tx
            .update(refundRequests)
            .set({
              refundId: existingRefund.id,
              updatedAt: new Date(),
            })
            .where(eq(refundRequests.id, req.id));

          return {
            action: 'LINKED_EXISTING_REFUND',
            refund: existingRefund,
            order,
            request: req,
          };
        }

        // FAILED refund operation: retry existing row in place
        if (existingRefund.status === 'FAILED') {
          return {
            action: 'RETRY_REFUND',
            order,
            request: req,
            existingRefund,
          };
        }
      }

      // New refund initiation
      return {
        action: 'INITIATE_REFUND',
        order,
        request: req,
      };
    });

    // Phase 2: Actions outside database transaction
    if (inspectResult.action === 'ALREADY_LINKED') {
      return await this.refundsService.getRefundById(inspectResult.refundId);
    }

    if (inspectResult.action === 'LINKED_DIRECT_REFUND') {
      await this.auditService.record({
        actorId: adminId,
        action: 'REFUND_REQUEST_LINKED_TO_DIRECT_REFUND',
        targetType: 'refund_request',
        targetId: inspectResult.request.id,
        metadata: {
          orderId: inspectResult.order.id,
          orderNumber: inspectResult.order.orderNumber,
          refundId: inspectResult.refund.id,
          refundNumber: inspectResult.refund.refundNumber,
          directRefundNotice: true,
        },
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
      });

      return this.refundsService.formatRefundDto(
        inspectResult.refund,
        inspectResult.order.orderNumber
      );
    }

    if (inspectResult.action === 'LINKED_EXISTING_REFUND') {
      await this.auditService.record({
        actorId: adminId,
        action: 'REFUND_REQUEST_LINKED_TO_EXISTING_REFUND',
        targetType: 'refund_request',
        targetId: inspectResult.request.id,
        metadata: {
          orderId: inspectResult.order.id,
          orderNumber: inspectResult.order.orderNumber,
          refundId: inspectResult.refund.id,
          refundNumber: inspectResult.refund.refundNumber,
          refundStatus: inspectResult.refund.status,
        },
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
      });

      return this.refundsService.formatRefundDto(
        inspectResult.refund,
        inspectResult.order.orderNumber
      );
    }

    if (inspectResult.action === 'INVALID_ORDER_STATE') {
      await this.auditService.record({
        actorId: adminId,
        action: 'REFUND_REQUEST_ORDER_STATE_INVALID',
        targetType: 'refund_request',
        targetId: inspectResult.request.id,
        metadata: {
          orderId: inspectResult.order.id,
          orderNumber: inspectResult.order.orderNumber,
          orderStatus: inspectResult.order.status,
          manualReviewRequired: true,
        },
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
      });

      throw new ApiException(
        `Order is in '${inspectResult.order.status}' status, which is inconsistent with refund execution. Operation marked for manual review.`,
        HttpStatus.BAD_REQUEST,
        'ORDER_NOT_REFUNDABLE'
      );
    }

    if (inspectResult.action === 'RELATIONSHIP_MISMATCH') {
      await this.auditService.record({
        actorId: adminId,
        action: 'REFUND_REQUEST_RELATIONSHIP_MISMATCH',
        targetType: 'refund_request',
        targetId: inspectResult.request.id,
        metadata: {
          orderId: inspectResult.order.id,
          orderNumber: inspectResult.order.orderNumber,
          courseId: inspectResult.request.courseId,
          enrollmentId: inspectResult.request.enrollmentId,
          studentId: inspectResult.request.studentId,
        },
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
      });

      throw new ApiException(
        'Order, student, or enrollment relationships have been corrupted or mismatched',
        HttpStatus.BAD_REQUEST,
        'REFUND_RELATIONSHIP_MISMATCH'
      );
    }

    // INITIATE_REFUND or RETRY_REFUND
    const isRetry = inspectResult.action === 'RETRY_REFUND';
    try {
      const refundDto = await this.refundsService.initiateOrRetryRefund(
        inspectResult.order.id,
        adminId,
        { reason: inspectResult.request.reasonDetail },
        reqMeta
      );

      // Safely link refund_requests.refund_id = refundDto.id
      await this.db
        .update(refundRequests)
        .set({
          refundId: refundDto.id,
          updatedAt: new Date(),
        })
        .where(eq(refundRequests.id, inspectResult.request.id));

      await this.auditService.record({
        actorId: adminId,
        action: isRetry
          ? 'REFUND_REQUEST_FAILED_OPERATION_RETRIED'
          : 'REFUND_REQUEST_REFUND_INITIATED',
        targetType: 'refund_request',
        targetId: inspectResult.request.id,
        metadata: {
          orderId: inspectResult.order.id,
          orderNumber: inspectResult.order.orderNumber,
          refundId: refundDto.id,
          refundNumber: refundDto.refundNumber,
        },
        ipAddress: reqMeta?.ip,
        userAgent: reqMeta?.userAgent,
        requestId: reqMeta?.requestId,
      });

      return refundDto;
    } catch (err: any) {
      const errCode = err?.errorCode || err?.code;
      const isManualReview = errCode === 'REFUND_MANUAL_REVIEW_REQUIRED';
      const isConflictOrPending =
        errCode === 'REFUND_ALREADY_PENDING' ||
        errCode === 'DUPLICATE_REFUND' ||
        errCode === 'REFUND_ALREADY_PROCESSED' ||
        (err instanceof ApiException && err.getStatus() === HttpStatus.CONFLICT) ||
        err?.message?.includes('duplicate key') ||
        err?.message?.includes('Refund already pending or initiated') ||
        err?.code === '23505';

      // If a timeout occurred, ensure refundId is linked to the pending row before propagating
      if (isManualReview) {
        const [timeoutRefund] = await this.db
          .select()
          .from(refunds)
          .where(eq(refunds.orderId, inspectResult.order.id));

        if (timeoutRefund) {
          await this.db
            .update(refundRequests)
            .set({
              refundId: timeoutRefund.id,
              updatedAt: new Date(),
            })
            .where(eq(refundRequests.id, inspectResult.request.id));
        }
      }

      // Concurrency race: if another worker initiated or retried the refund in parallel
      if (isConflictOrPending) {
        const [concurrentRefund] = await this.db
          .select()
          .from(refunds)
          .where(eq(refunds.orderId, inspectResult.order.id));

        if (concurrentRefund && !isManualReview) {
          await this.db
            .update(refundRequests)
            .set({
              refundId: concurrentRefund.id,
              updatedAt: new Date(),
            })
            .where(eq(refundRequests.id, inspectResult.request.id));

          return this.refundsService.formatRefundDto(
            concurrentRefund,
            inspectResult.order.orderNumber
          );
        }
      }

      throw err;
    }
  }

  /**
   * Discovers and batch processes all approved student refund requests.
   */
  async processDiscoveredApprovedRequests(
    adminId: string,
    limit: number = 50,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<ProcessApprovedRefundsResultDto> {
    const discovered = await this.discoverApprovedRefundRequests(limit);
    const results: ProcessApprovedRefundItemResultDto[] = [];
    let processedCount = 0;

    for (const req of discovered) {
      try {
        const [ord] = await this.db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, req.orderId));

        if (ord && ord.status === 'REFUNDED') {
          const refundDto = await this.executeApprovedRefundRequest(req.id, adminId, reqMeta);
          results.push({
            requestId: req.id,
            orderId: req.orderId,
            outcome: 'LINKED_DIRECT_REFUND',
            refundId: refundDto.id,
            refundNumber: refundDto.refundNumber,
            refundStatus: refundDto.status,
            orderStatus: 'REFUNDED',
          });
          processedCount++;
          continue;
        }

        if (ord && ord.status !== 'PAID') {
          try {
            await this.executeApprovedRefundRequest(req.id, adminId, reqMeta);
          } catch (err: any) {
            results.push({
              requestId: req.id,
              orderId: req.orderId,
              outcome: 'SKIPPED_INVALID_ORDER_STATE',
              orderStatus: ord.status,
              error: err?.message || 'Invalid order status',
            });
          }
          continue;
        }

        const [existingRefund] = await this.db
          .select({ status: refunds.status })
          .from(refunds)
          .where(eq(refunds.orderId, req.orderId));

        let outcome: RefundProcessingOutcome = 'INITIATED';
        if (existingRefund) {
          if (existingRefund.status === 'PROCESSED') outcome = 'LINKED_PROCESSED';
          else if (existingRefund.status === 'PENDING') outcome = 'LINKED_PENDING';
          else if (existingRefund.status === 'FAILED') outcome = 'RETRIED';
        }

        const refundDto = await this.executeApprovedRefundRequest(req.id, adminId, reqMeta);
        results.push({
          requestId: req.id,
          orderId: req.orderId,
          outcome,
          refundId: refundDto.id,
          refundNumber: refundDto.refundNumber,
          refundStatus: refundDto.status,
          orderStatus: 'PAID',
        });
        processedCount++;
      } catch (err: any) {
        results.push({
          requestId: req.id,
          orderId: req.orderId,
          outcome: 'SKIPPED_INVALID_ORDER_STATE',
          error: err?.message || 'Execution error',
        });
      }
    }

    return {
      discovered: discovered.length,
      processed: processedCount,
      results,
    };
  }
}


