import { z } from 'zod';

export const adminQueryCourseEnrollmentsSchema = z
  .object({
    status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strip();

export type AdminQueryCourseEnrollmentsDto = z.infer<typeof adminQueryCourseEnrollmentsSchema>;
