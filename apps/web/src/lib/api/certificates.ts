import { axiosInstance } from '@/lib/axiosInstance';
import type {
  CertificateDto,
  PublicCertificateVerificationDto,
  CertificateEligibilityDto,
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
 * Check certificate eligibility for the authenticated student.
 * GET /api/v1/courses/:courseId/certificate/eligibility
 */
export async function fetchCertificateEligibility(
  courseId: string
): Promise<CertificateEligibilityDto> {
  const response = await axiosInstance.get(`/api/v1/courses/${courseId}/certificate/eligibility`);
  return response.data.data;
}

export const getCertificateEligibility = fetchCertificateEligibility;

/**
 * Explicitly issue certificate for an eligible course enrollment.
 * POST /api/v1/courses/:courseId/certificate/issue
 */
export async function issueCertificate(
  courseId: string
): Promise<CertificateDto> {
  const response = await axiosInstance.post(`/api/v1/courses/${courseId}/certificate/issue`);
  return response.data.data;
}

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
