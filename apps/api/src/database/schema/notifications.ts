import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const notificationCategoryEnum = pgEnum('notification_category', [
  'TRANSACTIONAL',
  'ACADEMIC',
  'SYSTEM',
]);

export const deliveryChannelEnum = pgEnum('delivery_channel', [
  'EMAIL',
  'IN_APP',
  'SMS',
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'PENDING',
  'DELIVERED',
  'FAILED',
]);

export const outboxStatusEnum = pgEnum('outbox_status', [
  'PENDING',
  'PUBLISHED',
  'FAILED',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    category: notificationCategoryEnum('category').default('TRANSACTIONAL').notNull(),
    actionUrl: text('action_url'),
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notifications_user_id_idx').on(table.userId),
    index('notifications_user_is_read_idx').on(table.userId, table.isRead),
    index('notifications_user_created_at_idx').on(table.userId, table.createdAt),
  ]
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    emailOrderUpdates: boolean('email_order_updates').default(true).notNull(),
    emailCourseUpdates: boolean('email_course_updates').default(true).notNull(),
    emailPromotions: boolean('email_promotions').default(false).notNull(),
    inAppAll: boolean('in_app_all').default(true).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('notification_preferences_user_id_uq').on(table.userId),
    index('notification_preferences_user_id_idx').on(table.userId),
  ]
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'set null',
    }),
    channel: deliveryChannelEnum('channel').notNull(),
    status: deliveryStatusEnum('status').default('PENDING').notNull(),
    recipient: varchar('recipient', { length: 255 }).notNull(),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    attemptCount: integer('attempt_count').default(1).notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notification_deliveries_notification_id_idx').on(table.notificationId),
    index('notification_deliveries_status_idx').on(table.status),
    index('notification_deliveries_created_at_idx').on(table.createdAt),
  ]
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: varchar('event_id', { length: 100 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    entityId: varchar('entity_id', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    payload: text('payload').notNull(),
    status: outboxStatusEnum('status').default('PENDING').notNull(),
    retryCount: integer('retry_count').default(0).notNull(),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('outbox_events_event_id_uq').on(table.eventId),
    index('outbox_events_status_created_at_idx').on(table.status, table.createdAt),
  ]
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
