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
  forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { OrdersService } from './orders.service';
import { RefundRequestsService } from '../refunds/refund-requests.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createOrderSchema } from './dto/create-order.dto';
import { orderListQuerySchema } from './dto/query-orders.dto';
import { createRefundRequestSchema } from '@techsprout/contracts';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Orders')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(forwardRef(() => RefundRequestsService)) private readonly refundRequestsService: RefundRequestsService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an order for a course with server-authoritative pricing' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  async createOrder(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = createOrderSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.ordersService.createOrder(
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
      message: 'Order created successfully',
      data,
    };
  }

  @Get(':id/refund-eligibility')
  @ApiOperation({ summary: 'Evaluate student refund eligibility for an order' })
  @ApiResponse({ status: 200, description: 'Eligibility evaluated successfully' })
  async getRefundEligibility(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid order ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.refundRequestsService.evaluateEligibility(id, req.user!.id);

    return {
      success: true,
      data,
    };
  }

  @Post(':id/refund-request')
  @ApiOperation({ summary: 'Submit refund request for a specific order' })
  @ApiResponse({ status: 201, description: 'Refund request submitted successfully' })
  async submitRefundRequest(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid order ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = createRefundRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.refundRequestsService.createRefundRequest(
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
      message: 'Refund request submitted successfully and is pending administrator review',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details by ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  async getOrderById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid order ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.ordersService.getOrderById(id, {
      id: req.user!.id,
      role: req.user!.role,
      name: req.user!.name,
      email: req.user!.email,
    });

    return {
      success: true,
      message: 'Order retrieved successfully',
      data,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all orders for authenticated student' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async listMyOrders(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = orderListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.ordersService.listStudentOrders(req.user!.id, parseResult.data);

    return {
      success: true,
      message: 'Orders retrieved successfully',
      data,
    };
  }
}

