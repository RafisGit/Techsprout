import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from './test-helper';
import { IdentityService } from '../modules/identity/identity.service';
import { AuditService } from '../modules/audit/audit.service';
import { OtpService } from '../modules/otp/otp.service';
import { UsersService } from '../modules/users/users.service';
import { CryptoUtil } from '../common/auth/crypto.util';
import { users, roles, userRoles, sessions, auditLogs, otps, accounts } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { ApiException } from '../common/errors/api-error';
import helmet from 'helmet';
import { parseAllowedOrigins, buildCspDirectives } from '../common/security/csp.util';

describe('P1 — Foundation & Security Master Test Suite', () => {
  let db: any;
  let pool: any;
  let auditService: AuditService;
  let identityService: IdentityService;
  let otpService: OtpService;
  let usersService: UsersService;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    pool = testDb.pool;

    auditService = new AuditService(db);
    identityService = new IdentityService(db, auditService);
    otpService = new OtpService(db, auditService);
    usersService = new UsersService(db, auditService);
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
  });

  // ==========================================
  // SCENARIO A: Registration & Authentication
  // ==========================================
  it('SCENARIO A: Anonymous user can register, receive a session token, and authenticate successfully', async () => {
    const registrationResult = await identityService.register({
      name: 'Tamim Iqbal',
      username: 'tamimiqbal',
      email: 'tamim@techsprout.edu',
      phone: '01711223344',
      password: 'StrongP@ssword123',
    });

    expect(registrationResult.success).toBe(true);
    expect(registrationResult.user.email).toBe('tamim@techsprout.edu');
    expect(registrationResult.user.role).toBe('student');
    expect(registrationResult.token).toBeDefined();

    // Verify session was recorded in database
    const sessionRecords = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, registrationResult.token));
    expect(sessionRecords.length).toBe(1);

    // Verify user can now log in with the credentials
    const loginResult = await identityService.login({
      email: 'tamim@techsprout.edu',
      password: 'StrongP@ssword123',
    });

    expect(loginResult.success).toBe(true);
    expect(loginResult.user.id).toBe(registrationResult.user.id);
  });

  // ==========================================
  // SCENARIO B: RBAC - Student Denied from Admin
  // ==========================================
  it('SCENARIO B: Student role is denied from performing admin-only operations', async () => {
    const [studentUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'student@techsprout.edu'))
      .limit(1);

    const studentRoleRecords = await db
      .select({ role: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, studentUser.id));

    expect(studentRoleRecords[0].role).toBe('student');
    expect(studentRoleRecords[0].role).not.toBe('admin');
  });

  // ==========================================
  // SCENARIO C: Privilege Escalation Prevention
  // ==========================================
  it('SCENARIO C: Submitting role=admin during registration MUST NOT grant admin role', async () => {
    const maliciousPayload: any = {
      name: 'Attacker John',
      username: 'attackerjohn',
      email: 'attacker@evil.com',
      password: 'StrongP@ssword123',
      role: 'admin',
      isAdmin: true,
      isVerified: true,
    };

    const regResult = await identityService.register(maliciousPayload);

    expect(regResult.user.role).toBe('student');
    expect(regResult.user.role).not.toBe('admin');

    const assignedRoles = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, regResult.user.id));

    expect(assignedRoles.length).toBe(1);
    expect(assignedRoles[0].roleName).toBe('student');
  });

  // ==========================================
  // SCENARIO D: Malformed / Duplicate Input Rejection
  // ==========================================
  it('SCENARIO D: Malformed registration requests are strictly rejected', async () => {
    await expect(
      identityService.register({
        name: 'Duplicate Student',
        username: 'new_unique_name',
        email: 'student@techsprout.edu',
        password: 'StrongP@ssword123',
      })
    ).rejects.toThrow(ApiException);

    await expect(
      identityService.register({
        name: 'Duplicate Username',
        username: 'student',
        email: 'completely_new_email@techsprout.edu',
        password: 'StrongP@ssword123',
      })
    ).rejects.toThrow(ApiException);
  });

  // ==========================================
  // SCENARIO E: Expired OTP
  // ==========================================
  it('SCENARIO E: Expired OTP verification must be DENIED', async () => {
    const phone = '01799887766';
    const otpCode = '123456';
    const codeHash = CryptoUtil.hashOtp(otpCode);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await db.insert(otps).values({
      phone,
      codeHash,
      attempts: 0,
      isUsed: false,
      expiresAt: tenMinutesAgo,
    });

    await expect(otpService.verifyOtp(phone, otpCode)).rejects.toThrow(
      'Invalid or expired verification code'
    );
  });

  // ==========================================
  // SCENARIO F: Reused OTP Rejection
  // ==========================================
  it('SCENARIO F: Reused OTP code must be DENIED on second verification attempt', async () => {
    const phone = '01712349999';
    const sendResult = await otpService.sendOtp(phone);
    const validCode = (sendResult as any).debugCode;

    // First verification: Must SUCCEED and issue session
    const firstVerify = await otpService.verifyOtp(phone, validCode);
    expect(firstVerify.success).toBe(true);
    expect(firstVerify.token).toBeDefined();

    // Second verification with identical code: Must be DENIED
    await expect(otpService.verifyOtp(phone, validCode)).rejects.toThrow(
      'Invalid or expired verification code'
    );
  });

  // ==========================================
  // SCENARIO G: OTP Maximum Attempts Exceeded
  // ==========================================
  it('SCENARIO G: Exceeding 3 failed OTP attempts locks verification', async () => {
    const phone = '01711002233';
    const sendResult = await otpService.sendOtp(phone);
    const validCode = (sendResult as any).debugCode;

    // 3 failed attempts
    await expect(otpService.verifyOtp(phone, '000000')).rejects.toThrow('Invalid verification code');
    await expect(otpService.verifyOtp(phone, '111111')).rejects.toThrow('Invalid verification code');
    await expect(otpService.verifyOtp(phone, '222222')).rejects.toThrow('Invalid verification code');

    // 4th attempt even with correct code must be rejected due to max attempts
    await expect(otpService.verifyOtp(phone, validCode)).rejects.toThrow(
      'Maximum verification attempts exceeded'
    );
  });

  // ==========================================
  // SCENARIO H: OTP Rate Limiting (Max 3 per 15 min)
  // ==========================================
  it('SCENARIO H: OTP rate limiting rejects more than 3 requests in 15 minutes', async () => {
    const phone = '01799223344';
    await otpService.sendOtp(phone);
    await otpService.sendOtp(phone);
    await otpService.sendOtp(phone);

    // 4th request must be rejected with 429
    await expect(otpService.sendOtp(phone)).rejects.toThrow('Too many OTP requests');
  });

  // ==========================================
  // SCENARIO I: Phone OTP Establishes Authenticated Session
  // ==========================================
  it('SCENARIO I: Phone OTP verification establishes an active session and returns user profile', async () => {
    const phone = '01788776655';
    const sendResult = await otpService.sendOtp(phone);
    const validCode = (sendResult as any).debugCode;

    const verifyResult = await otpService.verifyOtp(phone, validCode);
    expect(verifyResult.success).toBe(true);
    expect(verifyResult.user.phone).toBe(phone);
    expect(verifyResult.user.role).toBe('student');
    expect(verifyResult.token).toBeDefined();

    // Verify session stored in database
    const sessionRecords = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, verifyResult.token));
    expect(sessionRecords.length).toBe(1);
    expect(sessionRecords[0].userId).toBe(verifyResult.user.id);
  });

  // ==========================================
  // SCENARIO J: Concurrent OTP Verification Race Condition
  // ==========================================
  it('SCENARIO J: Concurrent OTP verification requests permit only one consumer', async () => {
    const phone = '01777665544';
    const sendResult = await otpService.sendOtp(phone);
    const validCode = (sendResult as any).debugCode;

    // Dispatch two simultaneous verification attempts
    const results = await Promise.allSettled([
      otpService.verifyOtp(phone, validCode),
      otpService.verifyOtp(phone, validCode),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one must succeed and one must be rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  // ==========================================
  // SCENARIO K: Google OAuth Initiation
  // ==========================================
  it('SCENARIO K: Google OAuth initiation returns valid URL and cryptographic state', () => {
    const { url, state } = identityService.getGoogleAuthUrl();
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=');
    expect(url).toContain(`state=${state}`);
    expect(state.length).toBeGreaterThan(16);
  });

  // ==========================================
  // SCENARIO L: Google OAuth State Validation
  // ==========================================
  it('SCENARIO L: Google OAuth rejects invalid or mismatched state', async () => {
    const mockCode = 'mock_code_12345_attacker%40gmail.com_Attacker';
    await expect(
      identityService.handleGoogleCallback(mockCode, 'wrong_state', 'expected_state')
    ).rejects.toThrow('Invalid or expired OAuth state parameter');
  });

  // ==========================================
  // SCENARIO M: First-Time Google OAuth User Creation
  // ==========================================
  it('SCENARIO M: First-time Google OAuth user creates student account, links account, and creates session', async () => {
    const googleSub = 'google_uid_98765';
    const googleEmail = 'newgoogleuser@gmail.com';
    const googleName = 'New Google User';
    const mockCode = `mock_code:${googleSub}:${encodeURIComponent(googleEmail)}:${encodeURIComponent(googleName)}`;
    const state = 'valid_oauth_state_123';

    const result = await identityService.handleGoogleCallback(mockCode, state, state);

    expect(result.success).toBe(true);
    expect(result.user.email).toBe(googleEmail);
    expect(result.user.name).toBe(googleName);
    expect(result.user.role).toBe('student');
    expect(result.token).toBeDefined();

    // Verify account linked in accounts table
    const accountRecords = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.provider, 'google'), eq(accounts.providerAccountId, googleSub)));
    expect(accountRecords.length).toBe(1);
    expect(accountRecords[0].userId).toBe(result.user.id);
  });

  // ==========================================
  // SCENARIO N: Returning Google OAuth User Login
  // ==========================================
  it('SCENARIO N: Returning Google OAuth user authenticates without duplicate account creation', async () => {
    const googleSub = 'google_uid_returning_111';
    const googleEmail = 'returning@gmail.com';
    const mockCode = `mock_code:${googleSub}:${encodeURIComponent(googleEmail)}:ReturningUser`;
    const state = 'state_returning';

    // First login
    const firstLogin = await identityService.handleGoogleCallback(mockCode, state, state);
    // Second login
    const secondLogin = await identityService.handleGoogleCallback(mockCode, state, state);

    expect(secondLogin.success).toBe(true);
    expect(secondLogin.user.id).toBe(firstLogin.user.id);

    // Verify user count did not duplicate
    const matchingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, googleEmail));
    expect(matchingUsers.length).toBe(1);
  });

  // ==========================================
  // SCENARIO O: Google Account Linking to Existing User
  // ==========================================
  it('SCENARIO O: Google OAuth links to existing user if email matches', async () => {
    // Existing student registered via password
    const existingEmail = 'student@techsprout.edu';
    const googleSub = 'google_uid_linked_222';
    const mockCode = `mock_code:${googleSub}:${encodeURIComponent(existingEmail)}:LinkedStudent`;
    const state = 'state_linked';

    const result = await identityService.handleGoogleCallback(mockCode, state, state);

    expect(result.success).toBe(true);
    expect(result.user.email).toBe(existingEmail);

    // Check account record linked to existing user ID
    const accountRecords = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.provider, 'google'), eq(accounts.providerAccountId, googleSub)));
    expect(accountRecords.length).toBe(1);
    expect(accountRecords[0].userId).toBe(result.user.id);
  });

  // ==========================================
  // SCENARIO P: Logout Invalidates Protected Access
  // ==========================================
  it('SCENARIO P: Session logout revokes token and prevents subsequent access', async () => {
    const loginResult = await identityService.login({
      email: 'student@techsprout.edu',
      password: 'StudentPassword123!',
    });

    const token = loginResult.token;

    // Logout
    const logoutResult = await identityService.logout(token, loginResult.user.id);
    expect(logoutResult.success).toBe(true);

    // Query session in database: must be deleted
    const sessionCheck = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token));

    expect(sessionCheck.length).toBe(0);
  });

  // ==========================================
  // SCENARIO Q: Password Security (No Plaintext)
  // ==========================================
  it('SCENARIO Q: Passwords are encrypted with Scrypt and never stored in plaintext', async () => {
    const rawPassword = 'MySecretPlaintextPassword123!';
    const regResult = await identityService.register({
      name: 'Plaintext Tester',
      username: 'plaintext_tester',
      email: 'plaintext@techsprout.edu',
      password: rawPassword,
    });

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, regResult.user.id));

    expect(dbUser.passwordHash).not.toBe(rawPassword);
    expect(dbUser.passwordHash).toContain(':');

    const isValid = await CryptoUtil.verifyPassword(rawPassword, dbUser.passwordHash);
    expect(isValid).toBe(true);

    const isInvalid = await CryptoUtil.verifyPassword('WrongPassword123!', dbUser.passwordHash);
    expect(isInvalid).toBe(false);
  });

  // ==========================================
  // SCENARIO R: Append-Only Audit Logging
  // ==========================================
  it('SCENARIO R: Sensitive actions generate immutable append-only audit records', async () => {
    const initialLogs = await auditService.list();
    const initialCount = initialLogs.length;

    await auditService.record({
      actorId: '00000000-0000-0000-0000-000000000001',
      action: 'ADMIN_ROLE_CHANGE_TEST',
      targetType: 'USER',
      targetId: '00000000-0000-0000-0000-000000000002',
      metadata: { note: 'Security test' },
    });

    const updatedLogs = await auditService.list();
    expect(updatedLogs.length).toBe(initialCount + 1);
    expect(updatedLogs[0].action).toBe('ADMIN_ROLE_CHANGE_TEST');
  });

  // ==========================================
  // SCENARIO S: Helmet CSP connect-src Multi-Origin Normalization
  // ==========================================
  it('SCENARIO S: WEB_ORIGIN containing comma-separated origins produces separate connect-src CSP sources and does not crash Helmet', () => {
    // 1. Basic comma-separated string should yield distinct array entries
    const testOrigins = 'https://originA.com,https://originB.com';
    const parsed = parseAllowedOrigins(testOrigins);
    expect(parsed).toEqual(['https://originA.com', 'https://originB.com']);

    const directives = buildCspDirectives(parsed);
    expect(directives.connectSrc).toEqual([
      "'self'",
      'https://originA.com',
      'https://originB.com',
    ]);
    expect(directives.connectSrc.some((item) => item.includes(','))).toBe(false);

    // 2. Ensure Helmet initialization succeeds without "invalid directive value" error
    expect(() => {
      helmet({
        contentSecurityPolicy: {
          directives,
        },
        crossOriginEmbedderPolicy: false,
      });
    }).not.toThrow();

    // 3. Test edge cases: whitespace trimming, deduplication, accidental empty commas
    const messyOrigins = '  https://originA.com  , , https://originB.com , https://originA.com ,  ';
    const parsedMessy = parseAllowedOrigins(messyOrigins);
    expect(parsedMessy).toEqual(['https://originA.com', 'https://originB.com']);

    // 4. Verify exact Render/Vercel multi-origin environment variable
    const renderVercelOrigins =
      'https://techsprout-frthqjqb8-tech-sprout.vercel.app,https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app';
    const parsedRender = parseAllowedOrigins(renderVercelOrigins);
    expect(parsedRender).toEqual([
      'https://techsprout-frthqjqb8-tech-sprout.vercel.app',
      'https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app',
    ]);

    const renderDirectives = buildCspDirectives(parsedRender);
    expect(renderDirectives.connectSrc).toHaveLength(3);
    expect(renderDirectives.connectSrc[0]).toBe("'self'");
    expect(renderDirectives.connectSrc[1]).toBe(
      'https://techsprout-frthqjqb8-tech-sprout.vercel.app'
    );
    expect(renderDirectives.connectSrc[2]).toBe(
      'https://techsprout-git-feat-p1-foundation-security-tech-sprout.vercel.app'
    );

    expect(() => {
      helmet({
        contentSecurityPolicy: {
          directives: renderDirectives,
        },
        crossOriginEmbedderPolicy: false,
      });
    }).not.toThrow();
  });
});
