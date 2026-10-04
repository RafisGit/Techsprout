import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpStatus,
  HttpCode,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { CouponsService } from './coupons.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  createCouponSchema,
  updateCouponSchema,
  couponListQuerySchema,
} from './dto';

const uuidSchema = z.string().uuid('Invalid coupon ID format');

@ApiTags('Admin Coupons')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(@Inject(CouponsService) private readonly couponsService: CouponsService) {}

  @Get()
  @ApiOperation({ summary: 'List all coupons with pagination and filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Coupons retrieved successfully' })
  async listCoupons(@Query() query: unknown) {
    const parseResult = couponListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.couponsService.listCoupons(parseResult.data);

    return {
      success: true,
      message: 'Coupons retrieved successfully',
      data,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new coupon (Admin only)' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or referenced course not found' })
  @ApiResponse({ status: 409, description: 'Coupon code already exists' })
  async createCoupon(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = createCouponSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.couponsService.createCoupon(
      parseResult.data,
      req.user!.id,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Coupon created successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon details by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Coupon retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid coupon ID format' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async getCouponById(@Param('id') id: string) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid coupon ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.couponsService.getCouponById(id);

    return {
      success: true,
      message: 'Coupon retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update coupon configuration (Admin only)' })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid limits' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async updateCoupon(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid coupon ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateCouponSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.couponsService.updateCoupon(
      id,
      parseResult.data,
      req.user!.id,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Coupon updated successfully',
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete / disable coupon (Admin only)' })
  @ApiResponse({ status: 200, description: 'Coupon disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid coupon ID format' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async deleteCoupon(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid coupon ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.couponsService.softDeleteCoupon(
      id,
      req.user!.id,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Coupon disabled successfully',
      data,
    };
  }
}
