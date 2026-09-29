import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { courses } from './courses';

export const modules = pgTable(
  'modules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('modules_course_position_uq').on(table.courseId, table.position),
    index('modules_course_id_idx').on(table.courseId),
  ]
);

export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
