import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters').trim(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(120, 'Slug must not exceed 120 characters')
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric characters separated by single hyphens')
    .optional(),
  description: z.string().max(1000, 'Description must not exceed 1000 characters').optional(),
  isActive: z.boolean().optional().default(true),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
