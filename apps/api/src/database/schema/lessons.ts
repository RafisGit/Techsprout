import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { modules } from './modules';
import { media } from './media';

export const lessonTypeEnum = pgEnum('lesson_type', ['VIDEO', 'TEXT', 'PDF']);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .references(() => modules.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    lessonType: lessonTypeEnum('lesson_type').default('VIDEO').notNull(),
    position: integer('position').notNull(),
    durationSeconds: integer('duration_seconds').default(0).notNull(),
    isPreview: boolean('is_preview').default(false).notNull(),
    mediaId: uuid('media_id').references(() => media.id, { onDelete: 'set null' }),
    content: text('content'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('lessons_module_position_uq').on(table.moduleId, table.position),
    index('lessons_module_id_idx').on(table.moduleId),
    index('lessons_is_preview_idx').on(table.isPreview),
  ]
);

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
