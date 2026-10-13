import { z } from 'zod';
import { analyticsDateRangeQuerySchema, type AnalyticsDateRangeQuery } from '@techsprout/contracts';

export const queryAnalyticsDateRangeSchema = analyticsDateRangeQuerySchema;
export type QueryAnalyticsDateRangeDto = AnalyticsDateRangeQuery;
