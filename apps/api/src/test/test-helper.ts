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

  // Register trim function for text normalization
  memDb.public.registerFunction({
    name: 'trim',
    args: [(memDb.public as any).getType('text')],
    returns: (memDb.public as any).getType('text'),
    implementation: (val: string) => (typeof val === 'string' ? val.trim() : val),
  });

  // Register length function for string length constraints
  memDb.public.registerFunction({
    name: 'length',
    args: [(memDb.public as any).getType('text')],
    returns: (memDb.public as any).getType('integer'),
    implementation: (val: string) => (typeof val === 'string' ? val.length : 0),
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
            const fields =
              res.fields && res.fields.length > 0
                ? res.fields.map((f: any) => f.name)
                : res.rows.length > 0
                  ? Object.keys(res.rows[0])
                  : [];

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
    CREATE TYPE order_status AS ENUM('PENDING', 'PAYMENT_PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
    CREATE TYPE payment_status AS ENUM('INITIATED', 'VALIDATED', 'FAILED', 'CANCELLED');
    CREATE TYPE coupon_discount_type AS ENUM('PERCENTAGE', 'FIXED_AMOUNT');
    CREATE TYPE coupon_redemption_status AS ENUM('RESERVED', 'CONSUMED', 'RELEASED');
    CREATE TYPE invoice_status AS ENUM('PAID', 'REFUNDED', 'VOID');
    CREATE TYPE refund_status AS ENUM('PENDING', 'PROCESSED', 'FAILED');
    CREATE TYPE refund_request_status AS ENUM('PENDING', 'APPROVED', 'REJECTED');
    CREATE TYPE refund_request_reason_category AS ENUM('COURSE_CONTENT_MISMATCH', 'TECHNICAL_ISSUES', 'ACCIDENTAL_PURCHASE', 'PERSONAL_REASONS', 'OTHER');

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
      uploader_id uuid REFERENCES users(id) ON DELETE set null,
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
      currency varchar(3) DEFAULT 'BDT' NOT NULL,
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
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE restrict,
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

    CREATE UNIQUE INDEX IF NOT EXISTS certificates_active_enrollment_uq ON certificates (enrollment_id) WHERE status = 'ACTIVE';

    CREATE TABLE IF NOT EXISTS coupons (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code varchar(50) NOT NULL UNIQUE,
      discount_type coupon_discount_type NOT NULL,
      discount_value integer NOT NULL,
      min_order_amount_cents integer DEFAULT 0 NOT NULL,
      max_discount_amount_cents integer,
      course_id uuid REFERENCES courses(id) ON DELETE set null,
      usage_limit integer,
      redemption_count integer DEFAULT 0 NOT NULL,
      per_user_limit integer DEFAULT 1 NOT NULL,
      starts_at timestamp with time zone NOT NULL,
      expires_at timestamp with time zone,
      is_active boolean DEFAULT true NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT coupons_discount_value_positive CHECK (discount_value > 0),
      CONSTRAINT coupons_min_order_amount_non_negative CHECK (min_order_amount_cents >= 0),
      CONSTRAINT coupons_max_discount_amount_positive CHECK (max_discount_amount_cents IS NULL OR max_discount_amount_cents > 0),
      CONSTRAINT coupons_usage_limit_positive CHECK (usage_limit IS NULL OR usage_limit > 0),
      CONSTRAINT coupons_redemption_count_non_negative CHECK (redemption_count >= 0),
      CONSTRAINT coupons_per_user_limit_positive CHECK (per_user_limit > 0)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_number varchar(50) NOT NULL UNIQUE,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      status order_status DEFAULT 'PENDING' NOT NULL,
      subtotal_cents integer NOT NULL,
      discount_cents integer DEFAULT 0 NOT NULL,
      payable_cents integer NOT NULL,
      currency varchar(3) DEFAULT 'BDT' NOT NULL,
      coupon_id uuid REFERENCES coupons(id) ON DELETE set null,
      coupon_code varchar(50),
      expires_at timestamp with time zone NOT NULL,
      paid_at timestamp with time zone,
      cancelled_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT orders_subtotal_cents_non_negative CHECK (subtotal_cents >= 0),
      CONSTRAINT orders_discount_cents_non_negative CHECK (discount_cents >= 0),
      CONSTRAINT orders_payable_cents_non_negative CHECK (payable_cents >= 0),
      CONSTRAINT orders_payable_lte_subtotal CHECK (payable_cents <= subtotal_cents)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE cascade,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE restrict,
      course_title varchar(250) NOT NULL,
      unit_price_cents integer NOT NULL,
      discount_cents integer DEFAULT 0 NOT NULL,
      payable_cents integer NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT order_items_order_course_uq UNIQUE(order_id, course_id),
      CONSTRAINT order_items_unit_price_cents_non_negative CHECK (unit_price_cents >= 0),
      CONSTRAINT order_items_discount_cents_non_negative CHECK (discount_cents >= 0),
      CONSTRAINT order_items_payable_cents_non_negative CHECK (payable_cents >= 0),
      CONSTRAINT order_items_payable_lte_unit_price CHECK (payable_cents <= unit_price_cents)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE restrict,
      merchant_tran_id varchar(100) NOT NULL UNIQUE,
      provider varchar(50) DEFAULT 'SSLCOMMERZ' NOT NULL,
      provider_session_key varchar(255),
      val_id varchar(100),
      bank_tran_id varchar(100),
      amount_cents integer NOT NULL,
      currency varchar(3) DEFAULT 'BDT' NOT NULL,
      status payment_status DEFAULT 'INITIATED' NOT NULL,
      card_type varchar(50),
      card_brand varchar(50),
      gateway_fee_cents integer,
      initiated_at timestamp with time zone DEFAULT now() NOT NULL,
      validated_at timestamp with time zone,
      raw_response text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT payments_amount_cents_non_negative CHECK (amount_cents >= 0),
      CONSTRAINT payments_gateway_fee_cents_non_negative CHECK (gateway_fee_cents IS NULL OR gateway_fee_cents >= 0)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS payments_val_id_uq ON payments (val_id) WHERE val_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE restrict,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE restrict,
      status coupon_redemption_status DEFAULT 'RESERVED' NOT NULL,
      discount_cents integer NOT NULL,
      reserved_at timestamp with time zone DEFAULT now() NOT NULL,
      consumed_at timestamp with time zone,
      released_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT coupon_redemptions_discount_cents_non_negative CHECK (discount_cents >= 0)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number varchar(50) NOT NULL UNIQUE,
      order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE restrict,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      student_name varchar(150) NOT NULL,
      student_email varchar(255) NOT NULL,
      student_phone varchar(50),
      course_title varchar(250) NOT NULL,
      subtotal_cents integer NOT NULL,
      discount_cents integer DEFAULT 0 NOT NULL,
      payable_cents integer NOT NULL,
      currency varchar(3) DEFAULT 'BDT' NOT NULL,
      payment_method varchar(50) NOT NULL,
      bank_tran_id varchar(100) NOT NULL,
      status invoice_status NOT NULL,
      issued_at timestamp with time zone DEFAULT now() NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT invoices_subtotal_cents_non_negative CHECK (subtotal_cents >= 0),
      CONSTRAINT invoices_discount_cents_non_negative CHECK (discount_cents >= 0),
      CONSTRAINT invoices_payable_cents_non_negative CHECK (payable_cents >= 0),
      CONSTRAINT invoices_payable_lte_subtotal CHECK (payable_cents <= subtotal_cents)
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      refund_number varchar(50) NOT NULL UNIQUE,
      order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE restrict,
      payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE restrict,
      amount_cents integer NOT NULL,
      currency varchar(3) DEFAULT 'BDT' NOT NULL,
      reason text NOT NULL,
      status refund_status DEFAULT 'PENDING' NOT NULL,
      processed_by uuid REFERENCES users(id) ON DELETE restrict,
      provider_refund_ref varchar(100),
      processed_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT refunds_amount_cents_non_negative CHECK (amount_cents >= 0),
      CONSTRAINT refunds_currency_bdt CHECK (currency = 'BDT'),
      CONSTRAINT refunds_reason_non_empty CHECK (length(trim(reason)) >= 5)
    );

    CREATE TABLE IF NOT EXISTS refund_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      request_number varchar(50) NOT NULL UNIQUE,
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE restrict,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE restrict,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE restrict,
      enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE restrict,
      reason_category refund_request_reason_category NOT NULL,
      reason_detail text NOT NULL,
      course_progress_at_request integer NOT NULL,
      status refund_request_status DEFAULT 'PENDING' NOT NULL,
      reviewed_by uuid REFERENCES users(id) ON DELETE restrict,
      reviewed_at timestamp with time zone,
      rejection_reason text,
      admin_notes text,
      refund_id uuid REFERENCES refunds(id) ON DELETE restrict,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT refund_requests_progress_range CHECK (course_progress_at_request >= 0 AND course_progress_at_request <= 100),
      CONSTRAINT refund_requests_reason_detail_min_len CHECK (length(trim(reason_detail)) >= 10)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_active_order_uq ON refund_requests (order_id) WHERE status IN ('PENDING', 'APPROVED');

    CREATE TYPE notification_category AS ENUM('TRANSACTIONAL', 'ACADEMIC', 'SYSTEM');
    CREATE TYPE delivery_channel AS ENUM('EMAIL', 'IN_APP', 'SMS');
    CREATE TYPE delivery_status AS ENUM('PENDING', 'DELIVERED', 'FAILED');
    CREATE TYPE outbox_status AS ENUM('PENDING', 'PUBLISHED', 'FAILED');

    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
      title varchar(255) NOT NULL,
      message text NOT NULL,
      category notification_category DEFAULT 'TRANSACTIONAL' NOT NULL,
      action_url text,
      is_read boolean DEFAULT false NOT NULL,
      read_at timestamp with time zone,
      metadata text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE cascade,
      email_order_updates boolean DEFAULT true NOT NULL,
      email_course_updates boolean DEFAULT true NOT NULL,
      email_promotions boolean DEFAULT false NOT NULL,
      in_app_all boolean DEFAULT true NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id uuid REFERENCES notifications(id) ON DELETE set null,
      channel delivery_channel NOT NULL,
      status delivery_status DEFAULT 'PENDING' NOT NULL,
      recipient varchar(255) NOT NULL,
      provider_message_id varchar(255),
      attempt_count integer DEFAULT 1 NOT NULL,
      last_error text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar(100) NOT NULL UNIQUE,
      event_type varchar(100) NOT NULL,
      actor_id uuid REFERENCES users(id) ON DELETE set null,
      entity_id varchar(100) NOT NULL,
      entity_type varchar(50) NOT NULL,
      payload text NOT NULL,
      status outbox_status DEFAULT 'PENDING' NOT NULL,
      retry_count integer DEFAULT 0 NOT NULL,
      last_error text,
      published_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL
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
