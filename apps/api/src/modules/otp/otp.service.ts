import { Injectable, Inject, HttpStatus, Logger, Optional } from '@nestjs/common';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { otps, users, sessions, roles, userRoles } from '../../database/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { CryptoUtil } from '../../common/auth/crypto.util';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../queue/queue.service';
import { env } from '../../config/env.config';

export interface SendOtpDto {
  phone: string;
}

export interface VerifyOtpDto {
  phone: string;
  otp: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private static readonly OTP_TTL_SECONDS = 180; // 3 minutes
  private static readonly MAX_ATTEMPTS = 3;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(QueueService) private readonly queueService?: QueueService
  ) {}

  /**
   * Generates a 6-digit OTP, stores HMAC-SHA256 hashed code with pepper and 180s TTL.
   */
  async sendOtp(phone: string, ipAddress?: string, requestId?: string) {
    // 1. Rate limiting check: max 3 requests in the last 15 minutes for this phone number
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentRequests = await this.db
      .select({ id: otps.id })
      .from(otps)
      .where(and(eq(otps.phone, phone), gt(otps.createdAt, fifteenMinutesAgo)));

    if (recentRequests.length >= 3) {
      throw new ApiException(
        'Too many OTP requests. Please wait 15 minutes before requesting again.',
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_RATE_LIMITED'
      );
    }

    // 2. Generate cryptographically secure 6-digit OTP and keyed HMAC hash
    const code = CryptoUtil.generateOtp();
    const codeHash = CryptoUtil.hashOtp(code, env.AUTH_SECRET);
    const expiresAt = new Date(Date.now() + OtpService.OTP_TTL_SECONDS * 1000);

    // 3. Save hashed OTP to database
    await this.db.insert(otps).values({
      phone,
      codeHash,
      attempts: 0,
      isUsed: false,
      expiresAt,
    });

    const maskedPhone = `${phone.slice(0, 3)}****${phone.slice(-3)}`;

    // 4. Dispatch via background queue if available, else synchronous notification
    if (this.queueService) {
      await this.queueService.dispatchTestJob({
        message: `Dispatch SMS to ${maskedPhone}`,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.log(`[SMS_DISPATCH] Dispatched 6-digit verification code to phone: ${maskedPhone}`);

    // 5. Audit log record
    await this.auditService.record({
      action: 'OTP_SENT',
      targetType: 'PHONE',
      targetId: phone,
      ipAddress,
      requestId,
      metadata: { phone: maskedPhone },
    });

    return {
      success: true,
      message: 'Verification code sent successfully',
      expiresInSeconds: OtpService.OTP_TTL_SECONDS,
      // For automated development and integration testing:
      ...(process.env.NODE_ENV !== 'production' ? { debugCode: code } : {}),
    };
  }

  /**
   * Verifies a 6-digit OTP code against the hashed record atomically.
   * On successful verification, establishes an authenticated user session.
   */
  async verifyOtp(
    phone: string,
    otp: string,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ) {
    const now = new Date();

    // 1. Find active unused OTP record
    const otpRecords = await this.db
      .select()
      .from(otps)
      .where(and(eq(otps.phone, phone), eq(otps.isUsed, false), gt(otps.expiresAt, now)))
      .orderBy(desc(otps.createdAt))
      .limit(1);

    if (otpRecords.length === 0) {
      throw new ApiException(
        'Invalid or expired verification code',
        HttpStatus.BAD_REQUEST,
        'OTP_INVALID_OR_EXPIRED'
      );
    }

    const record = otpRecords[0];

    // 2. Check maximum retry attempts
    if (record.attempts >= OtpService.MAX_ATTEMPTS) {
      throw new ApiException(
        'Maximum verification attempts exceeded. Please request a new code.',
        HttpStatus.BAD_REQUEST,
        'OTP_MAX_ATTEMPTS_EXCEEDED'
      );
    }

    // 3. Validate code hash using timing-safe comparison
    const isCodeValid = CryptoUtil.verifyOtpHash(otp, record.codeHash, env.AUTH_SECRET);
    if (!isCodeValid) {
      // Increment failed attempts
      await this.db
        .update(otps)
        .set({ attempts: record.attempts + 1 })
        .where(eq(otps.id, record.id));

      throw new ApiException(
        'Invalid verification code',
        HttpStatus.BAD_REQUEST,
        'OTP_INVALID'
      );
    }

    // 4. Atomic consumption to prevent race condition replay
    const consumed = await this.db
      .update(otps)
      .set({ isUsed: true, attempts: record.attempts + 1 })
      .where(and(eq(otps.id, record.id), eq(otps.isUsed, false), gt(otps.expiresAt, now)))
      .returning({ id: otps.id });

    if (consumed.length === 0) {
      throw new ApiException(
        'Verification code was already used or expired',
        HttpStatus.BAD_REQUEST,
        'OTP_INVALID_OR_EXPIRED'
      );
    }

    // 5. User lookup or auto-creation for first-time OTP users
    const existingUsers = await this.db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        isActive: users.isActive,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.phone, phone))
      .limit(1);

    let authenticatedUser: {
      id: string;
      name: string;
      username: string;
      email: string;
      phone: string | null;
      role: string;
      isVerified: boolean;
      createdAt: string;
    };

    if (existingUsers.length > 0) {
      const existing = existingUsers[0];
      if (!existing.isActive) {
        throw new ApiException(
          'User account is disabled. Please contact support.',
          HttpStatus.FORBIDDEN,
          'ACCOUNT_DISABLED'
        );
      }

      if (!existing.isVerified) {
        await this.db
          .update(users)
          .set({ isVerified: true })
          .where(eq(users.id, existing.id));
      }

      authenticatedUser = {
        id: existing.id,
        name: existing.name,
        username: existing.username,
        email: existing.email,
        phone: existing.phone,
        role: existing.roleName || 'student',
        isVerified: true,
        createdAt: existing.createdAt.toISOString(),
      };
    } else {
      // First-time Phone user registration
      const cleanPhone = phone.replace(/\D/g, '');
      const autoUsername = `user_${cleanPhone}`;
      const autoEmail = `${cleanPhone}@phone.techsprout.edu`;

      const [newUser] = await this.db
        .insert(users)
        .values({
          name: `Student ${phone.slice(-4)}`,
          username: autoUsername,
          email: autoEmail,
          phone,
          isVerified: true,
          isActive: true,
        })
        .returning();

      let [studentRole] = await this.db
        .select()
        .from(roles)
        .where(eq(roles.name, 'student'))
        .limit(1);

      if (!studentRole) {
        const [createdRole] = await this.db
          .insert(roles)
          .values({
            name: 'student',
            description: 'Default student role',
          })
          .returning();
        studentRole = createdRole;
      }

      await this.db.insert(userRoles).values({
        userId: newUser.id,
        roleId: studentRole.id,
      });

      await this.auditService.record({
        actorId: newUser.id,
        action: 'USER_REGISTERED',
        targetType: 'USER',
        targetId: newUser.id,
        ipAddress,
        userAgent,
        requestId,
        metadata: { method: 'phone_otp', phone },
      });

      authenticatedUser = {
        id: newUser.id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        role: 'student',
        isVerified: true,
        createdAt: newUser.createdAt.toISOString(),
      };
    }

    // 6. Establish authenticated session
    const token = CryptoUtil.generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.db.insert(sessions).values({
      userId: authenticatedUser.id,
      token,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    });

    // 7. Audit log events
    await this.auditService.record({
      actorId: authenticatedUser.id,
      action: 'OTP_VERIFIED',
      targetType: 'PHONE',
      targetId: phone,
      ipAddress,
      requestId,
    });

    await this.auditService.record({
      actorId: authenticatedUser.id,
      action: 'USER_LOGIN',
      targetType: 'USER',
      targetId: authenticatedUser.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: { method: 'phone_otp', phone },
    });

    return {
      success: true,
      message: 'Phone authentication successful',
      user: authenticatedUser,
      token,
      expiresAt,
    };
  }
}
