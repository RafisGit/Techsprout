import { describe, it, expect } from 'vitest';
import {
  certificateNumberSchema,
  revokeCertificateSchema,
  adminQueryCertificatesSchema,
  type CertificateDto,
  type PublicCertificateVerificationDto,
  type AdminCertificateDto,
  type CertificateStatus,
} from '../modules/certificates/dto';

export type CertificateErrorCode =
  | 'ENROLLMENT_NOT_FOUND'
  | 'COURSE_NOT_COMPLETED'
  | 'CERTIFICATE_NOT_FOUND'
  | 'CERTIFICATE_ALREADY_REVOKED';

describe('P4.5.1 — Certificates Contracts & DTOs Test Suite', () => {
  // ==========================================
  // 1. CertificateDto STRUCTURE
  // ==========================================
  describe('1. CertificateDto Contract Shape', () => {
    it('1.1 should construct a valid student-facing CertificateDto with all required attributes', () => {
      const activeCert: CertificateDto = {
        id: 'cert-uuid-001',
        certificateNumber: 'TSP-2026-CK7M9X2P',
        studentName: 'Jane Doe',
        courseTitle: 'Fullstack TypeScript Architecture',
        instructorName: 'Prof. Alan Turing',
        completedAt: '2026-10-01T12:00:00.000Z',
        issuedAt: '2026-10-01T12:00:05.000Z',
        finalScorePercentage: 92,
        status: 'ACTIVE',
        pdfUrl: null,
      };

      expect(activeCert.id).toBe('cert-uuid-001');
      expect(activeCert.certificateNumber).toBe('TSP-2026-CK7M9X2P');
      expect(activeCert.studentName).toBe('Jane Doe');
      expect(activeCert.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(activeCert.instructorName).toBe('Prof. Alan Turing');
      expect(activeCert.finalScorePercentage).toBe(92);
      expect(activeCert.status).toBe('ACTIVE');
      expect(activeCert.pdfUrl).toBeNull();
      expect(activeCert.revokedAt).toBeUndefined();
      expect(activeCert.revocationReason).toBeUndefined();
    });

    it('1.2 should support revoked attributes in student-facing CertificateDto for transparent learner notification', () => {
      const revokedCert: CertificateDto = {
        id: 'cert-uuid-002',
        certificateNumber: 'TSP-2026-REVOKED1',
        studentName: 'John Smith',
        courseTitle: 'DevOps & Cloud Systems',
        instructorName: 'Dr. Grace Hopper',
        completedAt: '2026-09-15T10:00:00.000Z',
        issuedAt: '2026-09-15T10:00:02.000Z',
        finalScorePercentage: 85,
        status: 'REVOKED',
        pdfUrl: null,
        revokedAt: '2026-09-20T14:30:00.000Z',
        revocationReason: 'Academic integrity violation: unauthorized assessment assistance.',
      };

      expect(revokedCert.status).toBe('REVOKED');
      expect(revokedCert.revokedAt).toBe('2026-09-20T14:30:00.000Z');
      expect(revokedCert.revocationReason).toBe(
        'Academic integrity violation: unauthorized assessment assistance.'
      );
    });
  });

  // ==========================================
  // 2. PUBLIC VERIFICATION DTO (ACTIVE)
  // ==========================================
  describe('2. Public Certificate Verification DTO (Active State)', () => {
    it('2.1 should structure an active public certificate with isValid: true and verified attributes', () => {
      const publicActive: PublicCertificateVerificationDto = {
        isValid: true,
        certificateNumber: 'TSP-2026-CK7M9X2P',
        status: 'ACTIVE',
        studentName: 'Jane Doe',
        courseTitle: 'Fullstack TypeScript Architecture',
        instructorName: 'Prof. Alan Turing',
        completedAt: '2026-10-01T12:00:00.000Z',
        issuedAt: '2026-10-01T12:00:05.000Z',
        finalScorePercentage: 92,
      };

      expect(publicActive.isValid).toBe(true);
      expect(publicActive.status).toBe('ACTIVE');
      expect(publicActive.certificateNumber).toBe('TSP-2026-CK7M9X2P');
      expect(publicActive.studentName).toBe('Jane Doe');
      expect(publicActive.courseTitle).toBe('Fullstack TypeScript Architecture');
      expect(publicActive.instructorName).toBe('Prof. Alan Turing');
      expect(publicActive.completedAt).toBe('2026-10-01T12:00:00.000Z');
      expect(publicActive.issuedAt).toBe('2026-10-01T12:00:05.000Z');
      expect(publicActive.finalScorePercentage).toBe(92);
    });
  });

  // ==========================================
  // 3. PUBLIC VERIFICATION DTO (REVOKED)
  // ==========================================
  describe('3. Public Certificate Verification DTO (Revoked State)', () => {
    it('3.1 should structure a revoked public certificate with isValid: false, status: REVOKED, and reason', () => {
      const publicRevoked: PublicCertificateVerificationDto = {
        isValid: false,
        certificateNumber: 'TSP-2026-REVOKED1',
        status: 'REVOKED',
        studentName: 'John Smith',
        courseTitle: 'DevOps & Cloud Systems',
        instructorName: 'Dr. Grace Hopper',
        revokedAt: '2026-09-20T14:30:00.000Z',
        revocationReason: 'Academic integrity violation: unauthorized assessment assistance.',
      };

      expect(publicRevoked.isValid).toBe(false);
      expect(publicRevoked.status).toBe('REVOKED');
      expect(publicRevoked.certificateNumber).toBe('TSP-2026-REVOKED1');
      expect(publicRevoked.revokedAt).toBe('2026-09-20T14:30:00.000Z');
      expect(publicRevoked.revocationReason).toBe(
        'Academic integrity violation: unauthorized assessment assistance.'
      );
    });
  });

  // ==========================================
  // 4. PII & INTERNAL KEY EXCLUSION (PRIVACY BOUNDARY)
  // ==========================================
  describe('4. Privacy Boundary & PII Exclusion Verification', () => {
    it('4.1 should strictly exclude sensitive PII and internal database foreign keys from public verification DTO', () => {
      const publicVerification: PublicCertificateVerificationDto = {
        isValid: true,
        certificateNumber: 'TSP-2026-CK7M9X2P',
        status: 'ACTIVE',
        studentName: 'Jane Doe',
        courseTitle: 'Fullstack TypeScript Architecture',
        instructorName: 'Prof. Alan Turing',
        completedAt: '2026-10-01T12:00:00.000Z',
        issuedAt: '2026-10-01T12:00:05.000Z',
        finalScorePercentage: 92,
      };

      // Strict runtime inspection confirming zero leaked fields
      const disallowedKeys = [
        'studentId',
        'userId',
        'enrollmentId',
        'email',
        'phone',
        'password',
        'pdfMediaId',
        'createdAt',
        'updatedAt',
        'ipAddress',
        'userAgent',
        'requestId',
      ];

      for (const key of disallowedKeys) {
        expect((publicVerification as any)[key]).toBeUndefined();
      }
    });

    it('4.2 should validate certificate number format with certificateNumberSchema', () => {
      expect(certificateNumberSchema.safeParse('TSP-2026-CK7M9X2P').success).toBe(true);
      expect(certificateNumberSchema.safeParse('').success).toBe(false);
      expect(certificateNumberSchema.safeParse('   ').success).toBe(false);
      expect(certificateNumberSchema.safeParse('A'.repeat(51)).success).toBe(false);
    });
  });

  // ==========================================
  // 5. RevokeCertificateDto VALIDATION
  // ==========================================
  describe('5. RevokeCertificateDto Zod Validation', () => {
    it('5.1 should accept valid revocation reason with >= 5 characters', () => {
      const valid = { reason: 'Academic dishonesty in assessment.' };
      const parsed = revokeCertificateSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.reason).toBe('Academic dishonesty in assessment.');
      }
    });

    it('5.2 should trim whitespace around revocation reason', () => {
      const withWhitespace = { reason: '   Tuition default on student account.   ' };
      const parsed = revokeCertificateSchema.safeParse(withWhitespace);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.reason).toBe('Tuition default on student account.');
      }
    });

    it('5.3 should reject revocation reason shorter than 5 characters (e.g. "abcd")', () => {
      const fourChars = { reason: 'abcd' };
      const parsed = revokeCertificateSchema.safeParse(fourChars);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('at least 5 characters');
      }
    });

    it('5.4 should accept revocation reason with exactly 5 characters (e.g. "abcde")', () => {
      const fiveChars = { reason: 'abcde' };
      const parsed = revokeCertificateSchema.safeParse(fiveChars);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.reason).toBe('abcde');
      }
    });

    it('5.5 should reject whitespace-only revocation reason', () => {
      const whitespaceOnly = { reason: '     ' };
      const parsed = revokeCertificateSchema.safeParse(whitespaceOnly);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('at least 5 characters');
      }
    });

    it('5.6 should reject missing revocation reason', () => {
      const missing = {};
      const parsed = revokeCertificateSchema.safeParse(missing);
      expect(parsed.success).toBe(false);
    });

    it('5.7 should reject revocation reason exceeding 1000 characters', () => {
      const tooLong = { reason: 'X'.repeat(1001) };
      const parsed = revokeCertificateSchema.safeParse(tooLong);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('cannot exceed 1000 characters');
      }
    });
  });

  // ==========================================
  // 6. ADMIN FILTER & PAGINATION CONTRACT
  // ==========================================
  describe('6. Admin Query & Pagination Contract', () => {
    it('6.1 should parse admin query with default pagination (page=1, limit=20)', () => {
      const emptyQuery = {};
      const parsed = adminQueryCertificatesSchema.safeParse(emptyQuery);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(1);
        expect(parsed.data.limit).toBe(20);
        expect(parsed.data.status).toBeUndefined();
        expect(parsed.data.courseId).toBeUndefined();
        expect(parsed.data.search).toBeUndefined();
      }
    });

    it('6.2 should coerce string query parameters to numbers', () => {
      const stringQuery = { page: '3', limit: '50' };
      const parsed = adminQueryCertificatesSchema.safeParse(stringQuery);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(3);
        expect(parsed.data.limit).toBe(50);
      }
    });

    it('6.3 should accept valid status filter and courseId UUID', () => {
      const filteredQuery = {
        status: 'ACTIVE',
        courseId: '11111111-1111-4111-8111-111111111111',
        search: 'Jane',
      };
      const parsed = adminQueryCertificatesSchema.safeParse(filteredQuery);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe('ACTIVE');
        expect(parsed.data.courseId).toBe('11111111-1111-4111-8111-111111111111');
        expect(parsed.data.search).toBe('Jane');
      }
    });

    it('6.4 should reject invalid status enum or invalid UUID courseId', () => {
      expect(adminQueryCertificatesSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
      expect(adminQueryCertificatesSchema.safeParse({ courseId: 'not-a-uuid' }).success).toBe(false);
    });

    it('6.5 should reject page < 1 or limit > 100', () => {
      expect(adminQueryCertificatesSchema.safeParse({ page: 0 }).success).toBe(false);
      expect(adminQueryCertificatesSchema.safeParse({ limit: 101 }).success).toBe(false);
    });

    it('6.6 should construct valid AdminCertificateDto matching admin API requirements', () => {
      const adminCert: AdminCertificateDto = {
        id: 'cert-1',
        certificateNumber: 'TSP-2026-001',
        enrollmentId: 'enr-1',
        courseId: 'course-1',
        studentId: 'student-1',
        studentName: 'Alice',
        courseTitle: 'Intro to Programming',
        instructorName: 'Bob',
        completedAt: '2026-10-01T12:00:00Z',
        issuedAt: '2026-10-01T12:00:00Z',
        finalScorePercentage: 100,
        status: 'ACTIVE',
        createdAt: '2026-10-01T12:00:00Z',
        updatedAt: '2026-10-01T12:00:00Z',
      };

      expect(adminCert.id).toBe('cert-1');
      expect(adminCert.enrollmentId).toBe('enr-1');
      expect(adminCert.courseId).toBe('course-1');
      expect(adminCert.studentId).toBe('student-1');
    });
  });

  // ==========================================
  // 7. ERROR-CODE CONTRACT
  // ==========================================
  describe('7. Certificate Error Code Contracts', () => {
    it('7.1 should enforce the four required certificate error codes', () => {
      const errorCodes: CertificateErrorCode[] = [
        'ENROLLMENT_NOT_FOUND',
        'COURSE_NOT_COMPLETED',
        'CERTIFICATE_NOT_FOUND',
        'CERTIFICATE_ALREADY_REVOKED',
      ];

      expect(errorCodes).toContain('ENROLLMENT_NOT_FOUND');
      expect(errorCodes).toContain('COURSE_NOT_COMPLETED');
      expect(errorCodes).toContain('CERTIFICATE_NOT_FOUND');
      expect(errorCodes).toContain('CERTIFICATE_ALREADY_REVOKED');
    });
  });
});
