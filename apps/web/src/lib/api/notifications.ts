import { axiosInstance } from '@/lib/axiosInstance';
import type {
  NotificationDto,
  PaginatedNotificationsData,
  UnreadNotificationCountDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesRequest,
  NotificationListQuery,
} from '@techsprout/contracts';

/**
 * Fetch paginated notifications for the current authenticated user.
 * GET /api/v1/notifications
 */
export async function fetchNotifications(
  query?: NotificationListQuery
): Promise<PaginatedNotificationsData> {
  const response = await axiosInstance.get('/api/v1/notifications', {
    params: query,
  });
  return response.data.data;
}

/**
 * Fetch unread notification count.
 * GET /api/v1/notifications/unread-count
 */
export async function fetchUnreadCount(): Promise<UnreadNotificationCountDto> {
  const response = await axiosInstance.get('/api/v1/notifications/unread-count');
  return response.data.data;
}

/**
 * Mark a single notification as read.
 * PATCH /api/v1/notifications/:id/read
 */
export async function markNotificationAsRead(id: string): Promise<NotificationDto> {
  const response = await axiosInstance.patch(`/api/v1/notifications/${id}/read`);
  return response.data.data;
}

/**
 * Mark all notifications as read for current user.
 * PATCH /api/v1/notifications/read-all
 */
export async function markAllNotificationsAsRead(): Promise<{ updatedCount: number }> {
  const response = await axiosInstance.patch('/api/v1/notifications/read-all');
  return response.data.data;
}

/**
 * Fetch notification preferences for current user.
 * GET /api/v1/notifications/preferences
 */
export async function fetchNotificationPreferences(): Promise<NotificationPreferencesDto> {
  const response = await axiosInstance.get('/api/v1/notifications/preferences');
  return response.data.data;
}

/**
 * Update notification preferences for current user.
 * PATCH /api/v1/notifications/preferences
 */
export async function updateNotificationPreferences(
  data: UpdateNotificationPreferencesRequest
): Promise<NotificationPreferencesDto> {
  const response = await axiosInstance.patch('/api/v1/notifications/preferences', data);
  return response.data.data;
}
