import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { courses } from './courses';

// --- ENUMS ---
export const couponDiscountTypeEnum = pgEnum('coupon_discount_type', [
  'PERCENTAGE',
  'FIXED_AMOUNT',
]);

// --- COUPONS TABLE ---
export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull(),
    discountType: couponDiscountTypeEnum('discount_type').notNull(),
    discountValue: integer('discount_value').notNull(),
    minOrderAmountCents: integer('min_order_amount_cents').default(0).notNull(),
    maxDiscountAmountCents: integer('max_discount_amount_cents'),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    usageLimit: integer('usage_limit'),
    redemptionCount: integer('redemption_count').default(0).notNull(),
    perUserLimit: integer('per_user_limit').default(1).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('coupons_code_uq').on(table.code),
    index('coupons_active_window_idx').on(table.isActive, table.startsAt, table.expiresAt),
    index('coupons_course_id_idx').on(table.courseId),
    check('coupons_discount_value_positive', sql`"discount_value" > 0`),
    check('coupons_min_order_amount_non_negative', sql`"min_order_amount_cents" >= 0`),
    check(
      'coupons_max_discount_amount_positive',
      sql`"max_discount_amount_cents" IS NULL OR "max_discount_amount_cents" > 0`
    ),
    check('coupons_usage_limit_positive', sql`"usage_limit" IS NULL OR "usage_limit" > 0`),
    check('coupons_redemption_count_non_negative', sql`"redemption_count" >= 0`),
    check('coupons_per_user_limit_positive', sql`"per_user_limit" > 0`),
  ]
);

export type Coupon = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;
