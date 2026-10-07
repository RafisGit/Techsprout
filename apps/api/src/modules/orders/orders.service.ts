import { Injectable, Inject, HttpStatus, Optional } from '@nestjs/common';
import { eq, and, desc, sql, count, inArray, gte, lte, or, ilike } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  orders,
  orderItems,
  courses,
  categories,
  users,
  coupons,
  couponRedemptions,
  enrollments,
  invoices,
  Order,
  OrderItem,
  Coupon,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { ApiException } from '../../common/errors/api-error';
import { decimalStringToCents, calculateDiscountCents } from '../payments/money.util';
import { CreateOrderRequest, OrderListQuery, OrderDto } from '@techsprout/contracts';

export interface UserContext {
  id: string;
  role: string;
  name?: string;
  email?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(OutboxService) private readonly outboxService?: OutboxService
  ) {}

  public formatOrderDto(
    order: Order,
    items: OrderItem[],
    student?: { name?: string; email?: string },
    invoiceId?: string | null
  ): OrderDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      studentId: order.studentId,
      studentName: student?.name,
      studentEmail: student?.email,
      status: order.status,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      payableCents: order.payableCents,
      currency: order.currency as 'BDT',
      couponId: order.couponId,
      couponCode: order.couponCode,
      invoiceId: invoiceId ?? null,
      items: items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        courseId: item.courseId,
        courseTitle: item.courseTitle,
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        payableCents: item.payableCents,
        createdAt: item.createdAt.toISOString(),
      })),
      expiresAt: order.expiresAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /**
   * Create Order (POST /api/v1/orders)
   * Server-authoritative price & coupon calculation
   */
  async createOrder(
    studentId: string,
    input: CreateOrderRequest,
    reqMeta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<OrderDto> {
    // 1. Fetch course & category
    const [courseResult] = await this.db
      .select({
        course: courses,
        category: categories,
      })
      .from(courses)
      .innerJoin(categories, eq(courses.categoryId, categories.id))
      .where(eq(courses.id, input.courseId))
      .limit(1);

    if (!courseResult || courseResult.course.status === 'DRAFT') {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (!courseResult.category.isActive) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (courseResult.course.status === 'ARCHIVED') {
      throw new ApiException(
        'Course is archived; orders are closed',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'COURSE_ARCHIVED'
      );
    }

    if (courseResult.course.visibility === 'PRIVATE') {
      throw new ApiException(
        'Course is private; administrative assignment required',
        HttpStatus.FORBIDDEN,
        'PRIVATE_COURSE'
      );
    }

    // 2. Invariant: Check if student already actively enrolled or completed
    const [existingEnrollment] = await this.db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, input.courseId)))
      .limit(1);

    if (
      existingEnrollment &&
      (existingEnrollment.status === 'ACTIVE' || existingEnrollment.status === 'COMPLETED')
    ) {
      throw new ApiException(
        'Already enrolled in this course',
        HttpStatus.CONFLICT,
        'ALREADY_ENROLLED'
      );
    }

    // 3. Authoritative price calculation
    const subtotalCents = decimalStringToCents(courseResult.course.price);
    const currency = 'BDT';
    let discountCents = 0;
    let appliedCoupon: Coupon | null = null;

    // 4. Validate & apply coupon if provided
    if (input.couponCode) {
      const normalizedCode = input.couponCode.trim().toUpperCase();
      const [coupon] = await this.db
        .select()
        .from(coupons)
        .where(eq(coupons.code, normalizedCode))
        .limit(1);

      if (!coupon) {
        throw new ApiException('Coupon code not found', HttpStatus.NOT_FOUND, 'COUPON_NOT_FOUND');
      }

      if (!coupon.isActive) {
        throw new ApiException('Coupon is not active', HttpStatus.BAD_REQUEST, 'COUPON_INVALID');
      }

      const now = new Date();
      if (coupon.startsAt > now) {
        throw new ApiException(
          'Coupon is not yet active',
          HttpStatus.BAD_REQUEST,
          'COUPON_INVALID'
        );
      }

      if (coupon.expiresAt && coupon.expiresAt <= now) {
        throw new ApiException('Coupon has expired', HttpStatus.BAD_REQUEST, 'COUPON_EXPIRED');
      }

      if (coupon.courseId && coupon.courseId !== input.courseId) {
        throw new ApiException(
          'Coupon is not valid for this course',
          HttpStatus.BAD_REQUEST,
          'COUPON_INVALID'
        );
      }

      if (subtotalCents < coupon.minOrderAmountCents) {
        throw new ApiException(
          'Order amount does not meet minimum coupon requirement',
          HttpStatus.BAD_REQUEST,
          'COUPON_INVALID'
        );
      }

      if (coupon.usageLimit != null && coupon.redemptionCount >= coupon.usageLimit) {
        throw new ApiException(
          'Coupon usage limit reached',
          HttpStatus.BAD_REQUEST,
          'COUPON_USAGE_LIMIT_REACHED'
        );
      }

      // Check per-user limit
      const [userRedemptionCount] = await this.db
        .select({ count: count(couponRedemptions.id) })
        .from(couponRedemptions)
        .where(
          and(
            eq(couponRedemptions.userId, studentId),
            eq(couponRedemptions.couponId, coupon.id),
            inArray(couponRedemptions.status, ['RESERVED', 'CONSUMED'])
          )
        );

      if (Number(userRedemptionCount?.count || 0) >= coupon.perUserLimit) {
        throw new ApiException(
          'Coupon per-user limit reached',
          HttpStatus.BAD_REQUEST,
          'COUPON_USER_LIMIT_REACHED'
        );
      }

      discountCents = calculateDiscountCents(
        subtotalCents,
        coupon.discountType,
        coupon.discountValue,
        coupon.maxDiscountAmountCents
      );

      appliedCoupon = coupon;
    }

    const payableCents = Math.max(0, subtotalCents - discountCents);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes expiry
    const orderNumber = `TSP-ORD-${Date.now().toString().slice(-8)}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Atomic persistence with reservation locking
    const created = await this.db.transaction(async (tx) => {
      if (appliedCoupon) {
        // Lock coupon row for reservation
        const [lockedCoupon] = await tx
          .select()
          .from(coupons)
          .where(eq(coupons.id, appliedCoupon.id))
          .for('update');

        if (lockedCoupon.usageLimit != null && lockedCoupon.redemptionCount >= lockedCoupon.usageLimit) {
          throw new ApiException(
            'Coupon usage limit reached during reservation',
            HttpStatus.BAD_REQUEST,
            'COUPON_USAGE_LIMIT_REACHED'
          );
        }

        // Increment coupon redemptionCount for reservation
        await tx
          .update(coupons)
          .set({
            redemptionCount: sql`"redemption_count" + 1`,
            updatedAt: new Date(),
          })
          .where(eq(coupons.id, appliedCoupon.id));
      }

      // Insert Order
      const [newOrder] = await tx
        .insert(orders)
        .values({
          orderNumber,
          studentId,
          status: 'PENDING',
          subtotalCents,
          discountCents,
          payableCents,
          currency,
          couponId: appliedCoupon ? appliedCoupon.id : null,
          couponCode: appliedCoupon ? appliedCoupon.code : null,
          expiresAt,
        })
        .returning();

      // Insert Order Item snapshot
      const [newItem] = await tx
        .insert(orderItems)
        .values({
          orderId: newOrder.id,
          courseId: input.courseId,
          courseTitle: courseResult.course.title,
          unitPriceCents: subtotalCents,
          discountCents,
          payableCents,
        })
        .returning();

      // Insert Coupon Redemption reservation
      if (appliedCoupon) {
        await tx.insert(couponRedemptions).values({
          couponId: appliedCoupon.id,
          userId: studentId,
          orderId: newOrder.id,
          status: 'RESERVED',
          discountCents,
          reservedAt: new Date(),
        });
      }

      return { order: newOrder, item: newItem };
    });

    // 6. Audit logging
    await this.auditService.record({
      actorId: studentId,
      action: 'ORDER_CREATED',
      targetType: 'ORDER',
      targetId: created.order.id,
      ipAddress: reqMeta?.ip,
      userAgent: reqMeta?.userAgent,
      requestId: reqMeta?.requestId,
      metadata: {
        orderNumber: created.order.orderNumber,
        studentId,
        courseId: input.courseId,
        subtotalCents,
        discountCents,
        payableCents,
        currency,
        couponCode: appliedCoupon?.code || null,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // 7. Emit Domain Event
    if (this.outboxService) {
      this.outboxService.emit({
        eventType: 'OrderPlaced',
        entityType: 'ORDER',
        entityId: created.order.orderNumber,
        targetUserId: studentId,
        actorUserId: studentId,
        payload: {
          orderId: created.order.id,
          orderNumber: created.order.orderNumber,
          amountCents: payableCents,
          currency,
          userId: studentId,
        },
      }).catch((err) => {
        // Asynchronous resilience: event dispatch never disrupts core operation
      });
    }

    // 8. Fetch student info for format
    const [student] = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);

    return this.formatOrderDto(created.order, [created.item], student);
  }

  /**
   * Get Order by ID with ownership verification and lazy expiration check
   */
  async getOrderById(orderId: string, user: UserContext): Promise<OrderDto> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

    if (!order) {
      throw new ApiException('Order not found', HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND');
    }

    if (user.role !== 'admin' && order.studentId !== user.id) {
      throw new ApiException(
        'Access denied: cannot view another student order',
        HttpStatus.FORBIDDEN,
        'ORDER_ACCESS_DENIED'
      );
    }

    // Lazy expiration check: if unpaid and past expiration, expire order
    if (
      ['PENDING', 'PAYMENT_PROCESSING'].includes(order.status) &&
      order.expiresAt < new Date()
    ) {
      await this.expireOrderIfDue(order.id);
      // Reload fresh order
      const [refreshed] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const items = await this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const [student] = await this.db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, refreshed.studentId))
        .limit(1);
      return this.formatOrderDto(refreshed, items, student);
    }

    const items = await this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const [student] = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, order.studentId))
      .limit(1);

    let invoiceId: string | null = null;
    if (order.status === 'PAID') {
      const [inv] = await this.db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.orderId, order.id))
        .limit(1);
      invoiceId = inv?.id || null;
    }

    return this.formatOrderDto(order, items, student, invoiceId);
  }

  /**
   * List authenticated student's orders
   */
  async listStudentOrders(studentId: string, query: OrderListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const baseWhere = query.status
      ? and(eq(orders.studentId, studentId), eq(orders.status, query.status))
      : eq(orders.studentId, studentId);

    const [totalResult] = await this.db
      .select({ count: count(orders.id) })
      .from(orders)
      .where(baseWhere);

    const total = Number(totalResult?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const orderRows = await this.db
      .select()
      .from(orders)
      .where(baseWhere)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const items = await Promise.all(
      orderRows.map(async (ord) => {
        const [firstItem] = await this.db
          .select({ courseTitle: orderItems.courseTitle })
          .from(orderItems)
          .where(eq(orderItems.orderId, ord.id))
          .limit(1);

        return {
          id: ord.id,
          orderNumber: ord.orderNumber,
          studentId: ord.studentId,
          status: ord.status,
          payableCents: ord.payableCents,
          currency: ord.currency as 'BDT',
          courseTitle: firstItem?.courseTitle || 'Course Purchase',
          createdAt: ord.createdAt.toISOString(),
          paidAt: ord.paidAt ? ord.paidAt.toISOString() : null,
        };
      })
    );

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
   * List all orders across students for Admin Explorer with full filtering and pagination
   */
  async listAdminOrders(query: OrderListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query.status) {
      conditions.push(eq(orders.status, query.status));
    }

    if (query.startDate) {
      conditions.push(gte(orders.createdAt, new Date(query.startDate)));
    }

    if (query.endDate) {
      conditions.push(lte(orders.createdAt, new Date(query.endDate)));
    }

    if (query.search) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(orders.orderNumber, term),
          ilike(users.name, term),
          ilike(users.email, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await this.db
      .select({ count: count(orders.id) })
      .from(orders)
      .innerJoin(users, eq(orders.studentId, users.id))
      .where(whereClause);

    const total = Number(totalResult?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = await this.db
      .select({
        order: orders,
        student: {
          name: users.name,
          email: users.email,
        },
      })
      .from(orders)
      .innerJoin(users, eq(orders.studentId, users.id))
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const items = await Promise.all(
      rows.map(async ({ order: ord, student }) => {
        const [firstItem] = await this.db
          .select({ courseTitle: orderItems.courseTitle })
          .from(orderItems)
          .where(eq(orderItems.orderId, ord.id))
          .limit(1);

        return {
          id: ord.id,
          orderNumber: ord.orderNumber,
          studentId: ord.studentId,
          studentName: student.name,
          studentEmail: student.email,
          status: ord.status,
          subtotalCents: ord.subtotalCents,
          discountCents: ord.discountCents,
          payableCents: ord.payableCents,
          currency: ord.currency as 'BDT',
          courseTitle: firstItem?.courseTitle || 'Course Purchase',
          createdAt: ord.createdAt.toISOString(),
          paidAt: ord.paidAt ? ord.paidAt.toISOString() : null,
        };
      })
    );

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
   * Idempotent order expiration helper:
   * Transitions PENDING/PAYMENT_PROCESSING -> CANCELLED
   * Releases reserved coupon and decrements coupon usage count exactly once.
   */
  async expireOrderIfDue(orderId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update');

      if (!order) {
        return false;
      }

      if (!['PENDING', 'PAYMENT_PROCESSING'].includes(order.status)) {
        return false;
      }

      // Transition order to CANCELLED
      await tx
        .update(orders)
        .set({
          status: 'CANCELLED',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      // Release reserved coupon if exists
      if (order.couponId) {
        const [redemption] = await tx
          .select()
          .from(couponRedemptions)
          .where(
            and(
              eq(couponRedemptions.orderId, orderId),
              eq(couponRedemptions.status, 'RESERVED')
            )
          )
          .for('update');

        if (redemption) {
          // Mark redemption RELEASED
          await tx
            .update(couponRedemptions)
            .set({
              status: 'RELEASED',
              releasedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(couponRedemptions.id, redemption.id));

          // Decrement coupon usage count exactly once
          await tx
            .update(coupons)
            .set({
              redemptionCount: sql`GREATEST(0, "redemption_count" - 1)`,
              updatedAt: new Date(),
            })
            .where(eq(coupons.id, redemption.couponId));
        }
      }

      await this.auditService.record({
        actorId: null,
        action: 'ORDER_EXPIRED',
        targetType: 'ORDER',
        targetId: orderId,
        metadata: {
          orderNumber: order.orderNumber,
          expiredAt: new Date().toISOString(),
          couponReleased: Boolean(order.couponId),
        },
      });

      return true;
    });
  }
}
