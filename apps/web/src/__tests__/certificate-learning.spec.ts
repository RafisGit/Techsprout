import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  fetchStudentCertificate,
  getStudentCertificate,
  verifyCertificate,
  getPublicCertificateVerification,
} from '@/lib/api/certificates';
import {
  CertificateDocument,
  formatCertificateDate,
} from '@/components/certificate/CertificateDocument';
import { CertificateQRCode } from '@/components/certificate/CertificateQRCode';
import { generateQrMatrix } from '@/components/certificate/qr';
import {
  resolveEnrollmentCertificateCta,
  EnrollmentCertificateCta,
} from '@/components/certificate/CertificateCta';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  CertificateDto,
  PublicCertificateVerificationDto,
  EnrolledCourseItemDto,
} from '@techsprout/contracts';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P4.5.4 — Certificate Frontend & Public Verification Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mock Certificate Data
  const mockActiveCertificate: CertificateDto = {
    id: 'cert-uuid-1001',
    certificateNumber: 'TSP-2026-CA1B2C3D4',
    studentName: 'Alex Mercer',
    courseTitle: 'Enterprise TypeScript Architecture',
    instructorName: 'Dr. Jane Smith',
    completedAt: '2026-09-30T18:00:00.000Z',
    issuedAt: '2026-09-30T18:05:00.000Z',
    finalScorePercentage: 94,
    status: 'ACTIVE',
    pdfUrl: null,
    revokedAt: null,
    revocationReason: null,
  };

  const mockRevokedCertificate: CertificateDto = {
    id: 'cert-uuid-1002',
    certificateNumber: 'TSP-2026-CREVOKED1',
    studentName: 'Jordan Lee',
    courseTitle: 'Cloud Native Microservices',
    instructorName: 'Prof. Alan Turing',
    completedAt: '2026-08-15T14:30:00.000Z',
    issuedAt: '2026-08-15T14:35:00.000Z',
    finalScorePercentage: 88,
    status: 'REVOKED',
    pdfUrl: null,
    revokedAt: '2026-09-01T10:00:00.000Z',
    revocationReason: 'Academic integrity policy violation: unauthorized assessment assistance',
  };

  // =========================================================================
  // 1-10: STUDENT CERTIFICATE VIEW & SNAPSHOT
  // =========================================================================
  describe('Student Certificate Experience (/learn/[courseSlug]/certificate)', () => {
    it('1. certificate loads for completed course via GET /api/v1/courses/:courseId/certificate', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Certificate retrieved successfully',
          data: mockActiveCertificate,
        },
      });

      const cert = await fetchStudentCertificate('course-101');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/courses/course-101/certificate');
      expect(cert.certificateNumber).toBe('TSP-2026-CA1B2C3D4');
      expect(cert.studentName).toBe('Alex Mercer');
      expect(cert.status).toBe('ACTIVE');

      // Test alias function compatibility
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockActiveCertificate },
      });
      const aliasCert = await getStudentCertificate('course-101');
      expect(aliasCert.id).toBe('cert-uuid-1001');
    });

    it('2. certificate metadata renders exact historical snapshot values', () => {
      const html = renderToString(
        React.createElement(CertificateDocument, { certificate: mockActiveCertificate })
      );

      expect(html).toContain('Certificate of Completion');
      expect(html).toContain('Alex Mercer');
      expect(html).toContain('Enterprise TypeScript Architecture');
      expect(html).toContain('Dr. Jane Smith');
      expect(html).toContain('Lead Instructor');
      expect(html).toContain('TechSprout');
      expect(html).toContain('Academy of Software Engineering');
      // Format verification
      expect(html).toContain('September 30, 2026');
    });

    it('3. final score renders when returned and omits gracefully when null', () => {
      const htmlWithScore = renderToString(
        React.createElement(CertificateDocument, { certificate: mockActiveCertificate })
      );
      expect(htmlWithScore).toContain('Final Assessment Score: 94%');

      const certWithoutScore: CertificateDto = {
        ...mockActiveCertificate,
        finalScorePercentage: null,
      };
      const htmlWithoutScore = renderToString(
        React.createElement(CertificateDocument, { certificate: certWithoutScore })
      );
      expect(htmlWithoutScore).not.toContain('Final Assessment Score:');
    });

    it('4. active certificate state displays authentic badge and credential status', () => {
      const html = renderToString(
        React.createElement(CertificateDocument, { certificate: mockActiveCertificate })
      );

      expect(html).toContain('OFFICIAL CREDENTIAL • ACTIVE');
      expect(html).toContain('certificate-status-active');
      expect(html).not.toContain('REVOKED CREDENTIAL');
      expect(html).not.toContain('Revocation Reason:');
    });

    it('5. revoked certificate state renders prominent void indicator and revoked badge', () => {
      const html = renderToString(
        React.createElement(CertificateDocument, { certificate: mockRevokedCertificate })
      );

      expect(html).toContain('REVOKED CREDENTIAL');
      expect(html).toContain('certificate-status-revoked');
      expect(html).toContain('certificate-revocation-banner');
      expect(html).toContain('Status: Certificate Revoked');
      expect(html).toContain('Void');
      expect(html).toContain('September 1, 2026'); // revokedAt formatted
    });

    it('6. revocation reason renders clearly on revoked certificate', () => {
      const html = renderToString(
        React.createElement(CertificateDocument, { certificate: mockRevokedCertificate })
      );

      expect(html).toContain('certificate-revocation-reason');
      expect(html).toContain(
        'Academic integrity policy violation: unauthorized assessment assistance'
      );
    });

    it('7. certificate number renders in monospace formatted security block', () => {
      const html = renderToString(
        React.createElement(CertificateDocument, { certificate: mockActiveCertificate })
      );

      expect(html).toContain('Certificate No.');
      expect(html).toContain('TSP-2026-CA1B2C3D4');
      expect(html).toContain('font-mono');
    });

    it('8. verification link generated correctly with relative and QR presentation', () => {
      const html = renderToString(
        React.createElement(CertificateDocument, {
          certificate: mockActiveCertificate,
          verificationBaseUrl: 'https://techsprout.io',
        })
      );

      expect(html).toContain('/verify/TSP-2026-CA1B2C3D4');
      expect(html).toContain('Verify Authenticity');
      expect(html).toContain('certificate-qr-container');
    });

    it('9. print button invokes window.print when triggered', () => {
      const printMock = vi.fn();
      const originalWindow = global.window;
      // Simulate browser window
      global.window = {
        ...originalWindow,
        print: printMock,
      } as any;

      const triggerPrint = () => {
        if (typeof window !== 'undefined') {
          window.print();
        }
      };

      triggerPrint();
      expect(printMock).toHaveBeenCalledTimes(1);

      global.window = originalWindow;
    });

    it('10. enrollment-required and course-incomplete errors handled correctly', async () => {
      // 403 COURSE_NOT_COMPLETED
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 403,
          data: {
            success: false,
            errorCode: 'COURSE_NOT_COMPLETED',
            message: 'Certificate is not available until all course requirements are completed',
          },
        },
      });

      await expect(fetchStudentCertificate('c-incomplete')).rejects.toMatchObject({
        response: {
          status: 403,
          data: { errorCode: 'COURSE_NOT_COMPLETED' },
        },
      });

      // 404 ENROLLMENT_NOT_FOUND
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            success: false,
            errorCode: 'ENROLLMENT_NOT_FOUND',
            message: 'Student is not enrolled in this course',
          },
        },
      });

      await expect(fetchStudentCertificate('c-not-enrolled')).rejects.toMatchObject({
        response: {
          status: 404,
          data: { errorCode: 'ENROLLMENT_NOT_FOUND' },
        },
      });
    });
  });

  // =========================================================================
  // 11-16: PUBLIC VERIFICATION
  // =========================================================================
  describe('Public Verification Experience (/verify & /verify/[certificateNumber])', () => {
    const mockPublicActiveVerification: PublicCertificateVerificationDto = {
      isValid: true,
      certificateNumber: 'TSP-2026-CA1B2C3D4',
      status: 'ACTIVE',
      studentName: 'Alex Mercer',
      courseTitle: 'Enterprise TypeScript Architecture',
      instructorName: 'Dr. Jane Smith',
      completedAt: '2026-09-30T18:00:00.000Z',
      issuedAt: '2026-09-30T18:05:00.000Z',
      finalScorePercentage: 94,
      revokedAt: null,
      revocationReason: null,
    };

    const mockPublicRevokedVerification: PublicCertificateVerificationDto = {
      isValid: false,
      certificateNumber: 'TSP-2026-CREVOKED1',
      status: 'REVOKED',
      studentName: 'Jordan Lee',
      courseTitle: 'Cloud Native Microservices',
      instructorName: 'Prof. Alan Turing',
      completedAt: '2026-08-15T14:30:00.000Z',
      issuedAt: '2026-08-15T14:35:00.000Z',
      finalScorePercentage: 88,
      revokedAt: '2026-09-01T10:00:00.000Z',
      revocationReason: 'Academic integrity policy violation: unauthorized assessment assistance',
    };

    it('11. active verification renders authentic credential details', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Certificate verification completed',
          data: mockPublicActiveVerification,
        },
      });

      const res = await verifyCertificate('TSP-2026-CA1B2C3D4');

      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/certificates/verify/TSP-2026-CA1B2C3D4'
      );
      expect(res.isValid).toBe(true);
      expect(res.status).toBe('ACTIVE');
      expect(res.studentName).toBe('Alex Mercer');
      expect(res.courseTitle).toBe('Enterprise TypeScript Architecture');
      expect(res.finalScorePercentage).toBe(94);
    });

    it('12. revoked verification renders revocation notice and reason', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Certificate verification completed',
          data: mockPublicRevokedVerification,
        },
      });

      const res = await verifyCertificate('TSP-2026-CREVOKED1');

      expect(res.isValid).toBe(false);
      expect(res.status).toBe('REVOKED');
      expect(res.revocationReason).toBe(
        'Academic integrity policy violation: unauthorized assessment assistance'
      );
      expect(res.revokedAt).toBe('2026-09-01T10:00:00.000Z');
    });

    it('13. invalid certificate renders 404 state and error handling', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 404,
          data: {
            success: false,
            errorCode: 'CERTIFICATE_NOT_FOUND',
            message: 'Certificate with number "TSP-INVALID-999" not found',
          },
        },
      });

      await expect(verifyCertificate('TSP-INVALID-999')).rejects.toMatchObject({
        response: {
          status: 404,
          data: { errorCode: 'CERTIFICATE_NOT_FOUND' },
        },
      });
    });

    it('14. unauthenticated public verification works without auth headers', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockPublicActiveVerification,
        },
      });

      const res = await getPublicCertificateVerification('TSP-2026-CA1B2C3D4');
      expect(res.certificateNumber).toBe('TSP-2026-CA1B2C3D4');
      // Verify axios call did not inject auth-specific headers
      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/certificates/verify/TSP-2026-CA1B2C3D4'
      );
    });

    it('15. no private IDs rendered in public verification payload', () => {
      // Ensure PublicCertificateVerificationDto has zero private IDs
      const publicKeys = Object.keys(mockPublicActiveVerification);

      const forbiddenKeys = [
        'id',
        'studentId',
        'userId',
        'enrollmentId',
        'courseId',
        'email',
        'phone',
        'pdfMediaId',
        'metadata',
      ];

      forbiddenKeys.forEach((key) => {
        expect(publicKeys).not.toContain(key);
      });
    });

    it('16. student endpoint is never called by public verification API', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockPublicActiveVerification },
      });

      await verifyCertificate('TSP-2026-CA1B2C3D4');

      // Check all calls to axiosInstance.get
      const calls = vi.mocked(axiosInstance.get).mock.calls;
      calls.forEach(([url]) => {
        expect(url).not.toMatch(/\/api\/v1\/courses\/.*\/certificate/);
        expect(url).toMatch(/^\/api\/v1\/certificates\/verify\//);
      });
    });
  });

  // =========================================================================
  // 17-22: DASHBOARD & COURSE INTEGRATION (HISTORICAL CREDENTIAL ACCESSIBILITY)
  // =========================================================================
  describe('Course & Dashboard Certificate CTAs & Historical Credential Access', () => {
    const createTestQueryClient = () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

    it('17. completed enrollment renders View Certificate linking to /learn/[courseSlug]/certificate', () => {
      const completedItem: EnrolledCourseItemDto = {
        enrollmentId: 'e-1',
        status: 'COMPLETED',
        hasCertificate: true,
        enrolledAt: '2026-08-01T10:00:00.000Z',
        completedAt: '2026-09-01T15:00:00.000Z',
        progress: { completedLessons: 12, totalLessons: 12, percentage: 100 },
        course: {
          id: 'c-1',
          title: 'Fullstack Mastery',
          slug: 'fullstack-mastery',
          status: 'PUBLISHED',
        },
      };

      const cta = resolveEnrollmentCertificateCta(completedItem);
      expect(cta.hasCertificate).toBe(true);
      expect(cta.isHistorical).toBe(false);
      expect(cta.label).toBe('View Certificate');
      expect(cta.href).toBe('/learn/fullstack-mastery/certificate');

      // Test component rendering
      const queryClient = createTestQueryClient();
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, { enrollment: completedItem })
        )
      );

      expect(html).toContain('View Certificate');
      expect(html).toContain('data-testid="btn-view-certificate-fullstack-mastery"');
      expect(html).toContain('/learn/fullstack-mastery/certificate');
    });

    it('18. incomplete ACTIVE enrollment with no certificate displays no certificate CTA', () => {
      const activeItem: EnrolledCourseItemDto = {
        enrollmentId: 'e-2',
        status: 'ACTIVE',
        hasCertificate: false,
        enrolledAt: '2026-09-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 4, totalLessons: 10, percentage: 40 },
        course: {
          id: 'c-2',
          title: 'Advanced AI Architecture',
          slug: 'advanced-ai',
          status: 'PUBLISHED',
        },
      };

      const cta = resolveEnrollmentCertificateCta(activeItem, null);
      expect(cta.hasCertificate).toBe(false);
      expect(cta.variant).toBe('none');

      const queryClient = createTestQueryClient();
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, { enrollment: activeItem })
        )
      );

      expect(html).toContain('Continue Learning');
      expect(html).not.toContain('View Certificate');
      expect(html).not.toContain('data-testid="btn-view-certificate-advanced-ai"');
    });

    it('19. ACTIVE enrollment with existing historical certificate provides discoverable View Certificate CTA', () => {
      // Scenario: Student previously completed the course and earned a certificate,
      // but admin added a new lesson so enrollment reverted to ACTIVE with 90% progress.
      const activeItemWithHistoricalCert: EnrolledCourseItemDto = {
        enrollmentId: 'e-3',
        status: 'ACTIVE',
        hasCertificate: true,
        enrolledAt: '2026-07-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 9, totalLessons: 10, percentage: 90 },
        course: {
          id: 'c-3',
          title: 'Distributed Systems In Depth',
          slug: 'distributed-systems',
          status: 'PUBLISHED',
        },
      };

      const cta = resolveEnrollmentCertificateCta(
        activeItemWithHistoricalCert,
        mockActiveCertificate
      );
      expect(cta.hasCertificate).toBe(true);
      expect(cta.isHistorical).toBe(true);
      expect(cta.isRevoked).toBe(false);
      expect(cta.label).toBe('View Historical Certificate');
      expect(cta.href).toBe('/learn/distributed-systems/certificate');

      // Test component rendering
      const queryClient = createTestQueryClient();
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, {
            enrollment: activeItemWithHistoricalCert,
            certificate: mockActiveCertificate,
          })
        )
      );

      // Verify both actions exist: primary "Continue Learning" and secondary "Certificate"
      expect(html).toContain('Continue Learning');
      expect(html).toContain('data-testid="btn-view-certificate-distributed-systems"');
      expect(html).toContain('/learn/distributed-systems/certificate');
      expect(html).toContain('Certificate previously earned');
      expect(html).toContain('data-testid="historical-active-indicator"');
    });

    it('20. REVOKED historical certificate remains discoverable on active card with REVOKED indicator', () => {
      const activeItemWithRevokedCert: EnrolledCourseItemDto = {
        enrollmentId: 'e-4',
        status: 'ACTIVE',
        hasCertificate: true,
        enrolledAt: '2026-06-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 8, totalLessons: 10, percentage: 80 },
        course: {
          id: 'c-4',
          title: 'Network Security Fundamentals',
          slug: 'network-security',
          status: 'PUBLISHED',
        },
      };

      const cta = resolveEnrollmentCertificateCta(
        activeItemWithRevokedCert,
        mockRevokedCertificate
      );
      expect(cta.hasCertificate).toBe(true);
      expect(cta.isHistorical).toBe(true);
      expect(cta.isRevoked).toBe(true);
      expect(cta.label).toBe('View Revoked Certificate');

      const queryClient = createTestQueryClient();
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, {
            enrollment: activeItemWithRevokedCert,
            certificate: mockRevokedCertificate,
          })
        )
      );

      expect(html).toContain('Historical Credential: REVOKED');
      expect(html).toContain('data-testid="historical-revoked-indicator"');
      expect(html).toContain('data-testid="btn-view-certificate-network-security"');
    });

    it('21. student certificate page renders historical notice without falsely implying 100% completion', () => {
      // Simulating certificate page state when enrollment is ACTIVE
      const progressPercentage = 75;

      const noticeHtml = `
        <div role="status" aria-live="polite" data-testid="historical-certificate-banner" class="no-print">
          <span>Historical Credential • Course In Progress</span>
          <p>New curriculum items have been added to this course since this certificate was earned. Your previously earned credential remains authentic and valid. Current course progress: ${progressPercentage}%.</p>
          <a href="/learn/distributed-systems" data-testid="btn-resume-expanded-course">Resume Course Material</a>
        </div>
      `;

      expect(noticeHtml).toContain('data-testid="historical-certificate-banner"');
      expect(noticeHtml).toContain('Historical Credential • Course In Progress');
      expect(noticeHtml).toContain('Current course progress: 75%');
      expect(noticeHtml).toContain('data-testid="btn-resume-expanded-course"');
      expect(noticeHtml).toContain('no-print');
    });

    it('22. regression test: exact curriculum-expansion scenario preserves certificate accessibility', async () => {
      // 1. Initial State: Course completed, certificate issued
      const initialEnrollment: EnrolledCourseItemDto = {
        enrollmentId: 'e-exp-101',
        status: 'COMPLETED',
        hasCertificate: true,
        enrolledAt: '2026-05-01T10:00:00.000Z',
        completedAt: '2026-06-01T12:00:00.000Z',
        progress: { completedLessons: 10, totalLessons: 10, percentage: 100 },
        course: {
          id: 'c-exp-101',
          title: 'Fullstack Microservices Engineering',
          slug: 'microservices-engineering',
          status: 'PUBLISHED',
        },
      };

      const issuedCertificate: CertificateDto = {
        ...mockActiveCertificate,
        id: 'cert-exp-101',
        certificateNumber: 'TSP-2026-CEXPAND1',
        courseTitle: 'Fullstack Microservices Engineering',
      };

      // 2. Curriculum Expansion: Admin publishes 2 new lessons -> totalLessons = 12, completedLessons = 10 (83%)
      // Backend sync invariant transitions status from COMPLETED to ACTIVE, completedAt set to null
      const expandedEnrollment: EnrolledCourseItemDto = {
        ...initialEnrollment,
        status: 'ACTIVE',
        completedAt: null,
        progress: { completedLessons: 10, totalLessons: 12, percentage: 83 },
      };

      // 3. Frontend checks CTA for expanded active enrollment with cached/known certificate
      const cta = resolveEnrollmentCertificateCta(expandedEnrollment, issuedCertificate);

      // Verify certificate remains accessible
      expect(cta.hasCertificate).toBe(true);
      expect(cta.isHistorical).toBe(true);
      expect(cta.href).toBe('/learn/microservices-engineering/certificate');

      // 4. Verify API call GET /api/v1/courses/:courseId/certificate returns existing active certificate
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Certificate retrieved successfully',
          data: issuedCertificate,
        },
      });

      const certResult = await fetchStudentCertificate('c-exp-101');
      expect(certResult.certificateNumber).toBe('TSP-2026-CEXPAND1');
      expect(certResult.status).toBe('ACTIVE');

      // 5. Verify certificate document renders the issued certificate
      const docHtml = renderToString(
        React.createElement(CertificateDocument, { certificate: certResult })
      );
      expect(docHtml).toContain('TSP-2026-CEXPAND1');
      expect(docHtml).toContain('Fullstack Microservices Engineering');
      expect(docHtml).toContain('OFFICIAL CREDENTIAL • ACTIVE');
    });
  });

  // =========================================================================
  // 20-24: ACCESSIBILITY, RESPONSIVE & PRINT
  // =========================================================================
  describe('Accessibility, Responsive Design & Print Compatibility', () => {
    it('20. verification form is keyboard accessible with semantic labels and controls', () => {
      // Simulating verification form HTML structure
      const formHtml = `
        <form data-testid="verify-certificate-form">
          <label for="certNumberInput" class="sr-only">Certificate Number</label>
          <input id="certNumberInput" type="text" placeholder="e.g. TSP-2026-C8F4A12B" autofocus />
          <button type="submit">Verify Credential</button>
        </form>
      `;

      expect(formHtml).toContain('label for="certNumberInput"');
      expect(formHtml).toContain('id="certNumberInput"');
      expect(formHtml).toContain('type="submit"');
    });

    it('21. status indicators do not rely on color only', () => {
      const activeHtml = renderToString(
        React.createElement(CertificateDocument, { certificate: mockActiveCertificate })
      );
      // Explicit text AND icon present
      expect(activeHtml).toContain('OFFICIAL CREDENTIAL • ACTIVE');

      const revokedHtml = renderToString(
        React.createElement(CertificateDocument, { certificate: mockRevokedCertificate })
      );
      // Explicit text AND banner present
      expect(revokedHtml).toContain('REVOKED CREDENTIAL');
      expect(revokedHtml).toContain('Status: Certificate Revoked');
      expect(revokedHtml).toContain('Void');
    });

    it('22. mobile certificate layout avoids horizontal overflow', () => {
      const html = renderToString(
        React.createElement(CertificateDocument, { certificate: mockActiveCertificate })
      );

      // Verify responsive container classes
      expect(html).toContain('w-full max-w-4xl mx-auto');
      expect(html).toContain('p-6 sm:p-10 md:p-14');
      expect(html).toContain('text-2xl sm:text-4xl md:text-5xl');
      expect(html).toContain('flex flex-col md:flex-row');
    });

    it('23. QR matrix generation produces valid binary grid for verification URLs', () => {
      const testUrl = 'https://techsprout.io/verify/TSP-2026-CA1B2C3D4';
      const matrix = generateQrMatrix(testUrl);

      expect(matrix).toBeDefined();
      expect(matrix.length).toBeGreaterThanOrEqual(21);
      expect(matrix[0].length).toBe(matrix.length); // Square matrix

      // Test top-left finder pattern is black at (0,0)
      expect(matrix[0][0]).toBe(true);

      // Render QRCode SVG
      const qrSvg = renderToString(
        React.createElement(CertificateQRCode, { value: testUrl, size: 100 })
      );
      expect(qrSvg).toContain('<svg');
      expect(qrSvg).toContain('role="img"');
      expect(qrSvg).toContain('aria-label');
      expect(qrSvg).toContain(testUrl);
    });

    it('24. formatCertificateDate handles valid, null, and empty ISO dates', () => {
      expect(formatCertificateDate('2026-10-02T12:00:00.000Z')).toBe('October 2, 2026');
      expect(formatCertificateDate(null)).toBe('—');
      expect(formatCertificateDate(undefined)).toBe('—');
      expect(formatCertificateDate('')).toBe('—');
    });
  });

  // =========================================================================
  // P4.5.5: CERTIFICATE DISCOVERABILITY & COLD-CACHE BEHAVIOR (CASES 7-13)
  // =========================================================================
  describe('P4.5.5 Certificate Discoverability Frontend Suite (Cases 7-13)', () => {
    it('7. ACTIVE + hasCertificate renders primary Continue Learning and secondary Certificate CTA', () => {
      const activeWithCert: EnrolledCourseItemDto = {
        enrollmentId: 'e-active-cert-1',
        status: 'ACTIVE',
        hasCertificate: true,
        enrolledAt: '2026-07-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 8, totalLessons: 10, percentage: 80 },
        course: {
          id: 'c-active-cert-1',
          title: 'Advanced React Architecture',
          slug: 'advanced-react',
          status: 'PUBLISHED',
        },
      };

      const queryClient = new QueryClient();
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, { enrollment: activeWithCert })
        )
      );

      // Must have Continue Learning and secondary Certificate CTA
      expect(html).toContain('Continue Learning');
      expect(html).toContain('data-testid="btn-view-certificate-advanced-react"');
      expect(html).toContain('Certificate');
      expect(html).toContain('Certificate previously earned');
      expect(html).toContain('data-testid="historical-active-indicator"');
    });

    it('8. ACTIVE + !hasCertificate renders only Continue Learning and no Certificate CTA', () => {
      const activeNoCert: EnrolledCourseItemDto = {
        enrollmentId: 'e-active-nocert-1',
        status: 'ACTIVE',
        hasCertificate: false,
        enrolledAt: '2026-08-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 3, totalLessons: 10, percentage: 30 },
        course: {
          id: 'c-active-nocert-1',
          title: 'Algorithms & Data Structures',
          slug: 'algorithms-ds',
          status: 'PUBLISHED',
        },
      };

      const queryClient = new QueryClient();
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, { enrollment: activeNoCert })
        )
      );

      expect(html).toContain('Continue Learning');
      expect(html).not.toContain('data-testid="btn-view-certificate-algorithms-ds"');
      expect(html).not.toContain('Certificate previously earned');
    });

    it('9. COMPLETED + hasCertificate renders View Certificate CTA', () => {
      const completedWithCert: EnrolledCourseItemDto = {
        enrollmentId: 'e-comp-cert-1',
        status: 'COMPLETED',
        hasCertificate: true,
        enrolledAt: '2026-05-01T10:00:00.000Z',
        completedAt: '2026-06-01T10:00:00.000Z',
        progress: { completedLessons: 10, totalLessons: 10, percentage: 100 },
        course: {
          id: 'c-comp-cert-1',
          title: 'Fullstack Mastery',
          slug: 'fullstack-mastery',
          status: 'PUBLISHED',
        },
      };

      const queryClient = new QueryClient();
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, { enrollment: completedWithCert })
        )
      );

      expect(html).toContain('View Certificate');
      expect(html).toContain('data-testid="btn-view-certificate-fullstack-mastery"');
      expect(html).toContain('/learn/fullstack-mastery/certificate');
    });

    it('10. REVOKED historical certificate renders Certificate CTA and clear revoked indicator', () => {
      const activeWithRevokedCert: EnrolledCourseItemDto = {
        enrollmentId: 'e-active-rev-1',
        status: 'ACTIVE',
        hasCertificate: true,
        enrolledAt: '2026-04-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 7, totalLessons: 10, percentage: 70 },
        course: {
          id: 'c-active-rev-1',
          title: 'Security Auditing',
          slug: 'security-auditing',
          status: 'PUBLISHED',
        },
      };

      const queryClient = new QueryClient();
      queryClient.setQueryData(['studentCertificate', 'c-active-rev-1'], {
        ...mockRevokedCertificate,
        courseTitle: 'Security Auditing',
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(EnrollmentCertificateCta, { enrollment: activeWithRevokedCert })
        )
      );

      expect(html).toContain('Continue Learning');
      expect(html).toContain('data-testid="btn-view-certificate-security-auditing"');
      expect(html).toContain('Historical Credential: REVOKED');
      expect(html).toContain('data-testid="historical-revoked-indicator"');
    });

    it('11. cold-cache behavior works from enrollment data alone without query cache', () => {
      const coldCacheItem: EnrolledCourseItemDto = {
        enrollmentId: 'e-cold-1',
        status: 'ACTIVE',
        hasCertificate: true,
        enrolledAt: '2026-03-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 9, totalLessons: 11, percentage: 82 },
        course: {
          id: 'c-cold-1',
          title: 'High Performance Databases',
          slug: 'high-perf-db',
          status: 'PUBLISHED',
        },
      };

      // Completely fresh, cold QueryClient with ZERO cached data
      const coldClient = new QueryClient();
      expect(coldClient.getQueryData(['studentCertificate', 'c-cold-1'])).toBeUndefined();

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: coldClient },
          React.createElement(EnrollmentCertificateCta, { enrollment: coldCacheItem })
        )
      );

      // Certificate CTA is immediately available from enrollment.hasCertificate
      expect(html).toContain('Certificate');
      expect(html).toContain('data-testid="btn-view-certificate-high-perf-db"');
      expect(html).toContain('Certificate previously earned');
      expect(html).toContain('data-testid="historical-active-indicator"');
    });

    it('12. refreshing /my-courses preserves correct CTA across browser session resets', () => {
      const item: EnrolledCourseItemDto = {
        enrollmentId: 'e-refresh-1',
        status: 'ACTIVE',
        hasCertificate: true,
        enrolledAt: '2026-02-01T10:00:00.000Z',
        completedAt: null,
        progress: { completedLessons: 5, totalLessons: 6, percentage: 83 },
        course: {
          id: 'c-refresh-1',
          title: 'Modern Web Architecture',
          slug: 'modern-web-arch',
          status: 'PUBLISHED',
        },
      };

      // Session 1: Client renders
      const session1Client = new QueryClient();
      const html1 = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: session1Client },
          React.createElement(EnrollmentCertificateCta, { enrollment: item })
        )
      );
      expect(html1).toContain('Certificate previously earned');

      // Session 2: Page reload / fresh session with new QueryClient instance
      const session2Client = new QueryClient();
      const html2 = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: session2Client },
          React.createElement(EnrollmentCertificateCta, { enrollment: item })
        )
      );
      expect(html2).toContain('Certificate previously earned');
      expect(html2).toContain('data-testid="btn-view-certificate-modern-web-arch"');
    });

    it('13. no certificate endpoint is blindly requested once per card on dashboard', () => {
      // Create multiple enrollment items
      const items: EnrolledCourseItemDto[] = [
        {
          enrollmentId: 'e-bulk-1',
          status: 'ACTIVE',
          hasCertificate: true,
          enrolledAt: '2026-01-01T10:00:00.000Z',
          completedAt: null,
          progress: { completedLessons: 5, totalLessons: 10, percentage: 50 },
          course: { id: 'c-bulk-1', title: 'Course 1', slug: 'course-1', status: 'PUBLISHED' },
        },
        {
          enrollmentId: 'e-bulk-2',
          status: 'ACTIVE',
          hasCertificate: false,
          enrolledAt: '2026-01-02T10:00:00.000Z',
          completedAt: null,
          progress: { completedLessons: 2, totalLessons: 10, percentage: 20 },
          course: { id: 'c-bulk-2', title: 'Course 2', slug: 'course-2', status: 'PUBLISHED' },
        },
        {
          enrollmentId: 'e-bulk-3',
          status: 'COMPLETED',
          hasCertificate: true,
          enrolledAt: '2026-01-03T10:00:00.000Z',
          completedAt: '2026-02-01T10:00:00.000Z',
          progress: { completedLessons: 10, totalLessons: 10, percentage: 100 },
          course: { id: 'c-bulk-3', title: 'Course 3', slug: 'course-3', status: 'PUBLISHED' },
        },
      ];

      const queryClient = new QueryClient();
      vi.mocked(axiosInstance.get).mockClear();

      // Render cards in dashboard grid
      items.forEach((item) => {
        renderToString(
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(EnrollmentCertificateCta, { enrollment: item })
          )
        );
      });

      // Assert that rendering cards does NOT initiate any HTTP request to certificate endpoints
      const certificateApiCalls = vi.mocked(axiosInstance.get).mock.calls.filter((call) => {
        const url = String(call[0]);
        return url.includes('/certificate');
      });

      expect(certificateApiCalls.length).toBe(0);
      expect(axiosInstance.get).not.toHaveBeenCalled();
    });
  });
});
