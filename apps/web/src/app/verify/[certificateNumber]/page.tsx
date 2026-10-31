'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { verifyCertificate } from '@/lib/api/certificates';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/client';
import {
  CheckCircle2,
  AlertTriangle,
  Award,
  Search,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Calendar,
  User,
  BookOpen,
  GraduationCap,
  RotateCcw,
} from 'lucide-react';

export default function PublicCertificateVerificationResultPage() {
  const { t, formatDate, formatNumber } = useTranslation();
  const params = useParams();
  const rawCertNumber = params?.certificateNumber as string;
  const certificateNumber = decodeURIComponent(rawCertNumber || '').trim();

  // Call GET /api/v1/certificates/verify/:certificateNumber
  const {
    data: verification,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['publicCertificate', certificateNumber],
    queryFn: () => verifyCertificate(certificateNumber),
    enabled: !!certificateNumber,
    retry: false,
    staleTime: 60 * 1000,
  });

  // 1. Loading State
  if (isLoading) {
    return (
      <div className='min-h-[85vh] flex flex-col items-center justify-center px-4 bg-[#F8FAFC] py-16 space-y-4'>
        <div className='w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin' />
        <p className='text-xs sm:text-sm font-semibold text-gray-600 animate-pulse'>
          {t.certificate.authenticating}
        </p>
      </div>
    );
  }

  // 2. 404 Not Found or Verification Error
  if (isError || !verification) {
    const status = (error as any)?.response?.status;
    const isNotFound = status === 404;

    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC] py-16'>
        <div
          className='max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 border border-gray-200/80 shadow-md text-center space-y-6'
          data-testid='verification-not-found'
        >
          <div className='w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto'>
            <AlertTriangle className='w-8 h-8' />
          </div>

          <div className='space-y-2'>
            <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900'>
              <AlertTriangle className='w-3.5 h-3.5' />
              {t.certificate.verificationFailed}
            </span>
            <h1 className='text-2xl font-black text-gray-900 tracking-tight'>
              {isNotFound ? t.certificate.certificateNotFound : t.certificate.verificationUnavailable}
            </h1>
            <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
              {isNotFound
                ? t.certificate.notFoundDesc.replace('{id}', certificateNumber)
                : t.certificate.networkErrorDesc}
            </p>
          </div>

          {certificateNumber && (
            <div className='p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs font-mono text-gray-700 select-all'>
              {certificateNumber}
            </div>
          )}

          <div className='pt-2 flex flex-col sm:flex-row justify-center gap-3'>
            <Link href='/verify'>
              <Button className='w-full sm:w-auto rounded-xl text-xs font-bold px-6 py-2.5 bg-primary text-white hover:bg-primary/90'>
                <Search className='w-3.5 h-3.5 mr-1.5' />
                {t.certificate.verifyAnother}
              </Button>
            </Link>
            {!isNotFound && (
              <Button
                variant='outline'
                onClick={() => refetch()}
                className='w-full sm:w-auto rounded-xl text-xs font-semibold px-4 py-2.5'
              >
                <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
                {t.certificate.tryAgain}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isRevoked = verification.status === 'REVOKED';

  return (
    <div className='min-h-screen bg-[#F8FAFC] pb-24'>
      {/* Top Header */}
      <div className='bg-white border-b border-gray-200/80 py-6 sm:py-8'>
        <div className='container mx-auto px-4 max-w-4xl'>
          <div className='flex items-center justify-between gap-4'>
            <Link
              href='/verify'
              className='inline-flex items-center text-xs font-semibold text-gray-500 hover:text-gray-900 transition'
            >
              <ArrowLeft className='w-3.5 h-3.5 mr-1' />
              <span>{t.certificate.backToVerificationSearch}</span>
            </Link>

            <span className='text-xs text-gray-400 font-mono'>
              {t.certificate.registryId.replace('{id}', verification.certificateNumber)}
            </span>
          </div>
        </div>
      </div>

      <main className='container mx-auto px-4 max-w-4xl pt-10 sm:pt-12 space-y-8'>
        {/* Verification Status Card */}
        <div
          className={`rounded-3xl border-2 p-6 sm:p-8 shadow-sm transition-all ${
            isRevoked
              ? 'bg-rose-50/60 border-rose-200'
              : 'bg-emerald-50/50 border-emerald-200'
          }`}
          data-testid='public-verification-card'
        >
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6 border-gray-200/60'>
            <div className='flex items-center gap-3.5'>
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                  isRevoked
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {isRevoked ? (
                  <ShieldAlert className='w-8 h-8' />
                ) : (
                  <ShieldCheck className='w-8 h-8' />
                )}
              </div>

              <div>
                <div className='flex items-center gap-2'>
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                      isRevoked
                        ? 'bg-rose-200 text-rose-900'
                        : 'bg-emerald-200 text-emerald-900'
                    }`}
                    data-testid='public-verification-status-badge'
                  >
                    {isRevoked ? (
                      <>
                        <AlertTriangle className='w-3.5 h-3.5 text-rose-700' />
                        <span>{t.certificate.revokedCredential}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className='w-3.5 h-3.5 text-emerald-700' />
                        <span>{t.certificate.authenticAndVerified}</span>
                      </>
                    )}
                  </span>
                </div>
                <h1 className='text-xl sm:text-2xl font-black text-gray-900 tracking-tight mt-1'>
                  {isRevoked
                    ? t.certificate.credentialRevokedHeading
                    : t.certificate.officialCredentialHeading}
                </h1>
              </div>
            </div>

            <div className='sm:text-right'>
              <span className='block text-[11px] font-bold text-gray-400 uppercase tracking-wider'>
                {t.certificate.certificateNo}
              </span>
              <span
                className='block font-mono text-sm sm:text-base font-extrabold text-gray-900 select-all'
                data-testid='public-verification-cert-number'
              >
                {verification.certificateNumber}
              </span>
            </div>
          </div>

          {/* Revocation Details Warning (if REVOKED) */}
          {isRevoked && (
            <div
              className='mt-6 p-4 rounded-2xl bg-rose-100/70 border border-rose-200 space-y-2'
              data-testid='public-revocation-details'
            >
              <div className='text-xs font-bold text-rose-900 flex items-center gap-1.5'>
                <AlertTriangle className='w-4 h-4 text-rose-600' />
                <span>{t.certificate.revocationNotice}</span>
              </div>
              <p className='text-xs sm:text-sm text-rose-800 leading-relaxed'>
                {t.certificate.revokedByAdmin.replace(
                  '{date}',
                  verification.revokedAt ? formatDate(verification.revokedAt) : '—'
                )}
              </p>
              {verification.revocationReason && (
                <p
                  className='text-xs text-rose-950 font-medium'
                  data-testid='public-revocation-reason'
                >
                  <strong className='font-semibold'>{t.certificate.revocationReason} </strong>
                  {verification.revocationReason}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Credential Snapshot Data Grid */}
        <div className='bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6'>
          <h2 className='text-base font-bold text-gray-900 border-b border-gray-100 pb-3'>
            {t.certificate.verifiedAchievementDetails}
          </h2>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
            {/* Student Name */}
            <div className='space-y-1'>
              <span className='text-xs font-medium text-gray-400 flex items-center gap-1.5'>
                <User className='w-3.5 h-3.5' />
                {t.certificate.studentNameLabel}
              </span>
              <p
                className='text-lg sm:text-xl font-bold text-gray-900'
                data-testid='public-student-name'
              >
                {verification.studentName}
              </p>
            </div>

            {/* Course Title */}
            <div className='space-y-1'>
              <span className='text-xs font-medium text-gray-400 flex items-center gap-1.5'>
                <BookOpen className='w-3.5 h-3.5' />
                {t.certificate.courseTitleLabel}
              </span>
              <p
                className='text-lg sm:text-xl font-bold text-gray-900'
                data-testid='public-course-title'
              >
                {verification.courseTitle}
              </p>
            </div>

            {/* Instructor Name (if supplied) */}
            {verification.instructorName && (
              <div className='space-y-1'>
                <span className='text-xs font-medium text-gray-400 flex items-center gap-1.5'>
                  <GraduationCap className='w-3.5 h-3.5' />
                  {t.certificate.leadInstructor}
                </span>
                <p
                  className='text-sm sm:text-base font-semibold text-gray-800'
                  data-testid='public-instructor-name'
                >
                  {verification.instructorName}
                </p>
              </div>
            )}

            {/* Final Assessment Score (if supplied) */}
            {verification.finalScorePercentage !== null &&
              verification.finalScorePercentage !== undefined && (
                <div className='space-y-1'>
                  <span className='text-xs font-medium text-gray-400 flex items-center gap-1.5'>
                    <Award className='w-3.5 h-3.5 text-amber-500' />
                    {t.certificate.finalScore.split(':')[0]}
                  </span>
                  <p
                    className='text-sm sm:text-base font-bold text-amber-900'
                    data-testid='public-final-score'
                  >
                    {formatNumber(verification.finalScorePercentage)}%
                  </p>
                </div>
              )}

            {/* Completion Date */}
            {verification.completedAt && (
              <div className='space-y-1'>
                <span className='text-xs font-medium text-gray-400 flex items-center gap-1.5'>
                  <Calendar className='w-3.5 h-3.5' />
                  {t.certificate.completionDateLabel}
                </span>
                <p
                  className='text-sm sm:text-base font-semibold text-gray-800'
                  data-testid='public-completed-date'
                >
                  {formatDate(verification.completedAt)}
                </p>
              </div>
            )}

            {/* Issuance Date */}
            {verification.issuedAt && (
              <div className='space-y-1'>
                <span className='text-xs font-medium text-gray-400 flex items-center gap-1.5'>
                  <Calendar className='w-3.5 h-3.5' />
                  {t.certificate.issuanceDateLabel}
                </span>
                <p
                  className='text-sm sm:text-base font-semibold text-gray-800'
                  data-testid='public-issued-date'
                >
                  {formatDate(verification.issuedAt)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Verification Action / Footer */}
        <div className='flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-white rounded-3xl border border-gray-200/80 shadow-xs'>
          <div className='text-center sm:text-left'>
            <h3 className='text-sm font-bold text-gray-900'>{t.certificate.wantToVerifyAnother}</h3>
            <p className='text-xs text-gray-500'>
              {t.certificate.searchRegistrySubtitle}
            </p>
          </div>

          <Link href='/verify'>
            <Button
              variant='outline'
              className='rounded-xl text-xs font-semibold px-5 py-2.5'
              data-testid='btn-verify-another'
            >
              <Search className='w-3.5 h-3.5 mr-1.5' />
              <span>{t.certificate.verifyAnotherCode}</span>
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
