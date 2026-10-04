import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  HttpStatus,
  HttpCode,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { reconciliationQuerySchema } from './dto/query-finance.dto';

@ApiTags('Admin Reconciliation')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/reconciliation')
export class AdminReconciliationController {
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

  @Get()
  @ApiOperation({ summary: 'Run or preview safe reconciliation discrepancies (Admin only)' })
  @ApiResponse({ status: 200, description: 'Reconciliation scan executed successfully' })
  async getReconciliationScan(
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = reconciliationQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.financeService.scanReconciliation(parseResult.data, req.user?.id);

    return {
      success: true,
      message: 'Reconciliation scan completed successfully',
      data,
    };
  }

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger reconciliation scan with auto-resolve or dryRun (Admin only)' })
  @ApiResponse({ status: 200, description: 'Reconciliation scan executed successfully' })
  async triggerScan(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = reconciliationQuerySchema.safeParse(body || {});
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.financeService.scanReconciliation(parseResult.data, req.user?.id);

    return {
      success: true,
      message: 'Reconciliation scan executed successfully',
      data,
    };
  }
}
