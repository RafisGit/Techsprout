import { axiosInstance } from '@/lib/axiosInstance';
import type {
  AdminAnalyticsOverviewDto,
  PaginatedAdminCourseAnalyticsData,
  AdminCourseAnalyticsItemDto,
  AdminCourseAnalyticsQuery,
  AdminAnalyticsReviewQueueSummaryDto,
} from '@techsprout/contracts';

export type {
  AdminAnalyticsOverviewDto,
  PaginatedAdminCourseAnalyticsData,
  AdminCourseAnalyticsItemDto,
  AdminCourseAnalyticsQuery,
  AdminAnalyticsReviewQueueSummaryDto,
};

export async function fetchAdminAnalyticsOverview(): Promise<AdminAnalyticsOverviewDto> {
  const response = await axiosInstance.get('/api/v1/admin/analytics/overview');
  return response.data.data;
}

export async function fetchAdminCourseAnalytics(
  params?: AdminCourseAnalyticsQuery
): Promise<PaginatedAdminCourseAnalyticsData> {
  const response = await axiosInstance.get('/api/v1/admin/analytics/courses', {
    params,
  });
  return response.data.data;
}
