import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orders } from './orders';
import { payments } from './payments';
import { users } from './users';

// --- ENUMS ---
export const refundStatusEnum = pgEnum('refund_status', ['PENDING', 'PROCESSED', 'FAILED']);

// --- REFUNDS TABLE ---
export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    refundNumber: varchar('refund_number', { length: 50 }).notNull(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    paymentId: uuid('payment_id')
      .references(() => payments.id, { onDelete: 'restrict' })
      .notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    reason: text('reason').notNull(),
    status: refundStatusEnum('status').default('PENDING').notNull(),
    processedBy: uuid('processed_by').references(() => users.id, { onDelete: 'restrict' }),
    providerRefundRef: varchar('provider_refund_ref', { length: 100 }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('refunds_refund_number_uq').on(table.refundNumber),
    uniqueIndex('refunds_order_id_uq').on(table.orderId),
    index('refunds_payment_id_idx').on(table.paymentId),
    index('refunds_processed_by_idx').on(table.processedBy),
    index('refunds_status_idx').on(table.status),
    check('refunds_amount_cents_non_negative', sql`"amount_cents" >= 0`),
    check('refunds_currency_bdt', sql`"currency" = 'BDT'`),
    check('refunds_reason_non_empty', sql`length(trim("reason")) >= 5`),
  ]
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
