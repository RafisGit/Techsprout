import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Roles } from '../../common/auth/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { z } from 'zod';
import { ApiException } from '../../common/errors/api-error';

const assignRoleSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: z.enum(['student', 'admin', 'instructor'], {
    errorMap: () => ({ message: 'Role must be student, instructor, or admin' }),
  }),
});

@ApiTags('Admin')
@ApiBearerAuth()
@ApiCookieAuth()
@UseGuards(RolesGuard)
@Controller('admin')
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Roles('admin')
  @Get('users')
  @ApiOperation({ summary: 'List all registered users (Admin only)' })
  @ApiResponse({ status: 200, description: 'User list' })
  async listUsers(
    @Query('limit') limit = '50',
    @Query('offset') offset = '0'
  ) {
    const data = await this.usersService.listUsers(
      parseInt(limit, 10) || 50,
      parseInt(offset, 10) || 0
    );
    return {
      success: true,
      data,
    };
  }

  @Roles('admin')
  @Post('roles/assign')
  @ApiOperation({ summary: 'Assign a role to a user (Admin only)' })
  @ApiResponse({ status: 200, description: 'Role assigned' })
  async assignRole(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = assignRoleSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const adminId = req.user!.id;

    return this.usersService.assignRole(
      parseResult.data.userId,
      parseResult.data.role,
      adminId,
      ip,
      req.id
    );
  }
}
