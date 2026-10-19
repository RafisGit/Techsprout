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
import { AnalyticsService } from './analytics.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResourceOwnershipGuard } from '../../common/guards/resource-ownership.guard';
import { RequireOwnership } from '../../common/auth/decorators/resource-ownership.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { queryAnalyticsDateRangeSchema } from './dto/analytics-date-range.dto';
import { queryRetentionAnalyticsSchema } from '@techsprout/contracts';
import { ValidateCourseIdGuard } from './guards/validate-course-id.guard';

const uuidSchema = z.string().uuid('Invalid course ID format');

@ApiTags('Instructor Analytics')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard, ValidateCourseIdGuard, ResourceOwnershipGuard)
@Controller('instructor/analytics')
export class InstructorAnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService
  ) {}

  @Get('overview')
  @Roles('instructor')
  @ApiOperation({ summary: 'Get instructor portfolio analytics overview' })
  @ApiResponse({ status: 200, description: 'Instructor analytics overview retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires instructor role' })
  async getOverview(@Req() req: AuthenticatedRequest) {
    const data = await this.analyticsService.getInstructorOverview(req.user!.id);
    return {
      success: true,
      message: 'Instructor analytics overview retrieved successfully',
      data,
    };
  }

  @Get('courses/:courseId')
  @Roles('instructor', 'admin')
  @RequireOwnership('course', 'courseId')
  @ApiOperation({ summary: 'Get course analytics deep-dive (owned courses only, or admin superuser)' })
  @ApiResponse({ status: 200, description: 'Course analytics details retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid course ID or query parameter format' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden: access denied for unowned course' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async getCourseAnalytics(
    @Param('courseId') courseId: string,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(courseId);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseQuery = queryAnalyticsDateRangeSchema.safeParse(query);
    if (!parseQuery.success) {
      throw new ApiException(
        'Validation failed for query parameters',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseQuery.error.flatten().fieldErrors
      );
    }

    const data = await this.analyticsService.getCourseAnalyticsDetail(courseId, parseQuery.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Course analytics details retrieved successfully',
      data,
    };
  }

  @Get(['courses/:id/retention', 'courses/:courseId/retention'])
  @Roles('instructor', 'admin')
  @RequireOwnership('course', 'courseId')
  @ApiOperation({ summary: 'Get course video retention analytics and rewind heatmap' })
  @ApiResponse({ status: 200, description: 'Course video retention retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid course ID or query parameter format' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden: access denied for unowned course' })
  @ApiResponse({ status: 404, description: 'Course or lesson not found' })
  async getCourseRetention(
    @Param('id') paramId: string | undefined,
    @Param('courseId') paramCourseId: string | undefined,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const courseId = paramId || paramCourseId;
    const parseId = uuidSchema.safeParse(courseId);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseQuery = queryRetentionAnalyticsSchema.safeParse(query);
    if (!parseQuery.success) {
      throw new ApiException(
        'Validation failed for query parameters',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseQuery.error.flatten().fieldErrors
      );
    }

    const data = await this.analyticsService.getCourseVideoRetention(courseId!, parseQuery.data);

    return {
      success: true,
      message: 'Course video retention retrieved successfully',
      data,
    };
  }
}
