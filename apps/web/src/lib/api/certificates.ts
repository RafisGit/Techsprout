import { axiosInstance } from '@/lib/axiosInstance';
import type {
  CertificateDto,
  PublicCertificateVerificationDto,
} from '@techsprout/contracts';

/**
 * Fetch the authenticated student's certificate for a completed course.
 * GET /api/v1/courses/:courseId/certificate
 */
export async function fetchStudentCertificate(
  courseId: string
): Promise<CertificateDto> {
  const response = await axiosInstance.get(`/api/v1/courses/${courseId}/certificate`);
  return response.data.data;
}

// Alias for convenience / contract compatibility
export const getStudentCertificate = fetchStudentCertificate;

/**
 * Publicly verify a certificate by its certificate number.
 * No authentication required.
 * GET /api/v1/certificates/verify/:certificateNumber
 */
export async function verifyCertificate(
  certificateNumber: string
): Promise<PublicCertificateVerificationDto> {
  const encoded = encodeURIComponent(certificateNumber.trim());
  const response = await axiosInstance.get(`/api/v1/certificates/verify/${encoded}`);
  return response.data.data;
}

export const getPublicCertificateVerification = verifyCertificate;
