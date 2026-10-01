import { z } from 'zod';

export const createQuizSchema = z.object({
  title: z
    .string({ required_error: 'Title is required' })
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters')
    .trim(),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').nullable().optional(),
  quizType: z
    .enum(['KNOWLEDGE_CHECK', 'FINAL_EXAM'], {
      errorMap: () => ({ message: 'Quiz type must be KNOWLEDGE_CHECK or FINAL_EXAM' }),
    })
    .optional()
    .default('KNOWLEDGE_CHECK'),
  position: z.number().int().min(1, 'Position must be a positive integer'),
  passingScorePercentage: z
    .number()
    .int()
    .min(1, 'Passing score percentage must be between 1 and 100')
    .max(100, 'Passing score percentage must be between 1 and 100')
    .optional()
    .default(70),
  maxAttempts: z
    .number()
    .int()
    .min(1, 'Max attempts must be a positive integer')
    .nullable()
    .optional()
    .default(3),
  timeLimitMinutes: z
    .number()
    .int()
    .min(1, 'Time limit minutes must be a positive integer')
    .nullable()
    .optional()
    .default(null),
});

export type CreateQuizDto = z.infer<typeof createQuizSchema>;
