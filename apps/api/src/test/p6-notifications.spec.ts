import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { CryptoUtil } from '../common/auth/crypto.util';
import * as schema from '../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { NotificationQueueService } from '../modules/notifications/notification-queue.service';
import { DomainEvent } from '../modules/events/domain-event.interface';

describe('P6.1 — Pillar A: Decoupled Event & Notification Engine Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;
  let notificationsService: NotificationsService;
  let notificationQueueService: NotificationQueueService;

  let student1Cookies: string[];
  let student2Cookies: string[];

  let student1Id: string;
  let student2Id: string;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // Retrieve default student
    const [student1] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'student@techsprout.edu'));
    student1Id = student1.id;

    // Seed student 2
    const [studentRole] = await testDb
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, 'student'))
      .limit(1);

    const passwordHash = await CryptoUtil.hashPassword('Student2Password123!');
    const [s2] = await testDb
      .insert(schema.users)
      .values({
        name: 'Fatima Begum',
        username: 'fatimabegum',
        email: 'fatima@techsprout.edu',
        phone: '01800000088',
        passwordHash,
        isVerified: true,
      })
      .returning();
    student2Id = s2.id;

    await testDb.insert(schema.userRoles).values({
      userId: student2Id,
      roleId: studentRole.id,
    });

    // Compile TestingModule
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        pool: testPool,
        db: testDb,
        onModuleDestroy: async () => {},
      })
      .overrideProvider(DRIZZLE_DB)
      .useValue(testDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    notificationsService = app.get(NotificationsService);
    notificationQueueService = app.get(NotificationQueueService);

    // Authenticate users
    const s1Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });
    student1Cookies = s1Login.headers['set-cookie'] as unknown as string[];

    const s2Login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'fatima@techsprout.edu',
      password: 'Student2Password123!',
    });
    student2Cookies = s2Login.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testPool) {
      await testPool.end();
    }
  });

  // =========================================================================
  // 1. IN-APP NOTIFICATION ENDPOINTS & CROSS-USER ISOLATION
  // =========================================================================
  describe('In-App Notification REST Endpoints & Ownership Scoping', () => {
    let notif1Id: string;
    let notif2Id: string;

    beforeAll(async () => {
      // Seed a notification for student 1
      const [n1] = await testDb
        .insert(schema.notifications)
        .values({
          userId: student1Id,
          title: 'Welcome to TechSprout',
          message: 'Explore our catalog of professional courses.',
          category: 'SYSTEM',
          actionUrl: '/courses',
          isRead: false,
        })
        .returning();
      notif1Id = n1.id;

      // Seed a notification for student 2
      const [n2] = await testDb
        .insert(schema.notifications)
        .values({
          userId: student2Id,
          title: 'Special Discount Available',
          message: 'Apply coupon code SAVE20 at checkout.',
          category: 'SYSTEM',
          actionUrl: '/courses',
          isRead: false,
        })
        .returning();
      notif2Id = n2.id;
    });

    it('returns only student 1 notifications when student 1 requests /notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);

      const items = res.body.data.items;
      expect(items.some((n: any) => n.id === notif1Id)).toBe(true);
      expect(items.some((n: any) => n.id === notif2Id)).toBe(false); // Isolated!
    });

    it('returns accurate unread notification count for student 1', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.unreadCount).toBe('number');
      expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it('allows student 1 to mark their own notification as read', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notif1Id}/read`)
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isRead).toBe(true);

      // Verify in DB
      const [updated] = await testDb
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.id, notif1Id));
      expect(updated.isRead).toBe(true);
    });

    it('rejects student 1 from marking student 2 notification as read with 403 or 404 (isolated)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notif2Id}/read`)
        .set('Cookie', student1Cookies);

      expect([403, 404]).toContain(res.status);

      // Verify student 2 notification was NOT modified
      const [unmodified] = await testDb
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.id, notif2Id));
      expect(unmodified.isRead).toBe(false);
    });

    it('allows student 2 to mark all of their unread notifications as read', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Cookie', student2Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedCount).toBeGreaterThanOrEqual(1);

      // Verify student 2 unread count is now 0
      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Cookie', student2Cookies);

      expect(countRes.body.data.unreadCount).toBe(0);
    });
  });

  // =========================================================================
  // 2. NOTIFICATION PREFERENCES API & MASS-ASSIGNMENT PROTECTION
  // =========================================================================
  describe('Notification Preferences API', () => {
    it('returns default preferences on initial retrieval for student 1', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/preferences')
        .set('Cookie', student1Cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.emailOrderUpdates).toBe(true);
      expect(res.body.data.emailCourseUpdates).toBe(true);
      expect(res.body.data.inAppAll).toBe(true);
    });

    it('allows student 1 to update preference flags', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set('Cookie', student1Cookies)
        .send({
          emailCourseUpdates: false,
          emailPromotions: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.emailCourseUpdates).toBe(false);
      expect(res.body.data.emailPromotions).toBe(true);
      expect(res.body.data.emailOrderUpdates).toBe(true); // Unchanged default
    });

    it('prevents mass assignment: strict schema rejects unauthorized userId field', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/preferences')
        .set('Cookie', student1Cookies)
        .send({
          userId: student2Id, // Attempted hijack
          emailCourseUpdates: true,
        });

      expect(res.status).toBe(400); // Strict schema rejects client-supplied userId
    });
  });

  // =========================================================================
  // 3. DOMAIN EVENT NOTIFICATION DISPATCH & IDEMPOTENCY
  // =========================================================================
  describe('Domain Event Processing & Notification Idempotency', () => {
    it('processes an OrderPlaced domain event and generates in-app notification', async () => {
      const orderPlacedEvent: DomainEvent = {
        eventId: 'evt_order_placed_test_1001',
        eventType: 'OrderPlaced',
        occurredAt: new Date().toISOString(),
        actorUserId: student1Id,
        entityType: 'order',
        entityId: 'ord_test_1001',
        payload: {
          orderNumber: 'ord_test_1001',
          payableCents: 500000,
          currency: 'BDT',
        },
      };

      const result = await notificationsService.processNotificationEvent(orderPlacedEvent);

      expect(result.processed).toBe(true);
      expect(result.notificationId).toBeDefined();

      // Verify notification in DB
      const [notif] = await testDb
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.id, result.notificationId!));

      expect(notif).toBeDefined();
      expect(notif.userId).toBe(student1Id);
      expect(notif.category).toBe('TRANSACTIONAL');
      expect(notif.actionUrl).toBe('/orders');

      // Verify delivery record in DB
      const deliveries = await testDb
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, result.notificationId!));

      expect(deliveries.length).toBeGreaterThanOrEqual(1);
      expect(deliveries.some((d: any) => d.channel === 'IN_APP')).toBe(true);
    });

    it('enforces idempotency: duplicate event does not create a second notification', async () => {
      const duplicateEvent: DomainEvent = {
        eventId: 'evt_order_placed_test_1001', // Same eventId
        eventType: 'OrderPlaced',
        occurredAt: new Date().toISOString(),
        actorUserId: student1Id,
        entityType: 'order',
        entityId: 'ord_test_1001',
        payload: {
          orderNumber: 'ord_test_1001',
          payableCents: 500000,
        },
      };

      const secondResult = await notificationsService.processNotificationEvent(duplicateEvent);

      expect(secondResult.processed).toBe(true);
      expect(secondResult.duplicate).toBe(true);

      // Verify DB count has exactly 1 notification for this order
      const matching = await testDb
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, student1Id),
            eq(schema.notifications.actionUrl, '/orders')
          )
        );

      expect(matching.length).toBe(1);
    });

    it('processes an OrderPaid domain event and initiates email + in-app notification', async () => {
      const orderPaidEvent: DomainEvent = {
        eventId: 'evt_order_paid_test_2001',
        eventType: 'OrderPaid',
        occurredAt: new Date().toISOString(),
        actorUserId: student1Id,
        entityType: 'order',
        entityId: 'ord_test_2001',
        payload: {
          orderNumber: 'ord_test_2001',
          paidAmountCents: 450000,
          currency: 'BDT',
          transactionId: 'TXN_TEST_2001',
        },
      };

      const result = await notificationsService.processNotificationEvent(orderPaidEvent);

      expect(result.processed).toBe(true);

      // Check deliveries
      const deliveries = await testDb
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, result.notificationId!));

      expect(deliveries.some((d: any) => d.channel === 'IN_APP')).toBe(true);
      expect(deliveries.some((d: any) => d.channel === 'EMAIL')).toBe(true);
    });

    it('processes CertificateIssued event and records certificate actionUrl', async () => {
      const certEvent: DomainEvent = {
        eventId: 'evt_cert_issued_test_3001',
        eventType: 'CertificateIssued',
        occurredAt: new Date().toISOString(),
        targetUserId: student1Id,
        entityType: 'certificate',
        entityId: 'cert_uuid_3001',
        payload: {
          certificateNumber: 'cert_uuid_3001',
          courseTitle: 'Full-Stack Distributed Engineering',
          studentName: 'Student User',
        },
      };

      const result = await notificationsService.processNotificationEvent(certEvent);

      expect(result.processed).toBe(true);

      const [certNotif] = await testDb
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.id, result.notificationId!));

      expect(certNotif.category).toBe('ACADEMIC');
      expect(certNotif.actionUrl).toBe('/certificates/cert_uuid_3001');
    });

    it('suppresses in-app notification when user inAppAll preference is false', async () => {
      // Ensure preferences row exists, then turn off inAppAll for student 2
      await notificationsService.getPreferences(student2Id);
      await testDb
        .update(schema.notificationPreferences)
        .set({ inAppAll: false })
        .where(eq(schema.notificationPreferences.userId, student2Id));

      const suppressedEvent: DomainEvent = {
        eventId: 'evt_refund_requested_4001',
        eventType: 'RefundRequested',
        occurredAt: new Date().toISOString(),
        actorUserId: student2Id,
        entityType: 'refund_request',
        entityId: 'rr_test_4001',
        payload: {
          refundRequestId: 'rr_test_4001',
          orderNumber: 'ord_suppressed',
          amountCents: 200000,
        },
      };

      const result = await notificationsService.processNotificationEvent(suppressedEvent);

      expect(result.processed).toBe(true);
      expect(result.inAppSuppressed).toBe(true);
    });
  });

  // =========================================================================
  // 4. QUEUE SERVICE & STANDBY RESILIENCE
  // =========================================================================
  describe('NotificationQueueService Standby Execution', () => {
    it('gracefully dispatches jobs via standby mechanism when Redis is offline', async () => {
      const event: DomainEvent = {
        eventId: 'evt_standby_test_5001',
        eventType: 'RefundApproved',
        occurredAt: new Date().toISOString(),
        targetUserId: student1Id,
        entityType: 'refund_request',
        entityId: 'rr_5001',
        payload: {
          refundRequestId: 'rr_5001',
          orderNumber: 'ord_5001',
          amountCents: 150000,
        },
      };

      const queueResult = await notificationQueueService.enqueueNotificationJob(event);
      expect(queueResult.id).toBeDefined();

      // Verify notification was recorded with actionUrl /orders
      const matching = await testDb
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.userId, student1Id),
            eq(schema.notifications.actionUrl, '/orders')
          )
        );

      expect(matching.length).toBeGreaterThanOrEqual(1);
    });
  });
});
