import { z } from 'zod';

export const updateOptionSchema = z.object({
  optionText: z.string().min(1, 'Option text cannot be empty').trim().optional(),
  position: z.number().int().min(1, 'Position must be a positive integer').optional(),
  isCorrect: z.boolean().optional(),
});

export type UpdateOptionDto = z.infer<typeof updateOptionSchema>;
