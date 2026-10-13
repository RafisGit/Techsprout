import { z } from 'zod';
import { adminCourseAnalyticsQuerySchema, type AdminCourseAnalyticsQuery } from '@techsprout/contracts';

export const queryAdminCourseAnalyticsSchema = adminCourseAnalyticsQuerySchema;
export type QueryAdminCourseAnalyticsDto = AdminCourseAnalyticsQuery;
