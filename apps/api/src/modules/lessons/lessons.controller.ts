import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
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
import { LessonsService } from './lessons.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResourceOwnershipGuard } from '../../common/guards/resource-ownership.guard';
import { RequireOwnership } from '../../common/auth/decorators/resource-ownership.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createLessonSchema } from './dto/create-lesson.dto';
import { updateLessonSchema } from './dto/update-lesson.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Lessons')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard, ResourceOwnershipGuard)
@Controller('admin')
export class LessonsController {
  constructor(@Inject(LessonsService) private readonly lessonsService: LessonsService) {}

  @Post('modules/:id/lessons')
  @Roles('admin', 'instructor')
  @RequireOwnership('module', 'id')
  @ApiOperation({ summary: 'Create a lesson inside a module (Admin or course Instructor)' })
  @ApiResponse({ status: 201, description: 'Lesson created successfully' })
  async create(
    @Param('id') moduleId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(moduleId);
    if (!parseId.success) {
      throw new ApiException('Invalid module ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = createLessonSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.lessonsService.create(
      moduleId,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Lesson created successfully',
      data,
    };
  }

  @Patch('lessons/:id')
  @Roles('admin', 'instructor')
  @RequireOwnership('lesson', 'id')
  @ApiOperation({ summary: 'Update a lesson (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Lesson updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid lesson ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateLessonSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.lessonsService.update(
      id,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Lesson updated successfully',
      data,
    };
  }

  @Delete('lessons/:id')
  @Roles('admin', 'instructor')
  @RequireOwnership('lesson', 'id')
  @ApiOperation({ summary: 'Delete a lesson (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Lesson deleted successfully' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid lesson ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.lessonsService.delete(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Lesson deleted successfully',
      data,
    };
  }
}
