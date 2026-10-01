import { z } from 'zod';

export const createOptionSchema = z.object({
  optionText: z.string().min(1, 'Option text is required').trim(),
  position: z.number().int().min(1, 'Position must be a positive integer'),
  isCorrect: z.boolean().optional().default(false),
});

export type CreateOptionDto = z.infer<typeof createOptionSchema>;
