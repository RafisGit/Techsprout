'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminOrders,
  fetchAdminOrderById,
  fetchOrderPayments,
  initiateRefund,
  formatBDT,
} from '@/lib/api/finance';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { FinanceSubNav } from '@/components/admin/FinanceSubNav';
import Link from 'next/link';
import {
  ShoppingCart,
  Search,
  Filter,
  Eye,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  CreditCard,
  FileText,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type {
  OrderListItemDto,
  OrderDto,
  PaymentListItemDto,
  OrderStatus,
} from '@techsprout/contracts';

export default function AdminOrdersExplorerPage() {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Filters & Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Order for Detail Modal
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Refund Modal State
  const [refundOrderTarget, setRefundOrderTarget] = useState<OrderDto | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundFormError, setRefundFormError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // 1. Fetch Orders List
  const {
    data: ordersData,
    isLoading: isLoadingOrders,
    isError: isOrdersError,
    error: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: [
      'admin',
      'orders',
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
      fetchAdminOrders({
        page,
        limit,
        status: (statusFilter as OrderStatus) || undefined,
        search: searchTerm.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      }),
    enabled: isAdmin,
  });

  // 2. Fetch Selected Order Detail
  const {
    data: orderDetail,
    isLoading: isLoadingDetail,
  } = useQuery({
    queryKey: ['admin', 'orders', selectedOrderId],
    queryFn: () => fetchAdminOrderById(selectedOrderId!),
    enabled: isAdmin && Boolean(selectedOrderId),
  });

  // 3. Fetch Payments for Selected Order
  const {
    data: orderPayments = [],
    isLoading: isLoadingPayments,
  } = useQuery({
    queryKey: ['admin', 'orders', selectedOrderId, 'payments'],
    queryFn: () => fetchOrderPayments(selectedOrderId!),
    enabled: isAdmin && Boolean(selectedOrderId),
  });

  // Refund Mutation
  const refundMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      initiateRefund(orderId, reason),
    onSuccess: (data) => {
      setRefundOrderTarget(null);
      setRefundReason('');
      setRefundFormError(null);
      setActionSuccessMessage(
        `Refund operation ${data.refundNumber} initiated successfully with status '${data.status}'.`
      );
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      setTimeout(() => setActionSuccessMessage(null), 5000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setRefundFormError(resp?.message || err?.message || 'Failed to initiate refund operation.');
    },
  });

  const handleOpenRefundModal = (order: OrderDto) => {
    setRefundOrderTarget(order);
    setRefundReason('');
    setRefundFormError(null);
  };

  const handleRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRefundFormError(null);

    if (!refundReason.trim() || refundReason.trim().length < 5) {
      setRefundFormError('Refund reason is required and must be at least 5 characters.');
      return;
    }

    if (!refundOrderTarget) return;

    refundMutation.mutate({
      orderId: refundOrderTarget.id,
      reason: refundReason.trim(),
    });
  };

  // Render Status Badge
  const renderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PAID':
        return (
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
            <CheckCircle2 className='w-3 h-3 mr-1 text-emerald-500' />
            Paid
          </span>
        );
      case 'PAYMENT_PROCESSING':
        return (
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200'>
            <Clock className='w-3 h-3 mr-1 text-blue-500' />
            Processing
          </span>
        );
      case 'PENDING':
        return (
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200'>
            <Clock className='w-3 h-3 mr-1 text-amber-500' />
            Pending
          </span>
        );
      case 'REFUNDED':
        return (
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200'>
            <RotateCcw className='w-3 h-3 mr-1 text-purple-500' />
            Refunded
          </span>
        );
      case 'CANCELLED':
        return (
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200'>
            <XCircle className='w-3 h-3 mr-1 text-gray-400' />
            Cancelled
          </span>
        );
      case 'FAILED':
        return (
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200'>
            <AlertCircle className='w-3 h-3 mr-1 text-red-500' />
            Failed
          </span>
        );
      default:
        return (
          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700'>
            {status}
          </span>
        );
    }
  };

  // Guard non-admin users
  if (!isLoadingUser && !isAdmin) {
    return (
      <div className='max-w-2xl mx-auto p-8 bg-red-50 border border-red-200 text-red-800 rounded-2xl shadow-xs text-center'>
        <ShieldAlert className='w-12 h-12 text-red-600 mx-auto mb-3' />
        <h2 className='text-xl font-bold mb-1'>Administrator Access Required</h2>
        <p className='text-xs text-gray-600 mb-4'>
          The Orders & Payment Explorer is strictly restricted to system administrators.
        </p>
        <Link
          href='/dashboard'
          className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const items = ordersData?.items || [];
  const pagination = ordersData?.pagination;

  return (
    <div className='space-y-6'>
      {/* Top Banner */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
            Orders & Payment Explorer
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            Inspect student orders, verify gateway payment attempts, and initiate authorized full refunds.
          </p>
        </div>
      </div>

      {/* Sub Navigation */}
      <FinanceSubNav />

      {/* Success Notification */}
      {actionSuccessMessage && (
        <div className='p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-sm'>
          <div className='flex items-center space-x-2'>
            <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className='text-xs font-semibold hover:underline'
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className='bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
          {/* Search Term */}
          <div className='relative'>
            <Search className='w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400' />
            <input
              type='text'
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder='Search order #, email, name...'
              className='w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as OrderStatus | '');
                setPage(1);
              }}
              className='w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white'
            >
              <option value=''>All Order Statuses</option>
              <option value='PAID'>PAID</option>
              <option value='PAYMENT_PROCESSING'>PAYMENT_PROCESSING</option>
              <option value='PENDING'>PENDING</option>
              <option value='REFUNDED'>REFUNDED</option>
              <option value='CANCELLED'>CANCELLED</option>
              <option value='FAILED'>FAILED</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <input
              type='date'
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              placeholder='Start Date'
              className='w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary text-gray-600'
            />
          </div>

          {/* End Date */}
          <div>
            <input
              type='date'
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              placeholder='End Date'
              className='w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary text-gray-600'
            />
          </div>
        </div>

        {/* Clear Filters Helper */}
        {(searchTerm || statusFilter || startDate || endDate) && (
          <div className='flex items-center justify-end pt-1'>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className='text-xs font-semibold text-primary hover:underline'
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        {isLoadingOrders ? (
          <div className='p-16 text-center'>
            <Loader2 className='w-8 h-8 text-primary animate-spin mx-auto mb-3' />
            <p className='text-sm text-gray-500'>Loading orders from database...</p>
          </div>
        ) : isOrdersError ? (
          <div className='p-12 text-center max-w-md mx-auto'>
            <AlertCircle className='w-10 h-10 text-red-500 mx-auto mb-3' />
            <h3 className='text-base font-semibold text-gray-900 mb-1'>Failed to load orders</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {(ordersError as any)?.response?.data?.message || 'Network error fetching orders list.'}
            </p>
            <button
              onClick={() => refetchOrders()}
              className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className='p-16 text-center max-w-md mx-auto'>
            <div className='w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400'>
              <ShoppingCart className='w-6 h-6' />
            </div>
            <h3 className='text-base font-semibold text-gray-900 mb-1'>No orders found</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {searchTerm || statusFilter || startDate || endDate
                ? 'No orders matched your selected filters.'
                : 'No customer orders have been recorded in the system yet.'}
            </p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm text-gray-600'>
              <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
                <tr>
                  <th scope='col' className='px-4 py-3.5'>Order #</th>
                  <th scope='col' className='px-4 py-3.5'>Student</th>
                  <th scope='col' className='px-4 py-3.5'>Course</th>
                  <th scope='col' className='px-4 py-3.5 text-right'>Payable</th>
                  <th scope='col' className='px-4 py-3.5 text-center'>Status</th>
                  <th scope='col' className='px-4 py-3.5'>Date</th>
                  <th scope='col' className='px-4 py-3.5 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {items.map((ord: OrderListItemDto) => (
                  <tr key={ord.id} className='hover:bg-gray-50/60 transition-colors'>
                    <td className='px-4 py-3.5 whitespace-nowrap font-mono text-xs font-semibold text-gray-900'>
                      {ord.orderNumber}
                    </td>

                    <td className='px-4 py-3.5 whitespace-nowrap'>
                      <div className='font-medium text-gray-900'>{ord.studentName || 'Student'}</div>
                      <div className='text-xs text-gray-500'>{ord.studentEmail || '—'}</div>
                    </td>

                    <td className='px-4 py-3.5 max-w-xs truncate text-xs text-gray-700 font-medium'>
                      {ord.courseTitle}
                    </td>

                    <td className='px-4 py-3.5 text-right whitespace-nowrap font-bold text-gray-900'>
                      {formatBDT(ord.payableCents)}
                    </td>

                    <td className='px-4 py-3.5 text-center whitespace-nowrap'>
                      {renderStatusBadge(ord.status)}
                    </td>

                    <td className='px-4 py-3.5 whitespace-nowrap text-xs text-gray-500'>
                      {new Date(ord.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>

                    <td className='px-4 py-3.5 text-right whitespace-nowrap'>
                      <div className='flex items-center justify-end space-x-1.5'>
                        <button
                          onClick={() => setSelectedOrderId(ord.id)}
                          className='p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition'
                          title='View Order Details'
                        >
                          <Eye className='w-4 h-4' />
                        </button>

                        {ord.status === 'PAID' && (
                          <button
                            onClick={() => {
                              fetchAdminOrderById(ord.id).then((fullOrder) => {
                                handleOpenRefundModal(fullOrder);
                              });
                            }}
                            className='p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition'
                            title='Initiate Full Refund'
                          >
                            <RotateCcw className='w-4 h-4' />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination && pagination.totalPages > 1 && (
          <div className='p-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600'>
            <div>
              Showing page <span className='font-bold text-gray-900'>{pagination.page}</span> of{' '}
              <span className='font-bold text-gray-900'>{pagination.totalPages}</span> ({pagination.total} total orders)
            </div>

            <div className='flex items-center space-x-2'>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPreviousPage}
                className='inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition'
              >
                <ChevronLeft className='w-3.5 h-3.5 mr-1' />
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasNextPage}
                className='inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition'
              >
                Next
                <ChevronRight className='w-3.5 h-3.5 ml-1' />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrderId && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4'>
          <div className='bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl border border-gray-200 p-6 space-y-6 animate-in fade-in zoom-in-95'>
            {/* Modal Header */}
            <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
              <div>
                <h3 className='text-lg font-bold text-gray-900 flex items-center space-x-2'>
                  <span>Order Inspection</span>
                  {orderDetail && (
                    <span className='font-mono text-sm font-semibold text-primary'>
                      {orderDetail.orderNumber}
                    </span>
                  )}
                </h3>
                <p className='text-xs text-gray-500'>
                  Authoritative record and payment gateway transaction trace
                </p>
              </div>
              <button
                onClick={() => setSelectedOrderId(null)}
                className='text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            {isLoadingDetail || !orderDetail ? (
              <div className='p-12 text-center'>
                <Loader2 className='w-8 h-8 text-primary animate-spin mx-auto mb-2' />
                <p className='text-xs text-gray-500'>Loading order snapshot...</p>
              </div>
            ) : (
              <div className='space-y-6'>
                {/* Status & Timing Overview */}
                <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs'>
                  <div>
                    <span className='text-gray-500 block font-medium'>Status</span>
                    <div className='mt-1'>{renderStatusBadge(orderDetail.status)}</div>
                  </div>
                  <div>
                    <span className='text-gray-500 block font-medium'>Created At</span>
                    <span className='font-semibold text-gray-900 mt-1 block'>
                      {new Date(orderDetail.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className='text-gray-500 block font-medium'>Paid At</span>
                    <span className='font-semibold text-gray-900 mt-1 block'>
                      {orderDetail.paidAt ? new Date(orderDetail.paidAt).toLocaleString() : '—'}
                    </span>
                  </div>
                  <div>
                    <span className='text-gray-500 block font-medium'>Currency</span>
                    <span className='font-bold text-gray-900 mt-1 block'>{orderDetail.currency}</span>
                  </div>
                </div>

                {/* Student Info */}
                <div className='border border-gray-200 rounded-xl p-4 space-y-1.5'>
                  <div className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Student Information
                  </div>
                  <div className='font-semibold text-gray-900'>{orderDetail.studentName || 'Student'}</div>
                  <div className='text-xs text-gray-600'>{orderDetail.studentEmail}</div>
                </div>

                {/* Items & Financial Breakdown */}
                <div className='border border-gray-200 rounded-xl p-4 space-y-3'>
                  <div className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                    Course Items
                  </div>
                  <div className='divide-y divide-gray-100'>
                    {orderDetail.items.map((item) => (
                      <div key={item.id} className='py-2 flex items-center justify-between text-xs'>
                        <span className='font-semibold text-gray-900'>{item.courseTitle}</span>
                        <span className='font-mono font-bold text-gray-800'>
                          {formatBDT(item.unitPriceCents)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className='border-t border-gray-200 pt-3 space-y-1 text-xs'>
                    <div className='flex justify-between text-gray-600'>
                      <span>Subtotal:</span>
                      <span className='font-mono'>{formatBDT(orderDetail.subtotalCents)}</span>
                    </div>
                    {orderDetail.discountCents > 0 && (
                      <div className='flex justify-between text-purple-700 font-medium'>
                        <span>Discount {orderDetail.couponCode ? `(${orderDetail.couponCode})` : ''}:</span>
                        <span className='font-mono'>- {formatBDT(orderDetail.discountCents)}</span>
                      </div>
                    )}
                    <div className='flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100'>
                      <span>Total Payable:</span>
                      <span className='text-primary'>{formatBDT(orderDetail.payableCents)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Attempts Inspector */}
                <div className='border border-gray-200 rounded-xl p-4 space-y-3'>
                  <div className='flex items-center justify-between'>
                    <div className='text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center space-x-1.5'>
                      <CreditCard className='w-4 h-4 text-gray-400' />
                      <span>Payment Gateway Attempts (SSLCommerz)</span>
                    </div>
                    <span className='text-xs text-gray-400'>
                      {orderPayments.length} attempt{orderPayments.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {isLoadingPayments ? (
                    <div className='p-4 text-center text-xs text-gray-500'>
                      <Loader2 className='w-4 h-4 text-primary animate-spin mx-auto mb-1' />
                      Loading payment attempts...
                    </div>
                  ) : orderPayments.length === 0 ? (
                    <div className='p-4 bg-gray-50 rounded-lg text-center text-xs text-gray-500'>
                      No gateway payment sessions initiated yet.
                    </div>
                  ) : (
                    <div className='divide-y divide-gray-100'>
                      {orderPayments.map((pay: PaymentListItemDto) => (
                        <div key={pay.id} className='py-2.5 text-xs space-y-1'>
                          <div className='flex items-center justify-between'>
                            <span className='font-mono font-semibold text-gray-900'>
                              {pay.merchantTranId}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                pay.status === 'VALIDATED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : pay.status === 'INITIATED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {pay.status}
                            </span>
                          </div>
                          <div className='grid grid-cols-2 gap-2 text-gray-500 text-[11px]'>
                            <div>
                              Val ID:{' '}
                              <span className='font-mono font-medium text-gray-800'>
                                {pay.valId || '—'}
                              </span>
                            </div>
                            <div>
                              Bank Tran ID:{' '}
                              <span className='font-mono font-medium text-gray-800'>
                                {pay.bankTranId || '—'}
                              </span>
                            </div>
                            <div>
                              Method:{' '}
                              <span className='font-medium text-gray-800'>
                                {pay.cardType || 'SSLCommerz Gateway'}
                              </span>
                            </div>
                            <div>
                              Amount:{' '}
                              <span className='font-bold text-gray-900'>
                                {formatBDT(pay.amountCents)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions & Consequences */}
                <div className='flex items-center justify-between pt-2 border-t border-gray-100'>
                  <div>
                    {orderDetail.invoiceId ? (
                      <Link
                        href={`/invoices/${orderDetail.invoiceId}`}
                        target='_blank'
                        className='inline-flex items-center space-x-1.5 text-xs font-semibold text-primary hover:underline'
                      >
                        <FileText className='w-4 h-4' />
                        <span>View Official Invoice</span>
                        <ExternalLink className='w-3 h-3' />
                      </Link>
                    ) : (
                      <span className='text-xs text-gray-400'>No invoice generated</span>
                    )}
                  </div>

                  <div className='flex items-center space-x-2'>
                    {orderDetail.status === 'PAID' && (
                      <button
                        onClick={() => handleOpenRefundModal(orderDetail)}
                        className='inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition shadow-xs'
                      >
                        <RotateCcw className='w-4 h-4' />
                        <span>Initiate Refund</span>
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedOrderId(null)}
                      className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Refund Initiation Modal with Strict Warnings */}
      {refundOrderTarget && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4'>
          <div className='bg-white w-full max-w-lg rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4 animate-in fade-in zoom-in-95'>
            {/* Modal Header */}
            <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
              <div className='flex items-center space-x-2 text-amber-600 font-bold'>
                <AlertTriangle className='w-5 h-5 shrink-0' />
                <h3 className='text-lg text-gray-900'>Initiate Full Order Refund</h3>
              </div>
              <button
                onClick={() => setRefundOrderTarget(null)}
                className='text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            {/* Warning Callout */}
            <div className='p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1.5'>
              <div className='font-bold flex items-center space-x-1'>
                <span>Financial & Academic Policy Notice:</span>
              </div>
              <ul className='list-disc pl-4 space-y-1 text-amber-800'>
                <li>Refund amount is server-derived for the full payable total; partial refunds are prohibited.</li>
                <li>Refund execution is asynchronous via SSLCommerz gateway settlement.</li>
                <li>Upon gateway clearing confirmation, student course enrollment will be cancelled and any issued certificate permanently revoked.</li>
                <li>A processed refund is an irreversible terminal domain state.</li>
              </ul>
            </div>

            {/* Order Summary Snapshot */}
            <div className='bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs space-y-1'>
              <div className='flex justify-between'>
                <span className='text-gray-500'>Order Number:</span>
                <span className='font-mono font-bold text-gray-900'>{refundOrderTarget.orderNumber}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-gray-500'>Student:</span>
                <span className='font-medium text-gray-900'>{refundOrderTarget.studentEmail}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-gray-500'>Course:</span>
                <span className='font-medium text-gray-900'>{refundOrderTarget.items[0]?.courseTitle}</span>
              </div>
              <div className='flex justify-between pt-1 border-t border-gray-200 text-sm font-bold'>
                <span className='text-gray-700'>Refund Amount (Locked):</span>
                <span className='text-amber-700'>{formatBDT(refundOrderTarget.payableCents)}</span>
              </div>
            </div>

            {/* Error Message */}
            {refundFormError && (
              <div className='p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center space-x-2'>
                <AlertCircle className='w-4 h-4 shrink-0' />
                <span>{refundFormError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleRefundSubmit} className='space-y-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  Refund Justification / Reason <span className='text-red-500'>*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder='Specify the administrative justification for this refund (minimum 5 characters)...'
                  className='w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500'
                />
              </div>

              <div className='flex items-center justify-end space-x-2 pt-2 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setRefundOrderTarget(null)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={refundMutation.isPending}
                  className='px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50 flex items-center space-x-1.5'
                >
                  {refundMutation.isPending ? (
                    <>
                      <Loader2 className='w-3.5 h-3.5 animate-spin' />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Confirm & Authorize Refund</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
