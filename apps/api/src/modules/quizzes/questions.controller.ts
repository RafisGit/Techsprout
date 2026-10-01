import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpStatus,
  HttpCode,
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
import { QuestionsService } from './questions.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createQuestionSchema } from './dto/create-question.dto';
import { updateQuestionSchema } from './dto/update-question.dto';
import { reorderSchema } from './dto/reorder.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Quiz Questions')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Controller('admin')
export class QuestionsController {
  constructor(
    @Inject(QuestionsService) private readonly questionsService: QuestionsService
  ) {}

  @Post('quizzes/:quizId/questions')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Add a question to a quiz (Admin or course Instructor)' })
  @ApiResponse({ status: 201, description: 'Question created successfully' })
  async create(
    @Param('quizId') quizId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(quizId);
    if (!parseId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = createQuestionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.questionsService.create(quizId, parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Question created successfully',
      data,
    };
  }

  @Get('questions/:id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get question details with options' })
  @ApiResponse({ status: 200, description: 'Question retrieved successfully' })
  async findById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid question ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.questionsService.findById(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Question retrieved successfully',
      data,
    };
  }

  @Patch('questions/:id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Update a question (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Question updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid question ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateQuestionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.questionsService.update(id, parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Question updated successfully',
      data,
    };
  }

  @Delete('questions/:id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Delete a question (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Question deleted successfully' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid question ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.questionsService.delete(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Question deleted successfully',
      data,
    };
  }

  @Post('quizzes/:quizId/questions/reorder')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Reorder questions within a quiz' })
  @ApiResponse({ status: 200, description: 'Questions reordered successfully' })
  async reorder(
    @Param('quizId') quizId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(quizId);
    if (!parseId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = reorderSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.questionsService.reorder(quizId, parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Questions reordered successfully',
      data,
    };
  }
}
