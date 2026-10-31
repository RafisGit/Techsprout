'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  deleteAdminCoupon,
  formatBDT,
} from '@/lib/api/finance';
import { fetchAdminCourses } from '@/lib/api/catalog';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useTranslation } from '@/i18n/client';
import Link from 'next/link';
import {
  Ticket,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  Loader2,
  ShieldAlert,
  X,
  Calendar,
  Percent,
  Banknote,
  Globe,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Power,
} from 'lucide-react';
import type {
  CouponDto,
  CouponDiscountType,
  CreateCouponRequest,
  UpdateCouponRequest,
} from '@techsprout/contracts';

export default function AdminCouponsPage() {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const { t, locale, formatNumber, formatDate, formatCurrency } = useTranslation();

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all');
  const [courseFilter, setCourseFilter] = useState<string>('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponDto | null>(null);

  // Form Fields State
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState<number | ''>(10);
  const [minOrderAmountBDT, setMinOrderAmountBDT] = useState<number | ''>('');
  const [maxDiscountAmountBDT, setMaxDiscountAmountBDT] = useState<number | ''>('');
  const [courseId, setCourseId] = useState<string>('');
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [perUserLimit, setPerUserLimit] = useState<number>(1);
  const [startsAt, setStartsAt] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Error & Feedback state
  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 1. Fetch Coupons List
  const {
    data: couponsData,
    isLoading: isLoadingCoupons,
    isError: isCouponsError,
    error: couponsError,
    refetch: refetchCoupons,
  } = useQuery({
    queryKey: [
      'admin',
      'coupons',
      {
        page,
        limit,
        search: searchTerm.trim() || undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'true',
        courseId: courseFilter || undefined,
      },
    ],
    queryFn: () =>
      fetchAdminCoupons({
        page,
        limit,
        search: searchTerm.trim() || undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'true',
        courseId: courseFilter || undefined,
      }),
    enabled: isAdmin,
  });

  // 2. Fetch Courses for Course Scope Select
  const { data: coursesData } = useQuery({
    queryKey: ['admin', 'courses', 'simple-list'],
    queryFn: () => fetchAdminCourses({ limit: 100 }),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const invalidateCoupons = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
  };

  // 3. Create Mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCouponRequest) => createAdminCoupon(data),
    onSuccess: () => {
      setSuccessBanner(t('admin.coupons.createSuccess'));
      setIsCreateModalOpen(false);
      resetForm();
      invalidateCoupons();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFormError(resp?.message || err?.message || 'Failed to create coupon');
    },
  });

  // 4. Update Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCouponRequest }) =>
      updateAdminCoupon(id, data),
    onSuccess: () => {
      setSuccessBanner(t('admin.coupons.updateSuccess'));
      setEditingCoupon(null);
      resetForm();
      invalidateCoupons();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFormError(resp?.message || err?.message || 'Failed to update coupon');
    },
  });

  // 5. Toggle Active Status directly
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateAdminCoupon(id, { isActive: active }),
    onSuccess: () => {
      invalidateCoupons();
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setActionError(resp?.message || err?.message || 'Failed to toggle coupon status');
    },
  });

  // 6. Disable / Soft-Delete Mutation
  const disableMutation = useMutation({
    mutationFn: (id: string) => deleteAdminCoupon(id),
    onSuccess: () => {
      setSuccessBanner(t('admin.coupons.deleteSuccess'));
      invalidateCoupons();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setActionError(resp?.message || err?.message || 'Failed to archive coupon');
    },
  });

  const resetForm = () => {
    setCode('');
    setDiscountType('PERCENTAGE');
    setDiscountValue(10);
    setMinOrderAmountBDT('');
    setMaxDiscountAmountBDT('');
    setCourseId('');
    setUsageLimit('');
    setPerUserLimit(1);
    setStartsAt('');
    setExpiresAt('');
    setIsActive(true);
    setFormError(null);
  };

  const openCreateModal = () => {
    resetForm();
    const now = new Date();
    setStartsAt(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setIsCreateModalOpen(true);
  };

  const openEditModal = (coupon: CouponDto) => {
    resetForm();
    setEditingCoupon(coupon);
    setCode(coupon.code);
    setDiscountType(coupon.discountType);
    setDiscountValue(
      coupon.discountType === 'PERCENTAGE' ? coupon.discountValue : coupon.discountValue / 100
    );
    setMinOrderAmountBDT(
      coupon.minOrderAmountCents > 0 ? coupon.minOrderAmountCents / 100 : ''
    );
    setMaxDiscountAmountBDT(
      coupon.maxDiscountAmountCents ? coupon.maxDiscountAmountCents / 100 : ''
    );
    setCourseId(coupon.courseId || '');
    setUsageLimit(coupon.usageLimit != null ? coupon.usageLimit : '');
    setPerUserLimit(coupon.perUserLimit ?? 1);

    if (coupon.startsAt) {
      const s = new Date(coupon.startsAt);
      setStartsAt(new Date(s.getTime() - s.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    if (coupon.expiresAt) {
      const e = new Date(coupon.expiresAt);
      setExpiresAt(new Date(e.getTime() - e.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    setIsActive(coupon.isActive);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!code.trim() || code.length < 3) {
      setFormError('Coupon code must be at least 3 characters.');
      return;
    }
    if (!discountValue || Number(discountValue) <= 0) {
      setFormError('Discount value must be greater than zero.');
      return;
    }
    if (discountType === 'PERCENTAGE' && Number(discountValue) > 100) {
      setFormError('Percentage discount cannot exceed 100%.');
      return;
    }

    const payload: CreateCouponRequest = {
      code: code.trim().toUpperCase(),
      discountType,
      discountValue:
        discountType === 'PERCENTAGE'
          ? Number(discountValue)
          : Math.round(Number(discountValue) * 100),
      minOrderAmountCents: minOrderAmountBDT ? Math.round(Number(minOrderAmountBDT) * 100) : 0,
      maxDiscountAmountCents: maxDiscountAmountBDT
        ? Math.round(Number(maxDiscountAmountBDT) * 100)
        : undefined,
      courseId: courseId.trim() || undefined,
      usageLimit: usageLimit !== '' ? Number(usageLimit) : undefined,
      perUserLimit: perUserLimit ? Number(perUserLimit) : 1,
      startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      isActive,
    };

    createMutation.mutate(payload);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon) return;
    setFormError(null);

    const payload: UpdateCouponRequest = {
      minOrderAmountCents: minOrderAmountBDT ? Math.round(Number(minOrderAmountBDT) * 100) : 0,
      maxDiscountAmountCents: maxDiscountAmountBDT
        ? Math.round(Number(maxDiscountAmountBDT) * 100)
        : null,
      usageLimit: usageLimit !== '' ? Number(usageLimit) : null,
      perUserLimit: perUserLimit ? Number(perUserLimit) : 1,
      startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      isActive,
    };

    updateMutation.mutate({ id: editingCoupon.id, data: payload });
  };

  // Authorization Guard
  if (!isLoadingUser && !isAdmin) {
    return (
      <div className='max-w-2xl mx-auto p-8 bg-red-50 border border-red-200 text-red-800 rounded-2xl shadow-xs text-center'>
        <ShieldAlert className='w-12 h-12 text-red-600 mx-auto mb-3' />
        <h2 className='text-xl font-bold mb-1'>{t('admin.nav.accessDeniedTitle')}</h2>
        <p className='text-xs text-gray-600 mb-4'>
          {t('admin.nav.accessDeniedDesc')}
        </p>
        <Link
          href='/dashboard'
          className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
        >
          {t('admin.nav.returnToDashboard')}
        </Link>
      </div>
    );
  }

  const items = couponsData?.items || [];
  const pagination = couponsData?.pagination;
  const courseOptions = coursesData?.items || [];

  return (
    <div className='space-y-6'>
      {/* Top Banner */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
            {t('admin.coupons.title')}
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            {t('admin.coupons.subtitle')}
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className='inline-flex items-center space-x-2 px-4 py-2.5 bg-primary text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs'
        >
          <Plus className='w-4 h-4' />
          <span>{t('admin.coupons.newCoupon')}</span>
        </button>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className='p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-sm animate-in fade-in'>
          <div className='flex items-center space-x-2'>
            <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className='text-xs font-semibold hover:underline'
          >
            {t('admin.categories.dismiss')}
          </button>
        </div>
      )}

      {actionError && (
        <div className='p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between text-sm animate-in fade-in'>
          <div className='flex items-center space-x-2'>
            <AlertCircle className='w-4 h-4 text-red-500 shrink-0' />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className='text-xs font-semibold hover:underline'
          >
            {t('admin.categories.dismiss')}
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className='bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div className='flex flex-col sm:flex-row items-center gap-3 flex-1'>
          {/* Search Code */}
          <div className='relative w-full sm:max-w-xs'>
            <Search className='w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400' />
            <input
              type='text'
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder={t('admin.coupons.searchPlaceholder')}
              className='w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary'
            />
          </div>

          {/* Active Filter Buttons */}
          <div className='flex items-center space-x-1.5'>
            <button
              onClick={() => {
                setActiveFilter('all');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeFilter === 'all'
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('admin.coupons.allStatus')}
            </button>
            <button
              onClick={() => {
                setActiveFilter('true');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeFilter === 'true'
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('admin.coupons.activeStatus')}
            </button>
            <button
              onClick={() => {
                setActiveFilter('false');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeFilter === 'false'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('admin.coupons.inactiveStatus')}
            </button>
          </div>
        </div>

        {/* Course Scope Filter */}
        <div className='w-full sm:w-auto'>
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            className='w-full sm:w-64 px-3 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white'
          >
            <option value=''>{t('admin.coupons.allCourses')}</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Coupons Table */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        {isLoadingCoupons ? (
          <div className='p-16 text-center'>
            <Loader2 className='w-8 h-8 text-primary animate-spin mx-auto mb-3' />
            <p className='text-sm text-gray-500'>Loading...</p>
          </div>
        ) : isCouponsError ? (
          <div className='p-12 text-center max-w-md mx-auto'>
            <AlertCircle className='w-10 h-10 text-red-500 mx-auto mb-3' />
            <h3 className='text-base font-semibold text-gray-900 mb-1'>{t('admin.overview.errorLoading')}</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {(couponsError as any)?.response?.data?.message || 'Network error fetching coupons.'}
            </p>
            <button
              onClick={() => refetchCoupons()}
              className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              {t('admin.overview.retry')}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className='p-16 text-center max-w-md mx-auto'>
            <div className='w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400'>
              <Ticket className='w-6 h-6' />
            </div>
            <h3 className='text-base font-semibold text-gray-900 mb-1'>{t('admin.coupons.noCoupons')}</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {searchTerm || activeFilter !== 'all' || courseFilter
                ? t('admin.overview.noCoursesFound')
                : t('admin.coupons.noCouponsDesc')}
            </p>
            <button
              onClick={openCreateModal}
              className='inline-flex items-center space-x-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              <Plus className='w-3.5 h-3.5' />
              <span>{t('admin.coupons.newCoupon')}</span>
            </button>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm text-gray-600'>
              <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
                <tr>
                  <th scope='col' className='px-4 py-3.5'>{t('admin.coupons.thCode')}</th>
                  <th scope='col' className='px-4 py-3.5'>{t('admin.coupons.thDiscount')}</th>
                  <th scope='col' className='px-4 py-3.5'>{t('admin.coupons.thScope')}</th>
                  <th scope='col' className='px-4 py-3.5'>{t('admin.coupons.thUsage')}</th>
                  <th scope='col' className='px-4 py-3.5'>{t('admin.coupons.thValidity')}</th>
                  <th scope='col' className='px-4 py-3.5 text-center'>{t('admin.coupons.thStatus')}</th>
                  <th scope='col' className='px-4 py-3.5 text-right'>{t('admin.coupons.thActions')}</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {items.map((c: CouponDto) => {
                  const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
                  const isNotStarted = new Date(c.startsAt) > new Date();

                  return (
                    <tr key={c.id} className='hover:bg-gray-50/60 transition-colors'>
                      <td className='px-4 py-3.5 whitespace-nowrap font-mono font-bold text-gray-900 text-sm'>
                        {c.code}
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap'>
                        <span className='font-semibold text-gray-900'>
                          {c.discountType === 'PERCENTAGE'
                            ? `${formatNumber(c.discountValue)}% OFF`
                            : `${formatCurrency(c.discountValue / 100, 'BDT')} OFF`}
                        </span>
                        {c.minOrderAmountCents > 0 && (
                          <div className='text-[11px] text-gray-500'>
                            {t('admin.coupons.thMinOrder')}: {formatCurrency(c.minOrderAmountCents / 100, 'BDT')}
                          </div>
                        )}
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap text-xs'>
                        {c.courseTitle ? (
                          <div className='flex items-center space-x-1 text-gray-800 font-medium max-w-xs truncate'>
                            <BookOpen className='w-3.5 h-3.5 text-primary shrink-0' />
                            <span className='truncate'>{c.courseTitle}</span>
                          </div>
                        ) : (
                          <div className='flex items-center space-x-1 text-emerald-700 font-semibold'>
                            <Globe className='w-3.5 h-3.5 shrink-0' />
                            <span>{t('admin.coupons.sitewide')}</span>
                          </div>
                        )}
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap text-xs'>
                        <span className='font-bold text-gray-900'>{formatNumber(c.redemptionCount)}</span>
                        <span className='text-gray-500'>
                          {' '}
                          / {c.usageLimit != null ? formatNumber(c.usageLimit) : t('admin.coupons.unlimited')}
                        </span>
                        <div className='text-[10px] text-gray-400'>
                          {t('admin.coupons.perUserLimitLabel')}: {formatNumber(c.perUserLimit)}
                        </div>
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap text-xs text-gray-500'>
                        <div>{formatDate(c.startsAt)}</div>
                        <div>
                          {c.expiresAt ? formatDate(c.expiresAt) : t('admin.coupons.noExpiry')}
                        </div>
                      </td>

                      <td className='px-4 py-3.5 text-center whitespace-nowrap'>
                        {isExpired ? (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200'>
                            {t('admin.status.archived')}
                          </span>
                        ) : isNotStarted ? (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200'>
                            {t('admin.status.pending')}
                          </span>
                        ) : c.isActive ? (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                            {t('admin.status.active')}
                          </span>
                        ) : (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200'>
                            {t('admin.status.inactive')}
                          </span>
                        )}
                      </td>

                      <td className='px-4 py-3.5 text-right whitespace-nowrap'>
                        <div className='flex items-center justify-end space-x-1.5'>
                          {/* Toggle Active */}
                          <button
                            onClick={() =>
                              toggleActiveMutation.mutate({ id: c.id, active: !c.isActive })
                            }
                            className={`p-1.5 rounded-lg transition ${
                              c.isActive
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title='Toggle Status'
                          >
                            <Power className='w-4 h-4' />
                          </button>

                          {/* Edit Coupon */}
                          <button
                            onClick={() => openEditModal(c)}
                            className='p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition'
                            title={t('admin.coupons.editModalTitle', { code: c.code })}
                          >
                            <Edit2 className='w-4 h-4' />
                          </button>

                          {/* Soft Delete */}
                          <button
                            onClick={() => {
                              if (confirm(t('admin.coupons.deleteConfirm', { code: c.code }))) {
                                disableMutation.mutate(c.id);
                              }
                            }}
                            className='p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition'
                            title={t('admin.courses.delete')}
                          >
                            <Trash2 className='w-4 h-4' />
                          </button>
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
              {t('admin.overview.pageOf', { page: formatNumber(pagination.page), totalPages: formatNumber(pagination.totalPages) })} ({formatNumber(pagination.total)} {t('admin.nav.coupons')})
            </div>

            <div className='flex items-center space-x-2'>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPreviousPage}
                className='px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 transition'
              >
                {t('admin.overview.prev')}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasNextPage}
                className='px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 transition'
              >
                {t('admin.overview.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4'>
          <div className='bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4 animate-in fade-in zoom-in-95'>
            <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
              <h3 className='text-lg font-bold text-gray-900'>{t('admin.coupons.createModalTitle')}</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className='text-gray-400 hover:text-gray-600 p-1 rounded-lg'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            {formError && (
              <div className='p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center space-x-2'>
                <AlertCircle className='w-4 h-4 shrink-0' />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className='space-y-4'>
              {/* Code */}
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  {t('admin.coupons.codeLabel')} <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={t('admin.coupons.codePlaceholder')}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>

              {/* Discount Type & Value */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.typeLabel')}
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white'
                  >
                    <option value='PERCENTAGE'>{t('admin.coupons.typePercentage')}</option>
                    <option value='FIXED_AMOUNT'>{t('admin.coupons.typeFixed')}</option>
                  </select>
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.valueLabel')}{' '}
                    <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='number'
                    required
                    min='1'
                    max={discountType === 'PERCENTAGE' ? '100' : undefined}
                    value={discountValue}
                    onChange={(e) =>
                      setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder={discountType === 'PERCENTAGE' ? '10' : '500'}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Course Scope */}
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1'>
                  {t('admin.coupons.courseScopeLabel')}
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white'
                >
                  <option value=''>{t('admin.coupons.sitewide')}</option>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Min Order & Max Discount */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.minOrderLabel')}
                  </label>
                  <input
                    type='number'
                    min='0'
                    value={minOrderAmountBDT}
                    onChange={(e) =>
                      setMinOrderAmountBDT(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='0'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.maxDiscountLabel')}
                  </label>
                  <input
                    type='number'
                    min='0'
                    value={maxDiscountAmountBDT}
                    onChange={(e) =>
                      setMaxDiscountAmountBDT(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='0'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Limits */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.usageLimitLabel')}
                  </label>
                  <input
                    type='number'
                    min='1'
                    value={usageLimit}
                    onChange={(e) =>
                      setUsageLimit(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder={t('admin.coupons.unlimited')}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.perUserLimitLabel')}
                  </label>
                  <input
                    type='number'
                    min='1'
                    value={perUserLimit}
                    onChange={(e) => setPerUserLimit(Number(e.target.value))}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Dates */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.startsAtLabel')} <span className='text-red-500'>*</span>
                  </label>
                  <input
                    type='datetime-local'
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className='w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.expiresAtLabel')}
                  </label>
                  <input
                    type='datetime-local'
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className='w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className='flex items-center space-x-2 pt-1'>
                <input
                  type='checkbox'
                  id='isActiveCreate'
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className='w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary'
                />
                <label htmlFor='isActiveCreate' className='text-xs font-semibold text-gray-700'>
                  {t('admin.coupons.isActiveLabel')}
                </label>
              </div>

              <div className='flex items-center justify-end space-x-2 pt-3 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setIsCreateModalOpen(false)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  {t('admin.courseForm.cancel')}
                </button>
                <button
                  type='submit'
                  disabled={createMutation.isPending}
                  className='px-5 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50'
                >
                  {createMutation.isPending ? t('admin.categories.saving') : t('admin.coupons.createCoupon')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingCoupon && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4'>
          <div className='bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4 animate-in fade-in zoom-in-95'>
            <div className='flex items-center justify-between border-b border-gray-100 pb-3'>
              <div>
                <h3 className='text-lg font-bold text-gray-900 flex items-center space-x-2'>
                  <span>{t('admin.coupons.editModalTitle', { code: editingCoupon.code })}</span>
                </h3>
              </div>
              <button
                onClick={() => setEditingCoupon(null)}
                className='text-gray-400 hover:text-gray-600 p-1 rounded-lg'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            {formError && (
              <div className='p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center space-x-2'>
                <AlertCircle className='w-4 h-4 shrink-0' />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className='space-y-4'>
              {/* Min Order & Max Discount */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.minOrderLabel')}
                  </label>
                  <input
                    type='number'
                    min='0'
                    value={minOrderAmountBDT}
                    onChange={(e) =>
                      setMinOrderAmountBDT(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='0'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.maxDiscountLabel')}
                  </label>
                  <input
                    type='number'
                    min='0'
                    value={maxDiscountAmountBDT}
                    onChange={(e) =>
                      setMaxDiscountAmountBDT(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='0'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Limits */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.usageLimitLabel')}
                  </label>
                  <input
                    type='number'
                    min={editingCoupon.redemptionCount}
                    value={usageLimit}
                    onChange={(e) =>
                      setUsageLimit(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder={t('admin.coupons.unlimited')}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.perUserLimitLabel')}
                  </label>
                  <input
                    type='number'
                    min='1'
                    value={perUserLimit}
                    onChange={(e) => setPerUserLimit(Number(e.target.value))}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Dates */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.startsAtLabel')}
                  </label>
                  <input
                    type='datetime-local'
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className='w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {t('admin.coupons.expiresAtLabel')}
                  </label>
                  <input
                    type='datetime-local'
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className='w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className='flex items-center space-x-2 pt-1'>
                <input
                  type='checkbox'
                  id='isActiveEdit'
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className='w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary'
                />
                <label htmlFor='isActiveEdit' className='text-xs font-semibold text-gray-700'>
                  {t('admin.coupons.isActiveLabel')}
                </label>
              </div>

              <div className='flex items-center justify-end space-x-2 pt-3 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setEditingCoupon(null)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  {t('admin.courseForm.cancel')}
                </button>
                <button
                  type='submit'
                  disabled={updateMutation.isPending}
                  className='px-5 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50'
                >
                  {updateMutation.isPending ? t('admin.categories.saving') : t('admin.coupons.saveCoupon')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
