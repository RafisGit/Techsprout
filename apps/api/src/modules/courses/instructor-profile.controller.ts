import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Req,
  HttpCode,
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
import { updateInstructorProfileSchema } from '@techsprout/contracts';
import { CoursesService } from './courses.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';

@ApiTags('Instructor Profile')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@UseGuards(RolesGuard)
@Controller('instructor/profile')
export class InstructorProfileController {
  constructor(@Inject(CoursesService) private readonly coursesService: CoursesService) {}

  @Get()
  @Roles('instructor', 'admin')
  @ApiOperation({ summary: 'Get authenticated instructor profile' })
  @ApiResponse({ status: 200, description: 'Instructor profile retrieved successfully' })
  async getProfile(@Req() req: AuthenticatedRequest) {
    const profile = await this.coursesService.getInstructorProfile(req.user!.id);
    return {
      success: true,
      message: 'Instructor profile retrieved successfully',
      data: profile,
    };
  }

  @Put()
  @Roles('instructor', 'admin')
  @ApiOperation({ summary: 'Update or create authenticated instructor profile' })
  @ApiResponse({ status: 200, description: 'Instructor profile updated successfully' })
  async updateProfile(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parseResult = updateInstructorProfileSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.coursesService.upsertInstructorProfile(
      req.user!.id,
      parseResult.data,
      { id: req.user!.id, role: req.user!.role },
      req.ip,
      req.headers['user-agent'],
      req.id
    );

    return {
      success: true,
      message: 'Instructor profile updated successfully',
      data,
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles('instructor', 'admin')
  @ApiOperation({ summary: 'Create or update authenticated instructor profile (alias for PUT)' })
  @ApiResponse({ status: 200, description: 'Instructor profile updated successfully' })
  async createProfile(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.updateProfile(body, req);
  }
}
