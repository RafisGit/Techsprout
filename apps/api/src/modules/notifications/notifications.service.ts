import { Injectable, Inject, HttpStatus, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  notifications,
  notificationPreferences,
  notificationDeliveries,
  Notification,
  users,
} from '../../database/schema';
import {
  NotificationCategory,
  NotificationDto,
  PaginatedNotificationsData,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesRequest,
  NotificationListQuery,
} from '@techsprout/contracts';
import { DomainEvent } from '../events/domain-event.interface';
import { EMAIL_PROVIDER, EmailProvider } from './interfaces/email-provider.interface';
import { emailTemplates } from './templates/email-templates';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * List paginated notifications for the authenticated user.
   */
  async getNotifications(
    userId: string,
    query: NotificationListQuery
  ): Promise<PaginatedNotificationsData> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(notifications.userId, userId)];

    if (query.category) {
      conditions.push(eq(notifications.category, query.category));
    }

    if (query.isRead !== undefined) {
      conditions.push(eq(notifications.isRead, query.isRead));
    }

    const whereClause = and(...conditions);

    const [items, [totalRecord], [unreadRecord]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(whereClause)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(notifications)
        .where(whereClause),
      this.db
        .select({ unread: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
    ]);

    const total = Number(totalRecord?.total || 0);
    const unreadCount = Number(unreadRecord?.unread || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map(this.mapToDto),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      unreadCount,
    };
  }

  /**
   * Return unread count for user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [res] = await this.db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    return Number(res?.count || 0);
  }

  /**
   * Mark a single notification as read with strict ownership enforcement.
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const [notification] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!notification) {
      throw new ApiException('Notification not found', HttpStatus.NOT_FOUND, 'NOTIFICATION_NOT_FOUND');
    }

    if (notification.userId !== userId) {
      await this.auditService.record({
        actorId: userId,
        action: 'UNAUTHORIZED_NOTIFICATION_ACCESS',
        targetType: 'NOTIFICATION',
        targetId: notificationId,
        metadata: { attemptedAction: 'MARK_AS_READ' },
      });
      throw new ApiException(
        'Access denied: you cannot modify notifications that do not belong to you',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    if (notification.isRead) {
      return this.mapToDto(notification);
    }

    const [updated] = await this.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(notifications.id, notificationId))
      .returning();

    return this.mapToDto(updated);
  }

  /**
   * Mark all unread notifications for a user as read.
   */
  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await this.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });

    return { updatedCount: result.length };
  }

  /**
   * Retrieve notification preferences for a user, creating defaults if not existing.
   */
  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const [existing] = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (existing) {
      return {
        id: existing.id,
        userId: existing.userId,
        emailOrderUpdates: existing.emailOrderUpdates,
        emailCourseUpdates: existing.emailCourseUpdates,
        emailPromotions: existing.emailPromotions,
        inAppAll: existing.inAppAll,
        updatedAt: existing.updatedAt.toISOString(),
      };
    }

    // Insert default preferences (all enabled, except promotions false)
    const [created] = await this.db
      .insert(notificationPreferences)
      .values({
        userId,
        emailOrderUpdates: true,
        emailCourseUpdates: true,
        emailPromotions: false,
        inAppAll: true,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { updatedAt: new Date() },
      })
      .returning();

    return {
      id: created.id,
      userId: created.userId,
      emailOrderUpdates: created.emailOrderUpdates,
      emailCourseUpdates: created.emailCourseUpdates,
      emailPromotions: created.emailPromotions,
      inAppAll: created.inAppAll,
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * Update notification preferences with strict field whitelisting.
   */
  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesRequest
  ): Promise<NotificationPreferencesDto> {
    // Ensure row exists
    await this.getPreferences(userId);

    const updateFields: Partial<typeof notificationPreferences.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.emailCourseUpdates !== undefined) updateFields.emailCourseUpdates = dto.emailCourseUpdates;
    if (dto.emailPromotions !== undefined) updateFields.emailPromotions = dto.emailPromotions;
    if (dto.inAppAll !== undefined) updateFields.inAppAll = dto.inAppAll;

    const [updated] = await this.db
      .update(notificationPreferences)
      .set(updateFields)
      .where(eq(notificationPreferences.userId, userId))
      .returning();

    return {
      id: updated.id,
      userId: updated.userId,
      emailOrderUpdates: updated.emailOrderUpdates,
      emailCourseUpdates: updated.emailCourseUpdates,
      emailPromotions: updated.emailPromotions,
      inAppAll: updated.inAppAll,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Process an incoming domain event: idempotency check, preference resolution,
   * in-app notification creation, email dispatch, and delivery tracking.
   */
  async processNotificationEvent(event: DomainEvent): Promise<{
    processed: boolean;
    notificationId?: string;
    duplicate?: boolean;
    inAppSuppressed?: boolean;
  }> {
    const targetUserId =
      event.targetUserId ||
      (event.payload as any)?.userId ||
      (event.payload as any)?.studentId ||
      event.actorUserId;

    if (!targetUserId) {
      this.logger.warn(`[NOTIFICATION_SKIPPED] Event ${event.eventType} (${event.eventId}) has no target user.`);
      return { processed: false };
    }

    // 1. Resolve user preferences
    const prefs = await this.getPreferences(targetUserId);

    // 2. Fetch user recipient details (email)
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!user) {
      this.logger.warn(`[NOTIFICATION_SKIPPED] User ${targetUserId} not found in database.`);
      return { processed: false };
    }

    // 3. Resolve notification content & template
    const content = this.resolveEventContent(event);
    if (!content) {
      this.logger.log(`[NOTIFICATION_INFO] Event ${event.eventType} does not map to a user notification.`);
      return { processed: false };
    }

    let createdNotificationId: string | undefined;
    let isDuplicate = false;

    // 4. In-App Notification (Idempotent by checking eventId in metadata or delivery)
    if (prefs.inAppAll) {
      // Check if duplicate in-app delivery exists
      const [existingDelivery] = await this.db
        .select({ id: notificationDeliveries.id, notificationId: notificationDeliveries.notificationId })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.recipient, targetUserId),
            eq(notificationDeliveries.channel, 'IN_APP'),
            eq(notificationDeliveries.providerMessageId, event.eventId)
          )
        )
        .limit(1);

      if (!existingDelivery) {
        const [notif] = await this.db
          .insert(notifications)
          .values({
            userId: targetUserId,
            title: content.title,
            message: content.message,
            category: content.category,
            actionUrl: content.actionUrl,
            metadata: JSON.stringify({ eventId: event.eventId, eventType: event.eventType }),
          })
          .returning();

        createdNotificationId = notif.id;

        await this.db.insert(notificationDeliveries).values({
          notificationId: notif.id,
          channel: 'IN_APP',
          status: 'DELIVERED',
          recipient: targetUserId,
          providerMessageId: event.eventId,
          attemptCount: 1,
        });

        this.logger.log(`[IN_APP_CREATED] id=${notif.id} user=${targetUserId} title="${content.title}"`);
      } else {
        isDuplicate = true;
        createdNotificationId = existingDelivery.notificationId || undefined;
        this.logger.log(`[IN_APP_IDEMPOTENT_SKIP] Event ${event.eventId} already created in-app notification.`);
      }
    }

    // 5. Transactional Email Dispatch
    const isEmailPermitted =
      content.category === 'TRANSACTIONAL'
        ? prefs.emailOrderUpdates // Transactional order/refund emails
        : prefs.emailCourseUpdates; // Academic & course update emails

    if (isEmailPermitted && content.emailTemplate && user.email) {
      // Check if email delivery already performed for this eventId
      const [existingEmailDelivery] = await this.db
        .select({ id: notificationDeliveries.id })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.recipient, user.email),
            eq(notificationDeliveries.channel, 'EMAIL'),
            eq(notificationDeliveries.providerMessageId, event.eventId)
          )
        )
        .limit(1);

      if (!existingEmailDelivery) {
        const emailResult = await this.emailProvider.sendEmail({
          to: user.email,
          subject: content.emailTemplate.subject,
          html: content.emailTemplate.html,
          text: content.emailTemplate.text,
        });

        await this.db.insert(notificationDeliveries).values({
          notificationId: createdNotificationId || null,
          channel: 'EMAIL',
          status: emailResult.success ? 'DELIVERED' : 'FAILED',
          recipient: user.email,
          providerMessageId: emailResult.messageId || event.eventId,
          lastError: emailResult.error || null,
          attemptCount: 1,
        });

        if (emailResult.success) {
          this.logger.log(`[EMAIL_SENT] to=${user.email} subject="${content.emailTemplate.subject}"`);
        } else {
          this.logger.warn(`[EMAIL_FAILED] to=${user.email} error="${emailResult.error}"`);
        }
      } else {
        this.logger.log(`[EMAIL_IDEMPOTENT_SKIP] Event ${event.eventId} already emailed to ${user.email}.`);
      }
    }

    return {
      processed: true,
      notificationId: createdNotificationId,
      duplicate: isDuplicate,
      inAppSuppressed: !prefs.inAppAll,
    };
  }

  private resolveEventContent(event: DomainEvent): {
    title: string;
    message: string;
    category: NotificationCategory;
    actionUrl?: string;
    emailTemplate?: { subject: string; html: string; text: string };
  } | null {
    const payload = (event.payload || {}) as Record<string, any>;

    switch (event.eventType) {
      case 'OrderPlaced': {
        const orderNumber = payload.orderNumber || event.entityId;
        const amountCents = payload.amountCents || payload.totalAmountCents || 0;
        const currency = payload.currency || 'BDT';
        return {
          title: `Order Placed: #${orderNumber}`,
          message: `Your order #${orderNumber} has been received. Complete payment to access your courses.`,
          category: 'TRANSACTIONAL',
          actionUrl: `/orders`,
          emailTemplate: emailTemplates.orderPlaced({ orderNumber, amountCents, currency }),
        };
      }

      case 'OrderPaid': {
        const orderNumber = payload.orderNumber || event.entityId;
        const amountCents = payload.amountCents || payload.totalAmountCents || 0;
        const currency = payload.currency || 'BDT';
        return {
          title: `Payment Confirmed: #${orderNumber}`,
          message: `Your payment for order #${orderNumber} has been verified. Your enrollment is now active.`,
          category: 'TRANSACTIONAL',
          actionUrl: `/learning`,
          emailTemplate: emailTemplates.orderPaid({ orderNumber, amountCents, currency }),
        };
      }

      case 'RefundRequested': {
        const orderNumber = payload.orderNumber || event.entityId;
        const reason = payload.reason || 'Requested by student';
        return {
          title: `Refund Request Submitted`,
          message: `Your refund request for order #${orderNumber} has been submitted for review.`,
          category: 'TRANSACTIONAL',
          actionUrl: `/orders`,
          emailTemplate: emailTemplates.refundRequested({ orderNumber, reason }),
        };
      }

      case 'RefundApproved': {
        const orderNumber = payload.orderNumber || event.entityId;
        const amountCents = payload.amountCents || payload.refundAmountCents || 0;
        return {
          title: `Refund Approved`,
          message: `Your refund request for order #${orderNumber} has been approved.`,
          category: 'TRANSACTIONAL',
          actionUrl: `/orders`,
          emailTemplate: emailTemplates.refundApproved({ orderNumber, amountCents }),
        };
      }

      case 'RefundRejected': {
        const orderNumber = payload.orderNumber || event.entityId;
        const reason = payload.reason || payload.rejectionReason || 'Does not meet refund criteria';
        return {
          title: `Refund Request Update`,
          message: `Your refund request for order #${orderNumber} was not approved.`,
          category: 'TRANSACTIONAL',
          actionUrl: `/orders`,
          emailTemplate: emailTemplates.refundRejected({ orderNumber, reason }),
        };
      }

      case 'RefundSettled': {
        const orderNumber = payload.orderNumber || event.entityId;
        const amountCents = payload.amountCents || payload.refundAmountCents || 0;
        return {
          title: `Refund Settled`,
          message: `Your refund for order #${orderNumber} has been settled.`,
          category: 'TRANSACTIONAL',
          actionUrl: `/orders`,
          emailTemplate: emailTemplates.refundSettled({ orderNumber, amountCents }),
        };
      }

      case 'EnrollmentCreated': {
        const courseTitle = payload.courseTitle || 'New Course';
        const courseId = payload.courseId || event.entityId;
        return {
          title: `Enrollment Confirmed: ${courseTitle}`,
          message: `You are enrolled in "${courseTitle}". Start learning now!`,
          category: 'ACADEMIC',
          actionUrl: `/learning/${courseId}`,
          emailTemplate: emailTemplates.enrollmentCreated({ courseTitle }),
        };
      }

      case 'CertificateIssued': {
        const courseTitle = payload.courseTitle || 'Course';
        const certificateNumber = payload.certificateNumber || event.entityId;
        return {
          title: `Certificate Issued: ${courseTitle}`,
          message: `Congratulations! Your certificate #${certificateNumber} has been issued.`,
          category: 'ACADEMIC',
          actionUrl: `/certificates/${certificateNumber}`,
          emailTemplate: emailTemplates.certificateIssued({ courseTitle, certificateNumber }),
        };
      }

      case 'CourseSubmittedForReview':
        return {
          title: `Course Submitted for Review`,
          message: `Your course "${payload.title || event.entityId}" was submitted for administrative review.`,
          category: 'SYSTEM',
          actionUrl: `/courses/${event.entityId}`,
        };

      case 'CourseApproved':
        return {
          title: `Course Approved & Published`,
          message: `Congratulations! Your course "${payload.title || event.entityId}" was approved.`,
          category: 'SYSTEM',
          actionUrl: `/courses/${event.entityId}`,
        };

      case 'CourseRejected':
        return {
          title: `Course Review Feedback`,
          message: `Your course "${payload.title || event.entityId}" requires adjustments before publication.`,
          category: 'SYSTEM',
          actionUrl: `/courses/${event.entityId}`,
        };

      default:
        return null;
    }
  }

  private mapToDto(entity: Notification): NotificationDto {
    return {
      id: entity.id,
      userId: entity.userId,
      title: entity.title,
      message: entity.message,
      category: entity.category as NotificationCategory,
      actionUrl: entity.actionUrl || null,
      isRead: entity.isRead,
      readAt: entity.readAt ? entity.readAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
