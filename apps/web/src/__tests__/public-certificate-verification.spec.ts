import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PublicCertificateVerificationResultPage from '@/app/verify/[certificateNumber]/page';
import { metadata as verifyLayoutMetadata } from '@/app/verify/layout';
import { LocaleProvider } from '@/i18n/client';
import type { PublicCertificateVerificationDto } from '@techsprout/contracts';

// Mock params
let mockParams: { certificateNumber?: string } = {
  certificateNumber: 'TSP-2026-CA1B2C3D4',
};

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

// Mock react-query
let mockQueryResult: {
  data: PublicCertificateVerificationDto | null;
  isLoading: boolean;
  isError: boolean;
  error: any;
  refetch: () => void;
} = {
  data: null,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => mockQueryResult,
  };
});

describe('Phase 11.3 / WP-P11-03 — Public Certificate Verification Page Suite (Frontend)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { certificateNumber: 'TSP-2026-CA1B2C3D4' };
  });

  const mockValidCertificate: PublicCertificateVerificationDto = {
    isValid: true,
    verificationStatus: 'VALID',
    certificateNumber: 'TSP-2026-CA1B2C3D4',
    status: 'ACTIVE',
    studentName: 'Ayesha Siddiqua',
    courseTitle: 'Fullstack Next.js and NestJS Mastery',
    instructorName: 'Dr. Tariqul Islam',
    completedAt: '2026-10-10T12:00:00.000Z',
    issuedAt: '2026-10-10T12:05:00.000Z',
    finalScorePercentage: 96,
    verificationUrl: 'https://techsprout.edu/verify/TSP-2026-CA1B2C3D4',
  };

  const mockRevokedCertificate: PublicCertificateVerificationDto = {
    isValid: false,
    verificationStatus: 'REVOKED',
    certificateNumber: 'TSP-2026-CREVOKED1',
    status: 'REVOKED',
    studentName: 'Kamran Hossain',
    courseTitle: 'Enterprise TypeScript Architecture',
    instructorName: 'Dr. Tariqul Islam',
    completedAt: '2026-09-15T10:00:00.000Z',
    issuedAt: '2026-09-15T10:05:00.000Z',
    finalScorePercentage: 82,
    revokedAt: '2026-10-01T14:30:00.000Z',
    revocationReason: 'Academic policy integrity violation',
    verificationUrl: 'https://techsprout.edu/verify/TSP-2026-CREVOKED1',
  };

  // =========================================================================
  // TEST 1: VALID CERTIFICATE RENDERING
  // =========================================================================
  it('Test 1: Valid certificate renders valid badge, student name, course title, instructor, and issue date', () => {
    mockQueryResult = {
      data: mockValidCertificate,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );

    expect(html).toContain('data-testid="public-verification-card"');
    expect(html).toContain('data-testid="public-verification-status-badge"');
    expect(html).toContain('AUTHENTIC &amp; VERIFIED');
    expect(html).toContain('Official TechSprout Credential');
    expect(html).toContain('TSP-2026-CA1B2C3D4');
    expect(html).toContain('Ayesha Siddiqua');
    expect(html).toContain('Fullstack Next.js and NestJS Mastery');
    expect(html).toContain('Dr. Tariqul Islam');
    expect(html).toContain('data-testid="public-final-score"');
    expect(html).toContain('96');
    expect(html).toContain('data-testid="public-verification-explanation"');
  });

  // =========================================================================
  // TEST 2: REVOKED CERTIFICATE RENDERING
  // =========================================================================
  it('Test 2: Revoked certificate renders revoked badge, revocation notice, reason, and date', () => {
    mockParams = { certificateNumber: 'TSP-2026-CREVOKED1' };
    mockQueryResult = {
      data: mockRevokedCertificate,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );

    expect(html).toContain('data-testid="public-verification-card"');
    expect(html).toContain('REVOKED CREDENTIAL');
    expect(html).toContain('Credential Has Been Revoked');
    expect(html).toContain('TSP-2026-CREVOKED1');
    expect(html).toContain('data-testid="public-revocation-details"');
    expect(html).toContain('data-testid="public-revocation-reason"');
    expect(html).toContain('Academic policy integrity violation');
    expect(html).toContain('Kamran Hossain');
  });

  // =========================================================================
  // TEST 3: UNKNOWN CERTIFICATE (404)
  // =========================================================================
  it('Test 3: Unknown certificate (404) renders verification-not-found state with search another button', () => {
    mockParams = { certificateNumber: 'TSP-2026-CNOTFOUND' };
    mockQueryResult = {
      data: null,
      isLoading: false,
      isError: true,
      error: { response: { status: 404 } },
      refetch: vi.fn(),
    };

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );

    expect(html).toContain('data-testid="verification-not-found"');
    expect(html).toContain('Certificate Not Found');
    expect(html).toContain('TSP-2026-CNOTFOUND');
    expect(html).toContain('href="/verify"');
    expect(html).toContain('Verify Another Certificate');
  });

  // =========================================================================
  // TEST 4: NETWORK OR TEMPORARY ERROR
  // =========================================================================
  it('Test 4: Network or temporary error renders temporary failure state with retry button', () => {
    mockParams = { certificateNumber: 'TSP-2026-CA1B2C3D4' };
    mockQueryResult = {
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Network connection timeout'),
      refetch: vi.fn(),
    };

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );

    expect(html).toContain('data-testid="verification-not-found"');
    expect(html).toContain('Temporary Verification Failure');
    expect(html).toContain('Try Again');
  });

  // =========================================================================
  // TEST 5: BILINGUAL LOCALIZATION (ENGLISH & BANGLA)
  // =========================================================================
  it('Test 5: English and Bangla translations render correctly when switched', () => {
    mockQueryResult = {
      data: mockValidCertificate,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    // English render
    const htmlEn = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );
    expect(htmlEn).toContain('AUTHENTIC &amp; VERIFIED');
    expect(htmlEn).toContain('Official TechSprout Credential');
    expect(htmlEn).toContain('Verified Achievement Details');
    expect(htmlEn).toContain('Student Name');
    expect(htmlEn).toContain('Course');

    // Bangla render
    const htmlBn = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'bn' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );
    expect(htmlBn).toContain('প্রমাণিত ও যাচাইকৃত');
    expect(htmlBn).toContain('অফিসিয়াল টেকস্প্রাউট সনদ');
    expect(htmlBn).toContain('যাচাইকৃত অর্জনের বিবরণ');
    expect(htmlBn).toContain('শিক্ষার্থীর নাম');
    expect(htmlBn).toContain('কোর্সের শিরোনাম');
  });

  // =========================================================================
  // TEST 6: CANONICAL VERIFICATION URL & COPY LINK
  // =========================================================================
  it('Test 6: Canonical verification URL displays and copy link button is rendered', () => {
    mockQueryResult = {
      data: mockValidCertificate,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );

    expect(html).toContain('data-testid="canonical-verification-url"');
    expect(html).toContain('https://techsprout.edu/verify/TSP-2026-CA1B2C3D4');
    expect(html).toContain('data-testid="btn-copy-public-verification-url"');
    expect(html).toContain('Copy Verification Link');
  });

  // =========================================================================
  // TEST 7: ROBOTS LAYOUT METADATA VERIFICATION
  // =========================================================================
  it('Test 7: Robots layout metadata sets index: false, follow: false', () => {
    expect(verifyLayoutMetadata).toBeDefined();
    expect(verifyLayoutMetadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  // =========================================================================
  // TEST 8: ZERO PII DISCLOSED IN DOM
  // =========================================================================
  it('Test 8: No student email, phone, or internal DB ID is ever rendered in HTML DOM', () => {
    mockQueryResult = {
      data: mockValidCertificate,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );

    // Private fields that must never exist
    expect(html).not.toContain('@techsprout.edu');
    expect(html).not.toContain('01711');
    expect(html).not.toContain('01811');
    expect(html).not.toContain('studentId');
    expect(html).not.toContain('userId');
    expect(html).not.toContain('enrollmentId');
    expect(html).not.toContain('password');
    expect(html).not.toContain('db_id');
  });

  // =========================================================================
  // TEST 9: SCORE DISCLOSURE PRIVACY INVARIANT (WP-P11-04)
  // =========================================================================
  it('Test 9: Public verification omits score section when finalScorePercentage is null or undefined (unapproved score)', () => {
    const mockUnapprovedScoreCertificate: PublicCertificateVerificationDto = {
      ...mockValidCertificate,
      finalScorePercentage: null,
    };

    mockQueryResult = {
      data: mockUnapprovedScoreCertificate,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        { initialLocale: 'en' },
        React.createElement(PublicCertificateVerificationResultPage)
      )
    );

    // Assert that the final score container and any percentage are completely omitted
    expect(html).not.toContain('data-testid="public-final-score"');
    expect(html).not.toContain('Final Assessment Score');
    expect(html).not.toContain('96%');
    expect(html).toContain('Ayesha Siddiqua');
    expect(html).toContain('TSP-2026-CA1B2C3D4');
  });
});
