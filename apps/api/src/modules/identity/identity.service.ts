import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { users, sessions, roles, userRoles } from '../../database/schema';
import { eq, or } from 'drizzle-orm';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CryptoUtil } from '../../common/auth/crypto.util';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';

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
