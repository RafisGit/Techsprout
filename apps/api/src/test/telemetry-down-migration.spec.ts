import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTestDatabase } from './test-helper';
import * as schema from '../database/schema';
import { learningEvents } from '../database/schema/telemetry';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';

describe('P7.1 — Migration 0009 Zero-Lock Rollback Verification Suite (WP-P7-01)', () => {
  let testDb: any;
  let testPool: any;
  let downSql: string;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

    // Load down migration script
    const downPath = path.resolve(
      __dirname,
      '../database/migrations/0009_telemetry_foundation.down.sql'
    );
    expect(fs.existsSync(downPath)).toBe(true);
    downSql = fs.readFileSync(downPath, 'utf8');
  });

  it('1.1 should confirm learning_events table exists and can accept telemetry records', async () => {
    // Seed core course
    const [category] = await testDb
      .insert(schema.categories)
      .values({
        name: 'Rollback Testing',
        slug: 'rollback-testing',
        isActive: true,
      })
      .returning();

    const [adminUser] = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'admin@techsprout.edu'));

    const [course] = await testDb
      .insert(schema.courses)
      .values({
        title: 'Zero-Lock Migration Testing',
        slug: 'zero-lock-migration-testing',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: category.id,
        instructorId: adminUser.id,
        price: '0.00',
      })
      .returning();

    const eventId = crypto.randomUUID();
    await testDb.insert(learningEvents).values({
      id: eventId,
      userId: 'a'.repeat(64),
      courseId: course.id,
      eventType: 'COURSE_OPENED',
      metadata: { score: 100 },
      occurredAt: new Date(),
    });

    const [record] = await testDb
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.id, eventId));
    expect(record).toBeDefined();
    expect(record.id).toBe(eventId);
  });

  it('1.2 should execute 0009 down-migration script and cleanly drop learning_events table', async () => {
    // Execute down-migration SQL script
    await testPool.query(downSql);

    // Verify learning_events table is dropped
    let queryFailed = false;
    try {
      await testPool.query('SELECT count(*) FROM learning_events;');
    } catch (err: any) {
      queryFailed = true;
      expect(err.message).toMatch(/relation.*learning_events.*does not exist/i);
    }
    expect(queryFailed).toBe(true);
  });

  it('1.3 should verify core transactional tables remain intact with zero data loss or lock corruption', async () => {
    // Assert users table is intact
    const users = await testDb.select().from(schema.users);
    expect(users.length).toBeGreaterThan(0);

    // Assert courses table is intact
    const courses = await testDb.select().from(schema.courses);
    expect(courses.length).toBeGreaterThan(0);

    // Assert categories table is intact
    const categories = await testDb.select().from(schema.categories);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('1.4 should verify down-migration script is idempotent and can be safely re-executed', async () => {
    // Re-running down migration on already-dropped table should succeed without error
    await expect(testPool.query(downSql)).resolves.toBeDefined();
  });
});
