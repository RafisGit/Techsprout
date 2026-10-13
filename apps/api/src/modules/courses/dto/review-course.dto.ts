import { z } from 'zod';
import {
  submitCourseReviewSchema,
  reviewDecisionSchema,
  courseReviewStatusSchema,
  SubmitCourseReviewRequest,
  ReviewDecisionRequest,
} from '@techsprout/contracts';

export {
  submitCourseReviewSchema,
  reviewDecisionSchema,
  courseReviewStatusSchema,
  SubmitCourseReviewRequest,
  ReviewDecisionRequest,
};

export const rejectCourseReviewSchema = z.object({
  adminFeedback: z
    .string({ required_error: 'Rejection feedback is required' })
    .trim()
    .min(5, 'Rejection feedback must be at least 5 characters')
    .max(2000, 'Rejection feedback cannot exceed 2000 characters'),
});

export type RejectCourseReviewDto = z.infer<typeof rejectCourseReviewSchema>;

export const queryReviewQueueSchema = z.object({
  status: courseReviewStatusSchema.optional().default('PENDING'),
  page: z.coerce.number().int().min(1, 'page must be at least 1').optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(100, 'limit cannot exceed 100')
    .optional()
    .default(12),
});

export type QueryReviewQueueDto = z.infer<typeof queryReviewQueueSchema>;
