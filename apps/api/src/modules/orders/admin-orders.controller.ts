import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { OrdersService } from './orders.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { orderListQuerySchema } from './dto/query-orders.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Orders')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List all orders across students with pagination and filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async listAllOrders(@Query() query: unknown) {
    const parseResult = orderListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.ordersService.listAdminOrders(parseResult.data);

    return {
      success: true,
      message: 'Orders retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details by ID (Admin only)' })
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
}
