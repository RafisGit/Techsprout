'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicCourseBySlug } from '@/lib/api/catalog';
import { fetchStudentCertificate } from '@/lib/api/certificates';
import { fetchCourseEnrollmentStatus } from '@/lib/api/learning';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { CertificateDocument } from '@/components/certificate/CertificateDocument';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Printer,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  GraduationCap,
  LogIn,
  ExternalLink,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';

export default function StudentCertificatePage() {
  const params = useParams();
  const courseSlug = params?.courseSlug as string;

  const [isCopied, setIsCopied] = useState(false);
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  // 1. Resolve Course to obtain course.id
  const {
    data: course,
    isLoading: isCourseLoading,
    isError: isCourseError,
    error: courseError,
    refetch: refetchCourse,
  } = useQuery({
    queryKey: ['publicCourse', courseSlug],
    queryFn: () => fetchPublicCourseBySlug(courseSlug),
    enabled: !!courseSlug,
    retry: 1,
  });

  const courseId = course?.id;

  // 2. Fetch Student Certificate using GET /api/v1/courses/:courseId/certificate
  const {
    data: certificate,
    isLoading: isCertLoading,
    isError: isCertError,
    error: certError,
    refetch: refetchCertificate,
  } = useQuery({
    queryKey: ['studentCertificate', courseId],
    queryFn: () => fetchStudentCertificate(courseId!),
    enabled: !!courseId && !!currentUser,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // 3. Fetch Enrollment Status to determine if current enrollment is ACTIVE (curriculum expansion)
  const { data: enrollmentData } = useQuery({
    queryKey: ['courseEnrollmentStatus', courseId],
    queryFn: () => fetchCourseEnrollmentStatus(courseId!),
    enabled: !!courseId && !!currentUser,
    staleTime: 60 * 1000,
    retry: 1,
  });

  const isHistoricalActive =
    !!certificate &&
    !!enrollmentData?.isEnrolled &&
    enrollmentData.enrollment?.status === 'ACTIVE';

  const isLoading =
    isAuthLoading ||
    isCourseLoading ||
    (!!currentUser && !!courseId && isCertLoading);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleCopyLink = () => {
    if (!certificate || typeof window === 'undefined') return;
    const url = `${window.location.origin}/verify/${certificate.certificateNumber}`;
    navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    });
  };

  // 1. Unauthenticated state
  if (!isAuthLoading && !currentUser) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC] py-12'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
            <GraduationCap className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Authentication Required</h2>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            Please log in with your student account to view your official course certificate.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link
              href={`/login?redirect=${encodeURIComponent(
                `/learn/${courseSlug}/certificate`
              )}`}
            >
              <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90'>
                <LogIn className='w-4 h-4 mr-2' />
                Log In
              </Button>
            </Link>
            <Link href={`/courses/${courseSlug}`}>
              <Button variant='outline' className='rounded-xl text-xs font-semibold px-4 py-2.5'>
                Course Overview
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Loading State
  if (isLoading) {
    return (
      <div className='min-h-[85vh] flex flex-col items-center justify-center px-4 bg-[#F8FAFC] py-16 space-y-4'>
        <div className='w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin' />
        <p className='text-xs sm:text-sm font-semibold text-gray-600 animate-pulse'>
          Retrieving official certificate records...
        </p>
      </div>
    );
  }

  // 3. Course Not Found Error
  if (isCourseError || !course) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC] py-12'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-red-100 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Course Unavailable</h2>
          <p className='text-xs text-gray-500'>
            {(courseError as any)?.response?.data?.message ||
              'We could not find this course in our records.'}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/my-courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                My Courses
              </Button>
            </Link>
            <Button onClick={() => refetchCourse()} className='rounded-xl text-xs'>
              <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Certificate Error Handling (403 COURSE_NOT_COMPLETED, 404 ENROLLMENT_NOT_FOUND, 404 CERTIFICATE_NOT_FOUND)
  if (isCertError) {
    const errorResponse = (certError as any)?.response;
    const status = errorResponse?.status;
    const errorCode = errorResponse?.data?.errorCode;

    // Course not completed (403)
    if (status === 403 || errorCode === 'COURSE_NOT_COMPLETED') {
      return (
        <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC] py-12'>
          <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-amber-200/80 shadow-xs text-center space-y-4'>
            <div className='w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto'>
              <GraduationCap className='w-8 h-8' />
            </div>
            <h2 className='text-xl font-bold text-gray-900'>Certificate In Progress</h2>
            <p className='text-xs sm:text-sm text-gray-600 leading-relaxed'>
              Your official certificate for <strong>{course.title}</strong> will be automatically issued once you complete all required course lessons and pass all mandatory assessments.
            </p>
            <div className='pt-2 flex justify-center gap-3'>
              <Link href={`/learn/${courseSlug}`}>
                <Button className='rounded-xl text-xs font-semibold px-5 py-2.5 bg-primary text-white hover:bg-primary/90'>
                  Continue Learning
                </Button>
              </Link>
              <Link href='/my-courses'>
                <Button variant='outline' className='rounded-xl text-xs font-semibold px-4 py-2.5'>
                  Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // Enrollment not found (404 ENROLLMENT_NOT_FOUND)
    if (status === 404 && errorCode === 'ENROLLMENT_NOT_FOUND') {
      return (
        <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC] py-12'>
          <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-amber-200/80 shadow-xs text-center space-y-4'>
            <div className='w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto'>
              <AlertCircle className='w-8 h-8' />
            </div>
            <h2 className='text-xl font-bold text-gray-900'>Enrollment Required</h2>
            <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
              You are not currently enrolled in <strong>{course.title}</strong>. Enroll in this course to earn your verified credential upon completion.
            </p>
            <div className='pt-2 flex justify-center gap-3'>
              <Link href={`/courses/${courseSlug}`}>
                <Button className='rounded-xl text-xs font-semibold px-5 py-2.5 bg-primary text-white hover:bg-primary/90'>
                  View Course
                </Button>
              </Link>
              <Link href='/my-courses'>
                <Button variant='outline' className='rounded-xl text-xs font-semibold px-4 py-2.5'>
                  My Courses
                </Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // Certificate not found or generic error
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC] py-12'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-red-100 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Certificate Record Unavailable</h2>
          <p className='text-xs text-gray-500'>
            {errorResponse?.data?.message ||
              'We were unable to locate your certificate record for this course.'}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/learn/${courseSlug}`}>
              <Button variant='outline' className='rounded-xl text-xs'>
                Back to Course
              </Button>
            </Link>
            <Button onClick={() => refetchCertificate()} className='rounded-xl text-xs'>
              <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Successful Certificate View
  if (!certificate) return null;

  return (
    <div className='min-h-screen bg-[#F8FAFC] pb-24'>
      {/* Top Action & Navigation Bar (Hidden during print) */}
      <div className='no-print bg-white border-b border-gray-200/80 sticky top-0 z-30 shadow-2xs'>
        <div className='container mx-auto px-4 max-w-5xl h-16 flex items-center justify-between gap-4'>
          <div className='flex items-center space-x-3'>
            <Link
              href={`/learn/${courseSlug}`}
              className='p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition'
              title='Back to Course Workspace'
              data-testid='btn-back-to-course'
            >
              <ArrowLeft className='w-4 h-4' />
            </Link>
            <div className='hidden sm:block'>
              <h1 className='text-xs sm:text-sm font-bold text-gray-900 truncate max-w-xs md:max-w-sm'>
                {course.title}
              </h1>
              <span className='text-[11px] text-gray-400'>
                Verified Certificate of Completion
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={handleCopyLink}
              className='rounded-xl text-xs font-semibold px-3 py-2 border-gray-200 hover:bg-gray-50 flex items-center gap-1.5'
              data-testid='btn-copy-verification-link'
              title='Copy Public Verification Link'
            >
              {isCopied ? (
                <>
                  <Check className='w-3.5 h-3.5 text-emerald-600' />
                  <span className='text-emerald-700 font-bold'>Copied</span>
                </>
              ) : (
                <>
                  <Copy className='w-3.5 h-3.5 text-gray-500' />
                  <span className='hidden sm:inline'>Copy Link</span>
                </>
              )}
            </Button>

            <Link
              href={`/verify/${certificate.certificateNumber}`}
              target='_blank'
              rel='noopener noreferrer'
              data-testid='btn-public-verify'
            >
              <Button
                type='button'
                variant='outline'
                className='rounded-xl text-xs font-semibold px-3 py-2 border-gray-200 hover:bg-gray-50 flex items-center gap-1.5'
              >
                <ShieldCheck className='w-3.5 h-3.5 text-gray-500' />
                <span className='hidden sm:inline'>Public View</span>
                <ExternalLink className='w-3 h-3 text-gray-400' />
              </Button>
            </Link>

            <Button
              type='button'
              onClick={handlePrint}
              className='rounded-xl text-xs font-bold px-4 py-2 bg-primary text-white hover:bg-primary/90 shadow-xs flex items-center gap-1.5'
              data-testid='btn-print-certificate'
            >
              <Printer className='w-3.5 h-3.5' />
              <span>Print / Save PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Certificate Content Area */}
      <main className='container mx-auto px-4 max-w-5xl pt-8 sm:pt-12'>
        {/* Historical Certificate Notice (when course curriculum has expanded and enrollment is ACTIVE) */}
        {isHistoricalActive && (
          <div
            role='status'
            aria-live='polite'
            className='no-print mb-6 p-4 sm:p-5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs'
            data-testid='historical-certificate-banner'
          >
            <div className='flex items-start gap-3'>
              <div className='p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0 mt-0.5'>
                <BookOpen className='w-5 h-5' />
              </div>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <span className='font-bold text-xs sm:text-sm tracking-wide uppercase text-amber-900'>
                    Historical Credential • Course In Progress
                  </span>
                </div>
                <p className='text-xs sm:text-sm text-amber-800 leading-relaxed'>
                  New curriculum items have been added to this course since this certificate was earned. Your previously earned credential remains authentic and valid.
                  {enrollmentData?.enrollment?.progressPercentage !== undefined && (
                    <span className='font-semibold'> Current course progress: {enrollmentData.enrollment.progressPercentage}%.</span>
                  )}
                </p>
              </div>
            </div>
            <Link href={`/learn/${courseSlug}`} className='shrink-0 w-full sm:w-auto'>
              <Button
                size='sm'
                className='w-full sm:w-auto rounded-xl text-xs font-bold px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                data-testid='btn-resume-expanded-course'
              >
                Resume Course Material
              </Button>
            </Link>
          </div>
        )}

        <CertificateDocument certificate={certificate} />
      </main>
    </div>
  );
}
