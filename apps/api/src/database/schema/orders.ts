import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { courses } from './courses';
import { coupons } from './coupons';

// --- ENUMS ---
export const orderStatusEnum = pgEnum('order_status', [
  'PENDING',
  'PAYMENT_PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
]);

// --- ORDERS TABLE ---
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNumber: varchar('order_number', { length: 50 }).notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    status: orderStatusEnum('status').default('PENDING').notNull(),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').default(0).notNull(),
    payableCents: integer('payable_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    couponId: uuid('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
    couponCode: varchar('coupon_code', { length: 50 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('orders_order_number_uq').on(table.orderNumber),
    index('orders_student_status_idx').on(table.studentId, table.status),
    index('orders_created_at_idx').on(table.createdAt),
    index('orders_status_idx').on(table.status),
    check('orders_subtotal_cents_non_negative', sql`"subtotal_cents" >= 0`),
    check('orders_discount_cents_non_negative', sql`"discount_cents" >= 0`),
    check('orders_payable_cents_non_negative', sql`"payable_cents" >= 0`),
    check('orders_payable_lte_subtotal', sql`"payable_cents" <= "subtotal_cents"`),
  ]
);

// --- ORDER ITEMS TABLE ---
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'restrict' })
      .notNull(),
    courseTitle: varchar('course_title', { length: 250 }).notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    discountCents: integer('discount_cents').default(0).notNull(),
    payableCents: integer('payable_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('order_items_order_course_uq').on(table.orderId, table.courseId),
    index('order_items_course_id_idx').on(table.courseId),
    index('order_items_order_id_idx').on(table.orderId),
    check('order_items_unit_price_cents_non_negative', sql`"unit_price_cents" >= 0`),
    check('order_items_discount_cents_non_negative', sql`"discount_cents" >= 0`),
    check('order_items_payable_cents_non_negative', sql`"payable_cents" >= 0`),
    check('order_items_payable_lte_unit_price', sql`"payable_cents" <= "unit_price_cents"`),
  ]
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
