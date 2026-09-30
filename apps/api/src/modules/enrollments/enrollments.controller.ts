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
  HttpCode,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { EnrollmentsService } from './enrollments.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createEnrollmentSchema } from './dto/create-enrollment.dto';
import { queryEnrollmentsSchema } from './dto/query-enrollments.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Enrollments')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller()
export class EnrollmentsController {
  constructor(
    @Inject(EnrollmentsService) private readonly enrollmentsService: EnrollmentsService
  ) {}

  @Post('enrollments')
  @ApiOperation({ summary: 'Self-enroll authenticated student into a published course' })
  @ApiResponse({ status: 201, description: 'Course enrollment successful' })
  @ApiResponse({ status: 200, description: 'Already enrolled or reactivated' })
  async selfEnroll(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const parseResult = createEnrollmentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const result = await this.enrollmentsService.selfEnroll(
      req.user!.id,
      parseResult.data.courseId,
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

  @Get('enrollments')
  @ApiOperation({ summary: 'List all courses enrolled by the authenticated student' })
  @ApiResponse({ status: 200, description: 'Enrolled courses retrieved successfully' })
  async getMyEnrollments(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = queryEnrollmentsSchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.enrollmentsService.getMyEnrollments(req.user!.id, parseResult.data);

    return {
      success: true,
      message: 'Enrolled courses retrieved successfully',
      data,
    };
  }

  @Get('courses/:courseId/enrollment')
  @ApiOperation({ summary: 'Check if authenticated student is enrolled in a course' })
  @ApiResponse({ status: 200, description: 'Enrollment status retrieved' })
  async getEnrollmentStatus(@Param('courseId') courseId: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(courseId);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.enrollmentsService.getCourseEnrollmentStatus(req.user!.id, courseId);

    return {
      success: true,
      message: 'Enrollment status retrieved',
      data,
    };
  }

  @Post('enrollments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel own enrollment in a course' })
  @ApiResponse({ status: 200, description: 'Enrollment cancelled successfully' })
  async cancelEnrollment(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid enrollment ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.enrollmentsService.cancelEnrollment(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Enrollment cancelled successfully',
      data,
    };
  }
}
