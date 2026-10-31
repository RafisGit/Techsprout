'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { fetchStudentOrders } from '@/lib/api/orders';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/client';
import {
  ShoppingBag,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Receipt,
  LogIn,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import type { OrderStatus, OrderListItemDto } from '@techsprout/contracts';

type FilterTab = 'ALL' | 'PAID' | 'PENDING' | 'CANCELLED' | 'REFUNDED';

export function getOrderStatusBadge(status: OrderStatus, tOrders?: any) {
  const getLabel = () => {
    if (tOrders) {
      switch (status) {
        case 'PAID': return tOrders.paid;
        case 'PENDING': return tOrders.pending;
        case 'PAYMENT_PROCESSING': return tOrders.processing;
        case 'REFUNDED': return tOrders.refunded;
        case 'CANCELLED': return tOrders.cancelled;
        case 'FAILED': return tOrders.failed;
        default: return status;
      }
    }
    switch (status) {
      case 'PAID': return 'Paid';
      case 'PENDING': return 'Pending';
      case 'PAYMENT_PROCESSING': return 'Processing';
      case 'REFUNDED': return 'Refunded';
      case 'CANCELLED': return 'Cancelled';
      case 'FAILED': return 'Failed';
      default: return status;
    }
  };

  switch (status) {
    case 'PAID':
      return (
        <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80'>
          <CheckCircle2 className='w-3.5 h-3.5' />
          {getLabel()}
        </span>
      );
    case 'PENDING':
      return (
        <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80'>
          <Clock className='w-3.5 h-3.5' />
          {getLabel()}
        </span>
      );
    case 'PAYMENT_PROCESSING':
      return (
        <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80'>
          <RefreshCw className='w-3.5 h-3.5 animate-spin' />
          {getLabel()}
        </span>
      );
    case 'REFUNDED':
      return (
        <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200/80'>
          <RotateCcw className='w-3.5 h-3.5' />
          {getLabel()}
        </span>
      );
    case 'CANCELLED':
      return (
        <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200/80'>
          <XCircle className='w-3.5 h-3.5' />
          {getLabel()}
        </span>
      );
    case 'FAILED':
      return (
        <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80'>
          <AlertCircle className='w-3.5 h-3.5' />
          {getLabel()}
        </span>
      );
    default:
      return (
        <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200/80'>
          {status}
        </span>
      );
  }
}

export default function StudentOrdersPage() {
  const { t, formatDate, formatNumber, formatCurrency } = useTranslation();
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filterTabs: { label: string; value: FilterTab }[] = [
    { label: t.orders.all, value: 'ALL' },
    { label: t.orders.paid, value: 'PAID' },
    { label: t.orders.pending, value: 'PENDING' },
    { label: t.orders.cancelled, value: 'CANCELLED' },
    { label: t.orders.refunded, value: 'REFUNDED' },
  ];

  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  const {
    data: ordersData,
    isLoading: isOrdersLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['studentOrders', activeTab, currentPage],
    queryFn: () =>
      fetchStudentOrders({
        status: activeTab === 'ALL' ? undefined : (activeTab as OrderStatus),
        page: currentPage,
        limit: pageSize,
      }),
    enabled: !!currentUser,
    staleTime: 30 * 1000,
  });

  const isLoading = isAuthLoading || (!!currentUser && isOrdersLoading);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  return (
    <div className='min-h-screen bg-[#F8FAFC] pb-24'>
      <Hero pageName={t.orders.orderHistory} />

      <main className='container mx-auto px-4 max-w-7xl pt-10 sm:pt-12'>
        {/* Unauthenticated State */}
        {!isAuthLoading && !currentUser && (
          <div className='max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
            <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
              <Receipt className='w-8 h-8' />
            </div>
            <Title h={2} className='text-2xl font-bold text-gray-900'>
              {t.orders.signInToView}
            </Title>
            <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
              {t.orders.signInToViewDesc}
            </p>
            <div className='pt-2'>
              <Link href='/login?redirect=/orders'>
                <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90 shadow-sm'>
                  <LogIn className='w-4 h-4 mr-2' />
                  {t.orders.loginToContinue}
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Authenticated State */}
        {currentUser && (
          <div className='space-y-6'>
            {/* Header Title & Subtitle */}
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
              <div>
                <h1 className='text-2xl sm:text-3xl font-bold text-gray-900'>
                  {t.orders.purchaseHistory}
                </h1>
                <p className='text-xs sm:text-sm text-gray-500 mt-1'>
                  {t.orders.purchaseHistorySubtitle}
                </p>
              </div>

              <Link href='/courses'>
                <Button variant='outline' className='rounded-xl text-xs font-semibold'>
                  <ShoppingBag className='w-4 h-4 mr-2' />
                  {t.orders.browseCatalog}
                </Button>
              </Link>
            </div>

            {/* Filter Tabs */}
            <div className='flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200/80'>
              {filterTabs.map((tab) => {
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => handleTabChange(tab.value)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200/80'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Error State */}
            {isError && (
              <div className='p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3'>
                <AlertCircle className='w-8 h-8 text-red-600 mx-auto' />
                <h3 className='text-sm font-bold text-red-900'>{t.orders.failedToLoad}</h3>
                <p className='text-xs text-red-700 max-w-md mx-auto'>
                  {(error as any)?.response?.data?.message || t.orders.failedToLoadDesc}
                </p>
                <Button
                  onClick={() => refetch()}
                  variant='outline'
                  size='sm'
                  className='rounded-xl text-xs font-semibold'
                >
                  <RefreshCw className='w-3.5 h-3.5 mr-1.5' />
                  {t.orders.retry}
                </Button>
              </div>
            )}

            {/* Loading State Skeletons */}
            {isLoading && (
              <div className='space-y-4' data-testid='orders-loading-skeleton'>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className='bg-white rounded-2xl p-6 border border-gray-200/80 shadow-xs animate-pulse space-y-4'
                  >
                    <div className='flex justify-between items-center'>
                      <div className='h-4 bg-gray-200 rounded-md w-36'></div>
                      <div className='h-6 bg-gray-200 rounded-full w-20'></div>
                    </div>
                    <div className='h-6 bg-gray-200 rounded-md w-3/4'></div>
                    <div className='flex justify-between items-center pt-2'>
                      <div className='h-4 bg-gray-200 rounded-md w-28'></div>
                      <div className='h-8 bg-gray-200 rounded-xl w-24'></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !isError && ordersData?.items?.length === 0 && (
              <div className='bg-white rounded-3xl p-12 border border-gray-200/80 shadow-xs text-center space-y-4 my-8'>
                <div className='w-16 h-16 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto'>
                  <Receipt className='w-8 h-8' />
                </div>
                <h3 className='text-lg font-bold text-gray-900'>{t.orders.noOrdersTitle}</h3>
                <p className='text-xs sm:text-sm text-gray-500 max-w-md mx-auto'>
                  {activeTab === 'ALL'
                    ? t.orders.noOrdersExplore
                    : t.orders.noOrdersMatchingFilter.replace('{filter}', activeTab.toLowerCase())}
                </p>
                <div className='pt-2'>
                  <Link href='/courses'>
                    <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90 shadow-sm'>
                      {t.orders.exploreCourses}
                      <ArrowRight className='w-4 h-4 ml-2' />
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Orders List */}
            {!isLoading && !isError && ordersData?.items && ordersData.items.length > 0 && (
              <div className='space-y-4'>
                {ordersData.items.map((order: OrderListItemDto) => (
                  <div
                    key={order.id}
                    className='bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/80 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-4'
                    data-testid={`order-card-${order.id}`}
                  >
                    {/* Left: Metadata & Course Details */}
                    <div className='space-y-2 flex-1 min-w-0'>
                      <div className='flex flex-wrap items-center gap-2.5'>
                        <span className='font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md'>
                          {order.orderNumber}
                        </span>
                        <span className='text-xs text-gray-400'>•</span>
                        <span className='text-xs text-gray-500'>
                          {formatDate(order.createdAt)}
                        </span>
                        {getOrderStatusBadge(order.status, t.orders)}
                      </div>

                      <h2 className='text-base sm:text-lg font-bold text-gray-900 truncate hover:text-primary transition-colors'>
                        <Link href={`/orders/${order.id}`}>{order.courseTitle}</Link>
                      </h2>

                      {order.paidAt && (
                        <p className='text-xs text-gray-500'>
                          {t.orders.paidOn.replace('{date}', formatDate(order.paidAt))}
                        </p>
                      )}
                    </div>

                    {/* Right: Pricing & Navigation CTA */}
                    <div className='flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100'>
                      <div className='text-left md:text-right'>
                        <span className='text-[10px] uppercase font-bold text-gray-400 tracking-wider block'>
                          {t.orders.amountPaid}
                        </span>
                        <span className='text-base sm:text-lg font-extrabold text-gray-900'>
                          {formatCurrency(order.payableCents / 100, order.currency)}
                        </span>
                      </div>

                      <div className='flex items-center gap-2'>
                        <Link href={`/orders/${order.id}`}>
                          <Button
                            variant='outline'
                            size='sm'
                            className='rounded-xl text-xs font-semibold'
                            data-testid={`view-order-btn-${order.id}`}
                          >
                            <Eye className='w-3.5 h-3.5 mr-1.5' />
                            {t.orders.details}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pagination Controls */}
                {ordersData.pagination && ordersData.pagination.totalPages > 1 && (
                  <div className='flex flex-col sm:flex-row items-center justify-between gap-4 pt-6'>
                    <p className='text-xs text-gray-500'>
                      {t.orders.showingPage
                        .replace('{page}', formatNumber(ordersData.pagination.page))
                        .replace('{totalPages}', formatNumber(ordersData.pagination.totalPages))
                        .replace('{total}', formatNumber(ordersData.pagination.total))}
                    </p>

                    <div className='flex items-center gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={!ordersData.pagination.hasPreviousPage}
                        className='rounded-xl text-xs font-semibold'
                        data-testid='orders-prev-page-btn'
                      >
                        <ChevronLeft className='w-4 h-4 mr-1' />
                        {t.orders.previous}
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setCurrentPage((p) => p + 1)}
                        disabled={!ordersData.pagination.hasNextPage}
                        className='rounded-xl text-xs font-semibold'
                        data-testid='orders-next-page-btn'
                      >
                        {t.orders.next}
                        <ChevronRight className='w-4 h-4 ml-1' />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
