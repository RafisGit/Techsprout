import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as schema from '../database/schema';

/**
 * Validates that the target database URL points strictly to a local, disposable test instance.
 * Fails closed if the URL targets production, staging, or an external cloud database.
 * Suppresses credentials and sensitive connection parameters from error messages.
 */
function assertDisposableDatabaseSafety(dbUrl: string): { hostname: string; port: string; pathname: string } {
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    throw new Error('SAFETY VIOLATION: Invalid database URL format. Credentials and details suppressed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port || '5432';
  const pathname = parsed.pathname.toLowerCase();

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'postgres';

  const isProhibitedHost =
    hostname.includes('render.com') ||
    hostname.includes('aws') ||
    hostname.includes('amazon') ||
    hostname.includes('supabase') ||
    hostname.includes('neon.tech') ||
    hostname.includes('railway') ||
    hostname.includes('elephantsql') ||
    hostname.includes('cockroachlabs') ||
    hostname.includes('azure') ||
    hostname.includes('google') ||
    hostname.includes('cloud');

  const isProhibitedName =
    pathname.includes('prod') ||
    pathname.includes('production') ||
    pathname.includes('staging') ||
    pathname.includes('live');

  if (!isLocalHost || isProhibitedHost || isProhibitedName) {
    throw new Error(
      `SAFETY VIOLATION: Database target host "${hostname}" and path "${pathname}" is NOT recognized as a local disposable test target. Real PostgreSQL migration validation only allows localhost/127.0.0.1/postgres and prohibits production or cloud environments.`
    );
  }

  return { hostname, port, pathname };
}

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const isDisposableConfigured = process.env.CI_DISPOSABLE_POSTGRES === 'true';
const shouldSkipSuite = !isDisposableConfigured && !isGitHubActions;

if (shouldSkipSuite) {
  console.info(
    'SKIPPED: Real PostgreSQL migration validation skipped because CI_DISPOSABLE_POSTGRES is not "true". Set CI_DISPOSABLE_POSTGRES=true and ensure a local disposable PostgreSQL 16 instance is running to execute this gate.'
  );
}

describe.skipIf(shouldSkipSuite)('Real PostgreSQL 16 Migration Validation & DDL Gate (0000-0011)', () => {
  const baseDbUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgrespassword@localhost:5432/techsprout_test';

  const testRunId = crypto.randomBytes(6).toString('hex');
  const dedicatedDbName = `techsprout_mig_${testRunId}`;
  let dedicatedDbUrl: string;

  let basePool: Pool | null = null;
  let testPool: Pool | null = null;
  let testDb: any = null;
  let dbCreatedByThisRun = false;

  beforeAll(async () => {
    // 1. In GitHub Actions, require explicit disposable flag
    if (isGitHubActions && !isDisposableConfigured) {
      throw new Error(
        'FAIL-CLOSED GATE: GitHub Actions execution requires explicit CI_DISPOSABLE_POSTGRES="true" environment flag. Real PostgreSQL migration validation requires explicit disposable environment confirmation.'
      );
    }

    // 2. Validate safety invariant on base target database
    assertDisposableDatabaseSafety(baseDbUrl);

    // Build dedicated test database URL and validate its safety
    const urlObj = new URL(baseDbUrl);
    urlObj.pathname = `/${dedicatedDbName}`;
    dedicatedDbUrl = urlObj.toString();
    assertDisposableDatabaseSafety(dedicatedDbUrl);

    // 3. Connect to base instance to verify health and PostgreSQL 16 container
    basePool = new Pool({
      connectionString: baseDbUrl,
      connectionTimeoutMillis: 3000,
    });

    let client;
    try {
      client = await basePool.connect();
    } catch (err: any) {
      throw new Error(
        `FAIL-CLOSED GATE: Real PostgreSQL service container is unreachable (${err.message}). Migration validation gate cannot pass without an active disposable PostgreSQL 16 service.`
      );
    }

    try {
      const versionRes = await client.query('SELECT version();');
      const versionStr = versionRes.rows[0]?.version || '';
      if (!versionStr.includes('PostgreSQL 16')) {
        throw new Error(
          `FAIL-CLOSED GATE: Expected PostgreSQL 16 service container, but received: "${versionStr}". Migration validation must execute against PostgreSQL 16.`
        );
      }

      // 4. Confirm uniquely named database does not already exist
      const existingDbCheck = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1;',
        [dedicatedDbName]
      );
      if (existingDbCheck.rows.length > 0) {
        throw new Error(
          `Collision detected: Unique test database "${dedicatedDbName}" already exists. Aborting to avoid modifying an existing database.`
        );
      }

      // 5. Create uniquely named dedicated test database
      await client.query(`CREATE DATABASE "${dedicatedDbName}";`);
      dbCreatedByThisRun = true;
    } finally {
      client.release();
    }

    // 6. Connect to the pristine dedicated database
    testPool = new Pool({
      connectionString: dedicatedDbUrl,
      connectionTimeoutMillis: 3000,
    });

    testDb = drizzle(testPool, { schema });

    // 7. Apply migrations 0000 through 0011 via Drizzle ORM migrator
    const migrationsFolder = path.resolve(__dirname, '../database/migrations');
    console.log(`[Real PostgreSQL 16 Gate] Applying migrations 0000..0011 to "${dedicatedDbName}" from: ${migrationsFolder}`);
    await migrate(testDb, { migrationsFolder });
    console.log('[Real PostgreSQL 16 Gate] Forward migrations applied successfully.');
  });

  afterAll(async () => {
    // 1. Close dedicated test database pool connections first
    if (testPool) {
      try {
        await testPool.end();
      } catch (err: any) {
        console.warn('[Cleanup Warning] Error closing test pool:', err?.message || err);
      }
      testPool = null;
    }

    // 2. Only drop the database if this execution created it and its connections are closed
    if (basePool && dbCreatedByThisRun) {
      try {
        await basePool.query(`DROP DATABASE "${dedicatedDbName}";`);
      } catch (err: any) {
        console.warn(
          `[Cleanup Warning] Could not drop disposable validation database "${dedicatedDbName}":`,
          err?.message || err
        );
      }
    }

    // 3. Close base pool connections
    if (basePool) {
      try {
        await basePool.end();
      } catch (err: any) {
        console.warn('[Cleanup Warning] Error closing base pool:', err?.message || err);
      }
      basePool = null;
    }
  });

  it('1. Migration Journal Alignment: __drizzle_migrations ledger matches disk journal and migration files (0000-0011)', async () => {
    expect(testPool).toBeDefined();

    const journalPath = path.resolve(__dirname, '../database/migrations/meta/_journal.json');
    const migrationsFolder = path.resolve(__dirname, '../database/migrations');

    const journalContent = fs.readFileSync(journalPath, 'utf-8');
    const journal = JSON.parse(journalContent);
    const expectedEntries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints?: boolean }> = journal.entries;

    // Verify __drizzle_migrations table exists and has exact matching count
    const migrationTableRes = await testPool!.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations';
    `);
    const schemaName = migrationTableRes.rows[0]?.table_schema || 'drizzle';
    const res = await testPool!.query(`
      SELECT id, hash, created_at FROM "${schemaName}"."__drizzle_migrations" ORDER BY id ASC;
    `);

    // Verify expected count (12 migrations: 0000 through 0011)
    expect(res.rows.length).toBe(expectedEntries.length);
    expect(res.rows.length).toBe(12);

    // Verify every migration sequentially from 0000 through 0011
    for (let i = 0; i < expectedEntries.length; i++) {
      const entry = expectedEntries[i];
      const row = res.rows[i];
      const expectedId = i + 1;

      // 1. Verify sequential id order
      if (Number(row.id) !== expectedId) {
        throw new Error(
          `Migration sequence failure at index ${i} (${entry.tag}): expected id ${expectedId}, received ${row.id}`
        );
      }

      // 2. Read migration SQL file from disk and compute Drizzle-equivalent SHA-256 hash
      const sqlFilePath = path.join(migrationsFolder, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlFilePath)) {
        throw new Error(
          `Migration file missing on disk for index ${i} (${entry.tag}): ${sqlFilePath}`
        );
      }
      const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
      const expectedHash = crypto.createHash('sha256').update(sqlContent).digest('hex');

      // 3. Compare recorded migration hash against disk file hash
      if (row.hash !== expectedHash) {
        throw new Error(
          `Migration hash mismatch at index ${i} (${entry.tag}): expected hash ${expectedHash}, recorded in ledger as ${row.hash}`
        );
      }

      // 4. Compare recorded migration timestamp with journal timestamp
      if (BigInt(row.created_at) !== BigInt(entry.when)) {
        throw new Error(
          `Migration timestamp mismatch at index ${i} (${entry.tag}): expected timestamp ${entry.when}, recorded in ledger as ${row.created_at}`
        );
      }

      // Explicit Vitest assertions
      expect(Number(row.id)).toBe(expectedId);
      expect(row.hash).toBe(expectedHash);
      expect(BigInt(row.created_at)).toBe(BigInt(entry.when));
    }

    // Verify boundary tags explicitly
    expect(expectedEntries[0].tag).toBe('0000_initial_schema');
    expect(expectedEntries[10].tag).toBe('0010_monetization_ledger');
    expect(expectedEntries[11].tag).toBe('0011_discussions_and_assignments');
  });

  it('2. Schema Verification: All 45 required relational tables exist in information_schema', async () => {
    expect(testPool).toBeDefined();

    const res = await testPool!.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);

    const tableNames = res.rows.map((r: any) => r.table_name);

    const requiredTables = [
      // Core & Auth (0000)
      'users', 'sessions', 'roles', 'user_roles', 'otps', 'audit_logs', 'accounts',
      // Catalog & Courses (0001)
      'categories', 'media', 'courses', 'modules', 'lessons',
      // Learning & Progress (0002)
      'enrollments', 'lesson_progress',
      // Quizzes & Certificates (0003)
      'quiz_question_options', 'quiz_questions', 'quizzes', 'quiz_attempt_answers', 'quiz_attempts', 'certificates',
      // Orders, Payments & Invoices (0004)
      'coupons', 'orders', 'order_items', 'payments', 'coupon_redemptions', 'invoices', 'refunds',
      // Refund Requests Subsystem (0005)
      'refund_requests',
      // Notifications & Outbox Subsystem (0006)
      'notifications', 'notification_preferences', 'notification_deliveries', 'outbox_events',
      // Instructor Platform Foundation (0007)
      'course_review_requests', 'instructor_profiles',
      // Telemetry Foundation (0009)
      'learning_events',
      // Monetization Ledger (0010)
      'instructor_wallets', 'ledger_transactions', 'ledger_entries', 'payout_requests',
      // Discussions & Project Assignments (0011)
      'discussions', 'discussion_replies', 'discussion_votes',
      'assignments', 'assignment_submissions', 'assignment_grades'
    ];

    expect(requiredTables.length).toBe(45);
    for (const table of requiredTables) {
      expect(tableNames).toContain(table);
    }
  });

  it('3. PostgreSQL ENUM Types: Declared ENUM types exist in pg_type with correct values', async () => {
    expect(testPool).toBeDefined();

    const res = await testPool!.query(`
      SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) as labels
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      GROUP BY t.typname;
    `);

    const enums: Record<string, string[]> = {};
    for (const row of res.rows) {
      const labels = Array.isArray(row.labels)
        ? row.labels
        : typeof row.labels === 'string'
        ? row.labels.replace(/^\{|\}$/g, '').split(',')
        : [];
      enums[row.typname] = labels;
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
    expect(testPool).toBeDefined();

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
    expect(testPool).toBeDefined();

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
    expect(testPool).toBeDefined();

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
      INSERT INTO modules (course_id, title, position)
      VALUES ($1, 'FK Module', 1) RETURNING id;
    `, [courseId]);
    const modId = modRes.rows[0].id;

    const lesRes = await testPool!.query(`
      INSERT INTO lessons (module_id, title, lesson_type, position)
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
    expect(testPool).toBeDefined();

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
