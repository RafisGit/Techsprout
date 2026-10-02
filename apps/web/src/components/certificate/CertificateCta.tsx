'use client';

import React from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Award, ArrowRight, AlertTriangle } from 'lucide-react';
import type { EnrolledCourseItemDto, CertificateDto } from '@techsprout/contracts';

export interface CertificateCtaInfo {
  hasCertificate: boolean;
  isHistorical: boolean;
  isRevoked: boolean;
  label: string;
  href: string;
  badgeLabel?: string;
  variant: 'completed' | 'historical_active' | 'historical_revoked' | 'none';
}

/**
 * Pure function determining the appropriate certificate CTA and metadata
 * based on current enrollment status and existing certificate record.
 */
export function resolveEnrollmentCertificateCta(
  enrollment: Pick<EnrolledCourseItemDto, 'status' | 'course'> & { hasCertificate?: boolean },
  certificate?: Pick<CertificateDto, 'status' | 'certificateNumber'> | null
): CertificateCtaInfo {
  const isCompleted = enrollment.status === 'COMPLETED';
  const hasCert = Boolean(enrollment.hasCertificate || certificate);
  const isRevoked = certificate?.status === 'REVOKED';

  if (isCompleted) {
    return {
      hasCertificate: true,
      isHistorical: false,
      isRevoked,
      label: isRevoked ? 'View Revoked Certificate' : 'View Certificate',
      href: `/learn/${enrollment.course.slug}/certificate`,
      badgeLabel: isRevoked ? 'REVOKED' : undefined,
      variant: isRevoked ? 'historical_revoked' : 'completed',
    };
  }

  // Active or other enrollment status
  if (hasCert) {
    return {
      hasCertificate: true,
      isHistorical: true,
      isRevoked,
      label: isRevoked ? 'View Revoked Certificate' : 'View Historical Certificate',
      href: `/learn/${enrollment.course.slug}/certificate`,
      badgeLabel: isRevoked ? 'REVOKED' : 'Previously Earned',
      variant: isRevoked ? 'historical_revoked' : 'historical_active',
    };
  }

  // Incomplete / active without certificate
  return {
    hasCertificate: false,
    isHistorical: false,
    isRevoked: false,
    label: '',
    href: '',
    variant: 'none',
  };
}

interface EnrollmentCertificateCtaProps {
  enrollment: EnrolledCourseItemDto;
  certificate?: CertificateDto | null;
}

/**
 * Institutional Card Action component rendering the appropriate primary and secondary
 * actions for completed, active, and historical-certificate enrollments.
 */
export function EnrollmentCertificateCta({
  enrollment,
  certificate: explicitCertificate,
}: EnrollmentCertificateCtaProps) {
  const queryClient = useQueryClient();
  const cachedCertificate = queryClient?.getQueryData<CertificateDto>([
    'studentCertificate',
    enrollment.course.id,
  ]);
  const certificate =
    explicitCertificate !== undefined ? explicitCertificate : cachedCertificate;

  const cta = resolveEnrollmentCertificateCta(enrollment, certificate);
  const isCompleted = enrollment.status === 'COMPLETED';

  // 1. Incomplete ACTIVE enrollment with no certificate
  if (!cta.hasCertificate && !isCompleted) {
    return (
      <Link href={`/learn/${enrollment.course.slug}`} className='block w-full'>
        <Button className='w-full rounded-xl py-2.5 text-xs font-bold transition shadow-xs bg-primary hover:bg-primary/90 text-white'>
          <span>Continue Learning</span>
          <ArrowRight className='w-3.5 h-3.5 ml-1.5' />
        </Button>
      </Link>
    );
  }

  // 2. Normal COMPLETED enrollment
  if (isCompleted) {
    return (
      <div className='flex items-center gap-2'>
        <Link
          href={cta.href}
          className='flex-1'
          data-testid={`btn-view-certificate-${enrollment.course.slug}`}
        >
          <Button
            className={`w-full rounded-xl py-2.5 text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 ${
              cta.isRevoked
                ? 'bg-rose-700 hover:bg-rose-800 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {cta.isRevoked ? (
              <AlertTriangle className='w-3.5 h-3.5 text-amber-200' />
            ) : (
              <Award className='w-3.5 h-3.5 text-amber-300' />
            )}
            <span>{cta.label}</span>
          </Button>
        </Link>
        <Link
          href={`/learn/${enrollment.course.slug}`}
          className='shrink-0'
          title='Review Course Material'
        >
          <Button variant='outline' className='rounded-xl py-2.5 px-3 text-xs font-semibold'>
            Review
          </Button>
        </Link>
      </div>
    );
  }

  // 3. ACTIVE enrollment with historically issued certificate (e.g. curriculum expansion)
  return (
    <div className='space-y-2' data-testid={`card-historical-cta-${enrollment.course.slug}`}>
      <div className='flex items-center gap-2'>
        <Link href={`/learn/${enrollment.course.slug}`} className='flex-1'>
          <Button className='w-full rounded-xl py-2.5 text-xs font-bold transition shadow-xs bg-primary hover:bg-primary/90 text-white'>
            <span>Continue Learning</span>
            <ArrowRight className='w-3.5 h-3.5 ml-1.5' />
          </Button>
        </Link>
        <Link
          href={cta.href}
          className='shrink-0'
          data-testid={`btn-view-certificate-${enrollment.course.slug}`}
          title={
            cta.isRevoked
              ? 'Certificate Revoked'
              : 'Historical Certificate Previously Earned'
          }
        >
          <Button
            variant='outline'
            className={`rounded-xl py-2.5 px-3 text-xs font-bold border transition ${
              cta.isRevoked
                ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            {cta.isRevoked ? (
              <AlertTriangle className='w-3.5 h-3.5 mr-1 text-rose-600' />
            ) : (
              <Award className='w-3.5 h-3.5 mr-1 text-emerald-600' />
            )}
            <span>Certificate</span>
          </Button>
        </Link>
      </div>
      <div className='flex items-center justify-between text-[11px] px-1'>
        {cta.isRevoked ? (
          <span
            className='text-rose-600 font-bold flex items-center gap-1'
            data-testid='historical-revoked-indicator'
          >
            <AlertTriangle className='w-3 h-3' />
            Historical Credential: REVOKED
          </span>
        ) : (
          <span
            className='text-emerald-700 font-semibold flex items-center gap-1'
            data-testid='historical-active-indicator'
          >
            <Award className='w-3 h-3 text-emerald-600' />
            Certificate previously earned
          </span>
        )}
      </div>
    </div>
  );
}
