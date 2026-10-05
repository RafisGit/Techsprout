'use client';

import { formatMinorUnits } from '@/lib/money';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicCourseBySlug } from '@/lib/api/catalog';
import { fetchCourseEnrollmentStatus } from '@/lib/api/learning';
import { validateCoupon, createOrder, initiatePayment } from '@/lib/api/orders';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  ShieldCheck,
  Tag,
  CheckCircle2,
  AlertCircle,
  Lock,
  Loader2,
  BookOpen,
  Sparkles,
  X,
} from 'lucide-react';
import type { CouponPreviewDto } from '@techsprout/contracts';

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!isAuthLoading && !currentUser) {
      router.push(`/login?redirect=${encodeURIComponent(`/checkout/${slug}`)}`);
    }
  }, [isAuthLoading, currentUser, router, slug]);

  // Fetch course details
  const {
    data: course,
    isLoading: isCourseLoading,
    isError: isCourseError,
    error: courseError,
  } = useQuery({
    queryKey: ['publicCourse', slug],
    queryFn: () => fetchPublicCourseBySlug(slug),
    enabled: !!slug,
    retry: 1,
  });

  // Fetch enrollment status to prevent duplicate purchases
  const { data: enrollmentStatus } = useQuery({
    queryKey: ['courseEnrollmentStatus', course?.id],
    queryFn: () => fetchCourseEnrollmentStatus(course!.id),
    enabled: !!course?.id && !!currentUser,
  });

  // State management
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreviewDto | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<
    'idle' | 'creating_order' | 'initiating_payment' | 'redirecting'
  >('idle');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // If course is free, redirect to catalog page
  useEffect(() => {
    if (course && (Number(course.price) === 0 || course.price === '0.00')) {
      router.replace(`/courses/${slug}`);
    }
  }, [course, router, slug]);

  const isEnrolled = enrollmentStatus?.isEnrolled === true;

  // Coupon application handler
  const handleApplyCoupon = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = couponCodeInput.trim().toUpperCase();
    if (!cleanCode || !course) return;

    setIsValidatingCoupon(true);
    setCouponError(null);

    try {
      const preview = await validateCoupon({
        code: cleanCode,
        courseId: course.id,
      });

      if (preview.isValid) {
        setAppliedCoupon(preview);
        setCouponCodeInput(cleanCode);
        setCouponError(null);
      } else {
        setAppliedCoupon(null);
        setCouponError('Coupon is not applicable to this course.');
      }
    } catch (err: any) {
      setAppliedCoupon(null);
      const code = err?.response?.data?.errorCode;
      const msg = err?.response?.data?.message;

      if (code === 'COUPON_NOT_FOUND') {
        setCouponError('Invalid coupon code.');
      } else if (code === 'COUPON_EXPIRED') {
        setCouponError('This coupon code has expired.');
      } else if (code === 'COUPON_DISABLED') {
        setCouponError('This coupon is no longer active.');
      } else if (code === 'COUPON_NOT_YET_ACTIVE') {
        setCouponError('This coupon is not yet active.');
      } else if (code === 'COUPON_COURSE_MISMATCH') {
        setCouponError('This coupon is not valid for this specific course.');
      } else if (code === 'COUPON_MIN_ORDER_NOT_MET') {
        setCouponError('The order subtotal does not meet the minimum requirement for this coupon.');
      } else if (code === 'COUPON_USAGE_LIMIT_REACHED') {
        setCouponError('This coupon has reached its maximum global usage limit.');
      } else if (code === 'COUPON_USER_LIMIT_REACHED') {
        setCouponError('You have already redeemed this coupon the maximum allowed number of times.');
      } else {
        setCouponError(msg || 'Failed to apply coupon. Please check the code and try again.');
      }
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponError(null);
  };

  // Authoritative Order & Payment checkout handler
  const handleCheckout = async () => {
    if (!course || !currentUser || isSubmitting) return;

    setIsSubmitting(true);
    setCheckoutError(null);

    try {
      // Step 1: Create Order with server-side pricing and reservation locking
      setSubmitStep('creating_order');
      const order = await createOrder({
        courseId: course.id,
        couponCode: appliedCoupon?.code || undefined,
      });

      // Step 2: Initiate Payment Session
      setSubmitStep('initiating_payment');
      const paymentSession = await initiatePayment({
        orderId: order.id,
      });

      // Step 3: Hosted Gateway Redirection or Internal Zero-Payable Success
      setSubmitStep('redirecting');

      if (order.payableCents === 0 || paymentSession.gatewayUrl.includes('/orders/')) {
        // Zero-payable or internal return URL
        router.push(`/orders/${order.id}/success`);
      } else {
        // SSLCommerz hosted payment gateway URL
        window.location.href = paymentSession.gatewayUrl;
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setSubmitStep('idle');
      const msg =
        err?.response?.data?.message ||
        'Failed to initiate checkout. Please try again or contact support.';
      setCheckoutError(msg);
    }
  };

  // Loading skeleton state
  if (isAuthLoading || isCourseLoading) {
    return (
      <div className='min-h-screen bg-[#F8FAFC] py-16 px-4'>
        <div className='max-w-4xl mx-auto space-y-6 animate-pulse'>
          <div className='h-8 w-48 bg-gray-200 rounded-lg' />
          <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
            <div className='lg:col-span-2 h-96 bg-white rounded-3xl border border-gray-200 p-6' />
            <div className='h-80 bg-white rounded-3xl border border-gray-200 p-6' />
          </div>
        </div>
      </div>
    );
  }

  // Error state for course loading
  if (isCourseError || !course) {
    return (
      <div className='min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-2xl font-bold text-gray-900'>Course Unavailable</h2>
          <p className='text-xs text-gray-500'>
            {(courseError as any)?.response?.data?.message ||
              'We were unable to load the course details for checkout.'}
          </p>
          <div className='pt-2'>
            <Link href='/courses'>
              <Button variant='outline' size='sm' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                Back to Catalog
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Already Enrolled Banner
  if (isEnrolled) {
    return (
      <div className='min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto'>
            <CheckCircle2 className='w-8 h-8' />
          </div>
          <h2 className='text-2xl font-bold text-gray-900'>Already Enrolled</h2>
          <p className='text-xs text-gray-500'>
            You already have active lifetime access to <strong>{course.title}</strong>.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/learn/${course.slug}`}>
              <Button className='rounded-xl text-xs bg-primary text-white font-bold'>
                Go to Course Curriculum
              </Button>
            </Link>
            <Link href='/my-courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                My Courses
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Tuition calculations
  const originalPriceCents = Math.round(Number(course.price) * 100);
  const discountCents = appliedCoupon ? appliedCoupon.discountCents : 0;
  const payableCents = appliedCoupon
    ? appliedCoupon.payableCents
    : Math.max(0, originalPriceCents - discountCents);
  const currency = course.currency || 'BDT';

  const isZeroPayable = payableCents === 0;

  return (
    <div className='min-h-screen bg-[#F8FAFC] py-12 px-4'>
      <div className='max-w-4xl mx-auto space-y-8'>
        {/* Navigation Breadcrumb */}
        <div className='flex items-center justify-between'>
          <Link
            href={`/courses/${course.slug}`}
            className='inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors'
          >
            <ArrowLeft className='w-4 h-4 mr-1.5' />
            Back to Course Details
          </Link>
          <div className='inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200'>
            <Lock className='w-3.5 h-3.5' />
            <span>256-Bit SSL Encrypted Checkout</span>
          </div>
        </div>

        {/* Page Title */}
        <div>
          <h1 className='text-2xl lg:text-3xl font-extrabold text-gray-900 font-lexend'>
            Complete Your Enrollment
          </h1>
          <p className='text-xs text-gray-500 mt-1'>
            Review your course purchase and complete payment to start learning immediately.
          </p>
        </div>

        {/* Checkout Error Banner */}
        {checkoutError && (
          <div
            role='alert'
            className='p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-3'
          >
            <AlertCircle className='w-4 h-4 shrink-0 mt-0.5' />
            <div className='space-y-1'>
              <p className='font-bold'>Checkout Error</p>
              <p>{checkoutError}</p>
            </div>
          </div>
        )}

        {/* Main Checkout Layout */}
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-8'>
          {/* Left Column: Course Details & Coupon */}
          <div className='lg:col-span-7 space-y-6'>
            {/* Course Summary Card */}
            <div className='bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4'>
              <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
                <span className='text-xs font-bold text-gray-400 uppercase tracking-wider'>
                  Course Selected
                </span>
                {course.category && (
                  <span className='text-[11px] font-semibold text-primary bg-primary/5 px-2.5 py-0.5 rounded-full'>
                    {course.category.name}
                  </span>
                )}
              </div>

              <div className='flex gap-4 items-center'>
                <div className='relative w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 shrink-0 border border-gray-100'>
                  {course.thumbnailUrl ? (
                    <Image
                      src={course.thumbnailUrl}
                      alt={course.title}
                      fill
                      className='object-cover'
                    />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-xs'>
                      TSP
                    </div>
                  )}
                </div>

                <div className='space-y-1 min-w-0 flex-1'>
                  <h2 className='text-sm font-bold text-gray-900 truncate'>{course.title}</h2>
                  <p className='text-xs text-gray-500'>
                    Instructor: {course.instructor?.name || 'TechSprout Faculty'}
                  </p>
                  <p className='text-[11px] text-gray-400'>
                    Level: <span className='capitalize'>{course.level?.toLowerCase() || 'All levels'}</span> • Lifetime Access
                  </p>
                </div>
              </div>
            </div>

            {/* Coupon Code Entry Section */}
            <div className='bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4'>
              <div className='flex items-center gap-2'>
                <Tag className='w-4 h-4 text-primary' />
                <h3 className='text-sm font-bold text-gray-900'>Have a Promo Code or Coupon?</h3>
              </div>

              {appliedCoupon ? (
                <div className='p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between'>
                  <div className='flex items-center gap-2.5'>
                    <Sparkles className='w-4 h-4 text-emerald-600' />
                    <div>
                      <p className='text-xs font-bold text-emerald-900'>
                        Coupon &apos;{appliedCoupon.code}&apos; Applied!
                      </p>
                      <p className='text-[11px] text-emerald-700'>
                        You saved {formatMinorUnits(appliedCoupon.discountCents, currency)}{' '}
                        ({appliedCoupon.discountType === 'PERCENTAGE' ? `${appliedCoupon.discountValue}% off` : 'fixed off'})
                      </p>
                    </div>
                  </div>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl'
                    onClick={handleRemoveCoupon}
                    aria-label='Remove coupon'
                  >
                    <X className='w-4 h-4' />
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className='space-y-2'>
                  <div className='flex gap-2'>
                    <div className='relative flex-1'>
                      <Input
                        type='text'
                        placeholder='Enter coupon code'
                        value={couponCodeInput}
                        onChange={(e) => {
                          setCouponCodeInput(e.target.value.toUpperCase());
                          if (couponError) setCouponError(null);
                        }}
                        className='rounded-xl text-xs uppercase tracking-wider font-mono h-11'
                        disabled={isValidatingCoupon || isSubmitting}
                        aria-label='Coupon Code'
                      />
                    </div>
                    <Button
                      type='submit'
                      disabled={!couponCodeInput.trim() || isValidatingCoupon || isSubmitting}
                      className='rounded-xl px-5 text-xs font-bold bg-gray-900 text-white hover:bg-gray-800 h-11 shrink-0'
                    >
                      {isValidatingCoupon ? (
                        <Loader2 className='w-3.5 h-3.5 animate-spin' />
                      ) : (
                        'Apply'
                      )}
                    </Button>
                  </div>

                  {couponError && (
                    <p role='alert' className='text-xs text-red-500 font-medium flex items-center gap-1.5 pt-1'>
                      <AlertCircle className='w-3.5 h-3.5 shrink-0' />
                      <span>{couponError}</span>
                    </p>
                  )}
                </form>
              )}
            </div>

            {/* Buyer Trust & Security Guarantee */}
            <div className='p-4 rounded-2xl bg-gray-100/70 border border-gray-200/80 flex items-center gap-3'>
              <ShieldCheck className='w-5 h-5 text-emerald-600 shrink-0' />
              <div className='text-xs text-gray-600'>
                <p className='font-semibold text-gray-800'>Safe & Authoritative Transaction</p>
                <p className='text-[11px] text-gray-500'>
                  Tuition and discounts are calculated strictly on the TechSprout server. Official tax invoices are issued immediately upon confirmation.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary & Checkout Action */}
          <div className='lg:col-span-5 space-y-6'>
            <div className='bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-6 sticky top-24'>
              <h3 className='text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-3'>
                Order Summary
              </h3>

              {/* Price Breakdown */}
              <div className='space-y-3 text-xs'>
                <div className='flex justify-between items-center text-gray-600'>
                  <span>Original Course Price</span>
                  <span className='font-medium text-gray-900'>
                    {formatMinorUnits(originalPriceCents, currency)}
                  </span>
                </div>

                <div className='flex justify-between items-center text-gray-600'>
                  <span>Subtotal</span>
                  <span className='font-medium text-gray-900'>
                    {formatMinorUnits(originalPriceCents, currency)}
                  </span>
                </div>

                {discountCents > 0 && (
                  <div className='flex justify-between items-center text-emerald-700 font-medium'>
                    <span className='flex items-center gap-1'>
                      <Tag className='w-3.5 h-3.5' />
                      Discount ({appliedCoupon?.code})
                    </span>
                    <span>-{formatMinorUnits(discountCents, currency)}</span>
                  </div>
                )}

                <div className='border-t border-gray-200 pt-3 flex justify-between items-baseline'>
                  <div>
                    <span className='text-sm font-bold text-gray-900'>Total Payable</span>
                    <p className='text-[10px] text-gray-400'>Includes all applicable course fees</p>
                  </div>
                  <span className='text-2xl font-extrabold text-primary font-lexend'>
                    {formatMinorUnits(payableCents, currency)}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className='pt-2 space-y-3'>
                <Button
                  id='btn-complete-checkout'
                  disabled={isSubmitting}
                  onClick={handleCheckout}
                  className={`w-full rounded-2xl py-6 text-sm font-bold shadow-md transition ${
                    isZeroPayable
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-primary hover:bg-primary/90 text-white'
                  }`}
                >
                  {isSubmitting ? (
                    <span className='flex items-center gap-2'>
                      <Loader2 className='w-4 h-4 animate-spin' />
                      <span>
                        {submitStep === 'creating_order' && 'Creating Order...'}
                        {submitStep === 'initiating_payment' && 'Preparing Payment Session...'}
                        {submitStep === 'redirecting' &&
                          (isZeroPayable ? 'Completing Free Enrollment...' : 'Redirecting to SSLCommerz...')}
                        {submitStep === 'idle' && 'Processing...'}
                      </span>
                    </span>
                  ) : isZeroPayable ? (
                    'Complete Free Enrollment'
                  ) : (
                    'Proceed to Payment'
                  )}
                </Button>

                <p className='text-[10px] text-gray-400 text-center leading-relaxed'>
                  By completing this purchase, you agree to TechSprout&apos;s{' '}
                  <Link href='/terms-and-condition' className='text-primary hover:underline'>
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href='/privacy-policy' className='text-primary hover:underline'>
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
