import {
  Controller,
  Post,
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
import { OptionsService } from './options.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResourceOwnershipGuard } from '../../common/guards/resource-ownership.guard';
import { RequireOwnership } from '../../common/auth/decorators/resource-ownership.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createOptionSchema } from './dto/create-option.dto';
import { updateOptionSchema } from './dto/update-option.dto';
import { reorderSchema } from './dto/reorder.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Quiz Question Options')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard, ResourceOwnershipGuard)
@Controller('admin')
export class OptionsController {
  constructor(
    @Inject(OptionsService) private readonly optionsService: OptionsService
  ) {}

  @Post('questions/:questionId/options')
  @Roles('admin', 'instructor')
  @RequireOwnership('quizQuestion', 'questionId')
  @ApiOperation({ summary: 'Add an option to a question (Admin or course Instructor)' })
  @ApiResponse({ status: 201, description: 'Option created successfully' })
  async create(
    @Param('questionId') questionId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(questionId);
    if (!parseId.success) {
      throw new ApiException('Invalid question ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = createOptionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.optionsService.create(questionId, parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Option created successfully',
      data,
    };
  }

  @Patch('options/:id')
  @Roles('admin', 'instructor')
  @RequireOwnership('quizOption', 'id')
  @ApiOperation({ summary: 'Update an option (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Option updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid option ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateOptionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.optionsService.update(id, parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Option updated successfully',
      data,
    };
  }

  @Delete('options/:id')
  @Roles('admin', 'instructor')
  @RequireOwnership('quizOption', 'id')
  @ApiOperation({ summary: 'Delete an option (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Option deleted successfully' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid option ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.optionsService.delete(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Option deleted successfully',
      data,
    };
  }

  @Post('questions/:questionId/options/reorder')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'instructor')
  @RequireOwnership('quizQuestion', 'questionId')
  @ApiOperation({ summary: 'Reorder options within a question' })
  @ApiResponse({ status: 200, description: 'Options reordered successfully' })
  async reorder(
    @Param('questionId') questionId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(questionId);
    if (!parseId.success) {
      throw new ApiException('Invalid question ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
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

    const data = await this.optionsService.reorder(questionId, parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Options reordered successfully',
      data,
    };
  }
}
