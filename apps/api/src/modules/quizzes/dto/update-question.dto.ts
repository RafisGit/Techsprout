import { z } from 'zod';

export const updateQuestionSchema = z.object({
  questionText: z.string().min(1, 'Question text cannot be empty').trim().optional(),
  questionType: z
    .enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'], {
      errorMap: () => ({
        message: 'Question type must be SINGLE_CHOICE, MULTIPLE_CHOICE, or TRUE_FALSE',
      }),
    })
    .optional(),
  position: z.number().int().min(1, 'Position must be a positive integer').optional(),
  points: z.number().int().min(1, 'Points must be a positive integer').optional(),
  explanation: z.string().nullable().optional(),
});

export type UpdateQuestionDto = z.infer<typeof updateQuestionSchema>;
