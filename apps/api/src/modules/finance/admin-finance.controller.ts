import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  HttpStatus,
  UseGuards,
  Inject,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { FinanceService } from './finance.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { financeExportQuerySchema } from './dto/export-finance.dto';

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

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('export')
  @ApiOperation({ summary: 'Export financial transactions as streaming CSV (Admin only)' })
  @ApiResponse({ status: 200, description: 'Streaming CSV file' })
  async exportFinanceCsv(
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const parseResult = financeExportQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const { stream, filename } = await this.financeService.exportFinanceCsvStream(
      parseResult.data,
      {
        id: req.user!.id,
        role: req.user!.role,
      },
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      }
    );

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(stream);
  }
}
