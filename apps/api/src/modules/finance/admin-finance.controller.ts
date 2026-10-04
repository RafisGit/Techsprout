import {
  Controller,
  Get,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Admin Finance')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(@Inject(FinanceService) private readonly financeService: FinanceService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get authoritative financial metrics and KPI aggregates (Admin only)' })
  @ApiResponse({ status: 200, description: 'Finance summary retrieved successfully' })
  async getSummary() {
    const data = await this.financeService.getFinanceSummary();

    return {
      success: true,
      message: 'Finance summary retrieved successfully',
      data,
    };
  }
}
