import { z } from 'zod';

export const updateProgressCheckpointSchema = z
  .object({
    watchPositionSeconds: z
      .number({ required_error: 'watchPositionSeconds is required' })
      .int('watchPositionSeconds must be an integer')
      .min(0, 'watchPositionSeconds must be a non-negative integer'),
  })
  .strip();

export type UpdateProgressCheckpointDto = z.infer<typeof updateProgressCheckpointSchema>;
