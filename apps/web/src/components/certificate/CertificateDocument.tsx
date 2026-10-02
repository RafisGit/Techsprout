'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertTriangle,
  Award,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import type { CertificateDto } from '@techsprout/contracts';
import { CertificateQRCode } from './CertificateQRCode';

interface CertificateDocumentProps {
  certificate: CertificateDto;
  verificationBaseUrl?: string;
  showActions?: boolean;
}

export function formatCertificateDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function CertificateDocument({
  certificate,
  verificationBaseUrl,
}: CertificateDocumentProps) {
  const isRevoked = certificate.status === 'REVOKED';

  // Construct absolute or relative public verification URL
  const origin =
    verificationBaseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const verificationUrl = `${origin}/verify/${certificate.certificateNumber}`;
  const relativeVerificationPath = `/verify/${certificate.certificateNumber}`;

  return (
    <div
      className='certificate-wrapper w-full max-w-4xl mx-auto'
      data-testid='certificate-document'
    >
      {/* Revocation Alert Banner if REVOKED */}
      {isRevoked && (
        <div
          role='alert'
          aria-live='assertive'
          className='mb-6 p-4 sm:p-5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm no-print'
          data-testid='certificate-revocation-banner'
        >
          <div className='flex items-start gap-3'>
            <div className='p-2 bg-rose-100 rounded-xl text-rose-600 shrink-0 mt-0.5'>
              <ShieldAlert className='w-6 h-6' />
            </div>
            <div className='space-y-1'>
              <div className='flex items-center gap-2'>
                <span className='font-extrabold text-sm sm:text-base tracking-wide uppercase text-rose-900'>
                  Status: Certificate Revoked
                </span>
                <span className='inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900 uppercase'>
                  Void
                </span>
              </div>
              <p className='text-xs sm:text-sm text-rose-800 leading-relaxed'>
                This credential was revoked on{' '}
                <strong className='font-semibold'>
                  {formatCertificateDate(certificate.revokedAt)}
                </strong>
                .
              </p>
              {certificate.revocationReason && (
                <p
                  className='text-xs text-rose-900 bg-rose-100/80 px-3 py-1.5 rounded-lg border border-rose-200 mt-1 font-medium'
                  data-testid='certificate-revocation-reason'
                >
                  <strong className='font-semibold'>Revocation Reason: </strong>
                  {certificate.revocationReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Institutional Certificate Body */}
      <div
        className={`certificate-container relative bg-white rounded-3xl p-6 sm:p-10 md:p-14 border-8 sm:border-[12px] shadow-xl overflow-hidden transition-all print:p-8 print:shadow-none print:rounded-none print:border-black ${
          isRevoked
            ? 'border-gray-300/80 bg-linear-to-b from-gray-50/50 to-white'
            : 'border-[#1E293B] bg-linear-to-b from-amber-50/20 via-white to-amber-50/10'
        }`}
      >
        {/* Subtle Watermark Overlay */}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03] select-none'
        >
          <Award className='w-[420px] h-[420px] text-gray-900' />
        </div>

        {/* Decorative Inner Frame Border */}
        <div
          className={`pointer-events-none absolute inset-3 sm:inset-4 md:inset-5 border-2 rounded-2xl ${
            isRevoked ? 'border-dashed border-gray-300' : 'border-[#C5A059]/40'
          }`}
        />

        {/* Watermark diagonal ribbon for REVOKED state across the certificate */}
        {isRevoked && (
          <div
            aria-label='Revoked status watermark'
            className='pointer-events-none absolute inset-0 flex items-center justify-center select-none overflow-hidden z-10'
          >
            <div className='transform -rotate-12 bg-rose-600/10 text-rose-700/40 border-y-4 border-rose-700/30 text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-widest py-3 px-12'>
              REVOKED
            </div>
          </div>
        )}

        <div className='relative z-20 flex flex-col justify-between min-h-[480px] sm:min-h-[540px] space-y-8'>
          {/* Top Header: Organization & Seal */}
          <div className='flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-200/60 pb-6'>
            {/* TechSprout Brand Emblem */}
            <div className='flex items-center space-x-3 text-center sm:text-left'>
              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-xs shrink-0 ${
                  isRevoked
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                <Award className='w-7 h-7 sm:w-8 sm:h-8' />
              </div>
              <div>
                <span className='block text-lg sm:text-xl font-black tracking-tight text-gray-900 font-lexend'>
                  TechSprout
                </span>
                <span className='block text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[#64748B]'>
                  Academy of Software Engineering
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div className='flex items-center gap-2'>
              {isRevoked ? (
                <div
                  className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs'
                  data-testid='certificate-status-revoked'
                >
                  <AlertTriangle className='w-3.5 h-3.5 text-rose-600' />
                  <span>REVOKED CREDENTIAL</span>
                </div>
              ) : (
                <div
                  className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs'
                  data-testid='certificate-status-active'
                >
                  <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600' />
                  <span>OFFICIAL CREDENTIAL • ACTIVE</span>
                </div>
              )}
            </div>
          </div>

          {/* Certificate Title & Presentation Statement */}
          <div className='text-center space-y-3 sm:space-y-4 my-auto py-2'>
            <div className='inline-block'>
              <span className='text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-[#C5A059]'>
                Formal Recognition of Mastery
              </span>
              <h1
                className='text-2xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight font-lexend mt-1 uppercase'
                data-testid='certificate-title'
              >
                Certificate of Completion
              </h1>
            </div>

            <p className='text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-widest pt-1'>
              This is proudly presented to
            </p>

            {/* Student Name */}
            <div className='py-2 sm:py-3'>
              <h2
                className='text-2xl sm:text-4xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight underline decoration-[#C5A059]/40 underline-offset-8 font-lexend'
                data-testid='certificate-student-name'
              >
                {certificate.studentName}
              </h2>
            </div>

            <p className='text-xs sm:text-sm text-gray-600 max-w-xl mx-auto leading-relaxed'>
              for successfully completing all coursework, practical requirements, and comprehensive assessments for
            </p>

            {/* Course Title */}
            <div className='pt-1'>
              <h3
                className='text-lg sm:text-2xl md:text-3xl font-extrabold text-[#0F172A] tracking-tight max-w-2xl mx-auto'
                data-testid='certificate-course-title'
              >
                {certificate.courseTitle}
              </h3>
            </div>

            {/* Assessment Score (if returned) */}
            {certificate.finalScorePercentage !== null &&
              certificate.finalScorePercentage !== undefined && (
                <div
                  className='pt-2 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200'
                  data-testid='certificate-final-score'
                >
                  <Award className='w-3.5 h-3.5 text-amber-600' />
                  <span>{`Final Assessment Score: ${certificate.finalScorePercentage}%`}</span>
                </div>
              )}
          </div>

          {/* Certificate Footer: Signatures, Dates, Verification QR & Number */}
          <div className='pt-6 border-t border-gray-200/60 flex flex-col md:flex-row items-center justify-between gap-6'>
            {/* Instructor Signature Block */}
            <div className='text-center md:text-left space-y-1 order-2 md:order-1'>
              <div className='w-44 border-b-2 border-gray-400 pb-1 mx-auto md:mx-0'>
                <span className='font-serif italic text-lg sm:text-xl text-gray-800 tracking-wide'>
                  {certificate.instructorName}
                </span>
              </div>
              <p
                className='text-xs font-bold text-gray-900'
                data-testid='certificate-instructor-name'
              >
                {certificate.instructorName}
              </p>
              <p className='text-[10px] text-gray-500 uppercase tracking-wider'>
                Lead Instructor
              </p>
            </div>

            {/* Completion & Issue Dates */}
            <div className='text-center space-y-1 text-xs text-gray-600 order-3 md:order-2'>
              <div>
                <span className='text-[11px] text-gray-400 uppercase tracking-wider'>
                  Completed:{' '}
                </span>
                <span
                  className='font-semibold text-gray-900'
                  data-testid='certificate-completed-date'
                >
                  {formatCertificateDate(certificate.completedAt)}
                </span>
              </div>
              <div>
                <span className='text-[11px] text-gray-400 uppercase tracking-wider'>
                  Issued:{' '}
                </span>
                <span
                  className='font-semibold text-gray-900'
                  data-testid='certificate-issued-date'
                >
                  {formatCertificateDate(certificate.issuedAt)}
                </span>
              </div>
              {isRevoked && certificate.revokedAt && (
                <div className='text-rose-700 font-bold'>
                  <span className='text-[11px] text-rose-500 uppercase tracking-wider'>
                    Revoked:{' '}
                  </span>
                  <span data-testid='certificate-revoked-date'>
                    {formatCertificateDate(certificate.revokedAt)}
                  </span>
                </div>
              )}
            </div>

            {/* Verification Block with QR Code */}
            <div className='flex items-center gap-3 order-1 md:order-3 bg-gray-50/80 p-2.5 rounded-2xl border border-gray-200/80'>
              <div data-testid='certificate-qr-container'>
                <CertificateQRCode value={verificationUrl} size={76} />
              </div>
              <div className='text-left space-y-0.5 max-w-[150px] sm:max-w-[170px]'>
                <span className='block text-[10px] font-bold text-gray-400 uppercase tracking-wider'>
                  Certificate No.
                </span>
                <span
                  className='block font-mono text-xs font-extrabold text-gray-900 tracking-tight select-all truncate'
                  data-testid='certificate-number'
                >
                  {certificate.certificateNumber}
                </span>
                <Link
                  href={relativeVerificationPath}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-semibold'
                  data-testid='certificate-verification-link'
                >
                  <span>Verify Authenticity</span>
                  <ExternalLink className='w-2.5 h-2.5' />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
