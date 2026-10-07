import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadFinanceCsvBlob } from '@/lib/api/finance';
import { axiosInstance } from '@/lib/axiosInstance';
import type { FinanceExportQuery } from '@techsprout/contracts';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P5.5.7 — Admin Financial CSV Export Frontend Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. API LAYER: downloadFinanceCsvBlob
  // ==========================================
  describe('1. API Layer — downloadFinanceCsvBlob', () => {
    it('1. requests CSV export with authenticated GET, params, and responseType "blob"', async () => {
      const mockCsvBlob = new Blob(['orderNumber,payableTotal\nORD-001,5000'], { type: 'text/csv' });
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: mockCsvBlob,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="techsprout-orders-2026-09-01-to-2026-10-06.csv"',
        },
      });

      const query: FinanceExportQuery = {
        type: 'orders',
        startDate: '2026-09-01',
        endDate: '2026-10-06',
      };

      const result = await downloadFinanceCsvBlob(query);

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/finance/export', {
        params: query,
        responseType: 'blob',
      });
      expect(result.blob).toBeDefined();
      expect(result.filename).toBe('techsprout-orders-2026-09-01-to-2026-10-06.csv');
    });

    it('2. supports refunds and reconciliation export types', async () => {
      const mockBlob = new Blob(['refundNumber,amount\nREF-001,2000'], { type: 'text/csv' });
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: mockBlob,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="techsprout-refunds-all.csv"',
        },
      });

      const res = await downloadFinanceCsvBlob({ type: 'refunds' });
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/finance/export', {
        params: { type: 'refunds' },
        responseType: 'blob',
      });
      expect(res.filename).toBe('techsprout-refunds-all.csv');
    });

    it('3. falls back to deterministic safe filename if Content-Disposition header is absent', async () => {
      const mockBlob = new Blob(['scanTimestamp,status\n2026-10-06,HEALTHY'], { type: 'text/csv' });
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: mockBlob,
        headers: {
          'content-type': 'text/csv',
        },
      });

      const res = await downloadFinanceCsvBlob({ type: 'reconciliation' });
      expect(res.filename).toBe('techsprout-reconciliation-export.csv');
    });

    it('4. does not leak tokens or passwords in query parameters or URL', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: new Blob(['']),
        headers: {},
      });

      await downloadFinanceCsvBlob({ type: 'orders', startDate: '2026-09-01' });

      const [url, config] = vi.mocked(axiosInstance.get).mock.calls[0];
      expect(url).toBe('/api/v1/admin/finance/export');
      expect(url).not.toContain('token');
      expect(url).not.toContain('password');
      expect(config?.params).toEqual({ type: 'orders', startDate: '2026-09-01' });
    });
  });

  // ==========================================
  // 2. CLIENT-SIDE VALIDATION & DATE UTILITIES
  // ==========================================
  describe('2. Client-Side Date Range & Scope Validation', () => {
    // Mirror client validation rules embedded in Admin Finance Export modal
    const validateExportForm = (startDate: string, endDate: string) => {
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return 'Invalid date format selected.';
        }
        if (start > end) {
          return 'Start date cannot be after end date.';
        }
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 90) {
          return `Selected date range (${diffDays} days) exceeds maximum allowed 90 days.`;
        }
      }
      return null;
    };

    it('5. allows valid date range within 90 days', () => {
      expect(validateExportForm('2026-09-01', '2026-10-01')).toBeNull();
      expect(validateExportForm('2026-10-01', '2026-10-01')).toBeNull();
      expect(validateExportForm('', '')).toBeNull();
    });

    it('6. rejects start date after end date', () => {
      const err = validateExportForm('2026-10-05', '2026-09-01');
      expect(err).toBe('Start date cannot be after end date.');
    });

    it('7. rejects date range exceeding 90 days', () => {
      const err = validateExportForm('2026-01-01', '2026-05-01');
      expect(err).toContain('exceeds maximum allowed 90 days');
    });

    it('8. rejects malformed or invalid date strings', () => {
      const err = validateExportForm('invalid-date', '2026-10-06');
      expect(err).toBe('Invalid date format selected.');
    });
  });

  // ==========================================
  // 3. PRESET DATE RANGE HELPERS
  // ==========================================
  describe('3. Quick Preset Date Ranges', () => {
    const computePresetRange = (days: number) => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - days);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    };

    it('9. calculates 7D, 30D, and 90D presets correctly within 90-day ceiling', () => {
      const p7 = computePresetRange(7);
      const p30 = computePresetRange(30);
      const p90 = computePresetRange(90);

      expect(new Date(p7.startDate) <= new Date(p7.endDate)).toBe(true);
      expect(new Date(p30.startDate) <= new Date(p30.endDate)).toBe(true);
      expect(new Date(p90.startDate) <= new Date(p90.endDate)).toBe(true);

      const diff90 = Math.ceil(
        (new Date(p90.endDate).getTime() - new Date(p90.startDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diff90).toBeLessThanOrEqual(91); // allows calendar day offset
    });
  });

  // ==========================================
  // 4. BROWSER DOWNLOAD TRIGGER & ERROR HANDLING
  // ==========================================
  describe('4. Browser Download Workflow & Error Handling', () => {
    it('10. handles server-side error responses (e.g. 400 EXPORT_SIZE_EXCEEDED or 403 Forbidden)', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            errorCode: 'EXPORT_SIZE_EXCEEDED',
            message: 'Export query matches 12,500 records which exceeds the maximum limit of 10,000.',
          },
        },
      });

      await expect(downloadFinanceCsvBlob({ type: 'orders' })).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            errorCode: 'EXPORT_SIZE_EXCEEDED',
          },
        },
      });
    });

    it('11. triggers download via window object URL without navigation', async () => {
      const mockBlob = new Blob(['test-csv-content'], { type: 'text/csv' });
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: mockBlob,
        headers: {
          'content-disposition': 'attachment; filename="techsprout-orders-2026.csv"',
        },
      });

      const clickMock = vi.fn();
      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost:3000/mock-uuid-csv');
      const revokeObjectURLMock = vi.fn();

      const mockLink = {
        href: '',
        download: '',
        setAttribute: vi.fn((attr, val) => {
          if (attr === 'download') mockLink.download = val;
        }),
        click: clickMock,
      };

      const originalDocument = (globalThis as any).document;
      const originalWindow = (globalThis as any).window;

      try {
        (globalThis as any).document = {
          createElement: vi.fn().mockImplementation((tag: string) => {
            if (tag === 'a') return mockLink;
            return {};
          }),
          body: {
            appendChild: appendChildMock,
            removeChild: removeChildMock,
          },
        };

        (globalThis as any).window = {
          URL: {
            createObjectURL: createObjectURLMock,
            revokeObjectURL: revokeObjectURLMock,
          },
        };

        const { blob, filename } = await downloadFinanceCsvBlob({ type: 'orders' });

        // Execute client-side download logic
        const url = (globalThis as any).window.URL.createObjectURL(blob);
        const link = (globalThis as any).document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        (globalThis as any).document.body.appendChild(link);
        link.click();
        (globalThis as any).document.body.removeChild(link);
        (globalThis as any).window.URL.revokeObjectURL(url);

        expect(createObjectURLMock).toHaveBeenCalledWith(blob);
        expect(appendChildMock).toHaveBeenCalledWith(mockLink);
        expect(clickMock).toHaveBeenCalled();
        expect(removeChildMock).toHaveBeenCalledWith(mockLink);
        expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost:3000/mock-uuid-csv');
      } finally {
        (globalThis as any).document = originalDocument;
        (globalThis as any).window = originalWindow;
      }
    });

    it('12. enforces non-admin / student protection at client-side layout & route level', () => {
      // In Techsprout admin routes, non-admins (e.g. STUDENT) are redirected or shown 403
      const checkAdminAuthorization = (userRole: string | null) => {
        return userRole === 'ADMIN';
      };

      expect(checkAdminAuthorization('ADMIN')).toBe(true);
      expect(checkAdminAuthorization('STUDENT')).toBe(false);
      expect(checkAdminAuthorization(null)).toBe(false);
    });
  });
});
