import { z } from 'zod';

export const revokeCertificateSchema = z.object({
  reason: z
    .string({ required_error: 'Revocation reason is required' })
    .trim()
    .min(5, 'Revocation reason must be at least 5 characters')
    .max(1000, 'Revocation reason cannot exceed 1000 characters'),
});

export type RevokeCertificateDto = z.infer<typeof revokeCertificateSchema>;
