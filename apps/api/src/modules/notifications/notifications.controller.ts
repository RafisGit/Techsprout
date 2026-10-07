import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Req,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { NotificationsService } from './notifications.service';
import { AuthenticatedRequest } from '../../common/http/correlation-id.middleware';
import { ApiException } from '../../common/errors/api-error';
import {
  notificationListQuerySchema,
  updateNotificationPreferencesSchema,
} from '@techsprout/contracts';

const uuidSchema = z.string().uuid('Invalid ID format');

@ApiTags('Notifications')
@ApiBearerAuth()
@ApiCookieAuth('techsprout_session')
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List user notifications with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  async getNotifications(
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = notificationListQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.notificationsService.getNotifications(
      req.user!.id,
      parseResult.data
    );

    return {
      success: true,
      data,
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for user' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.notificationsService.getUnreadCount(req.user!.id);
    return {
      success: true,
      data: {
        unreadCount: count,
      },
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ) {
    const parseId = uuidSchema.safeParse(id);
    if (!parseId.success) {
      throw new ApiException('Invalid notification ID format', HttpStatus.BAD_REQUEST, 'INVALID_ID');
    }

    const data = await this.notificationsService.markAsRead(req.user!.id, id);

    return {
      success: true,
      message: 'Notification marked as read',
      data,
    };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    const data = await this.notificationsService.markAllAsRead(req.user!.id);

    return {
      success: true,
      message: 'All notifications marked as read',
      data,
    };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get current user notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved successfully' })
  async getPreferences(@Req() req: AuthenticatedRequest) {
    const data = await this.notificationsService.getPreferences(req.user!.id);

    return {
      success: true,
      data,
    };
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update user notification preferences (strictly whitelisted fields)' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updatePreferences(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest
  ) {
    const parseResult = updateNotificationPreferencesSchema.safeParse(body);
    if (!parseResult.success) {
      throw new ApiException(
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        parseResult.error.flatten().fieldErrors
      );
    }

    const data = await this.notificationsService.updatePreferences(
      req.user!.id,
      parseResult.data
    );

    return {
      success: true,
      message: 'Preferences updated successfully',
      data,
    };
  }
}
