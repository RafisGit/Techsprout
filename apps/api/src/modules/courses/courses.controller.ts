import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { CoursesService } from './courses.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ResourceOwnershipGuard } from '../../common/guards/resource-ownership.guard';
import { RequireOwnership } from '../../common/auth/decorators/resource-ownership.decorator';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createCourseSchema } from './dto/create-course.dto';
import { updateCourseSchema } from './dto/update-course.dto';
import { adminQueryCoursesSchema } from './dto/query-courses.dto';

const uuidSchema = z.string().uuid('Invalid course ID');

@ApiTags('Admin Courses')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard, ResourceOwnershipGuard)
@Controller('admin/courses')
export class CoursesController {
  constructor(@Inject(CoursesService) private readonly coursesService: CoursesService) {}

  @Post()
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Create a new course (Admin or Instructor)' })
  @ApiResponse({ status: 201, description: 'Course created successfully' })
  async create(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = createCourseSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.create(
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course created successfully',
      data,
    };
  }

  @Get()
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'List courses with administrative filters and pagination' })
  @ApiResponse({ status: 200, description: 'Courses retrieved successfully' })
  async findAll(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = adminQueryCoursesSchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.findAdminCourses(parseResult.data, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Courses retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get full course details by ID' })
  @ApiResponse({ status: 200, description: 'Course details retrieved successfully' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.findAdminCourseById(id, {
      id: req.user!.id,
      role: req.user!.role,
    });

    return {
      success: true,
      message: 'Course retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @Roles('admin', 'instructor')
  @RequireOwnership('course', 'id')
  @ApiOperation({ summary: 'Update course metadata' })
  @ApiResponse({ status: 200, description: 'Course updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateCourseSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.update(
      id,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('admin', 'instructor')
  @RequireOwnership('course', 'id')
  @ApiOperation({ summary: 'Delete a draft course' })
  @ApiResponse({ status: 200, description: 'Course deleted successfully' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.delete(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course deleted successfully',
      data,
    };
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Publish a draft course (Admin only)' })
  @ApiResponse({ status: 200, description: 'Course published successfully' })
  async publish(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.publish(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course published successfully',
      data,
    };
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Unpublish a published course (Admin only)' })
  @ApiResponse({ status: 200, description: 'Course unpublished successfully' })
  async unpublish(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.unpublish(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course unpublished successfully',
      data,
    };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  @ApiOperation({ summary: 'Archive a published course (Admin only)' })
  @ApiResponse({ status: 200, description: 'Course archived successfully' })
  async archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid course ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.coursesService.archive(
      id,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Course archived successfully',
      data,
    };
  }
}
