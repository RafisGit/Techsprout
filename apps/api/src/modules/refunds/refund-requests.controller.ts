import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { RefundRequestsService } from './refund-requests.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  createRefundRequestWithOrderSchema,
  studentRefundRequestListQuerySchema,
} from '@techsprout/contracts';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Refund Requests')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('refund-requests')
export class RefundRequestsController {
  constructor(
    @Inject(RefundRequestsService)
    private readonly refundRequestsService: RefundRequestsService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new student refund request for an eligible order' })
  @ApiResponse({ status: 201, description: 'Refund request submitted successfully' })
  async createRefundRequest(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = createRefundRequestWithOrderSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundRequestsService.createRefundRequest(
      parseResult.data.orderId,
      req.user!.id,
      {
        reasonCategory: parseResult.data.reasonCategory,
        reasonDetail: parseResult.data.reasonDetail,
      },
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Refund request submitted successfully and is pending administrator review',
      data,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List refund requests submitted by authenticated student' })
  @ApiResponse({ status: 200, description: 'Refund requests retrieved successfully' })
  async listMyRefundRequests(
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = studentRefundRequestListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundRequestsService.listStudentRefundRequests(
      req.user!.id,
      parseResult.data
    );

    return {
      success: true,
      message: 'Refund requests retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a student refund request by ID' })
  @ApiResponse({ status: 200, description: 'Refund request retrieved successfully' })
  async getRefundRequestById(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid refund request ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.refundRequestsService.getStudentRefundRequestById(
      id,
      req.user!.id
    );

    return {
      success: true,
      message: 'Refund request retrieved successfully',
      data,
    };
  }
}
