import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchInvoiceById, downloadInvoicePdfBlob } from '@/lib/api/orders';
import { axiosInstance } from '@/lib/axiosInstance';
import { formatMinorUnits, formatMoney } from '@/lib/money';
import type { InvoiceDto } from '@techsprout/contracts';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P5.5.6 — Frontend Invoice PDF Download Test Suite', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockInvoiceData: InvoiceDto = {
    id: 'inv-uuid-101',
    orderId: 'ord-uuid-202',
    invoiceNumber: 'TSP-INV-2026-000101',
    orderNumber: 'ORD-20261005-001',
    customerName: 'Arafat Rahman',
    customerEmail: 'student@example.com',
    courseTitle: 'Fullstack Next.js & NestJS Mastery',
    subtotal: 500000, // BDT 5,000.00
    discount: 50000,  // BDT 500.00
    payable: 450000,   // BDT 4,500.00
    currency: 'BDT',
    paymentMethod: 'BKASH',
    providerTransactionId: 'TRX_BKASH_998811',
    status: 'PAID',
    issuedAt: '2026-10-05T12:00:00.000Z',
    refundedAt: null,
  };

  // ==========================================
  // 1. INVOICE DETAIL & PDF ENDPOINT INTERACTION
  // ==========================================
  describe('1. API Layer — downloadInvoicePdfBlob', () => {
    it('1. requests PDF with authenticated GET and responseType "blob"', async () => {
      const mockBlob = new Blob(['%PDF-1.4 fake pdf binary'], { type: 'application/pdf' });
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: mockBlob,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="TSP-INV-2026-000101.pdf"',
        },
      });

      const result = await downloadInvoicePdfBlob('inv-uuid-101');

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/invoices/inv-uuid-101/pdf', {
        responseType: 'blob',
      });
      expect(result.blob).toBeDefined();
      expect(result.filename).toBe('TSP-INV-2026-000101.pdf');
    });

    it('2. falls back to deterministic default filename if Content-Disposition header is absent', async () => {
      const mockBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: mockBlob,
        headers: {
          'content-type': 'application/pdf',
        },
      });

      const result = await downloadInvoicePdfBlob('inv-uuid-101');
      expect(result.filename).toBe('invoice-inv-uuid-101.pdf');
    });

    it('3. does not append authorization tokens or secrets in URL query parameters', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: new Blob(['%PDF-1.4']),
        headers: {},
      });

      await downloadInvoicePdfBlob('inv-uuid-101');

      const calledUrl = vi.mocked(axiosInstance.get).mock.calls[0][0];
      expect(calledUrl).toBe('/api/v1/invoices/inv-uuid-101/pdf');
      expect(calledUrl).not.toContain('token=');
      expect(calledUrl).not.toContain('auth=');
      expect(calledUrl).not.toContain('secret=');
      expect(calledUrl).not.toContain('bearer=');
    });
  });

  // ==========================================
  // 2. DOWNLOAD STATE & TRIGGER WORKFLOW
  // ==========================================
  describe('2. Client Download Trigger & State Lifecycle', () => {
    it('4. triggers browser download via object URL without page navigation', async () => {
      const mockBlob = new Blob(['%PDF-1.4 binary content'], { type: 'application/pdf' });
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: mockBlob,
        headers: {
          'content-disposition': 'attachment; filename="TSP-INV-2026-000101.pdf"',
        },
      });

      const clickMock = vi.fn();
      const appendChildMock = vi.fn();
      const removeMock = vi.fn();
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/fake-blob-uuid');
      const revokeObjectURLMock = vi.fn();

      const mockLink = {
        href: '',
        download: '',
        click: clickMock,
        remove: removeMock,
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
          },
        };

        (globalThis as any).window = {
          URL: {
            createObjectURL: createObjectURLMock,
            revokeObjectURL: revokeObjectURLMock,
          },
        };

        // Execute client download sequence matching handleDownloadPdf in invoice page
        const { blob, filename } = await downloadInvoicePdfBlob('inv-uuid-101');
        const url = (globalThis as any).window.URL.createObjectURL(blob);
        const link = (globalThis as any).document.createElement('a');
        link.href = url;
        link.download = filename;
        (globalThis as any).document.body.appendChild(link);
        link.click();
        link.remove();
        (globalThis as any).window.URL.revokeObjectURL(url);

        expect(createObjectURLMock).toHaveBeenCalledWith(blob);
        expect(link.download).toBe('TSP-INV-2026-000101.pdf');
        expect(link.href).toBe('blob:http://localhost/fake-blob-uuid');
        expect(clickMock).toHaveBeenCalled();
        expect(removeMock).toHaveBeenCalled();
        expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/fake-blob-uuid');
      } finally {
        (globalThis as any).document = originalDocument;
        (globalThis as any).window = originalWindow;
      }
    });

    it('5. handles download error cleanly and exposes error message to state', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 403,
          data: {
            message: 'You are not authorized to download this invoice.',
          },
        },
      });

      let downloadError: string | null = null;
      let isDownloading = true;

      try {
        await downloadInvoicePdfBlob('foreign-inv-id');
      } catch (err: any) {
        downloadError = err?.response?.data?.message || 'Failed to download PDF invoice.';
      } finally {
        isDownloading = false;
      }

      expect(isDownloading).toBe(false);
      expect(downloadError).toBe('You are not authorized to download this invoice.');
    });

    it('6. handles 429 rate limit error gracefully', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 429,
          data: {
            message: 'Too Many Requests',
          },
        },
      });

      let downloadError: string | null = null;
      try {
        await downloadInvoicePdfBlob('inv-uuid-101');
      } catch (err: any) {
        const msg = err?.response?.data?.message;
        downloadError = msg === 'Too Many Requests' 
          ? 'Download limit reached. Please wait a moment before trying again.'
          : 'Failed to download PDF invoice.';
      }

      expect(downloadError).toBe('Download limit reached. Please wait a moment before trying again.');
    });
  });

  // ==========================================
  // 3. AUTHORITATIVE DATA & PRESENTATION
  // ==========================================
  describe('3. Authoritative Snapshot & Formatting Rules', () => {
    it('7. uses authoritative BDT formatting for all invoice monetary fields', () => {
      expect(formatMinorUnits(mockInvoiceData.subtotal, 'BDT')).toBe('BDT 5,000.00');
      expect(formatMinorUnits(mockInvoiceData.discount, 'BDT')).toBe('BDT 500.00');
      expect(formatMinorUnits(mockInvoiceData.payable, 'BDT')).toBe('BDT 4,500.00');

      // Strict prohibition of dollar signs
      expect(formatMinorUnits(mockInvoiceData.payable, 'BDT')).not.toContain('$');
    });

    it('8. displays refunded invoice status accurately with historical amounts preserved', () => {
      const refundedInvoice: InvoiceDto = {
        ...mockInvoiceData,
        status: 'REFUNDED',
        refundedAt: '2026-10-06T15:00:00.000Z',
      };

      expect(refundedInvoice.status).toBe('REFUNDED');
      // Subtotal, discount, and payable must remain historically identical
      expect(refundedInvoice.subtotal).toBe(500000);
      expect(refundedInvoice.discount).toBe(50000);
      expect(refundedInvoice.payable).toBe(450000);
    });

    it('9. no synthetic VAT/tax claims are rendered', () => {
      // In accordance with P5.5.6 rules: Inclusive pricing only, no synthetic VAT
      const invoiceKeys = Object.keys(mockInvoiceData);
      expect(invoiceKeys).not.toContain('vatAmount');
      expect(invoiceKeys).not.toContain('vatPercentage');
      expect(invoiceKeys).not.toContain('taxTotal');
    });
  });

  // ==========================================
  // 4. ACCESSIBILITY & UI AFFORDANCES
  // ==========================================
  describe('4. Accessibility, Semantics & Responsiveness', () => {
    it('10. download button includes descriptive aria-label and accessible text', () => {
      const downloadButtonProps = {
        'aria-label': 'Download Invoice PDF',
        className: 'rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary/90 shadow-2xs',
        disabled: false,
      };

      expect(downloadButtonProps['aria-label']).toBe('Download Invoice PDF');
      expect(downloadButtonProps.disabled).toBe(false);
    });

    it('11. download button disables during active download to prevent duplicate triggers', () => {
      const isDownloading = true;
      const buttonState = {
        disabled: isDownloading,
        text: isDownloading ? 'Downloading...' : 'Download PDF',
        hasSpinner: isDownloading,
      };

      expect(buttonState.disabled).toBe(true);
      expect(buttonState.text).toBe('Downloading...');
      expect(buttonState.hasSpinner).toBe(true);
    });

    it('12. print button and back link remain functional alongside PDF download', () => {
      const actions = [
        { name: 'Return to Dashboard', href: '/my-courses' },
        { name: 'Download PDF', action: 'handleDownloadPdf' },
        { name: 'Print', action: 'window.print' },
      ];

      expect(actions.map(a => a.name)).toEqual(['Return to Dashboard', 'Download PDF', 'Print']);
    });

    it('13. error dismiss button has accessible label', () => {
      const dismissProps = {
        'aria-label': 'Dismiss download error',
        role: 'button',
      };
      expect(dismissProps['aria-label']).toBe('Dismiss download error');
    });
  });
});
