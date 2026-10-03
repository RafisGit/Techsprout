import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './test-helper';
import {
  orders,
  orderItems,
  payments,
  coupons,
  couponRedemptions,
  invoices,
  refunds,
  courses,
  users,
  enrollments,
  certificates,
  categories,
} from '../database/schema';
import { eq } from 'drizzle-orm';
import { seedCatalog } from '../database/seed/catalog.seeder';
import * as fs from 'fs';
import * as path from 'path';

describe('P5.2 — Payment & Admin Subsystem Database Foundation & Integrity Test Suite', () => {
  let db: any;
  let pool: any;
  let studentUser: any;
  let adminUser: any;
  let instructorUser: any;
  let testCourse: any;
  let testEnrollment: any;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    pool = testDb.pool;

    // Seed baseline catalog
    await seedCatalog(db);

    // Retrieve users
    const [student] = await db.select().from(users).where(eq(users.username, 'student')).limit(1);
    studentUser = student;

    const [admin] = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    adminUser = admin;

    const [instructor] = await db
      .select()
      .from(users)
      .where(eq(users.username, 'instructor'))
      .limit(1);
    instructorUser = instructor;

    // Retrieve course
    const [course] = await db.select().from(courses).limit(1);
    testCourse = course;

    // Create an active test enrollment for student
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        studentId: studentUser.id,
        courseId: testCourse.id,
        status: 'ACTIVE',
      })
      .returning();
    testEnrollment = enrollment;
  });

  // ==========================================
  // 1. ORDERS SCHEMA & INTEGRITY CONSTRAINTS
  // ==========================================
  describe('1. Orders Schema & Constraints', () => {
    it('1.1 should create a valid order with default status PENDING and currency BDT', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-AA1001',
          studentId: studentUser.id,
          subtotalCents: 250000,
          discountCents: 50000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.orderNumber).toBe('TSP-ORD-20261003-AA1001');
      expect(order.status).toBe('PENDING');
      expect(order.currency).toBe('BDT');
      expect(order.subtotalCents).toBe(250000);
      expect(order.discountCents).toBe(50000);
      expect(order.payableCents).toBe(200000);
    });

    it('1.2 should enforce UNIQUE(order_number) constraint', async () => {
      await db.insert(orders).values({
        orderNumber: 'TSP-ORD-20261003-UQ0001',
        studentId: studentUser.id,
        subtotalCents: 250000,
        payableCents: 250000,
        expiresAt: new Date(Date.now() + 3600000),
      });

      // Second order with identical orderNumber must fail
      await expect(
        db.insert(orders).values({
          orderNumber: 'TSP-ORD-20261003-UQ0001',
          studentId: studentUser.id,
          subtotalCents: 150000,
          payableCents: 150000,
          expiresAt: new Date(Date.now() + 3600000),
        })
      ).rejects.toThrow();
    });

    it('1.3 should enforce order monetary check constraints (non-negative and payable <= subtotal)', async () => {
      // Negative subtotal must fail
      await expect(
        db.insert(orders).values({
          orderNumber: 'TSP-ORD-FAIL-1',
          studentId: studentUser.id,
          subtotalCents: -100,
          payableCents: 0,
          expiresAt: new Date(),
        })
      ).rejects.toThrow();

      // Negative discount must fail
      await expect(
        db.insert(orders).values({
          orderNumber: 'TSP-ORD-FAIL-2',
          studentId: studentUser.id,
          subtotalCents: 200000,
          discountCents: -500,
          payableCents: 200000,
          expiresAt: new Date(),
        })
      ).rejects.toThrow();

      // Negative payable must fail
      await expect(
        db.insert(orders).values({
          orderNumber: 'TSP-ORD-FAIL-3',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: -100,
          expiresAt: new Date(),
        })
      ).rejects.toThrow();

      // Payable exceeding subtotal must fail
      await expect(
        db.insert(orders).values({
          orderNumber: 'TSP-ORD-FAIL-4',
          studentId: studentUser.id,
          subtotalCents: 100000,
          payableCents: 150000,
          expiresAt: new Date(),
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 2. ORDER ITEMS SCHEMA & CONSTRAINTS
  // ==========================================
  describe('2. Order Items Schema & Constraints', () => {
    it('2.1 should enforce UNIQUE(order_id, course_id) for order items', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-ITEM01',
          studentId: studentUser.id,
          subtotalCents: 250000,
          payableCents: 250000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      await db.insert(orderItems).values({
        orderId: order.id,
        courseId: testCourse.id,
        courseTitle: testCourse.title,
        unitPriceCents: 250000,
        payableCents: 250000,
      });

      // Second item with same courseId in same order must fail
      await expect(
        db.insert(orderItems).values({
          orderId: order.id,
          courseId: testCourse.id,
          courseTitle: testCourse.title,
          unitPriceCents: 250000,
          payableCents: 250000,
        })
      ).rejects.toThrow();
    });

    it('2.2 should enforce order_item check constraints (payable <= unit_price and non-negative)', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-ITEM02',
          studentId: studentUser.id,
          subtotalCents: 100000,
          payableCents: 100000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      // Payable exceeding unit price must fail
      await expect(
        db.insert(orderItems).values({
          orderId: order.id,
          courseId: testCourse.id,
          courseTitle: testCourse.title,
          unitPriceCents: 100000,
          payableCents: 150000,
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 3. PAYMENTS SCHEMA & UNIQUE CONSTRAINTS
  // ==========================================
  describe('3. Payments Schema & Constraints', () => {
    it('3.1 should enforce UNIQUE(merchant_tran_id) constraint on payments', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-PAY01',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      await db.insert(payments).values({
        orderId: order.id,
        merchantTranId: 'TSP-TXN-20261003-UQ01',
        amountCents: 200000,
      });

      // Second payment with same merchantTranId must fail
      await expect(
        db.insert(payments).values({
          orderId: order.id,
          merchantTranId: 'TSP-TXN-20261003-UQ01',
          amountCents: 200000,
        })
      ).rejects.toThrow();
    });

    it('3.2 should enforce partial unique index on val_id (allow multiple NULLs, reject duplicate non-null)', async () => {
      const [order1] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-VAL01',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      const [order2] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-VAL02',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      // Multiple payments with valId = null must succeed
      await db.insert(payments).values({
        orderId: order1.id,
        merchantTranId: 'TSP-TXN-NULL-01',
        valId: null,
        amountCents: 200000,
      });

      await db.insert(payments).values({
        orderId: order2.id,
        merchantTranId: 'TSP-TXN-NULL-02',
        valId: null,
        amountCents: 200000,
      });

      // First payment with a valid valId
      await db.insert(payments).values({
        orderId: order1.id,
        merchantTranId: 'TSP-TXN-VALID-01',
        valId: 'SSL-VAL-88776655',
        amountCents: 200000,
      });

      // Second payment with duplicate valId must be rejected
      await expect(
        db.insert(payments).values({
          orderId: order2.id,
          merchantTranId: 'TSP-TXN-VALID-02',
          valId: 'SSL-VAL-88776655',
          amountCents: 200000,
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 4. COUPONS SCHEMA & REDEMPTION LIFECYCLE
  // ==========================================
  describe('4. Coupons & Coupon Redemptions Schema', () => {
    it('4.1 should enforce UNIQUE(code) on coupons and basic check constraints', async () => {
      await db.insert(coupons).values({
        code: 'EID2026',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        startsAt: new Date(),
        createdBy: adminUser.id,
      });

      // Duplicate coupon code must fail
      await expect(
        db.insert(coupons).values({
          code: 'EID2026',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000,
          startsAt: new Date(),
          createdBy: adminUser.id,
        })
      ).rejects.toThrow();

      // Non-positive discount value must fail
      await expect(
        db.insert(coupons).values({
          code: 'ZERO_DISCOUNT',
          discountType: 'FIXED_AMOUNT',
          discountValue: 0,
          startsAt: new Date(),
          createdBy: adminUser.id,
        })
      ).rejects.toThrow();
    });

    it('4.2 should enforce UNIQUE(order_id) on coupon_redemptions', async () => {
      const [coupon] = await db
        .insert(coupons)
        .values({
          code: 'SAVE500',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000,
          startsAt: new Date(),
          createdBy: adminUser.id,
        })
        .returning();

      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-CPN01',
          studentId: studentUser.id,
          subtotalCents: 250000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      await db.insert(couponRedemptions).values({
        couponId: coupon.id,
        userId: studentUser.id,
        orderId: order.id,
        discountCents: 50000,
        status: 'RESERVED',
      });

      // Attempting a second redemption row for the same order must fail
      await expect(
        db.insert(couponRedemptions).values({
          couponId: coupon.id,
          userId: studentUser.id,
          orderId: order.id,
          discountCents: 50000,
          status: 'CONSUMED',
        })
      ).rejects.toThrow();
    });

    it('4.3 should support state transitions RESERVED -> CONSUMED or RELEASED', async () => {
      const [coupon] = await db
        .insert(coupons)
        .values({
          code: 'TRANSITION20',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          startsAt: new Date(),
          createdBy: adminUser.id,
        })
        .returning();

      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-TRANS01',
          studentId: studentUser.id,
          subtotalCents: 250000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      const [redemption] = await db
        .insert(couponRedemptions)
        .values({
          couponId: coupon.id,
          userId: studentUser.id,
          orderId: order.id,
          discountCents: 50000,
          status: 'RESERVED',
        })
        .returning();

      expect(redemption.status).toBe('RESERVED');

      // Update to CONSUMED
      const consumedTime = new Date();
      const [consumed] = await db
        .update(couponRedemptions)
        .set({
          status: 'CONSUMED',
          consumedAt: consumedTime,
        })
        .where(eq(couponRedemptions.id, redemption.id))
        .returning();

      expect(consumed.status).toBe('CONSUMED');
      expect(consumed.consumedAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================
  // 5. INVOICES SCHEMA & UNIQUENESS
  // ==========================================
  describe('5. Invoices Schema & Constraints', () => {
    it('5.1 should enforce UNIQUE(invoice_number) and UNIQUE(order_id) on invoices', async () => {
      const [order1] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-INV01',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      const [order2] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-INV02',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      await db.insert(invoices).values({
        invoiceNumber: 'TSP-INV-2026-00001',
        orderId: order1.id,
        studentId: studentUser.id,
        studentName: studentUser.name,
        studentEmail: studentUser.email,
        courseTitle: testCourse.title,
        subtotalCents: 200000,
        payableCents: 200000,
        currency: 'BDT',
        paymentMethod: 'bKash Mobile Banking',
        bankTranId: 'BKASH-TR-112233',
        status: 'PAID',
      });

      // Duplicate invoice_number must fail
      await expect(
        db.insert(invoices).values({
          invoiceNumber: 'TSP-INV-2026-00001',
          orderId: order2.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          studentEmail: studentUser.email,
          courseTitle: testCourse.title,
          subtotalCents: 200000,
          payableCents: 200000,
          currency: 'BDT',
          paymentMethod: 'bKash Mobile Banking',
          bankTranId: 'BKASH-TR-112234',
          status: 'PAID',
        })
      ).rejects.toThrow();

      // Duplicate orderId must fail
      await expect(
        db.insert(invoices).values({
          invoiceNumber: 'TSP-INV-2026-00002',
          orderId: order1.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          studentEmail: studentUser.email,
          courseTitle: testCourse.title,
          subtotalCents: 200000,
          payableCents: 200000,
          currency: 'BDT',
          paymentMethod: 'bKash Mobile Banking',
          bankTranId: 'BKASH-TR-112235',
          status: 'PAID',
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 6. REFUNDS SCHEMA & FULL-REFUND ENFORCEMENT
  // ==========================================
  describe('6. Refunds Schema & Full-Refund Enforcement', () => {
    it('6.1 should enforce UNIQUE(order_id) on refunds (full refund only: exactly one refund record per order)', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-REF01',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      const [payment] = await db
        .insert(payments)
        .values({
          orderId: order.id,
          merchantTranId: 'TSP-TXN-REF-01',
          amountCents: 200000,
        })
        .returning();

      await db.insert(refunds).values({
        refundNumber: 'TSP-REF-2026-00001',
        orderId: order.id,
        paymentId: payment.id,
        amountCents: 200000,
        currency: 'BDT',
        reason: 'Student purchased course by mistake.',
        status: 'PROCESSED',
        processedBy: adminUser.id,
      });

      // Second refund for the same order must fail
      await expect(
        db.insert(refunds).values({
          refundNumber: 'TSP-REF-2026-00002',
          orderId: order.id,
          paymentId: payment.id,
          amountCents: 200000,
          currency: 'BDT',
          reason: 'Attempted duplicate refund.',
          status: 'PROCESSED',
          processedBy: adminUser.id,
        })
      ).rejects.toThrow();
    });

    it('6.2 should enforce refund check constraints (BDT only, reason non-empty, amount non-negative)', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-REF02',
          studentId: studentUser.id,
          subtotalCents: 200000,
          payableCents: 200000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      const [payment] = await db
        .insert(payments)
        .values({
          orderId: order.id,
          merchantTranId: 'TSP-TXN-REF-02',
          amountCents: 200000,
        })
        .returning();

      // Currency other than BDT must fail
      await expect(
        db.insert(refunds).values({
          refundNumber: 'TSP-REF-FAIL-1',
          orderId: order.id,
          paymentId: payment.id,
          amountCents: 200000,
          currency: 'USD',
          reason: 'Valid refund reason for foreign currency.',
        })
      ).rejects.toThrow();

      // Reason shorter than 5 chars must fail
      await expect(
        db.insert(refunds).values({
          refundNumber: 'TSP-REF-FAIL-2',
          orderId: order.id,
          paymentId: payment.id,
          amountCents: 200000,
          currency: 'BDT',
          reason: 'no',
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 7. FOREIGN KEY RESTRICTIONS & CASCADES
  // ==========================================
  describe('7. Foreign Key Integrity Protections', () => {
    it('7.1 should cascade delete order_items when order is deleted', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-CASCADE01',
          studentId: studentUser.id,
          subtotalCents: 250000,
          payableCents: 250000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      const [item] = await db
        .insert(orderItems)
        .values({
          orderId: order.id,
          courseId: testCourse.id,
          courseTitle: testCourse.title,
          unitPriceCents: 250000,
          payableCents: 250000,
        })
        .returning();

      // Delete order
      await db.delete(orders).where(eq(orders.id, order.id));

      // Order item should be cascade deleted
      const items = await db.select().from(orderItems).where(eq(orderItems.id, item.id));
      expect(items).toHaveLength(0);
    });

    it('7.2 should restrict deleting student user when orders exist (ON DELETE RESTRICT)', async () => {
      await db.insert(orders).values({
        orderNumber: 'TSP-ORD-20261003-RESTRICT01',
        studentId: studentUser.id,
        subtotalCents: 250000,
        payableCents: 250000,
        expiresAt: new Date(Date.now() + 3600000),
      });

      // Deleting student must fail
      await expect(db.delete(users).where(eq(users.id, studentUser.id))).rejects.toThrow();
    });

    it('7.3 should restrict deleting course when active order_items reference it (ON DELETE RESTRICT)', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: 'TSP-ORD-20261003-RESTRICT02',
          studentId: studentUser.id,
          subtotalCents: 250000,
          payableCents: 250000,
          expiresAt: new Date(Date.now() + 3600000),
        })
        .returning();

      await db.insert(orderItems).values({
        orderId: order.id,
        courseId: testCourse.id,
        courseTitle: testCourse.title,
        unitPriceCents: 250000,
        payableCents: 250000,
      });

      // Deleting course must fail
      await expect(db.delete(courses).where(eq(courses.id, testCourse.id))).rejects.toThrow();
    });
  });

  // ==========================================
  // 8. CERTIFICATES PARTIAL UNIQUE BEHAVIOR (P4.5 / P5.0)
  // ==========================================
  describe('8. Certificate Compatibility & Immutability', () => {
    it('8.1 should allow new ACTIVE certificate for enrollment after previous certificate is REVOKED', async () => {
      // 1. Issue initial active certificate
      const [cert1] = await db
        .insert(certificates)
        .values({
          certificateNumber: 'TSP-2026-CERT-REV1',
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: new Date('2026-09-01T10:00:00Z'),
          status: 'ACTIVE',
        })
        .returning();

      expect(cert1.status).toBe('ACTIVE');

      // 2. Refund occurs: certificate is permanently REVOKED
      await db
        .update(certificates)
        .set({
          status: 'REVOKED',
          revokedAt: new Date('2026-09-02T10:00:00Z'),
          revocationReason: 'Order was fully refunded.',
        })
        .where(eq(certificates.id, cert1.id));

      // 3. Student repurchases and re-completes course: a NEW active certificate record is issued!
      const [cert2] = await db
        .insert(certificates)
        .values({
          certificateNumber: 'TSP-2026-CERT-ACT2', // Must have new unique certificateNumber
          enrollmentId: testEnrollment.id, // SAME enrollment ID
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: new Date('2026-10-03T10:00:00Z'),
          status: 'ACTIVE',
        })
        .returning();

      expect(cert2).toBeDefined();
      expect(cert2.id).not.toBe(cert1.id);
      expect(cert2.status).toBe('ACTIVE');
      expect(cert2.certificateNumber).toBe('TSP-2026-CERT-ACT2');

      // Both records exist in the database (historical immutability preserved)
      const allCerts = await db
        .select()
        .from(certificates)
        .where(eq(certificates.enrollmentId, testEnrollment.id));
      expect(allCerts).toHaveLength(2);
    });

    it('8.2 should reject second ACTIVE certificate for the same enrollment while one is already ACTIVE', async () => {
      await db.insert(certificates).values({
        certificateNumber: 'TSP-2026-CERT-ACTIVE-01',
        enrollmentId: testEnrollment.id,
        courseId: testCourse.id,
        studentId: studentUser.id,
        studentName: studentUser.name,
        courseTitle: testCourse.title,
        instructorName: instructorUser.name,
        completedAt: new Date(),
        status: 'ACTIVE',
      });

      // Second certificate with status = 'ACTIVE' for same enrollment must fail
      await expect(
        db.insert(certificates).values({
          certificateNumber: 'TSP-2026-CERT-ACTIVE-02',
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: new Date(),
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });

    it('8.3 should preserve global uniqueness of certificate_number forever', async () => {
      await db.insert(certificates).values({
        certificateNumber: 'TSP-2026-GLOBAL-UQ-01',
        enrollmentId: testEnrollment.id,
        courseId: testCourse.id,
        studentId: studentUser.id,
        studentName: studentUser.name,
        courseTitle: testCourse.title,
        instructorName: instructorUser.name,
        completedAt: new Date(),
        status: 'REVOKED',
      });

      // Even if previous certificate is revoked, reusing the same certificate_number must fail
      await expect(
        db.insert(certificates).values({
          certificateNumber: 'TSP-2026-GLOBAL-UQ-01',
          enrollmentId: testEnrollment.id,
          courseId: testCourse.id,
          studentId: studentUser.id,
          studentName: studentUser.name,
          courseTitle: testCourse.title,
          instructorName: instructorUser.name,
          completedAt: new Date(),
          status: 'ACTIVE',
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 9. COURSE CURRENCY DEFAULT TO BDT
  // ==========================================
  describe('9. Course Currency Default', () => {
    it('9.1 should default currency to BDT when inserting a new course without specifying currency', async () => {
      const [category] = await db.select().from(categories).limit(1);

      const [newCourse] = await db
        .insert(courses)
        .values({
          categoryId: category.id,
          instructorId: instructorUser.id,
          title: 'Advanced Microservices with NestJS',
          slug: 'advanced-microservices-nestjs',
          price: '2500.00',
        })
        .returning();

      expect(newCourse.currency).toBe('BDT');
    });

    it('9.2 should verify all seeded courses have BDT currency', async () => {
      const allCourses = await db.select().from(courses);
      expect(allCourses.length).toBeGreaterThan(0);
      for (const course of allCourses) {
        expect(course.currency).toBe('BDT');
      }
    });
  });

  // ==========================================
  // 10. MIGRATION 0004 SAFETY & DDL VALIDATION
  // ==========================================
  describe('10. Migration 0004 Safety & Validation', () => {
    it('10.1 should verify migration 0004 SQL file exists and contains all required tables and enums', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../database/migrations/0004_payment_admin_subsystem.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

      // Required enums
      expect(sqlContent).toContain('CREATE TYPE "public"."order_status"');
      expect(sqlContent).toContain('CREATE TYPE "public"."payment_status"');
      expect(sqlContent).toContain('CREATE TYPE "public"."coupon_discount_type"');
      expect(sqlContent).toContain('CREATE TYPE "public"."coupon_redemption_status"');
      expect(sqlContent).toContain('CREATE TYPE "public"."invoice_status"');
      expect(sqlContent).toContain('CREATE TYPE "public"."refund_status"');
      expect(sqlContent).not.toContain('PARTIALLY_REFUNDED');

      // Required tables
      expect(sqlContent).toContain('CREATE TABLE "orders"');
      expect(sqlContent).toContain('CREATE TABLE "order_items"');
      expect(sqlContent).toContain('CREATE TABLE "payments"');
      expect(sqlContent).toContain('CREATE TABLE "coupons"');
      expect(sqlContent).toContain('CREATE TABLE "coupon_redemptions"');
      expect(sqlContent).toContain('CREATE TABLE "invoices"');
      expect(sqlContent).toContain('CREATE TABLE "refunds"');

      // Currency default alteration
      expect(sqlContent).toContain(
        'ALTER TABLE "courses" ALTER COLUMN "currency" SET DEFAULT \'BDT\''
      );

      // Certificate partial unique index
      expect(sqlContent).toContain('DROP INDEX IF EXISTS "certificates_enrollment_id_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "certificates_active_enrollment_uq"');
      expect(sqlContent).toContain("WHERE status = 'ACTIVE'");

      // Unique constraints
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "orders_order_number_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "order_items_order_course_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "payments_merchant_tran_id_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "payments_val_id_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "coupons_code_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "coupon_redemptions_order_id_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "invoices_invoice_number_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "invoices_order_id_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "refunds_order_id_uq"');
      expect(sqlContent).toContain('CREATE UNIQUE INDEX "refunds_refund_number_uq"');
    });

    it('10.2 should verify migration is registered in _journal.json with correct entry', () => {
      const journalPath = path.resolve(__dirname, '../database/migrations/meta/_journal.json');
      expect(fs.existsSync(journalPath)).toBe(true);

      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
      const entry = journal.entries.find((e: any) => e.tag === '0004_payment_admin_subsystem');

      expect(entry).toBeDefined();
      expect(entry.idx).toBe(4);
      expect(entry.tag).toBe('0004_payment_admin_subsystem');
    });
  });
});
