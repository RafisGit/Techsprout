import { z } from 'zod';

export const adminAssignEnrollmentSchema = z
  .object({
    studentId: z.string().uuid('Invalid student ID format'),
  })
  .strip();

export type AdminAssignEnrollmentDto = z.infer<typeof adminAssignEnrollmentSchema>;
