import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { coupons } from './coupons';
import { users } from './users';
import { orders } from './orders';

// --- ENUMS ---
export const couponRedemptionStatusEnum = pgEnum('coupon_redemption_status', [
  'RESERVED',
  'CONSUMED',
  'RELEASED',
]);

// --- COUPON REDEMPTIONS TABLE ---
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    couponId: uuid('coupon_id')
      .references(() => coupons.id, { onDelete: 'restrict' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    status: couponRedemptionStatusEnum('status').default('RESERVED').notNull(),
    discountCents: integer('discount_cents').notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true }).defaultNow().notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('coupon_redemptions_order_id_uq').on(table.orderId),
    index('coupon_redemptions_user_coupon_idx').on(table.userId, table.couponId),
    index('coupon_redemptions_coupon_status_idx').on(table.couponId, table.status),
    index('coupon_redemptions_order_id_idx').on(table.orderId),
    check('coupon_redemptions_discount_cents_non_negative', sql`"discount_cents" >= 0`),
  ]
);

export type CouponRedemption = typeof couponRedemptions.$inferSelect;
export type NewCouponRedemption = typeof couponRedemptions.$inferInsert;
