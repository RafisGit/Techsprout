'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinanceSummary, formatBDT, downloadFinanceCsvBlob } from '@/lib/api/finance';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { FinanceSubNav } from '@/components/admin/FinanceSubNav';
import Link from 'next/link';
import {
  Banknote,
  TrendingUp,
  CreditCard,
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
  ShieldAlert,
  ArrowRight,
  ShoppingCart,
  Percent,
  Download,
  FileSpreadsheet,
  Calendar,
  X,
} from 'lucide-react';
import type { FinanceExportType } from '@techsprout/contracts';

export default function AdminFinanceDashboardPage() {
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Export CSV State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState<FinanceExportType>('orders');
  
  // Default date range: last 30 days
  const defaultEnd = new Date().toISOString().split('T')[0];
  const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const {
    data: summary,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'finance', 'summary'],
    queryFn: fetchFinanceSummary,
    enabled: isAdmin,
  });

  const handleQuickPreset = (days: number) => {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setStartDate(start);
    setEndDate(end);
    setExportError(null);
  };

  const handleDownloadCsv = async () => {
    setExportError(null);
    setExportSuccess(null);

    // Client-side date validations
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (s > e) {
        setExportError('Start date must be before or equal to end date.');
        return;
      }
      const diffDays = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 90) {
        setExportError('Export date range cannot exceed 90 days.');
        return;
      }
    }

    setIsExporting(true);
    try {
      const { blob, filename } = await downloadFinanceCsvBlob({
        type: exportType,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setExportSuccess(`Successfully downloaded ${filename}`);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        (err?.response?.status === 429
          ? 'Rate limit reached: Maximum 10 export requests per minute.'
          : 'Failed to download CSV export. Please verify date range and try again.');
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  // Guard non-admin users
  if (!isLoadingUser && !isAdmin) {
    return (
      <div className='max-w-2xl mx-auto p-8 bg-red-50 border border-red-200 text-red-800 rounded-2xl shadow-xs text-center'>
        <ShieldAlert className='w-12 h-12 text-red-600 mx-auto mb-3' />
        <h2 className='text-xl font-bold mb-1'>Administrator Access Required</h2>
        <p className='text-xs text-gray-600 mb-4'>
          Institutional financial summaries are strictly restricted to system administrators.
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

  return (
    <div className='space-y-6'>
      {/* Top Banner */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
            Finance & Revenue Dashboard
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            Authoritative revenue metrics, settlement reconciliation, and institutional transaction audits.
          </p>
        </div>

        <div className='flex items-center space-x-2'>
          <Link
            href='/admin/finance/orders'
            className='inline-flex items-center space-x-1.5 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 transition shadow-xs'
          >
            <ShoppingCart className='w-4 h-4 text-gray-500' />
            <span>Orders Explorer</span>
          </Link>
          <Link
            href='/admin/finance/reconciliation'
            className='inline-flex items-center space-x-1.5 px-3.5 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs'
          >
            <RotateCcw className='w-4 h-4' />
            <span>Reconciliation</span>
          </Link>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className='inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl transition shadow-xs'
            aria-label='Export Financial CSV'
          >
            <Download className='w-4 h-4' />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <FinanceSubNav />

      {/* Loading State */}
      {isLoading ? (
        <div className='p-16 text-center bg-white rounded-2xl border border-gray-200 shadow-xs'>
          <Loader2 className='w-8 h-8 text-primary animate-spin mx-auto mb-3' />
          <p className='text-sm text-gray-500'>Calculating authoritative financial metrics...</p>
        </div>
      ) : isError ? (
        /* Error State */
        <div className='p-12 text-center max-w-md mx-auto bg-white rounded-2xl border border-red-200 shadow-xs'>
          <AlertCircle className='w-10 h-10 text-red-500 mx-auto mb-3' />
          <h3 className='text-base font-semibold text-gray-900 mb-1'>Failed to load finance summary</h3>
          <p className='text-xs text-gray-500 mb-4'>
            {(error as any)?.response?.data?.message || 'Unable to connect to financial aggregation service.'}
          </p>
          <button
            onClick={() => refetch()}
            className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
          >
            Retry
          </button>
        </div>
      ) : !summary ? (
        /* Empty State */
        <div className='p-12 text-center max-w-md mx-auto bg-white rounded-2xl border border-gray-200 shadow-xs'>
          <Banknote className='w-10 h-10 text-gray-400 mx-auto mb-3' />
          <h3 className='text-base font-semibold text-gray-900 mb-1'>No financial records found</h3>
          <p className='text-xs text-gray-500 mb-4'>No transaction history or revenue records are available yet.</p>
        </div>
      ) : (
        /* KPI Cards & Dashboard */
        <div className='space-y-6'>
          {/* Main Financial KPIs */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            {/* Gross Volume */}
            <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                  Gross Volume
                </span>
                <div className='w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center'>
                  <CreditCard className='w-4 h-4' />
                </div>
              </div>
              <div className='text-2xl font-bold text-gray-900'>
                {formatBDT(summary.totalGrossVolumeCents)}
              </div>
              <p className='text-xs text-gray-500'>
                Total payable amount of all finalized orders before refunds
              </p>
            </div>

            {/* Total Discounts */}
            <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                  Total Discounts
                </span>
                <div className='w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center'>
                  <Percent className='w-4 h-4' />
                </div>
              </div>
              <div className='text-2xl font-bold text-gray-900'>
                {formatBDT(summary.totalDiscountCents)}
              </div>
              <p className='text-xs text-gray-500'>
                Total savings applied through promotional and institutional coupons
              </p>
            </div>

            {/* Net Revenue */}
            <div className='bg-white p-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/30 shadow-xs space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-semibold text-emerald-800 uppercase tracking-wider'>
                  Net Revenue
                </span>
                <div className='w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center'>
                  <TrendingUp className='w-4 h-4' />
                </div>
              </div>
              <div className='text-2xl font-bold text-emerald-900'>
                {formatBDT(summary.totalNetRevenueCents)}
              </div>
              <p className='text-xs text-emerald-700'>
                Gross Volume minus confirmed processed refunds
              </p>
            </div>

            {/* Total Refunds */}
            <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                  Total Refunds
                </span>
                <div className='w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center'>
                  <RotateCcw className='w-4 h-4' />
                </div>
              </div>
              <div className='text-2xl font-bold text-gray-900'>
                {formatBDT(summary.totalRefundCents)}
              </div>
              <p className='text-xs text-gray-500'>
                Provider-confirmed refunds settled back to students
              </p>
            </div>
          </div>

          {/* Order Lifecycle Counts */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
            {/* Paid Orders */}
            <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3'>
              <div className='w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0'>
                <CheckCircle2 className='w-5 h-5' />
              </div>
              <div>
                <div className='text-xs text-gray-500 font-medium'>Paid Orders</div>
                <div className='text-xl font-bold text-gray-900'>{summary.totalPaidOrdersCount}</div>
              </div>
            </div>

            {/* Pending Orders */}
            <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3'>
              <div className='w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0'>
                <Clock className='w-5 h-5' />
              </div>
              <div>
                <div className='text-xs text-gray-500 font-medium'>Pending Orders</div>
                <div className='text-xl font-bold text-gray-900'>{summary.totalPendingOrdersCount}</div>
              </div>
            </div>

            {/* Refunded Orders */}
            <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3'>
              <div className='w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0'>
                <RotateCcw className='w-5 h-5' />
              </div>
              <div>
                <div className='text-xs text-gray-500 font-medium'>Refunded Orders</div>
                <div className='text-xl font-bold text-gray-900'>{summary.totalRefundedOrdersCount}</div>
              </div>
            </div>

            {/* Cancelled Orders */}
            <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center space-x-3'>
              <div className='w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0'>
                <XCircle className='w-5 h-5' />
              </div>
              <div>
                <div className='text-xs text-gray-500 font-medium'>Cancelled Orders</div>
                <div className='text-xl font-bold text-gray-900'>{summary.totalCancelledOrdersCount || 0}</div>
              </div>
            </div>
          </div>

          {/* Quick Action Cards */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 pt-2'>
            <Link
              href='/admin/finance/orders'
              className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:border-primary/50 transition group flex flex-col justify-between space-y-4'
            >
              <div className='space-y-1'>
                <div className='flex items-center space-x-2 text-primary font-semibold text-sm'>
                  <ShoppingCart className='w-4 h-4' />
                  <span>Orders & Payment Explorer</span>
                </div>
                <p className='text-xs text-gray-500 leading-relaxed'>
                  Search, filter, inspect student payment attempts, and verify transaction states with full historical fidelity.
                </p>
              </div>
              <div className='flex items-center text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform'>
                <span>Open Orders Explorer</span>
                <ArrowRight className='w-4 h-4 ml-1' />
              </div>
            </Link>

            <Link
              href='/admin/finance/reconciliation'
              className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs hover:border-primary/50 transition group flex flex-col justify-between space-y-4'
            >
              <div className='space-y-1'>
                <div className='flex items-center space-x-2 text-amber-600 font-semibold text-sm'>
                  <RotateCcw className='w-4 h-4' />
                  <span>Reconciliation & Refund Operations</span>
                </div>
                <p className='text-xs text-gray-500 leading-relaxed'>
                  Review manual discrepancy cases, query SSLCommerz settlement clearing states, and link provider references.
                </p>
              </div>
              <div className='flex items-center text-xs font-semibold text-amber-600 group-hover:translate-x-1 transition-transform'>
                <span>Review Discrepancies</span>
                <ArrowRight className='w-4 h-4 ml-1' />
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Export CSV Modal */}
      {isExportModalOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in'>
          <div className='bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-xl border border-gray-100 relative space-y-6'>
            <div className='flex items-center justify-between border-b border-gray-100 pb-4'>
              <div className='flex items-center space-x-2.5'>
                <div className='w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center'>
                  <FileSpreadsheet className='w-5 h-5' />
                </div>
                <div>
                  <h3 className='text-lg font-bold text-gray-900'>Export Financial CSV</h3>
                  <p className='text-xs text-gray-500'>Stream authoritative records for auditing and reporting.</p>
                </div>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className='text-gray-400 hover:text-gray-600 transition p-1.5 rounded-lg hover:bg-gray-100'
                aria-label='Close export dialog'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            {/* Error & Success Messages */}
            {exportError && (
              <div className='p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start justify-between'>
                <span>{exportError}</span>
                <button
                  onClick={() => setExportError(null)}
                  className='ml-2 text-red-500 hover:text-red-700 text-sm font-bold'
                  aria-label='Dismiss export error'
                >
                  ×
                </button>
              </div>
            )}
            {exportSuccess && (
              <div className='p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2'>
                <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
                <span>{exportSuccess}</span>
              </div>
            )}

            {/* Export Type Selection */}
            <div className='space-y-2'>
              <label className='text-xs font-bold text-gray-700 uppercase tracking-wider'>
                Export Type
              </label>
              <div className='grid grid-cols-3 gap-2'>
                {[
                  { id: 'orders', label: 'Orders' },
                  { id: 'refunds', label: 'Refunds' },
                  { id: 'reconciliation', label: 'Reconciliation' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type='button'
                    onClick={() => {
                      setExportType(t.id as FinanceExportType);
                      setExportError(null);
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition ${
                      exportType === t.id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range Controls */}
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <label className='text-xs font-bold text-gray-700 uppercase tracking-wider'>
                  Date Range (Max 90 Days)
                </label>
                <div className='flex space-x-1.5'>
                  <button
                    type='button'
                    onClick={() => handleQuickPreset(7)}
                    className='text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition'
                  >
                    7D
                  </button>
                  <button
                    type='button'
                    onClick={() => handleQuickPreset(30)}
                    className='text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition'
                  >
                    30D
                  </button>
                  <button
                    type='button'
                    onClick={() => handleQuickPreset(90)}
                    className='text-[10px] font-medium px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition'
                  >
                    90D
                  </button>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <span className='text-[11px] text-gray-500 block mb-1'>Start Date</span>
                  <input
                    type='date'
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setExportError(null);
                    }}
                    className='w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20'
                    aria-label='Export Start Date'
                  />
                </div>
                <div>
                  <span className='text-[11px] text-gray-500 block mb-1'>End Date</span>
                  <input
                    type='date'
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setExportError(null);
                    }}
                    className='w-full text-xs px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20'
                    aria-label='Export End Date'
                  />
                </div>
              </div>
              <p className='text-[11px] text-gray-400'>
                Server enforces UTC boundaries, RFC 4180 escaping, and a 10,000 row safety limit.
              </p>
            </div>

            {/* Actions */}
            <div className='flex items-center justify-end space-x-2 pt-2 border-t border-gray-100'>
              <button
                type='button'
                onClick={() => setIsExportModalOpen(false)}
                className='px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleDownloadCsv}
                disabled={isExporting}
                className='inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition shadow-xs'
                aria-label='Download CSV'
              >
                {isExporting ? (
                  <>
                    <Loader2 className='w-3.5 h-3.5 animate-spin' />
                    <span>Generating CSV...</span>
                  </>
                ) : (
                  <>
                    <Download className='w-3.5 h-3.5' />
                    <span>Download CSV</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
