import { z } from 'zod';

export const createQuestionOptionInputSchema = z.object({
  optionText: z.string().min(1, 'Option text is required').trim(),
  position: z.number().int().min(1, 'Position must be a positive integer'),
  isCorrect: z.boolean().optional().default(false),
});

export const createQuestionSchema = z.object({
  questionText: z.string().min(1, 'Question text is required').trim(),
  questionType: z
    .enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'], {
      errorMap: () => ({
        message: 'Question type must be SINGLE_CHOICE, MULTIPLE_CHOICE, or TRUE_FALSE',
      }),
    })
    .optional()
    .default('SINGLE_CHOICE'),
  position: z.number().int().min(1, 'Position must be a positive integer'),
  points: z.number().int().min(1, 'Points must be a positive integer').optional().default(1),
  explanation: z.string().nullable().optional(),
  options: z.array(createQuestionOptionInputSchema).optional(),
});

export type CreateQuestionOptionInputDto = z.infer<typeof createQuestionOptionInputSchema>;
export type CreateQuestionDto = z.infer<typeof createQuestionSchema>;
