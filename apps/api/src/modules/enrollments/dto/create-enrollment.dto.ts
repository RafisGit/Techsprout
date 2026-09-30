import { z } from 'zod';

export const createEnrollmentSchema = z
  .object({
    courseId: z.string().uuid('Invalid course ID format'),
  })
  .strip();

export type CreateEnrollmentDto = z.infer<typeof createEnrollmentSchema>;
