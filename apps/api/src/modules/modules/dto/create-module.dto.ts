import { z } from 'zod';

export const createModuleSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must not exceed 200 characters')
    .trim(),
  description: z.string().max(2000, 'Description must not exceed 2000 characters').nullable().optional(),
  position: z.number().int().min(1, 'Position must be a positive integer'),
});

export type CreateModuleDto = z.infer<typeof createModuleSchema>;
