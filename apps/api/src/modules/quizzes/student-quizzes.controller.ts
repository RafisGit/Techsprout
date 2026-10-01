import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Req,
  HttpStatus,
  HttpCode,
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
import { StudentQuizzesService } from './student-quizzes.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { saveAnswersSchema, submitAttemptSchema } from './dto/save-answers.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Student Quizzes')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('learn/quizzes')
export class StudentQuizzesController {
  constructor(
    @Inject(StudentQuizzesService)
    private readonly studentQuizzesService: StudentQuizzesService
  ) {}

  @Get(':quizId')
  @ApiOperation({ summary: 'Get published quiz for student (omits answer keys and explanations)' })
  @ApiResponse({ status: 200, description: 'Student quiz retrieved successfully' })
  async getQuiz(
    @Param('quizId') quizId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseQuizId = uuidSchema.safeParse(quizId);
    if (!parseQuizId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.studentQuizzesService.getQuizForStudent(quizId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Quiz retrieved successfully',
      data,
    };
  }

  @Post(':quizId/attempts')
  @ApiOperation({ summary: 'Start a new quiz attempt or resume existing active attempt' })
  @ApiResponse({ status: 201, description: 'Quiz attempt active' })
  async startOrResumeAttempt(
    @Param('quizId') quizId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseQuizId = uuidSchema.safeParse(quizId);
    if (!parseQuizId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.studentQuizzesService.startOrResumeAttempt(
      quizId,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Attempt active',
      data,
    };
  }

  @Get(':quizId/attempts/:attemptId')
  @ApiOperation({ summary: 'Get active attempt or submitted result summary' })
  @ApiResponse({ status: 200, description: 'Attempt retrieved successfully' })
  async getAttemptDetail(
    @Param('quizId') quizId: string,
    @Param('attemptId') attemptId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseQuizId = uuidSchema.safeParse(quizId);
    if (!parseQuizId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseAttemptId = uuidSchema.safeParse(attemptId);
    if (!parseAttemptId.success) {
      throw new ApiException('Invalid attempt ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.studentQuizzesService.getAttemptDetail(quizId, attemptId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Attempt details retrieved',
      data,
    };
  }

  @Patch(':quizId/attempts/:attemptId/answers')
  @ApiOperation({ summary: 'Auto-save student answer selections for active attempt' })
  @ApiResponse({ status: 200, description: 'Answers saved' })
  async saveAnswers(
    @Param('quizId') quizId: string,
    @Param('attemptId') attemptId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseQuizId = uuidSchema.safeParse(quizId);
    if (!parseQuizId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseAttemptId = uuidSchema.safeParse(attemptId);
    if (!parseAttemptId.success) {
      throw new ApiException('Invalid attempt ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = saveAnswersSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.studentQuizzesService.saveAnswers(
      quizId,
      attemptId,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role }
    );

    return {
      success: true,
      message: 'Answers saved',
      data,
    };
  }

  @Post(':quizId/attempts/:attemptId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit attempt for authoritative server-side grading and scoring' })
  @ApiResponse({ status: 200, description: 'Attempt submitted and graded' })
  async submitAttempt(
    @Param('quizId') quizId: string,
    @Param('attemptId') attemptId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseQuizId = uuidSchema.safeParse(quizId);
    if (!parseQuizId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseAttemptId = uuidSchema.safeParse(attemptId);
    if (!parseAttemptId.success) {
      throw new ApiException('Invalid attempt ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = submitAttemptSchema.safeParse(body ?? {});
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.studentQuizzesService.submitAttempt(
      quizId,
      attemptId,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Attempt submitted and graded',
      data,
    };
  }

  @Get(':quizId/attempts/:attemptId/review')
  @ApiOperation({ summary: 'Get full quiz attempt review with correct answers and explanations (SUBMITTED attempts only)' })
  @ApiResponse({ status: 200, description: 'Attempt review retrieved' })
  async getAttemptReview(
    @Param('quizId') quizId: string,
    @Param('attemptId') attemptId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseQuizId = uuidSchema.safeParse(quizId);
    if (!parseQuizId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseAttemptId = uuidSchema.safeParse(attemptId);
    if (!parseAttemptId.success) {
      throw new ApiException('Invalid attempt ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.studentQuizzesService.getAttemptReview(quizId, attemptId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Attempt review retrieved',
      data,
    };
  }
}
