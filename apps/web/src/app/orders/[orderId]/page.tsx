'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/useCurrentUser';
import {
  fetchOrderById,
  fetchOrderRefundEligibility,
  submitOrderRefundRequest,
} from '@/lib/api/orders';
import Hero from '@/components/Hero';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Receipt,
  FileText,
  BookOpen,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  Tag,
  LogIn,
  RefreshCw,
  Send,
} from 'lucide-react';
import { getOrderStatusBadge } from '../page';
import type { OrderStatus, RefundRequestReasonCategory } from '@techsprout/contracts';

const REASON_CATEGORIES: { value: RefundRequestReasonCategory; label: string }[] = [
  {
    value: 'COURSE_CONTENT_MISMATCH',
    label: 'Course Content Mismatch (Syllabus/Content differs from overview)',
  },
  {
    value: 'TECHNICAL_ISSUES',
    label: 'Technical Issues (Video player errors, access problems)',
  },
  {
    value: 'ACCIDENTAL_PURCHASE',
    label: 'Accidental Purchase',
  },
  {
    value: 'PERSONAL_REASONS',
    label: 'Personal Reasons / Schedule Conflict',
  },
  {
    value: 'OTHER',
    label: 'Other Reason',
  },
];

export default function StudentOrderDetailPage() {
  const { t, formatDate, formatNumber, formatCurrency } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const orderId = params?.orderId as string;

  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  const {
    data: order,
    isLoading: isOrderLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['studentOrder', orderId],
    queryFn: () => fetchOrderById(orderId),
    enabled: !!currentUser && !!orderId,
    retry: 1,
  });

  const {
    data: eligibility,
    isLoading: isEligibilityLoading,
    refetch: refetchEligibility,
  } = useQuery({
    queryKey: ['orderRefundEligibility', orderId],
    queryFn: () => fetchOrderRefundEligibility(orderId),
    enabled: !!currentUser && !!orderId && order?.status === 'PAID',
    retry: 1,
  });

  // Refund Modal State
  const [isRefundModalOpen, setIsRefundModalOpen] = React.useState(false);
  const [selectedCategory, setSelectedCategory] =
    React.useState<RefundRequestReasonCategory>('COURSE_CONTENT_MISMATCH');
  const [reasonDetail, setReasonDetail] = React.useState('');
  const [isSubmittingRefund, setIsSubmittingRefund] = React.useState(false);
  const [refundSubmitError, setRefundSubmitError] = React.useState<string | null>(null);
  const [refundSubmitSuccess, setRefundSubmitSuccess] = React.useState(false);

  const handleOpenRefundModal = () => {
    setRefundSubmitError(null);
    setRefundSubmitSuccess(false);
    setReasonDetail('');
    setSelectedCategory('COURSE_CONTENT_MISMATCH');
    setIsRefundModalOpen(true);
  };

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reasonDetail.trim().length < 10) {
      setRefundSubmitError('Please provide a reason with at least 10 characters.');
      return;
    }

    try {
      setIsSubmittingRefund(true);
      setRefundSubmitError(null);
      await submitOrderRefundRequest(orderId, {
        reasonCategory: selectedCategory,
        reasonDetail: reasonDetail.trim(),
      });
      setRefundSubmitSuccess(true);
      await Promise.all([refetch(), refetchEligibility()]);
      setTimeout(() => {
        setIsRefundModalOpen(false);
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Failed to submit refund request. Please check your eligibility and try again.';
      setRefundSubmitError(msg);
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const isLoading = isAuthLoading || (!!currentUser && isOrderLoading);

  return (
    <div className='min-h-screen bg-[#F8FAFC] pb-24'>
      <Hero pageName={t.orders.pageTitle} />

      <main className='container mx-auto px-4 max-w-5xl pt-8 sm:pt-10'>
        {/* Top Back Action */}
        <div className='mb-6'>
          <Link
            href='/orders'
            className='inline-flex items-center text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors'
            data-testid='back-to-orders-link'
          >
            <ArrowLeft className='w-4 h-4 mr-1.5' />
            {t.orders.backToHistory}
          </Link>
        </div>

        {/* Unauthenticated State */}
        {!isAuthLoading && !currentUser && (
          <div className='max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
            <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
              <Receipt className='w-8 h-8' />
            </div>
            <h2 className='text-2xl font-bold text-gray-900'>
              {t.orders.signInToViewOrder}
            </h2>
            <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
              {t.orders.signInToViewOrderDesc}
            </p>
            <div className='pt-2'>
              <Link href={`/login?redirect=/orders/${orderId}`}>
                <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90 shadow-sm'>
                  <LogIn className='w-4 h-4 mr-2' />
                  {t.orders.loginToContinue}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Loading State Skeleton */}
        {isLoading && (
          <div className='space-y-6' data-testid='order-detail-loading'>
            <div className='bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs animate-pulse space-y-4'>
              <div className='h-6 bg-gray-200 rounded-md w-48'></div>
              <div className='h-4 bg-gray-200 rounded-md w-32'></div>
            </div>
            <div className='bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs animate-pulse space-y-4'>
              <div className='h-20 bg-gray-200 rounded-md w-full'></div>
            </div>
          </div>
        )}

        {/* Error / Unauthorized State */}
        {!isLoading && (isError || !order) && (
          <div className='bg-white rounded-3xl p-10 border border-gray-200/80 shadow-xs text-center space-y-4 my-8'>
            <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto'>
              <AlertCircle className='w-8 h-8' />
            </div>
            <h2 className='text-xl font-bold text-gray-900' data-testid='order-not-found-heading'>
              {t.orders.orderNotAvailable}
            </h2>
            <p className='text-xs sm:text-sm text-gray-600 max-w-md mx-auto'>
              {(error as any)?.response?.status === 403
                ? t.orders.orderDeniedDesc
                : t.orders.orderNotFoundDesc}
            </p>
            <div className='pt-2 flex justify-center gap-3'>
              <Button
                onClick={() => refetch()}
                variant='outline'
                size='sm'
                className='rounded-xl text-xs font-semibold'
              >
                <RefreshCw className='w-3.5 h-3.5 mr-1.5' />
                {t.orders.retry}
              </Button>
              <Link href='/orders'>
                <Button className='rounded-xl text-xs font-semibold px-5 bg-primary text-white hover:bg-primary/90'>
                  {t.orders.viewMyOrders}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Loaded Order Details */}
        {!isLoading && order && (
          <div className='space-y-6' data-testid='order-detail-content'>
            {/* Order Header Card */}
            <div className='bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-100'>
                <div>
                  <div className='flex items-center gap-3'>
                    <span className='font-mono text-xs sm:text-sm font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-lg'>
                      {order.orderNumber}
                    </span>
                    {getOrderStatusBadge(order.status, t.orders)}
                  </div>
                  <h1 className='text-xl sm:text-2xl font-extrabold text-gray-900 mt-2'>
                    {t.orders.orderSummary}
                  </h1>
                </div>

                {/* Invoice Button if Invoice exists */}
                {order.invoiceId && (
                  <Link href={`/invoices/${order.invoiceId}`}>
                    <Button
                      variant='outline'
                      size='sm'
                      className='rounded-xl text-xs font-semibold border-primary/20 text-primary hover:bg-primary/5 shadow-xs'
                      data-testid='view-invoice-btn'
                    >
                      <FileText className='w-4 h-4 mr-1.5' />
                      {t.orders.viewTaxInvoice}
                    </Button>
                  </Link>
                )}
              </div>

              {/* Order Timestamps & Key Meta */}
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs'>
                <div>
                  <span className='text-gray-400 block font-medium'>{t.orders.placedOn}</span>
                  <span className='font-bold text-gray-800 mt-1 block'>
                    {formatDate(order.createdAt)}
                  </span>
                </div>
                <div>
                  <span className='text-gray-400 block font-medium'>{t.orders.paymentStatus}</span>
                  <span className='font-bold text-gray-800 mt-1 block'>
                    {order.status === 'PAID' ? t.orders.settledGateway : order.status}
                  </span>
                </div>
                <div>
                  <span className='text-gray-400 block font-medium'>{t.orders.settledAt}</span>
                  <span className='font-bold text-gray-800 mt-1 block'>
                    {order.paidAt ? formatDate(order.paidAt) : '—'}
                  </span>
                </div>
                <div>
                  <span className='text-gray-400 block font-medium'>{t.orders.currency}</span>
                  <span className='font-bold text-gray-800 mt-1 block'>
                    {order.currency || 'BDT'}
                  </span>
                </div>
              </div>
            </div>

            {/* Refund Status Alert (if Refunded) */}
            {order.status === 'REFUNDED' && (
              <div className='p-5 bg-purple-50 border border-purple-200/80 rounded-2xl flex items-start gap-3.5'>
                <RotateCcw className='w-5 h-5 text-purple-700 shrink-0 mt-0.5' />
                <div className='text-xs space-y-1'>
                  <h4 className='font-bold text-purple-900'>{t.orders.orderRefundedTitle}</h4>
                  <p className='text-purple-800 leading-relaxed'>
                    {t.orders.orderRefundedDesc}
                  </p>
                </div>
              </div>
            )}

            {/* Line Items Card */}
            <div className='bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-4'>
              <h3 className='text-sm font-bold uppercase tracking-wider text-gray-400'>
                {t.orders.purchasedCourseItems}
              </h3>

              <div className='divide-y divide-gray-100'>
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className='py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'
                    data-testid={`line-item-${item.id}`}
                  >
                    <div className='space-y-1'>
                      <h4 className='text-base font-bold text-gray-900'>
                        {item.courseTitle}
                      </h4>
                      <div className='flex items-center gap-2 text-xs text-gray-500'>
                        <BookOpen className='w-3.5 h-3.5 text-gray-400' />
                        <span>{t.orders.onlineCourseAccess}</span>
                      </div>
                    </div>

                    <div className='flex items-center justify-between sm:justify-end gap-6'>
                      <div className='text-right'>
                        <span className='text-sm sm:text-base font-bold text-gray-900'>
                          {formatCurrency(item.payableCents / 100, order.currency)}
                        </span>
                        {item.discountCents > 0 && (
                          <span className='text-xs text-gray-400 line-through block'>
                            {formatCurrency(item.unitPriceCents / 100, order.currency)}
                          </span>
                        )}
                      </div>

                      {order.status === 'PAID' && (
                        <Link href='/my-courses'>
                          <Button
                            size='sm'
                            className='rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90'
                          >
                            {t.orders.goToCourse}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Breakdown Summary */}
            <div className='bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-4'>
              <h3 className='text-sm font-bold uppercase tracking-wider text-gray-400'>
                {t.orders.paymentSummary}
              </h3>

              <div className='space-y-2.5 text-xs text-gray-600 max-w-md ml-auto'>
                <div className='flex justify-between items-center py-1'>
                  <span>{t.orders.subtotal}</span>
                  <span className='font-semibold text-gray-900'>
                    {formatCurrency(order.subtotalCents / 100, order.currency)}
                  </span>
                </div>

                {order.discountCents > 0 && (
                  <div className='flex justify-between items-center py-1 text-emerald-700'>
                    <span className='flex items-center gap-1.5'>
                      <Tag className='w-3.5 h-3.5' />
                      {t.orders.discount} {order.couponCode ? `(${order.couponCode})` : ''}
                    </span>
                    <span className='font-semibold'>
                      - {formatCurrency(order.discountCents / 100, order.currency)}
                    </span>
                  </div>
                )}

                <div className='border-t border-gray-100 pt-3 flex justify-between items-center text-sm font-extrabold text-gray-900'>
                  <span>{t.orders.totalPaid}</span>
                  <span className='text-base text-primary'>
                    {formatCurrency(order.payableCents / 100, order.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Active Refund Workflow & Policy Section */}
            {order.status === 'PAID' && (
              <div className='bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-4'>
                <div className='flex items-center justify-between flex-wrap gap-2'>
                  <div className='flex items-center gap-2.5'>
                    <ShieldCheck className='w-5 h-5 text-primary' />
                    <h3 className='text-sm font-bold text-gray-900'>
                      {t.orders.refundPolicyTitle}
                    </h3>
                  </div>

                  {isEligibilityLoading && (
                    <span className='inline-flex items-center text-xs text-gray-400 gap-1.5'>
                      <RefreshCw className='w-3 h-3 animate-spin' />
                      {t.orders.checkingEligibility}
                    </span>
                  )}
                </div>

                {/* Case 1: Pending active request */}
                {eligibility?.existingRequestStatus === 'PENDING' && (
                  <div
                    className='p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 space-y-2'
                    data-testid='refund-status-pending-alert'
                  >
                    <div className='flex items-center gap-2'>
                      <Clock className='w-4 h-4 text-amber-600' />
                      <h4 className='text-xs font-bold uppercase tracking-wider text-amber-800'>
                        {t.orders.refundUnderReviewTitle}
                      </h4>
                    </div>
                    <p className='text-xs text-amber-800/90 leading-relaxed'>
                      {t.orders.refundUnderReviewDesc}
                    </p>
                  </div>
                )}

                {/* Case 2: Approved request */}
                {eligibility?.existingRequestStatus === 'APPROVED' && (
                  <div
                    className='p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 space-y-2'
                    data-testid='refund-status-approved-alert'
                  >
                    <div className='flex items-center gap-2'>
                      <CheckCircle2 className='w-4 h-4 text-emerald-600' />
                      <h4 className='text-xs font-bold uppercase tracking-wider text-emerald-800'>
                        {t.orders.refundApprovedTitle}
                      </h4>
                    </div>
                    <p className='text-xs text-emerald-800/90 leading-relaxed'>
                      {t.orders.refundApprovedDesc}
                    </p>
                  </div>
                )}

                {/* Case 3: Rejected request */}
                {eligibility?.existingRequestStatus === 'REJECTED' && (
                  <div
                    className='p-4 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-900 space-y-2'
                    data-testid='refund-status-rejected-alert'
                  >
                    <div className='flex items-center gap-2'>
                      <XCircle className='w-4 h-4 text-rose-600' />
                      <h4 className='text-xs font-bold uppercase tracking-wider text-rose-800'>
                        {t.orders.refundDeclinedTitle}
                      </h4>
                    </div>
                    <p className='text-xs text-rose-800/90 leading-relaxed'>
                      {t.orders.refundDeclinedDesc}
                    </p>
                  </div>
                )}

                {/* Policy description & Eligibility Metrics */}
                <div className='p-4 rounded-2xl bg-gray-50 border border-gray-100 text-xs text-gray-600 space-y-2'>
                  <p className='leading-relaxed'>
                    {t.orders.refundPolicyGuarantee}
                  </p>

                  {eligibility && (
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-gray-200/60 font-medium'>
                      <div className='flex items-center gap-2'>
                        <span className='text-gray-400'>{t.orders.policyWindow}</span>
                        <span className={eligibility.daysRemaining > 0 ? 'text-gray-900 font-semibold' : 'text-rose-600 font-semibold'}>
                          {eligibility.daysRemaining > 0
                            ? t.orders.daysRemaining.replace('{count}', formatNumber(eligibility.daysRemaining))
                            : t.orders.expired}
                        </span>
                      </div>
                      <div className='flex items-center gap-2'>
                        <span className='text-gray-400'>{t.orders.curriculumProgress}</span>
                        <span className={eligibility.courseProgressPercentage < 20 ? 'text-gray-900 font-semibold' : 'text-rose-600 font-semibold'}>
                          {formatNumber(eligibility.courseProgressPercentage)}% ({t.orders.maxProgressLimit})
                        </span>
                      </div>
                    </div>
                  )}

                  {eligibility && !eligibility.isEligible && eligibility.reason && (
                    <p className='text-xs font-semibold text-rose-600 pt-1'>
                      Note: {eligibility.reason}
                    </p>
                  )}
                </div>

                {/* Actions Bar */}
                <div className='pt-2 flex flex-wrap items-center gap-3'>
                  {eligibility?.isEligible && eligibility.existingRequestStatus !== 'PENDING' && eligibility.existingRequestStatus !== 'APPROVED' ? (
                    <Button
                      size='sm'
                      onClick={handleOpenRefundModal}
                      className='rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white'
                      data-testid='request-refund-btn'
                    >
                      <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
                      {eligibility.existingRequestStatus === 'REJECTED' ? t.orders.reapplyRefund : t.orders.requestRefund}
                    </Button>
                  ) : (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled
                      className='rounded-xl text-xs font-semibold opacity-60 cursor-not-allowed'
                      data-testid='request-refund-disabled-btn'
                    >
                      {eligibility?.existingRequestStatus === 'PENDING'
                        ? t.orders.requestPendingReview
                        : eligibility?.existingRequestStatus === 'APPROVED'
                        ? t.orders.refundApprovedTitle
                        : t.orders.refundIneligible}
                    </Button>
                  )}

                  <Link href='/contact'>
                    <Button variant='ghost' size='sm' className='text-xs text-gray-600 hover:text-gray-900'>
                      {t.orders.contactSupport}
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Refund Request Submission Modal */}
      <Dialog open={isRefundModalOpen} onOpenChange={setIsRefundModalOpen}>
        <DialogContent className='sm:max-w-lg rounded-3xl p-6 sm:p-8'>
          <DialogHeader>
            <DialogTitle className='text-lg font-bold text-gray-900'>
              {t.orders.requestCourseRefund}
            </DialogTitle>
            <DialogDescription className='text-xs text-gray-500 mt-1'>
              {t.orders.refundModalDesc}
            </DialogDescription>
          </DialogHeader>

          {refundSubmitSuccess ? (
            <div className='py-6 text-center space-y-3' data-testid='refund-submit-success-view'>
              <div className='w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto'>
                <CheckCircle2 className='w-6 h-6' />
              </div>
              <h4 className='text-sm font-bold text-gray-900'>{t.orders.refundSubmittedTitle}</h4>
              <p className='text-xs text-gray-500 max-w-sm mx-auto'>
                {t.orders.refundSubmittedDesc}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitRefund} className='space-y-4 pt-2'>
              {refundSubmitError && (
                <div
                  className='p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2'
                  data-testid='refund-submit-error-alert'
                >
                  <AlertCircle className='w-4 h-4 shrink-0 mt-0.5' />
                  <span>{refundSubmitError}</span>
                </div>
              )}

              {/* Reason Category Selector */}
              <div className='space-y-1.5'>
                <label className='text-xs font-bold text-gray-700'>
                  {t.orders.reasonCategory} <span className='text-rose-500'>*</span>
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as RefundRequestReasonCategory)}
                  className='w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary'
                  data-testid='refund-reason-category-select'
                >
                  {REASON_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason Detail Textarea */}
              <div className='space-y-1.5'>
                <div className='flex justify-between items-center'>
                  <label className='text-xs font-bold text-gray-700'>
                    {t.orders.explanationDetails} <span className='text-rose-500'>*</span>
                  </label>
                  <span className='text-[10px] text-gray-400'>
                    {formatNumber(reasonDetail.length)}/1000 ({t.orders.minChars})
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder={t.orders.explanationPlaceholder}
                  className='w-full rounded-xl border border-gray-300 p-3 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary'
                  data-testid='refund-reason-detail-textarea'
                  maxLength={1000}
                />
              </div>

              {/* Policy Warning */}
              <div className='p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-800 leading-relaxed'>
                <p>
                  {t.orders.refundImportantNotice}
                </p>
              </div>

              <DialogFooter className='pt-2 flex gap-2 sm:justify-end'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setIsRefundModalOpen(false)}
                  disabled={isSubmittingRefund}
                  className='rounded-xl text-xs font-semibold'
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type='submit'
                  size='sm'
                  disabled={isSubmittingRefund || reasonDetail.trim().length < 10}
                  className='rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white'
                  data-testid='submit-refund-request-btn'
                >
                  {isSubmittingRefund ? (
                    <>
                      <RefreshCw className='w-3.5 h-3.5 mr-1.5 animate-spin' />
                      {t.orders.submitting}
                    </>
                  ) : (
                    <>
                      <Send className='w-3.5 h-3.5 mr-1.5' />
                      {t.orders.submitRequest}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
