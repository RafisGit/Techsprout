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

// --- ENUMS ---
export const paymentStatusEnum = pgEnum('payment_status', [
  'INITIATED',
  'VALIDATED',
  'FAILED',
  'CANCELLED',
]);

// --- PAYMENTS TABLE ---
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    merchantTranId: varchar('merchant_tran_id', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 50 }).default('SSLCOMMERZ').notNull(),
    providerSessionKey: varchar('provider_session_key', { length: 255 }),
    valId: varchar('val_id', { length: 100 }),
    bankTranId: varchar('bank_tran_id', { length: 100 }),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    status: paymentStatusEnum('status').default('INITIATED').notNull(),
    cardType: varchar('card_type', { length: 50 }),
    cardBrand: varchar('card_brand', { length: 50 }),
    gatewayFeeCents: integer('gateway_fee_cents'),
    initiatedAt: timestamp('initiated_at', { withTimezone: true }).defaultNow().notNull(),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    rawResponse: text('raw_response'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('payments_merchant_tran_id_uq').on(table.merchantTranId),
    uniqueIndex('payments_val_id_uq')
      .on(table.valId)
      .where(sql`"val_id" IS NOT NULL`),
    index('payments_order_status_idx').on(table.orderId, table.status),
    index('payments_order_id_idx').on(table.orderId),
    check('payments_amount_cents_non_negative', sql`"amount_cents" >= 0`),
    check(
      'payments_gateway_fee_cents_non_negative',
      sql`"gateway_fee_cents" IS NULL OR "gateway_fee_cents" >= 0`
    ),
  ]
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
