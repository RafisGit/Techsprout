import { Controller, Get, Param, Query, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CoursesService } from '../courses/courses.service';
import { Public } from '../../common/auth/decorators/public.decorator';
import { ApiException } from '../../common/errors/api-error';
import { queryCoursesSchema } from '../courses/dto/query-courses.dto';

@ApiTags('Public Categories')
@Controller('categories')
export class PublicCategoriesController {
  constructor(
    @Inject(CategoriesService) private readonly categoriesService: CategoriesService,
    @Inject(CoursesService) private readonly coursesService: CoursesService
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active categories with published course counts' })
  @ApiResponse({ status: 200, description: 'Active categories retrieved successfully' })
  async getCategories() {
    const data = await this.categoriesService.findPublicCategories();
    return {
      success: true,
      message: 'Categories retrieved successfully',
      data,
    };
  }

  @Public()
  @Get(':slug/courses')
  @ApiOperation({ summary: 'List published courses belonging to a specific category' })
  @ApiResponse({ status: 200, description: 'Category courses retrieved successfully' })
  async getCategoryCourses(@Param('slug') slug: string, @Query() query: unknown) {
    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
      throw new ApiException('Category slug is required', HttpStatus.BAD_REQUEST, 'INVALID_SLUG');
    }

    // Verify category exists and is active
    await this.categoriesService.findPublicCategoryBySlug(slug.trim());

    const parseResult = queryCoursesSchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.findPublicCourses({
      ...parseResult.data,
      categorySlug: slug.trim(),
    });

    return {
      success: true,
      message: 'Category courses retrieved successfully',
      data,
    };
  }
}
