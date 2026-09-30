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
