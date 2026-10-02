import { z } from 'zod';
import type { CertificateStatus } from './certificate.dto';

export const adminQueryCertificatesSchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').optional().default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').optional().default(20),
  status: z.enum(['ACTIVE', 'REVOKED']).optional(),
  courseId: z.string().uuid('Invalid course ID format').optional(),
  search: z.string().trim().max(100).optional(),
});

export type AdminQueryCertificatesDto = z.infer<typeof adminQueryCertificatesSchema>;

export interface AdminCertificateQuery {
  page?: number;
  limit?: number;
  status?: CertificateStatus;
  courseId?: string;
  search?: string;
}
