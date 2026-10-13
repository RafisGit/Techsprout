import {
  Controller,
  Get,
  Query,
  Req,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { queryAdminCourseAnalyticsSchema } from './dto/admin-course-analytics-query.dto';

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService
  ) {}

  @Get('overview')
  @Roles('admin')
  @ApiOperation({ summary: 'Get institutional platform analytics overview' })
  @ApiResponse({ status: 200, description: 'Platform analytics overview retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires admin role' })
  async getOverview(@Req() _req: AuthenticatedRequest) {
    const data = await this.analyticsService.getAdminOverview();
    return {
      success: true,
      message: 'Platform analytics overview retrieved successfully',
      data,
    };
  }

  @Get('courses')
  @Roles('admin')
  @ApiOperation({ summary: 'Get paginated catalog course analytics rollup' })
  @ApiResponse({ status: 200, description: 'Admin course analytics retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires admin role' })
  async getCourses(@Query() query: unknown, @Req() _req: AuthenticatedRequest) {
    const parseQuery = queryAdminCourseAnalyticsSchema.safeParse(query);
    if (!parseQuery.success) {
      throw new ApiException(
        'Validation failed for query parameters',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseQuery.error.flatten().fieldErrors
      );
    }

    const data = await this.analyticsService.getAdminCourseAnalytics(parseQuery.data);
    return {
      success: true,
      message: 'Admin course analytics retrieved successfully',
      data,
    };
  }
}
