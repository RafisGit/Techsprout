import {
  Controller,
  Get,
  Post,
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
import { RefundsService } from './refunds.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { refundListQuerySchema } from './dto/query-refunds.dto';
import { adminReconcileRefundSchema } from './dto/reconcile-refund.dto';

const uuidSchema = z.string().uuid('Invalid refund ID format');

@ApiTags('Admin Refunds')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/refunds')
export class AdminRefundsController {
  constructor(@Inject(RefundsService) private readonly refundsService: RefundsService) {}

  @Get()
  @ApiOperation({ summary: 'List all refund operations with pagination (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refunds retrieved successfully' })
  async listRefunds(@Query() query: unknown) {
    const parseResult = refundListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundsService.listRefunds(parseResult.data);

    return {
      success: true,
      message: 'Refunds retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get refund operation details by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund retrieved successfully' })
  async getRefundById(@Param('id') id: string) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.refundsService.getRefundById(id);

    return {
      success: true,
      message: 'Refund retrieved successfully',
      data,
    };
  }

  @Post(':id/query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authoritatively query provider refund clearing state (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund status queried and updated successfully' })
  async queryRefundStatus(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.refundsService.queryRefundStatus(id, req.user!.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.id,
    });

    return {
      success: true,
      message: 'Refund status queried successfully',
      data,
    };
  }

  @Post(':id/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manual administrative reconciliation for ambiguous refund (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund reconciled successfully' })
  async reconcileRefund(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = adminReconcileRefundSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundsService.reconcileRefund(
      id,
      req.user!.id,
      parseResult.data,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Refund reconciled successfully',
      data,
    };
  }
}
