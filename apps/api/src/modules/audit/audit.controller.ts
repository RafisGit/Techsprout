import { Controller, Get, Query, UseGuards, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Admin')
@ApiBearerAuth()
@ApiCookieAuth()
@UseGuards(RolesGuard)
@Controller('admin/audit-logs')
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Roles('admin')
  @Get()
  @ApiOperation({ summary: 'Retrieve append-only audit logs (Admin only)' })
  @ApiResponse({ status: 200, description: 'Audit logs' })
  async getAuditLogs(
    @Query('limit') limit = '50',
    @Query('offset') offset = '0'
  ) {
    const logs = await this.auditService.list(
      parseInt(limit, 10) || 50,
      parseInt(offset, 10) || 0
    );

    return {
      success: true,
      data: logs,
    };
  }
}
