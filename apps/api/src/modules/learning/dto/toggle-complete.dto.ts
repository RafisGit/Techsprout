import { z } from 'zod';

export const toggleLessonCompleteSchema = z
  .object({
    completed: z.boolean({ required_error: 'completed boolean is required' }),
  })
  .strip();

export type ToggleLessonCompleteDto = z.infer<typeof toggleLessonCompleteSchema>;
