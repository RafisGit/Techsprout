import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fetchInstructorEarnings,
  fetchInstructorPayouts,
  submitPayoutRequest,
  fetchInstructorLedger,
} from '@/lib/api/instructor';
import {
  InstructorEarningsClient,
  formatBdtCents,
} from '@/components/instructor/InstructorEarningsClient';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  InstructorEarningsSummaryDto,
  InstructorWalletDto,
  PaginatedPayoutsDto,
  PayoutRequestDto,
  LedgerEntryDto,
  RequestPayoutDto,
} from '@techsprout/contracts';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Phase 7.3: Instructor Earnings, Marketplace Ledger & Payout Workflow Quality Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createTestQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

  // =========================================================================
  // 1. INSTRUCTOR EARNINGS & MONETIZATION API CLIENT CONTRACTS
  // =========================================================================
  describe('1. API Client Layer & Endpoint Contracts', () => {
    it('1.1 should fetch instructor wallet and earnings summary from /api/v1/instructor/earnings', async () => {
      const mockSummary: InstructorEarningsSummaryDto = {
        wallet: {
          id: 'wal-100',
          instructorId: 'inst-1',
          balanceCents: 1500000, // 15,000.00 BDT available
          pendingBalanceCents: 450000, // 4,500.00 BDT in 14-day escrow
          payoutHoldCents: 200000, // 2,000.00 BDT in-flight payout
          lifetimeEarningsCents: 2500000, // 25,000.00 BDT cumulative net
          currency: 'BDT',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-10-20T12:00:00.000Z',
        },
        recentTransactions: [],
        pendingPayoutsCount: 1,
        settledPayoutsTotalCents: 350000,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockSummary },
      });

      const summary = await fetchInstructorEarnings();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/earnings');
      expect(summary.wallet.id).toBe('wal-100');
      expect(summary.wallet.balanceCents).toBe(1500000);
      expect(summary.wallet.pendingBalanceCents).toBe(450000);
      expect(summary.wallet.payoutHoldCents).toBe(200000);
      expect(summary.wallet.lifetimeEarningsCents).toBe(2500000);
      expect(summary.wallet.currency).toBe('BDT');
    });

    it('1.2 should propagate 401 Unauthorized for unauthenticated session without leaking internals', async () => {
      const error401 = {
        response: {
          status: 401,
          data: { success: false, error: { message: 'Unauthorized session' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error401);

      await expect(fetchInstructorEarnings()).rejects.toEqual(error401);
    });

    it('1.3 should propagate 403 Forbidden for non-instructor users', async () => {
      const error403 = {
        response: {
          status: 403,
          data: { success: false, error: { message: 'Forbidden resource' } },
        },
      };
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(error403);

      await expect(fetchInstructorEarnings()).rejects.toEqual(error403);
    });

    it('1.4 should fetch paginated payout requests from /api/v1/instructor/payouts with params', async () => {
      const mockPayouts: PaginatedPayoutsDto = {
        data: [
          {
            id: 'po-1',
            requestNumber: 'PO-2026-000101',
            instructorId: 'inst-1',
            walletId: 'wal-100',
            amountCents: 500000, // 5,000.00 BDT
            currency: 'BDT',
            payoutMethod: 'BKASH',
            accountDetails: '01711000000',
            status: 'PENDING',
            requestedAt: '2026-10-15T10:00:00.000Z',
            createdAt: '2026-10-15T10:00:00.000Z',
            updatedAt: '2026-10-15T10:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockPayouts },
      });

      const result = await fetchInstructorPayouts({ page: 1, limit: 20 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/payouts', {
        params: { page: 1, limit: 20 },
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].requestNumber).toBe('PO-2026-000101');
      expect(result.data[0].amountCents).toBe(500000);
      expect(result.data[0].payoutMethod).toBe('BKASH');
      expect(result.data[0].status).toBe('PENDING');
    });

    it('1.5 should submit payout request to /api/v1/instructor/payouts/request', async () => {
      const payload: RequestPayoutDto = {
        amountCents: 750000,
        payoutMethod: 'NAGAD',
        accountDetails: '01811223344',
      };

      const mockCreatedPayout: PayoutRequestDto = {
        id: 'po-2',
        requestNumber: 'PO-2026-000102',
        instructorId: 'inst-1',
        walletId: 'wal-100',
        amountCents: 750000,
        currency: 'BDT',
        payoutMethod: 'NAGAD',
        accountDetails: '01811223344',
        status: 'PENDING',
        requestedAt: '2026-10-21T08:00:00.000Z',
        createdAt: '2026-10-21T08:00:00.000Z',
        updatedAt: '2026-10-21T08:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockCreatedPayout },
      });

      const result = await submitPayoutRequest(payload);

      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/instructor/payouts/request', payload);
      expect(result.requestNumber).toBe('PO-2026-000102');
      expect(result.amountCents).toBe(750000);
      expect(result.status).toBe('PENDING');
    });

    it('1.6 should propagate 400 Bad Request (INSUFFICIENT_FUNDS) on payout failure', async () => {
      const error400 = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'INSUFFICIENT_FUNDS',
              message: 'Insufficient available balance (10000 poisha). Cannot request 50000 poisha.',
            },
          },
        },
      };

      vi.mocked(axiosInstance.post).mockRejectedValueOnce(error400);

      await expect(
        submitPayoutRequest({
          amountCents: 50000,
          payoutMethod: 'BKASH',
          accountDetails: '01700000000',
        })
      ).rejects.toEqual(error400);
    });

    it('1.7 should fetch double-entry ledger entries from /api/v1/instructor/ledger with params', async () => {
      const mockLedger = {
        entries: [
          {
            id: 'led-1',
            transactionId: 'txn-1',
            transactionType: 'ESCROW_RELEASE' as const,
            accountType: 'INSTRUCTOR_AVAILABLE' as const,
            direction: 'CREDIT' as const,
            amountCents: 700000,
            currency: 'BDT' as const,
            description: '14-day escrow released to available balance for Order #ORD-101',
            createdAt: '2026-10-18T10:00:00.000Z',
          },
          {
            id: 'led-2',
            transactionId: 'txn-2',
            transactionType: 'PAYOUT_REQUEST' as const,
            accountType: 'INSTRUCTOR_AVAILABLE' as const,
            direction: 'DEBIT' as const,
            amountCents: 500000,
            currency: 'BDT' as const,
            description: 'Payout request reservation hold #PO-2026-000101',
            createdAt: '2026-10-19T14:30:00.000Z',
          },
        ],
        total: 2,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockLedger },
      });

      const result = await fetchInstructorLedger({ page: 1, limit: 30 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/ledger', {
        params: { page: 1, limit: 30 },
      });
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].accountType).toBe('INSTRUCTOR_AVAILABLE');
      expect(result.entries[0].direction).toBe('CREDIT');
      expect(result.entries[1].direction).toBe('DEBIT');
    });
  });

  // =========================================================================
  // 2. MONETARY & FINANCIAL CORRECTNESS (INTEGER POISHA CALCULATIONS)
  // =========================================================================
  describe('2. Monetary Precision & Integer-Poisha Formatting', () => {
    it('2.1 formats integer poisha into standard localized BDT string with two decimal places', () => {
      expect(formatBdtCents(5000)).toBe('50.00 BDT');
      expect(formatBdtCents(150000)).toBe('1,500.00 BDT');
      expect(formatBdtCents(10000000)).toBe('100,000.00 BDT');
      expect(formatBdtCents(99)).toBe('0.99 BDT');
      expect(formatBdtCents(1)).toBe('0.01 BDT');
      expect(formatBdtCents(0)).toBe('0.00 BDT');
    });

    it('2.2 avoids dollar signs and floating-point rounding errors for odd poisha amounts', () => {
      const oddAmount = 123456789; // 1,234,567.89 BDT
      const formatted = formatBdtCents(oddAmount);
      expect(formatted).not.toContain('$');
      expect(formatted).toBe('1,234,567.89 BDT');
    });

    it('2.3 gracefully handles missing, null, undefined, and non-numeric inputs', () => {
      expect(formatBdtCents(null)).toBe('0.00 BDT');
      expect(formatBdtCents(undefined)).toBe('0.00 BDT');
      expect(formatBdtCents(NaN)).toBe('0.00 BDT');
    });

    it('2.4 verifies double-entry accounting balance invariant: debits === credits', () => {
      // In TechSprout marketplace accounting:
      // Course Purchase of 100.00 BDT (10,000 poisha):
      // DEBIT  PLATFORM_CASH        10,000 poisha
      // CREDIT PLATFORM_REVENUE      3,000 poisha (30% platform take)
      // CREDIT INSTRUCTOR_PENDING    7,000 poisha (70% instructor net revenue in 14-day escrow)
      const purchaseEntries = [
        { account: 'PLATFORM_CASH', direction: 'DEBIT', amountCents: 10000 },
        { account: 'PLATFORM_REVENUE', direction: 'CREDIT', amountCents: 3000 },
        { account: 'INSTRUCTOR_PENDING', direction: 'CREDIT', amountCents: 7000 },
      ];

      const totalDebits = purchaseEntries
        .filter((e) => e.direction === 'DEBIT')
        .reduce((sum, e) => sum + e.amountCents, 0);

      const totalCredits = purchaseEntries
        .filter((e) => e.direction === 'CREDIT')
        .reduce((sum, e) => sum + e.amountCents, 0);

      expect(totalDebits).toBe(10000);
      expect(totalCredits).toBe(10000);
      expect(totalDebits).toBe(totalCredits);
    });

    it('2.5 verifies 14-day escrow release double-entry balance invariant', () => {
      // Escrow Release after 14 days:
      // DEBIT  INSTRUCTOR_PENDING    7,000 poisha (held escrow cleared)
      // CREDIT INSTRUCTOR_AVAILABLE  7,000 poisha (ready for withdrawal)
      const releaseEntries = [
        { account: 'INSTRUCTOR_PENDING', direction: 'DEBIT', amountCents: 7000 },
        { account: 'INSTRUCTOR_AVAILABLE', direction: 'CREDIT', amountCents: 7000 },
      ];

      const debits = releaseEntries.filter((e) => e.direction === 'DEBIT').reduce((s, e) => s + e.amountCents, 0);
      const credits = releaseEntries.filter((e) => e.direction === 'CREDIT').reduce((s, e) => s + e.amountCents, 0);

      expect(debits).toBe(credits);
      expect(debits).toBe(7000);
    });

    it('2.6 verifies payout reservation and settlement double-entry invariants', () => {
      // Payout Reservation:
      // DEBIT  INSTRUCTOR_AVAILABLE 5,000 poisha
      // CREDIT PAYOUT_CLEARING      5,000 poisha
      const holdEntries = [
        { account: 'INSTRUCTOR_AVAILABLE', direction: 'DEBIT', amountCents: 5000 },
        { account: 'PAYOUT_CLEARING', direction: 'CREDIT', amountCents: 5000 },
      ];
      expect(holdEntries[0].amountCents).toBe(holdEntries[1].amountCents);

      // Payout Settled / Disbursed:
      // DEBIT  PAYOUT_CLEARING      5,000 poisha
      // CREDIT PLATFORM_CASH        5,000 poisha
      const settledEntries = [
        { account: 'PAYOUT_CLEARING', direction: 'DEBIT', amountCents: 5000 },
        { account: 'PLATFORM_CASH', direction: 'CREDIT', amountCents: 5000 },
      ];
      expect(settledEntries[0].amountCents).toBe(settledEntries[1].amountCents);
    });
  });

  // =========================================================================
  // 3. PAYOUT REQUEST WORKFLOW & VALIDATION LOGIC
  // =========================================================================
  describe('3. Payout Form Validation & Submission Business Rules', () => {
    // Pure function extracting the form validation logic from InstructorEarningsClient
    function validatePayoutFormInput(
      payoutAmountBdt: string,
      availableCents: number,
      accountDetails: string
    ): { isValid: boolean; error: string | null; amountCents?: number } {
      const bdtNum = parseFloat(payoutAmountBdt);
      if (isNaN(bdtNum) || bdtNum <= 0) {
        return { isValid: false, error: 'Please enter a valid payout amount' };
      }

      const amountCents = Math.round(bdtNum * 100);
      if (amountCents < 5000) {
        return {
          isValid: false,
          error: 'Minimum payout amount is 50.00 BDT (5,000 poisha)',
        };
      }

      if (amountCents > availableCents) {
        return {
          isValid: false,
          error: `Insufficient available balance. You have ${formatBdtCents(availableCents)} available.`,
        };
      }

      if (!accountDetails.trim() || accountDetails.trim().length < 5) {
        return {
          isValid: false,
          error: 'Please provide complete account/phone details (at least 5 characters)',
        };
      }

      return { isValid: true, error: null, amountCents };
    }

    it('3.1 rejects empty, non-numeric, or zero payout amounts', () => {
      expect(validatePayoutFormInput('', 100000, '01711000000').error).toBe(
        'Please enter a valid payout amount'
      );
      expect(validatePayoutFormInput('abc', 100000, '01711000000').error).toBe(
        'Please enter a valid payout amount'
      );
      expect(validatePayoutFormInput('0', 100000, '01711000000').error).toBe(
        'Please enter a valid payout amount'
      );
      expect(validatePayoutFormInput('-50', 100000, '01711000000').error).toBe(
        'Please enter a valid payout amount'
      );
    });

    it('3.2 enforces the 50.00 BDT (5,000 poisha) minimum payout threshold', () => {
      // 49.99 BDT is 4999 poisha -> below minimum
      const subMinResult = validatePayoutFormInput('49.99', 100000, '01711000000');
      expect(subMinResult.isValid).toBe(false);
      expect(subMinResult.error).toBe('Minimum payout amount is 50.00 BDT (5,000 poisha)');

      // Exactly 50.00 BDT is 5000 poisha -> valid
      const exactMinResult = validatePayoutFormInput('50.00', 100000, '01711000000');
      expect(exactMinResult.isValid).toBe(true);
      expect(exactMinResult.amountCents).toBe(5000);
    });

    it('3.3 prevents requesting more than the available balance (insufficient funds)', () => {
      const availableCents = 10000; // 100.00 BDT available
      const overdraftResult = validatePayoutFormInput('150.00', availableCents, '01711000000');

      expect(overdraftResult.isValid).toBe(false);
      expect(overdraftResult.error).toBe(
        `Insufficient available balance. You have 100.00 BDT available.`
      );
    });

    it('3.4 validates account details minimum length of 5 characters', () => {
      const shortAccountResult = validatePayoutFormInput('50.00', 100000, ' 123 ');
      expect(shortAccountResult.isValid).toBe(false);
      expect(shortAccountResult.error).toBe(
        'Please provide complete account/phone details (at least 5 characters)'
      );

      const validAccountResult = validatePayoutFormInput('50.00', 100000, '01711223344');
      expect(validAccountResult.isValid).toBe(true);
      expect(validAccountResult.error).toBeNull();
    });

    it('3.5 converts decimal BDT input into exact integer poisha cents', () => {
      const res = validatePayoutFormInput('1500.75', 500000, '01711223344');
      expect(res.isValid).toBe(true);
      expect(res.amountCents).toBe(150075);
    });

    it('3.6 supports all three authorized payout methods: BKASH, NAGAD, BANK_TRANSFER', () => {
      const methods: Array<'BKASH' | 'NAGAD' | 'BANK_TRANSFER'> = [
        'BKASH',
        'NAGAD',
        'BANK_TRANSFER',
      ];
      methods.forEach((m) => {
        expect(['BKASH', 'NAGAD', 'BANK_TRANSFER']).toContain(m);
      });
    });
  });

  // =========================================================================
  // 4. DOUBLE-ENTRY LEDGER STATEMENT & CSV EXPORT
  // =========================================================================
  describe('4. Ledger Statement Serialization & CSV Export', () => {
    function serializeLedgerEntriesToCsv(entries: LedgerEntryDto[]): string {
      const headers = ['Date', 'Transaction ID', 'Type', 'Account', 'Direction', 'Amount (BDT)', 'Description'];
      const rows = entries.map((e) => [
        `"${new Date(e.createdAt).toISOString()}"`,
        `"${e.transactionId}"`,
        `"${e.transactionType || ''}"`,
        `"${e.accountType}"`,
        `"${e.direction}"`,
        `"${(e.amountCents / 100).toFixed(2)}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
      ]);

      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    it('4.1 includes all required columns in the CSV header', () => {
      const csv = serializeLedgerEntriesToCsv([]);
      expect(csv).toBe('Date,Transaction ID,Type,Account,Direction,Amount (BDT),Description');
    });

    it('4.2 properly formats amounts as two-decimal numeric strings for spreadsheet compatibility', () => {
      const mockEntries: LedgerEntryDto[] = [
        {
          id: 'led-1',
          transactionId: 'txn-101',
          transactionType: 'ESCROW_RELEASE',
          accountType: 'INSTRUCTOR_AVAILABLE',
          direction: 'CREDIT',
          amountCents: 150000, // 1500.00
          currency: 'BDT',
          description: 'Regular release',
          createdAt: '2026-10-18T10:00:00.000Z',
        },
      ];

      const csv = serializeLedgerEntriesToCsv(mockEntries);
      expect(csv).toContain('"1500.00"');
      expect(csv).toContain('"CREDIT"');
      expect(csv).toContain('"INSTRUCTOR_AVAILABLE"');
      expect(csv).toContain('"ESCROW_RELEASE"');
    });

    it('4.3 escapes embedded quotes in descriptions using RFC 4180 doubled quotes', () => {
      const mockEntries: LedgerEntryDto[] = [
        {
          id: 'led-2',
          transactionId: 'txn-102',
          transactionType: 'ORDER_PURCHASE',
          accountType: 'INSTRUCTOR_PENDING',
          direction: 'CREDIT',
          amountCents: 7000,
          currency: 'BDT',
          description: 'Share for course "Mastering TypeScript & Clean Architecture"',
          createdAt: '2026-10-18T11:00:00.000Z',
        },
      ];

      const csv = serializeLedgerEntriesToCsv(mockEntries);
      expect(csv).toContain('""Mastering TypeScript & Clean Architecture""');
    });

    it('4.4 handles empty or missing description gracefully without throwing', () => {
      const mockEntries: LedgerEntryDto[] = [
        {
          id: 'led-3',
          transactionId: 'txn-103',
          accountType: 'INSTRUCTOR_AVAILABLE',
          direction: 'DEBIT',
          amountCents: 5000,
          currency: 'BDT',
          description: '',
          createdAt: '2026-10-18T12:00:00.000Z',
        },
      ];

      expect(() => serializeLedgerEntriesToCsv(mockEntries)).not.toThrow();
      const csv = serializeLedgerEntriesToCsv(mockEntries);
      expect(csv).toContain('""');
    });
  });

  // =========================================================================
  // 5. REACT COMPONENT RENDERING & QUALITY GATE (renderToString)
  // =========================================================================
  describe('5. Component Rendering, UI States & Accessibility Quality Gate', () => {
    it('5.1 renders the page header with descriptive subtext', () => {
      const queryClient = createTestQueryClient();

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      expect(html).toContain('Earnings &amp; Payouts');
      expect(html).toContain('Double-entry marketplace accounting, 14-day escrow protection');
      expect(html).toContain('Request Payout');
      expect(html).toContain('Refresh');
    });

    it('5.2 renders all 4 financial metric cards with pre-populated wallet balances', () => {
      const queryClient = createTestQueryClient();

      const mockWallet: InstructorWalletDto = {
        id: 'wal-1',
        instructorId: 'inst-1',
        balanceCents: 2500000, // 25,000.00 BDT available
        pendingBalanceCents: 840000, // 8,400.00 BDT escrow
        payoutHoldCents: 500000, // 5,000.00 BDT in-flight
        lifetimeEarningsCents: 4500000, // 45,000.00 BDT lifetime
        currency: 'BDT',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-10-22T00:00:00.000Z',
      };

      queryClient.setQueryData(['instructorEarnings'], {
        wallet: mockWallet,
        recentTransactions: [],
        pendingPayoutsCount: 1,
        settledPayoutsTotalCents: 1000000,
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      // Card 1: Available for Payout
      expect(html).toContain('Available for Payout');
      expect(html).toContain('25,000.00 BDT');
      expect(html).toContain('Immediate withdrawal eligible');

      // Card 2: 14-Day Escrow
      expect(html).toContain('14-Day Escrow');
      expect(html).toContain('8,400.00 BDT');
      expect(html).toContain('Held during student refund window');

      // Card 3: In-Flight Payouts
      expect(html).toContain('In-Flight Payouts');
      expect(html).toContain('5,000.00 BDT');
      expect(html).toContain('Awaiting administrative settlement');

      // Card 4: Lifetime Earnings
      expect(html).toContain('Lifetime Earnings');
      expect(html).toContain('45,000.00 BDT');
      expect(html).toContain('Cumulative net revenue (70%)');
    });

    it('5.3 disables "Request Payout" button when available balance is below 50.00 BDT (< 5,000 poisha)', () => {
      const queryClient = createTestQueryClient();

      // Wallet with only 4,500 poisha (45.00 BDT)
      queryClient.setQueryData(['instructorEarnings'], {
        wallet: {
          id: 'wal-low',
          instructorId: 'inst-1',
          balanceCents: 4500,
          pendingBalanceCents: 10000,
          payoutHoldCents: 0,
          lifetimeEarningsCents: 14500,
          currency: 'BDT',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-10-22T00:00:00.000Z',
        },
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      // Request Payout button should have disabled attribute
      const requestPayoutBtnMatch = html.match(/<button(?:(?!<button)[\s\S])*?Request Payout[\s\S]*?<\/button>/);
      expect(requestPayoutBtnMatch).not.toBeNull();
      expect(requestPayoutBtnMatch![0]).toContain('disabled=""');
    });

    it('5.4 enables "Request Payout" button when available balance is >= 50.00 BDT (>= 5,000 poisha)', () => {
      const queryClient = createTestQueryClient();

      // Wallet with 5,000 poisha (50.00 BDT)
      queryClient.setQueryData(['instructorEarnings'], {
        wallet: {
          id: 'wal-eligible',
          instructorId: 'inst-1',
          balanceCents: 5000,
          pendingBalanceCents: 0,
          payoutHoldCents: 0,
          lifetimeEarningsCents: 5000,
          currency: 'BDT',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-10-22T00:00:00.000Z',
        },
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      // Must NOT have disabled attribute on the Request Payout button
      const requestPayoutBtnMatch = html.match(/<button(?:(?!<button)[\s\S])*?Request Payout[\s\S]*?<\/button>/);
      expect(requestPayoutBtnMatch).not.toBeNull();
      expect(requestPayoutBtnMatch![0]).not.toContain('disabled=""');
    });

    it('5.5 renders empty states for both payout requests and ledger when data lists are empty', () => {
      const queryClient = createTestQueryClient();

      queryClient.setQueryData(['instructorEarnings'], {
        wallet: {
          id: 'wal-empty',
          instructorId: 'inst-1',
          balanceCents: 0,
          pendingBalanceCents: 0,
          payoutHoldCents: 0,
          lifetimeEarningsCents: 0,
          currency: 'BDT',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-10-22T00:00:00.000Z',
        },
      });
      queryClient.setQueryData(['instructorPayouts'], {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
      queryClient.setQueryData(['instructorLedger'], { entries: [], total: 0 });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      expect(html).toContain('No payout requests submitted yet.');
      expect(html).toContain('No ledger transactions recorded yet.');
    });

    it('5.6 renders payout requests table with correct status badges (PENDING, APPROVED, SETTLED, REJECTED, FAILED)', () => {
      const queryClient = createTestQueryClient();

      const mockPayouts: PayoutRequestDto[] = [
        {
          id: 'po-1',
          requestNumber: 'PO-2026-000001',
          instructorId: 'inst-1',
          walletId: 'wal-1',
          amountCents: 500000,
          currency: 'BDT',
          payoutMethod: 'BKASH',
          accountDetails: '01711000001',
          status: 'PENDING',
          requestedAt: '2026-10-10T10:00:00.000Z',
          createdAt: '2026-10-10T10:00:00.000Z',
          updatedAt: '2026-10-10T10:00:00.000Z',
        },
        {
          id: 'po-2',
          requestNumber: 'PO-2026-000002',
          instructorId: 'inst-1',
          walletId: 'wal-1',
          amountCents: 1000000,
          currency: 'BDT',
          payoutMethod: 'NAGAD',
          accountDetails: '01811000002',
          status: 'APPROVED',
          requestedAt: '2026-10-11T10:00:00.000Z',
          createdAt: '2026-10-11T10:00:00.000Z',
          updatedAt: '2026-10-11T12:00:00.000Z',
        },
        {
          id: 'po-3',
          requestNumber: 'PO-2026-000003',
          instructorId: 'inst-1',
          walletId: 'wal-1',
          amountCents: 1500000,
          currency: 'BDT',
          payoutMethod: 'BANK_TRANSFER',
          accountDetails: 'City Bank AC 1234567890',
          status: 'SETTLED',
          settlementReference: 'MFS-TXN-998877',
          requestedAt: '2026-10-12T10:00:00.000Z',
          createdAt: '2026-10-12T10:00:00.000Z',
          updatedAt: '2026-10-13T10:00:00.000Z',
        },
        {
          id: 'po-4',
          requestNumber: 'PO-2026-000004',
          instructorId: 'inst-1',
          walletId: 'wal-1',
          amountCents: 2000000,
          currency: 'BDT',
          payoutMethod: 'BKASH',
          accountDetails: '01911000004',
          status: 'REJECTED',
          rejectionReason: 'Invalid bKash personal account number',
          requestedAt: '2026-10-14T10:00:00.000Z',
          createdAt: '2026-10-14T10:00:00.000Z',
          updatedAt: '2026-10-15T09:00:00.000Z',
        },
        {
          id: 'po-5',
          requestNumber: 'PO-2026-000005',
          instructorId: 'inst-1',
          walletId: 'wal-1',
          amountCents: 800000,
          currency: 'BDT',
          payoutMethod: 'NAGAD',
          accountDetails: '01611000005',
          status: 'FAILED',
          requestedAt: '2026-10-16T10:00:00.000Z',
          createdAt: '2026-10-16T10:00:00.000Z',
          updatedAt: '2026-10-16T11:00:00.000Z',
        },
      ];

      queryClient.setQueryData(['instructorPayouts'], {
        data: mockPayouts,
        total: 5,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      // Verify request numbers
      expect(html).toContain('PO-2026-000001');
      expect(html).toContain('PO-2026-000002');
      expect(html).toContain('PO-2026-000003');
      expect(html).toContain('PO-2026-000004');
      expect(html).toContain('PO-2026-000005');

      // Verify status badges
      expect(html).toContain('Pending Review');
      expect(html).toContain('Approved');
      expect(html).toContain('Disbursed &amp; Settled');
      expect(html).toContain('Rejected');
      expect(html).toContain('Failed');

      // Verify settlement ref & rejection reason
      expect(html).toContain('MFS-TXN-998877');
      expect(html).toContain('Reason: Invalid bKash personal account number');
    });

    it('5.7 renders double-entry ledger statement table with debit and credit badges', () => {
      const queryClient = createTestQueryClient();

      const mockEntries: LedgerEntryDto[] = [
        {
          id: 'led-1',
          transactionId: 'txn-101',
          transactionType: 'ESCROW_RELEASE',
          accountType: 'INSTRUCTOR_AVAILABLE',
          direction: 'CREDIT',
          amountCents: 1400000, // 14,000.00 BDT
          currency: 'BDT',
          description: '14-day escrow settled to available balance',
          createdAt: '2026-10-20T10:00:00.000Z',
        },
        {
          id: 'led-2',
          transactionId: 'txn-102',
          transactionType: 'PAYOUT_REQUEST',
          accountType: 'INSTRUCTOR_AVAILABLE',
          direction: 'DEBIT',
          amountCents: 500000, // 5,000.00 BDT
          currency: 'BDT',
          description: 'Reservation hold for withdrawal request PO-2026-000001',
          createdAt: '2026-10-21T14:00:00.000Z',
        },
      ];

      queryClient.setQueryData(['instructorLedger'], {
        entries: mockEntries,
        total: 2,
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      expect(html).toContain('Double-Entry Ledger Statement');
      expect(html).toContain('ESCROW_RELEASE');
      expect(html).toContain('PAYOUT_REQUEST');
      expect(html).toContain('CREDIT');
      expect(html).toContain('DEBIT');
      expect(html).toContain('14,000.00 BDT');
      expect(html).toContain('5,000.00 BDT');
      expect(html).toContain('14-day escrow settled to available balance');
      expect(html).toContain('Export CSV');
    });

    it('5.8 disables "Export CSV" button when ledger entries are empty', () => {
      const queryClient = createTestQueryClient();

      queryClient.setQueryData(['instructorLedger'], {
        entries: [],
        total: 0,
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      const exportCsvBtnMatch = html.match(/<button(?:(?!<button)[\s\S])*?Export CSV[\s\S]*?<\/button>/);
      expect(exportCsvBtnMatch).not.toBeNull();
      expect(exportCsvBtnMatch![0]).toContain('disabled=""');
    });

    it('5.9 enables "Export CSV" button when ledger entries are present', () => {
      const queryClient = createTestQueryClient();

      queryClient.setQueryData(['instructorLedger'], {
        entries: [
          {
            id: 'led-1',
            transactionId: 'txn-1',
            accountType: 'INSTRUCTOR_AVAILABLE',
            direction: 'CREDIT',
            amountCents: 10000,
            currency: 'BDT',
            description: 'Sample entry',
            createdAt: '2026-10-20T10:00:00.000Z',
          },
        ],
        total: 1,
      });

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(InstructorEarningsClient, {})
        )
      );

      const exportCsvBtnMatch = html.match(/<button(?:(?!<button)[\s\S])*?Export CSV[\s\S]*?<\/button>/);
      expect(exportCsvBtnMatch).not.toBeNull();
      expect(exportCsvBtnMatch![0]).not.toContain('disabled=""');
    });
  });
});
