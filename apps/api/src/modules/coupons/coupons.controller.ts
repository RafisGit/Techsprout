import {
  Controller,
  Post,
  Body,
  Req,
  HttpStatus,
  HttpCode,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { Public } from '../../common/auth/decorators/public.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { validateCouponSchema } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(@Inject(CouponsService) private readonly couponsService: CouponsService) {}

  @Public()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview and validate coupon applicability (Read-only)' })
  @ApiResponse({ status: 200, description: 'Coupon is valid for the specified course' })
  @ApiResponse({ status: 400, description: 'Coupon is invalid, expired, disabled, or limit reached' })
  @ApiResponse({ status: 404, description: 'Coupon code or course not found' })
  async validateCoupon(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = validateCouponSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const userId = await this.couponsService.resolveUserId(req);

    const data = await this.couponsService.validateCoupon(parseResult.data, userId);

    return {
      success: true,
      message: 'Coupon is valid',
      data,
    };
  }
}
