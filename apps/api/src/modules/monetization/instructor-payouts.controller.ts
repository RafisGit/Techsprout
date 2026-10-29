import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpStatus,
  HttpCode,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { MonetizationLedgerService } from './monetization-ledger.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  requestPayoutSchema,
  payoutListQuerySchema,
} from '@techsprout/contracts';

@ApiTags('Instructor Monetization & Payouts')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('instructor', 'admin')
@Controller('instructor')
export class InstructorPayoutsController {
  constructor(
    @Inject(PayoutsService) private readonly payoutsService: PayoutsService,
    @Inject(MonetizationLedgerService) private readonly ledgerService: MonetizationLedgerService
  ) {}

  @Get('earnings')
  @ApiOperation({ summary: 'Get instructor wallet, earnings summary, and recent ledger entries' })
  @ApiResponse({ status: 200, description: 'Instructor earnings summary retrieved successfully' })
  async getEarnings(@Req() req: AuthenticatedRequest) {
    const instructorId = req.user!.id;
    const summary = await this.ledgerService.getEarningsSummary(instructorId);

    return {
      success: true,
      message: 'Earnings summary retrieved successfully',
      data: summary,
    };
  }

  @Get('payouts')
  @ApiOperation({ summary: 'List payout requests submitted by authenticated instructor' })
  @ApiResponse({ status: 200, description: 'Instructor payout requests retrieved successfully' })
  async getPayouts(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = payoutListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.payoutsService.getInstructorPayouts(
      req.user!.id,
      parseResult.data
    );

    return {
      success: true,
      message: 'Payout requests retrieved successfully',
      data,
    };
  }

  @Post('payouts/request')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit an instructor payout request with available balance hold' })
  @ApiResponse({ status: 201, description: 'Payout request submitted successfully' })
  async requestPayout(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = requestPayoutSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.payoutsService.requestPayout(
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
      message: 'Payout request submitted successfully',
      data,
    };
  }

  @Get('ledger')
  @ApiOperation({ summary: 'List double-entry ledger entries for authenticated instructor' })
  @ApiResponse({ status: 200, description: 'Instructor ledger statement retrieved successfully' })
  async getLedger(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const page = Number((query as any)?.page) || 1;
    const limit = Number((query as any)?.limit) || 20;

    const data = await this.ledgerService.getInstructorLedger(req.user!.id, { page, limit });

    return {
      success: true,
      message: 'Instructor ledger retrieved successfully',
      data,
    };
  }
}
