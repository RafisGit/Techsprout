import {
  Controller,
  Post,
  Param,
  Body,
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
import { adminRefundOrderSchema } from './dto/admin-refund-order.dto';

const uuidSchema = z.string().uuid('Invalid order ID format');

@ApiTags('Admin Orders Refund')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/orders')
export class AdminOrdersRefundController {
  constructor(@Inject(RefundsService) private readonly refundsService: RefundsService) {}

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate or retry a refund operation for an order (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund operation initiated or retried successfully' })
  async initiateRefund(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid order ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = adminRefundOrderSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundsService.initiateOrRetryRefund(
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
      message: 'Refund operation initiated successfully',
      data,
    };
  }
}
