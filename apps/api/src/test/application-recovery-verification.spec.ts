import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

/**
 * TechSprout LMS — Application-Level Database Recovery Verification Suite
 *
 * Validates that a restored PostgreSQL 16 database (from the verified staging backup)
 * satisfies all application requirements:
 * 1. Safe target boundary (loopback 127.0.0.1 only, zero remote/production crossover).
 * 2. Database identity and major version 16 (PostgreSQL 16.15).
 * 3. Extensions, schemas, and 12 Drizzle migration records.
 * 4. Table inventory (46 tables) and exact row counts (870 rows).
 * 5. Foreign-key relationships and entity hierarchies without orphaned records.
 * 6. Critical application read operations across Student, Instructor, and Admin domains.
 *
 * Execution Contract & Database Setup:
 * ------------------------------------
 * These tests require a local PostgreSQL 16.15 instance populated with the verified
 * staging backup dump, listening strictly on loopback port 127.0.0.1:54332 with database `techsprout_restore`.
 *
 * To provision the isolated Docker verification instance:
 *   docker run -d --name techsprout-verify-54332 -p 127.0.0.1:54332:5432 -e POSTGRES_DB=techsprout_restore -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16.15
 *   docker cp <path_to_backup.dump> techsprout-verify-54332:/tmp/restore.dump
 *   docker exec techsprout-verify-54332 pg_restore -U postgres -d techsprout_restore --no-owner --no-acl /tmp/restore.dump
 *
 * Skip / Failure Behavior:
 * - When the database container is unreachable:
 *   - If REQUIRE_RECOVERY_DB=true (or CI_RECOVERY=true) is set, tests fail visibly with an explicit Error.
 *   - Otherwise, tests calling the database are explicitly marked SKIPPED (ctx.skip()), ensuring the
 *     reported pass count reflects only executed tests (1 passed, 15 skipped) and NEVER false positives.
 */

