import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CoursesService } from './courses.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResourceOwnershipGuard } from '../../common/guards/resource-ownership.guard';
import { RequireOwnership } from '../../common/auth/decorators/resource-ownership.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { adminQueryCoursesSchema } from './dto/query-courses.dto';
import { submitCourseReviewSchema } from './dto/review-course.dto';

const uuidSchema = z.string().uuid('Invalid course ID');

@ApiTags('Instructor Courses')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard, ResourceOwnershipGuard)
@Controller('instructor/courses')
export class InstructorCoursesController {
  constructor(@Inject(CoursesService) private readonly coursesService: CoursesService) {}

  @Get()
  @Roles('instructor')
  @ApiOperation({ summary: 'List courses owned by authenticated instructor' })
  @ApiResponse({ status: 200, description: 'Instructor courses retrieved successfully' })
  async findAll(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = adminQueryCoursesSchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.findAdminCourses(parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Instructor courses retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @Roles('instructor')
  @RequireOwnership('course', 'id')
  @ApiOperation({ summary: 'Get owned course details with review status' })
  @ApiResponse({ status: 200, description: 'Course details retrieved successfully' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.findInstructorCourseById(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Course retrieved successfully',
      data,
    };
  }

  @Get(':id/review-status')
  @Roles('instructor')
  @RequireOwnership('course', 'id')
  @ApiOperation({ summary: 'Get course review requests and decision history' })
  @ApiResponse({ status: 200, description: 'Review status retrieved successfully' })
  async getReviewStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.getReviewStatus(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Review status retrieved successfully',
      data,
    };
  }

  @Post(':id/submit-for-review')
  @HttpCode(HttpStatus.OK)
  @Roles('instructor')
  @RequireOwnership('course', 'id')
  @ApiOperation({ summary: 'Submit course for administrative review' })
  @ApiResponse({ status: 200, description: 'Course submitted for review successfully' })
  async submitForReview(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = submitCourseReviewSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.submitForReview(
      id,
      { id: req.user!.id, role: req.user!.role },
      parseResult.data,
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course submitted for review successfully',
      data,
    };
  }

  @Post(':id/withdraw-review')
  @HttpCode(HttpStatus.OK)
  @Roles('instructor')
  @RequireOwnership('course', 'id')
  @ApiOperation({ summary: 'Withdraw pending course review request' })
  @ApiResponse({ status: 200, description: 'Course review withdrawn successfully' })
  async withdrawReview(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.withdrawReview(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course review withdrawn successfully',
      data,
    };
  }
}
