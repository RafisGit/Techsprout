import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../app.module';
import { DatabaseService, DRIZZLE_DB } from '../database/drizzle.provider';
import { createTestDatabase } from './test-helper';
import { parseAllowedOrigins, buildCspDirectives } from '../common/security/csp.util';

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

    const testOrigins = parseAllowedOrigins(
      'https://techsprout-frthqjqb8-tech-sprout.vercel.app,https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app'
    );
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: buildCspDirectives(testOrigins),
        },
        crossOriginEmbedderPolicy: false,
      })
    );
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
    expect(res.body.services.database).toBe('up');
  });

  it('1b. HTTP response includes Content-Security-Policy with separated connect-src origins and zero commas', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("connect-src 'self' https://techsprout-frthqjqb8-tech-sprout.vercel.app https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app");
    const connectSrcPart = csp.split(';').find((p: string) => p.trim().startsWith('connect-src'));
    expect(connectSrcPart).toBeDefined();
    expect(connectSrcPart).not.toContain(',');
  });

  it('2. GET /api/v1/health/ready returns ready status', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it('3. GET /api/v1/auth/me without credentials returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('UNAUTHENTICATED');
  });

  it('4. GET /api/v1/admin/users without credentials returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('5. POST /api/v1/auth/register with attempted role=admin grants only student role', async () => {
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

  it('6. Student user cannot access /api/v1/admin/users (403 FORBIDDEN)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'student@techsprout.edu',
        password: 'StudentPassword123!',
      });

    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Cookie', cookies);

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.success).toBe(false);
    expect(adminRes.body.errorCode).toBe('FORBIDDEN');
  });

  it('7. Admin user can access /api/v1/admin/users (200 OK)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@techsprout.edu',
        password: 'AdminPassword123!',
      });

    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const adminRes = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Cookie', cookies);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(Array.isArray(adminRes.body.data)).toBe(true);
  });

  it('8. Phone OTP send and verify establishes authenticated session with HttpOnly cookie', async () => {
    const phone = '01755443322';
    const sendRes = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/send')
      .send({ phone });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);
    const code = sendRes.body.debugCode;
    expect(code).toBeDefined();

    // Verify OTP
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, otp: code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.user.phone).toBe(phone);
    expect(verifyRes.body.token).toBeDefined();

    const setCookies = verifyRes.headers['set-cookie'];
    expect(setCookies).toBeDefined();
    expect(setCookies[0]).toContain('techsprout_session');

    // Access /auth/me with session cookie
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', setCookies);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.phone).toBe(phone);
  });

  it('9. GET /api/v1/auth/google initiates OAuth and returns authorization URL', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/google');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toContain('https://accounts.google.com');
    expect(res.body.state).toBeDefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('google_oauth_state');
  });

  it('10. GET /api/v1/auth/google/callback validates code and state and issues session cookie', async () => {
    const state = 'valid_e2e_state_123';
    const mockCode = 'mock_code:e2e_google_sub:user%40google.com:E2EGoogleUser';

    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/google/callback?code=${mockCode}&state=${state}`)
      .set('Cookie', [`google_oauth_state=${state}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('user@google.com');
    expect(res.body.token).toBeDefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieList = Array.isArray(cookies) ? cookies : [cookies as string];
    expect(cookieList.some((c: string) => c.includes('techsprout_session'))).toBe(true);
  });

  it('11. Logout invalidates session cookie', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'student@techsprout.edu',
        password: 'StudentPassword123!',
      });

    const cookies = loginRes.headers['set-cookie'];

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies);

    expect(logoutRes.status).toBe(200);

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies);

    expect(meRes.status).toBe(401);
  });
});
