import {
  Controller,
  Get,
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
import { CategoriesService } from './categories.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import { createCategorySchema } from './dto/create-category.dto';
import { updateCategorySchema } from './dto/update-category.dto';

const uuidSchema = z.string().uuid('Invalid category ID');

@ApiTags('Admin Categories')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Controller('admin/categories')
export class CategoriesController {
  constructor(
    @Inject(CategoriesService) private readonly categoriesService: CategoriesService
  ) {}

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new course category (Admin only)' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  async create(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = createCategorySchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.categoriesService.create(
      parseResult.data,
      req.user?.id,
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Category created successfully',
      data,
    };
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all categories including inactive (Admin only)' })
  @ApiResponse({ status: 200, description: 'All categories retrieved successfully' })
  async findAll() {
    const data = await this.categoriesService.findAllAdmin();
    return {
      success: true,
      message: 'Categories retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get category by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Category retrieved successfully' })
  async findOne(@Param('id') id: string) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid category ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.categoriesService.findById(id);
    return {
      success: true,
      message: 'Category retrieved successfully',
      data,
    };
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update category by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid category ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const parseResult = updateCategorySchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.categoriesService.update(
      id,
      parseResult.data,
      req.user?.id,
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Category updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete category by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid category ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.categoriesService.delete(
      id,
      req.user?.id,
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Category deleted successfully',
      data,
    };
  }
}
