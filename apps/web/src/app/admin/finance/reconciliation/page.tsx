'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminRefunds,
  queryRefundStatus,
  reconcileRefund,
  initiateRefund,
  scanReconciliation,
} from '@/lib/api/finance';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { FinanceSubNav } from '@/components/admin/FinanceSubNav';
import { useTranslation } from '@/i18n/client';
import { formatCurrency, formatDate, formatNumber } from '@/i18n/format';
import Link from 'next/link';
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Link2,
  Loader2,
  ShieldAlert,
  X,
  Play,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type {
  RefundDto,
  RefundStatus,
  ReconciliationResultDto,
  ReconciliationDiscrepancyDto,
} from '@techsprout/contracts';

export default function AdminReconciliationPage() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'refunds' | 'scanner'>('refunds');

  // Refunds state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [refundStatusFilter, setRefundStatusFilter] = useState<RefundStatus | ''>('');

  // Action modals
  const [linkRefTarget, setLinkRefTarget] = useState<RefundDto | null>(null);
  const [providerRefInput, setProviderRefInput] = useState('');
  const [markFailedTarget, setMarkFailedTarget] = useState<RefundDto | null>(null);
  const [failReasonInput, setFailReasonInput] = useState('');

  // Scanner state
  const [isDryRun, setIsDryRun] = useState(false);
  const [scanResult, setScanResult] = useState<ReconciliationResultDto | null>(null);

  // Feedback states
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // 1. Fetch Admin Refunds
  const {
    data: refundsData,
    isLoading: isLoadingRefunds,
    isError: isRefundsError,
    error: refundsError,
    refetch: refetchRefunds,
  } = useQuery({
    queryKey: ['admin', 'refunds', { page, limit, status: refundStatusFilter || undefined }],
    queryFn: () =>
      fetchAdminRefunds({
        page,
        limit,
        status: (refundStatusFilter as RefundStatus) || undefined,
      }),
    enabled: isAdmin && activeTab === 'refunds',
  });

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'refunds'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
  };

  // Query Refund Status Mutation
  const queryStatusMutation = useMutation({
    mutationFn: (refundId: string) => queryRefundStatus(refundId),
    onSuccess: (data) => {
      setFeedbackSuccess(
        `${data.refundNumber}: ${data.status}`
      );
      invalidateData();
      setTimeout(() => setFeedbackSuccess(null), 5000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFeedbackError(resp?.message || err?.message || 'Failed to query provider refund status.');
      setTimeout(() => setFeedbackError(null), 5000);
    },
  });

  // Reconcile: Link Reference Mutation
  const linkRefMutation = useMutation({
    mutationFn: ({ refundId, ref }: { refundId: string; ref: string }) =>
      reconcileRefund(refundId, {
        action: 'LINK_PROVIDER_REFERENCE',
        providerRefundRef: ref.trim(),
      }),
    onSuccess: (data) => {
      setLinkRefTarget(null);
      setProviderRefInput('');
      setFeedbackSuccess(`${data.refundNumber}`);
      invalidateData();
      setTimeout(() => setFeedbackSuccess(null), 5000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFeedbackError(resp?.message || err?.message || 'Failed to link provider reference.');
    },
  });

  // Reconcile: Mark Failed Mutation
  const markFailedMutation = useMutation({
    mutationFn: ({ refundId, reason }: { refundId: string; reason: string }) =>
      reconcileRefund(refundId, {
        action: 'MARK_FAILED',
        reason: reason.trim(),
      }),
    onSuccess: (data) => {
      setMarkFailedTarget(null);
      setFailReasonInput('');
      setFeedbackSuccess(`${data.refundNumber}`);
      invalidateData();
      setTimeout(() => setFeedbackSuccess(null), 5000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFeedbackError(resp?.message || err?.message || 'Failed to mark refund as failed.');
    },
  });

  // Retry Refund Mutation
  const retryRefundMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      initiateRefund(orderId, reason),
    onSuccess: (data) => {
      setFeedbackSuccess(`${data.refundNumber}: ${data.status}`);
      invalidateData();
      setTimeout(() => setFeedbackSuccess(null), 5000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFeedbackError(resp?.message || err?.message || 'Refund retry failed.');
      setTimeout(() => setFeedbackError(null), 5000);
    },
  });

  // Discrepancy Scanner Mutation
  const scanMutation = useMutation({
    mutationFn: (dryRun: boolean) => scanReconciliation({ dryRun, limit: 100 }),
    onSuccess: (data) => {
      setScanResult(data);
      setFeedbackSuccess(
        `${t.admin.reconciliation.scanResults}: ${data.totalOrdersScanned}`
      );
      if (!isDryRun) {
        invalidateData();
      }
      setTimeout(() => setFeedbackSuccess(null), 6000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFeedbackError(resp?.message || err?.message || 'Failed to execute reconciliation scan.');
      setTimeout(() => setFeedbackError(null), 5000);
    },
  });

  // Guard non-admin users
  if (!isLoadingUser && !isAdmin) {
    return (
      <div className='max-w-2xl mx-auto p-8 bg-red-50 border border-red-200 text-red-800 rounded-2xl shadow-xs text-center'>
        <ShieldAlert className='w-12 h-12 text-red-600 mx-auto mb-3' />
        <h2 className='text-xl font-bold mb-1'>{t.admin.reconciliation.accessDeniedTitle}</h2>
        <p className='text-xs text-gray-600 mb-4'>
          {t.admin.reconciliation.accessDeniedDesc}
        </p>
        <Link
          href='/dashboard'
          className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
        >
          {t.admin.reconciliation.returnToDashboard}
        </Link>
      </div>
    );
  }

  const refundItems = refundsData?.items || [];
  const pagination = refundsData?.pagination;

  return (
    <div className='space-y-6'>
      {/* Top Banner */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
            {t.admin.reconciliation.title}
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            {t.admin.reconciliation.subtitle}
          </p>
        </div>
      </div>

      {/* Sub Navigation */}
      <FinanceSubNav />

      {/* Feedback Banners */}
      {feedbackSuccess && (
        <div className='p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-sm animate-in fade-in'>
          <div className='flex items-center space-x-2'>
            <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            onClick={() => setFeedbackSuccess(null)}
            className='text-xs font-semibold hover:underline'
          >
            ×
          </button>
        </div>
      )}

      {feedbackError && (
        <div className='p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between text-sm animate-in fade-in'>
          <div className='flex items-center space-x-2'>
            <AlertCircle className='w-4 h-4 text-red-500 shrink-0' />
            <span>{feedbackError}</span>
          </div>
          <button
            onClick={() => setFeedbackError(null)}
            className='text-xs font-semibold hover:underline'
          >
            ×
          </button>
        </div>
      )}

      {/* Section Tabs */}
      <div className='flex items-center space-x-2 border-b border-gray-200 pb-2'>
        <button
          onClick={() => setActiveTab('refunds')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
            activeTab === 'refunds'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t.admin.reconciliation.tabRefunds}
        </button>
        <button
          onClick={() => setActiveTab('scanner')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
            activeTab === 'scanner'
              ? 'bg-primary text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t.admin.reconciliation.tabScanner}
        </button>
      </div>

      {/* TAB 1: REFUND OPERATIONS */}
      {activeTab === 'refunds' && (
        <div className='space-y-4'>
          {/* Filter Bar */}
          <div className='bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
            <div className='flex items-center space-x-2'>
              <span className='text-xs font-semibold text-gray-500'>{t.admin.reconciliation.filterStatus}</span>
              <button
                onClick={() => {
                  setRefundStatusFilter('');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  refundStatusFilter === ''
                    ? 'bg-primary text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.admin.reconciliation.filterAll}
              </button>
              <button
                onClick={() => {
                  setRefundStatusFilter('PENDING');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  refundStatusFilter === 'PENDING'
                    ? 'bg-amber-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.admin.reconciliation.filterPending}
              </button>
              <button
                onClick={() => {
                  setRefundStatusFilter('PROCESSED');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  refundStatusFilter === 'PROCESSED'
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.admin.reconciliation.filterProcessed}
              </button>
              <button
                onClick={() => {
                  setRefundStatusFilter('FAILED');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  refundStatusFilter === 'FAILED'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.admin.reconciliation.filterFailed}
              </button>
            </div>
          </div>

          {/* Refunds Table */}
          <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
            {isLoadingRefunds ? (
              <div className='p-16 text-center'>
                <Loader2 className='w-8 h-8 text-amber-600 animate-spin mx-auto mb-3' />
                <p className='text-sm text-gray-500'>{t.admin.reconciliation.loadingRefunds}</p>
              </div>
            ) : isRefundsError ? (
              <div className='p-12 text-center max-w-md mx-auto'>
                <AlertCircle className='w-10 h-10 text-red-500 mx-auto mb-3' />
                <h3 className='text-base font-semibold text-gray-900 mb-1'>{t.admin.reconciliation.errorTitle}</h3>
                <p className='text-xs text-gray-500 mb-4'>
                  {(refundsError as any)?.response?.data?.message || 'Network error fetching refunds.'}
                </p>
                <button
                  onClick={() => refetchRefunds()}
                  className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
                >
                  {t.admin.reconciliation.retry}
                </button>
              </div>
            ) : refundItems.length === 0 ? (
              <div className='p-16 text-center max-w-md mx-auto'>
                <div className='w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400'>
                  <RotateCcw className='w-6 h-6' />
                </div>
                <h3 className='text-base font-semibold text-gray-900 mb-1'>{t.admin.reconciliation.noRefunds}</h3>
                <p className='text-xs text-gray-500 mb-4'>
                  {refundStatusFilter
                    ? t.admin.reconciliation.noRefundsFiltered.replace('{status}', refundStatusFilter)
                    : t.admin.reconciliation.noRefundsEmpty}
                </p>
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full text-left text-sm text-gray-600'>
                  <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
                    <tr>
                      <th scope='col' className='px-4 py-3.5'>{t.admin.reconciliation.thRefund}</th>
                      <th scope='col' className='px-4 py-3.5'>{t.admin.reconciliation.thAmount}</th>
                      <th scope='col' className='px-4 py-3.5'>{t.admin.reconciliation.thStatusLifecycle}</th>
                      <th scope='col' className='px-4 py-3.5'>{t.admin.reconciliation.thGatewayRef}</th>
                      <th scope='col' className='px-4 py-3.5'>{t.admin.reconciliation.thReason}</th>
                      <th scope='col' className='px-4 py-3.5'>{t.admin.reconciliation.thCreatedAt}</th>
                      <th scope='col' className='px-4 py-3.5 text-right'>{t.admin.reconciliation.thActions}</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-100'>
                    {refundItems.map((ref: RefundDto) => {
                      const isPendingWithRef = ref.status === 'PENDING' && Boolean(ref.providerRefundRef);
                      const isPendingNoRef = ref.status === 'PENDING' && !ref.providerRefundRef;
                      const isFailed = ref.status === 'FAILED';
                      const isProcessed = ref.status === 'PROCESSED';

                      return (
                        <tr key={ref.id} className='hover:bg-gray-50/60 transition-colors'>
                          <td className='px-4 py-3.5 whitespace-nowrap font-mono text-xs font-semibold text-gray-900'>
                            {ref.refundNumber}
                          </td>

                          <td className='px-4 py-3.5 whitespace-nowrap font-bold text-gray-900'>
                            {formatCurrency((ref.amountCents || 0) / 100, locale)}
                          </td>

                          <td className='px-4 py-3.5 whitespace-nowrap'>
                            {isProcessed && (
                              <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                                <CheckCircle2 className='w-3 h-3 mr-1 text-emerald-500' />
                                {t.admin.reconciliation.statusProcessed}
                              </span>
                            )}
                            {isFailed && (
                              <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200'>
                                <XCircle className='w-3 h-3 mr-1 text-red-500' />
                                {t.admin.reconciliation.statusFailed}
                              </span>
                            )}
                            {isPendingWithRef && (
                              <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200'>
                                <Clock className='w-3 h-3 mr-1 text-blue-500' />
                                {t.admin.reconciliation.statusAwaitingSettlement}
                              </span>
                            )}
                            {isPendingNoRef && (
                              <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300'>
                                <AlertTriangle className='w-3 h-3 mr-1 text-amber-600' />
                                {t.admin.reconciliation.statusManualReview}
                              </span>
                            )}
                          </td>

                          <td className='px-4 py-3.5 whitespace-nowrap font-mono text-xs text-gray-700'>
                            {ref.providerRefundRef || (
                              <span className='text-amber-600 italic font-sans font-medium text-[11px]'>
                                {t.admin.reconciliation.missingRef}
                              </span>
                            )}
                          </td>

                          <td className='px-4 py-3.5 max-w-xs truncate text-xs text-gray-600'>
                            {ref.reason}
                          </td>

                          <td className='px-4 py-3.5 whitespace-nowrap text-xs text-gray-500'>
                            {formatDate(ref.createdAt, locale)}
                          </td>

                          <td className='px-4 py-3.5 text-right whitespace-nowrap'>
                            <div className='flex items-center justify-end space-x-1.5'>
                              {/* PENDING with Provider Ref -> Check Status */}
                              {isPendingWithRef && (
                                <button
                                  onClick={() => queryStatusMutation.mutate(ref.id)}
                                  disabled={queryStatusMutation.isPending}
                                  className='inline-flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50'
                                  title={t.admin.reconciliation.checkStatus}
                                >
                                  {queryStatusMutation.isPending ? (
                                    <Loader2 className='w-3 h-3 animate-spin' />
                                  ) : (
                                    <RefreshCw className='w-3 h-3' />
                                  )}
                                  <span>{t.admin.reconciliation.checkStatus}</span>
                                </button>
                              )}

                              {/* PENDING without Provider Ref -> Manual Review Options */}
                              {isPendingNoRef && (
                                <div className='flex items-center space-x-1.5'>
                                  <button
                                    onClick={() => {
                                      setLinkRefTarget(ref);
                                      setProviderRefInput('');
                                    }}
                                    className='px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition'
                                    title={t.admin.reconciliation.linkRef}
                                  >
                                    <Link2 className='w-3 h-3 mr-1 inline' />
                                    {t.admin.reconciliation.linkRef}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setMarkFailedTarget(ref);
                                      setFailReasonInput('');
                                    }}
                                    className='px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition'
                                    title={t.admin.reconciliation.markFailed}
                                  >
                                    {t.admin.reconciliation.markFailed}
                                  </button>
                                </div>
                              )}

                              {/* FAILED -> Retry Refund */}
                              {isFailed && (
                                <button
                                  onClick={() =>
                                    retryRefundMutation.mutate({
                                      orderId: ref.orderId,
                                      reason: `Retry of failed refund ${ref.refundNumber}: ${ref.reason}`,
                                    })
                                  }
                                  disabled={retryRefundMutation.isPending}
                                  className='inline-flex items-center space-x-1 px-3 py-1.5 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-lg transition disabled:opacity-50'
                                  title={t.admin.reconciliation.retryRefund}
                                >
                                  <RotateCcw className='w-3 h-3' />
                                  <span>{t.admin.reconciliation.retryRefund}</span>
                                </button>
                              )}

                              {/* PROCESSED -> Terminal */}
                              {isProcessed && (
                                <span className='text-xs text-gray-400 italic px-2'>
                                  {t.admin.reconciliation.settled}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className='p-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600'>
                <div>
                  {t.admin.reconciliation.pagination
                    .replace('{page}', formatNumber(pagination.page, locale))
                    .replace('{totalPages}', formatNumber(pagination.totalPages, locale))}
                </div>
                <div className='flex items-center space-x-2'>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!pagination.hasPreviousPage}
                    className='px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 transition'
                  >
                    {t.admin.reconciliation.prev}
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!pagination.hasNextPage}
                    className='px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 transition'
                  >
                    {t.admin.reconciliation.next}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DISCREPANCY SCANNER */}
      {activeTab === 'scanner' && (
        <div className='space-y-6'>
          {/* Controls */}
          <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
            <div className='space-y-1'>
              <h3 className='text-sm font-bold text-gray-900'>{t.admin.reconciliation.scanner.title}</h3>
              <p className='text-xs text-gray-500'>
                {t.admin.reconciliation.scanner.desc}
              </p>
            </div>

            <div className='flex items-center space-x-4'>
              <label className='flex items-center space-x-2 text-xs font-semibold text-gray-700 cursor-pointer'>
                <input
                  type='checkbox'
                  checked={isDryRun}
                  onChange={(e) => setIsDryRun(e.target.checked)}
                  className='w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary'
                />
                <span>{t.admin.reconciliation.scanner.dryRun}</span>
              </label>

              <button
                onClick={() => scanMutation.mutate(isDryRun)}
                disabled={scanMutation.isPending}
                className='inline-flex items-center space-x-2 px-5 py-2.5 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs disabled:opacity-50'
              >
                {scanMutation.isPending ? (
                  <>
                    <Loader2 className='w-4 h-4 animate-spin' />
                    <span>{t.admin.reconciliation.scanner.scanning}</span>
                  </>
                ) : (
                  <>
                    <Play className='w-4 h-4' />
                    <span>{t.admin.reconciliation.scanner.runScan}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scan Results Display */}
          {scanResult && (
            <div className='space-y-4'>
              {/* Summary Cards */}
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs'>
                  <span className='text-xs font-semibold text-gray-500 uppercase'>{t.admin.reconciliation.scanner.ordersScanned}</span>
                  <div className='text-2xl font-bold text-gray-900 mt-1'>
                    {formatNumber(scanResult.totalOrdersScanned, locale)}
                  </div>
                </div>

                <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs'>
                  <span className='text-xs font-semibold text-gray-500 uppercase'>{t.admin.reconciliation.scanner.discrepanciesDetected}</span>
                  <div className='text-2xl font-bold text-amber-600 mt-1'>
                    {formatNumber(scanResult.discrepanciesFoundCount, locale)}
                  </div>
                </div>

                <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs'>
                  <span className='text-xs font-semibold text-gray-500 uppercase'>{t.admin.reconciliation.scanner.autoResolved}</span>
                  <div className='text-2xl font-bold text-emerald-600 mt-1'>
                    {formatNumber(scanResult.autoResolvedCount, locale)}
                  </div>
                </div>
              </div>

              {/* Discrepancy List */}
              <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
                <div className='p-4 border-b border-gray-100 flex items-center justify-between'>
                  <h4 className='text-sm font-bold text-gray-900'>{t.admin.reconciliation.scanner.discrepanciesTitle}</h4>
                  <span className='text-xs text-gray-500'>
                    {t.admin.reconciliation.scanner.executedAt.replace('{time}', formatDate(scanResult.executedAt, locale, { timeStyle: 'medium' }))}
                  </span>
                </div>

                {scanResult.discrepancies.length === 0 ? (
                  <div className='p-12 text-center text-xs text-gray-500'>
                    <CheckCircle2 className='w-8 h-8 text-emerald-500 mx-auto mb-2' />
                    {t.admin.reconciliation.scanner.zeroDiscrepancies}
                  </div>
                ) : (
                  <div className='overflow-x-auto'>
                    <table className='w-full text-left text-sm text-gray-600'>
                      <thead className='bg-gray-50 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
                        <tr>
                          <th scope='col' className='px-4 py-3'>{t.admin.reconciliation.scanner.thOrder}</th>
                          <th scope='col' className='px-4 py-3'>{t.admin.reconciliation.scanner.thType}</th>
                          <th scope='col' className='px-4 py-3'>{t.admin.reconciliation.scanner.thDescription}</th>
                          <th scope='col' className='px-4 py-3'>{t.admin.reconciliation.scanner.thPolicy}</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-gray-100'>
                        {scanResult.discrepancies.map((disc: ReconciliationDiscrepancyDto) => (
                          <tr key={disc.id} className='hover:bg-gray-50/60'>
                            <td className='px-4 py-3 font-mono text-xs font-semibold text-gray-900'>
                              {disc.orderNumber}
                            </td>
                            <td className='px-4 py-3'>
                              <span className='font-mono text-xs font-bold text-gray-800'>
                                {disc.discrepancyType}
                              </span>
                            </td>
                            <td className='px-4 py-3 text-xs text-gray-600 max-w-sm'>
                              {disc.description}
                            </td>
                            <td className='px-4 py-3'>
                              {disc.autoResolvable ? (
                                <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                                  {t.admin.reconciliation.scanner.safeAutoResolve}
                                </span>
                              ) : (
                                <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200'>
                                  {t.admin.reconciliation.scanner.manualReviewRequired}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Link Provider Reference */}
      {linkRefTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4'>
          <div className='bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4 animate-in fade-in zoom-in-95'>
            <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
              <h3 className='text-base font-bold text-gray-900'>{t.admin.reconciliation.linkModalTitle}</h3>
              <button
                onClick={() => setLinkRefTarget(null)}
                className='text-gray-400 hover:text-gray-600 p-1 rounded-lg'
                aria-label={t.admin.reconciliation.linkModal.cancel}
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            <p className='text-xs text-gray-600'>
              {t.admin.reconciliation.linkModalDesc}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!providerRefInput.trim()) return;
                linkRefMutation.mutate({
                  refundId: linkRefTarget.id,
                  ref: providerRefInput.trim(),
                });
              }}
              className='space-y-4'
            >
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  {t.admin.reconciliation.refInputLabel} <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  required
                  value={providerRefInput}
                  onChange={(e) => setProviderRefInput(e.target.value)}
                  placeholder='e.g. SSL-REF-99887766'
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500'
                />
              </div>

              <div className='flex items-center justify-end space-x-2 pt-2 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setLinkRefTarget(null)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  {t.admin.reconciliation.linkModal.cancel}
                </button>
                <button
                  type='submit'
                  disabled={linkRefMutation.isPending || !providerRefInput.trim()}
                  className='px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50'
                >
                  {linkRefMutation.isPending ? t.admin.reconciliation.linkModal.saving : t.admin.reconciliation.confirmLink}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Mark Failed */}
      {markFailedTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4'>
          <div className='bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4 animate-in fade-in zoom-in-95'>
            <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
              <h3 className='text-base font-bold text-gray-900'>{t.admin.reconciliation.failModalTitle}</h3>
              <button
                onClick={() => setMarkFailedTarget(null)}
                className='text-gray-400 hover:text-gray-600 p-1 rounded-lg'
                aria-label={t.admin.reconciliation.failModal.cancel}
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            <p className='text-xs text-gray-600'>
              {t.admin.reconciliation.failModalDesc}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!failReasonInput.trim() || failReasonInput.trim().length < 5) return;
                markFailedMutation.mutate({
                  refundId: markFailedTarget.id,
                  reason: failReasonInput.trim(),
                });
              }}
              className='space-y-4'
            >
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  {t.admin.reconciliation.failReasonLabel} <span className='text-red-500'>*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={failReasonInput}
                  onChange={(e) => setFailReasonInput(e.target.value)}
                  placeholder='Specify why this refund operation is considered failed (minimum 5 characters)...'
                  className='w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500'
                />
              </div>

              <div className='flex items-center justify-end space-x-2 pt-2 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setMarkFailedTarget(null)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  {t.admin.reconciliation.failModal.cancel}
                </button>
                <button
                  type='submit'
                  disabled={markFailedMutation.isPending || failReasonInput.trim().length < 5}
                  className='px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50'
                >
                  {markFailedMutation.isPending ? t.admin.reconciliation.failModal.submitting : t.admin.reconciliation.confirmFail}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
