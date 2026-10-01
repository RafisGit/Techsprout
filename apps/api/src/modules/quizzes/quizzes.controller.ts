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
import { QuizzesService } from './quizzes.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createQuizSchema } from './dto/create-quiz.dto';
import { updateQuizSchema } from './dto/update-quiz.dto';
import { reorderSchema } from './dto/reorder.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Quizzes')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Controller('admin')
export class QuizzesController {
  constructor(
    @Inject(QuizzesService) private readonly quizzesService: QuizzesService
  ) {}

  @Post('modules/:id/quizzes')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Create a quiz inside a module (Admin or course Instructor)' })
  @ApiResponse({ status: 201, description: 'Quiz created successfully' })
  async create(
    @Param('id') moduleId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(moduleId);
    if (!parseId.success) {
      throw new ApiException('Invalid module ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = createQuizSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.quizzesService.create(
      moduleId,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Quiz created successfully',
      data,
    };
  }

  @Get('modules/:id/quizzes')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'List quizzes inside a module (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Quizzes listed successfully' })
  async listByModule(
    @Param('id') moduleId: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(moduleId);
    if (!parseId.success) {
      throw new ApiException('Invalid module ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.quizzesService.listByModule(moduleId, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Quizzes retrieved successfully',
      data,
    };
  }

  @Get('quizzes/:id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get authoring quiz details with questions and options' })
  @ApiResponse({ status: 200, description: 'Quiz retrieved successfully' })
  async findById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.quizzesService.findById(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Quiz retrieved successfully',
      data,
    };
  }

  @Patch('quizzes/:id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Update a quiz (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Quiz updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateQuizSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.quizzesService.update(
      id,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Quiz updated successfully',
      data,
    };
  }

  @Delete('quizzes/:id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Delete a quiz (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Quiz deleted successfully' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.quizzesService.delete(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Quiz deleted successfully',
      data,
    };
  }

  @Post('quizzes/:id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Publish a draft quiz' })
  @ApiResponse({ status: 200, description: 'Quiz published successfully' })
  async publish(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.quizzesService.publish(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Quiz published successfully',
      data,
    };
  }

  @Post('quizzes/:id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Archive a published quiz' })
  @ApiResponse({ status: 200, description: 'Quiz archived successfully' })
  async archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid quiz ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.quizzesService.archive(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Quiz archived successfully',
      data,
    };
  }

  @Post('modules/:id/quizzes/reorder')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Reorder quizzes within a module' })
  @ApiResponse({ status: 200, description: 'Quizzes reordered successfully' })
  async reorder(
    @Param('id') moduleId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(moduleId);
    if (!parseId.success) {
      throw new ApiException('Invalid module ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
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

    const data = await this.quizzesService.reorder(moduleId, parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Quizzes reordered successfully',
      data,
    };
  }
}
