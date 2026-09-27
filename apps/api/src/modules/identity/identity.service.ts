import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { users, sessions, roles, userRoles, accounts } from '../../database/schema';
import { eq, or, and } from 'drizzle-orm';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CryptoUtil } from '../../common/auth/crypto.util';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { env } from '../../config/env.config';

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Registers a new user.
   * Server-side enforces role='student' unconditionally.
   * Client-provided privileged parameters (e.g. role, isAdmin) are stripped/rejected.
   */
  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ) {
    // 1. Check duplicate email or username
    const existing = await this.db
      .select({ id: users.id, email: users.email, username: users.username })
      .from(users)
      .where(or(eq(users.email, dto.email), eq(users.username, dto.username)))
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].email === dto.email) {
        throw new ApiException('Email is already registered', HttpStatus.BAD_REQUEST, 'EMAIL_EXISTS');
      }
      if (existing[0].username === dto.username) {
        throw new ApiException('Username is already taken', HttpStatus.BAD_REQUEST, 'USERNAME_TAKEN');
      }
    }

    // 2. Hash password with Scrypt + random salt
    const passwordHash = await CryptoUtil.hashPassword(dto.password);

    // 3. Create User record (Never store plaintext password)
    const [newUser] = await this.db
      .insert(users)
      .values({
        name: dto.name,
        username: dto.username,
        email: dto.email,
        phone: dto.phone || null,
        passwordHash,
        isVerified: false,
        isActive: true,
      })
      .returning();

    // 4. Assign default 'student' role (Server controlled authorization)
    let studentRole = await this.db
      .select()
      .from(roles)
      .where(eq(roles.name, 'student'))
      .limit(1);

    if (studentRole.length === 0) {
      const [createdRole] = await this.db
        .insert(roles)
        .values({
          name: 'student',
          description: 'Default student role',
        })
        .returning();
      studentRole = [createdRole];
    }

    await this.db.insert(userRoles).values({
      userId: newUser.id,
      roleId: studentRole[0].id,
    });

    // 5. Issue session
    const token = CryptoUtil.generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.db.insert(sessions).values({
      userId: newUser.id,
      token,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    });

    // 6. Record immutable audit log
    await this.auditService.record({
      actorId: newUser.id,
      action: 'USER_REGISTERED',
      targetType: 'USER',
      targetId: newUser.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: { email: newUser.email, username: newUser.username },
    });

    return {
      success: true,
      message: 'Registration successful',
      user: {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        role: 'student',
        isVerified: newUser.isVerified,
        createdAt: newUser.createdAt.toISOString(),
      },
      token,
      expiresAt,
    };
  }

  /**
   * Authenticates user via email and password.
   */
  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ) {
    // 1. Fetch user by email
    const userRecords = await this.db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.email, dto.email))
      .limit(1);

    if (userRecords.length === 0 || !userRecords[0].passwordHash) {
      throw new ApiException(
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS'
      );
    }

    const user = userRecords[0];

    if (!user.isActive) {
      throw new ApiException(
        'Account is disabled. Please contact support.',
        HttpStatus.FORBIDDEN,
        'ACCOUNT_DISABLED'
      );
    }

    if (!user.passwordHash) {
      throw new ApiException(
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS'
      );
    }

    // 2. Verify password
    const isPasswordValid = await CryptoUtil.verifyPassword(
      dto.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new ApiException(
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS'
      );
    }

    // 3. Issue session
    const token = CryptoUtil.generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.db.insert(sessions).values({
      userId: user.id,
      token,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    });

    // 4. Record audit log
    await this.auditService.record({
      actorId: user.id,
      action: 'USER_LOGIN',
      targetType: 'USER',
      targetId: user.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: { email: user.email },
    });

    return {
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.roleName || 'student',
        isVerified: user.isVerified,
        createdAt: user.createdAt.toISOString(),
      },
      token,
      expiresAt,
    };
  }

  /**
   * Generates Google OAuth authorization URL and state.
   */
  getGoogleAuthUrl(redirectUri?: string): { url: string; state: string } {
    const state = CryptoUtil.generateOAuthState();
    const clientId = env.GOOGLE_CLIENT_ID || 'dummy-google-client-id';
    const callback =
      redirectUri || `${env.WEB_ORIGIN}/api/v1/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { url, state };
  }

  /**
   * Handles Google OAuth authorization code exchange, state validation,
   * account linking with accounts table, user creation, and session issuance.
   */
  async handleGoogleCallback(
    code: string,
    state: string,
    expectedState: string | undefined,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ) {
    if (!state || !expectedState || state !== expectedState) {
      throw new ApiException(
        'Invalid or expired OAuth state parameter',
        HttpStatus.BAD_REQUEST,
        'INVALID_OAUTH_STATE'
      );
    }

    if (!code) {
      throw new ApiException(
        'Authorization code is required',
        HttpStatus.BAD_REQUEST,
        'INVALID_OAUTH_CODE'
      );
    }

    let googleProfile: { sub: string; email: string; name: string };

    if (code.startsWith('mock_code:') || code.startsWith('mock_code_')) {
      if (env.NODE_ENV === 'production') {
        throw new ApiException(
          'Mock OAuth codes are disabled in production environment',
          HttpStatus.BAD_REQUEST,
          'INVALID_OAUTH_CODE'
        );
      }
      if (code.startsWith('mock_code:')) {
        const parts = code.split(':');
        const sub = parts[1] || 'google_sub_12345';
        const email = parts[2] ? decodeURIComponent(parts[2]) : 'googleuser@gmail.com';
        const name = parts[3] ? decodeURIComponent(parts[3]) : 'Google Test User';
        googleProfile = { sub, email, name };
      } else {
        const remainder = code.slice('mock_code_'.length);
        const parts = remainder.split(':');
        if (parts.length >= 3) {
          googleProfile = {
            sub: parts[0],
            email: decodeURIComponent(parts[1]),
            name: decodeURIComponent(parts[2]),
          };
        } else {
          const simpleParts = remainder.split('_');
          googleProfile = {
            sub: simpleParts[0] || 'google_sub_12345',
            email: simpleParts[1] ? decodeURIComponent(simpleParts[1]) : 'googleuser@gmail.com',
            name: simpleParts[2] ? decodeURIComponent(simpleParts[2]) : 'Google Test User',
          };
        }
      }
    } else {
      // Live production code exchange
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID || '',
            client_secret: env.GOOGLE_CLIENT_SECRET || '',
            redirect_uri: `${env.WEB_ORIGIN}/api/v1/auth/google/callback`,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          throw new Error('Failed to exchange authorization code');
        }

        const tokenData = await tokenRes.json();
        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userRes.ok) {
          throw new Error('Failed to fetch user info from Google');
        }

        const userData = await userRes.json();
        googleProfile = {
          sub: userData.sub,
          email: userData.email,
          name: userData.name || userData.email.split('@')[0],
        };
      } catch {
        throw new ApiException(
          'Failed to exchange authorization code with Google',
          HttpStatus.BAD_REQUEST,
          'GOOGLE_AUTH_FAILED'
        );
      }
    }

    // 1. Check if Google account already linked
    const existingAccounts = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.provider, 'google'), eq(accounts.providerAccountId, googleProfile.sub)))
      .limit(1);

    let userId: string;
    let userRole = 'student';
    let isNewUser = false;

    if (existingAccounts.length > 0) {
      userId = existingAccounts[0].userId;
      const userRecords = await this.db
        .select({
          id: users.id,
          isActive: users.isActive,
          roleName: roles.name,
        })
        .from(users)
        .leftJoin(userRoles, eq(users.id, userRoles.userId))
        .leftJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(users.id, userId))
        .limit(1);

      if (userRecords.length === 0 || !userRecords[0].isActive) {
        throw new ApiException(
          'User account is disabled or not found',
          HttpStatus.FORBIDDEN,
          'ACCOUNT_DISABLED'
        );
      }
      userRole = userRecords[0].roleName || 'student';
    } else {
      // 2. Check if user exists with matching email
      const existingUsers = await this.db
        .select({
          id: users.id,
          email: users.email,
          isActive: users.isActive,
          roleName: roles.name,
        })
        .from(users)
        .leftJoin(userRoles, eq(users.id, userRoles.userId))
        .leftJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(users.email, googleProfile.email))
        .limit(1);

      if (existingUsers.length > 0) {
        const existing = existingUsers[0];
        if (!existing.isActive) {
          throw new ApiException('User account is disabled', HttpStatus.FORBIDDEN, 'ACCOUNT_DISABLED');
        }
        userId = existing.id;
        userRole = existing.roleName || 'student';
      } else {
        // 3. Create new user with student role
        isNewUser = true;
        const cleanSub = googleProfile.sub.replace(/\D/g, '').slice(0, 8);
        const username = `g_${cleanSub}_${Date.now() % 10000}`;
        const [createdUser] = await this.db
          .insert(users)
          .values({
            name: googleProfile.name,
            username,
            email: googleProfile.email,
            isVerified: true,
            isActive: true,
          })
          .returning();

        userId = createdUser.id;

        let [studentRole] = await this.db
          .select()
          .from(roles)
          .where(eq(roles.name, 'student'))
          .limit(1);

        if (!studentRole) {
          [studentRole] = await this.db
            .insert(roles)
            .values({ name: 'student', description: 'Default student role' })
            .returning();
        }

        await this.db.insert(userRoles).values({
          userId,
          roleId: studentRole.id,
        });

        await this.auditService.record({
          actorId: userId,
          action: 'USER_REGISTERED',
          targetType: 'USER',
          targetId: userId,
          ipAddress,
          userAgent,
          requestId,
          metadata: { provider: 'google', email: googleProfile.email },
        });
      }

      // 4. Link Google account in accounts table
      await this.db.insert(accounts).values({
        userId,
        provider: 'google',
        providerAccountId: googleProfile.sub,
      });
    }

    // 5. Issue session
    const token = CryptoUtil.generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.db.insert(sessions).values({
      userId,
      token,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    });

    // 6. Audit log login
    await this.auditService.record({
      actorId: userId,
      action: 'USER_LOGIN',
      targetType: 'USER',
      targetId: userId,
      ipAddress,
      userAgent,
      requestId,
      metadata: { method: 'google_oauth', email: googleProfile.email },
    });

    const [userRecord] = await this.db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    return {
      success: true,
      message: isNewUser
        ? 'Account registered and authenticated via Google'
        : 'Authenticated via Google',
      user: {
        id: userRecord.id,
        name: userRecord.name,
        username: userRecord.username,
        email: userRecord.email,
        phone: userRecord.phone,
        role: userRole,
        isVerified: userRecord.isVerified,
        createdAt: userRecord.createdAt.toISOString(),
      },
      token,
      expiresAt,
    };
  }

  /**
   * Revokes session by token.
   */
  async logout(token: string, actorId?: string, requestId?: string) {
    await this.db.delete(sessions).where(eq(sessions.token, token));

    if (actorId) {
      await this.auditService.record({
        actorId,
        action: 'USER_LOGOUT',
        targetType: 'SESSION',
        requestId,
      });
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }
}
