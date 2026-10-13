import { z } from 'zod';

export const queryCoursesSchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  categorySlug: z.string().trim().max(120).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
  language: z.string().trim().max(50).optional(),
  minPrice: z.coerce.number().min(0, 'minPrice must be non-negative').optional(),
  maxPrice: z.coerce.number().min(0, 'maxPrice must be non-negative').optional(),
  sortBy: z.enum(['createdAt', 'price', 'title']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1, 'page must be at least 1').optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(100, 'limit cannot exceed 100')
    .optional()
    .default(12),
});

export type QueryCoursesDto = z.infer<typeof queryCoursesSchema>;

export const adminQueryCoursesSchema = queryCoursesSchema.extend({
  status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  instructorId: z.string().uuid('Invalid instructor ID').optional(),
});

export type AdminQueryCoursesDto = z.infer<typeof adminQueryCoursesSchema>;
