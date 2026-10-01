import { newDb } from 'pg-mem';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../database/schema';
import { CryptoUtil } from '../common/auth/crypto.util';
import { SEED_ROLES, SEED_USERS } from '../database/seed/fixtures';
import * as crypto from 'crypto';

export async function createTestDatabase() {
  const memDb = newDb({ autoCreateForeignKeyIndices: true });

  // Register gen_random_uuid function for UUID generation
  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    returns: (memDb.public as any).getType('uuid'),
    implementation: () => crypto.randomUUID(),
    impure: true,
  });

  const { Pool } = memDb.adapters.createPg();
  const pool = new Pool();

  // Adapt queries for Drizzle ORM compatibility with pg-mem
  const wrapQuery = (origQuery: any) => {
    return function (queryTextOrConfig: any, values: any, callback: any) {
      if (typeof queryTextOrConfig === 'object' && queryTextOrConfig !== null) {
        delete queryTextOrConfig.types;
        const wantArray = queryTextOrConfig.rowMode === 'array';
        if (wantArray) {
          delete queryTextOrConfig.rowMode;
        }

        const transformResult = (res: any) => {
          if (res && res.rows && wantArray) {
            const fields = (res.fields && res.fields.length > 0)
              ? res.fields.map((f: any) => f.name)
              : (res.rows.length > 0 ? Object.keys(res.rows[0]) : []);

            res.rows = res.rows.map((row: any) => {
              if (Array.isArray(row)) return row;
              return fields.map((col: string) => row[col]);
            });
            res.rowMode = 'array';
          }
          return res;
        };

        if (typeof callback === 'function') {
          return origQuery(queryTextOrConfig, values, (err: any, res: any) => {
            if (err) return callback(err);
            callback(null, transformResult(res));
          });
        }

        const p = origQuery(queryTextOrConfig, values);
        if (p && typeof p.then === 'function') {
          return p.then(transformResult);
        }
        return transformResult(p);
      }
      return origQuery(queryTextOrConfig, values, callback);
    };
  };

  pool.query = wrapQuery(pool.query.bind(pool));

  const originalConnect = pool.connect.bind(pool);
  pool.connect = async function (...args: any[]) {
    const client = await originalConnect(...args);
    client.query = wrapQuery(client.query.bind(client));
    return client;
  };

  const db = drizzle(pool, { schema });

  // Create schema tables in test DB
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL,
      username varchar(50) NOT NULL UNIQUE,
      email varchar(255) NOT NULL UNIQUE,
      phone varchar(20) UNIQUE,
      password_hash varchar(255),
      is_active boolean DEFAULT true NOT NULL,
      is_verified boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      token varchar(255) NOT NULL UNIQUE,
      ip_address varchar(45),
      user_agent text,
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      provider varchar(50) NOT NULL,
      provider_account_id varchar(255) NOT NULL,
      access_token text,
      refresh_token text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(50) NOT NULL UNIQUE,
      description text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE cascade,
      assigned_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone varchar(20) NOT NULL,
      code_hash varchar(255) NOT NULL,
      attempts integer DEFAULT 0 NOT NULL,
      is_used boolean DEFAULT false NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid,
      action varchar(100) NOT NULL,
      target_type varchar(50) NOT NULL,
      target_id varchar(100),
      ip_address varchar(45),
      user_agent text,
      request_id varchar(100),
      metadata text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TYPE storage_provider AS ENUM('CLOUDINARY', 'LOCAL', 'S3');
    CREATE TYPE course_level AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS');
    CREATE TYPE course_status AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');
    CREATE TYPE course_visibility AS ENUM('PUBLIC', 'PRIVATE');
    CREATE TYPE lesson_type AS ENUM('VIDEO', 'TEXT', 'PDF');
    CREATE TYPE enrollment_status AS ENUM('ACTIVE', 'COMPLETED', 'CANCELLED');
    CREATE TYPE lesson_progress_status AS ENUM('IN_PROGRESS', 'COMPLETED');
    CREATE TYPE question_type AS ENUM('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');
    CREATE TYPE quiz_status AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');
    CREATE TYPE quiz_type AS ENUM('KNOWLEDGE_CHECK', 'FINAL_EXAM');
    CREATE TYPE attempt_status AS ENUM('IN_PROGRESS', 'SUBMITTED', 'ABANDONED');
    CREATE TYPE certificate_status AS ENUM('ACTIVE', 'REVOKED');

    CREATE TABLE IF NOT EXISTS categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(100) NOT NULL UNIQUE,
      slug varchar(120) NOT NULL UNIQUE,
      description text,
      is_active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      storage_provider storage_provider DEFAULT 'CLOUDINARY' NOT NULL,
      storage_key varchar(255) NOT NULL UNIQUE,
      public_url text NOT NULL,
      original_filename varchar(255) NOT NULL,
      mime_type varchar(100) NOT NULL,
      file_size integer NOT NULL,
      duration_seconds integer,
      metadata text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS courses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE restrict,
      instructor_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      title varchar(200) NOT NULL,
      slug varchar(250) NOT NULL UNIQUE,
      short_description varchar(500),
      description text,
      status course_status DEFAULT 'DRAFT' NOT NULL,
      visibility course_visibility DEFAULT 'PUBLIC' NOT NULL,
      price numeric(10, 2) DEFAULT '0.00' NOT NULL,
      currency varchar(3) DEFAULT 'USD' NOT NULL,
      level course_level DEFAULT 'BEGINNER' NOT NULL,
      language varchar(50) DEFAULT 'English' NOT NULL,
      duration_minutes integer DEFAULT 0 NOT NULL,
      thumbnail_media_id uuid REFERENCES media(id) ON DELETE set null,
      published_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE cascade,
      title varchar(200) NOT NULL,
      description text,
      position integer NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT modules_course_position_uq UNIQUE(course_id, position)
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      module_id uuid NOT NULL REFERENCES modules(id) ON DELETE cascade,
      title varchar(200) NOT NULL,
      description text,
      lesson_type lesson_type DEFAULT 'VIDEO' NOT NULL,
      position integer NOT NULL,
      duration_seconds integer DEFAULT 0 NOT NULL,
      is_preview boolean DEFAULT false NOT NULL,
      media_id uuid REFERENCES media(id) ON DELETE set null,
      content text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT lessons_module_position_uq UNIQUE(module_id, position)
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE restrict,
      status enrollment_status DEFAULT 'ACTIVE' NOT NULL,
      enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
      started_at timestamp with time zone,
      completed_at timestamp with time zone,
      last_accessed_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT enrollments_student_course_uq UNIQUE(student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_progress (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE cascade,
      lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE restrict,
      status lesson_progress_status DEFAULT 'IN_PROGRESS' NOT NULL,
      watch_position_seconds integer DEFAULT 0 NOT NULL,
      completed_at timestamp with time zone,
      last_accessed_at timestamp with time zone DEFAULT now() NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT lesson_progress_enrollment_lesson_uq UNIQUE(enrollment_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      module_id uuid NOT NULL REFERENCES modules(id) ON DELETE cascade,
      title varchar(200) NOT NULL,
      description text,
      position integer NOT NULL,
      quiz_type quiz_type DEFAULT 'KNOWLEDGE_CHECK' NOT NULL,
      passing_score_percentage integer DEFAULT 70 NOT NULL,
      max_attempts integer DEFAULT 3,
      time_limit_minutes integer,
      status quiz_status DEFAULT 'DRAFT' NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT quizzes_module_position_uq UNIQUE(module_id, position),
      CONSTRAINT quizzes_position_positive CHECK (position > 0),
      CONSTRAINT quizzes_passing_score_range CHECK (passing_score_percentage >= 1 AND passing_score_percentage <= 100),
      CONSTRAINT quizzes_max_attempts_positive CHECK (max_attempts IS NULL OR max_attempts > 0),
      CONSTRAINT quizzes_time_limit_positive CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0)
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE cascade,
      question_text text NOT NULL,
      question_type question_type DEFAULT 'SINGLE_CHOICE' NOT NULL,
      position integer NOT NULL,
      points integer DEFAULT 1 NOT NULL,
      explanation text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT quiz_questions_quiz_position_uq UNIQUE(quiz_id, position),
      CONSTRAINT quiz_questions_position_positive CHECK (position > 0),
      CONSTRAINT quiz_questions_points_positive CHECK (points > 0)
    );

    CREATE TABLE IF NOT EXISTS quiz_question_options (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE cascade,
      option_text text NOT NULL,
      position integer NOT NULL,
      is_correct boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT quiz_question_options_q_pos_uq UNIQUE(question_id, position),
      CONSTRAINT quiz_question_options_position_positive CHECK (position > 0)
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE restrict,
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE cascade,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      attempt_number integer NOT NULL,
      status attempt_status DEFAULT 'IN_PROGRESS' NOT NULL,
      score integer DEFAULT 0 NOT NULL,
      total_points integer DEFAULT 0 NOT NULL,
      percentage numeric(5, 2) DEFAULT 0.00 NOT NULL,
      is_passed boolean DEFAULT false NOT NULL,
      started_at timestamp with time zone DEFAULT now() NOT NULL,
      submitted_at timestamp with time zone,
      last_saved_at timestamp with time zone DEFAULT now() NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT quiz_attempts_enrollment_quiz_num_uq UNIQUE(enrollment_id, quiz_id, attempt_number),
      CONSTRAINT quiz_attempts_attempt_number_positive CHECK (attempt_number > 0),
      CONSTRAINT quiz_attempts_score_non_negative CHECK (score >= 0),
      CONSTRAINT quiz_attempts_total_points_non_negative CHECK (total_points >= 0),
      CONSTRAINT quiz_attempts_percentage_range CHECK (percentage >= 0 AND percentage <= 100)
    );

    CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_id uuid NOT NULL REFERENCES quiz_attempts(id) ON DELETE cascade,
      question_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE restrict,
      selected_option_ids text[] NOT NULL,
      is_correct boolean DEFAULT false NOT NULL,
      points_awarded integer DEFAULT 0 NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT quiz_attempt_answers_attempt_q_uq UNIQUE(attempt_id, question_id),
      CONSTRAINT quiz_attempt_answers_points_awarded_non_negative CHECK (points_awarded >= 0)
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      certificate_number varchar(50) NOT NULL UNIQUE,
      enrollment_id uuid NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE restrict,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE restrict,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      student_name varchar(200) NOT NULL,
      course_title varchar(250) NOT NULL,
      instructor_name varchar(200) NOT NULL,
      completed_at timestamp with time zone NOT NULL,
      issued_at timestamp with time zone DEFAULT now() NOT NULL,
      final_score_percentage integer,
      status certificate_status DEFAULT 'ACTIVE' NOT NULL,
      revoked_at timestamp with time zone,
      revocation_reason text,
      pdf_media_id uuid REFERENCES media(id) ON DELETE set null,
      pdf_url text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT certificates_score_range CHECK (final_score_percentage IS NULL OR (final_score_percentage >= 0 AND final_score_percentage <= 100))
    );
  `);

  // Seed baseline roles
  for (const role of SEED_ROLES) {
    await db.insert(schema.roles).values(role);
  }

  // Seed initial accounts
  const allRoles = await db.select().from(schema.roles);
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  for (const user of SEED_USERS) {
    const passwordHash = await CryptoUtil.hashPassword(user.password);
    const [created] = await db
      .insert(schema.users)
      .values({
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        passwordHash,
        isVerified: user.isVerified,
      })
      .returning();

    const roleId = roleMap.get(user.role);
    if (roleId) {
      await db.insert(schema.userRoles).values({
        userId: created.id,
        roleId,
      });
    }
  }

  return { db, pool };
}
