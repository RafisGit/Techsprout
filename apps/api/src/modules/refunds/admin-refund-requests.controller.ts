import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  HttpStatus,
  UseGuards,
  Inject,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { RefundRequestsService } from './refund-requests.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  refundRequestListQuerySchema,
  adminApproveRefundRequestSchema,
  adminRejectRefundRequestSchema,
  processApprovedRefundsQuerySchema,
} from '@techsprout/contracts';

const uuidSchema = z.string().uuid('Invalid refund request ID format');

@ApiTags('Admin Refund Requests')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/refund-requests')
export class AdminRefundRequestsController {
  constructor(
    @Inject(RefundRequestsService)
    private readonly refundRequestsService: RefundRequestsService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all student refund requests with pagination and filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund requests retrieved successfully' })
  async listRefundRequests(@Query() query: unknown) {
    const parseResult = refundRequestListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundRequestsService.listAdminRefundRequests(parseResult.data);

    return {
      success: true,
      message: 'Refund requests retrieved successfully',
      data,
    };
  }

  @Get('approved-unprocessed')
  @ApiOperation({ summary: 'Discover approved student refund requests awaiting execution (Admin only)' })
  @ApiResponse({ status: 200, description: 'Approved unprocessed refund requests retrieved' })
  async discoverApprovedRequests(@Query() query: unknown) {
    const parseResult = processApprovedRefundsQuerySchema.safeParse(query);
    const limit = parseResult.success ? parseResult.data.limit : 50;

    const data = await this.refundRequestsService.discoverApprovedRefundRequests(limit);

    return {
      success: true,
      message: 'Discovered approved unprocessed refund requests',
      data,
    };
  }

  @Post('process-approved')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discover and batch execute approved student refund requests (Admin only)' })
  @ApiResponse({ status: 200, description: 'Approved refund requests processed successfully' })
  async processApprovedRequests(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const merged = {
      ...(typeof query === 'object' && query !== null ? query : {}),
      ...(typeof body === 'object' && body !== null ? body : {}),
    };
    const parseResult = processApprovedRefundsQuerySchema.safeParse(merged);
    const limit = parseResult.success ? parseResult.data.limit : 50;

    const data = await this.refundRequestsService.processDiscoveredApprovedRequests(
      req.user!.id,
      limit,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Approved refund requests processed successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full operational detail of a refund request by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund request retrieved successfully' })
  async getRefundRequestById(@Param('id') id: string) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund request ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.refundRequestsService.getAdminRefundRequestById(id);

    return {
      success: true,
      message: 'Refund request retrieved successfully',
      data,
    };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending student refund request (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund request rejected successfully' })
  async rejectRefundRequest(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund request ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = adminRejectRefundRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundRequestsService.rejectRefundRequest(
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
      message: 'Refund request rejected successfully',
      data,
    };
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending student refund request (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund request approved successfully' })
  async approveRefundRequest(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund request ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = adminApproveRefundRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundRequestsService.approveRefundRequest(
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
      message: 'Refund request approved successfully and is queued for refund processing',
      data,
    };
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute authoritative refund operation for approved student refund request (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund operation executed successfully' })
  async executeRefundRequest(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund request ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.refundRequestsService.executeApprovedRefundRequest(
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
      message: 'Refund operation executed successfully',
      data,
    };
  }
}

