import { z } from 'zod';

export const updateCourseSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title must not exceed 200 characters')
    .trim()
    .optional(),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(250, 'Slug must not exceed 250 characters')
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric separated by hyphens')
    .optional(),
  shortDescription: z
    .string()
    .max(500, 'Short description must not exceed 500 characters')
    .trim()
    .nullable()
    .optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  instructorId: z.string().uuid('Invalid instructor ID').optional(),
  price: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'number' ? val.toFixed(2) : val))
    .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) && parseFloat(val) >= 0, {
      message: 'Price must be a valid non-negative decimal amount',
    })
    .optional(),
  currency: z.string().length(3, 'Currency must be a 3-letter code').optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
  language: z.string().max(50).optional(),
  durationMinutes: z.number().int().min(0, 'Duration minutes must be non-negative').optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  thumbnailMediaId: z.string().uuid('Invalid thumbnail media ID').nullable().optional(),
});

export type UpdateCourseDto = z.infer<typeof updateCourseSchema>;
