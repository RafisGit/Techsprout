'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchInstructorEarnings,
  fetchInstructorPayouts,
  fetchInstructorLedger,
  submitPayoutRequest,
  type RequestPayoutDto,
} from '@/lib/api/instructor';
import { Button } from '@/components/ui/button';
import {
  Wallet,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Banknote,
  Smartphone,
  Building,
  RefreshCw,
} from 'lucide-react';

export function formatBdtCents(cents?: number | null): string {
  const safeCents = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  const bdt = (safeCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${bdt} BDT`;
}

export function InstructorEarningsClient() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payoutAmountBdt, setPayoutAmountBdt] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'BKASH' | 'NAGAD' | 'BANK_TRANSFER'>('BKASH');
  const [accountDetails, setAccountDetails] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const {
    data: earningsData,
    isLoading: isLoadingEarnings,
    isError: isEarningsError,
    refetch: refetchEarnings,
  } = useQuery({
    queryKey: ['instructorEarnings'],
    queryFn: fetchInstructorEarnings,
    staleTime: 30 * 1000,
  });

  const {
    data: payoutsData,
    isLoading: isLoadingPayouts,
    refetch: refetchPayouts,
  } = useQuery({
    queryKey: ['instructorPayouts'],
    queryFn: () => fetchInstructorPayouts({ page: 1, limit: 20 }),
    staleTime: 30 * 1000,
  });

  const {
    data: ledgerData,
    isLoading: isLoadingLedger,
    refetch: refetchLedger,
  } = useQuery({
    queryKey: ['instructorLedger'],
    queryFn: () => fetchInstructorLedger({ page: 1, limit: 30 }),
    staleTime: 30 * 1000,
  });

  // Payout request mutation
  const payoutMutation = useMutation({
    mutationFn: (payload: RequestPayoutDto) => submitPayoutRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructorEarnings'] });
      queryClient.invalidateQueries({ queryKey: ['instructorPayouts'] });
      queryClient.invalidateQueries({ queryKey: ['instructorLedger'] });
      setIsModalOpen(false);
      setPayoutAmountBdt('');
      setAccountDetails('');
      setFormError(null);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message || err?.message || 'Failed to submit payout request';
      setFormError(msg);
    },
  });

  const wallet = earningsData?.wallet;
  const availableCents = wallet?.balanceCents || 0;
  const pendingCents = wallet?.pendingBalanceCents || 0;
  const inFlightCents = wallet?.payoutHoldCents || 0;
  const lifetimeCents = wallet?.lifetimeEarningsCents || 0;

  const handleRequestPayout = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const bdtNum = parseFloat(payoutAmountBdt);
    if (isNaN(bdtNum) || bdtNum <= 0) {
      setFormError('Please enter a valid payout amount');
      return;
    }

    const amountCents = Math.round(bdtNum * 100);
    if (amountCents < 5000) {
      setFormError('Minimum payout amount is 50.00 BDT (5,000 poisha)');
      return;
    }

    if (amountCents > availableCents) {
      setFormError(`Insufficient available balance. You have ${formatBdtCents(availableCents)} available.`);
      return;
    }

    if (!accountDetails.trim() || accountDetails.trim().length < 5) {
      setFormError('Please provide complete account/phone details (at least 5 characters)');
      return;
    }

    payoutMutation.mutate({
      amountCents,
      payoutMethod,
      accountDetails: accountDetails.trim(),
    });
  };

  const handleExportCsv = () => {
    if (!ledgerData?.entries || ledgerData.entries.length === 0) return;

    const headers = ['Date', 'Transaction ID', 'Type', 'Account', 'Direction', 'Amount (BDT)', 'Description'];
    const rows = ledgerData.entries.map((e) => [
      `"${new Date(e.createdAt).toISOString()}"`,
      `"${e.transactionId}"`,
      `"${e.transactionType || ''}"`,
      `"${e.accountType}"`,
      `"${e.direction}"`,
      `"${(e.amountCents / 100).toFixed(2)}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `instructor-ledger-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className='space-y-8'>
      {/* Page Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-gray-900'>Earnings & Payouts</h1>
          <p className='text-sm text-gray-500 mt-1'>
            Double-entry marketplace accounting, 14-day escrow protection, and withdrawal management.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              refetchEarnings();
              refetchPayouts();
              refetchLedger();
            }}
            className='flex items-center gap-2'
          >
            <RefreshCw className='w-4 h-4' />
            <span>Refresh</span>
          </Button>
          <Button
            onClick={() => setIsModalOpen(true)}
            disabled={availableCents < 5000}
            className='bg-primary text-white hover:bg-primary/90 flex items-center gap-2'
          >
            <ArrowUpRight className='w-4 h-4' />
            <span>Request Payout</span>
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5'>
        {/* Available Balance */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between text-gray-500 mb-2'>
            <span className='text-sm font-medium'>Available for Payout</span>
            <div className='p-2 bg-emerald-50 text-emerald-600 rounded-lg'>
              <Wallet className='w-5 h-5' />
            </div>
          </div>
          <div>
            <div className='text-2xl font-extrabold text-gray-900'>
              {isLoadingEarnings ? '...' : formatBdtCents(availableCents)}
            </div>
            <p className='text-xs text-gray-500 mt-1'>Immediate withdrawal eligible</p>
          </div>
        </div>

        {/* 14-Day Escrow Pending */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between text-gray-500 mb-2'>
            <span className='text-sm font-medium'>14-Day Escrow</span>
            <div className='p-2 bg-amber-50 text-amber-600 rounded-lg'>
              <Clock className='w-5 h-5' />
            </div>
          </div>
          <div>
            <div className='text-2xl font-extrabold text-gray-900'>
              {isLoadingEarnings ? '...' : formatBdtCents(pendingCents)}
            </div>
            <p className='text-xs text-amber-600 mt-1'>Held during student refund window</p>
          </div>
        </div>

        {/* In-Flight Hold */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between text-gray-500 mb-2'>
            <span className='text-sm font-medium'>In-Flight Payouts</span>
            <div className='p-2 bg-blue-50 text-blue-600 rounded-lg'>
              <Banknote className='w-5 h-5' />
            </div>
          </div>
          <div>
            <div className='text-2xl font-extrabold text-gray-900'>
              {isLoadingEarnings ? '...' : formatBdtCents(inFlightCents)}
            </div>
            <p className='text-xs text-blue-600 mt-1'>Awaiting administrative settlement</p>
          </div>
        </div>

        {/* Lifetime Earnings */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between text-gray-500 mb-2'>
            <span className='text-sm font-medium'>Lifetime Earnings</span>
            <div className='p-2 bg-purple-50 text-purple-600 rounded-lg'>
              <TrendingUp className='w-5 h-5' />
            </div>
          </div>
          <div>
            <div className='text-2xl font-extrabold text-gray-900'>
              {isLoadingEarnings ? '...' : formatBdtCents(lifetimeCents)}
            </div>
            <p className='text-xs text-gray-500 mt-1'>Cumulative net revenue (70%)</p>
          </div>
        </div>
      </div>

      {/* Payout Requests History */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs p-6'>
        <div className='flex items-center justify-between mb-5'>
          <div>
            <h2 className='text-lg font-bold text-gray-900'>Payout Requests</h2>
            <p className='text-sm text-gray-500'>History of disbursement requests and administrative reviews.</p>
          </div>
        </div>

        {isLoadingPayouts ? (
          <div className='py-8 text-center text-gray-500 text-sm'>Loading payout requests...</div>
        ) : payoutsData?.data && payoutsData.data.length > 0 ? (
          <div className='overflow-x-auto'>
            <table className='w-full text-left border-collapse text-sm'>
              <thead>
                <tr className='border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider font-semibold'>
                  <th className='py-3 px-4'>Request #</th>
                  <th className='py-3 px-4'>Requested Date</th>
                  <th className='py-3 px-4'>Amount</th>
                  <th className='py-3 px-4'>Method</th>
                  <th className='py-3 px-4'>Destination</th>
                  <th className='py-3 px-4'>Status</th>
                  <th className='py-3 px-4'>Settlement Ref</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {payoutsData.data.map((p) => {
                  let badge = (
                    <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800'>
                      Pending Review
                    </span>
                  );
                  if (p.status === 'APPROVED') {
                    badge = (
                      <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800'>
                        Approved
                      </span>
                    );
                  } else if (p.status === 'SETTLED') {
                    badge = (
                      <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800'>
                        Disbursed & Settled
                      </span>
                    );
                  } else if (p.status === 'REJECTED') {
                    badge = (
                      <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800'>
                        Rejected
                      </span>
                    );
                  } else if (p.status === 'FAILED') {
                    badge = (
                      <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800'>
                        Failed
                      </span>
                    );
                  }

                  return (
                    <tr key={p.id} className='hover:bg-gray-50/50'>
                      <td className='py-3 px-4 font-mono font-medium text-gray-900'>{p.requestNumber}</td>
                      <td className='py-3 px-4 text-gray-600'>
                        {new Date(p.requestedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className='py-3 px-4 font-semibold text-gray-900'>
                        {formatBdtCents(p.amountCents)}
                      </td>
                      <td className='py-3 px-4 font-medium text-gray-700'>{p.payoutMethod}</td>
                      <td className='py-3 px-4 text-gray-600 max-w-xs truncate'>{p.accountDetails}</td>
                      <td className='py-3 px-4'>{badge}</td>
                      <td className='py-3 px-4 font-mono text-xs text-gray-500'>
                        {p.settlementReference || (p.rejectionReason ? `Reason: ${p.rejectionReason}` : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className='py-8 text-center text-gray-400 text-sm'>
            No payout requests submitted yet.
          </div>
        )}
      </div>

      {/* Double-Entry Ledger Transaction History */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs p-6'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5'>
          <div>
            <h2 className='text-lg font-bold text-gray-900'>Double-Entry Ledger Statement</h2>
            <p className='text-sm text-gray-500'>
              Immutable financial journal entries for all purchases, commissions, escrow settlements, and withdrawals.
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={handleExportCsv}
            disabled={!ledgerData?.entries || ledgerData.entries.length === 0}
            className='flex items-center gap-2'
          >
            <Download className='w-4 h-4' />
            <span>Export CSV</span>
          </Button>
        </div>

        {isLoadingLedger ? (
          <div className='py-8 text-center text-gray-500 text-sm'>Loading ledger statement...</div>
        ) : ledgerData?.entries && ledgerData.entries.length > 0 ? (
          <div className='overflow-x-auto'>
            <table className='w-full text-left border-collapse text-sm'>
              <thead>
                <tr className='border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider font-semibold'>
                  <th className='py-3 px-4'>Date</th>
                  <th className='py-3 px-4'>Type</th>
                  <th className='py-3 px-4'>Account</th>
                  <th className='py-3 px-4'>Direction</th>
                  <th className='py-3 px-4'>Amount</th>
                  <th className='py-3 px-4'>Description</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {ledgerData.entries.map((entry) => {
                  const isCredit = entry.direction === 'CREDIT';
                  return (
                    <tr key={entry.id} className='hover:bg-gray-50/50'>
                      <td className='py-3 px-4 text-gray-600 whitespace-nowrap'>
                        {new Date(entry.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className='py-3 px-4 font-mono text-xs text-gray-700'>
                        {entry.transactionType || 'TRANSACTION'}
                      </td>
                      <td className='py-3 px-4 font-mono text-xs text-gray-600'>{entry.accountType}</td>
                      <td className='py-3 px-4'>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            isCredit ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {entry.direction}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 font-semibold whitespace-nowrap ${
                          isCredit ? 'text-emerald-700' : 'text-gray-900'
                        }`}
                      >
                        {formatBdtCents(entry.amountCents)}
                      </td>
                      <td className='py-3 px-4 text-gray-600 max-w-md truncate'>{entry.description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className='py-8 text-center text-gray-400 text-sm'>
            No ledger transactions recorded yet.
          </div>
        )}
      </div>

      {/* Payout Request Modal Dialog */}
      {isModalOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <div className='bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl relative'>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-lg font-bold text-gray-900'>Request Payout</h3>
              <button
                type='button'
                onClick={() => {
                  setIsModalOpen(false);
                  setFormError(null);
                }}
                className='text-gray-400 hover:text-gray-600'
              >
                ✕
              </button>
            </div>

            <p className='text-sm text-gray-600 mb-4'>
              Withdraw your available earnings to your verified Mobile Financial Services (bKash/Nagad) account or bank wire.
            </p>

            {formError && (
              <div className='p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-4 flex items-center gap-2'>
                <AlertCircle className='w-4 h-4 shrink-0' />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleRequestPayout} className='space-y-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1'>
                  Available Balance
                </label>
                <div className='text-sm font-semibold text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200'>
                  {formatBdtCents(availableCents)}
                </div>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1'>
                  Payout Amount (BDT)
                </label>
                <input
                  type='number'
                  step='0.01'
                  min='50'
                  max={(availableCents / 100).toFixed(2)}
                  value={payoutAmountBdt}
                  onChange={(e) => setPayoutAmountBdt(e.target.value)}
                  placeholder='e.g. 1500.00'
                  required
                  className='w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary'
                />
                <p className='text-xs text-gray-500 mt-1'>Minimum withdrawal is 50.00 BDT</p>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1'>
                  Payout Method
                </label>
                <div className='grid grid-cols-3 gap-2'>
                  {(['BKASH', 'NAGAD', 'BANK_TRANSFER'] as const).map((m) => (
                    <button
                      key={m}
                      type='button'
                      onClick={() => setPayoutMethod(m)}
                      className={`p-2.5 text-xs font-semibold rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                        payoutMethod === m
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {m === 'BKASH' && <Smartphone className='w-4 h-4' />}
                      {m === 'NAGAD' && <Smartphone className='w-4 h-4' />}
                      {m === 'BANK_TRANSFER' && <Building className='w-4 h-4' />}
                      <span>{m === 'BANK_TRANSFER' ? 'Bank Wire' : m}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1'>
                  Account Details / Number
                </label>
                <textarea
                  rows={2}
                  value={accountDetails}
                  onChange={(e) => setAccountDetails(e.target.value)}
                  placeholder={
                    payoutMethod === 'BANK_TRANSFER'
                      ? 'Account Name, Bank Name, Account Number, Branch / Routing No.'
                      : 'Personal bKash/Nagad mobile number (e.g. 01700000000)'
                  }
                  required
                  className='w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>

              <div className='flex items-center justify-end gap-3 pt-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setIsModalOpen(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={payoutMutation.isPending}
                  className='bg-primary text-white hover:bg-primary/90'
                >
                  {payoutMutation.isPending ? 'Submitting...' : 'Confirm Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
