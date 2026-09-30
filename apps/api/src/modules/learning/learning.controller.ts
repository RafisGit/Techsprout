import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpStatus,
  HttpCode,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { LearningService } from './learning.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { updateProgressCheckpointSchema } from './dto/update-progress.dto';
import { toggleLessonCompleteSchema } from './dto/toggle-complete.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Learning Workspace')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('learn/courses')
export class LearningController {
  constructor(@Inject(LearningService) private readonly learningService: LearningService) {}

  @Get(':courseId/curriculum')
  @ApiOperation({ summary: 'Get course learning curriculum with progress markers' })
  @ApiResponse({ status: 200, description: 'Curriculum retrieved successfully' })
  async getCurriculum(@Param('courseId') courseId: string, @Req() req: AuthenticatedRequest) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.learningService.getCurriculum(courseId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Learning curriculum retrieved successfully',
      data,
    };
  }

  @Get(':courseId/resume')
  @ApiOperation({ summary: 'Resolve resume learning point for an enrolled course' })
  @ApiResponse({ status: 200, description: 'Resume point resolved' })
  async getResumePoint(@Param('courseId') courseId: string, @Req() req: AuthenticatedRequest) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.learningService.getResumePoint(courseId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Resume point resolved',
      data,
    };
  }

  @Get(':courseId/lessons/:lessonId')
  @ApiOperation({ summary: 'Get full learning content for a lesson' })
  @ApiResponse({ status: 200, description: 'Lesson content retrieved successfully' })
  async getLessonContent(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseLessonId = uuidSchema.safeParse(lessonId);
    if (!parseLessonId.success) {
      throw new ApiException('Invalid lesson ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.learningService.getLessonContent(courseId, lessonId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Lesson content retrieved successfully',
      data,
    };
  }

  @Post(':courseId/lessons/:lessonId/progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save video playback progress checkpoint' })
  @ApiResponse({ status: 200, description: 'Progress checkpoint saved' })
  async saveProgress(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseLessonId = uuidSchema.safeParse(lessonId);
    if (!parseLessonId.success) {
      throw new ApiException('Invalid lesson ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateProgressCheckpointSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.learningService.saveProgressCheckpoint(
      courseId,
      lessonId,
      parseResult.data.watchPositionSeconds,
      {
        id: req.user!.id,
        role: req.user!.role,
      }
    );

    return {
      success: true,
      message: 'Progress checkpoint saved',
      data,
    };
  }

  @Post(':courseId/lessons/:lessonId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle lesson completion status' })
  @ApiResponse({ status: 200, description: 'Lesson completion status updated' })
  async toggleComplete(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseLessonId = uuidSchema.safeParse(lessonId);
    if (!parseLessonId.success) {
      throw new ApiException('Invalid lesson ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = toggleLessonCompleteSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.learningService.toggleLessonComplete(
      courseId,
      lessonId,
      parseResult.data.completed,
      {
        id: req.user!.id,
        role: req.user!.role,
      }
    );

    const message = parseResult.data.completed
      ? 'Lesson marked as complete'
      : 'Lesson marked as incomplete';

    return {
      success: true,
      message,
      data,
    };
  }
}
