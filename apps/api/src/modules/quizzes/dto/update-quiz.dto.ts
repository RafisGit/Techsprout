import { z } from 'zod';

export const updateQuizSchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title cannot exceed 200 characters')
    .trim()
    .optional(),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').nullable().optional(),
  quizType: z
    .enum(['KNOWLEDGE_CHECK', 'FINAL_EXAM'], {
      errorMap: () => ({ message: 'Quiz type must be KNOWLEDGE_CHECK or FINAL_EXAM' }),
    })
    .optional(),
  position: z.number().int().min(1, 'Position must be a positive integer').optional(),
  passingScorePercentage: z
    .number()
    .int()
    .min(1, 'Passing score percentage must be between 1 and 100')
    .max(100, 'Passing score percentage must be between 1 and 100')
    .optional(),
  maxAttempts: z
    .number()
    .int()
    .min(1, 'Max attempts must be a positive integer')
    .nullable()
    .optional(),
  timeLimitMinutes: z
    .number()
    .int()
    .min(1, 'Time limit minutes must be a positive integer')
    .nullable()
    .optional(),
});

export type UpdateQuizDto = z.infer<typeof updateQuizSchema>;
