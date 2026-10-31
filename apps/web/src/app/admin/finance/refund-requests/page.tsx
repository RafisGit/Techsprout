'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminRefundRequests,
  fetchAdminRefundRequestById,
  approveRefundRequest,
  rejectRefundRequest,
  executeAdminRefundRequest,
  processApprovedRefundRequests,
} from '@/lib/api/finance';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { FinanceSubNav } from '@/components/admin/FinanceSubNav';
import { useTranslation } from '@/i18n/client';
import { formatCurrency, formatDate, formatNumber } from '@/i18n/format';
import Link from 'next/link';
import {
  ClipboardCheck,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  FileText,
  User,
  GraduationCap,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import type {
  RefundRequestListItemDto,
  RefundRequestDto,
  RefundRequestStatus,
  RefundRequestReasonCategory,
} from '@techsprout/contracts';

export default function AdminRefundRequestsPage() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Filters & Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [statusFilter, setStatusFilter] = useState<RefundRequestStatus | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Request for Detail Modal
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Approval Modal State
  const [isApproving, setIsApproving] = useState(false);
  const [approveAdminNotes, setApproveAdminNotes] = useState('');

  // Rejection Modal State
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectAdminNotes, setRejectAdminNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // 1. Fetch Refund Requests List
  const {
    data: requestsData,
    isLoading: isLoadingRequests,
    isError: isRequestsError,
    error: requestsError,
    refetch: refetchRequests,
  } = useQuery({
    queryKey: [
      'admin',
      'refund-requests',
      {
        page,
        limit,
        status: statusFilter || undefined,
        search: searchTerm.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      },
    ],
    queryFn: () =>
      fetchAdminRefundRequests({
        page,
        limit,
        status: (statusFilter as RefundRequestStatus) || undefined,
        search: searchTerm.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      }),
    enabled: isAdmin,
  });

  // 2. Fetch Selected Refund Request Detail
  const {
    data: requestDetail,
    isLoading: isLoadingDetail,
  } = useQuery({
    queryKey: ['admin', 'refund-request', selectedRequestId],
    queryFn: () => fetchAdminRefundRequestById(selectedRequestId!),
    enabled: Boolean(isAdmin && selectedRequestId),
  });

  // 3. Approve Mutation
  const approveMutation = useMutation({
    mutationFn: (variables: { id: string; adminNotes?: string }) =>
      approveRefundRequest(variables.id, { adminNotes: variables.adminNotes }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'refund-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'refund-request', data.id] });
      setIsApproving(false);
      setApproveAdminNotes('');
      setActionError(null);
      setActionSuccessMessage(
        `${t.admin.refundRequests.statusApproved}: ${data.requestNumber}`
      );
    },
    onError: (err: any) => {
      setActionError(
        err?.response?.data?.message || 'Failed to approve refund request. Please try again.'
      );
    },
  });

  // 4. Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: (variables: { id: string; rejectionReason: string; adminNotes?: string }) =>
      rejectRefundRequest(variables.id, {
        rejectionReason: variables.rejectionReason,
        adminNotes: variables.adminNotes,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'refund-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'refund-request', data.id] });
      setIsRejecting(false);
      setRejectionReason('');
      setRejectAdminNotes('');
      setActionError(null);
      setActionSuccessMessage(`${t.admin.refundRequests.statusRejected}: ${data.requestNumber}`);
    },
    onError: (err: any) => {
      setActionError(
        err?.response?.data?.message || 'Failed to reject refund request. Please try again.'
      );
    },
  });

  // 5. Execute Approved Refund Mutation
  const executeMutation = useMutation({
    mutationFn: (requestId: string) => executeAdminRefundRequest(requestId),
    onSuccess: (refund) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'refund-requests'] });
      if (selectedRequestId) {
        queryClient.invalidateQueries({ queryKey: ['admin', 'refund-request', selectedRequestId] });
      }
      setActionError(null);
      setActionSuccessMessage(
        `${refund.refundNumber}: ${refund.status}`
      );
    },
    onError: (err: any) => {
      setActionError(
        err?.response?.data?.message || 'Failed to execute refund operation. Please check gateway logs.'
      );
    },
  });

  // 6. Batch Process Approved Refunds Mutation
  const batchProcessMutation = useMutation({
    mutationFn: () => processApprovedRefundRequests(50),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'refund-requests'] });
      setActionError(null);
      setActionSuccessMessage(
        `Discovered ${res.discovered}; processed ${res.processed}.`
      );
    },
    onError: (err: any) => {
      setActionError(
        err?.response?.data?.message || 'Failed to process approved requests queue.'
      );
    },
  });

  if (isLoadingUser) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <Loader2 className='w-8 h-8 animate-spin text-primary' />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className='max-w-4xl mx-auto px-4 py-16 text-center'>
        <div className='inline-flex p-4 rounded-full bg-red-100 text-red-600 mb-4'>
          <ShieldAlert className='w-12 h-12' />
        </div>
        <h1 className='text-2xl font-bold text-gray-900 mb-2'>{t.admin.refundRequests.accessDeniedTitle}</h1>
        <p className='text-gray-600 mb-6'>
          {t.admin.refundRequests.accessDeniedDesc}
        </p>
        <Link
          href='/'
          className='inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-xl shadow-xs text-sm font-medium text-white bg-primary hover:bg-primary-hover transition'
        >
          {t.admin.refundRequests.returnPlatform}
        </Link>
      </div>
    );
  }

  const items = requestsData?.items || [];
  const pagination = requestsData?.pagination;
  const reasonCategoryLabels = t.admin.refundRequests.reasons;

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-center justify-between pb-6 gap-4'>
        <div>
          <div className='flex items-center space-x-3'>
            <div className='p-2.5 bg-primary/10 text-primary rounded-xl'>
              <ClipboardCheck className='w-6 h-6' />
            </div>
            <div>
              <h1 className='text-2xl font-bold text-gray-900'>{t.admin.refundRequests.title}</h1>
              <p className='text-sm text-gray-500'>
                {t.admin.refundRequests.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div>
          <button
            onClick={() => batchProcessMutation.mutate()}
            disabled={batchProcessMutation.isPending}
            className='inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 transition shadow-xs disabled:opacity-50'
          >
            {batchProcessMutation.isPending ? (
              <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
            ) : (
              <CheckCircle2 className='w-4 h-4 mr-1.5' />
            )}
            <span>{t.admin.refundRequests.processQueue}</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <FinanceSubNav />

      {/* Action Notification Banner */}
      {actionSuccessMessage && (
        <div className='mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between'>
          <div className='flex items-center space-x-3 text-emerald-800'>
            <CheckCircle2 className='w-5 h-5 text-emerald-600 shrink-0' />
            <p className='text-sm font-medium'>{actionSuccessMessage}</p>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className='text-emerald-600 hover:text-emerald-800 p-1'
          >
            <X className='w-4 h-4' />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className='bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs mb-6 space-y-4'>
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          {/* Search Input */}
          <div className='relative md:col-span-2'>
            <Search className='w-4 h-4 text-gray-400 absolute left-3.5 top-3' />
            <input
              type='text'
              placeholder={t.admin.refundRequests.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className='w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition'
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as RefundRequestStatus | '');
                setPage(1);
              }}
              className='w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-white'
            >
              <option value=''>{t.admin.refundRequests.allStatuses}</option>
              <option value='PENDING'>{t.admin.refundRequests.filterPending}</option>
              <option value='APPROVED'>{t.admin.refundRequests.filterApproved}</option>
              <option value='REJECTED'>{t.admin.refundRequests.filterRejected}</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className='flex items-center gap-2'>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className='w-full inline-flex items-center justify-center px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition'
            >
              <RotateCcw className='w-4 h-4 mr-1.5' />
              {t.admin.refundRequests.resetFilters}
            </button>
          </div>
        </div>

        {/* Date Filters */}
        <div className='flex flex-wrap items-center gap-4 pt-2 border-t border-gray-100 text-xs text-gray-600'>
          <span className='font-medium flex items-center text-gray-500'>
            <Filter className='w-3.5 h-3.5 mr-1' /> {t.admin.refundRequests.dateFilter}
          </span>
          <div className='flex items-center space-x-2'>
            <span>{t.admin.refundRequests.from}</span>
            <input
              type='date'
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className='px-2.5 py-1 border border-gray-200 rounded-lg text-xs'
            />
          </div>
          <div className='flex items-center space-x-2'>
            <span>{t.admin.refundRequests.to}</span>
            <input
              type='date'
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className='px-2.5 py-1 border border-gray-200 rounded-lg text-xs'
            />
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        {isLoadingRequests ? (
          <div className='py-20 text-center'>
            <Loader2 className='w-8 h-8 animate-spin text-primary mx-auto mb-3' />
            <p className='text-sm text-gray-500'>{t.admin.refundRequests.loading}</p>
          </div>
        ) : isRequestsError ? (
          <div className='py-16 text-center px-4'>
            <AlertTriangle className='w-10 h-10 text-red-500 mx-auto mb-3' />
            <h3 className='text-base font-semibold text-gray-900 mb-1'>{t.admin.refundRequests.errorTitle}</h3>
            <p className='text-sm text-gray-500 max-w-sm mx-auto mb-4'>
              {(requestsError as any)?.response?.data?.message || 'A network error occurred.'}
            </p>
            <button
              onClick={() => refetchRequests()}
              className='inline-flex items-center px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50'
            >
              {t.admin.refundRequests.retry}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className='py-20 text-center px-4'>
            <ClipboardCheck className='w-12 h-12 text-gray-300 mx-auto mb-3' />
            <h3 className='text-base font-semibold text-gray-900 mb-1'>{t.admin.refundRequests.noRequests}</h3>
            <p className='text-sm text-gray-500 max-w-sm mx-auto'>
              {statusFilter || searchTerm || startDate || endDate
                ? t.admin.refundRequests.noRequestsFiltered
                : t.admin.refundRequests.noRequestsEmpty}
            </p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm text-gray-600'>
              <thead className='bg-gray-50 text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200'>
                <tr>
                  <th className='py-3.5 px-4'>{t.admin.refundRequests.thRequest}</th>
                  <th className='py-3.5 px-4'>{t.admin.refundRequests.thStudent}</th>
                  <th className='py-3.5 px-4'>{t.admin.refundRequests.thCourse}</th>
                  <th className='py-3.5 px-4'>{t.admin.refundRequests.thOrderAmount}</th>
                  <th className='py-3.5 px-4'>{t.admin.refundRequests.thProgress}</th>
                  <th className='py-3.5 px-4'>{t.admin.refundRequests.thSubmitted}</th>
                  <th className='py-3.5 px-4'>{t.admin.refundRequests.thStatus}</th>
                  <th className='py-3.5 px-4 text-right'>{t.admin.refundRequests.thActions}</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {items.map((req) => (
                  <tr key={req.id} className='hover:bg-gray-50/80 transition-colors'>
                    <td className='py-4 px-4 font-mono text-xs font-medium text-gray-900'>
                      {req.requestNumber}
                    </td>
                    <td className='py-4 px-4'>
                      <div className='font-medium text-gray-900'>{req.studentName}</div>
                      <div className='text-xs text-gray-500'>{req.studentEmail}</div>
                    </td>
                    <td className='py-4 px-4'>
                      <div className='font-medium text-gray-900 truncate max-w-[200px]'>
                        {req.courseTitle}
                      </div>
                      <div className='text-xs text-gray-500'>
                        {(reasonCategoryLabels as any)[req.reasonCategory] || req.reasonCategory}
                      </div>
                    </td>
                    <td className='py-4 px-4'>
                      <div className='font-semibold text-gray-900'>
                        {formatCurrency((req.payableCents || 0) / 100, locale)}
                      </div>
                      <div className='font-mono text-xs text-gray-500'>{req.orderNumber}</div>
                    </td>
                    <td className='py-4 px-4'>
                      <span className='inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200'>
                        {formatNumber(req.courseProgressAtRequest, locale)}%
                      </span>
                    </td>
                    <td className='py-4 px-4 text-xs text-gray-500'>
                      {formatDate(req.createdAt, locale, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className='py-4 px-4'>
                      {req.status === 'PENDING' && (
                        <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200'>
                          <Clock className='w-3 h-3 mr-1 text-amber-600' />
                          {t.admin.refundRequests.statusPending}
                        </span>
                      )}
                      {req.status === 'APPROVED' && (
                        <div className='flex flex-col space-y-0.5'>
                          <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200'>
                            <CheckCircle2 className='w-3 h-3 mr-1 text-emerald-600' />
                            {t.admin.refundRequests.statusApproved}
                          </span>
                          {req.refundStatus === 'PROCESSED' && (
                            <span className='text-[10px] text-emerald-700 font-medium ml-1'>
                              {t.admin.refundRequests.refundSettled}
                            </span>
                          )}
                          {req.refundStatus === 'PENDING' && (
                            <span className='text-[10px] text-amber-700 font-medium ml-1'>
                              {t.admin.refundRequests.providerPending}
                            </span>
                          )}
                          {req.refundStatus === 'FAILED' && (
                            <span className='text-[10px] text-rose-700 font-medium ml-1'>
                              {t.admin.refundRequests.providerFailed}
                            </span>
                          )}
                          {!req.refundStatus && (
                            <span className='text-[10px] text-blue-700 font-medium ml-1'>
                              {t.admin.refundRequests.awaitingExecution}
                            </span>
                          )}
                        </div>
                      )}
                      {req.status === 'REJECTED' && (
                        <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200'>
                          <XCircle className='w-3 h-3 mr-1 text-rose-600' />
                          {t.admin.refundRequests.statusRejected}
                        </span>
                      )}
                    </td>
                    <td className='py-4 px-4 text-right'>
                      <button
                        onClick={() => setSelectedRequestId(req.id)}
                        className='inline-flex items-center px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition'
                        aria-label={t.admin.refundRequests.review}
                      >
                        <Eye className='w-3.5 h-3.5 mr-1 text-gray-500' />
                        {t.admin.refundRequests.review}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className='flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 sm:px-6'>
            <div className='text-xs text-gray-500'>
              {t.admin.refundRequests.pagination
                .replace('{page}', formatNumber(pagination.page, locale))
                .replace('{totalPages}', formatNumber(pagination.totalPages, locale))
                .replace('{total}', formatNumber(pagination.total, locale))}
            </div>
            <div className='flex space-x-2'>
              <button
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className='inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed'
              >
                <ChevronLeft className='w-4 h-4 mr-1' /> {t.admin.refundRequests.prev}
              </button>
              <button
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
                className='inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed'
              >
                {t.admin.refundRequests.next} <ChevronRight className='w-4 h-4 ml-1' />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* DETAIL MODAL / DRAWER                                     */}
      {/* ========================================================= */}
      {selectedRequestId && (
        <div className='fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6'>
          <div className='bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150'>
            {/* Modal Header */}
            <div className='flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/70'>
              <div>
                <h3 className='text-lg font-bold text-gray-900'>{t.admin.refundRequests.modal.title}</h3>
                <p className='text-xs text-gray-500 font-mono'>
                  {requestDetail ? requestDetail.requestNumber : t.admin.refundRequests.modal.loading}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedRequestId(null);
                  setIsApproving(false);
                  setIsRejecting(false);
                  setActionError(null);
                }}
                className='text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition'
                aria-label={t.admin.refundRequests.modal.close}
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            {/* Modal Body */}
            <div className='p-6 space-y-6 max-h-[75vh] overflow-y-auto'>
              {isLoadingDetail ? (
                <div className='py-16 text-center'>
                  <Loader2 className='w-8 h-8 animate-spin text-primary mx-auto mb-2' />
                  <p className='text-sm text-gray-500'>{t.admin.refundRequests.modal.loading}</p>
                </div>
              ) : requestDetail ? (
                <>
                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-xl border flex items-center justify-between ${
                      requestDetail.status === 'PENDING'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : requestDetail.status === 'APPROVED'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className='flex items-center space-x-3'>
                      {requestDetail.status === 'PENDING' && (
                        <Clock className='w-5 h-5 text-amber-600 shrink-0' />
                      )}
                      {requestDetail.status === 'APPROVED' && (
                        <CheckCircle2 className='w-5 h-5 text-emerald-600 shrink-0' />
                      )}
                      {requestDetail.status === 'REJECTED' && (
                        <XCircle className='w-5 h-5 text-rose-600 shrink-0' />
                      )}
                      <div>
                        <div className='text-sm font-bold'>
                          {requestDetail.status === 'PENDING' && t.admin.refundRequests.modal.bannerPending}
                          {requestDetail.status === 'APPROVED' && t.admin.refundRequests.modal.bannerApproved}
                          {requestDetail.status === 'REJECTED' && t.admin.refundRequests.modal.bannerRejected}
                        </div>
                        <div className='text-xs opacity-80'>
                          {t.admin.refundRequests.modal.submittedOn.replace('{date}', formatDate(requestDetail.createdAt, locale, { dateStyle: 'medium', timeStyle: 'short' }))}
                        </div>
                      </div>
                    </div>
                    {requestDetail.refundStatus && (
                      <span className='px-2.5 py-1 rounded-full text-xs font-semibold bg-white/80 border border-current'>
                        {t.admin.refundRequests.modal.providerState.replace('{state}', requestDetail.refundStatus)}
                      </span>
                    )}
                  </div>

                  {/* Student & Course Section */}
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                    <div className='p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2'>
                      <div className='flex items-center space-x-2 text-xs font-bold text-gray-500 uppercase tracking-wider'>
                        <User className='w-3.5 h-3.5' />
                        <span>{t.admin.refundRequests.modal.studentInfo}</span>
                      </div>
                      <div className='text-sm font-semibold text-gray-900'>
                        {requestDetail.studentName || 'Student'}
                      </div>
                      <div className='text-xs text-gray-600 font-mono'>
                        {requestDetail.studentEmail}
                      </div>
                    </div>

                    <div className='p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2'>
                      <div className='flex items-center space-x-2 text-xs font-bold text-gray-500 uppercase tracking-wider'>
                        <GraduationCap className='w-3.5 h-3.5' />
                        <span>{t.admin.refundRequests.modal.courseInfo}</span>
                      </div>
                      <div className='text-sm font-semibold text-gray-900'>
                        {requestDetail.courseTitle}
                      </div>
                      <div className='text-xs text-gray-500'>
                        {t.admin.refundRequests.modal.courseId.replace('{id}', requestDetail.courseId)}
                      </div>
                    </div>
                  </div>

                  {/* Order & Financial Details */}
                  <div className='p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3'>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center space-x-2 text-xs font-bold text-gray-500 uppercase tracking-wider'>
                        <Receipt className='w-3.5 h-3.5' />
                        <span>{t.admin.refundRequests.modal.orderBreakdown}</span>
                      </div>
                      {requestDetail.invoiceId && (
                        <Link
                          href={`/invoices/${requestDetail.invoiceId}`}
                          className='inline-flex items-center text-xs font-medium text-primary hover:underline'
                          target='_blank'
                        >
                          <FileText className='w-3.5 h-3.5 mr-1' /> {t.admin.refundRequests.modal.viewInvoice}{' '}
                          <ExternalLink className='w-3 h-3 ml-0.5' />
                        </Link>
                      )}
                    </div>
                    <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs'>
                      <div>
                        <span className='text-gray-500 block'>{t.admin.refundRequests.modal.orderNumber}</span>
                        <span className='font-mono font-medium text-gray-900'>
                          {requestDetail.orderNumber}
                        </span>
                      </div>
                      <div>
                        <span className='text-gray-500 block'>{t.admin.refundRequests.modal.datePaid}</span>
                        <span className='font-medium text-gray-900'>
                          {requestDetail.orderPaidAt
                            ? formatDate(requestDetail.orderPaidAt, locale)
                            : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className='text-gray-500 block'>{t.admin.refundRequests.modal.orderStatus}</span>
                        <span className='font-semibold text-gray-900'>
                          {requestDetail.orderStatus || 'PAID'}
                        </span>
                      </div>
                      <div>
                        <span className='text-gray-500 block'>{t.admin.refundRequests.modal.netPaidAmount}</span>
                        <span className='font-bold text-gray-900 text-sm'>
                          {formatCurrency((requestDetail.payableCents || 0) / 100, locale)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress Comparison */}
                  <div className='p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2'>
                    <div className='text-xs font-bold text-blue-900 uppercase tracking-wider'>
                      {t.admin.refundRequests.modal.progressEvaluation}
                    </div>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1'>
                      <div>
                        <span className='text-xs text-blue-700 block'>{t.admin.refundRequests.modal.progressSnapshot}</span>
                        <span className='text-lg font-bold text-blue-950'>
                          {formatNumber(requestDetail.courseProgressAtRequest, locale)}%
                        </span>
                        <p className='text-[11px] text-blue-600 mt-0.5'>
                          {t.admin.refundRequests.modal.snapshotNotice}
                        </p>
                      </div>
                      <div>
                        <span className='text-xs text-blue-700 block'>{t.admin.refundRequests.modal.currentProgress}</span>
                        <span className='text-lg font-bold text-blue-950'>
                          {requestDetail.currentProgress !== undefined
                            ? `${formatNumber(requestDetail.currentProgress, locale)}%`
                            : 'N/A'}
                        </span>
                        <p className='text-[11px] text-blue-600 mt-0.5'>
                          {t.admin.refundRequests.modal.currentNotice}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Reason Section */}
                  <div className='p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2'>
                    <div className='text-xs font-bold text-gray-500 uppercase tracking-wider'>
                      {t.admin.refundRequests.modal.studentReason}
                    </div>
                    <div className='text-xs font-semibold text-gray-900'>
                      {t.admin.refundRequests.modal.category.replace('{category}', (reasonCategoryLabels as any)[requestDetail.reasonCategory] || requestDetail.reasonCategory)}
                    </div>
                    <p className='text-xs text-gray-700 whitespace-pre-wrap bg-white p-3 rounded-lg border border-gray-200'>
                      {requestDetail.reasonDetail}
                    </p>
                  </div>

                  {/* Review History (if reviewed) */}
                  {requestDetail.status !== 'PENDING' && (
                    <div className='p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2 text-xs'>
                      <div className='font-bold text-gray-700 uppercase tracking-wider'>
                        {t.admin.refundRequests.modal.adjudicationRecord}
                      </div>
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600'>
                        <div>
                          <span className='text-gray-500'>{t.admin.refundRequests.modal.reviewedBy} </span>
                          <span className='font-medium text-gray-900'>
                            {requestDetail.reviewedByName || requestDetail.reviewedBy || 'Administrator'}
                          </span>
                        </div>
                        <div>
                          <span className='text-gray-500'>{t.admin.refundRequests.modal.reviewedAt} </span>
                          <span className='font-medium text-gray-900'>
                            {requestDetail.reviewedAt
                              ? formatDate(requestDetail.reviewedAt, locale, { dateStyle: 'medium', timeStyle: 'short' })
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                      {requestDetail.rejectionReason && (
                        <div className='mt-2'>
                          <span className='font-semibold text-rose-700'>{t.admin.refundRequests.modal.rejectionReason}</span>
                          <p className='text-gray-800 bg-rose-50/50 p-2.5 rounded-lg border border-rose-200 mt-1'>
                            {requestDetail.rejectionReason}
                          </p>
                        </div>
                      )}
                      {requestDetail.adminNotes && (
                        <div className='mt-2'>
                          <span className='font-semibold text-gray-700'>{t.admin.refundRequests.modal.internalAdminNotes}</span>
                          <p className='text-gray-800 bg-gray-100/70 p-2.5 rounded-lg border border-gray-200 mt-1'>
                            {requestDetail.adminNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Error Banner */}
                  {actionError && (
                    <div className='p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center space-x-2'>
                      <AlertTriangle className='w-4 h-4 text-red-500 shrink-0' />
                      <span>{actionError}</span>
                    </div>
                  )}

                  {/* APPROVAL SUB-FORM */}
                  {isApproving && (
                    <div className='p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-3'>
                      <div className='flex items-center space-x-2 text-sm font-bold text-emerald-900'>
                        <CheckCircle2 className='w-4 h-4 text-emerald-600' />
                        <span>{t.admin.refundRequests.modal.confirmApprovalTitle}</span>
                      </div>
                      <p className='text-xs text-emerald-800'>
                        {t.admin.refundRequests.modal.confirmApprovalDesc}
                      </p>
                      <div>
                        <label className='block text-xs font-semibold text-gray-700 mb-1'>
                          {t.admin.refundRequests.approveNotesLabel}
                        </label>
                        <textarea
                          rows={2}
                          placeholder={t.admin.refundRequests.approveNotesPlaceholder}
                          value={approveAdminNotes}
                          onChange={(e) => setApproveAdminNotes(e.target.value)}
                          className='w-full px-3 py-2 border border-emerald-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white'
                        />
                      </div>
                      <div className='flex items-center justify-end space-x-2 pt-1'>
                        <button
                          type='button'
                          onClick={() => {
                            setIsApproving(false);
                            setActionError(null);
                          }}
                          disabled={approveMutation.isPending}
                          className='px-3.5 py-1.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-700 bg-white hover:bg-gray-50'
                        >
                          {t.admin.refundRequests.modal.cancel}
                        </button>
                        <button
                          type='button'
                          onClick={() =>
                            approveMutation.mutate({
                              id: requestDetail.id,
                              adminNotes: approveAdminNotes.trim() || undefined,
                            })
                          }
                          disabled={approveMutation.isPending}
                          className='px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center space-x-1.5'
                        >
                          {approveMutation.isPending && (
                            <Loader2 className='w-3.5 h-3.5 animate-spin' />
                          )}
                          <span>{t.admin.refundRequests.confirmApprove}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* REJECTION SUB-FORM */}
                  {isRejecting && (
                    <div className='p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-3'>
                      <div className='flex items-center space-x-2 text-sm font-bold text-rose-900'>
                        <XCircle className='w-4 h-4 text-rose-600' />
                        <span>{t.admin.refundRequests.modal.confirmRejectionTitle}</span>
                      </div>
                      <p className='text-xs text-rose-800'>
                        {t.admin.refundRequests.modal.confirmRejectionDesc}
                      </p>
                      <div>
                        <label className='block text-xs font-semibold text-gray-700 mb-1'>
                          {t.admin.refundRequests.rejectReasonLabel}
                        </label>
                        <textarea
                          rows={2}
                          placeholder={t.admin.refundRequests.rejectReasonPlaceholder}
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className='w-full px-3 py-2 border border-rose-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white'
                        />
                      </div>
                      <div>
                        <label className='block text-xs font-semibold text-gray-700 mb-1'>
                          {t.admin.refundRequests.rejectNotesLabel}
                        </label>
                        <textarea
                          rows={2}
                          placeholder={t.admin.refundRequests.rejectNotesPlaceholder}
                          value={rejectAdminNotes}
                          onChange={(e) => setRejectAdminNotes(e.target.value)}
                          className='w-full px-3 py-2 border border-rose-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white'
                        />
                      </div>
                      <div className='flex items-center justify-end space-x-2 pt-1'>
                        <button
                          type='button'
                          onClick={() => {
                            setIsRejecting(false);
                            setActionError(null);
                          }}
                          disabled={rejectMutation.isPending}
                          className='px-3.5 py-1.5 border border-gray-300 rounded-xl text-xs font-medium text-gray-700 bg-white hover:bg-gray-50'
                        >
                          {t.admin.refundRequests.modal.cancel}
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            if (rejectionReason.trim().length < 5) {
                              setActionError(
                                'Rejection reason must be at least 5 characters in length.'
                              );
                              return;
                            }
                            rejectMutation.mutate({
                              id: requestDetail.id,
                              rejectionReason: rejectionReason.trim(),
                              adminNotes: rejectAdminNotes.trim() || undefined,
                            });
                          }}
                          disabled={rejectMutation.isPending}
                          className='px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition flex items-center space-x-1.5'
                        >
                          {rejectMutation.isPending && (
                            <Loader2 className='w-3.5 h-3.5 animate-spin' />
                          )}
                          <span>{t.admin.refundRequests.confirmReject}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className='flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50'>
              <button
                type='button'
                onClick={() => {
                  setSelectedRequestId(null);
                  setIsApproving(false);
                  setIsRejecting(false);
                  setActionError(null);
                }}
                className='px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 transition'
              >
                {t.admin.refundRequests.modal.close}
              </button>

              {requestDetail && requestDetail.status === 'PENDING' && !isApproving && !isRejecting && (
                <div className='flex items-center space-x-3'>
                  <button
                    type='button'
                    onClick={() => {
                      setIsRejecting(true);
                      setIsApproving(false);
                      setActionError(null);
                    }}
                    className='inline-flex items-center px-4 py-2 border border-rose-300 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition'
                  >
                    <XCircle className='w-4 h-4 mr-1.5 text-rose-600' />
                    {t.admin.refundRequests.reject}
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      setIsApproving(true);
                      setIsRejecting(false);
                      setActionError(null);
                    }}
                    className='inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition'
                  >
                    <CheckCircle2 className='w-4 h-4 mr-1.5' />
                    {t.admin.refundRequests.approve}
                  </button>
                </div>
              )}

              {requestDetail && requestDetail.status === 'APPROVED' && (!requestDetail.refundStatus || requestDetail.refundStatus === 'FAILED') && (
                <div className='flex items-center space-x-3'>
                  <button
                    type='button'
                    onClick={() => executeMutation.mutate(requestDetail.id)}
                    disabled={executeMutation.isPending}
                    className='inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 shadow-xs transition disabled:opacity-50'
                  >
                    {executeMutation.isPending ? (
                      <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
                    ) : (
                      <CheckCircle2 className='w-4 h-4 mr-1.5' />
                    )}
                    <span>{requestDetail.refundStatus === 'FAILED' ? t.admin.refundRequests.modal.retryRefund : t.admin.refundRequests.modal.executeRefund}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
