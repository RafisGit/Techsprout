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
import { ModulesService } from './modules.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResourceOwnershipGuard } from '../../common/guards/resource-ownership.guard';
import { RequireOwnership } from '../../common/auth/decorators/resource-ownership.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createModuleSchema } from './dto/create-module.dto';
import { updateModuleSchema } from './dto/update-module.dto';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Admin Modules')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard, ResourceOwnershipGuard)
@Controller('admin')
export class ModulesController {
  constructor(@Inject(ModulesService) private readonly modulesService: ModulesService) {}

  @Post('courses/:id/modules')
  @Roles('admin', 'instructor')
  @RequireOwnership('course', 'id')
  @ApiOperation({ summary: 'Create a module in a course (Admin or course Instructor)' })
  @ApiResponse({ status: 201, description: 'Module created successfully' })
  async create(
    @Param('id') courseId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(courseId);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = createModuleSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.modulesService.create(
      courseId,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Module created successfully',
      data,
    };
  }

  @Patch('modules/:id')
  @Roles('admin', 'instructor')
  @RequireOwnership('module', 'id')
  @ApiOperation({ summary: 'Update a module (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Module updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid module ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateModuleSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.modulesService.update(
      id,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Module updated successfully',
      data,
    };
  }

  @Delete('modules/:id')
  @Roles('admin', 'instructor')
  @RequireOwnership('module', 'id')
  @ApiOperation({ summary: 'Delete a module and its lessons (Admin or course Instructor)' })
  @ApiResponse({ status: 200, description: 'Module deleted successfully' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid module ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.modulesService.delete(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Module deleted successfully',
      data,
    };
  }
}
