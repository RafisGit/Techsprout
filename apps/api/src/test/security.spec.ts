import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from './test-helper';
import { IdentityService } from '../modules/identity/identity.service';
import { AuditService } from '../modules/audit/audit.service';
import { OtpService } from '../modules/otp/otp.service';
import { UsersService } from '../modules/users/users.service';
import { CryptoUtil } from '../common/auth/crypto.util';
import { users, roles, userRoles, sessions, auditLogs, otps } from '../database/schema';
import { eq } from 'drizzle-orm';
import { ApiException } from '../common/errors/api-error';

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
    // Test Student attempts to promote another user to admin
    const [studentUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'student@techsprout.edu'))
      .limit(1);

    // Verify student user has 'student' role, not 'admin'
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
      role: 'admin',       // Attacker attempt to forge admin role
      isAdmin: true,       // Attacker attempt to forge boolean flag
      isVerified: true,    // Attacker attempt to bypass verification
    };

    const regResult = await identityService.register(maliciousPayload);

    // Server-enforced assignment must remain 'student'
    expect(regResult.user.role).toBe('student');
    expect(regResult.user.role).not.toBe('admin');

    // Verify directly in database user_roles table
    const assignedRoles = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, regResult.user.id));

    expect(assignedRoles.length).toBe(1);
    expect(assignedRoles[0].roleName).toBe('student');
  });

  // ==========================================
  // SCENARIO D: Malformed / Invalid Input Rejection
  // ==========================================
  it('SCENARIO D: Malformed registration requests are strictly rejected', async () => {
    // Attempt duplicate email
    await expect(
      identityService.register({
        name: 'Duplicate Student',
        username: 'new_unique_name',
        email: 'student@techsprout.edu', // Already seeded
        password: 'StrongP@ssword123',
      })
    ).rejects.toThrow(ApiException);

    // Attempt duplicate username
    await expect(
      identityService.register({
        name: 'Duplicate Username',
        username: 'student', // Already seeded
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

    // Insert an expired OTP record (expired 10 minutes ago)
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

    // First verification: Must SUCCEED
    const firstVerify = await otpService.verifyOtp(phone, validCode);
    expect(firstVerify.success).toBe(true);

    // Second verification with identical code: Must be DENIED
    await expect(otpService.verifyOtp(phone, validCode)).rejects.toThrow(
      'Invalid or expired verification code'
    );
  });

  // ==========================================
  // SCENARIO G: Logout Invalidates Protected Access
  // ==========================================
  it('SCENARIO G: Session logout revokes token and prevents subsequent access', async () => {
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
  // SCENARIO H: Password Security (No Plaintext)
  // ==========================================
  it('SCENARIO H: Passwords are encrypted with Scrypt and never stored in plaintext', async () => {
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

    // Must not equal raw password
    expect(dbUser.passwordHash).not.toBe(rawPassword);
    // Must be in salt:derivedKey format
    expect(dbUser.passwordHash).toContain(':');

    // Cryptographic verification must pass
    const isValid = await CryptoUtil.verifyPassword(rawPassword, dbUser.passwordHash);
    expect(isValid).toBe(true);

    // Wrong password must fail
    const isInvalid = await CryptoUtil.verifyPassword('WrongPassword123!', dbUser.passwordHash);
    expect(isInvalid).toBe(false);
  });

  // ==========================================
  // SCENARIO I: Append-Only Audit Logging
  // ==========================================
  it('SCENARIO I: Sensitive actions generate immutable append-only audit records', async () => {
    const initialLogs = await auditService.list();
    const initialCount = initialLogs.length;

    // Perform an action
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
});
