import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { courses } from './courses';
import { modules } from './modules';
import { lessons } from './lessons';

/**
 * Append-only learning events table for pedagogical telemetry and retention curves.
 * Governed by ADR-P7-001 and WP-P7-01 privacy specifications.
 * 
 * Privacy Invariants:
 * 1. user_id stores a pseudonymous HMAC-SHA256 hash using a daily rotating UTC salt.
 * 2. Never stores raw user IDs, emails, credentials, or search query strings.
 * 3. Deliberately omits a foreign key to `users` to prevent cascade locks and preserve privacy upon erasure.
 * 4. metadata JSONB is strictly allowlisted to approved quantitative metrics.
 */
export const learningEvents = pgTable(
  'learning_events',
  {
    id: uuid('id').primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('learning_events_course_occurred_idx').on(table.courseId, table.occurredAt),
    index('learning_events_user_occurred_idx').on(table.userId, table.occurredAt),
    index('learning_events_lesson_event_idx').on(table.lessonId, table.eventType),
    index('learning_events_event_type_occurred_idx').on(table.eventType, table.occurredAt),
  ]
);

export type LearningEvent = typeof learningEvents.$inferSelect;
export type NewLearningEvent = typeof learningEvents.$inferInsert;
