import {
  Controller,
  Get,
  Req,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';

@ApiTags('Learning Analytics')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Controller('learn/analytics')
export class LearningAnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService
  ) {}

  @Get('engagement')
  @Roles('student', 'instructor', 'admin')
  @ApiOperation({ summary: 'Get authenticated student personal learning engagement counters' })
  @ApiResponse({ status: 200, description: 'Student engagement analytics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async getEngagement(@Req() req: AuthenticatedRequest) {
    const data = await this.analyticsService.getStudentEngagement(req.user!.id);
    return {
      success: true,
      message: 'Student engagement analytics retrieved successfully',
      data,
    };
  }
}