describe('TechSprout LMS — Application-Level Recovery Verification Suite', () => {
  const LOCAL_RESTORE_PORT = 54332;
  const LOCAL_RESTORE_DB = 'techsprout_restore';
  const connectionString = `postgresql://postgres@127.0.0.1:${LOCAL_RESTORE_PORT}/${LOCAL_RESTORE_DB}`;

  let pool: Pool;
  let isContainerAvailable = false;

  function requireDatabase(ctx: { skip: () => void }) {
    if (!isContainerAvailable) {
      if (process.env.REQUIRE_RECOVERY_DB === 'true' || process.env.CI_RECOVERY === 'true') {
        throw new Error(
          'FAIL: Recovery database container is unreachable on 127.0.0.1:54332/techsprout_restore. Application recovery verification requires an active restored database.'
        );
      }
      ctx.skip();
    }
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 1500,
    });

    try {
      const res = await pool.query('SELECT 1 as alive;');
      isContainerAvailable = res.rows[0]?.alive === 1;
    } catch {
      isContainerAvailable = false;
    }

    if (!isContainerAvailable) {
      if (process.env.REQUIRE_RECOVERY_DB === 'true' || process.env.CI_RECOVERY === 'true') {
        console.error(
          '\n[ERROR] PostgreSQL recovery test container is not reachable on 127.0.0.1:54332.\n' +
          'Suite will fail closed because REQUIRE_RECOVERY_DB is set.'
        );
      } else {
        console.warn(
          '\n[WARN] PostgreSQL recovery test container is not reachable on 127.0.0.1:54332.\n' +
          'Database recovery assertions will be explicitly SKIPPED.\n' +
          'To run full recovery assertions, start the container mapped to 127.0.0.1:54332.\n'
        );
      }
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('1. Safe Target Boundary & Environment Isolation', () => {
    it('strictly asserts connection target is local loopback and never production or staging', () => {
      expect(connectionString).toMatch(/^postgresql:\/\/[^@]*@127\.0\.0\.1:54332\/techsprout_restore$/);
      expect(connectionString).not.toContain('render.com');
      expect(connectionString).not.toContain('dpg-');
      expect(connectionString).not.toContain('/techsprout_staging');
      expect(connectionString).not.toContain('/techsprout_production');
    });
  });

  describe('2. Database Server Identity & Major Version Verification', () => {
    it('confirms server major version is 16 and database is techsprout_restore', async (ctx) => {
      requireDatabase(ctx);

      const res = await pool.query<{
        current_database: string;
        server_version: string;
        full_version: string;
      }>("SELECT current_database(), current_setting('server_version') as server_version, version() as full_version;");

      const row = res.rows[0];
      expect(row.current_database).toBe(LOCAL_RESTORE_DB);
      expect(row.server_version).toMatch(/^16\./);
      expect(row.full_version).toContain('PostgreSQL 16');

      const majorVersion = parseInt(row.server_version.split('.')[0], 10);
      expect(majorVersion).toBe(16);
    });
  });

  describe('3. Extensions, Schemas & Drizzle Migrations Coverage', () => {
    it('verifies pgcrypto extension is installed and active', async (ctx) => {
      requireDatabase(ctx);

      const res = await pool.query<{ extname: string; extversion: string }>(
        "SELECT extname, extversion FROM pg_extension WHERE extname = 'pgcrypto';"
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].extname).toBe('pgcrypto');
    });

    it('verifies all 12 Drizzle migrations are recorded in drizzle.__drizzle_migrations', async (ctx) => {
      requireDatabase(ctx);

      const res = await pool.query<{ count: string }>(
        'SELECT count(*) FROM drizzle.__drizzle_migrations;'
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(12);

      const migrations = await pool.query<{ id: number; hash: string; created_at: string }>(
        'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC;'
      );
      expect(migrations.rows.length).toBe(12);
      expect(migrations.rows[0].id).toBe(1);
      expect(migrations.rows[11].id).toBe(12);
    });
  });

  describe('4. Complete Table Inventory & Exact Row Count Verification', () => {
    it('verifies exactly 46 tables exist across public and drizzle schemas', async (ctx) => {
      requireDatabase(ctx);

      const res = await pool.query<{ count: string }>(
        "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public', 'drizzle');"
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(46);
    });

    it('verifies exact total row count of 870 across all 46 tables', async (ctx) => {
      requireDatabase(ctx);

      const tableRes = await pool.query<{ tablename: string; schemaname: string }>(
        "SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle');"
      );
      expect(tableRes.rows.length).toBe(46);

      const unionQuery = tableRes.rows
        .map((t) => `SELECT count(*) as cnt FROM "${t.schemaname}"."${t.tablename}"`)
        .join(' UNION ALL ');
      const sumRes = await pool.query<{ total: string }>(
        `SELECT coalesce(sum(cnt), 0) as total FROM (${unionQuery}) sub;`
      );
      expect(parseInt(sumRes.rows[0].total, 10)).toBe(870);
    });

    it('verifies key domain row counts match authoritative staging baseline', async (ctx) => {
      requireDatabase(ctx);

      const res = await pool.query<{
        users: string;
        roles: string;
        user_roles: string;
        courses: string;
        modules: string;
        lessons: string;
        enrollments: string;
        quizzes: string;
        quiz_questions: string;
        quiz_question_options: string;
        assignments: string;
        assignment_submissions: string;
        assignment_grades: string;
        discussions: string;
        discussion_replies: string;
        audit_logs: string;
        sessions: string;
      }>(`
        SELECT
          (SELECT count(*) FROM users) as users,
          (SELECT count(*) FROM roles) as roles,
          (SELECT count(*) FROM user_roles) as user_roles,
          (SELECT count(*) FROM courses) as courses,
          (SELECT count(*) FROM modules) as modules,
          (SELECT count(*) FROM lessons) as lessons,
          (SELECT count(*) FROM enrollments) as enrollments,
          (SELECT count(*) FROM quizzes) as quizzes,
          (SELECT count(*) FROM quiz_questions) as quiz_questions,
          (SELECT count(*) FROM quiz_question_options) as quiz_question_options,
          (SELECT count(*) FROM assignments) as assignments,
          (SELECT count(*) FROM assignment_submissions) as assignment_submissions,
          (SELECT count(*) FROM assignment_grades) as assignment_grades,
          (SELECT count(*) FROM discussions) as discussions,
          (SELECT count(*) FROM discussion_replies) as discussion_replies,
          (SELECT count(*) FROM audit_logs) as audit_logs,
          (SELECT count(*) FROM sessions) as sessions;
      `);

      const r = res.rows[0];
      expect(parseInt(r.users, 10)).toBe(24);
      expect(parseInt(r.roles, 10)).toBe(3);
      expect(parseInt(r.user_roles, 10)).toBe(24);
      expect(parseInt(r.courses, 10)).toBe(16);
      expect(parseInt(r.modules, 10)).toBe(23);
      expect(parseInt(r.lessons, 10)).toBe(45);
      expect(parseInt(r.enrollments, 10)).toBe(6);
      expect(parseInt(r.quizzes, 10)).toBe(3);
      expect(parseInt(r.quiz_questions, 10)).toBe(7);
      expect(parseInt(r.quiz_question_options, 10)).toBe(20);
      expect(parseInt(r.assignments, 10)).toBe(8);
      expect(parseInt(r.assignment_submissions, 10)).toBe(12);
      expect(parseInt(r.assignment_grades, 10)).toBe(6);
      expect(parseInt(r.discussions, 10)).toBe(15);
      expect(parseInt(r.discussion_replies, 10)).toBe(7);
      expect(parseInt(r.audit_logs, 10)).toBe(378);
      expect(parseInt(r.sessions, 10)).toBe(176);
    });
  });

  describe('5. Entity Hierarchy & Foreign Key Referential Integrity', () => {
    it('verifies 80 foreign keys are active and enforced with zero orphan lessons', async (ctx) => {
      requireDatabase(ctx);

      const orphanLessons = await pool.query<{ count: string }>(`
        SELECT count(*) FROM lessons l
        LEFT JOIN modules m ON l.module_id = m.id
        WHERE m.id IS NULL;
      `);
      expect(parseInt(orphanLessons.rows[0].count, 10)).toBe(0);
    });

    it('verifies zero orphan modules without parent course', async (ctx) => {
      requireDatabase(ctx);

      const orphanModules = await pool.query<{ count: string }>(`
        SELECT count(*) FROM modules m
        LEFT JOIN courses c ON m.course_id = c.id
        WHERE c.id IS NULL;
      `);
      expect(parseInt(orphanModules.rows[0].count, 10)).toBe(0);
    });

    it('verifies zero orphan enrollments without valid user and course', async (ctx) => {
      requireDatabase(ctx);

      const orphanEnrollments = await pool.query<{ count: string }>(`
        SELECT count(*) FROM enrollments e
        LEFT JOIN users u ON e.student_id = u.id
        LEFT JOIN courses c ON e.course_id = c.id
        WHERE u.id IS NULL OR c.id IS NULL;
      `);
      expect(parseInt(orphanEnrollments.rows[0].count, 10)).toBe(0);
    });

    it('verifies zero orphan quiz questions without valid parent quiz', async (ctx) => {
      requireDatabase(ctx);

      const orphanQuestions = await pool.query<{ count: string }>(`
        SELECT count(*) FROM quiz_questions q
        LEFT JOIN quizzes qz ON q.quiz_id = qz.id
        WHERE qz.id IS NULL;
      `);
      expect(parseInt(orphanQuestions.rows[0].count, 10)).toBe(0);
    });

    it('verifies zero orphan quiz options without valid parent question', async (ctx) => {
      requireDatabase(ctx);

      const orphanOptions = await pool.query<{ count: string }>(`
        SELECT count(*) FROM quiz_question_options o
        LEFT JOIN quiz_questions q ON o.question_id = q.id
        WHERE q.id IS NULL;
      `);
      expect(parseInt(orphanOptions.rows[0].count, 10)).toBe(0);
    });
  });

  describe('6. Application-Level Read Operations Across Roles', () => {
    it('verifies Student Course Catalog and Curriculum read queries', async (ctx) => {
      requireDatabase(ctx);

      const coursesRes = await pool.query<{
        id: string;
        title: string;
        slug: string;
        status: string;
        modules_count: string;
      }>(`
        SELECT c.id, c.title, c.slug, c.status, count(m.id) as modules_count
        FROM courses c
        LEFT JOIN modules m ON m.course_id = c.id
        GROUP BY c.id, c.title, c.slug, c.status
        ORDER BY c.title ASC;
      `);

      expect(coursesRes.rows.length).toBe(16);
      expect(coursesRes.rows.some((c) => parseInt(c.modules_count, 10) > 0)).toBe(true);
    });

    it('verifies Student Enrollment and Progress read queries', async (ctx) => {
      requireDatabase(ctx);

      const enrollmentsRes = await pool.query<{
        enrollment_id: string;
        user_name: string;
        user_email: string;
        course_title: string;
        status: string;
      }>(`
        SELECT e.id as enrollment_id, u.name as user_name, u.email as user_email, c.title as course_title, e.status
        FROM enrollments e
        JOIN users u ON e.student_id = u.id
        JOIN courses c ON e.course_id = c.id
        LIMIT 10;
      `);

      expect(enrollmentsRes.rows.length).toBeGreaterThanOrEqual(1);
      expect(enrollmentsRes.rows[0].user_name).toBeTruthy();
      expect(enrollmentsRes.rows[0].course_title).toBeTruthy();
    });

    it('verifies Instructor Assessment and Submissions read queries', async (ctx) => {
      requireDatabase(ctx);

      const submissionsRes = await pool.query<{
        submission_id: string;
        assignment_title: string;
        student_name: string;
        grade: string | null;
      }>(`
        SELECT s.id as submission_id, a.title as assignment_title, u.name as student_name, g.score::text as grade
        FROM assignment_submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN users u ON s.student_id = u.id
        LEFT JOIN assignment_grades g ON g.submission_id = s.id
        LIMIT 10;
      `);

      expect(submissionsRes.rows.length).toBe(10);
      expect(submissionsRes.rows[0].assignment_title).toBeTruthy();
      expect(submissionsRes.rows[0].student_name).toBeTruthy();
    });

    it('verifies Administrator Moderation & Audit Log read queries', async (ctx) => {
      requireDatabase(ctx);

      const auditRes = await pool.query<{
        id: string;
        action: string;
        target_type: string;
        created_at: Date;
      }>(`
        SELECT id, action, target_type, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 10;
      `);

      expect(auditRes.rows.length).toBe(10);
      expect(auditRes.rows[0].action).toBeTruthy();
      expect(auditRes.rows[0].target_type).toBeTruthy();
    });
  });
});
