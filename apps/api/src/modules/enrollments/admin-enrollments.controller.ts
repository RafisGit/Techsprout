import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { EnrollmentsService } from './enrollments.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { adminAssignEnrollmentSchema } from './dto/admin-assign-enrollment.dto';
import { adminQueryCourseEnrollmentsSchema } from './dto/admin-query-course-enrollments.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Enrollments')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Controller('admin/courses')
export class AdminEnrollmentsController {
  constructor(
    @Inject(EnrollmentsService) private readonly enrollmentsService: EnrollmentsService
  ) {}

  @Post(':courseId/enrollments')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin assign enrollment to a student' })
  @ApiResponse({ status: 201, description: 'Student successfully enrolled by administrator' })
  @ApiResponse({ status: 200, description: 'Student already enrolled or reactivated' })
  async adminAssign(
    @Param('courseId') courseId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = adminAssignEnrollmentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const result = await this.enrollmentsService.adminAssignEnrollment(
      req.user!.id,
      courseId,
      parseResult.data.studentId,
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    res.status(result.statusCode);

    return {
      success: true,
      message: result.message,
      data: result.data,
    };
  }

  @Get(':id/enrollments')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'List course enrollments roster (Admin or Course Instructor)' })
  @ApiResponse({ status: 200, description: 'Course enrollments retrieved successfully' })
  async getCourseEnrollments(
    @Param('id') courseId: string,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = adminQueryCourseEnrollmentsSchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.enrollmentsService.getAdminCourseEnrollments(
      courseId,
      { id: req.user!.id, role: req.user!.role },
      parseResult.data
    );

    return {
      success: true,
      message: 'Course enrollments retrieved successfully',
      data,
    };
  }
}
