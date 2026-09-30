import { z } from 'zod';

export const queryEnrollmentsSchema = z
  .object({
    status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(12),
  })
  .strip();

export type QueryEnrollmentsDto = z.infer<typeof queryEnrollmentsSchema>;
