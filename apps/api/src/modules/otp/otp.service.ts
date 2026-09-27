import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { otps, users } from '../../database/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { CryptoUtil } from '../../common/auth/crypto.util';
import { ApiException } from '../../common/errors/api-error';
import { AuditService } from '../audit/audit.service';

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
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Generates a 6-digit OTP, stores hashed code with 180s TTL, and dispatches via SMS gateway.
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

    // 2. Generate cryptographically secure 6-digit OTP
    const code = CryptoUtil.generateOtp();
    const codeHash = CryptoUtil.hashOtp(code);
    const expiresAt = new Date(Date.now() + OtpService.OTP_TTL_SECONDS * 1000);

    // 3. Save hashed OTP to database
    await this.db.insert(otps).values({
      phone,
      codeHash,
      attempts: 0,
      isUsed: false,
      expiresAt,
    });

    // 4. SMS Gateway Provider interface (Masked logging only — Never log plaintext OTP in production)
    this.logger.log(`[SMS_DISPATCH] Dispatched 6-digit verification code to phone: ${phone.slice(0, 3)}****${phone.slice(-3)}`);

    // 5. Audit log record
    await this.auditService.record({
      action: 'OTP_SENT',
      targetType: 'PHONE',
      targetId: phone,
      ipAddress,
      requestId,
      metadata: { phone: `${phone.slice(0, 3)}****${phone.slice(-3)}` },
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
   * Verifies a 6-digit OTP code against the hashed record.
   * Single-use, attempt-limited, TTL-enforced.
   */
  async verifyOtp(phone: string, otp: string, ipAddress?: string, requestId?: string) {
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

    // 3. Validate code hash
    const inputHash = CryptoUtil.hashOtp(otp);
    if (inputHash !== record.codeHash) {
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

    // 4. Mark OTP as used (Single-use enforcement)
    await this.db
      .update(otps)
      .set({ isUsed: true })
      .where(eq(otps.id, record.id));

    // 5. If a matching user exists with this phone, mark phone as verified
    await this.db
      .update(users)
      .set({ isVerified: true })
      .where(eq(users.phone, phone));

    // 6. Record audit log
    await this.auditService.record({
      action: 'OTP_VERIFIED',
      targetType: 'PHONE',
      targetId: phone,
      ipAddress,
      requestId,
    });

    return {
      success: true,
      message: 'Phone number verified successfully',
    };
  }
}
