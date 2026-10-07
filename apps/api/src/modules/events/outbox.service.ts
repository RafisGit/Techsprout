import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { outboxEvents } from '../../database/schema';
import { DomainEvent, DomainEventType } from './domain-event.interface';
import { NotificationQueueService } from '../notifications/notification-queue.service';

export interface EmitEventOptions<T = Record<string, unknown>> {
  eventType: DomainEventType;
  entityType: string;
  entityId: string;
  payload: T;
  actorUserId?: string;
  targetUserId?: string;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(NotificationQueueService) private readonly notificationQueueService: NotificationQueueService
  ) {}

  /**
   * Durable event dispatch:
   * 1. Persists event in Postgres outbox table (with status PENDING).
   * 2. Asynchronously enqueues job into BullMQ notifications queue.
   * 3. Marks outbox record as PUBLISHED once enqueued.
   */
  async emit<T = Record<string, unknown>>(options: EmitEventOptions<T>): Promise<DomainEvent<T>> {
    const eventId = crypto.randomUUID();
    const event: DomainEvent<T> = {
      eventId,
      eventType: options.eventType,
      occurredAt: new Date().toISOString(),
      actorUserId: options.actorUserId,
      targetUserId: options.targetUserId,
      entityId: options.entityId,
      entityType: options.entityType,
      payload: options.payload,
      version: 1,
    };

    // 1. Persist to outbox table
    try {
      await this.db.insert(outboxEvents).values({
        eventId,
        eventType: options.eventType,
        actorId: options.actorUserId || null,
        entityId: options.entityId,
        entityType: options.entityType,
        payload: JSON.stringify(options.payload),
        status: 'PENDING',
      });
    } catch (err: any) {
      this.logger.error(`Failed to persist outbox event (${eventId}): ${err.message}`);
      // Continue dispatch even if outbox table insert had an issue (defense-in-depth)
    }

    // 2. Enqueue into BullMQ notification queue
    try {
      await this.notificationQueueService.enqueueNotificationJob(event as DomainEvent);

      // 3. Mark as PUBLISHED
      await this.db
        .update(outboxEvents)
        .set({
          status: 'PUBLISHED',
          publishedAt: new Date(),
        })
        .where(eq(outboxEvents.eventId, eventId));

      this.logger.log(`[OUTBOX_PUBLISHED] eventId=${eventId} type=${options.eventType}`);
    } catch (err: any) {
      this.logger.error(`Failed to enqueue outbox event (${eventId}): ${err.message}`);
      await this.db
        .update(outboxEvents)
        .set({
          status: 'FAILED',
          lastError: err.message,
          retryCount: sql`${outboxEvents.retryCount} + 1`,
        })
        .where(eq(outboxEvents.eventId, eventId));
    }

    return event;
  }
}
