import { pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('categories_name_uq').on(table.name),
    uniqueIndex('categories_slug_uq').on(table.slug),
    index('categories_is_active_idx').on(table.isActive),
  ]
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
