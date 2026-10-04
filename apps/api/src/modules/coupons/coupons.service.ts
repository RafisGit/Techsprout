import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import { eq, and, desc, count, ilike, inArray, gt } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  coupons,
  couponRedemptions,
  courses,
  sessions,
  Coupon,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import { calculateDiscountCents, decimalStringToCents } from '../payments/money.util';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import {
  ValidateCouponRequest,
  CouponPreviewDto,
  CouponDto,
  CreateCouponRequest,
  UpdateCouponRequest,
  CouponListQuery,
  PaginatedCouponsData,
  CouponDiscountType,
} from '@techsprout/contracts';

export function formatCouponDto(coupon: Coupon, courseTitle?: string | null): CouponDto {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType as CouponDiscountType,
    discountValue: coupon.discountValue,
    minOrderAmountCents: coupon.minOrderAmountCents,
    maxDiscountAmountCents: coupon.maxDiscountAmountCents ?? null,
    courseId: coupon.courseId ?? null,
    courseTitle: courseTitle ?? null,
    usageLimit: coupon.usageLimit ?? null,
    redemptionCount: coupon.redemptionCount,
    perUserLimit: coupon.perUserLimit,
    startsAt: coupon.startsAt.toISOString(),
    expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
    isActive: coupon.isActive,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Resolve authenticated student ID from session cookie or Bearer header if available.
   */
  async resolveUserId(req: AuthenticatedRequest): Promise<string | undefined> {
    if (req.user?.id) {
      return req.user.id;
    }

    let token = req.cookies?.['techsprout_session'];
    if (!token && req.headers?.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return undefined;
    }

    const [sessionRecord] = await this.db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1);

    return sessionRecord?.userId;
  }

  /**
   * Preview and validate a coupon against a target course and optional student context.
   * Strictly READ-ONLY. No database mutations, reservations, or counter increments.
   */
  async validateCoupon(
    input: ValidateCouponRequest,
    studentId?: string
  ): Promise<CouponPreviewDto> {
    const normalizedCode = input.code.trim().toUpperCase();

    // 1. Load coupon by normalized code
    const [coupon] = await this.db
      .select()
      .from(coupons)
      .where(eq(coupons.code, normalizedCode))
      .limit(1);

    if (!coupon) {
      throw new ApiException('Coupon code not found', HttpStatus.NOT_FOUND, 'COUPON_NOT_FOUND');
    }

    // 2. Active status check
    if (!coupon.isActive) {
      throw new ApiException('Coupon is disabled', HttpStatus.BAD_REQUEST, 'COUPON_DISABLED');
    }

    // 3. Effective date window checks
    const now = new Date();
    if (coupon.startsAt > now) {
      throw new ApiException(
        'Coupon is not yet active',
        HttpStatus.BAD_REQUEST,
        'COUPON_NOT_YET_ACTIVE'
      );
    }

    if (coupon.expiresAt && coupon.expiresAt <= now) {
      throw new ApiException('Coupon has expired', HttpStatus.BAD_REQUEST, 'COUPON_EXPIRED');
    }

    // 4. Course scope check
    if (coupon.courseId && coupon.courseId !== input.courseId) {
      throw new ApiException(
        'Coupon is not valid for this course',
        HttpStatus.BAD_REQUEST,
        'COUPON_COURSE_MISMATCH'
      );
    }

    // 5. Load current course price authoritatively from database
    const [course] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (course.status !== 'PUBLISHED') {
      throw new ApiException(
        'Course is not available for purchase',
        HttpStatus.BAD_REQUEST,
        'COURSE_NOT_PUBLISHED'
      );
    }

    const subtotalCents = decimalStringToCents(course.price);

    // 6. Minimum order amount check
    if (subtotalCents < coupon.minOrderAmountCents) {
      throw new ApiException(
        'Order amount does not meet minimum coupon requirement',
        HttpStatus.BAD_REQUEST,
        'COUPON_MIN_ORDER_NOT_MET'
      );
    }

    // 7. Global usage limit check
    if (coupon.usageLimit != null && coupon.redemptionCount >= coupon.usageLimit) {
      throw new ApiException(
        'Coupon usage limit reached',
        HttpStatus.BAD_REQUEST,
        'COUPON_USAGE_LIMIT_REACHED'
      );
    }

    // 8. Per-user limit check (when authenticated student context exists)
    if (studentId) {
      const [userRedemptions] = await this.db
        .select({ count: count(couponRedemptions.id) })
        .from(couponRedemptions)
        .where(
          and(
            eq(couponRedemptions.userId, studentId),
            eq(couponRedemptions.couponId, coupon.id),
            inArray(couponRedemptions.status, ['RESERVED', 'CONSUMED'])
          )
        );

      if (Number(userRedemptions?.count || 0) >= coupon.perUserLimit) {
        throw new ApiException(
          'Coupon per-user limit reached',
          HttpStatus.BAD_REQUEST,
          'COUPON_USER_LIMIT_REACHED'
        );
      }
    }

    // 9. Calculate discount and payable cents server-side
    const discountCents = calculateDiscountCents(
      subtotalCents,
      coupon.discountType as CouponDiscountType,
      coupon.discountValue,
      coupon.maxDiscountAmountCents
    );
    const payableCents = Math.max(0, subtotalCents - discountCents);

    return {
      code: coupon.code,
      courseId: course.id,
      discountType: coupon.discountType as CouponDiscountType,
      discountValue: coupon.discountValue,
      subtotalCents,
      originalPriceCents: subtotalCents,
      discountCents,
      payableCents,
      isValid: true,
      message: 'Coupon is valid and applied to preview',
    };
  }

  /**
   * Create a new coupon (Admin only).
   */
  async createCoupon(
    input: CreateCouponRequest,
    adminId: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<CouponDto> {
    const normalizedCode = input.code.trim().toUpperCase();

    // Check code uniqueness case-insensitively
    const [existing] = await this.db
      .select()
      .from(coupons)
      .where(eq(coupons.code, normalizedCode))
      .limit(1);

    if (existing) {
      throw new ApiException(
        'Coupon code already exists',
        HttpStatus.CONFLICT,
        'COUPON_CODE_ALREADY_EXISTS'
      );
    }

    let courseTitle: string | null = null;
    if (input.courseId) {
      const [course] = await this.db
        .select()
        .from(courses)
        .where(eq(courses.id, input.courseId))
        .limit(1);

      if (!course) {
        throw new ApiException(
          'Referenced course not found',
          HttpStatus.BAD_REQUEST,
          'COURSE_NOT_FOUND'
        );
      }
      courseTitle = course.title;
    }

    const startsAt = new Date(input.startsAt);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    if (expiresAt && expiresAt <= startsAt) {
      throw new ApiException(
        'Expiration date must be after start date',
        HttpStatus.BAD_REQUEST,
        'COUPON_INVALID'
      );
    }

    const [created] = await this.db
      .insert(coupons)
      .values({
        code: normalizedCode,
        discountType: input.discountType,
        discountValue: input.discountValue,
        minOrderAmountCents: input.minOrderAmountCents ?? 0,
        maxDiscountAmountCents: input.maxDiscountAmountCents ?? null,
        courseId: input.courseId ?? null,
        usageLimit: input.usageLimit ?? null,
        perUserLimit: input.perUserLimit ?? 1,
        startsAt,
        expiresAt,
        isActive: input.isActive ?? true,
        createdBy: adminId,
      })
      .returning();

    await this.auditService.record({
      actorId: adminId,
      action: 'COUPON_CREATED',
      targetType: 'coupon',
      targetId: created.id,
      metadata: {
        code: created.code,
        discountType: created.discountType,
        discountValue: created.discountValue,
        courseId: created.courseId,
      },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return formatCouponDto(created, courseTitle);
  }

  /**
   * Retrieve single coupon details by ID (Admin only).
   */
  async getCouponById(id: string): Promise<CouponDto> {
    const [row] = await this.db
      .select({
        coupon: coupons,
        courseTitle: courses.title,
      })
      .from(coupons)
      .leftJoin(courses, eq(coupons.courseId, courses.id))
      .where(eq(coupons.id, id))
      .limit(1);

    if (!row) {
      throw new ApiException('Coupon not found', HttpStatus.NOT_FOUND, 'COUPON_NOT_FOUND');
    }

    return formatCouponDto(row.coupon, row.courseTitle);
  }

  /**
   * Paginated list of coupons with optional filtering (Admin only).
   */
  async listCoupons(query: CouponListQuery): Promise<PaginatedCouponsData> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query.isActive !== undefined) {
      conditions.push(eq(coupons.isActive, query.isActive));
    }

    if (query.courseId) {
      conditions.push(eq(coupons.courseId, query.courseId));
    }

    if (query.search) {
      conditions.push(ilike(coupons.code, `%${query.search.trim()}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ total: count() })
      .from(coupons)
      .where(whereClause);

    const total = Number(countResult?.total || 0);
    const totalPages = Math.ceil(total / limit);

    const rows = await this.db
      .select({
        coupon: coupons,
        courseTitle: courses.title,
      })
      .from(coupons)
      .leftJoin(courses, eq(coupons.courseId, courses.id))
      .where(whereClause)
      .orderBy(desc(coupons.createdAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map((r) => formatCouponDto(r.coupon, r.courseTitle));

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
   * Update safe coupon attributes (Admin only).
   */
  async updateCoupon(
    id: string,
    input: UpdateCouponRequest,
    adminId: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<CouponDto> {
    const [existing] = await this.db
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    if (!existing) {
      throw new ApiException('Coupon not found', HttpStatus.NOT_FOUND, 'COUPON_NOT_FOUND');
    }

    // Safety: usage limit cannot be lowered below current redemption count
    if (input.usageLimit != null && input.usageLimit < existing.redemptionCount) {
      throw new ApiException(
        'Cannot set usage limit lower than current redemption count',
        HttpStatus.BAD_REQUEST,
        'COUPON_INVALID'
      );
    }

    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    const expiresAt =
      input.expiresAt !== undefined
        ? input.expiresAt
          ? new Date(input.expiresAt)
          : null
        : existing.expiresAt;

    if (expiresAt && expiresAt <= startsAt) {
      throw new ApiException(
        'Expiration date must be after start date',
        HttpStatus.BAD_REQUEST,
        'COUPON_INVALID'
      );
    }

    const updateData: Partial<typeof coupons.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.minOrderAmountCents !== undefined) {
      updateData.minOrderAmountCents = input.minOrderAmountCents;
    }
    if (input.maxDiscountAmountCents !== undefined) {
      updateData.maxDiscountAmountCents = input.maxDiscountAmountCents;
    }
    if (input.usageLimit !== undefined) {
      updateData.usageLimit = input.usageLimit;
    }
    if (input.perUserLimit !== undefined) {
      updateData.perUserLimit = input.perUserLimit;
    }
    if (input.startsAt !== undefined) {
      updateData.startsAt = startsAt;
    }
    if (input.expiresAt !== undefined) {
      updateData.expiresAt = expiresAt;
    }
    if (input.isActive !== undefined) {
      updateData.isActive = input.isActive;
    }

    const [updated] = await this.db
      .update(coupons)
      .set(updateData)
      .where(eq(coupons.id, id))
      .returning();

    await this.auditService.record({
      actorId: adminId,
      action: 'COUPON_UPDATED',
      targetType: 'coupon',
      targetId: updated.id,
      metadata: {
        updates: input,
      },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    let courseTitle: string | null = null;
    if (updated.courseId) {
      const [c] = await this.db
        .select({ title: courses.title })
        .from(courses)
        .where(eq(courses.id, updated.courseId))
        .limit(1);
      courseTitle = c?.title ?? null;
    }

    return formatCouponDto(updated, courseTitle);
  }

  /**
   * Soft-delete / disable coupon (Admin only).
   * Sets isActive = false without hard-deleting database records.
   */
  async softDeleteCoupon(
    id: string,
    adminId: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<CouponDto> {
    const [existing] = await this.db
      .select()
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    if (!existing) {
      throw new ApiException('Coupon not found', HttpStatus.NOT_FOUND, 'COUPON_NOT_FOUND');
    }

    const [updated] = await this.db
      .update(coupons)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, id))
      .returning();

    await this.auditService.record({
      actorId: adminId,
      action: 'COUPON_DISABLED',
      targetType: 'coupon',
      targetId: updated.id,
      metadata: {
        code: updated.code,
      },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    let courseTitle: string | null = null;
    if (updated.courseId) {
      const [c] = await this.db
        .select({ title: courses.title })
        .from(courses)
        .where(eq(courses.id, updated.courseId))
        .limit(1);
      courseTitle = c?.title ?? null;
    }

    return formatCouponDto(updated, courseTitle);
  }
}
