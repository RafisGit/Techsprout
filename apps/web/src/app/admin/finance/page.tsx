'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinanceSummary, formatBDT } from '@/lib/api/finance';
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
} from 'lucide-react';

export default function AdminFinanceDashboardPage() {
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

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
    </div>
  );
}
