import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';
import * as fs from 'fs';
import * as schema from '../database/schema';

/**
 * Validates that the target database URL points strictly to a local, disposable test instance.
 * Fails closed if the URL targets production, staging, or an external cloud database.
 */
function assertDisposableDatabaseSafety(dbUrl: string): void {
  const parsed = new URL(dbUrl);
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'postgres';
  const isTestDb = pathname.includes('test') || pathname.includes('disposable') || pathname.includes('temp');

  const isProhibitedTarget =
    hostname.includes('render.com') ||
    hostname.includes('aws') ||
    hostname.includes('supabase') ||
    hostname.includes('neon.tech') ||
    hostname.includes('railway') ||
    pathname.includes('prod') ||
    pathname.includes('production') ||
    pathname.includes('staging') ||
    pathname.includes('live');

  if (!isLocalHost || !isTestDb || isProhibitedTarget) {
    throw new Error(
      `SAFETY VIOLATION: Database target "${hostname}${pathname}" is NOT explicitly recognized as a disposable test database. Real PostgreSQL migration validation requires a local disposable database containing "test", "disposable", or "temp".`
    );
  }
}

describe('Real PostgreSQL 16 Migration Validation & DDL Gate (0000-0011)', () => {
  const baseDbUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test';

  const dedicatedDbName = 'techsprout_migration_validation';
  let dedicatedDbUrl: string;

  let basePool: Pool | null = null;
  let testPool: Pool | null = null;
  let testDb: any = null;
  let isPostgresAvailable = false;

  const isCiEnvironment =
    process.env.CI === 'true' ||
    process.env.CI_DISPOSABLE_POSTGRES === 'true' ||
    process.env.GITHUB_ACTIONS === 'true';

  beforeAll(async () => {
    // 1. Verify safety invariant on target database
    assertDisposableDatabaseSafety(baseDbUrl);

    // Build dedicated test database URL
    const urlObj = new URL(baseDbUrl);
    urlObj.pathname = `/${dedicatedDbName}`;
    dedicatedDbUrl = urlObj.toString();

    // 2. Connect to base instance to verify health and provision isolated database
    basePool = new Pool({
      connectionString: baseDbUrl,
      connectionTimeoutMillis: 3000,
    });

    try {
      const client = await basePool.connect();
      await client.query('SELECT 1');
      client.release();
      isPostgresAvailable = true;
    } catch (err: any) {
      isPostgresAvailable = false;
      if (isCiEnvironment) {
        throw new Error(
          `FAIL-CLOSED GATE: Real PostgreSQL 16 service container is unreachable in CI environment (${err.message}). Migration validation gate cannot pass without a verified real PostgreSQL instance.`
        );
      } else {
        console.log(
          'Notice: Real PostgreSQL 16 service offline in local non-CI environment. Migration validation gate requires an active disposable PostgreSQL container.'
        );
        return;
      }
    }

    // 3. Create or reset dedicated empty test database
    await basePool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${dedicatedDbName}' AND pid <> pg_backend_pid();
    `);
    await basePool.query(`DROP DATABASE IF EXISTS ${dedicatedDbName};`);
    await basePool.query(`CREATE DATABASE ${dedicatedDbName};`);

    // 4. Connect to the pristine dedicated database
    testPool = new Pool({
      connectionString: dedicatedDbUrl,
      connectionTimeoutMillis: 3000,
    });

    testDb = drizzle(testPool, { schema });

    // 5. Apply migrations 0000 through 0011 via Drizzle ORM migrator
    const migrationsFolder = path.resolve(__dirname, '../database/migrations');
    console.log(`[Real PostgreSQL 16 Gate] Applying migrations 0000..0011 from: ${migrationsFolder}`);
    await migrate(testDb, { migrationsFolder });
    console.log('[Real PostgreSQL 16 Gate] Forward migrations applied successfully.');
  });

  afterAll(async () => {
    if (testPool) {
      await testPool.end();
    }

    if (basePool && isPostgresAvailable) {
      try {
        await basePool.query(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = '${dedicatedDbName}' AND pid <> pg_backend_pid();
        `);
        await basePool.query(`DROP DATABASE IF EXISTS ${dedicatedDbName};`);
      } catch (err) {
        console.warn('Warning: Could not drop disposable validation database:', err);
      } finally {
        await basePool.end();
      }
    }
  });

  it('1. Migration Journal Alignment: __drizzle_migrations ledger matches disk journal exactly', async () => {
    if (!isPostgresAvailable) {
      if (isCiEnvironment) throw new Error('FAIL-CLOSED: Postgres offline in CI');
      return;
    }

    const journalPath = path.resolve(__dirname, '../database/migrations/meta/_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const expectedEntries = journal.entries;

    // Verify __drizzle_migrations table exists and has exact matching count
    const res = await testPool!.query(`
      SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id ASC;
    `);

    expect(res.rows.length).toBe(expectedEntries.length);
    expect(res.rows.length).toBe(12); // Migrations 0000 through 0011

    // Verify sequence through 0010 and 0011
    expect(expectedEntries[10].tag).toBe('0010_monetization_ledger');
    expect(expectedEntries[11].tag).toBe('0011_discussions_and_assignments');
  });

  it('2. Schema Verification: All 34 required relational tables exist in information_schema', async () => {
    if (!isPostgresAvailable) {
      if (isCiEnvironment) throw new Error('FAIL-CLOSED: Postgres offline in CI');
      return;
    }

    const res = await testPool!.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);

    const tableNames = res.rows.map((r: any) => r.table_name);

    const requiredTables = [
      // Core & Auth (0000)
      'users', 'sessions', 'roles', 'user_roles', 'otps', 'audit_logs', 'accounts',
      // Catalog & Courses (0000-0003)
      'categories', 'media', 'courses', 'modules', 'lessons',
      // Learning & Progress (0000-0003)
      'enrollments', 'lesson_progress', 'quizzes', 'quiz_questions', 'quiz_question_options',
      'quiz_attempts', 'quiz_attempt_answers', 'certificates',
      // Orders, Payments & Refunds (0004-0005)
      'coupons', 'orders', 'order_items', 'payments', 'coupon_redemptions', 'invoices',
      'refunds', 'refund_requests',
      // Instructor Platform Foundation (0007)
      'course_review_requests', 'instructor_profiles',
      // Telemetry Foundation (0009)
      'learning_events', 'learning_daily_aggregates',
      // Monetization Ledger (0010)
      'instructor_wallets', 'ledger_transactions', 'ledger_entries', 'payout_requests',
      // Discussions & Project Assignments (0011)
      'discussions', 'discussion_replies', 'discussion_votes',
      'assignments', 'assignment_submissions', 'assignment_grades'
    ];

    for (const table of requiredTables) {
      expect(tableNames).toContain(table);
    }
  });

  it('3. PostgreSQL ENUM Types: Declared ENUM types exist in pg_type with correct values', async () => {
    if (!isPostgresAvailable) {
      if (isCiEnvironment) throw new Error('FAIL-CLOSED: Postgres offline in CI');
      return;
    }

    const res = await testPool!.query(`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as labels
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      GROUP BY t.typname;
    `);

    const enums: Record<string, string[]> = {};
    for (const row of res.rows) {
      enums[row.typname] = row.labels;
    }

    // 0010 ENUM types
    expect(enums['ledger_transaction_type']).toEqual([
      'COURSE_PURCHASE', 'ESCROW_SETTLEMENT', 'REFUND_CLAWBACK',
      'PAYOUT_REQUEST', 'PAYOUT_SETTLED', 'PAYOUT_REJECTED', 'ADJUSTMENT'
    ]);
    expect(enums['ledger_account_type']).toEqual([
      'PLATFORM_CASH', 'PLATFORM_REVENUE', 'INSTRUCTOR_PENDING',
      'INSTRUCTOR_AVAILABLE', 'PAYOUT_CLEARING'
    ]);
    expect(enums['ledger_entry_direction']).toEqual(['DEBIT', 'CREDIT']);
    expect(enums['payout_status']).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'SETTLED', 'FAILED']);
    expect(enums['payout_method']).toEqual(['BKASH', 'NAGAD', 'BANK_TRANSFER']);

    // 0011 ENUM types
    expect(enums['discussion_status']).toEqual(['ACTIVE', 'RESOLVED', 'HIDDEN', 'DELETED']);
    expect(enums['discussion_reply_status']).toEqual(['ACTIVE', 'HIDDEN', 'DELETED']);
    expect(enums['discussion_vote_target']).toEqual(['DISCUSSION', 'REPLY']);
    expect(enums['assignment_status']).toEqual(['DRAFT', 'PUBLISHED', 'CLOSED']);
    expect(enums['submission_status']).toEqual(['SUBMITTED', 'GRADED', 'RESUBMITTED']);
  });

  it('4. Real PostgreSQL Triggers: Enforces strict immutability on ledger transactions and entries', async () => {
    if (!isPostgresAvailable) {
      if (isCiEnvironment) throw new Error('FAIL-CLOSED: Postgres offline in CI');
      return;
    }

    // Insert a valid transaction header and entry
    const txRes = await testPool!.query(`
      INSERT INTO ledger_transactions (
        transaction_number, transaction_type, idempotency_key, currency,
        total_amount_cents, reference_type, reference_id, description
      ) VALUES (
        'LTX-REAL-001', 'COURSE_PURCHASE', 'idemp-real-001', 'BDT',
        5000, 'ORDER', 'order-uuid-1', 'Initial purchase ledger record'
      ) RETURNING id;
    `);
    const txId = txRes.rows[0].id;

    const entryRes = await testPool!.query(`
      INSERT INTO ledger_entries (
        transaction_id, account_type, direction, amount_cents, currency, description
      ) VALUES (
        $1, 'PLATFORM_CASH', 'DEBIT', 5000, 'BDT', 'Debit platform cash'
      ) RETURNING id;
    `, [txId]);
    const entryId = entryRes.rows[0].id;

    // Direct UPDATE on ledger_transactions must be blocked by trigger
    await expect(
      testPool!.query('UPDATE ledger_transactions SET total_amount_cents = 9999 WHERE id = $1', [txId])
    ).rejects.toThrow(/Financial invariant violation: posted ledger transactions and entries are strictly immutable/);

    // Direct DELETE on ledger_transactions must be blocked by trigger
    await expect(
      testPool!.query('DELETE FROM ledger_transactions WHERE id = $1', [txId])
    ).rejects.toThrow(/Financial invariant violation: posted ledger transactions and entries are strictly immutable/);

    // Direct UPDATE on ledger_entries must be blocked by trigger
    await expect(
      testPool!.query('UPDATE ledger_entries SET amount_cents = 9999 WHERE id = $1', [entryId])
    ).rejects.toThrow(/Financial invariant violation: posted ledger transactions and entries are strictly immutable/);

    // Direct DELETE on ledger_entries must be blocked by trigger
    await expect(
      testPool!.query('DELETE FROM ledger_entries WHERE id = $1', [entryId])
    ).rejects.toThrow(/Financial invariant violation: posted ledger transactions and entries are strictly immutable/);
  });

  it('5. Real PostgreSQL Constraints: CHECK constraints enforce monetary non-negativity and formatting', async () => {
    if (!isPostgresAvailable) {
      if (isCiEnvironment) throw new Error('FAIL-CLOSED: Postgres offline in CI');
      return;
    }

    // Provision test user
    const uRes = await testPool!.query(`
      INSERT INTO users (name, username, email, is_active, is_verified)
      VALUES ('Wallet Test User', 'wallet_user_1', 'wallet_test@techsprout.edu', true, true)
      RETURNING id;
    `);
    const userId = uRes.rows[0].id;

    // 1. Negative wallet balance must violate check constraint
    await expect(
      testPool!.query(`
        INSERT INTO instructor_wallets (instructor_id, balance_cents, currency)
        VALUES ($1, -500, 'BDT');
      `, [userId])
    ).rejects.toThrow(/instructor_wallets_balance_non_negative/);

    // 2. Non-BDT currency must violate check constraint
    await expect(
      testPool!.query(`
        INSERT INTO instructor_wallets (instructor_id, balance_cents, currency)
        VALUES ($1, 1000, 'USD');
      `, [userId])
    ).rejects.toThrow(/instructor_wallets_currency_bdt/);

    // 3. Valid wallet insertion succeeds
    const wRes = await testPool!.query(`
      INSERT INTO instructor_wallets (instructor_id, balance_cents, currency)
      VALUES ($1, 10000, 'BDT')
      RETURNING id;
    `, [userId]);
    const walletId = wRes.rows[0].id;

    // 4. Zero or negative ledger entry amount must violate check constraint
    await expect(
      testPool!.query(`
        INSERT INTO ledger_entries (transaction_id, account_type, direction, amount_cents, currency, description)
        VALUES (
          (SELECT id FROM ledger_transactions LIMIT 1),
          'PLATFORM_CASH', 'CREDIT', 0, 'BDT', 'Zero amount entry'
        );
      `)
    ).rejects.toThrow(/ledger_entries_amount_cents_positive/);

    // 5. Payout request SETTLED status without settlement_reference must violate check constraint
    await expect(
      testPool!.query(`
        INSERT INTO payout_requests (
          request_number, instructor_id, wallet_id, amount_cents, currency,
          payout_method, account_details, status, settlement_reference
        ) VALUES (
          'PO-REAL-001', $1, $2, 5000, 'BDT',
          'BKASH', '01711112222', 'SETTLED', NULL
        );
      `, [userId, walletId])
    ).rejects.toThrow(/payout_requests_settled_reference_required/);

    // 6. Payout request SETTLED status with short reference (< 3 chars) must violate check constraint
    await expect(
      testPool!.query(`
        INSERT INTO payout_requests (
          request_number, instructor_id, wallet_id, amount_cents, currency,
          payout_method, account_details, status, settlement_reference
        ) VALUES (
          'PO-REAL-002', $1, $2, 5000, 'BDT',
          'BKASH', '01711112222', 'SETTLED', 'ab'
        );
      `, [userId, walletId])
    ).rejects.toThrow(/payout_requests_settled_reference_required/);

    // 7. Valid SETTLED payout request succeeds
    const poRes = await testPool!.query(`
      INSERT INTO payout_requests (
        request_number, instructor_id, wallet_id, amount_cents, currency,
        payout_method, account_details, status, settlement_reference
      ) VALUES (
        'PO-REAL-003', $1, $2, 5000, 'BDT',
        'BKASH', '01711112222', 'SETTLED', 'BKASH-REF-889922'
      ) RETURNING id;
    `, [userId, walletId]);
    expect(poRes.rows[0].id).toBeDefined();
  });

  it('6. Real PostgreSQL Foreign Keys: Cascades and ON DELETE RESTRICT behave as declared', async () => {
    if (!isPostgresAvailable) {
      if (isCiEnvironment) throw new Error('FAIL-CLOSED: Postgres offline in CI');
      return;
    }

    // Provision category, instructor, course, and module/lesson
    const catRes = await testPool!.query(`
      INSERT INTO categories (name, slug, is_active)
      VALUES ('FK Test Category', 'fk-test-cat', true) RETURNING id;
    `);
    const catId = catRes.rows[0].id;

    const instRes = await testPool!.query(`
      INSERT INTO users (name, username, email, is_active, is_verified)
      VALUES ('FK Instructor', 'fk_inst_1', 'fk_inst@techsprout.edu', true, true) RETURNING id;
    `);
    const instId = instRes.rows[0].id;

    const courseRes = await testPool!.query(`
      INSERT INTO courses (title, slug, status, visibility, category_id, instructor_id, price)
      VALUES ('FK Course', 'fk-course', 'PUBLISHED', 'PUBLIC', $1, $2, '0.00') RETURNING id;
    `, [catId, instId]);
    const courseId = courseRes.rows[0].id;

    const modRes = await testPool!.query(`
      INSERT INTO modules (course_id, title, sort_order)
      VALUES ($1, 'FK Module', 1) RETURNING id;
    `, [courseId]);
    const modId = modRes.rows[0].id;

    const lesRes = await testPool!.query(`
      INSERT INTO lessons (module_id, title, lesson_type, sort_order)
      VALUES ($1, 'FK Lesson', 'VIDEO', 1) RETURNING id;
    `, [modId]);
    const lesId = lesRes.rows[0].id;

    // Student user
    const studentRes = await testPool!.query(`
      INSERT INTO users (name, username, email, is_active, is_verified)
      VALUES ('FK Student', 'fk_student_1', 'fk_student@techsprout.edu', true, true) RETURNING id;
    `);
    const studentId = studentRes.rows[0].id;

    // 1. Create Discussion and Reply
    const discRes = await testPool!.query(`
      INSERT INTO discussions (course_id, lesson_id, user_id, title, content, status)
      VALUES ($1, $2, $3, 'FK Discussion', 'Content', 'ACTIVE') RETURNING id;
    `, [courseId, lesId, studentId]);
    const discId = discRes.rows[0].id;

    const replyRes = await testPool!.query(`
      INSERT INTO discussion_replies (discussion_id, user_id, content, status)
      VALUES ($1, $2, 'Reply Content', 'ACTIVE') RETURNING id;
    `, [discId, instId]);
    const replyId = replyRes.rows[0].id;

    // Deleting discussion must CASCADE delete replies
    await testPool!.query('DELETE FROM discussions WHERE id = $1', [discId]);
    const checkReplies = await testPool!.query('SELECT * FROM discussion_replies WHERE id = $1', [replyId]);
    expect(checkReplies.rows.length).toBe(0);

    // 2. Create Assignment and Submission
    const assignRes = await testPool!.query(`
      INSERT INTO assignments (course_id, lesson_id, title, description, max_score, status)
      VALUES ($1, $2, 'FK Assignment', 'Desc', 100, 'PUBLISHED') RETURNING id;
    `, [courseId, lesId]);
    const assignId = assignRes.rows[0].id;

    const subRes = await testPool!.query(`
      INSERT INTO assignment_submissions (
        assignment_id, student_id, version, file_url, file_storage_key,
        original_filename, mime_type, file_size_bytes, status
      ) VALUES (
        $1, $2, 1, 'https://cdn.example.com/file.pdf', 'storage/key1',
        'file.pdf', 'application/pdf', 1024, 'SUBMITTED'
      ) RETURNING id;
    `, [assignId, studentId]);
    const subId = subRes.rows[0].id;

    // Deleting assignment must CASCADE delete submissions
    await testPool!.query('DELETE FROM assignments WHERE id = $1', [assignId]);
    const checkSubs = await testPool!.query('SELECT * FROM assignment_submissions WHERE id = $1', [subId]);
    expect(checkSubs.rows.length).toBe(0);

    // 3. ON DELETE RESTRICT on User with Wallet
    const walletUser = await testPool!.query(`
      INSERT INTO users (name, username, email, is_active, is_verified)
      VALUES ('Restrict User', 'rest_user_1', 'rest_user@techsprout.edu', true, true) RETURNING id;
    `);
    const restUserId = walletUser.rows[0].id;

    await testPool!.query(`
      INSERT INTO instructor_wallets (instructor_id, balance_cents, currency)
      VALUES ($1, 0, 'BDT');
    `, [restUserId]);

    // Deleting user must fail due to instructor_wallets RESTRICT foreign key
    await expect(
      testPool!.query('DELETE FROM users WHERE id = $1', [restUserId])
    ).rejects.toThrow(/violates foreign key constraint/);
  });

  it('7. Real PostgreSQL Transaction Rollback: Rollback aborts mutations cleanly', async () => {
    if (!isPostgresAvailable) {
      if (isCiEnvironment) throw new Error('FAIL-CLOSED: Postgres offline in CI');
      return;
    }

    const client = await testPool!.connect();
    try {
      // 1. Explicit transaction rollback
      await client.query('BEGIN');
      const rollbackEmail = `rollback_${Date.now()}@techsprout.edu`;
      await client.query(`
        INSERT INTO users (name, username, email, is_active, is_verified)
        VALUES ('Rollback User', 'roll_u_1', $1, true, true);
      `, [rollbackEmail]);

      // Verify row exists inside active transaction
      const inTx = await client.query('SELECT * FROM users WHERE email = $1', [rollbackEmail]);
      expect(inTx.rows.length).toBe(1);

      // Rollback
      await client.query('ROLLBACK');

      // Verify row does NOT exist after rollback
      const afterRollback = await testPool!.query('SELECT * FROM users WHERE email = $1', [rollbackEmail]);
      expect(afterRollback.rows.length).toBe(0);

      // 2. Error-aborted transaction rollback
      await client.query('BEGIN');
      const errorEmail = `error_tx_${Date.now()}@techsprout.edu`;
      await client.query(`
        INSERT INTO users (name, username, email, is_active, is_verified)
        VALUES ('Error User', 'err_u_1', $1, true, true);
      `, [errorEmail]);

      // Cause a check constraint error inside transaction
      let errorOccurred = false;
      try {
        await client.query(`
          INSERT INTO instructor_wallets (instructor_id, balance_cents, currency)
          VALUES (gen_random_uuid(), -100, 'BDT');
        `);
      } catch {
        errorOccurred = true;
      }
      expect(errorOccurred).toBe(true);

      // Any further statement must fail because transaction is aborted
      await expect(client.query('SELECT 1')).rejects.toThrow(/current transaction is aborted/);

      // Must clean up with ROLLBACK
      await client.query('ROLLBACK');

      // The uncommitted user must not exist
      const afterErrorRollback = await testPool!.query('SELECT * FROM users WHERE email = $1', [errorEmail]);
      expect(afterErrorRollback.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });
});
