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
import { PayoutsService } from './payouts.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  payoutListQuerySchema,
  approvePayoutSchema,
  rejectPayoutSchema,
  settlePayoutSchema,
} from '@techsprout/contracts';

import { MonetizationLedgerService } from './monetization-ledger.service';

const uuidSchema = z.string().uuid('Invalid payout ID format');

@ApiTags('Admin Payouts')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(
    @Inject(PayoutsService) private readonly payoutsService: PayoutsService,
    @Inject(MonetizationLedgerService) private readonly ledgerService: MonetizationLedgerService
  ) {}

  @Get('instructors/:instructorId/reconcile')
  @ApiOperation({ summary: 'Reconcile instructor wallet balance against immutable ledger entries (Admin only)' })
  @ApiResponse({ status: 200, description: 'Reconciliation completed successfully' })
  async reconcileInstructor(@Param('instructorId') instructorId: string) {
    const parseId = uuidSchema.safeParse(instructorId);
    if (!parseId.success) {
      throw new ApiException('Invalid instructor ID format', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }

    const data = await this.ledgerService.reconcileWallet(parseId.data);

    return {
      success: true,
      message: data.reconciled
        ? 'Wallet reconciled with 0 discrepancies'
        : 'Wallet discrepancy detected',
      data,
    };
  }

  @Post('escrow/settle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger settlement of matured 14-day escrow funds into instructor available balances (Admin only)' })
  @ApiResponse({ status: 200, description: 'Matured escrow settled successfully' })
  async triggerEscrowSettlement() {
    const settledCount = await this.ledgerService.settleMaturedEscrow();
    return {
      success: true,
      message: `Successfully settled matured escrow for ${settledCount} order(s)`,
      data: { settledCount },
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all instructor payout requests with filtering (Admin only)' })
  @ApiResponse({ status: 200, description: 'Payout requests retrieved successfully' })
  async listPayouts(@Query() query: unknown) {
    const parseResult = payoutListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.payoutsService.getAdminPayouts(parseResult.data);

    return {
      success: true,
      message: 'Payout requests retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get specific payout request details by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Payout details retrieved successfully' })
  async getPayoutDetails(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid payout ID format', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }

    const data = await this.payoutsService.getPayoutById(parseId.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Payout details retrieved successfully',
      data,
    };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an instructor payout request (Admin only)' })
  @ApiResponse({ status: 200, description: 'Payout request approved successfully' })
  async approvePayout(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid payout ID format', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }

    const parseBody = approvePayoutSchema.safeParse(body || {});
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const data = await this.payoutsService.approvePayout(
      parseId.data,
      req.user!.id,
      parseBody.data,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Payout request approved successfully',
      data,
    };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an instructor payout request and restore funds (Admin only)' })
  @ApiResponse({ status: 200, description: 'Payout request rejected successfully' })
  async rejectPayout(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid payout ID format', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }

    const parseBody = rejectPayoutSchema.safeParse(body);
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const data = await this.payoutsService.rejectPayout(
      parseId.data,
      req.user!.id,
      parseBody.data,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Payout request rejected successfully',
      data,
    };
  }

  @Post(':id/settle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record external disbursement and mark payout settled (Admin only)' })
  @ApiResponse({ status: 200, description: 'Payout marked settled successfully' })
  async settlePayout(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid payout ID format', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    }

    const parseBody = settlePayoutSchema.safeParse(body);
    if (!parseBody.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseBody.error.flatten().fieldErrors
      );
    }

    const data = await this.payoutsService.settlePayout(
      parseId.data,
      req.user!.id,
      parseBody.data,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    return {
      success: true,
      message: 'Payout settled successfully',
      data,
    };
  }
}
