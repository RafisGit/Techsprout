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

  // 2. Fetch Course options for course scope filter & form dropdown
  const { data: coursesData } = useQuery({
    queryKey: ['admin', 'courses', 'options'],
    queryFn: () => fetchAdminCourses({ limit: 100 }),
    enabled: isAdmin,
  });

  const invalidateCoupons = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
  };

  // Create Coupon Mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCouponRequest) => createAdminCoupon(data),
    onSuccess: (data) => {
      setSuccessBanner(`Coupon "${data.code}" created successfully.`);
      setIsCreateModalOpen(false);
      resetForm();
      invalidateCoupons();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFormError(resp?.message || err?.message || 'Failed to create coupon.');
    },
  });

  // Update Coupon Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCouponRequest }) =>
      updateAdminCoupon(id, data),
    onSuccess: (data) => {
      setSuccessBanner(`Coupon "${data.code}" updated successfully.`);
      setEditingCoupon(null);
      resetForm();
      invalidateCoupons();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setFormError(resp?.message || err?.message || 'Failed to update coupon.');
    },
  });

  // Disable / Soft-delete Coupon Mutation
  const disableMutation = useMutation({
    mutationFn: (id: string) => deleteAdminCoupon(id),
    onSuccess: (data) => {
      setSuccessBanner(`Coupon "${data.code}" disabled successfully.`);
      invalidateCoupons();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setActionError(resp?.message || err?.message || 'Failed to disable coupon.');
      setTimeout(() => setActionError(null), 4000);
    },
  });

  // Toggle Active directly Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateAdminCoupon(id, { isActive: active }),
    onSuccess: (data) => {
      setSuccessBanner(
        `Coupon "${data.code}" ${data.isActive ? 'activated' : 'disabled'} successfully.`
      );
      invalidateCoupons();
      setTimeout(() => setSuccessBanner(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setActionError(resp?.message || err?.message || 'Failed to update status.');
      setTimeout(() => setActionError(null), 4000);
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
    setStartsAt(new Date().toISOString().slice(0, 16));
    setExpiresAt('');
    setIsActive(true);
    setFormError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  const openEditModal = (c: CouponDto) => {
    setEditingCoupon(c);
    setCode(c.code);
    setDiscountType(c.discountType);
    setDiscountValue(
      c.discountType === 'PERCENTAGE' ? c.discountValue : c.discountValue / 100
    );
    setMinOrderAmountBDT(c.minOrderAmountCents > 0 ? c.minOrderAmountCents / 100 : '');
    setMaxDiscountAmountBDT(
      c.maxDiscountAmountCents ? c.maxDiscountAmountCents / 100 : ''
    );
    setCourseId(c.courseId || '');
    setUsageLimit(c.usageLimit ?? '');
    setPerUserLimit(c.perUserLimit || 1);
    setStartsAt(c.startsAt ? new Date(c.startsAt).toISOString().slice(0, 16) : '');
    setExpiresAt(c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 16) : '');
    setIsActive(c.isActive);
    setFormError(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length < 3) {
      setFormError('Coupon code must be at least 3 characters.');
      return;
    }

    const numDiscountValue = Number(discountValue);
    if (isNaN(numDiscountValue) || numDiscountValue <= 0) {
      setFormError('Discount value must be greater than zero.');
      return;
    }

    if (discountType === 'PERCENTAGE' && (numDiscountValue < 1 || numDiscountValue > 100)) {
      setFormError('Percentage discount must be between 1 and 100.');
      return;
    }

    const payload: CreateCouponRequest = {
      code: trimmedCode,
      discountType,
      discountValue:
        discountType === 'PERCENTAGE'
          ? Math.round(numDiscountValue)
          : Math.round(numDiscountValue * 100), // Poisha
      minOrderAmountCents: minOrderAmountBDT ? Math.round(Number(minOrderAmountBDT) * 100) : 0,
      maxDiscountAmountCents: maxDiscountAmountBDT
        ? Math.round(Number(maxDiscountAmountBDT) * 100)
        : null,
      courseId: courseId || null,
      usageLimit: usageLimit !== '' ? Number(usageLimit) : null,
      perUserLimit: Number(perUserLimit) || 1,
      startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      isActive,
    };

    createMutation.mutate(payload);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editingCoupon) return;

    if (usageLimit !== '' && Number(usageLimit) < editingCoupon.redemptionCount) {
      setFormError(
        `Usage limit cannot be lower than existing redemption count (${editingCoupon.redemptionCount}).`
      );
      return;
    }

    const payload: UpdateCouponRequest = {
      minOrderAmountCents: minOrderAmountBDT ? Math.round(Number(minOrderAmountBDT) * 100) : 0,
      maxDiscountAmountCents: maxDiscountAmountBDT
        ? Math.round(Number(maxDiscountAmountBDT) * 100)
        : null,
      usageLimit: usageLimit !== '' ? Number(usageLimit) : null,
      perUserLimit: Number(perUserLimit) || 1,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      isActive,
    };

    updateMutation.mutate({ id: editingCoupon.id, data: payload });
  };

  // Guard non-admin users
  if (!isLoadingUser && !isAdmin) {
    return (
      <div className='max-w-2xl mx-auto p-8 bg-red-50 border border-red-200 text-red-800 rounded-2xl shadow-xs text-center'>
        <ShieldAlert className='w-12 h-12 text-red-600 mx-auto mb-3' />
        <h2 className='text-xl font-bold mb-1'>Administrator Access Required</h2>
        <p className='text-xs text-gray-600 mb-4'>
          Coupon creation and promotional discount rules are strictly restricted to system administrators.
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

  const items = couponsData?.items || [];
  const pagination = couponsData?.pagination;
  const courseOptions = coursesData?.items || [];

  return (
    <div className='space-y-6'>
      {/* Top Banner */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
            Coupon & Promotion Management
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            Create and govern promotional coupons, manage discount scopes, and monitor redemption limits.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className='inline-flex items-center space-x-2 px-4 py-2.5 bg-primary text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs'
        >
          <Plus className='w-4 h-4' />
          <span>Create Coupon</span>
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
            Dismiss
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
            Dismiss
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
              placeholder='Search by coupon code...'
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
              All
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
              Active
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
              Inactive
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
            <option value=''>All Course Scopes</option>
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
            <p className='text-sm text-gray-500'>Loading coupon catalog...</p>
          </div>
        ) : isCouponsError ? (
          <div className='p-12 text-center max-w-md mx-auto'>
            <AlertCircle className='w-10 h-10 text-red-500 mx-auto mb-3' />
            <h3 className='text-base font-semibold text-gray-900 mb-1'>Failed to load coupons</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {(couponsError as any)?.response?.data?.message || 'Network error fetching coupons.'}
            </p>
            <button
              onClick={() => refetchCoupons()}
              className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className='p-16 text-center max-w-md mx-auto'>
            <div className='w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400'>
              <Ticket className='w-6 h-6' />
            </div>
            <h3 className='text-base font-semibold text-gray-900 mb-1'>No coupons found</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {searchTerm || activeFilter !== 'all' || courseFilter
                ? 'No promotional coupons matched your filters.'
                : 'Create your first promotional discount coupon to get started.'}
            </p>
            <button
              onClick={openCreateModal}
              className='inline-flex items-center space-x-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              <Plus className='w-3.5 h-3.5' />
              <span>Create Coupon</span>
            </button>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm text-gray-600'>
              <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
                <tr>
                  <th scope='col' className='px-4 py-3.5'>Code</th>
                  <th scope='col' className='px-4 py-3.5'>Discount</th>
                  <th scope='col' className='px-4 py-3.5'>Scope</th>
                  <th scope='col' className='px-4 py-3.5'>Usage</th>
                  <th scope='col' className='px-4 py-3.5'>Validity</th>
                  <th scope='col' className='px-4 py-3.5 text-center'>Status</th>
                  <th scope='col' className='px-4 py-3.5 text-right'>Actions</th>
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
                            ? `${c.discountValue}% OFF`
                            : `${formatBDT(c.discountValue)} OFF`}
                        </span>
                        {c.minOrderAmountCents > 0 && (
                          <div className='text-[11px] text-gray-500'>
                            Min: {formatBDT(c.minOrderAmountCents)}
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
                            <span>Global (All Courses)</span>
                          </div>
                        )}
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap text-xs'>
                        <span className='font-bold text-gray-900'>{c.redemptionCount}</span>
                        <span className='text-gray-500'>
                          {' '}
                          / {c.usageLimit !== null ? c.usageLimit : '∞'} used
                        </span>
                        <div className='text-[10px] text-gray-400'>
                          Per user: {c.perUserLimit}
                        </div>
                      </td>

                      <td className='px-4 py-3.5 whitespace-nowrap text-xs text-gray-500'>
                        <div>From: {new Date(c.startsAt).toLocaleDateString()}</div>
                        <div>
                          To: {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'No expiry'}
                        </div>
                      </td>

                      <td className='px-4 py-3.5 text-center whitespace-nowrap'>
                        {isExpired ? (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200'>
                            Expired
                          </span>
                        ) : isNotStarted ? (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200'>
                            Upcoming
                          </span>
                        ) : c.isActive ? (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                            Active
                          </span>
                        ) : (
                          <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200'>
                            Disabled
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
                            title={c.isActive ? 'Disable Coupon' : 'Enable Coupon'}
                          >
                            <Power className='w-4 h-4' />
                          </button>

                          {/* Edit Coupon */}
                          <button
                            onClick={() => openEditModal(c)}
                            className='p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition'
                            title='Edit Coupon Settings'
                          >
                            <Edit2 className='w-4 h-4' />
                          </button>

                          {/* Soft Delete */}
                          <button
                            onClick={() => {
                              if (confirm(`Disable and archive coupon "${c.code}"?`)) {
                                disableMutation.mutate(c.id);
                              }
                            }}
                            className='p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition'
                            title='Disable Coupon'
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
              Showing page <span className='font-bold text-gray-900'>{pagination.page}</span> of{' '}
              <span className='font-bold text-gray-900'>{pagination.totalPages}</span> ({pagination.total} coupons)
            </div>

            <div className='flex items-center space-x-2'>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPreviousPage}
                className='px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 transition'
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasNextPage}
                className='px-3 py-1.5 rounded-lg border border-gray-200 font-semibold hover:bg-gray-50 disabled:opacity-40 transition'
              >
                Next
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
              <h3 className='text-lg font-bold text-gray-900'>Create Promotion Coupon</h3>
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
                  Coupon Code <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder='e.g. FLASH50'
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>

              {/* Discount Type & Value */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    Discount Type
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white'
                  >
                    <option value='PERCENTAGE'>Percentage (%)</option>
                    <option value='FIXED_AMOUNT'>Fixed BDT Amount</option>
                  </select>
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    {discountType === 'PERCENTAGE' ? 'Discount Percentage (%)' : 'Amount in BDT'}{' '}
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
                  Course Scope (Leave empty for Global)
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary bg-white'
                >
                  <option value=''>Global (Applicable to any course)</option>
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
                    Min Order (BDT)
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
                    Max Discount Cap (BDT)
                  </label>
                  <input
                    type='number'
                    min='0'
                    value={maxDiscountAmountBDT}
                    onChange={(e) =>
                      setMaxDiscountAmountBDT(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='Optional cap'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Limits */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    Total Usage Limit
                  </label>
                  <input
                    type='number'
                    min='1'
                    value={usageLimit}
                    onChange={(e) =>
                      setUsageLimit(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='Unlimited if blank'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    Per User Limit
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
                    Starts At <span className='text-red-500'>*</span>
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
                    Expires At
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
                  Coupon is active immediately
                </label>
              </div>

              <div className='flex items-center justify-end space-x-2 pt-3 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setIsCreateModalOpen(false)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={createMutation.isPending}
                  className='px-5 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50'
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Coupon'}
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
                  <span>Edit Coupon:</span>
                  <span className='font-mono text-primary'>{editingCoupon.code}</span>
                </h3>
                <p className='text-xs text-gray-500'>
                  Current redemptions: {editingCoupon.redemptionCount} (Usage limit cannot be lowered below this value)
                </p>
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
                    Min Order (BDT)
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
                    Max Discount Cap (BDT)
                  </label>
                  <input
                    type='number'
                    min='0'
                    value={maxDiscountAmountBDT}
                    onChange={(e) =>
                      setMaxDiscountAmountBDT(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='Optional cap'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>
              </div>

              {/* Limits */}
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    Usage Limit (Min: {editingCoupon.redemptionCount})
                  </label>
                  <input
                    type='number'
                    min={editingCoupon.redemptionCount}
                    value={usageLimit}
                    onChange={(e) =>
                      setUsageLimit(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder='Unlimited if blank'
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                  />
                </div>

                <div>
                  <label className='block text-xs font-semibold text-gray-700 mb-1'>
                    Per User Limit
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
                    Starts At
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
                    Expires At
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
                  Coupon is active
                </label>
              </div>

              <div className='flex items-center justify-end space-x-2 pt-3 border-t border-gray-100'>
                <button
                  type='button'
                  onClick={() => setEditingCoupon(null)}
                  className='px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={updateMutation.isPending}
                  className='px-5 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50'
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
