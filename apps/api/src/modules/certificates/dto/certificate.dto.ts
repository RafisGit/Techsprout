import { z } from 'zod';

export type CertificateStatus = 'ACTIVE' | 'REVOKED';

export const certificateNumberSchema = z
  .string({ required_error: 'Certificate number is required' })
  .trim()
  .min(1, 'Certificate number is required')
  .max(50, 'Certificate number cannot exceed 50 characters');

export interface CertificateDto {
  id: string;
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: string;
  issuedAt: string;
  finalScorePercentage: number | null;
  status: CertificateStatus;
  pdfUrl?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface PublicCertificateVerificationDto {
  isValid: boolean;
  certificateNumber: string;
  status: CertificateStatus;
  studentName: string;
  courseTitle: string;
  instructorName?: string;
  completedAt?: string;
  issuedAt?: string;
  finalScorePercentage?: number | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
}

export interface AdminCertificateDto {
  id: string;
  certificateNumber: string;
  enrollmentId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: string;
  issuedAt: string;
  finalScorePercentage: number | null;
  status: CertificateStatus;
  revokedAt?: string | null;
  revocationReason?: string | null;
  pdfMediaId?: string | null;
  pdfUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapToStudentCertificateDto(cert: {
  id: string;
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: Date | string;
  issuedAt: Date | string;
  finalScorePercentage: number | null;
  status: CertificateStatus;
  pdfUrl?: string | null;
  revokedAt?: Date | string | null;
  revocationReason?: string | null;
}): CertificateDto {
  const completedAt = cert.completedAt instanceof Date ? cert.completedAt.toISOString() : String(cert.completedAt);
  const issuedAt = cert.issuedAt instanceof Date ? cert.issuedAt.toISOString() : String(cert.issuedAt);
  const revokedAt = cert.revokedAt
    ? cert.revokedAt instanceof Date
      ? cert.revokedAt.toISOString()
      : String(cert.revokedAt)
    : undefined;

  return {
    id: cert.id,
    certificateNumber: cert.certificateNumber,
    studentName: cert.studentName,
    courseTitle: cert.courseTitle,
    instructorName: cert.instructorName,
    completedAt,
    issuedAt,
    finalScorePercentage: cert.finalScorePercentage,
    status: cert.status,
    pdfUrl: cert.pdfUrl || null,
    ...(revokedAt ? { revokedAt } : {}),
    ...(cert.revocationReason ? { revocationReason: cert.revocationReason } : {}),
  };
}

export function mapToPublicVerificationDto(cert: {
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  instructorName?: string;
  completedAt?: Date | string | null;
  issuedAt?: Date | string | null;
  finalScorePercentage?: number | null;
  status: CertificateStatus;
  revokedAt?: Date | string | null;
  revocationReason?: string | null;
}): PublicCertificateVerificationDto {
  if (cert.status === 'REVOKED') {
    const revokedAt = cert.revokedAt
      ? cert.revokedAt instanceof Date
        ? cert.revokedAt.toISOString()
        : String(cert.revokedAt)
      : undefined;

    return {
      isValid: false,
      certificateNumber: cert.certificateNumber,
      status: 'REVOKED',
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      instructorName: cert.instructorName,
      revokedAt,
      revocationReason: cert.revocationReason || undefined,
    };
  }

  const completedAt = cert.completedAt
    ? cert.completedAt instanceof Date
      ? cert.completedAt.toISOString()
      : String(cert.completedAt)
    : undefined;

  const issuedAt = cert.issuedAt
    ? cert.issuedAt instanceof Date
      ? cert.issuedAt.toISOString()
      : String(cert.issuedAt)
    : undefined;

  return {
    isValid: true,
    certificateNumber: cert.certificateNumber,
    status: 'ACTIVE',
    studentName: cert.studentName,
    courseTitle: cert.courseTitle,
    instructorName: cert.instructorName,
    completedAt,
    issuedAt,
    finalScorePercentage: cert.finalScorePercentage,
  };
}

export function mapToAdminCertificateDto(cert: {
  id: string;
  certificateNumber: string;
  enrollmentId: string;
  courseId: string;
  studentId: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  completedAt: Date | string;
  issuedAt: Date | string;
  finalScorePercentage: number | null;
  status: CertificateStatus;
  revokedAt?: Date | string | null;
  revocationReason?: string | null;
  pdfMediaId?: string | null;
  pdfUrl?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): AdminCertificateDto {
  const completedAt = cert.completedAt instanceof Date ? cert.completedAt.toISOString() : String(cert.completedAt);
  const issuedAt = cert.issuedAt instanceof Date ? cert.issuedAt.toISOString() : String(cert.issuedAt);
  const createdAt = cert.createdAt instanceof Date ? cert.createdAt.toISOString() : String(cert.createdAt);
  const updatedAt = cert.updatedAt instanceof Date ? cert.updatedAt.toISOString() : String(cert.updatedAt);
  const revokedAt = cert.revokedAt
    ? cert.revokedAt instanceof Date
      ? cert.revokedAt.toISOString()
      : String(cert.revokedAt)
    : null;

  return {
    id: cert.id,
    certificateNumber: cert.certificateNumber,
    enrollmentId: cert.enrollmentId,
    courseId: cert.courseId,
    studentId: cert.studentId,
    studentName: cert.studentName,
    courseTitle: cert.courseTitle,
    instructorName: cert.instructorName,
    completedAt,
    issuedAt,
    finalScorePercentage: cert.finalScorePercentage,
    status: cert.status,
    revokedAt,
    revocationReason: cert.revocationReason || null,
    pdfMediaId: cert.pdfMediaId || null,
    pdfUrl: cert.pdfUrl || null,
    createdAt,
    updatedAt,
  };
}
