import { z } from 'zod';

export const createLessonSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters')
    .trim(),
  description: z.string().max(2000, 'Description cannot exceed 2000 characters').nullable().optional(),
  lessonType: z
    .enum(['VIDEO', 'TEXT', 'PDF'], {
      errorMap: () => ({ message: 'Lesson type must be VIDEO, TEXT, or PDF' }),
    })
    .optional()
    .default('VIDEO'),
  position: z.number().int().min(1, 'Position must be a positive integer'),
  durationSeconds: z.number().int().min(0, 'Duration seconds must be non-negative').optional().default(0),
  isPreview: z.boolean().optional().default(false),
  mediaId: z.string().uuid('Invalid media ID').nullable().optional(),
  content: z.string().nullable().optional(),
});

export type CreateLessonDto = z.infer<typeof createLessonSchema>;
