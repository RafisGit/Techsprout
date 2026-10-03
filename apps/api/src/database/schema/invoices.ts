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
import { orders } from './orders';
import { users } from './users';

// --- ENUMS ---
export const invoiceStatusEnum = pgEnum('invoice_status', ['PAID', 'REFUNDED', 'VOID']);

// --- INVOICES TABLE ---
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    studentName: varchar('student_name', { length: 150 }).notNull(),
    studentEmail: varchar('student_email', { length: 255 }).notNull(),
    studentPhone: varchar('student_phone', { length: 50 }),
    courseTitle: varchar('course_title', { length: 250 }).notNull(),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').default(0).notNull(),
    payableCents: integer('payable_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
    bankTranId: varchar('bank_tran_id', { length: 100 }).notNull(),
    status: invoiceStatusEnum('status').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('invoices_invoice_number_uq').on(table.invoiceNumber),
    uniqueIndex('invoices_order_id_uq').on(table.orderId),
    index('invoices_student_id_idx').on(table.studentId),
    check('invoices_subtotal_cents_non_negative', sql`"subtotal_cents" >= 0`),
    check('invoices_discount_cents_non_negative', sql`"discount_cents" >= 0`),
    check('invoices_payable_cents_non_negative', sql`"payable_cents" >= 0`),
    check('invoices_payable_lte_subtotal', sql`"payable_cents" <= "subtotal_cents"`),
  ]
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
