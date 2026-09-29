import {
  Controller,
  Get,
  Param,
  Query,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { Public } from '../../common/auth/decorators/public.decorator';
import { ApiException } from '../../common/errors/api-error';
import { queryCoursesSchema } from './dto/query-courses.dto';

@ApiTags('Public Courses')
@Controller('courses')
export class PublicCoursesController {
  constructor(@Inject(CoursesService) private readonly coursesService: CoursesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List published and public courses with filtering and search' })
  @ApiResponse({ status: 200, description: 'Courses retrieved successfully' })
  async getCourses(@Query() query: unknown) {
    const parseResult = queryCoursesSchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.findPublicCourses(parseResult.data);
    return {
      success: true,
      message: 'Courses retrieved successfully',
      data,
    };
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get published course details by slug' })
  @ApiResponse({ status: 200, description: 'Course details retrieved successfully' })
  async getCourseBySlug(@Param('slug') slug: string) {
    if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
      throw new ApiException('Course slug is required', HttpStatus.BAD_REQUEST, 'INVALID_SLUG');
    }

    const data = await this.coursesService.findPublicCourseBySlug(slug.trim());
    return {
      success: true,
      message: 'Course details retrieved successfully',
      data,
    };
  }
}
