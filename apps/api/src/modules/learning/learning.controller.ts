import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
  HttpStatus,
  HttpCode,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { z } from 'zod';
import { LearningService } from './learning.service';
import { TutorRetrievalService } from './tutor-retrieval.service';
import { TutorRateLimiterService } from './tutor-rate-limiter.service';
import { TutorLlmService } from './tutor-llm.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { updateProgressCheckpointSchema } from './dto/update-progress.dto';
import { toggleLessonCompleteSchema } from './dto/toggle-complete.dto';
import { tutorQuerySchema, tutorChatRequestSchema } from '@techsprout/contracts';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Learning Workspace')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('learn/courses')
export class LearningController {
  constructor(
    @Inject(LearningService) private readonly learningService: LearningService,
    @Inject(TutorRetrievalService) private readonly tutorRetrievalService: TutorRetrievalService,
    @Inject(TutorRateLimiterService) private readonly tutorRateLimiterService: TutorRateLimiterService,
    @Inject(TutorLlmService) private readonly tutorLlmService: TutorLlmService
  ) {}

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

  @Post(':courseId/tutor/context')
  @ApiOperation({ summary: 'Retrieve grounded lesson context and citations for AI tutoring' })
  @ApiResponse({ status: 200, description: 'Grounded citations retrieved successfully' })
  async getTutorContext(
    @Param('courseId') courseId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseBody = tutorQuerySchema.safeParse({ ...((body as any) || {}), courseId });
    if (!parseBody.success) {
      throw new ApiException(
        parseBody.error.errors[0]?.message || 'Invalid tutor query payload',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED'
      );
    }

    const data = await this.tutorRetrievalService.retrieveContext(
      courseId,
      parseBody.data.question,
      parseBody.data.maxCitations,
      {
        id: req.user!.id,
        role: req.user!.role,
      }
    );

    return {
      success: true,
      message: 'Tutor contextual citations retrieved successfully',
      data,
    };
  }

  @Post(':courseId/tutor/chat')
  @ApiOperation({ summary: 'Stream pedagogical AI tutor response grounded in curriculum context' })
  @ApiResponse({ status: 200, description: 'Server-Sent Events stream initiated' })
  async streamTutorChat(
    @Param('courseId') courseId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    const parseCourseId = uuidSchema.safeParse(courseId);
    if (!parseCourseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseBody = tutorChatRequestSchema.safeParse({ ...((body as any) || {}), courseId });
    if (!parseBody.success) {
      throw new ApiException(
        parseBody.error.errors[0]?.message || 'Invalid tutor chat request payload',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED'
      );
    }

    // 1. Enforce student daily rate limit (20 queries/day) before model invocation
    const rateLimit = await this.tutorRateLimiterService.checkAndIncrement(req.user!.id);
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', rateLimit.retryAfterSeconds.toString());
      throw new ApiException(
        `Daily AI tutor query limit reached (${rateLimit.limit} queries/day). Please try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
        'TUTOR_RATE_LIMIT_EXCEEDED'
      );
    }

    // 2. Verify learner access to this specific course
    await this.tutorRetrievalService.verifyAccess(courseId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    // 3. Retrieve curriculum citations
    const retrieval = await this.tutorRetrievalService.retrieveContext(
      courseId,
      parseBody.data.question,
      5
    );

    // 4. Initialize SSE Headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    // 5. Grounding Verification
    if (!retrieval.isGrounded) {
      res.write(`event: citations\ndata: ${JSON.stringify([])}\n\n`);
      const refusalNotice =
        retrieval.groundingNotice || 'This concept is not covered in this course curriculum.';
      res.write(`event: token\ndata: ${JSON.stringify({ token: refusalNotice })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ isGrounded: false, totalCitations: 0 })}\n\n`);
      res.end();
      return;
    }

    // 6. Send citations event
    res.write(`event: citations\ndata: ${JSON.stringify(retrieval.citations)}\n\n`);

    // 7. Stream LLM answer tokens progressively
    try {
      for await (const token of this.tutorLlmService.generateAnswerStream(
        parseBody.data.question,
        retrieval.citations,
        abortController.signal
      )) {
        if (abortController.signal.aborted) break;
        res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
      }

      if (!abortController.signal.aborted) {
        res.write(
          `event: done\ndata: ${JSON.stringify({
            isGrounded: true,
            totalCitations: retrieval.citations.length,
          })}\n\n`
        );
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            message: 'AI Tutor encountered an error generating response.',
            code: 'GENERATION_ERROR',
          })}\n\n`
        );
      }
    } finally {
      res.end();
    }
  }
}
