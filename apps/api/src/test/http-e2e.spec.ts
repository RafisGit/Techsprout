import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';

describe('P1 HTTP Controller & RBAC Guard E2E Test Suite', () => {
  let app: INestApplication;
  let testDb: any;
  let testPool: any;

  beforeAll(async () => {
    const mem = await createTestDatabase();
    testDb = mem.db;
    testPool = mem.pool;

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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testPool) {
      await testPool.end();
    }
  });

  it('1. GET /api/v1/health returns system operational status', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.environment).toBeDefined();
  });

  it('2. GET /api/v1/auth/me without credentials returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('UNAUTHENTICATED');
  });

  it('3. GET /api/v1/admin/users without credentials returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('4. POST /api/v1/auth/register with attempted role=admin grants only student role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Shakib Al Hasan',
        username: 'shakib75',
        email: 'shakib75@techsprout.edu',
        phone: '01799112233',
        password: 'StrongP@ssword123',
        role: 'admin', // Attempted role escalation
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('student');
    expect(res.body.user.role).not.toBe('admin');
  });

  it('5. Student user cannot access /api/v1/admin/users (403 FORBIDDEN)', async () => {
    // Login as student
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'student@techsprout.edu',
        password: 'StudentPassword123!',
      });

    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Attempt to access admin endpoint with student cookie
    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Cookie', cookies);

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.success).toBe(false);
    expect(adminRes.body.errorCode).toBe('FORBIDDEN');
  });

  it('6. Admin user can access /api/v1/admin/users (200 OK)', async () => {
    // Login as admin
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@techsprout.edu',
        password: 'AdminPassword123!',
      });

    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // Access admin endpoint
    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Cookie', cookies);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(Array.isArray(adminRes.body.data)).toBe(true);
  });

  it('7. Logout invalidates session cookie', async () => {
    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'student@techsprout.edu',
        password: 'StudentPassword123!',
      });

    const cookies = loginRes.headers['set-cookie'];

    // Logout
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies);

    expect(logoutRes.status).toBe(200);

    // Attempt to access /auth/me with revoked cookie
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies);

    expect(meRes.status).toBe(401);
  });
});
