import { Controller, Post, Body, Req, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OtpService } from './otp.service';
import { Public } from '../../common/auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { z } from 'zod';
import { BANGLADESHI_PHONE_REGEX } from '../identity/dto/register.dto';
import { ApiException } from '../../common/errors/api-error';

const sendOtpSchema = z.object({
  phone: z.string().regex(BANGLADESHI_PHONE_REGEX, 'Invalid Bangladeshi phone number (e.g. 01712345678)'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(BANGLADESHI_PHONE_REGEX, 'Invalid Bangladeshi phone number'),
  otp: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d{6}$/, 'OTP must be digits only'),
});

@ApiTags('OTP & Phone Verification')
@Controller('auth/otp')
export class OtpController {
  constructor(@Inject(OtpService) private readonly otpService: OtpService) {}

  @Public()
  @Post('send')
  @ApiOperation({ summary: 'Send 6-digit phone verification OTP' })
  @ApiResponse({ status: 200, description: 'OTP dispatched' })
  async sendOtp(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = sendOtpSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.otpService.sendOtp(parseResult.data.phone, ip, req.id);
  }

  @Public()
  @Post('verify')
  @ApiOperation({ summary: 'Verify 6-digit phone OTP' })
  @ApiResponse({ status: 200, description: 'Phone verified' })
  async verifyOtp(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = verifyOtpSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.otpService.verifyOtp(
      parseResult.data.phone,
      parseResult.data.otp,
      ip,
      req.id
    );
  }
}
